# /email-report - Package Job Summary + CVs/Cover Letters for Manual Email

Build a ready-to-attach local package summarizing the job search (rankings + fit) and bundling every generated CV/cover-letter PDF, so the user can attach it to an email themselves.

**This command never sends email.** No Gmail-send tool exists in this environment (`/gmail-sync`'s Gmail MCP connector is read-only), and no SMTP/email-API integration exists in this repo. This command only prepares a local folder; the user attaches and sends it manually from their own email client.

---

## Active Profile (resolve before anything else)

Read `.active-profile` at the repo root and bind `<profile>` to its contents. Every
`profiles/<profile>/...` path below resolves against it. If `.active-profile` is
missing, or names a directory that does not exist under `profiles/`, stop and tell
the user to run `python tools/profile_manager.py list`.

---

## Step 0: Parse Arguments

`$ARGUMENTS` may contain:

- Nothing → default output folder `profiles/<profile>/reports/email-ready-<YYYY-MM-DD>/` (today's date)
- `--to <email>` → override the suggested recipient for the printed checklist (does not send anything, just changes what's printed)

Create `profiles/<profile>/reports/` if it does not exist. If `profiles/<profile>/reports/email-ready-<YYYY-MM-DD>/` already exists from an earlier run today, overwrite it (idempotent, no accumulation within a day).

---

## Step 1: Collect Job Data

Read:

1. **`profiles/<profile>/job_scraper/seen_jobs.json`** — pull every entry with `status` of `new` or `ranked` (skip `skipped` and `expired`). For `ranked` entries, use `rank_score`/`rank_verdict`; for plain `new` entries, use the quick `fit` signal from `/scrape` (high/medium/low) since they haven't been through `/rank` yet. If the file is missing or empty, note that no jobs have been scraped yet and skip to Step 2 with an empty job list (documents can still be packaged on their own).
2. **`profiles/<profile>/job_search_tracker.csv`**, if it exists — tracked applications, for a short "Applications in progress" section. Skip this section entirely if the file does not exist; do not treat its absence as an error.

---

## Step 2: Collect Generated Documents

Glob `profiles/<profile>/cv/main_*.pdf` and `profiles/<profile>/cover_letters/cover_*.pdf`, **excluding** the master references `profiles/<profile>/cv/main_example.pdf` and `profiles/<profile>/cover_letters/cover_example.pdf` (those are templates, not application-ready output).

If a `.tex` file exists without a compiled `.pdf` next to it, skip it and note it in the summary output — do not attempt to compile it here (that's `/apply`'s job, with its own compile-and-inspect loop).

---

## Step 3: Build the Package

Create `profiles/<profile>/reports/email-ready-<date>/` with:

### `summary.html`
A single self-contained HTML file (inline CSS, no external dependencies — same self-contained approach as `/html-report`). Contents:

- Header: "Job Search Summary" + generation date
- **Job rankings table**, sorted by score/fit descending: Title · Company · Location · Fit/Score · Verdict · link to posting URL
- **Documents included** section: list each CV/cover-letter pair found in Step 2 by company/role, so the recipient email's reader knows what's attached without opening every file
- **Applications in progress** table from the tracker (if Step 1 found one): Company · Role · Status · Date
- HTML-escape every value pulled from `seen_jobs.json`/the tracker before interpolating it (company names and notes routinely contain `&`, `<`, `>`, quotes) — same rule as `/html-report`

### `documents/`
Copy every PDF found in Step 2 into this subfolder, named `<Company>_<Role>_CV.pdf` and `<Company>_<Role>_CoverLetter.pdf` (human-readable for an email attachment list, rather than the internal `main_<company>_<role>.pdf` naming).

---

## Step 4: Present the Manual-Send Checklist

Do not send anything. Print a checklist for the user to act on themselves:

```
## Email package ready: profiles/<profile>/reports/email-ready-<date>/

**Suggested recipient:** <email — from --to if given, else the Email field in
profiles/<profile>/01-candidate-profile.md>
**Suggested subject:** Job Search Update - <date>

**What's inside:**
- summary.html - job rankings and fit summary (N jobs)
- documents/ - N CV + N cover letter PDF(s)

**Next step (manual):** Open profiles/<profile>/reports/email-ready-<date>/summary.html in a browser
to review, then attach the documents/ folder contents to an email and send it
yourself. This command does not send email - nothing leaves this machine
until you do.
```

If Step 2 found zero PDFs, say so plainly ("No application documents generated yet — run `/apply` on a job first if you want CVs/cover letters included") rather than silently producing an empty `documents/` folder without comment.

---

## Design Principles

- **Never sends anything.** This command's entire output is local files plus a printed checklist. Actually emailing is a manual, human action every time — this is intentional, not a placeholder for a future auto-send feature.
- **Self-contained summary.** `summary.html` follows `/html-report`'s no-dependencies, inline-SVG-if-needed approach — it must open correctly offline, since it may be read from an email attachment on a different machine.
- **No fabrication.** Every row in the summary comes from `seen_jobs.json` or the tracker; every document listed is one actually found on disk in Step 2. Missing data is stated as missing, not inferred.
- **Deliberate exception to "documents never leave the machine."** `SECURITY.md` states that principle for automated/background syncs (e.g. `/notion-sync` syncs filenames only). This command is the one narrow, user-invoked exception — it exists specifically to prepare documents for the user to send themselves. Do not extend this pattern to any other command without the same explicit confirmation.
- **Idempotent per day.** Re-running the same day overwrites that day's folder rather than accumulating duplicates.
