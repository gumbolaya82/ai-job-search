import type { Metadata } from "next";
import "./globals.css";
import SideNav from "@/components/SideNav";
import CommandPalette from "@/components/CommandPalette";
import { UiProvider } from "@/components/UiState";
import { readRegistry, type ProfileRecord } from "@/lib/profileRegistry";
import { timelineForAllProfiles, type TimelineRow } from "@/lib/jobsTimeline";
import { latestRun } from "@/lib/scrape/runStore";
import { activateProfile } from "@/lib/profileOps";

export const metadata: Metadata = {
  title: "ai-job-search",
  description: "Local manager for job-search profiles, jobs and documents.",
};

// Every screen reads the filesystem, so nothing here may be statically cached.
export const dynamic = "force-dynamic";

/**
 * The shell: an icon rail, the scrolling page column, and ⌘K.
 *
 * The palette is app-wide, so its data has to be gathered here rather than on
 * the Jobs page — which is why the layout now reads the timeline and the newest
 * run. That is a few JSON files on a localhost app; the alternative is a palette
 * that only knows about jobs while you happen to be looking at jobs.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  let profiles: ProfileRecord[] = [];
  let active: string | null = null;
  let jobs: TimelineRow[] = [];
  let lastDigestHref: string | null = null;
  let lastDigestLabel: string | null = null;

  try {
    const registry = readRegistry();
    active = registry.active;
    profiles = registry.profiles;
  } catch {
    // The rail still renders when profile_manager.py cannot be reached; the
    // page body is where that failure gets explained.
  }

  try {
    jobs = timelineForAllProfiles();
  } catch {
    // No registry means no jobs; the palette simply has fewer entries.
  }

  if (active) {
    try {
      const run = latestRun(active);
      if (run) {
        lastDigestHref = `/api/scrape/eml?profile=${encodeURIComponent(run.profile)}&run=${encodeURIComponent(run.id)}&format=html`;
        lastDigestLabel = `${run.profile} · ${run.id}`;
      }
    } catch {
      // A missing or unreadable run directory just drops that one palette entry.
    }
  }

  return (
    <html lang="en">
      <body>
        <UiProvider>
          <div className="shell">
            <SideNav />
            <main className="main">
              <div className="wrap">{children}</div>
            </main>
          </div>
          <CommandPalette
            jobs={jobs}
            profiles={profiles}
            active={active}
            lastDigestHref={lastDigestHref}
            lastDigestLabel={lastDigestLabel}
            actions={{ activate: activateProfile }}
          />
        </UiProvider>
      </body>
    </html>
  );
}
