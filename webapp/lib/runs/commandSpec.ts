// Explicit `.ts` extensions: like the rest of lib/runs/, this module is meant
// to be exercised by `node --test` as well as by the bundler, and Node's
// resolver does not guess extensions.
import type { CommandId, RunRecord, RunStorage } from "./runStore.ts";
import type { PhaseSet } from "./progress.ts";

/**
 * `CommandSpec` is the whole of the per-command surface: what `/scrape`,
 * `/rank` and `/apply` each supply so `lib/runs/` can start, watch and finish
 * any of them the same way.
 */
export type CommandSpec<A> = {
  id: CommandId;
  storage: RunStorage; // e.g. { subdir: "apply-runs", logName: "apply.log" }
  buildPrompt: (args: A) => string;
  /** Where the allowlist is read from at runtime, never hardcoded. */
  allowlist: { kind: "skill" | "command"; parts: readonly string[] };
  phases: PhaseSet;
  /** Command-specific work at every terminal path. */
  finalise: (run: RunRecord, lines: string[]) => RunRecord;
};

/**
 * Full argv for `claude`, shared by every command.
 *
 * `--output-format stream-json --verbose` is what makes the log tail useful:
 * plain text mode writes nothing until the run ends, so a watcher would stare
 * at an empty file for however long the run takes.
 */
export function buildArgv(prompt: string, allowedTools: string[]): string[] {
  return [
    "-p",
    prompt,
    "--allowedTools",
    allowedTools.join(","),
    "--output-format",
    "stream-json",
    "--verbose",
  ];
}

/**
 * `/rank`'s four observable phases, in the order `.claude/commands/rank.md`
 * performs them: load state, batch-score postings, aggregate the shortlist,
 * write the results back into `seen_jobs.json`.
 */
export const RANK_PHASES: PhaseSet = {
  labels: ["read seen_jobs", "score postings", "aggregate and rank", "update state"],
  classify: (name, detail) => {
    const n = name.toLowerCase();
    const d = detail.toLowerCase();
    if (/^(write|edit|multiedit)$/.test(n) && d.includes("seen_jobs.json")) return 3;
    if (n === "webfetch" || n === "task" || n === "agent") return 1;
    if (/^read$/.test(n) && d.includes("seen_jobs.json")) return 0;
    if (/^read$/.test(n) && /job.evaluation|candidate-profile/.test(d)) return 0;
    return -1;
  },
  fromText: (text) => (/job ranking\s*-|shortlist/i.test(text) ? 2 : -1),
};

/** `/rank` takes no arguments — Step 0 of the command defaults to every `new` posting. */
export function buildRankPrompt(): string {
  return "/rank";
}
