import requests
import json

API_URL = "http://localhost:8000/api/v1/train/glucose/models"

def main():
    print("Fetching available glucose models...")
    try:
        response = requests.get(API_URL)
        if response.status_code == 200:
            models = response.json()
            print(f"\nFound {len(models)} models:")
            for model in models:
                print(f"\nModel ID: {model['id']}")
                print(f"Created: {model['created_at']}")
                metrics = model.get('metrics', {})
                print("Metrics:")
                print(f"  RMSE: {metrics.get('rmse', 'N/A')}")
                print(f"  MAE: {metrics.get('mae', 'N/A')}")
                print(f"  R2: {metrics.get('r2', 'N/A')}")
        else:
            print(f"Failed to list models: {response.status_code}")
            print(response.text)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
