import JobsTable from "@/components/JobsTable";
import PageHead from "@/components/PageHead";
import RunBanner from "@/components/RunBanner";
import Sparkline from "@/components/Sparkline";
import { SPARK_WEEKS, summarise, timelineForAllProfiles, weeklySeries } from "@/lib/jobsTimeline";
import { readRegistry } from "@/lib/profileRegistry";
import { cancelRun, runStatus } from "@/lib/runs/actions";
import { RANK_PHASES } from "@/lib/runs/commandSpec";

/**
 * Jobs is the landing screen: it is the reason the webapp exists.
 *
 * seen_jobs.json holds everything ever surfaced; the tracker CSV holds only the
 * applied subset. Neither shows the other. This joins them across every profile.
 */
export default async function JobsPage() {
  let rows;
  let active: string | null = null;
  try {
    rows = timelineForAllProfiles();
    active = readRegistry().active;
  } catch (err) {
    return (
      <>
        <PageHead title="Jobs" search={false} />
        <div className="alert err">
          <b>Could not read the profile registry</b>
          The webapp shells out to <code>tools/profile_manager.py</code> for this. Check that
          python is on PATH and that you started the app from inside the repo.
          <pre>{(err as Error).message}</pre>
        </div>
      </>
    );
  }

  const stats = summarise(rows);
  const series = weeklySeries(rows);
  const trackerMissing = stats.applied === 0;

  const rankStatus = active
    ? await runStatus(active, "rank")
    : { run: null, lines: [], progress: { index: -1, label: null, finished: false } };

  const CARDS = [
    { key: "total", label: "Ever surfaced", tone: "var(--accent)" },
    { key: "high", label: "High fit", tone: "var(--high)" },
    { key: "medium", label: "Medium fit", tone: "var(--medium)" },
    { key: "low", label: "Low fit", tone: "var(--low)" },
    { key: "applied", label: "Applied", tone: "var(--st-active)" },
  ] as const;

  return (
    <>
      <PageHead
        title="Jobs"
        crumb={`${stats.total} ever surfaced, all profiles`}
        active={active}
        placeholder="Search jobs…"
      />

      {active && (
        <RunBanner
          profile={active}
          command="rank"
          labels={RANK_PHASES.labels}
          initial={rankStatus}
          onCancel={cancelRun.bind(null, active, "rank")}
        />
      )}

      <div className="stats">
        {CARDS.map((card) => (
          <div key={card.key} className="stat" style={{ ["--sc" as string]: card.tone }}>
            <div className="n">{stats[card.key]}</div>
            <div className="l">{card.label}</div>
            <Sparkline
              points={series[card.key]}
              color={card.tone}
              label={`${card.label}, last ${SPARK_WEEKS} weeks: ${series[card.key].join(", ")}`}
            />
          </div>
        ))}
      </div>

      {trackerMissing && (
        <div className="alert">
          <b>No application outcomes recorded yet</b>
          No <code>job_search_tracker.csv</code> exists for the active profile, so every row below
          shows only its scraper status. Run <code>/outcome</code> in Claude Code after applying and
          the status column fills in with the tracker buckets.
        </div>
      )}

      <JobsTable rows={rows} />

      <footer className="pvfoot">
        seen_jobs.json ⨝ job_search_tracker.csv · sparklines show the last {SPARK_WEEKS} weeks by
        first-seen date · read-only · localhost only
      </footer>
    </>
  );
}
