# JMComic Desktop 架构说明

本文档面向想要扩展或维护本项目的开发者，说明核心设计决策与约定。修改涉及以下机制时，请先完整阅读对应源码。

## 进程模型

应用包含 Electron 主进程、页面渲染进程及运行在渲染进程隔离上下文中的 preload。Preload 是 IPC 桥接层，不是第三类独立进程；隐藏浏览器和验证视图还会使用 Electron 管理的 WebContents。

| 层 | 目录 | 职责 |
| --- | --- | --- |
| Main | `src/main/` | 窗口管理、IPC、抓取引擎、图片代理、下载、数据库 |
| Preload | `src/preload/index.ts` | 通过 `contextBridge` 暴露 `electronAPI`，渲染进程的一切 IPC 都经它 |
| Renderer | `src/renderer/` | React 18 + Fluent UI v9 + Tailwind，纯 UI 层 |

## 内容获取：三级回退

入口在 [contentApi.ts](../src/main/contentApi.ts)，提供页面与下载器共用的公开内容请求；[contentGateway.ts](../src/main/contentGateway.ts) 负责 provider 顺序、结果校验、缓存和同请求合并。

| 路径 | 实现 | 适用范围 |
| --- | --- | --- |
| 匿名 API | `src/main/content/jmAppApiRuntime.ts`、`jmAppApiProvider.ts` | 发现 API 配置、解析并校验结构化数据；不支持的入口或筛选条件交给后续路径 |
| 直接网页 | `src/main/siteAdapter.ts` | 用 HTTP + cheerio 解析受支持的普通搜索、推荐列表及章节页；首页和详情不使用该路径 |
| 浏览器回退 | `src/main/scraperWindow.ts` | 在会话就绪后导航隐藏窗口，再用 `executeJavaScript` 提取 DOM |

API 请求失败、返回值校验不通过或不支持当前条件时尝试直接网页；直接网页失败或不支持时进入浏览器。API 端点持续失败时会暂时跳过该端点，后续再尝试。不能把某个简单请求的成功扩大为所有筛选条件都支持。

网关包含内存缓存和在途请求合并，另通过 `contentCache.ts` 使用数据目录下的 `content-cache.json`。从磁盘读出的数据同样需要校验；清缓存会推进请求代次，避免旧请求重新填充已清除的缓存。

### 浏览器导航互斥

`scraperWindow` 是单例，通过 `withScraperLock` 互斥。两个并发 `loadURL()` 会互相打断并抛出 `ERR_ABORTED`。

**禁止直接调用 `getScraperWindow()` 做导航**；一律使用导出的提取函数（`extractHomepage`、`extractSearch` 等）。

### 按需会话验证

启动流程先建立应用窗口，在后台调用匿名 API 的 `prewarm()`，不要求先完成网页验证。只有浏览器 provider 进入 `ensureReady()` 或用户手动重试时，才调用 [sessionWarmup.ts](../src/main/sessionWarmup.ts) 的 `ensureWarmup()` / `retryWarmup()`。

验证通过 `WebContentsView` 显示在主窗口内。同一次验证由协调器合并，失败、超时和已验证是不同状态；浏览器提取不能把超时当作验证成功。API 与直接网页请求不依赖这一验证步骤。

## 图片加载与离线访问

在线封面与阅读图片使用 [imageProtocol.ts](../src/main/imageProtocol.ts) 注册的 `jmimg://` 协议：

```
CDN URL → base64url 编码 → jmimg://img/<encoded>?p=<priority>
    → 受信域名校验 → 磁盘缓存 / 主进程匿名请求（Referer + UA）
```

`imageNetwork.ts` 为图片协议和下载加载器提供同一套请求调度、并发限制、取消、超时与重试策略，使用 `credentials: 'omit'` 省略凭据。优先级区分当前阅读页、附近页、可见卡片和后台任务。`imageStreamFetch.ts` 处理响应流，`imageLoader.ts` 负责完整图片的磁盘缓存与维护。

离线图片通过 [localImageProtocol.ts](../src/main/localImageProtocol.ts) 的 `jmlocal://` 读取，不经过网络。读取受下载目录、路径与文件检查约束；不能让渲染端把该协议当作任意文件读取接口。两个 scheme 都在 `app.ready` 前注册。

在线阅读与下载反打乱共用 [imageDescrambleCore.ts](../src/shared/imageDescrambleCore.ts)。在线路径由 `ReaderImage` 在 Canvas 上绘制，下载路径由 `imageDescrambler.ts` 在隐藏浏览器中执行同一组函数。新增图片来源时同时检查受信域名规则和 CSP，避免仅修改其中一处。

## 阅读器与阅读状态

[ReaderPage.tsx](../src/renderer/src/pages/ReaderPage.tsx) 负责阅读视口、虚拟滚动、输入与章节切换；其余职责拆在 `src/renderer/src/reader/`：

| 模块 | 职责 |
| --- | --- |
| `useReaderSession.ts` | 加载在线或离线章节、读取历史与设置、保存阅读位置和偏好、处理重试及关窗保存回调 |
| `ReaderImage.tsx` | 图片加载、共享反打乱、尺寸回报、单页错误与重试、Canvas 清理 |
| `ReaderToolbar.tsx` | 模式、适配、缩放、方向、目录、全屏与自动隐藏控件 |
| `readerLayout.ts` | 图片尺寸与视口位置计算、输入焦点的快捷键边界 |
| `reader.css` | 阅读画布、工具栏、进度、目录与加载状态样式 |

[readerContracts.ts](../src/shared/readerContracts.ts) 定义跨进程使用的章节、页面、位置和偏好。偏好保存到 `settings`，包括滚动 / 单页模式、宽度 / 高度 / 原始尺寸适配、阅读方向、缩放、最大宽度和自动隐藏。图片实际尺寸回报、视口变化或偏好变化后，布局以页码和页内相对偏移恢复位置，不能使用虚拟列表预渲染范围的第一项代替可见页码。

阅读历史按漫画保存章节、页码、页内偏移、总页数及在线 / 离线来源。高频位置更新使用防抖，并带章节和阅读会话标识；主进程只有在漫画、章节、会话均匹配时才更新当前记录。返回或切章前等待进度与偏好保存，正常关窗还会通过 preload 注册的 `onBeforeClose()` 等待同一组保存任务。页面隐藏和卸载提供额外刷新机会，但不能把生命周期回调等同于异常退出时的持久化保证。

## 下载目录、缺页修复与 CBZ

[downloadCore.ts](../src/main/downloadCore.ts) 统一解析任务目录。新任务将 `storage_relpath` 保存到数据库，目录形如 `manga-<漫画ID>/chapter-<章节ID>`；不能从章节 URL 取得 ID 时使用章节序号，非数字漫画 ID 使用摘要。展示标题不参与新目录的身份计算。没有 `storage_relpath` 的旧记录仍按原漫画标题 / 章节标题目录读取，不自动搬迁旧文件。访问和删除前仍需经过目录层级及路径边界校验。

恢复下载、可用性检查、离线阅读与导出共用 `inspectChapterFiles()`。扫描以文件名中的原始页号为身份，检查普通文件与图片头；同一页号的多个扩展名只计一个页面，并记录重复页号。预期页数已知时，首尾或中间缺页都会令章节不可用，不能用文件总数判断齐全，也不能把剩余图片重新编号成连续页面。这是文件级检查，不等同于验证每张图片都能完整解码。

[downloadManager.ts](../src/main/downloadManager.ts) 在重试时重新取得章节清单，保留扫描识别的现有页，只请求缺失页。图片写入临时文件后再改名为对应原页号；完成页数来自已经保存的页，不是网络请求发出的数量。下载页对记录为完成但文件不齐的章节显示“修复缺失页”，离线阅读入口也会拒绝缺页章节并提示修复。

[downloadExport.ts](../src/main/downloadExport.ts) 提供单章和漫画范围导出；漫画范围只选其中已完成的章节，并按章节序号去重。选择范围仍有待下载或下载中任务时拒绝导出，选中完成章节有缺页时要求先修复。归档按章节 / 页号排序，不把未下载的章节隐含为整本完成。

[cbzExport.ts](../src/main/cbzExport.ts) 使用 ZIP 容器写入 `.cbz`，条目按 `章节序号/页号.实际格式` 命名，图片不重新压缩。先写相邻临时文件、等待归档结束并同步文件，再替换目标；失败或取消会清理临时文件，目标不允许放在来源章节目录内。导出期间通过 `downloadLeases.ts` 标记目录占用，下载队列、单项重试与删除会检查该状态；退出流程取消导出并等待它结束。涉及这些操作的并发行为仍应由对应回归与实际验收覆盖。

## 本地数据与持久化

[dataPaths.ts](../src/main/dataPaths.ts) 统一解析路径：

- 便携运行的数据目录为 exe 旁的 `JMComicData`；数据库是其中的 `jmcomic.db`。
- 非便携运行使用 Electron `app.getPath('userData')`，不假定当前工作目录就是数据目录。
- 漫画默认保存到系统“下载”目录的 `JMComic` 子目录，也可由设置指定。下载记录与图片文件分开保存。

sql.js 在内存中运行，数据库操作不等于已写入磁盘。[database.ts](../src/main/database.ts) 与 `databaseWriteCoordinator.ts` 提供统一的异步保存：

- 高频进度调用 `scheduleDatabaseSave()` 合并写入；需要向调用方确认保存的操作调用并等待 `saveDatabase()`。
- 协调器串行刷新，在一次写入期间收到的变更会继续刷新；写失败保留待写状态，显式 flush 的错误传给调用方。
- 落盘先写临时文件并同步，将上一次数据库保存为 `.bak`，再替换主文件。
- 初始化检查文件头和 SQLite `quick_check`；主文件不可读时尝试同样经过校验的 `.bak`。恢复前将现存损坏主文件复制为 `.corrupt-<时间戳>`，再通过临时文件恢复主库，启动后显示恢复提示。
- 主文件与备份均不可读时报告错误并保留原文件，不覆盖为新空库。数据库对象只在初始化和迁移完成后发布；该恢复机制使用最近一次备份，不表示异常退出前的所有变更都已保存。

渲染端通过收藏、历史、下载、设置等具体 IPC 操作数据，不暴露任意 SQL。主要表为 `manga_cache`、`reading_history`、`downloads`、`favorites`、`search_history`、`settings`；`auth` 仅作为旧版本数据清理的兼容表保留，不提供登录能力。

## 正常关窗与保存顺序

[index.ts](../src/main/index.ts) 拦截主窗口的关闭和 `before-quit`，在窗口销毁前调用 [shutdownController.ts](../src/main/shutdownController.ts)。顺序为：

1. 主进程向原渲染器发送带请求 ID 的 `window:prepare-close`。Preload 等待已注册的 `onBeforeClose()` 回调，阅读会话刷新进度和偏好，再返回 `window:ready-close`；主进程核对发送者与请求 ID。
2. 停止下载修改和导出入口接受新操作，取消相关在途工作，等待下载任务、已登记的修改操作与导出结束。因关闭而中断的下载保留为待继续任务。
3. 调用 `closeDatabase()` 刷新剩余写入并关闭数据库，之后才允许退出。

重复关闭请求复用同一次准备过程。保存失败或等待超时时保留窗口、显示错误并恢复下载与导出入口，供用户处理问题后重试；这一路径不承诺覆盖强制结束进程或断电。`window-all-closed` 只负责触发退出，不再承担首次保存渲染器状态的职责。

## 窗口外观

- 无边框 + 自定义标题栏（`TitleBar.tsx`）
- Mica 材质：`setBackgroundMaterial('mica')`，**不要设置 `transparent: true`**（会禁用 Win11 圆角与 Snap）
- 标题栏按钮使用 `titleBarOverlay` + 透明背景

## 扩展点

以下是新增功能时建议挂载的位置：

| 想加什么 | 改哪里 |
| --- | --- |
| 新页面 | `src/renderer/src/pages/` + `appStore.ts` 路由 + 导航入口 |
| 新 IPC | `src/preload/index.ts` 声明类型 → `src/main/ipc.ts` / `contentApi.ts` 实现 |
| 新内容路径 | `contentGateway.ts` 契约与校验 → API / 直接网页 / 浏览器 provider；浏览器提取必须走锁 |
| 图片 / 网络 | `imageProtocol.ts` / `imageNetwork.ts` / `imageLoader.ts`；网页请求使用 `httpClient.ts` |
| 阅读器行为 | `reader/` 对应模块 + `shared/readerContracts.ts`；避免复制反打乱与位置计算 |
| 下载 / CBZ | `downloadCore.ts` 目录与扫描 → `downloadManager.ts` 队列 / `downloadExport.ts` 导出入口 → `cbzExport.ts` 归档写入 |
| 数据表 | `database.ts` 迁移 + 具体 IPC handler + 持久化验证 |
| 关窗保存 | Preload `onBeforeClose()` + `shutdownController.ts`，保持保存与停止工作的顺序 |
| 核心逻辑 | 复用已有纯函数和共享契约，测试直接执行生产代码 |

## 验证与性能证据

`npm test` 自动发现 `src/` 和 `scripts/` 下的测试；`npm run typecheck` 检查类型；`npm run check` 顺序执行测试、类型检查和生产构建。运行方式及提交要求见 [贡献指南](../CONTRIBUTING.md)。

性能诊断记录内容 provider、图片、Canvas、数据库等路径的指标。判断是否保留某项优化，需要在相同环境与场景下比较实际行为、资源成本和性能；源码字符串、历史截图或某次构建通过不能替代当前测量。当前改动、消融与验收见 [实施与验收报告](../outputs/2026-09-29-implementation-results.md)；[项目改进审阅记录](../outputs/2026-09-28-project-improvement-review.md) 与 `docs/performance/` 中的历史报告保留各自当时的观测范围。
