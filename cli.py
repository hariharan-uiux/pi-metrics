#!/usr/bin/env python3
"""
Pi Metrics CLI - Command Line Hardware Monitor for Raspberry Pi 5
Run `python3 cli.py` to view live Pi metrics in the terminal.
"""

import json
import os
import subprocess
import sys
import time

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)
from server import load_config, PiPoller

# ANSI color codes
C_RESET = "\033[0m"
C_BOLD = "\033[1m"
C_RASPBERRY = "\033[38;2;227;11;93m"
C_GREEN = "\033[38;2;48;209;88m"
C_AMBER = "\033[38;2;255;214;10m"
C_RED = "\033[38;2;255;69;58m"
C_BLUE = "\033[38;2;10;132;255m"
C_PURPLE = "\033[38;2;175;82;222m"
C_CYAN = "\033[38;2;56;189;248m"
C_DIM = "\033[2m"


def render_cli(m):
    os.system('clear' if os.name != 'nt' else 'cls')
    is_online = m.get('online', False)
    status_str = f"{C_GREEN}● ONLINE{C_RESET}" if is_online else f"{C_RED}● OFFLINE{C_RESET}"
    latency = f"{m.get('latency_ms', 0):.1f} ms"

    print(f"{C_BOLD}{C_RASPBERRY}🍓 PI METRICS{C_RESET} {C_DIM}— Raspberry Pi 5 Hardware Monitor{C_RESET}")
    ifaces = [k for k in m.get('network', {}).get('interfaces', {}).keys() if k != 'lo']
    iface_str = f" ({', '.join(ifaces)})" if ifaces else ""
    print(f"Host: {C_BOLD}{m.get('hostname', 'hermes-pi')}{C_RESET}{iface_str} | Status: {status_str} | Latency: {latency}")
    print("━" * 68)

    if not is_online:
        print(f"\n{C_RED}Cannot connect to Raspberry Pi over SSH.{C_RESET}")
        return

    # CPU & Temp
    cpu = m.get('cpu', {})
    temp = cpu.get('temp_c', 0)
    t_color = C_RED if temp >= 75 else (C_AMBER if temp >= 60 else C_GREEN)
    clock = cpu.get('clock_mhz', 0)
    throttled = cpu.get('throttled_text', 'Normal')

    print(f"{C_BOLD}CPU & Temperature:{C_RESET}")
    print(f"  SoC Temp:     {t_color}{C_BOLD}{temp:.1f}°C{C_RESET}  (Clock: {clock} MHz | Throttling: {throttled})")
    print(f"  Load Average: {C_CYAN}{cpu.get('load_1m', 0):.2f}{C_RESET} (1m), {cpu.get('load_5m', 0):.2f} (5m), {cpu.get('load_15m', 0):.2f} (15m)")

    # Memory
    mem = m.get('memory', {})
    used_gb = mem.get('used_bytes', 0) / (1024**3)
    tot_gb = mem.get('total_bytes', 0) / (1024**3)
    pct = mem.get('percent', 0)
    bar_len = 24
    filled = int((pct / 100) * bar_len)
    bar = f"{C_BLUE}{'█' * filled}{C_DIM}{'░' * (bar_len - filled)}{C_RESET}"

    print(f"\n{C_BOLD}Memory (LPDDR4X):{C_RESET}")
    print(f"  [{bar}] {pct:.1f}% ({used_gb:.1f} GB / {tot_gb:.1f} GB)")

    # Disks
    print(f"\n{C_BOLD}Filesystems:{C_RESET}")
    for d in m.get('disks', []):
        u_gb = d.get('used_bytes', 0) / (1024**3)
        t_gb = d.get('total_bytes', 0) / (1024**3)
        d_pct = d.get('percent', 0)
        d_filled = int((d_pct / 100) * bar_len)
        d_bar = f"{C_PURPLE}{'█' * d_filled}{C_DIM}{'░' * (bar_len - d_filled)}{C_RESET}"
        print(f"  {d.get('mount', '/'):<16} [{d_bar}] {d_pct}% ({u_gb:.1f} GB / {t_gb:.1f} GB)")

    # Network
    net = m.get('network', {})
    rx = net.get('rx_rate_kbps', 0)
    tx = net.get('tx_rate_kbps', 0)
    print(f"\n{C_BOLD}Network I/O:{C_RESET}")
    print(f"  RX: {C_GREEN}{rx:.1f} KB/s{C_RESET} | TX: {C_BLUE}{tx:.1f} KB/s{C_RESET}")

    # Top processes
    procs = m.get('top_processes', [])
    if procs:
        print(f"\n{C_BOLD}Top Active Processes:{C_RESET}")
        print(f"  {C_DIM}{'PID':<7} {'USER':<8} {'%CPU':<7} {'%MEM':<7} {'COMMAND'}{C_RESET}")
        for p in procs[:5]:
            print(f"  {p.get('pid', 0):<7} {p.get('user', ''):<8} {p.get('cpu_pct', 0):<7.1f} {p.get('mem_pct', 0):<7.1f} {p.get('name', '')}")

    # System Info
    sys_info = m.get('system', {})
    print(f"\n{C_DIM}Uptime: {sys_info.get('uptime_text', '--')} | Kernel: {sys_info.get('kernel', '--')}{C_RESET}")
    print(f"{C_DIM}Press Ctrl+C to exit.{C_RESET}")


def main():
    cfg = load_config()
    poller = PiPoller(cfg)
    try:
        while True:
            m = poller.poll_once()
            render_cli(m)
            time.sleep(cfg.get('poll_interval_sec', 3.0))
    except KeyboardInterrupt:
        print("\nExited.")


if __name__ == '__main__':
    main()
