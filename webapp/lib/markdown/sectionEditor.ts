/**
 * Marker-scoped markdown editing.
 *
 * Claude Code and this webapp can both edit the same profile markdown. A
 * full-file write from either side would silently discard the other's work, so
 * every writer replaces only the span between a named BEGIN/END marker pair —
 * the convention `add-template.md` already established and `lint_skills.py`
 * `check_markers()` enforces repo-wide.
 *
 * NOT WIRED TO ANY UI IN v1. It is built and tested now so that the profile
 * edit form, when it lands, starts from a verified foundation. Nothing else in
 * `webapp/` writes to a repo file.
 *
 * Pure string in, string out: no fs, no imports, trivially testable.
 */

export class MarkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarkerError";
  }
}

export function beginMarker(name: string): string {
  return `<!-- BEGIN ${name} -->`;
}

export function endMarker(name: string): string {
  return `<!-- END ${name} -->`;
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count += 1;
    from = at + needle.length;
  }
}

/**
 * Replace the content between `<!-- BEGIN name -->` and `<!-- END name -->`.
 *
 * Throws on every ambiguous shape rather than guessing:
 *   - either marker missing
 *   - either marker appearing more than once
 *   - END appearing before BEGIN
 *
 * The markers themselves are preserved; only the span between them changes.
 * Line endings are matched to the file rather than imposed, the same rule
 * `profile_manager.py::sync_claude_md` follows — a repo edited on Windows must
 * not gain a whole-file CRLF/LF diff from one section edit.
 */
export function replaceMarkedSection(content: string, markerName: string, newContent: string): string {
  if (!markerName.trim()) {
    throw new MarkerError("Marker name must not be empty.");
  }

  const begin = beginMarker(markerName);
  const end = endMarker(markerName);

  const beginCount = countOccurrences(content, begin);
  const endCount = countOccurrences(content, end);

  if (beginCount === 0) throw new MarkerError(`Missing marker: ${begin}`);
  if (endCount === 0) throw new MarkerError(`Missing marker: ${end}`);
  if (beginCount > 1) throw new MarkerError(`Duplicate marker: ${begin} appears ${beginCount} times`);
  if (endCount > 1) throw new MarkerError(`Duplicate marker: ${end} appears ${endCount} times`);

  const beginAt = content.indexOf(begin);
  const endAt = content.indexOf(end);
  if (endAt < beginAt) {
    throw new MarkerError(`Unbalanced markers: ${end} appears before ${begin}`);
  }

  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const body = newContent.replace(/\r\n/g, "\n").replace(/\n/g, eol);
  const trimmed = body.replace(/^[\r\n]+|[\r\n]+$/g, "");

  const head = content.slice(0, beginAt + begin.length);
  const tail = content.slice(endAt);
  return `${head}${eol}${trimmed}${trimmed ? eol : ""}${tail}`;
}

/** Read the current content of a marked section, or throw if it is not resolvable. */
export function readMarkedSection(content: string, markerName: string): string {
  const begin = beginMarker(markerName);
  const end = endMarker(markerName);
  const beginAt = content.indexOf(begin);
  const endAt = content.indexOf(end);
  if (beginAt === -1) throw new MarkerError(`Missing marker: ${begin}`);
  if (endAt === -1) throw new MarkerError(`Missing marker: ${end}`);
  if (endAt < beginAt) throw new MarkerError(`Unbalanced markers: ${end} appears before ${begin}`);
  return content.slice(beginAt + begin.length, endAt).replace(/^[\r\n]+|[\r\n]+$/g, "");
}
