// Explicit `.ts`: this module is loaded by `node --test` as well as the bundler,
// and Node's resolver does not guess extensions. Permitted by
// `allowImportingTsExtensions` in tsconfig.json.
import { FIT_LABEL, type FitLevel } from "../fitRank.ts";
import { SPARK_H, SPARK_W, sparkGeometry } from "../sparkGeometry.ts";
import { escapeHtml, safeUrl, sortForDigest, digestSubject, type DigestMeta } from "../email/digestHtml.ts";
import type { TimelineRow, TimelineStats } from "../jobsTimeline.ts";
import type { TimelineSeries } from "../jobsSeries.ts";

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
 * gate is the point.
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
.subhead { font-size: var(--fs-sm); margin: 14px 0 18px; }
.note { color: var(--muted); font-size: var(--fs-xs); }

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
.scope { margin: 9px 0 20px; }

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
tbody tr:last-child td { border-bottom: none; }
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

/* Tinted, not filled: white on #22c55e is ~1.9:1 against a #161d26 card. The
   dashboard's .fit .lab and .pill already carry the colour in the text. */
.pill {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: var(--fs-xs);
  font-weight: 600;
  white-space: nowrap;
  line-height: 1.5;
  color: var(--fc, var(--muted));
  background: color-mix(in srgb, var(--fc, var(--muted)) 16%, transparent);
}
.foot { color: var(--muted); font-size: var(--fs-xs); margin: 18px 0 0; }
@media (max-width: 640px) {
  body { padding: 18px 12px 30px; }
  .card { padding: 12px; }
}
`.trim();

const FIT_TONE: Record<FitLevel, string> = {
  high: "var(--high)",
  medium: "var(--medium)",
  low: "var(--low)",
};

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
 */
function sparkSvg(points: readonly number[], color: string, label: string): string {
  const geo = sparkGeometry(points);
  if (!geo) return "";
  return (
    `<svg class="spark" viewBox="0 0 ${SPARK_W} ${SPARK_H}" preserveAspectRatio="none"` +
    ` role="img" aria-label="${escapeHtml(label)}">` +
    `<polygon points="${geo.area}" fill="${color}" opacity="0.13"/>` +
    `<polyline points="${geo.line}" fill="none" stroke="${color}" stroke-width="1.6"` +
    ` stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>` +
    "</svg>"
  );
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
    "</div>"
  );
}

function row(job: TimelineRow): string {
  const url = safeUrl(job.url);
  const link = url
    ? `<a href="${escapeHtml(url)}">Open</a>`
    : `<span class="note">no link</span>`;
  return [
    "<tr>",
    `<td><span class="pill" style="--fc:${FIT_TONE[job.fit]}">${escapeHtml(FIT_LABEL[job.fit])}</span></td>`,
    `<td class="title">${escapeHtml(job.title)}</td>`,
    `<td>${escapeHtml(job.company)}</td>`,
    `<td class="meta">${escapeHtml(job.firstSeen)}</td>`,
    `<td>${link}</td>`,
    "</tr>",
  ].join("");
}

/**
 * `rows` is one run's new jobs; `stats` and `series` are the profile's all-time
 * figures from `summarise()` / `weeklySeries()`, exactly as the dashboard cards
 * are. The two scopes are labelled in the page so the numbers cannot be misread
 * as the run's.
 */
export function renderReport(
  rows: readonly TimelineRow[],
  meta: DigestMeta,
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

  const subhead =
    sorted.length === 0
      ? "No new jobs in this run."
      : `${sorted.length} new position(s) — ${counts.high} high, ${counts.medium} medium, ${counts.low} low.`;

  const weeks = series.total?.length ?? 0;

  const table =
    sorted.length === 0
      ? ""
      : [
          '<div class="card"><div class="tablebox"><table>',
          "<thead><tr>",
          ...["Fit", "Title", "Company", "First seen", "Link"].map(
            (h) => `<th>${escapeHtml(h)}</th>`,
          ),
          "</tr></thead><tbody>",
          ...sorted.map(row),
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
    `<p class="subhead">${escapeHtml(subhead)}</p>`,
    '<div class="stats">',
    ...CARDS.map((card) => statCard(card, stats, series)),
    "</div>",
    `<p class="note scope">Cards count every job ever surfaced for this profile · sparklines show the last ${weeks} weeks by first-seen date · the table below is this run's new jobs only.</p>`,
    table,
    '<p class="foot">Generated by the ai-job-search webapp from this run\'s additions to ',
    "<code>seen_jobs.json</code>.</p>",
    "</div></body></html>",
  ].join("");
}
