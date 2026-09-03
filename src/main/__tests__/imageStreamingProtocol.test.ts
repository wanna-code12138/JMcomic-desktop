import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const proto = readFileSync(resolve(process.cwd(), 'src/main/imageProtocol.ts'), 'utf8')
const mangaCard = readFileSync(resolve(process.cwd(), 'src/renderer/src/components/MangaCard.tsx'), 'utf8')
const readerPage = readFileSync(resolve(process.cwd(), 'src/renderer/src/pages/ReaderPage.tsx'), 'utf8')

// 1. 协议实现源码断言
assert.match(proto, /new ReadableStream/)
assert.match(proto, /firstByteMs|totalMs/)
assert.match(proto, /shouldRetryImage/)
assert.match(proto, /toProxyUrl\(.*priority/)

// 2. 渲染端优先级标注断言
assert.match(mangaCard, /toProxyUrl\(.*['"]visible-grid['"]\)/)
assert.match(readerPage, /toProxyUrl\(.*['"]critical['"]|['"]near['"]/)

console.log('All imageStreamingProtocol tests passed!')
