#!/usr/bin/env python3
"""Lint the repo's skill, command, and settings files.

Run from anywhere: python tools/lint_skills.py

Checks:
- Every SKILL.md (.claude/skills/*, .agents/skills/*) has YAML frontmatter that
  parses, with non-empty `name` and `description` keys
- `allowed-tools` entries of the form `Bash(bun run <path> *)` point at files
  that exist (skill paths resolve relative to the repo root and to .agents/)
- Every .claude/commands/*.md starts with a `# /<name>` title
- .claude/settings.json is valid JSON with a permissions.allow list

Exit code 0 on success, 1 with a failure list otherwise.
"""

import json
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("lint_skills.py requires PyYAML: pip install pyyaml")

ROOT = Path(__file__).resolve().parent.parent
errors: list[str] = []


def rel(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        # Test fixtures may exercise checks against files outside ROOT
        # (e.g. a pytest tmp_path); fall back to the absolute path rather
        # than crash on a message we're only building for a human to read.
        return str(path)


def _parse_frontmatter(path: Path, text: str) -> tuple[dict, int] | None:
    """Parse a leading ``---``-delimited YAML block.

    `text` must already be known to start with "---\n". Returns
    `(data, end)` where `end` is the index of the closing block's leading
    "\n---", or None (after recording an error) if the block is missing,
    unterminated, invalid YAML, or not a mapping.
    """
    end = text.find("\n---", 4)
    if end == -1:
        errors.append(f"{rel(path)}: unterminated YAML frontmatter")
        return None
    try:
        data = yaml.safe_load(text[4:end])
    except yaml.YAMLError as exc:
        errors.append(f"{rel(path)}: frontmatter is not valid YAML: {exc}")
        return None
    if not isinstance(data, dict):
        errors.append(f"{rel(path)}: frontmatter did not parse to a mapping")
        return None
    return data, end


def _check_allowed_tools_paths(path: Path, allowed) -> None:
    if isinstance(allowed, str):
        for match in re.finditer(r"bun run ([^\s)]+)", allowed):
            target = match.group(1).rstrip("*")
            if not target or target.endswith("/"):
                continue
            # Targets may contain globs (e.g. .agents/skills/*/cli/src/cli.ts);
            # require at least one existing file to match.
            if "*" in target:
                if not list(ROOT.glob(target)) and not list((ROOT / ".agents").glob(target)):
                    errors.append(f"{rel(path)}: allowed-tools glob matches no files: {target}")
            else:
                candidates = [ROOT / target, ROOT / ".agents" / target]
                if not any(c.is_file() for c in candidates):
                    errors.append(f"{rel(path)}: allowed-tools references a missing file: {target}")


def check_skill(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        errors.append(f"{rel(path)}: missing YAML frontmatter (file must start with ---)")
        return
    parsed = _parse_frontmatter(path, text)
    if parsed is None:
        return
    data, _end = parsed
    for key in ("name", "description"):
        if not data.get(key):
            errors.append(f"{rel(path)}: frontmatter missing required key '{key}'")

    _check_allowed_tools_paths(path, data.get("allowed-tools", ""))


def check_command(path: Path) -> None:
    text = path.read_text(encoding="utf-8").lstrip()
    if text.startswith("---\n"):
        parsed = _parse_frontmatter(path, text)
        if parsed is None:
            return
        data, end = parsed
        _check_allowed_tools_paths(path, data.get("allowed-tools", ""))
        # The title line is the first non-blank line after the closing
        # "\n---" marker (4 chars: newline + three dashes).
        rest_lines = [line for line in text[end + 4:].splitlines() if line.strip()]
        first = rest_lines[0] if rest_lines else ""
    else:
        lines = text.splitlines()
        first = lines[0] if lines else ""
    if not first.startswith("# /"):
        errors.append(f"{rel(path)}: command file must start with a '# /<name>' title (found: {first[:50]!r})")


# Managed-block markers. Commands and the web app edit files by replacing the
# span between a matching BEGIN/END pair, so an unbalanced or duplicated pair
# silently turns a targeted edit into the wrong edit - or no edit at all.
#
# A marker name is either a CONTAINER (e.g. PROFILE-EXTENSION-POINT) or an ITEM
# (a container-style name plus `:<id>`, e.g. TEMPLATE:primary-role, STAR:2).
# The BEGIN form may carry trailing prose - `<!-- BEGIN ACTIVE-TEMPLATE (managed
# by /add-template) -->` - which is part of the shipped convention.
MARKER_RE = re.compile(
    r"<!--\s*(BEGIN|END)\s+([A-Z][A-Z0-9-]*(?::[A-Za-z0-9._-]+)?)(?:\s[^>]*?)?\s*-->"
)


def check_markers(path: Path) -> None:
    """Verify BEGIN/END marker pairs are balanced, unique and sanely nested.

    Item markers may sit inside one container - that is how a profile fragment
    exposes both "replace the whole extension point" and "replace just STAR:2".
    Anything deeper, or a container inside a container, is a mistake.
    """
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        errors.append(f"{rel(path)}: unreadable: {exc}")
        return
    stack: list[str] = []
    seen: set[str] = set()
    for match in MARKER_RE.finditer(text):
        kind, name = match.group(1), match.group(2)
        line = text.count("\n", 0, match.start()) + 1
        if kind == "BEGIN":
            if stack and not (len(stack) == 1 and ":" in name and ":" not in stack[0]):
                errors.append(
                    f"{rel(path)}:{line}: marker {name!r} opens inside {stack[-1]!r} - "
                    "only an item marker (NAME:<id>) may nest, and only one level "
                    "deep inside a container"
                )
            if name in seen:
                errors.append(
                    f"{rel(path)}:{line}: duplicate marker name {name!r} - a replace "
                    "targeting this name cannot tell the two blocks apart"
                )
            seen.add(name)
            stack.append(name)
        else:
            if not stack:
                errors.append(f"{rel(path)}:{line}: END {name!r} with no matching BEGIN")
            elif stack[-1] != name:
                errors.append(
                    f"{rel(path)}:{line}: END {name!r} closes {stack[-1]!r} - "
                    "markers must nest strictly or not at all"
                )
                stack.pop()
            else:
                stack.pop()
    for name in stack:
        errors.append(f"{rel(path)}: BEGIN {name!r} is never closed")


def check_settings() -> None:
    path = ROOT / ".claude" / "settings.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f".claude/settings.json: {exc}")
        return
    if not isinstance(data, dict):
        errors.append(".claude/settings.json: expected top-level JSON value to be an object")
        return
    permissions = data.get("permissions", {})
    if not isinstance(permissions, dict):
        errors.append(".claude/settings.json: expected permissions to be an object")
        return
    if not isinstance(permissions.get("allow"), list):
        errors.append(".claude/settings.json: expected permissions.allow to be a list")


def main() -> int:
    skills = sorted(ROOT.glob(".claude/skills/*/SKILL.md")) + sorted(ROOT.glob(".agents/skills/*/SKILL.md"))
    commands = sorted((ROOT / ".claude" / "commands").glob("*.md"))
    if not skills:
        errors.append("no SKILL.md files found - glob roots are wrong or the tree moved")
    if not commands:
        errors.append("no command files found under .claude/commands/")

    # Every markdown file that a command, /add-template or the profile manager
    # may edit by marker - the shared framework docs, the profile fragments,
    # and root CLAUDE.md's ACTIVE-PROFILE block.
    marked = (
        skills
        + commands
        + sorted(ROOT.glob(".claude/skills/*/[0-9][0-9]-*.md"))
        + sorted(ROOT.glob("profiles/*/*.md"))
        + sorted(ROOT.glob("profiles/archived/*/*.md"))
        + [ROOT / "CLAUDE.md"]
    )

    for skill in skills:
        check_skill(skill)
    for command in commands:
        check_command(command)
    for path in marked:
        if path.is_file():
            check_markers(path)
    check_settings()

    if errors:
        print(f"lint_skills: {len(errors)} failure(s)")
        for err in errors:
            print(f"  - {err}")
        return 1
    print(
        f"lint_skills: OK ({len(skills)} skills, {len(commands)} commands, "
        f"{sum(1 for p in marked if p.is_file())} marker-checked files, settings.json)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
