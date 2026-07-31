/**
 * "How many `seen_jobs.json` entries did this `/rank` run touch?", answered
 * without reading a file.
 *
 * Split out of `RANK_SPEC.finalise` in `lib/runs/actions.ts` so the day
 * comparison — the one piece of genuinely new logic in that spec, and the
 * exact thing a lock-scoping mistake could silently corrupt — is testable on
 * its own, the same way `lib/scrape/seenDiff.ts` extracts its run's-added-keys
 * computation into pure, filesystem-free functions. `finalise` still does the
 * `fs.readFileSync`; this only ever sees already-parsed data.
 */

/** The one field this needs out of a `seen_jobs.json` entry. */
export type RankedEntries = Record<string, { rank_date?: string } | undefined>;

/**
 * How many entries carry `rank_date === day`.
 *
 * `day` is expected to be a `YYYY-MM-DD` string — the caller's job, not this
 * function's, to produce (see the `startedAt.slice(0, 10)` note in
 * `actions.ts`). `seen` absent or empty yields 0, not an error: a missing or
 * freshly-created `seen_jobs.json` is the normal state before `/scrape` has
 * ever run.
 */
export function countRanked(seen: RankedEntries | undefined, day: string): number {
  if (!seen) return 0;
  return Object.values(seen).filter((entry) => entry?.rank_date === day).length;
}
