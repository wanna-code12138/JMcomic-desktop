import React from 'react'
import { BookOpen24Regular, Search20Regular, Heart20Regular, ArrowDownload20Regular, History20Regular } from '@fluentui/react-icons'
import type { ReadingHistory } from '../../../shared/readerContracts'
import { useAppStore } from '../stores/appStore'
import { readerTabTitle } from './readerWorkspaceModel'
import appIcon from '../../../../build/icons/icon-128.png'

export default function ReaderStartPage(): JSX.Element {
  const [history, setHistory] = React.useState<ReadingHistory[]>([])
  const [query, setQuery] = React.useState('')
  const [error, setError] = React.useState('')
  const input = React.useRef<HTMLInputElement>(null)
  const closed = useAppStore(state => state.closedReaderTabs)
  React.useEffect(() => {
    let live = true
    window.electronAPI?.historyListLocal().then(rows => { if (live) setHistory(rows.slice(0, 6)) }).catch(() => { if (live) setError('暂时无法读取历史记录') })
    const frame = requestAnimationFrame(() => input.current?.focus())
    return () => { live = false; cancelAnimationFrame(frame) }
  }, [])
  const browse = (page: string): void => {
    const state = useAppStore.getState()
    state.setReaderExpanded(false); state.setCurrentPage(page)
  }
  return <div className="reader-start" data-reader-start>
    <div className="reader-start-inner">
      <div className="reader-start-mark"><img src={appIcon} alt="" width={56} height={56} draggable={false} /></div>
      <h1 tabIndex={-1}>下一页，从这里开始</h1>
      <p>继续上次阅读，或找一本想看的漫画。</p>
      <form className="reader-start-search" onSubmit={event => {
        event.preventDefault()
        const value = query.trim(); if (!value) return
        const state = useAppStore.getState(); state.setReaderExpanded(false)
        if (/^(?:JM)?\d+$/i.test(value)) state.setCurrentMangaId(value.replace(/^JM/i, ''))
        else state.triggerTagSearch(value)
        requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-browse-pane]')?.focus())
      }}>
        <Search20Regular /><input ref={input} aria-label="搜索漫画或输入 JM 号" placeholder="搜索漫画或输入 JM 号" value={query} onChange={event => setQuery(event.target.value)} />
        <button type="submit" aria-label="搜索">↵</button>
      </form>
      <div className="reader-start-links">
        <button onClick={() => { useAppStore.getState().setFavoritesTab('local-fav'); browse('favorites') }}><Heart20Regular />我的收藏</button>
        <button onClick={() => browse('downloads')}><ArrowDownload20Regular />离线下载</button>
        <button onClick={() => { useAppStore.getState().setFavoritesTab('history'); browse('favorites') }}><History20Regular />阅读历史</button>
      </div>
      <section><h2>继续阅读</h2>{error && <p role="status">{error}</p>}
        {history.length === 0 && !error && <p className="reader-start-empty">读过的漫画会出现在这里。</p>}
        <div className="reader-start-history">{history.map(row => <button key={row.manga_id} onClick={() => { void useAppStore.getState().openReader({
          mangaId: row.manga_id, mangaTitle: row.manga_title || `JM ${row.manga_id}`, mangaCoverUrl: row.cover_url || '',
          chapterIndex: row.chapter_index, chapterTitle: row.chapter_title || '', chapterUrl: row.chapter_url || '',
          resumePageIndex: row.page_index, resumePageOffset: row.page_offset ?? 0, local: Boolean(row.is_local)
        }) }}><BookOpen24Regular /><span><strong>{row.manga_title || `JM ${row.manga_id}`}</strong><small>{row.chapter_title || '上次阅读'} · 第 {row.page_index + 1} 页{row.is_local ? ' · 离线' : ''}</small></span><span aria-hidden>↗</span></button>)}</div>
      </section>
      {closed.length > 0 && <section><h2>最近关闭 <kbd>Ctrl Shift T</kbd></h2><div className="reader-start-recent">
        {closed.slice(-5).reverse().map((item, index) => <button key={`${item.tab.id}:${index}`} onClick={() => { void useAppStore.getState().reopenReaderTab(item.tab.id) }}><History20Regular /><span>{readerTabTitle(item.tab)}</span></button>)}
      </div></section>}
      <footer>Ctrl T 新建标签 · Ctrl Tab 切换 · 中键关闭</footer>
    </div>
  </div>
}
