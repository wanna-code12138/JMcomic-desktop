import { ipcMain, app } from 'electron'
import { getNetworkStatus, getActiveDomain } from './networkProbe'
import { isSessionWarmedUp, warmupSession } from './sessionWarmup'
import { JmWebAdapter } from './siteAdapter'
import { invalidateCookieCache } from './httpClient'
import {
  extractHomepage,
  extractMangaDetail,
  extractChapterPages,
  extractSearch,
  destroyScraper
} from './scraperWindow'

// Ensure session is ready (Cloudflare warmup)
async function ensureReady(): Promise<void> {
  if (!isSessionWarmedUp()) {
    await warmupSession()
  }
}

// ─── IPC: Content fetching ──────────────────────────────────────
// ALL content extraction goes through scraperWindow (hidden
// BrowserWindow with executeJavaScript). This is the only reliable
// way to extract data from JS-rendered pages behind Cloudflare.
//
// The JmWebAdapter (net.request + cheerio) is NOT used for content
// because it cannot render JavaScript and returns empty/partial DOM.
// It is only kept for login (POST /login) and favorites.
// ─────────────────────────────────────────────────────────────────

ipcMain.handle('content:homepage', async () => {
  try {
    await ensureReady()
    const data = await extractHomepage()
    return {
      ok: true,
      data: {
        recommended: data.recommended,
        latest: data.latest,
        popular: data.popular
      },
      total: data.recommended.length + data.latest.length + data.popular.length,
      debug: (data as any).debug
    }
  } catch (err) {
    return { ok: false, error: `提取失败: ${String(err)}` }
  }
})

ipcMain.handle('content:search', async (_event, query: string, page?: number) => {
  try {
    await ensureReady()
    const data = await extractSearch(query, page ?? 1)
    return { ok: true, data: data.results, totalPages: data.totalPages }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('content:detail', async (_event, mangaId: string) => {
  try {
    await ensureReady()
    const data = await extractMangaDetail(mangaId)
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('content:pages', async (_event, chapterUrl: string) => {
  try {
    await ensureReady()
    const data = await extractChapterPages(chapterUrl)
    console.log('[content:pages]', chapterUrl, '→', data.pages.length, 'pages, scrambleId:', data.scrambleId)
    if (data.pages.length > 0) {
      console.log('[content:pages] first URL:', data.pages[0].imageUrl)
    }
    if (data.debug) console.log('[content:pages] debug:', data.debug)
    return { ok: true, data: data.pages, scrambleId: data.scrambleId, debug: data.debug }
  } catch (err) {
    console.error('[content:pages] error:', err)
    return { ok: false, error: String(err) }
  }
})

// Login still uses HTTP POST (JmWebAdapter)
ipcMain.handle('content:login', async (_event, username: string, password: string) => {
  try {
    await ensureReady()
    const result = await new JmWebAdapter([getActiveDomain()]).login(username, password)
    if (result.success) invalidateCookieCache()
    return result
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// Favorites still uses HTTP (scraper can't easily get per-user pages)
ipcMain.handle('content:favorites', async (_event, page?: number) => {
  try {
    await ensureReady()
    const data = await new JmWebAdapter([getActiveDomain()]).getFavorites(page ?? 1)
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('content:warmupStatus', () => {
  return {
    warmedUp: isSessionWarmedUp(),
    networkStatus: getNetworkStatus()
  }
})

app.on('before-quit', () => {
  destroyScraper()
})
