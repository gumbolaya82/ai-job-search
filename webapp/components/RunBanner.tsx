"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { CommandId } from "@/lib/runs/runStore";
import type { RunStartResult, RunStatus } from "@/lib/runs/actions";
import PhaseBar from "./PhaseBar";

/**
 * A compact "is anything running right now" strip, generic across commands —
 * the run-watching half of `ScrapePanel`, without the start form.
 *
 * The run itself is a detached process, so this component owns no lifecycle:
 * it polls `/api/runs/status` and renders whatever the server says, which is
 * what makes a mid-run page reload harmless. It polls only while the run it
 * is showing is `running` (same effect shape as `ScrapePanel`'s), and renders
 * nothing at all when there is no run to report on.
 */

type Props = {
  profile: string;
  command: CommandId;
  labels: readonly string[];
  initial: RunStatus;
  /**
   * `runId` is the run this banner is displaying. The server refuses the
   * cancel if that is no longer the live run, so a stale view cannot kill a
   * newer run — the same `cancelRefusal` hazard `ScrapePanel` guards against.
   */
  onCancel: (runId: string) => Promise<RunStartResult>;
};

const POLL_MS = 2000;

function fmtDuration(fromIso: string, toIso: string | null): string {
  const start = Date.parse(fromIso);
  const end = toIso ? Date.parse(toIso) : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "—";
  const secs = Math.max(0, Math.round((end - start) / 1000));
  const mins = Math.floor(secs / 60);
  return mins > 0 ? `${mins}m ${secs % 60}s` : `${secs}s`;
}

const STATE_LABEL: Record<string, string> = {
  running: "running",
  done: "finished",
  failed: "failed",
  cancelled: "cancelled",
};

function stateColor(state: string): string {
  if (state === "done") return "var(--st-hired)";
  if (state === "failed") return "var(--st-rejected)";
  if (state === "cancelled") return "var(--st-none)";
  return "var(--st-active)";
}

export default function RunBanner({ profile, command, labels, initial, onCancel }: Props) {
  const [status, setStatus] = useState<RunStatus>(initial);
  const [stopping, setStopping] = useState(false);
  const [result, setResult] = useState<RunStartResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [, forceTick] = useState(0);

  const run = status.run;
  const isRunning = run?.state === "running";

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/runs/status?profile=${encodeURIComponent(profile)}&command=${encodeURIComponent(command)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      setStatus((await res.json()) as RunStatus);
    } catch {
      // A dropped poll is not worth surfacing; the next one will land.
    }
  }, [profile, command]);

  // Pick up a run this component did not start itself. Unlike ScrapePanel,
  // whose own `begin()` refreshes right after calling `start`, RunBanner is a
  // passive observer — the button that starts /rank lives in JobsTable. That
  // action's `revalidatePath` re-renders the server page with a fresh
  // `initial`, but a mounted client component only reads its `initial` prop
  // once, on mount. Re-sync only when the run id actually changed, so this
  // does not clobber a same-run poll result that is already newer than the
  // server snapshot with a staler one.
  useEffect(() => {
    setStatus((prev) => (prev.run?.id === initial.run?.id ? prev : initial));
  }, [initial]);

  // Poll only while something is actually running.
  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => {
      void refresh();
      forceTick((n) => n + 1); // keeps the elapsed clock moving between polls
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [isRunning, refresh]);

  function stop(runId: string) {
    setStopping(false);
    startTransition(async () => {
      const res = await onCancel(runId);
      setResult(res);
      await refresh();
    });
  }

  if (!run) return null;

  return (
    <section className="card">
      <div className="cardhead">
        <h2>/{command}</h2>
        <span className="spacer" />
        <span className={`pill ${run.state}`} style={{ ["--pc" as string]: stateColor(run.state) }}>
          {STATE_LABEL[run.state] ?? run.state}
        </span>
        {isRunning && (
          <button
            type="button"
            className="btn danger sm"
            onClick={() => setStopping(true)}
            disabled={pending || stopping}
          >
            Cancel run
          </button>
        )}
      </div>

      {/* A confirm step, for the same reason ScrapePanel's cancel has one: a
          stray click here throws away minutes of already-paid-for work. */}
      {isRunning && stopping && (
        <div className="alert" style={{ marginBottom: 12 }}>
          <b>Stop run {run.id}?</b>
          It has been running {fmtDuration(run.startedAt, null)}. The tokens already spent are not
          refunded, and whatever it already wrote is kept — but the run cannot be resumed.
          <div className="acts">
            <button type="button" className="btn danger sm" onClick={() => stop(run.id)} disabled={pending}>
              Yes, stop it
            </button>
            <button type="button" className="btn sm" onClick={() => setStopping(false)}>
              Keep running
            </button>
          </div>
        </div>
      )}

      <div className="runfacts">
        <span>started {run.startedAt.replace("T", " ").replace(/\.\d+Z$/, "Z")}</span>
        <span>
          {isRunning
            ? `elapsed ${fmtDuration(run.startedAt, null)}`
            : `took ${fmtDuration(run.startedAt, run.endedAt)}`}
        </span>
        <span>{typeof run.costUsd === "number" ? `$${run.costUsd.toFixed(3)}` : "cost pending"}</span>
      </div>

      <PhaseBar labels={labels} progress={status.progress} running={isRunning} />

      {result && !result.ok && (
        <div className="alert err" style={{ marginTop: 12 }}>
          <b>Failed</b>
          <pre>{result.message}</pre>
        </div>
      )}
    </section>
  );
}
