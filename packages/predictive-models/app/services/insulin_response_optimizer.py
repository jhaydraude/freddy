"""
Insulin Response Optimizer - Extends holistic analyzer to optimize DIA, Peak, and ISF.
Optimizes insulin response parameters using historical glucose and treatment data.
"""

import numpy as np
from scipy.optimize import minimize, Bounds
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel
import math

from .holistic_profile_analyzer import TimeWindow, HolisticProfileAnalyzer


class InsulinResponseResult(BaseModel):
    """Results from insulin response optimization"""
    # Optimized parameters
    dia: float
    peak: float
    isf: List[float]  # 6 four-hour blocks
    
    # Confidence intervals (95%)
    dia_confidence: Tuple[float, float]
    peak_confidence: Tuple[float, float]
    isf_confidence: List[Tuple[float, float]]
    
    # Quality metrics
    r_squared: float
    rmse: float
    mae: float
    windows_analyzed: int
    
    # Analysis summary
    total_windows: int
    stable_windows: int
    meal_windows: int
    activity_windows: int
    data_quality_score: float


class InsulinResponseOptimizer(HolisticProfileAnalyzer):
    """
    Extends holistic analyzer to optimize DIA and Peak Time in addition to ISF.
    
    This optimizer focuses on insulin response parameters:
    - DIA (Duration of Insulin Action): 3-8 hours
    - Peak Time: 30-75 minutes
    - ISF (Insulin Sensitivity Factor): 10-200 mg/dL per unit (6 time blocks)
    """
    
    def __init__(self):
        super().__init__()
        self.current_dia = 5.0
        self.current_peak = 45.0
    
    def analyze_insulin_response(
        self,
        windows: List[Any],
        current_dia: float = 5.0,
        current_peak: float = 45.0,
        current_isf: Optional[List[float]] = None,
        optimize_dia: bool = True,
        optimize_peak: bool = True,
        optimize_isf: bool = True,
        lambda_l2: float = 0.1,
        lambda_smooth: float = 0.05
    ) -> Optional[InsulinResponseResult]:
        """
        Optimize insulin response parameters.
        
        Args:
            windows: List of time windows (TimeWindow objects or dicts)
            current_dia: Current DIA value (hours)
            current_peak: Current peak time (minutes)
            current_isf: Current ISF schedule (6 blocks), defaults to [50]*6
            optimize_dia: Whether to optimize DIA
            optimize_peak: Whether to optimize peak time
            optimize_isf: Whether to optimize ISF schedule
            lambda_l2: L2 regularization strength
            lambda_smooth: Smoothness penalty strength
            
        Returns:
            InsulinResponseResult with optimized parameters and metrics
        """
        # Initialize logs
        self.logs = []
        
        # Store current values
        self.current_dia = current_dia
        self.current_peak = current_peak
        
        # Convert windows to TimeWindow objects if they are dicts
        window_objects = []
        for w in windows:
            if isinstance(w, dict):
                window_objects.append(TimeWindow(**w))
            else:
                window_objects.append(w)
        
        if len(window_objects) < 10:
            print(f"Insufficient windows for analysis: {len(window_objects)} < 10")
            return None
        
        # Calculate window weights
        self.window_weights = self._calculate_window_weights(window_objects)
        
        # Set up optimization
        x0 = []
        bounds_list = []
        param_names = []
        
        if optimize_dia:
            x0.append(current_dia)
            bounds_list.append((3.0, 8.0))
            param_names.append('dia')
        
        if optimize_peak:
            x0.append(current_peak)
            bounds_list.append((30.0, 75.0))
            param_names.append('peak')
        
        if optimize_isf:
            if current_isf is None:
                current_isf = [50.0] * 6
            x0.extend(current_isf)
            bounds_list.extend([(10.0, 200.0)] * 6)
            param_names.extend([f'isf_{i}' for i in range(6)])
        
        x0 = np.array(x0)
        bounds = Bounds([b[0] for b in bounds_list], [b[1] for b in bounds_list])
        
        print(f"Starting insulin response optimization with {len(window_objects)} windows")
        print(f"Optimizing: {', '.join(param_names)}")
        print(f"Initial values: DIA={current_dia}h, Peak={current_peak}min, ISF={current_isf}")
        
        # Run optimization
        result = minimize(
            fun=self._objective_function_insulin_response,
            x0=x0,
            args=(window_objects, optimize_dia, optimize_peak, optimize_isf, x0, lambda_l2, lambda_smooth),
            method='L-BFGS-B',
            bounds=bounds,
            options={'maxiter': 1000, 'disp': True}
        )
        
        if not result.success:
            print(f"Optimization failed: {result.message}")
            return None
        
        # Extract optimized parameters
        params = result.x
        idx = 0
        
        optimized_dia = params[idx] if optimize_dia else current_dia
        idx += 1 if optimize_dia else 0
        
        optimized_peak = params[idx] if optimize_peak else current_peak
        idx += 1 if optimize_peak else 0
        
        optimized_isf = list(params[idx:idx+6]) if optimize_isf else current_isf
        
        print(f"\nOptimization completed successfully!")
        print(f"Optimized DIA: {optimized_dia:.2f}h (was {current_dia:.2f}h)")
        print(f"Optimized Peak: {optimized_peak:.1f}min (was {current_peak:.1f}min)")
        print(f"Optimized ISF: {[f'{v:.1f}' for v in optimized_isf]}")
        
        # Calculate confidence intervals using bootstrap
        print("\nCalculating confidence intervals...")
        confidence_intervals = self._calculate_confidence_intervals_insulin_response(
            window_objects, params, optimize_dia, optimize_peak, optimize_isf,
            lambda_l2, lambda_smooth
        )
        
        # Calculate quality metrics
        predictions = []
        actuals = []
        
        for window in window_objects:
            predicted = self._predict_glucose_change_with_params(
                window, optimized_dia, optimized_peak, optimized_isf
            )
            predictions.append(predicted)
            actuals.append(window.glucose_change)
        
        predictions = np.array(predictions)
        actuals = np.array(actuals)
        
        # Calculate metrics
        ss_res = np.sum((actuals - predictions) ** 2)
        ss_tot = np.sum((actuals - np.mean(actuals)) ** 2)
        r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
        
        rmse = np.sqrt(np.mean((actuals - predictions) ** 2))
        mae = np.mean(np.abs(actuals - predictions))
        
        # Analysis summary
        stable_count = sum(1 for w in window_objects if w.is_stable)
        meal_count = sum(1 for w in window_objects if w.has_meals)
        activity_count = sum(1 for w in window_objects if w.data_quality.get('has_activity_data', False))
        
        avg_quality = np.mean([w.data_quality.get('overall_quality', 0.5) for w in window_objects])
        
        return InsulinResponseResult(
            dia=optimized_dia,
            peak=optimized_peak,
            isf=optimized_isf,
            dia_confidence=confidence_intervals.get('dia', (optimized_dia, optimized_dia)),
            peak_confidence=confidence_intervals.get('peak', (optimized_peak, optimized_peak)),
            isf_confidence=confidence_intervals.get('isf', [(v, v) for v in optimized_isf]),
            r_squared=r_squared,
            rmse=rmse,
            mae=mae,
            windows_analyzed=len(window_objects),
            total_windows=len(window_objects),
            stable_windows=stable_count,
            meal_windows=meal_count,
            activity_windows=activity_count,
            data_quality_score=avg_quality
        )
    
    def _objective_function_insulin_response(
        self,
        params: np.ndarray,
        windows: List[TimeWindow],
        optimize_dia: bool,
        optimize_peak: bool,
        optimize_isf: bool,
        initial_guess: np.ndarray,
        lambda_l2: float,
        lambda_smooth: float
    ) -> float:
        """
        Objective function for insulin response optimization.
        Minimizes weighted squared prediction error with regularization.
        """
        # Extract parameters
        idx = 0
        dia = params[idx] if optimize_dia else self.current_dia
        idx += 1 if optimize_dia else 0
        
        peak = params[idx] if optimize_peak else self.current_peak
        idx += 1 if optimize_peak else 0
        
        isf_rates = list(params[idx:idx+6]) if optimize_isf else [50.0] * 6
        
        # Calculate prediction error
        total_error = 0.0
        for i, window in enumerate(windows):
            predicted = self._predict_glucose_change_with_params(window, dia, peak, isf_rates)
            actual = window.glucose_change
            weight = self.window_weights[i] if i < len(self.window_weights) else 1.0
            total_error += weight * (actual - predicted) ** 2
        
        # L2 regularization (penalize deviation from initial guess)
        if lambda_l2 > 0:
            regularization = lambda_l2 * np.sum((params - initial_guess) ** 2)
            total_error += regularization
        
        # Smoothness penalty for ISF (encourage gradual transitions)
        if lambda_smooth > 0 and optimize_isf:
            smoothness_penalty = 0.0
            for i in range(len(isf_rates) - 1):
                smoothness_penalty += (isf_rates[i+1] - isf_rates[i]) ** 2
            total_error += lambda_smooth * smoothness_penalty
        
        return total_error
    
    def _predict_glucose_change_with_params(
        self,
        window: TimeWindow,
        dia: float,
        peak: float,
        isf_rates: List[float]
    ) -> float:
        """
        Predict glucose change using specific DIA, Peak, and ISF parameters.
        
        Note: This is a simplified model. In reality, DIA and Peak affect
        the insulin activity calculation, which would require recalculating
        IOB curves. For now, we use the pre-calculated insulin_activity
        from the window and apply ISF.
        """
        # Determine which 4-hour block this window is in
        block_idx = min(window.hour_of_day // 4, 5)
        isf = isf_rates[block_idx]
        
        # Get basal rate (using current profile, could be optimized separately)
        basal_rate_needed = 1.0  # Simplified, should come from profile
        
        # Calculate net insulin activity (bolus + basal - basal needed)
        net_activity = window.insulin_activity - (basal_rate_needed * window.duration_hours)
        
        # Carb impact (using current ICR, could be optimized separately)
        icr = 10.0  # Simplified, should come from profile
        carb_insulin_req = window.carb_absorption / icr if icr > 0 else 0
        
        # Activity impact (already calculated in window)
        activity_impact = window.activity_impact
        
        # Predict glucose change
        glucose_change = (
            -(net_activity * isf) +      # Insulin lowers glucose
            (carb_insulin_req * isf) +   # Carbs raise glucose
            activity_impact              # Activity impact
        )
        
        return glucose_change
    
    def _calculate_confidence_intervals_insulin_response(
        self,
        windows: List[TimeWindow],
        params: np.ndarray,
        optimize_dia: bool,
        optimize_peak: bool,
        optimize_isf: bool,
        lambda_l2: float,
        lambda_smooth: float,
        n_bootstrap: int = 100,
        confidence_level: float = 0.95
    ) -> Dict[str, Any]:
        """
        Calculate confidence intervals using bootstrap resampling.
        """
        n_windows = len(windows)
        bootstrap_results = []
        
        print(f"Running {n_bootstrap} bootstrap iterations...")
        
        for i in range(n_bootstrap):
            if i % 20 == 0:
                print(f"  Bootstrap iteration {i}/{n_bootstrap}")
            
            # Resample windows with replacement
            indices = np.random.choice(n_windows, size=n_windows, replace=True)
            resampled_windows = [windows[idx] for idx in indices]
            
            # Recalculate weights for resampled windows
            resampled_weights = [self.window_weights[idx] for idx in indices]
            original_weights = self.window_weights
            self.window_weights = resampled_weights
            
            # Re-optimize with resampled data
            result = minimize(
                fun=self._objective_function_insulin_response,
                x0=params,
                args=(resampled_windows, optimize_dia, optimize_peak, optimize_isf, params, lambda_l2, lambda_smooth),
                method='L-BFGS-B',
                bounds=Bounds([3.0, 30.0] + [10.0]*6 if optimize_dia and optimize_peak and optimize_isf else [10.0]*6,
                             [8.0, 75.0] + [200.0]*6 if optimize_dia and optimize_peak and optimize_isf else [200.0]*6),
                options={'maxiter': 500, 'disp': False}
            )
            
            # Restore original weights
            self.window_weights = original_weights
            
            if result.success:
                bootstrap_results.append(result.x)
        
        if len(bootstrap_results) == 0:
            print("Warning: No successful bootstrap iterations")
            return {}
        
        # Calculate confidence intervals
        bootstrap_results = np.array(bootstrap_results)
        alpha = 1 - confidence_level
        
        confidence_intervals = {}
        idx = 0
        
        if optimize_dia:
            dia_values = bootstrap_results[:, idx]
            confidence_intervals['dia'] = (
                float(np.percentile(dia_values, alpha/2 * 100)),
                float(np.percentile(dia_values, (1 - alpha/2) * 100))
            )
            idx += 1
        
        if optimize_peak:
            peak_values = bootstrap_results[:, idx]
            confidence_intervals['peak'] = (
                float(np.percentile(peak_values, alpha/2 * 100)),
                float(np.percentile(peak_values, (1 - alpha/2) * 100))
            )
            idx += 1
        
        if optimize_isf:
            isf_confidence = []
            for i in range(6):
                isf_values = bootstrap_results[:, idx + i]
                isf_confidence.append((
                    float(np.percentile(isf_values, alpha/2 * 100)),
                    float(np.percentile(isf_values, (1 - alpha/2) * 100))
                ))
            confidence_intervals['isf'] = isf_confidence
        
        print("Confidence intervals calculated successfully")
        return confidence_intervals
