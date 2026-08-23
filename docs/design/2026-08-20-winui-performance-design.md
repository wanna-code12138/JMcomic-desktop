# WinUI 视觉重构与性能优化设计

日期：2026-08-20

状态：已批准

范围：界面视觉、内容获取、图片加载、本地存储、性能验证

硬约束：不得改变已经跑通的页面顺序与图片反打乱行为

## 1. 目的

本次工作解决两个彼此相关但需要分阶段交付的问题：

1. 把当前 Aurora Clay（紫粉极光、毛玻璃、发光阴影、大圆角）界面改成克制、专业、接近 Codex 桌面端气质的 WinUI/Fluent 界面。
2. 缩短在线内容、在线图片和本地图片的等待时间，减少主进程卡顿，同时保持页面顺序、反打乱结果、登录、下载和离线阅读逻辑不变。

这里把“WinUI 界面”解释为“采用 WinUI 3 / Fluent 2 的视觉语言与 Windows 行为”，而不是立即把整个程序重写成 C# WinUI 3。若用户要求必须使用原生 WinUI 3 技术栈，则应把它拆成独立迁移项目重新设计；当前推荐方案优先保留已经验证的 Electron 业务链路。

## 2. 当前状态与根因

### 2.1 界面为什么有明显的“AI 感”

当前样式的视觉重心来自：

- 三层紫、粉、蓝径向渐变背景；
- 几乎所有表面都使用 `backdrop-filter`；
- 卡片、按钮、导航选中态同时使用玻璃、内高光、双向 Clay 阴影；
- 紫色渐变主按钮和品牌发光；
- 大量悬浮、缩放和上移动效；
- 页面、卡片、按钮、标签都使用较大的圆角，层级区分主要依赖装饰而非排版。

这些元素单独使用没有问题，但同时高频出现会产生模板化的“AI 生成 SaaS”观感，也增加合成与重绘成本。

### 2.2 在线内容为什么慢

当前所有首页、分类、搜索、详情和章节数据都通过一个隐藏 `BrowserWindow` 获取。窗口导航受互斥锁保护，所有请求串行；每次要等待文档加载、站点脚本执行和轮询，单页可能耗时 1–15 秒。这也是 `docs/ARCHITECTURE.md` 已记录的最大瓶颈。

成熟的 `JMComic-Crawler-Python` 同时提供 HTML 和移动端 API 客户端，并已有异步客户端、`scramble_id` 缓存和图片下载接口，可作为协议行为与失败回退的参考，而不是重新猜测接口。该项目采用 MIT 许可证，但若移植具体代码仍需保留许可证和来源说明。

### 2.3 在线图片为什么慢

当前 `jmimg://` 的未命中路径会：

1. 为每张图查询 Cookie；
2. 通过 `net.request` 下载完整响应并保存所有 chunk；
3. `Buffer.concat` 得到整张图后才返回给渲染器；
4. 同步写入磁盘；
5. 每写一张图都同步扫描整个缓存目录并逐个 `stat`，再执行淘汰。

这造成首字节无法尽快显示、主进程同步 I/O、同一 URL 并发重复下载、缓存越大写入越慢。Electron 官方性能建议明确要求先测量，并避免在主进程使用阻塞 I/O；`net.fetch` / `session.fetch` 使用 Chromium 网络栈并可直接返回标准 `Response`，适合协议层流式转发。

### 2.4 本地加载为什么慢

`jmlocal://` 每加载一张图片都会：

1. 查询数据库以重新计算允许访问的根目录；
2. 使用 `readFileSync` 把整张图读入主进程内存；
3. 再构造完整 `Response`。

数据库使用 `sql.js`：数据库整体常驻内存，每次写操作后 `export()` 全库并 `writeFileSync` 覆盖数据库文件。阅读历史翻页、下载进度等频繁写入会放大 CPU 和磁盘开销。当前代码设置的 `PRAGMA journal_mode = WAL` 对这种“内存数据库整体导出”保存方式没有带来原生文件型 SQLite 的 WAL 优势。

### 2.5 渲染器热点

阅读器已经使用 `@tanstack/react-virtual`，方向正确；但每个可见页面仍在渲染器主线程执行 Canvas 反打乱。当前 overscan 为 3，快速滚动时会同时解码和绘制多张大图。全局大面积 blur、径向渐变和卡片动效也会增加合成成本。

## 3. 不可改变的反打乱与页面顺序契约

### 3.1 我对当前算法的准确理解

页面有两个不同的“顺序”，必须分别保护：

- **页面顺序**：以页面脚本 `page_arr` 的数组顺序为准，提取时给出 `index: i`。并发下载完成顺序不得参与排序；结果必须写回原始索引，下载文件名必须继续使用 `0001`、`0002`……对应数组位置。
- **单张图片内部条带顺序**：由 `scramble_id`、章节 `aid`、文件名和图片高度共同决定，不是根据网络返回顺序处理。

单图反打乱规则如下：

1. 从原始 CDN URL 的 `/photos/{aid}/`（兼容 `photo`、`albums`）中取 `aid`，从 URL 最后一段取去扩展名的 `filename`。这里必须使用原始 CDN URL，不能使用编码后的 `jmimg://` URL。
2. `scrambleId === 0` 或 `aid < scrambleId` 时不处理，原图直接显示或原字节直接返回。
3. `aid < 268850` 时固定分为 10 条。
4. 其他图片令 `x = aid < 421926 ? 10 : 8`，计算十进制字符串拼接 `md5(String(aid) + filename)`；取 32 位十六进制 MD5 的最后一个字符的 `charCode`，`c = (charCode % x) * 2 + 2`。所以同一章节的不同文件名可能得到不同的偶数条带数。
5. 设图片宽高为 `r`、`s`，余数 `f = s % c`。对 `g = 0..c-1`：
   - 基础高度 `stripH = floor(s / c)`；
   - 源位置 `srcY = s - stripH * (g + 1) - f`；
   - 目标位置初始为 `dstY = stripH * g`；
   - `g === 0` 时给该条带高度加上余数 `f`，否则给目标位置加上 `f`；
   - 将 `(0, srcY, r, stripH)` 绘制到 `(0, dstY, r, stripH)`。

`ReaderPage.tsx` 上方概述注释写着“`md5(scrambleId + photoId)`”，但实际运行的 `getNum`、下载端副本和成熟实现都是 `md5(String(aid) + filename)`。前者是过期注释，不能作为重写依据；实施保护测试时应顺手只修正文档注释，不改变运行代码。

当前阅读器与下载器各有一份实现。下载器在 2026-07-17 曾使用 `sharp` 实现，随后因为输出无法保证与阅读器一致，改回隐藏 Chromium Canvas 并逐行复制阅读器算法。这个历史证明：不得仅凭公式相同就替换图像后端。

### 3.2 保护策略

在任何性能重构之前，先增加黑盒特征测试和金样：

- `scrambleId = 0`、`aid < scrambleId` 必须不处理；下载路径必须字节不变。
- 覆盖 `268850`、`421926` 两个边界前后，并固定若干 `aid + filename` 的条带数结果。
- 使用人工生成的彩色横条图片，覆盖 `height % c === 0` 和 `height % c !== 0`，验证每个目标像素行的来源。
- 使用已知真实章节的脱敏小尺寸金样，验证阅读器 Canvas 与下载器 Canvas 的解码像素一致。JPEG 文件不以编码字节哈希作为唯一判断，而比较解码后的像素或容差为零的 PNG 金样。
- 模拟乱序完成的并发下载，验证输出数组仍按输入索引排列，文件名仍按 `page_arr` 顺序编号。
- 抓取结果必须同时保留 `index`、原始 `imageUrl`、`scrambleId`，禁止按 URL、文件名或完成时间再次排序。

第一阶段不抽取、不合并、不改写现有两份 Canvas 算法；测试只从外部观察行为。只有金样稳定后，才允许讨论消除重复实现，而且那不是本次性能优化的必要条件。

## 4. 方案比较

### 方案 A：保留 Electron，分层替换瓶颈（推荐）

保留 Electron 43、React 18、Fluent UI v9、现有 IPC 契约和反打乱实现；重做视觉 token，新增内容网关，优先使用直接 HTTP/API，隐藏浏览器保留为回退；图片和本地文件改为异步流式管线；数据库先减少全库导出，后续迁到文件型 SQLite。

优点：最小化业务回归；可以逐项对比性能；界面可达到 WinUI/Fluent 质感；无需一次性重写。

缺点：安装体积和基础内存仍受 Electron 影响；极致原生控件行为不如 WinUI 3。

### 方案 B：原生 C# + WinUI 3 全量重写

用 C#、WinUI 3、原生 SQLite 和 `HttpClient` 重写 UI 与主进程，反打乱通过 Win2D/SoftwareBitmap 重新实现。

优点：最接近原生 Windows 外观与生命周期；可使用原生虚拟化、文件 I/O 和图像管线。

缺点：所有 IPC、抓取、登录、下载、缓存、数据库和反打乱都要移植；当前最脆弱的图片算法必须换执行环境，回归风险最高；网络瓶颈不会仅因换语言自动消失；周期最长。

该方案只适合用户明确要求“技术栈必须是 WinUI 3”且接受单独迁移项目时采用。

### 方案 C：Tauri/Rust 后端 + Web UI

保留 React/Fluent 外观，使用 Rust 处理网络、文件和数据库。

优点：安装体积和后台内存可下降；Rust 适合流式 I/O 与并发。

缺点：仍不是原生 WinUI 控件；需要重写 Electron 协议、会话、Cloudflare 和 IPC；Windows WebView2 的会话行为需要重新验证；反打乱仍需保留 Web Canvas 或移植，风险接近方案 B 的一部分。

### 结论

选择方案 A。当前可确认的主要瓶颈是串行隐藏浏览器、完整缓冲、同步 I/O、全目录扫描和全库导出，而不是 TypeScript 本身。先消除这些架构瓶颈，再根据真实基准判断是否需要 Rust 或 C# 辅助进程。未经基准证明，不进行技术栈迁移。

## 5. 目标架构

```text
Renderer (React + Fluent UI)
        │  typed IPC / stream events
        ▼
Content Gateway
  ├─ L1 memory cache + in-flight request de-duplication
  ├─ L2 persistent cache (stale-while-revalidate)
  ├─ Direct API/HTTP adapter  ── primary
  └─ BrowserWindow scraper   ── compatibility fallback

Image Gateway (jmimg://)
  ├─ memory in-flight de-duplication
  ├─ indexed disk cache
  ├─ session.fetch streaming + Chromium cache
  └─ bounded prefetch scheduler
        │
        ├─ Reader: existing Canvas descramble, unchanged
        └─ Download: existing serialized hidden Canvas, unchanged

Local Gateway (jmlocal://)
  ├─ cached allowed roots
  └─ asynchronous file stream

Storage
  ├─ phase 1: sql.js batched/debounced atomic persistence
  └─ phase 2: node:sqlite in worker/utility process after compatibility tests
```

## 6. UI 设计

### 6.1 设计语言

采用“安静的 Fluent 工作台”而不是“炫彩玻璃展示页”：

- 窗口背景只保留系统 Mica；内容表面使用低透明或不透明中性色，不叠加极光渐变。
- 全局只保留一个 Windows 蓝/系统强调色。粉紫色不再承担品牌主色，错误、成功、警告各自使用语义色。
- 普通表面不使用 blur；只允许标题栏、临时浮层和阅读器悬浮工具栏使用一次轻量 Acrylic。
- 卡片以 1px 分隔线、明暗层级和留白区分，默认无发光、无 Clay 双阴影。
- 圆角收敛为 4/6/8px 三档；标签可用 999px 胶囊，普通按钮和卡片不用胶囊。
- 字体使用 `Segoe UI Variable` 优先，正文 14px，辅助信息 12px，页面标题 20–24px；减少粗体数量。
- 动效只保留 100–160ms 的颜色/透明度过渡；移除卡片悬浮上移、按钮缩放和整页上浮。
- 加载使用与真实布局一致的骨架，不用大号居中 Spinner 占满页面；错误信息给用户可操作的“重试/切换线路”，调试文本只在开发模式或展开详情中显示。

### 6.2 信息架构与布局

- 标题栏：32–36px，左侧产品名，中间可拖拽，右侧保留下载状态、主题和原生窗口按钮；不使用悬浮胶囊。
- 侧栏：默认 200–216px，平面背景，选中项使用低饱和强调底色和 2px 左侧指示条；图标统一 Fluent 20px。
- 主内容区：页面标题、操作区、内容区形成固定纵向节奏；宽屏时内容最大宽度居中，避免卡片铺满造成廉价感。
- 漫画卡片：封面是主角，文字区平面化；hover 只改变边框/背景，不位移；图片比例固定，未加载时保留尺寸避免布局跳动。
- 详情页：左侧封面、右侧标题与元数据，章节列表使用紧凑行而不是大量玻璃块。
- 阅读器：深色沉浸背景保持；只重做工具栏与页码控件的视觉，不改图片组件、虚拟化、滚动和反打乱逻辑。
- 设置与下载：使用 WinUI `SettingsCard` / `InfoBar` 式行布局，减少每项独立大卡片。

### 6.3 主题实现

新建中性 `winuiTheme` 和语义 CSS token；逐页替换 `auroraTheme`、`auroraBody`、`clayRaised`、`glassCard` 等引用。过渡期允许旧 token 存在但不得新增使用，最后在全局搜索确认引用归零后删除旧主题文件。

不改变页面路由、Zustand 状态、IPC 调用和业务组件输入。UI 改造按壳层 → 公共组件 → 内容页 → 对话框 → 阅读器控件分批提交，每批可单独回滚。

## 7. 性能设计

### 7.1 先建立测量基线

新增轻量性能事件，不上传任何数据，只写开发日志并可导出：

- 应用启动到首个可交互帧；
- 导航开始到首批内容、完整内容；
- 章节点击到拿到 `page_arr`；
- 图片请求到首字节、可解码、反打乱完成、首张显示；
- 缓存命中类型（内存/磁盘/Chromium/网络）；
- 本地章节点击到首张显示；
- 主进程超过 50ms 的长任务、单次数据库保存耗时、缓存扫描耗时；
- 峰值内存和滚动丢帧。

所有优化必须对比同一章节、同一网络环境下至少 10 次冷/热启动数据。没有基准，不以主观“感觉更快”验收。

### 7.2 内容获取：直接 API 优先，浏览器回退

引入 `ContentGateway`，对 UI 保持现有 DTO：

1. 先读持久缓存，若有可用旧数据立即返回并后台刷新（stale-while-revalidate）。
2. 主路径使用 Chromium `session.fetch` 请求移动端 API 或可直接解析的 HTML；复用默认会话、系统代理、Cookie、UA 和连接池。
3. API 的 token、解密、字段映射和 `scramble_id` 行为参考成熟 MIT 项目的协议实现，并为每个转换写固定响应夹具测试；不直接依赖 Python 运行时，也不在生产环境动态执行第三方脚本。
4. API 遇到协议变更、认证失败或字段校验失败时自动回退现有 `BrowserWindow` 抓取，保证功能可用。
5. 回退结果同样写入缓存；记录适配器、耗时和失败原因，便于后续更新协议。
6. 相同 cache key 的并发请求合并为一个 Promise，避免首页切页或组件重挂载造成重复导航。

现有 `scraperWindow` 的互斥锁保留。不能通过创建多个隐藏窗口粗暴并发，因为它会放大 Cloudflare、内存和会话竞态；直接 API 成功率达到验收标准后，浏览器仅承担兼容回退。

### 7.3 图片：流式返回、合并请求、增量缓存

- 使用 `session.defaultSession.fetch(realUrl, { headers })` 获取标准 `Response`，让 Chromium 连接池、代理、Cookie 和 HTTP 缓存继续工作。
- 网络响应尽早流给 `<img>`；缓存写入使用异步流/`ReadableStream.tee()` 或响应克隆，不能等整张图 `Buffer.concat` 后才返回。
- 增加 `Map<url, Promise<ResponseSource>>` 合并同一 URL 的并发请求；结束或失败后清除，失败不得永久缓存。
- 磁盘写入采用临时文件 + 原子重命名，下载中断不能留下被误判为命中的半张图。
- 建立轻量缓存索引（URL hash、路径、大小、最后访问时间），启动时一次恢复；写入时增量更新。淘汰在后台批量执行，不得每写一张图全目录 `readdir + stat`。
- 预取只围绕阅读位置进行：单页模式预取后 2 页、前 1 页；滚动模式以虚拟列表可见范围为中心，动态保持 2–4 页。全章并发预取会抢占首屏带宽，禁止使用。
- 并发数根据错误率和 RTT 自适应，默认从 4 开始，成功稳定后上调，出现 429/5xx/超时则退避；不得用固定超高并发压站点。
- 缓存命中时保留正确 `Content-Type`，并增加文件大小/解码失败校验；损坏缓存自动删除并重新请求。

本阶段不把在线阅读改成“先下载并反打乱后再显示”。阅读器仍获取原始 CDN 图片并在原组件 Canvas 中处理，这样不会改变算法执行环境。

### 7.4 本地图片

- 下载记录改变时更新内存中的 allowed roots，`jmlocal://` 请求不再每张图查询数据库。
- 使用异步文件流构造响应；支持请求取消和背压，避免主进程一次读入整张大图。
- 本地页面列表在打开章节时一次读取并按现有编号规则生成，保持 `0001...` 顺序；只向视口附近图片发请求。
- 元数据和缩略图可建立单独缓存，但原始漫画图不得被二次压缩。

### 7.5 数据库

分两步实施：

**第一步（低风险）**

- 将频繁状态写合并：阅读历史继续防抖，下载进度按时间或页数批量落盘；完成、失败、退出时强制 flush。
- `sql.js export()` 和文件写入不在每个字段更新后执行；保存使用异步临时文件 + 原子替换，并串行化保存任务。
- 为异常退出增加恢复测试，确保批处理不会丢失“完成/失败”等关键状态。

**第二步（基准证明需要后）**

- Electron 43 内含 Node 24，可评估内置 `node:sqlite`，避免增加原生 npm 依赖；但其 `DatabaseSync` API 本身同步，因此放入 Worker Thread 或 utility process，而不是直接在 Electron 主线程频繁调用。
- 迁移保持现有表名、列名和查询语义；先复制旧数据库并校验行数/关键字段，成功后原子切换，旧文件保留可回滚备份。
- 文件型 SQLite 使用事务、prepared statement 和合适的 WAL/同步级别，不再全库导出覆盖。

### 7.6 CPU 与进程隔离

先移除主进程同步 I/O；若基准仍显示 CPU 热点，再把缓存索引、数据库和非核心图像工作放入 Worker/utility process。反打乱不因“CPU 优化”而移到其他图像库。隐藏反打乱窗口继续串行，除非金样测试和真实基准证明它是主要瓶颈，并有逐像素等价方案。

## 8. 数据流与错误处理

### 8.1 内容请求

1. UI 发起带唯一 request key 的请求。
2. ContentGateway 返回缓存快照或订阅已有 in-flight 请求。
3. 直接适配器请求并严格校验 DTO，包括非空 ID、页数、URL 域和 `scrambleId` 类型。
4. 校验失败立即切换浏览器适配器，不把半成品数据交给 UI。
5. 新数据原子写缓存并通知 UI；旧页面上的取消信号阻止过期结果覆盖新页面。

### 8.2 图片请求

1. 校验并解码 `jmimg://` URL，只允许受信 CDN。
2. 查内存 in-flight，再查缓存索引和文件完整性。
3. 未命中时发起可取消的 session fetch，流式返回并异步落盘。
4. 401/403 或 HTML challenge：刷新会话状态并有限重试；不能把 HTML 保存成图片。
5. 429/5xx/网络错误：指数退避并降低并发；UI 显示单页重试，不阻塞已加载页面。

### 8.3 本地与数据库

- 文件不存在、越界或损坏时返回明确状态，UI 提供“重新下载”或“打开目录”。
- 原子写失败保留旧数据库/旧缓存索引；临时文件在下次启动清理。
- 应用退出时等待关键数据库 flush，但设置超时，避免永远无法退出。

## 9. 测试与验证

### 9.1 自动化测试

- 反打乱算法与页面顺序金样测试必须最先失败、再在不改算法的情况下建立通过基线。
- 内容适配器使用保存的 HTML/API 响应夹具，测试字段映射、协议变更、回退和取消竞态。
- 图片网关测试流式首字节、同 URL 去重、半文件不命中、损坏缓存恢复、Content-Type、429 退避和原子落盘。
- 本地协议测试路径安全、根目录缓存失效、编号顺序、缺失文件和取消。
- 数据库测试批量 flush、异常恢复、迁移前后行级等价和回滚。
- UI 使用组件测试覆盖导航、键盘焦点、主题、空状态、错误状态和 reduced-motion。

### 9.2 视觉验证

- 对 100%、125%、150%、200% 缩放以及 1280×720、1920×1080、窄窗口逐页截图。
- 检查浅色/深色/Mica 关闭三种模式。
- 检查键盘导航、焦点环、文本截断、中文排版、对比度和窗口 Snap。
- 阅读器用同一组真实章节对比改造前后截图，图片内容必须完全一致，只有控件样式允许变化。

### 9.3 性能验收目标

下列是首轮目标，实施前先记录基线；若受站点或硬件限制，应以相对提升和可重复数据修订，不得静默降低：

| 场景 | 目标 |
| --- | --- |
| 热缓存页面切换到首批内容 | p95 ≤ 150ms |
| 本地章节点击到首张可见 | p95 ≤ 300ms（常规 SSD） |
| 在线章节拿到 page_arr | 直接适配器 p50 ≤ 1.2s，p95 ≤ 3s |
| 在线章节点击到首张可见 | p50 ≤ 2.5s（已通过 Cloudflare、正常网络） |
| 缓存图片协议处理 | p95 ≤ 50ms，不含 Chromium 解码 |
| 主进程长任务 | 正常浏览期间无 >100ms 的同步 I/O 长任务 |
| 阅读器滚动 | 目标 60fps；连续滚动 p95 帧时间 ≤ 25ms |
| 图片顺序/反打乱 | 金样和真实章节 100% 通过，不接受性能换正确性 |

## 10. 分阶段交付与回滚

1. **保护与测量**：反打乱/顺序金样、性能埋点、基准报告。此阶段不改核心逻辑。
2. **视觉壳层**：主题 token、标题栏、侧栏、公共卡片；逐页视觉迁移，不碰数据层。
3. **本地快路径**：异步本地文件、allowed roots 缓存、数据库写入合并。
4. **图片网关**：流式响应、in-flight 去重、缓存索引、视口预取。
5. **内容网关**：直接 API/HTTP 适配器、持久缓存、浏览器回退。
6. **数据库可选迁移**：只有前述优化后数据库仍是已测瓶颈才迁移 `node:sqlite` 工作线程。
7. **技术栈复评估**：只有量化指标仍不达标，才单独评估 Rust 辅助进程或原生 WinUI 3 重写。

每阶段独立提交、独立开关、可回退。直接适配器、流式图片和新缓存均保留旧路径作为短期兼容开关；验证稳定后再删除旧路径。反打乱旧路径不在本设计中删除。

## 11. 明确不做的事情

- 不在同一个提交中同时重做 UI、网络、数据库和反打乱。
- 不为了并发而改变 `page_arr` 的顺序，不按 URL 或完成时间排序。
- 不用 Sharp、Rust image、Pillow、Win2D 等替换现有 Canvas 反打乱。
- 不把 Python 解释器或第三方 JM 服务作为生产运行时必需项。
- 不创建多个无界隐藏浏览器窗口绕过互斥锁。
- 不用高并发穷举来掩盖协议或缓存问题。
- 不未经基准直接迁移到 C#、Rust、Tauri 或 Flutter。

## 12. 审阅时需要确认的决策

本设计采用以下推荐默认值，用户审阅时可直接批准或指出要改的项：

1. “WinUI”按视觉与交互语言实现，当前技术栈保留 Electron + React + Fluent UI，而非立即原生 C# 重写。
2. UI 方向为中性、克制、接近 Codex 工作台；保留系统 Mica，但移除紫粉极光、Clay 阴影和大面积玻璃。
3. 先交付保护测试与性能基线，再动 UI 和性能实现。
4. 反打乱的两份 Canvas 实现本轮保持原位，不做抽象合并。
5. 在线数据采用“直接 API/HTTP 主路径 + 现有隐藏浏览器回退”，不依赖外部服务。

## 13. 资料依据

- [Electron Performance](https://www.electronjs.org/docs/latest/tutorial/performance)：测量优先、避免阻塞主进程、使用 Worker 处理长任务。
- [Electron net API](https://www.electronjs.org/docs/latest/api/net)：`net.fetch` / `session.fetch` 使用 Chromium 网络栈并返回标准 Response。
- [Electron 43 release](https://www.electronjs.org/blog/electron-43-0)：Electron 43 使用 Node 24，为后续评估 `node:sqlite` 提供运行时基础。
- [Node SQLite API](https://nodejs.org/api/sqlite.html)：`node:sqlite` 的文件型数据库与 `DatabaseSync` 行为。
- [JMComic-Crawler-Python](https://github.com/hect0x7/JMComic-Crawler-Python)：MIT 许可、HTML/API 双客户端和异步实现参考。
- [JMComic client documentation](https://jmcomic.readthedocs.io/zh-cn/latest/api/client/)：异步图片请求、`scramble_id` 获取与缓存行为。
- [JMComic entity documentation](https://jmcomic.readthedocs.io/zh-cn/latest/api/entity/)：`page_arr` 按索引生成图片实体和原始图片 URL 的行为。
