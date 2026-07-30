import test from "node:test";
import assert from "node:assert/strict";
import {
  effectiveAllowedTools,
  parseAllowedTools,
  splitToolList,
} from "../lib/runs/allowedTools.ts";

test("a comma inside parentheses does not split an entry", () => {
  assert.deepEqual(splitToolList("Read, Bash(bun run a.ts *), Write"), [
    "Read",
    "Bash(bun run a.ts *)",
    "Write",
  ]);
  assert.deepEqual(splitToolList("Bash(a, b), Read"), ["Bash(a, b)", "Read"]);
});

test("frontmatter is read from a command file, not only a SKILL.md", () => {
  const md = ["---", "allowed-tools: Read, Write, Task", "---", "", "# /rank - Triage"].join("\n");
  assert.deepEqual(parseAllowedTools(md), ["Read", "Write", "Task"]);
});

test("a file with no frontmatter is an error, never an empty allowlist", () => {
  assert.throws(() => parseAllowedTools("# /rank - Triage\n"), /no YAML frontmatter/);
});

test("AskUserQuestion is stripped and Skill is guaranteed", () => {
  assert.deepEqual(effectiveAllowedTools(["Read", "AskUserQuestion"]), ["Read", "Skill"]);
  assert.deepEqual(effectiveAllowedTools(["Read", "Skill"]), ["Read", "Skill"]);
});
