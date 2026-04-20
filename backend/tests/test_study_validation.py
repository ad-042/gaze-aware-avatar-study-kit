"""Tests for study loading and validation."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import create_app
from app.schemas.study import StudyMeta
from app.services.study_loader import StudyLoadError, load_study

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

DEMO_STUDY = Path(__file__).resolve().parent.parent.parent / "study" / "demo-study"


@pytest.fixture()
def app(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Create app with study_dir pointing at a temporary copy of demo-study."""
    study_dir = tmp_path / "study"
    shutil.copytree(DEMO_STUDY, study_dir / "demo-study")
    monkeypatch.setattr("app.settings.settings.study_dir", str(study_dir))
    return create_app()


@pytest.fixture()
def client(app):
    return TestClient(app)


@pytest.fixture()
def study_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Copy demo-study into a tmp dir and patch settings. Return study dir."""
    study_dir = tmp_path / "study"
    shutil.copytree(DEMO_STUDY, study_dir / "demo-study")
    monkeypatch.setattr("app.settings.settings.study_dir", str(study_dir))
    return study_dir / "demo-study"


# ---------------------------------------------------------------------------
# Unit tests — load_study
# ---------------------------------------------------------------------------


class TestLoadStudy:
    def test_loads_valid_demo_study(self, study_path: Path):
        config = load_study("demo-study")
        assert config.meta.id == "demo-study"
        assert len(config.flow.steps) > 0
        assert len(config.avatars.avatars) > 0
        assert "quiz" in config.prompts.__dict__ or config.prompts.quiz is not None

    def test_missing_study_directory(self, study_path: Path):
        with pytest.raises(StudyLoadError, match="not found"):
            load_study("nonexistent")

    def test_missing_file(self, study_path: Path):
        (study_path / "avatars.json").unlink()
        with pytest.raises(StudyLoadError, match="Missing file.*avatars.json"):
            load_study("demo-study")

    def test_invalid_json(self, study_path: Path):
        (study_path / "study.json").write_text("{bad json", encoding="utf-8")
        with pytest.raises(StudyLoadError, match="Invalid JSON.*study.json"):
            load_study("demo-study")

    def test_schema_violation(self, study_path: Path):
        data = json.loads((study_path / "study.json").read_text(encoding="utf-8"))
        del data["conditions"]
        (study_path / "study.json").write_text(json.dumps(data), encoding="utf-8")
        with pytest.raises(StudyLoadError, match="conditions"):
            load_study("demo-study")

    def test_unknown_questionnaire_ref(self, study_path: Path):
        flow = json.loads((study_path / "flow.json").read_text(encoding="utf-8"))
        flow["steps"].append(
            {"id": "bad_ref", "type": "questionnaire", "questionnaire_id": "nonexistent"}
        )
        (study_path / "flow.json").write_text(json.dumps(flow), encoding="utf-8")
        with pytest.raises(StudyLoadError, match="unknown questionnaire.*nonexistent"):
            load_study("demo-study")


# ---------------------------------------------------------------------------
# Integration tests — API endpoint
# ---------------------------------------------------------------------------


class TestStudyEndpoint:
    def test_get_valid_study(self, client: TestClient):
        resp = client.get("/api/studies/demo-study")
        assert resp.status_code == 200
        body = resp.json()
        assert body["meta"]["id"] == "demo-study"
        assert len(body["flow"]["steps"]) > 0

    def test_get_missing_study_returns_404(self, client: TestClient):
        resp = client.get("/api/studies/nonexistent")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Unit tests — assignment schema validation
# ---------------------------------------------------------------------------

_BASE_META = {
    "id": "t",
    "version": "1.0",
    "name": "T",
    "study_mode": "within_subjects",
    "conditions": ["A", "B"],
    "questions_per_condition": 1,
}


class TestAssignmentSchemaValidation:
    def test_no_assignment_auto_fills(self):
        meta = StudyMeta.model_validate({**_BASE_META})
        assert meta.assignment.condition_order_mode == "fixed"
        assert meta.assignment.fixed_condition_order == ["A", "B"]

    def test_fixed_mode_missing_fco_raises(self):
        with pytest.raises(ValidationError, match="fixed_condition_order is required"):
            StudyMeta.model_validate(
                {
                    **_BASE_META,
                    "assignment": {"condition_order_mode": "fixed"},
                }
            )

    def test_fco_wrong_length_raises(self):
        with pytest.raises(ValidationError, match="entries"):
            StudyMeta.model_validate(
                {
                    **_BASE_META,
                    "assignment": {
                        "condition_order_mode": "fixed",
                        "fixed_condition_order": ["A"],
                    },
                }
            )

    def test_fco_wrong_ids_raises(self):
        with pytest.raises(ValidationError, match="same IDs"):
            StudyMeta.model_validate(
                {
                    **_BASE_META,
                    "assignment": {
                        "condition_order_mode": "fixed",
                        "fixed_condition_order": ["A", "C"],
                    },
                }
            )

    def test_fco_duplicates_rejected(self):
        # Duplicates cause a set-equality mismatch (same IDs check catches it)
        with pytest.raises(ValidationError):
            StudyMeta.model_validate(
                {
                    **_BASE_META,
                    "assignment": {
                        "condition_order_mode": "fixed",
                        "fixed_condition_order": ["A", "A"],
                    },
                }
            )

    def test_counterbalanced_no_fco_ok(self):
        meta = StudyMeta.model_validate(
            {
                **_BASE_META,
                "assignment": {"condition_order_mode": "counterbalanced"},
            }
        )
        assert meta.assignment.condition_order_mode == "counterbalanced"
        assert meta.assignment.fixed_condition_order is None


# ---------------------------------------------------------------------------
# Integration tests — assignment endpoint
# ---------------------------------------------------------------------------


class TestAssignmentEndpoint:
    def test_create_assignment_returns_200(self, client: TestClient):
        resp = client.post(
            "/api/sessions/test-sess-001/assignment",
            json={"study_id": "demo-study"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["session_id"] == "test-sess-001"
        assert body["study_id"] == "demo-study"
        assert isinstance(body["seed"], int)
        assert len(body["condition_order"]) == 2
        assert len(body["rounds"]) == 2
        assert body["questions_per_condition"] == 5

    def test_create_assignment_idempotent(self, client: TestClient):
        r1 = client.post(
            "/api/sessions/test-sess-002/assignment",
            json={"study_id": "demo-study"},
        )
        r2 = client.post(
            "/api/sessions/test-sess-002/assignment",
            json={"study_id": "demo-study"},
        )
        assert r1.json()["seed"] == r2.json()["seed"]

    def test_create_assignment_unknown_study_404(self, client: TestClient):
        resp = client.post(
            "/api/sessions/test-sess-003/assignment",
            json={"study_id": "nonexistent"},
        )
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Path traversal prevention
# ---------------------------------------------------------------------------


class TestPathTraversal:
    def test_loader_rejects_dotdot(self, study_path: Path):
        with pytest.raises(StudyLoadError):
            load_study("..")

    def test_api_rejects_encoded_traversal(self, client: TestClient):
        resp = client.get("/api/studies/%2e%2e")
        assert resp.status_code == 422

    def test_api_rejects_slash_traversal(self, client: TestClient):
        resp = client.get("/api/studies/%2e%2e%2fsecret")
        assert resp.status_code in (404, 422)
