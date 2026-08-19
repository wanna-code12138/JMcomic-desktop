# Image Streaming Cache Implementation Plan

> **For implementation:** Execute tasks in order, one task at a time, following the test-driven-development skill; keep the checkbox (`- [ ]`) list updated, and verify each task before moving on.

**Goal:** Make continuous reading reliably load the first viewport and reduce duplicate/blocking image work without changing page order or descramble output.

**Architecture:** Fix the zero-size lazy-image loop at the renderer boundary, then add a tested single-flight/concurrency scheduler and asynchronous cache I/O behind `jmimg://`. Keep the current CDN URL mapping, cache key, and canvas descrambler intact.

**Tech Stack:** React 18, TanStack Virtual, Electron protocol.handle/net, Node fs/promises, existing disk cache.

## Global Constraints

- Preserve every `PageData.index`, input array order, original CDN `imageUrl`, and download filename.
- Do not modify MD5, `getNum`, strip count, row coordinates, or canvas draw order.
- Run `imageCorrectnessContract.test.ts` before and after every task.
- Cache-hit p95 must remain at or below 0.96ms; online warm chapter p95 target is below 350ms.

---

### Task 1: Break the zero-size lazy-loading loop

**Files:**
- Create: `src/main/__tests__/readerLayoutContract.test.ts`
- Modify only style/loading props: `src/renderer/src/pages/ReaderPage.tsx`

**Interfaces:**
- `DescrambledImage` props and math remain unchanged.
- Scroll-mode images receive a non-zero pre-decode layout box; single-page behavior is unchanged.

- [x] **Step 1: Write the failing layout contract**

```ts
const text = readFileSync('src/renderer/src/pages/ReaderPage.tsx', 'utf8')
assert.match(text, /width: '100%'/)
assert.match(text, /aspectRatio: 'auto 2 \/ 3'/)
assert.doesNotMatch(text, /loading="lazy"[\s\S]{0,120}scrambleId=\{scrambleId\}/)
```

- [x] **Step 2: Run red and correctness green**

Run the new test and `imageCorrectnessContract.test.ts`. Expected: only layout assertions fail.

- [x] **Step 3: Apply the minimal renderer fix**

Give `.mangaImage` `width: '100%'` and `aspectRatio: 'auto 2 / 3'`; use eager loading for the already-virtualized scroll items. Keep `estimateSize`, `measureElement`, overscan, image order, and DescrambledImage body unchanged.

- [x] **Step 4: Verify real continuous mode**

Open the same 34+ page chapter from a clean renderer. Assert the first four images reach non-zero natural size, canvas dimensions differ from 300×150, and only virtualized items mount. Run correctness and build.

- [x] **Step 5: Commit**

Commit as `fix: 修复连续阅读首屏图片加载`.

### Task 2: Add a deterministic single-flight scheduler

**Files:**
- Create: `src/main/imageRequestScheduler.ts`
- Create: `src/main/__tests__/imageRequestScheduler.test.ts`
- Modify: `src/main/imageProtocol.ts`

**Interfaces:**
- Produces `createImageRequestScheduler(maxConcurrent)` with `run<T>(key, task): Promise<T>`, `activeCount()`, and `pendingCount()`.
- Requests with the same key share one promise; different keys run FIFO with maximum concurrency 6.

- [ ] **Step 1: Write failing deterministic deferred-promise tests**

Assert same-key task invocation count is 1, eight unique tasks never exceed six active, FIFO start order is preserved, and rejection removes the in-flight key for retry.

- [ ] **Step 2: Run red**

Expected: module-not-found.

- [ ] **Step 3: Implement the scheduler and wrap cache-miss fetches**

Keep cache checks outside the scheduler. Use the decoded real URL as the key and return independent `Response` objects from shared immutable bytes/status/headers so a response body is never consumed twice.

- [ ] **Step 4: Verify**

Run scheduler tests, correctness contract, image cache tests, and build. Confirm duplicate URLs emit one network miss event.

- [ ] **Step 5: Commit**

Commit as `perf: 合并重复图片请求并限制并发`.

### Task 3: Remove synchronous cache reads/writes from the protocol hot path

**Files:**
- Modify: `src/main/imageLoader.ts`
- Modify: `src/main/imageProtocol.ts`
- Extend: `src/main/__tests__/imageCacheCore.test.ts`
- Create: `src/main/__tests__/imageCacheIoContract.test.ts`

**Interfaces:**
- Produces async `readCachedImage(url)`, `storeImage(url, bytes, contentType)`, and `scheduleCacheMaintenance()`.
- Existing download `loadImages` result ordering remains unchanged.

- [ ] **Step 1: Write failing async-I/O contract tests**

Assert the protocol source contains no `readFileSync`; assert one hundred stores schedule at most one maintenance pass until it completes; assert eviction selection stays oldest-first.

- [ ] **Step 2: Run red**

Expected: sync-I/O and maintenance coalescing assertions fail.

- [ ] **Step 3: Implement async reads, atomic writes, and coalesced maintenance**

Use `fs/promises.readFile`, write to a sibling temporary file, rename atomically, then schedule one asynchronous directory scan. Keep `urlToFilename` and eviction ordering unchanged.

- [ ] **Step 4: Verify and benchmark**

Run cache tests, correctness, all tests, and build. Repeat warm/cold matrix and compare cache hit/miss p50/p95 against the baseline.

- [ ] **Step 5: Commit**

Commit as `perf: 异步化图片缓存读写`.

### Task 4: Re-measure and enforce acceptance thresholds

**Files:**
- Modify: `docs/performance/2026-08-20-baseline.md`
- Create: `docs/performance/2026-08-20-image-fast-path.md`

**Interfaces:**
- Consumes `[perf]` logs and `scripts/summarize-performance.mjs`.

- [ ] **Step 1: Capture ten warm opens, 64+ cold image misses, and ten 15-second scroll samples**

Use the same machine and chapter-selection rule as the baseline.

- [ ] **Step 2: Record numeric comparison**

Include count, p50, p95, max, mounted-image count, peak scheduler concurrency, and observed blank frames.

- [ ] **Step 3: Full verification and commit**

Run all tests/build/diff checks; commit the report as `docs: 记录图片快速路径基准`.
