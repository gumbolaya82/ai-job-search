"use server";

import { revalidatePath } from "next/cache";
import { execFileSync } from "node:child_process";
import { repoRoot } from "./repoRoot";
import { PYTHON } from "./profileRegistry";

/**
 * Every mutating profile action, as Next.js Server Actions.
 *
 * HARD CONSTRAINT: this file reimplements nothing. `tools/profile_manager.py`
 * is the sole implementation of profile mutation; this is a subprocess bridge
 * and an error-message parser, nothing more. Duplicating the mutation rules in
 * TypeScript is the drift bug the whole design exists to prevent, which is why
 * there are no route handlers for these either.
 *
 * `profile_manager.py` prints failures to stderr and successes to stdout, so
 * a failure's message is recoverable verbatim and `list --json` stays parseable.
 */

export type OpResult = {
  ok: boolean;
  /** stdout on success, stderr on failure — shown to the user as-is. */
  message: string;
  /** True when the failure was a lock refusal, which offers a force path. */
  locked: boolean;
};

function run(args: string[]): OpResult {
  try {
    const stdout = execFileSync(PYTHON, ["tools/profile_manager.py", ...args], {
      cwd: repoRoot(),
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, message: stdout.trim(), locked: false };
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    const text = (e.stderr || e.stdout || e.message || "Unknown failure").trim();
    // cmd_switch's refusal message is the one failure with a recovery path.
    const locked = /in-progress command|clear-lock/i.test(text);
    return { ok: false, message: text, locked };
  }
}

function refresh(): void {
  revalidatePath("/", "layout");
}

export async function createProfile(id: string, switchTo: boolean): Promise<OpResult> {
  const created = run(["create", id]);
  if (!created.ok) return created;
  if (!switchTo) {
    refresh();
    return created;
  }
  const switched = run(["switch", id]);
  refresh();
  return switched.ok
    ? { ...switched, message: `${created.message}\n${switched.message}` }
    : switched;
}

export async function activateProfile(id: string): Promise<OpResult> {
  const result = run(["switch", id]);
  refresh();
  return result;
}

export async function archiveProfile(id: string): Promise<OpResult> {
  const result = run(["archive", id]);
  refresh();
  return result;
}

export async function restoreProfile(id: string): Promise<OpResult> {
  const result = run(["restore", id]);
  refresh();
  return result;
}

/**
 * Clear a stale lock, then switch. Backs the "Force switch" button.
 *
 * Deliberately two separate subprocess calls rather than a new python
 * subcommand: clearing a lock is a destructive act that deserves its own
 * audit line in the output the user sees.
 */
export async function forceSwitchProfile(lockedId: string, targetId: string): Promise<OpResult> {
  const cleared = run(["clear-lock", lockedId]);
  if (!cleared.ok) {
    refresh();
    return cleared;
  }
  const switched = run(["switch", targetId]);
  refresh();
  return switched.ok
    ? { ...switched, message: `${cleared.message}\n${switched.message}` }
    : switched;
}
