import requests
import json
import os
import sys

# Configuration
API_URL = "http://localhost:8000/api/v1/predict/glucose"

def main():
    print("🚀 Testing Glucose Model Prediction...")
    
    # Load a sample from training data
    # Look for file in root directory relative to this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.abspath(os.path.join(script_dir, "../../"))
    data_file = os.path.join(root_dir, "glucose_training_clean.json")
    
    try:
        with open(data_file, 'r') as f:
            data = json.load(f)
            
        if not data.get('samples'):
            print("No samples found in data file.")
            return
            
        # Use the first sample for prediction
        sample = data['samples'][0]
        
        # Construct prediction request
        predict_request = {
            "model_name": "glucose_predictor", # Default name used in training
            "status_history": sample['status_history']
        }
        
        print(f"Sending prediction request for time: {sample['training_point']}")
        print(f"Actual Value (Target): {sample['actual_glucose_60min']} mg/dL")
        
        response = requests.post(API_URL, json=predict_request)
        
        if response.status_code == 200:
            result = response.json()
            print("\n✅ Prediction successful!")
            print(f"Predicted Glucose (60min): {result['predicted_glucose_60min']:.1f} mg/dL")
            
            # Calculate error
            actual = sample['actual_glucose_60min']
            predicted = result['predicted_glucose_60min']
            error = predicted - actual
            print(f"Error: {error:.1f} mg/dL")
            
            print(f"\nAnalysis: {result.get('analysis', 'No analysis provided')}")
            
            if result.get('feature_contribution'):
                print("\nTop Contributing Features:")
                sorted_features = sorted(result['feature_contribution'].items(), key=lambda x: abs(x[1]), reverse=True)
                for name, score in sorted_features[:5]:
                    print(f"  {name}: {score:.4f}")
        else:
            print(f"\n❌ Prediction failed: {response.status_code}")
            print(response.text)
            
    except FileNotFoundError:
        print(f"Error: Data file '{data_file}' not found.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
