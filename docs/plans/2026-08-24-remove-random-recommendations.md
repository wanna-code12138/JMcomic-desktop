# Remove Random Recommendations Implementation Plan

> **For implementation:** Execute tasks in order, one task at a time, following the test-driven-development skill; keep the checkbox (`- [ ]`) list updated, and verify each task before moving on.

**Goal:** Make every card on the Recommended tab come from the 1.1 ranking algorithm and prevent JM's “随便看” section from entering recommendation pools or persistent cache.

**Architecture:** Keep the current recommendation weights, exposure scoring, refresh behavior, and lazy loading unchanged. Add recommendation-specific list sanitization at the direct parser boundary and recommendation-specific validation at the gateway cache boundary, then remove the renderer's synthetic random card and click branch.

**Tech Stack:** TypeScript, Node test scripts via `tsx`, Cheerio, React 18, Electron/Vite.

## Global Constraints

- The Recommended tab contains zero synthetic or site-provided “随便看” cards.
- An insufficient candidate pool produces the existing loading, error, or empty state; it is never filled with random cards.
- Latest and Popular retain their existing stream behavior.
- The 35/25/20/20 ranking mix, 7-day exposure downranking, 24/12 lazy reveal, and manual refresh remain unchanged.
- No dependency or package configuration changes.

---

### Task 1: Reject random-section candidates and poisoned cache entries

**Files:**
- Modify: `src/main/recommendationData.ts`
- Modify: `src/main/siteAdapter.ts`
- Modify: `src/main/contentGateway.ts`
- Test: `src/main/__tests__/recommendationData.test.ts`
- Test: `src/main/__tests__/contentGateway.test.ts`

**Interfaces:**
- Produces: `isRandomRecommendationTitle(title: string): boolean` for both parsing and cache validation.
- Consumes: existing `AlbumListRequest`, `GatewayListResult`, and `validateCards` contracts.

- [x] **Step 1: Write failing parser-title tests**

Add assertions proving all Traditional/Simplified random labels are recognized while a real title is retained:

```ts
assert.equal(isRandomRecommendationTitle('隨便看'), true)
assert.equal(isRandomRecommendationTitle('随便看看'), true)
assert.equal(isRandomRecommendationTitle('換一換'), true)
assert.equal(isRandomRecommendationTitle('真实漫画标题'), false)
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `node --import tsx src/main/__tests__/recommendationData.test.ts`

Expected: FAIL because `isRandomRecommendationTitle` is not exported.

- [x] **Step 3: Implement the title predicate and parser filtering**

Export the predicate from `recommendationData.ts`. In both regex and Cheerio paths of `parseSearchPage`, reject matching titles and deduplicate album IDs before pushing results. This ensures a fresh direct fetch cannot return JM's random-section cards.

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `node --import tsx src/main/__tests__/recommendationData.test.ts`

Expected: all recommendation data tests pass.

- [x] **Step 5: Write a failing poisoned-cache fallback test**

Add a gateway test whose persistent cached recommendation result contains `{ title: '隨便看' }`, then assert the cache validator rejects it and the valid browser provider wins:

```ts
const result = await gateway.category({ recommendation: true, page: 1 })
assert.equal(result.provider, 'browser')
assert.equal(result.data.results[0].title, '算法漫画')
```

- [x] **Step 6: Run the gateway test and verify RED**

Run: `node --import tsx src/main/__tests__/contentGateway.test.ts`

Expected: FAIL because the current generic list validator accepts the poisoned cached card.

- [x] **Step 7: Add recommendation-specific gateway validation**

When `CategoryRequest.recommendation === true`, validate that no result title matches `isRandomRecommendationTitle`. Reuse that validator for direct results, browser fallback results, and persistent cache entries so existing bad cache records are automatically treated as misses.

- [x] **Step 8: Run both focused test files and verify GREEN**

Run: `node --import tsx src/main/__tests__/recommendationData.test.ts`

Run: `node --import tsx src/main/__tests__/contentGateway.test.ts`

Expected: both test files pass.

- [x] **Step 9: Commit the candidate fix**

```powershell
git add src/main/recommendationData.ts src/main/siteAdapter.ts src/main/contentGateway.ts src/main/__tests__/recommendationData.test.ts src/main/__tests__/contentGateway.test.ts
git commit -m "fix: 排除推荐候选中的随便看"
```

### Task 2: Remove the renderer's synthetic random card

**Files:**
- Modify: `src/renderer/src/pages/HomePage.tsx`
- Modify: `src/main/__tests__/recommendationUiContract.test.ts`

**Interfaces:**
- Consumes: the existing `visibleCards: MangaCardData[]` ranked and lazily revealed feed.
- Produces: a Recommended grid rendered directly from `visibleCards` with no `__random__` sentinel.

- [x] **Step 1: Write the failing UI contract test**

Add assertions that the home source contains neither the sentinel nor the synthetic card spread:

```ts
assert.doesNotMatch(home, /__random__|RANDOM_CARD|RANDOM_COVER/)
assert.doesNotMatch(home, /\[RANDOM_CARD,\s*\.\.\.visibleCards\]/)
assert.match(home, /\{visibleCards\.map\(/)
```

- [x] **Step 2: Run the UI test and verify RED**

Run: `node --import tsx src/main/__tests__/recommendationUiContract.test.ts`

Expected: FAIL because `HomePage.tsx` still declares and renders `RANDOM_CARD`.

- [x] **Step 3: Remove only the synthetic random behavior**

Delete `RANDOM_COVER`, `RANDOM_CARD`, and the `__random__` click branch. Render `visibleCards.map(...)` and make `handleCardClick` always open the clicked algorithm card. Leave refresh, exposure recording, tab streams, and intersection-observer pagination untouched.

- [x] **Step 4: Run the UI test and verify GREEN**

Run: `node --import tsx src/main/__tests__/recommendationUiContract.test.ts`

Expected: all recommendation UI contract tests pass.

- [x] **Step 5: Commit the UI change**

```powershell
git add src/renderer/src/pages/HomePage.tsx src/main/__tests__/recommendationUiContract.test.ts
git commit -m "feat: 推荐页仅展示算法内容"
```

### Task 3: Full regression and build verification

**Files:**
- Modify: `docs/plans/2026-08-24-remove-random-recommendations.md` (checkbox state only)

**Interfaces:**
- Consumes: all completed production and test changes.
- Produces: verified build artifacts and a clean task diff.

- [x] **Step 1: Run every TypeScript test file**

Run each `src/main/__tests__/*.test.ts` with `node --import tsx` using the repository's existing PowerShell loop.

Expected: every test file exits 0.

- [x] **Step 2: Build all Electron bundles**

Run: `npm run build`

Expected: main, preload, and renderer builds all succeed.

- [x] **Step 3: Review the exact diff and worktree**

Run: `git status --short`

Run: `git diff --check`

Expected: only this task's plan/checklist remains uncommitted, and no whitespace errors are reported.

- [x] **Step 4: Commit the completed plan state**

```powershell
git add docs/plans/2026-08-24-remove-random-recommendations.md
git commit -m "docs: 记录推荐随机卡修复计划"
```

## Self-Review

- Spec coverage: parser filtering, poisoned cache invalidation, zero synthetic random cards, candidate-shortage behavior, and unchanged lazy/ranking behavior are each covered.
- Placeholder scan: no deferred implementation placeholders remain.
- Type consistency: the shared predicate name and `CategoryRequest.recommendation` contract are consistent across Tasks 1 and 2.
