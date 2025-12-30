@echo off
echo ===============================================
echo   NightManager - Start All Services
echo ===============================================
echo.
echo This will start all services in separate windows:
echo   1. MCP Server with Inspector (localhost:5173)
echo   2. Predictive Models Service (localhost:8000)
echo   3. WebApp (localhost:3000)
echo.

start "MCP Server" cmd /k "cd /d %~dp0 && call start-mcp.bat"
timeout /t 2 /nobreak > nul
start "Prediction Service" cmd /k "cd /d %~dp0 && call start-prediction-service.bat"
timeout /t 2 /nobreak > nul
start "WebApp" cmd /k "cd /d %~dp0 && call start-webapp.bat"

echo.
echo Services starting in new windows...
echo.
echo MCP Inspector: http://localhost:5173
echo Prediction API: http://localhost:8000
echo WebApp: http://localhost:3000
echo.

