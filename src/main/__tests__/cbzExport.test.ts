import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { writeCbz } from '../cbzExport'
import * as fs from 'node:fs/promises'
import { loadModule } from './helpers/loadModule'

test('CBZ stores exact ordered image bytes; missing input preserves existing destination', async () => {
  await mkdir(resolve('work'), { recursive: true })
  const root = await mkdtemp(resolve('work/cbz-test-'))
  try {
    const input = join(root, 'pages'); await mkdir(input)
    const source = join(input, '0001.png'); const bytes = Buffer.from('original image bytes')
    await writeFile(source, bytes)
    const destination = join(root, 'book.cbz')
    await writeCbz(destination, [{ source, name: '0001/0001.png' }, { source, name: '0002/0001.png' }])
    const zip = await readFile(destination)
    const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
    assert.ok(end > 0); assert.equal(zip.readUInt16LE(end + 10), 2)
    let central = zip.readUInt32LE(end + 16)
    for (const expected of ['0001/0001.png', '0002/0001.png']) {
      assert.equal(zip.readUInt32LE(central), 0x02014b50)
      assert.equal(zip.readUInt16LE(central + 10), 0, 'already compressed images use STORE')
      const length = zip.readUInt16LE(central + 28)
      assert.equal(zip.subarray(central + 46, central + 46 + length).toString(), expected)
      const local = zip.readUInt32LE(central + 42)
      const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
      assert.deepEqual(zip.subarray(dataStart, dataStart + zip.readUInt32LE(central + 20)), bytes)
      central += 46 + length + zip.readUInt16LE(central + 30) + zip.readUInt16LE(central + 32)
    }
    await assert.rejects(writeCbz(destination, [{ source: join(input, 'missing.png'), name: '0001.png' }]))
    assert.deepEqual(await readFile(destination), zip)
    await assert.rejects(writeCbz(join(input, 'inside.cbz'), [{ source, name: '0001.png' }]))
    assert.equal((await readdir(root)).some(name => name.endsWith('.part')), false)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('cancellation during fsync cannot replace an existing archive', async () => {
  await mkdir(resolve('work'), { recursive: true })
  const root = await mkdtemp(resolve('work/cbz-cancel-'))
  const controller = new AbortController()
  const exporter = loadModule<typeof import('../cbzExport')>('src/main/cbzExport.ts', {
    'fs/promises': { ...fs, open: async (...args: Parameters<typeof fs.open>) => {
      const file = await fs.open(...args)
      return { sync: async () => { await file.sync(); controller.abort() }, close: () => file.close() }
    } }
  })
  try {
    const input = join(root, 'pages'); await mkdir(input)
    const source = join(input, '0001.png'); await writeFile(source, 'image')
    const destination = join(root, 'book.cbz'); await writeFile(destination, 'previous archive')
    await assert.rejects(exporter.writeCbz(destination, [{ source, name: '0001.png' }], controller.signal))
    assert.equal(await readFile(destination, 'utf8'), 'previous archive')
  } finally { await rm(root, { recursive: true, force: true }) }
})
