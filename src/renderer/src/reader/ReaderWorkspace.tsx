import React from 'react'
import { ArrowExpand20Regular, ArrowCollapseAll20Regular, Dismiss16Regular, BookOpen16Regular } from '@fluentui/react-icons'
import { useAppStore } from '../stores/appStore'
import PageLoadBoundary from '../components/PageLoadBoundary'
import { createRetryableLazyPage } from '../components/retryableLazyPage'
import { closeReaderTab } from './readerFocus'

const ReaderPage = createRetryableLazyPage(() => import('../pages/ReaderPage'))

export default function ReaderWorkspace(): JSX.Element {
  const tabs = useAppStore(state => state.readerTabs)
  const active = useAppStore(state => state.activeReaderId)
  const expanded = useAppStore(state => state.readerExpanded)
  const pending = useAppStore(state => state.readerTransitionPending)
  const error = useAppStore(state => state.readerTransitionError)
  const panel = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => { if (panel.current) panel.current.inert = pending }, [pending])
  React.useEffect(() => {
    document.querySelector<HTMLElement>('[data-reader-tab][aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active])
  const tabKey = (event: React.KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1
    if (next >= 0) {
      event.preventDefault()
      const id = tabs[next].id
      void useAppStore.getState().activateReader(id).then(ok => {
        if (ok) document.querySelector<HTMLButtonElement>(`[data-reader-tab="${CSS.escape(id)}"]`)?.focus()
      })
    } else if (event.key === 'Delete') { event.preventDefault(); void closeReaderTab(tabs[index].id) }
  }
  return <section className="reader-workspace" data-reader-workspace aria-label="阅读工作区" onKeyDown={event => {
    if (event.key === 'Escape' && !event.defaultPrevented && !document.fullscreenElement && expanded) {
      event.preventDefault()
      useAppStore.getState().setReaderExpanded(false)
    }
  }}>
    <div className="reader-workspace-header">
      <div className="reader-tabs" role="tablist" aria-label="打开的阅读标签">
        {tabs.map((tab, index) => <div className="reader-tab" data-active={tab.id === active} key={tab.id}>
          <button role="tab" data-reader-tab={tab.id} aria-selected={tab.id === active} tabIndex={tab.id === active ? 0 : -1}
            aria-controls="active-reader-panel" title={`${tab.reader.mangaTitle} · ${tab.reader.local ? '离线' : '在线'}`}
            onKeyDown={event => tabKey(event, index)} onClick={() => { void useAppStore.getState().activateReader(tab.id) }}>
            <BookOpen16Regular /><span>{tab.reader.mangaTitle}</span>{tab.reader.local && <small>离线</small>}
          </button>
          <button className="reader-tab-close" data-close-reader={tab.id} aria-label={`关闭 ${tab.reader.mangaTitle}的阅读标签`}
            title="关闭标签" onClick={() => { void closeReaderTab(tab.id) }}><Dismiss16Regular /></button>
        </div>)}
      </div>
      <button className="reader-expand" aria-label={expanded ? '还原三栏布局' : '铺满阅读窗口'}
        title={expanded ? '还原三栏布局' : '铺满阅读窗口'} onClick={() => useAppStore.getState().setReaderExpanded(!expanded)}>
        {expanded ? <ArrowCollapseAll20Regular /> : <ArrowExpand20Regular />}
      </button>
    </div>
    <div className="reader-workspace-content">
      <div ref={panel} className="reader-active-panel" id="active-reader-panel" role="tabpanel" tabIndex={-1} aria-label="当前阅读内容" aria-busy={pending}>
        <PageLoadBoundary pageName="阅读器">{attempt => { const Page = ReaderPage.get(attempt); return <Page /> }}</PageLoadBoundary>
      </div>
      {pending && <div className="reader-transition-pending" data-reader-pending role="status">正在保存阅读位置…</div>}
      {error && <div className="reader-transition-error" data-reader-transition-error role="alert">{error}
        <button onClick={() => { void useAppStore.getState().retryReaderTransition() }}>重试保存</button>
      </div>}
    </div>
  </section>
}
