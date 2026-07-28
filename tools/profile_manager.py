#!/usr/bin/env python3
"""Manage the job-search profiles that live under `profiles/<id>/`.

Run from anywhere: python tools/profile_manager.py <command> [args]

This repo can hold several people's job searches side by side. One profile is
"active" at a time; every command and skill resolves `profiles/<id>/...` from
the `.active-profile` pointer at the repo root before it reads or writes
anything.

This script is the ONLY implementation of profile mutation. The web app does
not reimplement any of it - `webapp/lib/profileOps.ts` shells out to this file
via execFileSync and parses stdout/stderr. Duplicating mutating logic across
Python and TypeScript is exactly the drift risk this arrangement exists to
remove.

Commands:
  list [--json]        Show every profile, marking the active one.
  create <id>          Copy profiles/_scaffold/ to profiles/<id>/.
  switch <id>          Point .active-profile at <id> and sync CLAUDE.md.
  archive <id>         Move profiles/<id>/ to profiles/archived/<id>/.
  restore <id>         Move profiles/archived/<id>/ back to profiles/<id>/.
  clear-lock <id>      Delete a stale profiles/<id>/.lock left by a crash.

Lock files: /scrape and /apply write `profiles/<id>/.lock` while they run so a
mid-command profile switch cannot repoint paths under a command's feet. The
file holds one line: an ISO-8601 UTC timestamp and the command name, e.g.
`2026-07-26T14:32:00Z /scrape`.

Stdlib only. Exit 0 on success, 1 with a failure list otherwise.
"""

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROFILES = ROOT / "profiles"
SCAFFOLD = PROFILES / "_scaffold"
ARCHIVED = PROFILES / "archived"
ACTIVE_FILE = ROOT / ".active-profile"
EXAMPLE_FILE = ROOT / ".active-profile.example"
CLAUDE_MD = ROOT / "CLAUDE.md"

# The managed block in root CLAUDE.md that `switch` keeps in sync. Same
# BEGIN/END convention as the template and profile-fragment markers, so
# lint_skills.py's check_markers() covers this file too.
MARKER_BEGIN = "<!-- BEGIN ACTIVE-PROFILE -->"
MARKER_END = "<!-- END ACTIVE-PROFILE -->"

# Directory names under profiles/ that are not themselves profiles.
RESERVED_IDS = {"archived", "_scaffold"}

# Containers that hold profiles rather than being one. Never a valid id for any
# subcommand: `switch archived` would otherwise succeed and point every command
# at the archive directory, since profiles/archived/ is a real directory as soon
# as anything has been archived. _scaffold is NOT here - it is a real (if
# placeholder) profile that you are allowed to switch to.
CONTAINER_DIRS = {"archived"}

# Conservative slug: no path separators, no leading dot, no "..". Keeps a
# profile id from escaping the profiles/ directory when it is joined onto a
# path, including when it arrives from the web app's create form.
ID_PATTERN = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9._-]*$")

errors: list[str] = []


def fail(message: str) -> None:
    errors.append(message)


def is_valid_id(profile_id: str) -> bool:
    """Pure predicate: is this a safe single path segment naming a real profile?

    Split out of `validate_id` so read-only consumers of the pointer can apply
    exactly the same rule without going through the `errors` list.
    """
    return bool(
        ID_PATTERN.match(profile_id)
        and ".." not in profile_id
        and profile_id not in CONTAINER_DIRS
    )


def validate_id(profile_id: str) -> bool:
    """`is_valid_id` with the user-facing failure messages attached."""
    if not ID_PATTERN.match(profile_id) or ".." in profile_id:
        fail(
            f"invalid profile id {profile_id!r}: use letters, digits, dot, dash and "
            "underscore only, starting with a letter, digit or underscore. A profile "
            "id becomes a directory name under profiles/."
        )
        return False
    if profile_id in CONTAINER_DIRS:
        fail(
            f"{profile_id!r} is the directory that holds archived profiles, not a "
            "profile. Run 'list' to see the real ones."
        )
        return False
    return True


def validate_new_id(profile_id: str) -> bool:
    """Stricter check for `create`: reject reserved and underscore-led names."""
    if not validate_id(profile_id):
        return False
    if profile_id in RESERVED_IDS:
        fail(f"{profile_id!r} is reserved and cannot be used as a profile id.")
        return False
    if profile_id.startswith("_"):
        fail(
            f"invalid profile id {profile_id!r}: a leading underscore is reserved for "
            "framework directories such as _scaffold."
        )
        return False
    return True


def read_active() -> str | None:
    """Return the active profile id, or None if the pointer is missing/blank.

    utf-8-sig, not utf-8: `.active-profile` is a one-line file people hand-edit,
    and a Windows editor that saves it with a BOM would otherwise turn the id
    into '\\ufeff<id>' - failing the slug check and sending every path to the
    scaffold, with no visible difference in the file.
    """
    try:
        value = ACTIVE_FILE.read_text(encoding="utf-8-sig").strip()
    except OSError:
        return None
    return value or None


def require_active(*, accept_bootstrap: bool = False) -> str | None:
    """Resolve the active profile, bootstrapping .active-profile if absent.

    Every command except `list` and `create` needs a pointer to exist. When it
    does not, seed it from the committed example and stop, so the user makes an
    explicit choice rather than silently operating on _scaffold.

    `accept_bootstrap` is for `switch`, and only `switch`: naming the profile
    you want *is* the explicit choice this bootstrap exists to force, so
    stopping afterwards would reject the very command that fixes the problem.
    Without it a fresh clone fails `create X` -> `switch X` on the first
    attempt and succeeds on an identical retry. archive/restore/clear-lock keep
    the hard stop - none of them is a statement about which profile you want.
    """
    active = read_active()
    if active:
        return active
    if not ACTIVE_FILE.exists():
        try:
            if EXAMPLE_FILE.exists():
                shutil.copyfile(EXAMPLE_FILE, ACTIVE_FILE)
            else:
                ACTIVE_FILE.write_text("_scaffold\n", encoding="utf-8")
            print(f"note: created .active-profile from {EXAMPLE_FILE.name}")
        except OSError as exc:
            fail(f".active-profile: could not create: {exc}")
            return None
        if accept_bootstrap:
            seeded = read_active()
            if seeded:
                return seeded
    fail(
        "No active profile set. Run: python tools/profile_manager.py create <id> "
        "then switch <id>"
    )
    return None


def active_profile_dir(fallback: str = "_scaffold") -> Path:
    """Resolve `profiles/<active>/` for read-only consumers of the pointer.

    Standalone tools (salary_lookup.py, convert_salary_excel.py) join the
    pointer's contents straight onto a path, and one of them mkdir -p's the
    result - so a hand-edited `.active-profile` holding `../..` would otherwise
    reach outside profiles/. The id therefore has to clear the same slug check
    every subcommand applies.

    A pointer that fails the check falls back to the scaffold with a warning
    rather than aborting: these are lookup tools, not profile mutation, and
    dying on startup would be a worse failure than reading placeholder data.
    """
    active = read_active()
    if active and not is_valid_id(active):
        print(
            f"warning: .active-profile contains {active!r}, which is not a valid "
            f"profile id - using {fallback!r} instead. Repair it with: "
            f"python tools/profile_manager.py switch <id>",
            file=sys.stderr,
        )
        active = None
    return PROFILES / (active or fallback)


def seed_latex_assets(target: Path) -> None:
    """Copy cover.cls and OpenFonts/ from the root fixture into a new profile.

    xelatex resolves `\\fontspec[Path = OpenFonts/fonts/raleway/]` relative to
    its working directory, and /apply compiles with `cd profiles/<id>/
    cover_letters`. So the class file and the font tree have to sit next to the
    .tex files rather than only at the repo root.

    They are copied at create time instead of being committed inside
    profiles/_scaffold/ so git carries exactly one copy of the ~30 font files.
    The per-profile copies are gitignored.
    """
    source = ROOT / "cover_letters"
    dest = target / "cover_letters"
    dest.mkdir(parents=True, exist_ok=True)
    for name in ("cover.cls", "OpenFonts"):
        src = source / name
        if not src.exists():
            print(f"warning: {source.name}/{name} not found - cover letters may not compile")
            continue
        try:
            if src.is_dir():
                shutil.copytree(src, dest / name, dirs_exist_ok=True)
            else:
                shutil.copyfile(src, dest / name)
        except OSError as exc:
            fail(f"{dest.relative_to(ROOT)}/{name}: copy failed: {exc}")


def profile_dir(profile_id: str) -> Path:
    return PROFILES / profile_id


def archived_dir(profile_id: str) -> Path:
    return ARCHIVED / profile_id


def lock_path(profile_id: str) -> Path:
    return profile_dir(profile_id) / ".lock"


def read_lock(profile_id: str) -> str | None:
    """Return the lock file's single line, or None when unlocked."""
    try:
        return lock_path(profile_id).read_text(encoding="utf-8").strip() or None
    except OSError:
        return None


def list_profile_ids() -> list[str]:
    if not PROFILES.is_dir():
        return []
    return sorted(
        p.name
        for p in PROFILES.iterdir()
        if p.is_dir() and p.name not in RESERVED_IDS
    )


def list_archived_ids() -> list[str]:
    if not ARCHIVED.is_dir():
        return []
    return sorted(p.name for p in ARCHIVED.iterdir() if p.is_dir())


def sync_claude_md(profile_id: str) -> None:
    """Rewrite the ACTIVE-PROFILE block in root CLAUDE.md.

    The block is a convenience pointer for anyone reading CLAUDE.md; the file
    `.active-profile` remains the single source of truth. A missing block is a
    warning, not a failure - `switch` must still succeed on a fork that has
    trimmed CLAUDE.md.
    """
    # newline="" on both read and write: Python's text mode would otherwise
    # translate the whole file to os.linesep on write, rewriting every line
    # ending on Windows each time anyone runs `switch`.
    try:
        with CLAUDE_MD.open("r", encoding="utf-8", newline="") as handle:
            content = handle.read()
    except OSError as exc:
        print(f"warning: CLAUDE.md not updated ({exc})")
        return
    if content.count(MARKER_BEGIN) != 1 or content.count(MARKER_END) != 1:
        print(
            f"warning: CLAUDE.md has no single {MARKER_BEGIN}/{MARKER_END} block - "
            "pointer not synced. .active-profile is still authoritative."
        )
        return
    start = content.index(MARKER_BEGIN)
    end = content.index(MARKER_END) + len(MARKER_END)
    # Match the newline style already in the file rather than imposing one.
    eol = "\r\n" if "\r\n" in content else "\n"
    block = (
        f"{MARKER_BEGIN}{eol}"
        f"**Active profile:** `{profile_id}` — see "
        f"[`profiles/{profile_id}/CLAUDE.md`](profiles/{profile_id}/CLAUDE.md){eol}"
        f"{MARKER_END}"
    )
    with CLAUDE_MD.open("w", encoding="utf-8", newline="") as handle:
        handle.write(content[:start] + block + content[end:])


def cmd_list(args: argparse.Namespace) -> None:
    active = read_active()
    records = []
    for pid in list_profile_ids():
        lock = read_lock(pid)
        records.append(
            {"id": pid, "active": pid == active, "archived": False, "lock": lock}
        )
    for pid in list_archived_ids():
        records.append(
            {"id": pid, "active": False, "archived": True, "lock": None}
        )
    if args.json:
        print(json.dumps({"active": active, "profiles": records}, indent=2))
        return
    if not records:
        print("No profiles yet. Create one: python tools/profile_manager.py create <id>")
    for record in records:
        marker = "*" if record["active"] else " "
        tags = []
        if record["archived"]:
            tags.append("archived")
        if record["lock"]:
            tags.append(f"locked: {record['lock']}")
        suffix = f"  ({', '.join(tags)})" if tags else ""
        print(f"{marker} {record['id']}{suffix}")
    # Pointer health is checked against the filesystem, not against `records`,
    # and is reported even when nothing is listed - an empty repo whose pointer
    # names a deleted profile is exactly the case the warning exists for. The
    # two lists would both give wrong answers here: _scaffold is a legal target
    # but is never listed, and an archived profile *is* listed while
    # profiles/<id>/ no longer exists.
    if active and not profile_dir(active).is_dir():
        if archived_dir(active).is_dir():
            print(
                f"\nwarning: .active-profile points at {active!r}, which is archived. "
                f"Restore it: python tools/profile_manager.py restore {active}"
            )
        else:
            print(
                f"\nwarning: .active-profile points at {active!r}, which does not exist. "
                f"Pick a real one: python tools/profile_manager.py switch <id>"
            )


def cmd_create(args: argparse.Namespace) -> None:
    profile_id = args.id
    if not validate_new_id(profile_id):
        return
    if not SCAFFOLD.is_dir():
        fail(f"profiles/_scaffold/ is missing - cannot seed a new profile from it.")
        return
    target = profile_dir(profile_id)
    if target.exists():
        fail(f"profiles/{profile_id}/ already exists.")
        return
    if archived_dir(profile_id).exists():
        fail(
            f"profiles/archived/{profile_id}/ exists. Restore it instead: "
            f"python tools/profile_manager.py restore {profile_id}"
        )
        return
    try:
        shutil.copytree(SCAFFOLD, target, ignore=shutil.ignore_patterns(".lock"))
    except OSError as exc:
        fail(f"profiles/{profile_id}/: copy from _scaffold failed: {exc}")
        return
    seed_latex_assets(target)
    if errors:
        return
    print(f"Created profiles/{profile_id}/ from the scaffold.")
    print(f"Next: python tools/profile_manager.py switch {profile_id}")
    print("Then run /setup to fill it in.")


def cmd_switch(args: argparse.Namespace) -> None:
    target_id = args.id
    if not validate_id(target_id):
        return
    current = require_active(accept_bootstrap=True)
    if current is None:
        return
    if not profile_dir(target_id).is_dir():
        if archived_dir(target_id).is_dir():
            fail(
                f"{target_id!r} is archived. Restore it first: "
                f"python tools/profile_manager.py restore {target_id}"
            )
        else:
            fail(
                f"profiles/{target_id}/ does not exist. Create it first: "
                f"python tools/profile_manager.py create {target_id}"
            )
        return
    # Refuse to move the pointer out from under a command that is still running
    # against the current profile.
    lock = read_lock(current)
    if lock and current != target_id:
        fail(
            f"Profile '{current}' has an in-progress command (started {lock}). "
            f"Wait for it to finish, or run 'clear-lock {current}' if it crashed."
        )
        return
    if current == target_id:
        # Still re-sync: switching to the profile you are already on is the
        # natural way to repair a CLAUDE.md pointer block that drifted.
        sync_claude_md(target_id)
        print(f"Already on {target_id}. Pointer block re-synced.")
        return
    try:
        ACTIVE_FILE.write_text(f"{target_id}\n", encoding="utf-8")
    except OSError as exc:
        fail(f".active-profile: could not write: {exc}")
        return
    sync_claude_md(target_id)
    print(f"Switched from {current} to {target_id}.")


def cmd_archive(args: argparse.Namespace) -> None:
    profile_id = args.id
    if not validate_id(profile_id):
        return
    if require_active() is None:
        return
    if profile_id in RESERVED_IDS:
        fail(f"{profile_id!r} is a framework directory and cannot be archived.")
        return
    source = profile_dir(profile_id)
    if not source.is_dir():
        fail(f"profiles/{profile_id}/ does not exist.")
        return
    lock = read_lock(profile_id)
    if lock:
        fail(
            f"Profile '{profile_id}' has an in-progress command (started {lock}). "
            f"Wait for it to finish, or run 'clear-lock {profile_id}' if it crashed."
        )
        return
    target = archived_dir(profile_id)
    if target.exists():
        fail(f"profiles/archived/{profile_id}/ already exists - remove or rename it first.")
        return
    try:
        ARCHIVED.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source), str(target))
    except OSError as exc:
        fail(f"profiles/{profile_id}/: archive failed: {exc}")
        return
    print(f"Archived {profile_id} to profiles/archived/{profile_id}/.")
    if read_active() == profile_id:
        # Always the placeholder, never the alphabetically-first survivor:
        # auto-selecting a real profile would silently bind the next /apply or
        # /scrape to a different person's directory, which is the one mistake
        # this whole restructure exists to prevent. _scaffold holds nothing but
        # [PLACEHOLDER] tokens, so landing there is loud and harmless.
        try:
            ACTIVE_FILE.write_text("_scaffold\n", encoding="utf-8")
        except OSError as exc:
            fail(
                f".active-profile: still names the archived {profile_id!r} and could "
                f"not be reset: {exc}. Set it yourself: "
                f"python tools/profile_manager.py switch <id>"
            )
            return
        sync_claude_md("_scaffold")
        print(
            "It was the active profile; the pointer now names the '_scaffold' "
            "placeholder. Choose a real one: "
            "python tools/profile_manager.py switch <id>"
        )


def cmd_restore(args: argparse.Namespace) -> None:
    profile_id = args.id
    if not validate_id(profile_id):
        return
    if require_active() is None:
        return
    source = archived_dir(profile_id)
    if not source.is_dir():
        fail(f"profiles/archived/{profile_id}/ does not exist.")
        return
    target = profile_dir(profile_id)
    if target.exists():
        fail(f"profiles/{profile_id}/ already exists - rename it before restoring.")
        return
    try:
        shutil.move(str(source), str(target))
    except OSError as exc:
        fail(f"profiles/archived/{profile_id}/: restore failed: {exc}")
        return
    print(f"Restored {profile_id} to profiles/{profile_id}/.")
    print(f"To use it: python tools/profile_manager.py switch {profile_id}")


def cmd_clear_lock(args: argparse.Namespace) -> None:
    profile_id = args.id
    if not validate_id(profile_id):
        return
    if require_active() is None:
        return
    if not profile_dir(profile_id).is_dir():
        fail(f"profiles/{profile_id}/ does not exist.")
        return
    path = lock_path(profile_id)
    if not path.exists():
        print(f"No lock on {profile_id}.")
        return
    lock = read_lock(profile_id)
    try:
        path.unlink()
    except OSError as exc:
        fail(f"profiles/{profile_id}/.lock: could not remove: {exc}")
        return
    print(f"Cleared lock on {profile_id} (was: {lock}).")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="profile_manager.py",
        description="Manage job-search profiles under profiles/<id>/.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_list = sub.add_parser("list", help="show every profile, marking the active one")
    p_list.add_argument("--json", action="store_true", help="machine-readable output")
    p_list.set_defaults(func=cmd_list)

    p_create = sub.add_parser("create", help="copy profiles/_scaffold/ to profiles/<id>/")
    p_create.add_argument("id")
    p_create.set_defaults(func=cmd_create)

    p_switch = sub.add_parser("switch", help="point .active-profile at <id>")
    p_switch.add_argument("id")
    p_switch.set_defaults(func=cmd_switch)

    p_archive = sub.add_parser("archive", help="move a profile into profiles/archived/")
    p_archive.add_argument("id")
    p_archive.set_defaults(func=cmd_archive)

    p_restore = sub.add_parser("restore", help="move a profile back out of archived/")
    p_restore.add_argument("id")
    p_restore.set_defaults(func=cmd_restore)

    p_clear = sub.add_parser("clear-lock", help="delete a stale .lock left by a crash")
    p_clear.add_argument("id")
    p_clear.set_defaults(func=cmd_clear_lock)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    args.func(args)
    if errors:
        # Failures go to stderr: the web app shells out to this script and
        # reads stdout for `list --json`, so diagnostics must not pollute it.
        print(f"profile_manager: {len(errors)} failure(s)", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
