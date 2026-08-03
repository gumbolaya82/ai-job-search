import test from "node:test";
import assert from "node:assert/strict";
import { runSummary } from "../lib/runs/runStore.ts";
import type { RunRecord } from "../lib/runs/runStore.ts";

const base: RunRecord = {
  id: "2026-07-30T23-47-28Z",
  profile: "brandon",
  command: "scrape",
  args: { focus: "recruiting", broad: false },
  pid: 1234,
  startedAt: "2026-07-30T23:47:28Z",
  endedAt: "2026-07-30T23:51:02Z",
  state: "done",
  exitCode: 0,
  seenKeysBefore: ["a", "b"],
  newJobs: [],
  costUsd: 0.41,
};

test("a finished run summarises to the fields the history list renders", () => {
  assert.deepEqual(runSummary(base), {
    id: "2026-07-30T23-47-28Z",
    profile: "brandon",
    startedAt: "2026-07-30T23:47:28Z",
    endedAt: "2026-07-30T23:51:02Z",
    state: "done",
    newJobCount: 0,
    costUsd: 0.41,
    focus: "recruiting",
    broad: false,
  });
});

test("a run with no persisted diff reports a null count, not zero", () => {
  // `newJobs: null` means "never observed finishing", which is a different
  // thing from a run that finished and found nothing. The digest route refuses
  // the first and serves the second, so the list must not conflate them.
  assert.equal(runSummary({ ...base, state: "running", newJobs: null }).newJobCount, null);
  assert.equal(runSummary(base).newJobCount, 0);
});

test("summaries carry no job rows", () => {
  const rows = [{ key: "k", title: "Recruiter", company: "ACME" }];
  const summary = runSummary({ ...base, newJobs: rows as never });
  assert.equal(summary.newJobCount, 1);
  assert.ok(!("newJobs" in summary));
});

test("missing args survive a legacy record", () => {
  const legacy = { ...base, args: undefined } as unknown as RunRecord;
  const summary = runSummary(legacy);
  assert.equal(summary.focus, "");
  assert.equal(summary.broad, false);
});
