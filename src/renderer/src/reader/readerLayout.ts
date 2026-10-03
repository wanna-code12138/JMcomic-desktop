import type { ReaderPosition, ReaderPreferences } from '../../../shared/readerContracts'

export interface PageDimensions { width: number; height: number }
export const READER_TOP_INSET = 8
export const READER_BOTTOM_INSET = 8
export function pageSize(dimensions: PageDimensions | undefined, viewport: PageDimensions, preferences: ReaderPreferences): PageDimensions {
  const natural = dimensions ?? { width: 720, height: 1080 }
  const ratio = natural.height / natural.width
  const available = Math.max(240, viewport.width - 48)
  let width = Math.min(available, preferences.readerMaxWidth)
  if (preferences.readerFit === 'height') width = Math.min(width, Math.max(1, viewport.height - READER_TOP_INSET - READER_BOTTOM_INSET) / ratio)
  if (preferences.readerFit === 'original') width = Math.min(natural.width, preferences.readerMaxWidth)
  width *= preferences.readerZoom
  return { width, height: width * ratio }
}

export function positionAtOffset(items: readonly { index: number; start: number; size: number }[], offset: number): ReaderPosition | null {
  // scrollTop may round a restored fractional page start to the preceding pixel.
  const boundary = items.find((item) => Math.abs(item.start - offset) <= 1)
  if (boundary) return { pageIndex: boundary.index, pageOffset: 0 }
  const item = items.find((item) => item.start <= offset && item.start + item.size > offset)
    ?? items.find((item) => item.start > offset)
  if (!item) return null
  return { pageIndex: item.index, pageOffset: Math.max(0, Math.min(1, (offset - item.start) / item.size)) }
}

export function isReaderShortcutTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('input,select,textarea,button,[contenteditable="true"],[role="dialog"]'))
}
