import { NextResponse } from "next/server";
import { activeProfileId, resolveProfileId } from "@/lib/profileRegistry";
import { scrapeStatus } from "@/lib/scrape/runner";

/**
 * Poll target for the run panel: the newest run record plus a formatted log tail.
 *
 * An unresolvable `profile` **refuses**. It does not quietly fall back to the
 * active profile — that fallback is a fixed bug in this codebase, documented on
 * the Documents page, and reintroducing it here would mean a mistyped id
 * silently reports someone else's run. An absent param is a different thing and
 * does mean "the active profile".
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const param = new URL(request.url).searchParams.get("profile");

  const profileId = param ? resolveProfileId(param) : activeProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Unknown profile." }, { status: 404 });
  }

  const status = await scrapeStatus(profileId);
  return NextResponse.json(
    { profile: profileId, ...status },
    // Run state changes every few seconds and carries real job data.
    { headers: { "Cache-Control": "no-store" } },
  );
}
