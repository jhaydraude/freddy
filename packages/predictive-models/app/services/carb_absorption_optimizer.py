"""
Carb Absorption Optimizer - Extends holistic analyzer to optimize ICR, Absorption Rate, and Min Carb Impact.
Optimizes carb absorption parameters using meal response data.
"""

import numpy as np
from scipy.optimize import minimize, Bounds
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel
import math

from .holistic_profile_analyzer import TimeWindow, HolisticProfileAnalyzer


class CarbAbsorptionResult(BaseModel):
    """Results from carb absorption optimization"""
    # Optimized parameters
    icr: List[float]  # 6 four-hour blocks
    absorption_rate: float
    min_carb_impact: float
    s_curve_params: Dict[str, float]
    
    # Confidence intervals (95%)
    icr_confidence: List[Tuple[float, float]]
    absorption_rate_confidence: Tuple[float, float]
    min_carb_impact_confidence: Tuple[float, float]
    
    # Quality metrics
    r_squared: float
    rmse: float
    mae: float
    meal_windows_analyzed: int
    
    # Analysis summary
    total_meal_events: int
    avg_meal_size: float
    meal_distribution_by_time: Dict[str, float]
    data_quality_score: float


class CarbAbsorptionOptimizer(HolisticProfileAnalyzer):
    """
    Optimizes carb absorption parameters using meal response data.
    
    Optimized parameters:
    - ICR (Insulin to Carb Ratio): 3-50 g/U (6 time blocks)
    - Absorption Rate: 10-60 g/hr
    - Min Carb Impact: 3-15 mg/dL/5min
    """
    
    def __init__(self):
        super().__init__()
        self.current_icr = [10.0] * 6
        self.current_absorption_rate = 30.0
        self.current_min_carb_impact = 8.0
    
    def analyze_carb_absorption(
        self,
        windows: List[Any],
        current_icr: Optional[List[float]] = None,
        current_absorption_rate: float = 30.0,
        current_min_carb_impact: float = 8.0,
        optimize_icr: bool = True,
        optimize_absorption_rate: bool = True,
        optimize_min_carb_impact: bool = True,
        lambda_l2: float = 0.1,
        lambda_smooth: float = 0.05
    ) -> Optional[CarbAbsorptionResult]:
        """
        Optimize carb absorption parameters.
        """
        # Convert windows to TimeWindow objects if they are dicts
        window_objects = []
        for w in windows:
            if isinstance(w, dict):
                window_objects.append(TimeWindow(**w))
            else:
                window_objects.append(w)
        
        # Filter for meal windows
        meal_windows = [w for w in window_objects if w.has_meals or w.carbs_consumed > 0]
        
        if len(meal_windows) < 10:
            print(f"Insufficient meal windows: {len(meal_windows)} < 10")
            return None
            
        self.current_icr = current_icr if current_icr else [10.0] * 6
        self.current_absorption_rate = current_absorption_rate
        self.current_min_carb_impact = current_min_carb_impact
        
        # Calculate window weights
        self.window_weights = self._calculate_window_weights(meal_windows)
        
        # Set up optimization
        x0 = []
        bounds_list = []
        
        if optimize_icr:
            x0.extend(self.current_icr)
            bounds_list.extend([(3.0, 50.0)] * 6)
            
        if optimize_absorption_rate:
            x0.append(current_absorption_rate)
            bounds_list.append((10.0, 60.0))
            
        if optimize_min_carb_impact:
            x0.append(current_min_carb_impact)
            bounds_list.append((3.0, 15.0))
            
        x0 = np.array(x0)
        bounds = Bounds([b[0] for b in bounds_list], [b[1] for b in bounds_list])
        
        # Run optimization
        result = minimize(
            fun=self._objective_function_carb_absorption,
            x0=x0,
            args=(meal_windows, optimize_icr, optimize_absorption_rate, optimize_min_carb_impact, x0, lambda_l2, lambda_smooth),
            method='L-BFGS-B',
            bounds=bounds,
            options={'maxiter': 1000}
        )
        
        if not result.success:
            return None
            
        # Extract optimized parameters
        params = result.x
        idx = 0
        
        opt_icr = list(params[idx:idx+6]) if optimize_icr else self.current_icr
        idx += 6 if optimize_icr else 0
        
        opt_abs_rate = params[idx] if optimize_absorption_rate else self.current_absorption_rate
        idx += 1 if optimize_absorption_rate else 0
        
        opt_min_impact = params[idx] if optimize_min_carb_impact else self.current_min_carb_impact
        
        # Calculate confidence intervals (simplified for now)
        confidence_intervals = self._calculate_confidence_intervals_bootstrapped(
            meal_windows, params, optimize_icr, optimize_absorption_rate, optimize_min_carb_impact,
            lambda_l2, lambda_smooth
        )
        
        # Calculate quality metrics
        predictions = []
        actuals = []
        for window in meal_windows:
            predicted = self._predict_glucose_change_with_params(window, opt_icr, opt_abs_rate, opt_min_impact)
            predictions.append(predicted)
            actuals.append(window.glucose_change)
            
        predictions = np.array(predictions)
        actuals = np.array(actuals)
        
        ss_res = np.sum((actuals - predictions) ** 2)
        ss_tot = np.sum((actuals - np.mean(actuals)) ** 2)
        r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
        rmse = np.sqrt(np.mean((actuals - predictions) ** 2))
        mae = np.mean(np.abs(actuals - predictions))
        
        return CarbAbsorptionResult(
            icr=opt_icr,
            absorption_rate=opt_abs_rate,
            min_carb_impact=opt_min_impact,
            s_curve_params={"duration_multiplier": 1.2, "peak_time_ratio": 0.25, "min_base_rate": 10.0},
            icr_confidence=confidence_intervals.get('icr', [(v, v) for v in opt_icr]),
            absorption_rate_confidence=confidence_intervals.get('absorption_rate', (opt_abs_rate, opt_abs_rate)),
            min_carb_impact_confidence=confidence_intervals.get('min_carb_impact', (opt_min_impact, opt_min_impact)),
            r_squared=r_squared,
            rmse=rmse,
            mae=mae,
            meal_windows_analyzed=len(meal_windows),
            total_meal_events=len(meal_windows),
            avg_meal_size=np.mean([w.carbs_consumed for w in meal_windows if w.carbs_consumed > 0]) if meal_windows else 0,
            meal_distribution_by_time={},
            data_quality_score=np.mean([w.data_quality.get('overall_quality', 0.5) for w in meal_windows])
        )

    def _objective_function_carb_absorption(
        self,
        params: np.ndarray,
        windows: List[TimeWindow],
        optimize_icr: bool,
        optimize_absorption_rate: bool,
        optimize_min_carb_impact: bool,
        initial_guess: np.ndarray,
        lambda_l2: float,
        lambda_smooth: float
    ) -> float:
        idx = 0
        icr_rates = list(params[idx:idx+6]) if optimize_icr else self.current_icr
        idx += 6 if optimize_icr else 0
        
        abs_rate = params[idx] if optimize_absorption_rate else self.current_absorption_rate
        idx += 1 if optimize_absorption_rate else 0
        
        min_impact = params[idx] if optimize_min_carb_impact else self.current_min_carb_impact
        
        total_error = 0.0
        for i, window in enumerate(windows):
            predicted = self._predict_glucose_change_with_params(window, icr_rates, abs_rate, min_impact)
            actual = window.glucose_change
            weight = self.window_weights[i] if i < len(self.window_weights) else 1.0
            total_error += weight * (actual - predicted) ** 2
            
        if lambda_l2 > 0:
            total_error += lambda_l2 * np.sum((params - initial_guess) ** 2)
            
        if lambda_smooth > 0 and optimize_icr:
            for i in range(len(icr_rates) - 1):
                total_error += lambda_smooth * (icr_rates[i+1] - icr_rates[i]) ** 2
                
        return total_error

    def _predict_glucose_change_with_params(
        self,
        window: TimeWindow,
        icr_rates: List[float],
        abs_rate: float,
        min_impact: float
    ) -> float:
        block_idx = min(window.hour_of_day // 4, 5)
        icr = icr_rates[block_idx]
        
        # Sensitivity factor - using placeholder/simplified approach for now
        # Ideally this should be passed in or optimized holistically
        isf = 50.0 
        
        # Net insulin impact
        # This is a simplified linear model
        net_activity = window.insulin_activity 
        
        # Carb impact
        carb_impact = (window.carb_absorption / icr) * isf if icr > 0 else 0
        
        # Simple prediction: Change = (Carbs / ICR * ISF) - (Insulin * ISF)
        # Note: self.activity_impact should be accounted for if available
        return carb_impact - (net_activity * isf) + window.activity_impact

    def _calculate_confidence_intervals_bootstrapped(
        self,
        windows: List[TimeWindow],
        params: np.ndarray,
        optimize_icr: bool,
        optimize_absorption_rate: bool,
        optimize_min_carb_impact: bool,
        lambda_l2: float,
        lambda_smooth: float,
        n_bootstrap: int = 50
    ) -> Dict[str, Any]:
        n_windows = len(windows)
        results = []
        
        for _ in range(n_bootstrap):
            indices = np.random.choice(n_windows, size=n_windows, replace=True)
            resampled_windows = [windows[idx] for idx in indices]
            
            res = minimize(
                fun=self._objective_function_carb_absorption,
                x0=params,
                args=(resampled_windows, optimize_icr, optimize_absorption_rate, optimize_min_carb_impact, params, lambda_l2, lambda_smooth),
                method='L-BFGS-B',
                bounds=Bounds([3.0]*6 + [10.0, 3.0] if optimize_icr and optimize_absorption_rate else [10.0, 3.0],
                             [50.0]*6 + [60.0, 15.0] if optimize_icr and optimize_absorption_rate else [60.0, 15.0]),
                options={'maxiter': 200}
            )
            if res.success:
                results.append(res.x)
                
        if not results:
            return {}
            
        results = np.array(results)
        conf = {}
        idx = 0
        if optimize_icr:
            icr_conf = []
            for i in range(6):
                vals = results[:, idx + i]
                icr_conf.append((float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))))
            conf['icr'] = icr_conf
            idx += 6
            
        if optimize_absorption_rate:
            vals = results[:, idx]
            conf['absorption_rate'] = (float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5)))
            idx += 1
            
        if optimize_min_carb_impact:
            vals = results[:, idx]
            conf['min_carb_impact'] = (float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5)))
            
        return conf
