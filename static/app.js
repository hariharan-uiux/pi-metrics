// Pi Metrics - Modern Live Dashboard Client

let pollTimer = null;
let currentPollInterval = 3000;
let historyData = [];

// DOM Elements
const statusPill = document.getElementById('statusPill');
const statusDot = document.getElementById('statusDot');
const statusLabel = document.getElementById('statusLabel');
const latencyLabel = document.getElementById('latencyLabel');
const topHostInfo = document.getElementById('topHostInfo');

const tempValue = document.getElementById('tempValue');
const tempBadge = document.getElementById('tempBadge');
const tempFill = document.getElementById('tempFill');
const clockValue = document.getElementById('clockValue');
const throttledValue = document.getElementById('throttledValue');

const loadValue = document.getElementById('loadValue');
const loadFill = document.getElementById('loadFill');
const load5Value = document.getElementById('load5Value');
const load15Value = document.getElementById('load15Value');

const memUsedValue = document.getElementById('memUsedValue');
const memTotalUnit = document.getElementById('memTotalUnit');
const memBadge = document.getElementById('memBadge');
const memFill = document.getElementById('memFill');
const memAvailValue = document.getElementById('memAvailValue');
const swapValue = document.getElementById('swapValue');

const netRxRate = document.getElementById('netRxRate');
const netTxRate = document.getElementById('netTxRate');
const netFill = document.getElementById('netFill');
const netTotalRx = document.getElementById('netTotalRx');
const netTotalTx = document.getElementById('netTotalTx');
const netActiveIface = document.getElementById('netActiveIface');

const storageList = document.getElementById('storageList');
const procTableBody = document.getElementById('procTableBody');

const fHardware = document.getElementById('fHardware');
const fOs = document.getElementById('fOs');
const fKernel = document.getElementById('fKernel');
const fUptime = document.getElementById('fUptime');

const pollSelect = document.getElementById('pollSelect');
const btnRefresh = document.getElementById('btnRefresh');
const btnSsh = document.getElementById('btnSsh');

const canvas = document.getElementById('trendChart');
const ctx = canvas ? canvas.getContext('2d') : null;

function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatRate(kbps) {
  if (kbps >= 1024) {
    return (kbps / 1024).toFixed(1) + ' MB/s';
  }
  return kbps.toFixed(1) + ' KB/s';
}

function updateStatus(isOnline, latencyMs, hostname, hostIp) {
  statusPill.classList.toggle('online', isOnline);
  statusPill.classList.toggle('offline', !isOnline);

  if (isOnline) {
    statusLabel.textContent = 'ONLINE';
    latencyLabel.textContent = `${latencyMs} ms`;
    topHostInfo.textContent = `${hostname || 'hermes-pi'} · ${hostIp || '192.168.1.9'}`;
  } else {
    statusLabel.textContent = 'OFFLINE';
    latencyLabel.textContent = 'UNREACHABLE';
  }
}

function updateMetricsUI(m) {
  if (!m) return;

  const isOnline = !!m.online;
  updateStatus(isOnline, m.latency_ms || 0, m.hostname, m.network ? '192.168.1.9' : '');

  if (!isOnline) {
    tempValue.textContent = '--';
    loadValue.textContent = '--';
    memUsedValue.textContent = '--';
    return;
  }

  // 1. CPU & Temp
  const temp = m.cpu ? m.cpu.temp_c : 0;
  tempValue.textContent = temp.toFixed(1);
  const tempPct = Math.min(100, Math.max(0, ((temp - 30) / (85 - 30)) * 100));
  tempFill.style.width = `${tempPct}%`;

  if (temp >= 75) {
    tempBadge.textContent = 'Critical';
    tempBadge.className = 'card-badge danger';
  } else if (temp >= 60) {
    tempBadge.textContent = 'Warm';
    tempBadge.className = 'card-badge warn';
  } else {
    tempBadge.textContent = 'Normal';
    tempBadge.className = 'card-badge';
  }

  clockValue.textContent = m.cpu && m.cpu.clock_mhz ? `${m.cpu.clock_mhz} MHz` : '-- MHz';
  throttledValue.textContent = m.cpu ? `${m.cpu.throttled} (${m.cpu.throttled_text})` : '0x0 (Normal)';

  // 2. CPU Load
  const l1 = m.cpu ? m.cpu.load_1m : 0;
  const l5 = m.cpu ? m.cpu.load_5m : 0;
  const l15 = m.cpu ? m.cpu.load_15m : 0;
  loadValue.textContent = l1.toFixed(2);
  load5Value.textContent = l5.toFixed(2);
  load15Value.textContent = l15.toFixed(2);

  // 4 cores on Pi 5: load / 4 * 100
  const cpuPct = Math.min(100, Math.max(0, (l1 / 4.0) * 100));
  loadFill.style.width = `${cpuPct}%`;

  // 3. Memory
  if (m.memory) {
    const usedGb = (m.memory.used_bytes / (1024 ** 3)).toFixed(1);
    const totGb = (m.memory.total_bytes / (1024 ** 3)).toFixed(1);
    const availGb = (m.memory.available_bytes / (1024 ** 3)).toFixed(1);
    const pct = m.memory.percent || 0;

    memUsedValue.textContent = usedGb;
    memTotalUnit.textContent = `/ ${totGb} GB`;
    memBadge.textContent = `${pct}%`;
    memFill.style.width = `${pct}%`;
    memAvailValue.textContent = `${availGb} GB`;

    const sUsedGb = (m.memory.swap_used_bytes / (1024 ** 3)).toFixed(1);
    const sTotGb = (m.memory.swap_total_bytes / (1024 ** 3)).toFixed(1);
    swapValue.textContent = `${sUsedGb} / ${sTotGb} GB`;
  }

  // 4. Network
  if (m.network) {
    netRxRate.textContent = formatRate(m.network.rx_rate_kbps || 0);
    netTxRate.textContent = formatRate(m.network.tx_rate_kbps || 0);

    const ifaces = Object.keys(m.network.interfaces || {}).filter(k => k !== 'lo');
    netActiveIface.textContent = ifaces.length ? ifaces.join(', ') : 'lo';

    let totalRxB = 0;
    let totalTxB = 0;
    for (const [_, vals] of Object.entries(m.network.interfaces || {})) {
      totalRxB += vals.rx || 0;
      totalTxB += vals.tx || 0;
    }
    netTotalRx.textContent = formatBytes(totalRxB);
    netTotalTx.textContent = formatBytes(totalTxB);

    const netPct = Math.min(100, Math.max(5, ((m.network.rx_rate_kbps + m.network.tx_rate_kbps) / 2000) * 100));
    netFill.style.width = `${netPct}%`;
  }

  // 5. Storage
  if (m.disks && m.disks.length) {
    storageList.innerHTML = m.disks.map(d => {
      const uStr = formatBytes(d.used_bytes);
      const tStr = formatBytes(d.total_bytes);
      return `
        <div class="storage-item">
          <div class="storage-item-header">
            <span class="storage-name">
              <span>💽</span>
              <span>${d.mount === '/' ? 'MicroSD Root (/)' : d.mount}</span>
              <span class="storage-mount">${d.filesystem}</span>
            </span>
            <span class="storage-usage">${uStr} / ${tStr} (${d.percent}%)</span>
          </div>
          <div class="storage-bar-track">
            <div class="storage-bar-fill" style="width: ${d.percent}%;"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 6. Top Processes
  if (m.top_processes && m.top_processes.length) {
    procTableBody.innerHTML = m.top_processes.map(p => `
      <tr>
        <td style="color: var(--text-tertiary);">${p.pid}</td>
        <td class="proc-user">${p.user}</td>
        <td style="color: var(--pi-cyan);">${p.cpu_pct.toFixed(1)}%</td>
        <td style="color: var(--pi-purple);">${p.mem_pct.toFixed(1)}%</td>
        <td class="proc-cmd">${p.name}</td>
      </tr>
    `).join('');
  }

  // 7. System Footer
  if (m.system) {
    fUptime.textContent = m.system.uptime_text || '--';
    if (m.system.kernel) fKernel.textContent = m.system.kernel;
  }
}

// -------------------------------------------------------------
// Real-time Canvas Line Chart Renderer
// -------------------------------------------------------------
function resizeCanvas() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
}

function drawChart() {
  if (!ctx || !canvas) return;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  ctx.clearRect(0, 0, w, h);

  if (!historyData || historyData.length < 2) {
    ctx.fillStyle = '#586069';
    ctx.font = '12px -apple-system, sans-serif';
    ctx.fillText('Collecting historical telemetry...', 15, h / 2);
    return;
  }

  // Draw Grid Lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const y = (h / gridSteps) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  const n = historyData.length;
  const stepX = w / (n - 1);

  // Series 1: Temperature (Range: 30°C to 80°C)
  drawSeries(historyData.map(d => (d.temp_c - 30) / 50), '#30d158', stepX, h, true);

  // Series 2: CPU Load (Range: 0 to 4.0)
  drawSeries(historyData.map(d => d.load_1m / 4.0), '#0a84ff', stepX, h, false);

  // Series 3: Memory % (Range: 0 to 100%)
  drawSeries(historyData.map(d => d.mem_percent / 100.0), '#af52de', stepX, h, false);
}

function drawSeries(normValues, color, stepX, h, fillGradient) {
  if (!normValues.length) return;

  ctx.beginPath();
  const pts = normValues.map((v, i) => {
    const clamped = Math.min(1.0, Math.max(0.0, v));
    const x = i * stepX;
    const y = h - (clamped * (h - 20) + 10);
    return { x, y };
  });

  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Glow on the latest point
  const last = pts[pts.length - 1];
  ctx.beginPath();
  ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.shadowBlur = 0;
}

// -------------------------------------------------------------
// Data Fetching & Polling Loop
// -------------------------------------------------------------
async function fetchMetrics() {
  try {
    const res = await fetch('/api/metrics');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.metrics) {
      updateMetricsUI(data.metrics);
    }
    if (data.history) {
      historyData = data.history;
      drawChart();
    }
  } catch (err) {
    updateStatus(false, 0);
  }
}

function startPolling(intervalMs) {
  if (pollTimer) clearInterval(pollTimer);
  currentPollInterval = intervalMs;
  pollTimer = setInterval(fetchMetrics, currentPollInterval);
  fetchMetrics();
}

// -------------------------------------------------------------
// Event Listeners
// -------------------------------------------------------------
btnRefresh.addEventListener('click', () => {
  btnRefresh.classList.add('loading');
  fetchMetrics().finally(() => {
    btnRefresh.classList.remove('loading');
  });
});

btnSsh.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/action/terminal', { method: 'POST' });
    const data = await res.json();
    if (!data.ok) {
      alert('Failed to launch SSH terminal: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Request failed: ' + err.message);
  }
});

pollSelect.addEventListener('change', (e) => {
  const sec = parseInt(e.target.value, 10) || 3;
  startPolling(sec * 1000);
});

window.addEventListener('resize', () => {
  resizeCanvas();
  drawChart();
});

// Initialization
window.addEventListener('DOMContentLoaded', () => {
  resizeCanvas();
  startPolling(currentPollInterval);
});
