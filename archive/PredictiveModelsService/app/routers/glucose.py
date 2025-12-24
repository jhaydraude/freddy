"""Glucose prediction endpoints."""

import logging
from fastapi import APIRouter, HTTPException, status

from app.models.glucose_schemas import (
    GlucoseTrainRequest,
    GlucoseTrainResponse,
    GlucosePredictRequest,
    GlucosePredictResponse
)
from app.services.glucose_model_service import GlucoseModelService

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/train/glucose", response_model=GlucoseTrainResponse, status_code=status.HTTP_201_CREATED)
async def train_glucose_model(request: GlucoseTrainRequest):
    """
    Train a glucose prediction model.
    
    Trains an XGBoost model to predict blood glucose 60 minutes ahead
    based on status_history input (glucose trends, IOB, COB, basal, etc.).
    
    Args:
        request: Training request with samples and hyperparameters
        
    Returns:
        GlucoseTrainResponse with training metrics and feature importance
        
    Raises:
        HTTPException: If training fails
    """
    try:
        logger.info(f"Training glucose model: {request.model_name} with {len(request.samples)} samples")
        
        if len(request.samples) < 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Need at least 10 training samples to train a glucose model"
            )
        
        service = GlucoseModelService()
        response = await service.train(request)
        
        logger.info(f"Glucose model {request.model_name} trained successfully")
        return response
        
    except ValueError as e:
        logger.error(f"Validation error during glucose training: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error training glucose model: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to train glucose model: {str(e)}"
        )


@router.get("/train/glucose/models")
async def list_glucose_models():
    """
    List all trained glucose prediction models.
    
    Returns:
        List of model metadata including ID, creation time, and metrics.
    """
    try:
        service = GlucoseModelService()
        models = service.list_models()
        return models
    except Exception as e:
        logger.error(f"Error listing glucose models: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list models: {str(e)}"
        )


@router.post("/predict/glucose", response_model=GlucosePredictResponse)
async def predict_glucose(request: GlucosePredictRequest):
    """
    Predict blood glucose 60 minutes ahead.
    
    Uses a trained glucose prediction model to forecast blood glucose
    based on current status_history (typically 60 minutes of historical data).
    
    Prediction assumes no additional carb or insulin input.
    
    Args:
        request: Prediction request with model name and status_history
        
    Returns:
        GlucosePredictResponse with predicted glucose and analysis
        
    Raises:
        HTTPException: If prediction fails or model not found
    """
    try:
        logger.info(f"Predicting glucose with model: {request.model_name}")
        
        if not request.status_history or len(request.status_history) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="status_history cannot be empty"
            )
        
        service = GlucoseModelService()
        response = await service.predict(request)
        
        logger.info(f"Glucose prediction completed: {response.predicted_glucose_60min:.1f} mg/dL")
        return response
        
    except FileNotFoundError as e:
        logger.error(f"Model not found: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model '{request.model_name}' not found. Please train it first."
        )
    except ValueError as e:
        logger.error(f"Validation error during glucose prediction: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error predicting glucose: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to predict glucose: {str(e)}"
        )
