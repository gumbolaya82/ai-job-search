"use client";

import { useMemo, useState } from "react";
import type { FitLevel, TimelineRow } from "@/lib/jobsTimeline";
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
 */
export default function JobsTable({ rows }: { rows: TimelineRow[] }) {
  const { query, setQuery } = useUi();
  // Low fit is the majority of most runs and the least useful of it, so the
  // default view is the same high+medium the old <select> defaulted to.
  const [fits, setFits] = useState<Set<FitLevel>>(new Set<FitLevel>(["high", "medium"]));
  const [profiles, setProfiles] = useState<Set<string>>(new Set());
  const [appliedOnly, setAppliedOnly] = useState(false);

  const allProfiles = useMemo(
    () => Array.from(new Set(rows.map((r) => r.profile))).sort(),
    [rows],
  );

  const q = query.trim().toLowerCase();

  const shown = useMemo(
    () =>
      rows.filter((r) => {
        if (fits.size > 0 && !fits.has(r.fit)) return false;
        if (profiles.size > 0 && !profiles.has(r.profile)) return false;
        if (appliedOnly && r.outcome === null) return false;
        if (!q) return true;
        return (
          r.title.toLowerCase().includes(q) ||
          r.company.toLowerCase().includes(q) ||
          r.profile.toLowerCase().includes(q)
        );
      }),
    [rows, q, fits, profiles, appliedOnly],
  );

  function toggle<T>(set: Set<T>, value: T, apply: (next: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    apply(next);
  }

  const filtered = fits.size > 0 || profiles.size > 0 || appliedOnly || q.length > 0;

  function clearAll() {
    setFits(new Set());
    setProfiles(new Set());
    setAppliedOnly(false);
    setQuery("");
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
      </div>

      <div style={{ padding: "0 var(--pad) 8px" }}>
        <span className="note">
          Showing {shown.length} of {rows.length}. Fit comes from the scraper; the status column
          shows the tracker outcome once <code>/outcome</code> has recorded one.
        </span>
      </div>

      <div className="scrollbox">
        <table>
          <thead>
            <tr>
              <th>Fit</th>
              <th>Title</th>
              <th>Company</th>
              <th>First seen</th>
              <th>Status</th>
              <th>Profile</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const status = r.outcome ?? r.seenStatus;
              return (
                <tr key={r.key}>
                  <td>
                    <FitMeter fit={r.fit} />
                  </td>
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
                <td colSpan={7} style={{ padding: "var(--pad)" }}>
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
                      body={`All ${rows.length} jobs are still here — the fit, applied and profile chips above are narrowing them down.`}
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
