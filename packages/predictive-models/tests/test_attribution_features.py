import sys
import os
from datetime import datetime

# Add app to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.services.glucose_predictor import GlucoseFeatureExtractor

def test_attribution_features():
    print("--- Testing Attribution Feature Extraction ---")
    
    # Mock status history with attribution
    mock_status = {
        'meta': {'status_date': datetime.now().isoformat()},
        'glucose': {'sgv': 150.0},
        'iob': {'calculated': {'iob': 1.0, 'activity': 0.01}},
        'cob': {'cob': 20.0},
        'pump': {'basal': {'rate': 0.5}},
        'profile': {'profileData': {'sens': [{'value': 50}], 'carbratio': [{'value': 10}]}},
        'attribution': {
            'timeframes': [
                {
                    'minutes': 30,
                    'components': {
                        'unexplained': 15.0,
                        'insulin': {'value': -5.0},
                        'carbs': {'value': 10.0},
                        'basal': {'value': -2.0}
                    }
                }
            ]
        }
    }
    
    history = [mock_status]
    
    extractor = GlucoseFeatureExtractor()
    features = extractor.extract_features(history)
    
    expected_features = [
        'unexplained_30m',
        'insulin_impact_30m',
        'carb_impact_30m',
        'basal_impact_30m'
    ]
    
    print("Extracted Features:")
    all_found = True
    for feat in expected_features:
        val = features.get(feat)
        print(f"  - {feat}: {val}")
        if val is None:
            all_found = False
            
    if all_found and features['unexplained_30m'] == 15.0:
        print("\n✅ Attribution features correctly extracted!")
    else:
        print("\n❌ Attribution features missing or incorrect.")

if __name__ == "__main__":
    test_attribution_features()
