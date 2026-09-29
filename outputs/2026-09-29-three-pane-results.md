# 三栏阅读工作区：实施与验收

> 2026-09-29 回归纠正：本报告的合成生产态测试没有覆盖独立 EXE 启动与开发 StrictMode。随后实际复现 1.0.5 缺少 `archiver-utils`、启动验证时机错误及开发阅读图片永久加载。文中的包内验收与“未留下 P1/P2”只代表当时的有限检查，不能作为该版本基础功能已通过的结论。后续修复和成品验收以 [1.0.6 修复报告](2026-09-29-startup-reader-regressions.md) 为准。

2026-09-29，工作分支 `feat/project-improvement-review`。本轮按用户追加批准实施 Codex 式三栏，接续[原方案](2026-09-28-project-improvement-review.md#13-2026-09-29-布局修订三栏阅读工作区)；此前版本收敛、可靠性和消融的历史基线保留在[第一阶段报告](2026-09-29-implementation-results.md)。

## 交付行为

| 用户要求 | 当前实现 |
| --- | --- |
| 左侧常驻菜单 | 正常浏览 208px 导航；首次打开阅读自动收成 64px Fluent SVG 图标栏，仍支持手动展开、中文名称和键盘焦点 |
| 中间详情 | 浏览与阅读分开；可以继续搜索、看详情、管理收藏和下载，右侧章节保留 |
| 右侧阅读标签 | 按作品与在线/离线来源区分；同章去重、同作品换章复用；每个标签保存页码和页内偏移 |
| 全窗口阅读 | 支持铺满应用窗口、还原三栏及独立系统全屏；不因改变布局重开当前会话 |
| 成熟交互 | 窄栏两行工具栏、次要设置菜单、章节目录、单页/滚动与缩放；Esc、关闭标签和切章后的键盘焦点有实际回归 |
| 资源与维护 | 只挂载当前阅读会话；后台标签保存元数据，旧图片撤销 src、Canvas 清空；阅读状态和中间页面不再共用一个路由 |
| 保存可靠性 | 切换前串行保存，失败留在原标签；关窗冻结新入口，排空后确认；关闭取消、加载中保存失败和原地重试可恢复 |

沿用现有图标、React、Fluent、Zustand、缓存、图片协议和下载栈，没有增加运行依赖、数据库迁移或第二套阅读器。重启后仍通过历史记录续读；没有把所有后台标签持久化为新的数据库状态。

## 自审与修复证据

逻辑实现由主线程完成；独立审计只读检查状态、保存和会话生命周期，并用实际源码复现。每个确认的问题先观察失败，再写修复：

| 问题 | 失败证据与修复 |
| --- | --- |
| 后台图片残留 | [真实 Electron 红灯](reader-qa/workspace-subscription-red-20260929/result.json)检测卸载后 img 仍有 src；卸载时撤销订阅并释放 Canvas |
| 保存确认后仍能打开章节 | `readerWorkspace.test.ts`：关闭开始后迟到的 open 返回 true；现在关闭入口立即冻结，已有队列先排空 |
| 迟到 metadata 在关闭确认后写历史 | `readerCloseLoading.test.ts`：确认之后新增 1 次写入；现在暂停已离开会话的结果 |
| 保存失败或重试后一直加载 | 钩子回归先出现 retryAttempt 0、写入 0；失败恢复重启被中断的加载，原地重试只保存、不再次暂停章节 |
| 全屏换标签按钮错误 | [全屏红灯](reader-qa/workspace-fullscreen-red-20260929/result.json)；会话初始化读取已有 fullscreenElement |
| 关闭标签、换章后焦点丢失 | [标签红灯](reader-qa/workspace-focus-red-20260929/result.json)、[换章红灯](reader-qa/workspace-chapter-focus-red-20260929/result.json)；分别转交邻居标签/浏览区及新阅读视口 |
| 标签栏的 Esc 不还原 | [Esc 红灯](reader-qa/workspace-escape-red-20260929/result.json)；由工作区处理布局退出，正文先处理菜单与目录 |
| 保存提示关闭按钮无效 | [提示红灯](reader-qa/workspace-dismiss-red-20260929/result.json)；关闭提示只清除提示状态，待保存偏好仍会在切换前重试 |

最后的独立组合复现为“加载中 → 改偏好 → 关窗保存失败 → 原地重试成功 → metadata 返回”，实际结果：`readerClosing=false`、错误清空、请求 2 次、历史写入 1 次、页面 1 张、`loading=false`、重试代次 1。审计未留下已确认的 P1/P2。

真实 Electron 使用隔离数据和合成漫画，仍运行生产 main、preload、renderer、图片协议、Canvas、数据库及归档代码。没有访问或改动个人阅读数据。

## 视觉核对

实际检查 100%、125%、150%、200% DPR，每档 960×640 与 1280×860、浅深应用主题，共 16 张布局；自动断言控件边界，独立逐张目检，主线程复查代表图。三栏分隔、标题、工具栏、页码和主题均未见裁切或错位。另独立检查双标签、展开、窄栏和设置菜单五张画面。

代表图：[双标签](reader-qa/workspace-shipping-20260929/workspace-two-books.png)、[窄栏设置](reader-qa/workspace-shipping-20260929/workspace-settings.png)、[铺满](reader-qa/workspace-shipping-20260929/workspace-expanded.png)、[125% 深色窄窗口](reader-qa/workspace-layout-1.25-20260929/layout-1-960.png)。条纹内容仅用于几何与页序测试，不代表实际漫画画质。

## 性能与最终验证

当前最终源码的 `npm run check` 实际输出：

```text
TOTAL=72 PASSED=72 FAILED=0
tsc --noEmit：退出 0
electron-vite build：退出 0
main 216.73 kB / preload 7.81 kB
renderer 入口 1,020.30 kB / Reader 懒加载 96.12 kB
```

生产依赖 `npm audit --omit=dev --json` 的 `vulnerabilities.total=0`。普通最终构建已核对不存在 `__readerQaOverscan` 实验开关。构建仍有两项第一阶段已记录的混合静态/动态导入提示，不影响通过；未把它们描述为拆包优化收益。

[最终工作区旅程](reader-qa/workspace-shipping-20260929/result.json)通过：真实加密 API / IPC / jmimg 解码、手动及自动收起导航、中间浏览不重挂阅读器、两本书独立锚点、同章去重、后台图像释放、失败保存及重试、提示关闭、方向键标签切换、快速连续切换、关闭焦点、铺满/还原、系统全屏跨标签、原生 Esc、窄窗控件与设置菜单。

快翻确认各 50 次，1/2 页预取的首图中位数分别为 417.8/510.7ms，翻页等待 p95 分别为 255.7/17.9ms。继续保留两页预取，接受首图约增加 93ms 和本夹具每轮多传 401,333 字节的取舍。普通翻页探索每组 10 次；无预取的下一页等待中位 236.9ms，1/2 页预取分别 15.7/15.4ms。

热缓存固定 URL 连续阅读 50 次，首图中位 26.2ms、p95 36.5ms；100 次翻页的等待 p95 为 17.8ms。第 1 轮继续填充后续页，其后 49 轮没有新增图片传输。实际 Canvas 反打乱仍进入测试。

三组共 180 次有效 UI 测量，完整逐事件数据压缩存入 [workspace-reader.json](ablations/workspace-reader.json) 所列的 `.raw.json.gz`，解压后逐字节核对并记录 SHA256。首次快翻确认在第 79 轮 checkpoint 打开测量文件时发生 `UNKNOWN` 错误，原文件可读取且磁盘空间充足，整组排除；新隔离目录的 100 轮完整通过后才形成上面的结论。探索发生在最后一次原地保存重试修复前，确认和热缓存均包含该修复；各组保留实际构建哈希。

统一夹具为 80ms 延迟、共享 4MiB/s、720px 合成页、真实反打乱，冷组用不同 URL 绕过解码缓存。三栏与整页基线的可见面积不同，不能把两轮字节数差异直接解释为网络退化。每轮可见 rAF 间隔 p95 约 6.2ms；热组记录 17,174 个间隔，超过 25ms 的比例为 0/17,174。rAF 不是合成器呈现时间，不能据此承诺所有硬件的帧率。

热组返回后的全应用进程私有内存，每 10 次均值依次为 746.8、840.1、919.6、905.4、840.8MiB，最后一次 856.0MiB；中间升高后回落，没有持续单调增长。采样包含 GPU 进程、合成夹具和测量事件，变化主要来自 GPU 进程，不是纯 renderer JS 堆。此短时实验不证明长期无泄漏，也不代表生产应用的常驻占用。

Windows 便携包已生成于 `dist-electron/JMComic Desktop Portable 1.0.5.exe`，只在本机交付，未签名或发布。使用项目既有 electron-builder 配置，关闭此次本地包的签名/可执行资源编辑；打包工具下载了官方 Electron 43.2.0 运行时约 144MB 和带校验值的 NSIS 资源约 2MB，没有安装新的项目依赖。

最终 `app.asar` 的实际回归全部通过：

- [完整阅读与离线流程](reader-qa/workspace-packaged-full-20260929/result.json)：生产 IPC、切章焦点与单页失败重试、36 页下载、稳定目录、缺页修复、CBZ、在线/离线同书双标签、纯本地图片以及正常关闭的磁盘末值。
- [独立冷启动](reader-qa/workspace-packaged-full-20260929/restart-result.json)：第 36 页、离线来源、110% 缩放和本地章节目录均恢复。
- [包内三栏交互](reader-qa/workspace-packaged-workspace-20260929/result.json)：与最终源码工作区旅程一致，包含提示关闭、原生 Esc 和键盘标签切换。
- [包内关闭失败恢复](reader-qa/workspace-packaged-close-20260929/result.json)：偏好失败与最终保存失败保留窗口，取消关闭恢复交互；再次正常关窗后的最后一页已在磁盘中。
- [包内逐像素金样](reader-qa/workspace-packaged-golden-20260929/result.json)：运行依赖和 SQL WebAssembly 位于 app.asar；下载 IPC、真实 Canvas 23 行金样、无损 PNG、本地协议和 archiver CBZ 通过。

以上用项目 Electron 加载包内 main/preload/renderer 执行隔离旅程，未以真实个人书库双击便携文件做在线阅读验收。编译文件与包内内容逐字节核对，便携包 SHA256 和本地文档链接检查记录在 [最终校验清单](reader-qa/workspace-final-validation.json)。

最终便携包为 108,243,031 字节（约 103.23MiB），SHA256：`563c5f00c5d6cf11e14c366658732147d92022d62f7aaa1cfefb0fc478298b01`。13 个编译文件与包内内容一致，6 份文档中的 69 处本地链接校验通过。

## Git、范围和保留项

第一阶段已清理 13 个冗余分支标签、废弃入口和过时文档。当前仅保留 main、实施分支、账号回滚分支；后者有 58 个独有提交，不能作为垃圾丢弃。main 与 stash 保护值未变化，完整 Git 恢复副本 `work/recovery/2026-09-28-before-convergence.git` 再次 fsck 通过且无 alternates。它只保护收敛前状态，新的成果由当前工作分支提交保存。

本轮另外清理 12 个冗余 QA 目录、51 张重复截图、28 个已完成测试的临时工作目录和两个一次性证据整理脚本。早期红灯测试有一个无窗口进程占用临时 profile，核验整棵进程树只属于该隔离测试后结束并完成清理。保留最终回归、必要红灯证据、完整压缩测量、冷启动夹具、Git 备份和正式便携包。

main 合并及对外发布未执行。应用强制 DPR 验收不能代替真实多屏移动；合成固定带宽实验不能承诺第三方站点响应时间；强杀、断电、不同 GPU 和超大图集长期稳定性没有据此宣称已验证。
