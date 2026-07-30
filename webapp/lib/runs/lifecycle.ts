/**
 * Telling whether a headless run has stopped.
 *
 * Lifted out of lib/scrape/runner.ts once /rank and /apply needed the same
 * fact a spike (2026-07-28) established there: a completed run writes a
 * `result` event into its log, and that event — not the pid — is the
 * authoritative "this finished" signal. A process can still be winding down
 * after writing it, and can vanish without ever writing one if it is killed
 * externally.
 *
 * Pure and zero-import by design. `clearLock`, which shells out via
 * profileRegistry.ts, lives in its own lib/runs/clearLock.ts instead of here
 * — that coupling is real but it has no business dragging down two functions
 * that only ever look at strings and a pid.
 */

/** True once the log carries a `result` event — the run's own end-of-stream marker. */
export function hasFinished(lines: string[]): { finished: boolean; errored: boolean } {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const event = JSON.parse(lines[i].trim()) as { type?: string; is_error?: boolean };
      if (event.type === "result") return { finished: true, errored: Boolean(event.is_error) };
    } catch {
      // Not JSON — the CLI's plain-text warnings. Keep scanning backwards.
    }
  }
  return { finished: false, errored: false };
}

export function isAlive(pid: number): boolean {
  try {
    // Signal 0 tests for existence without delivering anything.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
