import { BrowserWindow, nativeTheme } from 'electron'
import type { AppSettings } from './settingsCore'

// 与 renderer 端 --ac-base-bg 保持一致（浅色 #f4f6ff / 深色 #0f0f1e），
// 用于纯色模式窗口未绘制完成前的背景兜底，避免黑屏/白屏闪烁。
const SOLID_LIGHT = '#f4f6ff'
const SOLID_DARK = '#0f0f1e'

export function backgroundMaterialFor(settings: AppSettings): 'mica' | 'acrylic' | 'none' {
  if (settings.micaEnabled) return 'mica'
  if (settings.solidWindow) return 'none'
  return 'acrylic'
}

function isDarkTheme(settings: AppSettings): boolean {
  return (
    settings.themeMode === 'dark' ||
    (settings.themeMode === 'system' && nativeTheme.shouldUseDarkColors)
  )
}

export function windowBackgroundColorFor(settings: AppSettings): string {
  return backgroundMaterialFor(settings) === 'none'
    ? isDarkTheme(settings)
      ? SOLID_DARK
      : SOLID_LIGHT
    : '#00000000'
}

export function applyWindowBackground(settings: AppSettings): void {
  const material = backgroundMaterialFor(settings)
  const bgColor = windowBackgroundColorFor(settings)
  const fallbackColor = isDarkTheme(settings) ? SOLID_DARK : SOLID_LIGHT
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.setBackgroundMaterial(material)
      win.setBackgroundColor(bgColor)
    } catch (err) {
      // 非 Win11 或系统不支持该材质时回退纯色，保证窗口可读
      console.warn('[window] background material failed, falling back to solid:', err)
      win.setBackgroundMaterial('none')
      win.setBackgroundColor(fallbackColor)
    }
  }
}
