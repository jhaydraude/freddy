"""Prediction endpoints."""

import logging
from fastapi import APIRouter, HTTPException, status

from app.models.schemas import PredictRequest, PredictResponse
from app.services.model_service import ModelService

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/predict", response_model=PredictResponse)
async def make_prediction(request: PredictRequest):
    """
    Make predictions using a trained model.
    
    Args:
        request: Prediction request containing model name and input data
        
    Returns:
        PredictResponse with predictions
        
    Raises:
        HTTPException: If prediction fails or model not found
    """
    try:
        logger.info(f"Making prediction with model: {request.model_name}")
        
        # Make predictions using the service layer
        model_service = ModelService()
        response = await model_service.predict(
            model_name=request.model_name,
            data=request.data
        )
        
        logger.info(f"Prediction completed for model {request.model_name}")
        return response
        
    except FileNotFoundError as e:
        logger.error(f"Model not found: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model '{request.model_name}' not found. Please train the model first."
        )
    except ValueError as e:
        logger.error(f"Validation error during prediction: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error making prediction: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to make prediction: {str(e)}"
        )
