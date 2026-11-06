# Pi Metrics - Windows Native Interactive Installer
# Installs Pi Metrics directly into Windows with Desktop & Start Menu shortcuts,
# icon associations, and Windows Apps & Features uninstaller registration.

$ErrorActionPreference = "Stop"

$AppName = "Pi Metrics"
$AppVersion = "1.0.0"
$Publisher = "HariHaran"
$SourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TargetDir = Join-Path $env:LOCALAPPDATA "Programs\PiMetrics"

Clear-Host
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "       🍓 Pi Metrics - Windows Application Setup" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Installing to: $TargetDir" -ForegroundColor Gray

# 1. Build frontend if needed
if (-not (Test-Path (Join-Path $SourceDir "dist\index.html"))) {
    Write-Host "[1/5] Building dashboard web assets..." -ForegroundColor Yellow
    cmd.exe /c "cd /d `"$SourceDir`" && npm install && npm run build"
} else {
    Write-Host "[1/5] Dashboard web assets ready." -ForegroundColor Green
}

# 2. Copy application files to TargetDir
Write-Host "[2/5] Copying application files..." -ForegroundColor Yellow
if (-not (Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
}

$ItemsToCopy = @(
    "dist",
    "assets",
    "app_windows.py",
    "server.py",
    "cli.py",
    "config.json",
    "start.bat",
    "launch.vbs",
    "LICENSE",
    "README.md"
)

foreach ($item in $ItemsToCopy) {
    $src = Join-Path $SourceDir $item
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination $TargetDir -Recurse -Force
    }
}
Write-Host "✓ Application files installed." -ForegroundColor Green

# 3. Create Uninstaller Script in TargetDir
Write-Host "[3/5] Setting up Windows uninstaller..." -ForegroundColor Yellow
$UninstallScript = @"
@echo off
title Uninstall Pi Metrics
echo Are you sure you want to uninstall Pi Metrics?
pause
taskkill /F /IM python.exe /FI "WINDOWTITLE eq *server.py*" 2>nul
set "TARGET=$TargetDir"
set "DESKTOP_LNK=%USERPROFILE%\Desktop\Pi Metrics.lnk"
set "START_LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Pi Metrics.lnk"

del /f /q "%DESKTOP_LNK%" 2>nul
del /f /q "%START_LNK%" 2>nul

reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\PiMetrics" /f >nul 2>nul

rmdir /s /q "%TARGET%" 2>nul
echo Pi Metrics has been successfully uninstalled.
pause
"@

$UninstallBatPath = Join-Path $TargetDir "Uninstall.bat"
Set-Content -Path $UninstallBatPath -Value $UninstallScript

# Register in Windows Add/Remove Programs (Registry)
$RegPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\PiMetrics"
if (-not (Test-Path $RegPath)) {
    New-Item -Path $RegPath -Force | Out-Null
}
Set-ItemProperty -Path $RegPath -Name "DisplayName" -Value "$AppName"
Set-ItemProperty -Path $RegPath -Name "DisplayVersion" -Value "$AppVersion"
Set-ItemProperty -Path $RegPath -Name "Publisher" -Value "$Publisher"
Set-ItemProperty -Path $RegPath -Name "InstallLocation" -Value "$TargetDir"
Set-ItemProperty -Path $RegPath -Name "UninstallString" -Value "`"$UninstallBatPath`""
Set-ItemProperty -Path $RegPath -Name "DisplayIcon" -Value (Join-Path $TargetDir "assets\pi-metrics.ico")
Set-ItemProperty -Path $RegPath -Name "NoModify" -Value 1
Set-ItemProperty -Path $RegPath -Name "NoRepair" -Value 1
Write-Host "✓ Registered in Windows Apps & Features." -ForegroundColor Green

# 4. Create Shortcuts (Desktop + Start Menu)
Write-Host "[4/5] Creating Desktop and Start Menu shortcuts..." -ForegroundColor Yellow
$WshShell = New-Object -ComObject WScript.Shell
$IcoFile = Join-Path $TargetDir "assets\pi-metrics.ico"
$TargetBat = Join-Path $TargetDir "start.bat"

# Desktop Shortcut
$DesktopDir = [Environment]::GetFolderPath("Desktop")
$DesktopShortcut = Join-Path $DesktopDir "Pi Metrics.lnk"
$Short1 = $WshShell.CreateShortcut($DesktopShortcut)
$Short1.TargetPath = $TargetBat
$Short1.WorkingDirectory = $TargetDir
$Short1.IconLocation = "$IcoFile, 0"
$Short1.Description = "Raspberry Pi 5 Real-Time Hardware Monitor"
$Short1.Save()

# Start Menu Shortcut
$StartMenuDir = [Environment]::GetFolderPath("Programs")
$StartShortcut = Join-Path $StartMenuDir "Pi Metrics.lnk"
$Short2 = $WshShell.CreateShortcut($StartShortcut)
$Short2.TargetPath = $TargetBat
$Short2.WorkingDirectory = $TargetDir
$Short2.IconLocation = "$IcoFile, 0"
$Short2.Description = "Raspberry Pi 5 Real-Time Hardware Monitor"
$Short2.Save()

Write-Host "✓ Shortcuts created." -ForegroundColor Green

# 5. Finished
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  ✨ Pi Metrics has been installed successfully!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Desktop Icon: $DesktopShortcut" -ForegroundColor Gray
Write-Host "Start Menu:   $StartShortcut" -ForegroundColor Gray
Write-Host ""

$Answer = Read-Host "Would you like to launch Pi Metrics now? (Y/n)"
if ($Answer -eq "" -or $Answer -match "^[yY]") {
    Start-Process $TargetBat
}
