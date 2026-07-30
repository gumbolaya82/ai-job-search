import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
LINTER_SCRIPT = REPO_ROOT / "tools" / "lint_skills.py"


def run_linter(root: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(root / "tools" / "lint_skills.py")],
        capture_output=True,
        text=True,
    )


class LinterRepoFixture(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)

        tools = self.root / "tools"
        tools.mkdir()
        shutil.copy(LINTER_SCRIPT, tools / "lint_skills.py")
        # The Python-test CI job does not install PyYAML; the separate lint job
        # does. These settings-focused tests only need a valid frontmatter map.
        (tools / "yaml.py").write_text(
            "class YAMLError(Exception):\n"
            "    pass\n\n"
            "def safe_load(_text):\n"
            "    return {'name': 'example', 'description': 'Example skill'}\n",
            encoding="utf-8",
        )

        command = self.root / ".claude" / "commands" / "setup.md"
        command.parent.mkdir(parents=True)
        command.write_text("# /setup - Test setup command\n", encoding="utf-8")

        skill = self.root / ".claude" / "skills" / "example" / "SKILL.md"
        skill.parent.mkdir(parents=True)
        skill.write_text(
            "---\nname: example\ndescription: Example skill\n---\n",
            encoding="utf-8",
        )

        self.settings = self.root / ".claude" / "settings.json"
        self.write_settings({"permissions": {"allow": []}})

    def write_settings(self, data):
        self.settings.write_text(json.dumps(data), encoding="utf-8")


class SettingsShapeTests(LinterRepoFixture):
    def test_valid_settings_pass(self):
        result = run_linter(self.root)

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("lint_skills: OK", result.stdout)

    def test_invalid_json_fails_cleanly(self):
        self.settings.write_text("{not json", encoding="utf-8")

        result = run_linter(self.root)

        self.assertEqual(result.returncode, 1)
        self.assertIn(".claude/settings.json", result.stdout)
        self.assertNotIn("Traceback", result.stderr)

    def test_non_object_root_fails_cleanly(self):
        for data in ([], "settings", 1, None):
            with self.subTest(data=data):
                self.write_settings(data)

                result = run_linter(self.root)

                self.assertEqual(result.returncode, 1)
                self.assertIn("top-level JSON value to be an object", result.stdout)
                self.assertNotIn("Traceback", result.stderr)

    def test_non_object_permissions_fails_cleanly(self):
        for permissions in ([], "permissions", 1, None):
            with self.subTest(permissions=permissions):
                self.write_settings({"permissions": permissions})

                result = run_linter(self.root)

                self.assertEqual(result.returncode, 1)
                self.assertIn("expected permissions to be an object", result.stdout)
                self.assertNotIn("Traceback", result.stderr)

    def test_non_list_allow_fails_cleanly(self):
        for allow in ({}, "Bash(bun run:*)", 1, None):
            with self.subTest(allow=allow):
                self.write_settings({"permissions": {"allow": allow}})

                result = run_linter(self.root)

                self.assertEqual(result.returncode, 1)
                self.assertIn("expected permissions.allow to be a list", result.stdout)
                self.assertNotIn("Traceback", result.stderr)


# --- check_command frontmatter handling -----------------------------------
# lint_skills' command check must tolerate frontmatter but still demand a
# title. These run against the real repo/tools (not the temp fixture above)
# since they exercise check_command directly.

ROOT = Path(__file__).resolve().parents[1]


def run_lint():
    return subprocess.run(
        [sys.executable, str(ROOT / "tools" / "lint_skills.py")],
        capture_output=True,
        text=True,
        cwd=ROOT,
    )


def test_repo_lints_clean():
    result = run_lint()
    assert result.returncode == 0, result.stdout + result.stderr


def test_command_with_frontmatter_and_no_title_fails(tmp_path, monkeypatch):
    sys.path.insert(0, str(ROOT / "tools"))
    import lint_skills

    bad = tmp_path / "bogus.md"
    bad.write_text("---\nallowed-tools: Read\n---\n\nNo title here\n", encoding="utf-8")
    lint_skills.errors.clear()
    lint_skills.check_command(bad)
    assert lint_skills.errors, "a command without a '# /<name>' title must fail"


def test_command_with_frontmatter_and_title_passes(tmp_path):
    sys.path.insert(0, str(ROOT / "tools"))
    import lint_skills

    good = tmp_path / "rank.md"
    good.write_text("---\nallowed-tools: Read, Task\n---\n\n# /rank - Triage\n", encoding="utf-8")
    lint_skills.errors.clear()
    lint_skills.check_command(good)
    assert not lint_skills.errors, lint_skills.errors


if __name__ == "__main__":
    unittest.main()
