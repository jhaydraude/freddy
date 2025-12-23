"""Tests for glucose prediction functionality."""

import pytest
from datetime import datetime, timedelta

from app.services.glucose_predictor import GlucoseFeatureExtractor, prepare_training_data
from app.services.glucose_model_service import GlucoseModelService
from app.models.glucose_schemas import (
    GlucoseTrainRequest,
    GlucoseTrainingSample,
    GlucosePredictRequest
)


def create_mock_status(glucose_value: float, timestamp: datetime, iob: float = 1.0, cob: float = 10.0):
    """Create a mock IStatusResult for testing."""
    return {
        "glucose": {
            "sgv": glucose_value,
            "timestamp": timestamp.isoformat(),
            "direction": "Flat",
            "trend": 4,
            "delta5m": 0.0,
            "delta10m": 0.0,
            "units": "mg/dL",
            "sensorAge": 72,
            "device": "test-device"
        },
        "iob": {
            "calculated": {
                "iob": iob,
                "activity": 0.01
            },
            "reported": None,
            "timestamp": timestamp.isoformat()
        },
        "cob": {
            "cob": cob,
            "timestamp": timestamp.isoformat()
        },
        "pump": {
            "basal": {
                "rate": 0.85,
                "treatment": {}
            },
            "pumpAge": 72,
            "reservoir": 150,
            "status": {}
        },
        "profile": {
            "activeProfileName": "Default",
            "profileData": {
                "sens": [{"value": 50}],
                "carbratio": [{"value": 12}],
                "target_low": [{"value": 100}],
                "target_high": [{"value": 120}]
            }
        },
        "uploader": {
            "battery": 85,
            "device": "phone"
        },
        "meta": {
            "status_date": timestamp.isoformat(),
            "created_date": datetime.utcnow().isoformat(),
            "app": "NightManage"
        }
    }


def test_feature_extraction():
    """Test feature extraction from status_history."""
    # Create mock status history (60 minutes, 5-minute intervals)
    start_time = datetime.utcnow() - timedelta(minutes=60)
    status_history = []
    
    for i in range(13):  # 0, 5, 10, ... 60 minutes
        ts = start_time + timedelta(minutes=i * 5)
        glucose = 120 + i * 2  # Gradually rising glucose
        status_history.append(create_mock_status(glucose, ts, iob=1.5 - (i * 0.05)))
    
    # Extract features
    extractor = GlucoseFeatureExtractor()
    features = extractor.extract_features(status_history)
    
    # Verify key features
    assert 'current_glucose' in features
    assert features['current_glucose'] == 144.0  # Last value
    assert 'glucose_trend_slope' in features
    assert features['glucose_trend_slope'] > 0  # Should detect rising trend
    assert 'iob' in features
    assert 'cob' in features
    assert 'basal_rate' in features
    assert features['basal_rate'] == 0.85
    
    # Verify all expected features
    expected_features = extractor.get_feature_names()
    for feature_name in expected_features:
        assert feature_name in features, f"Missing feature: {feature_name}"


def test_prepare_training_data():
    """Test preparation of training data."""
    # Create mock training samples
    samples = []
    base_time = datetime.utcnow()
    
    for sample_idx in range(5):
        status_history = []
        start_glucose = 100 + sample_idx * 10
        
        for i in range(13):
            ts = base_time + timedelta(minutes=sample_idx * 100 + i * 5)
            glucose = start_glucose + i
            status_history.append(create_mock_status(glucose, ts))
        
        samples.append({
            'status_history': status_history,
            'actual_glucose_60min': start_glucose + 20  # Glucose 60min later
        })
    
    # Prepare training data
    X, y = prepare_training_data(samples)
    
    # Verify shapes
    assert len(X) == 5
    assert len(y) == 5
    assert len(X.columns) == 20  # 20 features
    
    # Verify feature names
    extractor = GlucoseFeatureExtractor()
    expected_features = extractor.get_feature_names()
    assert list(X.columns) == expected_features


@pytest.mark.asyncio
async def test_glucose_model_training():
    """Test glucose model training."""
    # Create synthetic training data
    samples = []
    base_time = datetime.utcnow()
    
    for sample_idx in range(20):  # Need at least 10 samples
        status_history = []
        start_glucose = 80 + sample_idx * 5
        
        for i in range(13):
            ts = base_time + timedelta(minutes=sample_idx * 100 + i * 5)
            glucose = start_glucose + i * 0.5
            iob = 2.0 - (i * 0.1)
            cob = 30.0 - (i * 2)
            status_history.append(create_mock_status(glucose, ts, iob, cob))
        
        # Simple prediction: glucose will continue trend
        actual_60min = start_glucose + 15 + (sample_idx % 3) * 5
        
        samples.append(
            GlucoseTrainingSample(
                status_history=status_history,
                actual_glucose_60min=actual_60min
            )
        )
    
    # Create training request
    request = GlucoseTrainRequest(
        model_name="test_glucose_model",
        samples=samples,
        test_size=0.2
    )
    
    # Train model
    service = GlucoseModelService()
    response = await service.train(request)
    
    # Verify response
    assert response.status == "success"
    assert response.model_name == "test_glucose_model"
    assert "test_mae" in response.metrics
    assert "test_rmse" in response.metrics
    assert "test_r2" in response.metrics
    assert response.feature_importance is not None
    assert len(response.feature_importance) > 0
    

@pytest.mark.asyncio
async def test_glucose_prediction():
    """Test glucose prediction."""
    # First train a model (reuse training logic)
    samples = []
    base_time = datetime.utcnow()
    
    for sample_idx in range(20):
        status_history = []
        start_glucose = 80 + sample_idx * 5
        
        for i in range(13):
            ts = base_time + timedelta(minutes=sample_idx * 100 + i * 5)
            glucose = start_glucose + i * 0.5
            status_history.append(create_mock_status(glucose, ts))
        
        samples.append(
            GlucoseTrainingSample(
                status_history=status_history,
                actual_glucose_60min=start_glucose + 15
            )
        )
    
    train_request = GlucoseTrainRequest(
        model_name="test_prediction_model",
        samples=samples,
        test_size=0.2
    )
    
    service = GlucoseModelService()
    await service.train(train_request)
    
    # Now make a prediction
    test_status_history = []
    current_time = datetime.utcnow()
    for i in range(13):
        ts = current_time + timedelta(minutes=i * 5)
        glucose = 120 + i * 0.3
        test_status_history.append(create_mock_status(glucose, ts))
    
    predict_request = GlucosePredictRequest(
        model_name="test_prediction_model",
        status_history=test_status_history
    )
    
    # Make prediction
    response = await service.predict(predict_request)
    
    # Verify response
    assert response.model_name == "test_prediction_model"
    assert response.predicted_glucose_60min > 0
    assert response.current_glucose > 0
    assert 'current_glucose' in response.features_used
    assert len(response.features_used) == 20


def test_invalid_status_history():
    """Test error handling with invalid status_history."""
    extractor = GlucoseFeatureExtractor()
    
    # Empty status history
    with pytest.raises(ValueError, match="cannot be empty"):
        extractor.extract_features([])
    
    # Status history with no glucose data
    invalid_status = [{"meta": {"status_date": datetime.utcnow().isoformat()}}]
    with pytest.raises(ValueError, match="No valid glucose"):
        extractor.extract_features(invalid_status)
