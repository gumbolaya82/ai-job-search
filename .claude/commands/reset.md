# /reset - Reset Candidate Profile Data

You are resetting parts of the job search framework back to a blank state so the user can start fresh with `/setup`.

**This command is destructive.** Nothing is deleted until the user explicitly confirms. Follow these steps exactly in order.

---

## Active Profile (resolve before anything else)

Read `.active-profile` at the repo root and bind `<profile>` to its contents. Every
`profiles/<profile>/...` path below resolves against it. If `.active-profile` is
missing, or names a directory that does not exist under `profiles/`, stop and tell
the user to run `python tools/profile_manager.py list`.

---

## Step 0: Parse Scope from Arguments

Check `$ARGUMENTS` for a scope keyword:

- `profile` — clears candidate profile data from skill files only
- `documents` — deletes user-provided files from the `profiles/<profile>/documents/` folder only
- `all` — both of the above

If `$ARGUMENTS` is empty or does not contain a recognized scope keyword, ask:

> **What would you like to reset?**
>
> - **`profile`** — Clears candidate data from the skill files (profile, behavioral, STAR examples, profile statements). The framework structure and writing rules are preserved. Use this to re-run `/setup` from scratch.
>
> - **`documents`** — Deletes all files you've placed in the `profiles/<profile>/documents/` folder (CV PDFs, LinkedIn export, diplomas, references, past applications). The folder structure and `README.md` are preserved.
>
> - **`all`** — Both of the above.
>
> Reply with `profile`, `documents`, or `all`.

Wait for the user's response before continuing.

---

## Step 1: Show Exactly What Will Be Cleared

Before doing anything, show the user precisely what will be wiped.

### If scope includes `profile`:

Read the current state of these files and report whether each has content or is already empty:

- `profiles/<profile>/01-candidate-profile.md`
- `profiles/<profile>/02-behavioral-profile.md`
- `profiles/<profile>/03-writing-style-patterns.md`
- `profiles/<profile>/04-job-evaluation-profile.md`
- `profiles/<profile>/05-cv-templates-profile.md`
- `profiles/<profile>/06-cover-letter-patterns.md`
- `profiles/<profile>/07-interview-prep-profile.md`

The shared framework files in `.claude/skills/job-application-assistant/` are never
touched by `/reset` — they hold no candidate data.

Present as:

```
## Profile reset will clear:

- 01-candidate-profile.md — [has content / already empty]
  Full file will be replaced with a blank template.

- 02-behavioral-profile.md — [has content / already empty]
  Full file will be replaced with a blank template.

- 04-job-evaluation-profile.md — [has content / already blank]
  Match areas, career goals and calibration will be cleared.

- 05-cv-templates-profile.md — [has profile statements / already blank]
  Profile statement templates will be cleared.

- 07-interview-prep-profile.md — [has STAR examples / already blank]
  STAR examples and any STAR candidate stubs will be cleared.

- 03-writing-style-patterns.md, 06-cover-letter-patterns.md — [has content / already blank]
  Inferred phrasing patterns will be cleared.

The shared framework files are NOT touched (they contain framework rules, not candidate data):
  - 03-writing-style.md, 04-job-evaluation.md, 05-cv-templates.md
  - 06-cover-letter-templates.md, 07-interview-prep.md
```

### If scope includes `documents`:

Use Glob to list all files present in `profiles/<profile>/documents/cv/`, `profiles/<profile>/documents/linkedin/`, `profiles/<profile>/documents/diplomas/`, `profiles/<profile>/documents/references/`, and `profiles/<profile>/documents/applications/`. Present as:

```
## Documents reset will delete:

profiles/<profile>/documents/cv/
  - [filename] or "(empty)"

profiles/<profile>/documents/linkedin/
  - [filename] or "(empty)"

profiles/<profile>/documents/diplomas/
  - [filename] or "(empty)"

profiles/<profile>/documents/references/
  - [filename] or "(empty)"

profiles/<profile>/documents/applications/
  - [subfolder/filename] or "(empty)"

The `.gitkeep` files that hold the folder structure are NOT deleted, and neither is
the shared `documents/README.md` at the repo root — it documents the layout for every
profile and is not part of this profile's data.
```

If all document subfolders are already empty, state "All document subfolders are already empty — nothing to delete." and skip the confirmation step for this scope.

---

## Step 2: Require Explicit Confirmation

Present the confirmation prompt:

> **This cannot be undone.**
>
> Type **`RESET`** (all caps) to confirm, or anything else to cancel.

Wait for the user's response.

- If the user types exactly `RESET`: proceed to Step 3.
- If the user types anything else: abort and tell them "Reset cancelled. Nothing was changed."

---

## Step 3: Execute the Reset

### Profile reset

**For `01-candidate-profile.md`**, replace the file content with:

```markdown
# Candidate Profile

<!-- Run /setup to populate this file -->

## Identity

## Education

## Professional Experience

## Independent Projects

## Technical Skills

## Publications

## Awards

## References
```

**For `02-behavioral-profile.md`**, replace the file content with:

```markdown
# Behavioral Profile

<!-- Run /setup to populate this file -->

## Overview

## Strongest Behavioral Traits

## How I Work Best

## Growth Areas

## Mapping to Job Posting Language

## Management Style Preferences

## Using This in Applications
```

**For the remaining profile fragments** — `03-writing-style-patterns.md`,
`04-job-evaluation-profile.md`, `05-cv-templates-profile.md`,
`06-cover-letter-patterns.md`, `07-interview-prep-profile.md` — restore each file to
the version in `profiles/_scaffold/`, which is the documented blank state for every
one of them.

Copy the scaffold file over the profile's copy. Do not hand-edit sections: the
scaffold is the single definition of "blank", and copying it keeps the
`PROFILE-EXTENSION-POINT`, `TEMPLATE:<id>` and `STAR:<n>` markers exactly as
`/setup` and `/add-template` expect to find them. Rebuilding those markers by hand
is how they drift.

After copying, run `python tools/lint_skills.py` to confirm the markers are intact.

### Documents reset

For each non-empty document subfolder, delete all files within it using Bash `rm`. Do not delete the folder itself, and do not delete `documents/README.md`.

```bash
find profiles/<profile>/documents -type f ! -name '.gitkeep' -delete
find profiles/<profile>/documents -mindepth 2 -type d -empty -delete
```

`! -name '.gitkeep'` keeps the folder structure intact, and `-mindepth 2` leaves the
seven top-level subfolders in place while clearing the per-application directories
nested under `applications/`.

---

## Step 4: Confirm What Was Done and Next Steps

After the reset is complete, report:

```
## Reset complete

### Cleared
[List each file/folder that was actually modified or cleared]

### Unchanged
[List anything that was already empty or was intentionally preserved]
```

Then tell the user what to do next based on what was reset:

**If profile was reset:**
> Your candidate profile is now blank. Run `/setup` to repopulate it. The command auto-detects any files in your `profiles/<profile>/documents/` folder and offers to read from there; otherwise it walks you through a CV import or interactive interview.

**If documents were reset:**
> The `profiles/<profile>/documents/` folder is now empty. Add your career documents and run `/setup` to populate your profile. See `documents/README.md` for instructions on what to put where.

**If both were reset:**
> Both your profile files and documents folder are now empty. Add documents to `profiles/<profile>/documents/` (or skip and use the CV import / interview path), then run `/setup`.
