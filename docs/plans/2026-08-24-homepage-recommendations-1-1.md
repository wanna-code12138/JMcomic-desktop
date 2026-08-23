# Homepage Recommendations 1.1 Implementation Plan

> **For implementation:** Execute tasks in order, one task at a time, following the test-driven-development skill; keep the checkbox (`- [ ]`) list updated, and verify each task before moving on.

**Goal:** Replace the fixed most-liked list in the Recommended tab with an explicit-tag, freshness-aware, diverse feed that supports 24-card initial rendering, 12-card lazy batches, seven-day exposure down-ranking, and manual refresh.

**Architecture:** Keep raw public list acquisition in the main process and recommendation ranking as a pure shared module. The main process loads latest, weekly-popular, quality, and a rotating subset of selected-tag pools through the existing validated content gateway; the renderer ranks those pools, persists exposure timestamps locally, and reveals ranked cards in batches without reordering cards already on screen. Recommendation preferences remain explicit settings and never consume favorites, reading history, search history, or downloads.

**Tech Stack:** Electron 43, React 18, TypeScript 5.6, Fluent UI 9, existing `tsx` Node tests, existing content gateway and persistent cache.

## Global Constraints

- Change only the Recommended tab; Latest and Popular retain their existing site ordering and load path.
- Use no implicit local-interest signals.
- Allow at most eight equal-weight tags selected from the existing curated tag list.
- Use source weights of 35% latest, 25% weekly popular, 20% quality, and 20% preferred tags; redistribute the tag share when no tags are selected.
- Down-rank, but never permanently exclude, items exposed during the previous seven days.
- Render 24 cards initially and 12 more when the bottom sentinel approaches the viewport.
- Preserve native lazy cover loading.
- Rotate three selected tags per recommendation refresh and cache raw source results independently.
- Do not add dependencies or change package configuration.

---

### Task 1: Recommendation settings and pure ranking core

**Files:**
- Create: `src/shared/recommendationCore.ts`
- Create: `src/main/__tests__/recommendationCore.test.ts`
- Modify: `src/main/settingsCore.ts`
- Modify: `src/main/settingsStore.ts`
- Modify: `src/main/__tests__/settingsCore.test.ts`

**Interfaces:**
- Consumes: `MangaListItem` from `src/main/types.ts` and the curated tag strings currently in `src/renderer/src/constants/categories.ts`.
- Produces: `RECOMMENDATION_TAGS`, `normalizeRecommendationTags(raw)`, `buildRecommendationFeed(pools, exposures, options)`, `pruneRecommendationExposures(exposures, now)`, `recordRecommendationExposures(exposures, ids, now)`, and `nextRecommendationVisibleCount(current, total)`.

- [x] **Step 1: Write failing settings and ranking tests**

Add behavior tests that assert: invalid and duplicate tags are removed; only the first eight allowed tags remain; stringified JSON settings reload; source slots follow 35/25/20/20 over a sufficiently large unique pool; absent tag pools redistribute their share; equal-weight tag pools both contribute; items exposed within seven days rank after unseen alternatives; expired exposures are removed; consecutive same-author cards are avoided when an alternative exists; initial and subsequent visible counts are 24 and 12.

```ts
const feed = buildRecommendationFeed(pools, [{ id: 'seen', exposedAt: now - 1000 }], {
  now,
  seed: 7,
  limit: 40
})
assert.ok(feed.findIndex((card) => card.id === 'unseen') < feed.findIndex((card) => card.id === 'seen'))
assert.equal(nextRecommendationVisibleCount(0, 100), 24)
assert.equal(nextRecommendationVisibleCount(24, 100), 36)
```

- [x] **Step 2: Run tests to verify RED**

Run: `npx tsx src/main/__tests__/recommendationCore.test.ts; npx tsx src/main/__tests__/settingsCore.test.ts`

Expected: the new test fails because `src/shared/recommendationCore.ts` and `recommendationTags` do not exist.

- [x] **Step 3: Implement the pure recommendation API and settings normalization**

Define these exact public types and constants:

```ts
export type RecommendationSource = 'latest' | 'weekly' | 'quality' | 'tag'
export interface RecommendationPool { source: RecommendationSource; tag?: string; cards: MangaListItem[] }
export interface RecommendationExposure { id: string; exposedAt: number }
export interface RecommendationOptions { now: number; seed: number; limit?: number }
export const RECOMMENDATION_INITIAL_COUNT = 24
export const RECOMMENDATION_BATCH_COUNT = 12
export const RECOMMENDATION_EXPOSURE_TTL_MS = 7 * 24 * 60 * 60_000
```

Implement deterministic seeded jitter, ID de-duplication, weighted-fair source selection, unseen-first exposure ordering, and one-step author diversification. Add `recommendationTags: string[]` to `AppSettings`; parse arrays and JSON strings through `normalizeRecommendationTags`; serialize arrays with `JSON.stringify` in the settings store.

- [x] **Step 4: Run tests to verify GREEN**

Run: `npx tsx src/main/__tests__/recommendationCore.test.ts; npx tsx src/main/__tests__/settingsCore.test.ts`

Expected: both scripts print only `PASS` lines and finish with exit code 0.

- [x] **Step 5: Commit Task 1**

```powershell
git add src/shared/recommendationCore.ts src/main/__tests__/recommendationCore.test.ts src/main/settingsCore.ts src/main/settingsStore.ts src/main/__tests__/settingsCore.test.ts
git commit -m "feat: 添加推荐排序核心与标签设置"
```

---

### Task 2: Fast independently cached recommendation candidate pools

**Files:**
- Modify: `src/main/siteAdapter.ts`
- Modify: `src/main/contentApi.ts`
- Modify: `src/preload/index.ts`
- Create: `src/main/__tests__/recommendationData.test.ts`

**Interfaces:**
- Consumes: `RecommendationPool`, normalized `recommendationTags`, `contentGateway.category(request)`, and the current `JmWebAdapter` list parser.
- Produces: `buildAlbumListPath(request)`, `JmWebAdapter.listAlbums(request)`, and preload method `contentRecommendations(tagOffset?: number)` returning `{ ok, pools, nextTagOffset, error? }`.

- [x] **Step 1: Write failing candidate-source tests**

Test exact URL semantics for latest (`o=mr&t=a`), weekly popular (`o=mv&t=w`), quality (`o=tf` and `o=tr`), and tag searches. Test rotation over eight tags returns three tags per call and advances cyclically. Add a source contract asserting the recommendation endpoint does not query favorites, history, search history, or downloads.

```ts
assert.equal(
  buildAlbumListPath({ tag: '纯爱', order: 'mv', time: 'm', page: 1 }),
  '/search/photos?search_query=%E7%BA%AF%E7%88%B1&page=1&main_tag=0&o=mv&t=m'
)
assert.deepEqual(selectRotatingTags(['a', 'b', 'c', 'd'], 3, 0), {
  tags: ['a', 'b', 'c'], nextOffset: 3
})
```

- [x] **Step 2: Run test to verify RED**

Run: `npx tsx src/main/__tests__/recommendationData.test.ts`

Expected: FAIL because the URL builder, rotating selector, and endpoint do not exist.

- [x] **Step 3: Implement candidate acquisition**

Expose the existing direct list parser through `listAlbums`, enable direct category access only for uncombined all-category and tag requests, and use the gateway so each request keeps its own persistent cache key. Load these pools concurrently with `Promise.allSettled`: latest, weekly, liked, rating, and up to three rotated tags. Merge liked and rating as separate `quality` pools, keep partial successful results when a source fails, and return an error only when every pool fails.

- [x] **Step 4: Run test to verify GREEN**

Run: `npx tsx src/main/__tests__/recommendationData.test.ts; npx tsx src/main/__tests__/contentGateway.test.ts; npx tsx src/main/__tests__/contentApiContract.test.ts`

Expected: all candidate, gateway, and IPC contract tests pass.

- [x] **Step 5: Commit Task 2**

```powershell
git add src/main/siteAdapter.ts src/main/contentApi.ts src/preload/index.ts src/main/__tests__/recommendationData.test.ts
git commit -m "feat: 聚合并缓存推荐候选池"
```

---

### Task 3: Recommendation preference dialog

**Files:**
- Modify: `src/renderer/src/pages/SettingsPage.tsx`
- Modify: `src/renderer/src/stores/appStore.ts`
- Create: `src/main/__tests__/recommendationUiContract.test.ts`

**Interfaces:**
- Consumes: `RECOMMENDATION_TAGS`, `settingsGet`, and `settingsSet({ recommendationTags })`.
- Produces: a `recommendationRevision` counter and `bumpRecommendationRevision()` action consumed by HomePage.

- [x] **Step 1: Write failing dialog contract tests**

Assert that Settings imports the shared tag list, renders a Fluent `Dialog`, displays selected count out of eight, disables unselected tags at the limit, supports text filtering, and saves only on the explicit Save action. Assert that saving calls `bumpRecommendationRevision`.

- [x] **Step 2: Run test to verify RED**

Run: `npx tsx src/main/__tests__/recommendationUiContract.test.ts`

Expected: FAIL because the recommendation dialog and revision action are absent.

- [x] **Step 3: Implement the dialog and revision signal**

Add a Recommendation settings card with the selected tag summary and an Configure button. The dialog copies persisted tags into draft state on open, filters curated tags by the search input, toggles equal-weight chips up to eight, offers Clear, Cancel, and Save, persists through settings IPC, then increments the renderer revision. Cancel must discard draft changes.

- [x] **Step 4: Run test to verify GREEN**

Run: `npx tsx src/main/__tests__/recommendationUiContract.test.ts; npx tsc --noEmit`

Expected: the UI contract passes and TypeScript reports no errors.

- [x] **Step 5: Commit Task 3**

```powershell
git add src/renderer/src/pages/SettingsPage.tsx src/renderer/src/stores/appStore.ts src/main/__tests__/recommendationUiContract.test.ts
git commit -m "feat: 添加推荐标签偏好弹窗"
```

---

### Task 4: Recommended-tab feed, lazy batches, exposure history, and refresh

**Files:**
- Modify: `src/renderer/src/pages/HomePage.tsx`
- Extend: `src/main/__tests__/recommendationUiContract.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `contentRecommendations`, `buildRecommendationFeed`, exposure helpers, 24/12 batch constants, and `recommendationRevision`.
- Produces: a stable visible recommendation slice, an IntersectionObserver bottom sentinel, and a manual Refresh batch action.

- [x] **Step 1: Extend failing home-feed contract tests**

Assert that only the Recommended branch calls `contentRecommendations`; Latest and Popular still call `contentHomepageStream`. Assert the feed starts at 24, grows by 12 through `nextRecommendationVisibleCount`, observes a bottom sentinel, writes exposure records, and renders a `换一批` button. Assert HomePage does not call favorites, history, search-history, or download APIs for ranking.

- [x] **Step 2: Run test to verify RED**

Run: `npx tsx src/main/__tests__/recommendationUiContract.test.ts`

Expected: FAIL because HomePage still maps the fixed recommended homepage list.

- [x] **Step 3: Implement the recommended feed**

Keep the current Latest and Popular state and stream handlers. For Recommended, request candidate pools, prune locally stored exposure timestamps, rank with a new seed, reveal the first 24 cards, and record only revealed IDs. Use an IntersectionObserver rooted at the scrolling page to reveal 12 more and record those IDs. Manual refresh increments tag rotation and seed, re-ranks against updated exposure history, and atomically replaces the visible batch after successful loading. A recommendation revision resets the tag offset and reloads candidates while retaining raw gateway caches and exposure history.

- [x] **Step 4: Update release notes**

Add a 1.1 recommendation entry describing explicit tag preferences, diversified candidate sources, seven-day repeat reduction, lazy batches, and manual refresh without claiming implicit personalization.

- [x] **Step 5: Run focused and full verification**

Run:

```powershell
npx tsx src/main/__tests__/recommendationCore.test.ts
npx tsx src/main/__tests__/recommendationData.test.ts
npx tsx src/main/__tests__/recommendationUiContract.test.ts
npm run build
```

Then run every `src/main/__tests__/*.test.ts` script and `scripts/__tests__/summarize-performance.test.mjs` using the repository's existing test commands.

Expected: every test exits 0, TypeScript/build completes without errors, and no unrelated file appears in `git status --short`.

- [x] **Step 6: Review and commit Task 4**

```powershell
git status --short
git diff --check
git diff -- src/renderer/src/pages/HomePage.tsx src/main/__tests__/recommendationUiContract.test.ts CHANGELOG.md
git add src/renderer/src/pages/HomePage.tsx src/main/__tests__/recommendationUiContract.test.ts CHANGELOG.md docs/plans/2026-08-24-homepage-recommendations-1-1.md
git commit -m "feat: 重做主页推荐与懒加载"
```
