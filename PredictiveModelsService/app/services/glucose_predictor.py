"""Glucose prediction model with feature engineering."""

import numpy as np
import pandas as pd
from typing import List, Dict, Any, Tuple
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class GlucoseFeatureExtractor:
    """Extract features from status_history for glucose prediction."""
    
    @staticmethod
    def extract_features(status_history: List[Dict[str, Any]]) -> Dict[str, float]:
        """
        Extract features from a status_history window.
        
        Args:
            status_history: Array of IStatusResult objects
            
        Returns:
            Dictionary of extracted features
        """
        if not status_history or len(status_history) == 0:
            raise ValueError("status_history cannot be empty")
        
        # Sort by timestamp to ensure chronological order
        sorted_history = sorted(
            status_history,
            key=lambda x: x.get('meta', {}).get('status_date', '')
        )
        
        # Extract glucose values
        glucose_values = []
        timestamps = []
        
        for status in sorted_history:
            glucose = status.get('glucose', {})
            if glucose and glucose.get('sgv') is not None:
                glucose_values.append(float(glucose['sgv']))
                timestamps.append(status.get('meta', {}).get('status_date', ''))
        
        if len(glucose_values) == 0:
            raise ValueError("No valid glucose values in status_history")
        
        # Get the most recent (last) status
        current_status = sorted_history[-1]
        current_glucose = current_status.get('glucose', {})
        
        features = {}
        
        # --- Glucose Features ---
        features['current_glucose'] = glucose_values[-1]
        features['glucose_mean'] = float(np.mean(glucose_values))
        features['glucose_std'] = float(np.std(glucose_values))
        features['glucose_min'] = float(np.min(glucose_values))
        features['glucose_max'] = float(np.max(glucose_values))
        
        # Glucose trend (rate of change)
        if len(glucose_values) >= 2:
            # Simple linear regression for trend
            x = np.arange(len(glucose_values))
            slope, _ = np.polyfit(x, glucose_values, 1)
            features['glucose_trend_slope'] = float(slope)
        else:
            features['glucose_trend_slope'] = 0.0
        
        # Recent deltas
        features['delta_5m'] = float(current_glucose.get('delta5m', 0) or 0)
        features['delta_10m'] = float(current_glucose.get('delta10m', 0) or 0)
        
        # --- IOB Features ---
        iob = current_status.get('iob', {})
        calculated_iob = iob.get('calculated', {})
        features['iob'] = float(calculated_iob.get('iob', 0) or 0)
        features['iob_activity'] = float(calculated_iob.get('activity', 0) or 0)
        
        # --- COB Features ---
        cob = current_status.get('cob', {})
        features['cob'] = float(cob.get('cob', 0) or 0)
        
        # --- Basal Features ---
        basal = current_status.get('pump', {}).get('basal', {})
        features['basal_rate'] = float(basal.get('rate', 0) or 0)
        features['is_temp_basal'] = 1.0 if basal.get('treatment', {}).get('eventType') == 'Temp Basal' else 0.0
        
        # --- Profile Features ---
        profile = current_status.get('profile', {})
        profile_data = profile.get('profileData', {})
        
        # Get ISF (insulin sensitivity factor) - need to extract from profile
        isf_value = 0.0
        if isinstance(profile_data, dict) and 'sens' in profile_data:
            sens = profile_data['sens']
            if sens and len(sens) > 0:
                isf_value = float(sens[0].get('value', 0))
        features['isf'] = isf_value
        
        # Get carb ratio
        carb_ratio = 0.0
        if isinstance(profile_data, dict) and 'carbratio' in profile_data:
            carb_ratios = profile_data['carbratio']
            if carb_ratios and len(carb_ratios) > 0:
                carb_ratio = float(carb_ratios[0].get('value', 0))
        features['carb_ratio'] = carb_ratio
        
        # Target BG
        target_low = 0.0
        target_high = 0.0
        if isinstance(profile_data, dict) and 'target_low' in profile_data:
            targets_low = profile_data['target_low']
            if targets_low and len(targets_low) > 0:
                target_low = float(targets_low[0].get('value', 0))
        if isinstance(profile_data, dict) and 'target_high' in profile_data:
            targets_high = profile_data['target_high']
            if targets_high and len(targets_high) > 0:
                target_high = float(targets_high[0].get('value', 0))
        features['target_low'] = target_low
        features['target_high'] = target_high
        
        # --- Temporal Features ---
        # Extract hour of day and encode as sin/cos for cyclical nature
        if timestamps:
            last_timestamp = timestamps[-1]
            dt = datetime.fromisoformat(last_timestamp.replace('Z', '+00:00'))
            hour = dt.hour + dt.minute / 60.0  # Hour with fractional minutes
            
            # Sin/cos encoding for cyclical time
            features['hour_sin'] = float(np.sin(2 * np.pi * hour / 24))
            features['hour_cos'] = float(np.cos(2 * np.pi * hour / 24))
        else:
            features['hour_sin'] = 0.0
            features['hour_cos'] = 0.0
        
        # --- Sensor Age ---
        features['sensor_age_hours'] = float(current_glucose.get('sensorAge', 0) or 0)
        
        return features
    
    @staticmethod
    def features_to_dataframe(features: Dict[str, float]) -> pd.DataFrame:
        """Convert feature dict to DataFrame for model input."""
        return pd.DataFrame([features])
    
    @staticmethod
    def get_feature_names() -> List[str]:
        """Get ordered list of feature names."""
        return [
            'current_glucose',
            'glucose_mean',
            'glucose_std',
            'glucose_min',
            'glucose_max',
            'glucose_trend_slope',
            'delta_5m',
            'delta_10m',
            'iob',
            'iob_activity',
            'cob',
            'basal_rate',
            'is_temp_basal',
            'isf',
            'carb_ratio',
            'target_low',
            'target_high',
            'hour_sin',
            'hour_cos',
            'sensor_age_hours'
        ]


def prepare_training_data(
    training_samples: List[Dict[str, Any]]
) -> Tuple[pd.DataFrame, np.ndarray]:
    """
    Prepare training data from samples.
    
    Args:
        training_samples: List of samples, each with:
            - status_history: Array of status objects
            - actual_glucose_60min: Target value
            
    Returns:
        Tuple of (X_features, y_targets)
    """
    extractor = GlucoseFeatureExtractor()
    
    X_list = []
    y_list = []
    
    for sample in training_samples:
        try:
            status_history = sample.get('status_history', [])
            target = sample.get('actual_glucose_60min')
            
            if target is None:
                logger.warning("Sample missing actual_glucose_60min, skipping")
                continue
            
            # Extract features
            features = extractor.extract_features(status_history)
            X_list.append(features)
            y_list.append(float(target))
            
        except Exception as e:
            logger.warning(f"Error processing sample: {e}, skipping")
            continue
    
    if len(X_list) == 0:
        raise ValueError("No valid training samples after feature extraction")
    
    X = pd.DataFrame(X_list)
    y = np.array(y_list)
    
    logger.info(f"Prepared {len(X)} training samples with {len(X.columns)} features")
    
    return X, y
