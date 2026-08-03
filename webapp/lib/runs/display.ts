/**
 * How a run reads on screen — labels, colours, elapsed time.
 *
 * Lives apart from `runStore.ts` because that module touches `fs` and this one
 * is imported by client components. Both the live "Last run" card and the run
 * history render the same run shape, and they drifted apart the first time the
 * helpers were copied, so they share one source now.
 */

export const RUN_STATE_LABEL: Record<string, string> = {
  running: "running",
  done: "finished",
  failed: "failed",
  cancelled: "cancelled",
};

export function runStateColor(state: string): string {
  if (state === "done") return "var(--st-hired)";
  if (state === "failed") return "var(--st-rejected)";
  if (state === "cancelled") return "var(--st-none)";
  return "var(--st-active)";
}

/** `3m 42s`. `toIso` null means "still going", so it measures against now. */
export function fmtDuration(fromIso: string, toIso: string | null): string {
  const start = Date.parse(fromIso);
  const end = toIso ? Date.parse(toIso) : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "—";
  const secs = Math.max(0, Math.round((end - start) / 1000));
  const mins = Math.floor(secs / 60);
  return mins > 0 ? `${mins}m ${secs % 60}s` : `${secs}s`;
}

/** `2026-07-30 23:47Z` — the run id's timestamp, minus the seconds nobody reads. */
export function fmtRunTime(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  return new Date(parsed).toISOString().replace("T", " ").replace(/:\d{2}\.\d+Z$/, "Z");
}
