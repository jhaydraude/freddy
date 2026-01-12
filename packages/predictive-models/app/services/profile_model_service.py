"""Profile tuning model service."""

import os
import json
import joblib
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

import xgboost as xgb
from sklearn.multioutput import MultiOutputRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import numpy as np

from app.config import settings
from app.services.profile_predictor import (
    ProfileFeatureExtractor,
    prepare_profile_training_data
)
from app.models.profile_schemas import (
    ProfileTuneRequest,
    ProfileTuneResponse,
    ProfileRecommendRequest,
    ProfileRecommendResponse,
    BasalTimeBlock
)

logger = logging.getLogger(__name__)


class ProfileModelService:
    """Service for profile tuning model management."""
    
    def __init__(self):
        """Initialize the profile model service."""
        self.storage_path = Path(settings.model_storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)
        self.extractor = ProfileFeatureExtractor()
    
    def _get_model_path(self, model_name: str) -> Path:
        """Get the file path for a model."""
        return self.storage_path / f"{model_name}.joblib"
    
    def _get_metadata_path(self, model_name: str) -> Path:
        """Get the file path for model metadata."""
        return self.storage_path / f"{model_name}_metadata.json"
    
    async def train(self, request: ProfileTuneRequest) -> ProfileTuneResponse:
        """
        Train a profile tuning model.
        
        Args:
            request: Training request with samples and parameters
            
        Returns:
            ProfileTuneResponse with training results
        """
        try:
            logger.info(f"Training profile tuning model: {request.model_name}")
            
            # Convert Pydantic models to dicts for processing
            samples = [sample.model_dump() for sample in request.samples]
            
            # Prepare training data
            X, y = prepare_profile_training_data(samples)
            
            # Split into train/test
            X_train, X_test, y_train, y_test = train_test_split(
                X, y,
                test_size=request.test_size,
                random_state=42
            )
            
            logger.info(f"Training set: {len(X_train)} samples, Test set: {len(X_test)} samples")
            
            # Default XGBoost parameters
            default_params = {
                'objective': 'reg:squarederror',
                'max_depth': 4,
                'learning_rate': 0.05,
                'n_estimators': 150,
                'subsample': 0.8,
                'colsample_bytree': 0.8,
                'random_state': 42
            }
            
            # Merge with user-provided parameters
            params = {**default_params, **request.parameters}
            
            # Train multi-output XGBoost model
            base_model = xgb.XGBRegressor(**params)
            model = MultiOutputRegressor(base_model)
            model.fit(X_train, y_train)
            
            # Calculate metrics
            y_train_pred = model.predict(X_train)
            y_test_pred = model.predict(X_test)
            
            # Overall metrics
            metrics = {
                'train_mae': float(mean_absolute_error(y_train, y_train_pred)),
                'train_rmse': float(np.sqrt(mean_squared_error(y_train, y_train_pred))),
                'train_r2': float(r2_score(y_train, y_train_pred)),
                'test_mae': float(mean_absolute_error(y_test, y_test_pred)),
                'test_rmse': float(np.sqrt(mean_squared_error(y_test, y_test_pred))),
                'test_r2': float(r2_score(y_test, y_test_pred))
            }
            
            # Per-output metrics for ISF, ICR, and average basal
            output_names = ['isf', 'icr'] + [f'basal_{h:02d}' for h in range(24)]
            
            for i, output_name in enumerate(output_names):
                mae = mean_absolute_error(y_test.iloc[:, i], y_test_pred[:, i])
                metrics[f'{output_name}_test_mae'] = float(mae)
            
            # Average basal MAE
            basal_maes = [metrics[f'basal_{h:02d}_test_mae'] for h in range(24)]
            metrics['avg_basal_test_mae'] = float(np.mean(basal_maes))
            
            # Get feature importance from first estimator (they should be similar)
            feature_names = self.extractor.get_feature_names()
            first_estimator = model.estimators_[0]
            importance_scores = first_estimator.feature_importances_
            feature_importance = {
                name: float(score)
                for name, score in zip(feature_names, importance_scores)
            }
            
            # Sort by importance and take top 20
            feature_importance = dict(
                sorted(feature_importance.items(), key=lambda x: x[1], reverse=True)[:20]
            )
            
            # Save model
            model_path = self._get_model_path(request.model_name)
            joblib.dump(model, model_path)
            
            # Save metadata
            metadata = {
                'model_name': request.model_name,
                'model_type': 'profile_tuner',
                'trained_at': datetime.now(timezone.utc).isoformat(),
                'feature_names': feature_names,
                'output_names': output_names,
                'parameters': params,
                'metrics': metrics,
                'feature_importance': feature_importance,
                'samples_trained': len(X_train),
                'samples_validated': len(X_test)
            }
            
            metadata_path = self._get_metadata_path(request.model_name)
            with open(metadata_path, 'w') as f:
                json.dump(metadata, f, indent=2)
            
            logger.info(
                f"Model {request.model_name} trained successfully. "
                f"Test MAE - ISF: {metrics['isf_test_mae']:.3f}, "
                f"ICR: {metrics['icr_test_mae']:.3f}, "
                f"Basal: {metrics['avg_basal_test_mae']:.3f}"
            )
            
            return ProfileTuneResponse(
                model_name=request.model_name,
                status='success',
                message=f"Model trained with {len(samples)} samples. Test R²: {metrics['test_r2']:.3f}",
                metrics=metrics,
                feature_importance=feature_importance,
                samples_trained=len(X_train),
                samples_validated=len(X_test),
                trained_at=datetime.now(timezone.utc)
            )
            
        except Exception as e:
            logger.error(f"Error training profile tuning model: {str(e)}", exc_info=True)
            raise
    
    async def recommend(self, request: ProfileRecommendRequest) -> ProfileRecommendResponse:
        """
        Generate profile parameter recommendations.
        
        Args:
            request: Recommendation request with status_history and current settings
            
        Returns:
            ProfileRecommendResponse with recommendations
        """
        try:
            logger.info(f"Making profile recommendations with model: {request.model_name}")
            
            # Load model
            model_path = self._get_model_path(request.model_name)
            if not model_path.exists():
                raise FileNotFoundError(f"Model '{request.model_name}' not found")
            
            model = joblib.load(model_path)
            
            # Convert Pydantic models to dicts
            current_basal = [b.model_dump() for b in request.current_basal]
            
            # Extract features
            features = self.extractor.extract_features(
                request.status_history,
                request.current_isf,
                request.current_icr,
                current_basal
            )
            X = self.extractor.features_to_dataframe(features)
            
            # Make prediction
            predictions = model.predict(X)[0]
            
            # Parse predictions
            recommended_isf = float(predictions[0])
            recommended_icr = float(predictions[1])
            recommended_basal_rates = predictions[2:].tolist()
            
            # Apply reasonable bounds
            recommended_isf = max(1.0, min(10.0, recommended_isf))
            recommended_icr = max(5.0, min(20.0, recommended_icr))
            recommended_basal_rates = [max(0.1, min(3.0, rate)) for rate in recommended_basal_rates]
            
            # Build basal time blocks
            recommended_basal = [
                BasalTimeBlock(hour=hour, rate=rate)
                for hour, rate in enumerate(recommended_basal_rates)
            ]
            
            # Calculate percent changes
            isf_change_percent = ((recommended_isf - request.current_isf) / request.current_isf) * 100
            icr_change_percent = ((recommended_icr - request.current_icr) / request.current_icr) * 100
            
            logger.info(
                f"Recommendations: ISF={recommended_isf:.2f} ({isf_change_percent:+.1f}%), "
                f"ICR={recommended_icr:.2f} ({icr_change_percent:+.1f}%)"
            )
            
            return ProfileRecommendResponse(
                model_name=request.model_name,
                recommended_isf=recommended_isf,
                recommended_icr=recommended_icr,
                recommended_basal=recommended_basal,
                current_isf=request.current_isf,
                current_icr=request.current_icr,
                isf_change_percent=isf_change_percent,
                icr_change_percent=icr_change_percent,
                features_used=features,
                predicted_at=datetime.now(timezone.utc)
            )
            
        except Exception as e:
            logger.error(f"Error making profile recommendations: {str(e)}", exc_info=True)
            raise
    
    def list_models(self) -> list[Dict[str, Any]]:
        """
        List all trained profile tuning models.
        
        Returns:
            List of model metadata dictionaries
        """
        models = []
        
        for metadata_file in self.storage_path.glob("*_metadata.json"):
            try:
                with open(metadata_file, 'r') as f:
                    metadata = json.load(f)
                
                # Only include profile tuning models
                if metadata.get('model_type') == 'profile_tuner':
                    models.append({
                        'model_name': metadata['model_name'],
                        'trained_at': metadata['trained_at'],
                        'samples_trained': metadata['samples_trained'],
                        'samples_validated': metadata['samples_validated'],
                        'test_r2': metadata['metrics'].get('test_r2'),
                        'isf_mae': metadata['metrics'].get('isf_test_mae'),
                        'icr_mae': metadata['metrics'].get('icr_test_mae'),
                        'basal_mae': metadata['metrics'].get('avg_basal_test_mae')
                    })
            except Exception as e:
                logger.warning(f"Error reading metadata from {metadata_file}: {e}")
        
        return models
