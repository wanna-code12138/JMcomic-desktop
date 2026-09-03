import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.doesNotMatch(app, /useAppStore\(\)/)
assert.doesNotMatch(app, /const\s*\{[^}]+\}\s*=\s*useAppStore/)

const nav = readFileSync('src/renderer/src/components/AppNavigation.tsx', 'utf8')
const status = readFileSync('src/renderer/src/components/AppStatusBar.tsx', 'utf8')
assert.match(nav, /export default React\.memo/)
assert.match(nav, /<nav/)
assert.match(nav, /onKeyDown/)
assert.match(status, /export default React\.memo/)

const pageHost = readFileSync('src/renderer/src/components/PageHost.tsx', 'utf8')
const boundary = readFileSync('src/renderer/src/components/PageLoadBoundary.tsx', 'utf8')
assert.match(pageHost, /lazy\(\(\) => import\('\.\.\/pages\/MangaDetailPage'\)\)/)
assert.match(pageHost, /lazy\(\(\) => import\('\.\.\/pages\/ReaderPage'\)\)/)
assert.match(pageHost, /lazy\(\(\) => import\('\.\.\/pages\/DownloadsPage'\)\)/)
assert.match(pageHost, /lazy\(\(\) => import\('\.\.\/pages\/SettingsPage'\)\)/)
assert.match(boundary, /Suspense/)
assert.match(boundary, /重新加载|重试/)



console.log('Renderer boundary store subscription test passed!')
