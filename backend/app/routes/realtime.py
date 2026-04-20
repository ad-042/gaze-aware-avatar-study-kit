"""Realtime SDP relay endpoint."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.schemas.realtime import RealtimeSessionRequest, RealtimeSessionResponse
from app.services.realtime_service import (
    RealtimeDisabledError,
    RealtimeUpstreamError,
    create_session,
)

router = APIRouter()


@router.post("/api/realtime/session")
async def realtime_session(body: RealtimeSessionRequest) -> RealtimeSessionResponse:
    """Relay an SDP offer to OpenAI's Realtime API and return the SDP answer.

    The frontend never sees the API key — this endpoint proxies the
    WebRTC negotiation so the secret stays server-side.
    """
    try:
        return await create_session(body)
    except RealtimeDisabledError:
        return JSONResponse(
            status_code=503,
            content={"detail": "Realtime is not available."},
        )
    except RealtimeUpstreamError as exc:
        return JSONResponse(
            status_code=502,
            content={"detail": exc.detail},
        )
