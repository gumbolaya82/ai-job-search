import test from "node:test";
import assert from "node:assert/strict";
import { fuzzyRank, fuzzyScore } from "../lib/fuzzy.ts";

test("a non-subsequence does not match", () => {
  assert.equal(fuzzyScore("Senior Frontend Engineer", "zzz"), null);
  assert.equal(fuzzyScore("Jobs", "job"), 4 + 6 + 6 - 0.04);
});

test("an empty needle matches everything at zero", () => {
  assert.equal(fuzzyScore("anything", ""), 0);
});

test("initials reach a multi-word title", () => {
  assert.notEqual(fuzzyScore("Senior Frontend Engineer", "sfe"), null);
});

test("contiguous beats scattered", () => {
  const contiguous = fuzzyScore("scrape brandon", "scrape")!;
  const scattered = fuzzyScore("switch active profile to casey", "scrape")!;
  assert.ok(contiguous > scattered, `${contiguous} should beat ${scattered}`);
});

test("shorter haystacks win ties", () => {
  assert.ok(fuzzyScore("Jobs", "jobs")! > fuzzyScore("Jobs archive listing", "jobs")!);
});

test("fuzzyRank drops non-matches, orders by score and honours the limit", () => {
  const items = ["Go to Jobs", "Go to Scrape", "Go to Profiles", "Go to Documents"];
  assert.deepEqual(fuzzyRank(items, "zzz", (s) => s), []);
  assert.deepEqual(fuzzyRank(items, "jobs", (s) => s), ["Go to Jobs"]);
  assert.equal(fuzzyRank(items, "", (s) => s, 2).length, 2);
});
