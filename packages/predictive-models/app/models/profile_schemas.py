"""Pydantic schemas for profile tuning model."""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime, timezone


class BasalTimeBlock(BaseModel):
    """Single hourly basal rate."""
    
    hour: int = Field(
        ge=0,
        le=23,
        description="Hour of day (0-23)"
    )
    rate: float = Field(
        gt=0,
        description="Basal rate in units per hour"
    )


class ProfileTuningSample(BaseModel):
    """Single training sample for profile tuning."""
    
    status_history: List[Dict[str, Any]] = Field(
        ...,
        description="Array of IStatusResult objects from get_status_history"
    )
    current_isf: float = Field(
        ...,
        description="Current insulin sensitivity factor (ISF) in mmol/L per unit"
    )
    current_icr: float = Field(
        ...,
        description="Current insulin-to-carb ratio (ICR) in grams per unit"
    )
    current_basal: List[BasalTimeBlock] = Field(
        ...,
        description="Current basal rates (24 hourly values)"
    )
    outcome_time_in_range: float = Field(
        ge=0,
        le=100,
        description="Percentage of time in target range (4-9 mmol/L) during outcome window"
    )
    outcome_time_below_range: float = Field(
        ge=0,
        le=100,
        description="Percentage of time below range (<4 mmol/L) during outcome window"
    )
    outcome_time_above_range: float = Field(
        ge=0,
        le=100,
        description="Percentage of time above range (>9 mmol/L) during outcome window"
    )
    outcome_glucose_std: float = Field(
        ge=0,
        description="Glucose standard deviation in mmol/L during outcome window"
    )
    outcome_glucose_cv: float = Field(
        ge=0,
        description="Glucose coefficient of variation (%) during outcome window"
    )


class ProfileTuneRequest(BaseModel):
    """Request to train profile tuning model."""
    
    model_name: str = Field(
        default="profile_tuner",
        description="Name for the trained model"
    )
    samples: List[ProfileTuningSample] = Field(
        ...,
        description="Training samples with status_history and outcome metrics"
    )
    test_size: float = Field(
        default=0.2,
        ge=0.0,
        le=0.5,
        description="Fraction of data to use for validation (0.0-0.5)"
    )
    parameters: Optional[Dict[str, Any]] = Field(
        default={},
        description="XGBoost hyperparameters (optional)"
    )
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "model_name": "profile_tuner",
                "samples": [
                    {
                        "status_history": [],
                        "current_isf": 3.0,
                        "current_icr": 10.0,
                        "current_basal": [{"hour": 0, "rate": 0.8}],
                        "outcome_time_in_range": 75.0,
                        "outcome_time_below_range": 5.0,
                        "outcome_time_above_range": 20.0,
                        "outcome_glucose_std": 2.1,
                        "outcome_glucose_cv": 28.0
                    }
                ],
                "test_size": 0.2,
                "parameters": {
                    "max_depth": 6,
                    "learning_rate": 0.1,
                    "n_estimators": 100
                }
            }
        }
    )


class ProfileRecommendRequest(BaseModel):
    """Request to get profile parameter recommendations."""
    
    model_name: str = Field(
        default="profile_tuner",
        description="Name of the trained model to use"
    )
    status_history: List[Dict[str, Any]] = Field(
        ...,
        description="Array of IStatusResult objects from get_status_history"
    )
    current_isf: float = Field(
        ...,
        description="Current insulin sensitivity factor (ISF) in mmol/L per unit"
    )
    current_icr: float = Field(
        ...,
        description="Current insulin-to-carb ratio (ICR) in grams per unit"
    )
    current_basal: List[BasalTimeBlock] = Field(
        ...,
        description="Current basal rates (24 hourly values)"
    )
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "model_name": "profile_tuner",
                "status_history": [],
                "current_isf": 3.0,
                "current_icr": 10.0,
                "current_basal": [
                    {"hour": 0, "rate": 0.8},
                    {"hour": 1, "rate": 0.8}
                ]
            }
        }
    )


class ProfileRecommendResponse(BaseModel):
    """Response from profile tuning recommendation."""
    
    model_name: str
    recommended_isf: float = Field(
        description="Recommended insulin sensitivity factor in mmol/L per unit"
    )
    recommended_icr: float = Field(
        description="Recommended insulin-to-carb ratio in grams per unit"
    )
    recommended_basal: List[BasalTimeBlock] = Field(
        description="Recommended basal rates (24 hourly values)"
    )
    current_isf: float
    current_icr: float
    isf_change_percent: float = Field(
        description="Percent change in ISF (positive = more sensitive)"
    )
    icr_change_percent: float = Field(
        description="Percent change in ICR (positive = more carbs per unit)"
    )
    features_used: Dict[str, float] = Field(
        description="Extracted features used for recommendation"
    )
    predicted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "model_name": "profile_tuner",
                "recommended_isf": 3.2,
                "recommended_icr": 10.5,
                "recommended_basal": [{"hour": 0, "rate": 0.85}],
                "current_isf": 3.0,
                "current_icr": 10.0,
                "isf_change_percent": 6.7,
                "icr_change_percent": 5.0,
                "features_used": {
                    "time_in_range": 70.0,
                    "glucose_std": 2.5
                },
                "predicted_at": "2024-01-01T12:00:00"
            }
        }
    )


class ProfileTuneResponse(BaseModel):
    """Response from profile model training."""
    
    model_name: str
    status: str
    message: str
    metrics: Dict[str, float] = Field(
        description="Model performance metrics for each output"
    )
    feature_importance: Optional[Dict[str, float]] = Field(
        default=None,
        description="Feature importance scores from the model"
    )
    samples_trained: int
    samples_validated: int
    trained_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "model_name": "profile_tuner",
                "status": "success",
                "message": "Model trained successfully",
                "metrics": {
                    "isf_mae": 0.25,
                    "icr_mae": 0.8,
                    "basal_mae": 0.05,
                    "overall_r2": 0.72
                },
                "feature_importance": {
                    "time_in_range": 0.35,
                    "glucose_std": 0.25,
                    "time_below_range": 0.20
                },
                "samples_trained": 800,
                "samples_validated": 200,
                "trained_at": "2024-01-01T12:00:00"
            }
        }
    )
