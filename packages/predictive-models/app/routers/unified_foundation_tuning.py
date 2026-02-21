from fastapi import APIRouter, HTTPException, status
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel

from ..services.unified_foundation_optimizer import UnifiedFoundationOptimizer, UnifiedFoundationResult, TimeWindow

router = APIRouter()

class UnifiedFoundationRequest(BaseModel):
    windows: List[TimeWindow]
    current_dia: float
    current_peak: float
    current_isf: List[float]    # 6 blocks
    current_basal: List[float]  # 12 blocks
    lambda_l2: float = 0.1
    lambda_smooth: float = 0.05

@router.post("/tune/unified-foundation", response_model=UnifiedFoundationResult)
async def tune_unified_foundation(request: UnifiedFoundationRequest):
    """
    Jointly optimize DIA, Peak, ISF, and Basal Rates.
    """
    optimizer = UnifiedFoundationOptimizer()
    
    try:
        result = optimizer.analyze_unified_foundation(
            windows=request.windows,
            current_dia=request.current_dia,
            current_peak=request.current_peak,
            current_isf=request.current_isf,
            current_basal=request.current_basal,
            lambda_l2=request.lambda_l2,
            lambda_smooth=request.lambda_smooth
        )
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Insufficient data to optimize unified foundation parameters."
            )
            
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unified optimization failed: {str(e)}"
        )
