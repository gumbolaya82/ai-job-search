import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildEml,
  emlFilename,
  encodeHeaderValue,
  htmlFilename,
  isAscii,
  parseCandidateEmail,
  rfc5322Date,
  toBase64,
  wrapBase64,
} from "../lib/email/emlBuilder.ts";

const BASE = {
  to: "someone@example.com",
  subject: "Job Search Update — 2026-07-28 (2 new)",
  html: "<p>hi</p>",
  text: "hi",
  date: new Date("2026-07-28T19:04:11Z"),
  boundary: "----=_test_boundary",
  messageId: "<abc@ai-job-search.local>",
};

test("rfc5322Date formats in UTC", () => {
  assert.equal(rfc5322Date(new Date("2026-07-28T19:04:11Z")), "Tue, 28 Jul 2026 19:04:11 +0000");
  assert.equal(rfc5322Date(new Date("2026-01-05T00:00:00Z")), "Mon, 05 Jan 2026 00:00:00 +0000");
});

test("the subject is RFC 2047 encoded only when it is not ASCII", () => {
  assert.equal(encodeHeaderValue("Plain subject"), "Plain subject");
  assert.ok(!isAscii("Job Search Update — 1 new"));
  const encoded = encodeHeaderValue("Job Search Update — 1 new");
  assert.ok(encoded.startsWith("=?UTF-8?B?"));
  assert.ok(encoded.endsWith("?="));
  assert.equal(
    Buffer.from(encoded.slice("=?UTF-8?B?".length, -2), "base64").toString("utf8"),
    "Job Search Update — 1 new",
  );
});

test("base64 wraps at 76 columns", () => {
  const wrapped = wrapBase64(toBase64("x".repeat(500)));
  const lines = wrapped.split("\r\n");
  assert.ok(lines.length > 1);
  for (const line of lines) assert.ok(line.length <= 76, `line too long: ${line.length}`);
});

test("every line ending is CRLF and no bare LF survives", () => {
  const eml = buildEml({ ...BASE, text: "line one\nline two", html: "<p>a</p>\n<p>b</p>" });
  assert.ok(eml.includes("\r\n"));
  assert.equal(/(?<!\r)\n/.test(eml), false, "found a bare LF outside a CRLF pair");
});

test("the message is multipart/alternative with matching boundaries", () => {
  const eml = buildEml(BASE);
  assert.ok(eml.includes('Content-Type: multipart/alternative; boundary="----=_test_boundary"'));
  assert.equal(eml.split("------=_test_boundary").length - 1, 3); // two opens + the close
  assert.ok(eml.trimEnd().endsWith("------=_test_boundary--"));
  assert.ok(eml.includes("Content-Type: text/plain; charset=utf-8"));
  assert.ok(eml.includes("Content-Type: text/html; charset=utf-8"));
  assert.equal(eml.split("Content-Transfer-Encoding: base64").length - 1, 2);
});

test("From defaults to To, because this is a self-digest", () => {
  const eml = buildEml(BASE);
  assert.ok(eml.includes("From: someone@example.com"));
  assert.ok(eml.includes("To: someone@example.com"));
  assert.ok(buildEml({ ...BASE, from: "other@example.com" }).includes("From: other@example.com"));
});

test("a Danish title round-trips through the base64 body", () => {
  const html = "<td>Analytiker æøå &amp; Partner</td>";
  const eml = buildEml({ ...BASE, html });
  const htmlPart = eml.split("Content-Type: text/html; charset=utf-8")[1];
  const b64 = htmlPart.split("\r\n\r\n")[1].split("\r\n--")[0].replace(/\r\n/g, "");
  assert.equal(Buffer.from(b64, "base64").toString("utf8"), html);
});

test("headers required by the spec are all present", () => {
  const eml = buildEml(BASE);
  for (const header of ["Date:", "From:", "To:", "Subject:", "Message-ID:", "MIME-Version: 1.0"]) {
    assert.ok(eml.includes(header), `missing ${header}`);
  }
});

test("an empty recipient is allowed, not an error", () => {
  const eml = buildEml({ ...BASE, to: "" });
  assert.ok(eml.includes("To: \r\n") || eml.includes("To: "));
});

test("parseCandidateEmail reads the live profile's format", () => {
  assert.equal(parseCandidateEmail("- **Email:** a.b@example.com"), "a.b@example.com");
  assert.equal(parseCandidateEmail("Email: plain@example.org"), "plain@example.org");
  assert.equal(parseCandidateEmail("- **Phone:** 123"), null);
  assert.equal(parseCandidateEmail("- **Email:** not-an-address"), null);
});

test("the real candidate profile yields an address", () => {
  const file = path.resolve(
    import.meta.dirname,
    "..",
    "..",
    "profiles",
    "diane",
    "01-candidate-profile.md",
  );
  const email = parseCandidateEmail(fs.readFileSync(file, "utf8"));
  assert.ok(email && email.includes("@"), "expected an address in 01-candidate-profile.md");
});

test("emlFilename uses the run's date", () => {
  assert.equal(emlFilename("2026-07-28T19:04:11Z"), "job-search-2026-07-28.eml");
});

test("htmlFilename matches the eml stem, differing only in extension", () => {
  assert.equal(htmlFilename("2026-07-28T19:04:11Z"), "job-search-2026-07-28.html");
  const iso = "2026-07-28T19:04:11Z";
  assert.equal(
    emlFilename(iso).replace(/\.eml$/, ""),
    htmlFilename(iso).replace(/\.html$/, ""),
    "both downloads must share a stem so they sort together",
  );
});
