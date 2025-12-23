"""Profile analysis API schemas"""

from pydantic import BaseModel
from typing import List, Dict


class ProfileAnalysisRequest(BaseModel):
    """Request to analyze profile parameters"""
    windows: List[dict]  # List of time window dictionaries


class ProfileAnalysisResponse(BaseModel):
    """Profile analysis response"""
    estimated_isf: float
    estimated_icr: float
    estimated_basal_rates: List[float]
    
    r_squared: float
    rmse: float
    mae: float
    
    windows_analyzed: int
    stable_windows: int
    meal_windows: int
    
    recommendation: str
