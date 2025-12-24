"""Training endpoints."""

import logging
from fastapi import APIRouter, HTTPException, status

from app.models.schemas import TrainRequest, TrainResponse
from app.services.model_service import ModelService

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/train", response_model=TrainResponse, status_code=status.HTTP_201_CREATED)
async def train_model(request: TrainRequest):
    """
    Train a new predictive model.
    
    Args:
        request: Training request containing model configuration and data
        
    Returns:
        TrainResponse with training results and metrics
        
    Raises:
        HTTPException: If training fails
    """
    try:
        logger.info(f"Training model: {request.model_name} (type: {request.model_type})")
        
        # Validate model type
        if request.model_type not in ["regression", "classification"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported model type: {request.model_type}. Supported types: regression, classification"
            )
        
        # Train the model using the service layer
        model_service = ModelService()
        response = await model_service.train_model(
            model_name=request.model_name,
            model_type=request.model_type,
            data=request.data,
            target_column=request.target_column,
            parameters=request.parameters
        )
        
        logger.info(f"Model {request.model_name} trained successfully")
        return response
        
    except ValueError as e:
        logger.error(f"Validation error during training: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error training model: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to train model: {str(e)}"
        )


@router.get("/models", response_model=list)
async def list_models():
    """
    List all available trained models.
    
    Returns:
        List of available model names and metadata
    """
    try:
        model_service = ModelService()
        models = await model_service.list_models()
        return models
        
    except Exception as e:
        logger.error(f"Error listing models: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list models: {str(e)}"
        )
