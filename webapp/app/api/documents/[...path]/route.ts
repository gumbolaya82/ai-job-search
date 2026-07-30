import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { profilePath } from "@/lib/repoRoot";
import { resolveProfileId } from "@/lib/profileRegistry";
import { SERVABLE_EXTENSIONS } from "@/lib/documents";

/**
 * Streams one file out of `profiles/<id>/`.
 *
 * This is the only route that turns a URL into a filesystem read, so it carries
 * three independent guards. Any one of them alone would probably do; a route
 * that serves someone's CV, address and diplomas gets all three:
 *
 *   1. the profile id must match a live profile in the registry (allowlist),
 *   2. `profilePath()` re-resolves and asserts containment under `profiles/`,
 *   3. the extension must be one we intend to serve.
 */

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".tex": "text/plain; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;

  if (!segments || segments.length < 2) {
    return new NextResponse("Not found", { status: 404 });
  }

  const [rawProfile, ...rest] = segments;
  const profileId = resolveProfileId(decodeURIComponent(rawProfile));
  if (!profileId) {
    return new NextResponse("Not found", { status: 404 });
  }

  const relative = rest.map((s) => decodeURIComponent(s));
  // Reject traversal before it reaches the filesystem, so a rejected request
  // never depends on the resolver alone.
  if (relative.some((s) => s === ".." || s === "." || s.includes("\0") || path.isAbsolute(s))) {
    return new NextResponse("Not found", { status: 404 });
  }

  let target: string;
  try {
    target = profilePath(profileId, ...relative);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const ext = path.extname(target).toLowerCase();
  if (!SERVABLE_EXTENSIONS.has(ext)) {
    return new NextResponse("Not found", { status: 404 });
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(target);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!stat.isFile()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const body = fs.readFileSync(target);
  const filename = path.basename(target).replace(/"/g, "");
  // .html is served as an attachment, never inline: report HTML embeds scraped
  // job-posting text (title, company - untrusted, third-party data per this
  // repo's own rules), and inline rendering would execute any unescaped script
  // in it at this app's own origin, reachable to the mutating server actions.
  const disposition = ext === ".html" ? `attachment; filename="${filename}"` : `inline; filename="${filename}"`;
  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      "Content-Length": String(stat.size),
      "Content-Disposition": disposition,
      // Local personal data: never let a proxy or the browser retain it.
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
