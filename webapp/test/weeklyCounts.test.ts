import test from "node:test";
import assert from "node:assert/strict";
import { SPARK_WEEKS, weeklyCounts, weeklySeries } from "../lib/jobsSeries.ts";
import type { TimelineRow } from "../lib/jobsTimeline.ts";

const NOW = new Date("2026-07-29T12:00:00Z");

function row(firstSeen: string, over: Partial<TimelineRow> = {}): TimelineRow {
  return {
    key: `k:${firstSeen}:${Math.random()}`,
    profile: "brandon",
    title: "Engineer",
    company: "Acme",
    url: "https://x/1",
    firstSeen,
    fit: "high",
    seenStatus: "new",
    outcome: null,
    outcomeNotes: "",
    ...over,
  };
}

test("the series has one point per week, newest last", () => {
  const counts = weeklyCounts([row("2026-07-29")], SPARK_WEEKS, NOW);
  assert.equal(counts.length, SPARK_WEEKS);
  assert.deepEqual(counts, [0, 0, 0, 0, 0, 0, 1]);
});

test("older jobs land in earlier buckets", () => {
  // 8 days back is the previous week; 15 days back the one before that.
  const counts = weeklyCounts(
    [row("2026-07-29"), row("2026-07-21"), row("2026-07-14")],
    SPARK_WEEKS,
    NOW,
  );
  assert.deepEqual(counts, [0, 0, 0, 0, 1, 1, 1]);
});

test("dates outside the window and unparseable dates are dropped, not clamped", () => {
  const counts = weeklyCounts(
    [row("2024-01-01"), row(""), row("not a date"), row("2026-07-29")],
    SPARK_WEEKS,
    NOW,
  );
  assert.deepEqual(counts, [0, 0, 0, 0, 0, 0, 1]);
});

test("weeklySeries splits by fit and by tracker outcome", () => {
  const rows = [
    row("2026-07-29", { fit: "high" }),
    row("2026-07-29", { fit: "medium" }),
    row("2026-07-29", { fit: "low", outcome: "Active" }),
  ];
  const series = weeklySeries(rows, NOW);
  assert.equal(series.total.at(-1), 3);
  assert.equal(series.high.at(-1), 1);
  assert.equal(series.medium.at(-1), 1);
  assert.equal(series.low.at(-1), 1);
  assert.equal(series.applied.at(-1), 1);
});
