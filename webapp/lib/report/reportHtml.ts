// Explicit `.ts`: this module is loaded by `node --test` as well as the bundler,
// and Node's resolver does not guess extensions. Permitted by
// `allowImportingTsExtensions` in tsconfig.json.
import { FIT_LABEL, FIT_RANK, type FitLevel } from "../fitRank.ts";
import { SPARK_H, SPARK_W, sparkGeometry } from "../sparkGeometry.ts";
import { escapeHtml, safeUrl, sortForDigest, digestSubject, type DigestMeta } from "../email/digestHtml.ts";
import { fmtDuration, fmtRunTime } from "../runs/display.ts";
import type { TimelineRow, TimelineStats } from "../jobsTimeline.ts";
import {
  bestPortal,
  portalBreakdown,
  portalLabel,
  type PortalFit,
  type TimelineSeries,
} from "../jobsSeries.ts";

/**
 * The downloadable report: one self-contained HTML document that looks like the
 * webapp dashboard.
 *
 * This is the sibling of `lib/email/digestHtml.ts`, and the two exist separately
 * on purpose. That one is an email body, so it is inline-styled, table-laid-out
 * and light — mail clients strip `<style>`, ignore `var()`, and mangle dark
 * backgrounds and inline SVG. This one is only ever opened in a browser, so it
 * gets the real thing: a `<style>` block, a CSS grid of stat cards, and SVG
 * sparklines. Changing the shared renderer to serve both would have regressed
 * the email for no gain.
 *
 * It also carries a small inline `<script>` — the table's fit filters and
 * column sorting. That is allowed here for the same reason the `<style>` block
 * is: this file is only ever opened in a browser, never mailed and never
 * printed. The script is self-contained and makes no request of any kind, so
 * the document still works from `file://` with no network. Everything it
 * drives degrades to a plain, fully readable table if it never runs.
 *
 * Two rules it keeps from its sibling:
 *
 *  1. **The dark token values are hardcoded here.** They are the computed form of
 *     `app/globals.css`'s dark theme (the block at the end of that file) — a
 *     knowing duplication, not drift, because the downloaded file must render
 *     from `file://` with no stylesheet to link to. If the palette changes
 *     there, change it here too.
 *  2. **Dark always, not `prefers-color-scheme`.** The dashboard follows the OS;
 *     a file that has left the app should look the same to whoever opens it.
 *
 * Escaping and link gating are imported from `digestHtml.ts` rather than
 * reimplemented: titles, companies and URLs are untrusted posting text, and one
 * gate is the point. `fmtDuration`/`fmtRunTime` come from `runs/display.ts` for
 * the same reason: the run facts strip must read the way the dashboard's run
 * history reads, and that module is already the one source for both.
 *
 * Pure: no filesystem, so it is unit-testable directly.
 */

/** app/globals.css dark-theme tokens, resolved. */
const STYLE = `
:root {
  --bg: #0f141b;
  --card: #161d26;
  --border: #272f3c;
  --text: #e6edf5;
  --muted: #8c9aab;
  --accent: hsl(250 83% 62%);
  --accent-text: hsl(250 90% 76%);
  --high: #22c55e;
  --medium: #f59e0b;
  --low: #ef4444;
  --wash: rgba(148, 163, 184, 0.1);
  --fs: 15.5px;
  --fs-sm: 13.7px;
  --fs-xs: 12px;
  --fs-h1: 26.8px;
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, "Cascadia Code", "Segoe UI Mono", Consolas, monospace;
  --pad: 20px;
  --rowpad: 8px;
  --radius: 14px;
  --maxw: 1060px;
  --card-border: 1px solid var(--border);
  --card-shadow: 0 1px 2px rgba(0, 0, 0, 0.5), 0 8px 22px rgba(0, 0, 0, 0.38);
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: var(--fs);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  padding: 26px 20px 40px;
}
.wrap { max-width: var(--maxw); margin: 0 auto; }
h1 { font-size: var(--fs-h1); margin: 0; letter-spacing: -0.02em; }
.crumb {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  margin-top: 5px;
}
.subhead { font-size: var(--fs-sm); margin: 14px 0 10px; }
/* the lede is a sentence, not a stat strip: full body size, and it wraps. */
.lede { font-size: var(--fs); line-height: 1.45; max-width: 74ch; }
.note { color: var(--muted); font-size: var(--fs-xs); }
/* Every chart that has nothing to draw says so in words. Nothing on this page
   renders an empty box: rank_score, deadline, location and the tracker are all
   unpopulated on a fresh profile, and a blank frame reads as a bug. */
.empty {
  border: 1px dashed var(--border);
  border-radius: 10px;
  padding: 13px 15px;
  color: var(--muted);
  font-size: var(--fs-xs);
}

/* count chips — app/globals.css .chips / .chip in their pressed form. Here they
   also filter the table, so they are real buttons carrying aria-pressed, and
   the off state is struck through as well as dimmed: the fit palette is not
   CVD-separable, so no control on this page may signal state by colour alone. */
.chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  margin: 0 0 14px;
}
.chip {
  font-size: var(--fs-xs);
  font-weight: 600;
  padding: 3px 11px;
  border-radius: 999px;
  white-space: nowrap;
  color: var(--ch, var(--accent-text));
  background: color-mix(in srgb, var(--ch, var(--accent)) 16%, transparent);
}
.chip b {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}
button.chip {
  border: 0;
  font-family: inherit;
  cursor: pointer;
  line-height: 1.5;
}
button.chip[aria-pressed="false"] {
  opacity: 0.5;
  text-decoration: line-through;
}
button.chip:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 2px; }
.shown {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  margin-left: auto;
}

/* run facts — this run's own identity, stated before the all-time cards so the
   two scopes cannot be confused. Mono values so a column of runs lines up. */
.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 24px;
  background: var(--wash);
  border: var(--card-border);
  border-radius: var(--radius);
  padding: 11px 15px;
  margin: 0 0 14px;
}
.fact { display: flex; flex-direction: column; }
.fact .k { font-size: var(--fs-xs); color: var(--muted); }
.fact .v {
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  font-variant-numeric: tabular-nums;
}

/* stat cards — app/globals.css .stats / .stat */
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 10px;
}
.stat {
  background: var(--card);
  border: var(--card-border);
  box-shadow: var(--card-shadow);
  border-radius: var(--radius);
  padding: 13px 15px;
  border-left: 3px solid var(--sc, var(--accent));
}
.stat .n {
  font-size: 25px;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono);
}
.stat .l { font-size: var(--fs-xs); color: var(--muted); margin-top: 3px; }
.stat .spark {
  display: block;
  width: 100%;
  height: 20px;
  margin-top: 8px;
  overflow: visible;
}
/* A curve with no numbers on it has no scale. The caption gives it one — the
   window it covers and its own peak — so a shape can be read as a quantity. */
.stat .cap {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--muted);
  margin-top: 3px;
  letter-spacing: 0.01em;
}
.stat .nospark {
  font-size: var(--fs-xs);
  color: var(--muted);
  margin-top: 8px;
}
.scope { margin: 9px 0 20px; }

/* portal quality bars — one row per source, length = volume, split by fit.
   A bare per-portal count cannot tell "forty low-fit rows" from "four high-fit
   ones", which is the only question worth asking of a job portal. */
.chart { margin: 0 0 16px; }
.ctitle { font-size: var(--fs-sm); font-weight: 600; margin: 0; }
.legend {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  align-items: center;
  margin: 8px 0 12px;
  font-size: var(--fs-xs);
  color: var(--muted);
}
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.legend i {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--lc, var(--accent)) 55%, var(--card));
}
.pq {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 7px 12px;
  align-items: center;
}
.pq .name { font-size: var(--fs-sm); white-space: nowrap; }
.pq .name b {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  font-weight: 600;
}
/* 2px flex gap, so the card surface separates the segments rather than a
   border darkening the fill. Inline width carries the portal's volume share. */
.pq .track { display: flex; gap: 2px; height: 22px; min-width: 22px; }
.pq .seg {
  display: flex;
  align-items: center;
  justify-content: center;
  /* A segment never shrinks below its own count: the label is the primary
     encoding here, so a sliver that cannot show its number is worse than a
     bar whose smallest slice is slightly over-long. */
  min-width: 17px;
  overflow: hidden;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--fs-xs);
  /* Text tokens, never the series colour: the count must stay legible on its
     own fill, and #22c55e on a green tint is not. */
  color: var(--text);
  background: color-mix(in srgb, var(--sg, var(--accent)) 38%, var(--card));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--sg, var(--accent)) 50%, transparent);
}
.pq .track .seg:first-child { border-radius: 4px 0 0 4px; }
.pq .track .seg:last-child { border-radius: 0 4px 4px 0; }

/* the job table, in a card that can scroll rather than push the body wide */
.card {
  background: var(--card);
  border: var(--card-border);
  box-shadow: var(--card-shadow);
  border-radius: var(--radius);
  padding: var(--pad);
}
.tablebox { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
th, td {
  text-align: left;
  padding: var(--rowpad) 10px;
  border-bottom: 1px solid var(--border);
}
thead th {
  color: var(--muted);
  font-weight: 600;
  font-size: var(--fs-xs);
  white-space: nowrap;
}
/* Sortable heads. data-type is both the switch the script reads and the
   selector that styles them, so a head can never look sortable and not be. */
thead th[data-type] { cursor: pointer; user-select: none; }
thead th[data-type]:hover { color: var(--text); }
thead th[data-type]::after {
  content: "\\2195";
  margin-left: 5px;
  opacity: 0.3;
  font-size: 10px;
}
thead th[aria-sort="ascending"]::after { content: "\\2191"; opacity: 1; }
thead th[aria-sort="descending"]::after { content: "\\2193"; opacity: 1; }
thead th:focus-visible { outline: 2px solid var(--accent-text); outline-offset: -2px; }
tbody tr:last-child td { border-bottom: none; }
/* Zebra and hover. The stripe is applied by the script to *visible* rows, not
   by :nth-child, so filtering out a row does not double a stripe. Both skip
   .fit, whose own tint is the fit colour and must not be painted over. */
tbody tr.alt td:not(.fit) { background: rgba(148, 163, 184, 0.045); }
tbody tr:hover td:not(.fit) { background: rgba(148, 163, 184, 0.1); }
tbody tr:hover td.fit { background: color-mix(in srgb, var(--fc, var(--muted)) 16%, transparent); }
tr[hidden] { display: none; }
td.title { font-weight: 500; }
td.meta {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--fs-xs);
  color: var(--muted);
  white-space: nowrap;
}
a { color: var(--accent-text); text-decoration: none; }
a:hover { text-decoration: underline; }

/* Fit is the row's left edge rather than a pill in the cell: a colour you see
   down the whole column before reading any word. Tinted, never filled — white
   on #22c55e is ~1.9:1 against a #161d26 card, so the tone stays in the text
   and the edge, as the dashboard's .fit .lab does. */
td.fit {
  border-left: 3px solid var(--fc, var(--muted));
  background: color-mix(in srgb, var(--fc, var(--muted)) 8%, transparent);
  padding-left: 11px;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--fc, var(--muted));
  white-space: nowrap;
}
/* 3px edge + 11px pad: keeps the head label over the cell text below it. */
thead th:first-child { padding-left: 14px; }
.foot { color: var(--muted); font-size: var(--fs-xs); margin: 18px 0 0; }
@media (max-width: 640px) {
  body { padding: 18px 12px 30px; }
  .card { padding: 12px; }
}
`.trim();

/**
 * The table's behaviour: fit filters, column sorting, zebra striping.
 *
 * Deliberately plain ES5-shaped DOM code with no build step and no globals
 * beyond one IIFE. It reads only `data-` attributes the renderer wrote, so
 * nothing here needs to know the column order.
 *
 * The stripe is assigned here rather than by `:nth-child` because filtering
 * hides rows: CSS would keep counting the hidden ones and produce two
 * same-coloured rows in a row.
 */
const SCRIPT = `
(function () {
  var table = document.getElementById("jobs");
  if (!table) return;
  var body = table.tBodies[0];
  var rows = [].slice.call(body.querySelectorAll("tr[data-fit]"));
  var none = document.getElementById("nomatch");
  var shown = document.getElementById("shown");
  var off = {};

  function paint() {
    var n = 0;
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      var on = !off[tr.getAttribute("data-fit")];
      tr.hidden = !on;
      if (on) {
        tr.classList.toggle("alt", n % 2 === 1);
        n++;
      } else {
        tr.classList.remove("alt");
      }
    }
    if (none) none.hidden = n !== 0;
    if (shown) shown.textContent = n + " of " + rows.length + " shown";
  }

  var chips = document.querySelectorAll(".chip[data-fit]");
  for (var c = 0; c < chips.length; c++) {
    (function (chip) {
      chip.addEventListener("click", function () {
        var fit = chip.getAttribute("data-fit");
        off[fit] = !off[fit];
        chip.setAttribute("aria-pressed", off[fit] ? "false" : "true");
        paint();
      });
    })(chips[c]);
  }

  var heads = table.tHead.rows[0].cells;
  var active = -1;
  var dir = 1;

  function value(tr, i, num) {
    var cell = tr.cells[i];
    var raw = cell.getAttribute("data-v");
    if (raw === null) raw = cell.textContent.trim();
    return num ? parseFloat(raw) || 0 : raw.toLowerCase();
  }

  function sortBy(i, num) {
    dir = active === i ? -dir : 1;
    active = i;
    rows.sort(function (a, b) {
      var x = value(a, i, num);
      var y = value(b, i, num);
      if (x < y) return -dir;
      if (x > y) return dir;
      return +a.getAttribute("data-i") - +b.getAttribute("data-i");
    });
    for (var k = 0; k < rows.length; k++) body.appendChild(rows[k]);
    if (none) body.appendChild(none);
    for (var h = 0; h < heads.length; h++) heads[h].removeAttribute("aria-sort");
    heads[i].setAttribute("aria-sort", dir === 1 ? "ascending" : "descending");
    paint();
  }

  for (var j = 0; j < heads.length; j++) {
    (function (th, i) {
      var type = th.getAttribute("data-type");
      if (!type) return;
      th.tabIndex = 0;
      th.setAttribute("role", "button");
      th.addEventListener("click", function () {
        sortBy(i, type === "num");
      });
      th.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          sortBy(i, type === "num");
        }
      });
    })(heads[j], j);
  }

  paint();
})();
`.trim();

const FIT_TONE: Record<FitLevel, string> = {
  high: "var(--high)",
  medium: "var(--medium)",
  low: "var(--low)",
};

const FITS = ["high", "medium", "low"] as const;

/** Keys, labels and tones as app/page.tsx defines them, minus "Applied". */
const CARDS = [
  { key: "total", label: "Ever surfaced", tone: "var(--accent)" },
  { key: "high", label: "High fit", tone: "var(--high)" },
  { key: "medium", label: "Medium fit", tone: "var(--medium)" },
  { key: "low", label: "Low fit", tone: "var(--low)" },
] as const satisfies readonly { key: keyof TimelineStats; label: string; tone: string }[];

/**
 * The same curve `components/Sparkline.tsx` draws, emitted as a string.
 *
 * Attribute names are the HTML forms — `stroke-width`, `vector-effect` — not
 * React's camelCase ones, which a browser silently ignores.
 *
 * The end of the curve carries a dot, because "which end is now" is otherwise
 * a guess. It is drawn as a near-zero-length round-capped line rather than a
 * `<circle>`: `preserveAspectRatio="none"` stretches the viewBox horizontally,
 * so any circle would render as an ellipse. A round cap under
 * `vector-effect="non-scaling-stroke"` is stroked in device space, so it stays
 * round at any card width — the same reason the polyline already sets both.
 *
 * A series too short to plot returns a stated empty state, not an empty box.
 */
function sparkSvg(points: readonly number[], color: string, label: string): string {
  const geo = sparkGeometry(points);
  if (!geo) return '<div class="nospark">no weekly history yet</div>';
  const { x, y } = geo.last;
  return (
    `<svg class="spark" viewBox="0 0 ${SPARK_W} ${SPARK_H}" preserveAspectRatio="none"` +
    ` role="img" aria-label="${escapeHtml(label)}">` +
    `<polygon points="${geo.area}" fill="${color}" opacity="0.13"/>` +
    `<polyline points="${geo.line}" fill="none" stroke="${color}" stroke-width="1.6"` +
    ` stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>` +
    `<line class="dot" x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + 0.01).toFixed(2)}"` +
    ` y2="${y.toFixed(1)}" stroke="${color}" stroke-width="5" stroke-linecap="round"` +
    ` vector-effect="non-scaling-stroke"/>` +
    "</svg>"
  );
}

/**
 * The caption that gives the curve a scale: how long a window it covers, and
 * how high it got. Without it the sparkline is a shape with no units.
 *
 * An all-zero series says so rather than claiming a peak of 0, which reads as
 * a measurement when it is really an absence.
 */
function sparkCaption(points: readonly number[]): string {
  if (points.length === 0) return "";
  const peak = Math.max(...points);
  const scale = peak > 0 ? `peak ${peak}` : "none yet";
  return `<div class="cap">${escapeHtml(points.length)} wk · ${escapeHtml(scale)}</div>`;
}

function statCard(
  card: (typeof CARDS)[number],
  stats: TimelineStats,
  series: TimelineSeries,
): string {
  const points = series[card.key] ?? [];
  const label = `${card.label}, last ${points.length} weeks: ${points.join(", ")}`;
  return (
    `<div class="stat" style="--sc:${card.tone}">` +
    `<div class="n">${escapeHtml(stats[card.key])}</div>` +
    `<div class="l">${escapeHtml(card.label)}</div>` +
    sparkSvg(points, card.tone, label) +
    sparkCaption(points) +
    "</div>"
  );
}

/**
 * One horizontal stacked bar per portal: length is the portal's volume, the
 * segments are its fit mix, and every segment prints its own count.
 *
 * The counts are not decoration. `--high` (#22c55e) and `--medium` (#f59e0b)
 * sit ΔE 5.7 apart for a protan viewer, well under the ΔE 8 a categorical
 * palette needs, and the palette is fixed — it is the dashboard's, duplicated
 * here on purpose. So the colour is the secondary encoding and the printed
 * count is the primary one: a reader who cannot separate the two hues still
 * reads the bar correctly, and a legend names them besides.
 *
 * Every quotient is guarded. `portalBreakdown` returns `[]` for no rows, which
 * is rendered as words; `max` cannot be 0, because a bucket only exists if a
 * row created it.
 */
function portalChart(rows: readonly TimelineRow[]): string {
  const buckets = portalBreakdown(rows);
  const head = '<div class="card chart"><h2 class="ctitle">Which portal produced this run</h2>';

  if (buckets.length === 0) {
    return (
      head +
      '<p class="empty">No portal data in this run yet — this chart fills in as soon as ' +
      "a scrape records which portal surfaced a job.</p></div>"
    );
  }

  const legend =
    '<div class="legend">' +
    FITS.map(
      (fit) =>
        `<span><i style="--lc:${FIT_TONE[fit]}"></i>${escapeHtml(FIT_LABEL[fit])} fit</span>`,
    ).join("") +
    "</div>";

  const max = Math.max(...buckets.map((b) => b.total), 1);
  const bars = buckets
    .map((bucket) => {
      const width = ((bucket.total / max) * 100).toFixed(1);
      // `flex: n 1 0` splits the track in proportion to the counts without a
      // second round of percentage arithmetic; `min-width` in the stylesheet
      // is the floor that keeps a one-job segment readable.
      const segments = FITS.filter((fit) => bucket[fit] > 0)
        .map((fit) => {
          const title = `${bucket[fit]} ${FIT_LABEL[fit].toLowerCase()}-fit job(s) from ${bucket.label}`;
          return (
            `<span class="seg" style="--sg:${FIT_TONE[fit]};flex:${bucket[fit]} 1 0"` +
            ` title="${escapeHtml(title)}">${escapeHtml(bucket[fit])}</span>`
          );
        })
        .join("");
      return (
        `<span class="name">${escapeHtml(bucket.label)} <b>${escapeHtml(bucket.total)}</b></span>` +
        `<span class="track" style="width:${width}%">${segments}</span>`
      );
    })
    .join("");

  return (
    head +
    legend +
    `<div class="pq">${bars}</div>` +
    '<p class="note" style="margin-top:12px">Bar length is the number of jobs from that portal; ' +
    "each segment prints its own count, so the colours are a second cue rather than the only one.</p>" +
    "</div>"
  );
}

/**
 * The sentence that says what happened and what to do about it.
 *
 * The rest of the page is numbers a reader has to assemble into a judgement.
 * This assembles it for them: how many jobs, how many worth opening, which
 * portal earned its place this run, and the next action. It is deliberately
 * the only place on the page that gives an instruction.
 */
function summaryLine(rows: readonly TimelineRow[], counts: Record<FitLevel, number>): string {
  const n = rows.length;
  if (n === 0) {
    return (
      "No new jobs in this run. Nothing here to review — the cards below still " +
      "count every job ever surfaced for this profile."
    );
  }

  const lead = `${n} new position(s) in this run`;
  const best: PortalFit | null = bestPortal(rows);

  if (counts.high > 0 && best && best.high > 0) {
    const source =
      best.high === counts.high ? `all of them from ${best.label}` : `led by ${best.label}`;
    return (
      `${lead} — ${counts.high} high fit, ${source}. Start with the high-fit rows below, ` +
      "then run /apply on the ones worth a tailored CV."
    );
  }

  if (counts.medium > 0 && best) {
    return (
      `${lead}, none high fit. ${best.label} produced the best of them ` +
      `(${best.medium} medium). Skim those rows — nothing in this run needs a same-day application.`
    );
  }

  return (
    `${lead}, all low fit. Nothing worth an application — widen the queries in ` +
    "search-queries.md before the next scrape."
  );
}

/** The table's columns, in order. `type` marks a head the script can sort by. */
const COLUMNS = [
  { label: "Fit", type: "num" },
  { label: "Title", type: "text" },
  { label: "Company", type: "text" },
  { label: "Portal", type: "text" },
  { label: "First seen", type: "text" },
  { label: "Status", type: "text" },
  { label: "Link", type: null },
] as const;

/**
 * `index` is the row's position in the digest sort, kept on the element as
 * `data-i` so re-sorting on any column can break ties by falling back to it —
 * an unstable sort would otherwise reshuffle equal rows on every click.
 *
 * Fit carries `data-v` with its rank, so the Fit column sorts high > medium >
 * low as the rest of the app orders it, rather than alphabetically into
 * high > low > medium.
 *
 * Status mirrors the dashboard's rule: the tracker's outcome when the job has
 * one, and the scraper's own status when it does not. The tracker is empty
 * until the first `/outcome` run, so on a fresh profile this column reads
 * "new" rather than a column of dashes.
 */
function row(job: TimelineRow, index: number): string {
  const url = safeUrl(job.url);
  const link = url
    ? `<a href="${escapeHtml(url)}">Open</a>`
    : `<span class="note">no link</span>`;
  const status = job.outcome ?? job.seenStatus ?? "";
  return [
    `<tr data-fit="${job.fit}" data-i="${index}">`,
    `<td class="fit" style="--fc:${FIT_TONE[job.fit]}" data-v="${FIT_RANK[job.fit]}">` +
      `${escapeHtml(FIT_LABEL[job.fit])}</td>`,
    `<td class="title">${escapeHtml(job.title)}</td>`,
    `<td>${escapeHtml(job.company)}</td>`,
    `<td class="meta">${escapeHtml(job.portal ? portalLabel(job.portal) : "—")}</td>`,
    `<td class="meta">${escapeHtml(job.firstSeen)}</td>`,
    `<td class="meta">${escapeHtml(status || "—")}</td>`,
    `<td>${link}</td>`,
    "</tr>",
  ].join("");
}

/**
 * What the digest knows about the run itself.
 *
 * `DigestMeta` stops at what an email needs — a date, a profile, the scope
 * flags. The downloaded page also carries a facts strip, so it takes the three
 * `RunRecord` fields the email has no use for. All three are optional: a caller
 * that has only the email's metadata still renders a valid page, with the
 * unknown facts dashed out.
 */
export type ReportMeta = DigestMeta & {
  /** `RunRecord.id` — the run directory's name, and what the URL names. */
  runId?: string;
  /** `RunRecord.endedAt`. Null while a run is unfinished or died mid-run. */
  endedAt?: string | null;
  /** `RunRecord.costUsd`. Null until the log's `result` event lands. */
  costUsd?: number | null;
};

/**
 * The run facts strip: the one place on the page scoped to this run alone.
 *
 * Duration measures against `endedAt` only. `fmtDuration`'s null branch counts
 * to `Date.now()`, which is right for a live dashboard and wrong here — this
 * file is read long after the run, so an unfinished run gets a dash.
 */
function factsStrip(meta: ReportMeta): string {
  const facts: [string, string][] = [
    ["Run", meta.runId ?? "—"],
    ["Started", fmtRunTime(meta.startedAt)],
    ["Duration", meta.endedAt ? fmtDuration(meta.startedAt, meta.endedAt) : "—"],
    ["Cost", typeof meta.costUsd === "number" ? `$${meta.costUsd.toFixed(3)}` : "—"],
    ["Profile", meta.profile],
  ];
  return (
    '<div class="facts">' +
    facts
      .map(
        ([k, v]) =>
          `<div class="fact"><span class="k">${escapeHtml(k)}</span>` +
          `<span class="v">${escapeHtml(v)}</span></div>`,
      )
      .join("") +
    "</div>"
  );
}

/**
 * `rows` is one run's new jobs; `stats` and `series` are the profile's all-time
 * figures from `summarise()` / `weeklySeries()`, exactly as the dashboard cards
 * are. The two scopes are labelled in the page so the numbers cannot be misread
 * as the run's.
 */
export function renderReport(
  rows: readonly TimelineRow[],
  meta: ReportMeta,
  stats: TimelineStats,
  series: TimelineSeries,
): string {
  const sorted = sortForDigest(rows);
  const counts = {
    high: sorted.filter((r) => r.fit === "high").length,
    medium: sorted.filter((r) => r.fit === "medium").length,
    low: sorted.filter((r) => r.fit === "low").length,
  };

  const scope = [
    meta.broad ? "broad" : null,
    meta.focus ? `focus: ${meta.focus}` : null,
  ].filter(Boolean) as string[];

  // One sentence carrying both jobs: the run's size, which the email states,
  // and the reading of it — what is worth opening and what to do next.
  const subhead = summaryLine(sorted, counts);

  // The chips moved down beside the table they now filter; a control that far
  // from its target is a control nobody connects to the rows it hides.
  const chips =
    sorted.length === 0
      ? ""
      : '<div class="chips">' +
        FITS.map(
          (fit) =>
            `<button type="button" class="chip" data-fit="${fit}" aria-pressed="true"` +
            ` style="--ch:${FIT_TONE[fit]}">` +
            `<b>${escapeHtml(counts[fit])}</b> ${escapeHtml(FIT_LABEL[fit].toLowerCase())}</button>`,
        ).join("") +
        `<span class="shown" id="shown" aria-live="polite">` +
        `${escapeHtml(sorted.length)} of ${escapeHtml(sorted.length)} shown</span>` +
        "</div>";

  const weeks = series.total?.length ?? 0;

  const table =
    sorted.length === 0
      ? ""
      : [
          '<div class="card">',
          chips,
          '<div class="tablebox"><table id="jobs">',
          "<thead><tr>",
          ...COLUMNS.map(
            (col) =>
              `<th${col.type ? ` data-type="${col.type}"` : ""}>${escapeHtml(col.label)}</th>`,
          ),
          "</tr></thead><tbody>",
          ...sorted.map(row),
          // Filtering every level out must leave a sentence, not a blank card.
          `<tr id="nomatch" hidden><td colspan="${COLUMNS.length}">`,
          "Every fit level is filtered out — press a chip above to bring rows back.",
          "</td></tr>",
          "</tbody></table></div></div>",
        ].join("");

  return [
    "<!DOCTYPE html>",
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(digestSubject(sorted, meta))}</title>`,
    `<style>${STYLE}</style>`,
    "</head><body>",
    '<div class="wrap">',
    "<h1>Job Search Update</h1>",
    '<div class="crumb">',
    `${escapeHtml(meta.startedAt.slice(0, 10))} · profile ${escapeHtml(meta.profile)}`,
    scope.length ? ` · ${escapeHtml(scope.join(" · "))}` : "",
    "</div>",
    `<p class="subhead lede">${escapeHtml(subhead)}</p>`,
    factsStrip(meta),
    '<div class="stats">',
    ...CARDS.map((card) => statCard(card, stats, series)),
    "</div>",
    `<p class="note scope">Cards count every job ever surfaced for this profile · sparklines show the last ${weeks} weeks by first-seen date, dotted at the current week · the table below is this run's new jobs only.</p>`,
    portalChart(sorted),
    table,
    '<p class="foot">Generated by the ai-job-search webapp from this run\'s additions to ',
    "<code>seen_jobs.json</code>.</p>",
    "</div>",
    `<script>${SCRIPT}</script>`,
    "</body></html>",
  ].join("");
}
