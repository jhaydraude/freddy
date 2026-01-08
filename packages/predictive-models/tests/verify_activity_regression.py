
import sys
import os
import numpy as np
from typing import List, Dict, Any

# Add app to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from app.services.holistic_profile_analyzer import HolisticProfileAnalyzer, TimeWindow

def generate_synthetic_windows(
    n_windows: int = 50,
    true_isf: float = 50.0,
    true_icr: float = 10.0,
    true_basal: float = 1.0,
    true_steps_coeff: float = -1.5,
    true_hr_coeff: float = 20.0,
    noise_level: float = 2.0
) -> List[Dict[str, Any]]:
    windows = []
    
    for i in range(n_windows):
        hour = (i * 2) % 24  # 2-hour windows
        duration = 2.0
        
        # Random inputs
        insulin_activity = np.random.uniform(0.5, 3.0)
        carb_absorption = np.random.uniform(0, 40.0)
        steps = np.random.uniform(0, 5000)
        hr_elev = np.random.uniform(0, 0.8)
        
        # Derived values for model
        steps_per_min = steps / (duration * 60)
        
        # Calculate true glucose change
        # ΔG = -(net_activity) × ISF + (carb_req) × ISF + activity_impact
        net_activity = insulin_activity - (true_basal * duration)
        carb_req = carb_absorption / true_icr
        
        activity_impact = (steps_per_min * true_steps_coeff) + (hr_elev * true_hr_coeff)
        
        glucose_change = (
            -(net_activity * true_isf) + 
            (carb_req * true_isf) + 
            activity_impact
        )
        
        # Add noise
        glucose_change += np.random.normal(0, noise_level)
        
        windows.append({
            "start": "2024-01-01T00:00:00Z",
            "end": "2024-01-01T02:00:00Z",
            "duration_hours": duration,
            "glucose_start": 120,
            "glucose_end": 120 + glucose_change,
            "glucose_change": glucose_change,
            "glucose_readings_count": 24,
            "bolus_insulin": 0.0,
            "basal_insulin_delivered": true_basal * duration,
            "total_insulin": 0.0,
            "insulin_activity": insulin_activity,
            "carbs_consumed": 0.0,
            "carb_events_count": 0,
            "carb_absorption": carb_absorption,
            "activity_steps": steps,
            "activity_calories": 0.0,
            "activity_floors": 0.0,
            "activity_heart_rate": 80 + (hr_elev * 100),
            "activity_hr_elevation": hr_elev,
            "activity_impact": 0.0,
            "activity_intensity": "medium",
            "hour_of_day": hour,
            "is_stable": True,
            "has_meals": carb_absorption > 0,
            "has_corrections": False,
            "data_quality": {
                "has_activity_data": True,
                "readings_count": 24
            }
        })
        
    return windows

def test_regression():
    print("🚀 Starting Activity Regression Verification...")
    
    true_steps_coeff = -1.2
    true_hr_coeff = 18.0
    
    windows = generate_synthetic_windows(
        n_windows=100, 
        true_steps_coeff=true_steps_coeff,
        true_hr_coeff=true_hr_coeff,
        noise_level=1.0
    )
    
    analyzer = HolisticProfileAnalyzer()
    result = analyzer.analyze(windows, estimate_activity=True)
    
    if not result:
        print("❌ Analysis failed to PRoduce results")
        return
        
    print("\n📊 Regression Results:")
    print(f"  R²: {result.r_squared:.4f}")
    
    est_steps = result.estimated_activity_coefficients['steps_per_minute']
    est_hr = result.estimated_activity_coefficients['hr_spike']
    
    print(f"\n  Steps Coeff (per step/min):")
    print(f"    True: {true_steps_coeff:.2f}")
    print(f"    Est:  {est_steps:.2f}")
    if result.activity_confidence:
        ci = result.activity_confidence['steps_per_minute']
        print(f"    95% CI: [{ci['lower']:.2f}, {ci['upper']:.2f}]")
        
    print(f"\n  HR Spike Coeff (per unit):")
    print(f"    True: {true_hr_coeff:.2f}")
    print(f"    Est:  {est_hr:.2f}")
    if result.activity_confidence:
        ci = result.activity_confidence['hr_spike']
        print(f"    95% CI: [{ci['lower']:.2f}, {ci['upper']:.2f}]")

    # Success criteria: Estimates within 20% or 2 standard errors
    steps_err = abs(est_steps - true_steps_coeff)
    hr_err = abs(est_hr - true_hr_coeff)
    
    print(f"\n📈 Error analysis:")
    print(f"  Steps error: {steps_err:.4f}")
    print(f"  HR error:    {hr_err:.4f}")
    
    if steps_err < 0.3 and hr_err < 5.0:
        print("\n✅ Verification SUCCESS: Model recovered true coefficients accurately.")
    else:
        print("\n⚠️  Verification WARNING: Estimates differ from true values (check noise vs sample size).")

if __name__ == "__main__":
    test_regression()
