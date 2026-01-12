"""Pydantic schemas for request/response validation."""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime, timezone


class TrainRequest(BaseModel):
    """Request model for training a model."""
    
    model_name: str = Field(..., description="Unique name for the model")
    model_type: str = Field(..., description="Type of model (e.g., 'regression', 'classification')")
    data: List[Dict[str, Any]] = Field(..., description="Training data as list of records")
    target_column: str = Field(..., description="Name of the target/label column")
    parameters: Optional[Dict[str, Any]] = Field(default={}, description="Model-specific parameters")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "model_name": "sales_predictor",
                "model_type": "regression",
                "data": [
                    {"feature1": 1.0, "feature2": 2.0, "target": 100},
                    {"feature1": 1.5, "feature2": 2.5, "target": 150}
                ],
                "target_column": "target",
                "parameters": {
                    "max_depth": 10,
                    "learning_rate": 0.01
                }
            }
        }
    )


class TrainResponse(BaseModel):
    """Response model for training completion."""
    
    model_name: str
    model_type: str
    status: str
    message: str
    metrics: Optional[Dict[str, float]] = None
    trained_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "model_name": "sales_predictor",
                "model_type": "regression",
                "status": "success",
                "message": "Model trained successfully",
                "metrics": {
                    "r2_score": 0.85,
                    "mse": 120.5
                },
                "trained_at": "2024-01-01T12:00:00"
            }
        }
    )


class PredictRequest(BaseModel):
    """Request model for making predictions."""
    
    model_name: str = Field(..., description="Name of the trained model to use")
    data: List[Dict[str, Any]] = Field(..., description="Input data for prediction")
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "model_name": "sales_predictor",
                "data": [
                    {"feature1": 1.2, "feature2": 2.3},
                    {"feature1": 1.8, "feature2": 2.8}
                ]
            }
        }
    )


class PredictResponse(BaseModel):
    """Response model for predictions."""
    
    model_name: str
    predictions: List[Any]
    confidence: Optional[List[float]] = None
    predicted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "model_name": "sales_predictor",
                "predictions": [125.5, 175.8],
                "confidence": [0.92, 0.88],
                "predicted_at": "2024-01-01T12:00:00"
            }
        }
    )


class ModelInfo(BaseModel):
    """Information about a trained model."""
    
    model_name: str
    model_type: str
    trained_at: datetime
    file_size_kb: float
    metadata: Optional[Dict[str, Any]] = None


class ModelListResponse(BaseModel):
    """Response model for listing available models."""
    
    count: int
    models: List[ModelInfo]
