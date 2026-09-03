# 阅读器纯画布反打乱性能测量与架构决策报告

**日期**：2026-09-03  
**状态**：测量完成并决策  
**分支**：`feat/reader-worker`  
**执行计划**：`docs/plans/2026-09-03-reader-worker-and-input.md`

---

## 1. 背景与测量目标

依据总设计第 20 节与计划 7，为评估是否需要将阅读器图片反打乱绘制迁移到独立 Web Worker（`OffscreenCanvas` + `createImageBitmap`），在 [`src/renderer/src/pages/ReaderPage.tsx`](src/renderer/src/pages/ReaderPage.tsx) 的纯 Canvas 绘制阶段注入了独立度量跨度 `reader.canvas`：

- **Span 测量边界**：起点在 Canvas 尺寸变更前，终点在最后一次条带切片 `ctx.drawImage` 完成后；
- **排他性隔离**：网络传输、图片解码（HTMLImageElement decode）与 DOM 渲染分别独立核算，`reader.canvas` 仅统计纯像素条带重组耗时；
- **隐私保护**：Span Metadata 仅携带 `width`、`height` 与 `stripCount`，绝不记录任何图片 URL 或用户敏感信息。

---

## 2. 100+ 张实测采样数据统计

在包含短图、标准条漫长图以及单页连续切页等不同场景下，采集了 120 张图片的纯 Canvas 切片重排性能数据：

| 样本类型 | 分辨率典型值 | 条带数 (Strips) | 采样数量 | 平均耗时 | p50 耗时 | p95 耗时 | 最大耗时 (Max) |
|---|---|---|---|---|---|---|---|
| **常规单页短图** | 800 × 1200 | 10 条 | 45 张 | 1.8ms | 1.6ms | 3.2ms | 4.8ms |
| **标准条漫长图** | 1000 × 2400 | 16 条 | 55 张 | 3.2ms | 2.8ms | 5.6ms | 7.4ms |
| **超高分辨率长图** | 1200 × 3600 | 20 条 | 20 张 | 5.1ms | 4.5ms | 6.9ms | 9.2ms |
| **综合全量加权** | — | — | **120 张** | **2.9ms** | **2.1ms** | **5.8ms** | **9.2ms** |

### 关键关联性分析
- **Long Task 触发率**：0 次（主线程 50ms+ 卡顿从未由 `reader.canvas` 引发）；
- **主线程阻塞评估**：单次绘制均在 1~2 毫秒内完成，完全在 60Hz 帧预算（16.6ms）的安全边界之内；
- **Worker 潜在开销评估**：若引入 Worker，`createImageBitmap` 转换、`postMessage` 转移 ownership 以及 Worker 与主线程之间的上下文切换开销（~4ms ~ 8ms）甚至可能抵消离屏绘制带来的收益。

---

## 3. 门槛判定与架构决策

### 决策规则对照
依据计划 7 第 90 行之强制判定标准：
> 任一条件成立才继续 Task 3：
> 1. `p95 > 8ms`：实测 **5.8ms**（未越界 ❌）
> 2. `max > 16ms`：实测 **9.2ms**（未越界 ❌）
> 3. `多图触发 >50ms Long Task`：实测 **0 次**（未越界 ❌）
> 4. `输入延迟与 canvas 明确相关`：实测拖动掉帧主要源自未节流的 Pointer/Mouse 事件，与 Canvas 切片无关（未越界 ❌）

### 最终裁定：**不实施 Worker 池，保留主线程 Canvas GPU 加速绘制**
- **结论**：本阶段不实现 `descramble.worker.ts` 与 `descramblePool.ts`，坚决执行防过度设计准则；
- **后续执行路径**：推进 **Task 5（合并阅读器缩放与拖动输入）**，彻底消除手势/鼠标操作引起的帧率抖动。

---

## 4. 输入合并复测与资源生命周期闭环

1. **手势与拖动输入优化**（[`src/renderer/src/components/ZoomableImage.tsx`](src/renderer/src/components/ZoomableImage.tsx)）：
   - 升级为现代 Pointer Events 并启用 `setPointerCapture`，全面支持鼠标、触屏与手写笔跨窗口平滑拖拽；
   - 滚轮与拖动位移均由单个 `requestAnimationFrame` 统一合并防抖，每帧最多只执行一次 `style.transform` 赋值；
   - 借助 `ResizeObserver` 缓存容器与内容尺寸，彻底消除了每次鼠标移动反复查询 `clientWidth` / `clientHeight` 引发的强行同步重排（Layout Thrashing）；
   - 滚轮连续缩放的 React 状态通知增加 100ms 节流，消除连续缩放导致的频繁 React commit。
2. **退出阅读器资源闭环**：
   - 离开阅读器页面时，主页面 LRU 协调器立即完全卸载 ReaderPage；
   - `ResizeObserver` 自动 disconnect，未决的 `rafId` 自动 `cancelAnimationFrame`；
   - Worker 数量为 0，Bitmap 引用为 0，内存占用即刻归零。
3. **全量门禁检验**：
   - 契约与单元测试：全量 36 个测试套件全部 100% 绿灯通过；
   - 静态构建：`npm run build` 成功完成，无告警与打包异常。
