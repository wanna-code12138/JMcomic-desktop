import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { groupTasksByManga, type DownloadProgress, type DownloadTaskRow } from '../../shared/downloadContracts'

// Execute the real page's load/event callbacks; React, timers and IPC are boundary ports.
for (const pdf of [false, true]) for (const retrying of [false, true]) test(`slow ${pdf ? 'PDF' : 'image'} summary preserves ${retrying ? 'retry reset to zero' : 'newer page progress'}`, async () => {
  const a: DownloadTaskRow = { id: 1, mangaId: '42', mangaTitle: 'Book', chapterIndex: 0, chapterTitle: 'A',
    kind: pdf ? 'pdf' : 'images', status: retrying ? 'failed' : 'downloading', totalPages: 10, downloadedPages: retrying ? 8 : 3, savePath: '', createdAt: 1 }
  const b = { ...a, id: 2, chapterIndex: 1, chapterTitle: 'B', status: 'downloading', downloadedPages: 9 }
  const snapshot = (completedB = false) => groupTasksByManga([{ ...a }, { ...b, ...(completedB ? { status: 'completed', downloadedPages: 10 } : {}) }])
  let release!: (groups: ReturnType<typeof snapshot>) => void
  const delayed = new Promise<ReturnType<typeof snapshot>>(done => { release = done })
  const states: any[] = [], effects: Array<() => (() => void) | void> = [], timers = new Map<number, () => void>()
  let stateIndex = 0, timerId = 0, queries = 0, onProgress!: (value: DownloadProgress) => void
  const react = {
    useState(initial: unknown) { const index = stateIndex++; states[index] = initial; return [initial, (value: any) => { states[index] = typeof value === 'function' ? value(states[index]) : value }] },
    useRef: (current: unknown) => ({ current }), useCallback: (fn: Function) => fn,
    useEffect: (fn: () => void) => effects.push(fn), useMemo: (fn: Function) => fn(),
    createElement: (type: unknown, props: unknown, ...children: unknown[]) => ({ type, props, children })
  }
  const fluent = new Proxy({ makeStyles: () => () => ({}) } as Record<string, unknown>, { get: (target, key: string) => target[key] ?? key })
  const filename = resolve('src/renderer/src/pages/DownloadsPage.tsx'), require = createRequire(filename)
  const ports: Record<string, unknown> = { react, '@fluentui/react-components': fluent, '@fluentui/react-icons': fluent,
    '../stores/appStore': { useAppStore: () => () => {} }, '../utils/image': { toJmImg: (value: string) => value },
    '../../../shared/downloadContracts': { groupTasksByManga } }
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.React
  } }).outputText
  const module = { exports: {} as { default: () => void } }
  vm.runInNewContext(source, { module, exports: module.exports, require: (id: string) => Object.hasOwn(ports, id) ? ports[id] : require(id), console,
    window: { electronAPI: { downloadSummary: () => pdf ? Promise.resolve([]) : ++queries === 1 ? Promise.resolve(snapshot()) : delayed,
      downloadPdfList: () => !pdf ? Promise.resolve([]) : ++queries === 1 ? Promise.resolve([a,b]) : delayed.then(groups => groups.flatMap(g => g.tasks)),
      onDownloadProgress: (fn: typeof onProgress) => { onProgress = fn; return () => {} } } },
    setTimeout: (fn: () => void) => { const id = ++timerId; timers.set(id, fn); return id }, clearTimeout: (id: number) => timers.delete(id)
  }, { filename })
  module.exports.default()
  const cleanups = effects.map(effect => effect())
  const tick = () => new Promise<void>(done => setImmediate(done))
  await tick()
  const event = (task: DownloadTaskRow, status: string, downloadedPages: number): DownloadProgress => ({ ...task, taskId: task.id, status, downloadedPages })
  onProgress(event(b, 'completed', 10))
  for (const [id, fn] of [...timers]) { timers.delete(id); fn() }
  assert.equal(queries, 2, 'terminal events coalesce into one summary')
  onProgress(event(a, 'downloading', retrying ? 0 : 8))
  const displayed = () => { const records = states.find(value => Array.isArray(value) && (pdf ? value[0]?.kind === 'pdf' : value[0]?.tasks)); const task = (pdf ? records : records[0].tasks).find((item: DownloadTaskRow) => item.id === 1); return { status: task.status, pages: task.downloadedPages } }
  const before = displayed()
  release(snapshot(true)); await tick()
  assert.deepEqual(displayed(), before, 'a slow snapshot must not overwrite progress received while scanning')
  assert.deepEqual(before, { status: 'downloading', pages: retrying ? 0 : 8 })
  cleanups.forEach(cleanup => cleanup?.())
})
