/**
 * 把 CDN 图片 URL 转换为 jmimg:// 代理 URL。
 *
 * URL 格式: jmimg://img/<base64url>
 *
 * 渲染进程不能直接加载 CDN 图片：
 * 1. CORS — CDN 不返回 Access-Control-Allow-Origin
 * 2. Referer — CDN 检查 Referer 是否来自 18comic.vip，localhost 会被拒绝
 *
 * jmimg:// 协议由主进程代理请求，自动附加正确的 Referer + Cookie + UA。
 *
 * 使用 base64url 编码（非标准 base64）：
 *   + → -    / → _    去掉末尾 = 填充
 * 因为标准 base64 的 = 会被 Chromium 百分号编码为 %3D。
 *
 * base64 放在 path 而非 host，因为 Chromium 对 standard scheme 的 host
 * 会强制转小写，而 base64 是大小写敏感的。
 */
export function toJmImg(cdnUrl: string): string {
  if (!cdnUrl) return ''
  if (cdnUrl.startsWith('jmimg://')) return cdnUrl
  if (!cdnUrl.startsWith('http')) return cdnUrl
  const b64 = btoa(cdnUrl)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `jmimg://img/${b64}`
}
