# `cv/` (repo root) — fixture, not a person's CV

This directory is **shared framework**, not personal data. It holds exactly one
file: `main_example.tex`.

That file has two jobs:

1. **CI compile fixture.** `.github/workflows/ci.yml` compiles it to prove the
   LaTeX toolchain and the moderncv setup still work.
2. **Seed for new profiles.** `python tools/profile_manager.py create <id>`
   copies it to `profiles/<id>/cv/main_example.tex`.

**Never personalize it.** A real CV belongs at
`profiles/<id>/cv/main_<company>_<role>.tex`, where `.gitignore`'s
`**/cv/main_*.tex` rule keeps it out of git. The two `!` negations that re-include
example files name exact paths (`!cv/main_example.tex`,
`!profiles/_scaffold/cv/main_example.tex`) — they must never be widened to `**/`,
or every profile's real CV becomes committable.

See the Repo Structure table in [`../CLAUDE.md`](../CLAUDE.md).
