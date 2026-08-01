import { protocol } from 'electron'
import { readFileSync } from 'fs'
import { getDatabase } from './database'
import { isLocalImagePathSafe } from './downloadCore'
import { getDefaultDownloadDir } from './dataPaths'
import { contentTypeForFile } from './imageProtocol'

/**
 * 自定义 jmlocal:// 协议：从下载目录直读已下载图片，不经过网络。
 *
 * URL 格式: jmlocal://img/<base64url-encoded-absolute-path>
 *
 * 仅允许读取下载记录中保存目录下的 <漫画>/<章节>/<图片> 文件，
 * 防止渲染进程借此读取任意本地文件。
 */

function base64UrlDecode(s: string): string {
  let std = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = std.length % 4
  if (pad) std += '='.repeat(4 - pad)
  return Buffer.from(std, 'base64').toString('utf-8')
}

export function registerLocalImageScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'jmlocal',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        bypassCSP: false,
        corsEnabled: true,
        stream: true
      }
    }
  ])
}

async function getAllowedRoots(): Promise<string[]> {
  const db = await getDatabase()
  const roots = new Set<string>()
  roots.add(getDefaultDownloadDir())
  const results = db.exec('SELECT DISTINCT save_path FROM downloads WHERE save_path IS NOT NULL AND save_path != \'\'')
  if (results.length > 0) {
    for (const row of results[0].values) {
      const value = row[0]
      if (typeof value === 'string' && value.trim()) roots.add(value.trim())
    }
  }
  return [...roots]
}

export function registerLocalImageProtocol(): void {
  protocol.handle('jmlocal', async (request) => {
    try {
      const match = request.url.match(/^jmlocal:\/\/img\/(.+)$/)
      if (!match) {
        return new Response('Bad URL format', { status: 400 })
      }

      const filepath = base64UrlDecode(match[1])
      if (!isLocalImagePathSafe(filepath, await getAllowedRoots())) {
        console.warn('[jmlocal] blocked path:', filepath.slice(0, 120))
        return new Response('Blocked: not a downloaded image', { status: 403 })
      }

      const buf = readFileSync(filepath)
      return new Response(buf, {
        status: 200,
        headers: {
          'Content-Type': contentTypeForFile(filepath),
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*'
        }
      })
    } catch (err) {
      console.warn('[jmlocal] read failed:', err)
      return new Response('Not found', { status: 404 })
    }
  })
}
