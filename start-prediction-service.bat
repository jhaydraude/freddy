@echo off
echo Starting Predictive Models Service...
echo.
echo The service will be available at: http://localhost:8000
echo Health check: http://localhost:8000/health
echo.
cd /d "%~dp0PredictiveModelsService"
python -m app.main
