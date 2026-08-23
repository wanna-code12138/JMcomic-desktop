import { ipcMain, app, BrowserWindow } from 'electron'
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
import { mapCardToMangaCardData } from './homepageLogic'
import { beginMainPerfSpan } from './performanceTrace'
import { JmWebAdapter } from './siteAdapter'
import {
  createContentGateway,
  type CategoryRequest,
  type ContentProvider,
  type HomepageCategory,
  type SearchRequest
} from './contentGateway'

// Ensure session is ready (Cloudflare warmup)
async function ensureReady(): Promise<void> {
  if (!isSessionWarmedUp()) {
    const hostWindow = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed())
    if (!hostWindow) throw new Error('找不到用于网页验证的主窗口')
    await warmupSession(hostWindow)
  }
}

const directAdapter = new JmWebAdapter([])

const directProvider: ContentProvider = {
  async homepage() {
    // The adapter currently splits homepage sections heuristically. Until its
    // section semantics are proven equivalent, retain the browser extractor.
    throw new Error('direct-homepage-unverified')
  },
  async search(request) {
    const supportsDirect = request.mainTag === 0
      && !request.category
      && request.order === 'mr'
      && request.time === 'a'
    if (!supportsDirect) throw new Error('direct-search-filter-unsupported')
    const result = await directAdapter.search(request.query, request.page)
    return { results: result.results, totalPages: result.totalPages }
  },
  async category() {
    // Category URL semantics include several combined filters that the direct
    // adapter does not yet implement. Do not silently return a different list.
    throw new Error('direct-category-unverified')
  },
  async detail() {
    // Real-site parity check: the direct DOM returned missing canonical author
    // and tags for JM1215915. Keep the corrected browser metadata extractor.
    throw new Error('direct-detail-unverified')
  },
  pages(chapterUrl) {
    // Real-site parity for JM1215915 matched the browser extractor byte-for-byte
    // across the complete ordered [index, imageUrl] sequence and scrambleId.
    return directAdapter.getChapterPages(chapterUrl)
  }
}

const browserProvider: ContentProvider = {
  async homepage(category) {
    await ensureReady()
    const result = await extractHomepage(category)
    return result.cards.map(mapCardToMangaCardData)
  },
  async search(request) {
    await ensureReady()
    const result = await extractSearch(
      request.query,
      request.page,
      request.mainTag,
      request.category,
      request.order,
      request.time
    )
    return { results: result.results, totalPages: result.totalPages }
  },
  async category(request) {
    await ensureReady()
    const result = await extractCategory(request)
    return { results: result.results, totalPages: result.totalPages }
  },
  async detail(mangaId) {
    await ensureReady()
    return extractMangaDetail(mangaId)
  },
  async pages(chapterUrl) {
    await ensureReady()
    const result = await extractChapterPages(chapterUrl)
    return { pages: result.pages, scrambleId: result.scrambleId ?? 0 }
  }
}

const contentGateway = createContentGateway({
  direct: directProvider,
  browser: browserProvider,
  ttlMs: 60_000
})

ipcMain.handle('content:homepage', async (_event, category?: string) => {
  try {
    const cat: HomepageCategory =
      category === 'latest' || category === 'popular' ? category : 'recommended'
    const result = await contentGateway.homepage(cat)
    return {
      ok: true,
      data: result.data,
      category: cat
    }
  } catch (err) {
    return { ok: false, error: `提取失败: ${String(err)}` }
  }
})

const homepageStreams = new Map<string, { signal: { aborted: boolean } }>()

ipcMain.on('content:homepage:stream', async (event, category?: string) => {
  const cat: HomepageCategory =
    category === 'latest' || category === 'popular' ? category : 'recommended'
  const prev = homepageStreams.get(cat)
  if (prev) prev.signal.aborted = true
  const signal = { aborted: false }
  homepageStreams.set(cat, { signal })
  const send = (payload: { category: string; cards?: unknown[]; done: boolean; error?: string }): void => {
    if (!event.sender.isDestroyed()) event.sender.send('content:homepage:batch', payload)
  }
  try {
    const result = await contentGateway.homepage(cat)
    if (signal.aborted) return
    send({ category: cat, cards: result.data, done: true })
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
    const request: SearchRequest = {
      query,
      page: page ?? 1,
      mainTag: mainTag ?? 0,
      category,
      order: order ?? 'mr',
      time: time ?? 'a'
    }
    const result = await contentGateway.search(request)
    return { ok: true, data: result.data.results, totalPages: result.data.totalPages }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('content:category', async (_event, params: Record<string, unknown>) => {
  try {
    const request: CategoryRequest = {
      category: params.category as string | undefined,
      subCategory: params.subCategory as string | undefined,
      tag: params.tag as string | undefined,
      order: params.order as string | undefined,
      time: params.time as string | undefined,
      page: params.page as number | undefined
    }
    const result = await contentGateway.category(request)
    return { ok: true, data: result.data.results, totalPages: result.data.totalPages }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('content:detail', async (_event, mangaId: string) => {
  try {
    const result = await contentGateway.detail(mangaId)
    return { ok: true, data: result.data }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('content:pages', async (_event, chapterUrl: string) => {
  try {
    const result = await contentGateway.pages(chapterUrl)
    return { ok: true, data: result.data.pages, scrambleId: result.data.scrambleId }
  } catch (err) {
    console.error('[content:pages] error:', err)
    return { ok: false, error: String(err) }
  }
})

const pageStreams = new Map<string, { signal: { aborted: boolean } }>()

ipcMain.on('content:pages:stream', async (event, chapterUrl?: string) => {
  const perf = beginMainPerfSpan('content.pages')
  const url = chapterUrl ?? ''
  const prev = pageStreams.get(url)
  if (prev) prev.signal.aborted = true
  const signal = { aborted: false }
  pageStreams.set(url, { signal })
  const send = (payload: { chapterUrl: string; pages?: unknown[]; scrambleId?: number; done: boolean; error?: string }): void => {
    if (!event.sender.isDestroyed()) event.sender.send('content:pages:batch', payload)
  }
  try {
    const result = await contentGateway.pages(url)
    if (signal.aborted) {
      perf.finish('cancelled')
      return
    }
    if (result.data.pages.length > 0) {
      perf.mark('first-batch', { count: result.data.pages.length })
    }
    send({
      chapterUrl: url,
      pages: result.data.pages,
      scrambleId: result.data.scrambleId,
      done: true
    })
    perf.finish('ok', {
      count: result.data.pages.length,
      scramble: result.data.scrambleId > 0,
      provider: result.provider,
      fallback: result.fallback
    })
  } catch (err) {
    perf.finish(signal.aborted ? 'cancelled' : 'error', {
      count: 0,
      scramble: false
    })
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
