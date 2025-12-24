# Predictive Models Microservice

A FastAPI-based microservice for training and serving machine learning models.

## Features

- 🚀 **Fast API**: Built with FastAPI for high performance and automatic API documentation
- 🤖 **Model Training**: RESTful endpoint for training models
- 🔮 **Predictions**: RESTful endpoint for making predictions
- 📦 **Model Registry**: Simple file-based model storage and versioning
- 🐳 **Docker Ready**: Containerized for easy deployment
- 📚 **Auto Documentation**: Interactive API docs at `/docs`

## Project Structure

```
PredictiveModelsService/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI application entry point
│   ├── config.py            # Configuration settings
│   ├── models/              # Pydantic models for request/response
│   │   ├── __init__.py
│   │   └── schemas.py
│   ├── routers/             # API route handlers
│   │   ├── __init__.py
│   │   ├── train.py
│   │   └── predict.py
│   ├── services/            # Business logic
│   │   ├── __init__.py
│   │   └── model_service.py
│   └── utils/               # Utility functions
│       ├── __init__.py
│       └── logging.py
├── models/                  # Stored trained models
├── tests/                   # Test files
├── Dockerfile
├── requirements.txt
├── .env.example
├── .gitignore
└── README.md
```

## Quick Start

### Easy Start (Recommended)

**Windows:**
```bash
cd PredictiveModelsService
start.bat
```

**Linux/Mac:**
```bash
cd PredictiveModelsService
chmod +x start.sh
./start.sh
```

This will:
- Create a virtual environment (if needed)
- Install dependencies
- Start the service on http://localhost:8000

### Local Development (Manual)

1. **Create a virtual environment**:
   ```bash
   python -m venv venv
   venv\Scripts\activate  # On Windows
   # source venv/bin/activate  # On Linux/Mac
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up environment variables**:
   ```bash
   copy .env.example .env
   # Edit .env with your configuration
   ```

4. **Run the server**:
   ```bash
   python -m app.main
   # Or with auto-reload:
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

5. **Access the API**:
   - API: http://localhost:8000
   - Interactive Docs: http://localhost:8000/docs
   - Alternative Docs: http://localhost:8000/redoc

### Docker Deployment

1. **Build the image**:
   ```bash
   docker build -t predictive-models-service .
   ```

2. **Run the container**:
   ```bash
   docker run -p 8000:8000 -v $(pwd)/models:/app/models predictive-models-service
   ```

## API Endpoints

### Health Check

```http
GET /health
```

Returns the service health status.

### Train Model

```http
POST /api/v1/train
Content-Type: application/json

{
  "model_name": "my_model",
  "model_type": "regression",
  "data": [...],
  "parameters": {
    "param1": "value1"
  }
}
```

### Make Prediction

```http
POST /api/v1/predict
Content-Type: application/json

{
  "model_name": "my_model",
  "data": [...]
}
```

### List Models

```http
GET /api/v1/models
```

Returns a list of all available trained models.

## Configuration

Configuration is managed through environment variables. See `.env.example` for available options:

- `APP_NAME`: Application name
- `APP_VERSION`: Application version
- `LOG_LEVEL`: Logging level (DEBUG, INFO, WARNING, ERROR)
- `MODEL_STORAGE_PATH`: Path to store trained models

## Development

### Adding a New Model Type

1. Update `app/services/model_service.py` with your model logic
2. Add model-specific parameters to `app/models/schemas.py`
3. Update the training logic in `app/routers/train.py`

### Running Tests

```bash
pytest tests/
```

## License

MIT
