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
  requestAnimationFrame(() => {
    const panel = document.getElementById('active-reader-panel')
    const target = panel?.querySelector<HTMLElement>('[data-reader-viewport]') ?? panel
    target?.focus()
  })
}
