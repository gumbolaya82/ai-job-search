/**
 * The fit vocabulary and its sort order, in a module with no imports.
 *
 * It lives apart from `jobsTimeline.ts` — which is where it started — so that
 * the email digest can share the exact ordering the tables use without dragging
 * the filesystem-reading half of that module in behind it. Two places sorting
 * "high first" by two hand-written constants is precisely the drift this repo
 * avoids elsewhere.
 */

export type FitLevel = "high" | "medium" | "low";

export const FIT_RANK: Record<FitLevel, number> = { high: 0, medium: 1, low: 2 };

/** Display label for a fit level, used by the digest. */
export const FIT_LABEL: Record<FitLevel, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};
