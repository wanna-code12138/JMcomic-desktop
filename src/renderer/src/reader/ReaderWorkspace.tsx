import React from 'react'
import { ArrowExpand20Regular, ArrowCollapseAll20Regular, Dismiss16Regular, BookOpen16Regular, Options20Regular, PanelRightContract20Regular, Add20Regular, ChevronDown16Regular, Pin16Regular } from '@fluentui/react-icons'
import { useAppStore } from '../stores/appStore'
import PageLoadBoundary from '../components/PageLoadBoundary'
import { createRetryableLazyPage } from '../components/retryableLazyPage'
import { closeReaderTab, toggleReaderVisibility } from './readerFocus'
import ReaderStartPage from './ReaderStartPage'
import ReaderTabMenus, { type TabMenuTarget } from './ReaderTabMenus'
import { readerTabTitle } from './readerWorkspaceModel'
import { useTabMotion } from '../motion/motion'

const ReaderPage = createRetryableLazyPage(() => import('../pages/ReaderPage'))

export default function ReaderWorkspace(): JSX.Element {
  const tabs = useAppStore(state => state.readerTabs)
  const active = useAppStore(state => state.activeReaderId)
  const expanded = useAppStore(state => state.readerExpanded)
  const visible = useAppStore(state => state.readerVisible)
  const toolsVisible = useAppStore(state => state.readerToolsVisible)
  const pending = useAppStore(state => state.readerTransitionPending)
  const error = useAppStore(state => state.readerTransitionError)
  const panel = React.useRef<HTMLDivElement>(null)
  const [headerHost, setHeaderHost] = React.useState<HTMLDivElement | null>(null)
  const tabStrip = React.useRef<HTMLDivElement>(null)
  const drag = React.useRef<{ id: string; index: number; x: number } | null>(null)
  const [drop, setDrop] = React.useState<{ id: string; after: boolean } | null>(null)
  const [menu, setMenu] = React.useState<TabMenuTarget | null>(null)
  const [allTabs, setAllTabs] = React.useState(false)
  const closeMenu = React.useCallback(() => setMenu(null), [])
  const closeAll = React.useCallback(() => setAllTabs(false), [])
  const activeTab = tabs.find(tab => tab.id === active)
  useTabMotion(tabStrip, tabs.map(tab => `${tab.id}:${tab.pinned}`).join('|'))
  React.useEffect(() => {
    if (!drop) return
    let frame: number
    const scroll = (): void => {
      const strip = tabStrip.current, current = drag.current
      if (strip && current) {
        const rect = strip.getBoundingClientRect()
        strip.scrollLeft += current.x < rect.left + 36 ? -6 : current.x > rect.right - 36 ? 6 : 0
        frame = requestAnimationFrame(scroll)
      }
    }
    frame = requestAnimationFrame(scroll)
    return () => cancelAnimationFrame(frame)
  }, [Boolean(drop)])
  React.useEffect(() => { if (panel.current) panel.current.inert = pending }, [pending])
  React.useEffect(() => { if (headerHost) headerHost.inert = pending }, [headerHost, pending])
  React.useEffect(() => {
    document.querySelector<HTMLElement>('[data-reader-tab][aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active, visible])
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
    else if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
      event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect()
      setMenu({ id: tabs[index].id, x: rect.left, y: rect.bottom })
    }
  }
  return <section className="reader-workspace" id="reader-workspace" data-reader-workspace aria-label="阅读工作区" onKeyDown={event => {
    if (event.key === 'Escape' && drag.current) { drag.current = null; setDrop(null); event.preventDefault() }
    if (event.key === 'Escape' && !event.defaultPrevented && !document.fullscreenElement && expanded) {
      event.preventDefault()
      useAppStore.getState().setReaderExpanded(false)
    }
  }}>
    <div className="reader-workspace-header">
      <div ref={tabStrip} className="reader-tabs" role="tablist" aria-label="打开的阅读标签">
        {tabs.map((tab, index) => <div className="reader-tab" data-active={tab.id === active} data-pinned={tab.pinned} key={tab.id}
          data-drop={drop?.id === tab.id ? drop.after ? 'after' : 'before' : undefined}
          onContextMenu={event => { event.preventDefault(); setMenu({ id: tab.id, x: event.clientX, y: event.clientY }) }}
          onAuxClick={event => { if (event.button === 1) { event.preventDefault(); void closeReaderTab(tab.id) } }}
          onDragOver={event => {
            if (!drag.current) return
            event.preventDefault(); event.dataTransfer.dropEffect = 'move'
            const after = event.clientX > event.currentTarget.getBoundingClientRect().left + event.currentTarget.clientWidth / 2
            const insertion = index + Number(after), source = tabs.findIndex(item => item.id === drag.current?.id)
            drag.current.index = insertion - Number(source < insertion); drag.current.x = event.clientX
            setDrop({ id: tab.id, after })
          }}
          onDrop={event => { event.preventDefault(); if (drag.current) void useAppStore.getState().moveReaderTab(drag.current.id, drag.current.index); drag.current = null; setDrop(null) }}>
          <button role="tab" data-reader-tab={tab.id} aria-selected={tab.id === active} tabIndex={tab.id === active ? 0 : -1}
            draggable onDragStart={event => { drag.current = { id: tab.id, index, x: event.clientX }; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', tab.id) }}
            onDragEnd={() => { drag.current = null; setDrop(null) }}
            aria-controls="active-reader-panel" title={`${readerTabTitle(tab)}${tab.reader ? ` · ${tab.reader.local ? '离线' : '在线'} · ${tab.reader.chapterTitle}` : ''}`}
            onKeyDown={event => tabKey(event, index)} onClick={() => { void useAppStore.getState().activateReader(tab.id) }}>
            {tab.pinned ? <Pin16Regular /> : <BookOpen16Regular />}<span>{readerTabTitle(tab)}</span>{tab.reader?.local && <small>离线</small>}
          </button>
          <button className="reader-tab-close" data-close-reader={tab.id} aria-label={`关闭 ${readerTabTitle(tab)}的阅读标签`}
            title="关闭标签" onClick={() => { void closeReaderTab(tab.id) }}><Dismiss16Regular /></button>
        </div>)}
      </div>
      <button className="reader-workspace-action" data-new-reader-tab aria-label="新建标签" title="新建标签 · Ctrl T" onClick={() => { void useAppStore.getState().newReaderTab() }}><Add20Regular /></button>
      <button className="reader-workspace-action" data-reader-tab-list aria-label="所有阅读标签" title="搜索打开的标签" onClick={() => setAllTabs(true)}><ChevronDown16Regular /></button>
      <div className="reader-header-slot" ref={setHeaderHost} />
      <button className="reader-workspace-action" data-reader-tools-toggle aria-expanded={toolsVisible} aria-controls="reader-tools"
        aria-label={toolsVisible ? '隐藏阅读工具' : '显示阅读工具'} title={`${toolsVisible ? '隐藏' : '显示'}阅读工具 · H`}
        disabled={pending || activeTab?.kind !== 'book'} onClick={() => useAppStore.getState().setReaderToolsVisible(!toolsVisible)}><Options20Regular /></button>
      <button className="reader-expand" aria-label={expanded ? '还原三栏布局' : '铺满阅读窗口'}
        title={expanded ? '还原三栏布局' : '铺满阅读窗口'} onClick={() => useAppStore.getState().setReaderExpanded(!expanded)}>
        {expanded ? <ArrowCollapseAll20Regular /> : <ArrowExpand20Regular />}
      </button>
      <button className="reader-workspace-action" aria-label="收起阅读侧栏" title="收起阅读侧栏，保留所有标签"
        disabled={pending} onClick={() => { void toggleReaderVisibility() }}><PanelRightContract20Regular /></button>
    </div>
    <div className="reader-workspace-content">
      <div ref={panel} className="reader-active-panel" id="active-reader-panel" role="tabpanel" tabIndex={-1} aria-label="当前阅读内容" aria-busy={pending}>
        {activeTab?.kind === 'start' ? <ReaderStartPage key={activeTab.id} /> : <PageLoadBoundary pageName="阅读器">{attempt => { const Page = ReaderPage.get(attempt); return <Page headerHost={headerHost} /> }}</PageLoadBoundary>}
      </div>
      {pending && <div className="reader-transition-pending" data-reader-pending role="status">正在保存阅读位置…</div>}
      {error && <div className="reader-transition-error" data-reader-transition-error role="alert">{error}
        <button onClick={() => { void useAppStore.getState().retryReaderTransition() }}>重试保存</button>
      </div>}
    </div>
    <ReaderTabMenus target={menu} close={closeMenu} allTabs={allTabs} closeAll={closeAll} />
  </section>
}
