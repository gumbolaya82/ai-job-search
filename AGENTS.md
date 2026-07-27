---
framework_version: 1.0.0
---

# Agent Guidelines: AI Job Search

This workspace is structured to manage job search activities, scraper tools, CVs, cover letters, and interview preparation.

## Thin-Pointer Design (Single Source of Truth)

To prevent duplication and configuration drift across different AI agent frameworks (Claude Code, Google Antigravity, Codex, Cursor, Gemini CLI, etc.), this workspace uses a unified thin-pointer design. All agent runtimes should load the canonical specifications and candidate profiles from the files and directories below:

1. **Personal Candidate Profile:**
   - This repo supports **multiple candidate profiles**. The repo-root file `.active-profile` names the one in effect; resolve it first and read every personal path below as `profiles/<id>/...`. Use [tools/profile_manager.py](tools/profile_manager.py) (`list` / `create` / `switch` / `archive` / `restore` / `clear-lock`) to inspect or change it — never edit `.active-profile` by hand while a command is running.
   - The candidate profile, contact details, education, and target preferences are defined in `profiles/<id>/CLAUDE.md` plus `profiles/<id>/01-candidate-profile.md` and `02-behavioral-profile.md`. Root [CLAUDE.md](CLAUDE.md) is shared framework text and holds no candidate data.
   - The reusable methodology lives in [.claude/skills/job-application-assistant/](.claude/skills/job-application-assistant/) (`03-*.md` through `07-*.md`) and is shared by every profile. Files `04`, `05` and `07` mark where profile content belongs with a `<!-- BEGIN PROFILE-EXTENSION-POINT -->` block and pair with a `profiles/<id>/0N-*-profile.md` fragment — read both halves.
2. **Canonical Workflow Specifications:**
   - The step-by-step instructions and triggers for tasks (setup, scrape, rank, apply, upskill, interview) are defined in the [.claude/](.claude/) directory (specifically under `.claude/skills/` and `.claude/commands/`).
   - Do not duplicate these rules or specifications. Treat `.claude/` files as the single source of truth.
3. **Portal Search Skills:**
   - Job-portal search CLIs live under [.agents/skills/](.agents/skills/) in the portable Agent Skills format (with a `SKILL.md` per portal). Codex and Antigravity discover these automatically; the `/scrape` workflow in [.claude/skills/job-scraper/](.claude/skills/job-scraper/) orchestrates them.
