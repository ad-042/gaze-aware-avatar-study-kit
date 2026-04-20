"""Tests for /api/runtime — effective_capture and capability reporting."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture()
def client():
    return TestClient(create_app())


class TestRuntimeEndpoint:
    def test_returns_effective_capture_keys(self, client: TestClient):
        resp = client.get("/api/runtime")
        assert resp.status_code == 200
        ec = resp.json()["effective_capture"]
        expected = {
            "session_metadata",
            "questionnaire_answers",
            "form_answers",
            "transcripts",
            "gaze_samples",
            "gaze_tobii_raw",
            "speaking_states",
            "operator_notes_persisted",
            "audio_sent_to_openai",
        }
        assert expected == set(ec.keys())

    def test_returns_log_mode(self, client: TestClient):
        resp = client.get("/api/runtime")
        assert resp.json()["log_mode"] in ("default", "research")

    def test_returns_capabilities(self, client: TestClient):
        caps = client.get("/api/runtime").json()["capabilities"]
        assert "openai_realtime_enabled" in caps
        assert "tobii_enabled" in caps
        assert "tobii_connected" in caps

    def test_default_mode_capture(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr("app.settings.settings.log_mode", "default")
        monkeypatch.setattr("app.settings.settings.openai_realtime_enabled", False)
        monkeypatch.setattr("app.settings.settings.tobii_enabled", False)
        ec = client.get("/api/runtime").json()["effective_capture"]
        assert ec["session_metadata"] is True
        assert ec["questionnaire_answers"] is False
        assert ec["transcripts"] is False
        assert ec["gaze_samples"] is False
        assert ec["audio_sent_to_openai"] is False

    def test_research_mode_capture(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr("app.settings.settings.log_mode", "research")
        monkeypatch.setattr("app.settings.settings.openai_realtime_enabled", False)
        monkeypatch.setattr("app.settings.settings.tobii_enabled", False)
        ec = client.get("/api/runtime").json()["effective_capture"]
        assert ec["session_metadata"] is True
        assert ec["questionnaire_answers"] is True
        assert ec["gaze_samples"] is True
        assert ec["transcripts"] is False
        assert ec["audio_sent_to_openai"] is False

    def test_research_realtime_capture(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr("app.settings.settings.log_mode", "research")
        monkeypatch.setattr("app.settings.settings.openai_realtime_enabled", True)
        ec = client.get("/api/runtime").json()["effective_capture"]
        assert ec["transcripts"] is True
        assert ec["audio_sent_to_openai"] is True
