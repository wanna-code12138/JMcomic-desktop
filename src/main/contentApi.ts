import { ipcMain, app, BrowserWindow, net } from 'electron'
import { join } from 'node:path'
import { ensureWarmup, getWarmupState, retryWarmup } from './sessionWarmup'
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
import { createContentCache } from './contentCache'
import { getAppDataDir } from './dataPaths'
import { getSettings } from './settingsStore'
import { buildRecommendationSourceRequests } from './recommendationData'
import {
  createContentGateway,
  type CategoryRequest,
  type ContentProvider,
  type HomepageCategory,
  type SearchRequest
} from './contentGateway'
import { createJmApiFetchPort } from './content/jmAppApiFetchPort'
import { createAnonymousApiProvider } from './content/jmAppApiRuntime'

// Ensure session is ready (Cloudflare warmup)
async function ensureReady(): Promise<void> {
  const hostWindow = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed())
  if (!hostWindow) throw new Error('找不到用于网页验证的主窗口')
  const state = await ensureWarmup('browser-fallback', hostWindow)
  if (state.phase === 'failed') {
    throw new Error(`浏览器验证失败: ${state.reason}`)
  }
}

const directAdapter = new JmWebAdapter()

const directProvider: ContentProvider = {
  async homepage() {
    // Homepage sections require the canonical browser extractor in the web fallback.
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
  async category(request) {
    const supportsDirect = request.recommendation === true
      && (!request.category || request.category === '0')
      && !request.subCategory
    if (!supportsDirect) throw new Error('direct-category-combination-unverified')
    const result = await directAdapter.listAlbums({
      tag: request.tag,
      order: request.order ?? 'mr',
      time: request.time ?? 'a',
      page: request.page ?? 1
    })
    return { results: result.results, totalPages: result.totalPages }
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

const apiContentProvider = createAnonymousApiProvider(createJmApiFetchPort((url, init) => net.fetch(url, init)))

export async function warmAnonymousContentProvider(): Promise<void> {
  await apiContentProvider.prewarm().catch(() => {})
}

const contentPersistentCache = createContentCache({
  filePath: join(getAppDataDir(), 'content-cache.json'),
  namespace: 'public-content-api-v2'
})

const contentGateway = createContentGateway({
  api: apiContentProvider,
  direct: directProvider,
  browser: browserProvider,
  ttlMs: 60_000,
  persistentCache: contentPersistentCache
})

export async function clearContentCache(): Promise<void> {
  await contentGateway.clear()
}

export async function getPublicMangaDetail(mangaId: string) {
  return (await contentGateway.detail(mangaId)).data
}

export async function getPublicChapterPages(chapterUrl: string) {
  return (await contentGateway.pages(chapterUrl)).data
}

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

ipcMain.handle('content:recommendations', async (_event, tagOffset?: number) => {
  try {
    const settings = await getSettings()
    const requestPlan = buildRecommendationSourceRequests(
      settings.recommendationTags,
      Number.isFinite(tagOffset) ? Number(tagOffset) : 0
    )
    const settled = await Promise.allSettled(requestPlan.sources.map(async (source) => {
      const result = await contentGateway.category(source.request)
      return {
        source: source.source,
        ...(source.tag ? { tag: source.tag } : {}),
        cards: result.data.results
      }
    }))
    const pools = settled
      .flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
      .filter((pool) => pool.cards.length > 0)
    if (pools.length === 0) throw new Error('所有推荐候选源均加载失败')
    return { ok: true, pools, nextTagOffset: requestPlan.nextTagOffset }
  } catch (err) {
    return { ok: false, pools: [], nextTagOffset: 0, error: String(err) }
  }
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
  const perf = beginMainPerfSpan('content.pages')
  try {
    const result = await contentGateway.pages(chapterUrl)
    perf.finish('ok', { count: result.data.pages.length, scramble: result.data.scrambleId > 0, provider: result.provider, fallback: result.fallback })
    return { ok: true, data: result.data.pages, scrambleId: result.data.scrambleId }
  } catch (err) {
    perf.finish('error')
    console.error('[content:pages] error:', err)
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('content:warmupStatus', () => {
  const state = getWarmupState()
  return {
    warmedUp: state.phase === 'verified',
    state
  }
})

ipcMain.handle('content:warmupRetry', async () => {
  const hostWindow = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
  if (!hostWindow) return { phase: 'failed', reason: 'window-closed', retryable: true }
  return retryWarmup(hostWindow)
})

app.on('before-quit', () => {
  destroyScraper()
})
