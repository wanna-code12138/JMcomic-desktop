import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { PdfDownloadService } from '../pdfDownloadService'
import type { PdfTask } from '../../shared/pdfContracts'

const request = { mangaId: '12', mangaTitle: 'Book', chapters: [{ index: 1, title: 'Two', url: '/photo/122' }, { index: 0, title: 'One', url: '/photo/121' }] }
async function fixture() {
  await mkdir('work', { recursive: true }); const root = await mkdtemp(resolve('work/pdf-lifecycle-'))
  const rows = new Map<number, PdfTask>(), trace: string[] = []
  let nextId = 1, rejectMetadata = false, blocked: Promise<void> | undefined
  let saveHook = async (_task: PdfTask): Promise<void> => {}, removeHook = async (): Promise<void> => {}
  const service = new PdfDownloadService({
    dataDir: join(root, 'data'), settings: async () => ({ downloadDir: root, downloadRetries: 0, downloadResumeOnStartup: true }),
    repository: {
      list: async () => structuredClone([...rows.values()]),
      insert: async task => { trace.push('insert'); const row = { ...task, id: nextId++ }; rows.set(row.id, structuredClone(row)); return row },
      save: async task => { trace.push(`save:${task.status}`); rows.set(task.id, structuredClone(task)); await saveHook(task) },
      remove: async id => { await removeHook(); rows.delete(id) }
    },
    pages: async () => { trace.push('metadata'); if (blocked) await blocked; if (rejectMetadata) throw Error('offline'); return { pages: [{ imageUrl: 'https://image.test/one.png' }], scrambleId: 0 } },
    images: async (urls, options) => { for (let i=0;i<urls.length;i++) await options.onImage!({ url: urls[i], localPath: null, cached: false, buffer: Buffer.from([137,80,78,71,13,10,26,10,...Array(32).fill(0)]) }, i); return urls.map(url => ({ url, localPath: null, cached: false })) },
    transform: async bytes => bytes,
    writer: async (part, pages, signal) => { signal.throwIfAborted(); const bytes = Buffer.from(`PDF:${pages.map(page => page.chapterTitle).join(',')}`); await writeFile(part, bytes, { flag: 'wx' }); return { pages: pages.length, sha256: createHash('sha256').update(bytes).digest('hex') } },
    progress() {}
  })
  return { service, rows, root, trace, setFailure: (value: boolean) => { rejectMetadata = value }, block: (value?: Promise<void>) => { blocked = value },
    onSave: (hook: typeof saveHook) => { saveHook = hook }, onRemove: (hook: typeof removeHook) => { removeHook = hook } }
}

test('PDF admission is durable before metadata, deduplicates concurrent requests, and publishes at root without overwriting', async () => {
  const f = await fixture()
  try {
    let release!: () => void; f.block(new Promise<void>(resolve => { release = resolve }))
    const ids = await Promise.all([f.service.add(request), f.service.add(request)])
    assert.equal(ids[0].id, ids[1].id)
    const row = [...f.rows.values()][0]
    assert.deepEqual(row.chapters.map(c => c.index), [0, 1]); assert.equal(f.trace[0], 'insert')
    await writeFile(join(f.root, row.outputFile), 'existing user file')
    release(); await f.service.idle()
    const done = f.rows.get(row.id)!
    assert.equal(done.status, 'completed'); assert.equal(done.totalPages, 2)
    assert.notEqual(done.outputFile, row.outputFile)
    assert.equal(await readFile(join(f.root, row.outputFile), 'utf8'), 'existing user file')
    assert.equal(await readFile(join(f.root, done.outputFile), 'utf8'), 'PDF:One,Two')
    assert.ok(f.trace.indexOf('save:committing') < f.trace.indexOf('save:completed'))
    assert.equal((await readdir(f.root)).some(name => name.endsWith('.part')), false)
  } finally { await f.service.stop(); await rm(f.root, { recursive: true, force: true }) }
})

test('removing an unpublished failed PDF cleans its own record and preserves an unrelated same-name file', async () => {
  const f = await fixture()
  try {
    f.setFailure(true); const task = await f.service.add(request); await f.service.idle()
    await writeFile(join(f.root, task.outputFile), 'user document')
    await f.service.remove(task.id, true)
    assert.equal(f.rows.size, 0)
    assert.equal(await readFile(join(f.root, task.outputFile), 'utf8'), 'user document')
  } finally { await f.service.stop(); await rm(f.root, { recursive: true, force: true }) }
})

test('cancel waits for an admitted retry and shutdown waits for record deletion', async () => {
  const f = await fixture()
  try {
    f.setFailure(true); const task = await f.service.add(request); await f.service.idle()
    let release!: () => void, entered!: () => void
    const gate = new Promise<void>(resolve => { release = resolve }), started = new Promise<void>(resolve => { entered = resolve })
    f.onSave(async value => { if (value.status === 'pending') { entered(); await gate } })
    const retry = f.service.retry(task.id); await started
    let cancelled = false
    const cancel = f.service.cancel(task.id).then(() => { cancelled = true })
    await new Promise(resolve => setImmediate(resolve))
    const prematurelyCancelled = cancelled
    release(); await Promise.all([retry, cancel]); await f.service.idle()
    assert.equal(prematurelyCancelled, false, 'later cancellation must follow the earlier admitted retry')
    assert.equal(f.rows.get(task.id)!.status, 'cancelled')
    let finishRemove!: () => void, removing!: () => void
    const removeGate = new Promise<void>(resolve => { finishRemove = resolve }), removeStarted = new Promise<void>(resolve => { removing = resolve })
    f.onRemove(async () => { removing(); await removeGate })
    const remove = f.service.remove(task.id, false); await removeStarted
    let stopped = false; const stop = f.service.stop().then(() => { stopped = true })
    await new Promise(resolve => setImmediate(resolve)); const prematurelyStopped = stopped
    finishRemove(); await Promise.all([remove, stop])
    assert.equal(prematurelyStopped, false, 'database must remain open until admitted deletion finishes')
  } finally { await f.service.stop(); await rm(f.root, { recursive: true, force: true }) }
})

test('clearing stopped PDF tasks drops queued and interrupted work before resuming', async () => {
  const f = await fixture()
  try {
    let release!: () => void; f.block(new Promise<void>(resolve => { release = resolve }))
    await f.service.add(request); await f.service.add({ ...request, mangaId: '13' })
    await new Promise(resolve => setImmediate(resolve)); await f.service.stop()
    const metadataCalls = f.trace.filter(item => item === 'metadata').length
    await f.service.clearStoppedTasks(); f.rows.clear(); f.service.resume(); release(); await f.service.idle()
    assert.equal(f.trace.filter(item => item === 'metadata').length, metadataCalls)
    assert.equal(f.rows.size, 0)
  } finally { await f.service.stop(); await rm(f.root, { recursive: true, force: true }) }
})

test('completed task recovery and deletion remove crash leftovers with the stable task filename', async () => {
  const f = await fixture()
  try {
    const task = await f.service.add(request); await f.service.idle()
    const partial = join(f.root, `.jmcomic-${task.stagingId}.pdf.part`)
    await writeFile(partial, 'crash leftover'); await f.service.init()
    assert.equal((await readdir(f.root)).some(name => name.endsWith('.part')), false)
    await writeFile(partial, 'crash leftover'); await f.service.remove(task.id, true)
    assert.equal((await readdir(f.root)).some(name => name.endsWith('.part')), false)
  } finally { await f.service.stop(); await rm(f.root, { recursive: true, force: true }) }
})

test('PDF metadata failure retains all selected chapters and retry keeps root/format; shutdown blocks late work', async () => {
  const f = await fixture()
  try {
    f.setFailure(true)
    const task = await f.service.add(request); await f.service.idle()
    assert.equal(f.rows.get(task.id)!.status, 'failed'); assert.equal(f.rows.get(task.id)!.chapters.length, 2)
    f.setFailure(false); await f.service.retry(task.id); await f.service.idle()
    assert.equal(f.rows.get(task.id)!.status, 'completed'); assert.equal(f.rows.get(task.id)!.savePath, f.root)
    let release!: () => void; f.block(new Promise<void>(resolve => { release = resolve }))
    const second = await f.service.add({ ...request, mangaId: '13' })
    await new Promise(resolve => setImmediate(resolve)); await f.service.stop()
    assert.equal(f.rows.get(second.id)!.status, 'pending')
    await assert.rejects(f.service.add(request), /关闭/)
    release(); assert.equal(f.rows.get(second.id)!.status, 'pending')
  } finally { await f.service.stop(); await rm(f.root, { recursive: true, force: true }) }
})
