"""Study configuration endpoint."""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Path

from app.schemas.common import SAFE_ID_PATTERN
from app.schemas.study import StudyConfig
from app.services.study_loader import StudyLoadError, load_study

router = APIRouter()

StudyId = Annotated[str, Path(pattern=SAFE_ID_PATTERN)]


@router.get("/api/studies/{study_id}")
def get_study(study_id: StudyId) -> StudyConfig:
    try:
        return load_study(study_id)
    except StudyLoadError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
