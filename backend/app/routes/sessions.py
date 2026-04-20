"""Session management endpoint."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.events import CreateSessionRequest, SessionResponse
from app.schemas.study import AssignmentRequest, ResolvedStudyAssignment
from app.services import assignment_service
from app.services.logging_service import logging_service
from app.services.study_loader import StudyLoadError, load_study
from app.settings import settings

router = APIRouter()


@router.post("/api/app-sessions", status_code=201)
def create_session(
    body: CreateSessionRequest | None = None,
) -> SessionResponse:
    """Create a new logging session and return its ID.

    Accepts optional metadata (participant_id, trial_id, session_label).
    operator_notes are only persisted when log_mode is "research".
    """
    metadata: dict[str, str] = {}
    if body:
        if body.participant_id:
            metadata["participant_id"] = body.participant_id
        if body.trial_id:
            metadata["trial_id"] = body.trial_id
        if body.session_label:
            metadata["session_label"] = body.session_label
        # operator_notes only persisted in research mode
        if body.operator_notes and settings.log_mode == "research":
            metadata["operator_notes"] = body.operator_notes
    session_id = logging_service.create_session(metadata=metadata if metadata else None)
    return SessionResponse(session_id=session_id)


@router.post("/api/sessions/{session_id}/assignment")
def create_or_get_assignment(
    session_id: str,
    body: AssignmentRequest,
) -> ResolvedStudyAssignment:
    """Generate (or return existing) session-scoped study assignment."""
    try:
        config = load_study(body.study_id)
    except StudyLoadError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return assignment_service.create_assignment(session_id, config)
