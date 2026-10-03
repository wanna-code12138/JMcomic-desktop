import { app, ipcMain } from 'electron'
import type { PerfEvent, PerfOutcome, PerfSummary } from '../shared/performanceTraceCore'
import {
  clearMainPerfEvents,
  getMainPerfEventCount,
  getMainPerfSummary,
  pushMainPerfEvent
} from './performanceTrace'

export interface PerformanceDiagnosticsSnapshot {
  capturedAt: number
  versions: Record<string, string>
  gpu: { featureStatus: Electron.GPUFeatureStatus; active?: string }
  processes: Array<{ type: string; cpuPercent: number; memoryKb: number }>
  summary: PerfSummary
  counts: { buffered: number }
}

const VALID_OUTCOMES = new Set<PerfOutcome>(['ok', 'error', 'cancelled', 'timeout'])
const IDENTIFIER_PATTERN = /^[a-zA-Z0-9_.-]{1,64}$/

export function parseRendererPerfEvent(candidate: unknown): PerfEvent | null {
  if (!candidate || typeof candidate !== 'object') {
    return null
  }

  const raw = candidate as Record<string, unknown>
  if (typeof raw.name !== 'string' || !IDENTIFIER_PATTERN.test(raw.name)) {
    return null
  }
  if (typeof raw.phase !== 'string' || !IDENTIFIER_PATTERN.test(raw.phase)) {
    return null
  }
  if (typeof raw.elapsedMs !== 'number' || !Number.isFinite(raw.elapsedMs) || raw.elapsedMs < 0 || raw.elapsedMs > 3_600_000) {
    return null
  }

  let outcome: PerfOutcome | undefined
  if (raw.outcome !== undefined) {
    if (typeof raw.outcome !== 'string' || !VALID_OUTCOMES.has(raw.outcome as PerfOutcome)) {
      return null
    }
    outcome = raw.outcome as PerfOutcome
  }

  const metadata: Record<string, string | number | boolean> = {}
  if (raw.metadata !== undefined && raw.metadata !== null) {
    if (typeof raw.metadata !== 'object' || Array.isArray(raw.metadata)) {
      return null
    }
    const entries = Object.entries(raw.metadata)
    if (entries.length > 20) {
      return null
    }
    for (const [key, value] of entries) {
      if (typeof key !== 'string' || key.length === 0 || key.length > 32) {
        return null
      }
      if (typeof value === 'string') {
        if (value.length > 256) return null
        metadata[key] = value
      } else if (typeof value === 'number') {
        if (!Number.isFinite(value)) return null
        metadata[key] = value
      } else if (typeof value === 'boolean') {
        metadata[key] = value
      } else {
        return null
      }
    }
  }

  return {
    name: raw.name,
    phase: raw.phase,
    elapsedMs: raw.elapsedMs,
    ...(outcome ? { outcome } : {}),
    metadata
  }
}

export async function createDiagnosticsSnapshot(): Promise<PerformanceDiagnosticsSnapshot> {
  const featureStatus = app.getGPUFeatureStatus()

  let activeGpu: string | undefined
  try {
    const gpuInfo = await app.getGPUInfo('basic') as {
      gpuDevice?: Array<{ active?: boolean; driverDescription?: string; deviceString?: string }>
    }
    if (Array.isArray(gpuInfo?.gpuDevice)) {
      const activeDevice = gpuInfo.gpuDevice.find((d) => d.active)
      if (activeDevice) {
        activeGpu = activeDevice.driverDescription || activeDevice.deviceString || undefined
      }
    }
  } catch {
    // 读取失败则省略 active，不猜测设备
  }

  const processes = app.getAppMetrics().map((metric) => ({
    type: metric.type,
    cpuPercent: Math.round((metric.cpu?.percentCPUUsage ?? 0) * 100) / 100,
    memoryKb: metric.memory?.workingSetSize ?? 0
  }))

  return {
    capturedAt: Date.now(),
    versions: {
      electron: process.versions.electron ?? '',
      chrome: process.versions.chrome ?? '',
      node: process.versions.node ?? '',
      app: app.getVersion()
    },
    gpu: {
      featureStatus,
      ...(activeGpu ? { active: activeGpu } : {})
    },
    processes,
    summary: getMainPerfSummary(),
    counts: {
      buffered: getMainPerfEventCount()
    }
  }
}

let ipcRegistered = false

export function registerPerformanceDiagnosticsIpc(): void {
  if (ipcRegistered) return
  ipcRegistered = true

  ipcMain.on('performance:record', (_event, candidate: unknown) => {
    const event = parseRendererPerfEvent(candidate)
    if (event) {
      pushMainPerfEvent(event)
    }
  })

  ipcMain.handle('performance:snapshot', async () => {
    return createDiagnosticsSnapshot()
  })

  ipcMain.handle('performance:clear', async () => {
    clearMainPerfEvents()
  })
}
