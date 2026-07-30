import type { TimelineRow, TimelineStats } from "./jobsTimeline.ts";

/**
 * Weekly buckets for the stat-card sparklines.
 *
 * A leaf module with no runtime imports, for the same reason `fitRank.ts` is
 * one: `jobsTimeline.ts` opens the filesystem, and this is pure arithmetic that
 * `node --test` should be able to load on its own. The `TimelineRow` import is
 * type-only and erased.
 */

/** Seven weekly buckets, oldest first, ending with the week `now` falls in. */
export const SPARK_WEEKS = 7;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Bucket rows into the last seven weeks by `first_seen`.
 *
 * A bare count says how many; it says nothing about whether the scraper has
 * gone quiet, which is the failure mode this app exists to make visible.
 *
 * Rows with a missing or unparseable `first_seen`, or one older than the
 * window, fall outside every bucket. That is intended: the series is a recent
 * trend, not a total, and the number above it already carries the total.
 */
export function weeklyCounts(
  rows: TimelineRow[],
  weeks: number = SPARK_WEEKS,
  now: Date = new Date(),
): number[] {
  const buckets = new Array<number>(weeks).fill(0);
  // Anchor on the end of today, UTC, so a job first seen at 23:50 and one at
  // 00:10 the next morning do not land in different buckets by accident.
  const end =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DAY_MS;

  for (const row of rows) {
    const seen = Date.parse(row.firstSeen);
    if (!Number.isFinite(seen)) continue;
    const weeksAgo = Math.floor((end - seen) / WEEK_MS);
    if (weeksAgo < 0 || weeksAgo >= weeks) continue;
    buckets[weeks - 1 - weeksAgo] += 1;
  }
  return buckets;
}

/** One seven-point series per stat card, keyed as the stats object is. */
export type TimelineSeries = Record<keyof TimelineStats, number[]>;

/**
 * The "applied" series is bucketed by when the job was *surfaced*, not when it
 * was applied to: `first_seen` is the only date any row carries, and the
 * tracker has no date column to do better with.
 */
export function weeklySeries(rows: TimelineRow[], now: Date = new Date()): TimelineSeries {
  const by = (keep: (r: TimelineRow) => boolean) =>
    weeklyCounts(rows.filter(keep), SPARK_WEEKS, now);
  return {
    total: weeklyCounts(rows, SPARK_WEEKS, now),
    high: by((r) => r.fit === "high"),
    medium: by((r) => r.fit === "medium"),
    low: by((r) => r.fit === "low"),
    applied: by((r) => r.outcome !== null),
  };
}
