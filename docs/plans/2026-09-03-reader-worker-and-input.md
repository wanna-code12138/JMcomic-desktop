# Reader Worker and Input Implementation Plan

> **For implementation:** Execute tasks in order, one task at a time, following the test-driven-development skill; keep the checkbox (`- [ ]`) list updated, and verify each task before moving on.

**Goal:** 在指标证明必要时把图片反打乱移出 renderer 主线程，并把缩放/拖动合并为每帧最多一次更新。

**Architecture:** 先提取共享条带坐标纯函数并建立 Canvas-only 指标；只有 p95>8ms、max>16ms 或与 Long Task 明确相关时才创建 Worker。Worker 使用 createImageBitmap + OffscreenCanvas，池大小默认 1、最多 2，结果通过 transferable ImageBitmap 返回并带 generation 防迟到。

**Tech Stack:** Web Worker、OffscreenCanvas、createImageBitmap、Canvas 2D、Pointer Events、rAF、ResizeObserver、TypeScript。

## Global Constraints

- 页面顺序、MD5 输入、阈值、条带数、余数位置和 drawImage 坐标冻结。
- renderer、Worker、下载路径必须通过同一批逐像素金样。
- 未达到触发阈值时禁止实现 Worker，只提交“保留主线程”决策报告。
- pool 默认 1，实测最多 2；不预处理整章。
- reader 离开必须释放 Worker、ImageBitmap、rAF、监听器和任务。

---

## File Structure

- `src/shared/imageDescrambleCore.ts`：MD5、条带数和坐标纯函数。
- `src/renderer/src/workers/descramble.worker.ts`：Worker 绘制适配器。
- `src/renderer/src/reader/descramblePool.ts`：优先队列、generation、取消。
- `src/renderer/src/pages/ReaderPage.tsx`：调用池与显示结果。
- `src/renderer/src/components/ZoomableImage.tsx`：Pointer/rAF 输入。
- `src/main/imageDescrambler.ts`：调用共享坐标。
- `src/main/__tests__/imageDescrambleCore.test.ts`：纯函数和金样。
- `src/main/__tests__/readerWorkerContract.test.ts`：生命周期契约。

### Task 1: 共享反打乱数学

**Files:**
- Create: `src/shared/imageDescrambleCore.ts`
- Modify: `src/main/imageDescrambler.ts`
- Modify: `src/renderer/src/pages/ReaderPage.tsx`
- Create: `src/main/__tests__/imageDescrambleCore.test.ts`

**Interfaces:**
- Produces: `getDescrambleStripCount(scrambleId, aid, filename)`。
- Produces: `buildDescrambleSlices(width, height, strips): readonly { srcY; dstY; height }[]`。

- [ ] **Step 1: 写现有行为金样红灯**

从现有 main/renderer 契约复制边界样本，覆盖 scrambleId=0、aid<scrambleId、268850/421926 边界、余数为 0/非 0；断言具体 strips 和坐标数组。

- [ ] **Step 2: 运行红灯**

Run: `npx tsx src/main/__tests__/imageDescrambleCore.test.ts`

Expected: FAIL，共享模块不存在。

- [ ] **Step 3: 提取，不改算法**

main 和 renderer 删除各自重复数学，仅遍历共享 slices 执行 drawImage；不得借机重命名阈值或“简化”余数公式。

- [ ] **Step 4: 运行全部正确性契约**

Run: `npx tsx src/main/__tests__/imageDescrambleCore.test.ts`

Run: `npx tsx src/main/__tests__/imageCorrectnessContract.test.ts`

Run: `npx tsx src/main/__tests__/downloadCore.test.ts`

Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```powershell
git add src/shared/imageDescrambleCore.ts src/main/imageDescrambler.ts src/renderer/src/pages/ReaderPage.tsx src/main/__tests__/imageDescrambleCore.test.ts
git commit -m "refactor: 统一图片反打乱坐标算法"
```

### Task 2: Canvas 决策测量

**Files:**
- Modify: `src/renderer/src/pages/ReaderPage.tsx`
- Create: `docs/performance/2026-09-03-reader-canvas-decision.md`

- [ ] **Step 1: 增加纯 Canvas span**

span 起点在 canvas resize 前，终点在最后一个 drawImage 后；metadata 仅 width/height/stripCount，不含 URL；decode/network 另计。

- [ ] **Step 2: 采集至少 100 张**

覆盖短图、长图、连续快速滚动和单页切换，报告 p50/p95/max、Long Task 相关性和内存峰值。

- [ ] **Step 3: 执行决策**

任一条件成立才继续 Task 3：p95>8ms、max>16ms、多图触发 >50ms Long Task、输入延迟与 canvas 明确相关。否则跳到 Task 5，只优化输入并提交不实施 Worker 的报告。

- [ ] **Step 4: 提交报告**

```powershell
git add src/renderer/src/pages/ReaderPage.tsx docs/performance/2026-09-03-reader-canvas-decision.md
git commit -m "perf: 测量阅读器纯画布耗时"
```

### Task 3: 条件 Worker 池

**Files:**
- Conditional Create: `src/renderer/src/workers/descramble.worker.ts`
- Conditional Create: `src/renderer/src/reader/descramblePool.ts`
- Conditional Create: `src/main/__tests__/readerWorkerContract.test.ts`

**Interfaces:**
- Produces: `DescrambleRequest { id; generation; priority; bitmap; width; height; slices }`。
- Produces: `DescramblePool.run(request): Promise<ImageBitmap>`、`cancel(id)`、`dispose()`。

- [ ] **Step 1: 写 pool 红灯测试**

使用 fake Worker，断言默认只发一个任务、near 超过 background、cancel 丢弃结果、旧 generation 关闭 bitmap、crash 只重试/回退一次、dispose 终止全部。

- [ ] **Step 2: 运行红灯**

Run: `npx tsx src/main/__tests__/readerWorkerContract.test.ts`

Expected: FAIL，pool 不存在。

- [ ] **Step 3: 实现 worker 与 pool**

Worker 接收 transferable bitmap，OffscreenCanvas 按 slices 绘制，返回 `transferToImageBitmap()`；finally 关闭输入 bitmap。Pool 只解析调度，不复制像素。

- [ ] **Step 4: 跑绿灯和构建**

Run: `npx tsx src/main/__tests__/readerWorkerContract.test.ts`

Run: `npm run build`

Expected: PASS，worker 形成独立 bundle。

- [ ] **Step 5: 提交**

```powershell
git add src/renderer/src/workers/descramble.worker.ts src/renderer/src/reader/descramblePool.ts src/main/__tests__/readerWorkerContract.test.ts
git commit -m "perf: 添加有界图片反打乱 Worker 池"
```

### Task 4: 条件接入 ReaderPage

**Files:**
- Modify: `src/renderer/src/pages/ReaderPage.tsx`
- Modify: `src/main/__tests__/readerWorkerContract.test.ts`

- [ ] **Step 1: 写迟到与回退红灯测试**

断言 page/generation 不匹配不绘制；离开虚拟窗口 cancel；Worker error 当前图仅回退主线程一次；unmount dispose。

- [ ] **Step 2: 运行红灯并实现**

Run: `npx tsx src/main/__tests__/readerWorkerContract.test.ts`

Expected: 先 FAIL；实现后 PASS。

- [ ] **Step 3: 逐像素和真实章节验收**

Run: `npx tsx src/main/__tests__/imageCorrectnessContract.test.ts`

Expected: PASS；真实章节抽样截图像素一致。

- [ ] **Step 4: 提交**

```powershell
git add src/renderer/src/pages/ReaderPage.tsx src/main/__tests__/readerWorkerContract.test.ts
git commit -m "perf: 接入阅读器反打乱 Worker"
```

### Task 5: Pointer/rAF 缩放拖动

**Files:**
- Modify: `src/renderer/src/components/ZoomableImage.tsx`
- Create: `src/main/__tests__/zoomInputContract.test.ts`

- [ ] **Step 1: 写失败契约**

断言使用 Pointer Events、ResizeObserver、requestAnimationFrame；mousemove/wheel handler 不调用 React setState；cleanup cancelAnimationFrame 并释放 pointer capture。

- [ ] **Step 2: 运行红灯**

Run: `npx tsx src/main/__tests__/zoomInputContract.test.ts`

Expected: FAIL，当前使用 MouseEvent 且每事件写 transform。

- [ ] **Step 3: 实现每帧一次提交**

wheel/pointermove 只更新 pending refs；`scheduleTransform()` 保证单个 rAF；ResizeObserver 缓存 viewport/image rect；缩放显示值最多每 100ms同步到 React。

- [ ] **Step 4: 验证并提交**

Run: `npx tsx src/main/__tests__/zoomInputContract.test.ts`

Run: `npm run build`

Expected: PASS。

```powershell
git add src/renderer/src/components/ZoomableImage.tsx src/main/__tests__/zoomInputContract.test.ts
git commit -m "perf: 合并阅读器缩放与拖动输入"
```

### Task 6: 收益复测与保留门禁

- [ ] **Step 1:** 重跑 Task 2 完全相同样本。
- [ ] **Step 2:** Worker 后 renderer Long Task 至少下降 50%；否则撤回 Task 3/4，保留共享算法和输入优化。
- [ ] **Step 3:** 检查 reader 离开后 worker=0、bitmap=0、pending=0、listener/rAF=0。
- [ ] **Step 4:** 全量测试与 build 通过后更新决策报告并提交。

## Plan Acceptance

- 逐像素金样 100% 一致。
- Worker 只有指标触发且能使 Long Task 下降 ≥50% 才保留。
- 快速翻页无迟到结果，离开 reader 资源归零。
- 缩放/拖动每帧最多一次 transform 写入。
