import test from "node:test";
import assert from "node:assert/strict";
import {
  digestSubject,
  escapeHtml,
  renderDigest,
  renderDigestText,
  sortForDigest,
} from "../lib/email/digestHtml.ts";
import type { TimelineRow } from "../lib/jobsTimeline.ts";

function job(over: Partial<TimelineRow>): TimelineRow {
  return {
    key: "diane:https://example.com/x",
    profile: "diane",
    title: "Recruiter",
    company: "Acme",
    url: "https://example.com/x",
    firstSeen: "2026-07-28",
    fit: "medium",
    seenStatus: "new",
    outcome: null,
    outcomeNotes: "",
    ...over,
  };
}

const META = { profile: "diane", startedAt: "2026-07-28T19:04:11Z" };

test("escapeHtml covers the five dangerous characters", () => {
  assert.equal(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
  assert.equal(escapeHtml(null), "");
});

test("company and title from a posting are escaped, not injected", () => {
  const html = renderDigest(
    [job({ company: 'Ben & Jerry\'s <script>alert("x")</script>', title: "A & B" })],
    META,
  );
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("Ben &amp; Jerry&#39;s &lt;script&gt;"));
  assert.ok(html.includes("A &amp; B"));
});

test("rows are ordered high fit first", () => {
  const rows = [job({ fit: "low", title: "L" }), job({ fit: "high", title: "H" }), job({ fit: "medium", title: "M" })];
  assert.deepEqual(
    sortForDigest(rows).map((r) => r.title),
    ["H", "M", "L"],
  );
  const html = renderDigest(rows, META);
  assert.ok(html.indexOf(">H<") < html.indexOf(">M<"));
  assert.ok(html.indexOf(">M<") < html.indexOf(">L<"));
});

test("zero jobs renders a document, never an error", () => {
  const html = renderDigest([], META);
  assert.ok(html.includes("No new jobs in this run."));
  assert.ok(!html.includes("<table"));
  assert.ok(html.startsWith("<!DOCTYPE html>"));
});

test("styles are inline and colours are literal hex", () => {
  const html = renderDigest([job({ fit: "high" })], META);
  assert.ok(!/<style[\s>]/.test(html), "a <style> block would be stripped by mail clients");
  assert.ok(!html.includes("var(--"), "CSS custom properties do not resolve in mail clients");
  assert.ok(html.includes("#22c55e"));
  assert.ok(html.includes("#2452eb"));
});

test("layout is table-based, not flex or grid", () => {
  const html = renderDigest([job({})], META);
  assert.ok(html.includes("<table"));
  assert.ok(!html.includes("display:flex"));
  assert.ok(!html.includes("display:grid"));
});

test("non-http urls never become anchors", () => {
  const html = renderDigest([job({ url: "javascript:alert(1)" })], META);
  assert.ok(!html.includes("javascript:"));
  assert.ok(html.includes("no link"));
});

test("the subject carries the date and the count", () => {
  assert.equal(digestSubject([job({}), job({})], META), "Job Search Update — 2026-07-28 (2 new)");
  assert.equal(digestSubject([], META), "Job Search Update — 2026-07-28 (0 new)");
});

test("the text alternative mirrors the html content", () => {
  const text = renderDigestText([job({ fit: "high", title: "Analytiker æøå" })], META);
  assert.ok(text.includes("[High] Analytiker æøå — Acme"));
  assert.ok(text.includes("https://example.com/x"));
  assert.ok(!text.includes("<"));
  assert.ok(renderDigestText([], META).includes("No new jobs in this run."));
});

test("focus and broad appear in the header when set", () => {
  const html = renderDigest([job({})], { ...META, focus: "recruiting", broad: true });
  assert.ok(html.includes("broad"));
  assert.ok(html.includes("focus: recruiting"));
});
