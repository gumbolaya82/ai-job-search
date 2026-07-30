import test from "node:test";
import assert from "node:assert/strict";
import { SCRAPE_PHASES, scrapeProgress } from "../lib/scrape/logFormat.ts";

/** One `assistant` log line carrying a single tool call. */
function tool(name: string, input: Record<string, unknown>): string {
  return JSON.stringify({
    type: "assistant",
    message: { content: [{ type: "tool_use", name, input }] },
  });
}

const PORTAL = tool("Bash", {
  command: "bun run .agents/skills/jobindex-search/cli/src/cli.ts search --key devops --format json",
});
const DETAIL = tool("Bash", {
  command: "bun run .agents/skills/jobindex-search/cli/src/cli.ts detail --id 6142330",
});
const SEEN = tool("Write", { file_path: "profiles/brandon/job_scraper/seen_jobs.json" });

test("no recognisable marker reports -1 rather than guessing phase one", () => {
  const setup = [
    JSON.stringify({ type: "system", subtype: "init", tools: [1, 2] }),
    tool("Read", { file_path: ".active-profile" }),
  ];
  assert.deepEqual(scrapeProgress(setup), { index: -1, label: null, finished: false });
});

test("portal CLI calls and the WebSearch fallback are phase 0", () => {
  assert.equal(scrapeProgress([PORTAL]).label, "portal queries");
  assert.equal(scrapeProgress([tool("WebSearch", { query: "site:jobnet.dk devops" })]).label,
    "portal queries");
});

test("a detail fetch advances to fit-rank", () => {
  assert.equal(scrapeProgress([PORTAL, DETAIL]).label, "fit-rank");
  assert.equal(scrapeProgress([PORTAL, tool("WebFetch", { url: "https://x/job/1" })]).label,
    "fit-rank");
});

test("writing seen_jobs.json advances to seen-diff", () => {
  const progress = scrapeProgress([PORTAL, DETAIL, SEEN]);
  assert.equal(progress.label, "seen-diff");
  assert.equal(progress.index, 2);
});

test("the Step 5 report header advances to digest", () => {
  const report = JSON.stringify({
    type: "assistant",
    message: { content: [{ type: "text", text: "## New Job Matches - 2026-07-29" }] },
  });
  assert.equal(scrapeProgress([PORTAL, SEEN, report]).label, "digest");
});

test("phases never go backwards", () => {
  // A late Read of the candidate profile is a fit-rank marker; it must not drag
  // a run that has already written seen_jobs.json back a phase.
  const late = tool("Read", { file_path: "profiles/brandon/01-candidate-profile.md" });
  assert.equal(scrapeProgress([PORTAL, SEEN, late]).label, "seen-diff");
});

test("a result event finishes the run at the last phase", () => {
  const done = JSON.stringify({ type: "result", is_error: false, duration_ms: 1000 });
  const progress = scrapeProgress([PORTAL, done]);
  assert.equal(progress.finished, true);
  assert.equal(progress.index, SCRAPE_PHASES.length - 1);
  assert.equal(progress.label, "digest");
});

test("non-JSON CLI warnings carry no phase signal", () => {
  const progress = scrapeProgress(["Ignoring 5 permissions.allow entries.", PORTAL]);
  assert.equal(progress.label, "portal queries");
});
