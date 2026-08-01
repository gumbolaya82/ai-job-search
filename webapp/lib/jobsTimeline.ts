import fs from "node:fs";
import { profilePath } from "./repoRoot.ts";
import { readRegistry } from "./profileRegistry.ts";
import { readTracker, type TrackerRow } from "./csv/tracker.ts";
import { FIT_RANK, type FitLevel } from "./fitRank.ts";
import { VERDICT_TONE } from "./verdictTone.ts";

/**
 * The reason this webapp exists.
 *
 * Joins `job_scraper/seen_jobs.json` (every job ever surfaced, any status) with
 * `job_search_tracker.csv` (only the subset applied to) into a single timeline
 * across every profile — something neither file gives you alone.
 *
 * The tracker is routinely absent. A missing right side is an empty join, not
 * an error: it is the normal state before the first `/outcome` run.
 */

// Re-exported so every existing importer of these keeps working; the definitions
// now live in a leaf module the email digest can also reach. See lib/fitRank.ts.
export type { FitLevel };
export { FIT_RANK };

// Re-exported for the same reason: VERDICT_TONE now lives in a leaf module
// with no imports, so JobsTable.tsx (a client component) can import the
// value directly from lib/verdictTone.ts without also pulling in this
// module's node:fs import. See that file's header comment.
export { VERDICT_TONE };

/** The five canonical buckets from /html-report's Step 1 status normalisation. */
export type OutcomeBucket = "Active" | "Interview" | "Offer" | "Hired" | "Rejected/Closed";

export type TimelineRow = {
  key: string;
  profile: string;
  title: string;
  company: string;
  url: string;
  firstSeen: string;
  fit: FitLevel;
  /** Status recorded by the scraper: "new", "skipped", … */
  seenStatus: string;
  /** Present only when the tracker has a matching row. */
  outcome: OutcomeBucket | null;
  outcomeNotes: string;
  rankScore: number | null;
  rankVerdict: string | null;
  rankDate: string;
  location: string;
  locationVerdict: string | null;
  deadline: string | null;
  expired: boolean;
  portal: string;
};

type SeenJob = {
  title?: string;
  company?: string;
  url?: string;
  first_seen?: string;
  fit?: string;
  status?: string;
  portal?: string;
  rank_score?: number;
  rank_verdict?: string;
  rank_date?: string;
  location?: string;
  location_verdict?: string;
  deadline?: string | null;
};

const BUCKETS: Record<string, OutcomeBucket> = {
  applied: "Active",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected/Closed",
  no_response: "Rejected/Closed",
  "no response": "Rejected/Closed",
  offer_declined: "Rejected/Closed",
  interview_only: "Rejected/Closed",
  withdrawn: "Rejected/Closed",
};

export function normaliseStatus(raw: string): OutcomeBucket | null {
  return BUCKETS[raw.trim().toLowerCase()] ?? null;
}

/** Fuzzy key: lowercase, punctuation stripped — same rule /html-report uses. */
export function matchKey(company: string, role: string): string {
  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  return `${clean(company)}::${clean(role)}`;
}

function readSeenJobs(profileId: string): SeenJob[] {
  const file = profilePath(profileId, "job_scraper", "seen_jobs.json");
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { seen?: Record<string, SeenJob> };
    return Object.values(parsed.seen ?? {});
  } catch {
    return [];
  }
}

function asFit(raw: string | undefined): FitLevel {
  return raw === "high" || raw === "medium" ? raw : raw === "low" ? "low" : "low";
}

export function parseRankFields(job: SeenJob) {
  const score = typeof job.rank_score === "number" && Number.isFinite(job.rank_score)
    ? job.rank_score
    : null;
  return {
    rankScore: score,
    rankVerdict: typeof job.rank_verdict === "string" && job.rank_verdict ? job.rank_verdict : null,
    rankDate: job.rank_date ?? "",
    location: job.location ?? "",
    locationVerdict: typeof job.location_verdict === "string" && job.location_verdict ? job.location_verdict : null,
    deadline: typeof job.deadline === "string" && job.deadline ? job.deadline : null,
    expired: (job.status ?? "") === "expired",
  };
}

export function timelineForProfile(profileId: string): TimelineRow[] {
  const seen = readSeenJobs(profileId);
  const tracker: TrackerRow[] = readTracker(profileId);

  const byKey = new Map<string, TrackerRow>();
  for (const row of tracker) {
    byKey.set(matchKey(row.company ?? "", row.role ?? ""), row);
  }

  return seen.map((job, i) => {
    const company = job.company ?? "";
    const title = job.title ?? "";
    const hit = byKey.get(matchKey(company, title));
    return {
      key: `${profileId}:${job.url ?? i}`,
      profile: profileId,
      title,
      company,
      url: job.url ?? "",
      firstSeen: job.first_seen ?? "",
      fit: asFit(job.fit),
      seenStatus: job.status ?? "new",
      outcome: hit ? normaliseStatus(hit.status ?? "") : null,
      outcomeNotes: hit?.notes ?? "",
      portal: job.portal ?? "",
      ...parseRankFields(job),
    };
  });
}

/** Every job across every non-archived profile, best fit first. */
export function timelineForAllProfiles(): TimelineRow[] {
  const rows: TimelineRow[] = [];
  for (const profile of readRegistry().profiles) {
    if (profile.archived) continue;
    rows.push(...timelineForProfile(profile.id));
  }
  rows.sort(
    (a, b) =>
      FIT_RANK[a.fit] - FIT_RANK[b.fit] ||
      b.firstSeen.localeCompare(a.firstSeen) ||
      a.company.localeCompare(b.company),
  );
  return rows;
}

export type TimelineStats = {
  total: number;
  high: number;
  medium: number;
  low: number;
  applied: number;
};

export function summarise(rows: TimelineRow[]): TimelineStats {
  return {
    total: rows.length,
    high: rows.filter((r) => r.fit === "high").length,
    medium: rows.filter((r) => r.fit === "medium").length,
    low: rows.filter((r) => r.fit === "low").length,
    applied: rows.filter((r) => r.outcome !== null).length,
  };
}

// Re-exported so callers keep one import for "the jobs timeline"; the weekly
// bucketing itself lives in a leaf module `node --test` can load. See
// lib/jobsSeries.ts, and lib/fitRank.ts for the same split.
export { SPARK_WEEKS, weeklyCounts, weeklySeries, type TimelineSeries } from "./jobsSeries.ts";
