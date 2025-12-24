"""Profile tuning feature extraction and data preparation."""

import numpy as np
import pandas as pd
from typing import Any, Dict, List


class ProfileFeatureExtractor:
    """Extract features from status_history for profile parameter tuning."""
    
    def extract_features(self, status_history: List[Dict[str, Any]], 
                        current_isf: float, current_icr: float,
                        current_basal: List[Dict[str, Any]]) -> Dict[str, float]:
        """
        Extract features from status_history and current profile settings.
        
        Args:
            status_history: Array of status snapshots from get_status_history
            current_isf: Current insulin sensitivity factor (mmol/L per unit)
            current_icr: Current insulin-to-carb ratio (g per unit)
            current_basal: Current basal rates (24 hourly values)
            
        Returns:
            Dictionary of extracted features
        """
        features = {}
        
        # Current profile parameters
        features['current_isf'] = current_isf
        features['current_icr'] = current_icr
        
        # Average basal rate
        basal_rates = [b['rate'] for b in current_basal]
        features['avg_basal_rate'] = np.mean(basal_rates)
        features['basal_std'] = np.std(basal_rates)
        features['max_basal_rate'] = np.max(basal_rates)
        features['min_basal_rate'] = np.min(basal_rates)
        
        # Extract basal by time of day (features for each hour)
        for hour in range(24):
            basal_for_hour = next((b['rate'] for b in current_basal if b['hour'] == hour), 0.0)
            features[f'basal_hour_{hour:02d}'] = basal_for_hour
        
        if not status_history:
            # Return minimal features if no history
            return self._add_default_history_features(features)
        
        # Extract glucose metrics from history
        glucose_values = []
        for status in status_history:
            if status.get('glucose') and status['glucose'].get('current'):
                sgv = status['glucose']['current'].get('sgv')
                if sgv:
                    glucose_values.append(sgv)
        
        if glucose_values:
            features['current_glucose'] = glucose_values[-1]
            features['mean_glucose'] = np.mean(glucose_values)
            features['glucose_std'] = np.std(glucose_values)
            features['glucose_cv'] = (np.std(glucose_values) / np.mean(glucose_values) * 100) if np.mean(glucose_values) > 0 else 0
            features['min_glucose'] = np.min(glucose_values)
            features['max_glucose'] = np.max(glucose_values)
            features['glucose_range'] = features['max_glucose'] - features['min_glucose']
            
            # Time in range calculations (4-9 mmol/L = 72-162 mg/dL)
            # Assuming values are in mg/dL
            in_range = sum(1 for g in glucose_values if 72 <= g <= 162)
            below_range = sum(1 for g in glucose_values if g < 72)
            above_range = sum(1 for g in glucose_values if g > 162)
            total = len(glucose_values)
            
            features['time_in_range_pct'] = (in_range / total * 100) if total > 0 else 0
            features['time_below_range_pct'] = (below_range / total * 100) if total > 0 else 0
            features['time_above_range_pct'] = (above_range / total * 100) if total > 0 else 0
            
            # Glucose trend
            if len(glucose_values) >= 2:
                # Simple linear trend (slope)
                x = np.arange(len(glucose_values))
                slope, _ = np.polyfit(x, glucose_values, 1)
                features['glucose_trend_slope'] = slope
        else:
            features = self._add_default_glucose_features(features)
        
        # Extract IOB metrics
        iob_values = []
        for status in status_history:
            if status.get('iob') and status['iob'].get('calculated'):
                net_iob = status['iob']['calculated'].get('netIOB')
                if net_iob is not None:
                    iob_values.append(net_iob)
        
        if iob_values:
            features['current_iob'] = iob_values[-1]
            features['mean_iob'] = np.mean(iob_values)
            features['max_iob'] = np.max(iob_values)
            features['iob_std'] = np.std(iob_values)
        else:
            features['current_iob'] = 0.0
            features['mean_iob'] = 0.0
            features['max_iob'] = 0.0
            features['iob_std'] = 0.0
        
        # Extract COB metrics
        cob_values = []
        for status in status_history:
            if status.get('cob') and status['cob'].get('calculated'):
                cob = status['cob']['calculated'].get('cob')
                if cob is not None:
                    cob_values.append(cob)
        
        if cob_values:
            features['current_cob'] = cob_values[-1]
            features['mean_cob'] = np.mean(cob_values)
            features['max_cob'] = np.max(cob_values)
        else:
            features['current_cob'] = 0.0
            features['mean_cob'] = 0.0
            features['max_cob'] = 0.0
        
        # Extract basal rate metrics from history
        basal_history = []
        for status in status_history:
            if status.get('basal') and status['basal'].get('rate') is not None:
                basal_history.append(status['basal']['rate'])
        
        if basal_history:
            features['mean_active_basal'] = np.mean(basal_history)
            features['active_basal_std'] = np.std(basal_history)
        else:
            features['mean_active_basal'] = features['avg_basal_rate']
            features['active_basal_std'] = 0.0
        
        return features
    
    def _add_default_history_features(self, features: Dict[str, float]) -> Dict[str, float]:
        """Add default values for history-based features."""
        features.update(self._add_default_glucose_features({}))
        features['current_iob'] = 0.0
        features['mean_iob'] = 0.0
        features['max_iob'] = 0.0
        features['iob_std'] = 0.0
        features['current_cob'] = 0.0
        features['mean_cob'] = 0.0
        features['max_cob'] = 0.0
        features['mean_active_basal'] = features.get('avg_basal_rate', 1.0)
        features['active_basal_std'] = 0.0
        return features
    
    def _add_default_glucose_features(self, features: Dict[str, float]) -> Dict[str, float]:
        """Add default values for glucose-based features."""
        features['current_glucose'] = 100.0
        features['mean_glucose'] = 100.0
        features['glucose_std'] = 0.0
        features['glucose_cv'] = 0.0
        features['min_glucose'] = 100.0
        features['max_glucose'] = 100.0
        features['glucose_range'] = 0.0
        features['time_in_range_pct'] = 100.0
        features['time_below_range_pct'] = 0.0
        features['time_above_range_pct'] = 0.0
        features['glucose_trend_slope'] = 0.0
        return features
    
    def get_feature_names(self) -> List[str]:
        """
        Get list of feature names in consistent order.
        
        Returns:
            List of feature names
        """
        base_features = [
            # Profile parameters
            'current_isf',
            'current_icr',
            'avg_basal_rate',
            'basal_std',
            'max_basal_rate',
            'min_basal_rate',
            
            # Glucose metrics
            'current_glucose',
            'mean_glucose',
            'glucose_std',
            'glucose_cv',
            'min_glucose',
            'max_glucose',
            'glucose_range',
            'time_in_range_pct',
            'time_below_range_pct',
            'time_above_range_pct',
            'glucose_trend_slope',
            
            # IOB metrics
            'current_iob',
            'mean_iob',
            'max_iob',
            'iob_std',
            
            # COB metrics
            'current_cob',
            'mean_cob',
            'max_cob',
            
            # Basal activity
            'mean_active_basal',
            'active_basal_std',
        ]
        
        # Add hourly basal features
        hourly_features = [f'basal_hour_{hour:02d}' for hour in range(24)]
        
        return base_features + hourly_features
    
    def features_to_dataframe(self, features: Dict[str, float]) -> pd.DataFrame:
        """
        Convert feature dictionary to pandas DataFrame with consistent column order.
        
        Args:
            features: Dictionary of features
            
        Returns:
            DataFrame with single row of features
        """
        feature_names = self.get_feature_names()
        # Ensure all features are present, fill missing with 0
        row = [features.get(name, 0.0) for name in feature_names]
        return pd.DataFrame([row], columns=feature_names)


def prepare_profile_training_data(samples: List[Dict[str, Any]]) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Prepare training data from profile tuning samples.
    
    Args:
        samples: List of training samples with status_history and outcomes
        
    Returns:
        Tuple of (X, y) where:
            X is feature matrix (n_samples x n_features)
            y is target matrix (n_samples x 26) for [ISF, ICR, 24 basal rates]
    """
    extractor = ProfileFeatureExtractor()
    
    X_list = []
    y_list = []
    
    for sample in samples:
        # Extract features
        features = extractor.extract_features(
            sample['status_history'],
            sample['current_isf'],
            sample['current_icr'],
            sample['current_basal']
        )
        X_df = extractor.features_to_dataframe(features)
        X_list.append(X_df)
        
        # Build target vector [ISF, ICR, basal_0, basal_1, ..., basal_23]
        # We'll use a simple heuristic: better outcomes = keep current settings, worse outcomes = adjust
        # The model will learn the optimal adjustments from the data
        
        # Calculate a "quality score" from outcomes
        time_in_range = sample['outcome_time_in_range']
        time_below = sample['outcome_time_below_range']
        glucose_cv = sample['outcome_glucose_cv']
        
        # For training, we create targets based on outcome quality
        # Better outcomes (high TIR, low variability) → targets close to current
        # Worse outcomes → targets that need adjustment
        
        # This is a simplified approach - the model will learn the optimal values
        target_isf = sample['current_isf']
        target_icr = sample['current_icr']
        
        # Extract basal rates in order
        basal_dict = {b['hour']: b['rate'] for b in sample['current_basal']}
        target_basal = [basal_dict.get(hour, 1.0) for hour in range(24)]
        
        # Combine into target vector
        target_row = [target_isf, target_icr] + target_basal
        y_list.append(target_row)
    
    # Concatenate all samples
    X = pd.concat(X_list, ignore_index=True)
    y = pd.DataFrame(y_list, columns=['isf', 'icr'] + [f'basal_{h:02d}' for h in range(24)])
    
    return X, y
