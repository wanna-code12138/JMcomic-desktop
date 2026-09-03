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
      const query: Record<string, string> = { category }
      const raw = await transport.request('category', query)
      const list = parseListPayload(raw, imageOrigin)
      return list.results
    },

    async search(request: SearchRequest): Promise<GatewayListResult> {
      const query: Record<string, string> = {
        search_query: request.query,
        page: String(request.page)
      }
      if (request.order) query.o = request.order
      const raw = await transport.request('search', query)
      return parseListPayload(raw, imageOrigin)
    },

    async category(request: CategoryRequest): Promise<GatewayListResult> {
      const query: Record<string, string> = {}
      if (request.category) query.category = request.category
      if (request.page) query.page = String(request.page)
      if (request.order) query.o = request.order
      const raw = await transport.request('category', query)
      return parseListPayload(raw, imageOrigin)
    },

    async detail(mangaId: string): Promise<MangaDetail> {
      const raw = await transport.request('detail', { id: mangaId })
      return parseAlbumPayload(raw, imageOrigin)
    },

    async pages(chapterUrl: string): Promise<ChapterPagesResult> {
      const match = chapterUrl.match(/(?:photos?|albums?)\/(\d+)/i)
      const chapterId = match ? match[1] : chapterUrl.replace(/\D/g, '')
      const raw = await transport.request('pages', { id: chapterId })
      return parseComicReadPayload(raw, imageOrigin)
    }
  }
}
