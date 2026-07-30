"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TimelineRow } from "@/lib/jobsTimeline";
import type { ProfileRecord } from "@/lib/profileRegistry";
import type { OpResult } from "@/lib/profileOps";
import { fuzzyRank } from "@/lib/fuzzy";
import { copyText } from "@/lib/clipboard";
import { useUi } from "./UiState";

/**
 * ⌘K.
 *
 * Two kinds of entry, deliberately kept apart in the list: *actions*, which do
 * something, and *jobs*, which are 400-odd rows you would otherwise reach by
 * scrolling a table. ↵ on a job copies its `/apply <url>` — the same bridge
 * CopyCommand is, minus the hunt for the row.
 *
 * One thing the palette will NOT do is start a scrape. That spends real money,
 * and the confirm step on the Scrape screen is the guard rail; a fuzzy list
 * where "sc" is one keystroke from a four-minute paid run is exactly the wrong
 * place to lose it. "Scrape <profile>" navigates to that screen with the
 * profile preselected, and the confirm still stands.
 */

type Props = {
  jobs: TimelineRow[];
  profiles: ProfileRecord[];
  active: string | null;
  /** Href of the newest run's HTML digest, when there is one. */
  lastDigestHref: string | null;
  lastDigestLabel: string | null;
  actions: { activate: (id: string) => Promise<OpResult> };
};

type Entry = {
  id: string;
  glyph: string;
  text: string;
  sub?: string;
  /** Searchable text — usually richer than what is displayed. */
  hay: string;
  run: () => void | Promise<void>;
};

/*
 * Actions are few and the list scrolls, so the cap is high enough that an empty
 * query shows every one of them — two per profile plus the four destinations.
 * Jobs are capped hard: there are hundreds, and a palette is not a table.
 */
const MAX_ACTIONS = 24;
const MAX_JOBS = 7;

export default function CommandPalette({
  jobs,
  profiles,
  active,
  lastDigestHref,
  lastDigestLabel,
  actions,
}: Props) {
  const { paletteOpen, setPaletteOpen } = useUi();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setPaletteOpen(false);
    setQuery("");
    setCursor(0);
  };

  // ⌘K / Ctrl+K anywhere. Bound on the document because the palette has no
  // trigger of its own on most screens — the header hint is a convenience.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!paletteOpen);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [paletteOpen, setPaletteOpen]);

  useEffect(() => {
    if (paletteOpen) inputRef.current?.focus();
    else setFlash(null);
  }, [paletteOpen]);

  const allActions = useMemo<Entry[]>(() => {
    const live = profiles.filter((p) => !p.archived);
    const out: Entry[] = [];

    for (const p of live) {
      out.push({
        id: `scrape:${p.id}`,
        glyph: "⟳",
        text: `Scrape ${p.id}`,
        sub: "opens the confirm",
        hay: `scrape ${p.id} run search jobs`,
        run: () => router.push(`/scrape?profile=${encodeURIComponent(p.id)}`),
      });
    }

    for (const p of live) {
      if (p.id === active) continue;
      out.push({
        id: `switch:${p.id}`,
        glyph: "◎",
        text: `Switch active profile to ${p.id}`,
        sub: "profile_manager.py switch",
        hay: `switch active profile ${p.id}`,
        run: () =>
          startTransition(async () => {
            await actions.activate(p.id);
            router.refresh();
          }),
      });
    }

    if (lastDigestHref) {
      out.push({
        id: "digest",
        glyph: "✉",
        text: "Open the last digest",
        sub: lastDigestLabel ?? undefined,
        hay: "open last digest email report run",
        run: () => {
          window.open(lastDigestHref, "_blank", "noopener");
        },
      });
    }

    for (const [href, label, glyph] of [
      ["/", "Jobs", "▤"],
      ["/scrape", "Scrape", "⟳"],
      ["/profiles", "Profiles", "◎"],
      ["/documents", "Documents", "▥"],
    ] as const) {
      out.push({
        id: `go:${href}`,
        glyph,
        text: `Go to ${label}`,
        hay: `go to ${label}`,
        run: () => router.push(href),
      });
    }

    return out;
  }, [profiles, active, lastDigestHref, lastDigestLabel, actions, router]);

  const jobEntries = useMemo<Entry[]>(
    () =>
      jobs
        .filter((j) => j.url)
        .map((j) => ({
          id: `job:${j.key}`,
          glyph: "↵",
          text: `${j.title} — ${j.company}`,
          sub: `copy /apply · ${j.fit}`,
          hay: `${j.title} ${j.company} ${j.profile}`,
          run: async () => {
            await copyText(`/apply ${j.url}`);
            setFlash(`Copied /apply ${j.url}`);
            setTimeout(() => setFlash(null), 1600);
          },
        })),
    [jobs],
  );

  const shownActions = useMemo(
    () => fuzzyRank(allActions, query, (e) => e.hay, MAX_ACTIONS),
    [allActions, query],
  );
  const shownJobs = useMemo(
    () => (query.trim() ? fuzzyRank(jobEntries, query, (e) => e.hay, MAX_JOBS) : []),
    [jobEntries, query],
  );
  const flat = useMemo(() => [...shownActions, ...shownJobs], [shownActions, shownJobs]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  if (!paletteOpen) return null;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (flat.length ? (c + 1) % flat.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (flat.length ? (c - 1 + flat.length) % flat.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      void choose(flat[cursor]);
    }
  }

  async function choose(entry: Entry | undefined) {
    if (!entry) return;
    const isJob = entry.id.startsWith("job:");
    await entry.run();
    // A copy leaves the palette open so you can grab the next one; anything
    // that navigates or mutates closes it.
    if (!isJob) close();
  }

  return (
    <div
      className="pal-back"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="pal" role="dialog" aria-modal="true" aria-label="Command palette">
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Run a command, or find a job…"
          aria-label="Command palette"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />

        <div className="list">
          {shownActions.length > 0 && <div className="grouplab">actions</div>}
          {shownActions.map((entry, i) => (
            <Option key={entry.id} entry={entry} selected={i === cursor} onPick={choose} />
          ))}

          {shownJobs.length > 0 && <div className="grouplab">jobs · ↵ copies /apply</div>}
          {shownJobs.map((entry, i) => (
            <Option
              key={entry.id}
              entry={entry}
              selected={i + shownActions.length === cursor}
              onPick={choose}
            />
          ))}

          {flat.length === 0 && <div className="none">Nothing matches “{query}”.</div>}
        </div>

        <div className="foot">
          <span>↑↓ move</span>
          <span>↵ run</span>
          <span>esc close</span>
          {flash && <span style={{ color: "var(--accent-text)" }}>{flash}</span>}
        </div>
      </div>
    </div>
  );
}

function Option({
  entry,
  selected,
  onPick,
}: {
  entry: Entry;
  selected: boolean;
  onPick: (e: Entry) => void | Promise<void>;
}) {
  return (
    <button
      type="button"
      className={`opt${selected ? " sel" : ""}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => void onPick(entry)}
    >
      <span className="gl" aria-hidden="true">
        {entry.glyph}
      </span>
      <span className="txt">{entry.text}</span>
      {entry.sub && <span className="sub">{entry.sub}</span>}
    </button>
  );
}
