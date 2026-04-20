"""Tests for the JSONL logging service and related endpoints."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.schemas.events import LogEvent
from app.services.logging_service import LoggingService

# Valid session IDs for tests (server-issued 16 hex and frontend UUID format)
_HEX_SID = "a1b2c3d4e5f67890"
_UUID_SID = "550e8400-e29b-41d4-a716-446655440000"
_HEX_SID_A = "aaaaaaaaaaaaaaaa"
_HEX_SID_B = "bbbbbbbbbbbbbbbb"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def log_dir(tmp_path: Path) -> Path:
    return tmp_path / "logs"


@pytest.fixture()
def service(log_dir: Path) -> LoggingService:
    return LoggingService(log_dir=str(log_dir))


@pytest.fixture()
def client(log_dir: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("app.settings.settings.log_dir", str(log_dir))
    # Re-create the singleton so it picks up the patched log_dir
    svc = LoggingService()
    monkeypatch.setattr("app.routes.sessions.logging_service", svc)
    monkeypatch.setattr("app.routes.logs.logging_service", svc)
    return TestClient(create_app())


def _make_event(**overrides) -> dict:
    base = {
        "schema_version": 1,
        "timestamp": "2026-03-09T12:00:00Z",
        "session_id": _HEX_SID,
        "event_type": "test.event",
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Unit tests — LoggingService
# ---------------------------------------------------------------------------


class TestLoggingServiceUnit:
    def test_create_session_returns_hex_id(self, service: LoggingService):
        sid = service.create_session()
        assert len(sid) == 16
        int(sid, 16)  # must be valid hex

    def test_create_session_creates_log_dir(self, service: LoggingService, log_dir: Path):
        assert not log_dir.exists()
        service.create_session()
        assert log_dir.is_dir()

    def test_create_session_writes_started_marker(self, service: LoggingService, log_dir: Path):
        sid = service.create_session()
        path = log_dir / f"{sid}.jsonl"
        assert path.exists()
        line = json.loads(path.read_text(encoding="utf-8").strip())
        assert line["event_type"] == "session.started"
        assert line["session_id"] == sid
        assert line["data"]["log_mode"] in ("default", "research")

    def test_write_events_creates_jsonl(self, service: LoggingService, log_dir: Path):
        events = [LogEvent(**_make_event())]
        written = service.write_events(events)
        assert written == 1
        path = log_dir / f"{_HEX_SID}.jsonl"
        assert path.exists()
        line = json.loads(path.read_text(encoding="utf-8").strip())
        assert line["event_type"] == "test.event"
        assert line["schema_version"] == 1

    def test_write_events_appends(self, service: LoggingService, log_dir: Path):
        ev1 = LogEvent(**_make_event(event_type="first"))
        ev2 = LogEvent(**_make_event(event_type="second"))
        service.write_events([ev1])
        service.write_events([ev2])
        lines = (log_dir / f"{_HEX_SID}.jsonl").read_text(encoding="utf-8").strip().splitlines()
        assert len(lines) == 2
        assert json.loads(lines[0])["event_type"] == "first"
        assert json.loads(lines[1])["event_type"] == "second"

    def test_write_events_groups_by_session(self, service: LoggingService, log_dir: Path):
        events = [
            LogEvent(**_make_event(session_id=_HEX_SID_A)),
            LogEvent(**_make_event(session_id=_HEX_SID_B)),
            LogEvent(**_make_event(session_id=_HEX_SID_A)),
        ]
        written = service.write_events(events)
        assert written == 3
        assert (log_dir / f"{_HEX_SID_A}.jsonl").exists()
        assert (log_dir / f"{_HEX_SID_B}.jsonl").exists()
        path_a = log_dir / f"{_HEX_SID_A}.jsonl"
        a_lines = path_a.read_text(encoding="utf-8").strip().splitlines()
        assert len(a_lines) == 2

    def test_write_events_with_uuid_session_id(self, service: LoggingService, log_dir: Path):
        """Frontend uses crypto.randomUUID() — must be accepted."""
        ev = LogEvent(**_make_event(session_id=_UUID_SID))
        written = service.write_events([ev])
        assert written == 1
        assert (log_dir / f"{_UUID_SID}.jsonl").exists()

    def test_write_events_with_data_field(self, service: LoggingService, log_dir: Path):
        ev = LogEvent(**_make_event(data={"key": "value"}))
        service.write_events([ev])
        line = json.loads((log_dir / f"{_HEX_SID}.jsonl").read_text(encoding="utf-8").strip())
        assert line["data"] == {"key": "value"}

    def test_write_events_survives_io_error(self, service: LoggingService, log_dir: Path):
        """Service must not raise when the log directory is unwritable."""
        log_dir.mkdir(parents=True, exist_ok=True)
        # Point the service at a file (not a dir) to trigger OSError
        blocker = log_dir / f"{_HEX_SID}.jsonl"
        blocker.write_text("", encoding="utf-8")
        bad_service = LoggingService(log_dir=str(blocker))
        events = [LogEvent(**_make_event())]
        written = bad_service.write_events(events)
        # Should not crash, but written may be 0
        assert written == 0 or written == 1  # depends on OS behavior

    def test_rejects_path_traversal_session_id(self):
        """session_id with path traversal chars must be rejected by schema."""
        with pytest.raises(ValueError):
            LogEvent(**_make_event(session_id="../../etc/passwd"))


# ---------------------------------------------------------------------------
# Integration tests — API endpoints
# ---------------------------------------------------------------------------


class TestLoggingServiceMetadata:
    """Tests for session metadata support."""

    def test_create_session_with_metadata(self, service: LoggingService, log_dir: Path):
        meta = {"participant_id": "P-20260323-abc", "trial_id": "T1"}
        sid = service.create_session(metadata=meta)
        path = log_dir / f"{sid}.jsonl"
        line = json.loads(path.read_text(encoding="utf-8").strip())
        assert line["data"]["participant_id"] == "P-20260323-abc"
        assert line["data"]["trial_id"] == "T1"
        assert line["data"]["log_mode"] in ("default", "research")

    def test_create_session_without_metadata(self, service: LoggingService, log_dir: Path):
        sid = service.create_session()
        path = log_dir / f"{sid}.jsonl"
        line = json.loads(path.read_text(encoding="utf-8").strip())
        assert "participant_id" not in line["data"]
        assert line["data"]["log_mode"] in ("default", "research")

    def test_create_session_includes_effective_capture(
        self,
        service: LoggingService,
        log_dir: Path,
    ):
        sid = service.create_session()
        path = log_dir / f"{sid}.jsonl"
        line = json.loads(path.read_text(encoding="utf-8").strip())
        ec = line["data"]["effective_capture"]
        assert isinstance(ec, dict)
        assert "session_metadata" in ec
        assert "transcripts" in ec
        assert "audio_sent_to_openai" in ec


class TestSessionEndpoint:
    def test_create_session(self, client: TestClient):
        resp = client.post("/api/app-sessions")
        assert resp.status_code == 201
        body = resp.json()
        assert "session_id" in body
        assert len(body["session_id"]) == 16

    def test_create_session_with_metadata(self, client: TestClient, log_dir: Path):
        resp = client.post(
            "/api/app-sessions",
            json={"participant_id": "P-001", "trial_id": "T1"},
        )
        assert resp.status_code == 201
        sid = resp.json()["session_id"]
        path = log_dir / f"{sid}.jsonl"
        line = json.loads(path.read_text(encoding="utf-8").strip())
        assert line["data"]["participant_id"] == "P-001"
        assert line["data"]["trial_id"] == "T1"

    def test_create_session_empty_body(self, client: TestClient):
        """Empty JSON body should be accepted (all fields optional)."""
        resp = client.post("/api/app-sessions", json={})
        assert resp.status_code == 201
        assert "session_id" in resp.json()

    def test_create_multiple_sessions_unique(self, client: TestClient):
        ids = {client.post("/api/app-sessions").json()["session_id"] for _ in range(5)}
        assert len(ids) == 5


class TestLogEventsEndpoint:
    def test_log_single_event(self, client: TestClient):
        resp = client.post("/api/log/events", json={"events": [_make_event()]})
        assert resp.status_code == 202
        assert resp.json()["accepted"] == 1

    def test_log_via_compat_alias(self, client: TestClient):
        """Frontend default endpoint /api/logs must work."""
        resp = client.post("/api/logs", json={"events": [_make_event()]})
        assert resp.status_code == 202
        assert resp.json()["accepted"] == 1

    def test_log_batch(self, client: TestClient):
        events = [_make_event(event_type=f"ev.{i}") for i in range(3)]
        resp = client.post("/api/log/events", json={"events": events})
        assert resp.status_code == 202
        assert resp.json()["accepted"] == 3

    def test_rejects_empty_batch(self, client: TestClient):
        resp = client.post("/api/log/events", json={"events": []})
        assert resp.status_code == 422

    def test_rejects_missing_required_fields(self, client: TestClient):
        resp = client.post(
            "/api/log/events",
            json={"events": [{"schema_version": 1, "timestamp": "now"}]},
        )
        assert resp.status_code == 422

    def test_rejects_empty_event_type(self, client: TestClient):
        ev = _make_event(event_type="")
        resp = client.post("/api/log/events", json={"events": [ev]})
        assert resp.status_code == 422

    def test_rejects_invalid_session_id(self, client: TestClient):
        ev = _make_event(session_id="../../etc/passwd")
        resp = client.post("/api/log/events", json={"events": [ev]})
        assert resp.status_code == 422
