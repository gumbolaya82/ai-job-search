"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * The two pieces of UI state that outlive a single screen.
 *
 * `query` backs the one search field in the page header. It is app-level rather
 * than per-card state because there is now one field, not three: typing a
 * company on Jobs and then switching to Documents keeps the filter, which is the
 * point of hoisting it out of JobsTable's local state.
 *
 * `paletteOpen` lives here so anything can open ⌘K — the header hint, a button,
 * a future empty-state action — without prop-drilling through server components.
 */

type Ui = {
  query: string;
  setQuery: (q: string) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
};

const UiContext = createContext<Ui | null>(null);

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const value = useMemo(
    () => ({ query, setQuery, paletteOpen, setPaletteOpen }),
    [query, paletteOpen],
  );
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): Ui {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("useUi must be used inside <UiProvider>");
  return ctx;
}

/** The trimmed, lowercased query — what every consumer actually filters on. */
export function useQueryTerm(): string {
  const { query } = useUi();
  return useMemo(() => query.trim().toLowerCase(), [query]);
}

/** Opens the palette; handy for empty-state buttons. */
export function useOpenPalette(): () => void {
  const { setPaletteOpen } = useUi();
  return useCallback(() => setPaletteOpen(true), [setPaletteOpen]);
}
