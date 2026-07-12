import { net, session } from 'electron'
import { ipcMain } from 'electron'
import { execSync } from 'child_process'

export type NetworkStatus = 'online' | 'degraded' | 'offline'

interface ProbeResult {
  status: NetworkStatus
  latency: number
  via: 'direct' | 'proxy'
  url: string
  proxyUrl?: string
}

const DEFAULT_DOMAINS = [
  '18comic.vip',
  '18comic.org',
  'jmcomic.me'
]

const PROBE_PATH = '/'
const PROBE_TIMEOUT = 8000

let currentStatus: NetworkStatus = 'offline'
let activeDomain = DEFAULT_DOMAINS[0]
let systemProxyUrl: string | null = null
let manualProxyUrl: string | null = null
let probeTimer: ReturnType<typeof setInterval> | null = null

export function getNetworkStatus(): NetworkStatus {
  return currentStatus
}

export function getActiveDomain(): string {
  return activeDomain
}

export function getProxyUrl(): string | null {
  return manualProxyUrl ?? systemProxyUrl
}

export function setManualProxy(url: string | null): void {
  manualProxyUrl = url
  runNetworkProbe()
}

/**
 * Detect Windows system proxy from registry.
 */
function detectWindowsSystemProxy(): string | null {
  try {
    // Read from Windows registry
    const result = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable 2>nul & ' +
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer 2>nul',
      { encoding: 'utf-8', timeout: 3000 }
    )

    const enableMatch = result.match(/ProxyEnable\s+REG_DWORD\s+0x1/)
    if (!enableMatch) return null

    const serverMatch = result.match(/ProxyServer\s+REG_SZ\s+(.+)/)
    if (!serverMatch) return null

    let server = serverMatch[1].trim()
    // Add http:// prefix if missing
    if (!server.startsWith('http://') && !server.startsWith('socks')) {
      server = 'http://' + server
    }
    return server
  } catch {
    return null
  }
}

/**
 * Probe a URL using Electron's net.request (respects system proxy).
 */
async function probeWithNet(url: string): Promise<{ success: boolean; latency: number }> {
  const start = Date.now()
  return new Promise((resolve) => {
    const req = net.request({
      method: 'HEAD',
      url: url
    })

    req.on('response', (response) => {
      resolve({ success: response.statusCode < 500, latency: Date.now() - start })
    })

    req.on('error', () => {
      resolve({ success: false, latency: Date.now() - start })
    })

    req.on('abort', () => resolve({ success: false, latency: Date.now() - start }))

    const timer = setTimeout(() => {
      req.abort()
    }, PROBE_TIMEOUT)

    req.on('close', () => clearTimeout(timer))
    req.end()
  })
}

/**
 * Probe a URL using raw fetch (does NOT use system proxy by default).
 * Used only as fallback with explicit proxy agent.
 */
async function probeWithFetch(url: string, proxyUrl?: string): Promise<{ success: boolean; latency: number }> {
  const start = Date.now()
  try {
    // Electron's net.request already uses system proxy, so prefer that.
    // This fetch fallback is only for explicit manual proxy testing.
    const resp = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(PROBE_TIMEOUT)
    })
    return { success: resp.ok, latency: Date.now() - start }
  } catch {
    return { success: false, latency: Date.now() - start }
  }
}

export async function runNetworkProbe(): Promise<ProbeResult> {
  // Refresh system proxy detection on each probe
  systemProxyUrl = detectWindowsSystemProxy()

  const effectiveProxy = manualProxyUrl ?? systemProxyUrl

  // Step 1: Try with Electron's net (respects system proxy automatically)
  for (const domain of DEFAULT_DOMAINS) {
    const url = `https://${domain}${PROBE_PATH}`
    const result = await probeWithNet(url)
    if (result.success) {
      currentStatus = effectiveProxy ? 'degraded' : 'online'
      activeDomain = domain
      return {
        status: currentStatus,
        latency: result.latency,
        via: effectiveProxy ? 'proxy' : 'direct',
        url,
        proxyUrl: effectiveProxy ?? undefined
      }
    }
  }

  // Step 2: All failed
  currentStatus = 'offline'
  return {
    status: 'offline',
    latency: 0,
    via: 'direct',
    url: '',
    proxyUrl: effectiveProxy ?? undefined
  }
}

export function startPeriodicProbe(intervalMs = 5 * 60 * 1000): () => void {
  // Run immediately
  runNetworkProbe()

  // Then periodically
  probeTimer = setInterval(runNetworkProbe, intervalMs)

  return () => {
    if (probeTimer) {
      clearInterval(probeTimer)
      probeTimer = null
    }
  }
}

// IPC handler registration
ipcMain.handle('network:probe', async () => {
  return runNetworkProbe()
})

ipcMain.handle('network:status', () => {
  return {
    status: currentStatus,
    activeDomain,
    proxyUrl: getProxyUrl()
  }
})

ipcMain.handle('network:setProxy', async (_event, url: string | null) => {
  setManualProxy(url)
  return runNetworkProbe()
})
