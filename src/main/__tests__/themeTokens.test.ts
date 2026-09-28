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
