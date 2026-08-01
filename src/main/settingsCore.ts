export type ThemeMode = 'system' | 'light' | 'dark'

export interface AppSettings {
  themeMode: ThemeMode
  micaEnabled: boolean
  solidWindow: boolean
  proxyEnabled: boolean
  proxyUrl: string
  cacheLimitMb: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  themeMode: 'system',
  micaEnabled: true,
  solidWindow: false,
  proxyEnabled: false,
  proxyUrl: '',
  cacheLimitMb: 1000
}

export const CACHE_LIMIT_MIN_MB = 100
export const CACHE_LIMIT_MAX_MB = 5000

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
  return {
    themeMode,
    micaEnabled: toBoolean(raw.micaEnabled, DEFAULT_SETTINGS.micaEnabled),
    solidWindow: toBoolean(raw.solidWindow, DEFAULT_SETTINGS.solidWindow),
    proxyEnabled: toBoolean(raw.proxyEnabled, DEFAULT_SETTINGS.proxyEnabled),
    proxyUrl: typeof raw.proxyUrl === 'string' ? raw.proxyUrl.trim() : DEFAULT_SETTINGS.proxyUrl,
    cacheLimitMb
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
