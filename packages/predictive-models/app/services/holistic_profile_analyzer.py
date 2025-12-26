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
    
    hour_of_day: int
    is_stable: bool
    has_meals: bool
    has_corrections: bool


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
    
    # Data summary
    windows_analyzed: int
    windows_filtered_out: int
    stable_windows: int
    meal_windows: int
    
    # Diagnostics
    prediction_errors: List[float]
    actual_vs_predicted: List[Dict[str, float]]


class HolisticProfileAnalyzer:
    """
    Estimates ISF, ICR, and 24 basal rates simultaneously
    using non-linear optimization over time windows.
    """
    
    def analyze(
        self, 
        windows: List[Dict[str, Any]]
    ) -> Optional[ProfileAnalysisResult]:
        """
        Perform holistic profile analysis.
        
        Args:
            windows: List of time window dictionaries
            
        Returns:
            ProfileAnalysisResult or None if insufficient data
        """
        if len(windows) < 10:
            return None  # Need at least 10 windows
        
        # Convert to Pydantic models
        try:
            window_objects = [TimeWindow(**w) for w in windows]
        except Exception as e:
            print(f"Error validating windows: {e}")
            return None
        
        # Filter out windows with large unexplained glucose increases
        filtered_windows = self._filter_quality_windows(window_objects)
        
        if len(filtered_windows) < 10:
            print(f"⚠️  Only {len(filtered_windows)} quality windows after filtering (need at least 10)")
            return None
        
        print(f"\n🔧 Optimizing parameters for {len(filtered_windows)} windows...")
        print(f"   (Filtered out {len(window_objects) - len(filtered_windows)} windows with unexplained glucose increases)")
        
        # Initial parameter guesses
        # Initial parameter guesses
        # Now we have 6 blocks for ISF, 6 blocks for ICR, 6 blocks for Basal
        # Total parameters: 18
        
        initial_isf = [50.0] * 6  # mg/dL per unit (6 blocks)
        initial_icr = [10.0] * 6  # grams per unit (6 blocks)
        initial_basal = [1.0] * 6  # U/hr (6 blocks)
        
        # Flatten parameters for optimizer
        # Order: ISF[0-5], ICR[0-5], Basal[0-5]
        x0 = np.array(initial_isf + initial_icr + initial_basal)
        
        # Set bounds
        # ISF: [10, 200]
        # ICR: [3, 50]
        # Basal: [0.1, 5.0]
        bounds = Bounds(
            lb=[10.0] * 6 + [3.0] * 6 + [0.1] * 6,
            ub=[200.0] * 6 + [50.0] * 6 + [5.0] * 6
        )
        
        # Optimize
        result = minimize(
            fun=self._objective_function,
            x0=x0,
            args=(filtered_windows,),
            method='L-BFGS-B',
            bounds=bounds,
            options={'maxiter': 1000, 'disp': True}  # Increased maxiter for more params
        )
        
        # Extract optimized parameters
        # x is length 18
        isf_values = [float(x) for x in result.x[0:6]]
        icr_values = [float(x) for x in result.x[6:12]]
        basal_rates = [float(x) for x in result.x[12:18]]
        
        print(f"\n✅ Optimization complete!")
        print(f"  ISF (avg): {np.mean(isf_values):.2f} mg/dL per unit")
        print(f"  ICR (avg): {np.mean(icr_values):.2f} g per unit")
        print(f"  Basal (avg): {np.mean(basal_rates):.3f} U/hr")
        
        # Calculate metrics
        predictions = []
        errors = []
        actual_vs_pred = []
        
        for window in filtered_windows:
            predicted = self._predict_glucose_change(
                window, isf_values, icr_values, basal_rates
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
        ss_tot = np.sum((np.array([w.glucose_change for w in filtered_windows]) - 
                        np.mean([w.glucose_change for w in filtered_windows])) ** 2)
        r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
        
        # RMSE and MAE
        rmse = np.sqrt(np.mean(np.array(errors) ** 2))
        mae = np.mean(np.abs(errors))
        
        # Calculate confidence intervals using bootstrap
        print(f"\n📊 Calculating confidence intervals via bootstrap...")
        confidence_intervals = self._calculate_confidence_intervals(
            filtered_windows, isf_values, icr_values, basal_rates
        )
        
        return ProfileAnalysisResult(
            estimated_isf=isf_values,
            estimated_icr=icr_values,
            estimated_basal_rates=basal_rates,
            isf_confidence=confidence_intervals['isf'],
            icr_confidence=confidence_intervals['icr'],
            basal_confidence=confidence_intervals['basal'],
            r_squared=float(r_squared),
            rmse=float(rmse),
            mae=float(mae),
            windows_analyzed=len(filtered_windows),
            windows_filtered_out=len(window_objects) - len(filtered_windows),
            stable_windows=len([w for w in filtered_windows if w.is_stable]),
            meal_windows=len([w for w in filtered_windows if w.has_meals]),
            prediction_errors=errors,
            actual_vs_predicted=actual_vs_pred
        )
    


    def _filter_quality_windows(
        self, 
        windows: List[TimeWindow]
    ) -> List[TimeWindow]:
        """
        Filter out windows with large unexplained glucose increases.
        
        These are likely due to unreported or under-reported carbs and
        will negatively affect parameter estimation.
        
        Filtering criteria:
        - If glucose increases >50 mg/dL but carbs < 20g, likely unreported meal
        - If glucose increases >80 mg/dL but carbs < 40g, definitely unreported meal
        - Allow decreases (negative glucose change) regardless of carbs
        """
        filtered = []
        filtered_count = 0
        
        for window in windows:
            # Always allow glucose decreases
            if window.glucose_change < 0:
                filtered.append(window)
                continue
            
            # Check for unexplained increases
            glucose_increase = window.glucose_change
            carbs = window.carbs_consumed
            
            # Heuristic thresholds
            # Roughly: 1g carb raises glucose ~3-5 mg/dL depending on ICR/ISF
            # So 50 mg/dL increase should have at least ~15-20g carbs
            # 80 mg/dL increase should have at least ~25-40g carbs
            
            is_unexplained = False
            
            if glucose_increase > 80 and carbs < 40:
                is_unexplained = True
                filtered_count += 1
            elif glucose_increase > 50 and carbs < 20:
                is_unexplained = True
                filtered_count += 1
            
            if not is_unexplained:
                filtered.append(window)
        
        if filtered_count > 0:
            print(f"   Filtered {filtered_count} windows with unexplained glucose increases")
        
        return filtered
    
    
    def _calculate_confidence_intervals(
        self,
        windows: List[TimeWindow],
        isf_rates: List[float],
        icr_rates: List[float],
        basal_rates: List[float],
        n_bootstrap: int = 100,
        confidence_level: float = 0.95
    ) -> Dict[str, List[List[float]]]:
        """
        Calculate confidence intervals using bootstrap resampling.
        
        Args:
            windows: List of time windows
            isf_rates, icr_rates, basal_rates: Point estimates (lists of 6)
            n_bootstrap: Number of bootstrap samples
            confidence_level: Confidence level (default 95%)
            
        Returns:
            Dict with 'isf', 'icr', 'basal' confidence intervals
            Each is a list of [lower, upper] for each block
        """
        import random
        
        isf_samples = [[] for _ in range(6)]
        icr_samples = [[] for _ in range(6)]
        basal_samples = [[] for _ in range(6)]
        
        # Bootstrap resampling
        for i in range(n_bootstrap):
            if i % 20 == 0:
                print(f"   Bootstrap iteration {i}/{n_bootstrap}...")
            
            # Resample windows with replacement
            bootstrap_windows = random.choices(windows, k=len(windows))
            
            # Re-optimize on bootstrap sample
            initial_guess = np.array(isf_rates + icr_rates + basal_rates)
            bounds = Bounds(
                lb=[10.0] * 6 + [3.0] * 6 + [0.1] * 6,
                ub=[200.0] * 6 + [50.0] * 6 + [5.0] * 6
            )
            
            try:
                result = minimize(
                    fun=self._objective_function,
                    x0=initial_guess,
                    args=(bootstrap_windows,),
                    method='L-BFGS-B',
                    bounds=bounds,
                    options={'maxiter': 200, 'disp': False}
                )
                
                # Extract results
                # x is length 18: ISF[0-5], ICR[0-5], Basal[0-5]
                for j in range(6):
                    isf_samples[j].append(result.x[0 + j])
                    icr_samples[j].append(result.x[6 + j])
                    basal_samples[j].append(result.x[12 + j])
                    
            except:
                continue  # Skip failed optimizations
        
        # Calculate confidence intervals
        alpha = (1 - confidence_level) / 2
        lower_percentile = alpha * 100
        upper_percentile = (1 - alpha) * 100
        
        def compute_ci(samples_list):
            return [
                [
                    float(np.percentile(samples, lower_percentile)),
                    float(np.percentile(samples, upper_percentile))
                ]
                for samples in samples_list
            ]
            
        return {
            'isf': compute_ci(isf_samples),
            'icr': compute_ci(icr_samples),
            'basal': compute_ci(basal_samples)
        }
    

    def _objective_function(
        self, 
        params: np.ndarray, 
        windows: List[TimeWindow]
    ) -> float:
        """
        Objective function to minimize: sum of squared prediction errors
        """
        # Unpack 18 parameters
        isf_rates = params[0:6]
        icr_rates = params[6:12]
        basal_rates = params[12:18]
        
        total_error = 0.0
        for window in windows:
            predicted = self._predict_glucose_change(
                window, isf_rates, icr_rates, basal_rates
            )
            actual = window.glucose_change
            total_error += (actual - predicted) ** 2
        
        return total_error
    
    def _predict_glucose_change(
        self,
        window: TimeWindow,
        isf_rates: List[float],
        icr_rates: List[float],
        basal_rates: List[float]
    ) -> float:
        """
        Predict glucose change for a window given parameters.
        
        Improved Model:
          ΔG = -(net_activity) × ISF + (carb_req) × ISF
          
        Where net_activity = insulin_activity - basal_needed
        And carb_req = carb_absorption / ICR
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
        
        # Total glucose change
        glucose_change = (
            -(net_activity * isf) +      # Insulin activity lowers glucose
            (carb_insulin_req * isf)     # Carb absorption raises glucose
        )
        
        return glucose_change
