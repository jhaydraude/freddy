@echo off
echo ===============================================
echo   NightManager - Stop All Services
echo ===============================================
echo.

echo Stopping WebApp (port 3000)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    echo Killing PID %%a
    taskkill /F /PID %%a /T
)

echo Stopping Prediction Service (port 8000)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    echo Killing PID %%a
    taskkill /F /PID %%a /T
)

echo Stopping MCP Inspector (port 5173)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do (
    echo Killing PID %%a
    taskkill /F /PID %%a /T
)

echo.
echo Attempting to close CMD windows started by scripts...
taskkill /F /FI "WINDOWTITLE eq MCP Server" /T 2>nul
taskkill /F /FI "WINDOWTITLE eq Prediction Service" /T 2>nul
taskkill /F /FI "WINDOWTITLE eq WebApp" /T 2>nul

echo.
echo All services stopped.
timeout /t 3
