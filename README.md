# JMComic Desktop

禁漫天堂（18comic.vip）Windows 桌面客户端 — WinUI 3 风格漫画阅读器。

**核心思路**：内容在主进程通过隐藏 BrowserWindow 提取 → IPC 传结构化数据给渲染进程 → React + Fluent UI 原生渲染。**绝不内嵌 WebView 展示网站原始页面。**

---

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Electron 33 |
| 构建 | electron-vite + Vite 5 |
| 前端 | React 18 + TypeScript 5.6 |
| UI | @fluentui/react-components v9 (Microsoft Fluent UI / WinUI 3 设计语言) |
| 样式 | Tailwind CSS 3 + makeStyles (Fluent) |
| 状态 | zustand 5 |
| 数据库 | sql.js (SQLite compiled to JS) |
| HTTP 客户端 | Electron `net.request`（自动跟随 Windows 系统代理） |
| HTML 解析 | cheerio（HTTP 路径，当前已降级为仅登录/收藏用） |
| 内容提取 | 隐藏 BrowserWindow + executeJavaScript（scraperWindow，主路径） |
| 图片缓存 | 磁盘文件缓存（MD5 hash 文件名）+ 内存 URL→path 映射 |
| 图片代理 | 自定义 `jmimg://` 协议（主进程代理 CDN 请求，加 Referer + Cookie） |
| 打包 | electron-builder (portable 单文件, Windows .exe) |

---

## 项目结构

```
src/
├── main/                    # Electron 主进程
│   ├── index.ts             # 入口：窗口创建、Mica 材质、IPC 注册
│   ├── contentApi.ts        # 内容 IPC 处理器（首页/搜索/分类/详情/章节图片）
│   ├── scraperWindow.ts     # 隐藏 BrowserWindow 内容提取引擎（主路径）
│   ├── siteAdapter.ts       # JmWebAdapter：HTTP + cheerio 解析器（登录/收藏用）
│   ├── httpClient.ts        # HTTP 请求封装（net.request + session cookie 注入）
│   ├── networkProbe.ts      # 网络连通性自动探测（多域名 + 系统代理检测）
│   ├── sessionWarmup.ts     # Cloudflare 绕过：弹出小窗让用户完成验证
│   ├── imageProtocol.ts     # jmimg:// 协议：主进程代理 CDN 图片（加 Referer/Cookie）
│   ├── imageLoader.ts       # 图片下载管线（并发 6、磁盘缓存、重试 3）
│   ├── downloadManager.ts   # 下载管理（队列、并发控制、断点续传）
│   ├── database.ts          # sql.js 封装（manga_cache / reading_history / search_history / downloads / favorites / auth）
│   ├── ipc.ts               # 通用 IPC（数据库、缓存、收藏、认证、搜索历史）
│   └── types.ts             # TypeScript 类型定义 + SiteAdapter 接口
├── preload/
│   └── index.ts             # contextBridge：暴露 electronAPI 给渲染进程
└── renderer/
    ├── index.html           # HTML 入口 + CSP 策略
    └── src/
        ├── App.tsx          # 根组件：导航框架 + 状态栏
        ├── main.tsx         # React 渲染入口
        ├── assets/global.css
        ├── constants/
        │   └── categories.ts      # 分类预定义常量（6 大类型 + 子类型 + 排序 + 时间 + 38 个热门标签）
        ├── stores/
        │   └── appStore.ts        # zustand 全局状态（页面路由、阅读器、网络、主题、pendingSearch）
        ├── pages/
        │   ├── HomePage.tsx         # 首页（推荐/最新/热门 Tab，一次请求三个 Tab 共享）
        │   ├── MangaDetailPage.tsx  # 漫画详情（封面、标签←可点击→搜索、章节列表、阅读/下载按钮）
        │   ├── ReaderPage.tsx       # 阅读器（滚动模式/单页模式、键盘翻页、滚动虚拟化、jmimg:// 图片代理、反打乱）
        │   ├── SearchPage.tsx       # 搜索（搜索历史持久化 chips、关键词/标签筛选、车牌直跳、分页）
        │   ├── CategoriesPage.tsx   # 分类浏览（类型/子类型/排序/时间/热门标签筛选 + 分页）
        │   ├── FavoritesPage.tsx    # 收藏（⚠️ 占位，登录未接入）
        │   ├── DownloadsPage.tsx    # 下载管理（⚠️ 占位，未查询 download:list）
        │   └── SettingsPage.tsx     # 设置（⚠️ 按钮未接入实际逻辑）
        └── components/
            ├── MangaCard.tsx        # 统一漫画卡片组件（封面淡入 + hover 缩放 + 入场 stagger + 收藏钮）
            ├── TitleBar.tsx         # 自定义标题栏（窗口控制 + 主题切换）
            └── LoginDialog.tsx      # 登录对话框（UI 完成，已接入 content:login）
```

---

## 开发和运行

```bash
# 安装依赖
npm install

# 开发模式（Vite HMR + Electron）
npm run dev
# 或直接双击 dev.bat

# 构建
npm run build

# 打包为便携版单文件 .exe（免安装，无外部依赖）
npm run package
```

---

## 核心架构决策与已知问题

### 图片加载三阶段演进

项目经历了三版图片加载方案的迭代：

1. **Base64 方案（已废弃）**：scraperWindow 里用 `fetch()` 下载所有图片转 base64 → CORS 拦截，全部返回空字符串
2. **直接 URL（已废弃）**：渲染进程用 `localhost` 加载 CDN 图片 → Referer 检查拒绝
3. **`jmimg://` 协议代理（当前方案）**：图片 URL 经 base64 编码后通过自定义协议 `jmimg://` 由主进程代理请求，自动加 Referer + Cookie → ✅ 可用

### 内容提取路径

当前 **100% 走 scraperWindow**（隐藏 BrowserWindow + executeJavaScript）：

```
renderer → content:pages → scraperWindow (隐藏浏览器)
                             → 加载完整网页 (3-15s)
                             → executeJavaScript 提取 DOM
                             → 返回数据
```

`JmWebAdapter`（HTTP + cheerio）原先设计为快速主路径，但因禁漫天堂页面大量依赖 JavaScript 渲染，HTTP 拿到的 HTML 几乎是空的，已降级为**仅在登录和收藏接口使用**。

**这是当前最大的性能瓶颈**：每次页面导航都需要加载完整 Chromium 渲染管线，耗时 3-15 秒。

---

## 当前项目问题 / 未完成事项

### 🔴 严重

1. **内容加载慢（3-15 秒/页）**：scraperWindow 是唯一内容提取路径，每次都要加载完整浏览器渲染。理想方案是逆向出禁漫天堂的 API 接口，直接请求 JSON 数据。
2. **封面图可能加载失败**：HomePage 和 MangaDetailPage 的 `<Image>` 组件直接用 CDN URL，没有走 `jmimg://` 代理，可能遇到和之前阅读器一样的 Referer/CORS 问题。

### 🟡 功能缺失

3. **FavoritesPage 是占位**：登录按钮无点击处理，未接入 LoginDialog 和 `content:favorites`。
4. **DownloadsPage 是占位**：始终展示空状态，未调用 `download:list` IPC 查询数据库中的下载任务。
5. **SettingsPage 按钮无实际逻辑**：清空缓存、重新探测、代理输入、缓存大小滑块都没有绑定 handler。

### 🟢 改进建议

7. **阅读器无磁盘缓存集成**：ReaderPage 直接通过 `jmimg://` 代理加载图片，没有预取到磁盘缓存。已浏览的图片每次打开都需要重新从 CDN 加载（虽然 `jmimg://` 设置了 `Cache-Control: max-age=86400`，但这是 HTTP 缓存而非应用层缓存）。
8. **无章节预加载**：阅读当前章时不预加载下一章的首几张图，翻章时有明显等待。
9. **首页无分页/无限滚动**：只提取第一页内容（~24 张卡片），无法浏览更多。
10. **下载无 CBZ/ZIP 导出**：下载的图片以文件夹形式保存，不支持打包为漫画阅读器通用格式。
11. **内容提取无重试**：scraperWindow 导航失败时直接抛错，没有自动重试或切换备用域名。

---

## 后续改进方向

### 短期（修复现有问题）

1. 封面图也走 `jmimg://` 协议代理，统一图片加载管道
2. FavoritesPage 集成登录对话框和收藏列表
3. DownloadsPage 接入 `download:list` 显示下载进度
4. SettingsPage 绑定实际功能（清缓存、重探测、代理配置）
5. **深色模式永久生效**：标题栏主题切换与 FluentProvider 主题联动，支持跟随系统/浅色/深色三态切换。
6. 阅读进度自动保存/恢复
7. **Aurora Clay 设计语言**：毛玻璃面板 + 新拟物凸起 + 极光渐变背景 + 大圆角体系 + CSS 动效（页面过渡 / 卡片 stagger / 图片淡入 / 按压反馈）
8. **阅读器深色沉浸**：阅读区固定深色底 + 悬浮件深色玻璃 + 滚动虚拟化

### 中期（性能优化）

1. **API 逆向**：分析禁漫天堂的 API 接口（如果存在），直接请求 JSON 替代 scraperWindow。这将把内容加载从 3-15s 降到 <1s。
2. 阅读器集成 imageLoader 磁盘缓存（先查缓存，未命中再走 jmimg://）
3. 章节预加载（当前章末尾自动触发下一章前 3 页）
4. 首页无限滚动 / 分页
5. 下载 CBZ 打包

### 长期（体验打磨）

1. 搜索历史、浏览历史
2. 本地收藏夹（独立于网站收藏）
3. 漫画更新订阅通知
4. 多标签页浏览
5. 触控/手势支持
6. macOS 适配（目前仅 Windows）

---

## 对话历史摘要

### 对话 1（2026-06-25，19 turns）
从零搭建了完整的 Electron 桌面客户端。关键决策：
- 选择 Electron + React + TypeScript + Fluent UI（WinUI 3 风格）
- 采用无边框窗口 + Mica 云母材质 + 自定义标题栏
- 内容提取经历 HTTP→scraperWindow→HTTP（JmWebAdapter）→scraperWindow 的反复
- 图片加载经历 base64→直接 URL→jmimg:// 协议代理的三版迭代
- NetworkProbe 实现多域名自动探测 + Windows 系统代理检测
- sessionWarmup 通过弹出小窗让用户手动完成 Cloudflare 验证

### 对话 2（2026-06-25，2 turns）
用户提出 jmimg:// 协议方案解决图片跨域/Referer 问题后，尝试将 contentApi 切换为 JmWebAdapter（HTTP 快速路径）+ scraperWindow fallback，但最终因 HTTP 路径无法处理 JS 渲染页面而回退到纯 scraperWindow。

### 对话 3（2026-07-10 — 2026-07-13，多轮会话）
完整实现了搜索和分类功能：
- **SearchPage 全面接入**：搜索历史和 chips UI（SQLite 持久化，自动去重 + 保留 20 条）、显式搜索按钮、Enter 键搜索、车牌号（6-7 位数字）自动直跳详情页
- **CategoriesPage 完整实现**：类型/子类型/排序/时间筛选 + 38 个热门标签 chips + 网格展示 + 分页（基于 JM 原生 `/albums` 和 `/search/photos?main_tag=` 端点）
- **MangaDetailPage 标签可点击**：点击标签跳转到 SearchPage 并自动以该标签搜索
- **跨页面搜索传递**：通过 zustand store 的 `pendingSearch` 机制，支持 `mainTag=0`（内容标签）过滤
- **两个 Bug 修复**：`main_tag=1` → `main_tag=0`（避免只搜主标签导致结果过少）；时间筛选时自动切换排序为"最多观看"（JM 端点限制）

---

*最后更新：2026-07-19*
