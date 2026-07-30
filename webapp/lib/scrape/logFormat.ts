/**
 * Turn `claude --output-format stream-json` lines into something a human can
 * watch scroll past.
 *
 * The raw log is one JSON object per line and is mostly noise — hook lifecycle
 * events, thinking-token accounting, the 53-tool init payload. Showing it raw in
 * the UI would be unreadable, and showing nothing until the run ends defeats the
 * point of a log tail. So this module keeps the handful of event types that say
 * what the agent is actually doing.
 *
 * Pure string work, no imports: it is unit-testable and safe to call from either
 * side of the server/client boundary.
 */

export type StreamEvent = {
  type?: string;
  subtype?: string;
  message?: { content?: unknown };
  tools?: unknown[];
  duration_ms?: number;
  total_cost_usd?: number;
  num_turns?: number;
  is_error?: boolean;
  result?: unknown;
};

const MAX_DETAIL = 150;

function clip(s: string, max = MAX_DETAIL): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** The most identifying field of a tool call, so the line reads like an action. */
function toolDetail(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const o = input as Record<string, unknown>;
  for (const key of ["command", "file_path", "pattern", "url", "query", "prompt"]) {
    const v = o[key];
    if (typeof v === "string" && v) return clip(v);
  }
  return clip(JSON.stringify(o));
}

function contentBlocks(event: StreamEvent): Record<string, unknown>[] {
  const raw = event.message?.content;
  return Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
}

/**
 * One log line -> zero or more display lines.
 *
 * Returns an array because a single assistant message can carry several tool
 * calls, and a line that is not JSON at all (the CLI prints plain-text warnings
 * such as the workspace-trust notice) is passed through verbatim — those
 * warnings are exactly what someone debugging a stuck run needs to see.
 */
export function describeLogLine(line: string): string[] {
  const trimmed = line.replace(/^﻿/, "").trim();
  if (!trimmed) return [];

  let event: StreamEvent;
  try {
    event = JSON.parse(trimmed) as StreamEvent;
  } catch {
    return [clip(trimmed, 300)];
  }

  switch (event.type) {
    case "system":
      // init is the one system event worth surfacing; hook_* and thinking_tokens
      // fire dozens of times and say nothing about progress.
      return event.subtype === "init" ? [`· session started (${event.tools?.length ?? 0} tools)`] : [];

    case "assistant":
      return contentBlocks(event).flatMap((block) => {
        if (block.type === "tool_use") {
          return [`» ${String(block.name)} ${toolDetail(block.input)}`.trimEnd()];
        }
        if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
          return [`  ${clip(block.text, 300)}`];
        }
        return [];
      });

    case "user":
      // Only failures. Successful tool results are the bulk of the log's volume
      // and repeat what the » line already said.
      return contentBlocks(event).flatMap((block) => {
        if (block.type !== "tool_result" || !block.is_error) return [];
        const body =
          typeof block.content === "string" ? block.content : JSON.stringify(block.content);
        return [`✗ ${clip(body, 200)}`];
      });

    case "result": {
      const secs = event.duration_ms ? Math.round(event.duration_ms / 1000) : null;
      const cost = typeof event.total_cost_usd === "number" ? event.total_cost_usd : null;
      const bits = [
        event.is_error ? "finished with an error" : "finished",
        secs !== null ? `${secs}s` : null,
        event.num_turns ? `${event.num_turns} turns` : null,
        cost !== null ? `$${cost.toFixed(3)}` : null,
      ].filter(Boolean);
      return [`· ${bits.join(" · ")}`];
    }

    default:
      return [];
  }
}

export function describeLogLines(lines: string[]): string[] {
  return lines.flatMap(describeLogLine);
}

/** The agent's final prose answer, when the run produced one. */
export function finalResultText(lines: string[]): string | null {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const event = JSON.parse(lines[i].trim()) as StreamEvent;
      if (event.type === "result" && typeof event.result === "string") return event.result;
    } catch {
      // Not JSON; keep scanning backwards.
    }
  }
  return null;
}

/* ---------------------------------------------------------------------- *
 * Phase progress
 * ---------------------------------------------------------------------- */

/**
 * The four phases of a `/scrape` run, in the order the skill performs them.
 *
 * A run takes about four minutes and its only visible output is a scrolling
 * log, so "how far in is it" meant reading the tail and knowing the skill. The
 * skill's own step structure (see .claude/skills/job-scraper/SKILL.md) maps
 * cleanly onto four observable stretches of tool use, which is what this derives.
 */
export const SCRAPE_PHASES = ["portal queries", "fit-rank", "seen-diff", "digest"] as const;

export type ScrapePhase = (typeof SCRAPE_PHASES)[number];

export type PhaseProgress = {
  /** Index into SCRAPE_PHASES, or -1 before the first recognisable marker. */
  index: number;
  label: ScrapePhase | null;
  /** True once the log carries its `result` event. */
  finished: boolean;
};

/**
 * Which phase a single tool call belongs to, or -1 for the great many that
 * belong to none. Ordered most-specific first: a Write to seen_jobs.json is
 * seen-diff even though "Write" alone says nothing.
 */
function phaseOfTool(name: string, detail: string): number {
  const d = detail.toLowerCase();
  const n = name.toLowerCase();

  // 2 — seen-diff: the dedup store being rewritten (Step 4).
  if (/^(write|edit|multiedit)$/.test(n) && d.includes("seen_jobs.json")) return 2;

  // 3 — digest: the run's output being written out (Steps 4.5/5).
  if (/^(write|edit)$/.test(n) && /(reports?\/|digest|summary\.html|new-jobs)/.test(d)) return 3;

  // 1 — fit-rank: per-posting detail being pulled to judge fit (Steps 2/3).
  if (n === "webfetch") return 1;
  if (n === "bash" && /cli\.ts.*\bdetail\b/.test(d)) return 1;
  if (/^(read|grep)$/.test(n) && /0[147]-|job_evaluation|job-evaluation|candidate-profile/.test(d)) {
    return 1;
  }

  // 0 — portal queries: the portal CLIs and the WebSearch fallback (Step 1).
  if (n === "websearch" || n === "agent") return 0;
  if (n === "bash" && /\.agents[\\/]skills|cli\.ts/.test(d)) return 0;
  if (/^read$/.test(n) && d.includes("search-queries.md")) return 0;

  return -1;
}

/**
 * How far a run has got, from its raw log lines.
 *
 * Monotonic by construction: phases only ever advance, so one late Read of a
 * profile doc cannot drag a finished run back to fit-rank. A run that produced
 * no recognisable marker yet reports index -1 rather than guessing phase 0 —
 * the first thirty seconds are session setup, and claiming progress there would
 * be a lie the progress bar cannot take back.
 */
export function scrapeProgress(lines: string[]): PhaseProgress {
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
        const at = phaseOfTool(String(block.name ?? ""), toolDetail(block.input));
        if (at > index) index = at;
      } else if (
        block.type === "text" &&
        typeof block.text === "string" &&
        /new job matches|found \d+ new position/i.test(block.text)
      ) {
        // The Step 5 report header — the digest phase by definition.
        if (index < 3) index = 3;
      }
    }
  }

  if (finished) index = SCRAPE_PHASES.length - 1;
  return { index, label: index >= 0 ? SCRAPE_PHASES[index] : null, finished };
}

/** The run's total cost from the log's `result` event, if it has finished. */
export function finalResultCost(lines: string[]): number | null {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const event = JSON.parse(lines[i].trim()) as StreamEvent;
      if (event.type === "result" && typeof event.total_cost_usd === "number") {
        return event.total_cost_usd;
      }
    } catch {
      // Not JSON; keep scanning backwards.
    }
  }
  return null;
}
