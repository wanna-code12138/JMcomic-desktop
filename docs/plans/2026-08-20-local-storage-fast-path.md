# Local Storage Fast Path Implementation Plan

> **For implementation:** Execute tasks in order, one task at a time, following the test-driven-development skill; keep the checkbox (`- [ ]`) list updated, and verify each task before moving on.

**Goal:** Make downloaded-content state truthful and serve local images without a database query or synchronous full-file read per image.

**Architecture:** Add a pure availability model for download rows, cache normalized allowed roots, and stream files asynchronously through `jmlocal://`. Missing directories remain recoverable records and are never silently deleted.

**Tech Stack:** TypeScript, sql.js metadata, Electron protocol.handle, Node fs/promises, React/Fluent InfoBar.

## Global Constraints

- Never delete or overwrite missing download records automatically.
- Preserve numeric filename ordering and `PageData.index` generation in `resolveLocalChapterPages`.
- Preserve local `scrambleId: 0` and existing path-depth security checks.
- Run `imageCorrectnessContract.test.ts` before and after each task.

---

### Task 1: Model completed-but-missing downloads

**Files:**
- Modify: `src/main/downloadCore.ts`
- Modify: `src/main/__tests__/downloadCore.test.ts`
- Modify: `src/main/downloadManager.ts`

**Interfaces:**
- Produces `inspectDownloadedChapter(task): { available: boolean; pageCount: number; reason?: 'missing-root' | 'missing-chapter' | 'missing-pages' }`.
- Download list/group payloads add `available` and optional `availabilityReason`; existing fields remain.

- [x] **Step 1: Write failing temp-directory tests**

Cover missing root, missing chapter, empty chapter, correct numbered files, and DB count greater than disk count. Assert no filesystem mutation.

- [x] **Step 2: Run red**

Expected: new function missing.

- [x] **Step 3: Implement inspection and expose it in list/detail handlers**

Use the existing sanitized directory builder and image extension rules. Do not update task status in the database.

- [x] **Step 4: Verify**

Run download tests, correctness, and build.

- [x] **Step 5: Commit**

Commit as `fix: 标记本地下载文件缺失状态`.

### Task 2: Present recoverable missing-file state

**Files:**
- Modify: `src/renderer/src/pages/DownloadsPage.tsx`
- Modify: `src/renderer/src/pages/MangaDetailPage.tsx`
- Modify: `src/renderer/src/env.d.ts`
- Create: `src/main/__tests__/downloadAvailabilityContract.test.ts`

**Interfaces:**
- Missing chapters show `文件缺失` and cannot open the reader.
- `打开文件夹` and task history remain available; no delete occurs without the existing explicit user action.

- [x] **Step 1: Write failing source/shape contract tests**

Assert renderer types include `available`, unavailable rows render `文件缺失`, and reader-open handlers guard availability.

- [x] **Step 2: Run red**

Expected: all new assertions fail.

- [x] **Step 3: Implement the UI state**

Use a warning InfoBar/Badge, explain that the recorded root cannot be found, and keep the existing open-folder action.

- [x] **Step 4: Verify and commit**

Run tests/build and manually validate the current missing `C:\Users\David\Downloads\JMComic` records. Commit as `fix: 显示本地下载文件缺失`.

Verification note (2026-08-23): the current database contains no download rows, so the empty state was checked in the live app and missing-file branches were verified with isolated temporary-directory tests without inserting synthetic user data.

### Task 3: Cache allowed roots and stream local images asynchronously

**Files:**
- Create: `src/main/localImageAccess.ts`
- Create: `src/main/__tests__/localImageAccess.test.ts`
- Modify: `src/main/localImageProtocol.ts`
- Modify: `src/main/downloadManager.ts`

**Interfaces:**
- Produces `createAllowedRootsCache(load, ttlMs)` and async `openLocalImage(path)`.
- Download-directory changes invalidate the roots cache explicitly.

- [x] **Step 1: Write failing cache tests**

With a deterministic clock, assert repeated calls within 60 seconds invoke the database loader once, invalidation forces reload, and failed loads are not cached.

- [x] **Step 2: Run red**

Expected: module-not-found.

- [x] **Step 3: Implement cached roots and asynchronous read response**

Remove `readFileSync` from `localImageProtocol.ts`, retain `isLocalImagePathSafe`, and use `fs/promises.readFile` or a Web `ReadableStream` adapter supported by Electron protocol handling.

- [x] **Step 4: Verify and benchmark**

Run local access tests, download tests, correctness, and build. Recreate one real local chapter and capture ten open samples.

- [x] **Step 5: Commit**

Commit as `perf: 加速本地图片安全读取`.

### Task 4: Record the local-path baseline

**Files:**
- Create: `docs/performance/2026-08-20-local-fast-path.md`

- [x] **Step 1: Capture ten real local opens and twenty-page navigation runs**

Record image.local count/p50/p95/max, chapter enumeration time, and roots-loader count.

- [x] **Step 2: Verify and commit**

Run all tests/build and commit the numeric report as `docs: 记录本地读取性能结果`.
