import { BrowserWindow, nativeTheme } from 'electron'
import type { AppSettings } from './settingsCore'

// 与 renderer 端 --ac-base-bg 保持一致（浅色 #f4f6ff / 深色 #0f0f1e），
// 用于纯色模式窗口未绘制完成前的背景兜底，避免黑屏/白屏闪烁。
const SOLID_LIGHT = '#f4f6ff'
const SOLID_DARK = '#0f0f1e'

export function applyWindowBackground(settings: AppSettings): void {
  const dark =
    settings.themeMode === 'dark' ||
    (settings.themeMode === 'system' && nativeTheme.shouldUseDarkColors)
  const solidColor = dark ? SOLID_DARK : SOLID_LIGHT

  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (settings.micaEnabled) {
        win.setBackgroundMaterial('mica')
        win.setBackgroundColor('#00000000')
      } else if (settings.solidWindow) {
        win.setBackgroundMaterial('none')
        win.setBackgroundColor(solidColor)
      } else {
        win.setBackgroundMaterial('acrylic')
        win.setBackgroundColor('#00000000')
      }
    } catch (err) {
      // 非 Win11 或系统不支持该材质时回退纯色，保证窗口可读
      console.warn('[window] background material failed, falling back to solid:', err)
      win.setBackgroundMaterial('none')
      win.setBackgroundColor(solidColor)
    }
  }
}
