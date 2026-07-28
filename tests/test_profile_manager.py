"""Tests for tools/profile_manager.py — id validation, pointer resolution,
`list` pointer health, and the active-profile fallback on `archive`.

smoke_test_profiles.py already drives the happy path end to end as a
subprocess. These cover the edge cases it deliberately does not touch: a
malformed or dangling `.active-profile`, and archiving the profile you are
currently on.
"""

import argparse
import io
import sys
import tempfile
import unittest
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "tools"))

import profile_manager  # noqa: E402


class ProfileManagerTestCase(unittest.TestCase):
    """Builds a throwaway repo and repoints profile_manager's globals at it."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        self.root = root
        self.profiles = root / "profiles"
        self.active_file = root / ".active-profile"
        self.claude_md = root / "CLAUDE.md"

        (self.profiles / "_scaffold").mkdir(parents=True)
        (self.profiles / "_scaffold" / "CLAUDE.md").write_text(
            "# [PLACEHOLDER]\n", encoding="utf-8"
        )
        self.claude_md.write_text(
            f"# Test\n\n{profile_manager.MARKER_BEGIN}\n"
            f"**Active profile:** `_scaffold`\n"
            f"{profile_manager.MARKER_END}\n",
            encoding="utf-8",
        )

        patches = {
            "ROOT": root,
            "PROFILES": self.profiles,
            "SCAFFOLD": self.profiles / "_scaffold",
            "ARCHIVED": self.profiles / "archived",
            "ACTIVE_FILE": self.active_file,
            "EXAMPLE_FILE": root / ".active-profile.example",
            "CLAUDE_MD": self.claude_md,
        }
        for name, value in patches.items():
            patcher = mock.patch.object(profile_manager, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

        # `errors` is module-level state shared by every command.
        profile_manager.errors.clear()
        self.addCleanup(profile_manager.errors.clear)
        self.addCleanup(self._tmp.cleanup)

    def make_profile(self, profile_id: str) -> Path:
        target = self.profiles / profile_id
        target.mkdir(parents=True)
        (target / "CLAUDE.md").write_text(f"# {profile_id}\n", encoding="utf-8")
        return target

    def set_active(self, value: str, *, bom: bool = False) -> None:
        encoding = "utf-8-sig" if bom else "utf-8"
        self.active_file.write_text(f"{value}\n", encoding=encoding)

    def run_list(self, as_json: bool = False) -> str:
        buffer = io.StringIO()
        with redirect_stdout(buffer):
            profile_manager.cmd_list(argparse.Namespace(json=as_json))
        return buffer.getvalue()

    def run_archive(self, profile_id: str) -> str:
        buffer = io.StringIO()
        with redirect_stdout(buffer):
            profile_manager.cmd_archive(argparse.Namespace(id=profile_id))
        return buffer.getvalue()


class IsValidIdTests(ProfileManagerTestCase):
    def test_accepts_ordinary_ids(self):
        for good in ("diane", "diane-nguyen", "d1", "_scaffold", "a.b_c-d"):
            self.assertTrue(profile_manager.is_valid_id(good), good)

    def test_rejects_traversal_and_separators(self):
        for bad in ("..", "../evil", "a/b", "a\\b", ".hidden", "", "-lead"):
            self.assertFalse(profile_manager.is_valid_id(bad), bad)

    def test_rejects_the_archive_container(self):
        self.assertFalse(profile_manager.is_valid_id("archived"))

    def test_agrees_with_validate_id(self):
        """The predicate and the message-emitting check must not drift apart."""
        for candidate in ("diane", "..", "../evil", "archived", "_scaffold", "a/b"):
            profile_manager.errors.clear()
            self.assertEqual(
                profile_manager.is_valid_id(candidate),
                profile_manager.validate_id(candidate),
                candidate,
            )


class ActiveProfileDirTests(ProfileManagerTestCase):
    def test_resolves_a_valid_pointer(self):
        self.make_profile("diane")
        self.set_active("diane")
        self.assertEqual(
            profile_manager.active_profile_dir(), self.profiles / "diane"
        )

    def test_missing_pointer_falls_back_to_scaffold(self):
        self.assertEqual(
            profile_manager.active_profile_dir(), self.profiles / "_scaffold"
        )

    def test_traversal_pointer_cannot_escape_profiles(self):
        """The mkdir -p in convert_salary_excel.py rides on this check."""
        self.set_active("../../evil")
        buffer = io.StringIO()
        with redirect_stderr(buffer):
            resolved = profile_manager.active_profile_dir()
        self.assertEqual(resolved, self.profiles / "_scaffold")
        self.assertIn("not a valid profile id", buffer.getvalue())
        self.assertEqual(self.profiles, resolved.parent)

    def test_pointer_written_with_a_bom_still_resolves(self):
        self.make_profile("diane")
        self.set_active("diane", bom=True)
        buffer = io.StringIO()
        with redirect_stderr(buffer):
            resolved = profile_manager.active_profile_dir()
        self.assertEqual(resolved, self.profiles / "diane")
        self.assertEqual("", buffer.getvalue())


class ListPointerHealthTests(ProfileManagerTestCase):
    def test_dangling_pointer_warns_even_with_no_profiles(self):
        """The empty-repo case is exactly what the warning exists for."""
        self.set_active("deleted-person")
        output = self.run_list()
        self.assertIn("No profiles yet", output)
        self.assertIn("warning:", output)
        self.assertIn("deleted-person", output)

    def test_scaffold_is_not_reported_as_missing(self):
        """_scaffold is a legal target but is never listed as a profile."""
        self.set_active("_scaffold")
        self.assertNotIn("warning:", self.run_list())

    def test_archived_active_profile_gets_a_restore_hint(self):
        self.make_profile("diane")
        self.set_active("diane")
        self.run_archive("diane")
        self.set_active("diane")
        output = self.run_list()
        self.assertIn("archived", output)
        self.assertIn("restore diane", output)

    def test_json_output_stays_parseable(self):
        import json

        self.set_active("deleted-person")
        payload = json.loads(self.run_list(as_json=True))
        self.assertEqual("deleted-person", payload["active"])


class FreshCloneBootstrapTests(ProfileManagerTestCase):
    """`.active-profile` is gitignored, so every clone starts without one."""

    def setUp(self):
        super().setUp()
        (self.root / ".active-profile.example").write_text(
            "_scaffold\n", encoding="utf-8"
        )
        self.assertFalse(self.active_file.exists())

    def run_switch(self, profile_id: str) -> str:
        buffer = io.StringIO()
        with redirect_stdout(buffer):
            profile_manager.cmd_switch(argparse.Namespace(id=profile_id))
        return buffer.getvalue()

    def test_create_then_switch_succeeds_on_the_first_attempt(self):
        self.make_profile("diane")
        self.run_switch("diane")
        self.assertEqual([], profile_manager.errors)
        self.assertEqual("diane", profile_manager.read_active())

    def test_switch_still_rejects_a_profile_that_does_not_exist(self):
        self.run_switch("nobody")
        self.assertTrue(profile_manager.errors)
        self.assertIn("does not exist", profile_manager.errors[0])

    def test_archive_still_stops_on_an_unbootstrapped_pointer(self):
        """Only `switch` accepts the bootstrap; the rest must still stop."""
        self.make_profile("diane")
        self.run_archive("diane")
        self.assertTrue(profile_manager.errors)
        self.assertIn("No active profile set", profile_manager.errors[0])
        self.assertTrue((self.profiles / "diane").is_dir())


class ArchiveActiveProfileTests(ProfileManagerTestCase):
    def test_never_auto_selects_another_persons_profile(self):
        """Archiving Alice must not silently bind the next command to Bob."""
        self.make_profile("alice")
        self.make_profile("bob")
        self.set_active("alice")

        self.run_archive("alice")

        self.assertEqual([], profile_manager.errors)
        self.assertEqual("_scaffold", profile_manager.read_active())

    def test_tells_the_user_to_choose(self):
        self.make_profile("alice")
        self.set_active("alice")
        output = self.run_archive("alice")
        self.assertIn("_scaffold", output)
        self.assertIn("switch", output)

    def test_archiving_an_inactive_profile_leaves_the_pointer_alone(self):
        self.make_profile("alice")
        self.make_profile("bob")
        self.set_active("alice")

        self.run_archive("bob")

        self.assertEqual([], profile_manager.errors)
        self.assertEqual("alice", profile_manager.read_active())

    def test_pointer_write_failure_is_reported_not_swallowed(self):
        self.make_profile("alice")
        self.set_active("alice")
        with mock.patch.object(
            profile_manager.Path, "write_text", side_effect=OSError("read-only")
        ):
            self.run_archive("alice")
        self.assertTrue(
            any("could not be reset" in err for err in profile_manager.errors),
            profile_manager.errors,
        )


if __name__ == "__main__":
    unittest.main()
