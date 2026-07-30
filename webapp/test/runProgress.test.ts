import test from "node:test";
import assert from "node:assert/strict";
import { runProgress, type PhaseSet } from "../lib/runs/progress.ts";

const PHASES: PhaseSet = {
  labels: ["first", "second", "third"],
  classify: (name, detail) => {
    if (name === "Write" && detail.includes("out.json")) return 2;
    if (name === "WebFetch") return 1;
    if (name === "Read") return 0;
    return -1;
  },
  fromText: (text) => (/all done/i.test(text) ? 2 : -1),
};

function toolUse(name: string, input: Record<string, unknown>): string {
  return JSON.stringify({
    type: "assistant",
    message: { content: [{ type: "tool_use", name, input }] },
  });
}

test("no recognisable marker reports -1, never a guessed phase 0", () => {
  const p = runProgress([toolUse("Glob", { pattern: "*.ts" })], PHASES);
  assert.deepEqual(p, { index: -1, label: null, finished: false });
});

test("phases advance and never regress", () => {
  const lines = [
    toolUse("Read", { file_path: "a.md" }),
    toolUse("WebFetch", { url: "https://x/1" }),
    toolUse("Read", { file_path: "b.md" }),
  ];
  assert.equal(runProgress(lines, PHASES).index, 1);
  assert.equal(runProgress(lines, PHASES).label, "second");
});

test("a prose marker can advance the phase", () => {
  const line = JSON.stringify({
    type: "assistant",
    message: { content: [{ type: "text", text: "All done — 4 files written" }] },
  });
  assert.equal(runProgress([line], PHASES).index, 2);
});

test("the result event finishes the run at the last phase", () => {
  const lines = [toolUse("Read", { file_path: "a.md" }), JSON.stringify({ type: "result" })];
  const p = runProgress(lines, PHASES);
  assert.equal(p.finished, true);
  assert.equal(p.index, 2);
});

test("plain-text CLI warnings carry no phase signal and do not throw", () => {
  const p = runProgress(["Warning: workspace trust prompt skipped"], PHASES);
  assert.deepEqual(p, { index: -1, label: null, finished: false });
});
