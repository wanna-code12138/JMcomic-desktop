import assert from 'node:assert/strict'
import { test } from 'node:test'
import { useAppStore } from '../../renderer/src/stores/appStore'
import type { ReaderState } from '../../shared/readerContracts'

const initial = useAppStore.getState()
const state = (): any => useAppStore.getState()
const book = (mangaId: string, chapterIndex = 0, local = false): ReaderState => ({
  mangaId, mangaTitle: `Book ${mangaId}`, mangaCoverUrl: '', chapterIndex,
  chapterTitle: `Chapter ${chapterIndex}`, chapterUrl: `/photo/${mangaId}-${chapterIndex}`, local
})
const reset = () => useAppStore.setState({ ...initial, currentPage: 'detail', currentMangaId: '1' })

test('reading keeps browsing independent and reuses a book tab without resetting its chapter', async () => {
  reset()
  await state().openReader(book('1'))
  assert.equal(state().currentPage, 'detail', 'opening a reader must not replace the central detail route')
  const id = state().activeReaderId
  assert.equal(state().readerSidebarCollapsed, true)
  await state().openReader(book('1'))
  assert.equal(state().readerTabs.length, 1)
  assert.equal(state().activeReaderId, id)
  await state().openReader(book('1', 1))
  assert.equal(state().readerTabs.length, 1)
  assert.equal(state().readerTabs[0].reader.chapterIndex, 1)
  state().setCurrentPage('search')
  assert.equal(state().activeReaderId, id)
  assert.equal(state().readerTabs.length, 1)
  await state().openReader(book('1', 1, true))
  assert.equal(state().readerTabs.length, 2, 'offline and online chapters have different sources')
})

test('switch waits for saving and restores each tab anchor; closing selects neighbor then restores navigation', async () => {
  reset()
  await state().openReader(book('1'))
  const first = state().activeReaderId
  let release!: () => void
  const gate = new Promise<void>(done => { release = done })
  const off = state().registerReaderSession(first, async () => { await gate; return { pageIndex: 7, pageOffset: 0.4 } })
  const switching = state().openReader(book('2'))
  await new Promise(done => setImmediate(done))
  assert.equal(state().activeReaderId, first, 'active content remains mounted until saving finishes')
  assert.equal(state().readerTransitionPending, true)
  release(); await switching; off()
  const second = state().activeReaderId
  assert.notEqual(second, first)
  await state().activateReader(first)
  assert.equal(state().readerTabs[0].reader.resumePageIndex, 7)
  assert.equal(state().readerTabs[0].reader.resumePageOffset, 0.4)
  state().setReaderExpanded(true)
  assert.equal(state().currentPage, 'detail')
  await state().closeReader(first)
  assert.equal(state().activeReaderId, second)
  await state().closeReader(second)
  assert.equal(state().readerTabs.length, 0)
  assert.equal(state().readerExpanded, false)
  assert.equal(state().readerSidebarCollapsed, false)
})

test('save failure holds the active tab, cancels already queued transitions and supports explicit retry', async () => {
  reset()
  await state().openReader(book('1'))
  const first = state().activeReaderId
  let fail = true, calls = 0
  const off = state().registerReaderSession(first, async () => {
    calls++
    if (fail) throw new Error('disk full')
    return { pageIndex: 4, pageOffset: 0.2 }
  })
  const attempts = await Promise.all([state().openReader(book('2')), state().openReader(book('3'))])
  assert.deepEqual(attempts, [false, false])
  assert.equal(calls, 1)
  assert.equal(state().activeReaderId, first)
  assert.equal(state().readerTabs.length, 1)
  assert.ok(state().readerTransitionError)
  assert.equal(state().readerTransitionPending, false)
  fail = false
  assert.equal(await state().retryReaderTransition(), true)
  assert.equal(state().readerTabs[1].reader.mangaId, '2')
  assert.equal(state().readerTabs[0].reader.resumePageIndex, 4)
  off()
})

test('background close and repeated activation do not save or remount the active session', async () => {
  reset()
  await state().openReader(book('1'))
  const first = state().activeReaderId
  await state().openReader(book('2'))
  const second = state().activeReaderId, reader = state().readerTabs[1].reader
  let saves = 0
  const off = state().registerReaderSession(second, async () => { saves++; return { pageIndex: 2, pageOffset: 0 } })
  await state().closeReader(first)
  await Promise.all([state().openReader(book('2')), state().activateReader(second), state().openReader(book('2'))])
  assert.equal(saves, 0)
  assert.equal(state().readerTabs[0].reader, reader)
  await state().flushReaderWorkspace()
  assert.equal(saves, 1)
  assert.equal(state().readerTabs[0].reader, reader, 'shutdown save must not reload the active reader')
  off()
})

test('a stale session cleanup cannot remove the current saver and shutdown propagates failure', async () => {
  reset()
  await state().openReader(book('1'))
  const id = state().activeReaderId
  const old = state().registerReaderSession(id, async () => ({ pageIndex: 0, pageOffset: 0 }))
  const current = state().registerReaderSession(id, async () => { throw new Error('disk full') })
  old()
  await assert.rejects(state().flushReaderWorkspace(), /保存/)
  assert.equal(state().activeReaderId, id)
  current()
})

test('shutdown freezes new tab admission until a failed close explicitly resumes the workspace', async () => {
  reset()
  await state().openReader(book('1'))
  let release!: () => void, saves = 0
  const gate = new Promise<void>(done => { release = done })
  const off = state().registerReaderSession(state().activeReaderId, async () => { saves++; await gate; return { pageIndex: 2, pageOffset: 0 } })
  const closing = state().flushReaderWorkspace()
  const lateOpen = state().openReader(book('2'))
  release(); await closing
  const opened = await lateOpen
  off()
  assert.equal(opened, false, 'no chapter may start loading after close preparation begins')
  assert.equal(saves, 1)
  assert.equal(state().readerTabs.length, 1)
  state().cancelReaderClose()
  assert.equal(await state().openReader(book('2')), true)
})

test('retrying a failed close save clears the recovered error', async () => {
  reset()
  await state().openReader(book('1'))
  const id = state().activeReaderId
  let fail = true
  const leaving: boolean[] = []
  const off = state().registerReaderSession(id, async (suspend: boolean) => { leaving.push(suspend); if (fail) throw new Error('disk full'); return { pageIndex: 0, pageOffset: 0 } })
  await assert.rejects(state().flushReaderWorkspace())
  fail = false
  await state().retryReaderTransition()
  off()
  assert.equal(state().readerTransitionError, '')
  assert.deepEqual(leaving, [true, false], 'an in-place retry must save without suspending the retained chapter')
})
