import React, { useCallback, useEffect, useState } from 'react'
import ZoomableImage from '../components/ZoomableImage'
import { makeStyles, tokens, Button, Tooltip, Text, Spinner } from '@fluentui/react-components'
import {
  ArrowLeft20Regular, ArrowRight20Regular, Dismiss20Regular,
  ArrowDownload20Regular, SlideText20Regular
} from '@fluentui/react-icons'
import { useAppStore } from '../stores/appStore'
import { toJmImg } from '../utils/image'

const TOOLBAR_HEIGHT = 48

const useStyles = makeStyles({
  root: {
    display: 'flex', flexDirection: 'column', height: '100%',
    backgroundColor: '#0a0a0a', color: '#ffffff', position: 'relative', userSelect: 'none'
  },
  toolbar: {
    display: 'flex', alignItems: 'center', height: `${TOOLBAR_HEIGHT}px`,
    padding: '0 12px', gap: '8px', backgroundColor: 'rgba(0,0,0,0.85)',
    backdropFilter: 'blur(12px)', zIndex: 10, flexShrink: 0,
    borderBottom: '1px solid rgba(255,255,255,0.08)'
  },
  toolbarTitle: {
    fontSize: '14px', fontWeight: 500, color: '#cccccc', flex: 1,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
  },
  toolbarInfo: { fontSize: '12px', color: '#888888' },
  viewerArea: {
    flex: 1, overflow: 'auto', position: 'relative',
    display: 'flex', flexDirection: 'column', alignItems: 'center'
  },
  scrollMode: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '16px 0'
  },
  singlePageMode: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%'
  },
  imageWrap: { width: '100%', display: 'flex', justifyContent: 'center', backgroundColor: '#111111' },
  mangaImage: { display: 'block', maxWidth: '100%', height: 'auto', objectFit: 'contain' },
  navBtn: {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)', zIndex: 5,
    width: '48px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: '8px', cursor: 'pointer',
    opacity: 0.3, transition: 'opacity 0.2s', ':hover': { opacity: 1 }
  },
  navLeft: { left: '16px' }, navRight: { right: '16px' },
  pageIndicator: {
    position: 'absolute', bottom: '16px', left: '50%', transform: 'translateX(-50%)',
    backgroundColor: 'rgba(0,0,0,0.7)', color: '#cccccc', padding: '4px 12px',
    borderRadius: '12px', fontSize: '12px', zIndex: 5
  },
  loading: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', height: '100%', gap: '16px', color: '#888888'
  }
})

interface PageData {
  index: number
  imageUrl: string
}

type ViewMode = 'scroll' | 'single'

// ─── 图片反打乱（从禁漫天堂 jquery.photo-0.6.js 逆向）─────────────
// 禁漫天堂把图片分成若干条横向条带并按特定算法重排。
// 我们需要将条带还原到正确位置。
//
// 算法步骤（从 get_num + scramble_image_for_new 逆向）：
// 1. 用 md5(scrambleId + photoId) 的最后一个字符的 charCode 计算 c（条带数）
// 2. 源图片被分成 c 条横向条带，每条高度 h = floor(height / c)
// 3. 打乱方式：条带 g 的源 y = s - h*(g+1) - f，目标 y = h*g + f (g>0)
//    即条带 0（底部）放到顶部，条带 1 放到位置 1，... — 倒序排列
// 4. 还原：条带 g（源 y = s-h*(g+1)-f）→ 目标 y = h*g (+f if g>0)

// md5 哈希（使用 Web Crypto API 不支持同步，这里用纯 JS 实现 md5）
// 实际上我们只需要 md5 字符串的最后一个字符，可以用一个简单的 md5 实现。

// ── 纯 JS MD5 实现 ────────────────────────────────────────────────
function md5(str: string): string {
  // 简化版 md5：使用 Node.js crypto 不行（渲染进程），
  // 这里用纯 JS 实现。代码来自 blueimp-md5 的精简版。
  function safeAdd(x: number, y: number): number {
    const lsw = (x & 0xffff) + (y & 0xffff)
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16)
    return (msw << 16) | (lsw & 0xffff)
  }
  function bitRol(num: number, cnt: number): number {
    return (num << cnt) | (num >>> (32 - cnt))
  }
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
    return safeAdd(bitRol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b)
  }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn((b & c) | (~b & d), a, b, x, s, t)
  }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn((b & d) | (c & ~d), a, b, x, s, t)
  }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn(b ^ c ^ d, a, b, x, s, t)
  }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn(c ^ (b | ~d), a, b, x, s, t)
  }
  function binlMD5(x: number[], len: number): number[] {
    x[len >> 5] |= 0x80 << (len % 32)
    x[(((len + 64) >>> 9) << 4) + 14] = len

    let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878

    for (let i = 0; i < x.length; i += 16) {
      const olda = a, oldb = b, oldc = c, oldd = d

      a = ff(a, b, c, d, x[i], 7, -680876936)
      d = ff(d, a, b, c, x[i + 1], 12, -389564586)
      c = ff(c, d, a, b, x[i + 2], 17, 606105819)
      b = ff(b, c, d, a, x[i + 3], 22, -1044525330)
      a = ff(a, b, c, d, x[i + 4], 7, -176418897)
      d = ff(d, a, b, c, x[i + 5], 12, 1200080426)
      c = ff(c, d, a, b, x[i + 6], 17, -1473231341)
      b = ff(b, c, d, a, x[i + 7], 22, -45705983)
      a = ff(a, b, c, d, x[i + 8], 7, 1770035416)
      d = ff(d, a, b, c, x[i + 9], 12, -1958414417)
      c = ff(c, d, a, b, x[i + 10], 17, -42063)
      b = ff(b, c, d, a, x[i + 11], 22, -1990404162)
      a = ff(a, b, c, d, x[i + 12], 7, 1804603682)
      d = ff(d, a, b, c, x[i + 13], 12, -40341101)
      c = ff(c, d, a, b, x[i + 14], 17, -1502002290)
      b = ff(b, c, d, a, x[i + 15], 22, 1236535329)

      a = gg(a, b, c, d, x[i + 1], 5, -165796510)
      d = gg(d, a, b, c, x[i + 6], 9, -1069501632)
      c = gg(c, d, a, b, x[i + 11], 14, 643717713)
      b = gg(b, c, d, a, x[i], 20, -373897302)
      a = gg(a, b, c, d, x[i + 5], 5, -701558691)
      d = gg(d, a, b, c, x[i + 10], 9, 38016083)
      c = gg(c, d, a, b, x[i + 15], 14, -660478335)
      b = gg(b, c, d, a, x[i + 4], 20, -405537848)
      a = gg(a, b, c, d, x[i + 9], 5, 568446438)
      d = gg(d, a, b, c, x[i + 14], 9, -1019803690)
      c = gg(c, d, a, b, x[i + 3], 14, -187363961)
      b = gg(b, c, d, a, x[i + 8], 20, 1163531501)
      a = gg(a, b, c, d, x[i + 13], 5, -1444681467)
      d = gg(d, a, b, c, x[i + 2], 9, -51403784)
      c = gg(c, d, a, b, x[i + 7], 14, 1735328473)
      b = gg(b, c, d, a, x[i + 12], 20, -1926607734)

      a = hh(a, b, c, d, x[i + 5], 4, -378558)
      d = hh(d, a, b, c, x[i + 8], 11, -2022574463)
      c = hh(c, d, a, b, x[i + 11], 16, 1839030562)
      b = hh(b, c, d, a, x[i + 14], 23, -35309556)
      a = hh(a, b, c, d, x[i + 1], 4, -1530992060)
      d = hh(d, a, b, c, x[i + 4], 11, 1272893353)
      c = hh(c, d, a, b, x[i + 7], 16, -155497632)
      b = hh(b, c, d, a, x[i + 10], 23, -1094730640)
      a = hh(a, b, c, d, x[i + 13], 4, 681279174)
      d = hh(d, a, b, c, x[i], 11, -358537222)
      c = hh(c, d, a, b, x[i + 3], 16, -722521979)
      b = hh(b, c, d, a, x[i + 6], 23, 76029189)
      a = hh(a, b, c, d, x[i + 9], 4, -640364487)
      d = hh(d, a, b, c, x[i + 12], 11, -421815835)
      c = hh(c, d, a, b, x[i + 15], 16, 530742520)
      b = hh(b, c, d, a, x[i + 2], 23, -995338651)

      a = ii(a, b, c, d, x[i], 6, -198630844)
      d = ii(d, a, b, c, x[i + 7], 10, 1126891415)
      c = ii(c, d, a, b, x[i + 14], 15, -1416354905)
      b = ii(b, c, d, a, x[i + 5], 21, -57434055)
      a = ii(a, b, c, d, x[i + 12], 6, 1700485571)
      d = ii(d, a, b, c, x[i + 3], 10, -1894986606)
      c = ii(c, d, a, b, x[i + 10], 15, -1051523)
      b = ii(b, c, d, a, x[i + 1], 21, -2054922799)
      a = ii(a, b, c, d, x[i + 8], 6, 1873313359)
      d = ii(d, a, b, c, x[i + 15], 10, -30611744)
      c = ii(c, d, a, b, x[i + 6], 15, -1560198380)
      b = ii(b, c, d, a, x[i + 13], 21, 1309151649)
      a = ii(a, b, c, d, x[i + 4], 6, -145523070)
      d = ii(d, a, b, c, x[i + 11], 10, -1120210379)
      c = ii(c, d, a, b, x[i + 2], 15, 718787259)
      b = ii(b, c, d, a, x[i + 9], 21, -343485551)

      a = safeAdd(a, olda)
      b = safeAdd(b, oldb)
      c = safeAdd(c, oldc)
      d = safeAdd(d, oldd)
    }
    return [a, b, c, d]
  }
  function binl2rstr(input: number[]): string {
    let output = ''
    for (let i = 0; i < input.length * 32; i += 8) {
      output += String.fromCharCode((input[i >> 5] >>> (i % 32)) & 0xff)
    }
    return output
  }
  function rstr2binl(input: string): number[] {
    const output: number[] = []
    for (let i = 0; i < input.length * 8; i += 8) {
      output[i >> 5] |= (input.charCodeAt(i / 8) & 0xff) << (i % 32)
    }
    return output
  }
  function rstrMD5(s: string): string {
    return binl2rstr(binlMD5(rstr2binl(s), s.length * 8))
  }
  function rstr2hex(input: string): string {
    const hexTab = '0123456789abcdef'
    let output = ''
    for (let i = 0; i < input.length; i++) {
      const x = input.charCodeAt(i)
      output += hexTab.charAt((x >>> 4) & 0x0f) + hexTab.charAt(x & 0x0f)
    }
    return output
  }
  return rstr2hex(rstrMD5(str))
}

// get_num：对齐 JMComic-Crawler-Python 的 JmImageTool.get_num
// 参数：
//   scrambleId — 页面 var scramble_id（全章相同）
//   aid        — photo_id（章节 id，从图片 URL /photos/{aid}/ 提取）
//   filename   — 图片文件名（去扩展名，如 "00001"），从图片 URL 末段提取
// 返回：条带分割数。0 表示该图未打乱，无需还原。
//
// 关键：每张图的条带数由 md5(aid + filename) 决定，因此同一章里每页条带数不同。
function getNum(scrambleId: number, aid: number, filename: string): number {
  // scramble_id 抓取失败（默认 0）或旧图无打乱：不做反打乱
  if (scrambleId === 0) return 0
  // aid < scramble_id：旧图，未打乱
  if (aid < scrambleId) return 0
  // 268850 之前：固定 10 条
  if (aid < 268850) return 10
  // 421926 之后取模 8，之前取模 10
  const x = aid < 421926 ? 10 : 8
  // md5(aid + filename) 的十六进制最后一位的 charCode
  const s = md5(`${aid}${filename}`)
  const num = s.charCodeAt(s.length - 1) % x
  // num * 2 + 2 → 2,4,6,...,20（偶数条带数）
  return num * 2 + 2
}

// DescrambledImage：加载图片后用 canvas 还原条带顺序
function DescrambledImage(props: {
  src: string
  imageUrl: string
  alt: string
  className?: string
  style?: React.CSSProperties
  loading?: 'lazy' | 'eager'
  scrambleId: number
}): JSX.Element {
  const { src, imageUrl, alt, className, style, loading, scrambleId } = props
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const imgRef = React.useRef<HTMLImageElement>(null)

  const handleLoad = (): void => {
    const img = imgRef.current
    const canvas = canvasRef.current
    if (!img || !canvas) return

    // 从原始 CDN URL 提取 aid（photo_id）和 filename
    // URL 格式: https://cdn-msp3.18comic.vip/media/photos/{photoId}/{filename}.webp
    const aidMatch = imageUrl.match(/\/(?:photos?|albums?)\/(\d+)\//)
    const aid = aidMatch ? parseInt(aidMatch[1]) : 0
    const filename = imageUrl.split('/').pop()?.replace(/\.[^.]+$/, '') ?? ''

    const w = img.naturalWidth
    const h = img.naturalHeight

    // 计算条带数量（每页可能不同）
    const c = getNum(scrambleId, aid, filename)
    console.log('[descramble]', { aid, filename, scrambleId, c, w, h, src })

    // c === 0 表示不打乱，直接显示原图
    if (c === 0) {
      canvas.style.display = 'none'
      img.style.visibility = 'visible'
      return
    }

    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 反打乱算法（与 Python JmImageTool.decode_and_save 等价）：
    // 打乱时：条带 g 的源 y = s - h*(g+1) - f，目标 y = h*g (+f if g>0)
    // 还原：把源 y 位置的条带画回目标 y 位置
    const s = h
    const r = w
    const f = s % c

    for (let g = 0; g < c; g++) {
      let stripH = Math.floor(s / c)
      let dstY = stripH * g
      const srcY = s - stripH * (g + 1) - f
      if (g === 0) {
        stripH += f
      } else {
        dstY += f
      }
      // 从源图片 (0, srcY) 取 (r x stripH) 区域，画到 (0, dstY)
      ctx.drawImage(img, 0, srcY, r, stripH, 0, dstY, r, stripH)
    }

    // 隐藏原图，显示 canvas
    img.style.display = 'none'
    canvas.style.display = 'block'
  }

  return (
    <>
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className={className}
        style={{ ...style, display: 'block', visibility: scrambleId === 0 ? 'visible' : 'hidden' }}
        loading={loading}
        onLoad={handleLoad}
        crossOrigin="anonymous"
      />
      <canvas
        ref={canvasRef}
        className={className}
        style={{ ...style, display: 'none', maxWidth: '100%', height: 'auto' }}
      />
    </>
  )
}

export default function ReaderPage(): JSX.Element {
  const styles = useStyles()
  const readerState = useAppStore((s) => s.readerState)
  const closeReader = useAppStore((s) => s.closeReader)

  const [viewMode, setViewMode] = useState<ViewMode>('scroll')
  const [currentPage, setCurrentPage] = useState(0)
  const [pages, setPages] = useState<PageData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [debugInfo, setDebugInfo] = useState('')
  const [scrambleId, setScrambleId] = useState(0)
  const [zoomDisplay, setZoomDisplay] = useState(1)

  useEffect(() => {
    if (!readerState) return
    let cancelled = false

    async function load(): Promise<void> {
      setLoading(true)
      setError('')

      try {
        const result = await window.electronAPI?.contentPages(readerState!.chapterUrl)
        if (cancelled) return

        if (!result?.ok || !result.data) {
          setError(result?.error || '无法获取章节图片')
          setLoading(false)
          return
        }

        const pageList = result.data as PageData[]
        setDebugInfo((result as any).debug ?? '')
        setScrambleId((result as any).scrambleId ?? 0)

        if (pageList.length === 0) {
          setError(`未找到任何图片\n调试: ${(result as any).debug ?? ''}`)
          setLoading(false)
          return
        }

        // URLs come from scraperWindow — convert to jmimg:// proxy
        // so the renderer can load them through the main process
        // (which adds proper Referer + session cookies).
        setPages(pageList)

        // 续读：若指定了 resumePageIndex，跳到该页
        const resume = readerState!.resumePageIndex
        if (typeof resume === 'number' && resume > 0 && resume < pageList.length) {
          setCurrentPage(resume)
        }

        // 写历史：记录"开始读"这一章
        const rs = readerState!
        window.electronAPI?.historyUpsert({
          manga_id: rs.mangaId,
          manga_title: rs.mangaTitle,
          chapter_index: rs.chapterIndex,
          chapter_title: rs.chapterTitle,
          chapter_url: rs.chapterUrl,
          cover_url: rs.mangaCoverUrl,
          page_index: rs.resumePageIndex ?? 0,
          total_pages: pageList.length
        })
      } catch (err) {
        if (!cancelled) setError(String(err))
      }

      if (!cancelled) setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [readerState])

  const goNext = useCallback(() => {
    if (currentPage < pages.length - 1) setCurrentPage((p) => p + 1)
  }, [currentPage, pages.length])

  const goPrev = useCallback(() => {
    if (currentPage > 0) setCurrentPage((p) => p - 1)
  }, [currentPage])

  // 翻页时防抖写历史（2s 内连续翻页只写一次）
  const historyTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushHistory = React.useCallback((pageIndex: number): void => {
    if (historyTimer.current) clearTimeout(historyTimer.current)
    historyTimer.current = setTimeout(() => {
      if (readerState?.mangaId) {
        window.electronAPI?.historyUpsertPage(readerState.mangaId, pageIndex)
      }
    }, 2000)
  }, [readerState?.mangaId])

  useEffect(() => {
    if (pages.length > 0) flushHistory(currentPage)
  }, [currentPage, pages.length, flushHistory])

  // 卸载时清除防抖定时器并立即 flush 最终页码（覆盖通过导航栏离开阅读器的场景）
  useEffect(() => {
    return () => {
      if (historyTimer.current) {
        clearTimeout(historyTimer.current)
        if (readerState?.mangaId) {
          window.electronAPI?.historyUpsertPage(readerState.mangaId, currentPage)
        }
      }
    }
  }, [readerState?.mangaId, currentPage])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (viewMode !== 'single') return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault(); goNext()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault(); goPrev()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [viewMode, goNext, goPrev])

  if (!readerState) {
    return (
      <div className={styles.root}>
        <div className={styles.loading}><Text>未选择章节</Text></div>
      </div>
    )
  }

  // 图片 URL 通过 jmimg:// 协议代理（主进程附加 Referer + Cookie + UA）
  const imgSrc = (page: PageData): string => toJmImg(page.imageUrl)

  return (
    <div className={styles.root}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <Button appearance="subtle" size="small" icon={<Dismiss20Regular />}
          style={{ color: '#cccccc' }} onClick={() => {
            if (historyTimer.current) {
              clearTimeout(historyTimer.current)
              if (readerState?.mangaId) {
                window.electronAPI?.historyUpsertPage(readerState.mangaId, currentPage)
              }
            }
            closeReader()
          }}
        >返回</Button>
        <div className={styles.toolbarTitle}>{readerState.mangaTitle} - {readerState.chapterTitle}</div>
        <div className={styles.toolbarInfo}>
          {loading ? '加载中...' : viewMode === 'single' ? `${currentPage + 1} / ${pages.length}` : `${pages.length} 页`}
        </div>
        {pages.length > 0 && (
          <Tooltip content={viewMode === 'scroll' ? '单页模式' : '滚动模式'} relationship="label">
            <Button appearance="subtle" size="small" icon={<SlideText20Regular />}
              style={{ color: viewMode === 'scroll' ? tokens.colorBrandForeground1 : '#cccccc' }}
              onClick={() => setViewMode(viewMode === 'scroll' ? 'single' : 'scroll')}
            />
          </Tooltip>
        )}
        <Tooltip content="下载本章" relationship="label">
          <Button appearance="subtle" size="small" icon={<ArrowDownload20Regular />}
            style={{ color: '#cccccc' }}
            onClick={async () => {
              if (!window.electronAPI) return
              await window.electronAPI.downloadAdd({
                mangaId: '',
                mangaTitle: readerState.mangaTitle,
                chapterIndex: 0,
                chapterTitle: readerState.chapterTitle,
                imageUrls: pages.map((p) => p.imageUrl)
              })
            }}
          />
        </Tooltip>
      </div>

      {/* Viewer */}
      {loading ? (
        <div className={styles.loading}>
          <Spinner size="large" />
          <Text>正在加载章节图片...</Text>
          {debugInfo ? (
            <pre style={{ maxWidth: '500px', fontSize: '11px', color: '#666', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{debugInfo}</pre>
          ) : null}
        </div>
      ) : error ? (
        <div className={styles.loading}>
          <Text size={500}>⚠️ 加载失败</Text>
          <pre style={{ maxWidth: '500px', fontSize: '11px', color: '#666', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{error}</pre>
        </div>
      ) : viewMode === 'scroll' ? (
        <div className={styles.viewerArea}>
          <div className={styles.scrollMode}>
            {pages.map((page, i) => (
              <div key={i} className={styles.imageWrap}>
                <DescrambledImage
                  className={styles.mangaImage}
                  src={imgSrc(page)}
                  imageUrl={page.imageUrl}
                  alt={`第 ${i + 1} 页`}
                  loading="lazy"
                  scrambleId={scrambleId}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className={styles.viewerArea}>
          <div className={styles.singlePageMode}>
            <div className={`${styles.navBtn} ${styles.navLeft}`}
              onClick={goPrev} style={{ visibility: currentPage > 0 ? 'visible' : 'hidden' }}
            ><ArrowLeft20Regular color="#ffffff" /></div>

            <ZoomableImage resetKey={currentPage} onZoomChange={setZoomDisplay}>
              {pages[currentPage] && (
                <DescrambledImage
                  className={styles.mangaImage}
                  src={imgSrc(pages[currentPage])}
                  imageUrl={pages[currentPage].imageUrl}
                  alt={`第 ${currentPage + 1} 页`}
                  style={{ maxHeight: '100%' }}
                  scrambleId={scrambleId}
                />
              )}
            </ZoomableImage>

            <div className={`${styles.navBtn} ${styles.navRight}`}
              onClick={goNext} style={{ visibility: currentPage < pages.length - 1 ? 'visible' : 'hidden' }}
            ><ArrowRight20Regular color="#ffffff" /></div>

            <div className={styles.pageIndicator}>
              {currentPage + 1} / {pages.length}
              {zoomDisplay !== 1 && (
                <span style={{ marginLeft: '4px', opacity: 0.8 }}>
                  · {Math.round(zoomDisplay * 100)}%
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
