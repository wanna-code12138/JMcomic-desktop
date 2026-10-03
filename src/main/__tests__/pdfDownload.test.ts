import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { deflateSync } from 'node:zlib'
import { preparePdfRequest, pdfFileName, resolvePdfOutput } from '../pdfDownloadCore'
import { writePdfPart } from '../pdfWriter'

test('PDF requests keep a sorted unique chapter manifest and safe root-level filenames', () => {
  const request = preparePdfRequest({ mangaId: '123', mangaTitle: '../CON:标题', chapters: [{ index: 5, title: 'C6', url: '/photo/106' }, { index: 1, title: 'C2', url: '/photo/102' }, { index: 1, title: 'C2', url: '/photo/102' }] })!
  assert.deepEqual(request.chapters.map(c => c.index), [1, 5])
  const name = pdfFileName(request)
  assert.ok(name.endsWith('.pdf')); assert.match(name, /JM123/); assert.doesNotMatch(name, /[/\\:]/)
  const root = resolve('work/downloads')
  assert.equal(resolvePdfOutput(root, name), join(root, name))
  assert.throws(() => resolvePdfOutput(root, '../outside.pdf'))
  assert.throws(() => resolvePdfOutput(root, 'other/file.pdf'))
  assert.equal(preparePdfRequest({ ...request, chapters: [] }), null)
  assert.equal(preparePdfRequest({ ...request, chapters: [{ index: -1, title: 'bad', url: 'file:///C:/secret' }] }), null)
  const other = { ...request, chapters: [{ index: 2, title: 'C3', url: '/photo/103' }] }
  assert.notEqual(pdfFileName(other), name, 'different chapter selections cannot silently share output names')
})

// Tiny RGB PNG fixtures avoid relying on a platform decoder in the writer tests.
function png(width: number, height: number, color: number): Buffer {
  const chunk = (type: string, bytes: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type), bytes]); let crc = 0xffffffff
    for (const byte of body) { crc ^= byte; for (let i=0;i<8;i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0) }
    const result = Buffer.alloc(bytes.length + 12); result.writeUInt32BE(bytes.length); body.copy(result, 4); result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4); return result
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2
  const pixels = Buffer.alloc((width * 3 + 1) * height, color)
  for (let y=0;y<height;y++) pixels[y*(width*3+1)] = 0
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))])
}

test('PDF streaming writes one proportional page per image, chapter outlines, and cleans failed partial output', async () => {
  await mkdir('work', { recursive: true }); const root = await mkdtemp(resolve('work/pdf-writer-'))
  try {
    const a = join(root, 'a.png'), b = join(root, 'b.png'), part = join(root, 'book.part')
    await writeFile(a, png(20, 40, 100)); await writeFile(b, png(60, 20, 220))
    const result = await writePdfPart(part, [{ path: a, chapterTitle: 'Chapter One', first: true }, { path: b, chapterTitle: 'Chapter Two', first: true }])
    const bytes = await readFile(part), text = bytes.toString('latin1')
    assert.equal(result.pages, 2); assert.match(result.sha256, /^[a-f0-9]{64}$/)
    assert.equal((text.match(/\/Type \/Page\b/g) ?? []).length, 2)
    assert.match(text, /\/Outlines/); assert.match(text, /\/Title \(Chapter One\)/)
    assert.match(text, /\/MediaBox \[0 0 15 30\]/); assert.match(text, /\/MediaBox \[0 0 45 15\]/)
    await assert.rejects(writePdfPart(join(root, 'bad.part'), [{ path: join(root, 'missing'), chapterTitle: '', first: true }]))
    assert.equal((await readdir(root)).includes('bad.part'), false)
    const abort = new AbortController(); abort.abort()
    await assert.rejects(writePdfPart(join(root, 'cancelled.part'), [{ path: a, chapterTitle: '', first: true }], abort.signal))
    assert.equal((await readdir(root)).includes('cancelled.part'), false)
    await assert.rejects(writePdfPart(part, [{ path: a, chapterTitle: '', first: true }]))
    assert.deepEqual(await readFile(part), bytes, 'exclusive partial output cannot overwrite existing content')
    const oversized = png(1, 1, 100)
    oversized.writeUInt32BE(4097, 16); oversized.writeUInt32BE(4097, 20)
    await writeFile(join(root, 'oversized.png'), oversized)
    await assert.rejects(writePdfPart(join(root, 'oversized.part'), [{ path: join(root, 'oversized.png'), first: true, chapterTitle: '' }]), /内存限制/)
    assert.equal((await readdir(root)).includes('oversized.part'), false)
  } finally { await rm(root, { recursive: true, force: true }) }
})
