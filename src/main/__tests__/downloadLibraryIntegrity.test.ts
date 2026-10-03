import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { buildStorageRelativePath, resolveTaskDirectory, inspectChapterFiles } from '../downloadCore'

test('new storage uses stable content identity while legacy titles remain readable', () => {
  const a = buildStorageRelativePath('100', '/photo/202', 0)
  const b = buildStorageRelativePath('101', '/photo/202', 0)
  assert.notEqual(a, b)
  const root = resolve('work/library')
  const task = { savePath: root, mangaTitle: 'Old', chapterTitle: 'Chapter', chapterIndex: 0, storageRelpath: a }
  assert.equal(resolveTaskDirectory(task), resolveTaskDirectory({ ...task, mangaTitle: 'Renamed', chapterTitle: 'Changed' }))
  assert.equal(resolveTaskDirectory({ ...task, storageRelpath: undefined }), join(root, 'Old', 'Chapter'))
  assert.throws(() => resolveTaskDirectory({ ...task, storageRelpath: '../outside/chapter' }))
})

test('duplicate ordinals and fake images cannot hide missing pages; original numbering is retained', async () => {
  await mkdir(resolve('work'), { recursive: true })
  const root = await mkdtemp(resolve('work/library-integrity-'))
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1kAAAAASUVORK5CYII=', 'base64')
  try {
    await writeFile(join(root, '0001.png'), png)
    await writeFile(join(root, '0001.jpg'), png)
    await writeFile(join(root, '0003.png'), png)
    await writeFile(join(root, '0002.png'), 'not an image')
    let scan = await inspectChapterFiles(root, 3)
    assert.deepEqual(scan.files.map(file => file.index), [0, 2])
    assert.deepEqual(scan.missingIndices, [1])
    assert.equal(scan.available, false)
    await writeFile(join(root, '0002.png'), png)
    scan = await inspectChapterFiles(root, 3)
    assert.equal(scan.available, true)
    assert.equal(scan.files.length, 3)
  } finally { await rm(root, { recursive: true, force: true }) }
})
