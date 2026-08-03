/**
 * Whether `/rank` may be started from the webapp.
 *
 * Off by default. One real run (2026-07-31T19-59-39Z) spent $7.91, hit a 429
 * session limit and ranked nothing: rank.md dispatches a subagent per handful
 * of postings and each one WebFetches its own posting, so cost scales with the
 * backlog and a full run can burn the budget without committing a row.
 *
 * Set `AI_JOB_SEARCH_RANK=1` to turn it back on. Running `/rank` by hand in
 * Claude Code is unaffected either way — this only gates the webapp's button
 * and the server action behind it.
 *
 * Zero imports on purpose, the same reason lib/verdictTone.ts is its own
 * module: JobsTable is a client component, and anything reachable from
 * lib/runs/actions.ts drags `node:fs` into the client chunk. Read at call time
 * rather than module scope so a dev-server restart is all it takes to flip.
 */
export function rankEnabled(): boolean {
  const value = process.env.AI_JOB_SEARCH_RANK;
  return value === "1" || value === "true";
}
