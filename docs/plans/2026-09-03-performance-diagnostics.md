# Performance Diagnostics Implementation Plan

> **For implementation:** Execute tasks in order, one task at a time, following the test-driven-development skill; keep the checkbox (`- [ ]`) list updated, and verify each task before moving on.

**Goal:** 建立低开销、可脱敏、可重复的 main/renderer 性能采样与内置诊断页，为后续优化提供统一基线。

**Architecture:** 扩展现有 `performanceTraceCore`，用纯函数聚合有界事件；main 保存跨进程事件并只通过只读 IPC 暴露脱敏快照；renderer 独立采集 Long Task、帧间隔和 Canvas span。诊断页最多每 2 秒拉取一次聚合数据，不订阅逐事件流。

**Tech Stack:** Electron 43、TypeScript 5.6、React 18、Fluent UI 9、Node assert/tsx、PerformanceObserver。

## Global Constraints

- 不安装新依赖，不改 `package.json`。
- 日志和导出禁止包含用户名、Cookie、AVS、密码、完整内容 URL 和阅读隐私。
- 默认环形缓冲容量为 1000；诊断页刷新间隔为 2000ms。
- 关闭采样后额外开销目标低于 1%。
- 基线使用 production build、同一设备、同一网络和明确缓存状态。
- 本计划不改变 provider、图片调度、页面保活或反打乱行为。

---

## File Structure

- `src/shared/performanceTraceCore.ts`：事件、环形缓冲、聚合与脱敏纯函数。
- `src/main/performanceTrace.ts`：main 事件入口和只读快照。
- `src/main/performanceDiagnosticsIpc.ts`：诊断 IPC 注册与 GPU/进程摘要。
- `src/renderer/src/performance/rendererMetrics.ts`：Long Task、帧间隔和 renderer span。
- `src/renderer/src/pages/PerformanceDiagnosticsPage.tsx`：低频只读诊断 UI。
- `src/preload/index.ts`：最小诊断桥接接口。
- `src/main/__tests__/performanceMetricsCore.test.ts`：聚合、容量、脱敏测试。
- `src/main/__tests__/performanceDiagnosticsContract.test.ts`：IPC 与 UI 静态契约。
- `docs/performance/2026-09-03-baseline-v2.md`：实测环境和基线结果。

### Task 1: 聚合与脱敏核心

**Files:**
- Modify: `src/shared/performanceTraceCore.ts`
- Create: `src/main/__tests__/performanceMetricsCore.test.ts`

**Interfaces:**
- Consumes: `PerfEvent`, `PerfEventBuffer`。
- Produces: `PerfSummary`, `summarizePerfEvents(events)`, `sanitizePerfEvent(event)`。

- [ ] **Step 1: 写失败测试**

```ts
import assert from 'node:assert/strict'
import { sanitizePerfEvent, summarizePerfEvents } from '../../shared/performanceTraceCore'

const summary = summarizePerfEvents([
  { name: 'image.request', phase: 'finish', elapsedMs: 10, outcome: 'ok', metadata: { provider: 'api' } },
  { name: 'image.request', phase: 'finish', elapsedMs: 30, outcome: 'timeout', metadata: { provider: 'api' } }
])
assert.deepEqual(summary['image.request'].count, 2)
assert.equal(summary['image.request'].p50Ms, 10)
assert.equal(summary['image.request'].maxMs, 30)

const safe = sanitizePerfEvent({
  name: 'content.request', phase: 'finish', elapsedMs: 1, metadata: { url: 'https://secret/a', provider: 'api' }
})
assert.deepEqual(safe.metadata, { provider: 'api' })
```

- [ ] **Step 2: 运行并确认红灯**

Run: `npx tsx src/main/__tests__/performanceMetricsCore.test.ts`

Expected: FAIL，提示 `sanitizePerfEvent` 或 `summarizePerfEvents` 未导出。

- [ ] **Step 3: 写最小实现**

```ts
export interface PerfMetricSummary {
  count: number
  ok: number
  error: number
  cancelled: number
  timeout: number
  p50Ms: number
  p95Ms: number
  maxMs: number
}

export type PerfSummary = Record<string, PerfMetricSummary>

const SAFE_METADATA = new Set([
  'page', 'provider', 'cacheState', 'fallback', 'priority', 'outcome',
  'width', 'height', 'stripCount', 'bytes', 'batchSize', 'inputType'
])

export function sanitizePerfEvent(event: PerfEvent): PerfEvent {
  return { ...event, metadata: Object.fromEntries(Object.entries(event.metadata).filter(([key]) => SAFE_METADATA.has(key))) }
}
```

`summarizePerfEvents` 必须按 name 分组、升序取 nearest-rank p50/p95，并分别累计四种 outcome；不得保存原事件引用。

- [ ] **Step 4: 运行目标测试**

Run: `npx tsx src/main/__tests__/performanceMetricsCore.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add src/shared/performanceTraceCore.ts src/main/__tests__/performanceMetricsCore.test.ts
git commit -m "feat: 添加性能指标聚合与脱敏"
```

### Task 2: Main 诊断快照与 IPC

**Files:**
- Modify: `src/main/performanceTrace.ts`
- Create: `src/main/performanceDiagnosticsIpc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Create: `src/main/__tests__/performanceDiagnosticsContract.test.ts`

**Interfaces:**
- Consumes: `sanitizePerfEvent`, `summarizePerfEvents`, Electron `app.getGPUFeatureStatus()`、`app.getAppMetrics()`。
- Produces: `PerformanceDiagnosticsSnapshot`、`registerPerformanceDiagnosticsIpc()`、preload 的 `performanceRecord(event)`、`performanceSnapshot()`、`performanceClear()`。

- [ ] **Step 1: 写 IPC 契约红灯测试**

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const preload = readFileSync('src/preload/index.ts', 'utf8')
const ipc = readFileSync('src/main/performanceDiagnosticsIpc.ts', 'utf8')
assert.match(preload, /performanceSnapshot.*performance:snapshot/s)
assert.match(preload, /performanceClear.*performance:clear/s)
assert.match(preload, /performanceRecord.*performance:record/s)
assert.match(ipc, /app\.getGPUFeatureStatus\(\)/)
assert.match(ipc, /app\.getAppMetrics\(\)/)
assert.doesNotMatch(ipc, /cookies|getPassword|authGet/i)
```

- [ ] **Step 2: 运行并确认红灯**

Run: `npx tsx src/main/__tests__/performanceDiagnosticsContract.test.ts`

Expected: FAIL，文件不存在。

- [ ] **Step 3: 定义快照并注册只读 IPC**

```ts
export interface PerformanceDiagnosticsSnapshot {
  capturedAt: number
  versions: Record<string, string>
  gpu: { featureStatus: Electron.GPUFeatureStatus; active?: string }
  processes: Array<{ type: string; cpuPercent: number; memoryKb: number }>
  summary: PerfSummary
  counts: { buffered: number }
}

export function registerPerformanceDiagnosticsIpc(): void {
  ipcMain.on('performance:record', (_event, candidate: unknown) => {
    const event = parseRendererPerfEvent(candidate)
    if (event) pushMainPerfEvent(sanitizePerfEvent(event))
  })
  ipcMain.handle('performance:snapshot', () => createDiagnosticsSnapshot())
  ipcMain.handle('performance:clear', () => clearMainPerfEvents())
}
```

`createDiagnosticsSnapshot()` 只能读取已脱敏 buffer；active GPU 名称来自 Electron GPU info，取不到时省略，不猜测设备。

- [ ] **Step 4: 接入 preload 与启动注册**

```ts
performanceRecord: (event: unknown) => ipcRenderer.send('performance:record', event),
performanceSnapshot: () => ipcRenderer.invoke('performance:snapshot'),
performanceClear: () => ipcRenderer.invoke('performance:clear'),
```

`parseRendererPerfEvent` 必须限制 name/phase/outcome、metadata key 数量、字符串长度和 elapsedMs 范围；renderer 输入在校验前不得写入缓冲或日志。

在 `src/main/index.ts` app ready 后调用一次 `registerPerformanceDiagnosticsIpc()`；不得重复注册 handler。

- [ ] **Step 5: 运行目标测试和类型构建**

Run: `npx tsx src/main/__tests__/performanceDiagnosticsContract.test.ts`

Expected: PASS。

Run: `npm run build`

Expected: main、preload、renderer 均构建成功。

- [ ] **Step 6: 提交**

```powershell
git add src/main/performanceTrace.ts src/main/performanceDiagnosticsIpc.ts src/main/index.ts src/preload/index.ts src/main/__tests__/performanceDiagnosticsContract.test.ts
git commit -m "feat: 暴露脱敏性能诊断快照"
```

### Task 3: Renderer 指标和诊断页

**Files:**
- Create: `src/renderer/src/performance/rendererMetrics.ts`
- Create: `src/renderer/src/pages/PerformanceDiagnosticsPage.tsx`
- Modify: `src/renderer/src/pages/SettingsPage.tsx`
- Modify: `src/renderer/src/pages/index.ts`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/main/__tests__/performanceDiagnosticsContract.test.ts`

**Interfaces:**
- Produces: `startRendererMetrics(sink): () => void`、`recordRendererSpan(name, metadata)`。
- Consumes: `window.electronAPI.performanceSnapshot()`。

- [ ] **Step 1: 扩充失败契约**

```ts
const metrics = readFileSync('src/renderer/src/performance/rendererMetrics.ts', 'utf8')
const page = readFileSync('src/renderer/src/pages/PerformanceDiagnosticsPage.tsx', 'utf8')
assert.match(metrics, /PerformanceObserver/)
assert.match(metrics, /requestAnimationFrame/)
assert.match(page, /2000/)
assert.match(page, /performanceSnapshot/)
assert.match(page, /performanceClear/)
```

- [ ] **Step 2: 运行并确认红灯**

Run: `npx tsx src/main/__tests__/performanceDiagnosticsContract.test.ts`

Expected: FAIL，renderer 指标文件不存在。

- [ ] **Step 3: 实现有界 renderer 采样器**

```ts
export type RendererMetricSink = (event: PerfEvent) => void

export function startRendererMetrics(sink: RendererMetricSink): () => void {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) sink({ name: 'renderer.long-task', phase: 'finish', elapsedMs: entry.duration, metadata: {} })
  })
  observer.observe({ type: 'longtask', buffered: true })
  let frame = requestAnimationFrame(sampleFrame)
  return () => { observer.disconnect(); cancelAnimationFrame(frame) }
}
```

入口使用 `startRendererMetrics((event) => window.electronAPI.performanceRecord(event))`。实际实现中 `sampleFrame` 只保留聚合需要的间隔，页面卸载后停止；不允许每帧 `setState`。

- [ ] **Step 4: 实现诊断页**

诊断页进入后立即读取一次，之后用 2000ms interval；离开页面清理 timer。显示版本、GPU、进程、provider/cache、图片、Long Task、Canvas 和数据库聚合；复制和导出仅使用快照 JSON。

- [ ] **Step 5: 运行测试与构建**

Run: `npx tsx src/main/__tests__/performanceDiagnosticsContract.test.ts`

Expected: PASS。

Run: `npm run build`

Expected: 构建成功，诊断页成为独立 renderer chunk 或包含于 Settings chunk。

- [ ] **Step 6: 提交**

```powershell
git add src/renderer/src/performance/rendererMetrics.ts src/renderer/src/pages/PerformanceDiagnosticsPage.tsx src/renderer/src/pages/SettingsPage.tsx src/renderer/src/pages/index.ts src/renderer/src/App.tsx src/main/__tests__/performanceDiagnosticsContract.test.ts
git commit -m "feat: 添加内置性能诊断页面"
```

### Task 4: 采集 V2 基线并写报告

**Files:**
- Modify: `scripts/summarize-performance.mjs`
- Modify: `scripts/__tests__/summarize-performance.test.mjs`
- Create: `docs/performance/2026-09-03-baseline-v2.md`

**Interfaces:**
- Consumes: 脱敏 `[perf]` JSONL。
- Produces: 按 provider/cacheState/priority 分组的 p50/p95/max 表。

- [ ] **Step 1: 添加分组统计失败测试**

测试夹具必须包含 ok、timeout、cancelled 以及两个 provider，断言取消不计入成功率，且不同缓存状态不混算。

- [ ] **Step 2: 运行红灯**

Run: `node --test scripts/__tests__/summarize-performance.test.mjs`

Expected: FAIL，缺少分组字段。

- [ ] **Step 3: 扩展汇总脚本并跑绿灯**

Run: `node --test scripts/__tests__/summarize-performance.test.mjs`

Expected: PASS。

- [ ] **Step 4: 采集固定矩阵**

采集 10 次冷启动、10 次热导航、64 次网络图片 miss、64 次图片 hit、10 组阅读滚动；记录 Windows 版本、CPU、GPU、DPI、代理、缓存状态、应用 commit 和网络环境。Canvas-only 不包含网络及 decode。另对 Mica 开/关各采集 10 组窗口拖动、页面滚动和空闲 GPU/CPU；远程桌面或节能模式仅在环境可用时采集，不能伪造样本。

- [ ] **Step 5: 写入基线并验证隐私**

Run: `rg -n 'Cookie|AVS|password|https?://' docs/performance/2026-09-03-baseline-v2.md`

Expected: 只允许参考资料 URL；不得出现内容/CDN URL 或凭据。

- [ ] **Step 6: 全量门禁与提交**

Run: `Get-ChildItem src/main/__tests__/*.test.ts | ForEach-Object { npx tsx $_.FullName }`

Run: `npm run build`

Expected: 全部通过。

```powershell
git add scripts/summarize-performance.mjs scripts/__tests__/summarize-performance.test.mjs docs/performance/2026-09-03-baseline-v2.md
git commit -m "docs: 记录性能诊断 V2 基线"
```

## Plan Acceptance

- 所有指标能区分 provider、fallback、cacheState 和 cancellation。
- 诊断缓冲最多 1000 条，UI 每 2 秒刷新，关闭页面停止更新。
- 导出和日志不含敏感字段或完整内容 URL。
- 关闭采样后开销低于 1%，否则默认禁用 renderer 采样。
- 生成 V2 基线后才允许执行后续性能计划。
- Mica 若使帧间隔或 GPU/CPU p95 稳定恶化超过 10%，在报告中提出“特定环境自动纯色”的独立决策；证据不足时维持用户手动开关。
