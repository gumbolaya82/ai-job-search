import test from "node:test";
import assert from "node:assert/strict";
import { renderReport } from "../lib/report/reportHtml.ts";
import type { TimelineRow, TimelineStats } from "../lib/jobsTimeline.ts";
import type { TimelineSeries } from "../lib/jobsSeries.ts";

function job(over: Partial<TimelineRow>): TimelineRow {
  return {
    key: "brandon:https://example.com/x",
    profile: "brandon",
    title: "Recruiter",
    company: "Acme",
    url: "https://example.com/x",
    firstSeen: "2026-07-28",
    fit: "medium",
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
    ...over,
  };
}

const META = { profile: "brandon", startedAt: "2026-07-29T19:04:11Z" };

const STATS: TimelineStats = { total: 105, high: 16, medium: 57, low: 32, applied: 0 };

const SERIES: TimelineSeries = {
  total: [0, 0, 1, 4, 9, 20, 71],
  high: [0, 0, 0, 1, 2, 3, 10],
  medium: [0, 0, 1, 2, 5, 12, 37],
  low: [0, 0, 0, 1, 2, 5, 24],
  applied: [0, 0, 0, 0, 0, 0, 0],
};

const NO_STATS: TimelineStats = { total: 0, high: 0, medium: 0, low: 0, applied: 0 };

const ZEROS: TimelineSeries = {
  total: [0, 0, 0, 0, 0, 0, 0],
  high: [0, 0, 0, 0, 0, 0, 0],
  medium: [0, 0, 0, 0, 0, 0, 0],
  low: [0, 0, 0, 0, 0, 0, 0],
  applied: [0, 0, 0, 0, 0, 0, 0],
};

test("the four cards carry the all-time stats, not the run's row count", () => {
  const html = renderReport([job({}), job({})], META, STATS, SERIES);
  for (const label of ["Ever surfaced", "High fit", "Medium fit", "Low fit"]) {
    assert.ok(html.includes(`>${label}<`), label);
  }
  assert.ok(html.includes('<div class="n">105</div>'));
  assert.ok(html.includes('<div class="n">16</div>'));
  assert.ok(html.includes('<div class="n">57</div>'));
  assert.ok(html.includes('<div class="n">32</div>'));
  // "Applied" is excluded: no tracker CSV exists, so it would always read 0.
  assert.ok(!html.includes("Applied"));
  // The run's own count belongs to the subhead only.
  assert.ok(html.includes("2 new position(s)"));
});

test("four sparklines are emitted, with html attribute names not react ones", () => {
  const html = renderReport([job({})], META, STATS, SERIES);
  assert.equal(html.match(/<svg class="spark"/g)?.length, 4);
  assert.ok(html.includes('stroke-width="1.6"'));
  assert.ok(html.includes('vector-effect="non-scaling-stroke"'));
  assert.ok(!html.includes("strokeWidth"));
  assert.ok(!html.includes("vectorEffect"));
  assert.ok(html.includes('role="img"'));
  assert.ok(html.includes("last 7 weeks: 0, 0, 1, 4, 9, 20, 71"));
});

test("an all-zero series still draws a flat line, never NaN coordinates", () => {
  const html = renderReport([job({})], META, NO_STATS, ZEROS);
  assert.equal(html.match(/<svg class="spark"/g)?.length, 4);
  assert.ok(!html.includes("NaN"));
  // Every point sits on the baseline, y = H - PAD, evenly spaced across the box.
  const line = html.match(/<polyline points="([^"]+)"/)?.[1];
  assert.equal(line, "2.0,22.0 18.0,22.0 34.0,22.0 50.0,22.0 66.0,22.0 82.0,22.0 98.0,22.0");
});

test("company and title from a posting are escaped, not injected", () => {
  const html = renderReport(
    [job({ company: 'Ben & Jerry\'s <script>alert("x")</script>', title: "A & B" })],
    META,
    STATS,
    SERIES,
  );
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("Ben &amp; Jerry&#39;s &lt;script&gt;"));
  assert.ok(html.includes("A &amp; B"));
});

test("non-http urls never become anchors", () => {
  const html = renderReport([job({ url: "javascript:alert(1)" })], META, STATS, SERIES);
  assert.ok(!html.includes("javascript:"));
  assert.ok(html.includes("no link"));
});

test("styling is a style block, dark always, and every token resolves", () => {
  const html = renderReport([job({ fit: "high" })], META, STATS, SERIES);
  assert.ok(/<style>/.test(html), "browser-only output styles with a block, not attributes");
  assert.ok(html.includes("#0f141b"), "the dark --bg value");
  assert.ok(
    !html.includes("prefers-color-scheme"),
    "a downloaded file must look the same whatever the reader's OS is set to",
  );

  // Every var(--x) must be declared somewhere the browser can see it: the :root
  // block, or an inline `style="--sc:…"` on the element that reads it.
  const declared = new Set([...html.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const referenced = new Set([...html.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]));
  const missing = [...referenced].filter((name) => !declared.has(name));
  assert.deepEqual(missing, []);
});

test("fit pills are tinted, not white on a solid fill", () => {
  const html = renderReport([job({ fit: "high" })], META, STATS, SERIES);
  assert.ok(html.includes('<span class="pill" style="--fc:var(--high)">High</span>'));
  assert.ok(!html.includes("#ffffff"), "white text fails contrast on a dark card");
});

test("zero jobs renders the cards and a document, never an error", () => {
  const html = renderReport([], META, STATS, ZEROS);
  assert.ok(html.startsWith("<!DOCTYPE html>"));
  assert.ok(html.includes("No new jobs in this run."));
  assert.ok(!html.includes("<table"));
  assert.ok(html.includes("Ever surfaced"), "the all-time cards do not depend on the run");
});

test("the header carries the date, profile, and the run's scope flags", () => {
  const html = renderReport([job({})], { ...META, focus: "recruiting", broad: true }, STATS, SERIES);
  assert.ok(html.includes("2026-07-29 · profile brandon"));
  assert.ok(html.includes("broad"));
  assert.ok(html.includes("focus: recruiting"));
});

test("the two scopes are labelled so 105 cannot be read as this run", () => {
  const html = renderReport([job({})], META, STATS, SERIES);
  assert.ok(html.includes("every job ever surfaced for this profile"));
  assert.ok(html.includes("this run's new jobs only"));
});
