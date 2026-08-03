import test from "node:test";
import assert from "node:assert/strict";
import { rankEnabled } from "../lib/runs/rankEnabled.ts";

/**
 * The flag `startRank` refuses on. Tested here rather than through the action
 * itself because lib/runs/actions.ts is a "use server" module that imports
 * next/cache — nothing under test/ can load it under `node --test`.
 *
 * Every case restores the previous value, since these run in one process and
 * process.env is shared.
 */
function withEnv(value: string | undefined, body: () => void): void {
  const previous = process.env.AI_JOB_SEARCH_RANK;
  if (value === undefined) delete process.env.AI_JOB_SEARCH_RANK;
  else process.env.AI_JOB_SEARCH_RANK = value;
  try {
    body();
  } finally {
    if (previous === undefined) delete process.env.AI_JOB_SEARCH_RANK;
    else process.env.AI_JOB_SEARCH_RANK = previous;
  }
}

test("off when the variable is unset — the default a fresh checkout gets", () => {
  withEnv(undefined, () => assert.equal(rankEnabled(), false));
});

test("'1' turns it on", () => {
  withEnv("1", () => assert.equal(rankEnabled(), true));
});

test("'true' turns it on", () => {
  withEnv("true", () => assert.equal(rankEnabled(), true));
});

test("'0' leaves it off", () => {
  withEnv("0", () => assert.equal(rankEnabled(), false));
});

test("an empty value leaves it off, rather than reading as 'set'", () => {
  withEnv("", () => assert.equal(rankEnabled(), false));
});

test("an unrecognised value leaves it off — only the two opt-ins count", () => {
  withEnv("yes", () => assert.equal(rankEnabled(), false));
});

test("read at call time, so flipping the env between calls is picked up", () => {
  withEnv(undefined, () => {
    assert.equal(rankEnabled(), false);
    process.env.AI_JOB_SEARCH_RANK = "1";
    assert.equal(rankEnabled(), true);
  });
});
