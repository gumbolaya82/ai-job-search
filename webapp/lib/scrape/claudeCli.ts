import path from "node:path";
import { readAllowedToolsFrom } from "../runs/allowedTools.ts";

// Moved to lib/runs/allowedTools.ts once /rank and /apply also needed them.
// Re-exported here because this module's public surface is what test/claudeCli.test.ts
// and runner.ts already import.
export {
  effectiveAllowedTools,
  parseAllowedTools,
  splitToolList,
} from "../runs/allowedTools.ts";

/**
 * Argv construction for driving the job-scraper skill through headless Claude.
 *
 * Everything here is pure string work with one filesystem read, so it can be
 * unit-tested without spawning anything. `runner.ts` owns the spawning, and
 * passes the repo root in rather than this module importing `repoRoot()` — that
 * keeps the module free of filesystem-walking imports so `node --test` can load
 * it directly.
 *
 * The findings below came from a hand-run spike (2026-07-28) and are the reason
 * several of these choices look odd:
 *
 *   - The skill is invoked as `/job-scraper`, NOT `/scrape`. Claude Code
 *     registers a skill under its *directory* name; the `name: scrape` in the
 *     frontmatter is not what the slash command resolves to.
 *   - Tools outside the allowlist are denied cleanly and the agent adapts. The
 *     spike saw `PowerShell`, `python3` and heredocs all refused with the run
 *     still finishing at exit 0, which is the containment this design wants.
 *   - The run does NOT release `profiles/<id>/.lock`. Its own `rm` was blocked
 *     by Claude Code's workspace-trust sandbox. `runner.ts` therefore clears the
 *     lock itself once the process exits.
 */

/** The claude executable. Overridable the same way `PYTHON` is in profileRegistry.ts. */
export const CLAUDE = process.env.AI_JOB_SEARCH_CLAUDE ?? "claude";

/** Skills resolve by directory name — see the spike note above. */
export const SCRAPE_COMMAND = "/job-scraper";

export const SKILL_MD_PARTS = [".claude", "skills", "job-scraper", "SKILL.md"] as const;

export const MAX_FOCUS_LENGTH = 60;

export class FocusError extends Error {}

export function skillMdPath(root: string): string {
  return path.join(root, ...SKILL_MD_PARTS);
}

export function readAllowedTools(root: string): string[] {
  return readAllowedToolsFrom(skillMdPath(root));
}

/**
 * Validate a user-supplied focus string.
 *
 * It reaches an argv element, not a shell — `spawn` with an array is not
 * shell-injectable, which is why the space in "Claude VSCode" needs no quoting
 * anywhere in this codebase. But it is also concatenated into a prompt handed to
 * an agent holding Write access to a repo containing a real person's CV and
 * address, so it is treated as untrusted: a narrow character class, a length
 * cap, and a visible rejection rather than a silent rewrite.
 */
export function sanitiseFocus(raw: string | null | undefined): string {
  const focus = (raw ?? "").trim();
  if (!focus) return "";
  if (focus.length > MAX_FOCUS_LENGTH) {
    throw new FocusError(
      `Focus is ${focus.length} characters; the limit is ${MAX_FOCUS_LENGTH}.`,
    );
  }
  if (!/^[A-Za-z0-9 -]+$/.test(focus)) {
    throw new FocusError(
      "Focus may contain only letters, digits, spaces and hyphens.",
    );
  }
  return focus;
}

export type ScrapeArgs = { focus?: string | null; broad?: boolean };

/**
 * The prompt text, per the skill's own Invocation section: an optional focus
 * area and the literal word `broad` are appended to the command.
 */
export function buildScrapePrompt({ focus, broad }: ScrapeArgs): string {
  const parts = [SCRAPE_COMMAND];
  if (broad) parts.push("broad");
  const clean = sanitiseFocus(focus);
  if (clean) parts.push(clean);
  return parts.join(" ");
}

export type ArgvOptions = ScrapeArgs & { allowedTools: string[] };

/**
 * Full argv for `claude`.
 *
 * `--output-format stream-json --verbose` is what makes the log tail useful:
 * plain text mode writes nothing until the run ends, so a watcher would stare at
 * an empty file for four minutes. `runStore.describeLogLines` turns the JSONL
 * back into readable one-liners for the UI.
 */
export function buildScrapeArgv({ focus, broad, allowedTools }: ArgvOptions): string[] {
  return [
    "-p",
    buildScrapePrompt({ focus, broad }),
    "--allowedTools",
    allowedTools.join(","),
    "--output-format",
    "stream-json",
    "--verbose",
  ];
}
