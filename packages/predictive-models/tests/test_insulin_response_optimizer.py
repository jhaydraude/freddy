import pytest
import numpy as np
from datetime import datetime, timedelta
from app.services.insulin_response_optimizer import InsulinResponseOptimizer

def generate_test_windows(num_windows=48, base_dia=5.0, base_peak=45, base_isf=60):
    """
    Generates synthetic time windows for testing the optimizer.
    """
    windows = []
    start_time = datetime.now() - timedelta(days=num_windows/12)
    
    for i in range(num_windows):
        window_start = start_time + timedelta(hours=i*2)
        window_end = window_start + timedelta(hours=2)
        
        # Vary insulin activity to provide "signal" for R-squared calculation
        # We deliver between 2.2 and 5.0 units. Basal needed is 2.0 (1.0/hr * 2hr).
        # So net activity varies between 0.2 and 3.0 units.
        insulin_activity = 2.2 + (i % 5) * 0.7 
        net_activity = insulin_activity - 2.0 # Optimizer hardcodes basal_needed=1.0/hr
        
        # Predicted change should be -ISF * net_activity
        actual_change = -base_isf * net_activity
        
        # Add some noise
        actual_change += np.random.normal(0, 1.0)
        
        window = {
            "start": window_start.isoformat(),
            "end": window_end.isoformat(),
            "duration_hours": 2.0,
            "glucose_start": 120,
            "glucose_end": 120 + actual_change,
            "glucose_change": actual_change,
            "glucose_readings_count": 24,
            "bolus_insulin": 0,
            "basal_insulin_delivered": 0,
            "total_insulin": 0,
            "insulin_activity": insulin_activity,
            "carbs_consumed": 0,
            "carb_events_count": 0,
            "carb_absorption": 0,
            "activity_steps": 0,
            "activity_calories": 0,
            "activity_floors": 0,
            "activity_heart_rate": 0,
            "activity_hr_elevation": 0,
            "activity_impact": 0,
            "activity_intensity": "low",
            "hour_of_day": window_start.hour,
            "is_stable": True,
            "has_meals": False,
            "has_corrections": True,
            "data_quality": {"overall": 1.0, "readings": 1.0}
        }
        windows.append(window)
        
    return windows

def test_optimizer_basic():
    optimizer = InsulinResponseOptimizer()
    
    # Generate data with known ISF=60
    windows = generate_test_windows(num_windows=100, base_isf=60)
    
    result = optimizer.analyze_insulin_response(
        windows=windows,
        current_dia=5.0,
        current_peak=45.0,
        current_isf=[50.0] * 6
    )
    
    assert result is not None
    assert result.r_squared > 0.5
    # The optimized ISF should be closer to 60 than the initial 50
    assert np.mean(result.isf) > 55
    assert result.dia > 3 and result.dia < 8
    assert result.peak > 30 and result.peak < 75

def test_optimizer_no_data():
    optimizer = InsulinResponseOptimizer()
    
    # Empty windows
    result = optimizer.analyze_insulin_response(
        windows=[],
        current_dia=5.0,
        current_peak=45.0,
        current_isf=[50.0] * 6
    )
    
    assert result is None

def test_optimizer_noisy_data():
    optimizer = InsulinResponseOptimizer()
    
    # Generate data with extreme noise
    windows = generate_test_windows(num_windows=50, base_isf=60)
    for w in windows:
        w["glucose_change"] += np.random.normal(0, 100) # Gigantic noise
        
    result = optimizer.analyze_insulin_response(
        windows=windows,
        current_dia=5.0,
        current_peak=45.0,
        current_isf=[50.0] * 6
    )
    
    # Should still return a result due to regularization, but R² will be low
    assert result is not None
    assert result.r_squared < 0.5
