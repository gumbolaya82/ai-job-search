import test from "node:test";
import assert from "node:assert/strict";
import {
  addedKeys,
  filterRowsByKey,
  parseSeenFile,
  seenKeys,
  timelineKeysForAdded,
} from "../lib/scrape/seenDiff.ts";

const BEFORE = {
  seen: {
    "https://example.com/a": { title: "A", url: "https://example.com/a" },
  },
};

const AFTER = {
  seen: {
    "https://example.com/a": { title: "A", url: "https://example.com/a" },
    "https://example.com/b": { title: "B", url: "https://example.com/b" },
    "acme::analyst": { title: "C", company: "Acme", url: "https://example.com/c" },
    "no-url-entry": { title: "D" },
  },
};

test("seenKeys tolerates a missing or malformed seen map", () => {
  assert.deepEqual(seenKeys(null), []);
  assert.deepEqual(seenKeys({}), []);
  assert.deepEqual(seenKeys({ seen: {} }), []);
  assert.deepEqual(seenKeys(BEFORE), ["https://example.com/a"]);
});

test("parseSeenFile returns an empty object rather than throwing", () => {
  assert.deepEqual(parseSeenFile("{ not json"), {});
  assert.deepEqual(parseSeenFile("null"), {});
  assert.deepEqual(parseSeenFile(JSON.stringify(BEFORE)), BEFORE);
});

test("addedKeys returns only what the run introduced", () => {
  assert.deepEqual(addedKeys(seenKeys(BEFORE), seenKeys(AFTER)), [
    "https://example.com/b",
    "acme::analyst",
    "no-url-entry",
  ]);
});

test("an absent seen_jobs.json beforehand makes everything new", () => {
  assert.deepEqual(addedKeys([], seenKeys(AFTER)).length, 4);
});

test("timeline keys join through the entry's url, not the map key", () => {
  const added = addedKeys(seenKeys(BEFORE), seenKeys(AFTER));
  const keys = timelineKeysForAdded("diane", added, AFTER);
  // "acme::analyst" is a company/title key whose entry still carries a url.
  assert.ok(keys.has("diane:https://example.com/c"));
  assert.ok(keys.has("diane:https://example.com/b"));
  // The url-less entry cannot be matched and is dropped.
  assert.equal(keys.size, 2);
});

test("filterRowsByKey narrows a timeline to this run's rows", () => {
  const rows = [
    { key: "diane:https://example.com/a", title: "A" },
    { key: "diane:https://example.com/b", title: "B" },
    { key: "diane:https://example.com/c", title: "C" },
  ];
  const keys = timelineKeysForAdded("diane", addedKeys(seenKeys(BEFORE), seenKeys(AFTER)), AFTER);
  assert.deepEqual(
    filterRowsByKey(rows, keys).map((r) => r.title),
    ["B", "C"],
  );
});

test("a run that added nothing yields no rows", () => {
  const keys = timelineKeysForAdded("diane", addedKeys(seenKeys(AFTER), seenKeys(AFTER)), AFTER);
  assert.equal(keys.size, 0);
  assert.deepEqual(filterRowsByKey([{ key: "diane:x" }], keys), []);
});
