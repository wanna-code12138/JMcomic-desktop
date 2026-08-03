# JMComic Desktop 架构说明

本文档面向想要扩展或维护本项目的开发者，说明核心设计决策与约定。修改涉及以下机制时，请先完整阅读对应源码。

## 进程模型

应用由三个进程组成：

| 进程 | 目录 | 职责 |
| --- | --- | --- |
| Main | `src/main/` | 窗口管理、IPC、抓取引擎、图片代理、下载、数据库 |
| Preload | `src/preload/index.ts` | 通过 `contextBridge` 暴露 `electronAPI`，渲染进程的一切 IPC 都经它 |
| Renderer | `src/renderer/` | React 18 + Fluent UI v9 + Tailwind，纯 UI 层 |

## 内容提取：scraperWindow 单通道

**所有站点内容都来自隐藏 BrowserWindow**（`src/main/scraperWindow.ts`）：加载完整页面后执行 `executeJavaScript` 提取 DOM 数据。

> HTTP + cheerio（`siteAdapter.ts`）无法作为内容主路径——站点页面依赖完整 JS 渲染，纯 HTTP 拿到的是空壳；目前 HTTP 通道仅用于登录 / 收藏接口。

这是当前最大的性能瓶颈（每页 3-15s）。优化方向是逆向站点数据接口，直接请求 JSON。

### 互斥锁（必须遵守）

`scraperWindow` 是单例，通过 `withScraperLock` 互斥。两个并发 `loadURL()` 会互相打断并抛出 `ERR_ABORTED`。

**禁止直接调用 `getScraperWindow()` 做导航**；一律使用导出的提取函数（`extractHomepage`、`extractSearch` 等）。

## 图片加载：jmimg:// 协议

图片必须通过 `src/main/imageProtocol.ts` 注册的 `jmimg://` 协议加载：

```
CDN URL → base64url 编码 → jmimg://img/<encoded> → 主进程代理请求（Referer + Cookie + UA）
```

渲染进程 `<img>` 直接使用 CDN URL 会因 Referer / CORS 检查失败。协议必须在 `app.ready` 前注册（见 `src/main/index.ts`）。

新增图片来源时同步更新 CSP（`src/renderer/index.html` 的 `img-src`）。

## 数据库：sql.js（SQLite → WASM）

- 文件：`{userData}/jmcomic.db`（便携模式下为 exe 同目录）
- sql.js 运行在内存中，**任何写入后必须调用 `saveDatabase()`**，否则重启丢失
- 读写统一走 `db:get` / `db:all` / `db:run` IPC
- 表：`manga_cache`、`reading_history`、`downloads`、`favorites`、`auth`、`search_history`

## 会话预热

启动时小窗加载站点供用户完成 Cloudflare 验证。`isSessionWarmedUp()` 未通过前，抓取会失败——这是设计行为，不要绕过。

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
| 新抓取逻辑 | `src/main/scraperWindow.ts` 增加提取函数（必须走锁） |
| 图片 / 网络 | `imageProtocol.ts` / `imageLoader.ts` / `httpClient.ts` |
| 数据表 | `database.ts` 迁移 + `ipc.ts` handler |
| 核心逻辑 | 尽量写成 `src/main/*Core.ts` 纯函数，配 `src/main/__tests__/` 单测 |

## 已知问题

- 封面图仍直连 CDN，可能加载失败（规划统一走 `jmimg://`）
- 内容提取慢（3-15s/页）
- 阅读器图片未接入磁盘缓存预取
