@echo off
echo ============================================
echo  Archive PredictiveModelsService Directory
echo ============================================
echo.
echo This script will move the old PredictiveModelsService
echo directory to the archive folder.
echo.
echo IMPORTANT: Close any files from PredictiveModelsService
echo in your IDE before running this script.
echo.
pause

echo.
echo Checking for running Python processes...
tasklist /FI "IMAGENAME eq python.exe" /FI "IMAGENAME eq python3.13.exe" 2>NUL | find /I /N "python">NUL
if "%ERRORLEVEL%"=="0" (
    echo WARNING: Python processes are still running!
    echo Please stop them before continuing.
    pause
)

echo.
echo Attempting to move directory...
move PredictiveModelsService archive\PredictiveModelsService

if %ERRORLEVEL% EQU 0 (
    echo.
    echo SUCCESS! PredictiveModelsService has been archived.
    echo.
    echo The directory is now at: archive\PredictiveModelsService
    echo.
) else (
    echo.
    echo FAILED: Could not move directory.
    echo.
    echo Possible reasons:
    echo   1. Files are open in your IDE/editor
    echo   2. File explorer is browsing the directory
    echo   3. Another process has files locked
    echo.
    echo Please:
    echo   1. Close ALL files from the old PredictiveModelsService in your IDE
    echo   2. Close any File Explorer windows in that directory
    echo   3. Wait a few seconds for file handles to release
    echo   4. Run this script again
    echo.
)

pause
