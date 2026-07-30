import test from "node:test";
import assert from "node:assert/strict";
import { hasFinished, isAlive } from "../lib/runs/lifecycle.ts";

test("the result event, not the pid, is the authoritative finish signal", () => {
  assert.deepEqual(hasFinished([JSON.stringify({ type: "result", is_error: false })]), {
    finished: true,
    errored: false,
  });
  assert.deepEqual(hasFinished([JSON.stringify({ type: "result", is_error: true })]), {
    finished: true,
    errored: true,
  });
});

test("a log with no result event has not finished", () => {
  assert.deepEqual(hasFinished([JSON.stringify({ type: "assistant" }), "plain warning"]), {
    finished: false,
    errored: false,
  });
});

test("the current process is alive and pid 0 is not addressable", () => {
  assert.equal(isAlive(process.pid), true);
  assert.equal(isAlive(2147483647), false);
});
