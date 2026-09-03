import type { JmApiProfile } from './jmAppApiProfiles'

export interface JmApiRoute {
  readonly apiOrigin: string
  readonly imageOrigin: string
  readonly profile: JmApiProfile
}

export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.+$/, '')
}

export function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = normalizeHostname(hostname)
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return true
  // IPv4 or IPv6
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return true
  return host.includes(':')
}

export function validateApiOrigin(raw: string): { ok: boolean; origin?: string; reason?: string } {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'INVALID_URL' }
  }

  if (url.protocol !== 'https:') return { ok: false, reason: 'HTTPS_REQUIRED' }
  if (url.username || url.password) return { ok: false, reason: 'USERINFO_FORBIDDEN' }
  if (url.port) return { ok: false, reason: 'PORT_FORBIDDEN' }

  const hostname = normalizeHostname(url.hostname)
  if (isPrivateOrLocalHostname(hostname)) return { ok: false, reason: 'LOCAL_HOST_FORBIDDEN' }

  // 严格受信域名校验：必须精确匹配或属于合法 18comic 结构，防止子域欺骗 (如 .evil.com)
  const isTrustedHost =
    hostname === '18comic.vip' ||
    hostname.endsWith('.18comic.vip') ||
    hostname === '18comic.org' ||
    hostname.endsWith('.18comic.org') ||
    /^jmcomic\d*\.(me|vip|org)$/.test(hostname) ||
    /^(?:api|cdn-.*)\.18comic\.(vip|org)$/.test(hostname)

  if (!isTrustedHost) {
    return { ok: false, reason: 'HOST_FORBIDDEN' }
  }

  return { ok: true, origin: url.origin }
}
