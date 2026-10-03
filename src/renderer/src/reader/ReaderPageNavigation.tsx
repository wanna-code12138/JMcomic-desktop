import React from 'react'
import type { ReaderChapter } from '../../../shared/readerContracts'
import { focusReaderContent } from './readerFocus'

export default function ReaderPageNavigation({ currentPage, totalPages, chapterTitle, previous, next, jump, changeChapter }: {
  currentPage: number; totalPages: number; chapterTitle: string
  previous?: ReaderChapter; next?: ReaderChapter
  jump: (index: number) => void; changeChapter: (index: number) => void
}): JSX.Element {
  const menu = React.useRef<HTMLDetailsElement>(null)
  const [value, setValue] = React.useState(String(currentPage + 1))
  React.useEffect(() => setValue(String(currentPage + 1)), [currentPage])
  React.useEffect(() => {
    const outside = (event: PointerEvent): void => {
      if (menu.current?.open && !menu.current.contains(event.target as Node)) menu.current.open = false
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [])
  const go = (): void => {
    const page = Number(value)
    if (!Number.isFinite(page) || !Number.isInteger(page) || page < 1) { setValue(String(currentPage + 1)); return }
    jump(Math.min(totalPages, page) - 1)
    if (menu.current) menu.current.open = false
    focusReaderContent()
  }
  return <details className="reader-page-navigation" ref={menu} onKeyDown={event => {
    if (event.key !== 'Escape' || !menu.current?.open) return
    event.preventDefault(); event.stopPropagation()
    menu.current.open = false
    menu.current.querySelector('summary')?.focus()
  }}>
    <summary aria-label="阅读进度" title={`${chapterTitle} · 点击跳转页码`}>
      <span data-reader-progress data-current-page={currentPage + 1}>{currentPage + 1} / {totalPages}</span>
    </summary>
    <div className="reader-page-menu" aria-label="翻页与跳转">
      <strong>{chapterTitle}</strong>
      <form onSubmit={event => { event.preventDefault(); go() }}>
        <label>页码<input aria-label="跳转页码" inputMode="numeric" type="number" min={1} max={totalPages} value={value}
          onChange={event => setValue(event.target.value)} /></label><span>/ {totalPages}</span><button type="submit">跳转</button>
      </form>
      <div className="reader-page-menu-row">
        <button disabled={currentPage === 0} onClick={() => jump(currentPage - 1)}>上一页</button>
        <button disabled={currentPage === totalPages - 1} onClick={() => jump(currentPage + 1)}>下一页</button>
      </div>
      <div className="reader-page-menu-row">
        <button disabled={!previous || previous.available === false} onClick={() => previous && changeChapter(previous.index)}>上一章</button>
        <button disabled={!next || next.available === false} onClick={() => next && changeChapter(next.index)}>下一章</button>
      </div>
    </div>
  </details>
}
