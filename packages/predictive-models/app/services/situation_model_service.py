"""Situation classification model service."""

import os
import json
import joblib
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Optional

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.multiclass import OneVsRestClassifier
from sklearn.preprocessing import MultiLabelBinarizer
from sklearn.metrics import precision_recall_fscore_support

from app.config import settings
from app.models.situation_schemas import (
    SituationTrainRequest,
    SituationTrainResponse,
    SituationClassifyRequest,
    SituationClassifyResponse,
    TagPrediction
)

logger = logging.getLogger(__name__)

class SituationModelService:
    """Service for situation classification model management."""
    
    def __init__(self):
        """Initialize the situation model service."""
        self.storage_path = Path(settings.model_storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)
        self.mlb_path = self.storage_path / "situation_mlb.joblib"
    
    def _get_model_path(self, model_name: str) -> Path:
        """Get the file path for a model."""
        return self.storage_path / f"{model_name}.joblib"
    
    def _get_metadata_path(self, model_name: str) -> Path:
        """Get the file path for model metadata."""
        return self.storage_path / f"{model_name}_metadata.json"

    async def train(self, request: SituationTrainRequest) -> SituationTrainResponse:
        """Train a multi-label situation classifier."""
        try:
            logger.info(f"Training situation model: {request.model_name}")
            
            # Prepare data
            features_list = []
            labels_list = []
            for sample in request.samples:
                features_list.append(sample.features)
                labels_list.append(sample.labels)
            
            X = pd.DataFrame(features_list)
            
            # Transform labels
            mlb = MultiLabelBinarizer()
            y = mlb.fit_transform(labels_list)
            
            # Save MLB for inference
            joblib.dump(mlb, self.mlb_path)
            
            # Split
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=request.test_size, random_state=42
            )
            
            # Check minimum samples
            if len(X) < 50:
                raise ValueError(f"Insufficient samples for training. Required: 50, Found: {len(X)}")

            # Calculate scale_pos_weight for each class to handle imbalance
            # For multi-label, we can pass a specific weight per binary classifier if using OneVsRest
            # But OneVsRestClassifier with XGBoost doesn't support a list of weights naturally.
            # Workaround: We use a balanced strategy approximation or just a generic high weight for now.
            # A better approach for the future is to use explicit weights per estimator.
            
            # Train OneVsRest XGBoost
            model = OneVsRestClassifier(
                xgb.XGBClassifier(
                    objective='binary:logistic',
                    max_depth=6,
                    learning_rate=0.1,
                    n_estimators=100,
                    use_label_encoder=False,
                    eval_metric='logloss',
                    scale_pos_weight=10  # Boosting importance of positive class (rare tags)
                )
            )
            
            model.fit(X_train, y_train)
            
            # Metrics
            y_pred = model.predict(X_test)
            precision, recall, f1, support = precision_recall_fscore_support(
                y_test, y_pred, average=None, labels=range(len(mlb.classes_))
            )
            
            tag_metrics = {}
            for i, tag_name in enumerate(mlb.classes_):
                tag_metrics[tag_name] = {
                    "precision": float(precision[i]),
                    "recall": float(recall[i]),
                    "f1": float(f1[i]),
                    "support": int(support[i])
                }
            
            # Feature Importance (average across estimators)
            total_importance = np.zeros(len(X.columns))
            for estimator in model.estimators_:
                total_importance += estimator.feature_importances_
            
            avg_importance = total_importance / len(model.estimators_)
            feature_importance = {
                name: float(score) for name, score in zip(X.columns, avg_importance)
            }
            feature_importance = dict(sorted(feature_importance.items(), key=lambda x: x[1], reverse=True))
            
            # Save
            joblib.dump(model, self._get_model_path(request.model_name))
            
            # Save metadata
            metadata = {
                "model_name": request.model_name,
                "trained_at": datetime.now(timezone.utc).isoformat(),
                "tag_metrics": tag_metrics,
                "feature_importance": feature_importance,
                "samples_count": len(request.samples)
            }
            with open(self._get_metadata_path(request.model_name), 'w') as f:
                json.dump(metadata, f, indent=2)
                
            return SituationTrainResponse(
                model_name=request.model_name,
                samples_count=len(request.samples),
                tag_metrics=tag_metrics,
                feature_importance=feature_importance
            )
            
        except Exception as e:
            logger.error(f"Error training situation model: {str(e)}", exc_info=True)
            raise

    async def classify(self, request: SituationClassifyRequest) -> SituationClassifyResponse:
        """Classify a window of data."""
        try:
            model = joblib.load(self._get_model_path(request.model_name))
            mlb = joblib.load(self.mlb_path)
            
            X = pd.DataFrame([request.features])
            
            # Get probabilities
            probas = model.predict_proba(X)[0]
            
            tags = []
            for i, tag_name in enumerate(mlb.classes_):
                tags.append(TagPrediction(
                    tag_id=tag_name,
                    probability=float(probas[i]),
                    above_threshold=bool(probas[i] >= request.threshold)
                ))
            
            return SituationClassifyResponse(tags=tags)
            
        except Exception as e:
            logger.error(f"Error classifying situation: {str(e)}")
            raise
    async def get_metrics(self, model_name: str) -> Dict[str, Any]:
        """Retrieve model performance metrics and metadata."""
        try:
            path = self._get_metadata_path(model_name)
            if not path.exists():
                return {"error": "Model metadata not found"}
            
            with open(path, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error retrieving metrics: {str(e)}")
            raise
