#!/usr/bin/env python3
"""Structural regression test for the multi-profile machinery.

Run from anywhere: python tools/smoke_test_profiles.py

Exercises the full create -> switch -> write -> switch back -> archive cycle
against a throwaway profile, and asserts the profile that was active when the
run started comes out byte-identical. That is the property the whole
`profiles/<id>/` restructure exists to guarantee: work done under one profile
can never land in, or disturb, another.

No network and no LLM calls - this checks plumbing, not judgement. Safe to run
on a populated repo: it restores the original active profile before exiting,
including when an assertion fails partway through.

Stdlib only. Exit 0 on success, 1 with a failure list otherwise.
"""

import hashlib
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANAGER = ROOT / "tools" / "profile_manager.py"
PROFILES = ROOT / "profiles"
ACTIVE_FILE = ROOT / ".active-profile"
THROWAWAY = "smoke-test-throwaway"

errors: list[str] = []


def fail(message: str) -> None:
    errors.append(message)


def run(*args: str) -> subprocess.CompletedProcess:
    """Invoke profile_manager.py the same way a user or the web app would."""
    return subprocess.run(
        [sys.executable, str(MANAGER), *args],
        capture_output=True,
        text=True,
        cwd=str(ROOT),
    )


def expect_ok(label: str, result: subprocess.CompletedProcess) -> bool:
    if result.returncode != 0:
        fail(f"{label}: exited {result.returncode}: {result.stderr.strip()}")
        return False
    return True


def snapshot(directory: Path) -> dict[str, str]:
    """Map every file under `directory` to a hash of its bytes.

    Content hashes rather than mtimes: copying a tree can preserve mtimes while
    corrupting content, and a rewrite that happens to restore identical bytes is
    not a regression worth failing on.
    """
    result: dict[str, str] = {}
    for path in sorted(directory.rglob("*")):
        if path.is_file():
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            result[str(path.relative_to(directory)).replace("\\", "/")] = digest
    return result


def describe_drift(before: dict[str, str], after: dict[str, str]) -> list[str]:
    drift = []
    for name in sorted(set(before) - set(after)):
        drift.append(f"deleted: {name}")
    for name in sorted(set(after) - set(before)):
        drift.append(f"created: {name}")
    for name in sorted(set(before) & set(after)):
        if before[name] != after[name]:
            drift.append(f"modified: {name}")
    return drift


def cleanup(original_active: str | None) -> None:
    """Best-effort teardown. Runs even when the test failed midway."""
    for candidate in (PROFILES / THROWAWAY, PROFILES / "archived" / THROWAWAY):
        if candidate.exists():
            shutil.rmtree(candidate, ignore_errors=True)
    archived = PROFILES / "archived"
    if archived.is_dir() and not any(archived.iterdir()):
        archived.rmdir()
    if original_active is not None:
        ACTIVE_FILE.write_text(f"{original_active}\n", encoding="utf-8")
        run("switch", original_active)


def main() -> int:
    if not MANAGER.is_file():
        print(f"smoke_test_profiles: tools/profile_manager.py not found", file=sys.stderr)
        return 1

    original_active = None
    if ACTIVE_FILE.exists():
        original_active = ACTIVE_FILE.read_text(encoding="utf-8").strip() or None
    if original_active is None:
        # Nothing to protect and nothing to restore; seed the scaffold so the
        # rest of the run has a baseline profile to switch back to.
        original_active = "_scaffold"
        ACTIVE_FILE.write_text("_scaffold\n", encoding="utf-8")

    baseline_dir = PROFILES / original_active
    if not baseline_dir.is_dir():
        print(
            f"smoke_test_profiles: active profile {original_active!r} has no directory "
            f"under profiles/ - nothing to protect",
            file=sys.stderr,
        )
        return 1

    if (PROFILES / THROWAWAY).exists() or (PROFILES / "archived" / THROWAWAY).exists():
        print(
            f"smoke_test_profiles: {THROWAWAY!r} already exists - remove it and re-run",
            file=sys.stderr,
        )
        return 1

    before = snapshot(baseline_dir)

    try:
        if expect_ok("create", run("create", THROWAWAY)):
            # The scaffold seeds a complete profile, including LaTeX assets.
            for expected in ("CLAUDE.md", "01-candidate-profile.md",
                             "cover_letters/cover.cls"):
                if not (PROFILES / THROWAWAY / expected).exists():
                    fail(f"create: new profile is missing {expected}")

        if expect_ok("switch to throwaway", run("switch", THROWAWAY)):
            active_now = ACTIVE_FILE.read_text(encoding="utf-8").strip()
            if active_now != THROWAWAY:
                fail(f"switch: .active-profile is {active_now!r}, expected {THROWAWAY!r}")

        # Write into the throwaway. This is the step that would contaminate the
        # baseline profile if any path resolution were wrong.
        marker = PROFILES / THROWAWAY / "smoke-marker.md"
        marker.write_text("written by smoke_test_profiles\n", encoding="utf-8")

        # A lock on the throwaway must block switching away from it.
        lock = PROFILES / THROWAWAY / ".lock"
        lock.write_text("2026-01-01T00:00:00Z /scrape\n", encoding="utf-8")
        locked = run("switch", original_active)
        if locked.returncode == 0:
            fail("switch: succeeded while the current profile held a .lock")
        if expect_ok("clear-lock", run("clear-lock", THROWAWAY)):
            if lock.exists():
                fail("clear-lock: .lock still present")

        expect_ok("switch back", run("switch", original_active))
        expect_ok("archive", run("archive", THROWAWAY))
        if (PROFILES / THROWAWAY).exists():
            fail("archive: profiles/<id>/ still present after archiving")
        if not (PROFILES / "archived" / THROWAWAY).is_dir():
            fail("archive: profiles/archived/<id>/ was not created")

        expect_ok("restore", run("restore", THROWAWAY))
        if not (PROFILES / THROWAWAY / "smoke-marker.md").is_file():
            fail("restore: archive/restore did not round-trip the profile contents")

        after = snapshot(baseline_dir)
        drift = describe_drift(before, after)
        if drift:
            fail(
                f"the baseline profile {original_active!r} changed during the run - "
                "profile isolation is broken: " + "; ".join(drift)
            )
    finally:
        cleanup(original_active)

    if errors:
        print(f"smoke_test_profiles: {len(errors)} failure(s)", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1
    print(
        f"smoke_test_profiles: OK (create/switch/lock/archive/restore cycle left "
        f"{original_active!r} byte-identical)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
