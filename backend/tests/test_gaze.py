"""Tests for gaze endpoints — HTTP polling and WebSocket stream."""

from __future__ import annotations

import contextlib
import time

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.gaze_store import GazeSample, gaze_store


@pytest.fixture()
def client():
    return TestClient(create_app())


@pytest.fixture(autouse=True)
def _reset_gaze_store():
    """Reset the module-level GazeStore singleton between tests."""
    with gaze_store._lock:
        gaze_store._sample = GazeSample()
        gaze_store._version = 0
    yield
    with gaze_store._lock:
        gaze_store._sample = GazeSample()
        gaze_store._version = 0


# ---------------------------------------------------------------------------
# HTTP /api/gaze/latest
# ---------------------------------------------------------------------------


class TestGazeLatest:
    def test_invalid_when_empty(self, client: TestClient):
        resp = client.get("/api/gaze/latest")
        assert resp.status_code == 200
        body = resp.json()
        assert body["valid"] is False
        assert body["x"] is None

    def test_valid_after_update(self, client: TestClient):
        gaze_store.update(0.5, 0.3)
        body = client.get("/api/gaze/latest").json()
        assert body["valid"] is True
        assert body["x"] == pytest.approx(0.5)
        assert body["y"] == pytest.approx(0.3)

    def test_stale_returns_invalid(self, client: TestClient):
        gaze_store.update(0.5, 0.3)
        with gaze_store._lock:
            gaze_store._sample.timestamp = time.time() - 1.0
        body = client.get("/api/gaze/latest").json()
        assert body["valid"] is False


# ---------------------------------------------------------------------------
# WebSocket /api/gaze/stream
# ---------------------------------------------------------------------------


class TestGazeWebSocket:
    """WebSocket /api/gaze/stream contract tests.

    The endpoint runs a server-push loop (~125 Hz) that never calls
    ``receive()``.  Each test opens the WebSocket, reads one message,
    asserts its content, then forces the store to change version and
    explicitly closes the socket.  The version bump guarantees the
    server-side loop will attempt another ``send_json`` on its next
    iteration, at which point it detects the closed connection and
    exits cleanly.
    """

    @staticmethod
    def _open_and_receive(client: TestClient) -> tuple[object, dict]:
        """Connect, receive one message, return (session, data)."""
        session = client.websocket_connect("/api/gaze/stream")
        session.__enter__()
        data = session.receive_json()
        return session, data

    @staticmethod
    def _close_cleanly(session: object) -> None:
        """Bump the store version, then close the WS.

        The version bump ensures the server loop will attempt a send on
        its next ~8 ms tick, discover the closed socket, and exit the
        handler — preventing a blocked ``__exit__``.
        """
        gaze_store.update(0.0, 0.0)
        with contextlib.suppress(Exception):
            session.__exit__(None, None, None)  # type: ignore[union-attr]

    def test_receives_valid_sample(self, client: TestClient):
        gaze_store.update(0.6, 0.4)
        session, data = self._open_and_receive(client)
        try:
            assert data["valid"] is True
            assert data["x"] == pytest.approx(0.6)
            assert data["y"] == pytest.approx(0.4)
        finally:
            self._close_cleanly(session)

    def test_receives_invalid_when_empty(self, client: TestClient):
        session, data = self._open_and_receive(client)
        try:
            assert data["valid"] is False
            assert data["x"] is None
        finally:
            self._close_cleanly(session)

    def test_stale_sent_as_invalid(self, client: TestClient):
        gaze_store.update(0.5, 0.3)
        with gaze_store._lock:
            gaze_store._sample.timestamp = time.time() - 1.0
        session, data = self._open_and_receive(client)
        try:
            assert data["valid"] is False
        finally:
            self._close_cleanly(session)
