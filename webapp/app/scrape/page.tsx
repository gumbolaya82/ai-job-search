import PageHead from "@/components/PageHead";
import ScrapePanel from "@/components/ScrapePanel";
import { pointerWarning, readRegistry, resolveProfileId } from "@/lib/profileRegistry";
import { cancelScrape, scrapeStatus, startScrape } from "@/lib/scrape/runner";

/**
 * The scrape screen.
 *
 * Server-rendered so the last run is present on first paint — including after a
 * mid-run reload, which is the whole point of running the scrape as a detached
 * process rather than inside a request.
 */

export default async function ScrapePage({
  searchParams,
}: {
  searchParams: Promise<{ profile?: string }>;
}) {
  const params = await searchParams;

  let registry;
  try {
    registry = readRegistry();
  } catch (err) {
    return (
      <>
        <PageHead title="Scrape" search={false} />
        <div className="alert err">
          <b>Could not read the profile registry</b>
          <pre>{(err as Error).message}</pre>
        </div>
      </>
    );
  }

  const warning = pointerWarning(registry);
  const live = registry.profiles.filter((p) => !p.archived);

  // `?profile=` is how ⌘K's "Scrape <id>" arrives. Resolved against the registry
  // allowlist like every other caller-supplied id, and only ever used to
  // preselect a dropdown — it starts nothing.
  const preselect = params.profile ? resolveProfileId(params.profile) : null;

  const initialProfile = preselect ?? registry.active ?? live[0]?.id ?? "";
  const initial = initialProfile
    ? await scrapeStatus(initialProfile)
    : { run: null, lines: [], progress: { index: -1, label: null, finished: false } };

  return (
    <>
      <PageHead
        title="Scrape"
        crumb="runs /scrape as a real Claude Code session"
        active={registry.active}
        search={false}
      />

      {warning && (
        <div className="alert">
          <b>Pointer warning</b>
          {warning}
        </div>
      )}

      {live.length === 0 ? (
        <div className="alert err">
          <b>No live profiles</b>
          Create one on the Profiles screen first.
        </div>
      ) : (
        <ScrapePanel
          profiles={live}
          active={registry.active}
          preselect={preselect}
          initial={initial}
          actions={{ start: startScrape, cancel: cancelScrape }}
        />
      )}

      <footer className="pvfoot">
        The scrape runs under the skill&apos;s own tool allowlist · job postings are untrusted input
      </footer>
    </>
  );
}
