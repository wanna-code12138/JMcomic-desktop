# Navigation, Card, and Grid Experience Implementation Plan

> **For implementation:** Execute tasks in order, one task at a time, following the test-driven-development skill; keep the checkbox (`- [ ]`) list updated, and verify each task before moving on.

**Goal:** 将永久页面保活改为有界缓存，可靠恢复滚动/筛选状态，并消除逐卡 hover 更新和不可访问交互。

**Architecture:** 用纯 TypeScript LRU 保存最多三个主页面 key，淘汰页面只留下轻量 `PageSnapshot`；PageHost 负责挂载边界，各列表页自行捕获/恢复滚动。收藏状态集中到独立 Zustand store，hover/focus 用 CSS；只有基准越过门槛才启用 TanStack Virtual grid。

**Tech Stack:** React 18、Zustand 5、TanStack Virtual 3、Fluent UI、CSS containment、tsx。

## Global Constraints

- 同时挂载主页面最多 3 个；reader 离开立即卸载。
- detail 进入 reader 时可临时保留，返回后恢复来源页。
- 快照只保存 scrollTop、筛选、页码和稳定 key，不保存 DOM/组件实例/图片。
- 少于约 100 卡且指标达标时不强制虚拟化。
- hover 不得产生 React commit；键盘和触摸不依赖 hover。
- 本计划不修改内容 provider、图片协议或反打乱。

---

## File Structure

- `src/renderer/src/navigation/pageStateCache.ts`：LRU 和快照纯函数。
- `src/renderer/src/components/PageHost.tsx`：有界挂载。
- `src/renderer/src/stores/favoritesStore.ts`：收藏 Set 和乐观更新。
- `src/renderer/src/components/MangaCard.tsx`：语义化卡片和 CSS 状态。
- `src/renderer/src/components/VirtualMangaGrid.tsx`：仅门槛触发时创建。
- `src/renderer/src/assets/global.css`：hover/focus/reduced-motion/containment。
- `src/main/__tests__/pageStateCache.test.ts`：LRU 纯逻辑。
- `src/main/__tests__/navigationExperienceContract.test.ts`：UI 源码契约。

### Task 1: 页面 LRU 与快照纯核心

**Files:**
- Create: `src/renderer/src/navigation/pageStateCache.ts`
- Create: `src/main/__tests__/pageStateCache.test.ts`

**Interfaces:**
- Produces: `PrimaryPageId`、`PageSnapshot`、`PageCacheState`。
- Produces: `touchPage(state, page, limit=3)`、`saveSnapshot`、`takeSnapshot`。

- [ ] **Step 1: 写失败测试**

```ts
let state = createPageCacheState('home')
state = touchPage(state, 'search', 3)
state = touchPage(state, 'categories', 3)
state = touchPage(state, 'favorites', 3)
assert.deepEqual(state.mounted, ['search', 'categories', 'favorites'])
state = saveSnapshot(state, 'search', { scrollTop: 420, page: 2, filters: { query: 'x' } })
assert.deepEqual(takeSnapshot(state, 'search')?.scrollTop, 420)
```

- [ ] **Step 2: 运行红灯**

Run: `npx tsx src/main/__tests__/pageStateCache.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现不可变 LRU**

访问页移到 MRU 末尾；淘汰页保留 snapshot；snapshot 返回深拷贝；page limit 非正整数抛 RangeError。

- [ ] **Step 4: 运行绿灯并提交**

Run: `npx tsx src/main/__tests__/pageStateCache.test.ts`

Expected: PASS。

```powershell
git add src/renderer/src/navigation/pageStateCache.ts src/main/__tests__/pageStateCache.test.ts
git commit -m "feat: 添加有界页面状态缓存"
```

### Task 2: PageHost 有界挂载和恢复

**Files:**
- Modify: `src/renderer/src/components/PageHost.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/pages/HomePage.tsx`
- Modify: `src/renderer/src/pages/SearchPage.tsx`
- Modify: `src/renderer/src/pages/CategoriesPage.tsx`
- Create: `src/main/__tests__/navigationExperienceContract.test.ts`

**Interfaces:**
- Consumes: `PageCacheState`。
- Produces: `usePageSnapshot(pageId, scrollRef, captureFilters, restoreFilters)`。

- [ ] **Step 1: 写失败契约**

断言 App 不再使用 `visitedPrimaryPages`；PageHost limit 为 3；ReaderPage 非当前页时不挂载；三个列表页均 capture/restore snapshot。

- [ ] **Step 2: 运行红灯**

Run: `npx tsx src/main/__tests__/navigationExperienceContract.test.ts`

Expected: FAIL，仍为永久 visited 数组。

- [ ] **Step 3: 接入 LRU**

在导航变化时先捕获旧页快照，再 touch 新页；恢复顺序固定为数据/筛选 → 下一次 rAF → scrollTo。若内容高度不足，最多再等待一次 ResizeObserver，不做无限轮询。

- [ ] **Step 4: 运行导航测试**

Run: `npx tsx src/main/__tests__/pageStateCache.test.ts`

Run: `npx tsx src/main/__tests__/navigationReturnContract.test.ts`

Run: `npx tsx src/main/__tests__/navigationExperienceContract.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add src/renderer/src/App.tsx src/renderer/src/components/PageHost.tsx src/renderer/src/pages/HomePage.tsx src/renderer/src/pages/SearchPage.tsx src/renderer/src/pages/CategoriesPage.tsx src/main/__tests__/navigationExperienceContract.test.ts
git commit -m "perf: 限制页面保活并恢复导航状态"
```

### Task 3: 收藏 Set 与卡片交互

**Files:**
- Create: `src/renderer/src/stores/favoritesStore.ts`
- Modify: `src/renderer/src/components/MangaCard.tsx`
- Modify: `src/renderer/src/assets/global.css`
- Modify: `src/main/__tests__/navigationExperienceContract.test.ts`

**Interfaces:**
- Produces: `favoritesStore.initialize()`、`useIsFavorite(mangaId)`、`setFavorite(manga, desired)`。
- Consumes: `favoritesList/add/remove` IPC。

- [ ] **Step 1: 写失败契约**

```ts
assert.doesNotMatch(card, /useState\([^)]*hover/i)
assert.match(css, /:focus-within/)
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
assert.match(card, /useIsFavorite/)
assert.match(card, /<button[^>]+aria-label=/s)
```

- [ ] **Step 2: 运行红灯**

Run: `npx tsx src/main/__tests__/navigationExperienceContract.test.ts`

Expected: FAIL，当前卡片维护 hovered/isFavorite。

- [ ] **Step 3: 实现集中收藏状态**

initialize 使用 single-flight；内部 `Set<string>` 每次更新创建新 Set；单卡 selector 只订阅自己的 boolean；乐观失败恢复前一个 Set 并暴露局部错误。

- [ ] **Step 4: 改为 CSS hover/focus**

卡片主体使用 `<button>` 或可导航链接；收藏是同级独立 `<button>`，不得嵌套交互元素。动效 80–120ms，reduced-motion 为 0ms；触摸布局始终提供收藏入口。

- [ ] **Step 5: 运行绿灯并提交**

Run: `npx tsx src/main/__tests__/navigationExperienceContract.test.ts`

Run: `npm run build`

Expected: PASS。

```powershell
git add src/renderer/src/stores/favoritesStore.ts src/renderer/src/components/MangaCard.tsx src/renderer/src/assets/global.css src/main/__tests__/navigationExperienceContract.test.ts
git commit -m "perf: 集中收藏状态并移除卡片悬停更新"
```

### Task 4: 网格虚拟化决策门

**Files:**
- Conditional Create: `src/renderer/src/components/VirtualMangaGrid.tsx`
- Conditional Modify: Home/Search/Categories/Favorites pages
- Create: `docs/performance/2026-09-03-card-grid.md`

- [ ] **Step 1: 测量 24/48/96/200 卡**

记录 DOM、图片内存、React commit、60Hz 滚动帧间隔 p50/p95 和返回恢复误差。

- [ ] **Step 2: 按门槛选择**

若少于约 100 卡且 p95 ≤25ms，只使用 `content-visibility:auto` 和 `contain`；若 200 卡或真实分页场景 p95 >25ms，创建 TanStack Virtual lanes grid，overscan 从 1 个视口起测。

- [ ] **Step 3: 若启用 VirtualMangaGrid，先写红灯**

测试稳定 item key、lane count 随宽度变化、overscan 有界、scroll snapshot 恢复和 DOM 数上限，再写组件实现；未越门槛则报告明确记录“不实施”。

- [ ] **Step 4: 全量验收并提交报告**

Run: `Get-ChildItem src/main/__tests__/*.test.ts | ForEach-Object { npx tsx $_.FullName }`

Run: `npm run build`

Expected: 全部通过；200 卡 p95 ≤25ms。

```powershell
git add docs/performance/2026-09-03-card-grid.md
git commit -m "docs: 记录卡片网格虚拟化决策"
```

## Plan Acceptance

- 挂载主页面不超过 3，reader 离开无 Canvas/请求/监听残留。
- 首页、搜索、分类恢复滚动、筛选和页码。
- hover 不触发 React commit，收藏只初始化一次并跨页面同步。
- 键盘、触摸、reduced-motion、浅色/深色/Mica 均通过人工检查。
