"use client";

import { useCallback, useEffect, useState } from "react";
import type { RunSummary } from "@/lib/scrape/runStore";
import { RUN_STATE_LABEL, fmtDuration, fmtRunTime, runStateColor } from "@/lib/runs/display";
import EmptyState from "./EmptyState";

/**
 * Every past scrape for the selected profile, each with its two downloads.
 *
 * The panel above only ever shows the newest run, because that is the one being
 * polled. The digests of older runs stayed reachable the whole time — the `.eml`
 * route takes any run id — but nothing linked to them, so recovering last week's
 * digest meant hand-editing a URL. This is that list.
 *
 * The rows come from `/api/scrape/runs`, which sends counts rather than job
 * rows. A run whose diff was never persisted (`newJobCount: null`) gets no
 * download links: the digest route answers those with a 409, and a button that
 * only ever errors is worse than no button.
 */

type Props = {
  profile: string;
  /**
   * Changes whenever the live run does. The list is a snapshot, so a finishing
   * run would otherwise sit here as "running" until the page reloaded.
   */
  refreshKey?: string;
};

function digestHref(profile: string, runId: string, html: boolean): string {
  const base = `/api/scrape/eml?profile=${encodeURIComponent(profile)}&run=${encodeURIComponent(runId)}`;
  return html ? `${base}&format=html` : base;
}

export default function RunHistory({ profile, refreshKey }: Props) {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (profileId: string) => {
    if (!profileId) return;
    try {
      const res = await fetch(`/api/scrape/runs?profile=${encodeURIComponent(profileId)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const body = (await res.json()) as { profile: string; runs: RunSummary[] };
      setRuns(body.runs);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    // A profile switch must not leave the previous profile's runs on screen
    // while the next fetch is in flight — this screen shows personal data.
    setRuns(null);
    void load(profile);
  }, [profile, refreshKey, load]);

  return (
    <section className="card">
      <div className="cardhead">
        <h2>Past runs</h2>
        <span className="note">{runs ? `${runs.length} on disk` : "loading…"}</span>
      </div>

      {failed ? (
        <div className="alert err">
          <b>Could not read the run history</b>
          <pre>/api/scrape/runs did not answer. Reload the page.</pre>
        </div>
      ) : runs === null ? (
        <p className="note">Reading past runs…</p>
      ) : runs.length === 0 ? (
        <EmptyState
          title="No scrapes recorded for this profile"
          body={
            <>
              Run one above. Each run keeps its own digest under{" "}
              <code>reports/scrape-runs/</code>, downloadable from here afterwards.
            </>
          }
          small
        />
      ) : (
        <table>
          <thead>
            <tr>
              <th>Started</th>
              <th>State</th>
              <th>New</th>
              <th>Took</th>
              <th>Cost</th>
              <th>Args</th>
              <th>Digest</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="meta">{fmtRunTime(r.startedAt)}</td>
                <td>
                  <span className={`pill ${r.state}`} style={{ ["--pc" as string]: runStateColor(r.state) }}>
                    {RUN_STATE_LABEL[r.state] ?? r.state}
                  </span>
                </td>
                <td>{r.newJobCount === null ? "—" : r.newJobCount}</td>
                <td className="meta">{fmtDuration(r.startedAt, r.endedAt)}</td>
                <td className="meta">{typeof r.costUsd === "number" ? `$${r.costUsd.toFixed(3)}` : "—"}</td>
                <td className="meta">
                  {r.broad ? "broad" : null}
                  {r.broad && r.focus ? " · " : null}
                  {r.focus ? `focus: ${r.focus}` : null}
                  {!r.broad && !r.focus ? "—" : null}
                </td>
                <td>
                  {r.newJobCount === null ? (
                    <span className="note">no digest</span>
                  ) : (
                    <span className="acts">
                      <a className="btn sm" href={digestHref(r.profile, r.id, true)}>
                        .html
                      </a>
                      <a className="btn sm" href={digestHref(r.profile, r.id, false)}>
                        .eml
                      </a>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="note" style={{ marginTop: 10 }}>
        Digests are rebuilt from each run&apos;s own saved results, so an older one still
        reads correctly after a later scrape moved the baseline.
      </div>
    </section>
  );
}
