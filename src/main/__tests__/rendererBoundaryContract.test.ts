import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.doesNotMatch(app, /useAppStore\(\)/)
assert.doesNotMatch(app, /const\s*\{[^}]+\}\s*=\s*useAppStore/)

console.log('Renderer boundary store subscription test passed!')
