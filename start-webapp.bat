@echo off
echo Starting WebApp...
echo.
echo The WebApp will be available at: http://localhost:3000
echo.
cd /d "%~dp0packages\webapp"
npm run dev
