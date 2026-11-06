# Pi Metrics - Windows Desktop & Start Menu Shortcut Installer
# Run: powershell -ExecutionPolicy Bypass -File install-windows.ps1

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$IcoPath = Join-Path $ScriptDir "assets\pi-metrics.ico"
$BatPath = Join-Path $ScriptDir "start.bat"
$AppPyPath = Join-Path $ScriptDir "app_windows.py"

Write-Host "🍓 Installing Pi Metrics Windows Desktop App..." -ForegroundColor Cyan

# Find pythonw.exe or python.exe
$PythonExe = $null
foreach ($cmd in @("pythonw.exe", "python.exe", "py.exe")) {
    $found = Get-Command $cmd -ErrorAction SilentlyContinue
    if ($found) {
        $PythonExe = $found.Source
        if ($cmd -eq "pythonw.exe") { break }
    }
}

if (-not $PythonExe) {
    Write-Host "[WARNING] python.exe not found in PATH. Will use start.bat as shortcut target." -ForegroundColor Yellow
}

# 1. Build frontend if needed
$DistIndex = Join-Path $ScriptDir "dist\index.html"
if (-not (Test-Path $DistIndex)) {
    Write-Host "Building frontend dashboard..." -ForegroundColor Gray
    cmd.exe /c "cd /d `"$ScriptDir`" && npm install && npm run build"
}

# 2. Setup WScript.Shell for creating .lnk shortcuts
$WshShell = New-Object -ComObject WScript.Shell

# Desktop Shortcut
$DesktopDir = [Environment]::GetFolderPath("Desktop")
$DesktopShortcut = Join-Path $DesktopDir "Pi Metrics.lnk"
$Shortcut = $WshShell.CreateShortcut($DesktopShortcut)

if ($PythonExe -and ($PythonExe -like "*pythonw.exe")) {
    $Shortcut.TargetPath = $PythonExe
    $Shortcut.Arguments = "`"$AppPyPath`""
} else {
    $Shortcut.TargetPath = $BatPath
    $Shortcut.Arguments = ""
}

$Shortcut.WorkingDirectory = $ScriptDir
$Shortcut.Description = "Real-time Raspberry Pi 5 Hardware Telemetry & Dashboard"
if (Test-Path $IcoPath) {
    $Shortcut.IconLocation = "$IcoPath, 0"
}
$Shortcut.Save()
Write-Host "✓ Created Desktop Shortcut: $DesktopShortcut" -ForegroundColor Green

# Start Menu Shortcut
$StartMenuDir = [Environment]::GetFolderPath("Programs")
$StartShortcut = Join-Path $StartMenuDir "Pi Metrics.lnk"
$SShortcut = $WshShell.CreateShortcut($StartShortcut)

if ($PythonExe -and ($PythonExe -like "*pythonw.exe")) {
    $SShortcut.TargetPath = $PythonExe
    $SShortcut.Arguments = "`"$AppPyPath`""
} else {
    $SShortcut.TargetPath = $BatPath
    $SShortcut.Arguments = ""
}

$SShortcut.WorkingDirectory = $ScriptDir
$SShortcut.Description = "Real-time Raspberry Pi 5 Hardware Telemetry & Dashboard"
if (Test-Path $IcoPath) {
    $SShortcut.IconLocation = "$IcoPath, 0"
}
$SShortcut.Save()
Write-Host "✓ Created Start Menu Shortcut: $StartShortcut" -ForegroundColor Green

Write-Host "`n✨ Pi Metrics is ready! You can now launch it directly from your Desktop or Start Menu." -ForegroundColor Cyan
