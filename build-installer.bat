@echo off
setlocal enabledelayedexpansion
title Build Pi Metrics Windows Installer

set "DIR=%~dp0"
echo ========================================================
echo        🍓 Pi Metrics - Windows Installer Builder
echo ========================================================
echo.

:: 1. Build frontend assets if needed
echo [1/4] Building web dashboard assets...
if not exist "%DIR%dist\index.html" (
    call npm install
    call npm run build
) else (
    echo [1/4] Frontend assets already built.
)

:: 2. Ensure PyInstaller is installed
echo.
echo [2/4] Checking PyInstaller...
pip show pyinstaller >nul 2>nul
if %errorlevel% neq 0 (
    echo Installing PyInstaller and dependencies...
    pip install pyinstaller pywebview
)

:: 3. Run PyInstaller to build standalone binaries
echo.
echo [3/4] Compiling standalone executable with PyInstaller...
pyinstaller --clean --distpath "%DIR%build_exe" --workpath "%DIR%build_tmp" "%DIR%pi-metrics.spec" -y

if not exist "%DIR%build_exe\PiMetrics\PiMetrics.exe" (
    echo [ERROR] PyInstaller failed to produce PiMetrics.exe.
    pause
    exit /b 1
)

:: 4. Find Inno Setup Compiler (ISCC.exe)
echo.
echo [4/4] Locating Inno Setup Compiler...

set "ISCC_EXE="
where iscc >nul 2>nul
if %errorlevel% equ 0 set "ISCC_EXE=iscc"

if not defined ISCC_EXE (
    if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" (
        set "ISCC_EXE=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
    ) else if exist "%ProgramFiles%\Inno Setup 6\ISCC.exe" (
        set "ISCC_EXE=%ProgramFiles%\Inno Setup 6\ISCC.exe"
    ) else if exist "%LocalAppData%\Programs\Inno Setup 6\ISCC.exe" (
        set "ISCC_EXE=%LocalAppData%\Programs\Inno Setup 6\ISCC.exe"
    )
)

if not defined ISCC_EXE (
    echo Inno Setup not found. Attempting to install via winget...
    winget install --id JRSoftware.InnoSetup -e --source winget --silent --accept-source-agreements --accept-package-agreements
    if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" set "ISCC_EXE=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
    if exist "%ProgramFiles%\Inno Setup 6\ISCC.exe" set "ISCC_EXE=%ProgramFiles%\Inno Setup 6\ISCC.exe"
)

if not defined ISCC_EXE (
    echo [WARNING] Inno Setup is not installed.
    echo Please install Inno Setup 6 from https://jrsoftware.org/isdl.php
    echo Or run: winget install JRSoftware.InnoSetup
    echo.
    echo Your standalone application is ready at:
    echo   %DIR%build_exe\PiMetrics\PiMetrics.exe
    pause
    exit /b 0
)

echo Compiling setup package with Inno Setup: "%ISCC_EXE%"...
mkdir "%DIR%setup_output" 2>nul
"%ISCC_EXE%" "%DIR%installer.iss"

echo.
if exist "%DIR%setup_output\PiMetrics-Setup-x64.exe" (
    echo ========================================================
    echo  ✨ SUCCESS! Windows Installer created:
    echo     %DIR%setup_output\PiMetrics-Setup-x64.exe
    echo ========================================================
) else (
    echo Compilation finished. Check the setup_output\ directory.
)

pause
