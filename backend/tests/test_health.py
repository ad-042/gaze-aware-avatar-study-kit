"""Smoke tests for the health endpoint and basic app startup."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import create_app


def test_health_returns_ok():
    client = TestClient(create_app())
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"status": "ok"}


def test_health_rejects_post():
    client = TestClient(create_app())
    resp = client.post("/api/health")
    assert resp.status_code == 405
