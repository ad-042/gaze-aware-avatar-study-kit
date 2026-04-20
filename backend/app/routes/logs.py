"""Batched event logging endpoint."""

from fastapi import APIRouter

from app.schemas.events import EventBatch
from app.services.logging_service import logging_service

router = APIRouter()


@router.post("/api/log/events", status_code=202)
def log_events(batch: EventBatch) -> dict:
    written = logging_service.write_events(batch.events)
    return {"accepted": written}


@router.post("/api/logs", status_code=202, include_in_schema=False)
def log_events_compat(batch: EventBatch) -> dict:
    """Alias for /api/log/events — matches the frontend BackendReporter default."""
    return log_events(batch)
