import { contentBlocks, toolDetail, type StreamEvent } from "../scrape/logFormat.ts";

/**
 * How far a headless `claude` run has got, from its raw stream-json log lines.
 *
 * `/scrape` was the first command to need this; `/rank` and `/apply` want the
 * same treatment with their own phase lists and their own way of classifying a
 * tool call, so the derivation lives here parameterised by a `PhaseSet` instead
 * of being scrape-specific.
 */

/**
 * A command's phase list plus how to recognise which phase a log line belongs
 * to. Phase derivation in this codebase is a classifier over `(toolName,
 * detail)` returning an index — not a regex per label — because a single tool
 * call (e.g. Write) means different things depending on what it's writing.
 */
export type PhaseSet = {
  labels: readonly string[];
  /** Which phase a tool call belongs to, or -1 for one that belongs to none. */
  classify: (toolName: string, detail: string) => number;
  /** Optional: a phase signalled by assistant prose rather than a tool call. */
  fromText?: (text: string) => number;
};

export type PhaseProgress = {
  /** Index into phases.labels, or -1 before the first recognisable marker. */
  index: number;
  label: string | null;
  /** True once the log carries its `result` event. */
  finished: boolean;
};

/**
 * How far a run has got, from its raw log lines.
 *
 * Monotonic by construction: phases only ever advance, so one late Read of a
 * profile doc cannot drag a finished run back to fit-rank. A run that produced
 * no recognisable marker yet reports index -1 rather than guessing phase 0 —
 * the first thirty seconds are session setup, and claiming progress there would
 * be a lie the progress bar cannot take back.
 */
export function runProgress(lines: string[], phases: PhaseSet): PhaseProgress {
  let index = -1;
  let finished = false;

  for (const line of lines) {
    let event: StreamEvent;
    try {
      event = JSON.parse(line.trim()) as StreamEvent;
    } catch {
      continue; // Plain-text CLI warnings carry no phase signal.
    }

    if (event.type === "result") {
      finished = true;
      continue;
    }

    if (event.type !== "assistant") continue;

    for (const block of contentBlocks(event)) {
      if (block.type === "tool_use") {
        const at = phases.classify(String(block.name ?? ""), toolDetail(block.input));
        if (at > index) index = at;
      } else if (block.type === "text" && typeof block.text === "string") {
        const at = phases.fromText?.(block.text) ?? -1;
        if (at > index) index = at;
      }
    }
  }

  if (finished) index = phases.labels.length - 1;
  return { index, label: index >= 0 ? phases.labels[index] : null, finished };
}
