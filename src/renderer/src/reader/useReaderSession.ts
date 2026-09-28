import React from 'react'
import { DEFAULT_READER_PREFERENCES, normalizeReaderPreferences, type ReaderChapter, type ReaderPageData, type ReaderPosition, type ReaderPreferences, type ReaderState } from '../../../shared/readerContracts'
import { recordRendererSpan } from '../performance/rendererMetrics'

export function useReaderSession(reader: ReaderState) {
  const [pages, setPages] = React.useState<ReaderPageData[]>([])
  const [scrambleId, setScrambleId] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [saveError, setSaveError] = React.useState('')
  const [attempt, setAttempt] = React.useState(0)
  const [preferences, setPreferences] = React.useState(DEFAULT_READER_PREFERENCES)
  const [startPosition, setStartPosition] = React.useState<ReaderPosition>({ pageIndex: 0, pageOffset: 0 })
  const [chapters, setChapters] = React.useState<ReaderChapter[]>(reader.chapters ?? [])
  const session = React.useRef(crypto.randomUUID()).current
  const position = React.useRef(startPosition)
  const timer = React.useRef<ReturnType<typeof setTimeout>>()
  const preferenceTimer = React.useRef<ReturnType<typeof setTimeout>>()
  const pendingPreferences = React.useRef<ReaderPreferences>()
  const historyReady = React.useRef<Promise<void>>()
  const retryHistory = React.useRef<() => Promise<void>>()
  const visibleSpan = React.useRef<ReturnType<typeof recordRendererSpan>>()
  const preparedToClose = React.useRef(false)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    visibleSpan.current = recordRendererSpan('reader.chapter-visible', { source: reader.local ? 'local' : 'online' })
    async function load(): Promise<void> {
      try {
        const api = window.electronAPI
        if (!api) throw new Error('阅读服务尚未就绪')
        const [result, settings, history] = await Promise.all([
          reader.local ? api.downloadChapterPages(reader.mangaId, reader.chapterIndex) : api.contentPages(reader.chapterUrl),
          api.settingsGet(), api.historyGetLocal(reader.mangaId)
        ])
        if (cancelled) return
        if (!result.ok || !result.data?.length) throw new Error(result.error || '本章没有可显示的图片')
        const resume = history?.chapter_index === reader.chapterIndex ? history : null
        const initial = {
          pageIndex: Math.min(result.data.length - 1, Math.max(0, reader.resumePageIndex ?? resume?.page_index ?? 0)),
          pageOffset: Math.max(0, Math.min(0.99, reader.resumePageOffset ?? resume?.page_offset ?? 0))
        }
        position.current = initial
        setStartPosition(initial)
        setPreferences(normalizeReaderPreferences(settings as unknown as Record<string, unknown>))
        setScrambleId(result.scrambleId ?? 0)
        const entry = {
          manga_id: reader.mangaId, manga_title: reader.mangaTitle, chapter_index: reader.chapterIndex,
          chapter_title: reader.chapterTitle, chapter_url: reader.chapterUrl, cover_url: reader.mangaCoverUrl,
          page_index: initial.pageIndex, page_offset: initial.pageOffset, total_pages: result.data.length,
          is_local: reader.local ? 1 : 0, reader_session: session
        }
        retryHistory.current = async () => {
          const write = api.historyUpsert(entry)
          historyReady.current = write
          try { await write }
          catch (error) {
            if (historyReady.current === write) historyReady.current = undefined
            throw error
          }
        }
        void retryHistory.current().catch(() => setSaveError('阅读位置暂未保存，请检查磁盘空间'))
        setPages(result.data)
        setLoading(false)
      } catch (error) {
        if (!cancelled) { setError(error instanceof Error ? error.message : String(error)); setLoading(false) }
        visibleSpan.current?.finish('error')
      }
    }
    void load()
    if (!reader.chapters?.length) {
      if (reader.local) {
        void window.electronAPI?.downloadMangaDetail(reader.mangaId).then((group) => {
          if (cancelled || !group) return
          const localChapters = new Map<number, ReaderChapter>()
          for (const task of group.tasks) {
            const previous = localChapters.get(task.chapterIndex)
            if (previous?.available && task.available === false) continue
            localChapters.set(task.chapterIndex, { index: task.chapterIndex, title: task.chapterTitle,
              url: task.chapterUrl ?? '', available: task.available ?? task.status === 'completed' })
          }
          setChapters([...localChapters.values()].sort((a,b) => a.index-b.index))
        }).catch(() => {})
      } else {
        void window.electronAPI?.contentDetail(reader.mangaId).then((result) => {
          if (!cancelled && result.ok && result.data) setChapters(result.data.chapters)
        }).catch(() => {})
      }
    }
    return () => { cancelled = true; visibleSpan.current?.finish('cancelled') }
  }, [reader, session, attempt])

  const flush = React.useCallback(async (durable = true): Promise<void> => {
    clearTimeout(timer.current)
    if (!retryHistory.current) return
    const current = { ...position.current }
    await (historyReady.current ?? retryHistory.current())
    await window.electronAPI?.historyUpsertPage(reader.mangaId, current.pageIndex, {
      chapterIndex: reader.chapterIndex, pageOffset: current.pageOffset, session, flush: durable
    })
  }, [reader, session])
  const updatePosition = React.useCallback((next: ReaderPosition): void => {
    preparedToClose.current = false
    position.current = next
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { void flush(false).catch(() => setSaveError('阅读位置暂未保存，请检查磁盘空间')) }, 400)
  }, [flush])
  const savePreferences = React.useCallback(async (): Promise<void> => {
    clearTimeout(preferenceTimer.current)
    const value = pendingPreferences.current
    if (value) {
      await window.electronAPI?.settingsSet({ ...value })
      if (pendingPreferences.current === value) pendingPreferences.current = undefined
    }
  }, [])
  const changePreferences = (patch: Partial<ReaderPreferences>): void => {
    preparedToClose.current = false
    setPreferences((current) => {
      const next = normalizeReaderPreferences({ ...current, ...patch })
      pendingPreferences.current = next
      clearTimeout(preferenceTimer.current)
      preferenceTimer.current = setTimeout(() => { void savePreferences().catch(() => setSaveError('阅读偏好暂未保存')) }, 200)
      return next
    })
  }
  React.useEffect(() => {
    const save = (): void => { if (!preparedToClose.current) void Promise.all([flush(), savePreferences()]).catch(() => setSaveError('阅读位置暂未保存')) }
    const offClose = window.electronAPI?.onBeforeClose(() => Promise.all([flush(), savePreferences()]).then(() => { preparedToClose.current = true }))
    const visibility = (): void => { if (document.visibilityState === 'hidden') save() }
    window.addEventListener('pagehide', save)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      offClose?.()
      window.removeEventListener('pagehide', save)
      document.removeEventListener('visibilitychange', visibility)
      clearTimeout(timer.current)
      clearTimeout(preferenceTimer.current)
      save()
    }
  }, [flush, savePreferences])
  return { pages, scrambleId, chapters, loading, error, saveError, preferences, startPosition, position,
    updatePosition, changePreferences, flush, savePreferences,
    retry: () => setAttempt((value) => value + 1),
    markVisible: () => visibleSpan.current?.finish('ok') }
}
