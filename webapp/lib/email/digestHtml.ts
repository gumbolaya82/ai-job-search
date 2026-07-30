// Explicit `.ts`: this module is loaded by `node --test` as well as the bundler,
// and Node's resolver does not guess extensions. Permitted by
// `allowImportingTsExtensions` in tsconfig.json.
import { FIT_LABEL, FIT_RANK, type FitLevel } from "../fitRank.ts";
import type { TimelineRow } from "../jobsTimeline.ts";

/**
 * The email body: one self-contained HTML document listing the jobs a single
 * scrape run surfaced.
 *
 * Two rules invert here relative to every other HTML this repo emits, and both
 * are deliberate:
 *
 *  1. **Every style is an inline `style=""` attribute.** `/html-report` and the
 *     webapp use a `<style>` block because their output is opened in a browser.
 *     Mail clients strip `<style>`, so a block here would render as unstyled
 *     text in exactly the place the styling matters.
 *  2. **Colours are literal hex, not CSS custom properties.** `var(--high)` does
 *     not resolve in a mail client. The values below are the computed form of
 *     the tokens in `app/globals.css` — a knowing duplication, not drift. If the
 *     palette changes there, change it here too.
 *
 * Layout is a `<table>`. Outlook renders neither flexbox nor grid.
 *
 * Pure: no filesystem, no imports beyond the leaf `fitRank` module, so it is
 * unit-testable directly.
 */

/** app/globals.css tokens, resolved. --accent is hsl(226 83% 53%). */
const COLOR = {
  accent: "#2452eb",
  text: "#1e293b",
  muted: "#64748b",
  border: "#e2e8f0",
  bg: "#f8fafc",
  high: "#22c55e",
  medium: "#f59e0b",
  low: "#ef4444",
} as const;

const FIT_COLOR: Record<FitLevel, string> = {
  high: COLOR.high,
  medium: COLOR.medium,
  low: COLOR.low,
};

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Escape text for HTML interpolation.
 *
 * Titles and company names come from job postings, which are untrusted input —
 * the same rule `/html-report` and `/email-report` both state. React escapes
 * automatically in the webapp's own tables, so there was no existing helper to
 * reuse; this is the one place that builds HTML by hand.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Only http(s) links become anchors; anything else is rendered as plain text.
 *
 * Exported for `lib/report/reportHtml.ts`, which renders the same untrusted
 * posting URLs into the downloadable page. One gate, not two.
 */
export function safeUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export type DigestMeta = {
  profile: string;
  /** ISO timestamp of the run. */
  startedAt: string;
  focus?: string;
  broad?: boolean;
};

export function sortForDigest(rows: readonly TimelineRow[]): TimelineRow[] {
  return [...rows].sort(
    (a, b) =>
      FIT_RANK[a.fit] - FIT_RANK[b.fit] ||
      b.firstSeen.localeCompare(a.firstSeen) ||
      a.company.localeCompare(b.company),
  );
}

export function digestSubject(rows: readonly TimelineRow[], meta: DigestMeta): string {
  const date = meta.startedAt.slice(0, 10);
  return `Job Search Update — ${date} (${rows.length} new)`;
}

function fitPill(fit: FitLevel): string {
  return (
    `<span style="display:inline-block;padding:2px 10px;border-radius:999px;` +
    `background:${FIT_COLOR[fit]};color:#ffffff;font-size:12px;font-weight:600;` +
    `white-space:nowrap;">${escapeHtml(FIT_LABEL[fit])}</span>`
  );
}

function row(job: TimelineRow): string {
  const cell = `padding:8px 10px;border-bottom:1px solid ${COLOR.border};vertical-align:top;`;
  const url = safeUrl(job.url);
  const link = url
    ? `<a href="${escapeHtml(url)}" style="color:${COLOR.accent};text-decoration:none;">Open</a>`
    : `<span style="color:${COLOR.muted};">no link</span>`;
  return [
    "<tr>",
    `<td style="${cell}">${fitPill(job.fit)}</td>`,
    `<td style="${cell}font-weight:500;">${escapeHtml(job.title)}</td>`,
    `<td style="${cell}">${escapeHtml(job.company)}</td>`,
    `<td style="${cell}color:${COLOR.muted};font-size:13px;white-space:nowrap;">${escapeHtml(job.firstSeen)}</td>`,
    `<td style="${cell}">${link}</td>`,
    "</tr>",
  ].join("");
}

/** The plain-text alternative part. Same content, no markup. */
export function renderDigestText(rows: readonly TimelineRow[], meta: DigestMeta): string {
  const sorted = sortForDigest(rows);
  const header = `Job Search Update — ${meta.startedAt.slice(0, 10)} — profile ${meta.profile}`;
  if (sorted.length === 0) {
    return `${header}\n\nNo new jobs in this run.\n`;
  }
  const lines = sorted.map(
    (job) =>
      `[${FIT_LABEL[job.fit]}] ${job.title} — ${job.company}` +
      `${job.firstSeen ? ` (first seen ${job.firstSeen})` : ""}${job.url ? `\n    ${job.url}` : ""}`,
  );
  return `${header}\n\n${sorted.length} new position(s).\n\n${lines.join("\n")}\n`;
}

export function renderDigest(rows: readonly TimelineRow[], meta: DigestMeta): string {
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

  const table =
    sorted.length === 0
      ? ""
      : [
          `<table role="presentation" cellpadding="0" cellspacing="0" border="0" `,
          `style="width:100%;border-collapse:collapse;font-size:14px;color:${COLOR.text};">`,
          "<thead><tr>",
          ...["Fit", "Title", "Company", "First seen", "Link"].map(
            (h) =>
              `<th align="left" style="padding:6px 10px;border-bottom:2px solid ${COLOR.border};` +
              `color:${COLOR.muted};font-size:11px;text-transform:uppercase;` +
              `letter-spacing:0.03em;">${escapeHtml(h)}</th>`,
          ),
          "</tr></thead><tbody>",
          ...sorted.map(row),
          "</tbody></table>",
        ].join("");

  return [
    "<!DOCTYPE html>",
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(digestSubject(sorted, meta))}</title>`,
    "</head>",
    `<body style="margin:0;padding:20px;background:${COLOR.bg};font-family:${FONT};color:${COLOR.text};">`,
    `<div style="max-width:720px;margin:0 auto;background:#ffffff;border-radius:8px;padding:22px;">`,
    `<h1 style="margin:0 0 4px;font-size:20px;letter-spacing:-0.02em;color:${COLOR.text};">`,
    `Job Search Update</h1>`,
    `<div style="color:${COLOR.muted};font-size:13px;margin-bottom:16px;">`,
    `${escapeHtml(meta.startedAt.slice(0, 10))} · profile ${escapeHtml(meta.profile)}`,
    scope.length ? ` · ${escapeHtml(scope.join(" · "))}` : "",
    "</div>",
    `<p style="margin:0 0 16px;font-size:15px;">${escapeHtml(subhead)}</p>`,
    table,
    `<p style="margin:18px 0 0;color:${COLOR.muted};font-size:12px;">`,
    "Generated by the ai-job-search webapp from this run's additions to ",
    "<code>seen_jobs.json</code>.</p>",
    "</div></body></html>",
  ].join("");
}
