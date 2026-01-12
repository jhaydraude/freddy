@echo off
echo ===============================================
echo   NightManager - Start All Services
echo ===============================================
echo.
echo This will start all services in separate windows:
echo   1. Predictive Models Service (localhost:8000)
echo   2. WebApp (localhost:3000)
echo.

start "Prediction Service" cmd /k "cd /d %~dp0 && call start-prediction-service.bat"
timeout /t 2 /nobreak > nul
start "WebApp" cmd /k "cd /d %~dp0 && call start-webapp.bat"

echo.
echo Services starting in new windows...
echo.
echo Prediction API: http://localhost:8000
echo WebApp: http://localhost:3000
echo.

