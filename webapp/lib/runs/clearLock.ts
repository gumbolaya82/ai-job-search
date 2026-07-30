// Explicit `.ts` extension: like the rest of lib/runs/, this module follows
// the convention for files Node's own resolver may load directly — see
// profileRegistry.ts for the extension this import depends on.
import { runProfileManager } from "../profileRegistry.ts";

/**
 * Clearing a run's lock, on every terminal path.
 *
 * Split out of lib/runs/lifecycle.ts: `hasFinished`/`isAlive` are pure
 * judgments over log lines and a pid with zero imports, while `clearLock`
 * shells out via profileRegistry.ts's `runProfileManager`. That is a real
 * structural difference, not a stylistic one, so it gets its own module.
 *
 * The run does NOT delete `profiles/<id>/.lock` itself. Its own `rm` and
 * `Remove-Item` were both refused by Claude Code's workspace-trust sandbox
 * (spike, 2026-07-28), so whichever module finalises a run must clear the
 * lock here instead.
 */

/** Best-effort lock clear. Idempotent: `clear-lock` exits 0 when none exists. */
export function clearLock(profileId: string): void {
  try {
    runProfileManager(["clear-lock", profileId]);
  } catch {
    // A failure here is not worth failing the status read over; the Profiles
    // screen surfaces a stuck lock and offers the same clear.
  }
}
