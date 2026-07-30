import fs from "node:fs";

/**
 * The allowlist parser, lifted out of lib/scrape/claudeCli.ts.
 *
 * It started life scrape-only, but /rank and /apply both drive headless
 * `claude` too and need the same YAML-frontmatter allowlist parsing. Only one
 * of the three commands is the scrape skill, so the parser belongs here
 * rather than under lib/scrape/.
 */

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

/** The allowlist a command or skill file declares, ready to hand to `claude`. */
export function readAllowedToolsFrom(filePath: string): string[] {
  return effectiveAllowedTools(parseAllowedTools(fs.readFileSync(filePath, "utf8")));
}
