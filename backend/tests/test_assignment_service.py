"""Tests for session-scoped study assignment generation."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from app.services import assignment_service
from app.services.study_loader import load_study

DEMO_STUDY = Path(__file__).resolve().parent.parent.parent / "study" / "demo-study"


@pytest.fixture(autouse=True)
def _clear_assignments():
    """Clear the in-memory assignment store before each test."""
    assignment_service._assignments.clear()
    yield
    assignment_service._assignments.clear()


@pytest.fixture()
def study_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    study_dir = tmp_path / "study"
    shutil.copytree(DEMO_STUDY, study_dir / "demo-study")
    monkeypatch.setattr("app.settings.settings.study_dir", str(study_dir))
    return study_dir / "demo-study"


class TestCreateAssignment:
    def test_creates_valid_assignment(self, study_path: Path):
        config = load_study("demo-study")
        assignment = assignment_service.create_assignment("sess-001", config)

        assert assignment.session_id == "sess-001"
        assert assignment.study_id == "demo-study"
        assert isinstance(assignment.seed, int)
        assert len(assignment.condition_order) == 2
        assert set(assignment.condition_order) == {"baseline", "gazeaware"}
        assert len(assignment.rounds) == 2
        assert assignment.questions_per_condition == 5

    def test_rounds_have_correct_step_ids(self, study_path: Path):
        config = load_study("demo-study")
        assignment = assignment_service.create_assignment("sess-002", config)

        step_ids = [r.step_id for r in assignment.rounds]
        assert step_ids == ["condition1", "condition2"]

    def test_each_round_has_correct_question_count(self, study_path: Path):
        config = load_study("demo-study")
        assignment = assignment_service.create_assignment("sess-003", config)

        for r in assignment.rounds:
            assert len(r.question_ids) == 5
            assert len(r.questions) == 5

    def test_no_question_overlap_between_rounds(self, study_path: Path):
        config = load_study("demo-study")
        assignment = assignment_service.create_assignment("sess-004", config)

        all_ids = []
        for r in assignment.rounds:
            all_ids.extend(r.question_ids)
        assert len(all_ids) == len(set(all_ids))

    def test_idempotent_same_session(self, study_path: Path):
        config = load_study("demo-study")
        a1 = assignment_service.create_assignment("sess-005", config)
        a2 = assignment_service.create_assignment("sess-005", config)
        assert a1.seed == a2.seed
        assert a1.condition_order == a2.condition_order

    def test_different_sessions_may_differ(self, study_path: Path):
        config = load_study("demo-study")
        seeds = set()
        for i in range(20):
            a = assignment_service.create_assignment(f"sess-diff-{i}", config)
            seeds.add(a.seed)
        # With 20 random seeds, at least 2 should differ
        assert len(seeds) > 1


class TestGetAssignment:
    def test_returns_none_for_unknown_session(self, study_path: Path):
        assert assignment_service.get_assignment("nonexistent") is None

    def test_returns_stored_assignment(self, study_path: Path):
        config = load_study("demo-study")
        created = assignment_service.create_assignment("sess-get", config)
        retrieved = assignment_service.get_assignment("sess-get")
        assert retrieved is not None
        assert retrieved.seed == created.seed


class TestGetRoundForStep:
    def test_returns_correct_round(self, study_path: Path):
        config = load_study("demo-study")
        assignment_service.create_assignment("sess-round", config)

        r = assignment_service.get_round_for_step("sess-round", "condition1")
        assert r is not None
        assert r.round_index == 0

        r2 = assignment_service.get_round_for_step("sess-round", "condition2")
        assert r2 is not None
        assert r2.round_index == 1

    def test_returns_none_for_unknown_step(self, study_path: Path):
        config = load_study("demo-study")
        assignment_service.create_assignment("sess-nostep", config)

        assert assignment_service.get_round_for_step("sess-nostep", "nonexistent") is None

    def test_returns_none_for_unknown_session(self, study_path: Path):
        assert assignment_service.get_round_for_step("nonexistent", "condition1") is None
