import fs from "node:fs";
import { NextResponse } from "next/server";
import { profilePath } from "@/lib/repoRoot";
import { resolveProfileId } from "@/lib/profileRegistry";
import { isValidRunId, listRunIds, readRun } from "@/lib/scrape/runStore";
import { digestSubject, renderDigest, renderDigestText } from "@/lib/email/digestHtml";
import { buildEml, emlFilename, htmlFilename, parseCandidateEmail } from "@/lib/email/emlBuilder";
import { renderReport } from "@/lib/report/reportHtml";
import { summarise, timelineForProfile, weeklySeries } from "@/lib/jobsTimeline";

/**
 * Downloads one run's digest, as a `.eml` draft or as the bare `.html` page.
 *
 * `run` arrives from a query string, so it gets the same treatment the documents
 * route gives its path segments: shape check first, then an allowlist match
 * against the directory listing. It is never joined into a path directly.
 *
 * The rows come from the run record's persisted `newJobs`, not from a fresh
 * diff. That is the point of persisting them — the digest stays correct after a
 * later scrape has moved the baseline.
 *
 * The two formats render through two different modules. `.eml` carries
 * `renderDigest`'s email body — inline-styled, light, table-laid-out, because
 * mail clients demand it. `?format=html` is only ever opened in a browser, so it
 * gets `renderReport`: the dashboard's dark theme, plus a strip of the run's own
 * facts and the profile's all-time stat cards and sparklines above the run's
 * table. The route keeps its `eml/`
 * path so the existing download URL does not break; the format is a parameter
 * rather than a sibling route so profile and run-id validation cannot drift
 * between the two.
 *
 * **Both formats download as attachments, never inline.** Job titles and company
 * names are untrusted posting text. `digestHtml` escapes them and gates link
 * protocols, but serving the page inline would place any escaping miss inside
 * this app's own origin. As a download it opens from `file://` instead, with no
 * access to the app.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const profileId = resolveProfileId(params.get("profile"));
  if (!profileId) {
    return new NextResponse("Not found", { status: 404 });
  }

  const runId = params.get("run") ?? "";
  if (!isValidRunId(runId) || !listRunIds(profileId).includes(runId)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const run = readRun(profileId, runId);
  if (!run) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (run.newJobs === null) {
    // Still running, or never observed finishing. There is nothing to digest yet.
    return new NextResponse("This run has not finished.", { status: 409 });
  }

  const meta = {
    profile: profileId,
    startedAt: run.startedAt,
    focus: run.args.focus || undefined,
    broad: run.args.broad,
  };

  // Local personal data: never let a proxy or the browser retain either format.
  const shared = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };

  if (params.get("format") === "html") {
    // The cards are all-time for this profile, like the dashboard's — a single
    // run would give the sparklines one bucket and nothing to show. The table
    // below stays the run's new jobs.
    const all = timelineForProfile(profileId);
    // The page's facts strip states the run itself — id, duration, cost — which
    // the email body has no use for, so those three ride alongside `meta`
    // rather than inside the shared `DigestMeta`.
    const report = renderReport(
      run.newJobs,
      { ...meta, runId: run.id, endedAt: run.endedAt, costUsd: run.costUsd },
      summarise(all),
      weeklySeries(all),
    );
    // No candidate-email lookup on this path — an HTML page has no recipient.
    return new NextResponse(report, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${htmlFilename(run.startedAt)}"`,
        ...shared,
      },
    });
  }

  const html = renderDigest(run.newJobs, meta);

  // A missing address is not a failure: the draft downloads unaddressed and the
  // UI says so. Guessing a recipient would be worse than leaving To: empty.
  let to = "";
  try {
    const profileMd = fs.readFileSync(profilePath(profileId, "01-candidate-profile.md"), "utf8");
    to = parseCandidateEmail(profileMd) ?? "";
  } catch {
    to = "";
  }

  const eml = buildEml({
    to,
    subject: digestSubject(run.newJobs, meta),
    html,
    text: renderDigestText(run.newJobs, meta),
    date: new Date(run.startedAt),
  });

  return new NextResponse(eml, {
    status: 200,
    headers: {
      "Content-Type": "message/rfc822; charset=utf-8",
      "Content-Disposition": `attachment; filename="${emlFilename(run.startedAt)}"`,
      ...shared,
    },
  });
}
