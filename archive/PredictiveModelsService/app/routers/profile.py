"""Profile tuning API endpoints."""

import logging
from fastapi import APIRouter, HTTPException, status

from app.models.profile_schemas import (
    ProfileTuneRequest,
    ProfileTuneResponse,
    ProfileRecommendRequest,
    ProfileRecommendResponse
)
from app.services.profile_model_service import ProfileModelService

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/train/profile", response_model=ProfileTuneResponse, status_code=status.HTTP_201_CREATED)
async def train_profile_model(request: ProfileTuneRequest):
    """
    Train a profile tuning model.
    
    Trains an XGBoost multi-output model to recommend optimal ISF, ICR,
    and 24 hourly basal rates based on status_history and outcome metrics.
    
    Args:
        request: Training request with samples and hyperparameters
        
    Returns:
        ProfileTuneResponse with training metrics and feature importance
        
    Raises:
        HTTPException: If training fails
    """
    try:
        logger.info(f"Training profile tuning model: {request.model_name} with {len(request.samples)} samples")
        
        if len(request.samples) < 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Need at least 10 training samples to train a profile tuning model"
            )
        
        service = ProfileModelService()
        response = await service.train(request)
        
        logger.info(f"Profile model {request.model_name} trained successfully")
        return response
        
    except ValueError as e:
        logger.error(f"Validation error during profile tuning: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error training profile tuning model: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to train profile tuning model: {str(e)}"
        )


@router.get("/train/profile/models")
async def list_profile_models():
    """
    List all trained profile tuning models.
    
    Returns:
        List of model metadata including ID, creation time, and metrics.
    """
    try:
        service = ProfileModelService()
        models = service.list_models()
        return models
    except Exception as e:
        logger.error(f"Error listing profile tuning models: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list models: {str(e)}"
        )


@router.post("/recommend/profile", response_model=ProfileRecommendResponse)
async def recommend_profile(request: ProfileRecommendRequest):
    """
    Get profile parameter recommendations.
    
    Uses a trained profile tuning model to recommend optimal ISF, ICR,
    and basal rates based on current status_history and settings.
    
    Args:
        request: Recommendation request with model name, status_history, and current settings
        
    Returns:
        ProfileRecommendResponse with recommended ISF, ICR, and basal rates
        
    Raises:
        HTTPException: If recommendation fails or model not found
    """
    try:
        logger.info(f"Recommending profile parameters with model: {request.model_name}")
        
        if not request.status_history or len(request.status_history) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="status_history cannot be empty"
            )
        
        if len(request.current_basal) != 24:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"current_basal must contain exactly 24 hourly values, got {len(request.current_basal)}"
            )
        
        service = ProfileModelService()
        response = await service.recommend(request)
        
        logger.info(
            f"Profile recommendations: ISF={response.recommended_isf:.2f} "
            f"({response.isf_change_percent:+.1f}%), "
            f"ICR={response.recommended_icr:.2f} ({response.icr_change_percent:+.1f}%)"
        )
        return response
        
    except FileNotFoundError as e:
        logger.error(f"Model not found: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model '{request.model_name}' not found. Please train it first."
        )
    except ValueError as e:
        logger.error(f"Validation error during profile recommendation: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error recommending profile: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to recommend profile parameters: {str(e)}"
        )
