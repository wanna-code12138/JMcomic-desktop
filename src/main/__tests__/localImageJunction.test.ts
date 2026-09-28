import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, mkdtemp, writeFile, symlink, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { openLocalImage } from '../localImageAccess'

test('local protocol rejects a chapter junction that escapes its allowed root', async () => {
  await mkdir(resolve('work'), { recursive: true })
  const temp = await mkdtemp(resolve('work/local-junction-'))
  const root = join(temp, 'downloads'), outside = join(temp, 'outside')
  try {
    await mkdir(join(root, 'book'), { recursive: true }); await mkdir(outside)
    await writeFile(join(outside, '0001.png'), 'outside bytes')
    await symlink(outside, join(root, 'book', 'chapter'), 'junction')
    await assert.rejects(openLocalImage(join(root, 'book', 'chapter', '0001.png'), [root]), /范围/)
  } finally { await rm(temp, { recursive: true, force: true }) }
})
