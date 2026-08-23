import { validateCards, validateDetail, validatePages, type ValidationResult } from './contentValidation'
import type { ChapterPagesResult, MangaDetail, MangaListItem } from './types'

export type ContentProviderName = 'direct' | 'browser'
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
}

interface GatewayOptions {
  direct: ContentProvider
  browser: ContentProvider
  ttlMs: number
  now?: () => number
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

export function createContentGateway(options: GatewayOptions): ContentGateway {
  const now = options.now ?? Date.now
  const cache = new Map<string, { expiresAt: number; value: GatewayResult<unknown> }>()
  const inFlight = new Map<string, Promise<GatewayResult<unknown>>>()

  function run<T>(
    key: string,
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

    const request = (async (): Promise<GatewayResult<T>> => {
      let fallbackReason = 'direct-error'
      try {
        const directValue = await directCall()
        const directResult = validate(directValue)
        if (directResult.ok) {
          const value: GatewayResult<T> = {
            data: directResult.data,
            provider: 'direct',
            fallback: false
          }
          cache.set(key, { expiresAt: now() + options.ttlMs, value })
          return value
        }
        fallbackReason = directResult.reason
      } catch {
        fallbackReason = 'direct-error'
      }

      const browserValue = await browserCall()
      const browserResult = validate(browserValue)
      if (!browserResult.ok) {
        throw new Error(`browser-validation:${browserResult.reason}`)
      }
      const value: GatewayResult<T> = {
        data: browserResult.data,
        provider: 'browser',
        fallback: true,
        fallbackReason
      }
      cache.set(key, { expiresAt: now() + options.ttlMs, value })
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
        `homepage:${category}`,
        () => options.direct.homepage(category),
        () => options.browser.homepage(category),
        validateCards
      )
    },
    search(request) {
      const key = `search:${stableSerialize(request)}`
      return run(
        key,
        () => options.direct.search(request),
        () => options.browser.search(request),
        validateList
      )
    },
    category(request) {
      const key = `category:${stableSerialize(request)}`
      return run(
        key,
        () => options.direct.category(request),
        () => options.browser.category(request),
        validateList
      )
    },
    detail(mangaId) {
      return run(
        `detail:${mangaId}`,
        () => options.direct.detail(mangaId),
        () => options.browser.detail(mangaId),
        validateDetail
      )
    },
    pages(chapterUrl) {
      return run(
        `pages:${chapterUrl}`,
        () => options.direct.pages(chapterUrl),
        () => options.browser.pages(chapterUrl),
        validatePages
      )
    }
  }
}
