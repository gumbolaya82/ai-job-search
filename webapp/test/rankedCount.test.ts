import test from "node:test";
import assert from "node:assert/strict";
import { countRanked } from "../lib/runs/rankedCount.ts";

test("counts entries whose rank_date matches the run's start date exactly", () => {
  const seen = {
    a: { rank_date: "2026-07-30" },
    b: { rank_date: "2026-07-30" },
    c: { rank_date: "2026-07-29" },
  };
  assert.equal(countRanked(seen, "2026-07-30"), 2);
});

test("an off-by-one day does not count", () => {
  const seen = { a: { rank_date: "2026-07-31" } };
  assert.equal(countRanked(seen, "2026-07-30"), 0);
});

test("a record with no rank_date is not counted", () => {
  const seen = { a: {}, b: { rank_date: "2026-07-30" } };
  assert.equal(countRanked(seen, "2026-07-30"), 1);
});

test("an empty seen map counts zero", () => {
  assert.equal(countRanked({}, "2026-07-30"), 0);
});

test("a missing seen_jobs.json (undefined seen) counts zero, not an error", () => {
  assert.equal(countRanked(undefined, "2026-07-30"), 0);
});
