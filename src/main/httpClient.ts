import { ipcMain, net, session } from 'electron'
import { getActiveDomain, getProxyUrl } from './networkProbe'
import * as cheerio from 'cheerio'
import type { CheerioAPI } from 'cheerio'

// ─── HTTP Client using Electron's net.request ──────────────────
// net.request respects Windows system proxy settings automatically,
// solving the "smart proxy" problem without manual configuration.
//
// Session cookies from the warmup BrowserWindow are automatically
// attached to every request — this is how we bypass Cloudflare
// without the overhead of a full browser navigation.

interface HttpOptions {
  headers?: Record<string, string>
  method?: 'GET' | 'POST' | 'HEAD'
  body?: string
  timeout?: number
  redirect?: 'follow' | 'manual'
}

interface HttpResponse {
  status: number
  headers: Record<string, string>
  body: string
  url: string
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// ─── Session cookie cache ────────────────────────────────────
// Cached for 60s to avoid hitting the cookie store on every request.

let _cookieCache: { header: string; expiry: number } | null = null

async function getSessionCookieHeader(url: string): Promise<string> {
  if (_cookieCache && Date.now() < _cookieCache.expiry) {
    return _cookieCache.header
  }
  try {
    const cookies = await session.defaultSession.cookies.get({ url })
    const header = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
    _cookieCache = { header, expiry: Date.now() + 60_000 }
    return header
  } catch {
    return ''
  }
}

/** Invalidate the cookie cache (call after warmup / login). */
export function invalidateCookieCache(): void {
  _cookieCache = null
}

/**
 * HTTP request using Electron's net module (respects system proxy).
 * Automatically attaches session cookies for Cloudflare bypass.
 */
export async function httpRequest(url: string, options: HttpOptions = {}): Promise<HttpResponse> {
  const timeout = options.timeout ?? 15000

  // Merge session cookies (Cloudflare bypass from warmup) with any caller-provided
  // Cookie header (siteAdapter's login session cookies). Caller takes precedence on
  // duplicate names. Both must be sent together — previously the caller's Cookie
  // header REPLACED the session cookies, discarding cf_clearance so Cloudflare
  // blocked login/favorites POSTs and GETs.
  const sessionCookie = await getSessionCookieHeader(url)
  const callerCookie = options.headers?.Cookie

  let mergedCookie = sessionCookie ?? ''
  if (callerCookie && sessionCookie) {
    const map = new Map<string, string>()
    for (const part of sessionCookie.split(';')) {
      const eq = part.indexOf('=')
      if (eq > 0) map.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim())
    }
    for (const part of callerCookie.split(';')) {
      const eq = part.indexOf('=')
      if (eq > 0) map.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim())
    }
    mergedCookie = [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  } else if (callerCookie) {
    mergedCookie = callerCookie
  }

  return new Promise((resolve, reject) => {
    const req = net.request({
      method: options.method ?? 'GET',
      url: url,
      redirect: options.redirect ?? 'follow'
    })

    req.setHeader('User-Agent', USER_AGENT)
    req.setHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
    req.setHeader('Accept-Language', 'zh-CN,zh;q=0.9,en;q=0.8')

    if (mergedCookie) {
      req.setHeader('Cookie', mergedCookie)
    }

    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        if (key.toLowerCase() === 'cookie') continue // already merged above
        req.setHeader(key, value)
      }
    }

    const timer = setTimeout(() => {
      req.abort()
      reject(new Error(`Request timeout: ${url}`))
    }, timeout)

    const chunks: Buffer[] = []
    let responseHeaders: Record<string, string> = {}
    let statusCode = 0

    req.on('response', (response) => {
      statusCode = response.statusCode
      responseHeaders = Object.fromEntries(
        Object.entries(response.headers).map(([k, v]) => [k, String(v)])
      )

      response.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })

      response.on('end', () => {
        clearTimeout(timer)
        const body = Buffer.concat(chunks).toString('utf-8')
        resolve({
          status: statusCode,
          headers: responseHeaders,
          body,
          url: url
        })
      })

      response.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })

    req.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })

    if (options.body) {
      req.write(options.body)
    }
    req.end()
  })
}

// ─── Cheerio Parser ────────────────────────────────────────────

export function parseHtml(html: string): CheerioAPI {
  return cheerio.load(html)
}

// ─── Data Types ─────────────────────────────────────────────────

export interface MangaListItem {
  id: string
  title: string
  coverUrl: string
  author?: string
  tags?: string[]
  latestChapter?: string
  updateTime?: string
}

export interface MangaDetail {
  id: string
  title: string
  author: string
  coverUrl: string
  tags: string[]
  description: string
  chapters: ChapterItem[]
  rating?: number
  totalViews?: string
}

export interface ChapterItem {
  index: number
  title: string
  url: string
}

export interface PageItem {
  index: number
  imageUrl: string
}

// ─── IPC Handlers ──────────────────────────────────────────────

ipcMain.handle('http:get', async (_event, url: string, options?: HttpOptions) => {
  try {
    const response = await httpRequest(url, options)
    return { ok: true, data: response }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('http:getHtml', async (_event, url: string, options?: HttpOptions) => {
  try {
    const response = await httpRequest(url, options)
    return { ok: true, html: response.body, status: response.status }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

// ─── URL Builder ───────────────────────────────────────────────

export function buildUrl(path: string): string {
  const domain = getActiveDomain()
  return `https://${domain}${path}`
}
