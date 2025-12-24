"""
Quick test script for the glucose prediction model WITHOUT needing Python installed.

This creates sample training data and shows the API request format.
"""

import json

# Sample training data
sample_data = {
    "model_name": "glucose_test_model",
    "samples": [
        {
            "status_history": [
                {
                    "glucose": {"sgv": 110, "timestamp": "2025-12-15T09:00:00Z", "direction": "Flat", "trend": 4, "delta5m": 0, "delta10m": 0, "units": "mg/dL", "sensorAge": 72},
                    "iob": {"calculated": {"iob": 1.5, "activity": 0.02}},
                    "cob": {"cob": 15},
                    "pump": {"basal": {"rate": 0.9}},
                    "profile": {"profileData": {"sens": [{"value": 50}], "carbratio": [{"value": 12}], "target_low": [{"value": 100}], "target_high": [{"value": 120}]}},
                    "meta": {"status_date": "2025-12-15T09:00:00Z"}
                },
                {
                    "glucose": {"sgv": 115, "timestamp": "2025-12-15T09:30:00Z", "direction": "FortyFiveUp", "trend": 5, "delta5m": 5, "delta10m": 5, "units": "mg/dL", "sensorAge": 72},
                    "iob": {"calculated": {"iob": 1.3, "activity": 0.015}},
                    "cob": {"cob": 10},
                    "pump": {"basal": {"rate": 0.9}},
                    "profile": {"profileData": {"sens": [{"value": 50}], "carbratio": [{"value": 12}], "target_low": [{"value": 100}], "target_high": [{"value": 120}]}},
                    "meta": {"status_date": "2025-12-15T09:30:00Z"}
                },
                {
                    "glucose": {"sgv": 120, "timestamp": "2025-12-15T10:00:00Z", "direction": "Flat", "trend": 4, "delta5m": 5, "delta10m": 10, "units": "mg/dL", "sensorAge": 72},
                    "iob": {"calculated": {"iob": 1.1, "activity": 0.01}},
                    "cob": {"cob": 5},
                    "pump": {"basal": {"rate": 0.9}},
                    "profile": {"profileData": {"sens": [{"value": 50}], "carbratio": [{"value": 12}], "target_low": [{"value": 100}], "target_high": [{"value": 120}]}},
                    "meta": {"status_date": "2025-12-15T10:00:00Z"}
                }
            ],
            "actual_glucose_60min": 125.0
        }
    ],
    "test_size": 0.2
}

print("Sample API Request to train glucose model:")
print(json.dumps(sample_data, indent=2))

print("\n" + "="*60)
print("To test the API:")
print("1. Start the service:")  
print("   cd PredictiveModelsService")
print("   python -m app.main")
print("\n2. Send POST request to: http://localhost:8000/api/v1/train/glucose")
print("   with the JSON above as the body")
print("\n3. Or use the interactive docs at: http://localhost:8000/docs")
print("="*60)
