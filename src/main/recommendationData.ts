import { normalizeRecommendationTags, type RecommendationSource } from '../shared/recommendationCore'

export interface AlbumListRequest {
  tag?: string
  order: string
  time: string
  page: number
  recommendation?: boolean
}

export interface RecommendationSourceRequest {
  source: RecommendationSource
  tag?: string
  request: AlbumListRequest
}

const RANDOM_RECOMMENDATION_LABEL = /^(?:隨便看看|随便看看|隨便看|随便看|換一換|换一换|換一個|换一个)$/i

export function isRandomRecommendationTitle(title: string): boolean {
  return RANDOM_RECOMMENDATION_LABEL.test(title.trim())
}

export function buildAlbumListPath(request: AlbumListRequest): string {
  const page = String(Math.max(1, Math.trunc(request.page)))
  if (request.tag) {
    const params = new URLSearchParams({
      search_query: request.tag,
      page,
      main_tag: '0',
      o: request.order,
      t: request.time
    })
    return `/search/photos?${params.toString()}`
  }
  const params = new URLSearchParams({
    page,
    o: request.order,
    t: request.time
  })
  return `/albums?${params.toString()}`
}

export function selectRotatingTags(
  rawTags: unknown,
  count: number,
  offset: number
): { tags: string[]; nextOffset: number } {
  const tags = normalizeRecommendationTags(rawTags)
  if (tags.length === 0 || count <= 0) return { tags: [], nextOffset: 0 }
  const start = ((Math.trunc(offset) % tags.length) + tags.length) % tags.length
  const selected = Array.from(
    { length: Math.min(Math.trunc(count), tags.length) },
    (_, index) => tags[(start + index) % tags.length]
  )
  return {
    tags: selected,
    nextOffset: (start + selected.length) % tags.length
  }
}

export function buildRecommendationSourceRequests(
  rawTags: unknown,
  tagOffset: number
): { sources: RecommendationSourceRequest[]; nextTagOffset: number } {
  const rotation = selectRotatingTags(rawTags, 3, tagOffset)
  const sources: RecommendationSourceRequest[] = [
    { source: 'latest', request: { order: 'mr', time: 'a', page: 1, recommendation: true } },
    { source: 'weekly', request: { order: 'mv', time: 'w', page: 1, recommendation: true } },
    { source: 'quality', request: { order: 'tf', time: 'a', page: 1, recommendation: true } },
    { source: 'quality', request: { order: 'tr', time: 'a', page: 1, recommendation: true } },
    ...rotation.tags.map((tag): RecommendationSourceRequest => ({
      source: 'tag',
      tag,
      request: { tag, order: 'mv', time: 'm', page: 1, recommendation: true }
    }))
  ]
  return { sources, nextTagOffset: rotation.nextOffset }
}
