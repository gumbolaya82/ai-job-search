import test from "node:test";
import assert from "node:assert/strict";
import { isValidRunId, runIdFromDate, withCommandDefault } from "../lib/runs/runStore.ts";

test("run ids hold no colons, because Windows paths cannot", () => {
  const id = runIdFromDate(new Date("2026-07-30T12:04:11.512Z"));
  assert.equal(id, "2026-07-30T12-04-11Z");
  assert.ok(isValidRunId(id));
  assert.ok(!isValidRunId("2026-07-30T12:04:11Z"));
  assert.ok(!isValidRunId("../escape"));
});

test("a record written before commands existed reads as a scrape", () => {
  const legacy = { id: "2026-07-29T00-00-00Z", profile: "brandon", state: "done" };
  assert.equal(withCommandDefault(legacy as never).command, "scrape");
});

test("an explicit command is preserved", () => {
  const record = { id: "2026-07-30T00-00-00Z", profile: "brandon", command: "apply" };
  assert.equal(withCommandDefault(record as never).command, "apply");
});
