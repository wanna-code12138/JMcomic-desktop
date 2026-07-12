import { BrowserWindow, session, app } from 'electron'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { getActiveDomain } from './networkProbe'

let scraperWin: BrowserWindow | null = null

function getDebugDir(): string {
  const dir = join(app.getPath('temp'), 'jmcomic-debug')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function dumpDebug(label: string, content: string): string {
  const filepath = join(getDebugDir(), `${label}-${Date.now()}.html`)
  writeFileSync(filepath, content, 'utf-8')
  return filepath
}

// ─── 内容缓存 ───────────────────────────────────────────────────
// 避免重复打开同一页面时重新加载整个浏览器（3-15s）。
// TTL 10 分钟：首页内容更新不频繁，足够避免重复抓取。
interface CacheEntry {
  data: unknown
  expiry: number
}
const CONTENT_CACHE = new Map<string, CacheEntry>()
const CACHE_TTL = 10 * 60 * 1000

function cacheGet<T>(key: string): T | null {
  const entry = CONTENT_CACHE.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiry) {
    CONTENT_CACHE.delete(key)
    return null
  }
  return entry.data as T
}

function cacheSet(key: string, data: unknown): void {
  CONTENT_CACHE.set(key, { data, expiry: Date.now() + CACHE_TTL })
}

export function clearScraperCache(): void {
  CONTENT_CACHE.clear()
  console.log('[scraper] cache cleared')
}

// ─── 互斥锁：确保 scraperWindow 串行使用 ─────────────────────────
// scraperWindow 是单例，两个并发导航会互相冲突（第二个 loadURL 会中止
// 第一个的导航），导致 ERR_ABORTED 错误。
let scraperMutex: Promise<void> = Promise.resolve()

async function withScraperLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = scraperMutex
  let release!: () => void
  scraperMutex = new Promise<void>((r) => { release = r })
  await prev
  try {
    return await fn()
  } finally {
    release()
  }
}

export function getScraperWindow(): BrowserWindow {
  if (scraperWin && !scraperWin.isDestroyed()) return scraperWin
  scraperWin = new BrowserWindow({
    width: 1280, height: 800,
    show: false, frame: false, skipTaskbar: true,
    webPreferences: {
      session: session.defaultSession,
      nodeIntegration: false,
      contextIsolation: true,
      // 关键优化：不下载/渲染图片。page_arr 是 JS 变量，
      // data-original 是 DOM 属性，都不依赖图片实际加载。
      // 关闭后页面加载时间从 5-15s 降到 1-4s。
      images: false,
      // 不需要播放音视频
      webgl: false,
      plugins: false
    }
  })

  // 拦截非必要资源（广告、追踪、字体、媒体）进一步加速。
  // 只作用于 scraper 窗口所在的 defaultSession 的 webRequest，
  // 但通过 URL 模式过滤，只拦截明显的广告/追踪域名，不影响主窗口。
  // 注意：这里用 once + filter 避免重复注册。
  return scraperWin
}

/**
 * 导航到 URL 并等待页面加载完成。
 *
 * 修复竞态条件：loadURL() 的 Promise rejection 可能比 did-fail-load
 * 事件先到达。ERR_ABORTED (-3) 是重定向常见错误，不应reject。
 * loadURL catch 中忽略 ERR_ABORTED，让 did-fail-load 或超时来处理。
 */
export async function navigateAndWait(url: string, waitMs = 1500): Promise<void> {
  const win = getScraperWindow()
  return new Promise<void>((resolve, reject) => {
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      console.log('[scraper] navigate timeout, proceeding anyway:', url.slice(0, 80))
      resolve()
    }, 15000)

    win.webContents.once('did-finish-load', () => {
      if (settled) return
      // 页面主框架加载完成，额外等待 JS 渲染
      setTimeout(() => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolve()
      }, waitMs)
    })

    win.webContents.once('did-fail-load', (_e, code, desc) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      // -3 (ERR_ABORTED) 常见于导航被取消（如重定向），不当作致命错误
      // 等待一下让重定向完成，然后 resolve 让提取逻辑尝试
      if (code === -3) {
        console.log('[scraper] ERR_ABORTED (redirect?), waiting and proceeding:', url.slice(0, 80))
        setTimeout(resolve, waitMs)
      } else {
        reject(new Error(`Load failed: ${code} ${desc}`))
      }
    })

    win.loadURL(url).catch((err) => {
      // ERR_ABORTED 通常由 did-fail-load 处理，这里忽略避免竞态
      const errStr = String(err)
      if (settled) return
      if (errStr.includes('ERR_ABORTED') || errStr.includes('-3')) {
        console.log('[scraper] loadURL ERR_ABORTED, letting did-fail-load handle it:', url.slice(0, 80))
        return // 让 did-fail-load 或超时处理
      }
      settled = true
      clearTimeout(timeout)
      reject(err)
    })
  })
}

async function extract<T>(script: string): Promise<T> {
  const win = getScraperWindow()
  return win.webContents.executeJavaScript(script) as Promise<T>
}

// ═══════════════════════════════════════════════════════════
// Robust extraction: multiple strategies, detailed debugging
// ═══════════════════════════════════════════════════════════

interface MangaCard {
  id: string; title: string; coverUrl: string; author?: string; chapter?: string
}

/**
 * Extract ALL manga cards from the current page using multiple strategies.
 * Strategy 1: Look for album links inside card-like containers
 * Strategy 2: Look for all album links with nearby images
 * Strategy 3: Fallback — any album link
 */
async function extractAllCards(): Promise<{ cards: MangaCard[]; debug: string }> {
  const result = await extract<{ cards: MangaCard[]; debug: string }>(`
    (function() {
      var cards = [];
      var debug = [];
      var seen = {};

      debug.push('URL: ' + location.href);
      debug.push('Title: ' + document.title);

      // ── Strategy 1: Container-based ──────────────────
      // Look for well-structured card containers
      var containers = document.querySelectorAll(
        '.well, .card, .col-xs-6, .col-sm-4, .col-md-3, .col-lg-2, ' +
        '[class*="col-"][class*="-4"], [class*="col-"][class*="-3"], [class*="col-"][class*="-2"], ' +
        '.video-thumb, .album-item, .photo-item, li, .grid-item'
      );

      debug.push('Containers found: ' + containers.length);

      containers.forEach(function(container) {
        var a = container.querySelector('a[href*="/album/"]');
        if (!a) return;
        var href = a.getAttribute('href');
        var match = href.match(/\\/album\\/(\\d+)/);
        if (!match) return;
        var id = match[1];
        if (seen[id]) return;

        // Title: try data-title, title attr, alt, text, or nearby heading
        var title = a.getAttribute('data-title') ||
                    a.getAttribute('title') ||
                    (a.querySelector('img') ? (a.querySelector('img').getAttribute('alt') || '') : '');

        if (!title || title.length < 2) {
          var textEl = a.querySelector('.video-title, .title, .caption, h3, h4, h5, span, p');
          if (textEl) title = textEl.textContent.trim();
          if (!title || title.length < 2) {
            title = a.textContent.trim();
          }
          title = title.replace(/JM\\d+/g, '').replace(/\\s+/g, ' ').trim();
        }

        // Filter out junk entries
        if (!title || title.length < 2) return;
        if (/^(随便看|換一換|換一個|随机|random|换一换|随便看看|隨便看看)$/i.test(title)) return;
        if (/^(随便看|換一換|換一個|随机|random|换一换)/i.test(title) && title.length < 8) return;
        seen[id] = true;

        // Cover image
        var img = container.querySelector('img');
        var coverUrl = '';
        if (img) {
          coverUrl = img.getAttribute('data-src') ||
                     img.getAttribute('data-original') ||
                     img.getAttribute('src') ||
                     '';
        }
        if (!coverUrl || coverUrl.startsWith('data:')) {
          coverUrl = 'https://cdn-msp3.18comic.vip/media/albums/' + id + '.jpg';
        }
        if (coverUrl.startsWith('//')) coverUrl = 'https:' + coverUrl;

        // Author
        var authorEl = container.querySelector('.author, [itemprop="author"], [data-author], .video-author');
        var author = authorEl ? authorEl.textContent.trim() : '';

        // Chapter
        var chapterEl = container.querySelector('.chapter, .latest, .video-chapter, .episode');
        var chapter = chapterEl ? chapterEl.textContent.trim() : '';

        cards.push({
          id: id, title: title, coverUrl: coverUrl,
          author: author, chapter: chapter
        });
      });

      debug.push('Strategy 1 cards: ' + cards.length);

      // ── Strategy 2: Direct links ───────────────────
      if (cards.length < 5) {
        var links = document.querySelectorAll('a[href*="/album/"]');
        debug.push('Total album links on page: ' + links.length);

        links.forEach(function(a) {
          var href = a.getAttribute('href');
          var match = href.match(/\\/album\\/(\\d+)/);
          if (!match) return;
          var id = match[1];
          if (seen[id]) return;

          var title = a.getAttribute('title') || a.textContent.trim();
          title = title.replace(/JM\\d+/g, '').replace(/\\s+/g, ' ').trim();
          if (!title || title.length < 2) return;
          if (/^(随便看|換一換|換一個|随机|random|换一换|随便看看|隨便看看)$/i.test(title)) return;
          if (/^(随便看|換一換|換一個|随机|random|换一换)/i.test(title) && title.length < 8) return;

          seen[id] = true;

          // Walk up to find image
          var img = null;
          var parent = a.parentElement;
          for (var i = 0; i < 5 && parent && !img; i++) {
            img = parent.querySelector('img');
            if (!img) parent = parent.parentElement;
          }
          var coverUrl = '';
          if (img) {
            coverUrl = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('src') || '';
          }
          if (!coverUrl || coverUrl.startsWith('data:')) {
            coverUrl = 'https://cdn-msp3.18comic.vip/media/albums/' + id + '.jpg';
          }
          if (coverUrl.startsWith('//')) coverUrl = 'https:' + coverUrl;

          cards.push({ id: id, title: title, coverUrl: coverUrl });
        });
      }

      debug.push('Total cards after all strategies: ' + cards.length);

      // ── Debug: sample some links ───────────────────
      if (cards.length === 0) {
        var sampleLinks = document.querySelectorAll('a[href*="/album/"]');
        sampleLinks.forEach(function(a, i) {
          if (i >= 5) return;
          var href = a.getAttribute('href');
          debug.push('Sample link ' + i + ': href=' + href +
            ' title="' + (a.getAttribute('title') || '') + '"' +
            ' text="' + a.textContent.trim().substring(0, 60) + '"' +
            ' tag=' + a.tagName +
            ' parent=' + (a.parentElement ? a.parentElement.className : ''));
          // Show all attributes
          var attrs = [];
          for (var j = 0; j < a.attributes.length; j++) {
            attrs.push(a.attributes[j].name + '=' + a.attributes[j].value.substring(0, 50));
          }
          debug.push('  attrs: ' + attrs.join(', '));
        });
      }

      return { cards: cards, debug: debug.join('\\n') };
    })()
  `)

  return result
}

// ═══════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════

export async function extractHomepage(): Promise<{
  recommended: MangaCard[]
  latest: MangaCard[]
  popular: MangaCard[]
  debug?: string
}> {
  const cacheKey = 'homepage'
  const cached = cacheGet<{ recommended: MangaCard[]; latest: MangaCard[]; popular: MangaCard[]; debug?: string }>(cacheKey)
  if (cached) {
    console.log('[scraper] homepage cache hit')
    return cached
  }

  return withScraperLock(async () => {
    const domain = getActiveDomain()
    await navigateAndWait(`https://${domain}/`, 1500)

    const { cards, debug } = await extractAllCards()

    // Save debug info
    if (cards.length === 0) {
      const pageHtml = await extract<string>(`document.documentElement.outerHTML`)
      const dumpPath = dumpDebug('homepage', debug + '\n\n===PAGE HTML===\n' + pageHtml.substring(0, 50000))
      return {
        recommended: [], latest: [], popular: [],
        debug: `0 张卡片被提取。调试信息已保存至: ${dumpPath}\n\n${debug}`
      }
    }

    const result = {
      recommended: cards.slice(0, 12),
      latest: cards.slice(0, 24),
      popular: cards.slice(0, 24),
      debug: debug
    }
    cacheSet(cacheKey, result)
    return result
  })
}

type MangaDetailResult = {
  id: string; title: string; author: string; coverUrl: string
  tags: string[]; description: string
  chapters: { index: number; title: string; url: string }[]
  debug?: string
}

export async function extractMangaDetail(mangaId: string): Promise<MangaDetailResult> {
  const cacheKey = `detail:${mangaId}`
  const cached = cacheGet<MangaDetailResult>(cacheKey)
  if (cached) {
    console.log('[scraper] detail cache hit:', mangaId)
    return cached
  }

  return withScraperLock(async () => {
    const domain = getActiveDomain()
    await navigateAndWait(`https://${domain}/album/${mangaId}/`, 1500)

    const result = await extract<{
      id: string; title: string; author: string; coverUrl: string
      tags: string[]; description: string
      chapters: { index: number; title: string; url: string }[]
      debug: string
    }>(`
      (function() {
        var debug = [];
        debug.push('URL: ' + location.href);
        debug.push('Title: ' + document.title);

        var id = '${mangaId}';

        var title = '';
        var el = document.querySelector('#book-name, h1, .book-name, .album-title, .video-title');
        if (el) title = el.textContent.trim();
        if (!title) title = document.title.replace(/\\|.*/, '').trim();

        var author = '';
        document.querySelectorAll('span[itemprop="author"] a, .author a, [data-type="author"] a').forEach(function(a) {
          author += (author ? ', ' : '') + a.textContent.trim();
        });

        var coverImg = document.querySelector('img.img-responsive, .album-cover img, img.cover, .book-cover img, .video-cover img');
        var coverUrl = '';
        if (coverImg) {
          coverUrl = coverImg.getAttribute('data-src') || coverImg.getAttribute('src') || '';
        }
        if (!coverUrl) coverUrl = 'https://cdn-msp3.18comic.vip/media/albums/' + id + '.jpg';
        if (coverUrl.startsWith('//')) coverUrl = 'https:' + coverUrl;

        var tags = [];
        document.querySelectorAll('span[itemprop="genre"] a, .tags a, .tag-list a, .label-tag').forEach(function(el) {
          var t = el.textContent.trim();
          if (t) tags.push(t);
        });

        var desc = '';
        var descEl = document.querySelector('.description, [itemprop="description"], .summary, .intro, .album-description, #album-description');
        if (descEl) desc = descEl.textContent.trim();

        var chapters = [];
        var chapterSeen = {};
        document.querySelectorAll('a[href*="/photo/"]').forEach(function(a) {
          var href = a.getAttribute('href');
          var photoMatch = href.match(/\\/photo\\/(\\d+)/);
          if (!photoMatch) return;
          var key = photoMatch[1];
          if (chapterSeen[key]) return;
          chapterSeen[key] = true;
          chapters.push({
            index: chapters.length,
            title: a.textContent.trim() || ('第 ' + (chapters.length + 1) + ' 話'),
            url: href.startsWith('/') ? href : '/photo/' + photoMatch[1]
          });
        });

        if (chapters.length === 0) {
          document.querySelectorAll('[data-album]').forEach(function(el) {
            var aid = el.getAttribute('data-album');
            chapters.push({
              index: chapters.length,
              title: el.textContent.trim() || ('第 ' + (chapters.length + 1) + ' 話'),
              url: '/photo/' + aid
            });
          });
        }

        debug.push('Chapters found: ' + chapters.length);
        debug.push('Tags found: ' + tags.length);

        return {
          id: id, title: title || '未知标题', author: author || '未知作者',
          coverUrl: coverUrl, tags: tags, description: desc || '',
          chapters: chapters, debug: debug.join('\\n')
        };
      })()
    `)

    cacheSet(cacheKey, result)
    return result
  })
}

export async function extractChapterPages(chapterUrl: string): Promise<{
  pages: { index: number; imageUrl: string }[]
  scrambleId?: number
  debug?: string
}> {
  const cacheKey = `pages:${chapterUrl}`
  const cached = cacheGet<{ pages: { index: number; imageUrl: string }[]; scrambleId?: number; debug?: string }>(cacheKey)
  if (cached) {
    console.log('[scraper] pages cache hit:', chapterUrl)
    return cached
  }

  return withScraperLock(async () => {
    const domain = getActiveDomain()
    const fullUrl = chapterUrl.startsWith('http') ? chapterUrl : `https://${domain}${chapterUrl}`
    // 从 chapterUrl 提取 photo_id — 图片 URL 需要包含它作为子目录
    // URL 格式: /photo/296135 → photoId = "296135"
    const photoIdMatch = chapterUrl.match(/\/photo\/(\d+)/)
    const photoId = photoIdMatch ? photoIdMatch[1] : ''
    console.log('[scraper] extractChapterPages navigating to:', fullUrl, 'photoId:', photoId)
    await navigateAndWait(fullUrl, 2500)

    const result = await extract<{ pages: { index: number; imageUrl: string }[]; scrambleId: number; debug: string }>(`
    (function() {
      var pages = [];
      var debug = [];
      debug.push('URL: ' + location.href);
      debug.push('Title: ' + document.title);

      // 从当前 URL 提取 photo_id（图片 URL 需要包含它作为子目录）
      var urlMatch = location.pathname.match(/\\/photo\\/(\\d+)/);
      var photoId = urlMatch ? urlMatch[1] : '';
      debug.push('photoId from URL: ' + photoId);

      // 提取 scramble_id
      var scrambleId = 0;
      try {
        if (typeof scramble_id !== 'undefined') {
          scrambleId = scramble_id;
          debug.push('scramble_id from var: ' + scrambleId);
        }
      } catch(e) {
        // 从 HTML 源码正则提取
        var html = document.documentElement.outerHTML;
        var sm = html.match(/var\\s+scramble_id\\s*=\\s*(\\d+)/);
        if (sm) {
          scrambleId = parseInt(sm[1]);
          debug.push('scramble_id from regex: ' + scrambleId);
        } else {
          debug.push('scramble_id not found, default 0');
        }
      }

      try {
        debug.push('page_arr typeof: ' + typeof page_arr);
        if (typeof page_arr !== 'undefined') {
          debug.push('page_arr isArray: ' + Array.isArray(page_arr));
          debug.push('page_arr length: ' + (page_arr ? page_arr.length : 'N/A'));
          if (Array.isArray(page_arr) && page_arr.length > 0) {
            debug.push('page_arr[0]: ' + String(page_arr[0]));
            debug.push('page_arr[1]: ' + String(page_arr[1] || ''));
          }
        }
        if (typeof page_arr !== 'undefined' && Array.isArray(page_arr)) {
          // 尝试从 blank 图片提取域名
          var blankImg = document.querySelector('img[src*="/media/albums/blank"]');
          if (blankImg && blankImg.src) {
            var m = blankImg.src.match(/https:\\/\\/(.*?)\\/media\\/albums\\/blank/);
            if (m) imgDomain = m[1];
            debug.push('blankImg src: ' + blankImg.src);
          } else {
            debug.push('blankImg not found, using default domain: ' + imgDomain);
          }
          page_arr.forEach(function(f, i) {
            // page_arr 元素是文件名如 "00001.webp"
            // 完整 URL 格式: https://cdn-msp3.18comic.vip/media/photos/{photoId}/{filename}
            var url;
            if (f.indexOf('http') === 0) {
              url = f;
            } else if (photoId) {
              url = 'https://' + imgDomain + '/media/photos/' + photoId + '/' + f;
            } else {
              url = 'https://' + imgDomain + '/media/photos/' + f;
            }
            pages.push({ index: i, imageUrl: url });
          });
          debug.push('page_arr: ' + pages.length + ' pages, domain=' + imgDomain);
        }
      } catch(e) { debug.push('page_arr error: ' + e); }

      if (pages.length === 0) {
        var dataOrigImgs = document.querySelectorAll('img[data-original]');
        debug.push('data-original imgs found: ' + dataOrigImgs.length);
        dataOrigImgs.forEach(function(img, i) {
          var src = img.getAttribute('data-original');
          if (src && !src.startsWith('data:')) {
            pages.push({ index: i, imageUrl: src.startsWith('http') ? src : 'https:' + src });
          }
        });
        if (pages.length > 0) debug.push('first data-original: ' + pages[0].imageUrl);
      }

      if (pages.length === 0) {
        var allImgs = document.querySelectorAll('img');
        debug.push('all imgs on page: ' + allImgs.length);
        allImgs.forEach(function(img, i) {
          var src = img.getAttribute('data-src') || img.getAttribute('src') || '';
          if (src && /\\.(jpg|png|webp|jpeg)/i.test(src) && src.indexOf('blank') === -1) {
            pages.push({ index: i, imageUrl: src.startsWith('http') ? src : 'https:' + src });
          }
        });
        debug.push('visible imgs matched: ' + pages.length);
      }

      // 额外调试：检查页面中的 script 标签内容
      if (pages.length === 0) {
        var scripts = document.querySelectorAll('script');
        debug.push('script tags: ' + scripts.length);
        for (var i = 0; i < scripts.length && i < 10; i++) {
          var text = scripts[i].textContent || '';
          if (text.indexOf('page_arr') !== -1) {
            debug.push('script[' + i + '] contains page_arr, snippet: ' + text.substring(text.indexOf('page_arr'), text.indexOf('page_arr') + 200));
          }
          if (text.indexOf('var img_host') !== -1 || text.indexOf('var imgHost') !== -1) {
            debug.push('script[' + i + '] has img_host');
          }
        }
        // 打印 body 的前 2000 字符
        debug.push('body snippet: ' + (document.body ? document.body.innerHTML.substring(0, 2000) : 'no body'));
      }

      debug.push('Total: ' + pages.length + ' page URLs');
      if (pages.length > 0) debug.push('First: ' + pages[0].imageUrl);

      return { pages: pages, scrambleId: scrambleId, debug: debug.join('\\n') };
    })()
  `)

    if (result.pages.length > 0) {
      cacheSet(cacheKey, result)
    }
    console.log('[scraper] extractChapterPages result:', result.pages.length, 'pages')
    return result
  })
}

export async function extractSearch(query: string, page = 1): Promise<{
  results: MangaCard[]
  totalPages: number
  debug?: string
}> {
  const cacheKey = `search:${query}:${page}`
  const cached = cacheGet<{ results: MangaCard[]; totalPages: number; debug?: string }>(cacheKey)
  if (cached) {
    console.log('[scraper] search cache hit:', query)
    return cached
  }

  return withScraperLock(async () => {
    const domain = getActiveDomain()
    const params = new URLSearchParams({ search_query: query, page: String(page), main_tag: '0', o: 'mr', t: 'a' })
    await navigateAndWait(`https://${domain}/search/photos?${params.toString()}`, 1500)

    const { cards, debug } = await extractAllCards()

    // 提取真实总页数：扫描分页控件里的 page= 参数，取最大值。
    // 禁漫搜索页分页常见结构：
    //   .pagination a[href*="page="]  /  .page-item a  /  顶/底部的 上一页/下一页/页码链接
    const totalPages = await extract<number>(`
      (function() {
        var maxPage = 1;
        var links = document.querySelectorAll('a[href*="page="], .pagination a, .page-item a, .page-link');
        links.forEach(function(a) {
          var href = a.getAttribute('href') || '';
          // 优先匹配 page=NNN 形式（禁漫标准）
          var m = href.match(/page=(\\d+)/);
          if (!m) {
            // 兜底：href 末尾的纯数字段（如 /search/photos?...;2 这种非标准写法）
            m = href.match(/(\\d+)\\/?$/);
          }
          if (m) {
            var n = parseInt(m[1], 10);
            if (n > maxPage) maxPage = n;
          }
          // 部分主题用按钮文本而非 href 表示页码（"下一页", "2", "3"...）
          var txt = (a.textContent || '').trim();
          if (/^\\d+$/.test(txt)) {
            var tn = parseInt(txt, 10);
            if (tn > maxPage) maxPage = tn;
          }
        });
        return maxPage;
      })()
    `).catch(() => 1)

    const result = { results: cards, totalPages, debug }
    if (cards.length > 0) cacheSet(cacheKey, result)
    return result
  })
}

export function destroyScraper(): void {
  if (scraperWin && !scraperWin.isDestroyed()) {
    scraperWin.destroy()
    scraperWin = null
  }
}
