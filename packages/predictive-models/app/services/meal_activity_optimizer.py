"""
Meal and Activity Optimizer - Optimizes Carb Ratio and Activity Coefficients
using Foundation Tuning results as a fixed baseline.
"""

import numpy as np
from scipy.optimize import minimize, Bounds
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel
import math

from .holistic_profile_analyzer import TimeWindow, HolisticProfileAnalyzer

class MealActivityResult(BaseModel):
    """Results from meal and activity optimization"""
    # Optimized parameters
    isf: List[float]    # 6 blocks (4-hour)
    cr: List[float]     # 6 blocks (4-hour)
    basal: List[float]  # 12 blocks (2-hour)
    activity_coefficients: Dict[str, float]
    
    # Confidence intervals (95%)
    isf_confidence: List[Tuple[float, float]]
    cr_confidence: List[Tuple[float, float]]
    basal_confidence: List[Tuple[float, float]]
    activity_confidence: Dict[str, Tuple[float, float]]
    
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

class MealActivityOptimizer(HolisticProfileAnalyzer):
    """
    Optimizes Carb Ratio (CR) and Activity Coefficients.
    Basal rates are allowed to vary slightly from foundation baseline.
    ISF is allowed to vary with tight regularization.
    """
    
    def analyze_meal_activity(
        self,
        windows: List[Any],
        baseline_isf: List[float],
        baseline_basal: List[float],
        current_cr: Optional[List[float]] = None,
        current_activity_coeffs: Optional[Dict[str, float]] = None,
        lambda_l2: float = 0.2,
        lambda_smooth: float = 0.05
    ) -> Optional[MealActivityResult]:
        
        self.logs = []
        self.baseline_isf = baseline_isf
        self.baseline_basal = baseline_basal
        self.initial_cr = current_cr if current_cr and len(current_cr) == 6 else [10.0] * 6
        
        # Default activity coefficients - Restricted to visible sensors (Steps + HR)
        self.initial_activity = current_activity_coeffs or {
            "steps": -0.1,      # mg/dL per step
            "heartRate": 1.0,   # mg/dL per HR elevation %
        }

        # Convert windows to Pydantic models
        window_objects = []
        for w in windows:
            if isinstance(w, dict):
                window_objects.append(TimeWindow(**w))
            else:
                window_objects.append(w)

        if len(window_objects) < 15:
            return None

        self.window_weights = self._calculate_window_weights(window_objects)

        # Parameter vector x: [ISF1-6, CR1-6, Basal1-12, ActSteps, ActHR]
        # Total parameters: 6 + 6 + 12 + 2 = 26
        act_keys = ["steps", "heartRate"]
        x0 = self.baseline_isf + self.initial_cr + self.baseline_basal + [self.initial_activity.get(k, 0.0) for k in act_keys]
        x0 = np.array(x0)

        # Bounds
        # ISF: +/- 30% from baseline, min 10
        isf_lb = [max(10.0, v * 0.7) for v in baseline_isf]
        isf_ub = [v * 1.3 for v in baseline_isf]
        
        # CR: 3 to 50
        cr_lb = [3.0] * 6
        cr_ub = [50.0] * 6

        # Basal: +/- 20% deviation permitted in Level 2
        basal_lb = [max(0.05, v * 0.8) for v in baseline_basal]
        basal_ub = [max(0.1, v * 1.2) for v in baseline_basal]
        
        # Activity Bounds (all impact usually negative except HR/Stress)
        act_lb = [-1.0, 0.1]
        act_ub = [0.0, 40.0]
        
        lb = isf_lb + cr_lb + basal_lb + act_lb
        ub = isf_ub + cr_ub + basal_ub + act_ub
        bounds = Bounds(lb, ub)

        # Run optimization
        res = minimize(
            fun=self._objective_function_meal,
            x0=x0,
            args=(window_objects, x0, lambda_l2, lambda_smooth),
            method='L-BFGS-B',
            bounds=bounds,
            options={'maxiter': 1000}
        )

        if not res.success:
            return None

        opt_params = res.x
        opt_isf = opt_params[0:6].tolist()
        opt_cr = opt_params[6:12].tolist()
        opt_basal = opt_params[12:24].tolist()
        opt_act = {k: float(v) for k, v in zip(act_keys, opt_params[24:26])}

        # Calculate metrics
        predictions = np.array([self._predict_meal(w, opt_isf, opt_cr, opt_basal, opt_act) for w in window_objects])
        actuals = np.array([w.glucose_change for w in window_objects])
        
        ss_res = np.sum(self.window_weights * (actuals - predictions) ** 2)
        ss_tot = np.sum(self.window_weights * (actuals - np.mean(actuals)) ** 2)
        r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
        
        rmse = np.sqrt(np.mean((actuals - predictions) ** 2))
        mae = np.mean(np.abs(actuals - predictions))

        # Simplified Bootstrap for CIs
        ci_results = self._calculate_bootstrap_ci_meal(window_objects, opt_params, lb, ub, lambda_l2, lambda_smooth)

        return MealActivityResult(
            isf=[round(v, 2) for v in opt_isf],
            cr=[round(v, 2) for v in opt_cr],
            basal=[round(v, 3) for v in opt_basal],
            activity_coefficients={k: round(v, 4) for k, v in opt_act.items()},
            isf_confidence=ci_results['isf'],
            cr_confidence=ci_results['cr'],
            basal_confidence=ci_results['basal'],
            activity_confidence={k: ci_results['act'][i] for i, k in enumerate(act_keys)},
            r_squared=round(float(r_squared), 4),
            rmse=round(float(rmse), 2),
            mae=round(float(mae), 2),
            windows_analyzed=len(window_objects),
            total_windows=len(window_objects),
            stable_windows=sum(1 for w in window_objects if w.is_stable),
            meal_windows=sum(1 for w in window_objects if w.has_meals),
            activity_windows=sum(1 for w in window_objects if w.data_quality.get('has_activity_data', False))
        )

    def _objective_function_meal(self, params, windows, initial_guess, lambda_l2, lambda_smooth):
        isf = params[0:6]
        cr = params[6:12]
        basal = params[12:24]
        act = params[24:26]

        total_error = 0.0
        for i, w in enumerate(windows):
            pred = self._predict_meal(w, isf, cr, basal, {"steps": act[0], "heartRate": act[1]})
            actual = w.glucose_change
            weight = self.window_weights[i]
            total_error += weight * (actual - pred) ** 2

        # Regularization
        l2_penalty = lambda_l2 * np.sum((params - initial_guess) ** 2)
        
        # Smoothness
        smooth_isf = lambda_smooth * np.sum(np.diff(isf) ** 2)
        smooth_cr = lambda_smooth * np.sum(np.diff(cr) ** 2)
        smooth_basal = lambda_smooth * np.sum(np.diff(basal) ** 2)

        return float(total_error + l2_penalty + smooth_isf + smooth_cr + smooth_basal)

    def _predict_meal(self, window, isf_rates, cr_rates, basal_rates, act_coeffs):
        hour = window.hour_of_day
        isf_idx = min(hour // 4, 5)
        cr_idx = min(hour // 4, 5)
        basal_idx = min(hour // 2, 11)
        
        isf = isf_rates[isf_idx]
        cr = cr_rates[cr_idx]
        basal_rate = basal_rates[basal_idx]
        
        # Net Insulin Activity
        net_activity = window.insulin_activity - (basal_rate * window.duration_hours)
        
        # Carb Requirement
        carb_req = window.carb_absorption / cr
        
        # Activity Impact
        steps_per_min = window.activity_steps / (window.duration_hours * 60) if window.duration_hours > 0 else 0
        
        act_impact = (
            (steps_per_min * act_coeffs['steps']) +
            (window.activity_hr_elevation * act_coeffs['heartRate'])
        )
            
        return -(net_activity * isf) + (carb_req * isf) + act_impact

    def _calculate_bootstrap_ci_meal(self, windows, opt_params, lb, ub, lambda_l2, lambda_smooth, n=20):
        n_windows = len(windows)
        results = []
        bounds = Bounds(lb, ub)
        
        for _ in range(n):
            idx = np.random.choice(n_windows, size=n_windows, replace=True)
            sample_windows = [windows[i] for i in idx]
            old_weights = self.window_weights
            self.window_weights = [old_weights[i] for i in idx]
            
            res = minimize(
                self._objective_function_meal,
                opt_params,
                args=(sample_windows, opt_params, lambda_l2, lambda_smooth),
                method='L-BFGS-B',
                bounds=bounds,
                options={'maxiter': 200}
            )
            if res.success:
                results.append(res.x)
            self.window_weights = old_weights

        if not results:
            return {
                'isf': [(v, v) for v in opt_params[0:6]],
                'cr': [(v, v) for v in opt_params[6:12]],
                'basal': [(v, v) for v in opt_params[12:24]],
                'act': [(v, v) for v in opt_params[24:26]]
            }

        results = np.array(results)
        def get_ci(arr):
            return (float(np.percentile(arr, 2.5)), float(np.percentile(arr, 97.5)))

        return {
            'isf': [get_ci(results[:, i]) for i in range(0, 6)],
            'cr': [get_ci(results[:, i]) for i in range(6, 12)],
            'basal': [get_ci(results[:, i]) for i in range(12, 24)],
            'act': [get_ci(results[:, i]) for i in range(24, 26)]
        }
