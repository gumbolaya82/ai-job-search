import { execFileSync } from "node:child_process";
import { repoRoot } from "./repoRoot.ts";

/**
 * Read-only view of the profile list.
 *
 * Shells out to `profile_manager.py list --json` rather than reading
 * `profiles/` directly, so the webapp and the CLI can never disagree about
 * which profile is active, which are archived, or which hold a lock.
 *
 * `cmd_list` prints exactly:
 *   {"active": str|null, "profiles": [{"id","active","archived","lock"}]}
 */

export type ProfileRecord = {
  id: string;
  active: boolean;
  archived: boolean;
  /** ISO timestamp + command name, e.g. "2026-07-28T09:14:02Z /scrape". */
  lock: string | null;
};

export type Registry = {
  active: string | null;
  profiles: ProfileRecord[];
};

/** The python executable. Windows installs it as `python`, not `python3`. */
export const PYTHON = process.env.AI_JOB_SEARCH_PYTHON ?? "python";

export function runProfileManager(args: string[]): { stdout: string } {
  // execFileSync passes argv directly with no shell, so the space in
  // "Claude VSCode" needs no quoting and nothing here is shell-injectable.
  const stdout = execFileSync(PYTHON, ["tools/profile_manager.py", ...args], {
    cwd: repoRoot(),
    encoding: "utf8",
    windowsHide: true,
  });
  return { stdout };
}

export function readRegistry(): Registry {
  const { stdout } = runProfileManager(["list", "--json"]);
  const parsed = JSON.parse(stdout) as Registry;
  return {
    active: parsed.active ?? null,
    profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
  };
}

/**
 * Resolve a caller-supplied profile id against the registry.
 *
 * This is the allowlist every read-only module must go through. Ids arrive from
 * URLs and query strings; matching against the set of profiles that actually
 * exist cannot be traversal-escaped the way a hand-written pattern can.
 * Returns null rather than throwing so routes can answer 404.
 */
export function resolveProfileId(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  const known = readRegistry().profiles;
  const hit = known.find((p) => p.id === candidate && !p.archived);
  return hit ? hit.id : null;
}

/** The active profile id, or null when the pointer is missing or dangling. */
export function activeProfileId(): string | null {
  const reg = readRegistry();
  if (!reg.active) return null;
  const known = reg.profiles.find((p) => p.id === reg.active);
  return known && !known.archived ? reg.active : null;
}

/**
 * Pointer-health warning, mirroring `cmd_list`'s stderr-free warnings.
 * A pointer at an archived or deleted profile is a real state the UI shows.
 */
export function pointerWarning(reg: Registry): string | null {
  if (!reg.active) {
    return "No active profile set. Create one, then switch to it.";
  }
  const hit = reg.profiles.find((p) => p.id === reg.active);
  if (!hit) {
    return `.active-profile points at '${reg.active}', which does not exist. Pick a real one.`;
  }
  if (hit.archived) {
    return `.active-profile points at '${reg.active}', which is archived. Restore it to use it.`;
  }
  return null;
}
