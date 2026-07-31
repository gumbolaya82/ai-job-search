import { NextResponse } from "next/server";
import { activeProfileId, resolveProfileId } from "@/lib/profileRegistry";
import { scrapeStatus } from "@/lib/scrape/runner";
import { runStatus } from "@/lib/runs/actions";
import type { CommandId } from "@/lib/runs/runStore";

/**
 * Poll target for every run banner: the newest run record plus a formatted
 * log tail, for whichever command's status is asked for.
 *
 * An unresolvable `profile` **refuses**. It does not quietly fall back to the
 * active profile — that fallback is a fixed bug in this codebase, documented on
 * the Documents page, and reintroducing it here would mean a mistyped id
 * silently reports someone else's run. An absent param is a different thing and
 * does mean "the active profile".
 */

export const dynamic = "force-dynamic";

const COMMANDS: readonly CommandId[] = ["scrape", "rank", "apply"];

function isCommandId(value: string): value is CommandId {
  return (COMMANDS as readonly string[]).includes(value);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const param = url.searchParams.get("profile");
  const commandParam = url.searchParams.get("command") ?? "scrape";

  if (!isCommandId(commandParam)) {
    return NextResponse.json({ error: `Unknown command '${commandParam}'.` }, { status: 400 });
  }

  const profileId = param ? resolveProfileId(param) : activeProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Unknown profile." }, { status: 404 });
  }

  // /scrape keeps its own well-tested status path (its finalise computes the
  // seen-diff `newJobs`); every other command goes through the generic one.
  const status =
    commandParam === "scrape" ? await scrapeStatus(profileId) : await runStatus(profileId, commandParam);

  return NextResponse.json(
    { profile: profileId, ...status },
    // Run state changes every few seconds and carries real job data.
    { headers: { "Cache-Control": "no-store" } },
  );
}
