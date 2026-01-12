# Predictive Models Microservice

A FastAPI-based microservice for training and serving machine learning models for blood glucose prediction and profile optimization.

## Features

- 🚀 **Fast API**: Built with FastAPI for high performance and automatic API documentation
- 🤖 **Model Training**: RESTful endpoint for training models (XGBoost)
- 🔮 **Predictions**: RESTful endpoint for making predictions
- 📦 **Model Registry**: Simple file-based model storage and versioning
- 🐳 **Docker Ready**: Containerized for easy deployment
- 📚 **Auto Documentation**: Interactive API docs at `/docs`

## Project Structure

```
packages/predictive-models/
├── app/
│   ├── main.py              # FastAPI application entry point
│   ├── config.py            # Configuration settings
│   ├── models/              # Pydantic models (Pydantic v2)
│   ├── routers/             # API route handlers
│   └── services/            # Business logic (ModelService, GlucoseModelService)
├── models/                  # Stored trained models (.joblib)
├── tests/                   # Test files (pytest)
├── scripts/                 # Training and utility scripts
├── Dockerfile
├── requirements.txt
└── README.md
```

## Quick Start

### Easy Start (Recommended)

From the project root:

```bash
.\start-prediction-service.bat
```

Or from this directory:

**Windows:**
```bash
start.bat
```

**Linux/Mac:**
```bash
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

## Training Models

For detailed instructions on generating training data and training models, see the [Training Guide](../../docs/training-guide.md).

## API Endpoints

### Health Check

```http
GET /health
```

### Make Prediction

```http
POST /api/v1/predict/glucose
Content-Type: application/json

{
  "model_name": "glucose_predictor_v1",
  "status_history": [...]
}
```

## Configuration

Configuration is managed through environment variables or a `.env` file:

- `APP_NAME`: Application name
- `APP_VERSION`: Application version
- `LOG_LEVEL`: Logging level (DEBUG, INFO, WARNING, ERROR)
- `MODEL_STORAGE_PATH`: Path to store trained models

## Development

### Running Tests

```bash
pytest tests/
```
