"""Policy tests for the realtime SDP relay endpoint.

All tests mock httpx — no real OpenAI calls are made.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.main import create_app


def _make_client(**env_overrides) -> TestClient:
    """Create a test client with optional settings overrides."""
    with patch("app.settings.Settings") as mock_cls:
        from app.settings import Settings

        defaults = {
            "app_env": "test",
            "app_host": "127.0.0.1",
            "app_port": 8000,
            "data_dir": "/tmp/data",
            "log_dir": "/tmp/data/logs",
            "study_dir": "/tmp/study",
            "log_mode": "default",
            "openai_api_key": "",
            "openai_realtime_enabled": False,
            "openai_realtime_model": "gpt-realtime-mini",
            "openai_realtime_voice": "alloy",
            "tobii_enabled": False,
            "tobiistream_path": "",
            "tobii_zmq_endpoint": "tcp://127.0.0.1:5556",
        }
        defaults.update(env_overrides)

        for key, value in defaults.items():
            setattr(Settings, key, value)

        mock_cls.return_value = Settings

    # Patch the singleton so the app picks up the overrides
    with patch.dict("os.environ", {}, clear=False):
        # Re-apply settings via direct attribute patching on the module-level singleton
        import app.settings as settings_module

        for key, value in defaults.items():
            setattr(settings_module.settings, key, value)

        return TestClient(create_app())


VALID_REQUEST = {
    "sdp_offer": "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n",
    "session_id": "abcdef1234567890",
}

VALID_REQUEST_WITH_STUDY = {
    **VALID_REQUEST,
    "study_id": "demo-study",
    "condition": "baseline",
}

FAKE_KEY = "sk-test-not-a-real-key-1234567890abcdef"


# --- Policy gating ---


def test_realtime_disabled_returns_503():
    client = _make_client(openai_realtime_enabled=False, openai_api_key=FAKE_KEY)
    resp = client.post("/api/realtime/session", json=VALID_REQUEST)
    assert resp.status_code == 503
    assert "not available" in resp.json()["detail"].lower()


def test_realtime_enabled_but_no_key_returns_503():
    client = _make_client(openai_realtime_enabled=True, openai_api_key="")
    resp = client.post("/api/realtime/session", json=VALID_REQUEST)
    assert resp.status_code == 503


def test_realtime_enabled_with_key_but_disabled_returns_503():
    client = _make_client(openai_realtime_enabled=False, openai_api_key=FAKE_KEY)
    resp = client.post("/api/realtime/session", json=VALID_REQUEST)
    assert resp.status_code == 503


# --- Validation ---


def test_missing_sdp_offer_returns_422():
    client = _make_client(openai_realtime_enabled=True, openai_api_key=FAKE_KEY)
    resp = client.post("/api/realtime/session", json={"session_id": "abcdef1234567890"})
    assert resp.status_code == 422


def test_empty_sdp_offer_returns_422():
    client = _make_client(openai_realtime_enabled=True, openai_api_key=FAKE_KEY)
    resp = client.post(
        "/api/realtime/session",
        json={"sdp_offer": "", "session_id": "abcdef1234567890"},
    )
    assert resp.status_code == 422


def test_missing_session_id_returns_422():
    client = _make_client(openai_realtime_enabled=True, openai_api_key=FAKE_KEY)
    resp = client.post("/api/realtime/session", json={"sdp_offer": "v=0\r\n"})
    assert resp.status_code == 422


def test_invalid_session_id_format_returns_422():
    client = _make_client(openai_realtime_enabled=True, openai_api_key=FAKE_KEY)
    resp = client.post(
        "/api/realtime/session",
        json={"sdp_offer": "v=0\r\n", "session_id": "../etc/passwd"},
    )
    assert resp.status_code == 422


# --- Successful flow (mocked upstream) ---


def _mock_openai(status_code: int, sdp_text: str = "", error_body: str = ""):
    """Return a patch context that mocks httpx.AsyncClient for the realtime service."""
    mock_response = MagicMock()
    mock_response.status_code = status_code
    mock_response.text = sdp_text or error_body
    mock_response.headers = {"content-type": "application/sdp" if sdp_text else "application/json"}

    patcher = patch("app.services.realtime_service.httpx.AsyncClient")
    mock_client_cls = patcher.start()
    mock_ctx = AsyncMock()
    mock_ctx.__aenter__.return_value = mock_ctx
    mock_ctx.__aexit__.return_value = False
    mock_ctx.post = AsyncMock(return_value=mock_response)
    mock_client_cls.return_value = mock_ctx
    return patcher


def test_successful_session_returns_sdp_answer():
    client = _make_client(openai_realtime_enabled=True, openai_api_key=FAKE_KEY)
    patcher = _mock_openai(200, sdp_text="v=0\r\no=- answer\r\n")
    try:
        resp = client.post("/api/realtime/session", json=VALID_REQUEST)
    finally:
        patcher.stop()

    assert resp.status_code == 200
    body = resp.json()
    assert body["sdp_answer"] == "v=0\r\no=- answer\r\n"
    assert body["model"] == "gpt-realtime-mini"
    assert body["voice"] == "alloy"
    # Instructions are never exposed to the client
    assert "instructions" not in body


def test_successful_session_does_not_leak_key():
    client = _make_client(openai_realtime_enabled=True, openai_api_key=FAKE_KEY)
    patcher = _mock_openai(200, sdp_text="v=0\r\no=- answer\r\n")
    try:
        resp = client.post("/api/realtime/session", json=VALID_REQUEST)
    finally:
        patcher.stop()

    raw = resp.text
    assert FAKE_KEY not in raw
    assert "sk-" not in raw


# --- Upstream errors ---


def test_upstream_error_returns_502():
    client = _make_client(openai_realtime_enabled=True, openai_api_key=FAKE_KEY)
    patcher = _mock_openai(400, error_body='{"error": "bad request"}')
    try:
        resp = client.post("/api/realtime/session", json=VALID_REQUEST)
    finally:
        patcher.stop()

    assert resp.status_code == 502
    assert FAKE_KEY not in resp.text


def test_upstream_empty_sdp_returns_502():
    client = _make_client(openai_realtime_enabled=True, openai_api_key=FAKE_KEY)
    patcher = _mock_openai(200, sdp_text="")
    try:
        resp = client.post("/api/realtime/session", json=VALID_REQUEST)
    finally:
        patcher.stop()

    assert resp.status_code == 502


def test_upstream_connection_error_returns_502():
    import httpx

    client = _make_client(openai_realtime_enabled=True, openai_api_key=FAKE_KEY)

    with patch("app.services.realtime_service.httpx.AsyncClient") as mock_client_cls:
        mock_ctx = AsyncMock()
        mock_ctx.__aenter__.return_value = mock_ctx
        mock_ctx.__aexit__.return_value = False
        mock_ctx.post = AsyncMock(side_effect=httpx.ConnectError("connection refused"))
        mock_client_cls.return_value = mock_ctx

        resp = client.post("/api/realtime/session", json=VALID_REQUEST)

    assert resp.status_code == 502
    assert FAKE_KEY not in resp.text
    assert "connect" in resp.json()["detail"].lower()


# --- Runtime capability consistency ---


def test_runtime_reports_realtime_disabled():
    client = _make_client(openai_realtime_enabled=False, openai_api_key="")
    resp = client.get("/api/runtime")
    assert resp.status_code == 200
    assert resp.json()["capabilities"]["openai_realtime_enabled"] is False


def test_runtime_reports_realtime_enabled():
    client = _make_client(openai_realtime_enabled=True, openai_api_key=FAKE_KEY)
    resp = client.get("/api/runtime")
    assert resp.status_code == 200
    assert resp.json()["capabilities"]["openai_realtime_enabled"] is True


# --- Study-specific instructions sent server-side ---


def _real_study_dir() -> str:
    """Return the real study directory path for loading demo-study."""
    from pathlib import Path

    return str(Path(__file__).resolve().parent.parent.parent / "study")


def _extract_session_config(mock_post: AsyncMock) -> dict | None:
    """Extract the session config JSON that was sent to OpenAI via multipart."""
    import json as _json

    if not mock_post.call_args:
        return None
    _, kwargs = mock_post.call_args
    files = kwargs.get("files", {})
    session_part = files.get("session")
    if session_part and len(session_part) >= 2:
        return _json.loads(session_part[1])
    return None


def test_session_with_study_sends_instructions_to_openai():
    client = _make_client(
        openai_realtime_enabled=True,
        openai_api_key=FAKE_KEY,
        study_dir=_real_study_dir(),
    )
    patcher = _mock_openai(200, sdp_text="v=0\r\no=- answer\r\n")
    try:
        resp = client.post("/api/realtime/session", json=VALID_REQUEST_WITH_STUDY)
    finally:
        patcher.stop()

    assert resp.status_code == 200
    # Instructions must NOT appear in the client response
    assert "instructions" not in resp.json()


def test_session_with_study_includes_instructions_in_upstream_call():
    """Verify that the upstream OpenAI call contains study-specific instructions."""
    client = _make_client(
        openai_realtime_enabled=True,
        openai_api_key=FAKE_KEY,
        study_dir=_real_study_dir(),
    )
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = "v=0\r\no=- answer\r\n"
    mock_response.headers = {"content-type": "application/sdp"}

    with patch("app.services.realtime_service.httpx.AsyncClient") as mock_cls:
        mock_ctx = AsyncMock()
        mock_ctx.__aenter__.return_value = mock_ctx
        mock_ctx.__aexit__.return_value = False
        mock_ctx.post = AsyncMock(return_value=mock_response)
        mock_cls.return_value = mock_ctx

        resp = client.post("/api/realtime/session", json=VALID_REQUEST_WITH_STUDY)

        assert resp.status_code == 200
        session_config = _extract_session_config(mock_ctx.post)
        assert session_config is not None
        assert "instructions" in session_config
        assert "Quizmaster" in session_config["instructions"]
        # Baseline condition = first 5 questions
        assert "capital of France" in session_config["instructions"]
        assert session_config["voice"] == "alloy"


def test_session_with_second_condition_sends_different_questions():
    client = _make_client(
        openai_realtime_enabled=True,
        openai_api_key=FAKE_KEY,
        study_dir=_real_study_dir(),
    )
    mock_client_cls = patch("app.services.realtime_service.httpx.AsyncClient").start()
    mock_ctx = AsyncMock()
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = "v=0\r\no=- answer\r\n"
    mock_response.headers = {"content-type": "application/sdp"}
    mock_ctx.__aenter__.return_value = mock_ctx
    mock_ctx.__aexit__.return_value = False
    mock_ctx.post = AsyncMock(return_value=mock_response)
    mock_client_cls.return_value = mock_ctx

    try:
        req = {**VALID_REQUEST, "study_id": "demo-study", "condition": "gazeaware"}
        resp = client.post("/api/realtime/session", json=req)

        assert resp.status_code == 200
        session_config = _extract_session_config(mock_ctx.post)
        assert session_config is not None
        # gazeaware = condition index 1 → questions 6-10
        assert "capital of France" not in session_config["instructions"]
        assert "largest on Earth" in session_config["instructions"]
    finally:
        patch.stopall()


def test_session_without_study_sends_no_instructions_to_openai():
    client = _make_client(
        openai_realtime_enabled=True,
        openai_api_key=FAKE_KEY,
    )
    mock_client_cls = patch("app.services.realtime_service.httpx.AsyncClient").start()
    mock_ctx = AsyncMock()
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = "v=0\r\no=- answer\r\n"
    mock_response.headers = {"content-type": "application/sdp"}
    mock_ctx.__aenter__.return_value = mock_ctx
    mock_ctx.__aexit__.return_value = False
    mock_ctx.post = AsyncMock(return_value=mock_response)
    mock_client_cls.return_value = mock_ctx

    try:
        resp = client.post("/api/realtime/session", json=VALID_REQUEST)

        assert resp.status_code == 200
        assert "instructions" not in resp.json()
        session_config = _extract_session_config(mock_ctx.post)
        assert session_config is not None
        # No study_id → no instructions in upstream call
        assert "instructions" not in session_config
        # Voice and turn_detection are always present
        assert session_config["voice"] == "alloy"
        td = session_config["turn_detection"]
        assert td == {"type": "server_vad", "silence_duration_ms": 500}
    finally:
        patch.stopall()


def test_session_with_unknown_study_sends_no_instructions():
    client = _make_client(
        openai_realtime_enabled=True,
        openai_api_key=FAKE_KEY,
        study_dir=_real_study_dir(),
    )
    patcher = _mock_openai(200, sdp_text="v=0\r\no=- answer\r\n")
    try:
        req = {**VALID_REQUEST, "study_id": "nonexistent-study"}
        resp = client.post("/api/realtime/session", json=req)
    finally:
        patcher.stop()

    assert resp.status_code == 200
    assert "instructions" not in resp.json()


def test_invalid_study_id_format_returns_422():
    client = _make_client(openai_realtime_enabled=True, openai_api_key=FAKE_KEY)
    req = {**VALID_REQUEST, "study_id": "../etc/passwd"}
    resp = client.post("/api/realtime/session", json=req)
    assert resp.status_code == 422


def test_invalid_condition_format_returns_422():
    client = _make_client(openai_realtime_enabled=True, openai_api_key=FAKE_KEY)
    req = {**VALID_REQUEST, "condition": "a b c !@#"}
    resp = client.post("/api/realtime/session", json=req)
    assert resp.status_code == 422
