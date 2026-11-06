#!/usr/bin/env python3
"""
Pi Metrics - Standalone Linux Desktop Application
Native GTK3 + WebKit2 wrapper for the Pi Metrics hardware telemetry dashboard.
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

# Ensure WebKit doesn't crash in environments without hardware GL context
os.environ.setdefault("WEBKIT_DISABLE_COMPOSITING_MODE", "1")

import gi
gi.require_version("Gtk", "3.0")
gi.require_version("Gdk", "3.0")
gi.require_version("WebKit2", "4.1")
from gi.repository import Gtk, Gdk, WebKit2, GLib, GdkPixbuf

APP_ID = "pi-metrics"
APP_NAME = "Pi Metrics"
APP_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(APP_DIR, "config.json")
PID_FILE = "/tmp/pi-metrics.pid"
ICON_PATH = os.path.join(APP_DIR, "assets", "pi-metrics.png")
ICON_SVG = os.path.join(APP_DIR, "assets", "pi-metrics.svg")

# Set application names for GNOME window manager matching
GLib.set_prgname(APP_ID)
GLib.set_application_name(APP_NAME)


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
        req = urllib.request.Request(url, headers={"User-Agent": "PiMetricsApp/1.0"})
        with urllib.request.urlopen(req, timeout=1.0) as resp:
            return resp.status == 200
    except Exception:
        return False


def launch_ssh_terminal(user, host, port):
    title = f"SSH - {user}@{host}"
    import shutil
    candidates = []
    if shutil.which("ptyxis"):
        candidates.append(["ptyxis", "--title", title, "--", "ssh", "-p", str(port), f"{user}@{host}"])
    if shutil.which("gnome-terminal"):
        candidates.append(["gnome-terminal", "--title", title, "--", "ssh", "-p", str(port), f"{user}@{host}"])
    if shutil.which("x-terminal-emulator"):
        candidates.append(["x-terminal-emulator", "-T", title, "-e", f"ssh -p {port} {user}@{host}"])
    if shutil.which("xfce4-terminal"):
        candidates.append(["xfce4-terminal", "--title", title, "-e", f"ssh -p {port} {user}@{host}"])
    if shutil.which("xterm"):
        candidates.append(["xterm", "-title", title, "-e", "ssh", "-p", str(port), f"{user}@{host}"])

    for cmd in candidates:
        try:
            subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return True
        except Exception:
            continue
    return False


class PiMetricsWindow(Gtk.Window):
    def __init__(self, target_url, config, on_quit_cb=None):
        super().__init__(title=APP_NAME)
        self.target_url = target_url
        self.config = config
        self.on_quit_cb = on_quit_cb
        self.zoom_level = 1.0

        self.set_role("PiMetrics")
        self.set_default_size(1260, 840)
        self.set_position(Gtk.WindowPosition.CENTER)

        # Apply dark theme
        gtk_settings = Gtk.Settings.get_default()
        if gtk_settings:
            gtk_settings.set_property("gtk-application-prefer-dark-theme", True)

        # Set Window Icon
        self._setup_icon()

        # Build HeaderBar
        self._setup_headerbar()

        # Build WebKit WebView
        self._setup_webview()

        # Keyboard shortcuts
        self.connect("key-press-event", self._on_key_press)
        self.connect("delete-event", self._on_close)

    def _setup_icon(self):
        icon_candidates = [
            ICON_PATH,
            ICON_SVG,
            os.path.expanduser("~/.local/share/icons/hicolor/256x256/apps/pi-metrics.png"),
            os.path.expanduser("~/.local/share/icons/hicolor/scalable/apps/pi-metrics.svg"),
        ]
        for icon in icon_candidates:
            if os.path.exists(icon):
                try:
                    self.set_icon_from_file(icon)
                    break
                except Exception:
                    pass

    def _setup_headerbar(self):
        hb = Gtk.HeaderBar()
        hb.set_show_close_button(True)
        hb.set_title(APP_NAME)
        host = self.config.get("pi_host", "192.168.1.9")
        user = self.config.get("pi_user", "pi")
        hb.set_subtitle(f"Raspberry Pi 5 · {user}@{host}")

        # Left: Refresh button
        btn_refresh = Gtk.Button()
        btn_refresh.set_tooltip_text("Reload Dashboard (F5 / Ctrl+R)")
        img_refresh = Gtk.Image.new_from_icon_name("view-refresh-symbolic", Gtk.IconSize.BUTTON)
        btn_refresh.set_image(img_refresh)
        btn_refresh.connect("clicked", lambda b: self.webview.reload())
        hb.pack_start(btn_refresh)

        # Left: SSH Terminal button
        btn_term = Gtk.Button()
        btn_term.set_tooltip_text("Open SSH Terminal to Pi (Ctrl+T)")
        img_term = Gtk.Image.new_from_icon_name("utilities-terminal-symbolic", Gtk.IconSize.BUTTON)
        btn_term.set_image(img_term)
        btn_term.connect("clicked", lambda b: self._open_terminal())
        hb.pack_start(btn_term)

        # Right: About button
        btn_about = Gtk.Button()
        btn_about.set_tooltip_text("About Pi Metrics")
        img_about = Gtk.Image.new_from_icon_name("help-about-symbolic", Gtk.IconSize.BUTTON)
        btn_about.set_image(img_about)
        btn_about.connect("clicked", lambda b: self._show_about())
        hb.pack_end(btn_about)

        # Right: Zoom In (+)
        btn_zoom_in = Gtk.Button()
        btn_zoom_in.set_tooltip_text("Zoom In (Ctrl++)")
        img_zoom_in = Gtk.Image.new_from_icon_name("zoom-in-symbolic", Gtk.IconSize.BUTTON)
        btn_zoom_in.set_image(img_zoom_in)
        btn_zoom_in.connect("clicked", lambda b: self._change_zoom(0.1))
        hb.pack_end(btn_zoom_in)

        # Right: Reset Zoom (100%)
        self.btn_zoom_reset = Gtk.Button(label="100%")
        self.btn_zoom_reset.set_tooltip_text("Reset Zoom (Ctrl+0)")
        self.btn_zoom_reset.connect("clicked", lambda b: self._reset_zoom())
        hb.pack_end(self.btn_zoom_reset)

        # Right: Zoom Out (-)
        btn_zoom_out = Gtk.Button()
        btn_zoom_out.set_tooltip_text("Zoom Out (Ctrl+-)")
        img_zoom_out = Gtk.Image.new_from_icon_name("zoom-out-symbolic", Gtk.IconSize.BUTTON)
        btn_zoom_out.set_image(img_zoom_out)
        btn_zoom_out.connect("clicked", lambda b: self._change_zoom(-0.1))
        hb.pack_end(btn_zoom_out)

        self.set_titlebar(hb)
        self.headerbar = hb

    def _setup_webview(self):
        self.webview = WebKit2.WebView()

        # Dark background (#09090b) matching the shadcn dashboard to avoid white flashing
        bg_color = Gdk.RGBA(red=0.035, green=0.035, blue=0.043, alpha=1.0)
        self.webview.set_background_color(bg_color)

        # WebKit settings
        settings = self.webview.get_settings()
        settings.set_enable_javascript(True)
        settings.set_enable_webgl(True)
        settings.set_enable_developer_extras(True)
        settings.set_enable_smooth_scrolling(True)
        settings.set_enable_page_cache(True)

        # Handle external link navigation outside localhost
        self.webview.connect("decide-policy", self._on_decide_policy)
        self.webview.connect("load-failed", self._on_load_failed)

        # Put webview inside a box
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        box.pack_start(self.webview, True, True, 0)
        self.add(box)

        # Load dashboard
        self.webview.load_uri(self.target_url)

    def _change_zoom(self, delta):
        self.zoom_level = max(0.5, min(2.5, self.zoom_level + delta))
        self.webview.set_zoom_level(self.zoom_level)
        pct = int(round(self.zoom_level * 100))
        self.btn_zoom_reset.set_label(f"{pct}%")

    def _reset_zoom(self):
        self.zoom_level = 1.0
        self.webview.set_zoom_level(1.0)
        self.btn_zoom_reset.set_label("100%")

    def _open_terminal(self):
        host = self.config.get("pi_host", "192.168.1.9")
        user = self.config.get("pi_user", "pi")
        port = self.config.get("pi_port", 22)
        launched = launch_ssh_terminal(user, host, port)
        if not launched:
            md = Gtk.MessageDialog(
                transient_for=self,
                flags=0,
                message_type=Gtk.MessageType.ERROR,
                buttons=Gtk.ButtonsType.OK,
                text="Terminal Launcher Error"
            )
            md.format_secondary_text("Could not find a supported terminal emulator (ptyxis, gnome-terminal, x-terminal-emulator, xfce4-terminal).")
            md.run()
            md.destroy()

    def _show_about(self):
        about = Gtk.AboutDialog(transient_for=self, modal=True)
        about.set_program_name(APP_NAME)
        about.set_version("1.0.0")
        about.set_comments("Real-time Raspberry Pi 5 Hardware Telemetry & Dashboard.\nMonitors CPU, Memory, Disk, Network, SoC temperature, and processes.")
        about.set_website("http://localhost:5055")
        about.set_website_label("Pi Metrics Dashboard")
        about.set_authors(["Pi Metrics Teammate"])
        if os.path.exists(ICON_PATH):
            try:
                pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(ICON_PATH, 128, 128, True)
                about.set_logo(pixbuf)
            except Exception:
                pass
        about.run()
        about.destroy()

    def _on_decide_policy(self, webview, decision, decision_type):
        if decision_type == WebKit2.PolicyDecisionType.NAVIGATION_ACTION:
            action = decision.get_navigation_action()
            req = action.get_request()
            uri = req.get_uri()
            if uri and not (uri.startswith("http://localhost") or uri.startswith("http://127.0.0.1")):
                # External link clicked: open in external browser
                decision.ignore()
                try:
                    Gtk.show_uri_on_window(self, uri, Gdk.CURRENT_TIME)
                except Exception:
                    subprocess.Popen(["xdg-open", uri])
                return True
        return False

    def _on_load_failed(self, webview, load_event, failing_uri, error):
        err_msg = error.message if hasattr(error, "message") else str(error)
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {{
              background-color: #09090b;
              color: #f43f5e;
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
            }}
            .card {{
              background: #18181b;
              border: 1px solid #27272a;
              padding: 32px 48px;
              text-align: center;
              max-width: 500px;
            }}
            h2 {{ color: #fafafa; margin-bottom: 8px; }}
            p {{ color: #a1a1aa; font-size: 14px; margin-bottom: 24px; }}
            button {{
              background: #e11d48;
              color: white;
              border: none;
              padding: 10px 20px;
              font-size: 14px;
              cursor: pointer;
            }}
            button:hover {{ background: #be123c; }}
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Connection Error</h2>
            <p>Could not connect to Pi Metrics server at <code>{failing_uri}</code>.<br>{err_msg}</p>
            <button onclick="window.location.reload()">Retry Connection</button>
          </div>
        </body>
        </html>
        """
        webview.load_html(html, failing_uri)
        return True

    def _on_key_press(self, widget, event):
        keyval = event.keyval
        state = event.state

        ctrl = bool(state & Gdk.ModifierType.CONTROL_MASK)

        # F5 or Ctrl+R: Reload
        if keyval == Gdk.KEY_F5 or (ctrl and keyval in (Gdk.KEY_r, Gdk.KEY_R)):
            self.webview.reload()
            return True

        # F11: Fullscreen toggle
        if keyval == Gdk.KEY_F11:
            if self.get_window().get_state() & Gdk.WindowState.FULLSCREEN:
                self.unfullscreen()
            else:
                self.fullscreen()
            return True

        # Ctrl + Plus / Equal: Zoom In
        if ctrl and keyval in (Gdk.KEY_plus, Gdk.KEY_equal, Gdk.KEY_KP_Add):
            self._change_zoom(0.1)
            return True

        # Ctrl + Minus: Zoom Out
        if ctrl and keyval in (Gdk.KEY_minus, Gdk.KEY_KP_Subtract):
            self._change_zoom(-0.1)
            return True

        # Ctrl + 0: Zoom Reset
        if ctrl and keyval in (Gdk.KEY_0, Gdk.KEY_KP_0):
            self._reset_zoom()
            return True

        # Ctrl + T: SSH Terminal
        if ctrl and keyval in (Gdk.KEY_t, Gdk.KEY_T):
            self._open_terminal()
            return True

        # Ctrl + Q or Ctrl + W: Close
        if ctrl and keyval in (Gdk.KEY_q, Gdk.KEY_Q, Gdk.KEY_w, Gdk.KEY_W):
            self.close()
            return True

        return False

    def _on_close(self, widget, event):
        if self.on_quit_cb:
            self.on_quit_cb()
        Gtk.main_quit()
        return False


def main():
    parser = argparse.ArgumentParser(description="Pi Metrics Linux Desktop App")
    parser.add_argument("--port", type=int, default=None, help="Server port (default: from config.json or 5055)")
    parser.add_argument("--dev", action="store_true", help="Connect to Vite development server (port 5173)")
    parser.add_argument("--fullscreen", action="store_true", help="Launch in fullscreen mode")
    parser.add_argument("--no-server", action="store_true", help="Do not spawn background server.py")
    args = parser.parse_args()

    cfg = load_config()
    server_port = args.port or cfg.get("server_port", 5055)

    if args.dev:
        target_url = "http://localhost:5173"
    else:
        target_url = f"http://localhost:{server_port}"

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

    def sig_handler(sig, frame):
        cleanup()
        Gtk.main_quit()
        sys.exit(0)

    signal.signal(signal.SIGINT, sig_handler)
    signal.signal(signal.SIGTERM, sig_handler)

    try:
        # Check if server is already running
        if not args.dev and not args.no_server:
            if not is_server_ready(server_port):
                # Check if dist exists, if not build it
                dist_dir = os.path.join(APP_DIR, "dist")
                if not os.path.exists(dist_dir) or not os.path.exists(os.path.join(dist_dir, "index.html")):
                    print("Pi Metrics: Building frontend assets...")
                    subprocess.run(["npm", "run", "build"], cwd=APP_DIR, check=True)

                print(f"Pi Metrics: Starting backend server on port {server_port}...")
                server_script = os.path.join(APP_DIR, "server.py")
                server_proc = subprocess.Popen(
                    [sys.executable, server_script],
                    cwd=APP_DIR,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
                # Write PID
                try:
                    with open(PID_FILE, "w") as f:
                        f.write(str(server_proc.pid))
                except Exception:
                    pass

                # Wait for server to become responsive
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

        # Initialize GTK App
        win = PiMetricsWindow(target_url, cfg, on_quit_cb=cleanup)
        if args.fullscreen:
            win.fullscreen()
        win.show_all()

        Gtk.main()
    finally:
        cleanup()


if __name__ == "__main__":
    main()
