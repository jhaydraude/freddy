import requests
import json
import os
import sys
import time

# Configuration
API_URL = "http://localhost:8000/api/v1/train/glucose"

def main():
    print("🚀 Starting Glucose Model Training...")
    
    # Check if service is up
    try:
        health = requests.get("http://localhost:8000/health")
        if health.status_code != 200:
            print("❌ Service is not healthy. Please check logs.")
            return
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to service. Is it running on port 8000?")
        return

    # Load training data
    # Look for file in root directory relative to this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.abspath(os.path.join(script_dir, "../../"))
    data_file = os.path.join(root_dir, "glucose_training_clean.json")
    
    print(f"Loading training data from {data_file}...")
    
    try:
        with open(data_file, 'r') as f:
            data = json.load(f)
            
        train_request = data
        print(f"Loaded {len(train_request['samples'])} samples.")
        
        # Send to API
        print(f"Sending data to {API_URL}...")
        start_time = time.time()
        
        response = requests.post(
            API_URL, 
            json=train_request,
            headers={"Content-Type": "application/json"}
        )
        
        duration = time.time() - start_time
        print(f"Request took {duration:.2f} seconds.")
        
        if response.status_code == 200:
            result = response.json()
            print("\n✅ Training successful!")
            print(f"Model ID: {result.get('model_id')}")
            print(f"Training Time: {result.get('training_time_ms')} ms")
            
            metrics = result.get('metrics', {})
            print("\nMetrics:")
            print(f"  RMSE: {metrics.get('rmse', 'N/A')}")
            print(f"  MAE: {metrics.get('mae', 'N/A')}")
            print(f"  R2 Score: {metrics.get('r2', 'N/A')}")
            
            # Print feature importance if available and if it's a dict
            feature_importance = result.get('feature_importance')
            if feature_importance and isinstance(feature_importance, dict):
                print("\nTop 5 Important Features:")
                sorted_features = sorted(feature_importance.items(), key=lambda x: x[1], reverse=True)
                for name, score in sorted_features[:5]:
                    print(f"  {name}: {score:.4f}")
                    
        else:
            print(f"\n❌ Training failed with status code {response.status_code}")
            print(f"Response: {response.text}")
            
    except FileNotFoundError:
        print(f"Error: Data file '{data_file}' not found.")
        print("Please run 'npx tsx scripts/prepare_glucose_training_data.ts' first.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    main()
