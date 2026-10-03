import type { ReaderState } from '../../../shared/readerContracts'

import type { ReaderTab } from '../../../shared/workspaceSnapshot'
export type { ReaderTab } from '../../../shared/workspaceSnapshot'
export interface ClosedReaderTab { tab: ReaderTab; index: number }
export interface ReaderWorkspaceState {
  readerTabs: ReaderTab[]
  activeReaderId: string | null
  closedReaderTabs: ClosedReaderTab[]
}
export type ReaderAction =
  | { type: 'open'; reader: ReaderState }
  | { type: 'new'; id: string }
  | { type: 'activate'; id: string }
  | { type: 'close'; id: string }
  | { type: 'rename'; id: string; title: string }
  | { type: 'pin'; id: string; pinned: boolean }
  | { type: 'move'; id: string; index: number }
  | { type: 'batch'; id: string; scope: 'others' | 'right' | 'all' }
  | { type: 'reopen'; id?: string }
  | { type: 'flush' }

export const readerContentKey = (reader: ReaderState): string => `${reader.local ? 'local' : 'online'}:${reader.mangaId}`
export const readerTabTitle = (tab: ReaderTab): string => tab.customTitle || tab.reader?.mangaTitle || '新标签页'
const partition = (tabs: ReaderTab[]): ReaderTab[] => [...tabs.filter(tab => tab.pinned), ...tabs.filter(tab => !tab.pinned)]

/** Pure tab operations; the store serializes them behind the active reading-session save barrier. */
export function applyReaderAction(state: ReaderWorkspaceState, action: ReaderAction): ReaderWorkspaceState {
  let tabs = state.readerTabs, activeReaderId = state.activeReaderId, closed = state.closedReaderTabs
  const activeIndex = tabs.findIndex(tab => tab.id === activeReaderId)
  if (action.type === 'new') {
    tabs = [...tabs]; tabs.splice(activeIndex + 1, 0, { id: action.id, kind: 'start', pinned: false })
    tabs = partition(tabs); activeReaderId = action.id
  } else if (action.type === 'open') {
    const contentKey = readerContentKey(action.reader)
    const existing = tabs.find(tab => tab.contentKey === contentKey)
    if (existing) {
      if (existing.reader?.chapterIndex !== action.reader.chapterIndex) tabs = tabs.map(tab => tab === existing ? { ...tab, kind: 'book', reader: action.reader, contentKey } : tab)
      activeReaderId = existing.id
    } else {
      const empty = tabs[activeIndex]?.kind === 'start' ? tabs[activeIndex] : undefined
      const tab: ReaderTab = { ...empty, id: empty?.id ?? contentKey, pinned: empty?.pinned ?? false, kind: 'book', contentKey, reader: action.reader }
      tabs = empty ? tabs.map(item => item === empty ? tab : item) : [...tabs, tab]
      activeReaderId = tab.id
    }
  } else if (action.type === 'activate') {
    if (tabs.some(tab => tab.id === action.id)) activeReaderId = action.id
  } else if (action.type === 'rename') {
    tabs = tabs.map(tab => tab.id === action.id ? { ...tab, customTitle: action.title.trim().slice(0, 120) || undefined } : tab)
  } else if (action.type === 'pin') {
    tabs = partition(tabs.map(tab => tab.id === action.id ? { ...tab, pinned: action.pinned } : tab))
  } else if (action.type === 'move') {
    const tab = tabs.find(item => item.id === action.id)
    if (tab) {
      const rest = tabs.filter(item => item !== tab), boundary = rest.filter(item => item.pinned).length
      const index = Math.max(tab.pinned ? 0 : boundary, Math.min(tab.pinned ? boundary : rest.length, Math.trunc(action.index)))
      rest.splice(index, 0, tab); tabs = rest
    }
  } else if (action.type === 'close' || action.type === 'batch') {
    const target = tabs.findIndex(tab => tab.id === action.id)
    const closing = tabs.filter((tab, index) => action.type === 'close' ? tab.id === action.id :
      !tab.pinned && (action.scope === 'all' || (target >= 0 && (action.scope === 'others' ? tab.id !== action.id : index > target))))
    if (closing.length) {
      closed = [...closed, ...closing.map(tab => ({ tab, index: tabs.indexOf(tab) }))].slice(-20)
      tabs = tabs.filter(tab => !closing.includes(tab))
      if (closing.some(tab => tab.id === activeReaderId)) activeReaderId = tabs[Math.min(activeIndex, tabs.length - 1)]?.id ?? null
    }
  } else if (action.type === 'reopen') {
    let index = closed.length - 1
    if (action.id) while (index >= 0 && closed[index].tab.id !== action.id) index--
    const item = closed[index]
    if (item) {
      const existing = tabs.find(tab => item.tab.contentKey ? tab.contentKey === item.tab.contentKey : tab.id === item.tab.id)
      if (existing) activeReaderId = existing.id
      else {
        tabs = [...tabs]; tabs.splice(Math.min(item.index, tabs.length), 0, item.tab)
        tabs = partition(tabs); activeReaderId = item.tab.id
      }
      closed = closed.filter((_, i) => i !== index)
    }
  }
  return { readerTabs: tabs, activeReaderId, closedReaderTabs: closed }
}
