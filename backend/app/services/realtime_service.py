"""Service for relaying SDP offers to OpenAI Realtime API."""

from __future__ import annotations

import json
import logging

import httpx

from app.schemas.realtime import RealtimeSessionRequest, RealtimeSessionResponse
from app.services import assignment_service
from app.services.study_loader import StudyLoadError, load_study
from app.settings import settings

logger = logging.getLogger(__name__)

_OPENAI_REALTIME_URL = "https://api.openai.com/v1/realtime"


class RealtimeDisabledError(Exception):
    pass


class RealtimeUpstreamError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def _is_available() -> bool:
    return settings.openai_realtime_enabled and bool(settings.openai_api_key)


def _build_instructions(
    study_id: str | None,
    condition: str | None,
    session_id: str | None = None,
    step_id: str | None = None,
) -> str | None:
    """Build Realtime session instructions from StudyConfig prompts.

    Preferred path: resolve questions from the stored session assignment
    (by session_id + step_id). Fallback: derive from condition index.
    Returns the assembled instructions string, or None if unavailable.
    """
    if not study_id:
        return None

    # --- Preferred: stored assignment ---
    if session_id and step_id:
        round_data = assignment_service.get_round_for_step(session_id, step_id)
        if round_data is not None:
            try:
                config = load_study(study_id)
            except StudyLoadError:
                return None
            prompts = config.prompts.quiz
            q_list = "\n".join(f"{i + 1}. {q}" for i, q in enumerate(round_data.questions))
            return f"{prompts.system_base}\n\n{q_list}\n\n{prompts.system_end}"

    # --- Fallback: condition-index slicing ---
    try:
        config = load_study(study_id)
    except StudyLoadError:
        logger.warning(
            "Could not load study '%s' for realtime instructions — using no instructions",
            study_id,
        )
        return None

    prompts = config.prompts.quiz
    meta = config.meta

    # Determine question subset based on condition index
    cond_index = 0
    if condition and condition in meta.conditions:
        cond_index = meta.conditions.index(condition)

    qpc = meta.questions_per_condition
    start = cond_index * qpc
    end = start + qpc
    selected = prompts.questions[start:end]

    # Fallback: if slice is empty (e.g. not enough questions), use first N
    if not selected:
        selected = prompts.questions[:qpc]

    q_list = "\n".join(f"{i + 1}. {q.text}" for i, q in enumerate(selected))
    return f"{prompts.system_base}\n\n{q_list}\n\n{prompts.system_end}"


def _build_session_config(
    instructions: str | None,
    avatar_voice: str | None = None,
) -> dict[str, object]:
    """Build the session configuration dict sent to the OpenAI Realtime API."""
    config: dict[str, object] = {
        "voice": avatar_voice or settings.openai_realtime_voice,
        "turn_detection": {
            "type": "server_vad",
            "silence_duration_ms": 500,
        },
    }
    if instructions:
        config["instructions"] = instructions
    if settings.log_mode == "research":
        config["input_audio_transcription"] = {"model": "whisper-1"}
    return config


async def create_session(
    request: RealtimeSessionRequest,
) -> RealtimeSessionResponse:
    if not _is_available():
        raise RealtimeDisabledError

    instructions = _build_instructions(
        request.study_id,
        request.condition,
        session_id=request.session_id,
        step_id=request.step_id,
    )

    logger.info(
        "realtime session requested (sid=%s, model=%s, study=%s, cond=%s, step=%s, instr=%s)",
        request.session_id,
        settings.openai_realtime_model,
        request.study_id,
        request.condition,
        request.step_id,
        instructions is not None,
    )

    session_config = _build_session_config(instructions, avatar_voice=request.avatar_voice)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                _OPENAI_REALTIME_URL,
                params={"model": settings.openai_realtime_model},
                headers={
                    "Authorization": f"Bearer {settings.openai_api_key}",
                    "OpenAI-Beta": "realtime=v1",
                },
                files={
                    "sdp": (None, request.sdp_offer, "application/sdp"),
                    "session": (
                        None,
                        json.dumps(session_config),
                        "application/json",
                    ),
                },
            )
    except httpx.HTTPError:
        logger.warning(
            "OpenAI realtime connection error (session_id=%s)",
            request.session_id,
        )
        raise RealtimeUpstreamError(
            status_code=502,
            detail="Could not connect to upstream realtime service.",
        ) from None

    if resp.status_code >= 400:
        body_text = resp.text[:500]
        logger.warning(
            "OpenAI realtime upstream error (status=%d, session_id=%s, body=%s)",
            resp.status_code,
            request.session_id,
            body_text,
        )
        raise RealtimeUpstreamError(
            status_code=resp.status_code,
            detail="Upstream realtime service returned an error.",
        )

    # OpenAI may return JSON (with "sdp" field) or raw SDP text
    content_type = resp.headers.get("content-type", "")
    raw = resp.text

    if "application/json" in content_type or raw.lstrip().startswith("{"):
        try:
            body = json.loads(raw)
            sdp_answer = body.get("sdp", "")
        except json.JSONDecodeError:
            sdp_answer = ""
    else:
        sdp_answer = raw

    if not sdp_answer or not sdp_answer.strip():
        raise RealtimeUpstreamError(
            status_code=502,
            detail="Upstream realtime service returned no SDP answer.",
        )

    # Normalize line endings to CRLF (SDP spec requires \r\n per RFC 4566)
    sdp_answer = sdp_answer.replace("\r\n", "\n").replace("\r", "\n").replace("\n", "\r\n")
    # Ensure SDP ends with \r\n (RFC 4566 requires every line to be terminated)
    if not sdp_answer.endswith("\r\n"):
        sdp_answer += "\r\n"

    return RealtimeSessionResponse(
        sdp_answer=sdp_answer,
        model=settings.openai_realtime_model,
        voice=request.avatar_voice or settings.openai_realtime_voice,
    )
