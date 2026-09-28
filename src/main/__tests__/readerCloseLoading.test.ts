import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadModule } from './helpers/loadModule'
import * as contracts from '../../shared/readerContracts'

for (const leaving of [true, false]) test(leaving
  ? 'late chapter metadata cannot write history after close acknowledgement; cancelled close can reload'
  : 'saving in place keeps a retained chapter loading after close failure', async () => {
  const effects: Array<() => (() => void) | void> = [], writes: unknown[] = []
  let release!: (value: unknown) => void, retryRequests = 0
  const pending = new Promise(done => { release = done })
  let states = 0
  const react = {
    useState: (value: unknown) => { const index = states++; return [value, () => { if (index === 5) retryRequests++ }] },
    useRef: (current: unknown) => ({ current }), useCallback: (fn: unknown) => fn,
    useEffect: (fn: () => void) => effects.push(fn)
  }
  const originalWindow = globalThis.window, originalDocument = globalThis.document
  Object.assign(globalThis, { window: { addEventListener() {}, removeEventListener() {}, electronAPI: {
    contentPages: () => pending, settingsGet: async () => ({}), historyGetLocal: async () => null,
    historyUpsert: async (value: unknown) => { writes.push(value) }, historyUpsertPage: async () => {}, settingsSet: async () => {}
  } }, document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} } })
  try {
    const { useReaderSession } = loadModule<any>('src/renderer/src/reader/useReaderSession.ts', { react,
      '../../../shared/readerContracts': contracts,
      '../performance/rendererMetrics': { recordRendererSpan: () => ({ finish() {} }) }
    })
    const session = useReaderSession({ mangaId: '1', mangaTitle: 'Book', mangaCoverUrl: '', chapterIndex: 0,
      chapterTitle: 'One', chapterUrl: '/photo/1', chapters: [{ index: 0, title: 'One', url: '/photo/1' }] })
    const cleanup = effects.map(effect => effect())
    await session.prepareToLeave(leaving)
    release({ ok: true, data: [{ index: 0, imageUrl: 'https://example.test/1.png' }], scrambleId: 0 })
    await new Promise(done => setImmediate(done))
    assert.equal(writes.length, leaving ? 0 : 1, leaving
      ? 'a late load must not start a history write after renderer close acknowledgement'
      : 'in-place saving must allow the retained chapter to finish loading')
    if (leaving) {
      session.resumeAfterClose()
      assert.equal(retryRequests, 1, 'failed close must restart an interrupted load')
    }
    cleanup.forEach(off => off?.())
  } finally { Object.assign(globalThis, { window: originalWindow, document: originalDocument }) }
})

test('failed tab save restarts metadata that was discarded while preparing to leave', async () => {
  const effects: Array<() => (() => void) | void> = [], values: any[] = []
  let releasePages!: (value: unknown) => void, rejectSave!: (error: Error) => void
  const pages = new Promise(done => { releasePages = done })
  const preferences = new Promise((_done, reject) => { rejectSave = reject })
  const react = {
    useState: (value: any) => {
      const index = values.push(value) - 1
      return [value, (next: any) => { values[index] = typeof next === 'function' ? next(values[index]) : next }]
    },
    useRef: (current: unknown) => ({ current }), useCallback: (fn: unknown) => fn,
    useEffect: (fn: () => void) => effects.push(fn)
  }
  const originalWindow = globalThis.window, originalDocument = globalThis.document
  Object.assign(globalThis, { window: { addEventListener() {}, removeEventListener() {}, electronAPI: {
    contentPages: () => pages, settingsGet: async () => ({}), historyGetLocal: async () => null,
    historyUpsert: async () => {}, historyUpsertPage: async () => {}, settingsSet: () => preferences
  } }, document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} } })
  try {
    const { useReaderSession } = loadModule<any>('src/renderer/src/reader/useReaderSession.ts', { react,
      '../../../shared/readerContracts': contracts,
      '../performance/rendererMetrics': { recordRendererSpan: () => ({ finish() {} }) }
    })
    const session = useReaderSession({ mangaId: '1', mangaTitle: 'Book', mangaCoverUrl: '', chapterIndex: 0,
      chapterTitle: 'One', chapterUrl: '/photo/1', chapters: [{ index: 0, title: 'One', url: '/photo/1' }] })
    const cleanup = effects.map(effect => effect())
    session.changePreferences({ readerZoom: 1.1 })
    const leaving = session.prepareToLeave()
    releasePages({ ok: true, data: [{ index: 0, imageUrl: 'https://example.test/1.png' }] })
    await new Promise(done => setImmediate(done))
    rejectSave(new Error('disk full'))
    await assert.rejects(leaving, /disk full/)
    assert.equal(values[0].length, 0, 'the suspended result cannot become the active chapter')
    assert.equal(values[5], 1, 'a retained tab must restart loading after its save fails')
    cleanup.forEach(off => off?.())
  } finally { Object.assign(globalThis, { window: originalWindow, document: originalDocument }) }
})
