export type ThemeMode = 'system' | 'light' | 'dark'

export interface AppSettings {
  themeMode: ThemeMode
  micaEnabled: boolean
  solidWindow: boolean
  proxyEnabled: boolean
  proxyUrl: string
  cacheLimitMb: number
  /** 下载目录；空字符串表示使用系统默认（系统下载/JMComic） */
  downloadDir: string
  /** 同时下载的章节任务数 1..8 */
  downloadConcurrency: number
  /** 单张图片失败重试次数 0..6 */
  downloadRetries: number
  /** 启动时自动继续未完成的任务 */
  downloadResumeOnStartup: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  themeMode: 'system',
  micaEnabled: true,
  solidWindow: false,
  proxyEnabled: false,
  proxyUrl: '',
  cacheLimitMb: 1000,
  downloadDir: '',
  downloadConcurrency: 4,
  downloadRetries: 3,
  downloadResumeOnStartup: true
}

export const CACHE_LIMIT_MIN_MB = 100
export const CACHE_LIMIT_MAX_MB = 5000
export const DOWNLOAD_CONCURRENCY_MIN = 1
export const DOWNLOAD_CONCURRENCY_MAX = 8
export const DOWNLOAD_RETRIES_MAX = 6

const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark']
const SUPPORTED_PROXY_SCHEMES = new Set(['http:', 'https:', 'socks5:', 'socks5h:'])

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (value === 'true') return true
    if (value === 'false') return false
  }
  return fallback
}

function toNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * 把 DB 里读出的字符串值 / IPC 传入的原始值统一归一化成合法设置。
 * 未知值回退默认，数字范围 100..5000 MB。
 */
export function normalizeSettings(raw: Record<string, unknown>): AppSettings {
  const themeMode = THEME_MODES.includes(raw.themeMode as ThemeMode)
    ? (raw.themeMode as ThemeMode)
    : DEFAULT_SETTINGS.themeMode
  const cacheLimitMb = Math.min(
    CACHE_LIMIT_MAX_MB,
    Math.max(CACHE_LIMIT_MIN_MB, toNumber(raw.cacheLimitMb, DEFAULT_SETTINGS.cacheLimitMb))
  )
  const downloadConcurrency = Math.min(
    DOWNLOAD_CONCURRENCY_MAX,
    Math.max(DOWNLOAD_CONCURRENCY_MIN, toNumber(raw.downloadConcurrency, DEFAULT_SETTINGS.downloadConcurrency))
  )
  const downloadRetries = Math.min(
    DOWNLOAD_RETRIES_MAX,
    Math.max(0, toNumber(raw.downloadRetries, DEFAULT_SETTINGS.downloadRetries))
  )
  return {
    themeMode,
    micaEnabled: toBoolean(raw.micaEnabled, DEFAULT_SETTINGS.micaEnabled),
    solidWindow: toBoolean(raw.solidWindow, DEFAULT_SETTINGS.solidWindow),
    proxyEnabled: toBoolean(raw.proxyEnabled, DEFAULT_SETTINGS.proxyEnabled),
    proxyUrl: typeof raw.proxyUrl === 'string' ? raw.proxyUrl.trim() : DEFAULT_SETTINGS.proxyUrl,
    cacheLimitMb,
    downloadDir: typeof raw.downloadDir === 'string' ? raw.downloadDir.trim() : DEFAULT_SETTINGS.downloadDir,
    downloadConcurrency,
    downloadRetries,
    downloadResumeOnStartup: toBoolean(raw.downloadResumeOnStartup, DEFAULT_SETTINGS.downloadResumeOnStartup)
  }
}

/**
 * 校验并归一化手动代理地址。支持 http/https/socks5(socks5h)，
 * 允许省略协议（自动补 http://），必须有主机名和端口。
 * 非法输入返回 null。
 */
export function validateProxyUrl(input: string): string | null {
  const trimmed = (input ?? '').trim()
  if (!trimmed) return null

  let candidate = trimmed
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    candidate = `http://${candidate}`
  }

  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    return null
  }

  if (!SUPPORTED_PROXY_SCHEMES.has(parsed.protocol)) return null
  if (!parsed.hostname || !parsed.port) return null
  if (parsed.pathname && parsed.pathname !== '/') return null

  let normalized = parsed.href
  if (normalized.endsWith('/')) normalized = normalized.slice(0, -1)
  return normalized
}
