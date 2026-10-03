# Warmup State Machine and Content Cache Implementation Plan

> **For implementation:** Execute tasks in order, one task at a time, following the test-driven-development skill; keep the checkbox (`- [ ]`) list updated, and verify each task before moving on.

**Goal:** 让缓存/API 内容不再等待浏览器验证，并把 warmup 和持久内容缓存变成有界、可解释、无竞态的状态机。

**Architecture:** 用共享 discriminated union 取代布尔 warmedUp；只有 BrowserWindow fallback 或图片认证证据才触发验证。内容缓存升级为版本命名空间、LRU/容量上限和合并 flush，继续 stale-first 返回并在后台 single-flight 刷新。

**Tech Stack:** Electron BrowserWindow、TypeScript、Node fs/promises、现有 ContentGateway/ContentCache、tsx。

## Global Constraints

- API、fresh/stale 缓存和本地功能不等待 warmup。
- timeout 必须转为 `failed(timeout)`，绝不能视为 verified。
- 同时最多一个验证流程；所有 waiter 共享结果。
- 缓存默认 fresh 10 分钟、stale 24 小时；最大 10,000 条、64MiB。
- clear 后旧 generation 不得重新落盘；所有正式写入原子 rename。
- 本计划不改变 API schema、图片协议和 renderer 页面 LRU。

---

## File Structure

- `src/shared/sessionWarmupContracts.ts`：状态、失败原因和转换纯类型。
- `src/main/sessionWarmup.ts`：单实例验证协调器。
- `src/main/contentApi.ts`：按 provider 需要触发 warmup。
- `src/main/contentCache.ts`：有界 stale-first 缓存和 flush coordinator。
- `src/renderer/src/pages/HomePage.tsx`：非阻塞验证/刷新状态。
- `src/preload/index.ts`：status、retry、subscribe。
- `src/main/__tests__/sessionWarmupState.test.ts`：状态机和竞态。
- `src/main/__tests__/contentCacheScale.test.ts`：容量、合并写和清理竞态。

### Task 1: Warmup 状态契约

**Files:**
- Create: `src/shared/sessionWarmupContracts.ts`
- Create: `src/main/__tests__/sessionWarmupState.test.ts`

**Interfaces:**
- Produces: `WarmupState = idle | verifying | verified | failed | expired`。
- Produces: `reduceWarmupState(state, event): WarmupState`。

- [ ] **Step 1: 写状态转换红灯测试**

```ts
assert.deepEqual(reduceWarmupState({ phase: 'verifying', attempt: 1 }, { type: 'timeout' }), {
  phase: 'failed', reason: 'timeout', retryable: true
})
assert.throws(() => reduceWarmupState({ phase: 'idle' }, { type: 'verified' }))
assert.deepEqual(reduceWarmupState({ phase: 'verified', verifiedAt: 1 }, { type: 'challenge' }), { phase: 'expired', reason: 'challenge' })
```

- [ ] **Step 2: 运行红灯**

Run: `npx tsx src/main/__tests__/sessionWarmupState.test.ts`

Expected: FAIL，契约文件不存在。

- [ ] **Step 3: 实现封闭状态机并跑绿灯**

verified 事件必须带 `evidence: 'known-page' | 'validated-cookie'`；timeout/error 不能携带 evidence。非法转换抛 `WARMUP_INVALID_TRANSITION`。

Run: `npx tsx src/main/__tests__/sessionWarmupState.test.ts`

Expected: PASS。

- [ ] **Step 4: 提交**

```powershell
git add src/shared/sessionWarmupContracts.ts src/main/__tests__/sessionWarmupState.test.ts
git commit -m "feat: 定义浏览器验证状态机"
```

### Task 2: 单实例 Warmup coordinator

**Files:**
- Modify: `src/main/sessionWarmup.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/__tests__/sessionWarmupState.test.ts`

**Interfaces:**
- Replaces: `isSessionWarmedUp(): boolean`。
- Produces: `getWarmupState()`、`ensureWarmup(reason, hostWindow)`、`retryWarmup(hostWindow)`、`subscribeWarmup(listener)`。

- [ ] **Step 1: 添加并发和清理红灯测试**

断言 10 个并发 ensure 只创建一个验证窗口；timeout 为 failed；窗口关闭 reject 所有 waiter；retry 递增 attempt；app quit 清 timer/listener。

- [ ] **Step 2: 运行红灯**

Run: `npx tsx src/main/__tests__/sessionWarmupState.test.ts`

Expected: FAIL，旧实现仍是布尔接口。

- [ ] **Step 3: 实现 coordinator**

```ts
let activeAttempt: Promise<WarmupState> | null = null
export function ensureWarmup(reason: WarmupReason, host: BrowserWindow): Promise<WarmupState> {
  if (state.phase === 'verified') return Promise.resolve(state)
  if (activeAttempt) return activeAttempt
  activeAttempt = runVerification(reason, host).finally(() => { activeAttempt = null })
  return activeAttempt
}
```

`runVerification` 只有观察到已知页面或有效认证证据才 dispatch verified；setTimeout 只 dispatch timeout。

- [ ] **Step 4: 运行绿灯和构建**

Run: `npx tsx src/main/__tests__/sessionWarmupState.test.ts`

Run: `npm run build`

Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add src/main/sessionWarmup.ts src/main/index.ts src/main/__tests__/sessionWarmupState.test.ts
git commit -m "fix: 修正浏览器验证状态与并发"
```

### Task 3: 内容链路按需验证和 UI

**Files:**
- Modify: `src/main/contentApi.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/pages/HomePage.tsx`
- Modify: `src/main/__tests__/contentApiContract.test.ts`

**Interfaces:**
- Produces preload: `contentWarmupStatus()`、`contentWarmupRetry()`、`onWarmupStateChanged(callback)`。
- Consumes: API/direct 成功不触发 ensure；Browser provider 前调用 ensure。

- [ ] **Step 1: 写非阻塞红灯契约**

断言 content API 在 API/cache 命中时没有 warmup 调用；browser fallback 才调用；HomePage 有 stale 内容时不显示全屏遮罩；failed 显示重试。

- [ ] **Step 2: 运行红灯**

Run: `npx tsx src/main/__tests__/contentApiContract.test.ts`

Expected: FAIL，当前首页/内容仍依赖 warmedUp 布尔状态。

- [ ] **Step 3: 调整 provider 边界与 UI**

把 warmup 放入 Browser provider adapter 的调用前，而非 Gateway 顶层；HomePage 始终先渲染已有数据，状态栏显示“正在更新/需要验证”，仅在完全无内容且 Browser fallback 必需时显示验证视图。

- [ ] **Step 4: 运行绿灯**

Run: `npx tsx src/main/__tests__/contentApiContract.test.ts`

Run: `npx tsx src/main/__tests__/homepageStream.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add src/main/contentApi.ts src/preload/index.ts src/renderer/src/pages/HomePage.tsx src/main/__tests__/contentApiContract.test.ts
git commit -m "perf: 解除首页内容与验证流程耦合"
```

### Task 4: 有界缓存与合并 flush

**Files:**
- Modify: `src/main/contentCache.ts`
- Modify: `src/main/__tests__/contentCache.test.ts`
- Create: `src/main/__tests__/contentCacheScale.test.ts`

**Interfaces:**
- Extends options: `maxEntries=10_000`、`maxBytes=67_108_864`、`flushDelayMs=100`、`namespace`。
- Extends resolution: `{ value; state: 'fresh' | 'stale' | 'miss'; refresh?: Promise<void> }`。

- [ ] **Step 1: 写容量与竞态红灯测试**

使用 fake clock/file port 生成 10,001 条，断言淘汰最旧访问项；连续 100 次 refresh 最多形成一次合并 flush；clear 与旧 refresh 竞态后文件为空；损坏/旧 namespace 视为 miss。

- [ ] **Step 2: 运行红灯**

Run: `npx tsx src/main/__tests__/contentCacheScale.test.ts`

Expected: FAIL，旧 options 不支持容量和 namespace。

- [ ] **Step 3: 实现 LRU 和 flush coordinator**

DiskEntry 增加 `lastAccessedAt`；写入前估算 JSON byteLength 并持续淘汰；timer 到期只序列化一次最新 generation snapshot；`waitForIdle` 必须 flush pending timer。

- [ ] **Step 4: 运行绿灯**

Run: `npx tsx src/main/__tests__/contentCache.test.ts`

Run: `npx tsx src/main/__tests__/contentCacheScale.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add src/main/contentCache.ts src/main/__tests__/contentCache.test.ts src/main/__tests__/contentCacheScale.test.ts
git commit -m "perf: 限制并合并内容缓存写入"
```

### Task 5: 端到端验收

**Files:**
- Create: `docs/performance/2026-09-03-warmup-cache.md`

- [ ] **Step 1: 测试 fresh/stale/miss/offline 矩阵**

分别启动应用，记录 shell 和内容可见时间；stale 刷新失败保留旧内容；expired+offline 显示重试；本地收藏/历史/下载/阅读完整可用。

- [ ] **Step 2: 测试验证生命周期**

覆盖 API 成功、browser challenge、timeout、关闭、retry、并发 fallback 和退出；检查无悬挂窗口/Promise/timer。

- [ ] **Step 3: 全量门禁**

Run: `Get-ChildItem src/main/__tests__/*.test.ts | ForEach-Object { npx tsx $_.FullName }`

Run: `npm run build`

Expected: 全部通过；fresh/stale 内容可见 p95 <300ms。

- [ ] **Step 4: 提交报告**

```powershell
git add docs/performance/2026-09-03-warmup-cache.md
git commit -m "docs: 记录验证与内容缓存优化结果"
```

## Plan Acceptance

- API/cache/local 功能不等待 warmup。
- timeout 不再伪装 verified；并发只产生一个验证流程。
- 10,000 条与 64MiB 上限、合并 flush、clear generation 均有测试。
- stale-first、离线和失败恢复行为明确且无数据回滚。
