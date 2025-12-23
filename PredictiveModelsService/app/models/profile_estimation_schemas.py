"""Profile estimation API schemas"""

from pydantic import BaseModel
from typing import List


class ISFEstimateRequest(BaseModel):
    """Request to estimate ISF from correction events"""
    events: List[dict]  # List of correction event dictionaries


class ISFEstimateResponse(BaseModel):
    """ISF estimation response"""
    estimated_isf: float
    confidence_interval_lower: float
    confidence_interval_upper: float
    sample_count: int
    high_quality_count: int
    quality: str
    recommendation: str
