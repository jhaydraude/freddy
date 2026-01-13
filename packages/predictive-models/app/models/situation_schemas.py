from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

class SituationTrainingSample(BaseModel):
    """A single training sample with features and labels."""
    features: Dict[str, float] = Field(..., description="Feature vector for the window")
    labels: List[str] = Field(..., description="List of active tag IDs")

class SituationTrainRequest(BaseModel):
    """Request to train a situation classifier."""
    model_name: str = Field(default="situation_classifier")
    samples: List[SituationTrainingSample]
    test_size: float = Field(default=0.2, ge=0.0, le=1.0)

class SituationTrainResponse(BaseModel):
    """Response from training."""
    model_name: str
    samples_count: int
    tag_metrics: Dict[str, Dict[str, float]]
    feature_importance: Dict[str, float]
    trained_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SituationClassifyRequest(BaseModel):
    """Request to classify a window."""
    model_name: str = Field(default="situation_classifier")
    features: Dict[str, float]
    threshold: float = Field(default=0.5, ge=0.0, le=1.0)

class TagPrediction(BaseModel):
    """Probability for a single tag."""
    tag_id: str
    probability: float
    above_threshold: bool

class SituationClassifyResponse(BaseModel):
    """Response from classification."""
    tags: List[TagPrediction]
    classified_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
