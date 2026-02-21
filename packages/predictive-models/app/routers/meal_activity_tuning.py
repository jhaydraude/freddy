from fastapi import APIRouter, HTTPException, status
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel

from ..services.meal_activity_optimizer import MealActivityOptimizer, MealActivityResult, TimeWindow

router = APIRouter()

class MealActivityRequest(BaseModel):
    windows: List[TimeWindow]
    baseline_isf: List[float]    # 6 blocks
    baseline_basal: List[float]  # 12 blocks
    current_cr: List[float]      # 6 blocks
    current_activity_coeffs: Optional[Dict[str, float]] = None
    lambda_l2: float = 0.2
    lambda_smooth: float = 0.05

@router.post("/tune/meal-activity", response_model=MealActivityResult)
async def tune_meal_activity(request: MealActivityRequest):
    """
    Optimize Carb Ratio and Activity Coefficients using fixed Foundation Baseline.
    """
    optimizer = MealActivityOptimizer()
    
    try:
        result = optimizer.analyze_meal_activity(
            windows=request.windows,
            baseline_isf=request.baseline_isf,
            baseline_basal=request.baseline_basal,
            current_cr=request.current_cr,
            current_activity_coeffs=request.current_activity_coeffs,
            lambda_l2=request.lambda_l2,
            lambda_smooth=request.lambda_smooth
        )
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Insufficient data to optimize meal and activity parameters."
            )
            
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Meal/Activity optimization failed: {str(e)}"
        )
