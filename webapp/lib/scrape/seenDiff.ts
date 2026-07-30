/**
 * "Which jobs did this run surface?", answered by diffing `seen_jobs.json`.
 *
 * Not by parsing Claude's prose. The agent's closing summary is free text that
 * changes shape between runs; `seen_jobs.json` is the file the skill's Step 4 is
 * contractually required to write, so it is the only trustworthy signal.
 *
 * Pure and import-free so it can be tested without a filesystem.
 */

export type SeenEntry = {
  title?: string;
  company?: string;
  url?: string;
  first_seen?: string;
  fit?: string;
  status?: string;
  portal?: string;
};

export type SeenFile = { seen?: Record<string, SeenEntry> };

/**
 * Top-level keys of the `seen` map.
 *
 * In practice these are job URLs, but the skill documents the key as
 * `<url_or_company_title_key>`, so nothing here may assume that.
 */
export function seenKeys(parsed: unknown): string[] {
  const seen = (parsed as SeenFile | null)?.seen;
  return seen && typeof seen === "object" ? Object.keys(seen) : [];
}

export function parseSeenFile(text: string): SeenFile {
  try {
    const parsed = JSON.parse(text) as SeenFile;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Keys present after the run that were absent before it. */
export function addedKeys(before: readonly string[], after: readonly string[]): string[] {
  const had = new Set(before);
  return after.filter((key) => !had.has(key));
}

/**
 * Translate added `seen_jobs.json` keys into `timelineForProfile()` row keys.
 *
 * `timelineForProfile()` drops the map keys (it iterates `Object.values`) and
 * keys each row `<profile>:<url>`, falling back to `<profile>:<index>` when an
 * entry carries no `url`. So the join goes through the entry's `url` field, not
 * through the map key — the two are usually equal but are not the same thing.
 *
 * An entry with no `url` cannot be matched and is dropped. That is malformed
 * scraper output rather than a job worth emailing, and silently including the
 * wrong row would be worse than omitting it.
 */
export function timelineKeysForAdded(
  profileId: string,
  added: readonly string[],
  after: SeenFile,
): Set<string> {
  const seen = after.seen ?? {};
  const keys = new Set<string>();
  for (const key of added) {
    const url = seen[key]?.url;
    if (url) keys.add(`${profileId}:${url}`);
  }
  return keys;
}

/** Narrow a timeline to the rows this run added. */
export function filterRowsByKey<T extends { key: string }>(
  rows: readonly T[],
  keys: ReadonlySet<string>,
): T[] {
  return rows.filter((row) => keys.has(row.key));
}
