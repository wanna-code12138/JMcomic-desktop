import type { ContentProvider, GatewayListResult, SearchRequest, CategoryRequest, HomepageCategory } from '../contentGateway'
import type { ChapterPagesResult, MangaDetail, MangaListItem } from '../types'
import type { JmAppApiTransport } from './jmAppApiTransport'
import {
  parseListPayload,
  parseAlbumPayload,
  parseComicReadPayload
} from './jmAppApiSchemas'

export function createJmAppApiProvider(
  transport: JmAppApiTransport,
  imageOrigin = 'https://cdn-msp.18comic.vip'
): ContentProvider {
  return {
    async homepage(category: HomepageCategory): Promise<MangaListItem[]> {
      if (category === 'recommended') throw new Error('api-homepage-recommendation-unsupported')
      const query: Record<string, string> = { c: '0', page: '1', order: '', o: category === 'latest' ? 'mr' : 'mv' }
      const raw = await transport.request('category', query)
      const list = parseListPayload(raw, imageOrigin)
      return list.results
    },

    async search(request: SearchRequest): Promise<GatewayListResult> {
      if (request.category && request.category !== '0') throw new Error('api-search-filter-unsupported')
      const query: Record<string, string> = {
        search_query: request.query,
        page: String(request.page),
        main_tag: String(request.mainTag),
        t: request.time
      }
      if (request.order) query.o = request.order
      const raw = await transport.request('search', query)
      return parseListPayload(raw, imageOrigin)
    },

    async category(request: CategoryRequest): Promise<GatewayListResult> {
      if (request.subCategory || (request.tag && request.category && request.category !== '0')) throw new Error('api-category-filter-unsupported')
      const order = request.order ?? 'mr'
      const time = request.time ?? 'a'
      const query: Record<string, string> = {
        c: request.category ?? '0', page: String(request.page ?? 1), order: '',
        o: time === 'a' ? order : `${order}_${time}`
      }
      const raw = request.tag
        ? await transport.request('search', { search_query: request.tag, main_tag: '0', page: query.page, o: order, t: time })
        : await transport.request('category', query)
      return parseListPayload(raw, imageOrigin)
    },

    async detail(mangaId: string): Promise<MangaDetail> {
      const raw = await transport.request('detail', { id: mangaId })
      return parseAlbumPayload(raw, imageOrigin)
    },

    async pages(chapterUrl: string): Promise<ChapterPagesResult> {
      const match = chapterUrl.match(/^(?:https:\/\/[^/?#]+)?\/photos?\/([1-9]\d*)(?:[/?#].*)?$/i)
      const chapterId = match ? match[1] : /^[1-9]\d*$/.test(chapterUrl) ? chapterUrl : ''
      if (!chapterId) throw new Error('api-chapter-url-invalid')
      const raw = await transport.request('pages', { id: chapterId })
      return parseComicReadPayload(raw, imageOrigin, chapterId)
    }
  }
}
