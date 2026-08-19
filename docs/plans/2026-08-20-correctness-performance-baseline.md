# Correctness Protection and Performance Baseline Implementation Plan

> **For implementation:** Execute tasks in order, one task at a time, following the test-driven-development skill; keep the checkbox (- [ ]) list updated, and verify each task before moving on.

**Goal:** Freeze the proven page-order and image-descramble behavior, add privacy-safe timing probes, and record a repeatable baseline before changing UI or performance paths.

**Architecture:** Production descramble math remains untouched. Test-only source fingerprints and behavior vectors guard the two existing Canvas implementations and page ordering. A shared span recorder instruments the current content, image, local-file, database, and reader paths; logs contain operation, phase, duration, outcome, cache state, counts, and byte sizes only.

**Tech Stack:** TypeScript 5.6, Node assert, tsx, Electron 43, React 18, Node crypto, PowerShell 7.

## Global Constraints

- Keep Electron 43, React 18, Fluent UI v9, existing IPC contracts, and both Chromium Canvas descramble implementations.
- Do not change md5(String(aid) + filename), thresholds 268850/421926, strip geometry, remainder placement, page_arr order, result-index assignment, or four-digit download numbering.
- Do not add dependencies, edit package.json, contact the site, or log URLs, titles, cookies, image bytes, or file paths.
- Every engineering change follows red-green TDD and ends with real test output.
- Commit only the files named by the current task; preserve unrelated worktree changes.
- This plan is phase 1 only. WinUI visuals, local/storage optimization, image streaming, and direct content API each get a later independent plan.

---

## File Map

Created:

- src/main/__tests__/helpers/descrambleContract.ts — test-only reference math and source-region hashing.
- src/main/__tests__/imageCorrectnessContract.test.ts — descramble and page-order tripwires.
- src/shared/performanceTraceCore.ts — environment-neutral spans and bounded buffer.
- src/main/performanceTrace.ts — main-process logging sink.
- src/main/__tests__/performanceTraceCore.test.ts — deterministic timing tests.
- src/main/__tests__/performanceInstrumentation.test.ts — required-path instrumentation coverage.
- scripts/summarize-performance.mjs — p50/p95/max log summarizer.
- docs/benchmarks/2026-08-20-current-baseline.md — measured baseline, created only after real runs.

Modified:

- src/main/scraperWindow.ts — hidden-browser navigation timing.
- src/main/contentApi.ts — chapter first-batch/completion timing.
- src/main/imageProtocol.ts — online cache/first-byte/completion timing.
- src/main/localImageProtocol.ts — local image timing.
- src/main/database.ts — full export/write timing.
- src/renderer/src/pages/ReaderPage.tsx — decode/display timing outside protected math.

---

### Task 1: Freeze descramble and page-order contracts

**Files:**

- Create: src/main/__tests__/helpers/descrambleContract.ts
- Create: src/main/__tests__/imageCorrectnessContract.test.ts
- Read only: src/main/imageDescrambler.ts
- Read only: src/renderer/src/pages/ReaderPage.tsx
- Read only: src/main/scraperWindow.ts
- Read only: src/main/imageLoader.ts
- Read only: src/main/downloadManager.ts

**Interfaces:**

- Produces calculateStripCount(scrambleId, aid, filename), buildSourceRowOrder(height, stripCount), and sourceRegionSha256(path, startMarker, endMarker?).
- These helpers are test-only and must never be imported by production code.

- [ ] **Step 1: Write the failing test**

Create imageCorrectnessContract.test.ts with the project’s existing hand-written test helper and these assertions:

~~~ts
assert.strictEqual(
  sourceRegionSha256(
    resolve(process.cwd(), 'src/renderer/src/pages/ReaderPage.tsx'),
    '// ─── 图片反打乱',
    'export default function ReaderPage'
  ),
  '45bbee055f93ec0c826819242d3cab7f1afe52004b5078267322debf69c9c6e6'
)
assert.strictEqual(
  sourceRegionSha256(
    resolve(process.cwd(), 'src/main/imageDescrambler.ts'),
    'function buildDescrambleHtml'
  ),
  '35f398faa0723664e9ccfe6692f06e0aac7e8e0b61f89bc31c7bfa8cf091df52'
)

assert.deepStrictEqual([
  calculateStripCount(0, 500000, '00001'),
  calculateStripCount(600000, 500000, '00001'),
  calculateStripCount(200000, 267000, '00001'),
  calculateStripCount(200000, 300000, '00001'),
  calculateStripCount(200000, 421925, '00012'),
  calculateStripCount(200000, 421926, '00012'),
  calculateStripCount(200000, 900000, '00007')
], [0, 0, 10, 16, 6, 8, 12])

assert.deepStrictEqual(
  buildSourceRowOrder(12, 4),
  [9, 10, 11, 6, 7, 8, 3, 4, 5, 0, 1, 2]
)
assert.deepStrictEqual(
  buildSourceRowOrder(11, 4),
  [6, 7, 8, 9, 10, 4, 5, 2, 3, 0, 1]
)

const scraper = readFileSync('src/main/scraperWindow.ts', 'utf-8')
assert.match(scraper, /page_arr\.forEach\(function\(f, i\)/)
assert.match(scraper, /pages\.push\(\{ index: i, imageUrl: url \}\)/)

const loader = readFileSync('src/main/imageLoader.ts', 'utf-8')
assert.match(loader, /const results: ImageResult\[\] = new Array\(urls\.length\)/)
assert.match(loader, /results\[index\] = \{ url, localPath: filepath, cached: false \}/)

const downloads = readFileSync('src/main/downloadManager.ts', 'utf-8')
assert.match(downloads, /const pageIndex = missingIndices\[k\]/)
assert.match(downloads, /String\(pageIndex \+ 1\)\.padStart\(4, '0'\)/)
~~~

- [ ] **Step 2: Run red**

Run:

~~~powershell
npx tsx src/main/__tests__/imageCorrectnessContract.test.ts
~~~

Expected: non-zero exit because ./helpers/descrambleContract does not exist.

- [ ] **Step 3: Implement the test-only helper**

Create descrambleContract.ts:

~~~ts
import { createHash } from 'crypto'
import { readFileSync } from 'fs'

export function calculateStripCount(
  scrambleId: number,
  aid: number,
  filename: string
): number {
  if (scrambleId === 0 || aid < scrambleId) return 0
  if (aid < 268850) return 10
  const modulo = aid < 421926 ? 10 : 8
  const hash = createHash('md5').update(String(aid) + filename).digest('hex')
  return (hash.charCodeAt(hash.length - 1) % modulo) * 2 + 2
}

export function buildSourceRowOrder(height: number, count: number): number[] {
  const output = new Array<number>(height)
  const base = Math.floor(height / count)
  const remainder = height % count
  for (let g = 0; g < count; g++) {
    let stripHeight = base
    let destinationY = base * g
    const sourceY = height - base * (g + 1) - remainder
    if (g === 0) stripHeight += remainder
    else destinationY += remainder
    for (let row = 0; row < stripHeight; row++) {
      output[destinationY + row] = sourceY + row
    }
  }
  return output
}

export function sourceRegionSha256(
  path: string,
  startMarker: string,
  endMarker?: string
): string {
  const source = readFileSync(path, 'utf-8').replace(/\r\n/g, '\n')
  const start = source.indexOf(startMarker)
  if (start < 0) throw new Error('missing start marker: ' + startMarker)
  const end = endMarker ? source.indexOf(endMarker, start) : source.length
  if (end < 0) throw new Error('missing end marker: ' + endMarker)
  return createHash('sha256').update(source.slice(start, end)).digest('hex')
}
~~~

- [ ] **Step 4: Run green and existing order tests**

~~~powershell
npx tsx src/main/__tests__/imageCorrectnessContract.test.ts
npx tsx src/main/__tests__/downloadCore.test.ts
~~~

Expected: all assertions report PASS and both commands exit 0. Never “fix” a pre-existing fingerprint mismatch by updating the hash; inspect the diff first.

- [ ] **Step 5: Commit**

~~~powershell
git add src/main/__tests__/helpers/descrambleContract.ts src/main/__tests__/imageCorrectnessContract.test.ts
git commit -m "test: 锁定图片顺序与反打乱契约"
~~~

---

### Task 2: Add deterministic performance spans

**Files:**

- Create: src/shared/performanceTraceCore.ts
- Create: src/main/performanceTrace.ts
- Create: src/main/__tests__/performanceTraceCore.test.ts

**Interfaces:**

- Produces startPerfSpan(name, metadata, now, sink): PerfSpan.
- PerfSpan exposes mark(phase, metadata?) and idempotent finish(outcome?, metadata?).
- Produces createPerfEventBuffer(capacity) and formatPerfEvent(event).
- Main wrapper produces beginMainPerfSpan(name, metadata).

- [ ] **Step 1: Write failing deterministic-clock tests**

Cover these exact cases:

~~~ts
const times = [100, 125, 160]
const events: PerfEvent[] = []
const span = startPerfSpan(
  'image.online',
  { source: 'network' },
  () => times.shift()!,
  (event) => events.push(event)
)
span.mark('first-byte', { bytes: 1024 })
span.finish('ok', { bytes: 4096 })

assert.deepStrictEqual(events.map((e) => e.elapsedMs), [25, 60])
assert.strictEqual(events[0].phase, 'first-byte')
assert.strictEqual(events[1].outcome, 'ok')

const buffer = createPerfEventBuffer(2)
buffer.push({ name: 'x', phase: 'finish', elapsedMs: 1, outcome: 'ok', metadata: {} })
buffer.push({ name: 'x', phase: 'finish', elapsedMs: 2, outcome: 'ok', metadata: {} })
buffer.push({ name: 'x', phase: 'finish', elapsedMs: 3, outcome: 'ok', metadata: {} })
assert.deepStrictEqual(buffer.list().map((e) => e.elapsedMs), [2, 3])
assert.deepStrictEqual(
  JSON.parse(formatPerfEvent(events[1]).slice('[perf] '.length)),
  events[1]
)
~~~

Also assert that calling finish twice emits once and returns the same event object.

- [ ] **Step 2: Run red**

~~~powershell
npx tsx src/main/__tests__/performanceTraceCore.test.ts
~~~

Expected: module-not-found for src/shared/performanceTraceCore.ts.

- [ ] **Step 3: Implement the shared core**

Use these exact public types and behavior:

~~~ts
export type PerfValue = string | number | boolean
export type PerfMetadata = Record<string, PerfValue>
export type PerfOutcome = 'ok' | 'error' | 'cancelled' | 'timeout'

export interface PerfEvent {
  name: string
  phase: string
  elapsedMs: number
  outcome?: PerfOutcome
  metadata: PerfMetadata
}

export interface PerfSpan {
  mark(phase: string, metadata?: PerfMetadata): PerfEvent
  finish(outcome?: PerfOutcome, metadata?: PerfMetadata): PerfEvent
}
~~~

startPerfSpan records startedAt once, rounds elapsed milliseconds to two decimals, merges base and per-event metadata, sends every mark to sink, and sends only the first finish. createPerfEventBuffer rejects non-positive capacities, keeps only the newest N events, returns defensive copies from list(), and clears in place. formatPerfEvent returns one line beginning “[perf] ” followed by JSON.

Create src/main/performanceTrace.ts:

~~~ts
import {
  createPerfEventBuffer,
  formatPerfEvent,
  startPerfSpan,
  type PerfMetadata,
  type PerfSpan
} from '../shared/performanceTraceCore'

const events = createPerfEventBuffer(500)

export function beginMainPerfSpan(
  name: string,
  metadata: PerfMetadata = {}
): PerfSpan {
  return startPerfSpan(name, metadata, undefined, (event) => {
    events.push(event)
    console.info(formatPerfEvent(event))
  })
}

export const listMainPerfEvents = (): ReturnType<typeof events.list> => events.list()
export const clearMainPerfEvents = (): void => events.clear()
~~~

- [ ] **Step 4: Run green and build**

~~~powershell
npx tsx src/main/__tests__/performanceTraceCore.test.ts
npm run build
~~~

Expected: every test passes and all three production bundles build with exit 0.

- [ ] **Step 5: Commit**

~~~powershell
git add src/shared/performanceTraceCore.ts src/main/performanceTrace.ts src/main/__tests__/performanceTraceCore.test.ts
git commit -m "feat: 添加本地性能计时器"
~~~

---

### Task 3: Instrument current main-process bottlenecks

**Files:**

- Create: src/main/__tests__/performanceInstrumentation.test.ts
- Modify: src/main/scraperWindow.ts:101
- Modify: src/main/contentApi.ts:142
- Modify: src/main/imageProtocol.ts:94
- Modify: src/main/localImageProtocol.ts:55
- Modify: src/main/database.ts:173

**Interfaces:**

- Consumes beginMainPerfSpan.
- Produces stable names scraper.navigate, content.pages, image.online, image.local, and database.save.

- [ ] **Step 1: Write the failing coverage test**

Read each source and assert it includes the corresponding marker:

~~~ts
const required: Array<[string, string]> = [
  ['src/main/scraperWindow.ts', "beginMainPerfSpan('scraper.navigate'"],
  ['src/main/contentApi.ts', "beginMainPerfSpan('content.pages'"],
  ['src/main/imageProtocol.ts', "beginMainPerfSpan('image.online'"],
  ['src/main/localImageProtocol.ts', "beginMainPerfSpan('image.local'"],
  ['src/main/database.ts', "beginMainPerfSpan('database.save'"]
]
for (const [path, marker] of required) {
  test(path + ' records ' + marker, () => {
    assert.ok(readFileSync(path, 'utf-8').includes(marker))
  })
}
~~~

- [ ] **Step 2: Run red**

~~~powershell
npx tsx src/main/__tests__/performanceInstrumentation.test.ts
~~~

Expected: five FAIL lines.

- [ ] **Step 3: Add exact probe semantics**

Import beginMainPerfSpan from ./performanceTrace in all five files, then implement:

- navigateAndWait starts scraper.navigate with waitMs. Finish timeout in the 15-second timeout; ok after post-load wait; ok with redirected:true for ERR_ABORTED; error before all other rejects.
- content:pages:stream starts content.pages without chapterUrl metadata. First non-empty callback marks first-batch with count. Final outcome is ok, cancelled, or error with count and boolean scramble.
- jmimg starts image.online without URL metadata. Cache hit finishes cache:true and bytes. First network data chunk marks first-byte once. Successful end finishes cache:false and bytes. Every error finishes error before resolving.
- jmlocal starts image.local without path metadata. Success finishes bytes. Unsafe paths and exceptions finish error.
- saveDatabase starts database.save. Success finishes bytes after writeFileSync. Catch finishes error and rethrows.

The span finish is idempotent, so competing Electron callback branches cannot double-log.

- [ ] **Step 4: Verify instrumentation, correctness, all tests, and build**

~~~powershell
npx tsx src/main/__tests__/performanceInstrumentation.test.ts
npx tsx src/main/__tests__/imageCorrectnessContract.test.ts
Get-ChildItem src/main/__tests__/*.test.ts | ForEach-Object {
  npx tsx $_.FullName
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
npm run build
~~~

Expected: five instrumentation PASS lines, unchanged correctness fingerprints, the full suite exits 0, and build exits 0.

- [ ] **Step 5: Commit**

~~~powershell
git add src/main/__tests__/performanceInstrumentation.test.ts src/main/scraperWindow.ts src/main/contentApi.ts src/main/imageProtocol.ts src/main/localImageProtocol.ts src/main/database.ts
git commit -m "perf: 记录现有主进程耗时"
~~~

---

### Task 4: Measure reader decode/display outside the math

**Files:**

- Modify: src/renderer/src/pages/ReaderPage.tsx:314
- Modify: src/main/__tests__/performanceInstrumentation.test.ts
- Modify: src/main/__tests__/imageCorrectnessContract.test.ts only to narrow the guarded end marker before timing statements.

**Interfaces:**

- Consumes startPerfSpan and formatPerfEvent.
- Produces reader.image events: decoded mark, then finish with source local/online, scrambled boolean, width, and height.

- [ ] **Step 1: Add a failing coverage assertion**

~~~ts
test('ReaderPage records reader.image', () => {
  const text = readFileSync('src/renderer/src/pages/ReaderPage.tsx', 'utf-8')
  assert.ok(text.includes("startPerfSpan('reader.image'"))
})
~~~

- [ ] **Step 2: Run red and prove the math guard is green first**

~~~powershell
npx tsx src/main/__tests__/performanceInstrumentation.test.ts
npx tsx src/main/__tests__/imageCorrectnessContract.test.ts
~~~

Expected: only reader.image coverage fails; correctness passes.

- [ ] **Step 3: Add timing around the existing component**

Import from ../../../shared/performanceTraceCore. In DescrambledImage create a PerfSpan ref. On src/imageUrl change start reader.image with only source local/online; cleanup finishes cancelled. In handleLoad:

- mark decoded immediately after reading naturalWidth/naturalHeight;
- in c === 0, finish ok with scrambled:false before returning;
- after the existing Canvas draw loop and setLoaded(true), finish ok with scrambled:true.

Place comment // DESCRAMBLE MATH END immediately after the unchanged drawImage loop and before the existing “隐藏原图，显示 canvas” comment. Change the reader fingerprint end marker to // DESCRAMBLE MATH END and its expected SHA-256 to 0b086eed73d72ba09e193fcf197e51fc15353eae585d40a7c79079e76e691ad3. This hash is the current normalized-LF source slice from “图片反打乱” through the end of the draw loop, excluding the new marker. Do not change the MD5 implementation, getNum, c, s, r, f, g, stripH, dstY, srcY, or drawImage line.

- [ ] **Step 4: Verify and inspect the exact diff**

~~~powershell
npx tsx src/main/__tests__/performanceInstrumentation.test.ts
npx tsx src/main/__tests__/imageCorrectnessContract.test.ts
npm run build
git diff --word-diff=porcelain -- src/renderer/src/pages/ReaderPage.tsx
~~~

Expected: tests/build pass; diff contains imports, span lifecycle, mark/finish calls, and one marker only. Mathematical lines are byte-for-byte unchanged.

- [ ] **Step 5: Commit**

~~~powershell
git add src/renderer/src/pages/ReaderPage.tsx src/main/__tests__/imageCorrectnessContract.test.ts src/main/__tests__/performanceInstrumentation.test.ts
git commit -m "perf: 记录阅读器图片阶段耗时"
~~~

---

### Task 5: Summarize logs and record the baseline

**Files:**

- Create: scripts/summarize-performance.mjs
- Create with real measurements: docs/benchmarks/2026-08-20-current-baseline.md
- Disposable and never committed: work/performance-baseline.log

**Interfaces:**

- Consumes lines containing “[perf] {json}”.
- Produces JSON keyed by name.phase with count, p50, p95, and max.

- [ ] **Step 1: Write a three-line fixture and verify the script is missing**

Use apply_patch to create work/performance-baseline.log containing elapsed values 10, 20, and 30 for image.online.finish. Run:

~~~powershell
node scripts/summarize-performance.mjs work/performance-baseline.log
~~~

Expected: module/file-not-found.

- [ ] **Step 2: Implement the summarizer**

~~~js
import { readFile } from 'node:fs/promises'

const path = process.argv[2]
if (!path) throw new Error('usage: node scripts/summarize-performance.mjs <log>')
const groups = new Map()
for (const line of (await readFile(path, 'utf-8')).split(/\r?\n/)) {
  const at = line.indexOf('[perf] ')
  if (at < 0) continue
  const event = JSON.parse(line.slice(at + 7))
  if (typeof event.elapsedMs !== 'number') continue
  const key = event.name + '.' + event.phase
  const values = groups.get(key) || []
  values.push(event.elapsedMs)
  groups.set(key, values)
}
const pick = (values, fraction) =>
  values[Math.max(0, Math.ceil(values.length * fraction) - 1)]
const summary = {}
for (const [key, values] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
  values.sort((a, b) => a - b)
  summary[key] = {
    count: values.length,
    p50: pick(values, 0.5),
    p95: pick(values, 0.95),
    max: values.at(-1)
  }
}
console.log(JSON.stringify(summary, null, 2))
~~~

- [ ] **Step 3: Run green**

~~~powershell
node scripts/summarize-performance.mjs work/performance-baseline.log
~~~

Expected for image.online.finish: count 3, p50 20, p95 30, max 30.

- [ ] **Step 4: Capture the fixed benchmark matrix**

~~~powershell
npm run dev 2>&1 | Tee-Object -LiteralPath work/performance-baseline.log
~~~

Using the same online chapter and same local chapter, record:

1. Ten cold online opens after clearing only the application image cache through Settings.
2. Ten warm online reopens without clearing cache.
3. Ten local chapter opens.
4. Ten samples of 20 page changes followed by a 3-second wait.
5. Ten continuous 15-second scroll samples.

Copy reader “[perf]” console lines from DevTools into the same disposable log. Stop the server with Ctrl+C.

- [ ] **Step 5: Generate and write the real report**

~~~powershell
node scripts/summarize-performance.mjs work/performance-baseline.log
~~~

Create docs/benchmarks/2026-08-20-current-baseline.md with apply_patch using the emitted numbers. It must include CPU, RAM, storage type, commit, Electron version, network type, sample matrix, every count/p50/p95/max, observed freezes, and a ranked bottleneck list. No required cell may be blank or non-numeric; rerun missing samples instead.

- [ ] **Step 6: Final verification**

~~~powershell
Get-ChildItem src/main/__tests__/*.test.ts | ForEach-Object {
  npx tsx $_.FullName
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
npm run build
git diff --check
git status --short
~~~

Expected: full suite and build pass; diff check has no output; status contains only intended files. work/performance-baseline.log remains untracked and is not staged.

- [ ] **Step 7: Commit**

~~~powershell
git add scripts/summarize-performance.mjs docs/benchmarks/2026-08-20-current-baseline.md
git commit -m "docs: 记录界面与数据链路性能基线"
~~~

---

## Completion Gate

Phase 1 is complete only when correctness/order assertions pass, all six runtime paths emit privacy-safe events, ten cold/warm/local samples exist, the report contains real numbers, the full unit suite and production build pass in the same turn, and no UI/network/storage optimization has started.

After this gate, write four plans in order:

1. winui-fluent-visual-refresh;
2. local-storage-fast-path;
3. image-streaming-cache;
4. direct-content-gateway.

The baseline may reorder plans 2–4. Every later plan must run imageCorrectnessContract.test.ts before and after implementation.
