# 账户登录 + 收藏 + 历史记录

**日期**: 2026-07-16
**分支**: `feature/account-login-favorites-history`
**范围**: 账户登录会话、在线/本地收藏、在线/本地历史记录、续读

## 目标

1. 实现目前只是占位符的账户登录功能
2. 登录后可查看禁漫天堂在线收藏和在线历史记录
3. 无论是否登录，本地始终维护自己的收藏和历史记录
4. 本地历史支持"续读"——记录上次阅读章节和页码，下次直接跳回

## 关键决策

- **数据关系**：本地数据始终记录，登录后在收藏/历史页叠加展示在线内容。本地是基础，在线是补充，两套数据不互相覆盖。
- **入口组织**：不加新导航项。收藏页内用 Tab 切换"在线收藏/本地收藏/历史记录"，顶部放登录区。历史记录 Tab 内再分"本地历史/在线历史"子 Tab。
- **登录表单**：收藏页内嵌表单（不用 LoginDialog 弹窗），登录后表单变为用户信息条。LoginDialog 组件保留不删，但本页不引用。
- **登录持久化**：两套模式都做，设置里允许切换：
  - **仅 Cookie 模式**：登录成功后存会话 Cookie + 用户名。重启后用已有 Cookie 访问收藏页验证有效性，失效则要求重新登录。不存密码。
  - **自动重登模式**：额外用 Electron `safeStorage`（Windows DPAPI）加密存密码。重启后自动用凭据重登获取新 Cookie。
- **收藏按钮**：MangaDetailPage 的 Heart 按钮只接本地收藏（`favorites:add/remove`），不依赖登录。在线收藏的"收藏到网站"是后续功能，v1 不做。
- **在线历史**：v1 就做，从禁漫天堂用户历史页抓取（JmWebAdapter HTTP + cheerio）。

## Section 1 — 后端：账户会话与数据层

### 1.1 `accountService.ts`（新模块，单例）

新建 `src/main/accountService.ts`，持有唯一的 `JmWebAdapter` 实例，是登录态的唯一来源。

```
accountService
├── login(username, password) → {success, error?}
│     adapter.login() → 成功后按 persistMode 持久化
│     （cookie 模式存 cookie+username；凭据模式额外用 safeStorage 加密存 password）
│     更新内存态
├── logout() → 清空 adapter cookie/username，删 auth 表相关 key，重置内存态
├── getStatus() → {loggedIn, username, persistMode}
├── setPersistMode('cookie' | 'credential') → 写 auth 表，切换模式
├── validateSession() → 用当前 cookie 调 adapter.getFavorites(1)
│     成功 = cookie 有效
│     失败 + 凭据模式 → 自动重登
│     失败 + cookie 模式 → 标记未登录
├── getFavorites(page) / getHistory(page) → 转发 adapter（未登录抛错）
└── loadOnStartup() → 从 auth 表读 cookie/username/persistMode 灌入 adapter
```

- 持久化用 Electron `safeStorage`（Windows 走 DPAPI 加密）存密码，不裸存。
- `persistMode` 默认值 `'cookie'`（首次使用未设置时）。
- `setPersistMode('cookie')` 时需额外删除 `auth` 表中的 `enc_password` key，避免残留加密密码。
- `auth` 表（已有 key-value）新增约定 key：
  - `session_cookies` — JSON 字符串
  - `username` — 字符串
  - `persist_mode` — `'cookie'` | `'credential'`
  - `enc_password` — safeStorage 加密后转 base64 字符串

### 1.2 修复 adapter 实例 bug

`contentApi.ts` 的 `content:login` / `content:favorites` 不再 `new JmWebAdapter(...)`，改为调 `accountService`。新增 `content:history` 同理委托给 accountService。

### 1.3 `JmWebAdapter.getHistory(page)`（新方法）

仿 `getFavorites`，抓取禁漫天堂用户历史页（`/user/{username}/history` 或站内"继续阅读"端点），regex 解析 album_id / title / cover / 上次阅读章节，返回 `{results, totalPages}`。HTTP + cheerio 路径，与收藏共用同一套 cookie。

返回的 `MangaListItem` 复用现有类型，额外字段（如上次章节）放 `subtitle?: string`。

### 1.4 本地历史 schema 调整 + IPC

现有 `reading_history` 表只有 `manga_id / chapter_index / page_index / read_at`，无法独立展示。改为**一漫画一行（UNIQUE manga_id）的 UPSERT 语义**，补展示列。

幂等迁移（不重建表，适配老安装）：

```sql
ALTER TABLE reading_history ADD COLUMN manga_title TEXT;
ALTER TABLE reading_history ADD COLUMN chapter_title TEXT;
ALTER TABLE reading_history ADD COLUMN chapter_url TEXT;
ALTER TABLE reading_history ADD COLUMN cover_url TEXT;
ALTER TABLE reading_history ADD COLUMN total_pages INTEGER DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_history_manga ON reading_history(manga_id);
```

注意：`ALTER TABLE ADD COLUMN` 在 sql.js 不支持 `IF NOT EXISTS`，迁移逻辑需在代码层先查 `PRAGMA table_info(reading_history)` 判断列是否存在再执行。

新增 IPC（放 `ipc.ts`）：

| IPC | 参数 | 行为 |
|---|---|---|
| `history:upsert` | `{manga_id, manga_title, chapter_index, chapter_title, chapter_url, cover_url, page_index, total_pages}` | `INSERT OR REPLACE`，read_at 自动更新 |
| `history:upsertPage` | `(mangaId, pageIndex)` | 只更新 page_index + read_at，避免每次翻页全量 UPSERT |
| `history:listLocal` | — | 按 read_at DESC 返回全部 |
| `history:getLocal` | `(mangaId)` | 返回单条，供续读跳转 |
| `history:removeLocal` | `(mangaId)` | 删单条 |
| `history:clearLocal` | — | 清空 |

新增对应 preload 暴露（见 Section 2.8）。

### 1.5 账户相关 IPC（新）

| IPC | 参数 | 行为 |
|---|---|---|
| `account:logout` | — | 清空 adapter cookie/username，删 auth 表相关 key |
| `account:getStatus` | — | 返回 `{loggedIn, username, persistMode}` |
| `account:validateSession` | — | 校验当前 cookie 有效性（凭据模式失效自动重登） |
| `auth:setPersistMode` | `('cookie'\|'credential')` | 写 auth 表 |

### 1.6 设置持久化模式

`SettingsPage` 新增"账户"区：显示登录状态/用户名、退出登录、持久化模式切换。

## Section 2 — 前端：UI 与状态

### 2.1 新增 `accountStore.ts`（zustand store）

独立于 `appStore`，专管账户态，避免 appStore 膨胀。

```
accountStore
├── loggedIn: boolean
├── username: string | null
├── persistMode: 'cookie' | 'credential'
├── validating: boolean       // 启动时验证 session 中
├── login(username, password) → 调 content:login，成功后 set state + 持久化
├── logout() → 调 account:logout，清 state
├── validateOnStartup() → 调 account:getStatus / validateSession
├── setPersistMode(mode) → 调 auth:setPersistMode
```

`App.tsx` 在挂载时调 `validateOnStartup()`（cookie 模式静默验证，凭据模式自动重登）。

### 2.2 `FavoritesPage.tsx` 重写（核心 UI）

三层结构，从上到下：

```
┌─ 账户区（顶部，始终显示）─────────────────────┐
│ 未登录：[ 用户名/邮箱 ][ 密码 ][ 登录按钮 ]     │
│         提示文字"登录后可同步在线收藏和历史"     │
│ 已登录：👤 username  [退出]  持久模式 badge     │
├─ Tab 切换 ────────────────────────────────────┤
│ [在线收藏] [本地收藏] [历史记录]                │
├─ 内容区 ──────────────────────────────────────┤
│  在线收藏：未登录→空态提示登录；已登录→          │
│           content:favorites 网格 + 分页         │
│  本地收藏：favorites:list 网格（始终可用）       │
│  历史记录：子 Tab [本地历史][在线历史]           │
│    本地历史：history:listLocal 列表/网格         │
│              每项显示 封面+标题+上次章节+进度     │
│              点击→续读（跳到上次章节+页）         │
│              [清空] 按钮                         │
│    在线历史：未登录→空态；已登录→content:history  │
└────────────────────────────────────────────────┘
```

- 登录区不用 `LoginDialog` 弹窗，改为页内内嵌表单。
- 在线/本地收藏用 `MangaCard` 复用现有组件，点击进详情页。
- 历史记录的"续读"：点击调 `history:getLocal(mangaId)` 取回 `chapter_url` + `page_index`，`openReader` 后跳到该页。

### 2.3 `LoginDialog` 复用决策

保留组件文件（不删，避免破坏导入），但 `FavoritesPage` 用内嵌表单。不在 App.tsx 全局挂载，避免与页内表单重复。

### 2.4 `MangaDetailPage.tsx` 收藏按钮接线

现有 Heart 按钮（line 211）改为真实接线：
- 挂载时查 `favorites:list` 判断当前 manga 是否已收藏 → 初始化 `liked`
- 点击：`liked` ? `favoritesRemove(manga.id)` : `favoritesAdd({mangaId, title, coverUrl})`
- 乐观更新：先翻转 UI，失败回滚
- 只接本地收藏，不依赖登录。在线收藏的"收藏到网站"是后续功能，v1 不做。

### 2.5 `ReaderPage.tsx` + `appStore` 历史记录写入

**问题**：当前 `openReader` 只传 `{mangaTitle, chapterTitle, chapterUrl}`，缺 `mangaId`、`cover`、`chapterIndex`、`totalPages`。

**改造 `ReaderState`**（appStore.ts）：

```ts
interface ReaderState {
  mangaId: string        // 新增
  mangaTitle: string
  mangaCoverUrl: string  // 新增
  chapterIndex: number   // 新增
  chapterTitle: string
  chapterUrl: string
  resumePageIndex?: number  // 新增：续读起始页（来自本地历史）
}
```

`MangaDetailPage` 的 `openReader` 调用处补全这些字段（`manga.id`, `manga.coverUrl`, `ch.index`）。

**ReaderPage 写历史**（三个时机）：

1. **打开章节时**：`history:upsert({...全字段, page_index: resumePageIndex ?? 0})` — 记录"开始读"
2. **翻页时（防抖 2s）**：`history:upsertPage(mangaId, pageIndex)` — 只更新 page_index + read_at
3. **关闭阅读器时**：立即 flush 一次最终 page_index

**续读跳转**：ReaderPage `useEffect` 里若 `readerState.resumePageIndex` 存在，加载完 pages 后 `setCurrentPage(resumePageIndex)`。

### 2.6 `MangaCard` 续读角标

v1 **不做**。历史页本身已满足"查看历史 + 续读"需求，卡片角标会导致每次卡片列表都查历史，放后续改进。

### 2.7 `SettingsPage.tsx` 账户区

在"外观"区前新增"账户"区：

- 登录状态显示（已登录显示用户名，未登录提示去收藏页登录）
- 退出登录按钮（已登录时）
- 持久化模式切换：`Select`（仅 Cookie / 自动重登），切换时调 `accountStore.setPersistMode`
- 说明文字解释两种模式区别

### 2.8 preload 暴露（补全）

新增 preload 方法对应新 IPC：

```ts
// 账户
accountLogout: () => ipcRenderer.invoke('account:logout'),
accountGetStatus: () => ipcRenderer.invoke('account:getStatus'),
accountValidateSession: () => ipcRenderer.invoke('account:validateSession'),
authSetPersistMode: (mode: 'cookie' | 'credential') => ipcRenderer.invoke('auth:setPersistMode', mode),

// 在线历史
contentHistory: (page?: number) => ipcRenderer.invoke('content:history', page),

// 本地历史
historyUpsert: (data: Record<string, unknown>) => ipcRenderer.invoke('history:upsert', data),
historyUpsertPage: (mangaId: string, pageIndex: number) => ipcRenderer.invoke('history:upsertPage', mangaId, pageIndex),
historyListLocal: () => ipcRenderer.invoke('history:listLocal'),
historyGetLocal: (mangaId: string) => ipcRenderer.invoke('history:getLocal', mangaId),
historyRemoveLocal: (mangaId: string) => ipcRenderer.invoke('history:removeLocal', mangaId),
historyClearLocal: () => ipcRenderer.invoke('history:clearLocal'),
```

## Section 3 — 边界与验证

### 不动

- 内容页（首页/搜索/分类/详情/阅读器样式）：除上述接线点外不动
- reader 工具栏、图片反打乱逻辑
- scraperWindow 内容提取路径
- 网络探测 / sessionWarmup
- 冗余的 `NavigationView.tsx`（不在范围内）

### 构建验证项

- TypeScript 编译通过（`npm run build`）
- 未登录时：本地收藏可增删、本地历史记录续读正常工作
- 登录后：在线收藏页加载、在线历史页加载
- 重启应用：cookie 模式静默验证、凭据模式自动重登
- 退出登录：清空会话、回到未登录态、本地数据不受影响

### 已知风险

- 禁漫天堂用户历史页的 URL 和 HTML 结构需实测确认（`/user/{username}/history` 为推断，可能需调整）。若该页 JS 渲染严重，HTTP+cheerio 可能拿不到数据，届时降级为"在线历史 v1 不可用，仅本地历史"，不阻塞其他功能。
- sql.js `ALTER TABLE ADD COLUMN` 不支持 `IF NOT EXISTS`，迁移逻辑需在代码层判断列是否存在。
