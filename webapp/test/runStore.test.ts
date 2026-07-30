import test from "node:test";
import assert from "node:assert/strict";
import { cancelRefusal, type RunRecord } from "../lib/scrape/runStore.ts";

function record(over: Partial<RunRecord> = {}): RunRecord {
  return {
    id: "2026-07-29T01-18-44Z",
    profile: "diane",
    args: { focus: "", broad: false },
    pid: 20492,
    startedAt: "2026-07-29T01:18:44.357Z",
    endedAt: null,
    state: "running",
    exitCode: null,
    seenKeysBefore: [],
    newJobs: null,
    costUsd: null,
    ...over,
  };
}

test("the run the client is watching is cancellable", () => {
  assert.equal(cancelRefusal(record(), "2026-07-29T01-18-44Z"), null);
});

test("nothing to cancel when the profile has no runs", () => {
  assert.equal(cancelRefusal(null, "2026-07-29T01-18-44Z"), "No run is in progress for this profile.");
});

test("a run that already reached a terminal state is not cancellable", () => {
  const done = record({ state: "done", endedAt: "2026-07-29T01:22:05.149Z" });
  assert.equal(cancelRefusal(done, "2026-07-29T01-18-44Z"), "No run is in progress for this profile.");
});

test("a stale client cannot cancel a run it is not watching", () => {
  const refusal = cancelRefusal(record({ id: "2026-07-29T02-00-00Z" }), "2026-07-29T01-18-44Z");
  assert.match(String(refusal), /2026-07-29T01-18-44Z/);
  assert.match(String(refusal), /2026-07-29T02-00-00Z/);
  assert.match(String(refusal), /reload/i);
});
