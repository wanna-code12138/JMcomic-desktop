import React from 'react'
import { useAppStore } from '../stores/appStore'
import { readerTabTitle } from './readerWorkspaceModel'
import { closeReaderTab } from './readerFocus'
import { useExitPresence } from '../motion/motion'

export interface TabMenuTarget { id: string; x: number; y: number }
export default function ReaderTabMenus({ target, close, allTabs, closeAll }: {
  target: TabMenuTarget | null; close: () => void; allTabs: boolean; closeAll: () => void
}): JSX.Element {
  const tabs = useAppStore(state => state.readerTabs)
  const closed = useAppStore(state => state.closedReaderTabs)
  const previousTarget = React.useRef(target)
  if (target) previousTarget.current = target
  const shownTarget = target ?? previousTarget.current
  const present = useExitPresence(Boolean(target))
  const tab = tabs.find(item => item.id === shownTarget?.id)
  const menu = React.useRef<HTMLDivElement | null>(null)
  const dialog = React.useRef<HTMLDialogElement>(null)
  const list = React.useRef<HTMLDialogElement>(null)
  const [renaming, setRenaming] = React.useState<string | null>(null)
  const [title, setTitle] = React.useState('')
  const [query, setQuery] = React.useState('')
  const restore = (): void => document.querySelector<HTMLElement>(`[data-reader-tab="${CSS.escape(target?.id ?? '')}"]`)?.focus()
  React.useLayoutEffect(() => {
    if (!target || !menu.current) return
    const element = menu.current, rect = element.getBoundingClientRect()
    element.style.left = `${Math.max(8, Math.min(target.x, innerWidth - rect.width - 8))}px`
    element.style.top = `${Math.max(8, Math.min(target.y, innerHeight - rect.height - 8))}px`
    element.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus()
    const outside = (event: PointerEvent): void => { if (!element.contains(event.target as Node)) close() }
    window.addEventListener('pointerdown', outside)
    return () => window.removeEventListener('pointerdown', outside)
  }, [target, close])
  React.useEffect(() => { if (renaming) dialog.current?.showModal(); else dialog.current?.close() }, [renaming])
  React.useEffect(() => { if (allTabs) { setQuery(''); list.current?.showModal() } else list.current?.close() }, [allTabs])
  const action = (run: () => unknown): void => { restore(); close(); run() }
  return <>
    {present && shownTarget && tab && <div ref={element => { menu.current = element; if (element) element.inert = !target }} className="workspace-menu"
      data-exiting={!target} role={target ? 'menu' : undefined} aria-hidden={!target || undefined} aria-label="标签菜单" style={{ left: shownTarget.x, top: shownTarget.y }} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); restore(); close() }
      if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
        event.preventDefault()
        const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')]
        const index = items.indexOf(document.activeElement as HTMLButtonElement)
        items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
      }
    }}>
      <button role="menuitem" onClick={() => action(() => { void useAppStore.getState().newReaderTab() })}>新建标签<kbd>Ctrl T</kbd></button>
      <button role="menuitem" onClick={() => action(() => { setTitle(readerTabTitle(tab)); setRenaming(tab.id) })}>重命名标签</button>
      <button role="menuitem" disabled={!tab.customTitle} onClick={() => action(() => { void useAppStore.getState().renameReaderTab(tab.id, '') })}>恢复原标题</button>
      <button role="menuitem" onClick={() => action(() => { void useAppStore.getState().pinReaderTab(tab.id, !tab.pinned) })}>{tab.pinned ? '取消固定' : '固定标签'}</button>
      <hr />
      <button role="menuitem" onClick={() => action(() => { void closeReaderTab(tab.id) })}>关闭标签<kbd>Ctrl W</kbd></button>
      <button role="menuitem" disabled={!tabs.some(item => !item.pinned && item.id !== tab.id)} onClick={() => action(() => { void useAppStore.getState().closeReaderTabs('others', tab.id) })}>关闭其他标签</button>
      <button role="menuitem" disabled={!tabs.slice(tabs.indexOf(tab) + 1).some(item => !item.pinned)} onClick={() => action(() => { void useAppStore.getState().closeReaderTabs('right', tab.id) })}>关闭右侧标签</button>
      <button role="menuitem" disabled={!tabs.some(item => !item.pinned)} onClick={() => action(() => { void useAppStore.getState().closeReaderTabs('all') })}>关闭未固定标签</button>
      <hr />
      <button role="menuitem" disabled={!closed.length} onClick={() => action(() => { void useAppStore.getState().reopenReaderTab() })}>重新打开关闭的标签<kbd>Ctrl Shift T</kbd></button>
    </div>}
    <dialog className="workspace-dialog" ref={dialog} aria-label="重命名标签" onCancel={() => setRenaming(null)} onClose={() => setRenaming(null)}>
      <form onSubmit={event => { event.preventDefault(); if (renaming) void useAppStore.getState().renameReaderTab(renaming, title); setRenaming(null) }}>
        <h2>重命名标签</h2><label>标签名称<input autoFocus aria-label="标签名称" maxLength={120} value={title} onChange={event => setTitle(event.target.value)} /></label>
        <p>留空可恢复漫画原标题。</p><div className="workspace-dialog-actions"><button type="button" onClick={() => setRenaming(null)}>取消</button><button type="submit" className="primary">保存名称</button></div>
      </form>
    </dialog>
    <dialog className="workspace-dialog workspace-tab-list" ref={list} aria-label="所有阅读标签" onCancel={closeAll} onClose={closeAll}>
      <h2>打开的标签 <small>{tabs.length}</small></h2><input autoFocus aria-label="筛选打开的标签" placeholder="搜索标签名称" value={query} onChange={event => setQuery(event.target.value)} />
      <div className="workspace-tab-results">{tabs.filter(item => readerTabTitle(item).toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(item =>
        <button key={item.id} onClick={() => { void useAppStore.getState().activateReader(item.id); closeAll() }}><span>{item.pinned ? '◆ ' : ''}{readerTabTitle(item)}</span><small>{item.reader?.local ? '离线' : item.kind === 'start' ? '起始页' : '在线'}</small></button>)}</div>
      <div className="workspace-dialog-actions"><button onClick={closeAll}>关闭</button></div>
    </dialog>
  </>
}
