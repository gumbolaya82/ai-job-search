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
