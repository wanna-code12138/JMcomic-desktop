# JMComic Desktop 性能、体验与 API 化总设计

**日期**：2026-09-03

**状态**：待用户审阅，未批准实施

**适用仓库**：`JMComic Desktop`

**设计性质**：总设计规范；批准后仍需按工作流分别编写实施计划

**硬性要求**：本文件不授权实现，不授权安装依赖，不授权真实账号写操作

---

## 1. 文档目的

本设计把当前已经发现的性能、加载速度、交互手感和在线 API 方向组织成一套可测量、可回退、可分阶段交付的工程方案。

设计覆盖以下问题：

1. 应用启动和首次内容出现较慢；
2. 首页和详情页仍依赖隐藏 `BrowserWindow`，远端加载延迟明显；
3. 图片协议名义上支持流式，但实际上等待完整下载和落盘后才返回；
4. 图片请求只有 FIFO 并发控制，没有视口优先级、取消和完整超时策略；
5. React 根组件订阅范围过大，访问过的页面全部保活；
6. 卡片网格存在不必要的逐卡状态和 React hover 更新；
7. 阅读器反打乱继续占用 renderer 主线程，但缺少纯 Canvas CPU 指标；
8. 主进程仍存在部分同步数据库和文件操作；
9. 目前缺少能够解释“慢在哪里”的内置诊断界面；
10. 移动端 JSON API 和在线账号曾被研究过，但公开内容提速与账号功能的边界不清晰。

本设计的最终目标不是追求某一个技术指标，而是让用户感受到：

- 应用打开后立即可操作；
- 页面切换没有明显“网页刷新感”；
- 远端内容尽早出现，后台刷新不打断当前阅读；
- 阅读器快速滚动和缩放时不被旧任务拖慢；
- 网络、上游协议或账号状态异常时能明确解释并恢复；
- 所有优化都不牺牲页面顺序、图片正确性、数据安全和离线能力。

---

## 2. 已确认的当前基线

### 2.1 本轮静态与运行时核验

- Electron 硬件加速已启用；
- Canvas 2D、GPU compositing、rasterization、WebGL、WebGPU 已启用；
- ANGLE 后端为 Direct3D 11；
- 当前实际活跃 GPU 为 `AMD Radeon(TM) 860M Graphics`；
- `NVIDIA GeForce RTX 5060 Laptop GPU` 可见但未被当前探针选为活跃设备；
- renderer 构建为单个 JavaScript chunk；
- 当前构建产物大小：`1,281.66 kB`，gzip `270,584 bytes`；
- 当前测试文件 25 个，全部通过；
- main、preload、renderer 构建全部通过。

### 2.2 仓库历史性能数据

以下是仓库已有报告中的历史测量值。它们用于定义初始方向，不作为未来验收的替代品：

| 场景 | 历史结果 |
| --- | ---: |
| Electron 冷启动到 renderer ready | p50 814.04ms，p95 1326.03ms |
| 隐藏浏览器首页 | p50 3822.21ms，p95 5075.69ms |
| 隐藏浏览器详情 | p50 2578.65ms，p95 3173.84ms |
| 直接 HTML 搜索 | p50 902.90ms，p95 1289.20ms |
| 直接 HTML 章节页数据 | p50 710.45ms，p95 1010.00ms |
| 图片磁盘缓存命中 | p50 0.46ms，p95 0.80ms |
| 图片网络未命中 | p50 427.18ms，p95 898.27ms |
| 图片首字节 | p50 294.29ms，p95 406.51ms |
| 在线章节热打开 | p50 442ms，p95 469ms |
| 当前数据库保存 | p50 1.14ms，p95 1.58ms |

### 2.3 已存在的基础设施

项目并非从零开始，已有以下可复用能力：

- `contentGateway`：direct/browser provider、校验、single-flight、内存 TTL；
- `contentCache`：10 分钟 fresh、24 小时 stale、后台刷新、原子写文件；
- `JmWebAdapter`：HTTP + Cheerio 公开内容适配；
- `scraperWindow`：隐藏浏览器兼容回退；
- `imageRequestScheduler`：相同 URL 合并、FIFO、并发上限 6；
- `jmimg://` 与 `jmlocal://` 图片协议；
- 图片缓存异步读取、原子写入和合并淘汰扫描；
- 阅读器 TanStack Virtual；
- 图片顺序和反打乱契约测试；
- `[perf]` 结构化性能事件；
- 本地收藏、历史、下载和续读。

因此，设计原则是扩展现有边界，而不是另建平行体系。

---

## 3. 范围与非目标

### 3.1 本项目范围

本总设计包含十条工作流：

1. 性能基线与诊断；
2. 匿名移动端 JSON API provider；
3. Cloudflare warmup 和内容首屏解耦；
4. 内容缓存治理；
5. 在线图片流式、优先级和取消；
6. React 更新边界、拆包和页面保活；
7. 卡片网格和交互体验；
8. 阅读器反打乱与缩放输入；
9. 主进程 I/O 和后台任务；
10. 在线账号的独立可选项目边界。

### 3.2 明确非目标

- 不在本轮改写为 WinUI 3、Tauri、Flutter 或其他技术栈；
- 不通过强制 Chromium 实验参数追求未经测量的 GPU 提升；
- 不要求应用固定使用 RTX 独显；
- 不改变 `page_arr` 的页面顺序；
- 不改变 MD5 输入、条带数阈值、条带坐标或绘制顺序；
- 不把第三方 JM 服务、Python 解释器或外部代理服务作为生产依赖；
- 不把在线账号登录作为匿名公开内容加载的前置条件；
- 不在没有真实负向证据时开放付费阅读、下载或购买；
- 不在同一提交中同时替换内容、图片、UI 和数据库核心链路；
- 不以“测试通过”替代真实运行时性能测量；
- 不记录用户名、Cookie、AVS、密码、完整内容 URL 或用户阅读隐私到性能日志。

---

## 4. 不可破坏的系统约束

### 4.1 内容正确性约束

1. 章节页面顺序必须来自上游数组原始顺序；
2. 页面索引必须严格连续为 `0..n-1`；
3. 并发完成顺序不得改变显示和下载顺序；
4. 章节 ID、漫画 ID、图片路径和 `scrambleId` 必须交叉验证；
5. provider 返回空数组、重复索引、非 HTTPS 图片或页数矛盾时不得进入缓存；
6. API 解析失败必须回退，不得用猜测字段伪造成功结果。

### 4.2 反打乱约束

以下行为被冻结为兼容性契约：

- `scrambleId === 0` 或 `aid < scrambleId` 时不反打乱；
- `aid < 268850` 使用固定 10 条；
- 其他情况使用当前基于 `md5(String(aid) + filename)` 的条带计算；
- 余数条带位置和 `drawImage` 坐标不变；
- renderer、Worker 和下载路径必须通过同一批逐像素金样；
- 优化允许移动执行位置，但不允许改变输出像素。

### 4.3 安全与隐私约束

- renderer 不接收密码、Cookie、AVS 或任意远端 URL 权威输入；
- 远端 host 必须经过 HTTPS、端口、userinfo、IP 和允许域规则验证；
- API 返回的图片 host 只能在严格校验后用于构造图片地址；
- 登录会话若未来恢复，必须使用独立 Session，不与匿名抓取会话混用；
- 凭据若未来保存，只能用 Electron `safeStorage`；
- 缓存公开内容与账号敏感内容必须物理或逻辑隔离；
- 诊断导出默认脱敏；
- 自动测试禁止发起真实登录、签到、收藏修改、历史删除或购买请求。

### 4.4 工程约束

- 实施阶段严格 TDD：先看到目标测试失败，再写最小实现；
- 每条工作流独立分支、独立提交、独立验收；
- 每阶段必须能关闭或回退到旧路径；
- 不新增依赖，除非现有 Web/Electron API 无法可靠完成目标，且得到用户许可；
- 源码修改遵守当前目录结构和编码风格；
- 所有临时探针放入 `work/`，完成后删除；
- 所有正式性能报告放入 `docs/performance/`；
- 所有实施计划放入 `docs/plans/`；
- 未经用户批准不得合并回 `main`。

---

## 5. 备选总体方案

### 5.1 方案 A：渐进式优化现有 Electron 架构（推荐）

做法：保留 Electron、React、Fluent UI、现有 IPC 和本地数据库；逐步替换公开内容 provider、图片传输和 renderer 热点。

优点：

- 最大程度复用已验证的页面顺序和反打乱逻辑；
- 每个工作流可独立测量和回退；
- 能直接针对目前 2–5 秒的隐藏浏览器延迟；
- 不需要重建下载、缓存、代理、历史和桌面窗口能力。

缺点：

- 仍需管理 Chromium renderer 和 Electron 多进程；
- 若最终目标是完全原生控件行为，仍有技术上限。

### 5.2 方案 B：只优化 renderer，不改内容协议

做法：只做 selector、lazy、保活、卡片和 Worker。

优点：风险最低，交互改进快。

缺点：首页和详情仍受隐藏浏览器 2–5 秒延迟支配，无法解决最大等待来源。

### 5.3 方案 C：重写为原生 WinUI 3

优点：可获得原生 ScrollViewer、ItemsRepeater、窗口与输入行为。

缺点：成本最高；远端 API/CDN 延迟仍然存在；反打乱、下载、代理、缓存和数据迁移风险显著增加。

### 5.4 决策

采用方案 A。方案 B 中的 renderer 优化作为方案 A 的一个工作流；方案 C 仅在全部量化优化完成后仍无法满足手感目标时重新评估。

---

## 6. 目标架构

```text
Renderer
  App Shell
    Navigation / Status / Diagnostics
    Bounded Page Cache + Scroll Snapshots
    Lazy-loaded Pages
  Content Views
    stale content immediately
    background refresh indication
  Reader
    viewport-aware image requests
    optional descramble worker pool
            │
            ▼ typed preload IPC
Main Process
  Content Gateway
    ├─ Anonymous JM App API Provider
    ├─ Direct HTML Provider
    └─ BrowserWindow Provider
       + validation + single-flight + cache + route metrics

  Image Gateway
    ├─ memory/disk cache
    ├─ priority scheduler
    ├─ cancellation + timeout + retry
    └─ streaming response + async cache tee

  Local Data
    database write coordinator
    download/cache maintenance

  Diagnostics
    bounded privacy-safe event buffers

Optional, separate project
  Account Runtime
    isolated session + vault + generation leases
```

核心原则是：renderer 只表达用户意图；main 负责网络、缓存、可信地址和会话；shared 只放纯类型、校验和可测试算法。

---

## 7. 工作流 0：性能基线与诊断基础

### 7.1 目标

先建立可重复的端到端指标，避免凭体感决定优化顺序。

### 7.2 计划位置

- 扩展：`src/shared/performanceTraceCore.ts`
- 扩展：`src/main/performanceTrace.ts`
- 扩展：`src/main/contentApi.ts`
- 扩展：`src/main/imageProtocol.ts`
- 扩展：`src/renderer/src/pages/ReaderPage.tsx`
- 新建：`src/renderer/src/performance/rendererMetrics.ts`
- 新建：`src/renderer/src/pages/PerformanceDiagnosticsPage.tsx`
- 扩展：`src/preload/index.ts`
- 扩展：`scripts/summarize-performance.mjs`
- 输出：`docs/performance/YYYY-MM-DD-*.md`

### 7.3 统一指标

| 指标 | 起点 | 终点 | 必需元数据 |
| --- | --- | --- | --- |
| `app.shell-ready` | 主窗口创建 | 首次可交互帧 | cold/warm |
| `content.request` | 用户意图/预取 | 首批可显示数据 | endpoint、provider、cacheState、fallback |
| `content.refresh` | 后台刷新开始 | 缓存替换或失败 | endpoint、provider、outcome |
| `image.request` | 调度入队 | Response 建立 | priority、cacheState |
| `image.first-byte` | 网络发送 | 第一字节 | hostId、attempt，不含 URL |
| `image.first-visible` | 图片请求 | 首次绘制 | pageDistance、scrambled |
| `reader.canvas` | canvas resize 前 | 最后一次 drawImage 后 | width、height、stripCount |
| `reader.input` | wheel/pointer 事件 | transform 提交 | inputType |
| `database.flush` | flush 调度 | 原子保存完成 | bytes、batchSize |
| `renderer.long-task` | PerformanceObserver | task 结束 | duration、page |

### 7.4 采样规则

- 性能日志使用有界环形缓冲；
- 默认只保留最近 500–1000 条事件；
- 发布构建默认不向控制台打印每张图片日志；
- 诊断页可显示聚合结果，不显示完整 URL；
- 基准至少包含 10 次冷启动、10 次热导航、64 个网络图片 miss、10 组滚动样本；
- 网络基准记录代理状态、缓存状态和 provider，不能混合统计。

### 7.5 验收条件

- 每个指标都能独立解释所覆盖的时间范围；
- Canvas-only 指标不包含网络和图片解码；
- 取消任务不会被统计成成功；
- provider 和 fallback 可聚合；
- 所有日志通过隐私字段负向测试；
- 诊断功能自身不产生连续高频 React 更新；
- 关闭诊断采样后额外开销不可测或低于 1%。

---

## 8. 工作流 1：匿名移动端 JSON API Provider

### 8.1 目标

在不登录、不引入账号状态的前提下，用结构化移动端 API 替代首页、详情和章节 manifest 的隐藏浏览器冷路径。

### 8.2 计划位置

- 新建：`src/main/content/jmAppApiProvider.ts`
- 新建：`src/main/content/jmAppApiTransport.ts`
- 新建：`src/main/content/jmAppApiCrypto.ts`
- 新建：`src/main/content/jmAppApiProfiles.ts`
- 新建：`src/main/content/jmAppApiSchemas.ts`
- 新建：`src/main/content/jmAppApiDomainResolver.ts`
- 扩展：`src/main/contentGateway.ts`
- 扩展：`src/main/contentApi.ts`
- 扩展：`src/main/types.ts`
- 新增测试夹具：`src/main/__tests__/fixtures/content-api/synthetic/`
- 新增测试：`src/main/__tests__/jmAppApi*.test.ts`

目录名称在实施计划中可按项目现有扁平风格调整，但模块职责不得重新混合。

### 8.3 Provider 顺序

```text
API provider
  ↓ 请求失败、超时、解密失败、schema 漂移
Direct HTML/Cheerio provider
  ↓ 语义未验证、HTML 缺字段、Cloudflare challenge
BrowserWindow provider
  ↓ 失败
stale cache 或可恢复错误 UI
```

已验证能由 direct HTML 可靠提供的端点，可以按实测决定是否跳过 API 或作为第二级 provider；不能假设 API 永远最快。

### 8.4 初始只读端点

| 端点 | 用途 | 结果映射 |
| --- | --- | --- |
| `GET /setting` | 运行时版本、图片主机发现 | protocol profile runtime state |
| `GET /search` | 默认搜索 | `GatewayListResult` |
| `GET /categories/filter` | 分类列表 | `GatewayListResult` |
| `GET /album?id=...` | 漫画详情 | `MangaDetail` |
| `GET /comic_read?id=...` | 章节 manifest | `ChapterPagesResult` |
| `GET /chapter?id=...` | 旧兼容 manifest | 只在 profile 明确支持时使用 |
| `GET /chapter_view_template` | 旧反打乱信息 | 独立非 JSON parser |

### 8.5 Profile 与域名治理

- 签名盐、数据解密盐、bootstrap version 和 tokenparam 风格集中在 profile 注册表；
- `/setting` 成功且通过 schema 后才能更新 runtime version；
- 域名发现结果必须通过受信规则，不能直接接受任意 URL；
- 同一个请求可尝试有限数量的已知 profile；
- 成功 profile 缓存必须绑定 API origin、profile ID 和运行时版本；
- profile 失效后清除选择，不在无限重试中轮询所有组合；
- 固定密钥属于协议兼容信息，不属于用户凭据，但仍不得散落到 UI 或日志。

### 8.6 DTO 校验

API envelope、解密数据和业务 DTO 分三层校验：

1. HTTP 层：状态码、Content-Type、响应体大小、重定向；
2. envelope 层：code、data 类型、解密是否成功；
3. 业务层：ID、标题、章节、图片数组、页数和权益字段。

任何层失败都只能产生结构化错误或 provider fallback。

### 8.7 首页语义

首页不能简单按数组切片模拟“推荐/最新/热门”。

- “推荐”继续使用当前本地排名器和多个候选池；
- “最新”由明确的排序参数生成；
- “热门”由明确的观看量/周期参数生成；
- API 与当前 UI 列表进行语义对照，而不仅仅比较非空；
- 对照至少检查前 N 项的 ID 集合、顺序规则和页面总数合理性。

### 8.8 性能目标

- 已验证 API endpoint 的 provider 成功率在 100 次样本中达到 95% 以上；
- API 首页/详情首批内容 p95 不高于 1.5 秒，或至少比 BrowserWindow 同网络条件快 40%；
- API 章节 manifest p95 不高于当前 direct HTML 基线；
- API 失败到回退启动的额外开销 p95 不超过 250ms；
- 缓存命中不得调用任何 provider。

### 8.9 正确性验收

- 详情字段与当前可信 BrowserWindow 结果逐字段对照；
- 至少覆盖单章节、多章节、空描述、特殊字符、较长章节列表；
- 章节页数、顺序、文件名和 `scrambleId` 逐项一致；
- API host 漂移、旧版本、错误密钥、畸形 base64、错误 padding、超大响应均有负向测试；
- 不把空 `price`/`purchased` 推断为免费或已购买；
- 不把账号相关字段写入公共缓存。

### 8.10 回退条件

满足任一条件即按 endpoint 暂停 API 主路径：

- 最近 100 次请求 fallback 超过 10%；
- 出现页面顺序或 `scrambleId` 不一致；
- API 字段无法可靠映射当前 UI；
- 域名/profile 发现不稳定；
- 上游服务条款或合规边界不允许继续使用。

---

## 9. 工作流 2：Warmup 与首屏解耦

### 9.1 当前问题

当前主窗口启动后立即 warmup；首页又等待 warmup 状态。即使匿名 API 可以工作，用户仍可能看到“正在建立安全连接”。warmup 超时还会被当作完成状态。

### 9.2 目标状态机

```text
idle
  ├─ browser fallback/image auth required → verifying
  └─ API/cache sufficient → 保持 idle
verifying
  ├─ verified evidence → verified
  ├─ explicit timeout → failed(timeout)
  └─ user closes/retry → idle/verifying
verified
  └─ 401/403/challenge evidence → expired
expired
  └─ user retry → verifying
```

### 9.3 计划位置

- 重构：`src/main/sessionWarmup.ts`
- 调整：`src/main/index.ts`
- 调整：`src/main/contentApi.ts`
- 调整：`src/renderer/src/pages/HomePage.tsx`
- 新建：`src/shared/sessionWarmupContracts.ts`
- 扩展：`src/preload/index.ts`

### 9.4 交互规则

- 应用壳和缓存内容不等待 warmup；
- API 可用时首页立即走 API；
- 需要浏览器验证时才显示内嵌验证视图；
- 验证视图不得永久覆盖已有可读缓存内容；
- 超时明确显示失败和重试，不能标记 verified；
- 下载管理器的本地任务恢复不依赖远端 warmup；
- 只有实际需要网络续传的任务等待 verified；
- 同一时间最多一个 warmup 流程。

### 9.5 验收条件

- 有 fresh/stale 缓存时，启动到内容可见 p95 小于 300ms；
- API 可用时，不出现强制验证遮罩；
- warmup 超时后状态为 failed，而不是 warmedUp=true；
- 并发 fallback 共用一个验证流程；
- retry、关闭视图、窗口销毁和应用退出均无悬挂 Promise/定时器；
- 本地阅读和本地下载浏览在离线状态下完整可用。

---

## 10. 工作流 3：内容缓存治理

### 10.1 当前问题

持久缓存每次更新都会序列化全部 Map 并重写单个 JSON；搜索关键词、筛选和分页长期增长后，写放大与启动解析时间会增长。

### 10.2 推荐设计

第一阶段不迁移数据库，先给现有缓存增加：

- 最大条目数；
- 最大序列化字节数；
- endpoint 分配额；
- LRU/最后访问时间；
- 过期条目启动时清理；
- 合并写入和短延迟 flush；
- profile/version 命名空间；
- 缓存命中状态对 renderer 可见，但不暴露内部路径。

### 10.3 计划位置

- 重构：`src/main/contentCache.ts`
- 扩展：`src/main/contentGateway.ts`
- 扩展测试：`src/main/__tests__/contentCache.test.ts`
- 新增：`src/main/__tests__/contentCacheScale.test.ts`

### 10.4 UI 缓存语义

- fresh：直接显示，不提示；
- stale：立即显示，状态栏显示轻量“正在更新”；
- 后台刷新成功：保持滚动位置，只替换发生变化的数据；
- 后台刷新失败：保留 stale 内容，显示非阻塞提示；
- expired 且网络失败：显示明确离线状态和手动重试；
- 用户手动刷新：允许绕过 fresh，但仍进行 single-flight。

### 10.5 验收条件

- 10,000 个合成缓存键下启动解析和一次 flush 均有基准；
- 缓存文件大小有硬上限；
- 连续 100 次 refresh 不产生 100 次全量并发写；
- 崩溃或中断只留下可清理临时文件，不破坏上一版本；
- clear 与 refresh 竞态不能让已清除数据重新落盘；
- schema/profile 升级不会读取不兼容条目。

---

## 11. 工作流 4：在线图片流式、优先级与取消

### 11.1 当前问题

网络图片完整下载到 Buffer、等待缓存落盘后才构造 Response。调度器只有 FIFO 和并发 6，无法让当前视口超越旧请求，也无法取消已经不再需要的页面。

### 11.2 推荐数据流

```text
<img jmimg://...>
  → protocol handler
  → cache lookup
      ├─ hit: 本地 Response
      └─ miss:
          priority scheduler
          → session.fetch/net.fetch
          → validate status/type/length
          → body.tee()
              ├─ branch A: 立即返回 renderer
              └─ branch B: 有界异步缓存写入
```

如果 Electron 当前版本下 `tee()` 与协议 Response 的行为不稳定，则第二选择是边下载边写临时文件，同时用可回压的 stream 返回；不得退回“完整 Buffer 后返回”作为新实现。

### 11.3 计划位置

- 重构：`src/main/imageProtocol.ts`
- 重构：`src/main/imageRequestScheduler.ts`
- 扩展：`src/main/imageLoader.ts`
- 新建：`src/main/imageRequestPolicy.ts`
- 扩展：`src/preload/index.ts`（仅优先级/取消意图，不暴露真实 URL）
- 调整：`src/renderer/src/pages/ReaderPage.tsx`
- 调整：`src/renderer/src/components/MangaCard.tsx`
- 新增测试：`src/main/__tests__/imageStreaming*.test.ts`

### 11.4 调度模型

优先级分为四级：

1. `critical`：当前单页、连续模式首个可见页；
2. `near`：当前页前后 1–2 页；
3. `visible-grid`：当前视口卡片封面；
4. `background`：远端 overscan、预取和后台缓存。

调度要求：

- 相同 URL 保持 single-flight；
- 新 critical 可在尚未开始的 background 之前执行；
- 已离开需求窗口的 pending 请求立即移除；
- 可取消的 in-flight 请求收到 AbortSignal；
- 当前页请求不得被已取消任务占槽；
- 每 host 并发与全局并发分别受限；
- 初始并发 6 只是基线，不是永久常量；
- 429、5xx 和超时进入有限退避；
- 401/403 或 HTML challenge 转给 warmup 状态机，不保存为图片。

### 11.5 缓存写入约束

- 只缓存状态成功、Content-Type 合法且文件魔数匹配的图片；
- 临时文件完成后原子 rename；
- renderer 取消后，可按策略继续小文件缓存或取消大文件，策略必须可测；
- 失败和中断的临时文件可在下次维护时清理；
- 淘汰扫描不得在每次图片完成时重复启动；
- 缓存 key 的 URL 映射兼容现有数据，除非提供迁移或自然失效策略。

### 11.6 Renderer 图片提示

- 当前关键图片可使用 `fetchPriority="high"`；
- 远端图片使用低优先级或在接近视口时挂载；
- 阅读器由虚拟器控制挂载，不再叠加无依据的全 eager；
- 卡片保留明确宽高比，避免加载后布局跳动；
- `decoding="async"` 只有在实测无正确性或闪烁问题时采用；
- 图片淡入 80–120ms；reduced-motion 下取消淡入。

### 11.7 验收条件

- 网络 miss 时 Response 首字节不等待完整文件下载或缓存落盘；
- 首字节到首张可见的差值比当前基线降低至少 30%；
- 热章节首张可见 p95 小于 350ms；
- 快速跳转 20 页后，旧页任务不再阻塞目标页；
- 峰值并发严格不超过配置；
- 相同 URL 只发起一次网络请求；
- 取消、超时、429、5xx、HTML challenge、损坏图片均有确定性测试；
- 图片顺序和反打乱金样 100% 保持一致；
- 缓存命中 p95 不高于当前 0.80ms 的 120%。

---

## 12. 工作流 5：React 更新边界、拆包与页面保活

### 12.1 Store 订阅

`App` 和 `SettingsPage` 的无 selector 订阅必须拆成精确 selector。Shell 再拆为：

- `AppFrame`；
- `NavigationPane`；
- `PageHost`；
- `NetworkStatusBar`；
- `TitleBar`。

一个状态变化只允许重渲染实际读取该状态的组件。

### 12.2 页面拆包

推荐首批动态导入：

- `MangaDetailPage`；
- `ReaderPage`；
- `DownloadsPage`；
- `SettingsPage`。

首页壳和当前首屏依赖保留在入口 chunk。每个 lazy 页面必须有稳定 Suspense fallback 和 Error Boundary。

### 12.3 页面保活

当前“访问过即永久挂载”改为有界页面缓存：

- 当前页始终挂载；
- 最多保留最近 2 个主页面；
- detail 在进入 reader 时可作为来源页临时保留；
- reader 离开后立即卸载大图和 Canvas；
- 被淘汰页面把必要状态保存为轻量快照；
- 首页、搜索、分类保存 scrollTop、筛选和页码；
- 恢复滚动必须等布局和数据快照准备后执行。

### 12.4 计划位置

- 重构：`src/renderer/src/App.tsx`
- 扩展：`src/renderer/src/stores/appStore.ts`
- 新建：`src/renderer/src/navigation/pageStateCache.ts`
- 新建：`src/renderer/src/components/AppFrame.tsx`
- 新建：`src/renderer/src/components/PageHost.tsx`
- 调整：`electron.vite.config.ts`（仅在自动 dynamic import 分块不足时）
- 新增测试：`src/main/__tests__/navigation*.test.ts`

### 12.5 验收条件

- 任意 store 字段更新不会无条件重渲染整个 App；
- 访问所有主页面后，同时挂载的主页面不超过 3 个；
- 返回首页/搜索/分类能恢复筛选和滚动位置；
- reader 离开后不存在残留 Canvas、图片请求或键盘监听器；
- renderer 首包 raw size 至少降低 25%，或性能 trace 证明 parse/evaluate 明显下降；
- 冷启动到 shell interactive p95 不高于 1.2 秒；
- 页面切换 input-to-next-paint p95 不高于 100ms；
- 拆包加载失败有重试 UI，不形成白屏。

---

## 13. 工作流 6：卡片网格与 UI 使用体验

### 13.1 MangaCard 状态模型

移除 React `hovered` 状态，收藏按钮可见性由 CSS `:hover`、`:focus-within` 和已收藏 class 控制。

收藏状态改为页面级或独立 store：

- 一次加载得到 `Set<string>`；
- 单卡通过 selector 订阅自己的 boolean；
- 乐观更新失败时回滚；
- 同一漫画在多个页面同时出现时状态同步；
- 收藏 IPC 失败提供可见反馈，而不是静默回滚。

`imgLoaded` 是否保留由动画方案决定；若只用于淡入，可考虑原生 class/事件和 reduced-motion。

### 13.2 网格虚拟化决策门

不预设所有网格都虚拟化。

先测量以下场景：

- 24、48、96、200 张卡片；
- 页面滚动 p95 帧时间；
- DOM 数、React commit 和图片内存；
- 返回页面时滚动恢复准确性。

决策规则：

- 少于约 100 张且无明显长任务：使用 `content-visibility:auto`、containment 和渐进挂载；
- 超过约 100 张或滚动 p95 超标：采用 TanStack Virtual grid/lanes；
- 搜索/分类仍为单页 20–40 张时，不因统一性强制虚拟化。

### 13.3 交互细节

- 卡片主体使用可访问的链接/按钮语义；
- 收藏按钮不再嵌套在另一个 `role=button` 中；
- 支持 Enter 与 Space；
- 键盘焦点时收藏按钮可见；
- 触摸设备不依赖 hover 才能发现收藏；
- 卡片按下反馈控制在 80–120ms；
- 图片错误显示局部重试，不让整页失败；
- 列表已有标题和封面应立即用于详情过渡；
- 卡片 hover/focus 停留 100–200ms 后可预取详情，离开时取消；
- 预取只允许低优先级且不得挤占当前阅读图片。

### 13.4 计划位置

- 重构：`src/renderer/src/components/MangaCard.tsx`
- 新建：`src/renderer/src/stores/favoritesStore.ts`
- 调整：首页、搜索、分类、收藏、下载页面
- 可能新建：`src/renderer/src/components/VirtualMangaGrid.tsx`
- 扩展：`src/renderer/src/assets/global.css`

### 13.5 验收条件

- hover 不产生 React commit；
- 收藏列表只请求一次并能跨页面同步；
- 200 卡片基准中滚动 p95 帧时间满足 60Hz 下不高于 25ms；
- 键盘可完成打开、收藏和取消收藏；
- 图片失败只影响对应卡片；
- 页面切换和后台刷新不重置当前焦点、筛选或滚动位置；
- 浅色、深色、Mica 开关和 reduced-motion 均通过视觉检查。

---

## 14. 工作流 7：阅读器反打乱与输入响应

### 14.1 决策门

先增加 `reader.canvas` 纯 CPU span。只有满足以下任一条件才实施 Worker：

- Canvas-only p95 超过 8ms；
- 单次最大耗时超过 16ms；
- 多张同时进入视口时产生超过 50ms Long Task；
- 用户滚动/缩放延迟与反打乱时间存在明确相关性。

若指标低于门槛，保留当前 Canvas，仅优化调度和动画。

### 14.2 Worker 方案

- 使用 Web Worker；
- 使用 `createImageBitmap` 解码输入；
- Worker 内使用 OffscreenCanvas；
- 输出 transferable `ImageBitmap`；
- pool 默认 1，实测后最多 2；
- 任务按当前页距离排序；
- 离开虚拟窗口取消或丢弃结果；
- Worker 崩溃后当前图片回退主线程一次；
- 不在 Worker 和主线程维护两套不同算法源。

推荐把反打乱数学提取为 shared 纯函数，renderer、Worker 和下载端调用同一份条带坐标生成逻辑；图像绘制适配层分别实现。

### 14.3 缩放与拖动

当前 wheel 和 mousemove 会读取布局并立即写 transform。目标设计：

- Pointer Events 统一鼠标、触控笔和触摸；
- wheel/pointermove 只更新 pending ref；
- 每帧最多一次 rAF transform；
- viewport 与图片尺寸由 ResizeObserver 缓存；
- 输入事件中不重复 `querySelector` 和读取 `offsetWidth`；
- 缩放数值 UI 以较低频率更新，不跟随每个 wheel tick React setState；
- 支持双击复位、Esc/快捷键、触控板和平滑缩放；
- 页面切换时清理未提交 rAF。

### 14.4 计划位置

- 提取：`src/shared/imageDescrambleCore.ts`
- 新建：`src/renderer/src/workers/descramble.worker.ts`
- 新建：`src/renderer/src/reader/descramblePool.ts`
- 重构：`src/renderer/src/pages/ReaderPage.tsx`
- 重构：`src/renderer/src/components/ZoomableImage.tsx`
- 对齐：`src/main/imageDescrambler.ts`
- 扩展：图片正确性和 Worker 生命周期测试

### 14.5 内存约束

以历史样本 720×3008 为例，一张 RGBA Canvas 约占 8.7MB，且源位图与输出可能短时并存。因此：

- 同时解码/反打乱任务必须有硬上限；
- 完成 transfer 后及时关闭不再使用的 ImageBitmap；
- reader 离开时终止或清空任务；
- 不为整章预先生成 Canvas；
- diagnostics 记录 mounted bitmap/canvas 数，不记录图片内容。

### 14.6 验收条件

- 全部逐像素金样一致；
- 真实章节抽样截图一致；
- Worker 路径失败可以回退，不形成黑屏；
- Canvas 工作移出后 renderer Long Task 数至少下降 50%，否则不保留复杂实现；
- 缩放/拖动每帧最多一次 transform 写入；
- 快速翻页不会显示上一页迟到结果；
- 离开阅读器后 Worker、ImageBitmap、事件监听器和任务队列均释放。

---

## 15. 工作流 8：主进程 I/O 与后台任务

### 15.1 优先级原则

当前数据库保存 p95 约 1.58ms，不应仅因为存在 `writeFileSync` 就立即迁移数据库。先设触发阈值：

- `database.save` p95 超过 8ms；
- 最大值频繁超过 16ms；
- 数据库文件增长导致用户操作可感知卡顿；
- 下载或历史写入产生连续 main-process long task。

### 15.2 第一阶段

- 历史页码继续防抖和最终 flush；
- 多次数据库写合并到一个短窗口；
- `export()` 与文件写入使用 write coordinator；
- 退出前有限等待关键 flush；
- 下载缓存统计、目录扫描和复制逐项改异步；
- 扫描结果按目录 mtime/显式失效缓存；
- 网络探测不得使用同步注册表/子进程路径阻塞主线程。

### 15.3 第二阶段触发后选择

方案 1：保留 sql.js，把 export/持久化移到 Worker/utility process。

方案 2：迁移到文件型 SQLite，使用专用数据库线程。

只有真实基准显示 sql.js 已成为瓶颈，才在独立设计中二选一。数据库迁移不能附带在其他优化阶段。

### 15.4 计划位置

- 重构：`src/main/database.ts`
- 重构：`src/main/downloadManager.ts`
- 重构：`src/main/downloadCore.ts`
- 重构：`src/main/imageLoader.ts` 的统计与遗留同步路径
- 重构：`src/main/networkProbe.ts`
- 可能新建：`src/main/databaseWriteCoordinator.ts`

### 15.5 验收条件

- 正常浏览期间无超过 100ms 的 main-process 同步任务；
- 写入合并不丢失最终阅读页码和下载进度；
- 应用异常退出后数据库旧版本仍可打开；
- 退出等待有上限，不产生无法退出；
- 大目录扫描不阻塞窗口输入；
- 所有迁移、原子写和失败恢复均有测试。

---

## 16. 工作流 9：内置性能诊断页

### 16.1 用户可见信息

诊断页放在设置页的“高级/性能诊断”入口，默认只读：

- Electron、Chrome、Node、应用版本；
- 硬件加速状态、active GPU、ANGLE backend；
- main/renderer/GPU/utility 进程 CPU 与内存；
- 最近内容 provider 成功率、fallback 率；
- 内容 fresh/stale/miss 比例；
- 图片 cache hit、TTFB、完成、first-visible；
- 图片调度 active/pending/cancelled；
- renderer Long Task、帧间隔；
- Canvas-only p50/p95/max；
- 数据库 flush p50/p95/max；
- warmup 状态与最近失败原因。

### 16.2 操作边界

允许：

- 开始/停止短时采样；
- 复制脱敏摘要；
- 导出脱敏 JSON；
- 清空诊断缓冲。

不允许：

- 显示 Cookie、AVS、密码；
- 输出完整漫画、章节或图片 URL；
- 自动上传诊断数据；
- 在诊断页直接强制 GPU flags；
- 把真实账号信息写入报告。

### 16.3 验收条件

- GPU 信息与 Electron 官方 API 一致；
- 进程指标刷新频率默认不高于每 2 秒一次；
- 页面关闭后停止采样 UI 更新；
- 复制/导出的负向测试确认无敏感字段；
- 诊断页本身不会制造高频 long task。

---

## 17. 工作流 10：在线账号独立项目边界

### 17.1 决策

在线账号不是本性能项目的必需部分。匿名 API provider 稳定并完成基准后，用户可单独决定是否恢复账号项目。

### 17.2 可复用的历史成果

历史 `codex/online-account-completion` 分支中可复核并按需重用：

- API 签名与 AES 解密纯函数；
- protocol profiles；
- API domain resolver；
- 响应大小与重定向限制；
- 独立 Session；
- safeStorage vault；
- generation lease；
- 结构化账号 DTO parser；
- synthetic fixtures；
- 章节 manifest shape 校验；
- 图片 host 漂移处理。

不能直接视为可合并成品，因为历史状态仍有未解问题。

### 17.3 必须先解决的问题

- 登录成功后数秒再次进入 verification-required 的 401 竞态；
- AVS 半过期导致部分 endpoint 200、部分 401；
- 旧 generation 在途请求不得使新 session 失效；
- 登录、恢复、重新验证和退出必须是单一生命周期状态机；
- `price`/`purchased` 空值的权益含义；
- 免费、未购买、已购买和会话过期的真实负向对照；
- 写操作逐项授权和可审计性。

### 17.4 分期范围

若未来批准账号项目，按以下顺序：

1. 登录、退出、状态恢复；
2. 在线收藏和历史只读；
3. 追更、通知、任务只读；
4. 收藏/追更等非经济写操作逐项批准；
5. 已购内容读取在证据完备后评估；
6. 购买、签到等经济或公开写操作默认不做，必须重新设计和明确授权。

### 17.5 验收条件

- 100 次登录/恢复竞态测试无旧请求污染新 generation；
- 所有认证 endpoint 的 401 都能映射到一致状态；
- 退出后内存、Session 和 vault 状态一致清理；
- renderer 永远不能读取原始凭据；
- 自动测试零真实账号请求；
- 真实验证仅使用用户主动提供的测试账号和明确授权的只读操作；
- 付费/购买功能没有正负证据前保持 fail-closed。

---

## 18. 通用错误处理与恢复体验

### 18.1 错误分类

| 分类 | 示例 | UI 行为 |
| --- | --- | --- |
| offline | 无网络、DNS 失败 | 显示 stale、本地内容和重试 |
| timeout | API/图片超时 | 局部重试，不清空已有内容 |
| rate-limited | 429 | 倒计时/后台退避，降低并发 |
| challenge | 403/HTML challenge | 进入 warmup，不缓存错误响应 |
| provider-drift | schema/解密/字段变化 | 自动 fallback，诊断显示 provider 变化 |
| content-invalid | 页数/索引/URL 不合法 | 拒绝缓存，保留旧内容 |
| cache-corrupt | JSON/图片损坏 | 删除单条或自然重建，不清全库 |
| cancelled | 页面离开、快速滚动 | 静默结束，不显示错误 toast |
| session-expired | 账号 401 | 清空敏感 UI，要求重新验证 |
| local-missing | 下载目录移动/文件缺失 | 显示重新定位/重新下载，不自动删记录 |

### 18.2 体验原则

- 页面级错误只用于页面完全不可用；
- 单张图片、单个卡片和后台刷新使用局部错误；
- stale 内容优先于空白 spinner；
- 手动重试不会并发创建重复请求；
- 自动重试有次数和总时间上限；
- 用户离开页面后取消，不弹迟到错误；
- 错误文案告诉用户当前使用的是缓存、API、网页回退还是离线数据。

---

## 19. 全流程交付顺序

### 阶段 0：重新测量与指标补齐

交付物：最新基线报告、Canvas-only 指标、页面 commit/DOM/内存数据。
退出条件：能明确区分网络、缓存、解码、Canvas、React 和 main I/O。

### 阶段 1：低风险 renderer 快速收益

范围：精确 selector、Shell 拆分、页面 lazy、CSS hover、淡入/reduced-motion、缩放 rAF。
退出条件：构建拆包、页面状态不丢、交互指标达到目标。

### 阶段 2：图片网络链路

范围：真正流式、优先级、取消、超时、重试。
退出条件：首张可见提升、快速滚动不被旧任务阻塞、图片正确性不变。

### 阶段 3：匿名移动 API

顺序：`/setting` → search/category → album → comic_read → 首页语义。
退出条件：每个 endpoint 分别达到正确性和 fallback 率门槛。

### 阶段 4：warmup 解耦与缓存治理

范围：验证状态机、stale-first UI、有界内容缓存。
退出条件：API/缓存可用时首页不再被验证阻塞。

### 阶段 5：页面保活与网格

范围：LRU 页面缓存、滚动快照、按测量决定 grid virtualization。
退出条件：访问全应用后的 DOM/内存有界，返回状态准确。

### 阶段 6：阅读器 Worker 决策

只有阶段 0 指标超过门槛才执行。
退出条件：逐像素一致，Long Task 显著下降，否则撤回 Worker 复杂度。

### 阶段 7：主进程 I/O

只有数据库/扫描指标超过门槛才执行数据库层重构。
退出条件：主进程无可感知同步阻塞，数据恢复测试通过。

### 阶段 8：账号功能重新决策

不自动开始。用户需对独立账号设计、真实只读验证和写操作边界重新批准。

---

## 20. 分支、提交与回滚约定

每个阶段使用独立分支，例如：

- `feat/performance-diagnostics`
- `feat/renderer-boundaries`
- `feat/image-streaming-priority`
- `feat/anonymous-app-api`
- `fix/warmup-state-machine`
- `feat/bounded-page-cache`
- `feat/reader-worker`
- `feat/main-io-coordinator`

每个提交遵循：

1. 单一工作流或单个 endpoint；
2. 先提交失败测试或在同一提交记录 TDD 输出；
3. 不夹带格式化和无关清理；
4. 提交前运行相关测试、全量测试、build、diff 检查；
5. 性能变化附同环境前后数据；
6. 默认保留旧 provider/路径开关；
7. 指标或正确性退化时只回退当前阶段；
8. 不自行合并 main。

---

## 21. 测试矩阵

### 21.1 单元与契约测试

- API token、tokenparam、AES 解密；
- profile 选择和运行时版本更新；
- endpoint schema 和 DTO 映射；
- provider fallback、single-flight、取消和 generation；
- 内容缓存 fresh/stale/expired、LRU、容量和原子写；
- 图片 priority queue、同 URL 合并、AbortSignal、超时和重试；
- 流式缓存中断和损坏恢复；
- 页面顺序和反打乱逐像素金样；
- page cache LRU 和滚动快照；
- favorites Set 同步和乐观回滚；
- warmup 状态机；
- 性能日志脱敏。

### 21.2 集成测试

- API 成功不触发 BrowserWindow；
- API 漂移自动回退 direct HTML/browser；
- stale 内容立即返回并只触发一次后台刷新；
- 图片首字节可在缓存写入完成前到达 renderer；
- 快速滚动取消旧任务；
- reader 退出清理 Worker 和图片请求；
- offline 下本地收藏、历史、下载和阅读可用；
- warmup 失败不影响缓存/本地内容。

### 21.3 真实只读验证

- 每个公开 API endpoint 至少 10 次；
- API 与 BrowserWindow 同一时刻结果对照；
- 至少一章 30 页以上的页面顺序对照；
- CDN cache hit/miss；
- 直连、系统代理和手动代理；
- 100%、125%、150%、200% DPI；
- 1280×720、1920×1080和最小窗口；
- AMD iGPU 与可选独显环境只记录差异，不强制设备。

真实账号验证不属于本项目默认矩阵。

### 21.4 视觉检查

- 所有页面浅色/深色；
- Mica 开/关；
- reduced-motion；
- 键盘焦点完整路径；
- 图片加载、失败、重试和 stale 状态；
- 页面返回后的滚动恢复；
- 阅读器单页、连续、缩放、快速翻页；
- 文本截断、中文排版和高 DPI。

---

## 22. 总体验验收指标

| 维度 | 验收目标 |
| --- | --- |
| Shell 冷启动可交互 | p95 ≤ 1.2s |
| fresh/stale 内容首屏 | p95 ≤ 300ms |
| API 冷内容首批 | p95 ≤ 1.5s 或相对 BrowserWindow 提升 ≥40% |
| 页面切换 input-to-next-paint | p95 ≤ 100ms |
| 在线热章节首张可见 | p95 ≤ 350ms |
| 图片首字节到首张可见 | 比当前基线降低 ≥30% |
| 缓存图片主进程处理 | p95 ≤ 0.96ms |
| 60Hz 阅读滚动 | p95 帧间隔 ≤ 25ms |
| renderer Long Task | 正常交互无持续 >50ms 任务 |
| main 长任务 | 正常浏览无 >100ms 同步任务 |
| 页面保活 | 当前页 + 最近 2 个主页面以内 |
| renderer 首包 | raw size 降低 ≥25%，或启动 parse/evaluate 达到同等收益 |
| API fallback | 已发布 endpoint 最近 100 次 <5%，10% 自动降级 |
| 页面顺序/反打乱 | 100% 金样一致，不接受性能换正确性 |
| 离线功能 | 本地收藏、历史、下载、阅读不依赖 warmup |
| 隐私 | 日志、缓存、诊断导出零凭据和完整敏感 URL |

绝对指标若受站点或网络波动影响，必须同时报告同环境相对对照；不得静默降低目标。

---

## 23. 风险登记

| 风险 | 概率 | 影响 | 缓解 |
| --- | --- | --- | --- |
| 移动 API profile 漂移 | 高 | 高 | profile 注册表、setting 发现、严格 fallback |
| API 与网页语义不一致 | 中 | 高 | endpoint 逐项对照，不整体启用 |
| 流式 tee 产生背压/内存问题 | 中 | 高 | 有界流、压力测试、备用临时文件流方案 |
| 请求取消导致缓存半文件 | 中 | 中 | 临时文件、原子 rename、启动清理 |
| 页面 LRU 丢失返回状态 | 中 | 中 | 独立状态/滚动快照契约 |
| Worker 增加内存而收益不足 | 中 | 中 | Canvas 指标门、最多 1–2 worker、收益不足撤回 |
| grid virtualization 破坏滚动恢复 | 中 | 中 | 仅超过门槛时启用，保存 coordinate snapshot |
| warmup 状态误判 | 高 | 中 | 明确 verified evidence，timeout 不等于成功 |
| 内容缓存无限增长 | 中 | 中 | 容量、条目数、LRU、版本命名空间 |
| 在线账号旧 session 污染新 session | 高 | 高 | 独立项目、generation lease、双重 current 检查 |
| 付费权益误判 | 中 | 严重 | fail-closed，无真实证据不开放 |

---

## 24. 设计假设

本设计基于以下明确假设：

1. 用户优先希望改善可感知等待和交互，而不是优先降低安装包体积；
2. Electron + React 继续作为近期主技术栈；
3. 公开内容 API 可以在不登录的情况下提供至少部分只读数据；
4. BrowserWindow 必须保留为兼容回退，直到 API 有足够长期稳定证据；
5. 当前图片和页面正确性比任何性能数字更重要；
6. 在线账号如果恢复，需要再次单独批准；
7. 不新增第三方依赖是默认选择，但不是绝对禁令；
8. 性能目标以生产构建和真实设备为准，不以开发模式体验替代；
9. 当前活跃 iGPU 并不构成故障，不把独显启用作为验收条件；
10. 历史性能数据需要在阶段 0 使用当前代码、当前网络重新采集。

---

## 25. 批准后的下一步

本设计批准后，不直接开始全部实现。下一步应使用 `writing-plans` 技能，按以下顺序分别编写实施计划：

1. 性能诊断与重新基线；
2. renderer 低风险快速收益；
3. 图片流式与优先级；
4. 匿名移动 API；
5. warmup 状态机与内容缓存治理；
6. 页面 LRU 和网格决策；
7. 阅读器 Worker（仅指标触发）；
8. 主进程 I/O（仅指标触发）；
9. 在线账号（仅用户再次明确批准）。

每份计划必须列出具体测试的红/绿步骤、修改文件、验证命令、提交边界和回滚开关。

---

## 26. 参考资料

- Electron Performance：<https://www.electronjs.org/docs/latest/tutorial/performance>
- Electron app GPU APIs：<https://www.electronjs.org/docs/latest/api/app>
- Electron protocol：<https://www.electronjs.org/docs/latest/api/protocol/>
- Electron net：<https://www.electronjs.org/docs/latest/api/net>
- React lazy：<https://react.dev/reference/react/lazy>
- React memo：<https://react.dev/reference/react/memo>
- MDN OffscreenCanvas：<https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas>
- TanStack Virtual：<https://tanstack.com/virtual/latest/docs/introduction>
- Fetch Priority：<https://web.dev/articles/fetch-priority>
- JMComic-Crawler-Python：<https://github.com/hect0x7/JMComic-Crawler-Python>
