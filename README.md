# 🍓 Pi Metrics

A standalone real-time Raspberry Pi 5 hardware monitor and telemetry dashboard built with **shadcn/ui**, **React**, **Tailwind CSS**, and **Python**.

Connects passwordlessly over SSH to `pi@192.168.1.9` (`hermes-pi`), collects granular hardware statistics, and serves an interactive web dashboard and REST API.

---

## Features

- **shadcn/ui Design**: Built with Radix UI primitives, Lucide React icons, Tailwind CSS, and shadcn card, badge, button, progress, table, and tabs components.
- **Live SoC Telemetry**: Core temperature (°C) with color-coded warning states, ARM clock frequency (MHz), and under-voltage / thermal throttling detection via `vcgencmd`.
- **CPU & Load**: 1m, 5m, and 15m load averages across 4 ARM Cortex-A76 cores.
- **Memory & Swap**: Detailed LPDDR4X usage (Used, Free, Available, Buffers/Cache) and Swap allocation.
- **Disk & Storage**: MicroSD root filesystem and boot firmware partition space utilization.
- **Network I/O**: Live RX / TX transfer rates (KB/s and MB/s) and total data transferred.
- **Top Processes**: Real-time table of active processes on the Pi with PID, user, %CPU, %MEM, and command name.
- **Interactive Recharts Trends**: Tabbed area charts plotting temperature, CPU load, memory usage, and network throughput across the last 60 polling intervals.
- **1-Click SSH Terminal**: Launch a direct authenticated `gnome-terminal` SSH session into the Pi from the dashboard.
- **Dual Mode**: High-tech web dashboard (`http://localhost:5055`) and rich ANSI terminal monitor (`./start.sh --cli`).

---

## Quick Start

### 1. Linux Desktop App 🐧

#### Installation (.deb Package for Ubuntu / Debian / Mint / Pop!_OS)
Download the `.deb` package from [Releases](https://github.com/hariharan-uiux/pi-metrics/releases) and install:
```bash
sudo dpkg -i pi-metrics_1.0.1_all.deb
# Or build locally:
./build-deb.sh
```

#### Launching
- **From Desktop**: Double-click the **Pi Metrics** icon on your desktop.
- **From App Launcher**: Search for **Pi Metrics** in GNOME / Super key menu.
- **From Command Line**: `pi-metrics` (or `./start.sh` in the project folder).

#### Linux Keyboard Shortcuts
- `F5` or `Ctrl+R`: Reload dashboard
- `F11`: Toggle Fullscreen
- `Ctrl++` / `Ctrl+=`: Zoom In
- `Ctrl+-`: Zoom Out
- `Ctrl+0`: Reset Zoom (100%)
- `Ctrl+T`: Launch authenticated SSH terminal (Ptyxis / GNOME Terminal)
- `Ctrl+Q` or `Ctrl+W`: Quit application

---

### 2. Windows Desktop App & Installer 🪟

#### Option A: Windows Installer (`PiMetrics-Setup-x64.exe`)
- **Download from GitHub Actions / Releases**: Every push builds the compiled Windows setup executable via GitHub Actions.
- **Build Installer Locally**:
  ```cmd
  build-installer.bat
  ```
  Packages the backend, frontend, and Edge WebView2 runner into a standard Windows setup installer with wizard, desktop shortcut option, and uninstaller.

#### Option B: 1-Click Local Setup (`Setup.bat`)
- Double-click `Setup.bat` (or run `powershell -ExecutionPolicy Bypass -File Setup-PiMetrics.ps1`).
- Installs Pi Metrics into `%LocalAppData%\Programs\PiMetrics` (no admin rights required).
- Creates Desktop & Start Menu shortcuts with the custom Pi icon.
- Registers in Windows **Installed Apps / Control Panel** for standard uninstallation.

#### Option C: Quick Launch Without Installing
Double-click `start.bat` in the project folder, or run:
```cmd
start.bat
# Or with Python:
python app_windows.py
```

#### Windows Features
- **Native Edge WebView2 / App Mode**: Uses Microsoft Edge App Mode (pre-installed on Windows 10/11) or `pywebview` for a clean, dedicated window with zero address bar or browser tab clutter.
- **1-Click SSH Terminal**: Clicking "SSH Terminal" in the dashboard opens Windows Terminal (`wt.exe`), PowerShell, or Command Prompt directly into `pi@192.168.1.9`.
- **Background Daemon**: Spawns `server.py` silently in the background and shuts it down cleanly when the window is closed.

---

### 3. Web Dashboard (Browser Mode)
- **Linux**: `./start.sh --web`
- **Windows**: `start.bat --web`
Runs the backend in the background and opens `http://localhost:5055` in your default browser.

### 4. Development Mode (Vite Hot-Reload)
```bash
npm run dev
# Desktop app targeting dev server:
# Linux: pi-metrics --dev
# Windows: start.bat --dev
```

### 5. Terminal CLI Monitor
- **Linux**: `./start.sh --cli`
- **Windows**: `start.bat --cli`

### 6. Check Status & Stop
- **Linux**: `./start.sh --status` | `./start.sh --stop`
- **Windows**: `start.bat --status` | `start.bat --stop`

---

## Project Structure

```
pi-metrics/
├── .github/workflows/       # GitHub Actions automated Windows installer CI/CD
│   └── build-windows.yml    # Builds and uploads PiMetrics-Setup-x64.exe
├── assets/                  # Application icons
│   ├── pi-metrics.svg       # Vector app icon
│   ├── pi-metrics.ico       # Multi-res Windows icon (16px to 256px)
│   ├── pi-metrics.png       # 256px PNG icon
│   └── icons/               # Multi-resolution icon set
├── src/
│   ├── components/ui/       # shadcn/ui components (card, button, badge, progress, table, tabs)
│   ├── lib/utils.ts         # shadcn cn() helper
│   ├── App.tsx              # Main React dashboard component
│   ├── main.tsx             # React application entrypoint
│   └── index.css            # Tailwind directives & shadcn design tokens
├── app.py                   # Standalone GTK3 + WebKit2 Linux desktop application
├── app_windows.py           # Standalone Windows desktop application (Edge / WebView2)
├── Setup.bat                # Windows 1-click interactive setup launcher
├── Setup-PiMetrics.ps1      # PowerShell native Windows installer & registry setup
├── installer.iss            # Inno Setup compiler script (PiMetrics-Setup-x64.exe)
├── build-installer.bat      # Windows Inno Setup installer builder
├── start.sh                 # Linux launcher & process manager
├── start.bat                # Windows batch launcher & process manager
├── install.sh               # Linux desktop & icon installation script
├── install-windows.bat      # Windows shortcut installer
├── install-windows.ps1      # PowerShell shortcut generator
├── launch.vbs               # Silent Windows launcher (no console window)
├── build-windows-exe.bat    # PyInstaller Windows .exe builder script
├── pi-metrics.spec          # PyInstaller bundle specification
├── pi-metrics.desktop       # FreeDesktop Linux desktop entry
├── server.py                # Cross-platform backend (HTTP server, SSH poller, REST API)
├── cli.py                   # Terminal ANSI live hardware monitor
├── config.json              # Polling rate, host, port configuration
├── vite.config.ts           # Vite bundler & API proxy configuration
├── tailwind.config.js       # Tailwind theme configuration
├── package.json             # Node dependencies
└── README.md                # Documentation
```
