@echo off
title Build Pi Metrics Windows Executable
setlocal enabledelayedexpansion

echo 🍓 Building Pi Metrics Standalone Windows .EXE...

:: 1. Ensure dist exists
if not exist "%~dp0dist\index.html" (
    echo Building frontend...
    call npm install
    call npm run build
)

:: 2. Ensure PyInstaller is installed
pip show pyinstaller >nul 2>nul
if %errorlevel% neq 0 (
    echo Installing PyInstaller and dependencies...
    pip install pyinstaller pywebview
)

:: 3. Run PyInstaller
echo Running PyInstaller...
pyinstaller --clean "%~dp0pi-metrics.spec"

echo.
if exist "%~dp0dist\PiMetrics\PiMetrics.exe" (
    echo [SUCCESS] Windows executable built at:
    echo %~dp0dist\PiMetrics\PiMetrics.exe
) else (
    echo Build completed. Check the dist\ folder.
)
pause
