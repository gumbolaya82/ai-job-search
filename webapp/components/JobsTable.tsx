"use client";

import { useMemo, useState, useTransition } from "react";
import type { FitLevel, TimelineRow } from "@/lib/jobsTimeline";
import type { RunStartResult } from "@/lib/runs/actions";
import { VERDICT_TONE } from "@/lib/verdictTone";
import CopyCommand from "./CopyCommand";
import EmptyState from "./EmptyState";
import FitMeter from "./FitMeter";
import { useUi } from "./UiState";

/** /html-report's five buckets, plus the two states the scraper writes. */
const STATUS_VAR: Record<string, string> = {
  Active: "var(--st-active)",
  Interview: "var(--st-interview)",
  Offer: "var(--st-offer)",
  Hired: "var(--st-hired)",
  "Rejected/Closed": "var(--st-rejected)",
  new: "var(--st-active)",
  skipped: "var(--st-none)",
};

const FITS: FitLevel[] = ["high", "medium", "low"];
const FIT_VAR: Record<FitLevel, string> = {
  high: "var(--high)",
  medium: "var(--medium)",
  low: "var(--low)",
};

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span className="pill" style={{ ["--pc" as string]: color }}>
      {label}
    </span>
  );
}

/** A deadline inside a week is what makes waiting another day costly. */
const SOON_MS = 7 * 864e5;

function deadlineLabel(deadline: string | null): string {
  if (!deadline) return "—";
  const days = Date.parse(deadline) - Date.now();
  const soon = Number.isFinite(days) && days < SOON_MS;
  return soon ? `🔥 ${deadline}` : deadline;
}

function Chip({
  on,
  onClick,
  color,
  children,
}: {
  on: boolean;
  onClick: () => void;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="chip"
      aria-pressed={on}
      onClick={onClick}
      style={color ? ({ ["--ch" as string]: color } as React.CSSProperties) : undefined}
    >
      {children}
    </button>
  );
}

/**
 * The jobs table.
 *
 * Two filters used to hide inside <select> menus, so the current state of the
 * view was a thing you opened a menu to learn. They are chips now: every option
 * visible, every active one obvious, one click to toggle. An empty set means no
 * constraint on that dimension — which is why "clear filters" is reachable from
 * the empty state rather than being a fourth control nobody would find.
 *
 * The text query is no longer local state. There is one search field for the
 * whole app, in the page header; this reads it from UiState.
 *
 * The Rank button lives here too, alongside the columns it fills in. `active`
 * and `lock` describe the profile /rank would run against — the same profile
 * ScrapePanel shows a lock alert for — so the button can disable itself and
 * explain why, exactly like ScrapePanel does for Scrape.
 *
 * `rankEnabled` is the same flag `startRank` refuses on, passed down from the
 * server so there is one source of truth rather than a second copy here. This
 * is only the tooltip and the greyed-out button; the refusal that matters is
 * the one in the server action.
 */
export default function JobsTable({
  rows,
  active,
  lock,
  startRank,
  rankEnabled,
}: {
  rows: TimelineRow[];
  active: string | null;
  lock: string | null;
  startRank: (profileId: string) => Promise<RunStartResult>;
  rankEnabled: boolean;
}) {
  const { query, setQuery } = useUi();
  // Low fit is the majority of most runs and the least useful of it, so the
  // default view is the same high+medium the old <select> defaulted to.
  const [fits, setFits] = useState<Set<FitLevel>>(new Set<FitLevel>(["high", "medium"]));
  const [profiles, setProfiles] = useState<Set<string>>(new Set());
  const [appliedOnly, setAppliedOnly] = useState(false);
  const [rankedOnly, setRankedOnly] = useState(false);
  // Off by default: expired postings are noise most of the time, so they are
  // hidden rather than merely dimmed until someone asks to see them.
  const [showExpired, setShowExpired] = useState(false);
  const [confirmingRank, setConfirmingRank] = useState(false);
  const [rankResult, setRankResult] = useState<RunStartResult | null>(null);
  const [rankPending, startRankTransition] = useTransition();

  const allProfiles = useMemo(
    () => Array.from(new Set(rows.map((r) => r.profile))).sort(),
    [rows],
  );

  const q = query.trim().toLowerCase();

  // /rank's unranked count is independent of every chip and the search box:
  // it always describes the active profile's whole backlog, not whatever the
  // view happens to be filtered down to right now.
  const unrankedCount = useMemo(
    () => rows.filter((r) => r.profile === active && r.seenStatus === "new" && r.rankScore === null).length,
    [rows, active],
  );

  const shown = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (fits.size > 0 && !fits.has(r.fit)) return false;
      if (profiles.size > 0 && !profiles.has(r.profile)) return false;
      if (appliedOnly && r.outcome === null) return false;
      if (rankedOnly && r.rankScore === null) return false;
      if (!showExpired && r.expired) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.company.toLowerCase().includes(q) ||
        r.profile.toLowerCase().includes(q) ||
        r.location.toLowerCase().includes(q) ||
        r.portal.toLowerCase().includes(q)
      );
    });
    // Once /rank has touched anything visible, score is the more useful order;
    // until then, nothing has changed from today's fit-then-date order, which
    // `rows` already arrives in.
    if (!filtered.some((r) => r.rankScore !== null)) return filtered;
    return [...filtered].sort((a, b) => {
      if (a.rankScore === null) return b.rankScore === null ? 0 : 1;
      if (b.rankScore === null) return -1;
      return b.rankScore - a.rankScore;
    });
  }, [rows, q, fits, profiles, appliedOnly, rankedOnly, showExpired]);

  function toggle<T>(set: Set<T>, value: T, apply: (next: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    apply(next);
  }

  const filtered =
    fits.size > 0 || profiles.size > 0 || appliedOnly || rankedOnly || !showExpired || q.length > 0;

  function clearAll() {
    setFits(new Set());
    setProfiles(new Set());
    setAppliedOnly(false);
    setRankedOnly(false);
    setShowExpired(true);
    setQuery("");
  }

  // The disabled reason is checked before every other one: a user hovering a
  // dead button wants to know it is off on purpose, not to be told which
  // profile is active.
  const rankTitle = !rankEnabled
    ? "Ranking is turned off — a full run costs roughly $8. Set AI_JOB_SEARCH_RANK=1 to re-enable it, or run /rank in Claude Code by hand."
    : !active
      ? "No active profile selected."
      : lock
        ? `${active} is locked by an in-progress command:\n${lock}`
        : unrankedCount === 0
          ? `No unranked new jobs for ${active}.`
          : `Rank ${unrankedCount} new job${unrankedCount === 1 ? "" : "s"} for ${active}.`;
  const rankDisabled =
    !rankEnabled || rankPending || !active || Boolean(lock) || unrankedCount === 0;

  function beginRank() {
    if (!active) return;
    setConfirmingRank(false);
    startRankTransition(async () => {
      const res = await startRank(active);
      setRankResult(res);
    });
  }

  return (
    <section className="card tight">
      <div className="cardhead">
        <h2>Every job ever surfaced</h2>
        <span className="spacer" />
        <div className="chips">
          <span className="grouplab">fit</span>
          {FITS.map((f) => (
            <Chip key={f} on={fits.has(f)} color={FIT_VAR[f]} onClick={() => toggle(fits, f, setFits)}>
              {f}
            </Chip>
          ))}
          <Chip on={rankedOnly} color="var(--accent)" onClick={() => setRankedOnly((v) => !v)}>
            ranked
          </Chip>
          <Chip on={showExpired} color="var(--st-none)" onClick={() => setShowExpired((v) => !v)}>
            expired
          </Chip>

          <span className="chipsep" aria-hidden="true" />
          <Chip
            on={appliedOnly}
            color="var(--st-active)"
            onClick={() => setAppliedOnly((v) => !v)}
          >
            applied
          </Chip>

          {allProfiles.length > 1 && (
            <>
              <span className="chipsep" aria-hidden="true" />
              <span className="grouplab">profile</span>
              {allProfiles.map((p) => (
                <Chip key={p} on={profiles.has(p)} onClick={() => toggle(profiles, p, setProfiles)}>
                  {p}
                </Chip>
              ))}
            </>
          )}
        </div>
        <button
          type="button"
          className="btn primary sm"
          title={rankTitle}
          disabled={rankDisabled}
          onClick={() => setConfirmingRank(true)}
        >
          Rank new jobs ({unrankedCount})
        </button>
      </div>

      <div style={{ padding: "0 var(--pad) 8px" }}>
        <span className="note">
          Showing {shown.length} of {rows.length}. Fit comes from the scraper; score and verdict
          come from <code>/rank</code> — once any visible row has a score, the table sorts by score
          descending with unranked rows last; until then it keeps the fit-then-date order. The
          status column shows the tracker outcome once <code>/outcome</code> has recorded one.
        </span>

        {confirmingRank && active && (
          <div className="alert" style={{ marginTop: 8 }}>
            <b>
              Rank {unrankedCount} job{unrankedCount === 1 ? "" : "s"} for {active}?
            </b>
            This launches Claude Code against every one of them. Each posting is fetched and
            scored — that spends API tokens on every click.
            <div className="acts">
              <button type="button" className="btn primary sm" onClick={beginRank} disabled={rankPending}>
                Yes, start it
              </button>
              <button type="button" className="btn sm" onClick={() => setConfirmingRank(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {rankResult && !rankResult.ok && (
          <div className="alert err" style={{ marginTop: 8 }}>
            <b>Could not start /rank</b>
            <pre>{rankResult.message}</pre>
          </div>
        )}
      </div>

      <div className="scrollbox">
        <table>
          <thead>
            <tr>
              <th>Fit</th>
              <th>Score</th>
              <th>Verdict</th>
              <th>Deadline</th>
              <th>Title</th>
              <th>Company</th>
              <th>Location</th>
              <th>Portal</th>
              <th>First seen</th>
              <th>Status</th>
              <th>Profile</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const status = r.outcome ?? r.seenStatus;
              // FAIL means /rank vetoed the posting on location — struck through,
              // the same "still here, but discount it" treatment the reports use.
              // An expired row is only ever rendered once the expired chip is on
              // (otherwise it is filtered out above), so it always dims.
              const rowStyle: React.CSSProperties = {};
              if (r.expired) rowStyle.opacity = 0.55;
              if (r.locationVerdict === "FAIL") rowStyle.textDecoration = "line-through";
              return (
                <tr key={r.key} style={rowStyle}>
                  <td>
                    <FitMeter fit={r.fit} />
                  </td>
                  <td className="meta">{r.rankScore ?? "—"}</td>
                  <td>
                    {r.rankVerdict ? (
                      <Pill label={r.rankVerdict} color={VERDICT_TONE[r.rankVerdict] ?? "var(--st-none)"} />
                    ) : (
                      <span className="meta">—</span>
                    )}
                  </td>
                  <td className="meta">{deadlineLabel(r.deadline)}</td>
                  <td className="title">
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer noopener">
                        {r.title}
                      </a>
                    ) : (
                      r.title
                    )}
                  </td>
                  <td>{r.company}</td>
                  <td className="meta">{r.location || "—"}</td>
                  <td className="meta">{r.portal || "—"}</td>
                  <td className="meta">{r.firstSeen || "—"}</td>
                  <td>
                    <Pill label={status} color={STATUS_VAR[status] ?? "var(--st-none)"} />
                  </td>
                  <td className="meta">{r.profile}</td>
                  <td>
                    <CopyCommand command={`/apply ${r.url}`} label="/apply" />
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={12} style={{ padding: "var(--pad)" }}>
                  {rows.length === 0 ? (
                    <EmptyState
                      title="No jobs have been surfaced yet"
                      body={
                        <>
                          Jobs arrive from <code>/scrape</code>, which searches the portal CLIs and
                          writes <code>seen_jobs.json</code>. Run one from the Scrape screen, or
                          paste the command into Claude Code.
                        </>
                      }
                    >
                      <a className="btn primary sm" href="/scrape">
                        Go to Scrape
                      </a>
                      <CopyCommand command="/scrape" />
                    </EmptyState>
                  ) : (
                    <EmptyState
                      title="Nothing matches these filters"
                      body={`All ${rows.length} jobs are still here — the fit, ranked, expired, applied and profile chips above are narrowing them down.`}
                    >
                      <button type="button" className="btn sm" onClick={clearAll} disabled={!filtered}>
                        Clear filters
                      </button>
                    </EmptyState>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
