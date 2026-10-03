import assert from 'node:assert/strict'
import { test } from 'node:test'
import { winuiDarkTheme, winuiLightTheme } from '../../renderer/src/theme/winuiTheme'

test('both themes supply every interactive brand color', () => {
  for (const theme of [winuiDarkTheme, winuiLightTheme]) {
    for (const [name, value] of Object.entries(theme)) {
      if (name.startsWith('colorBrand')) assert.ok(value, `${name} must be defined`)
    }
  }
})

function contrast(foreground: string, background: string): number {
  const luminance = (hex: string): number => {
    const rgb = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
  }
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

test('small text, status colors and brand button states remain readable in both themes', () => {
  for (const theme of [winuiLightTheme, winuiDarkTheme]) {
    for (const foreground of [theme.colorNeutralForeground1, theme.colorNeutralForeground2, theme.colorNeutralForeground3,
      theme.colorPaletteGreenForeground1, theme.colorPaletteYellowForeground1, theme.colorPaletteRedForeground1, theme.colorPaletteBerryForeground1]) {
      for (const background of [theme.colorNeutralBackground1, theme.colorNeutralBackground2, theme.colorNeutralBackground3, theme.colorNeutralBackground4]) {
        assert.ok(contrast(foreground, background) >= 4.5, `${foreground} text on ${background}`)
      }
    }
    for (const background of [theme.colorBrandBackground, theme.colorBrandBackgroundHover, theme.colorBrandBackgroundPressed, theme.colorBrandBackgroundSelected]) {
      assert.ok(contrast(theme.colorNeutralForegroundOnBrand, background) >= 4.5, `brand text on ${background}`)
    }
    assert.ok(contrast(theme.colorBrandForeground1, theme.colorBrandBackground2) >= 4.5, 'selected links remain readable')
    assert.ok(contrast(theme.colorCompoundBrandBackground, theme.colorNeutralBackground1) >= 3, 'checked controls remain distinguishable')
  }
})
