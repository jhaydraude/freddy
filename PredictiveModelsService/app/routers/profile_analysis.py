"""Profile analysis API router"""

import logging
from fastapi import APIRouter, HTTPException, status

from app.models.profile_analysis_schemas import (
    ProfileAnalysisRequest,
    ProfileAnalysisResponse
)
from app.services.holistic_profile_analyzer import HolisticProfileAnalyzer

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/analyze/profile", response_model=ProfileAnalysisResponse)
async def analyze_profile(request: ProfileAnalysisRequest):
    """
    Analyze profile parameters using holistic optimization.
    
    Estimates ISF, ICR, and 24 basal rates simultaneously by modeling
    the complete insulin-glucose-carb system over time windows.
    
    Args:
        request: List of time windows with glucose, insulin, carb data
        
    Returns:
        Estimated parameters with confidence metrics
        
    Raises:
        HTTPException: If analysis fails or insufficient data
    """
    try:
        logger.info(f"Analyzing profile from {len(request.windows)} time windows")
        
        if len(request.windows) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No time windows provided"
            )
        
        analyzer = HolisticProfileAnalyzer()
        result = analyzer.analyze(request.windows)
        
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Insufficient data for analysis. Need at least 10 time windows."
            )
        
        # Generate recommendation
        if result.r_squared > 0.7:
            quality = "High"
        elif result.r_squared > 0.4:
            quality = "Medium"
        else:
            quality = "Low"
        
        avg_basal = sum(result.estimated_basal_rates) / 24
        
        recommendation = (
            f"{quality} confidence estimates based on {result.windows_analyzed} windows. "
            f"ISF: {result.estimated_isf:.1f} mg/dL/U, "
            f"ICR: {result.estimated_icr:.1f} g/U, "
            f"Avg Basal: {avg_basal:.2f} U/hr. "
            f"Model fit: R²={result.r_squared:.3f}, RMSE={result.rmse:.1f} mg/dL."
        )
        
        logger.info(f"Analysis complete: ISF={result.estimated_isf:.1f}, ICR={result.estimated_icr:.1f}, R²={result.r_squared:.3f}")
        
        return ProfileAnalysisResponse(
            estimated_isf=result.estimated_isf,
            estimated_icr=result.estimated_icr,
            estimated_basal_rates=result.estimated_basal_rates,
            r_squared=result.r_squared,
            rmse=result.rmse,
            mae=result.mae,
            windows_analyzed=result.windows_analyzed,
            stable_windows=result.stable_windows,
            meal_windows=result.meal_windows,
            recommendation=recommendation
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error analyzing profile: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to analyze profile: {str(e)}"
        )
