import fs from "node:fs";
import path from "node:path";
// Explicit `.ts` extensions: unlike the rest of lib/, this module gets exercised
// by `node --test` as well as by the bundler, and Node's resolver does not guess
// extensions. `allowImportingTsExtensions` in tsconfig.json permits it.
import { profilePath } from "../repoRoot.ts";
import type { TimelineRow } from "../jobsTimeline.ts";

/**
 * Where a scrape run's state lives, and the only module that reads or writes it.
 *
 * Layout: `profiles/<id>/reports/scrape-runs/<runId>/{run.json,scrape.log}`.
 *
 * THIS LOCATION IS LOAD-BEARING. `.gitignore` already ignores `**​/reports/`, so
 * run logs — which hold real job data and Claude's entire transcript — can never
 * be committed. Do NOT move this under `job_scraper/`: that directory is ignored
 * by three exact-name rules only (`seen_jobs.json`, `notion_sync.json`, `*.md`),
 * so a new JSON there would be committable. If this path ever moves, `.gitignore`
 * and `tools/security_guards.py` must change together — a standing repo rule.
 */

export type RunState = "running" | "done" | "failed" | "cancelled";

export type RunRecord = {
  id: string;
  profile: string;
  args: { focus: string; broad: boolean };
  pid: number;
  startedAt: string;
  endedAt: string | null;
  state: RunState;
  exitCode: number | null;
  /** Snapshot of `seen_jobs.json`'s keys taken before spawning. */
  seenKeysBefore: string[];
  /**
   * Filled in once, when the run is first observed to have exited.
   *
   * Persisted rather than recomputed so the digest stays re-downloadable after a
   * later scrape has moved the baseline.
   */
  newJobs: TimelineRow[] | null;
  /** From the log's `result` event's `total_cost_usd`. Null until the run finishes. */
  costUsd: number | null;
};

const RUNS_DIR = ["reports", "scrape-runs"];

/**
 * Why a cancel request must be refused, or null when it may proceed.
 *
 * `expectedRunId` is the run the *client* believes is live. Requiring it closes
 * a real hazard seen on 2026-07-29: a stray cancel POST killed a paying run
 * three and a half minutes in, and the server had no way to tell that click
 * apart from a deliberate one, because it only ever consulted `latestRun()`.
 * A client whose view has moved on now gets refused instead of destroying
 * whatever happens to be running.
 */
export function cancelRefusal(latest: RunRecord | null, expectedRunId: string): string | null {
  if (!latest || latest.state !== "running") return "No run is in progress for this profile.";
  if (latest.id !== expectedRunId) {
    return (
      `Run ${expectedRunId} is not the current run (${latest.id} is). ` +
      "Nothing was stopped — reload the page and try again."
    );
  }
  return null;
}

/** `2026-07-28T19-04-11Z` — ISO, with the colons a Windows path cannot hold. */
export function runIdFromDate(date: Date = new Date()): string {
  return date.toISOString().replace(/\.\d+Z$/, "Z").replace(/:/g, "-");
}

/**
 * Run ids are generated here and never taken from a URL, but the `.eml` route
 * does receive one from a query string. Validating the shape is the cheap half
 * of that route's guard; matching against `listRunIds()` is the other half.
 */
export function isValidRunId(candidate: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/.test(candidate);
}

export function runsDir(profileId: string): string {
  return profilePath(profileId, ...RUNS_DIR);
}

export function runDir(profileId: string, runId: string): string {
  if (!isValidRunId(runId)) throw new Error(`Not a run id: ${runId}`);
  return profilePath(profileId, ...RUNS_DIR, runId);
}

export function runJsonPath(profileId: string, runId: string): string {
  return path.join(runDir(profileId, runId), "run.json");
}

export function logPath(profileId: string, runId: string): string {
  return path.join(runDir(profileId, runId), "scrape.log");
}

/** Newest first. Anything not matching the id shape is ignored, not an error. */
export function listRunIds(profileId: string): string[] {
  const dir = runsDir(profileId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && isValidRunId(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();
}

export function readRun(profileId: string, runId: string): RunRecord | null {
  try {
    return JSON.parse(fs.readFileSync(runJsonPath(profileId, runId), "utf8")) as RunRecord;
  } catch {
    return null;
  }
}

export function writeRun(record: RunRecord): void {
  const dir = runDir(record.profile, record.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "run.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

export function latestRun(profileId: string): RunRecord | null {
  for (const id of listRunIds(profileId)) {
    const record = readRun(profileId, id);
    if (record) return record;
  }
  return null;
}

/**
 * Every raw line of a run's log.
 *
 * Reads the whole file, and every caller wants it: the tail is a slice of this,
 * and phase progress has to see markers that scrolled out of the tail long ago.
 * A four-minute run produces well under a megabyte, so seeking backwards through
 * a file being appended to by a detached process is machinery for no gain.
 */
export function readAllLogLines(profileId: string, runId: string): string[] {
  const file = logPath(profileId, runId);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
}
