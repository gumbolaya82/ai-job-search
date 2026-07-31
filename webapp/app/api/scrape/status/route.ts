import { GET as runsStatusGET } from "@/app/api/runs/status/route";

/**
 * `/api/scrape/status` is `/api/runs/status?command=scrape` (the general
 * route's default), kept as its own URL because `ScrapePanel` already polls
 * it. See `app/api/runs/status/route.ts` for the profile-resolution logic —
 * including the comment about why an unresolvable `profile` refuses rather
 * than falling back to the active one — and everything else this delegates to.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return runsStatusGET(request);
}
