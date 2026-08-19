import assert from 'assert'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`  PASS: ${name}`)
  } catch (err) {
    console.log(`  FAIL: ${name}`)
    console.log(`        ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  }
}

const read = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf-8')

const required: Array<[string, string]> = [
  ['src/main/scraperWindow.ts', "beginMainPerfSpan('scraper.navigate'"],
  ['src/main/contentApi.ts', "beginMainPerfSpan('content.pages'"],
  ['src/main/imageProtocol.ts', "beginMainPerfSpan('image.online'"],
  ['src/main/localImageProtocol.ts', "beginMainPerfSpan('image.local'"],
  ['src/main/database.ts', "beginMainPerfSpan('database.save'"]
]

for (const [path, marker] of required) {
  test(`${path} records ${marker}`, () => {
    assert.ok(read(path).includes(marker))
  })
}
