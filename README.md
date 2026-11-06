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

### 1. Launch Linux Desktop App
- **From Desktop**: Double-click the **Pi Metrics** icon on your desktop.
- **From App Launcher**: Search for **Pi Metrics** in GNOME / Super key menu.
- **From Command Line**:
  ```bash
  pi-metrics
  # Or from project folder:
  cd ~/projects/pi-metrics && ./start.sh
  ```

#### Desktop App Keyboard Shortcuts
- `F5` or `Ctrl+R`: Reload dashboard
- `F11`: Toggle Fullscreen
- `Ctrl++` / `Ctrl+=`: Zoom In
- `Ctrl+-`: Zoom Out
- `Ctrl+0`: Reset Zoom (100%)
- `Ctrl+T`: Launch authenticated SSH terminal (Ptyxis / GNOME Terminal)
- `Ctrl+Q` or `Ctrl+W`: Quit application

### 2. Launch Web Dashboard (Browser Mode)
```bash
cd ~/projects/pi-metrics
./start.sh --web
```
Runs the backend in the background and opens `http://localhost:5055` in your default web browser.

### 3. Development Mode (Vite Hot-Reload)
```bash
cd ~/projects/pi-metrics
npm run dev
# Or launch desktop app targeting dev server:
pi-metrics --dev
```

### 4. Launch Terminal CLI Monitor
```bash
cd ~/projects/pi-metrics
./start.sh --cli
```

### 5. Check Status & Stop
```bash
./start.sh --status
./start.sh --stop
```

---

## Project Structure

```
pi-metrics/
├── assets/              # High-res SVG and PNG application icons
│   ├── pi-metrics.svg   # Vector app icon
│   └── icons/           # Multi-resolution icon set (16px to 512px)
├── src/
│   ├── components/ui/   # shadcn/ui components (card, button, badge, progress, table, tabs)
│   ├── lib/utils.ts     # shadcn cn() helper
│   ├── App.tsx          # Main React dashboard component
│   ├── main.tsx         # React application entrypoint
│   └── index.css        # Tailwind directives & shadcn design tokens
├── app.py               # Standalone GTK3 + WebKit2 Linux desktop application
├── server.py            # Python backend (HTTP server, SSH poller, REST API)
├── cli.py               # Terminal ANSI live hardware monitor
├── start.sh             # Launcher & process manager script
├── config.json          # Polling rate, host, port configuration
├── vite.config.ts       # Vite bundler & API proxy configuration
├── tailwind.config.js   # Tailwind theme configuration
├── package.json         # Node dependencies
└── README.md            # Documentation
```
