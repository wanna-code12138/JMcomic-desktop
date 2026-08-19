# Direct Content Gateway Implementation Plan

> **For implementation:** Execute tasks in order, one task at a time, following the test-driven-development skill; keep the checkbox (`- [ ]`) list updated, and verify each task before moving on.

**Goal:** Serve content through the existing direct HTTP/Cheerio adapter when it produces validated results, while preserving BrowserWindow scraping as an automatic compatibility fallback.

**Architecture:** Put both providers behind a gateway with schema validation, single-flight, TTL/stale caching, and provider metrics. The gateway never reorders chapter pages and only accepts direct results that satisfy strict shape checks.

**Tech Stack:** Electron net/http client, Cheerio, existing `JmWebAdapter`, existing BrowserWindow scraper, TypeScript IPC.

## Global Constraints

- BrowserWindow remains the fallback for Cloudflare challenges, empty/partial DOM, and parser validation failure.
- Page arrays retain source order and original `index`; no URL or completion-time sorting.
- No new dependency is required.
- Run `imageCorrectnessContract.test.ts` before and after every task.

---

### Task 1: Validate direct-provider results

**Files:**
- Create: `src/main/contentValidation.ts`
- Create: `src/main/__tests__/contentValidation.test.ts`
- Modify: `src/main/siteAdapter.ts`
- Modify: `src/main/types.ts`

**Interfaces:**
- Produces `validateCards`, `validateDetail`, and `validatePages` returning discriminated `{ ok: true; data } | { ok: false; reason }`.
- `validatePages` requires integer indices exactly `0..n-1`, non-empty HTTPS image URLs, and preserves input order.
- Produces `ChapterPagesResult = { pages: PageItem[]; scrambleId: number }`; `SiteAdapter.getChapterPages` returns this type so the direct path cannot discard the scramble threshold.

- [ ] **Step 1: Write failing validators tests**

Cover valid JM1215915 detail, missing title, empty chapters, duplicate/gapped page indices, non-HTTPS image URLs, and a valid ordered page array.

- [ ] **Step 2: Run red**

Expected: module-not-found.

- [ ] **Step 3: Implement minimal validators**

Return reasons without mutating or sorting inputs. Align `JmWebAdapter` author/tag selectors with the exact metadata parser already used by the BrowserWindow path. Parse `scramble_id` in the chapter response and return it beside the untouched pages array.

- [ ] **Step 4: Verify and commit**

Run validators, metadata tests, correctness, and build; commit as `feat: 校验直连内容结果`.

### Task 2: Add provider fallback and single-flight

**Files:**
- Create: `src/main/contentGateway.ts`
- Create: `src/main/__tests__/contentGateway.test.ts`

**Interfaces:**
- Produces `createContentGateway({ direct, browser, now, ttlMs })` with `homepage`, `search`, `category`, `detail`, and `pages` methods.
- Same-key concurrent calls share one promise; direct failure/invalid result calls browser exactly once.

- [ ] **Step 1: Write failing fake-provider tests**

Assert direct success avoids browser, rejected/invalid direct results fall back, concurrent identical detail calls invoke direct once, and different keys stay independent.

- [ ] **Step 2: Run red**

Expected: module-not-found.

- [ ] **Step 3: Implement gateway**

Use in-memory maps for fresh cache and in-flight promises. Cache only validated successful data; remove rejected in-flight entries in `finally`.

- [ ] **Step 4: Verify and commit**

Run gateway tests and build; commit as `feat: 添加内容直连回退网关`.

### Task 3: Route IPC through the gateway without changing IPC contracts

**Files:**
- Modify: `src/main/contentApi.ts`
- Modify: `src/main/performanceTrace.ts` only if a typed provider metadata helper is needed
- Modify: `src/main/__tests__/performanceInstrumentation.test.ts`
- Create: `src/main/__tests__/contentApiContract.test.ts`

**Interfaces:**
- Existing `content:*` request/response and stream event shapes stay byte-compatible.
- Performance events add `provider: 'direct' | 'browser'` and `fallback: boolean`; no URLs or credentials are logged.

- [ ] **Step 1: Write failing IPC contract/source assertions**

Assert handlers call gateway methods, page stream retains `index` and `scrambleId`, and provider metadata is privacy-safe.

- [ ] **Step 2: Run red**

Expected: gateway routing assertions fail.

- [ ] **Step 3: Integrate one endpoint at a time**

Order: detail, pages, search, category, homepage. After each endpoint, run its validator/gateway tests and the correctness contract. Keep existing BrowserWindow stream implementation for endpoints whose direct adapter cannot yet produce incremental batches; gateway-cached complete results may be emitted as one final batch.

- [ ] **Step 4: Real-site verification**

Verify JM1215915 detail metadata, one 30+ page chapter, homepage categories, a keyword search, and a forced direct failure. Compare every page index and URL against BrowserWindow output before enabling direct pages by default.

- [ ] **Step 5: Commit**

Commit as `perf: 接入内容直连回退网关`.

### Task 4: Add stale-while-revalidate persistence only after direct parity

**Files:**
- Create: `src/main/contentCache.ts`
- Create: `src/main/__tests__/contentCache.test.ts`
- Modify: `src/main/contentGateway.ts`

**Interfaces:**
- Fresh TTL: 10 minutes; stale readable window: 24 hours.
- Cache keys include endpoint and all normalized parameters; auth-sensitive results are memory-only.

- [ ] **Step 1: Write failing deterministic-clock tests**

Assert fresh returns immediately, stale returns immediately and triggers one refresh, expired data blocks for provider, malformed disk entries are ignored, and refresh preserves the previous stale value on failure.

- [ ] **Step 2: Run red**

Expected: module-not-found.

- [ ] **Step 3: Implement atomic JSON cache**

Store only public list/detail/page data under the app data directory using temporary-file plus rename. Do not store cookies, credentials, or favorites.

- [ ] **Step 4: Benchmark and verify**

Measure ten cold process starts and ten warm navigations; run all tests, correctness, build, and diff checks.

- [ ] **Step 5: Commit**

Commit as `perf: 添加内容持久缓存与后台刷新`.

### Task 5: Record provider performance and fallback rate

**Files:**
- Create: `docs/performance/2026-08-20-content-gateway.md`

- [ ] **Step 1: Capture real samples**

For homepage, detail, search, and pages, record direct count, browser fallback count, p50/p95/max, and validation failure reasons without URLs.

- [ ] **Step 2: Acceptance gate**

Direct detail/pages must match BrowserWindow fields and page order exactly. If parity fails, leave that endpoint on browser-first and document the reason.

- [ ] **Step 3: Full verification and commit**

Run all tests/build and commit as `docs: 记录内容网关性能结果`.
