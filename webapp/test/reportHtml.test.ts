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
    portal: "linkedin-search",
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
  // The page has exactly one script — its own, at the end of the body. Posting
  // text never adds a second one, and never reaches the parser as markup.
  // The page has exactly one script — its own — and the posting's text survives
  // only as entities, so the parser never sees a second tag.
  assert.equal(html.match(/<script>/g)?.length, 1);
  assert.ok(html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"));
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

test("fit is a coloured left edge on the fit cell, not a pill", () => {
  const html = renderReport([job({ fit: "high" })], META, STATS, SERIES);
  assert.ok(html.includes('<td class="fit" style="--fc:var(--high)" data-v="0">High</td>'));
  assert.ok(!html.includes('class="pill"'), "the pill was replaced by the edge");
  assert.ok(
    /td\.fit\s*\{[^}]*border-left:\s*3px solid var\(--fc/.test(html),
    "the tone is carried by a left border on the cell",
  );
  assert.ok(!html.includes("#ffffff"), "white text fails contrast on a dark card");
});

test("the fit breakdown is a row of count chips, one per level", () => {
  const html = renderReport(
    [job({ fit: "high" }), job({ fit: "low" }), job({ fit: "low" })],
    META,
    STATS,
    SERIES,
  );
  for (const [fit, count] of [["high", 1], ["medium", 0], ["low", 2]] as const) {
    assert.ok(
      html.includes(
        `<button type="button" class="chip" data-fit="${fit}" aria-pressed="true"` +
          ` style="--ch:var(--${fit})"><b>${count}</b> ${fit}</button>`,
      ),
      fit,
    );
  }
  assert.ok(html.includes("3 new position(s) in this run"));
  assert.ok(!html.includes("1 high, 0 medium"));
});

test("the chips are filter buttons with a live shown-count beside them", () => {
  const html = renderReport([job({}), job({}), job({})], META, STATS, SERIES);
  assert.equal(html.match(/class="chip" data-fit=/g)?.length, 3);
  assert.equal(html.match(/aria-pressed="true"/g)?.length, 3, "every level starts visible");
  assert.ok(html.includes('<span class="shown" id="shown" aria-live="polite">3 of 3 shown</span>'));
  // The count is rewritten by the script, so it must be addressable and polite.
  assert.ok(html.includes('shown.textContent = n + " of " + rows.length + " shown"'));
  // Chips sit inside the table's card, next to what they filter.
  assert.ok(
    html.indexOf('class="chips"') > html.indexOf('<div class="stats">'),
    "the chips moved down beside the table",
  );
  assert.ok(html.indexOf('class="chips"') < html.indexOf('<table id="jobs">'));
});

test("filtering every level out leaves a sentence, not a blank card", () => {
  const html = renderReport([job({})], META, STATS, SERIES);
  assert.ok(html.includes('<tr id="nomatch" hidden><td colspan="7">'));
  assert.ok(html.includes("Every fit level is filtered out"));
  assert.ok(/tr\[hidden\]\s*\{\s*display:\s*none/.test(html), "hidden rows must not lay out");
});

test("the fit column sorts by rank, and every other head sorts as text", () => {
  const html = renderReport([job({ fit: "low" }), job({ fit: "high" })], META, STATS, SERIES);
  assert.ok(html.includes('<th data-type="num">Fit</th>'), "high > medium > low, not alphabetical");
  assert.ok(html.includes('<td class="fit" style="--fc:var(--low)" data-v="2">Low</td>'));
  assert.ok(html.includes('<td class="fit" style="--fc:var(--high)" data-v="0">High</td>'));
  for (const head of ["Title", "Company", "Portal", "First seen", "Status"]) {
    assert.ok(html.includes(`<th data-type="text">${head}</th>`), head);
  }
  // The link column has nothing to order by, so it is not made to look sortable.
  assert.ok(html.includes("<th>Link</th>"));
  // Ties fall back to the digest order, so a re-sort never reshuffles equals.
  assert.ok(html.includes('data-i="0"') && html.includes('data-i="1"'));
});

test("the table carries portal and status columns", () => {
  const html = renderReport(
    [job({ portal: "freehire-search", outcome: "Interview" })],
    META,
    STATS,
    SERIES,
  );
  assert.ok(html.includes('<td class="meta">Freehire</td>'));
  assert.ok(html.includes('<td class="meta">Interview</td>'), "the tracker outcome wins");

  // With no tracker row — the state of every profile before /outcome runs — the
  // scraper's own status stands in rather than a column of dashes.
  const fresh = renderReport([job({ portal: "", outcome: null })], META, STATS, SERIES);
  assert.ok(fresh.includes('<td class="meta">new</td>'));
  assert.ok(fresh.includes('<td class="meta">—</td>'), "an unrecorded portal dashes out");
});

test("zebra and hover are styled, and the stripe is assigned to visible rows only", () => {
  const html = renderReport([job({}), job({})], META, STATS, SERIES);
  assert.ok(/tbody tr\.alt td:not\(\.fit\)\s*\{\s*background/.test(html));
  assert.ok(/tbody tr:hover td:not\(\.fit\)\s*\{\s*background/.test(html));
  // :nth-child would keep counting filtered-out rows and double a stripe.
  assert.ok(!html.includes("nth-child(even)"));
  assert.ok(html.includes('tr.classList.toggle("alt", n % 2 === 1)'));
});

test("the behaviour is one inline script and makes no request", () => {
  const html = renderReport([job({})], META, STATS, SERIES);
  assert.equal(html.match(/<script>/g)?.length, 1);
  for (const forbidden of ["http://", "fetch(", "XMLHttpRequest", "<link", "import("]) {
    assert.ok(!html.includes(forbidden), forbidden);
  }
  // The one anchor on the page is the job's own link, which is not a fetch.
  assert.ok(html.includes('<a href="https://example.com/x">Open</a>'));
});

test("an empty run gets no chips rather than three zeroes", () => {
  const html = renderReport([], META, STATS, ZEROS);
  assert.ok(!html.includes('class="chips"'));
  assert.ok(html.includes("No new jobs in this run."));
});

test("the facts strip carries the run's id, timing, cost and profile", () => {
  const html = renderReport([job({})], {
    ...META,
    runId: "20260729-190411",
    endedAt: "2026-07-29T19:08:53Z",
    costUsd: 0.4213,
  }, STATS, SERIES);
  assert.ok(html.includes('<span class="v">20260729-190411</span>'));
  assert.ok(html.includes('<span class="v">2026-07-29 19:04Z</span>'));
  assert.ok(html.includes('<span class="v">4m 42s</span>'), "duration, from startedAt to endedAt");
  assert.ok(html.includes('<span class="v">$0.421</span>'));
  assert.ok(html.includes('<span class="v">brandon</span>'));
  for (const key of ["Run", "Started", "Duration", "Cost", "Profile"]) {
    assert.ok(html.includes(`<span class="k">${key}</span>`), key);
  }
});

test("unknown run facts dash out; duration never counts against now", () => {
  // A run that died mid-flight has no endedAt and no cost. Measuring to
  // Date.now() would make a downloaded file's duration grow every time it is
  // opened, so the strip says nothing rather than something wrong.
  const html = renderReport([job({})], META, STATS, SERIES);
  assert.equal(html.match(/<span class="v">—<\/span>/g)?.length, 3, "run id, duration, cost");
  assert.ok(!html.includes("NaN"));
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

test("the portal chart is one bar per source, length by volume, split by fit", () => {
  const html = renderReport(
    [
      job({ portal: "linkedin-search", fit: "high" }),
      job({ portal: "linkedin-search", fit: "low" }),
      job({ portal: "linkedin-search", fit: "low" }),
      job({ portal: "freehire-search", fit: "medium" }),
    ],
    META,
    STATS,
    SERIES,
  );
  // Volume sets the track width: 3 of 3 for the leader, 1 of 3 for the other.
  assert.ok(html.includes('<span class="track" style="width:100.0%">'));
  assert.ok(html.includes('<span class="track" style="width:33.3%">'));
  assert.ok(html.includes('<span class="name">LinkedIn <b>3</b></span>'));
  assert.ok(html.includes('<span class="name">Freehire <b>1</b></span>'));
  // Segments are proportional within the track and carry their own tone.
  assert.ok(html.includes('style="--sg:var(--high);flex:1 1 0"'));
  assert.ok(html.includes('style="--sg:var(--low);flex:2 1 0"'));
  assert.ok(html.includes('style="--sg:var(--medium);flex:1 1 0"'));
  // A fit a portal did not produce gets no zero-width segment at all.
  assert.ok(!html.includes("flex:0 1 0"));
});

test("every portal segment prints its count, because the fit palette is not CVD-safe", () => {
  const html = renderReport(
    [
      job({ portal: "linkedin-search", fit: "high" }),
      job({ portal: "linkedin-search", fit: "medium" }),
      job({ portal: "linkedin-search", fit: "medium" }),
    ],
    META,
    STATS,
    SERIES,
  );
  const segments = [...html.matchAll(/<span class="seg"[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]);
  assert.equal(segments.length, 2);
  assert.deepEqual(segments, ["1", "2"], "no segment is carried by colour alone");
  // …and each is named in text on hover, plus a legend naming all three levels.
  assert.ok(html.includes('title="1 high-fit job(s) from LinkedIn"'));
  assert.ok(html.includes('<span><i style="--lc:var(--high)"></i>High fit</span>'));
  assert.ok(html.includes('<span><i style="--lc:var(--low)"></i>Low fit</span>'));
});

test("a run with no portal data states it rather than drawing an empty box", () => {
  const html = renderReport([], META, STATS, ZEROS);
  assert.ok(html.includes("No portal data in this run yet"));
  assert.ok(!html.includes('class="track"'));
  assert.ok(!html.includes("NaN"), "no bucket means no division");
  assert.ok(!html.includes("width:%"));
});

test("a job with no portal is bucketed as unknown, never dropped from the chart", () => {
  const html = renderReport([job({ portal: "" })], META, STATS, SERIES);
  assert.ok(html.includes('<span class="name">Unknown portal <b>1</b></span>'));
  assert.ok(html.includes('<span class="track" style="width:100.0%">'));
});

test("each sparkline ends in a dot and carries a scale caption", () => {
  const html = renderReport([job({})], META, STATS, SERIES);
  // Four cards, four dots. Drawn as a round-capped near-zero line, because
  // preserveAspectRatio="none" would stretch a <circle> into an ellipse.
  assert.equal(html.match(/<line class="dot"/g)?.length, 4);
  assert.ok(!html.includes("<circle"));
  assert.ok(html.includes('x1="98.0" y1="2.0" x2="98.01" y2="2.0"'), "the total series peaks last");
  assert.equal(html.match(/<div class="cap">/g)?.length, 4);
  assert.ok(html.includes("7 wk · peak 71"));
  assert.ok(html.includes("7 wk · peak 10"));
});

test("an all-zero card says so instead of claiming a peak of zero", () => {
  const html = renderReport([job({})], META, NO_STATS, ZEROS);
  assert.equal(html.match(/7 wk · none yet/g)?.length, 4);
  assert.ok(!html.includes("peak 0"));
  assert.ok(!html.includes("NaN"));
});

test("a series too short to plot renders words, not an empty svg box", () => {
  const short = { total: [3], high: [1], medium: [2], low: [0], applied: [] } as TimelineSeries;
  const html = renderReport([job({})], META, STATS, short);
  assert.ok(!html.includes('<svg class="spark"'));
  assert.equal(html.match(/class="nospark"/g)?.length, 4);
  assert.ok(html.includes("no weekly history yet"));
  assert.ok(!html.includes("NaN"));
  // The three cards that do have a point still say what window it covers.
  assert.ok(html.includes("1 wk · peak 3"));
});

test("the summary names the count, the high-fit count, the portal and the next step", () => {
  const html = renderReport(
    [
      job({ portal: "linkedin-search", fit: "high" }),
      job({ portal: "linkedin-search", fit: "high" }),
      job({ portal: "freehire-search", fit: "low" }),
    ],
    META,
    STATS,
    SERIES,
  );
  assert.ok(
    html.includes(
      "3 new position(s) in this run — 2 high fit, all of them from LinkedIn. " +
        "Start with the high-fit rows below, then run /apply on the ones worth a tailored CV.",
    ),
  );
  // It sits above the run facts, which is the first thing under it.
  assert.ok(html.indexOf('class="subhead lede"') < html.indexOf('class="facts"'));
});

test("the summary says which portal is worth keeping, not which is biggest", () => {
  const html = renderReport(
    [
      job({ portal: "freehire-search", fit: "high" }),
      job({ portal: "linkedin-search", fit: "high" }),
      job({ portal: "linkedin-search", fit: "low" }),
      job({ portal: "linkedin-search", fit: "low" }),
    ],
    META,
    STATS,
    SERIES,
  );
  // The two portals tie on high fit, so volume breaks it — but the wording
  // drops "all of them", because neither portal produced all the good jobs.
  assert.ok(html.includes("4 new position(s) in this run — 2 high fit, led by LinkedIn."));
});

test("a run with nothing high fit says what to do instead", () => {
  const medium = renderReport(
    [job({ portal: "freehire-search", fit: "medium" }), job({ portal: "freehire-search", fit: "low" })],
    META,
    STATS,
    SERIES,
  );
  assert.ok(
    medium.includes(
      "2 new position(s) in this run, none high fit. Freehire produced the best of them " +
        "(1 medium). Skim those rows — nothing in this run needs a same-day application.",
    ),
  );

  const low = renderReport([job({ fit: "low" })], META, STATS, SERIES);
  assert.ok(
    low.includes(
      "1 new position(s) in this run, all low fit. Nothing worth an application — " +
        "widen the queries in search-queries.md before the next scrape.",
    ),
  );

  const none = renderReport([], META, STATS, ZEROS);
  assert.ok(none.includes("No new jobs in this run. Nothing here to review"));
});
