# Renderer Boundaries and Lazy Loading Implementation Plan

> **For implementation:** Execute tasks in order, one task at a time, following the test-driven-development skill; keep the checkbox (`- [ ]`) list updated, and verify each task before moving on.

**Goal:** 缩小 Zustand/React 更新范围并按页面拆包，使应用壳快速可交互且页面状态行为不变。

**Architecture:** App 只订阅导航所需字段，TitleBar、Navigation、StatusBar 和 PageHost 各自独立订阅并 memo；详情、阅读器、下载和设置使用 `React.lazy`。本计划不改变永久保活策略，页面 LRU 在后续导航计划中单独实施。

**Tech Stack:** React 18、Zustand 5、Vite 5、Fluent UI 9、TypeScript、tsx 源码契约测试。

## Global Constraints

- 不安装新依赖，不改业务 DTO、IPC 和导航语义。
- 首批 lazy 页面固定为 Detail、Reader、Downloads、Settings。
- 每个 lazy 页面必须有稳定 Suspense fallback 和 Error Boundary。
- 本计划不得顺带实现页面 LRU、网格虚拟化或图片 Worker。
- 目标：首包 raw size 降低至少 25%，或 parse/evaluate 指标给出同等收益。

---

## File Structure

- `src/renderer/src/components/AppFrame.tsx`：纯布局壳和插槽。
- `src/renderer/src/components/AppNavigation.tsx`：导航订阅与键盘语义。
- `src/renderer/src/components/AppStatusBar.tsx`：网络和版本状态。
- `src/renderer/src/components/PageLoadBoundary.tsx`：Suspense + chunk 错误恢复。
- `src/renderer/src/components/PageHost.tsx`：页面映射和当前保活兼容层。
- `src/renderer/src/App.tsx`：组合以上组件，不订阅整个 store。
- `src/main/__tests__/rendererBoundaryContract.test.ts`：源码边界和 lazy 契约。

### Task 1: 锁定 store 精确订阅契约

**Files:**
- Create: `src/main/__tests__/rendererBoundaryContract.test.ts`
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `useAppStore((state) => state.field)`。
- Produces: App 根组件无无参 `useAppStore()`。

- [ ] **Step 1: 写失败测试**

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.doesNotMatch(app, /useAppStore\(\)/)
assert.doesNotMatch(app, /const\s*\{[^}]+\}\s*=\s*useAppStore/)
```

- [ ] **Step 2: 运行红灯**

Run: `npx tsx src/main/__tests__/rendererBoundaryContract.test.ts`

Expected: FAIL，当前 App 解构整个 store。

- [ ] **Step 3: 改成逐字段 selector**

```ts
const currentPage = useAppStore((state) => state.currentPage)
const setCurrentPage = useAppStore((state) => state.setCurrentPage)
const networkStatus = useAppStore((state) => state.networkStatus)
const readerSourcePage = useAppStore((state) => state.readerSourcePage)
```

- [ ] **Step 4: 运行绿灯和导航契约**

Run: `npx tsx src/main/__tests__/rendererBoundaryContract.test.ts`

Run: `npx tsx src/main/__tests__/navigationReturnContract.test.ts`

Expected: 均 PASS。

- [ ] **Step 5: 提交**

```powershell
git add src/renderer/src/App.tsx src/main/__tests__/rendererBoundaryContract.test.ts
git commit -m "perf: 收窄应用根组件状态订阅"
```

### Task 2: 拆分壳层更新边界

**Files:**
- Create: `src/renderer/src/components/AppFrame.tsx`
- Create: `src/renderer/src/components/AppNavigation.tsx`
- Create: `src/renderer/src/components/AppStatusBar.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/main/__tests__/rendererBoundaryContract.test.ts`

**Interfaces:**
- Produces: `AppFrameProps { titleBar; navigation; page; statusBar }`。
- Produces: memoized `AppNavigation` 和 `AppStatusBar`。

- [ ] **Step 1: 扩充失败契约**

```ts
const nav = readFileSync('src/renderer/src/components/AppNavigation.tsx', 'utf8')
const status = readFileSync('src/renderer/src/components/AppStatusBar.tsx', 'utf8')
assert.match(nav, /export default React\.memo/)
assert.match(nav, /<nav/)
assert.match(nav, /onKeyDown/)
assert.match(status, /export default React\.memo/)
```

- [ ] **Step 2: 运行红灯**

Run: `npx tsx src/main/__tests__/rendererBoundaryContract.test.ts`

Expected: FAIL，新文件不存在。

- [ ] **Step 3: 提取组件**

`AppNavigation` 自行订阅 `currentPage` 和 `setCurrentPage`；导航项使用原生 `<button type="button">`，Enter/Space 交给浏览器默认行为。`AppStatusBar` 只订阅 `networkStatus`，版本在 mount 时读取一次。`AppFrame` 只承载样式和 children，不读取 store。

- [ ] **Step 4: 验证无回归**

Run: `npx tsx src/main/__tests__/rendererBoundaryContract.test.ts`

Run: `npx tsx src/main/__tests__/winuiVisualContract.test.ts`

Expected: PASS；若视觉契约依赖旧 class，应只更新为等价的新结构断言。

- [ ] **Step 5: 提交**

```powershell
git add src/renderer/src/App.tsx src/renderer/src/components/AppFrame.tsx src/renderer/src/components/AppNavigation.tsx src/renderer/src/components/AppStatusBar.tsx src/main/__tests__/rendererBoundaryContract.test.ts
git commit -m "refactor: 拆分应用壳层更新边界"
```

### Task 3: 页面 lazy 与错误恢复

**Files:**
- Create: `src/renderer/src/components/PageLoadBoundary.tsx`
- Create: `src/renderer/src/components/PageHost.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/pages/index.ts`
- Modify: `src/main/__tests__/rendererBoundaryContract.test.ts`

**Interfaces:**
- Produces: `type PageId = 'home' | 'categories' | 'search' | 'favorites' | 'downloads' | 'settings' | 'detail' | 'reader'`。
- Produces: `PageHostProps { currentPage: PageId; mountedPages: readonly PageId[] }`。

- [ ] **Step 1: 写 lazy 失败契约**

```ts
assert.match(pageHost, /lazy\(\(\) => import\('\.\.\/pages\/MangaDetailPage'\)\)/)
assert.match(pageHost, /lazy\(\(\) => import\('\.\.\/pages\/ReaderPage'\)\)/)
assert.match(pageHost, /lazy\(\(\) => import\('\.\.\/pages\/DownloadsPage'\)\)/)
assert.match(pageHost, /lazy\(\(\) => import\('\.\.\/pages\/SettingsPage'\)\)/)
assert.match(boundary, /Suspense/)
assert.match(boundary, /重新加载|重试/)
```

- [ ] **Step 2: 运行红灯**

Run: `npx tsx src/main/__tests__/rendererBoundaryContract.test.ts`

Expected: FAIL，PageHost 和 boundary 不存在。

- [ ] **Step 3: 实现页面映射**

```tsx
const MangaDetailPage = React.lazy(() => import('../pages/MangaDetailPage'))
const ReaderPage = React.lazy(() => import('../pages/ReaderPage'))
const DownloadsPage = React.lazy(() => import('../pages/DownloadsPage'))
const SettingsPage = React.lazy(() => import('../pages/SettingsPage'))

const pageComponents: Record<PageId, React.ComponentType> = {
  home: HomePage, categories: CategoriesPage, search: SearchPage,
  favorites: FavoritesPage, downloads: DownloadsPage, settings: SettingsPage,
  detail: MangaDetailPage, reader: ReaderPage
}
```

每个 mounted page 独立包裹 boundary，chunk 失败只影响目标页。重试通过更新 boundary key 再次 import；不得直接刷新整个应用窗口。

- [ ] **Step 4: 验证构建拆包**

Run: `npm run build`

Expected: 输出至少包含入口和 lazy 页面 chunk；main/preload/renderer 全部成功。

记录入口 raw/gzip、parse/evaluate 与修改前对照。未达到 25% 时必须说明是否由 trace 达到同等收益，否则回退 lazy 划分。

- [ ] **Step 5: 提交**

```powershell
git add src/renderer/src/App.tsx src/renderer/src/components/PageLoadBoundary.tsx src/renderer/src/components/PageHost.tsx src/renderer/src/pages/index.ts src/main/__tests__/rendererBoundaryContract.test.ts
git commit -m "perf: 按页面拆分渲染器代码"
```

### Task 4: 最终交互与性能验收

**Files:**
- Create: `docs/performance/2026-09-03-renderer-boundaries.md`

- [ ] **Step 1: 执行导航矩阵**

依次访问首页、分类、搜索、收藏、下载、设置、详情、阅读器，再逐页返回；检查页面内容、焦点、标题栏、状态栏和 reader 返回来源。

- [ ] **Step 2: 记录 React 与启动指标**

记录 shell interactive p50/p95、页面切换 input-to-next-paint p50/p95、每种 store 更新触发的 commit 组件，以及入口 chunk raw/gzip。

- [ ] **Step 3: 全量门禁**

Run: `Get-ChildItem src/main/__tests__/*.test.ts | ForEach-Object { npx tsx $_.FullName }`

Run: `npm run build`

Run: `git diff --check`

Expected: 全部通过；shell interactive p95 ≤ 1.2s，页面切换 p95 ≤ 100ms，或记录明确阻塞项且不宣称达标。

- [ ] **Step 4: 提交报告**

```powershell
git add docs/performance/2026-09-03-renderer-boundaries.md
git commit -m "docs: 记录渲染器边界优化结果"
```

## Plan Acceptance

- App 根组件没有全 store 订阅。
- 壳层状态变化只提交实际读取状态的组件。
- 四个重页面形成独立 chunk，失败有局部重试。
- 导航和 reader 返回行为与现状一致。
- 未实现页面 LRU、网格虚拟化或 Worker，避免跨计划耦合。
