"""Model service for training and prediction logic."""

import os
import json
import joblib
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import pandas as pd
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score, mean_squared_error, accuracy_score, classification_report

from app.config import settings
from app.models.schemas import TrainResponse, PredictResponse, ModelInfo

logger = logging.getLogger(__name__)


class ModelService:
    """Service for managing model training, storage, and predictions."""
    
    def __init__(self):
        """Initialize the model service."""
        self.storage_path = Path(settings.model_storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)
    
    def _get_model_path(self, model_name: str) -> Path:
        """Get the file path for a model."""
        return self.storage_path / f"{model_name}.joblib"
    
    def _get_metadata_path(self, model_name: str) -> Path:
        """Get the file path for model metadata."""
        return self.storage_path / f"{model_name}_metadata.json"
    
    async def train_model(
        self,
        model_name: str,
        model_type: str,
        data: List[Dict[str, Any]],
        target_column: str,
        parameters: Dict[str, Any] = None
    ) -> TrainResponse:
        """
        Train a new model.
        
        Args:
            model_name: Unique name for the model
            model_type: Type of model (regression or classification)
            data: Training data as list of dictionaries
            target_column: Name of the target column
            parameters: Optional model parameters
            
        Returns:
            TrainResponse with training results
            
        Raises:
            ValueError: If data is invalid or missing required columns
        """
        try:
            # Convert data to DataFrame
            df = pd.DataFrame(data)
            
            if target_column not in df.columns:
                raise ValueError(f"Target column '{target_column}' not found in data")
            
            # Separate features and target
            X = df.drop(columns=[target_column])
            y = df[target_column]
            
            # Split data for validation
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.2, random_state=42
            )
            
            # Create and train model based on type
            if model_type == "regression":
                model = LinearRegression(**(parameters or {}))
                model.fit(X_train, y_train)
                
                # Calculate metrics
                y_pred = model.predict(X_test)
                metrics = {
                    "r2_score": float(r2_score(y_test, y_pred)),
                    "mse": float(mean_squared_error(y_test, y_pred))
                }
                
            elif model_type == "classification":
                model = LogisticRegression(**(parameters or {}))
                model.fit(X_train, y_train)
                
                # Calculate metrics
                y_pred = model.predict(X_test)
                metrics = {
                    "accuracy": float(accuracy_score(y_test, y_pred))
                }
                
            else:
                raise ValueError(f"Unsupported model type: {model_type}")
            
            # Save model
            model_path = self._get_model_path(model_name)
            joblib.dump(model, model_path)
            
            # Save metadata
            metadata = {
                "model_name": model_name,
                "model_type": model_type,
                "trained_at": datetime.now(timezone.utc).isoformat(),
                "feature_columns": list(X.columns),
                "target_column": target_column,
                "parameters": parameters or {},
                "metrics": metrics
            }
            
            metadata_path = self._get_metadata_path(model_name)
            with open(metadata_path, 'w') as f:
                json.dump(metadata, f, indent=2)
            
            logger.info(f"Model {model_name} saved successfully")
            
            return TrainResponse(
                model_name=model_name,
                model_type=model_type,
                status="success",
                message=f"Model trained successfully with {len(data)} samples",
                metrics=metrics,
                trained_at=datetime.now(timezone.utc)
            )
            
        except Exception as e:
            logger.error(f"Error training model: {str(e)}")
            raise
    
    async def predict(
        self,
        model_name: str,
        data: List[Dict[str, Any]]
    ) -> PredictResponse:
        """
        Make predictions using a trained model.
        
        Args:
            model_name: Name of the model to use
            data: Input data for prediction
            
        Returns:
            PredictResponse with predictions
            
        Raises:
            FileNotFoundError: If model doesn't exist
            ValueError: If input data is invalid
        """
        try:
            # Load model
            model_path = self._get_model_path(model_name)
            if not model_path.exists():
                raise FileNotFoundError(f"Model '{model_name}' not found")
            
            model = joblib.load(model_path)
            
            # Load metadata
            metadata_path = self._get_metadata_path(model_name)
            with open(metadata_path, 'r') as f:
                metadata = json.load(f)
            
            # Convert data to DataFrame
            df = pd.DataFrame(data)
            
            # Ensure columns match training data
            expected_columns = metadata["feature_columns"]
            missing_columns = set(expected_columns) - set(df.columns)
            if missing_columns:
                raise ValueError(f"Missing required columns: {missing_columns}")
            
            # Select only the columns used during training
            X = df[expected_columns]
            
            # Make predictions
            predictions = model.predict(X)
            
            # Convert to list for JSON serialization
            predictions_list = predictions.tolist()
            
            # For classification, get probabilities if available
            confidence = None
            if hasattr(model, 'predict_proba'):
                proba = model.predict_proba(X)
                confidence = proba.max(axis=1).tolist()
            
            return PredictResponse(
                model_name=model_name,
                predictions=predictions_list,
                confidence=confidence,
                predicted_at=datetime.now(timezone.utc)
            )
            
        except Exception as e:
            logger.error(f"Error making prediction: {str(e)}")
            raise
    
    async def list_models(self) -> List[ModelInfo]:
        """
        List all available trained models.
        
        Returns:
            List of ModelInfo objects
        """
        models = []
        
        for model_file in self.storage_path.glob("*.joblib"):
            model_name = model_file.stem
            metadata_path = self._get_metadata_path(model_name)
            
            if metadata_path.exists():
                with open(metadata_path, 'r') as f:
                    metadata = json.load(f)
                
                file_size_kb = model_file.stat().st_size / 1024
                
                models.append(ModelInfo(
                    model_name=model_name,
                    model_type=metadata.get("model_type", "unknown"),
                    trained_at=datetime.fromisoformat(metadata["trained_at"]),
                    file_size_kb=round(file_size_kb, 2),
                    metadata=metadata
                ))
        
        return models
