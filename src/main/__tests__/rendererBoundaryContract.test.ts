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


console.log('Renderer boundary store subscription test passed!')
