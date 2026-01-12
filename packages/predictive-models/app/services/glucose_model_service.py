"""Glucose prediction model service."""

import os
import json
import joblib
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import numpy as np

from app.config import settings
from app.services.glucose_predictor import (
    GlucoseFeatureExtractor,
    prepare_training_data
)
from app.models.glucose_schemas import (
    GlucoseTrainRequest,
    GlucoseTrainResponse,
    GlucosePredictRequest,
    GlucosePredictResponse
)

logger = logging.getLogger(__name__)


class GlucoseModelService:
    """Service for glucose prediction model management."""
    
    def __init__(self):
        """Initialize the glucose model service."""
        self.storage_path = Path(settings.model_storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)
        self.extractor = GlucoseFeatureExtractor()
    
    def _get_model_path(self, model_name: str) -> Path:
        """Get the file path for a model."""
        return self.storage_path / f"{model_name}.joblib"
    
    def _get_metadata_path(self, model_name: str) -> Path:
        """Get the file path for model metadata."""
        return self.storage_path / f"{model_name}_metadata.json"
    
    async def train(self, request: GlucoseTrainRequest) -> GlucoseTrainResponse:
        """
        Train a glucose prediction model.
        
        Args:
            request: Training request with samples and parameters
            
        Returns:
            GlucoseTrainResponse with training results
        """
        try:
            logger.info(f"Training glucose model: {request.model_name}")
            
            # Convert Pydantic models to dicts for processing
            samples = [sample.model_dump() for sample in request.samples]
            
            # Prepare training data
            X, y = prepare_training_data(samples)
            
            # Split into train/test
            X_train, X_test, y_train, y_test = train_test_split(
                X, y,
                test_size=request.test_size,
                random_state=42
            )
            
            logger.info(f"Training set: {len(X_train)} samples, Test set: {len(X_test)} samples")
            
            # Default XGBoost parameters optimized for glucose prediction
            default_params = {
                'objective': 'reg:squarederror',
                'max_depth': 6,
                'learning_rate': 0.1,
                'n_estimators': 100,
                'subsample': 0.8,
                'colsample_bytree': 0.8,
                'random_state': 42
            }
            
            # Merge with user-provided parameters
            params = {**default_params, **request.parameters}
            
            # Train XGBoost model
            model = xgb.XGBRegressor(**params)
            model.fit(X_train, y_train)
            
            # Calculate metrics
            y_train_pred = model.predict(X_train)
            y_test_pred = model.predict(X_test)
            
            metrics = {
                'train_mae': float(mean_absolute_error(y_train, y_train_pred)),
                'train_rmse': float(np.sqrt(mean_squared_error(y_train, y_train_pred))),
                'train_r2': float(r2_score(y_train, y_train_pred)),
                'test_mae': float(mean_absolute_error(y_test, y_test_pred)),
                'test_rmse': float(np.sqrt(mean_squared_error(y_test, y_test_pred))),
                'test_r2': float(r2_score(y_test, y_test_pred))
            }
            
            # Get feature importance
            feature_names = self.extractor.get_feature_names()
            importance_scores = model.feature_importances_
            feature_importance = {
                name: float(score)
                for name, score in zip(feature_names, importance_scores)
            }
            
            # Sort by importance
            feature_importance = dict(
                sorted(feature_importance.items(), key=lambda x: x[1], reverse=True)
            )
            
            # Save model
            model_path = self._get_model_path(request.model_name)
            joblib.dump(model, model_path)
            
            # Save metadata
            metadata = {
                'model_name': request.model_name,
                'model_type': 'glucose_predictor',
                'trained_at': datetime.now(timezone.utc).isoformat(),
                'feature_names': feature_names,
                'parameters': params,
                'metrics': metrics,
                'feature_importance': feature_importance,
                'samples_trained': len(X_train),
                'samples_validated': len(X_test)
            }
            
            metadata_path = self._get_metadata_path(request.model_name)
            with open(metadata_path, 'w') as f:
                json.dump(metadata, f, indent=2)
            
            logger.info(f"Model {request.model_name} trained successfully. Test MAE: {metrics['test_mae']:.2f}")
            
            return GlucoseTrainResponse(
                model_name=request.model_name,
                status='success',
                message=f"Model trained with {len(samples)} samples. Test MAE: {metrics['test_mae']:.2f} mg/dL",
                metrics=metrics,
                feature_importance=feature_importance,
                samples_trained=len(X_train),
                samples_validated=len(X_test),
                trained_at=datetime.now(timezone.utc)
            )
            
        except Exception as e:
            logger.error(f"Error training glucose model: {str(e)}", exc_info=True)
            raise
    
    async def predict(self, request: GlucosePredictRequest) -> GlucosePredictResponse:
        """
        Predict glucose 60 minutes ahead.
        
        Args:
            request: Prediction request with status_history
            
        Returns:
            GlucosePredictResponse with prediction
        """
        try:
            logger.info(f"Making glucose prediction with model: {request.model_name}")
            
            # Load model
            model_path = self._get_model_path(request.model_name)
            if not model_path.exists():
                raise FileNotFoundError(f"Model '{request.model_name}' not found")
            
            model = joblib.load(model_path)
            
            # Extract features
            features = self.extractor.extract_features(request.status_history)
            X = self.extractor.features_to_dataframe(features)
            
            # Make prediction
            predicted_glucose = float(model.predict(X)[0])
            
            # Get current glucose for comparison
            current_glucose = features['current_glucose']
            predicted_change = predicted_glucose - current_glucose
            
            logger.info(
                f"Prediction: current={current_glucose:.1f}, "
                f"predicted={predicted_glucose:.1f}, "
                f"change={predicted_change:+.1f}"
            )
            
            return GlucosePredictResponse(
                model_name=request.model_name,
                predicted_glucose_60min=predicted_glucose,
                current_glucose=current_glucose,
                predicted_change=predicted_change,
                features_used=features,
                predicted_at=datetime.now(timezone.utc)
            )
            
        except Exception as e:
            logger.error(f"Error making glucose prediction: {str(e)}", exc_info=True)
            raise
