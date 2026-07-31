import test from "node:test";
import assert from "node:assert/strict";
import { buildRankPrompt } from "../lib/runs/commandSpec.ts";

test("rank takes no arguments — the command defaults to every new posting", () => {
  assert.equal(buildRankPrompt(), "/rank");
});
