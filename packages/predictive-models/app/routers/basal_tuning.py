from fastapi import APIRouter, HTTPException, status
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel

from ..services.basal_rate_optimizer import BasalRateOptimizer, BasalRateResult, TimeWindow

router = APIRouter()

class BasalTuningRequest(BaseModel):
    windows: List[TimeWindow]
    current_rates: List[float]  # 12 two-hour block basal rates
    current_isf: List[float]    # 12 two-hour block ISF values

class BasalTuningResponse(BaseModel):
    rates: List[float]                  
    rates_confidence: List[Tuple[float, float]]
    drift_per_block: List[float]
    windows_per_block: List[int]
    rmse: float
    mae: float
    r_squared: float
    clean_windows_analyzed: int

@router.post("/tune/basal-rate", response_model=BasalTuningResponse)
async def tune_basal_rate(request: BasalTuningRequest):
    """
    Optimize basal rates across 12 two-hour blocks using L-BFGS-B constraints.
    """
    optimizer = BasalRateOptimizer()
    
    try:
        result = optimizer.analyze_basal_rates(
            windows=request.windows,
            current_rates=request.current_rates,
            current_isf=request.current_isf
        )
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Insufficient pure basal windows to optimize rates."
            )
            
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Optimization failed: {str(e)}"
        )
