# JMComic 性能体验优化实施路线图

> 本文件只定义执行顺序和跨计划门禁。任何计划开始前都必须重新确认分支、基线和用户授权。

## 计划清单与顺序

| 顺序 | 计划 | 是否必做 | 前置条件 | 独立验收产物 |
| --- | --- | --- | --- | --- |
| 1 | `2026-09-03-performance-diagnostics.md` | 是 | 总设计批准 | 可重复基线、诊断缓冲与诊断页 |
| 2 | `2026-09-03-renderer-boundaries-and-lazy-loading.md` | 是 | 计划 1 指标可用 | 精确订阅、壳层隔离、页面拆包 |
| 3 | `2026-09-03-image-streaming-priority.md` | 是 | 计划 1 图片指标可用 | 流式响应、优先级、取消、超时 |
| 4 | `2026-09-03-anonymous-app-api-provider.md` | 是 | 公开只读端点获准验证 | API provider 与逐端点回退 |
| 5 | `2026-09-03-warmup-and-content-cache.md` | 是 | 计划 4 至少一个端点稳定 | warmup 状态机、有界 stale-first 缓存 |
| 6 | `2026-09-03-navigation-card-grid-experience.md` | 是 | 计划 2 完成 | 有界页面缓存、滚动快照、卡片体验 |
| 7 | `2026-09-03-reader-worker-and-input.md` | 条件执行 | Canvas 指标超过设计阈值 | Worker 反打乱或保留主线程的书面决策 |
| 8 | `2026-09-03-main-process-io.md` | 条件执行 | main I/O 指标超过设计阈值 | 写入协调或维持现状的书面决策 |
| 9 | `2026-09-03-online-account-runtime.md` | 另行批准 | 匿名 API 稳定且用户再次授权 | 隔离账号运行时；默认无写操作 |

## 跨计划门禁

1. 每个计划单独创建 `feat/` 或 `fix/` 分支；不得在本设计分支实现。
2. 严格执行 TDD：先保存红灯输出，再写最小实现，再保存绿灯输出。
3. 每个任务只提交任务列出的文件；不得夹带格式化或配置变更。
4. 每项性能结论必须包含同设备、同网络、同代理、同缓存状态的前后对照。
5. 每个计划结束时运行所有 `src/main/__tests__/*.test.ts`、`scripts/__tests__/*.test.mjs`、`npm run build` 和 `git diff --check`。
6. 页面顺序、反打乱金样、离线阅读、收藏、历史、下载属于不可回归门禁。
7. 新依赖、真实账号、真实写操作、购买/付费能力分别需要新的明确授权。
8. 任一阶段不达量化收益或增加不可控复杂度，回退当前阶段，不连带推进后续条件计划。
9. Mica/纯色必须先在诊断计划做 A/B；只有稳定回归超过 10% 才另行设计环境自动降级，证据不足时保留手动开关。

## 总设计覆盖映射

| 总设计要求 | 落地计划 |
| --- | --- |
| GPU/长任务/React/Canvas/main I/O 基线与诊断 | performance-diagnostics |
| Zustand 精确订阅、壳层 memo、React.lazy | renderer-boundaries-and-lazy-loading |
| 真流式图片、优先级、取消、超时、重试 | image-streaming-priority |
| 匿名 `/setting`、search/category、album、comic_read | anonymous-app-api-provider |
| Browser warmup 状态机、stale-first、有界内容缓存 | warmup-and-content-cache |
| 页面 LRU、滚动快照、CSS hover、收藏 Set、网格门槛 | navigation-card-grid-experience |
| 反打乱共享算法、条件 Worker、rAF 输入 | reader-worker-and-input |
| 数据库写入、扫描和代理探测条件优化 | main-process-io |
| 隔离 Session、vault、generation、只读账号 | online-account-runtime |
| 统一错误恢复、隐私、离线、Mica A/B | 各计划 Global Constraints 与最终验收 |

## 全量验证命令

```powershell
Get-ChildItem src/main/__tests__/*.test.ts | ForEach-Object { npx tsx $_.FullName }
Get-ChildItem scripts/__tests__/*.test.mjs | ForEach-Object { node --test $_.FullName }
npm run build
git diff --check
git status --short
```

预期：所有测试退出码为 0；构建成功；`git diff --check` 无输出；状态中只出现当前计划声明的文件。
