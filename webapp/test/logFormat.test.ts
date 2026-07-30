import test from "node:test";
import assert from "node:assert/strict";
import {
  describeLogLine,
  describeLogLines,
  finalResultCost,
  finalResultText,
} from "../lib/scrape/logFormat.ts";

const toolUse = JSON.stringify({
  type: "assistant",
  message: {
    content: [
      { type: "text", text: "Reading active profile." },
      { type: "tool_use", name: "Read", input: { file_path: "profiles/diane/search-queries.md" } },
    ],
  },
});

test("assistant events yield one line per text block and tool call", () => {
  assert.deepEqual(describeLogLine(toolUse), [
    "  Reading active profile.",
    "» Read profiles/diane/search-queries.md",
  ]);
});

test("only failed tool results are surfaced", () => {
  const ok = JSON.stringify({
    type: "user",
    message: { content: [{ type: "tool_result", content: "1.3.14" }] },
  });
  const bad = JSON.stringify({
    type: "user",
    message: { content: [{ type: "tool_result", is_error: true, content: "rm was blocked." }] },
  });
  assert.deepEqual(describeLogLine(ok), []);
  assert.deepEqual(describeLogLine(bad), ["✗ rm was blocked."]);
});

test("hook and thinking noise is dropped, init is kept", () => {
  assert.deepEqual(describeLogLine(JSON.stringify({ type: "system", subtype: "hook_started" })), []);
  assert.deepEqual(
    describeLogLine(JSON.stringify({ type: "system", subtype: "thinking_tokens" })),
    [],
  );
  assert.deepEqual(
    describeLogLine(JSON.stringify({ type: "system", subtype: "init", tools: [1, 2, 3] })),
    ["· session started (3 tools)"],
  );
});

test("the result event reports duration, turns and cost", () => {
  const line = JSON.stringify({
    type: "result",
    is_error: false,
    duration_ms: 231353,
    num_turns: 28,
    total_cost_usd: 0.3921045,
  });
  assert.deepEqual(describeLogLine(line), ["· finished · 231s · 28 turns · $0.392"]);
});

test("non-JSON CLI warnings pass through verbatim", () => {
  const warning = "Ignoring 5 permissions.allow entries: this workspace has not been trusted.";
  assert.deepEqual(describeLogLine(warning), [warning]);
});

test("blank lines produce nothing", () => {
  assert.deepEqual(describeLogLines(["", "   "]), []);
});

test("long tool detail is clipped", () => {
  const long = JSON.stringify({
    type: "assistant",
    message: { content: [{ type: "tool_use", name: "Bash", input: { command: "x".repeat(400) } }] },
  });
  const [line] = describeLogLine(long);
  assert.ok(line.length < 200);
  assert.ok(line.endsWith("…"));
});

test("finalResultText finds the agent's answer, scanning backwards", () => {
  const lines = [
    JSON.stringify({ type: "assistant", message: { content: [] } }),
    JSON.stringify({ type: "result", result: "Found 28 new positions." }),
  ];
  assert.equal(finalResultText(lines), "Found 28 new positions.");
  assert.equal(finalResultText(["not json"]), null);
});

test("finalResultCost finds the run's cost, scanning backwards", () => {
  const lines = [
    JSON.stringify({ type: "assistant", message: { content: [] } }),
    JSON.stringify({ type: "result", result: "done", total_cost_usd: 0.3921045 }),
  ];
  assert.equal(finalResultCost(lines), 0.3921045);
  assert.equal(finalResultCost(["not json"]), null);
  assert.equal(finalResultCost([JSON.stringify({ type: "result", result: "done" })]), null);
});
