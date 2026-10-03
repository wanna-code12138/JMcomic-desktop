# 项目收敛、阅读器与离线库实施记录

> 2026-09-29 验收范围纠正：这里保留历史合成测试与性能数据。后续交付的 1.0.5 实际存在独立 EXE 启动、验证时机和开发阅读加载回归，不能据此报告声称交付包基础功能均已通过。原因和修复证据见 [1.0.6 修复报告](2026-09-29-startup-reader-regressions.md)。

日期：2026-09-29。基线：`main@4a78cc6`；工作分支：`feat/project-improvement-review`。

原批准方案的可靠性、清理、阅读会话、离线库和受控消融已实施并完成下述本地验证。本报告的界面和性能数字保留为整页阅读器阶段的历史基线。用户随后批准的 Codex 三栏标签布局已继续实施，当前新增行为、审计修复与性能复测见 [三栏工作区验收](2026-09-29-three-pane-results.md)。尚未合入 main 或发布。

## 实际改动

| 范围 | 已交付行为 |
| --- | --- |
| 版本收敛 | 整合性能与清理分支，保留已有页面拆包、缓存、网关和调度成果；清理 13 个无独有成果的旧分支标签 |
| 阅读正确性 | 页码按实际可见位置计算，保存页内偏移；模式、图片解码和窗口变化后保持锚点；章节/会话身份隔离迟到保存 |
| 阅读交互 | 连续滚动与单页、适宽/适高/原始尺寸、缩放与宽度偏好、左右方向、键盘与输入焦点隔离、拖动、目录与附近缩略图、页码跳转、全屏及工具栏自动隐藏 |
| 阅读失败恢复 | 单页错误单独重试；偏好写入失败保留待保存内容；首次历史记录写入失败可重新保存，不永久卡住退出 |
| 下载与离线 | 以实际成功页数统计，失败不可伪装完成；缺页按原页序修复；反打乱失败不保存错误成品；稳定作品/章节 ID 目录兼容旧标题目录 |
| CBZ | 只选择完成且扫描齐全的章节，按章节/页序无损归档；临时文件、同步后原子替换；导出、重试、删除和关窗共享目录占用与取消规则 |
| 数据与退出 | 共享初始化、异步合并写、临时文件/fsync/备份/替换；主库损坏时校验备份并保留原文件；渲染器确认保存后停止下载/导出，再排空并关闭数据库 |
| 并发边界 | 共享图片消费者独立取消；槽位持有到响应体完成；停止后禁止迟到入队/导出；删除跨 await 持有全部目录锁；DB close 等待后续 writer |
| 下载页开销 | 普通进度更新内存摘要；未知任务/终态合并刷新，摘要请求串行；请求期间的新事件覆盖旧快照，合法重试归零也不被回滚 |
| 维护性 | 阅读会话、图像、几何和工具栏拆分；共享阅读/下载 DTO 与生产反打乱算法；移除无调用 stream、旧 ZoomableImage、重复测试算法和废弃导出；修订 README/架构/贡献说明 |
| 工具链 | 统一测试、类型检查与构建入口，CI 包含类型检查；新增实际 Electron 旅程与故障夹具；当前生产依赖 audit 为 0 |

保留匿名 API、直接网页、浏览器回退及 Cloudflare 验证路径。故障矩阵证明浏览器回退仍覆盖独有场景；正常网络下某条路径较慢不能构成删除依据。

## 整页阅读器阶段验证证据

```text
npm test
TOTAL=70 PASSED=70 FAILED=0

npm run typecheck
tsc --noEmit：退出 0

npm run build
main 216.67 kB / preload 7.60 kB
renderer 入口 1,005.50 kB / Reader 懒加载 92.10 kB
退出 0；正常产物不含临时 overscan 控制

npm audit --omit=dev --json
vulnerabilities.total = 0
```

构建仍有两项现存提示：`sessionWarmup.ts` 动态导入的 `networkProbe`、`httpClient` 同时被其他模块静态导入，因此不会拆成单独 chunk。它们不阻断构建；未把这两个动态导入描述为已取得额外拆包收益。构建字节数不是加载耗时。

实际 Electron 使用合成内容、隔离应用数据和真实生产 main/preload/renderer。关键输出如下：

- [最终完整旅程](reader-qa/reader-final-20260929/result.json)：真实加密 API 夹具、图片协议、Chromium 解码、实际可见页保存、模式与偏移、焦点/方向、单页失败重试、目录/全屏/返回、36 页下载与补缺、CBZ、纯本地阅读、正常关窗落盘全部通过。下载期间全库摘要查询总计 4 次，而不是逐页扫描。
- [冷进程续读](reader-qa/reader-final-20260929/restart-result.json)：第 36 页、离线来源、110% 缩放和本地章节目录恢复通过。
- [偏好失败重试红灯](reader-qa/preference-retry-red-20260929/result.json) → [修复后通过](reader-qa/preference-retry-green-20260929/result.json)：原先退出后 `1 != 1.1`，现在待保存缩放能重试落盘。
- [历史首次写入失败红灯](reader-qa/history-retry-red-20260929/result.json) → [修复后通过](reader-qa/history-retry-green-20260929/result.json)：原先无法恢复离开，现在重试初始记录后保存当前位置。
- `downloadSummaryRace.test.ts`：真实页面回调在旧摘要返回后把 `8 → 3`、`downloading/0 → failed/8` 的两个失败用例，修复后均通过。
- [最终打包回归](reader-qa/packaged-final-20260929/result.json)：Windows 目录打包成功；依赖与 SQL WebAssembly 均确实位于 app.asar；包内主进程经过下载 IPC、实际 Canvas 23 行逐像素金样、无损 PNG、本地协议和 CBZ 成功。不是仅运行一份复制的测试算法。
- 显示缩放 100%、125%、150%、200%，每组 960×640 与 1280×860、应用浅/深主题，共 16 个布局：真实 DPR 与控件边界断言通过，16 张截图经独立逐张检查，主线程复查代表截图。阅读器本身保持深色；应用强制缩放不能代替物理多屏切换验收。
- [三次匿名真实网络检查](ablations/public-network.json)：均 HTTP 200，完整 bootstrap 分别 1179.6、788.5、1046.9ms；仅请求公开配置，不作为漫画加载速度基准。

代表截图：[窄窗口](reader-qa/reader-final-20260929/reader-compact.png)、[目录和选中页](reader-qa/reader-final-20260929/reader-directory.png)、[冷启动离线续读](reader-qa/reader-final-20260929/reader-restarted-offline.png)。合成条纹页只用于几何、页序和覆盖验证，不代表真实漫画画质。

## 消融结果与保留理由

模块原始数据在 [mechanisms.json](ablations/mechanisms.json)。真实 Chromium 阅读数据汇总在 [reader.json](ablations/reader.json)，每组原始逐事件数据均以 `.raw.json.gz` 保存，汇总记录原始 SHA256。无效的早期“冷缓存”试跑因未绕过 Chromium 解码缓存而弃用，未纳入结论。

本机环境为 Windows 11 10.0.26100、AMD Ryzen AI 7 H 350、约 31GiB 内存、Electron 43.2.0。机制实验和真实 UI 实验分开进行，不能把模块耗时直接解释为帧率收益。

| 机制 | 实验与结果 | 决策 |
| --- | --- | --- |
| 内容缓存 | 每组 10 次探索 + 50 次确认；20 次同键读取，缓存开/关的 provider 调用为 1/20，中位总耗时 13.0/308.2ms | 保留内存/持久缓存及字节预算，重复读取有实际收益 |
| 后台下载配额 | 每组 50 次交错确认；固定延迟、共享 8MiB/s、两 CDN；关键图片排队中位数 0.039ms，对照无限后台配额 61.177ms | 保留全局 6、每主机 4、后台 2；承认整批合成下载中位数 340ms 对 230ms 的吞吐取舍，优先正在阅读的内容 |
| DB 合并写 | 每组 50 次；20 次分散更新、实际 SQL 导出/磁盘同步；合并/逐次写中位次数 12/20，总耗时 190.6/317.9ms；每轮磁盘末值均为 20 | 保留合并及关键 flush；不是把现实更新伪造成只需一次写入 |
| DB Worker | 256KiB 种子库，合并组单轮同步导出最大值的 p95 为 0.638ms | 该规模未证明增加数据库 Worker/更换 SQLite 的必要性；更大库仍需单独测量 |
| 内容回退 | 20 个故障场景，全链 20/20；删浏览器层仅 17/20；删 API/直接层增加后续回退调用 | 保留有独有价值的回退 |
| 页面保活 | 相同 60 次页面访问，1 页/3 页上限对应 60/3 次挂载；保留同一滚动快照 | 保留最多 3 个主页面的有界策略，不无界保活 |
| 近页预取 | 0/1/2 页各 10 次探索；不预取的下一页等待中位 240ms；1 页和 2 页普通翻页均约 16ms | 不删除近页预取；继续看快速翻页取舍 |
| 快速翻页确认 | 1 页与 2 页各 50 次交错，逐页间隔 50ms，共每组 100 次翻页；1/2 页首图中位 422.1/514.4ms，翻页 p95 254.9/17.9ms | 保留 2 页，首图约多等 92ms，换取连续快翻的稳定性；本夹具多传 106,113 字节 |
| 热缓存重复阅读 | 50 次；首图中位 23.8ms、p95 30.6ms；100 次翻页 p95 17.4ms；每轮全部可见 rAF 间隔 p95 约 6.2ms | 热缓存目标在本夹具达成；第一轮还加载后续页，此后 49 轮无新增图片传输 |
| Canvas 与动效 | 实际反打乱路径进入测试，热组每轮 Canvas p95 的 p95 为 0.8ms；已移除图片 250ms 淡入，保留短控件过渡和 reduced-motion | 未发现支持增加 Worker 传输复杂度的当前热点 |
| 窗口材质 | Mica 与全实色各 10 次探索，阅读区不透明，帧间隔接近 | 本实验不能判断书库/窗口交互的材质成本，不据此删除 Mica |

UI 网络夹具统一为 80ms 延迟、共享 4MiB/s、720px 宽的长/横合成页，编码图片预先生成，实际走反打乱 Canvas。冷试验使用不同图片 URL，并断言确有传输字节，避免把 Chromium 命中当冷缓存。首图终点为目标图片/Canvas 就绪且进入阅读视口，再跨两次 rAF；不是收到响应头。

内存记录为各进程同一采样时刻的私有内存相加，包含合成夹具、运行脚本与保存的原始事件。固定 URL 的 50 次热阅读，返回后首 10 次均值约 644MiB、末 10 次约 663MiB，最后一次约 658MiB，没有按阅读次数等量持续攀升。强制新 URL 的冷实验会留在 Chromium 解码缓存，接近 1GiB 的实验峰值不能直接解释为生产常驻占用或泄漏。该短时试验也不能证明所有内容与长期运行均无泄漏。

## 复现入口

运行正确性和实际 Electron 旅程见 [CONTRIBUTING](../CONTRIBUTING.md#electron-行为回归)。模块实验：

```powershell
node --import tsx scripts/ablation.ts
```

普通构建上的热缓存阅读实验：

```powershell
npm run build
$env:JM_QA_RUN = 'bench-' + [guid]::NewGuid().ToString('N')
$env:JM_QA_VISIBLE = '1'
$env:JM_QA_BENCH = 'warm'
$env:JM_QA_REPEATS = '50'
& .\node_modules\.bin\electron.cmd scripts/reader-smoke.cjs
```

预取实验只在 `work/` 的临时 electron-vite 配置中增加一个 `enforce: 'pre'` 的 renderer transform：限定 `pages/ReaderPage.tsx`，先断言 `overscan: 2` 恰好出现一次，再替换为 `overscan: ((window as any).__readerQaOverscan ?? 2)`。配置导入并合并现有 `electron.vite.config.ts`；测试后执行普通 `npm run build` 恢复正式产物。没有修改或保留产品状态开关。

- 探索：`JM_QA_BENCH=overscan0,overscan1,overscan2`，重复 10 次。
- 快翻确认：`JM_QA_BENCH=overscan1-fast,overscan2-fast`，重复 50 次。
- 每轮交替正序/反序，断言实际首屏挂载数等于可见 1 页加选定预取页数。生产构建直接运行非 2 页变体会因这个断言失败，避免误报实验已改变条件。

## Git 与清理

实施前完整复制 `.git` 到 `work/recovery/2026-09-28-before-convergence.git`，88 文件、2,742,583 字节，逐文件 SHA256 相同；后来独立对象完整性检查 `fsck --full --no-reflogs --no-dangling` 退出 0，无 alternates。它是 Git 元数据恢复目录，不是 bundle。备份保全的是实施前状态，不覆盖本轮新增提交与工作区，因此当前工作分支仍须保留。

以下 12 个本地分支删除前逐一确认其 tip 与备份一致、全部包含于当前 HEAD，且未被其他 worktree 使用：

```text
codex/cleanup-abandoned-files           f56bafa
feat/anonymous-app-api-provider          3647bb5
feat/image-streaming-priority            a8c5b76
feat/main-io-coordinator                 4e2d75c
feat/navigation-card-grid-experience     8d0b399
feat/online-account                     4a78cc6
feat/performance-diagnostics            3cdf5f9
feat/performance-experience-design      0e7d141
feat/reader-worker                      6e77aa3
feat/renderer-boundaries                82016ee
feat/warmup-and-content-cache           8455659
fix/performance-runtime-completion      8e8c057
```

`codex/online-account-completion@ae25152` 也已删除重复标签，独有账号成果完整保留在 `rollback-online-account-6fdc90a@6fdc90a`；该保留分支还有 58 个不在整合 HEAD 中的提交，不能当垃圾删除。当前保留 main、工作分支、账号回滚分支共 3 个本地分支。

`refs/stash` 仍为 `e2d0582d57210359763adbb004f81550beee8246`。未丢弃 stash、重写历史或 prune 不可达对象。旧账号 UI/废弃入口和十一份过时文档已由清理提交整合；本轮仅清理可核定为自己生成的多余测试产物，保留有效实验、关键红/绿灯证据、最终截图及恢复目录。

## 尚未覆盖

- 三栏、阅读标签、铺满/还原的当前实现和对应验证见追加报告；本页旧整页数字不替代三栏测量。
- 页完整性检查覆盖原页号、普通文件、重复/缺页和图片头，未承诺对任意损坏文件做完整解码/哈希验证。
- 强制结束进程、真实磁盘断电、实际多显示器 DPI 切换、不同 GPU 和超大图集的长期稳定性不在本机这次验收结论内。
- Windows 目录打包与包内运行已检查，未签名、未发布便携发行版；main 合并仍需明确批准。
