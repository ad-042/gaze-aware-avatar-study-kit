#!/usr/bin/env python3
"""Validate a study configuration directory.

Usage:
    python scripts/validate_study.py study/demo-study
    python scripts/validate_study.py study/my-study

Runs the same schema and cross-reference checks as the backend API,
plus additional advisory warnings for common mistakes.

Exit codes:
    0  — all checks passed (warnings may still be printed)
    1  — validation errors found
    2  — usage error (bad arguments, missing directory)
"""

from __future__ import annotations

import sys
from pathlib import Path

# Add the backend package to the import path so we can reuse the
# existing schemas and validation logic directly.
_REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_REPO_ROOT / "backend"))

from app.schemas.study import StudyMeta  # noqa: E402
from app.services.study_loader import StudyLoadError, validate_study_dir  # noqa: E402


def _advisory_warnings(root: Path, meta: StudyMeta, config: object) -> list[str]:
    """Return advisory warnings that go beyond the backend's strict validation.

    These catch common mistakes documented in docs/CREATE_STUDY.md that are
    not schema errors but frequently trip up students.
    """
    warnings: list[str] = []
    flow = config.flow  # type: ignore[attr-defined]
    avatars = config.avatars  # type: ignore[attr-defined]

    # 1. study.json id vs folder name
    if meta.id != root.name:
        warnings.append(
            f"study.json 'id' is '{meta.id}' but folder name is '{root.name}' "
            f"— these should match"
        )

    # 2. Duplicate step IDs
    step_ids: list[str] = [s.id for s in flow.steps]
    seen: set[str] = set()
    for sid in step_ids:
        if sid in seen:
            warnings.append(f"Duplicate step id '{sid}' in flow.json")
        seen.add(sid)

    # 3. Condition names in flow not listed in study.json conditions
    declared_conditions = set(meta.conditions)
    for step in flow.steps:
        if step.condition and step.condition not in declared_conditions:
            warnings.append(
                f"Flow step '{step.id}' uses condition '{step.condition}' "
                f"which is not in study.json conditions {meta.conditions}"
            )

    # 4. Avatar model_file existence
    avatars_dir = root.parent.parent / "frontend" / "public" / "avatars"
    for avatar in avatars.avatars:
        avatar_path = avatars_dir / avatar.model_file
        if avatars_dir.is_dir() and not avatar_path.is_file():
            warnings.append(
                f"Avatar '{avatar.id}' references '{avatar.model_file}' "
                f"but file not found at {avatar_path}"
            )

    # 5. questions_per_condition vs actual questions count
    prompts = config.prompts  # type: ignore[attr-defined]
    total_questions = len(prompts.quiz.questions)
    needed = meta.questions_per_condition * len(meta.conditions)
    if total_questions < needed:
        warnings.append(
            f"prompts.json has {total_questions} questions but study needs "
            f"{meta.questions_per_condition} x {len(meta.conditions)} conditions "
            f"= {needed}"
        )

    return warnings


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__.strip())
        return 2 if len(sys.argv) != 2 else 0

    study_path = Path(sys.argv[1])

    # Resolve relative paths from CWD
    if not study_path.is_absolute():
        study_path = Path.cwd() / study_path

    if not study_path.is_dir():
        print(f"ERROR: Not a directory: {study_path}")
        return 2

    # --- Run backend validation (schemas + cross-refs) ---
    try:
        config = validate_study_dir(study_path)
    except StudyLoadError as exc:
        print(f"FAIL: {exc}")
        return 1

    # --- Run advisory warnings ---
    warnings = _advisory_warnings(study_path, config.meta, config)
    if warnings:
        for w in warnings:
            print(f"WARNING: {w}")

    print(f"OK: '{study_path.name}' passed validation ({len(config.flow.steps)} steps)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
