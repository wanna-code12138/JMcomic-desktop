import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const text = readFileSync(
  resolve(process.cwd(), 'src/renderer/src/pages/ReaderPage.tsx'),
  'utf8'
)

const mangaImageStyle = text.match(/mangaImage:\s*\{([\s\S]*?)\n\s*\},/)?.[1] ?? ''
assert.match(mangaImageStyle, /width:\s*'100%'/)
console.log('  PASS: reader image reserves the available width before decode')

assert.match(mangaImageStyle, /aspectRatio:\s*'auto 2 \/ 3'/)
console.log('  PASS: reader image has a non-zero fallback aspect ratio before decode')

assert.doesNotMatch(text, /loading="lazy"/)
console.log('  PASS: the virtualizer alone controls scroll-mode image mounting')
