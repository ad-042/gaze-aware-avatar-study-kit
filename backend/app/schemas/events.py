"""Pydantic schemas for event logging."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

# Allows server-issued hex IDs (16 chars) and frontend crypto.randomUUID() (36 chars).
# Prevents path traversal — only hex digits and hyphens.
_SESSION_ID_PATTERN = r"^[0-9a-fA-F\-]{16,36}$"


class LogEvent(BaseModel):
    schema_version: int = Field(ge=1)
    timestamp: str = Field(min_length=1)
    session_id: str = Field(pattern=_SESSION_ID_PATTERN)
    event_type: str = Field(min_length=1)
    data: dict[str, Any] | None = None


class EventBatch(BaseModel):
    events: list[LogEvent] = Field(min_length=1)


class CreateSessionRequest(BaseModel):
    participant_id: str | None = Field(default=None, max_length=100)
    trial_id: str | None = Field(default=None, max_length=100)
    session_label: str | None = Field(default=None, max_length=100)
    operator_notes: str | None = Field(default=None, max_length=500)


class SessionResponse(BaseModel):
    session_id: str
