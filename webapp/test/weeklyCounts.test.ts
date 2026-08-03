import test from "node:test";
import assert from "node:assert/strict";
import {
  SPARK_WEEKS,
  bestPortal,
  portalBreakdown,
  portalLabel,
  weeklyCounts,
  weeklySeries,
} from "../lib/jobsSeries.ts";
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
    rankScore: null,
    rankVerdict: null,
    rankDate: "",
    location: "",
    locationVerdict: null,
    deadline: null,
    expired: false,
    portal: "",
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

test("portal labels drop the CLI's -search suffix and keep brand casing", () => {
  assert.equal(portalLabel("linkedin-search"), "LinkedIn");
  assert.equal(portalLabel("freehire-search"), "Freehire");
  assert.equal(portalLabel("jobdanmark-search"), "JobDanmark");
  // An unknown portal is capitalised, never guessed at or dropped.
  assert.equal(portalLabel("newboard-search"), "Newboard");
  assert.equal(portalLabel("newboard"), "Newboard");
  // A job with no portal is still a job, so it gets a name rather than a gap.
  assert.equal(portalLabel(""), "Unknown portal");
  assert.equal(portalLabel("   "), "Unknown portal");
});

test("portalBreakdown splits each portal's volume by fit, biggest first", () => {
  const rows = [
    row("2026-07-29", { portal: "linkedin-search", fit: "high" }),
    row("2026-07-29", { portal: "linkedin-search", fit: "low" }),
    row("2026-07-29", { portal: "linkedin-search", fit: "low" }),
    row("2026-07-29", { portal: "freehire-search", fit: "medium" }),
  ];
  const buckets = portalBreakdown(rows);
  assert.equal(buckets.length, 2);
  assert.deepEqual(buckets[0], {
    portal: "linkedin-search",
    label: "LinkedIn",
    total: 3,
    high: 1,
    medium: 0,
    low: 2,
  });
  assert.deepEqual(buckets[1], {
    portal: "freehire-search",
    label: "Freehire",
    total: 1,
    high: 0,
    medium: 1,
    low: 0,
  });
});

test("no rows is an empty breakdown, for the caller to state in words", () => {
  assert.deepEqual(portalBreakdown([]), []);
  assert.equal(bestPortal([]), null);
});

test("bestPortal ranks by high-fit jobs, not by volume", () => {
  const rows = [
    row("2026-07-29", { portal: "freehire-search", fit: "high" }),
    ...Array.from({ length: 9 }, () =>
      row("2026-07-29", { portal: "linkedin-search", fit: "low" }),
    ),
  ];
  const best = bestPortal(rows);
  assert.equal(best?.label, "Freehire");
  assert.equal(best?.high, 1);
  // Volume still decides the chart's row order, so the two must not be confused.
  assert.equal(portalBreakdown(rows)[0].label, "LinkedIn");
});

test("bestPortal falls back to medium then volume when nothing is high fit", () => {
  const byMedium = bestPortal([
    row("2026-07-29", { portal: "freehire-search", fit: "medium" }),
    row("2026-07-29", { portal: "linkedin-search", fit: "low" }),
    row("2026-07-29", { portal: "linkedin-search", fit: "low" }),
  ]);
  assert.equal(byMedium?.label, "Freehire");

  const byVolume = bestPortal([
    row("2026-07-29", { portal: "freehire-search", fit: "low" }),
    row("2026-07-29", { portal: "linkedin-search", fit: "low" }),
    row("2026-07-29", { portal: "linkedin-search", fit: "low" }),
  ]);
  assert.equal(byVolume?.label, "LinkedIn");
});
