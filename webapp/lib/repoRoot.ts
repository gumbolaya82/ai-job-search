import path from "node:path";
import fs from "node:fs";

/**
 * The single place a repo path is constructed.
 *
 * Everything else in `lib/` asks for paths here rather than joining strings of
 * its own, so there is exactly one function to audit when the question is
 * "can this read outside the repo?".
 */

/** Absolute path to the repo root (the directory holding `.active-profile`). */
export function repoRoot(): string {
  // `next dev` / `next build` run with cwd = webapp/, but a test or a script may
  // not. Walk up until we find the marker files rather than assuming a depth.
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    const hasTools = fs.existsSync(path.join(dir, "tools", "profile_manager.py"));
    const hasProfiles = fs.existsSync(path.join(dir, "profiles"));
    if (hasTools && hasProfiles) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    "Could not locate the ai-job-search repo root (looked for tools/profile_manager.py " +
      `and profiles/ walking up from ${process.cwd()}). Run the webapp from inside the repo.`,
  );
}

export function profilesDir(): string {
  return path.join(repoRoot(), "profiles");
}

/**
 * Resolve a path inside `profiles/<id>/` and prove it stayed there.
 *
 * The containment check is deliberately belt-and-braces: callers are already
 * required to pass an id that came from the registry allowlist, but a relative
 * segment inside `rest` would otherwise escape just as effectively as a bad id.
 */
export function profilePath(profileId: string, ...rest: string[]): string {
  const base = path.join(profilesDir(), profileId);
  const full = path.resolve(base, ...rest);
  const root = path.resolve(profilesDir());
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error(`Refusing to read outside profiles/: ${full}`);
  }
  return full;
}
