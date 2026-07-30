# Webapp

> **See every job you've ever surfaced, across all profiles, merged with outcome
> status, in one screen — something neither `seen_jobs.json` nor the tracker CSV
> gives you alone.**

A local Next.js app for browsing and managing `profiles/<id>/`. No database, no
auth, no accounts — it reads the same flat files Claude Code reads.

## Run it

```bash
cd webapp
npm install
npm run dev          # http://localhost:3000
```

Requires Node 22.6+ (24 recommended: `npm test` relies on native TypeScript
stripping) and `python` on PATH.

## Localhost only

This app serves a real person's CV, home address, employment history and
diplomas over HTTP with no authentication. It is a single-user tool for the
machine it runs on.

**Never bind it to a public interface.** No `-H 0.0.0.0`, no port forwarding, no
reverse proxy.

Note that plain `next dev` binds to **all** interfaces and prints a
`Network: http://192.168.x.x:3000` line — anyone on your LAN could read the CV.
The `dev` and `start` scripts therefore pass `-H 127.0.0.1` explicitly. Run them
through `npm run dev` / `npm start`; do not invoke `next dev` directly.

## Four screens

| Screen | Route | What it does |
|---|---|---|
| **Jobs** | `/` | Every job ever surfaced, all profiles, joined with tracker outcomes |
| **Scrape** | `/scrape` | Runs a real `/scrape`, then offers the new jobs as a `.eml` digest |
| **Profiles** | `/profiles` | Create, activate, archive, restore |
| **Documents** | `/documents` | Browse and open a profile's CVs, cover letters and reports |

## What it will not do

`/apply` and `/outcome` are **not** invocable from here, and the reason is
unchanged: they depend on the reviewer sub-agent and the verification checklist,
which live in a Claude Code session with a human in it. Where the webapp would
want to start one, it gives you the exact command to paste instead.

`/scrape` is the exception — see below.

Jobs and Documents remain strictly read-only.

## The Scrape screen runs a real agent

`/scrape` is not a script. `.claude/skills/job-scraper/SKILL.md` has Claude read
each portal's own `SKILL.md`, translate `search-queries.md` into that portal's
flags, fetch details, judge fit, run health checks and emit referral links. Only
step 1b is a deterministic CLI call. So the button spawns a **headless Claude
Code**:

```ts
spawn("claude", ["-p", "/job-scraper", "--allowedTools", …], { detached: true })
```

Facts worth knowing before you click it:

- **It costs money and takes minutes.** A measured run: 231 seconds, 28 turns,
  $0.39. The confirm dialog is the only brake, by design.
- **The skill is invoked as `/job-scraper`, not `/scrape`.** Claude Code
  registers a skill under its *directory* name; the `name:` in the frontmatter is
  not what the slash command resolves to.
- **The tool allowlist is read from `SKILL.md` at runtime**, so it tracks the
  skill instead of drifting from it. `lib/scrape/claudeCli.ts` adds `Skill` and
  drops `AskUserQuestion` (nobody can answer it headlessly); both deltas are
  commented there.
- **The run cannot delete its own lock.** Claude Code's workspace-trust sandbox
  refuses it. `lib/scrape/runner.ts` clears `profiles/<id>/.lock` itself on every
  terminal path — completion, failure and cancel.
- **Scraping a non-active profile switches to it**, because `/scrape` resolves
  its target from `.active-profile` and takes no argument. The confirm dialog
  says so. It is not switched back afterwards: silently restoring would leave the
  repo disagreeing with what you just watched happen.
- **Cancel kills the process tree** (`taskkill /PID … /T /F`), because `claude`
  spawns `bun` children. Windows-only, consistent with this repo's `python`
  (not `python3`) assumption.
- **Cancel is confirmed and run-scoped**, because it is destructive too: a stray
  click killed a live paying run on 2026-07-29. It now takes a second click, and
  `cancelScrape` requires the run id the client is watching — `cancelRefusal()` in
  `lib/scrape/runStore.ts` refuses when that is no longer the live run, so a stale
  tab cannot kill a newer scrape.

### Trust boundary

This button hands an agent with `Write` access to a repo containing a real
person's CV and address, and points it at job postings — **untrusted text fetched
from the internet**. Prompt injection is now reachable from a UI control.

What bounds the blast radius is the mirrored allowlist: no arbitrary `Bash`, only
`bun run .agents/skills/*/cli/src/cli.ts`. That is why the allowlist was chosen
over `--dangerously-skip-permissions`. A spike confirmed the containment holds —
the agent's attempts to reach `PowerShell`, `python3` and shell heredocs were all
refused, and the run still completed.

The focus box is treated as untrusted too: letters, digits, spaces and hyphens
only, capped at 60 characters, rejected visibly rather than silently rewritten.

### Where run state lives, and why

`profiles/<id>/reports/scrape-runs/<runId>/{run.json,scrape.log}`.

`.gitignore` already ignores `**/reports/`, so the logs — which contain the full
Claude transcript and real job data — can never be committed. This location is
load-bearing: `job_scraper/` is ignored by three exact-name rules only, so run
state there *would* be committable. Moving this path means changing `.gitignore`
and `tools/security_guards.py` together.

### The email is a draft, never a send

Nothing in this repo can send mail — the Gmail connector is read-only and there
is no SMTP. **Download email (.eml)** produces an RFC 5322 file that opens
pre-filled in your mail client; you press Send.

"New jobs from this run" is computed by diffing `seen_jobs.json` against a
snapshot taken before the run — not by parsing the agent's prose — and the result
is persisted into `run.json` so the digest stays correct after a later scrape has
moved the baseline.

## Python is the only implementation

Every mutation — create, activate, archive, restore, force-switch — is a Server
Action in `lib/profileOps.ts` that shells out:

```ts
execFileSync("python", ["tools/profile_manager.py", cmd, id], { cwd: repoRoot() })
```

It parses stdout on success and stderr on failure. **It reimplements nothing.**
Duplicating mutation rules in TypeScript is the drift bug this design exists to
prevent, which is why there are no API routes for these either.

Read-only listing also goes through `profile_manager.py list --json`, so the two
surfaces can never disagree about which profile is active or locked.

## Path safety

Profile ids arrive from URLs. They are resolved **by allowlist** against the
registry (`resolveProfileId`), never by pattern-matching, then `profilePath()`
re-resolves and asserts the result is still under `profiles/`. The file-serving
route adds a third guard: an extension allowlist. See
`app/api/documents/[...path]/route.ts`.

## Tests

```bash
npm test        # node --test, all unit suites
npm run build   # type-check + production build
```

The suites are pure-function only and never spawn `claude`: argv and allowlist
construction (`claudeCli`), the `seen_jobs.json` diff (`seenDiff`), the log
formatter (`logFormat`), the digest HTML (`digestHtml`), the MIME builder
(`emlBuilder`) and the marker editor (`sectionEditor`). CI runs the same command
and must never attempt a real scrape.

Modules loaded by `node --test` import each other with explicit `.ts`
extensions — Node's resolver does not guess them, and
`allowImportingTsExtensions` in `tsconfig.json` permits it.

`lib/markdown/sectionEditor.ts` is built and tested but **wired to no UI**. It
exists so the profile edit form, when it lands, starts from a verified
foundation.

## Known build warning

`next build` prints `Encountered unexpected file in NFT list`. `lib/repoRoot.ts`
walks the filesystem to locate the repo root, which defeats static tracing.
Output file tracing only matters when deploying a bundle; this app is never
deployed. The warning is expected.

## Dependencies

Four runtime packages: `next`, `react`, `react-dom` (plus `typescript` and types
in dev). No Tailwind, no component library, no chart library — the design tokens
in `app/globals.css` are lifted from the HTML reports this repo already
generates, so both surfaces read as one system.

`npm audit` reports advisories in `postcss` and `sharp`, both transitive
dependencies of Next.js itself, with no patched Next release available at the
time of writing. `npm audit fix --force` would downgrade Next to 9.x and is not
an option.
