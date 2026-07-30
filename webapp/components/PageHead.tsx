"use client";

import { useUi } from "./UiState";

/**
 * The sticky page header.
 *
 * It carries three things that used to be scattered: the page title, the
 * active-profile line (previously stranded at the bottom of the sidebar, which
 * the icon rail has no room for), and the single global search field that
 * replaced both the right-aligned active badge and JobsTable's own filter input.
 *
 * `search` is off for screens with nothing to filter — the Scrape screen keeps
 * only the ⌘K hint, because a search box that filters nothing is a dead control.
 */

type Props = {
  title: string;
  /** The count line, e.g. "412 ever surfaced, all profiles". */
  crumb?: React.ReactNode;
  active?: string | null;
  search?: boolean;
  /** Placeholder for the search field, so it names what this screen filters. */
  placeholder?: string;
};

export default function PageHead({
  title,
  crumb,
  active,
  search = true,
  placeholder = "Search jobs, profiles, documents…",
}: Props) {
  const { query, setQuery, setPaletteOpen } = useUi();

  return (
    <div className="pagehead">
      <h1>{title}</h1>
      {crumb !== undefined && <div className="crumb">{crumb}</div>}
      {active !== undefined && (
        <div className="crumb activeline">
          active <b>{active ?? "none"}</b>
        </div>
      )}

      <div className="headsearch">
        {search && (
          <div className="searchbox">
            <span className="gl" aria-hidden="true">
              ⌕
            </span>
            {/* Deliberately not type="search": Chromium draws its own clear
                widget for that, which would sit next to the ✕ below. */}
            <input
              type="text"
              value={query}
              placeholder={placeholder}
              aria-label="Search jobs, profiles and documents"
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button type="button" className="x" aria-label="Clear search" onClick={() => setQuery("")}>
                ✕
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          className="kbdhint"
          onClick={() => setPaletteOpen(true)}
          title="Command palette"
        >
          ⌘K
        </button>
      </div>
    </div>
  );
}
