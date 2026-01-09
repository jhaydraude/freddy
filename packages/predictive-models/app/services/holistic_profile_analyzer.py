"""
Holistic profile parameter analyzer using optimization.
Estimates ISF, ICR, and Basal rates simultaneously.
"""

import numpy as np
from scipy.optimize import minimize, Bounds
from typing import List, Dict, Any, Optional
from pydantic import BaseModel


class TimeWindow(BaseModel):
    """Single time window for analysis"""
    start: str
    end: str
    duration_hours: float
    
    glucose_start: float
    glucose_end: float
    glucose_change: float
    glucose_readings_count: int
    
    bolus_insulin: float
    basal_insulin_delivered: float
    total_insulin: float
    insulin_activity: float  # Units actually absorbed in window
    
    carbs_consumed: float
    carb_events_count: int
    carb_absorption: float   # Grams actually absorbed in window
    
    activity_steps: float
    activity_calories: float
    activity_floors: float
    activity_heart_rate: float
    activity_hr_elevation: float
    activity_impact: float  # Calculated impact (mg/dL)
    activity_intensity: str
    
    hour_of_day: int
    is_stable: bool
    has_meals: bool
    has_corrections: bool
    
    data_quality: Dict[str, Any]


class ProfileAnalysisResult(BaseModel):
    """Results from holistic profile analysis"""
    estimated_isf: List[float]  # 6 four-hour blocks
    estimated_icr: List[float]  # 6 four-hour blocks
    estimated_basal_rates: List[float]  # 6 four-hour blocks
    
    # Confidence intervals (95% by default)
    isf_confidence: List[List[float]]  # [[lower, upper] for each block]
    icr_confidence: List[List[float]]  # [[lower, upper] for each block]
    basal_confidence: List[List[float]]  # [[lower, upper] for each block]
    
    # Confidence metrics
    r_squared: float
    rmse: float
    mae: float
    
    # NEW: Activity coefficients
    estimated_activity_coefficients: Optional[Dict[str, float]] = None
    activity_confidence: Optional[Dict[str, Dict[str, float]]] = None
    
    # Data summary
    windows_analyzed: int
    windows_filtered_out: int
    stable_windows: int
    meal_windows: int
    
    # Diagnostics
    prediction_errors: List[float]
    actual_vs_predicted: List[Dict[str, float]]
    
    # Logs
    logs: List[str] = []


class HolisticProfileAnalyzer:
    """
    Estimates ISF, ICR, and 24 basal rates simultaneously
    using non-linear optimization over time windows.
    """
    
    def analyze(
        self, 
        windows: List[Dict[str, Any]],
        estimate_activity: bool = True
    ) -> Optional[ProfileAnalysisResult]:
        """
        Perform holistic profile analysis.
        
        Args:
            windows: List of time window dictionaries
            estimate_activity: Whether to include activity coefficients in optimization
            
        Returns:
            ProfileAnalysisResult or None if unsuccessful
        """
        self.logs = []
        
        if len(windows) < 10:
            self._log("❌ Insufficient data: Need at least 10 windows.")
            return None
        
        # Convert to Pydantic models
        try:
            window_objects = [TimeWindow(**w) for w in windows]
        except Exception as e:
            self._log(f"Error validating windows: {e}")
            return None
        
        # Calculate quality-based weights for each window (soft weighting instead of hard filtering)
        window_weights = self._calculate_window_weights(window_objects)
        
        self._log(f"\n🔧 Optimizing parameters for {len(window_objects)} windows...")
        self._log(f"   (Using soft weighting based on data quality)")
        
        # Store weights for use in objective function
        self.window_weights = window_weights
        
        # Initial parameter guesses
        initial_isf = [50.0] * 6  # mg/dL per unit (6 blocks)
        initial_icr = [10.0] * 6  # grams per unit (6 blocks)
        initial_basal = [1.0] * 6  # U/hr (6 blocks)
        
        # Initial activity coefficients
        x0_activity = []
        bounds_activity = []
        if estimate_activity:
            x0_activity = [-1.0, 15.0]  # steps_per_minute, hr_spike
            bounds_activity = [(-5.0, 0.0), (0.0, 50.0)]
            
        # Flatten parameters for optimizer
        x0 = np.array(initial_isf + initial_icr + initial_basal + x0_activity)
        
        # Set bounds
        # ISF: [10, 200], ICR: [3, 50], Basal: [0.1, 5.0]
        lb = [10.0] * 6 + [3.0] * 6 + [0.1] * 6 + [b[0] for b in bounds_activity]
        ub = [200.0] * 6 + [50.0] * 6 + [5.0] * 6 + [b[1] for b in bounds_activity]
        bounds = Bounds(lb=lb, ub=ub)
        
        # Optimize with regularization
        # Regularization parameters (tunable)
        lambda_l2 = 0.1  # L2 regularization strength
        lambda_smooth = 0.05  # Smoothness penalty strength
        
        result = minimize(
            fun=self._objective_function,
            x0=x0,
            args=(window_objects, estimate_activity, x0, lambda_l2, lambda_smooth),
            method='L-BFGS-B',
            bounds=bounds,
            options={'maxiter': 1000, 'disp': True}
        )
        
        # Extract optimized parameters
        isf_values = [float(x) for x in result.x[0:6]]
        icr_values = [float(x) for x in result.x[6:12]]
        basal_rates = [float(x) for x in result.x[12:18]]
        
        activity_coeffs = None
        if estimate_activity:
            activity_coeffs = {
                'steps_per_minute': float(result.x[18]),
                'hr_spike': float(result.x[19])
            }
        
        self._log(f"\n✅ Optimization complete!")
        self._log(f"  ISF (avg): {np.mean(isf_values):.2f} mg/dL per unit")
        self._log(f"  ICR (avg): {np.mean(icr_values):.2f} g per unit")
        self._log(f"  Basal (avg): {np.mean(basal_rates):.3f} U/hr")
        if activity_coeffs:
            self._log(f"  Steps coeff: {activity_coeffs['steps_per_minute']:.2f} mg/dL per step/min")
            self._log(f"  HR spike coeff: {activity_coeffs['hr_spike']:.2f} mg/dL per unit")
        
        # Calculate metrics
        predictions = []
        errors = []
        actual_vs_pred = []
        
        for window in window_objects:
            predicted = self._predict_glucose_change(
                window, isf_values, icr_values, basal_rates, activity_coeffs
            )
            actual = window.glucose_change
            error = actual - predicted
            
            predictions.append(predicted)
            errors.append(error)
            actual_vs_pred.append({
                'actual': actual,
                'predicted': predicted,
                'error': error
            })
        
        # Calculate R²
        ss_res = np.sum(np.array(errors) ** 2)
        ss_tot = np.sum((np.array([w.glucose_change for w in window_objects]) - 
                        np.mean([w.glucose_change for w in window_objects])) ** 2)
        r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
        
        # RMSE and MAE
        rmse = np.sqrt(np.mean(np.array(errors) ** 2))
        mae = np.mean(np.abs(errors))
        
        # Calculate confidence intervals using bootstrap
        self._log(f"\n📊 Calculating confidence intervals via bootstrap...")
        confidence_intervals = self._calculate_confidence_intervals(
            window_objects, isf_values, icr_values, basal_rates, activity_coeffs, estimate_activity
        )
        
        return ProfileAnalysisResult(
            estimated_isf=isf_values,
            estimated_icr=icr_values,
            estimated_basal_rates=basal_rates,
            estimated_activity_coefficients=activity_coeffs,
            isf_confidence=confidence_intervals['isf'],
            icr_confidence=confidence_intervals['icr'],
            basal_confidence=confidence_intervals['basal'],
            activity_confidence=confidence_intervals.get('activity'),
            r_squared=float(r_squared),
            rmse=float(rmse),
            mae=float(mae),
            windows_analyzed=len(window_objects),
            windows_filtered_out=0,  # No longer filtering
            stable_windows=len([w for w in window_objects if w.is_stable]),
            meal_windows=len([w for w in window_objects if w.has_meals]),
            prediction_errors=errors,
            actual_vs_predicted=actual_vs_pred,
            logs=self.logs
        )
    
    def _log(self, message: str):
        """Log a message and print it"""
        import datetime
        timestamp = datetime.datetime.now().strftime("%H:%M:%S")
        formatted = f"[{timestamp}] {message}"
        self.logs.append(message)  # Keep raw message or formatted? Usually raw is better for UI?
        print(formatted)
    


    def _calculate_window_weights(
        self, 
        windows: List[TimeWindow]
    ) -> List[float]:
        """
        Calculate quality-based weights for each window instead of filtering.
        
        This soft weighting approach preserves all data while down-weighting
        windows with potential quality issues (e.g., unreported carbs).
        
        Returns:
            List of weights (0.0 to 1.5) for each window
        """
        weights = []
        low_weight_count = 0
        
        for window in windows:
            weight = 1.0
            
            # Penalize windows with few glucose readings
            readings = window.data_quality.get('readings_count', 12)
            if readings < 6:
                weight *= 0.3
                low_weight_count += 1
            elif readings < 10:
                weight *= 0.6
            
            # Penalize unexplained glucose increases (soft penalty instead of removal)
            if window.glucose_change > 0:
                glucose_increase = window.glucose_change
                carbs = window.carbs_consumed
                
                # Heuristic: 1g carb raises glucose ~3-5 mg/dL
                # Large increases with few carbs suggest unreported meals
                if glucose_increase > 80 and carbs < 40:
                    weight *= 0.2  # Strong penalty but don't remove
                    low_weight_count += 1
                elif glucose_increase > 50 and carbs < 20:
                    weight *= 0.4  # Moderate penalty
                    low_weight_count += 1
            
            # Reward stable windows (less noise)
            if window.is_stable:
                weight *= 1.3
            
            # Reward windows with good data quality
            if readings >= 12:
                weight *= 1.1
            
            weights.append(weight)
        
        if low_weight_count > 0:
            self._log(f"   Applied low weights to {low_weight_count} windows with quality concerns")
        
        return weights
    
    
    def _calculate_confidence_intervals(
        self,
        windows: List[TimeWindow],
        isf_rates: List[float],
        icr_rates: List[float],
        basal_rates: List[float],
        activity_coeffs: Optional[Dict[str, float]] = None,
        estimate_activity: bool = False,
        n_bootstrap: int = 100,
        confidence_level: float = 0.95
    ) -> Dict[str, Any]:
        """
        Calculate confidence intervals using bootstrap resampling.
        """
        import random
        
        isf_samples = [[] for _ in range(6)]
        icr_samples = [[] for _ in range(6)]
        basal_samples = [[] for _ in range(6)]
        activity_samples = {'steps_per_minute': [], 'hr_spike': []}
        
        # Initial guess and bounds
        x0_activity = []
        bounds_activity = []
        if estimate_activity and activity_coeffs:
            x0_activity = [activity_coeffs['steps_per_minute'], activity_coeffs['hr_spike']]
            bounds_activity = [(-5.0, 0.0), (0.0, 50.0)]
            
        initial_guess = np.array(isf_rates + icr_rates + basal_rates + x0_activity)
        
        lb = [10.0] * 6 + [3.0] * 6 + [0.1] * 6 + [b[0] for b in bounds_activity]
        ub = [200.0] * 6 + [50.0] * 6 + [5.0] * 6 + [b[1] for b in bounds_activity]
        bounds = Bounds(lb=lb, ub=ub)
        
        # Bootstrap resampling
        for i in range(n_bootstrap):
            if i % 20 == 0:
                self._log(f"   Bootstrap iteration {i}/{n_bootstrap}...")
            
            # Resample windows with replacement
            bootstrap_windows = random.choices(windows, k=len(windows))
            
            try:
                # Use same regularization as main optimization
                lambda_l2 = 0.1
                lambda_smooth = 0.05
                
                result = minimize(
                    fun=self._objective_function,
                    x0=initial_guess,
                    args=(bootstrap_windows, estimate_activity, initial_guess, lambda_l2, lambda_smooth),
                    method='L-BFGS-B',
                    bounds=bounds,
                    options={'maxiter': 500, 'disp': False}
                )
                
                if not result.success:
                    continue
                    
                # Extract results
                for j in range(6):
                    isf_samples[j].append(result.x[0 + j])
                    icr_samples[j].append(result.x[6 + j])
                    basal_samples[j].append(result.x[12 + j])
                
                if estimate_activity:
                    activity_samples['steps_per_minute'].append(result.x[18])
                    activity_samples['hr_spike'].append(result.x[19])
                    
            except Exception:
                continue
        
        # Calculate confidence intervals
        alpha = (1 - confidence_level) / 2
        lower_p = alpha * 100
        upper_p = (1 - alpha) * 100
        
        def get_ci(samples):
            if not samples: return [0.0, 0.0]
            return [float(np.percentile(samples, lower_p)), float(np.percentile(samples, upper_p))]
            
        res = {
            'isf': [get_ci(s) for s in isf_samples],
            'icr': [get_ci(s) for s in icr_samples],
            'basal': [get_ci(s) for s in basal_samples]
        }
        
        if estimate_activity:
            res['activity'] = {
                'steps_per_minute': {
                    'lower': get_ci(activity_samples['steps_per_minute'])[0],
                    'upper': get_ci(activity_samples['steps_per_minute'])[1],
                    'std_error': float(np.std(activity_samples['steps_per_minute'])) if activity_samples['steps_per_minute'] else 0
                },
                'hr_spike': {
                    'lower': get_ci(activity_samples['hr_spike'])[0],
                    'upper': get_ci(activity_samples['hr_spike'])[1],
                    'std_error': float(np.std(activity_samples['hr_spike'])) if activity_samples['hr_spike'] else 0
                }
            }
            
        return res
    

    def _objective_function(
        self, 
        params: np.ndarray, 
        windows: List[TimeWindow],
        estimate_activity: bool = False,
        initial_guess: Optional[np.ndarray] = None,
        lambda_l2: float = 0.0,
        lambda_smooth: float = 0.0
    ) -> float:
        """
        Objective function to minimize: sum of weighted squared prediction errors
        with L2 regularization and smoothness penalties.
        
        Args:
            params: Current parameter values
            windows: Time windows for analysis
            estimate_activity: Whether to estimate activity coefficients
            initial_guess: Initial parameter values for L2 regularization
            lambda_l2: L2 regularization strength (prevents overfitting)
            lambda_smooth: Smoothness penalty strength (encourages gradual transitions)
        """
        # Unpack 18-20 parameters
        isf_rates = params[0:6]
        icr_rates = params[6:12]
        basal_rates = params[12:18]
        
        activity_coeffs = None
        if estimate_activity and len(params) >= 20:
            activity_coeffs = {
                'steps_per_minute': params[18],
                'hr_spike': params[19]
            }
        
        total_error = 0.0
        for idx, window in enumerate(windows):
            predicted = self._predict_glucose_change(
                window, isf_rates, icr_rates, basal_rates, activity_coeffs
            )
            actual = window.glucose_change
            
            # Get weight for this window from stored weights
            weight = self.window_weights[idx] if hasattr(self, 'window_weights') and idx < len(self.window_weights) else 1.0
            
            total_error += weight * (actual - predicted) ** 2
        
        # L2 Regularization: Penalize large deviations from initial guess
        # Helps prevent overfitting on small datasets
        if initial_guess is not None and lambda_l2 > 0:
            regularization = lambda_l2 * np.sum((params - initial_guess) ** 2)
            total_error += regularization
        
        # Smoothness Penalty: Encourage gradual transitions between adjacent time blocks
        # Makes parameters more physiologically plausible
        if lambda_smooth > 0:
            smoothness_penalty = 0.0
            
            # ISF smoothness (blocks 0-5)
            for i in range(5):
                smoothness_penalty += (params[i+1] - params[i]) ** 2
            
            # ICR smoothness (blocks 6-11)
            for i in range(5):
                smoothness_penalty += (params[6+i+1] - params[6+i]) ** 2
            
            # Basal smoothness (blocks 12-17)
            for i in range(5):
                smoothness_penalty += (params[12+i+1] - params[12+i]) ** 2
            
            total_error += lambda_smooth * smoothness_penalty
        
        return total_error
    
    def _predict_glucose_change(
        self,
        window: TimeWindow,
        isf_rates: List[float],
        icr_rates: List[float],
        basal_rates: List[float],
        activity_coeffs: Optional[Dict[str, float]] = None
    ) -> float:
        """
        Predict glucose change for a window given parameters.
        
        Improved Model:
          ΔG = -(net_activity) × ISF + (carb_req) × ISF + (activity_impact)
          
        Where:
          - net_activity = insulin_activity - basal_needed
          - carb_req = carb_absorption / ICR
          - activity_impact = (steps × coeff_steps) + (HR_elev × coeff_hr)
        """
        # Determine block index for this time window (4-hour blocks)
        hour = window.hour_of_day
        block_index = hour // 4  # 0-5
        
        # Get rate parameters for this block
        basal_rate_needed = basal_rates[block_index]
        isf = isf_rates[block_index]
        icr = icr_rates[block_index]
        
        # Net activity (excess insulin activity lowers glucose)
        # window.insulin_activity is the total units actually absorbed in this window
        net_activity = window.insulin_activity - (basal_rate_needed * window.duration_hours)
        
        # Carb effect (grams entering blood needing ICR-equivalent insulin)
        carb_insulin_req = window.carb_absorption / icr
        
        # Activity effect (NEW)
        activity_impact = 0.0
        if activity_coeffs and window.data_quality.get('has_activity_data'):
            # Use raw normalized inputs for regression
            # activity_steps is total steps in window
            # activity_hr_elevation is % above resting (e.g., 0.5 for 50% elevation)
            
            # Convert total steps to steps per minute for the coefficient
            steps_per_min = window.activity_steps / (window.duration_hours * 60) if window.duration_hours > 0 else 0
            
            activity_impact = (
                (steps_per_min * activity_coeffs.get('steps_per_minute', 0)) +
                (window.activity_hr_elevation * activity_coeffs.get('hr_spike', 0))
            )
        
        # Total glucose change
        glucose_change = (
            -(net_activity * isf) +      # Insulin activity lowers glucose
            (carb_insulin_req * isf) +   # Carb absorption raises glucose
            activity_impact              # Activity impact (usually negative for steps, can be positive for HR)
        )
        
        return glucose_change
