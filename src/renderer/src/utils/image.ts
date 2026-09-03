export type ImagePriority = 'critical' | 'near' | 'visible-grid' | 'background'

/**
 * 把 CDN 图片 URL 转换为 jmimg:// 代理 URL。
 *
 * URL 格式: jmimg://img/<base64url>[?p=<priority>]
 *
 * 渲染进程不能直接加载 CDN 图片：
 * 1. CORS — CDN 不返回 Access-Control-Allow-Origin
 * 2. Referer — CDN 检查 Referer 是否来自 18comic.vip，localhost 会被拒绝
 *
 * jmimg:// 协议由主进程代理请求，自动附加正确的 Referer + Cookie + UA。
 */
export function toProxyUrl(cdnUrl: string, priority?: ImagePriority): string {
  if (!cdnUrl) return ''
  if (cdnUrl.startsWith('jmimg://')) return cdnUrl
  if (!cdnUrl.startsWith('http')) return cdnUrl
  const b64 = btoa(cdnUrl)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `jmimg://img/${b64}${priority ? `?p=${priority}` : ''}`
}

export const toJmImg = toProxyUrl
