from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any
from app.models.situation_schemas import (
    SituationTrainRequest,
    SituationTrainResponse,
    SituationClassifyRequest,
    SituationClassifyResponse
)
from app.services.situation_model_service import SituationModelService

router = APIRouter()
service = SituationModelService()

@router.post("/train/situation", response_model=SituationTrainResponse, tags=["situation"])
async def train_situation_model(request: SituationTrainRequest):
    """Train a situation classification model."""
    try:
        return await service.train(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/classify/situation", response_model=SituationClassifyResponse, tags=["situation"])
async def classify_situation(request: SituationClassifyRequest):
    """Classify a time window into situations."""
    try:
        return await service.classify(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/metrics/situation/{model_name}", tags=["situation"])
async def get_situation_metrics(model_name: str):
    """Get metrics and metadata for a specific situation model."""
    try:
        return await service.get_metrics(model_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
