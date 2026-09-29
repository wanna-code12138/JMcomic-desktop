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

test('workspace tab limit prevents an unsaveable session and allows closing before trying again', async () => {
  reset()
  useAppStore.setState({ readerTabs: Array.from({ length: 100 }, (_, i) => ({ id: `start:${i}`, kind: 'start', pinned: false })), activeReaderId: 'start:99' })
  assert.equal(await state().newReaderTab(), false)
  assert.equal(state().readerTabs.length, 100)
  assert.match(state().readerTransitionError, /100/)
  await state().closeReader('start:99')
  assert.equal(await state().newReaderTab(), true)
  assert.equal(state().readerTabs.length, 100)
})

test('hiding the reader preserves tabs and the active session; opening the same book reveals it without reloading', async () => {
  reset()
  assert.equal(state().readerVisible, false)
  await state().openReader(book('1'))
  await state().openReader(book('2'))
  const tabs = state().readerTabs, active = state().activeReaderId
  let saves = 0
  const off = state().registerReaderSession(active, async () => { saves++; return { pageIndex: 7, pageOffset: 0.4 } })
  try {
    state().setReaderExpanded(true)
    state().setReaderVisible(false)
    assert.equal(state().readerVisible, false)
    assert.equal(state().readerExpanded, false, 'hiding the side pane restores browsing')
    assert.equal(state().readerTabs, tabs, 'visibility must not replace book state or remount the session')
    assert.equal(state().activeReaderId, active)
    assert.equal(state().currentPage, 'detail')
    assert.equal(saves, 0, 'hiding keeps the active session alive')
    await state().openReader(book('2'))
    assert.equal(state().readerVisible, true)
    assert.equal(state().readerTabs, tabs)
    assert.equal(saves, 0, 'showing the same chapter must not trigger a save-and-reload transition')
    state().setReaderVisible(false)
    await state().activateReader(active)
    assert.equal(state().readerVisible, true)
    state().setReaderVisible(false)
    await state().closeReader('online:1')
    assert.equal(state().readerVisible, false, 'closing a background tab must not reveal a hidden side pane')
    assert.equal(state().activeReaderId, active)
    assert.equal(state().readerTabs[0].reader, tabs[1].reader)
    await state().closeReader(active)
    assert.equal(state().readerVisible, false)
    assert.equal(saves, 1, 'closing the final tab still saves reading progress')
    state().setReaderVisible(true)
    assert.equal(state().readerVisible, false, 'an empty side pane must not hide the browsing area')
  } finally { off() }
})

test('manual tools keep the user choice across chapters, books and side-pane visibility', async () => {
  reset()
  assert.equal(state().readerToolsVisible, false, 'reading starts without an extra toolbar')
  await state().openReader(book('1'))
  state().setReaderToolsVisible(true)
  await state().openReader(book('1', 1))
  await state().openReader(book('2'))
  state().setReaderVisible(false)
  state().setReaderVisible(true)
  assert.equal(state().readerToolsVisible, true)
  state().setReaderToolsVisible(false)
  await state().activateReader('online:1')
  assert.equal(state().readerToolsVisible, false)
})

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

test('new tabs are independent start pages and a book replaces the active start page', async () => {
  reset()
  assert.equal(typeof state().newReaderTab, 'function', 'the workspace needs a new-tab action')
  await state().newReaderTab()
  const first = state().activeReaderId
  await state().newReaderTab()
  const second = state().activeReaderId
  assert.notEqual(first, second)
  assert.equal(state().readerTabs.length, 2)
  assert.ok(state().readerTabs.every((tab: any) => tab.kind === 'start' && !tab.reader))
  await state().openReader(book('1'))
  assert.equal(state().activeReaderId, second)
  assert.equal(state().readerTabs.length, 2)
  assert.equal(state().readerTabs[1].reader.mangaId, '1')
  await state().activateReader(first)
  await state().openReader(book('1'))
  assert.equal(state().activeReaderId, second, 'existing books win over the empty target')
  assert.equal(state().readerTabs.length, 2)
})

test('tab metadata and reorder do not save, replace the reader object, or lose concurrent updates', async () => {
  reset()
  await state().openReader(book('1'))
  await state().openReader(book('2'))
  const reader = state().readerTabs[1].reader
  let saves = 0
  let release!: () => void
  const gate = new Promise<void>(done => { release = done })
  const off = state().registerReaderSession('online:2', async () => { saves++; await gate; return { pageIndex: 8, pageOffset: 0.25 } })
  try {
    assert.equal(typeof state().renameReaderTab, 'function')
    await state().renameReaderTab('online:2', ' My book ')
    await state().pinReaderTab('online:2', true)
    assert.equal(saves, 0)
    assert.equal(state().readerTabs[0].reader, reader)
    assert.equal(state().readerTabs[0].customTitle, 'My book')
    const switching = state().activateReader('online:1')
    const rename = state().renameReaderTab('online:2', 'Kept after saving')
    const reorder = state().moveReaderTab('online:1', 0)
    release()
    await Promise.all([switching, rename, reorder])
    assert.equal(saves, 1)
    assert.equal(state().readerTabs[0].id, 'online:2', 'unpinned items cannot cross into the pinned partition')
    assert.equal(state().readerTabs[0].customTitle, 'Kept after saving')
    assert.equal(state().readerTabs[0].reader.resumePageIndex, 8)
    await state().openReader(book('2', 1))
    assert.equal(state().readerTabs[0].pinned, true)
    assert.equal(state().readerTabs[0].customTitle, 'Kept after saving')
  } finally { release(); off() }
})

test('batch close protects pinned tabs and undo restores the saved anchor without duplication', async () => {
  reset()
  for (const id of ['1', '2', '3']) await state().openReader(book(id))
  assert.equal(typeof state().closeReaderTabs, 'function')
  await state().pinReaderTab('online:1', true)
  const off = state().registerReaderSession('online:3', async () => ({ pageIndex: 9, pageOffset: 0.3 }))
  try {
    await state().closeReaderTabs('others', 'online:2')
    assert.deepEqual(state().readerTabs.map((tab: any) => tab.id), ['online:1', 'online:2'])
    assert.equal(state().closedReaderTabs.length, 1)
    await state().reopenReaderTab()
    assert.equal(state().activeReaderId, 'online:3')
    assert.equal(state().readerTabs[2].reader.resumePageIndex, 9)
    await state().closeReader('online:3')
    await state().openReader(book('3'))
    await state().reopenReaderTab()
    assert.equal(state().readerTabs.length, 3)
    assert.equal(state().closedReaderTabs.length, 0)
  } finally { off() }
})

test('failed closing does not alter the closed stack and the stack is bounded', async () => {
  reset()
  await state().openReader(book('1'))
  const off = state().registerReaderSession('online:1', async () => { throw Error('disk full') })
  assert.equal(await state().closeReader('online:1'), false)
  assert.deepEqual(state().closedReaderTabs, [])
  off()
  for (let i = 0; i < 24; i++) {
    await state().newReaderTab()
    await state().closeReader()
  }
  assert.equal(state().closedReaderTabs.length, 20)
})

test('hiding undoes automatic navigation collapse but preserves explicit user choices', async () => {
  reset()
  await state().openReader(book('1'))
  state().setReaderVisible(false)
  assert.equal(state().readerSidebarCollapsed, false, 'automatic collapse is temporary')
  state().setReaderVisible(true)
  assert.equal(state().readerSidebarCollapsed, true)
  state().setReaderSidebarCollapsed(false)
  state().setReaderVisible(false)
  state().setReaderVisible(true)
  assert.equal(state().readerSidebarCollapsed, false, 'manual expansion takes precedence')
  state().setReaderSidebarCollapsed(true)
  await state().closeReader()
  assert.equal(state().readerSidebarCollapsed, true, 'final close preserves a manual compact navigation')
})

test('optional workspace persistence saves the final anchor without remounting and propagates disk failure', async () => {
  reset()
  assert.equal(typeof state().registerWorkspacePersistence, 'function')
  await state().openReader(book('1'))
  const original = state().readerTabs[0].reader
  const off = state().registerReaderSession('online:1', async () => ({ pageIndex: 12, pageOffset: 0.6 }))
  let saved: any, fail = false
  const unbind = state().registerWorkspacePersistence(async (snapshot: any) => { if (fail) throw Error('disk full'); saved = snapshot })
  try {
    await state().flushReaderWorkspace()
    assert.equal(saved.tabs[0].reader.resumePageIndex, 12)
    assert.equal(state().readerTabs[0].reader, original)
    state().cancelReaderClose(); fail = true
    await assert.rejects(state().flushReaderWorkspace())
    assert.equal(state().readerClosing, false)
  } finally { off(); unbind() }
})
