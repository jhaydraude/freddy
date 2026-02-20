"""Activity Impact Tuning API router"""

import logging
from typing import List, Optional, Dict, Tuple, Any
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.services.activity_impact_optimizer import ActivityImpactOptimizer, ActivityTuningResult
from app.services.holistic_profile_analyzer import TimeWindow

router = APIRouter()
logger = logging.getLogger(__name__)

class ActivityTuningRequest(BaseModel):
    windows: List[Dict[str, Any]]
    
    current_steps_per_minute: float = -1.0
    current_calories: float = -0.4
    current_stairs: float = 10.0
    current_hr_spike: float = 15.0
    current_stress_hr: float = 8.0
    
    current_isf: Optional[List[float]] = None
    current_icr: Optional[List[float]] = None
    
    optimize_steps: bool = True
    optimize_calories: bool = True
    optimize_stairs: bool = True
    optimize_hr_spike: bool = True
    optimize_stress_hr: bool = True
    
    lambda_l2: float = 0.1

@router.post("/tune/activity-impact", response_model=ActivityTuningResult)
async def tune_activity_impact(request: ActivityTuningRequest):
    try:
        logger.info(f"Tuning activity from {len(request.windows)} windows")
        if len(request.windows) == 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No windows")
            
        optimizer = ActivityImpactOptimizer()
        result = optimizer.analyze_activity_impact(
            windows=request.windows,
            current_steps_per_minute=request.current_steps_per_minute,
            current_calories=request.current_calories,
            current_stairs=request.current_stairs,
            current_hr_spike=request.current_hr_spike,
            current_stress_hr=request.current_stress_hr,
            current_isf=request.current_isf,
            current_icr=request.current_icr,
            optimize_steps=request.optimize_steps,
            optimize_calories=request.optimize_calories,
            optimize_stairs=request.optimize_stairs,
            optimize_hr_spike=request.optimize_hr_spike,
            optimize_stress_hr=request.optimize_stress_hr,
            lambda_l2=request.lambda_l2
        )
        
        if result is None:
            raise HTTPException(status_code=400, detail="Insufficient data for tuning")
            
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error tuning activity: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
