import fs from "node:fs";
import { profilePath } from "../repoRoot.ts";

/**
 * Minimal reader for `profiles/<id>/job_search_tracker.csv`.
 *
 * Read-only in v1. The file frequently does not exist — `diane` has never run
 * `/outcome` — so absence is a normal state returning [], never an error.
 */

export type TrackerRow = {
  date: string;
  company: string;
  sector: string;
  role: string;
  role_type: string;
  channel: string;
  status: string;
  contact_person: string;
  fit_rating: string;
  notes: string;
  cv_file: string;
  cover_letter_file: string;
  source: string;
};

/** Split one CSV line, honouring quoted fields and "" escapes. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

export function parseTrackerCsv(text: string): TrackerRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((key, i) => {
      row[key] = (cells[i] ?? "").trim();
    });
    return row as unknown as TrackerRow;
  });
}

export function readTracker(profileId: string): TrackerRow[] {
  const file = profilePath(profileId, "job_search_tracker.csv");
  if (!fs.existsSync(file)) return [];
  try {
    return parseTrackerCsv(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}
