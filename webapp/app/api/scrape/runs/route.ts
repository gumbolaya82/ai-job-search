import { NextResponse } from "next/server";
import { activeProfileId, resolveProfileId } from "@/lib/profileRegistry";
import { listRunSummaries } from "@/lib/scrape/runStore";

/**
 * Every past scrape for a profile, newest first — the list behind the run
 * history, and the only way to reach a digest older than the last run.
 *
 * Summaries only. The rows a run found are untrusted posting text; they stay on
 * the server until the `.eml` route renders them through `digestHtml`, which is
 * the module that escapes them. Sending ten runs' worth of job rows here to
 * render ten counts would put that text in the browser for no reason.
 *
 * An unresolvable `profile` **refuses** rather than falling back to the active
 * one, for the same reason `/api/runs/status` does: a mistyped id must not
 * silently list someone else's runs. An absent param does mean "the active one".
 */

export const dynamic = "force-dynamic";

const LIMIT = 50;

export async function GET(request: Request) {
  const param = new URL(request.url).searchParams.get("profile");

  const profileId = param ? resolveProfileId(param) : activeProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Unknown profile." }, { status: 404 });
  }

  return NextResponse.json(
    { profile: profileId, runs: listRunSummaries(profileId, LIMIT) },
    // Local personal data, and a new run appears the moment one starts.
    { headers: { "Cache-Control": "no-store" } },
  );
}
