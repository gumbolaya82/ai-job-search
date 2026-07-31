"use server";

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { revalidatePath } from "next/cache";
import { repoRoot, profilePath } from "../repoRoot";
import { readRegistry, resolveProfileId } from "../profileRegistry";
import { activateProfile } from "../profileOps";
import { readAllowedToolsFrom } from "./allowedTools";
import { buildArgv, buildRankPrompt, RANK_PHASES, type CommandSpec } from "./commandSpec";
import {
  cancelRefusal,
  latestRunFor,
  logPathFor,
  readAllLogLinesFor,
  runDirFor,
  runIdFromDate,
  writeRunFor,
  type CommandId,
  type RunRecord,
  type RunState,
} from "./runStore";
import { spawnDetached } from "./spawnRun";
import { hasFinished, isAlive } from "./lifecycle";
import { clearLock } from "./clearLock";
import { runProgress, type PhaseProgress } from "./progress";
import { describeLogLines, finalResultCost } from "../scrape/logFormat";

/**
 * Starting, watching and cancelling `/rank` — and, generically, any command
 * that has registered a `CommandSpec` in `SPECS` below.
 *
 * This is `lib/scrape/runner.ts` generalised: where that module is bound to
 * `/scrape` throughout, `runStatus` and `cancelRun` here take a `CommandId`
 * and dispatch on it, so `/apply` only has to add its own spec to `SPECS` to
 * get a working status/cancel path. `startRank` stays command-specific, the
 * same way `startScrape` is — starting a run needs each command's own
 * argument handling, which there is nothing to share yet.
 *
 * The invariant this module rests on is the one the spike (2026-07-28)
 * established for `/scrape` and documented in runner.ts: a headless run
 * cannot delete its own `profiles/<id>/.lock` — Claude Code's workspace-trust
 * sandbox refuses the `rm`. So `finaliseRun` clears the lock here, on every
 * terminal path (finish, error, cancel), exactly as runner.ts's `finalise`
 * does for `/scrape`.
 */

export type RunStartResult = {
  ok: boolean;
  /** Shown to the user verbatim: a lock's contents, a python error, a run id. */
  message: string;
  locked: boolean;
  runId: string | null;
};

export type RunStatus = {
  run: RunRecord | null;
  /** Formatted log tail, newest last. */
  lines: string[];
  progress: PhaseProgress;
};

const TAIL_LINES = 120;

/** The zero value, for the paths that have no run to report on. */
const NO_STATUS: RunStatus = {
  run: null,
  lines: [],
  progress: { index: -1, label: null, finished: false },
};

// Mirrors lib/scrape/claudeCli.ts's CLAUDE constant. Not imported from there:
// lib/scrape/ sits on top of lib/runs/, not the other way round, and this is
// a one-line env-var default, not logic worth a shared module for.
const CLAUDE = process.env.AI_JOB_SEARCH_CLAUDE ?? "claude";

const RANK_STORAGE = { subdir: "rank-runs", logName: "rank.log" } as const;

const RANK_COMMAND_MD_PARTS = [".claude", "commands", "rank.md"] as const;

function rankCommandMdPath(root: string): string {
  return path.join(root, ...RANK_COMMAND_MD_PARTS);
}

function seenJobsPath(profileId: string): string {
  return profilePath(profileId, "job_scraper", "seen_jobs.json");
}

/**
 * Just the slice of `seen_jobs.json` `/rank`'s finalise needs. Every consumer
 * of this file defines its own narrow view (see lib/jobsTimeline.ts's
 * `SeenJob` and lib/scrape/seenDiff.ts's `SeenEntry`) rather than growing one
 * shared type nobody fully uses.
 */
type RankedSeenFile = { seen?: Record<string, { rank_date?: string }> };

function readRankedSeenFile(profileId: string): RankedSeenFile {
  const file = seenJobsPath(profileId);
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as RankedSeenFile;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * `/rank` re-expressed as a `CommandSpec`, mirroring `lib/scrape/runner.ts`'s
 * `SCRAPE_SPEC`. Unlike `/scrape`, `/rank` adds no jobs — it only annotates
 * existing `seen_jobs.json` entries in place — so `finalise` computes no
 * seen-diff. It counts how many entries this run touched instead: the
 * records whose `rank_date` equals the run's own start date (compared as the
 * `YYYY-MM-DD` slice of `startedAt`, both already UTC, so no local-timezone
 * round-trip can shift the day).
 */
const RANK_SPEC: CommandSpec<undefined> = {
  id: "rank",
  storage: RANK_STORAGE,
  buildPrompt: () => buildRankPrompt(),
  allowlist: { kind: "command", parts: RANK_COMMAND_MD_PARTS },
  phases: RANK_PHASES,
  finalise: (run) => {
    const after = readRankedSeenFile(run.profile);
    const day = run.startedAt.slice(0, 10);
    const rankedCount = Object.values(after.seen ?? {}).filter(
      (entry) => entry?.rank_date === day,
    ).length;
    return { ...run, rankedCount };
  },
};

/**
 * What `runStatus`/`cancelRun` need from a spec, with `buildPrompt` dropped:
 * starting a run is command-specific (see `startRank`), so nothing generic
 * ever calls it. Structurally identical for every `CommandSpec<A>` — `A` only
 * ever appears in the field this omits.
 */
type RunSpec = Omit<CommandSpec<never>, "buildPrompt">;

/** Registered commands. `/apply` joins this once it has its own spec. */
const SPECS: Partial<Record<CommandId, RunSpec>> = { rank: RANK_SPEC };

export async function startRank(profileId: string): Promise<RunStartResult> {
  const resolved = resolveProfileId(profileId);
  if (!resolved) {
    return { ok: false, message: `No live profile named '${profileId}'.`, locked: false, runId: null };
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

  // Same reasoning as /scrape (see runner.ts): /rank resolves its profile from
  // `.active-profile` and takes no argument, so ranking a non-active profile
  // is switching to it. Not switched back afterwards, for the same reason —
  // silently restoring would leave the repo disagreeing with what just ran.
  if (registry.active !== resolved) {
    const switched = await activateProfile(resolved);
    if (!switched.ok) {
      return { ok: false, message: switched.message, locked: switched.locked, runId: null };
    }
  }

  const runId = runIdFromDate();
  const dir = runDirFor(RANK_STORAGE, resolved, runId);
  fs.mkdirSync(dir, { recursive: true });

  let allowedTools: string[];
  try {
    allowedTools = readAllowedToolsFrom(rankCommandMdPath(repoRoot()));
  } catch (err) {
    return { ok: false, message: `Could not build the run: ${String(err)}`, locked: false, runId: null };
  }

  const argv = buildArgv(buildRankPrompt(), allowedTools);

  let pid: number;
  try {
    pid = spawnDetached({
      command: CLAUDE,
      argv,
      cwd: repoRoot(),
      logFile: logPathFor(RANK_STORAGE, resolved, runId),
    });
  } catch (err) {
    return {
      ok: false,
      message: `Could not start '${CLAUDE}': ${String(err)}`,
      locked: false,
      runId: null,
    };
  }

  // Written before returning, so a dev-server restart mid-run does not lose
  // the handle on a process that is still going.
  writeRunFor(RANK_STORAGE, {
    id: runId,
    profile: resolved,
    command: "rank",
    // /rank takes no arguments; RunRecord.args has one shape shared by every
    // command, so this is the empty value, not a real focus/broad pair.
    args: { focus: "", broad: false },
    pid,
    startedAt: new Date().toISOString(),
    endedAt: null,
    state: "running",
    exitCode: null,
    // Unlike /scrape, /rank never diffs seen_jobs.json's keys — it only
    // annotates entries that already exist — so there is nothing meaningful
    // to snapshot here.
    seenKeysBefore: [],
    newJobs: null,
    costUsd: null,
  });

  revalidatePath("/", "layout");
  return { ok: true, message: `Started run ${runId} (pid ${pid}).`, locked: false, runId };
}

/**
 * Fill in everything that can only be known once the run has stopped, for
 * whichever command's spec is passed in. Mirrors runner.ts's private
 * `finalise` exactly, generalised over `RunSpec` instead of being bound to
 * `SCRAPE_SPEC`.
 */
function finaliseRun(spec: RunSpec, run: RunRecord, state: RunState, lines: string[] = []): RunRecord {
  const withResult: RunRecord = {
    ...run,
    state,
    endedAt: new Date().toISOString(),
    costUsd: finalResultCost(lines),
  };
  const finished = spec.finalise(withResult, lines);
  writeRunFor(spec.storage, finished);
  // The command cannot delete its own lock in a headless run — see the spike
  // note in runner.ts. Clearing it here is what keeps the next run from being
  // refused, for every terminal path this module produces.
  clearLock(run.profile);
  return finished;
}

export async function runStatus(profileId: string, command: CommandId): Promise<RunStatus> {
  const resolved = resolveProfileId(profileId);
  if (!resolved) return NO_STATUS;

  const spec = SPECS[command];
  if (!spec) return NO_STATUS;

  let run = latestRunFor(spec.storage, resolved);
  if (!run) return NO_STATUS;

  // One read of the log serves all three consumers: the finished check, the
  // phase derivation and the tail — same reasoning as scrapeStatus.
  const all = readAllLogLinesFor(spec.storage, resolved, run.id);

  if (run.state === "running") {
    const { finished, errored } = hasFinished(all);
    if (finished) {
      run = finaliseRun(spec, run, errored ? "failed" : "done", all);
    } else if (!isAlive(run.pid)) {
      // Gone but never wrote a result event: killed externally, or crashed.
      // Whatever it managed to write still counts.
      run = finaliseRun(spec, run, "failed");
    }
  }

  return {
    run,
    lines: describeLogLines(all.slice(-TAIL_LINES)),
    progress: runProgress(all, spec.phases),
  };
}

export async function cancelRun(
  profileId: string,
  command: CommandId,
  expectedRunId: string,
): Promise<RunStartResult> {
  const resolved = resolveProfileId(profileId);
  if (!resolved) {
    return { ok: false, message: `No live profile named '${profileId}'.`, locked: false, runId: null };
  }

  const spec = SPECS[command];
  if (!spec) {
    return { ok: false, message: `'${command}' runs are not supported yet.`, locked: false, runId: null };
  }

  const run = latestRunFor(spec.storage, resolved);
  const refusal = cancelRefusal(run, expectedRunId);
  if (refusal || !run) {
    return { ok: false, message: refusal ?? "No run is in progress for this profile.", locked: false, runId: null };
  }

  // Kill the process TREE, not the process — see runner.ts's cancelScrape for
  // the orphaned-child hazard this guards against. Windows-only by intent.
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

  finaliseRun(spec, run, "cancelled");
  revalidatePath("/", "layout");
  return { ok: true, message: `Cancelled run ${run.id}.`, locked: false, runId: run.id };
}
