import { useAppStore } from '../stores/appStore'
import { closeReaderTab } from './readerFocus'

export function installWorkspaceShortcuts(): () => void {
  const handler = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return
    const target = event.target as HTMLElement | null
    if (document.querySelector('dialog[open],[role="dialog"],[role="menu"]')) return
    const state = useAppStore.getState(), tabs = state.readerTabs
    const index = tabs.findIndex(tab => tab.id === state.activeReaderId), key = event.key.toLowerCase()
    if (!['t', 'w', 'tab'].includes(key) && target?.closest('input,textarea,select,[contenteditable="true"]')) return
    let action: Promise<unknown> | undefined
    if (key === 't') action = event.shiftKey ? state.reopenReaderTab() : state.newReaderTab()
    else if (key === 'w') { event.preventDefault(); void closeReaderTab(); return }
    else if (tabs.length && key === 'tab') action = state.activateReader(tabs[(index + (event.shiftKey ? tabs.length - 1 : 1)) % tabs.length].id)
    else if (tabs.length && /^[1-9]$/.test(key) && !event.shiftKey) action = state.activateReader(tabs[key === '9' ? tabs.length - 1 : Math.min(Number(key) - 1, tabs.length - 1)].id)
    else if (index >= 0 && event.shiftKey && (key === 'pageup' || key === 'pagedown')) action = state.moveReaderTab(tabs[index].id, index + (key === 'pageup' ? -1 : 1))
    if (action) { event.preventDefault(); void action }
  }
  document.addEventListener('keydown', handler)
  return () => document.removeEventListener('keydown', handler)
}
