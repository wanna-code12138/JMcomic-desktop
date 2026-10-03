import { validateCards, validateDetail, validatePages, type ValidationResult } from './contentValidation'
import type { ContentCache } from './contentCache'
import type { ChapterPagesResult, MangaDetail, MangaListItem } from './types'
import { isRandomRecommendationTitle } from './recommendationData'

export type ContentProviderName = 'api' | 'direct' | 'browser'
export type HomepageCategory = 'recommended' | 'latest' | 'popular'

export interface GatewayListResult {
  results: MangaListItem[]
  totalPages: number
}

export interface SearchRequest {
  query: string
  page: number
  mainTag: 0 | 1
  category?: string
  order: string
  time: string
}

export interface CategoryRequest {
  category?: string
  subCategory?: string
  tag?: string
  order?: string
  time?: string
  page?: number
  /** Internal marker: allows the verified simple-list direct path for recommendation pools. */
  recommendation?: boolean
}

export interface ContentProvider {
  homepage: (category: HomepageCategory) => Promise<MangaListItem[]>
  search: (request: SearchRequest) => Promise<GatewayListResult>
  category: (request: CategoryRequest) => Promise<GatewayListResult>
  detail: (mangaId: string) => Promise<MangaDetail>
  pages: (chapterUrl: string) => Promise<ChapterPagesResult>
}

export interface GatewayResult<T> {
  data: T
  provider: ContentProviderName
  fallback: boolean
  fallbackReason?: string
}

export interface ContentGateway {
  homepage: (category: HomepageCategory) => Promise<GatewayResult<MangaListItem[]>>
  search: (request: SearchRequest) => Promise<GatewayResult<GatewayListResult>>
  category: (request: CategoryRequest) => Promise<GatewayResult<GatewayListResult>>
  detail: (mangaId: string) => Promise<GatewayResult<MangaDetail>>
  pages: (chapterUrl: string) => Promise<GatewayResult<ChapterPagesResult>>
  clear: () => Promise<void>
}

export interface GatewayOptions {
  api?: ContentProvider
  direct: ContentProvider
  browser: ContentProvider
  ttlMs: number
  now?: () => number
  persistentCache?: ContentCache
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function validateList(value: GatewayListResult): ValidationResult<GatewayListResult> {
  const cards = validateCards(value?.results)
  if (!cards.ok) return cards
  if (!Number.isInteger(value.totalPages) || value.totalPages < 1) {
    return { ok: false, reason: 'list-pages' }
  }
  return { ok: true, data: value }
}

function validateRecommendationList(value: GatewayListResult): ValidationResult<GatewayListResult> {
  const result = validateList(value)
  if (!result.ok) return result
  if (value.results.some((card) => isRandomRecommendationTitle(card.title))) {
    return { ok: false, reason: 'list-random-recommendation' }
  }
  return result
}

interface EndpointHealth {
  attempts: boolean[]
  disabledUntil: number
}

export function createContentGateway(options: GatewayOptions): ContentGateway {
  const now = options.now ?? Date.now
  const cache = new Map<string, { expiresAt: number; value: GatewayResult<unknown> }>()
  const inFlight = new Map<string, Promise<GatewayResult<unknown>>>()
  const healthByEndpoint = new Map<string, EndpointHealth>()
  let generation = 0

  function isApiEnabledFor(endpointKey: string): boolean {
    if (!options.api) return false
    const health = healthByEndpoint.get(endpointKey)
    if (!health) return true
    return now() >= health.disabledUntil
  }

  function recordApiAttempt(endpointKey: string, success: boolean): void {
    let health = healthByEndpoint.get(endpointKey)
    if (!health) {
      health = { attempts: [], disabledUntil: 0 }
      healthByEndpoint.set(endpointKey, health)
    }
    health.attempts.push(success)
    if (health.attempts.length > 100) {
      health.attempts.shift()
    }
    if (health.attempts.length >= 10) {
      const failures = health.attempts.filter((s) => !s).length
      const fallbackRate = failures / health.attempts.length
      if (fallbackRate > 0.10) {
        health.disabledUntil = now() + 60_000
      }
    }
  }

  function run<T>(
    endpointKey: string,
    key: string,
    apiCall: (() => Promise<T>) | undefined,
    directCall: () => Promise<T>,
    browserCall: () => Promise<T>,
    validate: (value: T) => ValidationResult<T>
  ): Promise<GatewayResult<T>> {
    const cached = cache.get(key)
    if (cached && now() < cached.expiresAt) {
      return Promise.resolve(cached.value as GatewayResult<T>)
    }
    const active = inFlight.get(key)
    if (active) return active as Promise<GatewayResult<T>>

    const load = async (): Promise<GatewayResult<T>> => {
      let fallbackReason = 'direct-error'
      let didFallbackFromApi = false

      // 1. 尝试 API 提供者
      if (options.api && apiCall && isApiEnabledFor(endpointKey)) {
        try {
          const apiValue = await apiCall()
          const apiResult = validate(apiValue)
          if (apiResult.ok) {
            recordApiAttempt(endpointKey, true)
            return {
              data: apiResult.data,
              provider: 'api',
              fallback: false
            }
          }
          fallbackReason = apiResult.reason
          recordApiAttempt(endpointKey, false)
          didFallbackFromApi = true
        } catch {
          fallbackReason = 'api-error'
          recordApiAttempt(endpointKey, false)
          didFallbackFromApi = true
        }
      }

      // 2. 尝试 Direct HTML 提供者
      try {
        const directValue = await directCall()
        const directResult = validate(directValue)
        if (directResult.ok) {
          return {
            data: directResult.data,
            provider: 'direct',
            fallback: didFallbackFromApi,
            fallbackReason: didFallbackFromApi ? fallbackReason : undefined
          }
        }
        fallbackReason = directResult.reason
      } catch {
        fallbackReason = 'direct-error'
      }

      // 3. 最终尝试 BrowserWindow 提供者
      const browserValue = await browserCall()
      const browserResult = validate(browserValue)
      if (!browserResult.ok) {
        throw new Error(`browser-validation:${browserResult.reason}`)
      }
      return {
        data: browserResult.data,
        provider: 'browser',
        fallback: true,
        fallbackReason
      }
    }

    const isValidGatewayResult = (candidate: unknown): candidate is GatewayResult<T> => {
      if (!candidate || typeof candidate !== 'object') return false
      const result = candidate as Partial<GatewayResult<T>>
      if (result.provider !== 'api' && result.provider !== 'direct' && result.provider !== 'browser') {
        return false
      }
      if (typeof result.fallback !== 'boolean') return false
      return validate(result.data as T).ok
    }

    const requestGeneration = generation
    const request = (async (): Promise<GatewayResult<T>> => {
      const value = options.persistentCache
        ? (await options.persistentCache.resolve(key, load, isValidGatewayResult)).value
        : await load()
      if (requestGeneration === generation) {
        cache.set(key, { expiresAt: now() + options.ttlMs, value })
      }
      return value
    })().finally(() => {
      if (inFlight.get(key) === request) inFlight.delete(key)
    })

    inFlight.set(key, request as Promise<GatewayResult<unknown>>)
    return request
  }

  return {
    homepage(category) {
      return run(
        'homepage',
        `homepage:${category}`,
        options.api ? () => options.api!.homepage(category) : undefined,
        () => options.direct.homepage(category),
        () => options.browser.homepage(category),
        validateCards
      )
    },
    search(request) {
      const key = `search:${stableSerialize(request)}`
      return run(
        'search',
        key,
        options.api ? () => options.api!.search(request) : undefined,
        () => options.direct.search(request),
        () => options.browser.search(request),
        validateList
      )
    },
    category(request) {
      const key = `category:${stableSerialize(request)}`
      const validator = request.recommendation === true
        ? validateRecommendationList
        : validateList
      return run(
        'category',
        key,
        options.api ? () => options.api!.category(request) : undefined,
        () => options.direct.category(request),
        () => options.browser.category(request),
        validator
      )
    },
    detail(mangaId) {
      return run(
        'detail',
        `detail:${mangaId}`,
        options.api ? () => options.api!.detail(mangaId) : undefined,
        () => options.direct.detail(mangaId),
        () => options.browser.detail(mangaId),
        validateDetail
      )
    },
    pages(chapterUrl) {
      return run(
        'pages',
        `pages:${chapterUrl}`,
        options.api ? () => options.api!.pages(chapterUrl) : undefined,
        () => options.direct.pages(chapterUrl),
        () => options.browser.pages(chapterUrl),
        validatePages
      )
    },
    async clear() {
      generation++
      cache.clear()
      inFlight.clear()
      healthByEndpoint.clear()
      await options.persistentCache?.clear()
    }
  }
}
