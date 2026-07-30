import fs from "node:fs";
import path from "node:path";

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

/**
 * Split a comma-separated tool list without splitting inside parentheses.
 *
 * No entry contains a comma inside its parens today (`Bash(bun run … *)` is the
 * closest), but a portal skill gaining `Bash(a, b)` must not silently produce
 * two broken half-entries.
 */
export function splitToolList(raw: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of raw) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** Pull the `allowed-tools:` entry out of a SKILL.md's YAML frontmatter. */
export function parseAllowedTools(skillMd: string): string[] {
  const normalised = skillMd.replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---/.exec(normalised);
  if (!match) {
    throw new Error("SKILL.md has no YAML frontmatter, so its allowlist cannot be read.");
  }
  const line = match[1].split("\n").find((l) => l.startsWith("allowed-tools:"));
  if (!line) {
    throw new Error("SKILL.md frontmatter has no allowed-tools: line.");
  }
  return splitToolList(line.slice("allowed-tools:".length));
}

export function skillMdPath(root: string): string {
  return path.join(root, ...SKILL_MD_PARTS);
}

/**
 * The allowlist actually handed to `claude`, derived from the skill at runtime.
 *
 * Read from the file rather than hardcoded: if the skill gains or loses a tool,
 * the button follows automatically instead of drifting.
 *
 * Two deliberate deltas from the frontmatter:
 *   + `Skill` — the frontmatter lists what the skill *uses*, not what invokes
 *     it. The spike showed `/job-scraper` expanding directly without the Skill
 *     tool, so this is insurance against the invocation form changing, not a
 *     requirement.
 *   - `AskUserQuestion` — there is nobody to answer it in a headless run. Left
 *     in, the agent can burn a turn on a question that can never be resolved.
 */
export function effectiveAllowedTools(frontmatterTools: string[]): string[] {
  const kept = frontmatterTools.filter((t) => t !== "AskUserQuestion");
  return kept.includes("Skill") ? kept : [...kept, "Skill"];
}

export function readAllowedTools(root: string): string[] {
  return effectiveAllowedTools(parseAllowedTools(fs.readFileSync(skillMdPath(root), "utf8")));
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
