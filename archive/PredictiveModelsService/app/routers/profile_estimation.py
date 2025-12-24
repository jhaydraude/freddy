"""Profile estimation API endpoints"""

import logging
from fastapi import APIRouter, HTTPException, status

from app.models.profile_estimation_schemas import (
    ISFEstimateRequest,
    ISFEstimateResponse
)
from app.services.profile_estimator import ProfileEstimator

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/estimate/isf", response_model=ISFEstimateResponse)
async def estimate_isf(request: ISFEstimateRequest):
    """
    Estimate ISF from insulin correction events.
    
    Uses physiologically-based approach: calculates median glucose change
    per unit of total active insulin from historical correction events.
    
    Args:
        request: List of correction events with IOB tracking
        
    Returns:
        ISF estimation with confidence intervals
        
    Raises:
        HTTPException: If estimation fails or insufficient data
    """
    try:
        logger.info(f"Estimating ISF from {len(request.events)} correction events")
        
        if len(request.events) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No correction events provided"
            )
        
        estimator = ProfileEstimator()
        result = estimator.estimate_isf(request.events)
        
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Insufficient valid correction events for ISF estimation. Need at least 3 high-quality events with low IOB and no carb interference."
            )
        
        # Generate recommendation based on quality
        if result.quality == 'high':
            recommendation = f"High confidence ISF estimate of {result.estimated_isf:.1f} based on {result.sample_count} corrections. Recommended to use this value."
        elif result.quality == 'medium':
            recommendation = f"Medium confidence ISF estimate of {result.estimated_isf:.1f} based on {result.sample_count} corrections. Consider collecting more data."
        else:
            recommendation = f"Low confidence ISF estimate of {result.estimated_isf:.1f} based on limited data ({result.sample_count} corrections). More data needed for reliable estimate."
        
        logger.info(f"ISF estimated: {result.estimated_isf:.1f} (quality: {result.quality}, n={result.sample_count})")
        
        return ISFEstimateResponse(
            estimated_isf=result.estimated_isf,
            confidence_interval_lower=result.confidence_interval_lower,
            confidence_interval_upper=result.confidence_interval_upper,
            sample_count=result.sample_count,
            high_quality_count=result.high_quality_count,
            quality=result.quality,
            recommendation=recommendation
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error estimating ISF: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to estimate ISF: {str(e)}"
        )
