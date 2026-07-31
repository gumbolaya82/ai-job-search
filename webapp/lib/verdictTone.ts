/**
 * The /rank verdict vocabulary and the tones the table paints them, in a
 * module with no imports.
 *
 * It lives apart from `jobsTimeline.ts` — which is where it started — for the
 * same reason `fitRank.ts` does (see that file): `jobsTimeline.ts` imports
 * `node:fs` at module scope to read `seen_jobs.json`. `JobsTable.tsx` is a
 * client component, and importing a *value* (not just a type) from a module
 * that touches `node:fs` drags that import into the browser bundle — which
 * the bundler refuses to build, since `node:fs` has no browser equivalent.
 */

/** Bands from 04-job-evaluation.md, as the tones the table paints them. */
export const VERDICT_TONE: Record<string, string> = {
  "Strong Fit": "var(--high)",
  "Good Fit": "var(--st-active)",
  "Moderate Fit": "var(--medium)",
  "Weak Fit": "var(--low)",
  "Poor Fit": "var(--low)",
};
