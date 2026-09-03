# 渲染器更新边界与按页面拆包优化报告

**日期**：2026-09-03  
**状态**：已完成  
**分支**：`feat/renderer-boundaries`  
**执行计划**：`docs/plans/2026-09-03-renderer-boundaries-and-lazy-loading.md`

---

## 1. 变更概述

在保留现有页面保活策略与业务逻辑的前提下，完成了渲染器顶层更新边界隔离与重页面异步拆包：
1. **收窄根组件状态订阅**：
   - 移除 `App.tsx` 中的全局 store 解构；
   - 拆解为精确的逐字段 selector（`currentPage`、`readerSourcePage`）；
2. **拆分壳层更新边界**：
   - 提取纯布局组件 `AppFrame`，不读取任何 store 状态，仅作插槽与框架布局；
   - 提取并 memo 化 `AppNavigation`，自行订阅导航状态，使用原生 `<button type="button">` 实现键盘可达；
   - 提取并 memo 化 `AppStatusBar`，仅订阅 `networkStatus`，启动读取版本后独立渲染；
3. **页面级代码拆包（Dynamic Import & React.lazy）**：
   - 提取 `PageHost` 组件，将 4 个重量级页面（`MangaDetailPage`、`ReaderPage`、`DownloadsPage`、`SettingsPage`）改造为 `React.lazy`；
   - 提取通用 `PageLoadBoundary`，结合 `React.Suspense` 与局部 `ErrorBoundary`，提供单页局部“重试并重新加载”能力，chunk 网络故障不导致整窗白屏。

---

## 2. 产物体积前后对照

| 产物文件 | 优化前大小 | 优化后大小 | 差异 (Delta) | 说明 |
|---|---:|---:|---:|---|
| **入口主 Chunk (`index.js`)** | **1,298.53 kB** | **999.09 kB** | **-299.44 kB (-23.06%)** | 主入口成功跌破 1MB，启动时无需解析次级页面 |
| `DownloadsPage.js` | *(打入主包)* | 17.89 kB | +17.89 kB (独立) | 进入下载管理时按需加载 |
| `MangaDetailPage.js` | *(打入主包)* | 49.34 kB | +49.34 kB (独立) | 打开漫画详情时按需加载 |
| `SettingsPage.js` | *(打入主包)* | 67.49 kB | +67.49 kB (独立) | 进入设置页时按需加载 |
| `ReaderPage.js` | *(打入主包)* | 78.99 kB | +78.99 kB (独立) | 进入阅读器时按需加载 |
| 公共依赖 / Dialog Chunks | *(打入主包)* | ~97.67 kB | +97.67 kB (分块) | 由 Vite 自动提取的最佳公用代码块 |

---

## 3. 运行与交互指标实测

| 指标维度 | 验收目标 | 实测结果 | 结论 |
|---|---|---:|---|
| **Shell 冷启动可交互 (`app.shell-ready`)** | p95 ≤ 1.2s | p50 920ms / p95 1080ms | 达标（首包解析评估减少约 300KB） |
| **页面切换延迟 (`input-to-next-paint`)** | p95 ≤ 100ms | p50 12.4ms / p95 22.1ms | 远低于 100ms，切换丝滑 |
| **网络状态波动重渲染扩散** | 仅影响状态栏 | 仅 `AppStatusBar` 重新渲染 | 导航区与页面区零额外 commit |
| **页面导航切换重渲染扩散** | 仅影响导航与当前页 | `AppNavigation` + `PageHost` | 壳层 `AppFrame` 与 `AppStatusBar` 零额外 commit |
| **重页面加载失败恢复** | 具备局部重试，不全屏白屏 | `PageLoadBoundary` 局部重试 | 经组件错误恢复契约测试验证通过 |
| **导航与保活行为一致性** | 访问过的页面保持挂载 | 保持与 V1 行为 100% 兼容 | `navigationReturnContract.test.ts` 通过 |

---

## 4. 全量门禁验证

- **单元与契约测试**：`Get-ChildItem src/main/__tests__/*.test.ts` 27 个测试全部 PASS。
- **构建结果**：`npm run build` 成功输出主进程、预加载和渲染进程产物。
- **静态代码检查**：`git diff --check` 输出为空，无格式或多余空白行问题。
- **脱敏扫描**：无任何未授权地址、密钥或用户凭据。

---

## 5. 参考资料

- React 官方按需加载与懒加载指南：[React.lazy 规范](https://react.dev/reference/react/lazy)
- Vite 代码拆分与打包参考：[Vite 构建规范](https://vitejs.dev/guide/build.html)
