@echo off
echo ========================================
echo   Predictive Models Service - Startup
echo ========================================
echo.

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.10+ from https://python.org
    pause
    exit /b 1
)

REM Install dependencies if needed
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

echo Activating virtual environment...
call venv\Scripts\activate.bat

echo Installing/updating dependencies...
pip install -r requirements.txt -q

echo.
echo Starting service on http://localhost:8000
echo API Docs available at http://localhost:8000/docs
echo Press Ctrl+C to stop the service
echo.

python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
