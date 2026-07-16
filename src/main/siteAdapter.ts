import { parseHtml, buildUrl, httpRequest } from './httpClient'
import type { CheerioAPI, Cheerio, AnyNode } from 'cheerio'
import type {
  SiteAdapter,
  MangaListItem,
  MangaDetail,
  ChapterItem,
  PageItem
} from './types'

/**
 * JMComic Web adapter — regex patterns taken directly from
 * JMComic-Crawler-Python (jm_toolkit.py / jm_client_impl.py).
 *
 * Uses cheerio for DOM navigation + regex for structured field extraction.
 */
export class JmWebAdapter implements SiteAdapter {
  name = 'JMComic Web'
  baseUrls: string[]

  private cookieJar: Record<string, string> = {}
  private _username: string | null = null

  // ── Regex patterns (from jm_toolkit.py) ──────────────
  private readonly RE_ALBUM_ID = /<span class="number">.*?：JM(\d+)<\/span>/
  private readonly RE_SCRAMBLE_ID = /var scramble_id = (\d+);/
  private readonly RE_BOOK_NAME = /id="book-name"[^>]*?>([\s\S]*?)<\//
  private readonly RE_EPISODE = /data-album="(\d+)"[^>]*>[\s\S]*?第(\d+)[话話]([\s\S]*?)<[\s\S]*?>/
  private readonly RE_B64_HTML = /const html = base64DecodeUtf8\("(.*?)"\)/
  private readonly RE_PHOTO_TITLE = /<title>([\s\S]*?)\|.*<\/title>/
  private readonly RE_PAGE_ARR = /var page_arr = (.*?);/
  private readonly RE_DATA_ORIGINAL = /data-original="(.*?)"[^>]*?id="album_photo/
  private readonly RE_IMG_DOMAIN = /src="https:\/\/(.*?)\/media\/albums\/blank/

  // Search patterns (from jm_toolkit.py JmPageTool)
  private readonly RE_SEARCH_TOTAL = /class="text-white">(\d+)<\/span> A漫\./
  private readonly RE_SEARCH_ALBUM = /<a href="\/album\/(\d+)\/[\s\S]*?title="(.*?)"([\s\S]*?)<div class="title-truncate tags .*>([\s\S]*?)<\/div>/
  private readonly RE_TAG_A = /<a[^>]*?>(.*?)<\/a>/

  constructor(baseUrls: string[]) {
    this.baseUrls = baseUrls
  }

  async probe(): Promise<boolean> {
    try {
      const resp = await httpRequest(buildUrl('/'), { method: 'HEAD', timeout: 8000 })
      return resp.status < 500
    } catch {
      return false
    }
  }

  // ── Homepage ──────────────────────────────────────────

  async getHomepage(): Promise<{
    recommended: MangaListItem[]
    latest: MangaListItem[]
    popular: MangaListItem[]
  }> {
    const html = await this.fetchHtml('/')
    const $ = parseHtml(html)

    // JMComic homepage structure: cards with links to /album/{id}/
    const cards = this.parseCardGrid($, 'a[href*="/album/"]')

    // Split into sections (heuristic: first row = recommended, rest = latest)
    const recommended = cards.slice(0, 8)
    const latest = cards.slice(8, 20)
    const popular = cards.slice(8) // Same as latest for now

    return { recommended, latest, popular }
  }

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

  async getCategory(categoryId: string, page = 1): Promise<{
    results: MangaListItem[]
    totalPages: number
    currentPage: number
  }> {
    const params = new URLSearchParams({
      page: String(page),
      o: 'mr',
      t: 'a'
    })
    const html = await this.fetchHtml(`/albums/${categoryId}?${params.toString()}`)
    return this.parseSearchPage(html, page)
  }

  // ── Manga Detail ──────────────────────────────────────

  async getMangaDetail(mangaId: string): Promise<MangaDetail> {
    let html = await this.fetchHtml(`/album/${mangaId}`)

    // Some album pages have base64-encoded content
    const b64Match = html.match(this.RE_B64_HTML)
    if (b64Match) {
      html = Buffer.from(b64Match[1], 'base64').toString('utf-8')
    }

    const $ = parseHtml(html)

    // Title
    let title = ''
    const nameMatch = html.match(this.RE_BOOK_NAME)
    if (nameMatch) title = nameMatch[1].trim()
    if (!title) title = $('h1, .book-name, #book-name').first().text().trim()
    if (!title) title = $('title').text().replace(/\|.*/, '').trim()

    // Author & tags
    const author = $('span[itemprop="author"][data-type="author"] a').map((_i, el) => $(el).text().trim()).get().join(', ')
    const tags = $('span[itemprop="genre"] a').map((_i, el) => $(el).text().trim()).get()

    // Cover
    const coverImg = $('img.img-responsive, .album-cover img, img.cover').first()
    const coverUrl = coverImg.attr('data-src') ?? coverImg.attr('src') ?? this.buildCoverUrl(mangaId)

    // Description
    const descEl = $('h2:contains("述"), .description, [itemprop="description"]').first()
    const description = descEl.text().trim().replace(/^[叙敘]述：/, '')

    // Chapters
    const chapters: ChapterItem[] = []
    const epMatches = html.matchAll(new RegExp(this.RE_EPISODE.source, 'g'))
    for (const m of epMatches) {
      chapters.push({
        index: parseInt(m[2]) - 1,
        title: `第${m[2]}話 ${m[3].trim()}`,
        url: `/photo/${m[1]}`
      })
    }

    // Fallback: cheerio-based chapter extraction
    if (chapters.length === 0) {
      $('a[href*="/photo/"]').each((i, el) => {
        const href = $(el).attr('href') ?? ''
        const photoIdMatch = href.match(/\/photo\/(\d+)/)
        if (photoIdMatch) {
          chapters.push({
            index: i,
            title: $(el).text().trim() || `第 ${i + 1} 話`,
            url: href.startsWith('/') ? href : `/photo/${photoIdMatch[1]}`
          })
        }
      })
    }

    // Scramble ID
    const scrambleMatch = html.match(this.RE_SCRAMBLE_ID)
    const scrambleId = scrambleMatch ? scrambleMatch[1] : '0'

    return {
      id: mangaId,
      title: title || '未知标题',
      author: author || '未知作者',
      coverUrl: this.normalizeImageUrl(coverUrl),
      tags,
      description,
      chapters,
      rating: undefined,
      totalViews: $('span:contains("次觀看")').first().text().trim() || undefined
    }
  }

  // ── Chapter Pages ─────────────────────────────────────

  async getChapterPages(chapterUrl: string): Promise<PageItem[]> {
    const html = await this.fetchHtml(chapterUrl)
    const $ = parseHtml(html)

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

        return arr.map((filename, i) => ({
          index: i,
          imageUrl: `https://${imgDomain}/media/photos/${photoId}/${filename}`
        }))
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

    if (pages.length > 0) return pages

    // Method 3: any image
    $('img').each((i, el) => {
      const src = $(el).attr('data-src') ?? $(el).attr('src') ?? ''
      if (src && !seen.has(src) && /\.(jpg|png|webp|jpeg)/i.test(src)) {
        seen.add(src)
        pages.push({ index: i, imageUrl: this.normalizeImageUrl(src) })
      }
    })

    return pages
  }

  // ── Login ─────────────────────────────────────────────

  async login(username: string, password: string): Promise<{ success: boolean; error?: string }> {
    const formData = new URLSearchParams({
      username,
      password,
      id_remember: 'on',
      login_remember: 'on',
      submit_login: ''
    })

    const resp = await httpRequest(buildUrl('/login'), {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: this.serializeCookies(),
        Referer: buildUrl('/')
      },
      body: formData.toString()
    })

    const setCookie = resp.headers['set-cookie']
    if (setCookie) this.parseSetCookie(setCookie)

    // With redirect:'manual', a successful login returns 302/301 carrying the
    // session cookies in Set-Cookie (captured into cookieJar above).
    if (resp.status === 302 || resp.status === 301) {
      this._username = username
      return { success: true }
    }

    // Fallback: some flows return 200 with a logged-in page body.
    if (resp.body.includes('欢迎') || resp.body.includes('logout')) {
      this._username = username
      return { success: true }
    }

    return { success: false, error: `登录失败，状态码: ${resp.status}` }
  }

  async getFavorites(page = 1): Promise<{ results: MangaListItem[]; totalPages: number }> {
    if (!this._username) throw new Error('未登录')
    const params = new URLSearchParams({ page: String(page), o: 'mr', folder: '0' })
    const html = await this.fetchHtml(`/user/${this._username}/favorite/albums?${params.toString()}`)

    // Use the favorite-specific pattern
    const contentRe = /<div id="favorites_album_[^>]*?>[\s\S]*?<a href="\/album\/(\d+)\/[^"]*">[\s\S]*?<div class="video-title title-truncate">([^<]*?)<\/div>/g
    const totalRe = / : (\d+)[^/]*\/\D*(\d+)/

    const results: MangaListItem[] = []
    let m: RegExpExecArray | null
    while ((m = contentRe.exec(html)) !== null) {
      results.push({
        id: m[1],
        title: m[2].trim(),
        coverUrl: this.buildCoverUrl(m[1])
      })
    }

    const totalMatch = html.match(totalRe)
    const total = totalMatch ? parseInt(totalMatch[2]) : results.length
    const perPage = 20
    const totalPages = Math.ceil(total / perPage)

    return { results, totalPages }
  }

  // ── Private helpers ────────────────────────────────────

  private parseSearchPage(html: string, page: number): {
    results: MangaListItem[]
    totalPages: number
    currentPage: number
  } {
    const results: MangaListItem[] = []

    // Try the regex from Python project
    const albumRe = new RegExp(this.RE_SEARCH_ALBUM.source, 'g')
    let m: RegExpExecArray | null
    while ((m = albumRe.exec(html)) !== null) {
      const albumId = m[1]
      const title = m[2].trim()
      const tagHtml = m[4]
      const tags = [...tagHtml.matchAll(/<a[^>]*?>(.*?)<\/a>/g)].map((tm) => tm[1].trim())

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
        if (title && title.length > 2) {
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

  private parseCardGrid($: CheerioAPI, _selector: string): MangaListItem[] {
    const items: MangaListItem[] = []
    const seen = new Set<string>()

    // Find all album links
    $('a[href*="/album/"]').each((_i, el) => {
      const href = $(el).attr('href') ?? ''
      const idMatch = href.match(/\/album\/(\d+)/)
      if (!idMatch) return
      const id = idMatch[1]
      if (seen.has(id)) return
      seen.add(id)

      const title = $(el).attr('title') ?? $(el).text().trim()
      if (title.length < 2) return

      // Find nearby image
      let coverUrl = ''
      const parent = $(el).parent()
      const img = parent.find('img').first()
      if (img.length > 0) {
        coverUrl = img.attr('data-src') ?? img.attr('src') ?? ''
      }
      if (!coverUrl) {
        coverUrl = this.buildCoverUrl(id)
      }

      items.push({ id, title, coverUrl: this.normalizeImageUrl(coverUrl) })
    })

    return items
  }

  private buildCoverUrl(albumId: string): string {
    // Pattern from Python: /media/albums/{id}_3x4.jpg or /media/albums/{id}.jpg
    return `https://cdn-msp3.18comic.vip/media/albums/${albumId}.jpg`
  }

  private async fetchHtml(path: string): Promise<string> {
    const resp = await httpRequest(buildUrl(path), {
      headers: {
        Cookie: this.serializeCookies(),
        Referer: buildUrl('/')
      }
    })

    const setCookie = resp.headers['set-cookie']
    if (setCookie) this.parseSetCookie(setCookie)

    return resp.body
  }

  private serializeCookies(): string {
    return Object.entries(this.cookieJar)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')
  }

  private parseSetCookie(header: string): void {
    for (const part of header.split(';')) {
      const eqIdx = part.indexOf('=')
      if (eqIdx > 0) {
        const key = part.substring(0, eqIdx).trim()
        const val = part.substring(eqIdx + 1).trim()
        if (key && val) this.cookieJar[key] = val
      }
    }
  }

  private normalizeImageUrl(url: string): string {
    if (!url) return ''
    if (url.startsWith('http')) return url
    if (url.startsWith('//')) return `https:${url}`
    if (url.startsWith('/')) return buildUrl(url)
    return buildUrl('/' + url)
  }
}

// Helper to make cheerio $ calls type-safe
declare module 'cheerio' {
  interface CheerioAPI {
    (selector: string): Cheerio<AnyNode>
  }
}
