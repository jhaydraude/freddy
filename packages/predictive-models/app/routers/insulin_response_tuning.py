"""Insulin Response Tuning API router"""

import logging
from typing import List, Optional, Dict, Tuple
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.services.insulin_response_optimizer import InsulinResponseOptimizer, InsulinResponseResult, TimeWindow

router = APIRouter()
logger = logging.getLogger(__name__)


class InsulinResponseTuningRequest(BaseModel):
    """Request for insulin response tuning"""
    windows: List[TimeWindow]
    current_dia: float = 5.0
    current_peak: float = 45.0
    current_isf: Optional[List[float]] = None
    optimize_dia: bool = True
    optimize_peak: bool = True
    optimize_isf: bool = True
    lambda_l2: float = 0.1
    lambda_smooth: float = 0.05


class InsulinResponseTuningResponse(BaseModel):
    """Response from insulin response tuning"""
    # Optimized parameters
    dia: float
    peak: float
    isf: List[float]
    
    # Confidence intervals
    dia_confidence: Tuple[float, float]
    peak_confidence: Tuple[float, float]
    isf_confidence: List[Tuple[float, float]]
    
    # Quality metrics
    r_squared: float
    rmse: float
    mae: float
    windows_analyzed: int
    
    # Analysis summary
    total_windows: int
    stable_windows: int
    meal_windows: int
    activity_windows: int
    data_quality_score: float
    
    # Recommendation text
    recommendation: str


@router.post("/tune/insulin-response", response_model=InsulinResponseTuningResponse)
async def tune_insulin_response(request: InsulinResponseTuningRequest):
    """
    Optimize insulin response parameters (DIA, Peak Time, ISF).
    
    This endpoint performs advanced optimization to find the best-fit
    insulin response parameters based on historical glucose and treatment data.
    """
    try:
        logger.info(
            f"Tuning insulin response from {len(request.windows)} windows "
            f"(DIA={request.optimize_dia}, Peak={request.optimize_peak}, ISF={request.optimize_isf})"
        )
        
        if len(request.windows) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No time windows provided"
            )
        
        # Initialize optimizer
        optimizer = InsulinResponseOptimizer()
        
        # Run optimization
        result = optimizer.analyze_insulin_response(
            windows=request.windows,
            current_dia=request.current_dia,
            current_peak=request.current_peak,
            current_isf=request.current_isf,
            optimize_dia=request.optimize_dia,
            optimize_peak=request.optimize_peak,
            optimize_isf=request.optimize_isf,
            lambda_l2=request.lambda_l2,
            lambda_smooth=request.lambda_smooth
        )
        
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Insufficient data for tuning. Need at least 10 time windows."
            )
        
        # Generate recommendation text
        quality = "High" if result.r_squared > 0.7 else "Medium" if result.r_squared > 0.4 else "Low"
        
        dia_change = result.dia - request.current_dia
        peak_change = result.peak - request.current_peak
        avg_isf = sum(result.isf) / 6
        
        recommendation_parts = [
            f"{quality} confidence estimates based on {result.windows_analyzed} windows.",
            f"Model fit: R²={result.r_squared:.3f}, RMSE={result.rmse:.1f} mg/dL."
        ]
        
        if request.optimize_dia:
            recommendation_parts.append(
                f"DIA: {result.dia:.2f}h ({dia_change:+.2f}h from current)"
            )
        
        if request.optimize_peak:
            recommendation_parts.append(
                f"Peak: {result.peak:.0f}min ({peak_change:+.0f}min from current)"
            )
        
        if request.optimize_isf:
            recommendation_parts.append(
                f"ISF (avg): {avg_isf:.1f} mg/dL/U"
            )
        
        recommendation = " ".join(recommendation_parts)
        
        logger.info(
            f"Tuning complete: DIA={result.dia:.2f}h, Peak={result.peak:.0f}min, "
            f"ISF(avg)={avg_isf:.1f}, R²={result.r_squared:.3f}"
        )
        
        return InsulinResponseTuningResponse(
            dia=result.dia,
            peak=result.peak,
            isf=result.isf,
            dia_confidence=result.dia_confidence,
            peak_confidence=result.peak_confidence,
            isf_confidence=result.isf_confidence,
            r_squared=result.r_squared,
            rmse=result.rmse,
            mae=result.mae,
            windows_analyzed=result.windows_analyzed,
            total_windows=result.total_windows,
            stable_windows=result.stable_windows,
            meal_windows=result.meal_windows,
            activity_windows=result.activity_windows,
            data_quality_score=result.data_quality_score,
            recommendation=recommendation
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error tuning insulin response: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to tune insulin response: {str(e)}"
        )
