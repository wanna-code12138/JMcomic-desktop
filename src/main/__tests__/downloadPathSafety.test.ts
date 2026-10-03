import assert from 'node:assert/strict'
import { test } from 'node:test'
import { join, relative, resolve } from 'node:path'
import { buildChapterSaveDir } from '../downloadCore'

test('untrusted titles cannot collapse a chapter directory to a root or its parent', () => {
  const root = resolve('work/download-path-safety')
  for (const manga of ['Book', '..', '.', '...', 'CON']) {
    for (const chapter of ['..', '.', '...', 'Chapter', 'A/../../..']) {
      const target = buildChapterSaveDir(root, manga, chapter, 0)
      const parts = relative(root, target).split(/[\\/]/)
      assert.equal(parts.length, 2, `${manga}/${chapter}: ${target}`)
      assert.equal(parts.some((part) => part === '..' || part === ''), false)
      assert.notEqual(target, root)
      assert.notEqual(target, join(root, '..'))
    }
  }
})
