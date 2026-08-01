import assert from 'assert'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  buildChapterSaveDir,
  groupTasksByManga,
  isLocalImagePathSafe,
  resolveLocalChapterPages,
  sanitizeFileName,
  toLocalImageUrl,
  type DownloadTaskRow
} from '../downloadCore'

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

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

function row(overrides: Partial<DownloadTaskRow> = {}): DownloadTaskRow {
  return {
    id: 1,
    mangaId: '100',
    mangaTitle: '测试漫画',
    chapterIndex: 0,
    chapterTitle: '第1话',
    status: 'completed',
    totalPages: 10,
    downloadedPages: 10,
    savePath: 'D:\\downloads',
    createdAt: 1000,
    ...overrides
  }
}

// ─── sanitizeFileName ─────────────────────────────────────────────

test('sanitizeFileName replaces illegal Windows chars', () => {
  assert.strictEqual(sanitizeFileName('a<b>c:d"e/f\\g|h?i*j'), 'a_b_c_d_e_f_g_h_i_j')
})

test('sanitizeFileName trims whitespace', () => {
  assert.strictEqual(sanitizeFileName('  漫画  '), '漫画')
})

// ─── buildChapterSaveDir ──────────────────────────────────────────

test('buildChapterSaveDir nests manga and chapter folders', () => {
  const dir = buildChapterSaveDir('D:\\downloads', '我的漫画', '第 3 话')
  assert.strictEqual(dir, join('D:\\downloads', '我的漫画', '第 3 话'))
})

// ─── toLocalImageUrl ──────────────────────────────────────────────

test('toLocalImageUrl encodes absolute path as base64url', () => {
  const url = toLocalImageUrl('D:\\downloads\\漫画\\第1话\\0001.jpg')
  assert.ok(url.startsWith('jmlocal://img/'))
  const encoded = url.slice('jmlocal://img/'.length)
  const decoded = Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/') + '==', 'base64').toString('utf-8')
  assert.strictEqual(decoded, 'D:\\downloads\\漫画\\第1话\\0001.jpg')
})

// ─── resolveLocalChapterPages ─────────────────────────────────────

test('resolveLocalChapterPages returns sorted numbered images', () => {
  const root = makeTempDir('jm-local-pages-')
  try {
    mkdirSync(join(root, '章'), { recursive: true })
    for (const name of ['0001.jpg', '0002.jpg', '0010.png']) {
      writeFileSync(join(root, '章', name), 'x')
    }
    const pages = resolveLocalChapterPages(join(root, '章'))
    assert.deepStrictEqual(pages.map((p) => p.index), [0, 1, 2])
    assert.ok(pages[0].url.startsWith('jmlocal://img/'))
    const encoded = pages[2].url.slice('jmlocal://img/'.length)
    const decoded = Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/') + '==', 'base64').toString('utf-8')
    assert.ok(decoded.endsWith('0010.png'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('resolveLocalChapterPages returns empty when dir missing', () => {
  assert.deepStrictEqual(resolveLocalChapterPages('D:\\no\\such\\dir'), [])
})

// ─── isLocalImagePathSafe ─────────────────────────────────────────

test('isLocalImagePathSafe accepts image inside root/manga/chapter', () => {
  const ok = isLocalImagePathSafe(
    'D:\\downloads\\漫画\\第1话\\0001.jpg',
    ['D:\\downloads']
  )
  assert.strictEqual(ok, true)
})

test('isLocalImagePathSafe rejects files outside allowed roots', () => {
  assert.strictEqual(
    isLocalImagePathSafe('C:\\Windows\\system32\\drivers\\etc\\hosts', ['D:\\downloads']),
    false
  )
})

test('isLocalImagePathSafe rejects wrong depth or non-image files', () => {
  assert.strictEqual(
    isLocalImagePathSafe('D:\\downloads\\漫画\\0001.jpg', ['D:\\downloads']),
    false
  )
  assert.strictEqual(
    isLocalImagePathSafe('D:\\downloads\\漫画\\第1话\\readme.txt', ['D:\\downloads']),
    false
  )
})

// ─── groupTasksByManga ────────────────────────────────────────────

test('groupTasksByManga groups rows by manga and counts chapters', () => {
  const groups = groupTasksByManga([
    row({ id: 1, mangaId: '100', chapterIndex: 0, status: 'completed', createdAt: 100 }),
    row({ id: 2, mangaId: '100', chapterIndex: 1, status: 'downloading', createdAt: 200 }),
    row({ id: 3, mangaId: '100', chapterIndex: 1, status: 'failed', createdAt: 300 }),
    row({ id: 4, mangaId: '200', chapterIndex: 0, status: 'completed', createdAt: 150 })
  ])

  assert.strictEqual(groups.length, 2)
  const g1 = groups.find((g) => g.mangaId === '100')!
  assert.strictEqual(g1.totalChapters, 2)
  assert.strictEqual(g1.completedChapters, 1)
  assert.strictEqual(g1.activeTasks, 1)
  assert.strictEqual(g1.failedTasks, 1)
  assert.strictEqual(g1.tasks.length, 3)
  assert.strictEqual(g1.createdAt, 300)
})

test('groupTasksByManga returns empty for empty input', () => {
  assert.deepStrictEqual(groupTasksByManga([]), [])
})

console.log('\nAll tests completed.')
if (process.exitCode) {
  console.log('Some tests failed.')
} else {
  console.log('All tests passed!')
}
