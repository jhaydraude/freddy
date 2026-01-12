"""Pydantic schemas specific to glucose prediction."""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime, timezone


class GlucoseTrainingSample(BaseModel):
    """Single training sample for glucose prediction."""
    
    status_history: List[Dict[str, Any]] = Field(
        ...,
        description="Array of IStatusResult objects from get_status_history"
    )
    actual_glucose_60min: float = Field(
        ...,
        description="Actual glucose value 60 minutes after the last status"
    )


class GlucoseTrainRequest(BaseModel):
    """Request to train glucose prediction model."""
    
    model_name: str = Field(
        default="glucose_predictor",
        description="Name for the trained model"
    )
    samples: List[GlucoseTrainingSample] = Field(
        ...,
        description="Training samples with status_history and outcomes"
    )
    test_size: float = Field(
        default=0.2,
        description="Fraction of data to use for validation (0.0-0.5)"
    )
    parameters: Optional[Dict[str, Any]] = Field(
        default={},
        description="XGBoost hyperparameters (optional)"
    )
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "model_name": "glucose_predictor",
                "samples": [
                    {
                        "status_history": [
                            # Array of status objects...
                        ],
                        "actual_glucose_60min": 125.0
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


class GlucosePredictRequest(BaseModel):
    """Request to predict glucose 60 minutes ahead."""
    
    model_name: str = Field(
        default="glucose_predictor",
        description="Name of the trained model to use"
    )
    status_history: List[Dict[str, Any]] = Field(
        ...,
        description="Array of IStatusResult objects from get_status_history"
    )
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "model_name": "glucose_predictor",
                "status_history": [
                    # Array of recent status objects...
                ]
            }
        }
    )


class GlucosePredictResponse(BaseModel):
    """Response from glucose prediction."""
    
    model_name: str
    predicted_glucose_60min: float = Field(
        description="Predicted glucose value in 60 minutes"
    )
    current_glucose: float = Field(
        description="Current glucose from status_history"
    )
    predicted_change: float = Field(
        description="Predicted change from current (positive = rising)"
    )
    features_used: Dict[str, float] = Field(
        description="Extracted features used for prediction"
    )
    predicted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "model_name": "glucose_predictor",
                "predicted_glucose_60min": 135.5,
                "current_glucose": 120.0,
                "predicted_change": 15.5,
                "features_used": {
                    "current_glucose": 120.0,
                    "iob": 1.5,
                    "cob": 25.0
                },
                "predicted_at": "2024-01-01T12:00:00"
            }
        }
    )


class GlucoseTrainResponse(BaseModel):
    """Response from glucose model training."""
    
    model_name: str
    status: str
    message: str
    metrics: Dict[str, float] = Field(
        description="Model performance metrics (MAE, RMSE, R2, etc.)"
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
                "model_name": "glucose_predictor",
                "status": "success",
                "message": "Model trained successfully",
                "metrics": {
                    "train_mae": 8.5,
                    "train_rmse": 12.3,
                    "test_mae": 10.2,
                    "test_rmse": 14.1,
                    "test_r2": 0.75
                },
                "feature_importance": {
                    "current_glucose": 0.35,
                    "glucose_trend_slope": 0.20,
                    "iob": 0.15
                },
                "samples_trained": 800,
                "samples_validated": 200,
                "trained_at": "2024-01-01T12:00:00"
            }
        }
    )
