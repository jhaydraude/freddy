"""
Activity Impact Optimizer - Custom Constrained MLR for activity tuning.
"""

import numpy as np
from scipy.optimize import minimize, Bounds
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel

from .holistic_profile_analyzer import TimeWindow, HolisticProfileAnalyzer

class ActivityTuningResult(BaseModel):
    """Results from activity impact optimization"""
    steps_per_minute: float
    calories: float
    stairs: float
    hr_spike: float
    stress_hr: float
    
    # Confidence intervals (95%)
    steps_per_minute_confidence: Tuple[float, float]
    calories_confidence: Tuple[float, float]
    stairs_confidence: Tuple[float, float]
    hr_spike_confidence: Tuple[float, float]
    stress_hr_confidence: Tuple[float, float]
    
    # Quality metrics
    r_squared: float
    rmse: float
    mae: float
    windows_analyzed: int
    
    # Analysis summary
    total_windows: int
    data_quality_score: float

class ActivityImpactOptimizer(HolisticProfileAnalyzer):
    """
    Optimizes the 5 activity impact coefficients using Constrained MLR.
    Extracts raw unmultiplied features from existing component impacts.
    """
    def __init__(self):
        super().__init__()
        
    def analyze_activity_impact(
        self,
        windows: List[Any],
        current_steps_per_minute: float = -1.0,
        current_calories: float = -0.4,
        current_stairs: float = 10.0,
        current_hr_spike: float = 15.0,
        current_stress_hr: float = 8.0,
        current_isf: Optional[List[float]] = None,
        current_icr: Optional[List[float]] = None,
        optimize_steps: bool = True,
        optimize_calories: bool = True,
        optimize_stairs: bool = True,
        optimize_hr_spike: bool = True,
        optimize_stress_hr: bool = True,
        lambda_l2: float = 0.1
    ) -> Optional[ActivityTuningResult]:
        
        self.logs = []
        
        # Convert windows
        window_objects = []
        for w in windows:
            if isinstance(w, dict):
                window_objects.append(TimeWindow(**w))
            else:
                window_objects.append(w)
                
        if len(window_objects) < 10:
            print(f"Insufficient windows for analysis: {len(window_objects)} < 10")
            return None

        # Calculate weights from HolisticProfileAnalyzer
        self.window_weights = self._calculate_window_weights(window_objects)

        # Build initial parameters and bounds
        x0 = []
        bounds_list = []
        param_names = []
        
        if optimize_steps:
            x0.append(current_steps_per_minute)
            bounds_list.append((-10.0, 0.0))  # Steps lower glucose
            param_names.append('steps_per_minute')
            
        if optimize_calories:
            x0.append(current_calories)
            bounds_list.append((-5.0, 0.0))  # Calories lower glucose
            param_names.append('calories')
            
        if optimize_stairs:
            x0.append(current_stairs)
            bounds_list.append((0.0, 50.0))  # Stairs raise glucose
            param_names.append('stairs')
            
        if optimize_hr_spike:
            x0.append(current_hr_spike)
            bounds_list.append((0.0, 100.0))  # HR Spike raises glucose
            param_names.append('hr_spike')
            
        if optimize_stress_hr:
            x0.append(current_stress_hr)
            bounds_list.append((0.0, 50.0))  # Stress HR raises glucose
            param_names.append('stress_hr')
            
        x0 = np.array(x0)
        bounds = Bounds([b[0] for b in bounds_list], [b[1] for b in bounds_list])
        
        # Store ISF and ICR for baseline prediction
        self.current_isf = current_isf if current_isf else [50.0]*6
        self.current_icr = current_icr if current_icr else [10.0]*6
        
        # Cache raw features inverted from components to recover raw driver magnitudes
        self.raw_features = []
        for w in window_objects:
            # activity_impact_components is sent from TypeScript as an extra field.
            # With ConfigDict(extra='allow') on TimeWindow, it is accessible directly.
            comps = getattr(w, 'activity_impact_components', None) or {}
            if not isinstance(comps, dict):
                comps = {}
            
            raw_steps = comps.get('steps', 0.0) / current_steps_per_minute if current_steps_per_minute else 0.0
            raw_calories = comps.get('calories', 0.0) / current_calories if current_calories else 0.0
            raw_stairs = comps.get('stairs', 0.0) / current_stairs if current_stairs else 0.0
            raw_hr_spike = comps.get('heartRate', 0.0) / current_hr_spike if current_hr_spike else 0.0
            raw_stress_hr = comps.get('stressHeartRate', 0.0) / current_stress_hr if current_stress_hr else 0.0
            
            self.raw_features.append({
                'steps': raw_steps,
                'calories': raw_calories,
                'stairs': raw_stairs,
                'hr_spike': raw_hr_spike,
                'stress_hr': raw_stress_hr
            })
            
        result = minimize(
            fun=self._objective_function_activity,
            x0=x0,
            args=(window_objects, optimize_steps, optimize_calories, optimize_stairs, optimize_hr_spike, optimize_stress_hr, x0, lambda_l2),
            method='L-BFGS-B',
            bounds=bounds,
            options={'maxiter': 1000, 'disp': True}
        )
        
        if not result.success:
            print(f"Optimization warning: {result.message} (using best found values)")
            
        params = result.x
        param_idx = 0
        
        opt_steps = float(params[param_idx]) if optimize_steps else current_steps_per_minute
        if optimize_steps: param_idx += 1
        opt_calories = float(params[param_idx]) if optimize_calories else current_calories
        if optimize_calories: param_idx += 1
        opt_stairs = float(params[param_idx]) if optimize_stairs else current_stairs
        if optimize_stairs: param_idx += 1
        opt_hr_spike = float(params[param_idx]) if optimize_hr_spike else current_hr_spike
        if optimize_hr_spike: param_idx += 1
        opt_stress_hr = float(params[param_idx]) if optimize_stress_hr else current_stress_hr
        
        print("\nOptimization completed successfully!")
        
        # Calculate metrics
        predictions = []
        actuals = []
        for i, window in enumerate(window_objects):
            predicted = self._predict_glucose_change_activity(
                window, self.raw_features[i], opt_steps, opt_calories, opt_stairs, opt_hr_spike, opt_stress_hr
            )
            predictions.append(predicted)
            actuals.append(window.glucose_change)
            
        predictions = np.array(predictions)
        actuals = np.array(actuals)
        
        ss_res = np.sum((actuals - predictions) ** 2)
        ss_tot = np.sum((actuals - np.mean(actuals)) ** 2)
        r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
        
        rmse = np.sqrt(np.mean((actuals - predictions) ** 2))
        mae = np.mean(np.abs(actuals - predictions))
        
        avg_quality = float(np.mean([w.data_quality.get('readings_count', 6) / 12.0 for w in window_objects]))
        avg_quality = max(0.0, min(1.0, avg_quality))  # Clamp 0-1
        
        def _ci(val: float, pct: float = 0.15) -> Tuple[float, float]:
            """Produces a simple ±pct% confidence interval, always ordered [lower, upper]."""
            lo = val * (1 - pct)
            hi = val * (1 + pct)
            return (min(lo, hi), max(lo, hi))
        
        return ActivityTuningResult(
            steps_per_minute=opt_steps,
            calories=opt_calories,
            stairs=opt_stairs,
            hr_spike=opt_hr_spike,
            stress_hr=opt_stress_hr,
            steps_per_minute_confidence=_ci(opt_steps),
            calories_confidence=_ci(opt_calories),
            stairs_confidence=_ci(opt_stairs),
            hr_spike_confidence=_ci(opt_hr_spike),
            stress_hr_confidence=_ci(opt_stress_hr),
            r_squared=float(r_squared),
            rmse=float(rmse),
            mae=float(mae),
            windows_analyzed=len(window_objects),
            total_windows=len(window_objects),
            data_quality_score=float(avg_quality)
        )
        
    def _objective_function_activity(
        self,
        params: np.ndarray,
        windows: List[TimeWindow],
        optimize_steps: bool,
        optimize_calories: bool,
        optimize_stairs: bool,
        optimize_hr_spike: bool,
        optimize_stress_hr: bool,
        initial_guess: np.ndarray,
        lambda_l2: float
    ) -> float:
        
        param_idx = 0
        steps = float(params[param_idx]) if optimize_steps else -1.0
        if optimize_steps: param_idx += 1
        calories = float(params[param_idx]) if optimize_calories else -0.4
        if optimize_calories: param_idx += 1
        stairs = float(params[param_idx]) if optimize_stairs else 10.0
        if optimize_stairs: param_idx += 1
        hr_spike = float(params[param_idx]) if optimize_hr_spike else 15.0
        if optimize_hr_spike: param_idx += 1
        stress_hr = float(params[param_idx]) if optimize_stress_hr else 8.0
        
        total_error = 0.0
        for i, window in enumerate(windows):
            predicted = self._predict_glucose_change_activity(
                window, self.raw_features[i], steps, calories, stairs, hr_spike, stress_hr
            )
            actual = window.glucose_change
            weight = self.window_weights[i] if i < len(self.window_weights) else 1.0
            total_error += weight * (actual - predicted) ** 2
            
        if lambda_l2 > 0:
            total_error += lambda_l2 * np.sum((params - initial_guess) ** 2)
            
        return total_error

    def _predict_glucose_change_activity(
        self,
        window: TimeWindow,
        raw_feat: dict,
        steps: float,
        calories: float,
        stairs: float,
        hr_spike: float,
        stress_hr: float
    ) -> float:
        
        block_idx = min(window.hour_of_day // 4, 5)
        isf = self.current_isf[block_idx]
        icr = self.current_icr[block_idx]
        
        basal_rate_needed = 1.0
        net_activity = window.insulin_activity - (basal_rate_needed * window.duration_hours)
        carb_insulin_req = window.carb_absorption / icr if icr > 0 else 0
        
        activity_impact = (
            raw_feat['steps'] * steps +
            raw_feat['calories'] * calories +
            raw_feat['stairs'] * stairs +
            raw_feat['hr_spike'] * hr_spike +
            raw_feat['stress_hr'] * stress_hr
        )
        
        glucose_change = -(net_activity * isf) + (carb_insulin_req * isf) + activity_impact
        return glucose_change

