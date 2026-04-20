"""Pydantic schemas for the realtime SDP relay endpoint."""

from __future__ import annotations

from pydantic import BaseModel, Field

_SESSION_ID_PATTERN = r"^[0-9a-fA-F\-]{16,36}$"
_SAFE_ID_PATTERN = r"^[a-zA-Z0-9_\-]{1,64}$"


class RealtimeSessionRequest(BaseModel):
    sdp_offer: str = Field(min_length=1)
    session_id: str = Field(pattern=_SESSION_ID_PATTERN)
    study_id: str | None = Field(default=None, pattern=_SAFE_ID_PATTERN)
    condition: str | None = Field(default=None, pattern=_SAFE_ID_PATTERN)
    step_id: str | None = Field(default=None, pattern=_SAFE_ID_PATTERN)
    avatar_voice: str | None = Field(default=None, pattern=_SAFE_ID_PATTERN)


class RealtimeSessionResponse(BaseModel):
    sdp_answer: str
    model: str
    voice: str
