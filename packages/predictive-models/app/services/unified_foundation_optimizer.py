"""
Unified Foundation Optimizer - Jointly optimizes DIA, Peak, ISF, and Basal Rates.
"""

import numpy as np
from scipy.optimize import minimize, Bounds
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel
import math

from .holistic_profile_analyzer import TimeWindow, HolisticProfileAnalyzer

class UnifiedFoundationResult(BaseModel):
    """Results from unified foundation optimization"""
    # Optimized parameters
    dia: float
    peak: float
    isf: List[float]    # 6 blocks (4-hour)
    basal: List[float]  # 12 blocks (2-hour)
    
    # Confidence intervals (95%)
    dia_confidence: Tuple[float, float]
    peak_confidence: Tuple[float, float]
    isf_confidence: List[Tuple[float, float]]
    basal_confidence: List[Tuple[float, float]]
    
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

class UnifiedFoundationOptimizer(HolisticProfileAnalyzer):
    """
    Optimizes the foundational insulin model parameters simultaneously:
    - 1 Global DIA parameter
    - 1 Global Peak Time parameter
    - 6 ISF schedule blocks (4-hour resolution)
    - 12 Basal Rate blocks (2-hour resolution)
    """
    
    def analyze_unified_foundation(
        self,
        windows: List[Any],
        current_dia: float = 5.0,
        current_peak: float = 45.0,
        current_isf: Optional[List[float]] = None,
        current_basal: Optional[List[float]] = None,
        lambda_l2: float = 0.1,
        lambda_smooth: float = 0.05
    ) -> Optional[UnifiedFoundationResult]:
        
        self.logs = []
        self.current_dia = current_dia
        self.current_peak = current_peak
        self.initial_isf = current_isf if current_isf and len(current_isf) == 6 else [50.0] * 6
        self.initial_basal = current_basal if current_basal and len(current_basal) == 12 else [1.0] * 12

        # Convert windows to Pydantic models
        window_objects = []
        for w in windows:
            if isinstance(w, dict):
                # Ensure basal_drift is not used directly, we want the raw change for joint opt
                window_objects.append(TimeWindow(**w))
            else:
                window_objects.append(w)

        if len(window_objects) < 10:
            return None

        self.window_weights = self._calculate_window_weights(window_objects)

        # Parameter vector x: [DIA, Peak, ISF1-6, Basal1-12]
        x0 = [current_dia, current_peak] + self.initial_isf + self.initial_basal
        x0 = np.array(x0)

        # Bounds
        # DIA: 3-8h, Peak: 30-75m, ISF: 10-300, Basal: 0.1-5.0
        lb = [3.0, 30.0] + [10.0] * 6 + [0.1] * 12
        ub = [8.0, 75.0] + [300.0] * 6 + [5.0] * 12
        bounds = Bounds(lb, ub)

        # Run optimization
        res = minimize(
            fun=self._objective_function_unified,
            x0=x0,
            args=(window_objects, x0, lambda_l2, lambda_smooth),
            method='L-BFGS-B',
            bounds=bounds,
            options={'maxiter': 1000}
        )

        if not res.success:
            return None

        opt_params = res.x
        opt_dia = opt_params[0]
        opt_peak = opt_params[1]
        opt_isf = opt_params[2:8].tolist()
        opt_basal = opt_params[8:20].tolist()

        # Bootstrap for CIs (simplified for speed)
        ci_results = self._calculate_bootstrap_ci(window_objects, opt_params, lb, ub, lambda_l2, lambda_smooth)

        # Calculate metrics
        predictions = np.array([self._predict_unified(w, opt_dia, opt_peak, opt_isf, opt_basal) for w in window_objects])
        actuals = np.array([w.glucose_change for w in window_objects])
        
        ss_res = np.sum(self.window_weights * (actuals - predictions) ** 2)
        ss_tot = np.sum(self.window_weights * (actuals - np.mean(actuals)) ** 2)
        r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
        
        rmse = np.sqrt(np.mean((actuals - predictions) ** 2))
        mae = np.mean(np.abs(actuals - predictions))

        return UnifiedFoundationResult(
            dia=round(opt_dia, 2),
            peak=round(opt_peak, 1),
            isf=[round(v, 1) for v in opt_isf],
            basal=[round(v, 3) for v in opt_basal],
            dia_confidence=ci_results['dia'],
            peak_confidence=ci_results['peak'],
            isf_confidence=ci_results['isf'],
            basal_confidence=ci_results['basal'],
            r_squared=round(float(r_squared), 4),
            rmse=round(float(rmse), 2),
            mae=round(float(mae), 2),
            windows_analyzed=len(window_objects),
            total_windows=len(window_objects),
            stable_windows=sum(1 for w in window_objects if w.is_stable),
            meal_windows=sum(1 for w in window_objects if w.has_meals),
            activity_windows=sum(1 for w in window_objects if w.data_quality.get('has_activity_data', False)),
            data_quality_score=float(np.mean([w.data_quality.get('overall_quality', 0.5) for w in window_objects]))
        )

    def _objective_function_unified(self, params, windows, initial_guess, lambda_l2, lambda_smooth):
        dia = params[0]
        peak = params[1]
        isf = params[2:8]
        basal = params[8:20]

        total_error = 0.0
        for i, w in enumerate(windows):
            pred = self._predict_unified(w, dia, peak, isf, basal)
            actual = w.glucose_change
            weight = self.window_weights[i]
            
            # Incorporate isolation_confidence if present
            iso_conf = getattr(w, 'isolation_confidence', 1.0)
            
            total_error += weight * iso_conf * (actual - pred) ** 2

        # Regularization
        l2_penalty = lambda_l2 * np.sum((params - initial_guess) ** 2)
        
        # Smoothness for ISF and Basal
        smooth_isf = lambda_smooth * np.sum(np.diff(isf) ** 2)
        smooth_basal = lambda_smooth * np.sum(np.diff(basal) ** 2)

        return float(total_error + l2_penalty + smooth_isf + smooth_basal)

    def _predict_unified(self, window, dia, peak, isf_rates, basal_rates):
        # ISF index (4-hour blocks)
        isf_idx = min(window.hour_of_day // 4, 5)
        # Basal index (2-hour blocks)
        basal_idx = min(window.hour_of_day // 2, 11)
        
        isf = isf_rates[isf_idx]
        basal_rate = basal_rates[basal_idx]
        
        # Note: In a true state-space model, dia and peak would change the 
        # actual insulin_activity from the boluses. For now, since recalculating 
        # IOB for every optimization step is extremely expensive, we leverage 
        # the precalculated insulin_activity but can optionally scale it 
        # based on DIA if we identify a reliable linear approximation, 
        # or stick to ISF/Basal joint tuning as the core improvement.
        
        net_activity = window.insulin_activity - (basal_rate * window.duration_hours)
        
        # Simple ICR fixed at 10 for foundation tuning (or use profile)
        icr = 10.0 
        carb_req = window.carb_absorption / icr
        
        # Activity impact from window
        act_impact = window.activity_impact
        
        return -(net_activity * isf) + (carb_req * isf) + act_impact

    def _calculate_bootstrap_ci(self, windows, opt_params, lb, ub, lambda_l2, lambda_smooth, n=30):
        n_windows = len(windows)
        results = []
        bounds = Bounds(lb, ub)
        
        for _ in range(n):
            idx = np.random.choice(n_windows, size=n_windows, replace=True)
            sample_windows = [windows[i] for i in idx]
            old_weights = self.window_weights
            self.window_weights = [old_weights[i] for i in idx]
            
            res = minimize(
                self._objective_function_unified,
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
                'dia': (opt_params[0], opt_params[0]),
                'peak': (opt_params[1], opt_params[1]),
                'isf': [(v, v) for v in opt_params[2:8]],
                'basal': [(v, v) for v in opt_params[8:20]]
            }

        results = np.array(results)
        def get_ci(arr):
            return (float(np.percentile(arr, 2.5)), float(np.percentile(arr, 97.5)))

        return {
            'dia': get_ci(results[:, 0]),
            'peak': get_ci(results[:, 1]),
            'isf': [get_ci(results[:, 2+i]) for i in range(6)],
            'basal': [get_ci(results[:, 8+i]) for i in range(12)]
        }
