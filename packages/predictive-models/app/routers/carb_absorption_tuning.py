from fastapi import APIRouter, HTTPException, status
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel

from ..services.carb_absorption_optimizer import CarbAbsorptionOptimizer, CarbAbsorptionResult, TimeWindow

router = APIRouter()

class CarbTuningRequest(BaseModel):
    windows: List[TimeWindow]
    current_icr: Optional[List[float]] = None
    current_absorption_rate: float = 30.0
    current_min_carb_impact: float = 8.0
    optimize_icr: bool = True
    optimize_absorption_rate: bool = True
    optimize_min_carb_impact: bool = True

class CarbTuningResponse(BaseModel):
    # Optimized parameters
    icr: List[float]
    absorption_rate: float
    min_carb_impact: float
    s_curve_params: Dict[str, float]
    
    # Confidence intervals
    icr_confidence: List[Tuple[float, float]]
    absorption_rate_confidence: Tuple[float, float]
    min_carb_impact_confidence: Tuple[float, float]
    
    # Quality metrics
    r_squared: float
    rmse: float
    mae: float
    meal_windows_analyzed: int
    
    # Analysis summary
    total_meal_events: int
    avg_meal_size: float
    meal_distribution_by_time: Dict[str, float]
    data_quality_score: float

@router.post("/tune/carb-absorption", response_model=CarbTuningResponse)
async def tune_carb_absorption(request: CarbTuningRequest):
    """
    Optimize carb absorption parameters (ICR, Absorption Rate, Min Impact)
    """
    optimizer = CarbAbsorptionOptimizer()
    
    try:
        result = optimizer.analyze_carb_absorption(
            windows=request.windows,
            current_icr=request.current_icr,
            current_absorption_rate=request.current_absorption_rate,
            current_min_carb_impact=request.current_min_carb_impact,
            optimize_icr=request.optimize_icr,
            optimize_absorption_rate=request.optimize_absorption_rate,
            optimize_min_carb_impact=request.optimize_min_carb_impact
        )
        
        if result is None:
            raise HTTPException(status_code=400, detail="Optimization failed or insufficient data")
            
        return result
        
    except Exception as e:
        print(f"Error in carb absorption tuning: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
