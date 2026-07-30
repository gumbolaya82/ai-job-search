import type { PhaseProgress } from "@/lib/scrape/logFormat";

/**
 * Where a run has got to, as segments — one per label the caller passes in.
 *
 * A `/scrape` takes about four minutes and used to show only a scrolling log,
 * so the answer to "is this nearly done" was to read the tail and know the
 * skill's step numbering. The phase comes from lib/scrape/logFormat.ts (or,
 * for other commands, lib/runs/progress.ts), derived from those same lines —
 * no new state, nothing the run has to cooperate with.
 *
 * Before the first recognisable marker every segment sits empty rather than
 * showing phase one: the opening seconds are session setup, and a bar that
 * claims progress it cannot see is worse than a bar that waits.
 */
export default function PhaseBar({
  labels,
  progress,
  running,
}: {
  labels: readonly string[];
  progress: PhaseProgress;
  running: boolean;
}) {
  return (
    <div className="phases" role="group" aria-label="Run progress">
      {labels.map((name, i) => {
        const state =
          i < progress.index || progress.finished
            ? "is-done"
            : i === progress.index && running
              ? "is-now"
              : i === progress.index
                ? "is-done"
                : "is-todo";
        return (
          <div key={name} className={`phase ${state}`}>
            <div className="seg">
              <i />
            </div>
            <div className="nm" title={name}>
              {name}
            </div>
          </div>
        );
      })}
    </div>
  );
}
