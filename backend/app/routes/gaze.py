import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from app.services.gaze_store import gaze_store
from app.services.study_context import study_context

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/api/gaze/latest")
def gaze_latest() -> dict:
    """Return the most recent normalised gaze sample.

    When Tobii is inactive or no data is available the response
    contains ``valid: false`` with null coordinates.
    """
    return gaze_store.latest()


@router.websocket("/api/gaze/stream")
async def gaze_stream(ws: WebSocket) -> None:
    """Push the latest gaze sample over WebSocket.

    Provides a denser, lower-latency live stream than the HTTP polling
    endpoint.  Checks the GazeStore at ~125 Hz and sends whenever the
    version changes or the sample transitions between valid and stale.
    """
    await ws.accept()
    last_version = -1
    last_sent_valid: bool | None = None
    try:
        while True:
            await asyncio.sleep(0.008)  # ~125 Hz check rate
            v, sample = gaze_store.snapshot()
            if v != last_version or sample["valid"] != last_sent_valid:
                last_version = v
                last_sent_valid = sample["valid"]
                await ws.send_json(sample)
    except WebSocketDisconnect:
        pass
    except RuntimeError:
        # send_json on an already-closed socket — exit cleanly
        pass
    except Exception:
        logger.warning("gaze WS stream error", exc_info=True)


class GazeContextUpdate(BaseModel):
    session_id: str | None = None
    step_id: str | None = None
    condition: str | None = None


@router.post("/api/gaze/context")
def update_gaze_context(body: GazeContextUpdate) -> dict:
    """Sync the current study context for backend-side gaze logging.

    Called by the frontend when a conversation step starts or ends,
    so the Tobii research logger can tag samples with session/step/condition.
    """
    study_context.update(body.session_id, body.step_id, body.condition)
    return {"ok": True}
