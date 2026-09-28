import { parseHtml, buildUrl, httpRequest } from './httpClient'
import type {
  MangaListItem,
  PageItem,
  ChapterPagesResult
} from './types'
import {
  buildAlbumListPath,
  isRandomRecommendationTitle,
  type AlbumListRequest
} from './recommendationData'

/**
 * JMComic Web adapter — regex patterns taken directly from
 * JMComic-Crawler-Python (jm_toolkit.py / jm_client_impl.py).
 *
 * Uses cheerio for DOM navigation + regex for structured field extraction.
 */
export class JmWebAdapter {

  // ── Regex patterns (from jm_toolkit.py) ──────────────
  private readonly RE_SCRAMBLE_ID = /var\s+scramble_id\s*=\s*(\d+)/
  private readonly RE_PAGE_ARR = /var page_arr = (.*?);/
  private readonly RE_IMG_DOMAIN = /src="https:\/\/(.*?)\/media\/albums\/blank/

  // Search patterns (from jm_toolkit.py JmPageTool)
  private readonly RE_SEARCH_TOTAL = /class="text-white">(\d+)<\/span> A漫\./
  private readonly RE_SEARCH_ALBUM = /<a href="\/album\/(\d+)\/[\s\S]*?title="(.*?)"([\s\S]*?)<div class="title-truncate tags .*>([\s\S]*?)<\/div>/

  // ── Search ────────────────────────────────────────────

  async search(query: string, page = 1): Promise<{
    results: MangaListItem[]
    totalPages: number
    currentPage: number
  }> {
    const params = new URLSearchParams({
      search_query: query,
      page: String(page),
      main_tag: '0',
      o: 'mr',
      t: 'a'
    })
    const html = await this.fetchHtml(`/search/photos?${params.toString()}`)
    return this.parseSearchPage(html, page)
  }

  async listAlbums(request: AlbumListRequest): Promise<{
    results: MangaListItem[]
    totalPages: number
    currentPage: number
  }> {
    const html = await this.fetchHtml(buildAlbumListPath(request))
    return this.parseSearchPage(html, request.page)
  }

  // ── Chapter Pages ─────────────────────────────────────

  async getChapterPages(chapterUrl: string): Promise<ChapterPagesResult> {
    const html = await this.fetchHtml(chapterUrl)
    const $ = parseHtml(html)
    const scrambleMatch = html.match(this.RE_SCRAMBLE_ID)
    const scrambleId = scrambleMatch ? Number(scrambleMatch[1]) : 0

    // 从 chapterUrl 提取 photo_id — 图片 URL 需要包含它作为子目录
    const photoIdMatch = chapterUrl.match(/\/photo\/(\d+)/)
    const photoId = photoIdMatch ? photoIdMatch[1] : ''

    // Method 1: var page_arr = [...]
    const pageArrMatch = html.match(this.RE_PAGE_ARR)
    if (pageArrMatch) {
      try {
        const arr = JSON.parse(pageArrMatch[1]) as string[]
        // Get image domain
        const domainMatch = html.match(this.RE_IMG_DOMAIN)
        const imgDomain = domainMatch ? domainMatch[1] : 'cdn-msp3.18comic.vip'

        const pages = arr.map((filename, i) => ({
          index: i,
          imageUrl: `https://${imgDomain}/media/photos/${photoId}/${filename}`
        }))
        return { pages, scrambleId }
      } catch { /* fall through */ }
    }

    // Method 2: data-original images
    const pages: PageItem[] = []
    const seen = new Set<string>()

    $('img[data-original]').each((i, el) => {
      const src = $(el).attr('data-original') ?? ''
      if (src && !seen.has(src)) {
        seen.add(src)
        pages.push({ index: i, imageUrl: this.normalizeImageUrl(src) })
      }
    })

    if (pages.length > 0) return { pages, scrambleId }

    // Method 3: any image
    $('img').each((i, el) => {
      const src = $(el).attr('data-src') ?? $(el).attr('src') ?? ''
      if (src && !seen.has(src) && /\.(jpg|png|webp|jpeg)/i.test(src)) {
        seen.add(src)
        pages.push({ index: i, imageUrl: this.normalizeImageUrl(src) })
      }
    })

    return { pages, scrambleId }
  }

  // ── Private helpers ────────────────────────────────────

  private parseSearchPage(html: string, page: number): {
    results: MangaListItem[]
    totalPages: number
    currentPage: number
  } {
    const results: MangaListItem[] = []
    const seen = new Set<string>()

    // Try the regex from Python project
    const albumRe = new RegExp(this.RE_SEARCH_ALBUM.source, 'g')
    let m: RegExpExecArray | null
    while ((m = albumRe.exec(html)) !== null) {
      const albumId = m[1]
      const title = m[2].trim()
      const tagHtml = m[4]
      const tags = [...tagHtml.matchAll(/<a[^>]*?>(.*?)<\/a>/g)].map((tm) => tm[1].trim())

      if (seen.has(albumId) || isRandomRecommendationTitle(title)) continue
      seen.add(albumId)

      results.push({
        id: albumId,
        title,
        coverUrl: this.buildCoverUrl(albumId),
        tags: tags.length > 0 ? tags : undefined
      })
    }

    // Fallback: cheerio-based
    if (results.length === 0) {
      const $ = parseHtml(html)
      $('a[href*="/album/"]').each((_i, el) => {
        const href = $(el).attr('href') ?? ''
        const idMatch = href.match(/\/album\/(\d+)/)
        if (!idMatch) return
        const id = idMatch[1]
        const title = $(el).attr('title') ?? $(el).text().trim()
        if (
          title
          && title.length > 2
          && !seen.has(id)
          && !isRandomRecommendationTitle(title)
        ) {
          seen.add(id)
          results.push({ id, title, coverUrl: this.buildCoverUrl(id) })
        }
      })
    }

    // Total pages
    const totalMatch = html.match(this.RE_SEARCH_TOTAL)
    let total = 0
    if (totalMatch) total = parseInt(totalMatch[1])

    const perPage = results.length > 0 ? results.length : 20
    const totalPages = total > 0 ? Math.ceil(total / perPage) : page

    return { results, totalPages, currentPage: page }
  }

  private buildCoverUrl(albumId: string): string {
    // Pattern from Python: /media/albums/{id}_3x4.jpg or /media/albums/{id}.jpg
    return `https://cdn-msp3.18comic.vip/media/albums/${albumId}.jpg`
  }

  private async fetchHtml(path: string): Promise<string> {
    const resp = await httpRequest(buildUrl(path), {
      headers: {
        Referer: buildUrl('/')
      }
    })

    return resp.body
  }

  private normalizeImageUrl(url: string): string {
    if (!url) return ''
    if (url.startsWith('http')) return url
    if (url.startsWith('//')) return `https:${url}`
    if (url.startsWith('/')) return buildUrl(url)
    return buildUrl('/' + url)
  }
}
