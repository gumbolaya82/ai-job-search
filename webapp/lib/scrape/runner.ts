"use server";

import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { revalidatePath } from "next/cache";
import { repoRoot, profilePath } from "../repoRoot";
import { readRegistry, resolveProfileId } from "../profileRegistry";
import { activateProfile } from "../profileOps";
import { timelineForProfile } from "../jobsTimeline";
import {
  CLAUDE,
  FocusError,
  SKILL_MD_PARTS,
  buildScrapeArgv,
  buildScrapePrompt,
  readAllowedTools,
  sanitiseFocus,
  type ScrapeArgs,
} from "./claudeCli";
import {
  addedKeys,
  filterRowsByKey,
  parseSeenFile,
  seenKeys,
  timelineKeysForAdded,
} from "./seenDiff";
import {
  SCRAPE_PHASE_SET,
  describeLogLines,
  finalResultCost,
  scrapeProgress,
  type PhaseProgress,
} from "./logFormat";
import {
  cancelRefusal,
  latestRun,
  logPath,
  readAllLogLines,
  readRun,
  runDir,
  runIdFromDate,
  writeRun,
  type RunRecord,
} from "./runStore";
import { spawnDetached } from "../runs/spawnRun";
import { hasFinished, isAlive } from "../runs/lifecycle";
import { clearLock } from "../runs/clearLock";
import type { CommandSpec } from "../runs/commandSpec";

/**
 * Starting, watching and cancelling a real `/scrape`.
 *
 * The webapp's other mutating module, `profileOps.ts`, is a thin bridge to
 * `profile_manager.py` and reimplements nothing. This one is different in kind:
 * there is no script to shell out to, because `/scrape` is an LLM skill. So this
 * spawns a headless Claude Code that reads the same SKILL.md a human session
 * would, under an allowlist derived from that file at runtime.
 *
 * Three behaviours were established by a hand-run spike (2026-07-28) rather than
 * assumed:
 *
 *  1. The run does NOT delete `profiles/<id>/.lock`. Its own `rm` and
 *     `Remove-Item` were both refused by Claude Code's workspace-trust sandbox.
 *     So `finalise()` clears the lock here, on every terminal path.
 *  2. Tools outside the allowlist are denied without stalling — the spike saw
 *     `PowerShell`, `python3` and shell heredocs all refused while the run still
 *     reached exit 0. Nothing here needs a prompt-answering strategy.
 *  3. A completed run writes a `result` event into its log. That event, not the
 *     pid, is the authoritative "this finished" signal (see `hasFinished`).
 */

export type ScrapeStartResult = {
  ok: boolean;
  /** Shown to the user verbatim: a lock's contents, a python error, a run id. */
  message: string;
  locked: boolean;
  runId: string | null;
};

export type ScrapeStatus = {
  run: RunRecord | null;
  /** Formatted log tail, newest last. */
  lines: string[];
  /**
   * How far the run has got. Derived from the WHOLE log, not the tail the panel
   * shows — the portal-query phase scrolls out of a 120-line window long before
   * a four-minute run ends, and a progress bar that forgets is worse than none.
   */
  progress: PhaseProgress;
};

const TAIL_LINES = 120;

/** The zero value, for the paths that have no run to report on. */
const NO_STATUS: ScrapeStatus = {
  run: null,
  lines: [],
  progress: { index: -1, label: null, finished: false },
};

function seenJobsPath(profileId: string): string {
  return profilePath(profileId, "job_scraper", "seen_jobs.json");
}

function readSeenFile(profileId: string) {
  const file = seenJobsPath(profileId);
  // A missing file means every entry afterwards is new. Correct, not a bug.
  return fs.existsSync(file) ? parseSeenFile(fs.readFileSync(file, "utf8")) : {};
}

/**
 * `/scrape` re-expressed as a `CommandSpec`, so `lib/runs/` has a working
 * example to model `/rank` and `/apply` on. `finalise` is exactly the
 * seen-diff computation this module always did: which of `seen_jobs.json`'s
 * keys are new since the run started, resolved back to full timeline rows.
 */
const SCRAPE_SPEC: CommandSpec<ScrapeArgs> = {
  id: "scrape",
  storage: { subdir: "scrape-runs", logName: "scrape.log" },
  buildPrompt: buildScrapePrompt,
  allowlist: { kind: "skill", parts: SKILL_MD_PARTS },
  phases: SCRAPE_PHASE_SET,
  finalise: (run) => {
    const after = readSeenFile(run.profile);
    const added = addedKeys(run.seenKeysBefore, seenKeys(after));
    const keys = timelineKeysForAdded(run.profile, added, after);
    const newJobs = filterRowsByKey(timelineForProfile(run.profile), keys);
    return { ...run, newJobs };
  },
};

export async function startScrape(
  profileId: string,
  args: { focus?: string | null; broad?: boolean },
): Promise<ScrapeStartResult> {
  const resolved = resolveProfileId(profileId);
  if (!resolved) {
    return { ok: false, message: `No live profile named '${profileId}'.`, locked: false, runId: null };
  }

  let focus: string;
  try {
    focus = sanitiseFocus(args.focus);
  } catch (err) {
    const message = err instanceof FocusError ? err.message : String(err);
    return { ok: false, message, locked: false, runId: null };
  }

  const registry = readRegistry();
  const record = registry.profiles.find((p) => p.id === resolved);
  if (record?.lock) {
    return {
      ok: false,
      message: `'${resolved}' is locked by an in-progress command:\n${record.lock}`,
      locked: true,
      runId: null,
    };
  }

  // `/scrape` resolves its profile from `.active-profile` and takes no argument,
  // so scraping a non-active profile *is* switching to it. Deliberately not
  // switched back afterwards: silently restoring would leave the repo in a state
  // that disagrees with what the user just watched happen.
  if (registry.active !== resolved) {
    const switched = await activateProfile(resolved);
    if (!switched.ok) {
      return { ok: false, message: switched.message, locked: switched.locked, runId: null };
    }
  }

  const broad = Boolean(args.broad);
  const runId = runIdFromDate();
  const dir = runDir(resolved, runId);
  fs.mkdirSync(dir, { recursive: true });

  let argv: string[];
  try {
    argv = buildScrapeArgv({ focus, broad, allowedTools: readAllowedTools(repoRoot()) });
  } catch (err) {
    return { ok: false, message: `Could not build the run: ${String(err)}`, locked: false, runId: null };
  }

  let pid: number;
  try {
    pid = spawnDetached({
      command: CLAUDE,
      argv,
      cwd: repoRoot(),
      logFile: logPath(resolved, runId),
    });
  } catch (err) {
    return {
      ok: false,
      message: `Could not start '${CLAUDE}': ${String(err)}`,
      locked: false,
      runId: null,
    };
  }

  // Written before returning, so a dev-server restart mid-run does not lose the
  // handle on a process that is still going.
  writeRun({
    id: runId,
    profile: resolved,
    command: "scrape",
    args: { focus, broad },
    pid,
    startedAt: new Date().toISOString(),
    endedAt: null,
    state: "running",
    exitCode: null,
    seenKeysBefore: seenKeys(readSeenFile(resolved)),
    newJobs: null,
    costUsd: null,
  });

  revalidatePath("/", "layout");
  return { ok: true, message: `Started run ${runId} (pid ${pid}).`, locked: false, runId };
}

/**
 * Fill in everything that can only be known once the run has stopped.
 *
 * `exitCode` stays null by design: the process is detached and may well have
 * ended while the dev server was not running, so there is no exit status left to
 * collect. The log's `result` event carries the success/failure signal instead.
 */
function finalise(run: RunRecord, state: RunRecord["state"], lines: string[] = []): RunRecord {
  const withResult: RunRecord = {
    ...run,
    state,
    endedAt: new Date().toISOString(),
    costUsd: finalResultCost(lines),
  };
  const finished = SCRAPE_SPEC.finalise(withResult, lines);
  writeRun(finished);
  // The skill cannot delete its own lock in a headless run — see the spike note
  // at the top of this file. Clearing it here is what keeps the next run from
  // being refused.
  clearLock(run.profile);
  return finished;
}

export async function scrapeStatus(profileId: string): Promise<ScrapeStatus> {
  const resolved = resolveProfileId(profileId);
  if (!resolved) return NO_STATUS;

  let run = latestRun(resolved);
  if (!run) return NO_STATUS;

  // One read of the log serves all three consumers: the finished check, the
  // phase derivation and the tail. It was already read whole to take the tail.
  const all = readAllLogLines(resolved, run.id);

  if (run.state === "running") {
    const { finished, errored } = hasFinished(all);
    if (finished) {
      run = finalise(run, errored ? "failed" : "done", all);
    } else if (!isAlive(run.pid)) {
      // The process is gone but never wrote a result event: killed externally,
      // or crashed. Whatever it managed to add still counts as this run's jobs.
      run = finalise(run, "failed");
    }
  }

  return {
    run,
    lines: describeLogLines(all.slice(-TAIL_LINES)),
    progress: scrapeProgress(all),
  };
}

export async function cancelScrape(
  profileId: string,
  expectedRunId: string,
): Promise<ScrapeStartResult> {
  const resolved = resolveProfileId(profileId);
  if (!resolved) {
    return { ok: false, message: `No live profile named '${profileId}'.`, locked: false, runId: null };
  }
  const run = latestRun(resolved);
  const refusal = cancelRefusal(run, expectedRunId);
  if (refusal || !run) {
    return { ok: false, message: refusal ?? "No run is in progress for this profile.", locked: false, runId: null };
  }

  // Kill the process TREE, not the process. `claude` spawns `bun` children for
  // the portal CLIs, and a previous session in this repo recorded exactly this
  // hazard: killing a wrapper left an orphaned child holding a port. Windows-only
  // by intent, consistent with the repo's `python` (not `python3`) assumption.
  try {
    execFileSync("taskkill", ["/PID", String(run.pid), "/T", "/F"], { windowsHide: true });
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    const text = (e.stderr || e.stdout || e.message || "").toString().trim();
    // "not found" means it already exited between the poll and the click; the
    // run still needs to be marked cancelled and the lock still needs clearing.
    if (!/not found|no running instance/i.test(text)) {
      return { ok: false, message: `Could not stop pid ${run.pid}: ${text}`, locked: false, runId: run.id };
    }
  }

  finalise(run, "cancelled");
  revalidatePath("/", "layout");
  return { ok: true, message: `Cancelled run ${run.id}.`, locked: false, runId: run.id };
}

/** The run behind the digest download, for the `.eml` route and the panel. */
export async function getRun(profileId: string, runId: string): Promise<RunRecord | null> {
  const resolved = resolveProfileId(profileId);
  if (!resolved) return null;
  return readRun(resolved, runId);
}
