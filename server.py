#!/usr/bin/env python3
"""
Pi Metrics - Real-time Raspberry Pi 5 Hardware Monitoring Server
Serves a responsive web dashboard and REST API for system metrics over SSH.
"""

import collections
import json
import mimetypes
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
from http.server import HTTPServer, SimpleHTTPRequestHandler, ThreadingHTTPServer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if getattr(sys, 'frozen', False):
    BUNDLE_DIR = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
else:
    BUNDLE_DIR = BASE_DIR

def get_static_dir():
    candidates = [
        os.path.join(BUNDLE_DIR, 'dist'),
        os.path.join(os.path.dirname(sys.executable), 'dist') if getattr(sys, 'frozen', False) else None,
        os.path.join(BASE_DIR, 'dist'),
        os.path.join(BUNDLE_DIR, 'static'),
        os.path.join(BASE_DIR, 'static'),
    ]
    for c in candidates:
        if c and os.path.exists(c) and os.path.isdir(c):
            return c
    return os.path.join(BUNDLE_DIR, 'dist')

STATIC_DIR = get_static_dir()

def get_config_file_path():
    if getattr(sys, 'frozen', False) and sys.platform == 'win32':
        app_data = os.path.join(os.environ.get('LOCALAPPDATA', os.path.expanduser('~')), 'PiMetrics')
        os.makedirs(app_data, exist_ok=True)
        return os.path.join(app_data, 'config.json')
    elif getattr(sys, 'frozen', False) and sys.platform != 'win32':
        app_data = os.path.join(os.environ.get('XDG_CONFIG_HOME', os.path.expanduser('~/.config')), 'pi-metrics')
        os.makedirs(app_data, exist_ok=True)
        return os.path.join(app_data, 'config.json')
    return os.path.join(BASE_DIR, 'config.json')

CONFIG_FILE = get_config_file_path()

CREATE_NO_WINDOW = getattr(subprocess, 'CREATE_NO_WINDOW', 0x08000000)


def host_check_output(cmd, **kwargs):
    """Run a local host subprocess without popping up a black console window on Windows."""
    if sys.platform == 'win32':
        kwargs['creationflags'] = CREATE_NO_WINDOW
    return subprocess.check_output(cmd, **kwargs)


def is_local_host(host):
    if not host:
        return False
    h = str(host).strip().lower()
    if h in ('127.0.0.1', 'localhost', '0.0.0.0', '::1'):
        return True
    try:
        my_hostname = socket.gethostname().lower()
        if h == my_hostname or (h.endswith('.local') and h[:-6] == my_hostname):
            return True
    except Exception:
        pass
    try:
        local_addrs = set()
        for name in (socket.gethostname(), socket.getfqdn(), 'localhost'):
            try:
                for info in socket.getaddrinfo(name, None):
                    local_addrs.add(info[4][0].lower())
            except Exception:
                pass
        if sys.platform != 'win32':
            try:
                out = subprocess.check_output("ip -br addr show 2>/dev/null || ifconfig 2>/dev/null", shell=True, text=True)
                for m in re.finditer(r'(\d+\.\d+\.\d+\.\d+)', out):
                    local_addrs.add(m.group(1))
            except Exception:
                pass
        if h in local_addrs:
            return True
    except Exception:
        pass
    return False


SYSTEM_DETAILS_CODE = """import subprocess, json, re

def out(c):
    try:
        return subprocess.check_output(c, shell=True, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return ''

cpu_info = out('cat /proc/cpuinfo')
rev_m = re.search(r'Revision\\s+:\\s+(\\S+)', cpu_info)
ser_m = re.search(r'Serial\\s+:\\s+(\\S+)', cpu_info)

eth_mac = out('cat /sys/class/net/eth0/address')
wlan_mac = out('cat /sys/class/net/wlan0/address')
eth_ip = out("ip -4 -br addr show eth0 | awk '{print $3}'")
wlan_ip = out("ip -4 -br addr show wlan0 | awk '{print $3}'")

details = {
    'hardware': {
        'model': out('cat /proc/device-tree/model').rstrip('\\x00'),
        'revision': rev_m.group(1) if rev_m else 'd04170',
        'serial': ser_m.group(1) if ser_m else 'Unknown',
        'soc': 'Broadcom BCM2712',
        'cpu_arch': 'aarch64 (ARMv8.2-A 64-bit)',
        'cpu_cores': 4,
        'cpu_name': 'ARM Cortex-A76',
        'cpu_max_freq': '2.4 GHz (2400 MHz)',
        'cpu_min_freq': '1.5 GHz (1500 MHz)',
        'ram_total': '8.0 GB LPDDR4X-4267',
        'ram_details': '8453 MB physical SDRAM',
        'southbridge': 'Raspberry Pi RP1 I/O Controller (PCIe 2.0 x4)',
        'power_ic': 'Dialog DA9091 PMIC',
        'core_voltage': out('vcgencmd measure_volts core').replace('volt=', ''),
        'arm_clock': out('vcgencmd measure_clock arm').split('=')[-1] + ' Hz',
        'core_clock': out('vcgencmd measure_clock core').split('=')[-1] + ' Hz',
        'rp1_temp_c': round(float(out('cat /sys/class/hwmon/hwmon1/temp1_input 2>/dev/null') or 0)/1000.0, 1) if out('cat /sys/class/hwmon/hwmon1/temp1_input 2>/dev/null') else None
    },
    'firmware': {
        'bootloader_version': out('vcgencmd bootloader_version'),
        'vcgencmd_version': out('vcgencmd version'),
        'config_txt': out('cat /boot/firmware/config.txt | grep -v "^#" | grep -v "^$" | head -n 14')
    },
    'os': {
        'distro': out("cat /etc/os-release | grep PRETTY_NAME | cut -d'=' -f2").strip('"'),
        'kernel': out('uname -r'),
        'kernel_full': out('uname -a'),
        'uptime_full': out('uptime'),
        'python_version': out('python3 -V'),
        'gcc_version': out('gcc --version | head -n 1'),
        'systemd_version': out('systemctl --version | head -n 1')
    },
    'network': {
        'hostname': out('hostname -f 2>/dev/null || hostname'),
        'interfaces': {
            'eth0': {
                'name': 'Gigabit Ethernet',
                'state': 'UP' if 'UP' in out('ip link show eth0') else 'DOWN',
                'mac': eth_mac,
                'ipv4': eth_ip or 'None',
                'ipv6': out("ip -6 -br addr show eth0 | awk '{print $3}'"),
                'speed': (out('cat /sys/class/net/eth0/speed 2>/dev/null') or '--') + ' Mbps'
            },
            'wlan0': {
                'name': 'Dual-band Wi-Fi 5 (802.11ac)',
                'state': 'UP' if 'UP' in out('ip link show wlan0') else 'DOWN',
                'mac': wlan_mac,
                'ipv4': wlan_ip or 'Disconnected'
            }
        },
        'default_gateway': out("ip route | grep default | awk '{print $3}'"),
        'dns_servers': out("grep nameserver /etc/resolv.conf | awk '{print $2}'").split()
    },
    'storage': {
        'block_devices': out('lsblk -o NAME,SIZE,FSTYPE,TYPE,MOUNTPOINT'),
        'sd_card_model': out('cat /sys/block/mmcblk0/device/name'),
        'sd_card_manfid': out('cat /sys/block/mmcblk0/device/manfid'),
        'sd_card_date': out('cat /sys/block/mmcblk0/device/date'),
        'sd_card_capacity': out('cat /sys/block/mmcblk0/size')
    },
    'buses': {
        'pci_devices': [l for l in out('lspci').splitlines() if l.strip()],
        'usb_devices': [l for l in out('lsusb').splitlines() if l.strip()]
    }
}
print(json.dumps(details))
"""

DEFAULT_CONFIG = {
    "pi_host": "192.168.1.9",
    "pi_user": "pi",
    "pi_port": 22,
    "server_port": 5055,
    "poll_interval_sec": 3.0,
    "history_points": 60
}


def load_config():
    cfg = dict(DEFAULT_CONFIG)
    bundled_cfg = os.path.join(BUNDLE_DIR, 'config.json')
    if os.path.exists(bundled_cfg):
        try:
            with open(bundled_cfg, 'r', encoding='utf-8') as f:
                cfg.update(json.load(f))
        except Exception:
            pass
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                cfg.update(json.load(f))
        except Exception:
            pass
    return cfg


def save_config(cfg):
    try:
        os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, indent=2)
        return True
    except Exception:
        return False


class PiPoller:
    def __init__(self, config):
        self.config = config
        self.lock = threading.Lock()
        self.latest_metrics = {
            "online": False,
            "last_updated": 0,
            "latency_ms": 0,
            "hostname": "hermes-pi",
            "model": "Raspberry Pi 5 (8GB)",
            "cpu": {
                "load_1m": 0.0,
                "load_5m": 0.0,
                "load_15m": 0.0,
                "temp_c": 0.0,
                "clock_mhz": 0,
                "throttled": "0x0",
                "throttled_text": "Normal"
            },
            "memory": {
                "total_bytes": 0,
                "used_bytes": 0,
                "free_bytes": 0,
                "available_bytes": 0,
                "percent": 0.0,
                "swap_total_bytes": 0,
                "swap_used_bytes": 0,
                "swap_percent": 0.0
            },
            "disks": [],
            "network": {
                "interfaces": {},
                "rx_rate_kbps": 0.0,
                "tx_rate_kbps": 0.0
            },
            "system": {
                "uptime_seconds": 0,
                "uptime_text": "--",
                "kernel": "--",
                "os": "Debian GNU/Linux"
            },
            "top_processes": []
        }
        self.history = collections.deque(maxlen=self.config.get("history_points", 60))
        self.prev_net = {}
        self.prev_net_time = 0
        self.running = True
        self.system_details = None

    def fetch_system_details(self, force=False):
        if self.system_details and not force:
            return self.system_details
        host = self.config.get('pi_host', '192.168.1.9')
        user = self.config.get('pi_user', 'pi')
        port = str(self.config.get('pi_port', 22))

        raw = None
        if is_local_host(host):
            try:
                local_cmd = [sys.executable or 'python3', '-c', SYSTEM_DETAILS_CODE]
                raw = host_check_output(local_cmd, stderr=subprocess.DEVNULL, timeout=5.0, text=True)
            except Exception:
                raw = None

        if raw is None:
            ssh_cmd = [
                'ssh', '-p', port,
                '-o', 'BatchMode=yes',
                '-o', 'ConnectTimeout=3',
                f"{user}@{host}",
                f"python3 - <<'PY'\n{SYSTEM_DETAILS_CODE}\nPY"
            ]
            try:
                raw = host_check_output(ssh_cmd, stderr=subprocess.DEVNULL, timeout=6.0, text=True)
            except Exception:
                if sys.platform.startswith('linux') and (os.path.exists('/sys/class/thermal/thermal_zone0') or os.path.exists('/proc/device-tree/model')):
                    try:
                        local_cmd = [sys.executable or 'python3', '-c', SYSTEM_DETAILS_CODE]
                        raw = host_check_output(local_cmd, stderr=subprocess.DEVNULL, timeout=5.0, text=True)
                    except Exception:
                        raw = None

        if raw:
            for line in raw.strip().splitlines():
                line = line.strip()
                if line.startswith('{') and line.endswith('}'):
                    try:
                        self.system_details = json.loads(line)
                        return self.system_details
                    except Exception:
                        pass
        return self.system_details or {}

    def parse_metrics(self, raw_data, duration_ms):
        now = time.time()
        local_model = "Raspberry Pi 5"
        if os.path.exists('/proc/device-tree/model'):
            try:
                with open('/proc/device-tree/model', 'r') as f:
                    local_model = f.read().strip('\x00\n')
            except Exception:
                pass
        curr_host = self.config.get("pi_host", "raspberrypi")
        try:
            if is_local_host(curr_host):
                curr_host = socket.gethostname()
        except Exception:
            pass
        res = {
            "online": True,
            "last_updated": now,
            "latency_ms": round(duration_ms, 1),
            "hostname": curr_host,
            "model": local_model,
            "cpu": {
                "load_1m": 0.0,
                "load_5m": 0.0,
                "load_15m": 0.0,
                "temp_c": 0.0,
                "clock_mhz": 0,
                "throttled": "0x0",
                "throttled_text": "Normal"
            },
            "memory": {
                "total_bytes": 0,
                "used_bytes": 0,
                "free_bytes": 0,
                "available_bytes": 0,
                "percent": 0.0,
                "swap_total_bytes": 0,
                "swap_used_bytes": 0,
                "swap_percent": 0.0
            },
            "disks": [],
            "network": {
                "interfaces": {},
                "rx_rate_kbps": 0.0,
                "tx_rate_kbps": 0.0
            },
            "system": {
                "uptime_seconds": 0,
                "uptime_text": "--",
                "kernel": "--",
                "os": "Debian GNU/Linux"
            },
            "top_processes": []
        }

        # 1. Temperature
        raw_temp = str(raw_data.get('temp', '')).strip()
        m_temp = re.search(r'temp=([\d\.]+)', raw_temp)
        if m_temp:
            res['cpu']['temp_c'] = round(float(m_temp.group(1)), 1)
        else:
            m_milli = re.search(r'(\d{4,6})', raw_temp)
            if m_milli:
                res['cpu']['temp_c'] = round(float(m_milli.group(1)) / 1000.0, 1)
            else:
                m_plain = re.search(r'(\d+\.\d+)', raw_temp)
                if m_plain:
                    res['cpu']['temp_c'] = round(float(m_plain.group(1)), 1)

        # 2. Clock Speed
        raw_clock = str(raw_data.get('clock', '')).strip()
        m_clock = re.search(r'frequency\(\d+\)=(\d+)', raw_clock)
        if m_clock:
            res['cpu']['clock_mhz'] = round(int(m_clock.group(1)) / 1_000_000)
        else:
            m_khz = re.search(r'(\d{6,8})', raw_clock)
            if m_khz:
                res['cpu']['clock_mhz'] = round(int(m_khz.group(1)) / 1000)

        # 3. Throttled
        m_thr = re.search(r'throttled=(0x[0-9a-fA-F]+)', raw_data.get('throttled', ''))
        if m_thr:
            hex_val = m_thr.group(1)
            res['cpu']['throttled'] = hex_val
            val = int(hex_val, 16)
            reasons = []
            if val & 0x1: reasons.append("Under-voltage")
            if val & 0x2: reasons.append("ARM frequency capped")
            if val & 0x4: reasons.append("Currently throttled")
            if val & 0x8: reasons.append("Soft temperature limit")
            res['cpu']['throttled_text'] = ", ".join(reasons) if reasons else "Normal"

        # 4. Load Average
        load_parts = raw_data.get('loadavg', '').split()
        if len(load_parts) >= 3:
            try:
                res['cpu']['load_1m'] = float(load_parts[0])
                res['cpu']['load_5m'] = float(load_parts[1])
                res['cpu']['load_15m'] = float(load_parts[2])
            except ValueError:
                pass

        # 5. Memory & Swap
        mem_lines = raw_data.get('mem', '').splitlines()
        for line in mem_lines:
            if line.startswith('Mem:'):
                parts = line.split()
                if len(parts) >= 7:
                    tot = int(parts[1])
                    used = int(parts[2])
                    free = int(parts[3])
                    avail = int(parts[6])
                    res['memory']['total_bytes'] = tot
                    res['memory']['used_bytes'] = used
                    res['memory']['free_bytes'] = free
                    res['memory']['available_bytes'] = avail
                    res['memory']['percent'] = round((used / tot) * 100, 1) if tot > 0 else 0
            elif line.startswith('Swap:'):
                parts = line.split()
                if len(parts) >= 4:
                    s_tot = int(parts[1])
                    s_used = int(parts[2])
                    res['memory']['swap_total_bytes'] = s_tot
                    res['memory']['swap_used_bytes'] = s_used
                    res['memory']['swap_percent'] = round((s_used / s_tot) * 100, 1) if s_tot > 0 else 0

        # 6. Disks
        df_lines = raw_data.get('df', '').splitlines()
        for line in df_lines[1:]:
            parts = line.split()
            if len(parts) >= 6:
                fs = parts[0]
                total_b = int(parts[1])
                used_b = int(parts[2])
                avail_b = int(parts[3])
                pct_str = parts[4].rstrip('%')
                pct = int(pct_str) if pct_str.isdigit() else 0
                mount = parts[5]
                res['disks'].append({
                    "filesystem": fs,
                    "mount": mount,
                    "total_bytes": total_b,
                    "used_bytes": used_b,
                    "available_bytes": avail_b,
                    "percent": pct
                })

        # 7. Uptime
        up_parts = raw_data.get('uptime', '').split()
        if up_parts:
            try:
                sec = int(float(up_parts[0]))
                res['system']['uptime_seconds'] = sec
                days = sec // 86400
                hours = (sec % 86400) // 3600
                mins = (sec % 3600) // 60
                if days > 0:
                    res['system']['uptime_text'] = f"{days}d {hours}h {mins}m"
                elif hours > 0:
                    res['system']['uptime_text'] = f"{hours}h {mins}m"
                else:
                    res['system']['uptime_text'] = f"{mins}m"
            except ValueError:
                pass

        # 8. Kernel / Hostname
        uname = raw_data.get('uname', '')
        if uname:
            u_parts = uname.split()
            if len(u_parts) >= 3:
                res['hostname'] = u_parts[1]
                res['system']['kernel'] = u_parts[2]

        # 9. Top processes
        proc_lines = raw_data.get('top_proc', '').splitlines()
        if len(proc_lines) > 1:
            for line in proc_lines[1:]:
                parts = line.split(None, 4)
                if len(parts) >= 5:
                    try:
                        res['top_processes'].append({
                            "pid": int(parts[0]),
                            "user": parts[1],
                            "cpu_pct": float(parts[2]),
                            "mem_pct": float(parts[3]),
                            "name": parts[4].strip()
                        })
                    except ValueError:
                        pass

        # 10. Network I/O Rates
        net_lines = raw_data.get('net_dev', '').splitlines()
        current_net = {}
        for line in net_lines:
            if ':' in line:
                iface, stats = line.split(':', 1)
                iface = iface.strip()
                s_parts = stats.split()
                if len(s_parts) >= 9:
                    rx_bytes = int(s_parts[0])
                    tx_bytes = int(s_parts[8])
                    current_net[iface] = {"rx": rx_bytes, "tx": tx_bytes}

        res['network']['interfaces'] = current_net
        if self.prev_net and self.prev_net_time > 0:
            dt = now - self.prev_net_time
            if dt > 0.1:
                total_rx_diff = 0
                total_tx_diff = 0
                for iface, vals in current_net.items():
                    if iface != 'lo' and iface in self.prev_net:
                        total_rx_diff += max(0, vals['rx'] - self.prev_net[iface]['rx'])
                        total_tx_diff += max(0, vals['tx'] - self.prev_net[iface]['tx'])
                res['network']['rx_rate_kbps'] = round((total_rx_diff * 8) / (dt * 1000), 1)
                res['network']['tx_rate_kbps'] = round((total_tx_diff * 8) / (dt * 1000), 1)

        self.prev_net = current_net
        self.prev_net_time = now

        return res

    def poll_once(self):
        host = self.config.get('pi_host', '192.168.1.9')
        user = self.config.get('pi_user', 'pi')
        port = str(self.config.get('pi_port', 22))

        telemetry_code = (
            "import subprocess, json, os;"
            "print(json.dumps({"
            "'temp': subprocess.getoutput('vcgencmd measure_temp 2>/dev/null || cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null'),"
            "'clock': subprocess.getoutput('vcgencmd measure_clock arm 2>/dev/null || cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq 2>/dev/null'),"
            "'throttled': subprocess.getoutput('vcgencmd get_throttled 2>/dev/null'),"
            "'loadavg': subprocess.getoutput('cat /proc/loadavg'),"
            "'mem': subprocess.getoutput('free -b'),"
            "'df': subprocess.getoutput('df -B1 -x tmpfs -x devtmpfs'),"
            "'uptime': subprocess.getoutput('cat /proc/uptime'),"
            "'uname': subprocess.getoutput('uname -a'),"
            "'top_proc': subprocess.getoutput('ps -eo pid,user,%cpu,%mem,comm --sort=-%cpu | head -n 8'),"
            "'net_dev': subprocess.getoutput('cat /proc/net/dev')"
            "}))"
        )

        out = None
        duration_ms = 0.0

        if is_local_host(host):
            t0 = time.time()
            try:
                local_cmd = [sys.executable or 'python3', '-c', telemetry_code]
                out = host_check_output(local_cmd, stderr=subprocess.DEVNULL, timeout=3.0, text=True)
                duration_ms = (time.time() - t0) * 1000
            except Exception:
                out = None

        if out is None:
            remote_script = f'python3 -c "{telemetry_code}"'
            ssh_cmd = [
                'ssh',
                '-p', port,
                '-o', 'BatchMode=yes',
                '-o', 'ConnectTimeout=2',
                f"{user}@{host}",
                remote_script
            ]
            t0 = time.time()
            try:
                out = host_check_output(ssh_cmd, stderr=subprocess.DEVNULL, timeout=4.0, text=True)
                duration_ms = (time.time() - t0) * 1000
            except Exception:
                if sys.platform.startswith('linux') and (os.path.exists('/sys/class/thermal/thermal_zone0') or os.path.exists('/proc/device-tree/model')):
                    try:
                        t0 = time.time()
                        local_cmd = [sys.executable or 'python3', '-c', telemetry_code]
                        out = host_check_output(local_cmd, stderr=subprocess.DEVNULL, timeout=3.0, text=True)
                        duration_ms = (time.time() - t0) * 1000
                    except Exception:
                        out = None

        if out:
            json_str = None
            for line in out.strip().splitlines():
                line = line.strip()
                if line.startswith('{') and line.endswith('}'):
                    json_str = line
                    break
            
            if not json_str:
                start = out.find('{')
                end = out.rfind('}')
                if start != -1 and end != -1 and end > start:
                    json_str = out[start:end+1]

            if json_str:
                try:
                    raw_data = json.loads(json_str)
                    metrics = self.parse_metrics(raw_data, duration_ms)
                    with self.lock:
                        self.latest_metrics = metrics
                        self.history.append({
                            "timestamp": round(metrics["last_updated"], 1),
                            "load_1m": metrics["cpu"]["load_1m"],
                            "temp_c": metrics["cpu"]["temp_c"],
                            "mem_percent": metrics["memory"]["percent"],
                            "rx_kbps": metrics["network"]["rx_rate_kbps"],
                            "tx_kbps": metrics["network"]["tx_rate_kbps"]
                        })
                    return metrics
                except Exception:
                    pass

        with self.lock:
            self.latest_metrics["online"] = False
            self.latest_metrics["latency_ms"] = 0
        return self.latest_metrics

    def worker_loop(self):
        while self.running:
            self.poll_once()
            interval = max(1.0, float(self.config.get('poll_interval_sec', 3.0)))
            time.sleep(interval)

    def get_snapshot(self):
        with self.lock:
            return {
                "metrics": dict(self.latest_metrics),
                "history": list(self.history),
                "config": {
                    "pi_host": self.config.get("pi_host"),
                    "pi_user": self.config.get("pi_user"),
                    "pi_port": self.config.get("pi_port", 22),
                    "poll_interval_sec": self.config.get("poll_interval_sec")
                }
            }


def launch_ssh_terminal(user, host, port):
    title = f'SSH - {user}@{host}'
    if sys.platform == 'win32':
        ssh_cmd = f"ssh -p {port} {user}@{host}"
        if shutil.which("wt.exe") or shutil.which("wt"):
            try:
                subprocess.Popen(["wt.exe", "-w", "0", "nt", "--title", title, "ssh", "-p", str(port), f"{user}@{host}"])
                return True
            except Exception:
                pass
        if shutil.which("powershell.exe"):
            try:
                subprocess.Popen(["powershell.exe", "-NoExit", "-Command", f"Write-Host 'Connecting to {user}@{host}...'; ssh -p {port} {user}@{host}"])
                return True
            except Exception:
                pass
        try:
            subprocess.Popen(f'start "{title}" cmd /k ssh -p {port} {user}@{host}', shell=True)
            return True
        except Exception as e:
            raise RuntimeError(f"Failed to launch Windows terminal: {e}")

    candidates = []
    if shutil.which('ptyxis'):
        candidates.append(['ptyxis', '--title', title, '--', 'ssh', '-p', str(port), f'{user}@{host}'])
    if shutil.which('gnome-terminal'):
        candidates.append(['gnome-terminal', '--title', title, '--', 'ssh', '-p', str(port), f'{user}@{host}'])
    if shutil.which('x-terminal-emulator'):
        candidates.append(['x-terminal-emulator', '-T', title, '-e', f'ssh -p {port} {user}@{host}'])
    if shutil.which('xfce4-terminal'):
        candidates.append(['xfce4-terminal', '--title', title, '-e', f'ssh -p {port} {user}@{host}'])
    if shutil.which('xterm'):
        candidates.append(['xterm', '-title', title, '-e', 'ssh', '-p', str(port), f'{user}@{host}'])

    for cmd in candidates:
        try:
            subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return True
        except Exception:
            continue
    raise RuntimeError("No supported terminal emulator found (ptyxis, x-terminal-emulator, gnome-terminal, xfce4-terminal)")


class MetricsRequestHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def do_GET(self):
        if self.path == '/api/metrics' or self.path.startswith('/api/metrics?'):
            data = poller.get_snapshot()
            self.send_json_response(data)
        elif self.path == '/api/details' or self.path.startswith('/api/details?'):
            force = 'refresh=true' in self.path
            details = poller.fetch_system_details(force=force)
            self.send_json_response({"ok": True, "details": details})
        elif self.path == '/api/health':
            snap = poller.get_snapshot()
            m = snap.get("metrics", {})
            self.send_json_response({
                "online": m.get("online", False),
                "latency_ms": m.get("latency_ms", 0),
                "host": poller.config.get("pi_host")
            })
        elif self.path == '/api/config':
            self.send_json_response({"ok": True, "config": poller.config})
        elif self.path == '/' or self.path == '/index.html':
            self.path = '/index.html'
            return super().do_GET()
        else:
            return super().do_GET()

    def do_POST(self):
        if self.path == '/api/action/terminal':
            host = poller.config.get('pi_host', '192.168.1.9')
            user = poller.config.get('pi_user', 'pi')
            port = str(poller.config.get('pi_port', 22))
            try:
                launch_ssh_terminal(user, host, port)
                self.send_json_response({"ok": True, "message": "Terminal launched"})
            except Exception as e:
                self.send_json_response({"ok": False, "error": str(e)}, status=500)
        elif self.path == '/api/action/refresh':
            threading.Thread(target=poller.poll_once, daemon=True).start()
            self.send_json_response({"ok": True, "message": "Polling initiated"})
        elif self.path == '/api/config':
            try:
                length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(length)
                new_cfg = json.loads(body.decode('utf-8'))
                for k in ['poll_interval_sec', 'pi_host', 'pi_user', 'pi_port']:
                    if k in new_cfg:
                        poller.config[k] = new_cfg[k]
                save_config(poller.config)
                # Reset details and trigger immediate poll with new IP
                poller.system_details = None
                with poller.lock:
                    poller.latest_metrics["online"] = False
                    poller.latest_metrics["hostname"] = poller.config.get("pi_host", "raspberrypi")
                threading.Thread(target=poller.poll_once, daemon=True).start()
                self.send_json_response({"ok": True, "config": poller.config})
            except Exception as e:
                self.send_json_response({"ok": False, "error": str(e)}, status=400)
        elif self.path == '/api/test_connection':
            try:
                length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(length)
                req = json.loads(body.decode('utf-8'))
                test_host = req.get('host', '').strip()
                test_user = req.get('user', 'pi').strip()
                test_port = int(req.get('port', 22))

                if not test_host:
                    self.send_json_response({"ok": False, "error": "Host or IP address cannot be empty"}, status=400)
                    return

                t0 = time.time()
                # 0. Quick local check if test_host is local and running on Linux / Pi
                if is_local_host(test_host) and (os.path.exists('/proc/device-tree/model') or sys.platform.startswith('linux')):
                    try:
                        out = host_check_output("cat /proc/device-tree/model 2>/dev/null || uname -m", shell=True, timeout=2.0, text=True)
                        model_str = out.strip().replace('\x00', '') or "Raspberry Pi (Local)"
                        latency_ms = round((time.time() - t0) * 1000, 1)
                        self.send_json_response({
                            "ok": True,
                            "host": test_host,
                            "latency_ms": latency_ms,
                            "model": model_str
                        })
                        return
                    except Exception:
                        pass

                # 1. Quick TCP socket test
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(2.5)
                try:
                    sock.connect((test_host, test_port))
                    sock.close()
                except Exception as sock_err:
                    self.send_json_response({
                        "ok": False,
                        "error": f"Cannot reach {test_host}:{test_port} — {sock_err}"
                    })
                    return

                # 2. Quick SSH probe
                ssh_cmd = [
                    'ssh', '-p', str(test_port),
                    '-o', 'BatchMode=yes',
                    '-o', 'ConnectTimeout=3',
                    '-o', 'StrictHostKeyChecking=accept-new',
                    f"{test_user}@{test_host}",
                    "cat /proc/device-tree/model 2>/dev/null || uname -m"
                ]
                try:
                    out = host_check_output(ssh_cmd, stderr=subprocess.STDOUT, timeout=4.0, text=True)
                    latency_ms = round((time.time() - t0) * 1000, 1)
                    clean_lines = [l.strip().replace('\x00', '') for l in out.strip().splitlines() if l.strip() and not l.startswith('Please note') and not l.startswith('See http')]
                    model_str = clean_lines[-1] if clean_lines else "Raspberry Pi"
                    self.send_json_response({
                        "ok": True,
                        "host": test_host,
                        "latency_ms": latency_ms,
                        "model": model_str
                    })
                except subprocess.CalledProcessError as cpe:
                    out_text = cpe.output.strip() if cpe.output else "Authentication failed"
                    self.send_json_response({
                        "ok": False,
                        "error": f"Device responded on port {test_port}, but SSH auth failed ({out_text}). Ensure SSH key is copied (`ssh-copy-id {test_user}@{test_host}`)."
                    })
                except Exception as e:
                    self.send_json_response({
                        "ok": False,
                        "error": f"SSH error: {e}"
                    })
            except Exception as e:
                self.send_json_response({"ok": False, "error": str(e)}, status=400)
        else:
            self.send_error(404, "Endpoint not found")

    def send_json_response(self, data, status=200):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        # Silence verbose standard GET logging to keep terminal output clean
        pass


_http_server = None
_poller = None


def start_background_server(port=None, host=None):
    global _http_server, _poller, poller, STATIC_DIR, CONFIG_FILE
    STATIC_DIR = get_static_dir()
    CONFIG_FILE = get_config_file_path()
    cfg = load_config()
    server_port = int(port or cfg.get('server_port', 5055))
    bind_host = host or ('127.0.0.1' if sys.platform == 'win32' else '0.0.0.0')

    poller = PiPoller(cfg)
    _poller = poller

    _http_server = ThreadingHTTPServer((bind_host, server_port), MetricsRequestHandler)
    print(f"🚀 Pi Metrics server listening on http://{bind_host}:{server_port}")

    poll_thread = threading.Thread(target=poller.worker_loop, daemon=True)
    poll_thread.start()

    threading.Thread(target=poller.fetch_system_details, daemon=True).start()

    server_thread = threading.Thread(target=_http_server.serve_forever, daemon=True)
    server_thread.start()
    return _http_server


def stop_background_server():
    global _http_server, _poller
    if _poller:
        _poller.running = False
    if _http_server:
        try:
            _http_server.shutdown()
            _http_server.server_close()
        except Exception:
            pass


def main():
    global poller
    cfg = load_config()
    poller = PiPoller(cfg)

    port = int(cfg.get('server_port', 5055))
    bind_host = '127.0.0.1' if sys.platform == 'win32' else '0.0.0.0'
    server = ThreadingHTTPServer((bind_host, port), MetricsRequestHandler)
    print(f"🚀 Pi Metrics server listening on http://localhost:{port}")

    # Start background polling thread (runs first poll in background immediately)
    poll_thread = threading.Thread(target=poller.worker_loop, daemon=True)
    poll_thread.start()

    # Pre-fetch system details in background
    threading.Thread(target=poller.fetch_system_details, daemon=True).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down Pi Metrics server.")
        poller.running = False
        server.server_close()


if __name__ == '__main__':
    main()
