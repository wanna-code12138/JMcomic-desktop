const API_IMAGE_HOSTS = new Set([
  'cdn-msp.jmapiproxy1.cc', 'cdn-msp.jmapiproxy2.cc',
  'cdn-msp2.jmapiproxy2.cc', 'cdn-msp3.jmapiproxy2.cc',
  'cdn-msp.jmapinodeudzn.net', 'cdn-msp3.jmapinodeudzn.net'
])

export function validateTrustedImageUrl(raw: string): string | null {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    const hostname = url.hostname.toLowerCase()
    const mobileHost = /^cdn-msp\d*\.(?:jmapiproxy[1-3]\.cc|jmdanjonproxy\.(?:vip|xyz))$/.test(hostname)
    if (!/^cdn-[a-z0-9-]+\.18comic\.(vip|org)$/.test(hostname) && !API_IMAGE_HOSTS.has(hostname) && !mobileHost) return null
    return url.href
  } catch {
    return null
  }
}
