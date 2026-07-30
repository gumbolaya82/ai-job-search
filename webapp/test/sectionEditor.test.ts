import test from "node:test";
import assert from "node:assert/strict";
import {
  MarkerError,
  beginMarker,
  endMarker,
  readMarkedSection,
  replaceMarkedSection,
} from "../lib/markdown/sectionEditor.ts";

const doc = [
  "# Profile",
  "",
  "Intro text that must survive.",
  "",
  beginMarker("PROFILE-EXTENSION-POINT"),
  "old content",
  endMarker("PROFILE-EXTENSION-POINT"),
  "",
  "Trailing text that must survive.",
  "",
].join("\n");

test("replaces only the marked span", () => {
  const out = replaceMarkedSection(doc, "PROFILE-EXTENSION-POINT", "new content");
  assert.match(out, /Intro text that must survive\./);
  assert.match(out, /Trailing text that must survive\./);
  assert.match(out, /new content/);
  assert.doesNotMatch(out, /old content/);
});

test("keeps both markers in place", () => {
  const out = replaceMarkedSection(doc, "PROFILE-EXTENSION-POINT", "new content");
  assert.match(out, /<!-- BEGIN PROFILE-EXTENSION-POINT -->/);
  assert.match(out, /<!-- END PROFILE-EXTENSION-POINT -->/);
});

test("round-trips through readMarkedSection", () => {
  const out = replaceMarkedSection(doc, "PROFILE-EXTENSION-POINT", "line one\nline two");
  assert.equal(readMarkedSection(out, "PROFILE-EXTENSION-POINT"), "line one\nline two");
});

test("is idempotent when writing the same content twice", () => {
  const once = replaceMarkedSection(doc, "PROFILE-EXTENSION-POINT", "stable");
  const twice = replaceMarkedSection(once, "PROFILE-EXTENSION-POINT", "stable");
  assert.equal(once, twice);
});

test("accepts empty replacement content", () => {
  const out = replaceMarkedSection(doc, "PROFILE-EXTENSION-POINT", "");
  assert.equal(readMarkedSection(out, "PROFILE-EXTENSION-POINT"), "");
  assert.match(out, /Trailing text that must survive\./);
});

test("throws when the BEGIN marker is missing", () => {
  assert.throws(
    () => replaceMarkedSection("# no markers here\n", "PROFILE-EXTENSION-POINT", "x"),
    (err: unknown) => err instanceof MarkerError && /Missing marker/.test((err as Error).message),
  );
});

test("throws when only the END marker is missing", () => {
  const half = `${beginMarker("STAR:1")}\nbody\n`;
  assert.throws(() => replaceMarkedSection(half, "STAR:1", "x"), MarkerError);
});

test("throws on a duplicated marker name", () => {
  const dup = [
    beginMarker("TEMPLATE:banking"),
    "one",
    endMarker("TEMPLATE:banking"),
    beginMarker("TEMPLATE:banking"),
    "two",
    endMarker("TEMPLATE:banking"),
  ].join("\n");
  assert.throws(
    () => replaceMarkedSection(dup, "TEMPLATE:banking", "x"),
    (err: unknown) => err instanceof MarkerError && /Duplicate marker/.test((err as Error).message),
  );
});

test("throws when END precedes BEGIN", () => {
  const inverted = [endMarker("STAR:2"), "body", beginMarker("STAR:2")].join("\n");
  assert.throws(
    () => replaceMarkedSection(inverted, "STAR:2", "x"),
    (err: unknown) => err instanceof MarkerError && /Unbalanced/.test((err as Error).message),
  );
});

test("a nested inner marker is left untouched by an outer edit", () => {
  const nested = [
    beginMarker("OUTER"),
    beginMarker("INNER"),
    "inner body",
    endMarker("INNER"),
    endMarker("OUTER"),
  ].join("\n");
  const out = replaceMarkedSection(nested, "INNER", "replaced inner");
  assert.match(out, /<!-- BEGIN OUTER -->/);
  assert.match(out, /replaced inner/);
  assert.equal(readMarkedSection(out, "OUTER"), [
    beginMarker("INNER"),
    "replaced inner",
    endMarker("INNER"),
  ].join("\n"));
});

test("rejects an empty marker name", () => {
  assert.throws(() => replaceMarkedSection(doc, "   ", "x"), MarkerError);
});

test("preserves CRLF line endings rather than imposing LF", () => {
  const crlf = doc.replace(/\n/g, "\r\n");
  const out = replaceMarkedSection(crlf, "PROFILE-EXTENSION-POINT", "new one\nnew two");
  assert.doesNotMatch(out.replace(/\r\n/g, ""), /\n/, "no bare LF should survive in a CRLF file");
  assert.match(out, /new one\r\nnew two/);
});

test("preserves LF line endings in an LF file", () => {
  const out = replaceMarkedSection(doc, "PROFILE-EXTENSION-POINT", "a\nb");
  assert.doesNotMatch(out, /\r/);
});

test("content containing marker-like text does not corrupt the parse", () => {
  const out = replaceMarkedSection(
    doc,
    "PROFILE-EXTENSION-POINT",
    "discussing <!-- BEGIN SOMETHING-ELSE --> in prose",
  );
  assert.equal(
    readMarkedSection(out, "PROFILE-EXTENSION-POINT"),
    "discussing <!-- BEGIN SOMETHING-ELSE --> in prose",
  );
});
