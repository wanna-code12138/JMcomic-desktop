import { ipcMain, app } from 'electron'
import { getNetworkStatus } from './networkProbe'
import { isSessionWarmedUp, warmupSession } from './sessionWarmup'
import {
  extractHomepage,
  extractMangaDetail,
  extractChapterPages,
  extractSearch,
  extractCategory,
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

ipcMain.handle('content:search', async (_event, query: string, page?: number, mainTag?: 0 | 1, category?: string, order?: string, time?: string) => {
  try {
    await ensureReady()
    const data = await extractSearch(query, page ?? 1, mainTag ?? 0, category, order ?? 'mr', time ?? 'a')
    return { ok: true, data: data.results, totalPages: data.totalPages }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('content:category', async (_event, params: Record<string, unknown>) => {
  try {
    await ensureReady()
    const data = await extractCategory({
      category: params.category as string | undefined,
      subCategory: params.subCategory as string | undefined,
      tag: params.tag as string | undefined,
      order: params.order as string | undefined,
      time: params.time as string | undefined,
      page: params.page as number | undefined
    })
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

ipcMain.handle('content:warmupStatus', () => {
  return {
    warmedUp: isSessionWarmedUp(),
    networkStatus: getNetworkStatus()
  }
})

app.on('before-quit', () => {
  destroyScraper()
})
