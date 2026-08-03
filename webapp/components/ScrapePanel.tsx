"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { ProfileRecord } from "@/lib/profileRegistry";
import { RUN_STATE_LABEL, fmtDuration, runStateColor } from "@/lib/runs/display";
import { SCRAPE_PHASES } from "@/lib/scrape/logFormat";
import type { ScrapeStartResult, ScrapeStatus } from "@/lib/scrape/runner";
import EmptyState from "./EmptyState";
import FitMeter from "./FitMeter";
import PhaseBar from "./PhaseBar";
import RunHistory from "./RunHistory";

/**
 * The one screen in this app that spends money and writes to the repo.
 *
 * Every guard rail here is deliberate: a confirm step naming the cost, a refusal
 * when the profile is locked, a visible warning when starting will switch the
 * active profile, and a cancel button. The run itself is a detached process, so
 * this component owns no lifecycle — it polls `/api/scrape/status` and renders
 * whatever the server says, which is what makes a mid-run page reload harmless.
 */

type Actions = {
  start: (id: string, args: { focus: string; broad: boolean }) => Promise<ScrapeStartResult>;
  /**
   * `runId` is the run this client is watching. The server refuses the cancel if
   * that is no longer the live run, so a stale view cannot kill a newer scrape.
   */
  cancel: (id: string, runId: string) => Promise<ScrapeStartResult>;
};

type Props = {
  profiles: ProfileRecord[];
  active: string | null;
  /**
   * From `?profile=`, which is how ⌘K's "Scrape <id>" arrives here. It only
   * preselects the dropdown — starting the run still needs the confirm below,
   * because that confirm is the guard on the one screen that spends money.
   */
  preselect?: string | null;
  initial: ScrapeStatus;
  actions: Actions;
};

const POLL_MS = 2000;

export default function ScrapePanel({ profiles, active, preselect, initial, actions }: Props) {
  const live = profiles.filter((p) => !p.archived);
  const [selected, setSelected] = useState(preselect ?? active ?? live[0]?.id ?? "");
  const [focus, setFocus] = useState("");
  const [broad, setBroad] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [status, setStatus] = useState<ScrapeStatus>(initial);
  const [result, setResult] = useState<ScrapeStartResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [, forceTick] = useState(0);
  const logRef = useRef<HTMLPreElement>(null);

  const run = status.run;
  const isRunning = run?.state === "running";
  const lock = live.find((p) => p.id === selected)?.lock ?? null;
  const willSwitch = selected !== active;

  const refresh = useCallback(async (profileId: string) => {
    if (!profileId) return;
    try {
      const res = await fetch(`/api/scrape/status?profile=${encodeURIComponent(profileId)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      setStatus((await res.json()) as ScrapeStatus);
    } catch {
      // A dropped poll is not worth surfacing; the next one will land.
    }
  }, []);

  // Switching profiles shows that profile's run, not the previous one's.
  useEffect(() => {
    void refresh(selected);
  }, [selected, refresh]);

  // Poll only while something is actually running.
  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => {
      void refresh(selected);
      forceTick((n) => n + 1); // keeps the elapsed clock moving between polls
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [isRunning, selected, refresh]);

  // Keep the newest log line in view.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [status.lines]);

  function begin() {
    setConfirming(false);
    setStopping(false);
    startTransition(async () => {
      const res = await actions.start(selected, { focus, broad });
      setResult(res);
      await refresh(selected);
    });
  }

  function stop(runId: string) {
    setStopping(false);
    startTransition(async () => {
      const res = await actions.cancel(selected, runId);
      setResult(res);
      await refresh(selected);
    });
  }

  return (
    <>
      {run && (
        <section className="card">
          <div className="cardhead">
            <h2>Last run</h2>
            <span className="spacer" />
            <span className={`pill ${run.state}`} style={{ ["--pc" as string]: runStateColor(run.state) }}>
              {RUN_STATE_LABEL[run.state] ?? run.state}
            </span>
          </div>
          <div className="runfacts">
            <span>
              profile <b>{run.profile}</b>
            </span>
            <span>started {run.startedAt.replace("T", " ").replace(/\.\d+Z$/, "Z")}</span>
            <span>took {fmtDuration(run.startedAt, run.endedAt)}</span>
            <span>
              {run.newJobs === null ? "jobs pending" : `${run.newJobs.length} new jobs`}
            </span>
            <span>{typeof run.costUsd === "number" ? `$${run.costUsd.toFixed(3)}` : "cost pending"}</span>
            {(run.args.focus || run.args.broad) && (
              <span>
                {run.args.broad ? "broad" : null}
                {run.args.broad && run.args.focus ? " · " : null}
                {run.args.focus ? `focus: ${run.args.focus}` : null}
              </span>
            )}
          </div>
        </section>
      )}

      <section className="card">
        <div className="cardhead">
          <h2>Run a scrape</h2>
        </div>

        {lock && (
          <div className="alert">
            <b>{selected} is locked</b>
            Another command is mid-run against this profile. Wait for it, or clear the lock on the
            Profiles screen.
            <pre>{lock}</pre>
          </div>
        )}

        <div className="form">
          <div className="f">
            <label htmlFor="scrape-profile">Profile</label>
            <select
              id="scrape-profile"
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setConfirming(false);
                setStopping(false);
                setResult(null);
              }}
            >
              {live.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id}
                  {p.id === active ? " (active)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="f">
            <label htmlFor="scrape-focus">Focus (optional)</label>
            <input
              id="scrape-focus"
              type="text"
              value={focus}
              placeholder="e.g. recruiting"
              onChange={(e) => setFocus(e.target.value)}
            />
          </div>

          <label className="chk">
            <input type="checkbox" checked={broad} onChange={(e) => setBroad(e.target.checked)} />
            broad (all query categories)
          </label>

          <button
            type="button"
            className="btn primary"
            disabled={pending || isRunning || Boolean(lock) || !selected}
            onClick={() => setConfirming(true)}
          >
            Scrape now
          </button>
        </div>

        {confirming && (
          <div className="alert">
            <b>Start a real scrape of {selected}?</b>
            This launches Claude Code against the job portals. It takes several minutes and spends
            API tokens on every click.
            {willSwitch && (
              <p style={{ margin: "8px 0 0" }}>
                Scraping <b>{selected}</b> will make it the active profile. <code>CLAUDE.md</code>{" "}
                and <code>.active-profile</code> will change — that is expected, and{" "}
                <code>switch</code> dirties the working tree by design.
              </p>
            )}
            <div className="acts">
              <button type="button" className="btn primary sm" onClick={begin} disabled={pending}>
                Yes, start it
              </button>
              <button type="button" className="btn sm" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className={`alert ${result.ok ? "ok" : "err"}`} style={{ marginTop: 12 }}>
            <b>{result.ok ? "Done" : "Failed"}</b>
            <pre>{result.message}</pre>
          </div>
        )}
      </section>

      {run && (
        <section className="card">
          <div className="cardhead">
            <h2>{isRunning ? "Running" : "Output"}</h2>
            <span className="note">
              {isRunning
                ? `elapsed ${fmtDuration(run.startedAt, null)}${
                    status.progress.label ? ` · ${status.progress.label}` : ""
                  }`
                : `run ${run.id}`}
            </span>
            <span className="spacer" />
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

          {/*
            A confirm step, for the same reason starting one has it: a single
            stray click here throws away minutes of work already paid for, and
            on 2026-07-29 exactly that happened to a live run.
          */}
          {isRunning && stopping && (
            <div className="alert" style={{ marginBottom: 12 }}>
              <b>Stop run {run.id}?</b>
              It has been running {fmtDuration(run.startedAt, null)}. The tokens already spent are
              not refunded, and the jobs found so far are kept — but the run cannot be resumed.
              <div className="acts">
                <button
                  type="button"
                  className="btn danger sm"
                  onClick={() => stop(run.id)}
                  disabled={pending}
                >
                  Yes, stop it
                </button>
                <button type="button" className="btn sm" onClick={() => setStopping(false)}>
                  Keep running
                </button>
              </div>
            </div>
          )}

          <PhaseBar labels={SCRAPE_PHASES} progress={status.progress} running={isRunning} />

          <pre className="logtail" ref={logRef}>
            {status.lines.length ? status.lines.join("\n") : "waiting for output…"}
          </pre>
        </section>
      )}

      {run && run.newJobs !== null && (
        <section className="card">
          <div className="cardhead">
            <h2>{run.newJobs.length} new job{run.newJobs.length === 1 ? "" : "s"}</h2>
            <span className="spacer" />
            <a
              className="btn sm"
              href={`/api/scrape/eml?profile=${encodeURIComponent(run.profile)}&run=${encodeURIComponent(run.id)}`}
            >
              Download email (.eml)
            </a>
            <a
              className="btn sm"
              href={`/api/scrape/eml?profile=${encodeURIComponent(run.profile)}&run=${encodeURIComponent(run.id)}&format=html`}
            >
              Download page (.html)
            </a>
          </div>
          <div className="note" style={{ marginBottom: 10 }}>
            The .eml opens pre-filled in your mail client — nothing is sent until you press Send.
            The .html is the same digest as a page, for opening in a browser.
          </div>

          {run.newJobs.length === 0 ? (
            <EmptyState
              title="This run surfaced no new jobs"
              body={
                <>
                  Every posting it found was already in <code>seen_jobs.json</code> or the tracker —
                  the normal result of two runs close together. Widen the net with{" "}
                  <b>broad</b>, or give it a focus term.
                </>
              }
            >
              <a
                className="btn sm"
                href={`/api/scrape/eml?profile=${encodeURIComponent(run.profile)}&run=${encodeURIComponent(run.id)}&format=html`}
              >
                Open the digest anyway
              </a>
            </EmptyState>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Fit</th>
                  <th>Title</th>
                  <th>Company</th>
                  <th>First seen</th>
                </tr>
              </thead>
              <tbody>
                {run.newJobs.map((job) => (
                  <tr key={job.key}>
                    <td>
                      <FitMeter fit={job.fit} />
                    </td>
                    <td className="title">
                      {job.url ? (
                        <a href={job.url} target="_blank" rel="noreferrer">
                          {job.title}
                        </a>
                      ) : (
                        job.title
                      )}
                    </td>
                    <td>{job.company}</td>
                    <td className="meta">{job.firstSeen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/*
        Keyed off the live run's id and state so a run that just finished shows
        up here as "finished" without a reload — the list is a snapshot, unlike
        the polled card above.
      */}
      {selected && <RunHistory profile={selected} refreshKey={`${run?.id ?? ""}:${run?.state ?? ""}`} />}
    </>
  );
}
