/**
 * Byte formatting, in a module with no imports.
 *
 * It lives apart from `documents.ts` — which is where it started — for the same
 * reason `fitRank.ts` lives apart from `jobsTimeline.ts`: the client-side
 * document browser needs this one function, and importing it from a module that
 * opens with `node:fs` would drag the filesystem into the browser bundle.
 */
export function fmtSize(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
