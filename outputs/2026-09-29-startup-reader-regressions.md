# 1.0.6：启动与阅读回归修复记录

日期：2026-09-29。工作分支：`feat/project-improvement-review`。本轮修复用户反馈的 EXE 启动错误、验证弹出时机和阅读器持续加载问题。尚未合入 main 或发布到 GitHub。

**结论：两种 1.0.6 成品 EXE 的独立启动与合成功能旅程通过；真实站点的漫画阅读尚未完成验收。** 实网运行已经到达真实成年确认页面，确认未完成后超时，测试保留失败，未继续操作其背后的阅读器，也未记录 CDN 首图或下载速度为通过。

## 上一轮验收为何漏检

上一轮主要运行生产渲染器、合成网络和项目 Electron 驱动。所谓“包内验收”仍通过项目的 tsx / 模块加载环境装载 ASAR，并未直接运行生成的 EXE。这不足以排除项目依赖兜底，也不会触发开发 React StrictMode 的 effect 重放。将这些有限检查概括为基础功能全部通过是不准确的。

此前两份实施报告已添加纠正说明；保留当时真实取得的历史数据，不再将其作为 1.0.5 成品可用的证据。

## 复现与修复

| 用户反馈 | 实际复现 | 修复 |
| --- | --- | --- |
| 便携版、目录版打不开 | 直接运行旧目录 EXE，在主进程入口捕获 `Cannot find module 'archiver-utils'`。调用链为 `zip-stream → archiver/lib/plugins/zip → archiver → out/main/index.js` | 旧 builder 对依赖目录重排后，zip-stream 找不到所需版本。升级并锁定官方 electron-builder 26.15.3，重新打包；新增只按 ASAR 内目录查找依赖的校验 |
| 成年确认不在启动时出现 | 启动测试先观察不到 warmup；原流程把验证延迟到浏览器内容回退 | 先应用代理，再创建窗口并发起启动验证；后台回退合并当前尝试，失败后不擅自重新弹出；由首页显式重试 |
| 点击成年确认之前页面消失 | 真实 WebContentsView 合成长页面在没有点击按钮时已变为 `verified` | 移除“标题长/正文长即成功”的判断；要求已知内容链接且无可见成年确认控件，普通作品标题不作为确认控件 |
| 阅读器一直加载，下载正常 | 开发 Vite + Electron 中首图超时；3 个已挂载 img 的 `src=null`、`naturalWidth=0`、状态均为 loading | 旧 cleanup 撤销 src 后，StrictMode 第二次 setup 没有恢复 src。现在图片请求的启动与取消由同一个 effect 成对管理；下载不经过该 React 生命周期，因此没有同样的问题 |
| 验证失败后无法主动恢复 | 真实启动失败后首页没有重试按钮；首页还把直接返回的 WarmupState 误读为 `res.state` | 统一 preload 状态类型，正确消费初始状态；失败/过期时显示“重新验证”，重试不刷新工作区，成功后重新加载未成功的首页内容 |

图片列表原本已有虚拟化和附近页挂载，本次没有靠增加并发或叠加另一套懒加载掩盖请求被清除的问题。这里确认的是开发模式的确定缺陷；用户未补充具体失败作品与章节，不能据此断言所有实网慢图都只有同一个原因。

## 先失败、后通过的证据

- 开发首图：[失败](reader-qa/startup-reader-dev-red-20260929-elevated/result.json) → [完整开发阅读旅程通过](reader-qa/startup-reader-dev-green-20260929/result.json)。失败中直接记录了缺失 src 的图片节点。
- 成年确认提前成功：[真实 DOM 失败](reader-qa/startup-verification-dom-red-20260929/result.json) → [最终真实 DOM 通过](reader-qa/startup-verification-dom-final-20260929/result.json)。最终夹具同时包含年龄词作品标题，点击确认之前保持 verifying，之后移除验证视图。
- 首页重试入口：[失败](reader-qa/startup-retry-ui-red-20260929/result.json) → [生产态通过](reader-qa/startup-retry-ui-production-final-20260929/result.json)，验证真实重试 IPC 和工作区不刷新。
- `startupVerification.test.ts` 的启动顺序与失败后重弹测试先失败后通过；`verificationPage.test.ts` 的普通年龄词书名测试也先失败后通过。
- 新包检查脚本在旧 ASAR 上先报 `zip-stream/package.json: missing archiver-utils@^5.0.0`，重打包后 233 个包、834 条必需运行依赖均无错误。实际旧 EXE 异常摘录见 [旧包启动错误](reader-qa/package-regression-20260929/old-startup-error.txt)。

## 当前产物的实际验收

```text
npm run check
TOTAL=74 PASSED=74 FAILED=0
tsc --noEmit：退出 0
electron-vite build：退出 0

node scripts/verify-package.cjs dist-electron/1.0.6/win-unpacked/resources/app.asar
packages=233 requiredDependencyEdges=834 errors=[]
```

生产构建仍有两个既有 Vite 提示：networkProbe / httpClient 同时被静态与动态引用，因而不拆为独立 chunk；不影响本次构建完成。

| 检查 | 本轮结果与证据 |
| --- | --- |
| 当前生产构建完整阅读 | [通过](reader-qa/startup-reader-production-final-20260929/result.json)：首图解码、滚动/单页锚点、缩放、键盘、单页失败重试、切章、36 页下载、缺页修复、CBZ、离线阅读和正常关闭末值落盘 |
| 生产冷启动续读 | [通过](reader-qa/startup-reader-production-final-20260929/restart-result.json)：磁盘恢复第 36 页、离线来源、缩放和章节目录 |
| 开发 StrictMode 三栏与标签 | [通过](reader-qa/startup-reader-workspace-dev-final-20260929/result.json)：真实图片加载、双标签锚点、旧图片/Canvas 释放、保存失败恢复、快速切换和布局恢复 |
| 启动验证的真实 DOM | [通过](reader-qa/startup-verification-dom-final-20260929/result.json)：未确认不提前成功、确认后正常结束 |
| 生产首页验证失败恢复 | [通过](reader-qa/startup-retry-ui-production-final-20260929/result.json)：重试入口可用、不 reload，失败后仍能重试；[界面截图](reader-qa/startup-retry-ui-production-final-20260929/startup-verification-retry.png)已目检 |
| 便携 EXE，无网络替换的启动 | [通过](reader-qa/portable-exe-startup-final-20260929/result.json)：成品自行解压，app.isPackaged=true、1.0.6、包内主进程/preload/界面、启动 verifying、正常退出 0 |
| 便携 EXE，合成功能链路 | [通过](reader-qa/portable-exe-functional-final-20260929/result.json)：包内下载、23 行反打乱金样顺序、本地图片解码、CBZ、指针点击打开离线章节、第 1 页可见、正常退出 |
| 目录 EXE，合成功能链路 | [通过](reader-qa/unpacked-exe-functional-final-20260929/result.json)：与便携成品同样的完整链路，ASAR 哈希相同 |
| 实网漫画阅读 | **尚未通过**：[实际运行记录](reader-qa/unpacked-exe-live-20260929/result.json)。启动成功；真实成年确认未完成，warmup 以 timeout 结束；未读取测试漫画、未执行 CDN 首图或下载测量 |

独立复审检查了图片生命周期、验证状态、实际 EXE 驱动及证据。发现的书名误判已修复并回归。按复审意见，实网检查锁定当前第 1 页与可见区域，并要求验证视图先移除；收集未捕获的主进程/渲染异常。下载若发生在阅读预取之后，明确属于可能命中缓存的流水线检查，不能拿来声称网络速度。

另保留工具调试记录以便追溯：`startup-verification-red-20260929` 是测试驱动的 TS 导入错误，`unpacked-exe-startup-20260929` 是过早读取 Node 调试上下文造成的 `Promise was collected`。这两项不是产品回归的红灯证据。`unpacked-exe-startup-green-20260929` 和 `startup-verification-dom-green-20260929` 是中间通过记录，最终产物以表格中 `final` 的记录为准。这些工具调试输出与有效产品回归证据分别标注，均已保留。

## 成品与复现命令

交付目录：`dist-electron/1.0.6/`。旧 EXE 仍被用户进程打开，本次使用新目录，未关闭用户旧程序。

| 产物 | 大小 | SHA256 |
| --- | ---: | --- |
| `JMComic Desktop Portable 1.0.6.exe` | 105,632,080 字节 | `5df7bd17b00148531d0437629ee4e1a6dfc71b6c29b69e015a0600a055ee118b` |
| `win-unpacked/JMComic Desktop.exe` | 225,644,544 字节 | `ccb51c91eed1f79a839ddf536f77908007c2f21f1a65966f86a21e202606f96b` |
| 两者实际加载的 `app.asar` | 178,770,887 字节 | `09cc66b487c6ef64a46d30016638cc92914410029461d2bcee10776e038ff5fb` |

目录版必须保留整个 `win-unpacked` 文件夹；它不是独立的单文件程序。便携版的数据仍保存在 EXE 旁的 `JMComicData`，换目录时要连同已有数据目录一起保留。本轮测试使用隔离数据目录，没有迁移、删除或覆盖用户的收藏、历史和漫画文件。

```powershell
node scripts/verify-package.cjs dist-electron/1.0.6/win-unpacked/resources/app.asar
node scripts/package-launch-smoke.mjs 'dist-electron/1.0.6/JMComic Desktop Portable 1.0.6.exe' 新的启动验收ID
node scripts/package-launch-smoke.mjs 'dist-electron/1.0.6/JMComic Desktop Portable 1.0.6.exe' 新的功能验收ID --fixture
node scripts/package-launch-smoke.mjs 'dist-electron/1.0.6/win-unpacked/JMComic Desktop.exe' 新的目录验收ID --fixture
```

`--fixture` 只替换外部网络与保存对话框，实际运行成品中打包的业务代码，不向应用注入项目 tsx 或模块加载兜底。真实网络模式不替换网络；追加漫画 ID 时，必须先由用户完成真实验证才能继续。所有测试运行使用独立 `work/<ID>`，断言输出在 `outputs/reader-qa/<ID>`。

修复源码和本轮证据可以交付，但真实网络阅读不能标为全通过，因而未执行“全部通过后关机”。
