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

const app = read('src/renderer/src/App.tsx')
const titleBar = read('src/renderer/src/components/TitleBar.tsx')
assert.doesNotMatch(app, /clayStyles/)
assert.match(app, /const NAV_WIDTH = 208/)
assert.match(app, /width:\s*'2px'/)
assert.doesNotMatch(app, /backdropFilter|ac-page-enter/)
assert.match(titleBar, /const TITLE_BAR_HEIGHT = '36px'/)
assert.doesNotMatch(titleBar, /backdropFilter|borderRadius:\s*'999px'/)
console.log('  PASS: application shell uses flat WinUI navigation and title chrome')

const mangaCard = read('src/renderer/src/components/MangaCard.tsx')
const loginDialog = read('src/renderer/src/components/LoginDialog.tsx')
const chapterDialog = read('src/renderer/src/components/ChapterSelectDialog.tsx')
assert.doesNotMatch(mangaCard, /translateY|scale\(1\.03\)|backdropFilter|ac-card-enter/)
for (const dialog of [loginDialog, chapterDialog]) {
  assert.match(dialog, /var\(--ui-bg-dialog\)/)
  assert.match(dialog, /var\(--ui-stroke-card\)/)
  assert.doesNotMatch(dialog, /backdropFilter/)
}
console.log('  PASS: cards and dialogs use restrained flat content surfaces')
