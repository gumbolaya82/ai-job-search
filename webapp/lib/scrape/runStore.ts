import path from "node:path";
// Explicit `.ts` extensions: unlike the rest of lib/, this module gets exercised
// by `node --test` as well as by the bundler, and Node's resolver does not guess
// extensions. `allowImportingTsExtensions` in tsconfig.json permits it.
import {
  cancelRefusal,
  isValidRunId,
  latestRunFor,
  listRunIdsFor,
  listRunSummariesFor,
  logPathFor,
  readAllLogLinesFor,
  readRunFor,
  runDirFor,
  runIdFromDate,
  runsDirFor,
  writeRunFor,
  type RunRecord,
  type RunState,
  type RunStorage,
  type RunSummary,
} from "../runs/runStore.ts";

// Moved to lib/runs/runStore.ts once /rank and /apply also needed a run store,
// each with its own subdirectory and log name under `profiles/<id>/reports/`
// (see that module's header for why the location is load-bearing). Re-exported
// here under its original names because this module's public surface is what
// runner.ts and the `.eml` route already import.

export type { RunRecord, RunState, RunSummary };

const SCRAPE: RunStorage = { subdir: "scrape-runs", logName: "scrape.log" };

export { cancelRefusal, isValidRunId, runIdFromDate };

export const runsDir = (profileId: string): string => runsDirFor(SCRAPE, profileId);

export const runDir = (profileId: string, runId: string): string => runDirFor(SCRAPE, profileId, runId);

export const runJsonPath = (profileId: string, runId: string): string =>
  path.join(runDir(profileId, runId), "run.json");

export const logPath = (profileId: string, runId: string): string => logPathFor(SCRAPE, profileId, runId);

export const listRunIds = (profileId: string): string[] => listRunIdsFor(SCRAPE, profileId);

export const readRun = (profileId: string, runId: string): RunRecord | null =>
  readRunFor(SCRAPE, profileId, runId);

export const writeRun = (record: RunRecord): void => writeRunFor(SCRAPE, record);

export const latestRun = (profileId: string): RunRecord | null => latestRunFor(SCRAPE, profileId);

export const listRunSummaries = (profileId: string, limit?: number): RunSummary[] =>
  listRunSummariesFor(SCRAPE, profileId, limit);

export const readAllLogLines = (profileId: string, runId: string): string[] =>
  readAllLogLinesFor(SCRAPE, profileId, runId);
