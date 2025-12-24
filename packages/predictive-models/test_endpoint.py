"""
Quick test script to verify the profile training endpoint is accessible
"""
import requests
import json

def test_training_endpoint():
    """Test that the training endpoint is available and accepts requests"""
    url = "http://localhost:8000/api/v1/train/profile"
    
    # Create minimal test data (this won't actually train, just verify the endpoint)
    test_data = {
        "model_name": "test_model",
        "samples": [],  # Empty samples - will fail but proves endpoint works
        "test_size": 0.2
    }
    
    try:
        response = requests.post(url, json=test_data, timeout=5)
        print(f"Endpoint status: {response.status_code}")
        print(f"Response: {response.text[:200]}")
        
        if response.status_code == 400:
            print("\n✅ Endpoint is accessible (400 = validation error as expected with empty samples)")
            return True
        elif response.status_code == 200:
            print("\n✅ Endpoint is accessible and responded successfully")
            return True
        else:
            print(f"\n❌ Unexpected status code: {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"\n❌ Connection error: {e}")
        return False

if __name__ == "__main__":
    print("Testing profile training endpoint...")
    test_training_endpoint()
