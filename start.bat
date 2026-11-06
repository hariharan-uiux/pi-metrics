@echo off
setlocal enabledelayedexpansion
title Pi Metrics

set "DIR=%~dp0"
set "PORT=5055"
set "PID_FILE=%TEMP%\pi-metrics.pid"

:: Find Python
where py >nul 2>nul
if %errorlevel% equ 0 (
    set "PYTHON_EXE=py"
    goto :PYTHON_FOUND
)
where python >nul 2>nul
if %errorlevel% equ 0 (
    set "PYTHON_EXE=python"
    goto :PYTHON_FOUND
)
where python3 >nul 2>nul
if %errorlevel% equ 0 (
    set "PYTHON_EXE=python3"
    goto :PYTHON_FOUND
)

echo [ERROR] Python is not installed or not found in PATH.
echo Please install Python 3 from https://python.org or the Microsoft Store.
pause
exit /b 1

:PYTHON_FOUND

:: Handle --stop
if "%~1"=="--stop" goto :STOP
if "%~1"=="stop" goto :STOP

:: Handle --status
if "%~1"=="--status" goto :STATUS
if "%~1"=="status" goto :STATUS

:: Handle --cli
if "%~1"=="--cli" goto :CLI
if "%~1"=="cli" goto :CLI

:: Handle --dev
if "%~1"=="--dev" goto :DEV
if "%~1"=="dev" goto :DEV

:: Handle --web
if "%~1"=="--web" goto :WEB
if "%~1"=="web" goto :WEB

:: Default: Run Windows Desktop App
if not exist "%DIR%dist\index.html" (
    echo [Pi Metrics] Building frontend assets...
    call npm run build
)

start "" "%PYTHON_EXE%w" "%DIR%app_windows.py" %* 2>nul || "%PYTHON_EXE%" "%DIR%app_windows.py" %*
exit /b 0

:STOP
if exist "%PID_FILE%" (
    set /p SPID=<"%PID_FILE%"
    taskkill /PID !SPID! /F >nul 2>nul
    del "%PID_FILE%" >nul 2>nul
    echo Pi Metrics server stopped (PID: !SPID!).
    exit /b 0
)
taskkill /F /IM python.exe /FI "WINDOWTITLE eq *server.py*" >nul 2>nul
echo Pi Metrics stopped.
exit /b 0

:STATUS
powershell -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:%PORT%/api/health' -TimeoutSec 2; Write-Host 'Pi Metrics is RUNNING on http://localhost:%PORT% (Pi Online:' $r.online ')' -ForegroundColor Green } catch { Write-Host 'Pi Metrics is STOPPED.' -ForegroundColor Yellow }"
exit /b 0

:CLI
"%PYTHON_EXE%" "%DIR%cli.py"
exit /b 0

:DEV
echo Starting Pi Metrics backend and Vite dev server...
start /b "" "%PYTHON_EXE%" "%DIR%server.py"
timeout /t 1 >nul
npm run dev
exit /b 0

:WEB
if not exist "%DIR%dist\index.html" (
    echo [Pi Metrics] Building frontend assets...
    call npm run build
)
start /b "" "%PYTHON_EXE%" "%DIR%server.py"
timeout /t 1 >nul
start "" "http://localhost:%PORT%"
exit /b 0
