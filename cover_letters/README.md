# `cover_letters/` (repo root) — fixture, not a person's letters

This directory is **shared framework**, not personal data:

| File | Purpose |
|---|---|
| `cover_example.tex` | CI compile fixture, and the seed copied into new profiles |
| `cover.cls` | the letter document class (requires `fontspec` — compile with **xelatex**) |
| `OpenFonts/` | the **only** tracked copy of the ~30 Lato/Raleway font files |

`python tools/profile_manager.py create <id>` copies `cover.cls` and `OpenFonts/`
into `profiles/<id>/cover_letters/` so xelatex resolves them as siblings of the
`.tex` it compiles. Those copies are gitignored
(`profiles/**/cover_letters/cover.cls`, `profiles/**/cover_letters/OpenFonts/`),
which is what keeps exactly one set of fonts in git.

**Never personalize these.** Real letters belong at
`profiles/<id>/cover_letters/cover_<company>_<role>.tex`, covered by the
`**/cover_letters/cover_*.tex` ignore rule.

See the Repo Structure table in [`../CLAUDE.md`](../CLAUDE.md).
