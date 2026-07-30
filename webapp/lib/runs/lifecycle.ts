// Explicit `.ts` extension: like the rest of lib/runs/, this module gets
// exercised by `node --test` as well as by the bundler, and Node's resolver
// does not guess extensions.
import { runProfileManager } from "../profileRegistry.ts";

/**
 * Telling whether a headless run has stopped, and clearing what it could not
 * clear itself.
 *
 * Lifted out of lib/scrape/runner.ts once /rank and /apply needed the same two
 * facts a spike (2026-07-28) established there:
 *
 *  1. A completed run writes a `result` event into its log. That event, not
 *     the pid, is the authoritative "this finished" signal — a process can
 *     still be winding down after writing it, and can vanish without ever
 *     writing one if it is killed externally.
 *  2. The run does NOT delete `profiles/<id>/.lock` itself. Its own `rm` and
 *     `Remove-Item` were both refused by Claude Code's workspace-trust
 *     sandbox, so whichever module finalises a run must clear the lock on
 *     every terminal path.
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

/** Best-effort lock clear. Idempotent: `clear-lock` exits 0 when none exists. */
export function clearLock(profileId: string): void {
  try {
    runProfileManager(["clear-lock", profileId]);
  } catch {
    // A failure here is not worth failing the status read over; the Profiles
    // screen surfaces a stuck lock and offers the same clear.
  }
}
