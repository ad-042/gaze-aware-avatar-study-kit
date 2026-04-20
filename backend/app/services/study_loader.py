"""Load and validate study configurations from JSON files."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from pydantic import ValidationError

from app.schemas.study import (
    Avatars,
    Flow,
    GazeProfiles,
    Prompts,
    Questionnaires,
    StudyConfig,
    StudyMeta,
)
from app.settings import settings

logger = logging.getLogger(__name__)

# Maps each config fragment to its file name and schema.
_FRAGMENTS: list[tuple[str, str, type]] = [
    ("meta", "study.json", StudyMeta),
    ("flow", "flow.json", Flow),
    ("avatars", "avatars.json", Avatars),
    ("questionnaires", "questionnaires.json", Questionnaires),
    ("prompts", "prompts.json", Prompts),
    ("gaze_profiles", "gaze_profiles.json", GazeProfiles),
]


class StudyLoadError(Exception):
    """Raised when a study cannot be loaded or validated."""


def validate_study_dir(root: Path) -> StudyConfig:
    """Validate all JSON fragments in *root* and return a ``StudyConfig``.

    This is the shared validation core used by both the backend API and the
    CLI validation script.  It is intentionally decoupled from application
    settings so that it can be called with an arbitrary directory path.

    Raises ``StudyLoadError`` with a human-readable message on any problem
    (missing directory, missing file, invalid JSON, schema violation, or
    cross-reference inconsistency).
    """
    if not root.is_dir():
        raise StudyLoadError(f"Study directory not found: {root}")

    study_name = root.name

    parsed: dict[str, object] = {}
    errors: list[str] = []

    for key, filename, schema in _FRAGMENTS:
        filepath = root / filename
        if not filepath.is_file():
            errors.append(f"Missing file: {filename}")
            continue

        try:
            raw = json.loads(filepath.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"Invalid JSON in {filename}: {exc}")
            continue

        try:
            parsed[key] = schema.model_validate(raw)
        except ValidationError as exc:
            for err in exc.errors():
                loc = " -> ".join(str(part) for part in err["loc"])
                errors.append(f"{filename}: {loc}: {err['msg']}")

    if errors:
        detail = "; ".join(errors)
        raise StudyLoadError(f"Study '{study_name}' validation failed: {detail}")

    # Cross-validation: questionnaire_ids referenced in flow must exist.
    flow: Flow = parsed["flow"]  # type: ignore[assignment]
    questionnaires: Questionnaires = parsed["questionnaires"]  # type: ignore[assignment]
    for step in flow.steps:
        if step.questionnaire_id and step.questionnaire_id not in questionnaires.questionnaires:
            raise StudyLoadError(
                f"Study '{study_name}': flow step '{step.id}' references "
                f"unknown questionnaire '{step.questionnaire_id}'"
            )

    return StudyConfig(**parsed)


def _study_root(study_id: str) -> Path:
    base = Path(settings.study_dir).resolve()
    root = (base / study_id).resolve()
    if not root.is_relative_to(base):
        raise StudyLoadError(f"Invalid study id: {study_id}")
    return root


def load_study(study_id: str) -> StudyConfig:
    """Load all JSON fragments for *study_id* and return a validated StudyConfig.

    Raises ``StudyLoadError`` with a human-readable message on any problem
    (missing directory, missing file, invalid JSON, schema violation).
    """
    config = validate_study_dir(_study_root(study_id))
    logger.info("Loaded study '%s' from %s", study_id, _study_root(study_id))
    return config
