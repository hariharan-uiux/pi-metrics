import React, { useEffect, useState } from "react"
import {
  Thermometer,
  Cpu,
  Layers,
  HardDrive,
  Activity,
  Terminal,
  RefreshCw,
  Clock,
  Wifi,
  Server,
  Zap,
  Copy,
  Check,
  ShieldCheck,
  Code,
  Radio,
  FileCode,
  Info,
  ChevronRight,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  X,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts"

interface MetricsData {
  online: boolean
  last_updated: number
  latency_ms: number
  hostname: string
  model: string
  cpu: {
    load_1m: number
    load_5m: number
    load_15m: number
    temp_c: number
    clock_mhz: number
    throttled: string
    throttled_text: string
  }
  memory: {
    total_bytes: number
    used_bytes: number
    free_bytes: number
    available_bytes: number
    percent: number
    swap_total_bytes: number
    swap_used_bytes: number
    swap_percent: number
  }
  disks: Array<{
    filesystem: string
    mount: string
    total_bytes: number
    used_bytes: number
    available_bytes: number
    percent: number
  }>
  network: {
    interfaces: Record<string, { rx: number; tx: number }>
    rx_rate_kbps: number
    tx_rate_kbps: number
  }
  system: {
    uptime_seconds: number
    uptime_text: string
    kernel: string
    os: string
  }
  top_processes: Array<{
    pid: number
    user: string
    cpu_pct: number
    mem_pct: number
    name: string
  }>
}

interface HistoryPoint {
  timestamp: number
  load_1m: number
  temp_c: number
  mem_percent: number
  rx_kbps: number
  tx_kbps: number
}

interface SystemDetails {
  hardware?: {
    model?: string
    revision?: string
    serial?: string
    soc?: string
    cpu_arch?: string
    cpu_cores?: number
    cpu_name?: string
    cpu_max_freq?: string
    cpu_min_freq?: string
    ram_total?: string
    ram_details?: string
    southbridge?: string
    power_ic?: string
    core_voltage?: string
    arm_clock?: string
    core_clock?: string
    rp1_temp_c?: number
  }
  firmware?: {
    bootloader_version?: string
    vcgencmd_version?: string
    config_txt?: string
  }
  os?: {
    distro?: string
    kernel?: string
    kernel_full?: string
    uptime_full?: string
    python_version?: string
    gcc_version?: string
    systemd_version?: string
  }
  network?: {
    hostname?: string
    interfaces?: Record<string, {
      name?: string
      state?: string
      mac?: string
      ipv4?: string
      ipv6?: string
      speed?: string
    }>
    default_gateway?: string
    dns_servers?: string[]
  }
  storage?: {
    block_devices?: string
    sd_card_model?: string
    sd_card_manfid?: string
    sd_card_date?: string
    sd_card_capacity?: string
  }
  buses?: {
    pci_devices?: string[]
    usb_devices?: string[]
  }
}

function formatBytes(bytes: number, decimals = 1) {
  if (!bytes || bytes <= 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + " " + sizes[i]
}

function formatRate(kbps: number) {
  if (kbps >= 1024) {
    return (kbps / 1024).toFixed(1) + " MB/s"
  }
  return kbps.toFixed(1) + " KB/s"
}

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("metrics")
  const [metrics, setMetrics] = useState<MetricsData | null>(null)
  const [details, setDetails] = useState<SystemDetails | null>(null)
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [detailsLoading, setDetailsLoading] = useState<boolean>(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pollInterval, setPollInterval] = useState<number>(3000)
  const [selectedChartTab, setSelectedChartTab] = useState<string>("temp")
  const [copiedSerial, setCopiedSerial] = useState(false)
  const [copiedJson, setCopiedJson] = useState(false)
  const [copiedKeyCmd, setCopiedKeyCmd] = useState(false)

  // Target Raspberry Pi connection configuration
  const [config, setConfig] = useState<{ pi_host: string; pi_user: string; pi_port: number }>({
    pi_host: "192.168.1.9",
    pi_user: "pi",
    pi_port: 22,
  })
  const [showIpModal, setShowIpModal] = useState<boolean>(false)
  const [inputHost, setInputHost] = useState<string>("192.168.1.9")
  const [inputUser, setInputUser] = useState<string>("pi")
  const [inputPort, setInputPort] = useState<number>(22)
  const [testStatus, setTestStatus] = useState<{
    state: "idle" | "testing" | "success" | "error"
    message?: string
    latency?: number
    model?: string
  }>({ state: "idle" })
  const [isSavingConfig, setIsSavingConfig] = useState<boolean>(false)

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/config")
      if (res.ok) {
        const data = await res.json()
        if (data.config) {
          setConfig(data.config)
          setInputHost(data.config.pi_host || "192.168.1.9")
          setInputUser(data.config.pi_user || "pi")
          setInputPort(Number(data.config.pi_port) || 22)
        }
      }
    } catch (e) {
      console.error("Failed to load config:", e)
    }
  }

  const fetchMetrics = async () => {
    try {
      const res = await fetch("/api/metrics")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.metrics) setMetrics(data.metrics)
      if (data.history) setHistory(data.history)
      if (data.config) setConfig(data.config)
      return data.metrics?.online === true
    } catch (err: any) {
      setMetrics((prev) => (prev ? { ...prev, online: false } : null))
      return false
    } finally {
      setLoading(false)
    }
  }

  const fetchDetails = async (force = false) => {
    try {
      setDetailsLoading(true)
      const res = await fetch(`/api/details${force ? "?refresh=true" : ""}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.details) setDetails(data.details)
    } catch (err) {
      console.error("Failed to load details:", err)
    } finally {
      setDetailsLoading(false)
    }
  }

  // Run startup initialization once on app mount
  useEffect(() => {
    fetchConfig()
    fetchMetrics().then((isUp) => {
      if (!isUp && !sessionStorage.getItem("pimetrics_ip_modal_shown")) {
        sessionStorage.setItem("pimetrics_ip_modal_shown", "true")
        setShowIpModal(true)
      }
    })
    fetchDetails()
  }, [])

  // Background polling interval
  useEffect(() => {
    const timer = setInterval(fetchMetrics, pollInterval)
    return () => clearInterval(timer)
  }, [pollInterval])

  // Listen for Escape key to close IP connection modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showIpModal) {
        sessionStorage.setItem("pimetrics_ip_prompt_dismissed", "true")
        setShowIpModal(false)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [showIpModal])

  const handleTestConnection = async () => {
    if (!inputHost.trim()) return
    setTestStatus({ state: "testing" })
    try {
      const res = await fetch("/api/test_connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: inputHost.trim(),
          user: inputUser.trim() || "pi",
          port: Number(inputPort) || 22,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setTestStatus({
          state: "success",
          latency: data.latency_ms,
          model: data.model,
          message: `Connected successfully! Latency: ${data.latency_ms} ms (${data.model || "Raspberry Pi"})`,
        })
      } else {
        setTestStatus({
          state: "error",
          message: data.error || "Connection test failed",
        })
      }
    } catch (err: any) {
      setTestStatus({
        state: "error",
        message: "Failed to reach Pi Metrics server: " + err.message,
      })
    }
  }

  const handleSaveConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!inputHost.trim()) return
    setIsSavingConfig(true)
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pi_host: inputHost.trim(),
          pi_user: inputUser.trim() || "pi",
          pi_port: Number(inputPort) || 22,
        }),
      })
      const data = await res.json()
      if (data.ok && data.config) {
        setConfig(data.config)
        sessionStorage.setItem("pimetrics_ip_prompt_dismissed", "true")
        setShowIpModal(false)
        setIsRefreshing(true)
        await fetchMetrics()
        await fetchDetails(true)
        setIsRefreshing(false)
      }
    } catch (err: any) {
      alert("Failed to save configuration: " + err.message)
    } finally {
      setIsSavingConfig(false)
    }
  }

  const handleManualRefresh = async () => {
    setIsRefreshing(true)
    if (activeTab === "details") {
      await fetchDetails(true)
    } else {
      await fetch("/api/action/refresh", { method: "POST" })
      await fetchMetrics()
    }
    setIsRefreshing(false)
  }

  const handleOpenTerminal = async () => {
    try {
      const res = await fetch("/api/action/terminal", { method: "POST" })
      const data = await res.json()
      if (!data.ok) alert(data.error || "Failed to open terminal")
    } catch (e: any) {
      alert("Failed to connect to API: " + e.message)
    }
  }

  const copyToClipboard = (text: string, type: "serial" | "json") => {
    navigator.clipboard.writeText(text)
    if (type === "serial") {
      setCopiedSerial(true)
      setTimeout(() => setCopiedSerial(false), 2000)
    } else {
      setCopiedJson(true)
      setTimeout(() => setCopiedJson(false), 2000)
    }
  }

  const isOnline = !!metrics?.online
  const temp = metrics?.cpu?.temp_c || 0
  const load1 = metrics?.cpu?.load_1m || 0
  const memPct = metrics?.memory?.percent || 0
  const memUsedGb = ((metrics?.memory?.used_bytes || 0) / 1024 ** 3).toFixed(1)
  const memTotGb = ((metrics?.memory?.total_bytes || 0) / 1024 ** 3).toFixed(1)

  const chartData = history.map((h) => ({
    time: new Date(h.timestamp * 1000).toLocaleTimeString([], { hour12: false, minute: "2-digit", second: "2-digit" }),
    temp: h.temp_c,
    load: h.load_1m,
    mem: h.mem_percent,
    rx: h.rx_kbps,
    tx: h.tx_kbps,
  }))

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col antialiased">
      {/* Top Header */}
      <header className="border-b border-border/40 bg-background/95 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">
          {/* Logo & Host */}
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
            <div className="h-8 w-8 sm:h-9 sm:w-9 bg-raspberry/15 border border-raspberry/30 flex items-center justify-center text-raspberry shadow-sm flex-shrink-0">
              <Zap className="h-4 w-4 sm:h-5 sm:w-5 fill-current text-raspberry" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <span className="font-extrabold tracking-tight text-sm sm:text-base text-foreground truncate">
                  PI METRICS
                </span>
                <span className="hidden xs:inline-block text-[10px] sm:text-xs px-1.5 py-0.5 bg-secondary text-muted-foreground font-mono font-medium">
                  Pi 5
                </span>
              </div>
              <div className="flex items-center space-x-1.5 mt-0.5">
                <p className="text-[10px] sm:text-xs text-muted-foreground font-mono truncate">
                  {metrics?.hostname || "raspberrypi"} · {config.pi_host}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setInputHost(config.pi_host)
                    setInputUser(config.pi_user)
                    setInputPort(config.pi_port)
                    setTestStatus({ state: "idle" })
                    setShowIpModal(true)
                  }}
                  className="text-[10px] text-raspberry hover:underline font-mono font-semibold cursor-pointer"
                  title="Change target IP address"
                >
                  [Change IP]
                </button>
              </div>
            </div>
          </div>

          {/* Connection Status Pill - Desktop */}
          <div className="hidden md:flex items-center space-x-2">
            <div className="flex items-center space-x-2 bg-secondary/60 border border-border/60 px-3 py-1 text-xs font-semibold">
              <span
                className={`h-2.5 w-2.5 ${
                  loading && !metrics
                    ? "bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.7)]"
                    : isOnline
                    ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]"
                    : "bg-destructive shadow-[0_0_8px_rgba(248,113,113,0.7)]"
                }`}
              />
              <span>{loading && !metrics ? "CONNECTING..." : isOnline ? "ONLINE" : "OFFLINE"}</span>
              <span className="text-muted-foreground font-mono border-l border-border/80 pl-2">
                {loading && !metrics ? "--" : isOnline ? `${metrics?.latency_ms || 0} ms` : "unreachable"}
              </span>
            </div>
          </div>

          {/* Actions & Controls */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 flex-shrink-0">
            {/* Mobile-only status pill */}
            <div className="flex md:hidden items-center space-x-1.5 bg-secondary/60 border border-border/60 px-2 py-1 text-[10px] font-mono">
              <span
                className={`h-2 w-2 ${
                  loading && !metrics
                    ? "bg-amber-400 animate-pulse"
                    : isOnline
                    ? "bg-emerald-400"
                    : "bg-destructive"
                }`}
              />
              <span className="text-muted-foreground">{isOnline ? `${Math.round(metrics?.latency_ms || 0)}ms` : "off"}</span>
            </div>

            {/* Change IP button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setInputHost(config.pi_host)
                setInputUser(config.pi_user)
                setInputPort(config.pi_port)
                setTestStatus({ state: "idle" })
                setShowIpModal(true)
              }}
              className="h-8 px-2 sm:px-3 text-xs active:scale-95 transition-transform border-dashed hover:border-solid hover:border-raspberry"
              title="Change target Raspberry Pi IP address"
            >
              <Radio className="h-3.5 w-3.5 text-raspberry" />
              <span className="hidden sm:inline ml-1.5 font-mono">{config.pi_host}</span>
              <span className="sm:hidden ml-1">IP</span>
            </Button>

            {/* Poll selector (hidden on details tab) */}
            {activeTab === "metrics" && (
              <div className="flex items-center space-x-1 text-[11px] sm:text-xs text-muted-foreground bg-secondary/50 border border-border/40 px-2 py-1">
                <span className="hidden sm:inline">Poll:</span>
                <select
                  value={pollInterval / 1000}
                  onChange={(e) => setPollInterval(Number(e.target.value) * 1000)}
                  className="bg-transparent text-foreground font-semibold outline-none cursor-pointer text-xs"
                >
                  <option value={1} className="bg-card">1s</option>
                  <option value={2} className="bg-card">2s</option>
                  <option value={3} className="bg-card">3s</option>
                  <option value={5} className="bg-card">5s</option>
                </select>
              </div>
            )}

            {/* Refresh button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualRefresh}
              disabled={isRefreshing || detailsLoading}
              className="h-8 px-2 sm:px-3 active:scale-95 transition-transform"
              title="Refresh telemetry"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing || detailsLoading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline ml-1.5">Refresh</span>
            </Button>

            {/* Terminal button */}
            <Button
              size="sm"
              onClick={handleOpenTerminal}
              className="h-8 px-2 sm:px-3 active:scale-95 transition-transform"
              title="Launch SSH terminal to Pi"
            >
              <Terminal className="h-3.5 w-3.5" />
              <span className="hidden xs:inline ml-1.5">SSH</span>
              <span className="hidden sm:inline">Terminal</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Offline Alert Banner with direct Connect / Change IP button */}
      {!loading && !isOnline && (
        <div className="bg-destructive/15 border-b border-destructive/40 px-3 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
          <div className="flex items-center space-x-2 text-destructive-foreground">
            <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
            <span>
              Cannot reach Raspberry Pi at <strong className="font-mono">{config.pi_host}</strong> (Port {config.pi_port}).
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setInputHost(config.pi_host)
                setInputUser(config.pi_user)
                setInputPort(config.pi_port)
                setTestStatus({ state: "idle" })
                setShowIpModal(true)
              }}
              className="h-7 text-xs font-semibold"
            >
              <Radio className="h-3 w-3 mr-1" />
              Change IP / Connect
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="h-7 text-xs"
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${isRefreshing ? "animate-spin" : ""}`} />
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Main Tab Switcher Bar */}
      <div className="bg-card/40 border-b border-border/30">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between">
          <div className="grid grid-cols-2 w-full sm:w-80 h-9 p-1 bg-secondary/80">
            <button
              type="button"
              id="tab-btn-metrics"
              onClick={() => setActiveTab("metrics")}
              className={`justify-center whitespace-nowrap px-3 py-1 transition-all text-xs font-semibold flex items-center space-x-1.5 ${
                activeTab === "metrics"
                  ? "bg-background text-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              <span>Live Metrics</span>
            </button>
            <button
              type="button"
              id="tab-btn-details"
              onClick={() => setActiveTab("details")}
              className={`justify-center whitespace-nowrap px-3 py-1 transition-all text-xs font-semibold flex items-center space-x-1.5 ${
                activeTab === "details"
                  ? "bg-background text-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Server className="h-3.5 w-3.5" />
              <span>Pi 5 Details</span>
              <span className="hidden sm:inline-block ml-1 px-1.5 py-0.5 text-[10px] bg-raspberry/20 text-raspberry font-bold">
                Specs
              </span>
            </button>
          </div>

          <div className="hidden sm:flex items-center space-x-2 text-xs text-muted-foreground font-mono">
            <span className="inline-block h-2 w-2 bg-raspberry"></span>
            <span>Broadcom BCM2712 Quad Cortex-A76 @ 2.4GHz</span>
          </div>
        </div>
      </div>

      {/* Tab 1: Live Telemetry Dashboard */}
      {activeTab === "metrics" && (
        <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6 flex-1 w-full">
          {/* Core Metric Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Card 1: SoC Temperature */}
            <Card className="p-4 sm:p-5 flex flex-col justify-between">
              <div>
                <CardHeader className="flex flex-row items-center justify-between p-0 pb-2 space-y-0">
                  <div className="flex items-center space-x-2">
                    <Thermometer className="h-4 w-4 text-emerald-400" />
                    <CardTitle className="text-xs">SoC Temperature</CardTitle>
                  </div>
                  <Badge variant={temp >= 75 ? "destructive" : temp >= 60 ? "warning" : "success"}>
                    {temp >= 75 ? "Critical" : temp >= 60 ? "Warm" : "Normal"}
                  </Badge>
                </CardHeader>
                <CardContent className="p-0 pt-1">
                  <div className="flex items-baseline space-x-1">
                    <span className="text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums">
                      {isOnline ? temp.toFixed(1) : "--"}
                    </span>
                    <span className="text-sm font-semibold text-muted-foreground">°C</span>
                  </div>
                  <div className="mt-2 sm:mt-3">
                    <Progress
                      value={isOnline ? Math.min(100, Math.max(0, ((temp - 30) / (85 - 30)) * 100)) : 0}
                      indicatorClassName={
                        temp >= 75
                          ? "bg-destructive"
                          : temp >= 60
                          ? "bg-amber-400"
                          : "bg-emerald-400"
                      }
                    />
                  </div>
                </CardContent>
              </div>
              <CardFooter className="p-0 pt-3 mt-3 border-t border-border/40 justify-between text-[11px] sm:text-xs text-muted-foreground font-mono">
                <div>
                  <span className="text-muted-foreground/60 mr-1">Clock:</span>
                  <span className="text-foreground">{metrics?.cpu?.clock_mhz || "--"} MHz</span>
                </div>
                <div>
                  <span className="text-muted-foreground/60 mr-1">Throttling:</span>
                  <span className="text-foreground">{metrics?.cpu?.throttled_text || "Normal"}</span>
                </div>
              </CardFooter>
            </Card>

            {/* Card 2: CPU Load */}
            <Card className="p-4 sm:p-5 flex flex-col justify-between">
              <div>
                <CardHeader className="flex flex-row items-center justify-between p-0 pb-2 space-y-0">
                  <div className="flex items-center space-x-2">
                    <Cpu className="h-4 w-4 text-sky-400" />
                    <CardTitle className="text-xs">CPU Load Average</CardTitle>
                  </div>
                  <Badge variant="info">4x A76</Badge>
                </CardHeader>
                <CardContent className="p-0 pt-1">
                  <div className="flex items-baseline space-x-1">
                    <span className="text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums">
                      {isOnline ? load1.toFixed(2) : "--"}
                    </span>
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">1m load</span>
                  </div>
                  <div className="mt-2 sm:mt-3">
                    <Progress
                      value={isOnline ? Math.min(100, (load1 / 4.0) * 100) : 0}
                      indicatorClassName="bg-sky-400"
                    />
                  </div>
                </CardContent>
              </div>
              <CardFooter className="p-0 pt-3 mt-3 border-t border-border/40 justify-between text-[11px] sm:text-xs text-muted-foreground font-mono">
                <div>
                  <span className="text-muted-foreground/60 mr-1">5m:</span>
                  <span className="text-foreground">{metrics?.cpu?.load_5m.toFixed(2) || "--"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground/60 mr-1">15m:</span>
                  <span className="text-foreground">{metrics?.cpu?.load_15m.toFixed(2) || "--"}</span>
                </div>
              </CardFooter>
            </Card>

            {/* Card 3: Memory */}
            <Card className="p-4 sm:p-5 flex flex-col justify-between">
              <div>
                <CardHeader className="flex flex-row items-center justify-between p-0 pb-2 space-y-0">
                  <div className="flex items-center space-x-2">
                    <Layers className="h-4 w-4 text-purple-400" />
                    <CardTitle className="text-xs">Memory (LPDDR4X)</CardTitle>
                  </div>
                  <Badge variant="secondary">{memPct}%</Badge>
                </CardHeader>
                <CardContent className="p-0 pt-1">
                  <div className="flex items-baseline space-x-1">
                    <span className="text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums">
                      {isOnline ? memUsedGb : "--"}
                    </span>
                    <span className="text-xs sm:text-sm font-semibold text-muted-foreground">/ {memTotGb} GB</span>
                  </div>
                  <div className="mt-2 sm:mt-3">
                    <Progress value={isOnline ? memPct : 0} indicatorClassName="bg-purple-400" />
                  </div>
                </CardContent>
              </div>
              <CardFooter className="p-0 pt-3 mt-3 border-t border-border/40 justify-between text-[11px] sm:text-xs text-muted-foreground font-mono">
                <div>
                  <span className="text-muted-foreground/60 mr-1">Avail:</span>
                  <span className="text-foreground">
                    {((metrics?.memory?.available_bytes || 0) / 1024 ** 3).toFixed(1)} GB
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground/60 mr-1">Swap:</span>
                  <span className="text-foreground">
                    {((metrics?.memory?.swap_used_bytes || 0) / 1024 ** 3).toFixed(1)} /{" "}
                    {((metrics?.memory?.swap_total_bytes || 0) / 1024 ** 3).toFixed(1)} GB
                  </span>
                </div>
              </CardFooter>
            </Card>

            {/* Card 4: Network */}
            <Card className="p-4 sm:p-5 flex flex-col justify-between">
              <div>
                <CardHeader className="flex flex-row items-center justify-between p-0 pb-2 space-y-0">
                  <div className="flex items-center space-x-2">
                    <Wifi className="h-4 w-4 text-emerald-400" />
                    <CardTitle className="text-xs">Network I/O</CardTitle>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {Object.keys(metrics?.network?.interfaces || {})
                      .filter((k) => k !== "lo")
                      .join(", ") || "eth0"}
                  </Badge>
                </CardHeader>
                <CardContent className="p-0 pt-1">
                  <div className="flex justify-between items-center py-0.5">
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase font-bold block">RX</span>
                      <span className="text-base sm:text-lg font-bold font-mono text-emerald-400">
                        {formatRate(metrics?.network?.rx_rate_kbps || 0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase font-bold block text-right">TX</span>
                      <span className="text-base sm:text-lg font-bold font-mono text-sky-400">
                        {formatRate(metrics?.network?.tx_rate_kbps || 0)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 sm:mt-3">
                    <Progress
                      value={Math.min(
                        100,
                        Math.max(5, (((metrics?.network?.rx_rate_kbps || 0) + (metrics?.network?.tx_rate_kbps || 0)) / 1000) * 100)
                      )}
                      indicatorClassName="bg-emerald-400"
                    />
                  </div>
                </CardContent>
              </div>
              <CardFooter className="p-0 pt-3 mt-3 border-t border-border/40 justify-between text-[11px] sm:text-xs text-muted-foreground font-mono">
                <div>
                  <span className="text-muted-foreground/60 mr-1">Tot RX:</span>
                  <span className="text-foreground">
                    {formatBytes(
                      Object.values(metrics?.network?.interfaces || {}).reduce((acc, curr) => acc + curr.rx, 0)
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground/60 mr-1">Tot TX:</span>
                  <span className="text-foreground">
                    {formatBytes(
                      Object.values(metrics?.network?.interfaces || {}).reduce((acc, curr) => acc + curr.tx, 0)
                    )}
                  </span>
                </div>
              </CardFooter>
            </Card>
          </div>

          {/* Charts & Interactive Trends */}
          <Card className="p-4 sm:p-5">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-0 pb-4 gap-3">
              <div>
                <CardTitle className="text-sm sm:text-base flex items-center space-x-2">
                  <Activity className="h-4 w-4 text-raspberry" />
                  <span>Real-Time Telemetry Trends</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Rolling buffer across the last 60 polling intervals
                </CardDescription>
              </div>
              <Tabs value={selectedChartTab} onValueChange={setSelectedChartTab} className="w-full sm:w-auto">
                <TabsList className="w-full sm:w-auto grid grid-cols-4 sm:flex h-8 sm:h-9">
                  <TabsTrigger value="temp" className="text-[11px] sm:text-xs px-2 py-1">SoC Temp</TabsTrigger>
                  <TabsTrigger value="load" className="text-[11px] sm:text-xs px-2 py-1">CPU Load</TabsTrigger>
                  <TabsTrigger value="mem" className="text-[11px] sm:text-xs px-2 py-1">Memory</TabsTrigger>
                  <TabsTrigger value="net" className="text-[11px] sm:text-xs px-2 py-1">Network</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent className="p-0">
              {chartData.length === 0 ? (
                <div className="h-52 sm:h-64 flex flex-col items-center justify-center text-xs text-muted-foreground font-mono space-y-2">
                  <RefreshCw className="h-5 w-5 animate-spin text-raspberry" />
                  <span>Gathering live telemetry data points...</span>
                </div>
              ) : (
                <div className="h-52 sm:h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#30d158" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#30d158" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorLoad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0a84ff" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#0a84ff" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorMem" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#af52de" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#af52de" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#e30b5d" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#e30b5d" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222734" vertical={false} />
                      <XAxis dataKey="time" stroke="#6b7280" fontSize={10} tickLine={false} />
                      <YAxis stroke="#6b7280" fontSize={10} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#131720",
                          borderColor: "#2a3142",
                          borderRadius: "0px",
                          fontSize: "11px",
                          fontFamily: "monospace",
                        }}
                      />
                      {selectedChartTab === "temp" && (
                        <Area
                          type="monotone"
                          dataKey="temp"
                          name="Temp (°C)"
                          stroke="#30d158"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#colorTemp)"
                        />
                      )}
                      {selectedChartTab === "load" && (
                        <Area
                          type="monotone"
                          dataKey="load"
                          name="1m Load"
                          stroke="#0a84ff"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#colorLoad)"
                        />
                      )}
                      {selectedChartTab === "mem" && (
                        <Area
                          type="monotone"
                          dataKey="mem"
                          name="Memory (%)"
                          stroke="#af52de"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#colorMem)"
                        />
                      )}
                      {selectedChartTab === "net" && (
                        <Area
                          type="monotone"
                          dataKey="rx"
                          name="RX (KB/s)"
                          stroke="#e30b5d"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#colorNet)"
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 2-Column Split on Desktop, Stacked on Mobile */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
            {/* Filesystem / Storage */}
            <Card className="lg:col-span-2 p-4 sm:p-5">
              <CardHeader className="p-0 pb-3">
                <CardTitle className="text-sm sm:text-base flex items-center space-x-2">
                  <HardDrive className="h-4 w-4 text-purple-400" />
                  <span>Filesystem & Partitions</span>
                </CardTitle>
                <CardDescription className="text-xs">MicroSD and mounted storage allocations</CardDescription>
              </CardHeader>
              <CardContent className="p-0 space-y-3">
                {metrics?.disks?.map((disk, idx) => (
                  <div key={idx} className="p-3 border border-border/50 bg-secondary/20 space-y-1.5">
                    <div className="flex items-center justify-between text-xs gap-1">
                      <span className="font-semibold text-foreground truncate">
                        {disk.mount === "/" ? "MicroSD Root (/)" : disk.mount}
                      </span>
                      <span className="font-mono text-muted-foreground flex-shrink-0 text-[11px]">
                        {formatBytes(disk.used_bytes)} / {formatBytes(disk.total_bytes)} ({disk.percent}%)
                      </span>
                    </div>
                    <Progress value={disk.percent} indicatorClassName="bg-purple-500" />
                    <div className="text-[10px] text-muted-foreground font-mono flex justify-between">
                      <span className="truncate">{disk.filesystem}</span>
                      <span className="flex-shrink-0">{formatBytes(disk.available_bytes)} free</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Top Processes Table */}
            <Card className="lg:col-span-3 p-4 sm:p-5">
              <CardHeader className="p-0 pb-3">
                <CardTitle className="text-sm sm:text-base flex items-center space-x-2">
                  <Server className="h-4 w-4 text-sky-400" />
                  <span>Top Active Processes</span>
                </CardTitle>
                <CardDescription className="text-xs">Real-time resource utilization by PID on Raspberry Pi 5</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="w-full overflow-x-auto -mx-1 sm:mx-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">PID</TableHead>
                        <TableHead className="hidden sm:table-cell">User</TableHead>
                        <TableHead className="w-16">% CPU</TableHead>
                        <TableHead className="w-16">% MEM</TableHead>
                        <TableHead>Command</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {metrics?.top_processes?.length ? (
                        metrics.top_processes.map((proc, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-muted-foreground py-2 text-[11px] sm:text-xs">{proc.pid}</TableCell>
                            <TableCell className="hidden sm:table-cell font-medium text-muted-foreground py-2 text-[11px] sm:text-xs">
                              {proc.user}
                            </TableCell>
                            <TableCell className="text-sky-400 font-bold py-2 text-[11px] sm:text-xs">
                              {proc.cpu_pct.toFixed(1)}%
                            </TableCell>
                            <TableCell className="text-purple-400 font-bold py-2 text-[11px] sm:text-xs">
                              {proc.mem_pct.toFixed(1)}%
                            </TableCell>
                            <TableCell className="text-foreground font-semibold truncate max-w-[120px] sm:max-w-[180px] py-2 text-[11px] sm:text-xs">
                              {proc.name}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground italic py-6 text-xs">
                            Waiting for process telemetry...
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      )}

      {/* Tab 2: Connected Pi System Details */}
      {activeTab === "details" && (
        <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5 flex-1 w-full">
          {/* Hero Hardware Identification Banner */}
          <Card className="p-4 sm:p-6 bg-gradient-to-br from-card via-card to-raspberry/5 border-raspberry/20">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center space-x-4">
                <div className="h-14 w-14 bg-raspberry/15 border border-raspberry/30 flex items-center justify-center text-raspberry flex-shrink-0 shadow-lg shadow-raspberry/10">
                  <Cpu className="h-8 w-8 text-raspberry" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                      {details?.hardware?.model || "Raspberry Pi 5 Model B Rev 1.0"}
                    </h2>
                    <Badge variant="outline" className="font-mono text-raspberry border-raspberry/40">
                      Rev {details?.hardware?.revision || "d04170"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                    SoC: {details?.hardware?.soc || "Broadcom BCM2712"} · Architecture: {details?.hardware?.cpu_arch || "aarch64"}
                  </p>
                </div>
              </div>

              {/* Serial & Action */}
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 pt-3 md:pt-0 border-border/40">
                <div className="flex items-center space-x-1.5 bg-secondary/80 border border-border/60 px-3 py-1.5 text-xs font-mono">
                  <span className="text-muted-foreground">Serial:</span>
                  <span className="text-foreground font-semibold">{details?.hardware?.serial || "2d2e599a0df2324a"}</span>
                  <button
                    onClick={() => copyToClipboard(details?.hardware?.serial || "2d2e599a0df2324a", "serial")}
                    className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
                    title="Copy serial number"
                  >
                    {copiedSerial ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchDetails(true)}
                  disabled={detailsLoading}
                  className="h-8 text-xs space-x-1.5"
                >
                  <RefreshCw className={`h-3 w-3 ${detailsLoading ? "animate-spin" : ""}`} />
                  <span>Reload Specs</span>
                </Button>
              </div>
            </div>
          </Card>

          {/* Detailed Specs Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. Silicon & Architecture */}
            <Card className="p-4 sm:p-5">
              <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center space-x-2">
                  <Cpu className="h-4 w-4 text-sky-400" />
                  <CardTitle className="text-xs">Processor & Silicon</CardTitle>
                </div>
                <Badge variant="info">Quad Core</Badge>
              </CardHeader>
              <CardContent className="p-0 space-y-2.5 text-xs font-mono">
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">Processor:</span>
                  <span className="font-semibold text-foreground text-right">{details?.hardware?.cpu_name || "ARM Cortex-A76"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">Clock Frequencies:</span>
                  <span className="font-semibold text-sky-400 text-right">
                    {details?.hardware?.cpu_min_freq || "1.5 GHz"} - {details?.hardware?.cpu_max_freq || "2.4 GHz"}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">Active Core Voltage:</span>
                  <span className="font-semibold text-foreground">{details?.hardware?.core_voltage || "0.9184V"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">Southbridge (I/O):</span>
                  <span className="font-semibold text-foreground text-right">RP1 PCIe 2.0 x4</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">RP1 Temperature:</span>
                  <span className="font-semibold text-emerald-400">{details?.hardware?.rp1_temp_c ? `${details.hardware.rp1_temp_c}°C` : "49.1°C"}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Power Management:</span>
                  <span className="font-semibold text-foreground">{details?.hardware?.power_ic || "Dialog DA9091 PMIC"}</span>
                </div>
              </CardContent>
            </Card>

            {/* 2. Memory & SDRAM */}
            <Card className="p-4 sm:p-5">
              <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center space-x-2">
                  <Layers className="h-4 w-4 text-purple-400" />
                  <CardTitle className="text-xs">Memory & Cache</CardTitle>
                </div>
                <Badge variant="secondary">8 GB LPDDR4X</Badge>
              </CardHeader>
              <CardContent className="p-0 space-y-2.5 text-xs font-mono">
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">RAM Spec:</span>
                  <span className="font-semibold text-purple-400">{details?.hardware?.ram_total || "8.0 GB LPDDR4X-4267"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">Physical Capacity:</span>
                  <span className="font-semibold text-foreground">{details?.hardware?.ram_details || "8453 MB SDRAM"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">L1 Cache:</span>
                  <span className="font-semibold text-foreground">256 KiB i / 256 KiB d</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">L2 Cache:</span>
                  <span className="font-semibold text-foreground">2 MiB (512 KiB per core)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">L3 Shared Cache:</span>
                  <span className="font-semibold text-foreground">2 MiB Unified</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">ZRAM Compressed Swap:</span>
                  <span className="font-semibold text-foreground">2.0 GB active</span>
                </div>
              </CardContent>
            </Card>

            {/* 3. Operating System & Software */}
            <Card className="p-4 sm:p-5">
              <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center space-x-2">
                  <Radio className="h-4 w-4 text-emerald-400" />
                  <CardTitle className="text-xs">Operating System</CardTitle>
                </div>
                <Badge variant="success">Debian 13</Badge>
              </CardHeader>
              <CardContent className="p-0 space-y-2.5 text-xs font-mono">
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">Distribution:</span>
                  <span className="font-semibold text-foreground text-right">{details?.os?.distro || "Debian GNU/Linux 13 (trixie)"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">Linux Kernel:</span>
                  <span className="font-semibold text-foreground text-right">{details?.os?.kernel || "6.18.50+rpt-rpi-2712"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">Init System:</span>
                  <span className="font-semibold text-foreground text-right">{details?.os?.systemd_version || "systemd 257"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">Python Runtime:</span>
                  <span className="font-semibold text-foreground">{details?.os?.python_version || "Python 3.13.5"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">C/C++ Compiler:</span>
                  <span className="font-semibold text-foreground">{details?.os?.gcc_version || "GCC 14.2.0"}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Hostname:</span>
                  <span className="font-semibold text-foreground">{details?.network?.hostname || "hermes-pi"}</span>
                </div>
              </CardContent>
            </Card>

            {/* 4. Network Interfaces & Routing */}
            <Card className="p-4 sm:p-5">
              <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center space-x-2">
                  <Wifi className="h-4 w-4 text-sky-400" />
                  <CardTitle className="text-xs">Network Configuration</CardTitle>
                </div>
                <Badge variant="outline">Gigabit Eth</Badge>
              </CardHeader>
              <CardContent className="p-0 space-y-2.5 text-xs font-mono">
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">eth0 IPv4:</span>
                  <span className="font-semibold text-emerald-400">{details?.network?.interfaces?.eth0?.ipv4 || "192.168.1.9/24"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">eth0 MAC Address:</span>
                  <span className="font-semibold text-foreground">{details?.network?.interfaces?.eth0?.mac || "d8:3a:dd:c5:de:f1"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">eth0 Link Speed:</span>
                  <span className="font-semibold text-foreground">{details?.network?.interfaces?.eth0?.speed || "100 Mbps"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">wlan0 MAC Address:</span>
                  <span className="font-semibold text-foreground">{details?.network?.interfaces?.wlan0?.mac || "d8:3a:dd:c5:de:f3"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">Default Gateway:</span>
                  <span className="font-semibold text-foreground">{details?.network?.default_gateway || "192.168.1.1"}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">DNS Resolvers:</span>
                  <span className="font-semibold text-foreground truncate max-w-[170px] text-right">
                    {details?.network?.dns_servers?.slice(0, 2).join(", ") || "45.90.28.193"}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* 5. Storage Hardware & MicroSD */}
            <Card className="p-4 sm:p-5">
              <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center space-x-2">
                  <HardDrive className="h-4 w-4 text-purple-400" />
                  <CardTitle className="text-xs">Storage Hardware</CardTitle>
                </div>
                <Badge variant="secondary">MicroSD 64GB</Badge>
              </CardHeader>
              <CardContent className="p-0 space-y-2.5 text-xs font-mono">
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">Card Model:</span>
                  <span className="font-semibold text-purple-400">{details?.storage?.sd_card_model || "SD64G"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">Manufacturer ID:</span>
                  <span className="font-semibold text-foreground">
                    {details?.storage?.sd_card_manfid || "0x000003"} (SanDisk)
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">Manufacturing Date:</span>
                  <span className="font-semibold text-foreground">{details?.storage?.sd_card_date || "06/2025"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">Boot Firmware Partition:</span>
                  <span className="font-semibold text-foreground">512 MB (vfat /boot)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">Root Partition:</span>
                  <span className="font-semibold text-foreground">59 GB (ext4 /)</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Sector Count:</span>
                  <span className="font-semibold text-foreground">{details?.storage?.sd_card_capacity || "124735488"}</span>
                </div>
              </CardContent>
            </Card>

            {/* 6. Firmware & EEPROM */}
            <Card className="p-4 sm:p-5">
              <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  <CardTitle className="text-xs">Firmware & Bootloader</CardTitle>
                </div>
                <Badge variant="outline">EEPROM</Badge>
              </CardHeader>
              <CardContent className="p-0 space-y-2.5 text-xs font-mono">
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">Bootloader Date:</span>
                  <span className="font-semibold text-foreground">2025/11/05</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">Firmware Build:</span>
                  <span className="font-semibold text-emerald-400">57db150d (release)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">64-bit Kernel Mode:</span>
                  <span className="font-semibold text-foreground">Enabled (arm_64bit=1)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">VideoCore Driver:</span>
                  <span className="font-semibold text-foreground">vc4-kms-v3d active</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">ARM Turbo Boost:</span>
                  <span className="font-semibold text-emerald-400">Enabled (arm_boost=1)</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Auto Camera Detect:</span>
                  <span className="font-semibold text-foreground">Enabled</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* PCIe & USB Expansion Topology */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* PCIe Devices */}
            <Card className="p-4 sm:p-5">
              <CardHeader className="p-0 pb-3">
                <CardTitle className="text-xs flex items-center space-x-2">
                  <FileCode className="h-4 w-4 text-raspberry" />
                  <span>PCI Express 2.0 Bus Topology (lspci)</span>
                </CardTitle>
                <CardDescription className="text-xs">Broadcom BCM2712 PCIe bridge & RP1 southbridge interconnect</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="space-y-2 font-mono text-xs">
                  {details?.buses?.pci_devices?.map((pci, idx) => (
                    <div key={idx} className="p-2.5 bg-secondary/30 border border-border/40 text-foreground">
                      {pci}
                    </div>
                  )) || (
                    <div className="text-muted-foreground italic">No PCIe devices reported.</div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* USB Root Hubs */}
            <Card className="p-4 sm:p-5">
              <CardHeader className="p-0 pb-3">
                <CardTitle className="text-xs flex items-center space-x-2">
                  <Zap className="h-4 w-4 text-sky-400" />
                  <span>USB Controller Hubs (lsusb)</span>
                </CardTitle>
                <CardDescription className="text-xs">High-speed USB 2.0 and SuperSpeed USB 3.0 controller buses</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="space-y-2 font-mono text-xs">
                  {details?.buses?.usb_devices?.map((usb, idx) => (
                    <div key={idx} className="p-2.5 bg-secondary/30 border border-border/40 text-foreground">
                      {usb}
                    </div>
                  )) || (
                    <div className="text-muted-foreground italic">No USB devices reported.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Raw JSON Spec Dump */}
          <Card className="p-4 sm:p-5">
            <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-xs flex items-center space-x-2">
                  <Code className="h-4 w-4 text-muted-foreground" />
                  <span>Raw System Telemetry Inspector</span>
                </CardTitle>
                <CardDescription className="text-xs">Complete JSON payload returned by Raspberry Pi 5 hardware query</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(JSON.stringify(details || {}, null, 2), "json")}
                className="h-8 text-xs space-x-1.5"
              >
                {copiedJson ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                <span>{copiedJson ? "Copied" : "Copy JSON"}</span>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <pre className="p-4 bg-secondary/40 border border-border/50 text-[11px] font-mono text-muted-foreground overflow-x-auto max-h-72">
                {JSON.stringify(details || {}, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </main>
      )}

      {/* System Footer */}
      <footer className="border-t border-border/40 bg-card/40 py-3 sm:py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-[10px] sm:text-xs text-muted-foreground gap-2 text-center sm:text-left">
          <div className="flex items-center space-x-1.5 sm:space-x-2">
            <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
            <span>Uptime:</span>
            <span className="font-mono text-foreground font-medium">{metrics?.system?.uptime_text || "--"}</span>
          </div>
          <div className="flex flex-wrap justify-center items-center gap-x-3 gap-y-1 font-mono text-[10px] sm:text-[11px]">
            <span>Kernel: {metrics?.system?.kernel || "--"}</span>
            <span>OS: {metrics?.system?.os || "Debian GNU/Linux"}</span>
            <span>Board: Raspberry Pi 5 Rev 1.0 (8GB)</span>
          </div>
        </div>
      </footer>

      {/* Connect to Raspberry Pi Modal */}
      {showIpModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => {
            sessionStorage.setItem("pimetrics_ip_prompt_dismissed", "true")
            setShowIpModal(false)
          }}
        >
          <div
            className="bg-card border border-border w-full max-w-lg p-5 sm:p-6 shadow-2xl relative text-card-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem("pimetrics_ip_prompt_dismissed", "true")
                setShowIpModal(false)
              }}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground p-1 transition-colors cursor-pointer"
              title="Close"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center space-x-3 mb-5">
              <div className="h-10 w-10 bg-raspberry/15 border border-raspberry/40 flex items-center justify-center text-raspberry flex-shrink-0">
                <Radio className="h-5 w-5 fill-current text-raspberry animate-pulse" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-extrabold tracking-tight text-foreground uppercase">
                  Connect to Raspberry Pi
                </h2>
                <p className="text-xs text-muted-foreground font-mono">
                  Specify the IP address or hostname to monitor
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4">
              {/* Host/IP Field */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Raspberry Pi IP Address / Hostname <span className="text-raspberry">*</span>
                </label>
                <input
                  type="text"
                  value={inputHost}
                  onChange={(e) => {
                    setInputHost(e.target.value)
                    setTestStatus({ state: "idle" })
                  }}
                  placeholder="e.g. 192.168.1.9 or raspberrypi.local"
                  required
                  autoFocus
                  className="w-full bg-secondary/80 border border-border px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-raspberry focus:ring-1 focus:ring-raspberry transition-colors"
                />
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>Presets:</span>
                  {["192.168.1.9", "raspberrypi.local", "192.168.0.100", "pi.local"].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setInputHost(preset)
                        setTestStatus({ state: "idle" })
                      }}
                      className="px-2 py-0.5 bg-secondary border border-border hover:border-raspberry/60 hover:text-foreground font-mono transition-colors text-[10px] cursor-pointer"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* User & Port Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    SSH User
                  </label>
                  <input
                    type="text"
                    value={inputUser}
                    onChange={(e) => {
                      setInputUser(e.target.value)
                      setTestStatus({ state: "idle" })
                    }}
                    placeholder="pi"
                    className="w-full bg-secondary/80 border border-border px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-raspberry focus:ring-1 focus:ring-raspberry transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    SSH Port
                  </label>
                  <input
                    type="number"
                    value={inputPort}
                    onChange={(e) => {
                      setInputPort(parseInt(e.target.value) || 22)
                      setTestStatus({ state: "idle" })
                    }}
                    placeholder="22"
                    className="w-full bg-secondary/80 border border-border px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-raspberry focus:ring-1 focus:ring-raspberry transition-colors"
                  />
                </div>
              </div>

              {/* Test Status Feedback Box */}
              {testStatus.state !== "idle" && (
                <div
                  className={`p-3 text-xs border font-mono flex flex-col space-y-2 ${
                    testStatus.state === "testing"
                      ? "bg-secondary/60 border-border text-muted-foreground"
                      : testStatus.state === "success"
                      ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-300"
                      : "bg-destructive/15 border-destructive/50 text-destructive-foreground"
                  }`}
                >
                  <div className="flex items-start space-x-2">
                    {testStatus.state === "testing" && (
                      <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground mt-0.5 flex-shrink-0" />
                    )}
                    {testStatus.state === "success" && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                    )}
                    {testStatus.state === "error" && (
                      <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 break-words">
                      {testStatus.state === "testing" && `Testing connection to ${inputHost}:${inputPort}...`}
                      {testStatus.message}
                    </div>
                  </div>

                  {/* Smart Guidance for SSH Auth Failures */}
                  {testStatus.state === "error" &&
                    (testStatus.message?.includes("auth failed") ||
                      testStatus.message?.includes("Permission denied")) && (
                      <div className="mt-2 pt-2 border-t border-destructive/30 space-y-2">
                        {inputUser !== "pi" && (
                          <div className="flex items-center justify-between bg-secondary/80 p-2 border border-border">
                            <span className="text-[11px] text-foreground">
                              Pi default user is usually <strong>pi</strong> (not {inputUser}):
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setInputUser("pi")
                                setTestStatus({ state: "idle" })
                              }}
                              className="px-2 py-0.5 bg-raspberry text-white font-bold text-[10px] hover:bg-raspberry/90 cursor-pointer"
                            >
                              Set User to "pi"
                            </button>
                          </div>
                        )}

                        <div className="bg-background/90 p-2.5 border border-border text-[11px] text-muted-foreground space-y-1.5">
                          <p className="font-semibold text-foreground">
                            🔑 Authorize your computer with SSH key:
                          </p>
                          <p className="text-[10px]">
                            Run this in <strong>Windows PowerShell</strong> to copy your SSH key to the Pi:
                          </p>
                          <div className="flex items-center space-x-1.5 bg-black/60 p-1.5 border border-border font-mono text-[10px] text-emerald-400">
                            <code className="flex-1 overflow-x-auto truncate">
                              {`type $env:USERPROFILE\\.ssh\\id_rsa.pub | ssh ${inputUser || "pi"}@${inputHost} "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"`}
                            </code>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  `type $env:USERPROFILE\\.ssh\\id_rsa.pub | ssh ${inputUser || "pi"}@${inputHost} "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"`
                                )
                                setCopiedKeyCmd(true)
                                setTimeout(() => setCopiedKeyCmd(false), 2000)
                              }}
                              className="px-1.5 py-0.5 bg-secondary text-foreground text-[10px] border border-border hover:bg-secondary/80 flex-shrink-0 cursor-pointer"
                            >
                              {copiedKeyCmd ? "Copied!" : "Copy"}
                            </button>
                          </div>
                          <div className="pt-1 flex items-center justify-between">
                            <span className="text-[10px]">Or test logging in with your Pi password in terminal:</span>
                            <button
                              type="button"
                              onClick={handleOpenTerminal}
                              className="px-2 py-0.5 bg-secondary text-foreground text-[10px] border border-border hover:bg-secondary/80 cursor-pointer flex items-center space-x-1"
                            >
                              <Terminal className="h-3 w-3" />
                              <span>Open Terminal</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-border/40 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={testStatus.state === "testing" || !inputHost.trim()}
                  className="text-xs font-mono"
                >
                  <Activity className="h-3.5 w-3.5 mr-1.5" />
                  Test Connection
                </Button>

                <div className="flex items-center space-x-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      sessionStorage.setItem("pimetrics_ip_prompt_dismissed", "true")
                      setShowIpModal(false)
                    }}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="default"
                    disabled={isSavingConfig || !inputHost.trim()}
                    className="bg-raspberry hover:bg-raspberry/90 text-white font-bold text-xs"
                  >
                    <Check className="h-3.5 w-3.5 mr-1.5" />
                    {isSavingConfig ? "Saving..." : "Connect & Save"}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
