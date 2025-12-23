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
    estimated_basal_rates: List[float]  # 24 hourly rates
    
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
        
        print(f"\n🔧 Optimizing parameters for {len(window_objects)} windows...")
        
        # Initial parameter guesses
        initial_isf = 50.0  # mg/dL per unit
        initial_icr = 10.0  # grams per unit
        initial_basal = [1.0] * 24  # U/hr for each hour
        
        # Flatten parameters for optimizer
        x0 = np.array([initial_isf, initial_icr] + initial_basal)
        
        # Set bounds
        bounds = Bounds(
            lb=[10, 3] + [0.1] * 24,   # Lower bounds
            ub=[200, 50] + [5.0] * 24   # Upper bounds
        )
        
        # Optimize
        result = minimize(
            fun=self._objective_function,
            x0=x0,
            args=(window_objects,),
            method='L-BFGS-B',
            bounds=bounds,
            options={'maxiter': 500, 'disp': True}
        )
        
        # Extract optimized parameters
        isf = float(result.x[0])
        icr = float(result.x[1])
        basal_rates = [float(x) for x in result.x[2:26]]
        
        print(f"\n✅ Optimization complete!")
        print(f"  ISF: {isf:.2f} mg/dL per unit")
        print(f"  ICR: {icr:.2f} g per unit")
        print(f"  Basal (avg): {np.mean(basal_rates):.3f} U/hr")
        
        # Calculate metrics
        predictions = []
        errors = []
        actual_vs_pred = []
        
        for window in window_objects:
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
        ss_tot = np.sum((np.array([w.glucose_change for w in window_objects]) - 
                        np.mean([w.glucose_change for w in window_objects])) ** 2)
        r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
        
        # RMSE and MAE
        rmse = np.sqrt(np.mean(np.array(errors) ** 2))
        mae = np.mean(np.abs(errors))
        
        return ProfileAnalysisResult(
            estimated_isf=isf,
            estimated_icr=icr,
            estimated_basal_rates=basal_rates,
            r_squared=float(r_squared),
            rmse=float(rmse),
            mae=float(mae),
            windows_analyzed=len(window_objects),
            stable_windows=len([w for w in window_objects if w.is_stable]),
            meal_windows=len([w for w in window_objects if w.has_meals]),
            prediction_errors=errors,
            actual_vs_predicted=actual_vs_pred
        )
    
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
        # Get basal rate for this hour
        hour = window.hour_of_day
        basal_rate_needed = basal_rates[hour]
        
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
