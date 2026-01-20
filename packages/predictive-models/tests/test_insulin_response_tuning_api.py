import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_tune_insulin_response_endpoint():
    # Mock request data
    request_data = {
        "windows": [
            {
                "start": "2026-01-01T00:00:00Z",
                "end": "2026-01-01T02:00:00Z",
                "duration_hours": 2.0,
                "glucose_start": 120,
                "glucose_end": 100,
                "glucose_change": -20,
                "glucose_readings_count": 24,
                "bolus_insulin": 0,
                "basal_insulin_delivered": 0,
                "total_insulin": 0.4,
                "insulin_activity": 0.4,
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
                "hour_of_day": 0,
                "is_stable": True,
                "has_meals": False,
                "has_corrections": True,
                "data_quality": {"overall": 1.0}
            }
        ] * 20, # Need some windows or it returns None
        "current_dia": 5.0,
        "current_peak": 45.0,
        "current_isf": [50.0, 50.0, 50.0, 50.0, 50.0, 50.0],
        "optimize_dia": True,
        "optimize_peak": True,
        "optimize_isf": True
    }
    
    response = client.post("/api/v1/tune/insulin-response", json=request_data)
    
    assert response.status_code == 200
    data = response.json()
    
    assert "dia" in data
    assert "peak" in data
    assert "isf" in data
    assert "dia_confidence" in data
    assert "r_squared" in data
    assert data["windows_analyzed"] == 20

def test_tune_insulin_response_invalid_input():
    # Test with invalid ISF array length
    request_data = {
        "windows": [{"valid": "dummy"}] * 20, # Provide windows so we bypass the "no windows" check
        "current_dia": 5.0,
        "current_peak": 45.0,
        "current_isf": [50.0] * 5, # Should be 6
        "optimize_dia": True
    }
    
    response = client.post("/api/v1/tune/insulin-response", json=request_data)
    # This should now fail schema validation
    assert response.status_code == 422 

def test_tune_insulin_response_no_data():
    request_data = {
        "windows": [],
        "current_dia": 5.0,
        "current_peak": 45.0,
        "current_isf": [50.0] * 6
    }
    
    response = client.post("/api/v1/tune/insulin-response", json=request_data)
    # The router handles None result from optimizer by raising 400
    assert response.status_code == 400
    assert "No time windows provided" in response.json()["detail"]
