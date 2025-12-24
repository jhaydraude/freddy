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
    
    carbs_consumed: float
    carb_events_count: int
    
    hour_of_day: int
    is_stable: bool
    has_meals: bool
    has_corrections: bool


class ProfileAnalysisResult(BaseModel):
    """Results from holistic profile analysis"""
    estimated_isf: float
    estimated_icr: float
    estimated_basal_rates: List[float]  # 6 four-hour blocks
    
    # Confidence intervals (95% by default)
    isf_confidence: List[float]  # [lower, upper]
    icr_confidence: List[float]  # [lower, upper]
    basal_confidence: List[List[float]]  # [[lower, upper] for each block]
    
    # Confidence metrics
    r_squared: float
    rmse: float
    mae: float
    
    # Data summary
    windows_analyzed: int
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
        initial_isf = 50.0  # mg/dL per unit
        initial_icr = 10.0  # grams per unit
        initial_basal = [1.0] * 6  # U/hr for each 4-hour block
        
        # Flatten parameters for optimizer
        x0 = np.array([initial_isf, initial_icr] + initial_basal)
        
        # Set bounds
        bounds = Bounds(
            lb=[10, 3] + [0.1] * 6,   # Lower bounds
            ub=[200, 50] + [5.0] * 6   # Upper bounds
        )
        
        # Optimize
        result = minimize(
            fun=self._objective_function,
            x0=x0,
            args=(filtered_windows,),
            method='L-BFGS-B',
            bounds=bounds,
            options={'maxiter': 500, 'disp': True}
        )
        
        # Extract optimized parameters
        isf = float(result.x[0])
        icr = float(result.x[1])
        basal_rates = [float(x) for x in result.x[2:8]]  # 6 blocks
        
        print(f"\n✅ Optimization complete!")
        print(f"  ISF: {isf:.2f} mg/dL per unit")
        print(f"  ICR: {icr:.2f} g per unit")
        print(f"  Basal (avg): {np.mean(basal_rates):.3f} U/hr")
        
        # Calculate metrics
        predictions = []
        errors = []
        actual_vs_pred = []
        
        for window in filtered_windows:
            predicted = self._predict_glucose_change(
                window, isf, icr, basal_rates
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
            filtered_windows, isf, icr, basal_rates
        )
        
        return ProfileAnalysisResult(
            estimated_isf=isf,
            estimated_icr=icr,
            estimated_basal_rates=basal_rates,
            isf_confidence=confidence_intervals['isf'],
            icr_confidence=confidence_intervals['icr'],
            basal_confidence=confidence_intervals['basal'],
            r_squared=float(r_squared),
            rmse=float(rmse),
            mae=float(mae),
            windows_analyzed=len(filtered_windows),
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
        isf: float,
        icr: float,
        basal_rates: List[float],
        n_bootstrap: int = 100,
        confidence_level: float = 0.95
    ) -> Dict[str, List[float]]:
        """
        Calculate confidence intervals using bootstrap resampling.
        
        Args:
            windows: List of time windows
            isf, icr, basal_rates: Point estimates
            n_bootstrap: Number of bootstrap samples
            confidence_level: Confidence level (default 95%)
            
        Returns:
            Dict with 'isf', 'icr', 'basal' confidence intervals [lower, upper]
        """
        import random
        
        isf_samples = []
        icr_samples = []
        basal_samples = [[] for _ in range(6)]
        
        # Bootstrap resampling
        for i in range(n_bootstrap):
            if i % 20 == 0:
                print(f"   Bootstrap iteration {i}/{n_bootstrap}...")
            
            # Resample windows with replacement
            bootstrap_windows = random.choices(windows, k=len(windows))
            
            # Re-optimize on bootstrap sample
            initial_guess = np.array([isf, icr] + basal_rates)
            bounds = Bounds(
                lb=[10, 3] + [0.1] * 6,
                ub=[200, 50] + [5.0] * 6
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
                
                isf_samples.append(result.x[0])
                icr_samples.append(result.x[1])
                for j in range(6):
                    basal_samples[j].append(result.x[2 + j])
            except:
                continue  # Skip failed optimizations
        
        # Calculate confidence intervals
        alpha = (1 - confidence_level) / 2
        lower_percentile = alpha * 100
        upper_percentile = (1 - alpha) * 100
        
        return {
            'isf': [
                float(np.percentile(isf_samples, lower_percentile)),
                float(np.percentile(isf_samples, upper_percentile))
            ],
            'icr': [
                float(np.percentile(icr_samples, lower_percentile)),
                float(np.percentile(icr_samples, upper_percentile))
            ],
            'basal': [
                [
                    float(np.percentile(basal_samples[i], lower_percentile)),
                    float(np.percentile(basal_samples[i], upper_percentile))
                ]
                for i in range(6)
            ]
        }
    

    def _objective_function(
        self, 
        params: np.ndarray, 
        windows: List[TimeWindow]
    ) -> float:
        """
        Objective function to minimize: sum of squared prediction errors
        """
        isf = params[0]
        icr = params[1]
        basal_rates = params[2:26]
        
        total_error = 0.0
        for window in windows:
            predicted = self._predict_glucose_change(
                window, isf, icr, basal_rates
            )
            actual = window.glucose_change
            total_error += (actual - predicted) ** 2
        
        return total_error
    
    def _predict_glucose_change(
        self,
        window: TimeWindow,
        isf: float,
        icr: float,
        basal_rates: List[float]
    ) -> float:
        """
        Predict glucose change for a window given parameters.
        
        Model:
          ΔG = -(net_insulin) × ISF + (carbs/ICR) × ISF
          
        Where net_insulin = bolus + basal_delivered - basal_needed
        """
        # Get basal rate for this 4-hour block
        # Blocks: 0-3hr, 4-7hr, 8-11hr, 12-15hr, 16-19hr, 20-23hr
        hour = window.hour_of_day
        block_index = hour // 4  # 0-5
        basal_rate_needed = basal_rates[block_index]
        
        # Net insulin effect (excess insulin lowers glucose)
        net_insulin = (
            window.bolus_insulin + 
            window.basal_insulin_delivered - 
            (basal_rate_needed * window.duration_hours)
        )
        
        # Carb effect (raises glucose, needs insulin to cover)
        carb_insulin_needed = window.carbs_consumed / icr
        
        # Total glucose change
        glucose_change = (
            -(net_insulin * isf) +      # Insulin lowers glucose
            (carb_insulin_needed * isf)  # Carbs raise glucose
        )
        
        return glucose_change
