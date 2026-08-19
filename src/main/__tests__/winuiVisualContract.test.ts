import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')

const theme = read('src/renderer/src/theme/winuiTheme.ts')
const surfaces = read('src/renderer/src/theme/surfaceStyles.ts')
const main = read('src/renderer/src/main.tsx')
const globalCss = read('src/renderer/src/assets/global.css')

assert.match(theme, /winuiLightTheme/)
assert.match(theme, /winuiDarkTheme/)
assert.doesNotMatch(surfaces, /backdropFilter|radial-gradient|brand-glow/i)
assert.match(surfaces, /var\(--ui-stroke-card\)/)
assert.match(main, /winuiLightTheme/)
assert.match(main, /ui-light/)
assert.match(globalCss, /--ui-bg-app:/)
assert.match(globalCss, /--ui-motion-fast:\s*120ms/)
console.log('  PASS: WinUI theme, semantic surfaces, and root tokens are wired')
