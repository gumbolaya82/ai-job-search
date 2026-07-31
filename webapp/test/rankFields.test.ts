import test from "node:test";
import assert from "node:assert/strict";
import { parseRankFields } from "../lib/jobsTimeline.ts";

test("a ranked posting yields its score, verdict, deadline and location", () => {
  const parsed = parseRankFields({
    status: "ranked",
    rank_score: 78,
    rank_verdict: "Strong Fit",
    rank_date: "2026-07-30",
    location: "Chicago, IL (hybrid)",
    deadline: "2026-08-04",
  });
  assert.equal(parsed.rankScore, 78);
  assert.equal(parsed.rankVerdict, "Strong Fit");
  assert.equal(parsed.deadline, "2026-08-04");
  assert.equal(parsed.location, "Chicago, IL (hybrid)");
  assert.equal(parsed.expired, false);
});

test("an unranked posting yields nulls, not zeros", () => {
  const parsed = parseRankFields({ status: "new" });
  assert.equal(parsed.rankScore, null);
  assert.equal(parsed.rankVerdict, null);
  assert.equal(parsed.deadline, null);
  assert.equal(parsed.location, "");
});

test("a non-numeric score is null, never NaN", () => {
  assert.equal(parseRankFields({ rank_score: "78" as never }).rankScore, null);
  assert.equal(parseRankFields({ rank_score: Number.NaN }).rankScore, null);
});

test("expired is derived from the scraper status", () => {
  assert.equal(parseRankFields({ status: "expired" }).expired, true);
  assert.equal(parseRankFields({ status: "ranked" }).expired, false);
});

test("a location veto parses to its verdict string, and is null when absent", () => {
  assert.equal(parseRankFields({ location_verdict: "FAIL" }).locationVerdict, "FAIL");
  assert.equal(parseRankFields({}).locationVerdict, null);
});
