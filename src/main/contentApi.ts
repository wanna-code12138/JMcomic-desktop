import { ipcMain, app } from 'electron'
import { getNetworkStatus } from './networkProbe'
import { isSessionWarmedUp, warmupSession } from './sessionWarmup'
import {
  extractHomepage,
  extractHomepageStream,
  extractMangaDetail,
  extractChapterPages,
  extractChapterPagesStream,
  extractSearch,
  extractCategory,
  destroyScraper
} from './scraperWindow'
import { mapCardToMangaCardData } from './homepageLogic'

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

ipcMain.handle('content:homepage', async (_event, category?: string) => {
  try {
    await ensureReady()
    const cat: 'recommended' | 'latest' | 'popular' =
      category === 'latest' || category === 'popular' ? category : 'recommended'
    const data = await extractHomepage(cat)
    const mappedCards = data.cards.map(mapCardToMangaCardData)
    return {
      ok: true,
      data: mappedCards,
      category: cat
    }
  } catch (err) {
    return { ok: false, error: `提取失败: ${String(err)}` }
  }
})

const homepageStreams = new Map<string, { signal: { aborted: boolean } }>()

ipcMain.on('content:homepage:stream', async (event, category?: string) => {
  const cat: 'recommended' | 'latest' | 'popular' =
    category === 'latest' || category === 'popular' ? category : 'recommended'
  const prev = homepageStreams.get(cat)
  if (prev) prev.signal.aborted = true
  const signal = { aborted: false }
  homepageStreams.set(cat, { signal })
  const send = (payload: { category: string; cards: unknown[]; done: boolean; error?: string }): void => {
    if (!event.sender.isDestroyed()) event.sender.send('content:homepage:batch', payload)
  }
  try {
    await ensureReady()
    if (signal.aborted) return
    await extractHomepageStream(cat, (cards, done) => {
      if (signal.aborted) return
      const mapped = cards.map(mapCardToMangaCardData)
      send({ category: cat, cards: mapped, done })
    }, signal)
  } catch (err) {
    if (!signal.aborted) {
      send({ category: cat, error: `提取失败: ${String(err)}`, done: true })
    }
  } finally {
    if (homepageStreams.get(cat)?.signal === signal) {
      homepageStreams.delete(cat)
    }
  }
})

ipcMain.on('content:homepage:cancel', (_event, category?: string) => {
  const cat: 'recommended' | 'latest' | 'popular' =
    category === 'latest' || category === 'popular' ? category : 'recommended'
  const entry = homepageStreams.get(cat)
  if (entry) entry.signal.aborted = true
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

const pageStreams = new Map<string, { signal: { aborted: boolean } }>()

ipcMain.on('content:pages:stream', async (event, chapterUrl?: string) => {
  const url = chapterUrl ?? ''
  const prev = pageStreams.get(url)
  if (prev) prev.signal.aborted = true
  const signal = { aborted: false }
  pageStreams.set(url, { signal })
  const send = (payload: { chapterUrl: string; pages: unknown[]; scrambleId: number; done: boolean; debug?: string; error?: string }): void => {
    if (!event.sender.isDestroyed()) event.sender.send('content:pages:batch', payload)
  }
  try {
    await ensureReady()
    if (signal.aborted) return
    await extractChapterPagesStream(url, (pages, scrambleId, done, debug) => {
      if (signal.aborted) return
      send({ chapterUrl: url, pages, scrambleId, done, debug })
    }, signal)
  } catch (err) {
    if (!signal.aborted) send({ chapterUrl: url, error: String(err), done: true })
  } finally {
    if (pageStreams.get(url)?.signal === signal) pageStreams.delete(url)
  }
})

ipcMain.on('content:pages:cancel', (_event, chapterUrl?: string) => {
  const url = chapterUrl ?? ''
  const entry = pageStreams.get(url)
  if (entry) entry.signal.aborted = true
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
