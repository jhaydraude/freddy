"""Profile analysis API router"""

import logging
from typing import List
from fastapi import APIRouter, HTTPException, status

from app.models.profile_analysis_schemas import (
    ProfileAnalysisRequest,
    ProfileAnalysisResponse
)
from app.services.holistic_profile_analyzer import HolisticProfileAnalyzer

router = APIRouter()
logger = logging.getLogger(__name__)


def _create_recommended_profile(
    current_profile: dict,
    estimated_isf: List[float],
    estimated_icr: List[float],
    estimated_basal_rates: List[float]
):
    """
    Create recommended profile in NightScout format based on analysis results.
    
    Args:
        current_profile: Current profile dict
        estimated_isf: List of 6 four-hour ISF block estimates
        estimated_icr: List of 6 four-hour ICR block estimates
        estimated_basal_rates: List of 6 four-hour basal block rates
        
    Returns:
        ProfileStore with recommended values
    """
    from app.models.profile_analysis_schemas import ProfileStore
    
    # Create 4-hour schedule (6 blocks) for Basal, ISF, ICR
    # Blocks: 0-3hr, 4-7hr, 8-11hr, 12-15hr, 16-19hr, 20-23hr
    basal_schedule = []
    sens_schedule = []
    carbratio_schedule = []
    
    for block_idx in range(6):
        hour = block_idx * 4
        time_str = f"{hour:02d}:00"
        seconds = hour * 3600
        
        basal_schedule.append({
            "time": time_str,
            "value": round(estimated_basal_rates[block_idx], 3),
            "timeAsSeconds": seconds
        })
        
        sens_schedule.append({
            "time": time_str,
            "value": round(estimated_isf[block_idx], 1),
            "timeAsSeconds": seconds
        })
        
        carbratio_schedule.append({
            "time": time_str,
            "value": round(estimated_icr[block_idx], 1),
            "timeAsSeconds": seconds
        })
    
    # Preserve target ranges from current profile
    target_low = current_profile.get("target_low", [{"time": "00:00", "value": 100, "timeAsSeconds": 0}])
    target_high = current_profile.get("target_high", [{"time": "00:00", "value": 120, "timeAsSeconds": 0}])
    
    # Preserve DIA and units from current profile
    dia = current_profile.get("dia", 4.0)
    units = current_profile.get("units", "mg/dl")
    
    return ProfileStore(
        dia=dia,
        carbratio=carbratio_schedule,
        sens=sens_schedule,
        basal=basal_schedule,
        target_low=target_low,
        target_high=target_high,
        units=units
    )



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
        
        avg_basal = sum(result.estimated_basal_rates) / 6
        avg_isf = sum(result.estimated_isf) / 6
        avg_icr = sum(result.estimated_icr) / 6
        
        recommendation = (
            f"{quality} confidence estimates based on {result.windows_analyzed} windows. "
            f"Avg ISF: {avg_isf:.1f} mg/dL/U, "
            f"Avg ICR: {avg_icr:.1f} g/U, "
            f"Avg Basal: {avg_basal:.2f} U/hr. "
            f"Model fit: R²={result.r_squared:.3f}, RMSE={result.rmse:.1f} mg/dL."
        )
        
        logger.info(f"Analysis complete: ISF(avg)={avg_isf:.1f}, ICR(avg)={avg_icr:.1f}, R²={result.r_squared:.3f}")
        
        # Format current profile (if provided)
        current_profile_formatted = None
        if request.current_profile:
            from app.models.profile_analysis_schemas import ProfileStore
            current_profile_formatted = ProfileStore(**request.current_profile)
        
        # Format recommended profile
        recommended_profile_formatted = None
        if request.current_profile:
            # Use current profile as template, updating estimated values
            recommended_profile_formatted = _create_recommended_profile(
                current_profile=request.current_profile,
                estimated_isf=result.estimated_isf,
                estimated_icr=result.estimated_icr,
                estimated_basal_rates=result.estimated_basal_rates
            )
        
        return ProfileAnalysisResponse(
            current_profile=current_profile_formatted,
            recommended_profile=recommended_profile_formatted,
            estimated_isf=result.estimated_isf,
            estimated_icr=result.estimated_icr,
            estimated_basal_rates=result.estimated_basal_rates,
            isf_confidence=result.isf_confidence,
            icr_confidence=result.icr_confidence,
            basal_confidence=result.basal_confidence,
            r_squared=result.r_squared,
            rmse=result.rmse,
            mae=result.mae,
            windows_analyzed=result.windows_analyzed,
            windows_filtered_out=result.windows_filtered_out,
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
