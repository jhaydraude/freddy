#!/bin/bash
echo "========================================"
echo "  Predictive Models Service - Startup"
echo "========================================"
echo

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python3 is not installed"
    echo "Please install Python 3.10+"
    exit 1
fi

# Create virtual environment if needed
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing/updating dependencies..."
pip install -r requirements.txt -q

echo
echo "Starting service on http://localhost:8000"
echo "API Docs available at http://localhost:8000/docs"
echo "Press Ctrl+C to stop the service"
echo

python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
