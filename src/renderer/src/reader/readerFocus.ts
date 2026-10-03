import { useAppStore } from '../stores/appStore'

export async function closeReaderTab(id?: string): Promise<void> {
  if (!await useAppStore.getState().closeReader(id)) return
  requestAnimationFrame(() => {
    const target = document.querySelector<HTMLElement>('[data-reader-tab][aria-selected="true"]')
      ?? document.querySelector<HTMLElement>('[data-browse-pane]:not([hidden])')
    target?.focus()
  })
}

export function focusReaderContent(): void {
  const origin = document.activeElement
  requestAnimationFrame(() => {
    if (document.activeElement !== origin && document.activeElement !== document.body) return
    const panel = document.getElementById('active-reader-panel')
    const target = panel?.querySelector<HTMLElement>('[data-reader-viewport]') ?? panel
    target?.focus()
  })
}

export async function toggleReaderVisibility(): Promise<void> {
  const state = useAppStore.getState()
  if (!state.readerTabs.length) return
  if (state.readerVisible) {
    if (document.fullscreenElement) await document.exitFullscreen()
    state.setReaderVisible(false)
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-reader-visibility-toggle]')?.focus())
  } else {
    state.setReaderVisible(true)
    focusReaderContent()
  }
}
