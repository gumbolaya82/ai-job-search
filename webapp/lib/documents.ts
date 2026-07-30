import fs from "node:fs";
import path from "node:path";
import { profilePath } from "./repoRoot";

/**
 * Read-only document browser for one profile.
 *
 * v1 never creates a document: a CV or cover letter comes from `/apply`, which
 * means LaTeX compilation, the reviewer sub-agent and the verification
 * checklist. Every empty category therefore carries the command that fills it.
 */

export type DocFile = {
  name: string;
  /** Path relative to profiles/<id>/, used as the download route's parameter. */
  rel: string;
  size: number;
  modified: string;
};

export type DocCategory = {
  label: string;
  dir: string;
  /** The Claude Code command that populates this category when it is empty. */
  hint: string;
  files: DocFile[];
};

/**
 * LaTeX build artifacts are noise in a document browser. `.cls` is the cover
 * letter's class file — template plumbing, and not a servable extension, so
 * listing it would only produce a link that 404s.
 */
const BUILD_JUNK = new Set([
  ".aux",
  ".log",
  ".out",
  ".synctex",
  ".gz",
  ".fls",
  ".fdb_latexmk",
  ".cls",
]);
const SKIP_NAMES = new Set([".gitkeep"]);
/** Font directories are template plumbing, not documents. */
const SKIP_DIRS = new Set(["OpenFonts"]);

function listFiles(profileId: string, dir: string, recursive: boolean): DocFile[] {
  let root: string;
  try {
    root = profilePath(profileId, dir);
  } catch {
    return [];
  }
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];

  const out: DocFile[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (recursive && !SKIP_DIRS.has(entry.name)) walk(full);
        continue;
      }
      if (SKIP_NAMES.has(entry.name)) continue;
      if (BUILD_JUNK.has(path.extname(entry.name).toLowerCase())) continue;
      const stat = fs.statSync(full);
      out.push({
        name: entry.name,
        rel: path.relative(profilePath(profileId), full).split(path.sep).join("/"),
        size: stat.size,
        modified: stat.mtime.toISOString().slice(0, 10),
      });
    }
  };
  walk(root);
  out.sort((a, b) => b.modified.localeCompare(a.modified) || a.name.localeCompare(b.name));
  return out;
}

const CATEGORIES: { label: string; dir: string; hint: string; recursive: boolean }[] = [
  { label: "Tailored CVs", dir: "cv", hint: "/apply <job-url>", recursive: false },
  { label: "Cover letters", dir: "cover_letters", hint: "/apply <job-url>", recursive: false },
  { label: "Master CV", dir: "documents/cv", hint: "drop a PDF into documents/cv/", recursive: true },
  { label: "Applications archive", dir: "documents/applications", hint: "/outcome", recursive: true },
  { label: "Job postings", dir: "documents/postings", hint: "/apply saves the posting here", recursive: true },
  { label: "Diplomas", dir: "documents/diplomas", hint: "drop files into documents/diplomas/", recursive: true },
  { label: "References", dir: "documents/references", hint: "drop files into documents/references/", recursive: true },
  { label: "LinkedIn export", dir: "documents/linkedin", hint: "drop files into documents/linkedin/", recursive: true },
  { label: "Interview records", dir: "documents/interview", hint: "/interview", recursive: true },
  { label: "Reports", dir: "reports", hint: "/html-report", recursive: true },
];

export function documentsFor(profileId: string): DocCategory[] {
  return CATEGORIES.map((c) => ({
    label: c.label,
    dir: c.dir,
    hint: c.hint,
    files: listFiles(profileId, c.dir, c.recursive),
  }));
}

/** Extensions the download route will serve. Anything else 404s. */
export const SERVABLE_EXTENSIONS = new Set([".pdf", ".tex", ".html", ".md", ".json", ".csv", ".txt"]);

// Re-exported so existing importers keep working; the definition now lives in a
// leaf module the client-side browser can reach. See lib/fmtSize.ts.
export { fmtSize } from "./fmtSize";
