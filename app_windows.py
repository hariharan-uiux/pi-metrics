#!/usr/bin/env python3
"""
Pi Metrics - Standalone Windows Desktop Application
Runs the Pi Metrics dashboard in a dedicated desktop window on Windows.
Supports Edge App Mode (native on Windows 10/11) and PyWebView (WebView2).
"""

import argparse
import json
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.request
import urllib.error

APP_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(APP_DIR, "config.json")
PID_FILE = os.path.join(os.environ.get("TEMP", "C:\\Temp"), "pi-metrics.pid")
ICON_ICO = os.path.join(APP_DIR, "assets", "pi-metrics.ico")
ICON_PNG = os.path.join(APP_DIR, "assets", "pi-metrics.png")


def load_config():
    default_cfg = {
        "pi_host": "192.168.1.9",
        "pi_user": "pi",
        "pi_port": 22,
        "server_port": 5055,
        "poll_interval_sec": 3.0
    }
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                default_cfg.update(json.load(f))
        except Exception:
            pass
    return default_cfg


def is_server_ready(port):
    url = f"http://127.0.0.1:{port}/api/health"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "PiMetricsWindows/1.0"})
        with urllib.request.urlopen(req, timeout=1.0) as resp:
            return resp.status == 200
    except Exception:
        return False


def find_windows_edge():
    """Find Microsoft Edge executable on Windows."""
    candidates = [
        os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%LocalAppData%\Microsoft\Edge\Application\msedge.exe"),
    ]
    import shutil
    in_path = shutil.which("msedge.exe") or shutil.which("msedge")
    if in_path:
        return in_path

    for path in candidates:
        if os.path.isfile(path):
            return path
    return None


def find_windows_chrome():
    """Find Google Chrome executable on Windows as fallback."""
    candidates = [
        os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
    ]
    import shutil
    in_path = shutil.which("chrome.exe") or shutil.which("chrome")
    if in_path:
        return in_path

    for path in candidates:
        if os.path.isfile(path):
            return path
    return None


def run_pywebview(target_url, cfg):
    """Attempt to run using pywebview (WebView2 on Windows)."""
    try:
        import webview
        host = cfg.get("pi_host", "192.168.1.9")
        window_title = f"Pi Metrics - Raspberry Pi 5 ({host})"
        window = webview.create_window(
            window_title,
            target_url,
            width=1280,
            height=840,
            min_size=(800, 600),
            background_color="#09090b",
            text_select=True,
            zoomable=True
        )
        webview.start(gui="edgechromium", debug=False)
        return True
    except ImportError:
        return False
    except Exception as e:
        print(f"PyWebView failed: {e}")
        return False


def run_app_mode(target_url, browser_exe):
    """Launch Microsoft Edge or Chrome in standalone App Mode."""
    user_data_dir = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "PiMetrics", "BrowserProfile")
    os.makedirs(user_data_dir, exist_ok=True)

    args = [
        browser_exe,
        f"--app={target_url}",
        "--window-size=1280,840",
        "--window-position=center",
        f"--user-data-dir={user_data_dir}",
        "--app-id=io.github.pimetrics",
        "--enable-features=OverlayScrollbar",
        "--hide-crash-restore-bubble"
    ]

    # Windows creation flag: DETACHED_PROCESS = 0x00000008
    creation_flags = 0x00000008 if sys.platform == "win32" else 0
    proc = subprocess.Popen(args, creationflags=creation_flags)
    return proc


def main():
    parser = argparse.ArgumentParser(description="Pi Metrics Windows Desktop App")
    parser.add_argument("--port", type=int, default=None, help="Server port (default: 5055)")
    parser.add_argument("--dev", action="store_true", help="Connect to Vite dev server (port 5173)")
    parser.add_argument("--no-server", action="store_true", help="Do not spawn background server.py")
    parser.add_argument("--browser", action="store_true", help="Open in default web browser instead of app window")
    args = parser.parse_args()

    cfg = load_config()
    server_port = args.port or cfg.get("server_port", 5055)
    target_url = "http://localhost:5173" if args.dev else f"http://localhost:{server_port}"

    server_proc = None

    def cleanup():
        nonlocal server_proc
        if server_proc:
            try:
                server_proc.terminate()
                server_proc.wait(timeout=1.5)
            except Exception:
                try:
                    server_proc.kill()
                except Exception:
                    pass
            server_proc = None
            if os.path.exists(PID_FILE):
                try:
                    os.remove(PID_FILE)
                except Exception:
                    pass

    # Ensure backend server is running
    if not args.dev and not args.no_server:
        if not is_server_ready(server_port):
            # Check if dist exists, build if needed
            dist_dir = os.path.join(APP_DIR, "dist")
            if not os.path.exists(dist_dir) or not os.path.exists(os.path.join(dist_dir, "index.html")):
                print("Pi Metrics: Building frontend assets...")
                subprocess.run(["npm", "run", "build"], cwd=APP_DIR, shell=True, check=True)

            print(f"Pi Metrics: Starting backend server on port {server_port}...")
            server_script = os.path.join(APP_DIR, "server.py")

            # CREATE_NO_WINDOW = 0x08000000 to prevent CMD flash on Windows
            creationflags = 0x08000000 if sys.platform == "win32" else 0
            server_proc = subprocess.Popen(
                [sys.executable, server_script],
                cwd=APP_DIR,
                creationflags=creationflags,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )

            try:
                with open(PID_FILE, "w") as f:
                    f.write(str(server_proc.pid))
            except Exception:
                pass

            # Wait for backend
            start_t = time.time()
            ready = False
            while time.time() - start_t < 10.0:
                if is_server_ready(server_port):
                    ready = True
                    break
                time.sleep(0.2)
            if not ready:
                print("Warning: Backend server took longer than expected to start.")
        else:
            print(f"Pi Metrics: Connected to existing backend server on port {server_port}.")

    try:
        if args.browser:
            import webbrowser
            webbrowser.open(target_url)
            print(f"Opened {target_url} in default web browser.")
            if server_proc:
                print("Press Ctrl+C to stop server...")
                while True:
                    time.sleep(1)
            return

        # 1. Try PyWebView (WebView2 on Windows)
        if run_pywebview(target_url, cfg):
            return

        # 2. Try Microsoft Edge App Mode (Built-in to Windows 10/11)
        edge_exe = find_windows_edge()
        if edge_exe:
            print(f"Launching Pi Metrics in Microsoft Edge App Mode...")
            edge_proc = run_app_mode(target_url, edge_exe)
            edge_proc.wait()
            return

        # 3. Try Google Chrome App Mode
        chrome_exe = find_windows_chrome()
        if chrome_exe:
            print(f"Launching Pi Metrics in Chrome App Mode...")
            chrome_proc = run_app_mode(target_url, chrome_exe)
            chrome_proc.wait()
            return

        # 4. Fallback to default browser
        print("Launching in default web browser...")
        import webbrowser
        webbrowser.open(target_url)
        if server_proc:
            print("App running. Press Ctrl+C to exit...")
            while True:
                time.sleep(1)

    except KeyboardInterrupt:
        pass
    finally:
        cleanup()


if __name__ == "__main__":
    main()
