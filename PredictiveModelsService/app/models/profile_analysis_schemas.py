"""Profile analysis API schemas"""

from pydantic import BaseModel
from typing import List, Dict, Optional, Any


class ProfileAnalysisRequest(BaseModel):
    """Request to analyze profile parameters"""
    windows: List[dict]  # List of time window dictionaries
    current_profile: Optional[Dict[str, Any]] = None  # Current active profile


class ProfileStore(BaseModel):
    """Profile store structure matching NightScout format"""
    dia: float
    carbratio: List[Dict[str, Any]]
    sens: List[Dict[str, Any]]
    basal: List[Dict[str, Any]]
    target_low: List[Dict[str, Any]]
    target_high: List[Dict[str, Any]]
    units: str


class ProfileAnalysisResponse(BaseModel):
    """Profile analysis response"""
    # Current profile
    current_profile: Optional[ProfileStore] = None
    
    # Recommended profile
    recommended_profile: Optional[ProfileStore] = None
    
    # Estimated parameters (raw values)
    estimated_isf: float
    estimated_icr: float
    estimated_basal_rates: List[float]  # 6 four-hour blocks
    
    # Confidence intervals (95%)
    isf_confidence: List[float]  # [lower, upper]
    icr_confidence: List[float]  # [lower, upper]
    basal_confidence: List[List[float]]  # [[lower, upper] for each 4-hour block]
    
    # Confidence metrics
    r_squared: float
    rmse: float
    mae: float
    
    # Data summary
    windows_analyzed: int
    stable_windows: int
    meal_windows: int
    
    # Recommendation summary
    recommendation: str


