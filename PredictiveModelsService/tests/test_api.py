"""API endpoint tests."""

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_check():
    """Test health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "service" in data


def test_root_endpoint():
    """Test root endpoint."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "running"
    assert "name" in data
    assert "version" in data


def test_train_regression_model():
    """Test training a regression model."""
    payload = {
        "model_name": "test_regression",
        "model_type": "regression",
        "data": [
            {"x1": 1.0, "x2": 2.0, "y": 3.0},
            {"x1": 2.0, "x2": 3.0, "y": 5.0},
            {"x1": 3.0, "x2": 4.0, "y": 7.0},
            {"x1": 4.0, "x2": 5.0, "y": 9.0},
            {"x1": 5.0, "x2": 6.0, "y": 11.0},
        ],
        "target_column": "y",
        "parameters": {}
    }
    
    response = client.post("/api/v1/train", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "success"
    assert data["model_name"] == "test_regression"
    assert "metrics" in data


def test_predict_with_model():
    """Test making predictions with a trained model."""
    # First train a model
    train_payload = {
        "model_name": "test_predict",
        "model_type": "regression",
        "data": [
            {"x1": 1.0, "x2": 2.0, "y": 3.0},
            {"x1": 2.0, "x2": 3.0, "y": 5.0},
            {"x1": 3.0, "x2": 4.0, "y": 7.0},
            {"x1": 4.0, "x2": 5.0, "y": 9.0},
            {"x1": 5.0, "x2": 6.0, "y": 11.0},
        ],
        "target_column": "y",
        "parameters": {}
    }
    client.post("/api/v1/train", json=train_payload)
    
    # Now make predictions
    predict_payload = {
        "model_name": "test_predict",
        "data": [
            {"x1": 6.0, "x2": 7.0}
        ]
    }
    
    response = client.post("/api/v1/predict", json=predict_payload)
    assert response.status_code == 200
    data = response.json()
    assert "predictions" in data
    assert len(data["predictions"]) == 1


def test_predict_with_nonexistent_model():
    """Test prediction fails with non-existent model."""
    payload = {
        "model_name": "nonexistent_model",
        "data": [{"x1": 1.0, "x2": 2.0}]
    }
    
    response = client.post("/api/v1/predict", json=payload)
    assert response.status_code == 404


def test_list_models():
    """Test listing available models."""
    response = client.get("/api/v1/models")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
