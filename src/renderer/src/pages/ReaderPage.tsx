import React from 'react'
import { createPortal } from 'react-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useAppStore } from '../stores/appStore'
import type { ReaderPosition, ReaderState } from '../../../shared/readerContracts'
import type { DownloadProgress, DownloadTaskRow } from '../../../shared/downloadContracts'
import ReaderToolbar from '../reader/ReaderToolbar'
import ReaderPageNavigation from '../reader/ReaderPageNavigation'
import ReaderImage from '../reader/ReaderImage'
import { useReaderSession } from '../reader/useReaderSession'
import { focusReaderContent } from '../reader/readerFocus'
import { isReaderShortcutTarget, pageSize, positionAtOffset, READER_TOP_INSET, READER_BOTTOM_INSET, type PageDimensions } from '../reader/readerLayout'
import '../reader/reader.css'

const READING_INSET = READER_TOP_INSET
const PAGE_GAP = 12

function ReadingSession({ reader, headerHost }: { reader: ReaderState; headerHost: HTMLDivElement | null }): JSX.Element {
  const root = React.useRef<HTMLDivElement>(null)
  const viewport = React.useRef<HTMLDivElement>(null)
  const closing = useAppStore(state => state.readerClosing)
  const visible = useAppStore(state => state.readerVisible)
  const toolsVisible = useAppStore(state => state.readerToolsVisible)
  const session = useReaderSession(reader, closing)
  const wasClosing = React.useRef(closing)
  React.useEffect(() => {
    if (wasClosing.current && !closing) session.resumeAfterClose()
    wasClosing.current = closing
  }, [closing, session.resumeAfterClose])
  const { pages, preferences, position } = session
  const openReader = useAppStore((state) => state.openReader)
  const activeReaderId = useAppStore((state) => state.activeReaderId)
  const registerReaderSession = useAppStore((state) => state.registerReaderSession)
  React.useLayoutEffect(() => activeReaderId ? registerReaderSession(activeReaderId, session.prepareToLeave) : undefined,
    [activeReaderId, registerReaderSession, session.prepareToLeave])
  const [dimensions, setDimensions] = React.useState<Record<number, PageDimensions>>({})
  const [viewportSize, setViewportSize] = React.useState({ width: 960, height: 800 })
  const [currentPage, setCurrentPage] = React.useState(0)
  const [directory, setDirectory] = React.useState(false)
  const [fullscreen, setFullscreen] = React.useState(() => Boolean(document.fullscreenElement))
  const [downloadLabel, setDownloadLabel] = React.useState('下载本章')
  const [actionError, setActionError] = React.useState('')
  const restoreFrame = React.useRef(0)
  const restoring = React.useRef(false)
  const restoreTop = React.useRef(0)
  const drag = React.useRef<{ x: number; y: number; left: number; top: number }>()
  const sizes = pages.map((_, index) => pageSize(dimensions[index], viewportSize, preferences))
  const offsets: number[] = []
  let total = READING_INSET
  for (const size of sizes) { offsets.push(total); total += size.height + PAGE_GAP }
  const virtualizer = useVirtualizer({
    count: preferences.readerMode === 'scroll' ? pages.length : 0,
    getScrollElement: () => viewport.current,
    estimateSize: (index) => sizes[index]?.height + PAGE_GAP || 1080,
    overscan: 2, paddingStart: READING_INSET, paddingEnd: READER_BOTTOM_INSET
  })

  const restore = (target: ReaderPosition): void => {
    const element = viewport.current
    if (!element || !element.clientWidth || !element.clientHeight || !pages.length) return
    restoring.current = true
    cancelAnimationFrame(restoreFrame.current)
    const size = sizes[target.pageIndex]
    const top = (preferences.readerMode === 'scroll' ? offsets[target.pageIndex] - READING_INSET : 0) + target.pageOffset * (size.height + PAGE_GAP)
    element.scrollTop = top
    restoreTop.current = element.scrollTop
    restoreFrame.current = requestAnimationFrame(() => {
      element.scrollTop = top
      restoreFrame.current = requestAnimationFrame(() => { restoring.current = false })
    })
  }
  React.useLayoutEffect(() => {
    const element = viewport.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      if (element.clientWidth && element.clientHeight) setViewportSize({ width: element.clientWidth, height: element.clientHeight })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [session.loading])
  React.useLayoutEffect(() => {
    if (session.loading || !pages.length || !visible) return
    virtualizer.measure()
    setCurrentPage(position.current.pageIndex)
    restore(position.current)
  }, [session.loading, pages.length, dimensions, viewportSize.width, viewportSize.height, visible,
    preferences.readerMode, preferences.readerFit, preferences.readerZoom, preferences.readerMaxWidth])
  React.useEffect(() => {
    if (!session.loading && document.activeElement?.id === 'active-reader-panel') viewport.current?.focus()
  }, [session.loading])
  React.useEffect(() => () => { cancelAnimationFrame(restoreFrame.current) }, [])
  React.useEffect(() => { if (!toolsVisible || !visible) setDirectory(false) }, [toolsVisible, visible])
  const toggleFullscreen = (): void => {
    const action = document.fullscreenElement ? document.exitFullscreen() : root.current?.closest<HTMLElement>('[data-reader-workspace]')?.requestFullscreen()
    void action?.catch(() => setActionError('暂时无法切换全屏'))
  }
  React.useEffect(() => {
    const changed = (): void => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])

  const jump = (pageIndex: number): void => {
    if (!pages.length) return
    const target = { pageIndex: Math.max(0, Math.min(pages.length - 1, pageIndex)), pageOffset: 0 }
    session.updatePosition(target)
    setCurrentPage(target.pageIndex)
    restore(target)
  }
  const scroll = (): void => {
    if (!viewport.current || !useAppStore.getState().readerVisible) return
    if (restoring.current) {
      if (Math.abs(viewport.current.scrollTop - restoreTop.current) < 2) return
      restoring.current = false
      cancelAnimationFrame(restoreFrame.current)
    }
    const next = preferences.readerMode === 'scroll'
      ? positionAtOffset(sizes.map((size, index) => ({ index, start: offsets[index], size: size.height + PAGE_GAP })), viewport.current.scrollTop + READING_INSET)
      : { pageIndex: position.current.pageIndex, pageOffset: Math.min(0.99, viewport.current.scrollTop / (sizes[position.current.pageIndex].height + PAGE_GAP)) }
    if (next) { session.updatePosition(next); setCurrentPage(next.pageIndex) }
  }
  const changeChapter = (index: number): void => {
    const chapter = session.chapters.find((chapter) => chapter.index === index)
    if (!chapter || chapter.available === false) return
    void openReader({ ...reader, chapterIndex: chapter.index, chapterTitle: chapter.title,
      chapterUrl: chapter.url, resumePageIndex: 0, resumePageOffset: 0, chapters: session.chapters })
      .then(ok => { if (ok) focusReaderContent() })
  }
  const chapterPosition = session.chapters.findIndex((chapter) => chapter.index === reader.chapterIndex)
  const previous = session.chapters[chapterPosition - 1]
  const next = session.chapters[chapterPosition + 1]
  React.useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (!useAppStore.getState().readerVisible || !root.current?.contains(document.activeElement) || useAppStore.getState().readerTransitionPending ||
        isReaderShortcutTarget(event.target) || isReaderShortcutTarget(document.activeElement) || event.ctrlKey || event.metaKey || event.altKey) return
      const forward = preferences.readerDirection === 'ltr' ? 'ArrowRight' : 'ArrowLeft'
      const backward = preferences.readerDirection === 'ltr' ? 'ArrowLeft' : 'ArrowRight'
      if (event.key === forward) { event.preventDefault(); jump(position.current.pageIndex + 1) }
      else if (event.key === backward) { event.preventDefault(); jump(position.current.pageIndex - 1) }
      else if (event.key === 'Home') { event.preventDefault(); jump(0) }
      else if (event.key === 'End') { event.preventDefault(); jump(pages.length - 1) }
      else if (event.key.toLowerCase() === 'f') { event.preventDefault(); toggleFullscreen() }
      else if (event.key.toLowerCase() === 'h') { event.preventDefault(); useAppStore.getState().setReaderToolsVisible(!toolsVisible) }
      else if (event.key === ' ' || event.key === 'PageDown' || event.key === 'PageUp') {
        event.preventDefault()
        const element = viewport.current
        if (!element) return
        const direction = event.key === 'PageUp' || event.shiftKey ? -1 : 1
        if (preferences.readerMode === 'single' && (direction > 0 ? element.scrollTop + element.clientHeight >= element.scrollHeight - 2 : element.scrollTop <= 0)) jump(position.current.pageIndex + direction)
        else element.scrollBy({ top: direction * element.clientHeight * 0.8, behavior: 'instant' })
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })
  React.useEffect(() => {
    const element = viewport.current
    if (!element) return
    const wheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return
      event.preventDefault()
      session.changePreferences({ readerZoom: preferences.readerZoom + (event.deltaY > 0 ? -0.1 : 0.1) })
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [session.loading, preferences.readerZoom])

  React.useEffect(() => {
    let cancelled = false
    const update = (task: DownloadProgress | DownloadTaskRow): void => {
      if (task.mangaId !== reader.mangaId || task.chapterIndex !== reader.chapterIndex) return
      const labels: Record<string, string> = { completed: '已离线保存', pending: '等待下载', downloading: '正在下载', resolving: '准备下载' }
      setDownloadLabel(labels[String(task.status)] ?? '下载本章')
    }
    void window.electronAPI?.downloadList().then((tasks) => { if (!cancelled) tasks.forEach(update) })
    const off = window.electronAPI?.onDownloadProgress(update)
    return () => { cancelled = true; off?.() }
  }, [reader])
  const download = async (): Promise<void> => {
    setDownloadLabel('准备下载')
    try {
      const result = await window.electronAPI?.downloadAdd({ mangaId: reader.mangaId, mangaTitle: reader.mangaTitle,
        chapterIndex: reader.chapterIndex, chapterTitle: reader.chapterTitle, chapterUrl: reader.chapterUrl,
        coverUrl: reader.mangaCoverUrl, imageUrls: pages.map((page) => page.imageUrl), scrambleId: session.scrambleId })
      if (result?.ok === false) throw new Error(result.error)
      setDownloadLabel('等待下载')
    } catch { setDownloadLabel('下载本章'); setActionError('下载任务创建失败，请重试') }
  }
  const ready = (index: number, size: PageDimensions): void => {
    setDimensions((current) => current[index]?.width === size.width && current[index]?.height === size.height ? current : { ...current, [index]: size })
    if (index === position.current.pageIndex) requestAnimationFrame(() => session.markVisible())
  }
  const image = (index: number): JSX.Element => <ReaderImage key={pages[index].imageUrl} imageUrl={pages[index].imageUrl}
    index={index} scrambleId={session.scrambleId} priority={index === currentPage ? 'critical' : 'near'} onReady={(size) => ready(index, size)} />

  return <div ref={root} className="reader-root" data-reader-chapter={reader.chapterTitle} data-reader-source={reader.local ? 'local' : 'online'} style={{ '--reader-top-inset': `${READING_INSET}px`, '--reader-bottom-inset': `${READER_BOTTOM_INSET}px` } as React.CSSProperties}
    onKeyDown={event => {
      if (event.key !== 'Escape') return
      const menu = root.current?.querySelector<HTMLDetailsElement>('details[open]')
      if (menu) { menu.open = false; menu.querySelector('summary')?.focus() }
      else if (directory) { setDirectory(false); viewport.current?.focus() }
      else return
      event.preventDefault(); event.stopPropagation()
    }}>
    {toolsVisible && <ReaderToolbar reader={reader} preferences={preferences}
      fullscreen={fullscreen} downloadLabel={downloadLabel} change={session.changePreferences}
      toggleDirectory={() => setDirectory(!directory)}
      toggleFullscreen={toggleFullscreen} download={() => { void download() }} />}
    {session.loading ? <div className="reader-message" role="status"><span className="reader-loading-dot" />正在打开章节…</div>
      : session.error ? <div className="reader-message" role="alert"><h2>暂时无法打开这一章</h2>
        <button onClick={session.retry}>重新加载章节</button><details><summary>查看原因</summary>{session.error}</details></div>
      : <div className="reader-viewport" data-reader-viewport data-reading-inset={READING_INSET} ref={viewport}
        tabIndex={0} aria-label="漫画阅读区域" onScroll={scroll}
        onPointerDown={(event) => {
          if (event.pointerType !== 'mouse' || event.button !== 0 || isReaderShortcutTarget(event.target)) return
          drag.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (!drag.current) return
          event.currentTarget.scrollLeft = drag.current.left + drag.current.x - event.clientX
          event.currentTarget.scrollTop = drag.current.top + drag.current.y - event.clientY
        }}
        onPointerUp={() => { drag.current = undefined }} onPointerCancel={() => { drag.current = undefined }}>
        {preferences.readerMode === 'scroll' ? <div className="reader-scroll-content"
          style={{ height: virtualizer.getTotalSize(), width: Math.max(viewportSize.width, ...sizes.map((size) => size.width + 48)) }}>
          {virtualizer.getVirtualItems().map((item) => <div key={pages[item.index].imageUrl}
            data-index={item.index} className="reader-page" style={{ transform: `translateY(${item.start}px)`, height: sizes[item.index].height }}>
            <div className="reader-sheet" style={sizes[item.index]}>{image(item.index)}</div>
          </div>)}
        </div> : <div className="reader-single-content" style={{ width: Math.max(viewportSize.width, sizes[currentPage]?.width + 48) }}>
          {pages[currentPage] && <div className="reader-sheet" data-index={currentPage} style={sizes[currentPage]}>{image(currentPage)}</div>}
        </div>}
      </div>}
    {headerHost && pages.length > 0 && createPortal(<ReaderPageNavigation currentPage={currentPage} totalPages={pages.length}
      chapterTitle={reader.chapterTitle} previous={previous} next={next} jump={jump} changeChapter={changeChapter} />, headerHost)}
    {directory && <aside className="reader-drawer" aria-label="章节目录"><div className="reader-drawer-header">章节与附近页面<button aria-label="关闭目录" onClick={() => setDirectory(false)}>×</button></div>
      <div className="reader-chapters">{session.chapters.map((chapter) => <button key={chapter.index} disabled={chapter.available === false}
        aria-pressed={chapter.index === reader.chapterIndex} onClick={() => changeChapter(chapter.index)}>{chapter.title}</button>)}</div>
      <div className="reader-thumbnails">{pages.slice(Math.max(0, currentPage - 2), currentPage + 3).map((page) => <button key={page.index}
        aria-current={page.index === currentPage ? 'page' : undefined}
        aria-label={`跳转到第 ${page.index + 1} 页`} onClick={() => { jump(page.index); setDirectory(false) }}>
        <ReaderImage imageUrl={page.imageUrl} index={page.index} scrambleId={session.scrambleId} priority="near" onReady={() => {}} /><span>{page.index + 1}</span>
      </button>)}</div>
    </aside>}
    {(actionError || session.saveError) && <div className="reader-save-error" role="alert">{actionError || session.saveError}<button aria-label="关闭提示" onClick={() => { setActionError(''); session.dismissSaveError() }}>×</button></div>}
  </div>
}

export default function ReaderPage({ headerHost }: { headerHost: HTMLDivElement | null }): JSX.Element {
  const reader = useAppStore((state) => state.readerTabs.find(tab => tab.id === state.activeReaderId)?.reader)
  return reader ? <ReadingSession key={`${reader.mangaId}:${reader.chapterIndex}:${Boolean(reader.local)}`} reader={reader} headerHost={headerHost} />
    : <div className="reader-root"><div className="reader-message">未选择章节</div></div>
}
