# 账户登录 + 收藏 + 历史记录 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现账户登录会话、在线/本地收藏、在线/本地历史记录、续读功能，替换现有占位符。

**Architecture:** 新建 `accountService.ts` 单例模块独占 `JmWebAdapter` 实例，统一管理登录态与持久化（safeStorage）。本地收藏/历史走 sql.js 数据库，在线收藏/历史走 HTTP+cheerio。前端新增 `accountStore` zustand store，重写 `FavoritesPage` 用 Tab 切换在线收藏/本地收藏/历史记录，顶部内嵌登录表单。ReaderPage 写本地历史、支持续读跳转。

**Tech Stack:** Electron 33 (main: net/cheerio/safeStorage, renderer: React 18 + Fluent UI v9 + zustand 5), sql.js, TypeScript 5.6

**Spec:** `docs/superpowers/specs/2026-07-16-account-login-favorites-history-design.md`

## Global Constraints

- **无测试框架**：本项目无 jest/vitest。每个任务的验证手段是 `npm run build`（TypeScript 编译通过）。
- **Windows 平台**：safeStorage 走 DPAPI，仅 Windows 验证。
- **命名约定**：IPC channel 用 `namespace:action` 格式（如 `history:upsert`）；preload 方法用 camelCase（如 `historyUpsert`）。
- **Fluent UI v9**：Tab 用 `TabList`+`Tab`（见 HomePage.tsx:166-170 范式）；下拉用 `Select`+`Option`（见 CategoriesPage.tsx 范式）。
- **不删除** `LoginDialog.tsx`（保留组件，但 FavoritesPage 不引用）。
- **不修改**：scraperWindow、图片协议、网络探测、reader 工具栏与反打乱逻辑。
- **commit 风格**：参照现有 `feat: ...` / `fix: ...` 中文 commit message。

---

## File Structure

**新建文件：**
- `src/main/accountService.ts` — 账户会话单例（持 adapter、cookie/凭据持久化、session 验证）
- `src/renderer/src/stores/accountStore.ts` — 账户状态 zustand store

**修改文件：**
- `src/main/database.ts` — reading_history 表幂等迁移（加列 + 唯一索引）
- `src/main/ipc.ts` — 新增 history:* / account:* / auth:setPersistMode IPC handlers
- `src/main/siteAdapter.ts` — 新增 `getHistory(page)` 方法
- `src/main/contentApi.ts` — login/favorites 改委托 accountService，新增 content:history
- `src/preload/index.ts` — 暴露新 IPC 方法
- `src/renderer/src/stores/appStore.ts` — 扩展 ReaderState 字段
- `src/renderer/src/App.tsx` — 挂载时调 accountStore.validateOnStartup
- `src/renderer/src/pages/FavoritesPage.tsx` — 重写：登录区 + Tab(在线收藏/本地收藏/历史记录)
- `src/renderer/src/pages/MangaDetailPage.tsx` — Heart 按钮接线本地收藏 + openReader 补全字段
- `src/renderer/src/pages/ReaderPage.tsx` — 写历史 + 续读跳转
- `src/renderer/src/pages/SettingsPage.tsx` — 新增账户区

---

### Task 1: 本地历史数据库 schema 幂等迁移

**Files:**
- Modify: `src/main/database.ts:30-94` (initTables 函数)

**Interfaces:**
- Produces: `reading_history` 表新增列 `manga_title, chapter_title, chapter_url, cover_url, total_pages`；新增唯一索引 `idx_history_manga(manga_id)`。后续 Task 的 history IPC 依赖这些列存在。

- [ ] **Step 1: 在 initTables 函数末尾追加迁移逻辑**

在 `src/main/database.ts` 的 `initTables` 函数末尾（line 93 `search_history` 建表语句之后、函数闭合 `}` 之前）追加：

```typescript
  // ── reading_history 幂等迁移：补展示列 + 唯一索引 ──
  // sql.js 的 ALTER TABLE ADD COLUMN 不支持 IF NOT EXISTS，需先查列是否存在
  const historyCols = d.exec('PRAGMA table_info(reading_history)')
  const existingCols = new Set(
    historyCols.length > 0 ? historyCols[0].values.map((r) => String(r[1])) : []
  )
  const newCols: Array<[string, string]> = [
    ['manga_title', 'TEXT'],
    ['chapter_title', 'TEXT'],
    ['chapter_url', 'TEXT'],
    ['cover_url', 'TEXT'],
    ['total_pages', 'INTEGER DEFAULT 0']
  ]
  for (const [col, type] of newCols) {
    if (!existingCols.has(col)) {
      d.run(`ALTER TABLE reading_history ADD COLUMN ${col} ${type}`)
    }
  }
  d.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_history_manga ON reading_history(manga_id)')
```

注意：`PRAGMA table_info` 返回的每一行第二列（index 1）是列名。`existingCols` 用 Set 去重判断。

- [ ] **Step 2: 验证编译**

Run: `npm run build`
Expected: 编译通过，无类型错误。

- [ ] **Step 3: Commit**

```bash
git add src/main/database.ts
git commit -m "feat: reading_history 表幂等迁移补展示列+唯一索引"
```

---

### Task 2: 本地历史 IPC handlers

**Files:**
- Modify: `src/main/ipc.ts` (在 searchHistory handlers 之后、auth handlers 之前插入)

**Interfaces:**
- Consumes: Task 1 的 `reading_history` 表新列
- Produces: IPC channels `history:upsert`, `history:upsertPage`, `history:listLocal`, `history:getLocal`, `history:removeLocal`, `history:clearLocal`。数据行结构：`{manga_id, manga_title, chapter_index, page_index, chapter_title, chapter_url, cover_url, total_pages, read_at}`

- [ ] **Step 1: 在 ipc.ts 的 searchHistory:clear handler 之后（约 line 113）插入 history handlers**

在 `src/main/ipc.ts` 中，找到 `searchHistory:clear` handler 的结束（`saveDatabase()` + `})`），在其后、`// Auth` 注释之前插入：

```typescript
  // History (local reading history — one row per manga, UPSERT semantics)
  ipcMain.handle('history:upsert', async (_event, data: {
    manga_id: string; manga_title?: string; chapter_index: number
    chapter_title?: string; chapter_url?: string; cover_url?: string
    page_index: number; total_pages?: number
  }) => {
    const db = await getDatabase()
    db.run(
      `INSERT INTO reading_history
         (manga_id, manga_title, chapter_index, chapter_title, chapter_url, cover_url, page_index, total_pages, read_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))
       ON CONFLICT(manga_id) DO UPDATE SET
         manga_title = excluded.manga_title,
         chapter_index = excluded.chapter_index,
         chapter_title = excluded.chapter_title,
         chapter_url = excluded.chapter_url,
         cover_url = excluded.cover_url,
         page_index = excluded.page_index,
         total_pages = excluded.total_pages,
         read_at = strftime('%s','now')`,
      [data.manga_id, data.manga_title ?? null, data.chapter_index,
       data.chapter_title ?? null, data.chapter_url ?? null, data.cover_url ?? null,
       data.page_index, data.total_pages ?? 0]
    )
    saveDatabase()
  })

  ipcMain.handle('history:upsertPage', async (_event, mangaId: string, pageIndex: number) => {
    const db = await getDatabase()
    db.run(
      `UPDATE reading_history SET page_index = ?, read_at = strftime('%s','now')
       WHERE manga_id = ?`,
      [pageIndex, mangaId]
    )
    saveDatabase()
  })

  ipcMain.handle('history:listLocal', async () => {
    const db = await getDatabase()
    const results = db.exec(
      'SELECT manga_id, manga_title, chapter_index, chapter_title, chapter_url, cover_url, page_index, total_pages, read_at FROM reading_history ORDER BY read_at DESC'
    )
    if (results.length === 0) return []
    const cols = results[0].columns
    return results[0].values.map((row) => {
      const obj: Record<string, unknown> = {}
      cols.forEach((c, i) => { obj[c] = row[i] })
      return obj
    })
  })

  ipcMain.handle('history:getLocal', async (_event, mangaId: string) => {
    const db = await getDatabase()
    const stmt = db.prepare(
      'SELECT manga_id, manga_title, chapter_index, chapter_title, chapter_url, cover_url, page_index, total_pages, read_at FROM reading_history WHERE manga_id = ?'
    )
    stmt.bind([mangaId])
    let row: Record<string, unknown> | null = null
    if (stmt.step()) row = stmt.getAsObject()
    stmt.free()
    return row
  })

  ipcMain.handle('history:removeLocal', async (_event, mangaId: string) => {
    const db = await getDatabase()
    db.run('DELETE FROM reading_history WHERE manga_id = ?', [mangaId])
    saveDatabase()
  })

  ipcMain.handle('history:clearLocal', async () => {
    const db = await getDatabase()
    db.run('DELETE FROM reading_history')
    saveDatabase()
  })
```

注意：`ON CONFLICT(manga_id) DO UPDATE` 依赖 Task 1 创建的唯一索引 `idx_history_mamba`。`db.exec` 返回 `{columns, values}`，手动映射为对象数组（参照现有 `favorites:list` 用 `values.map` 的范式但补上列名映射更健壮）。

- [ ] **Step 2: 验证编译**

Run: `npm run build`
Expected: 编译通过。

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc.ts
git commit -m "feat: 本地历史记录 IPC handlers (upsert/list/get/remove/clear)"
```

---

### Task 3: JmWebAdapter.getHistory 方法

**Files:**
- Modify: `src/main/siteAdapter.ts:272-297` (在 getFavorites 方法之后插入)

**Interfaces:**
- Consumes: `this._username`, `this.cookieJar`, `this.fetchHtml`, `this.buildCoverUrl`（已有）
- Produces: `JmWebAdapter.getHistory(page): Promise<{results: MangaListItem[], totalPages: number}>`。results 的 MangaListItem 用 `latestChapter?` 字段携带上次阅读章节描述。

- [ ] **Step 1: 在 siteAdapter.ts 的 getFavorites 方法之后（line 297 `}` 之后、`// ── Private helpers` 之前）插入 getHistory**

```typescript
  async getHistory(page = 1): Promise<{ results: MangaListItem[]; totalPages: number }> {
    if (!this._username) throw new Error('未登录')
    const params = new URLSearchParams({ page: String(page), o: 'mr' })
    const html = await this.fetchHtml(`/user/${this._username}/history?${params.toString()}`)

    // 历史页结构：与收藏页类似，每条包含 album 链接 + 标题 + 上次阅读章节
    const contentRe = /<a href="\/album\/(\d+)\/[^"]*?"[^>]*?title="([^"]*?)"[\s\S]*?(?:继续阅读|上次阅读|第[\d\s]*[话話])[^<]*?([^<]*?)</g
    const totalRe = / : (\d+)[^/]*\/\D*(\d+)/

    const results: MangaListItem[] = []
    let m: RegExpExecArray | null
    while ((m = contentRe.exec(html)) !== null) {
      results.push({
        id: m[1],
        title: m[2].trim(),
        coverUrl: this.buildCoverUrl(m[1]),
        latestChapter: m[3]?.trim() || undefined
      })
    }

    // Fallback: 若专用 regex 无结果，退化为与收藏相同的 album 链接扫描
    if (results.length === 0) {
      const albumRe = /<a href="\/album\/(\d+)\/[^"]*?"[^>]*?title="([^"]*?)"/g
      const seen = new Set<string>()
      while ((m = albumRe.exec(html)) !== null) {
        if (seen.has(m[1])) continue
        seen.add(m[1])
        results.push({ id: m[1], title: m[2].trim(), coverUrl: this.buildCoverUrl(m[1]) })
      }
    }

    const totalMatch = html.match(totalRe)
    const total = totalMatch ? parseInt(totalMatch[2]) : results.length
    const perPage = 20
    const totalPages = Math.ceil(total / perPage)

    return { results, totalPages }
  }
```

注意：历史页 HTML 结构为推断（spec 已记录此风险）。primary regex 失败时走 fallback album 链接扫描。若实测发现历史页是 JS 渲染拿不到数据，accountService 会捕获异常返回错误，前端显示"在线历史暂不可用"——不阻塞其他功能。

- [ ] **Step 2: 验证编译**

Run: `npm run build`
Expected: 编译通过。

- [ ] **Step 3: Commit**

```bash
git add src/main/siteAdapter.ts
git commit -m "feat: JmWebAdapter.getHistory 抓取用户历史页"
```

---

### Task 4: accountService.ts 单例模块

**Files:**
- Create: `src/main/accountService.ts`

**Interfaces:**
- Consumes: `JmWebAdapter`（siteAdapter.ts）、`getActiveDomain`（networkProbe.ts）、`getDatabase`/`saveDatabase`（database.ts）、`invalidateCookieCache`（httpClient.ts）、Electron `safeStorage`
- Produces: 单例 `accountService` 对象，方法：
  - `login(username, password): Promise<{success: boolean; error?: string}>`
  - `logout(): Promise<void>`
  - `getStatus(): {loggedIn: boolean; username: string | null; persistMode: 'cookie' | 'credential'}`
  - `setPersistMode(mode): Promise<void>`
  - `validateSession(): Promise<{valid: boolean; username: string | null}>`
  - `getFavorites(page): Promise<{results: MangaListItem[]; totalPages: number}>`
  - `getHistory(page): Promise<{results: MangaListItem[]; totalPages: number}>`
  - `loadOnStartup(): Promise<void>`

- [ ] **Step 1: 创建 src/main/accountService.ts**

```typescript
import { safeStorage } from 'electron'
import { JmWebAdapter } from './siteAdapter'
import { getActiveDomain } from './networkProbe'
import { invalidateCookieCache } from './httpClient'
import { getDatabase, saveDatabase } from './database'
import type { MangaListItem } from './types'

type PersistMode = 'cookie' | 'credential'

interface AccountState {
  loggedIn: boolean
  username: string | null
  persistMode: PersistMode
}

class AccountService {
  private adapter: JmWebAdapter | null = null
  private _username: string | null = null
  private _persistMode: PersistMode = 'cookie'

  private getAdapter(): JmWebAdapter {
    if (!this.adapter) {
      this.adapter = new JmWebAdapter([getActiveDomain()])
    }
    return this.adapter
  }

  // ── auth 表 key-value helpers ──
  private async authGet(key: string): Promise<string | null> {
    const db = await getDatabase()
    const stmt = db.prepare('SELECT value FROM auth WHERE key = ?')
    stmt.bind([key])
    let val: string | null = null
    if (stmt.step()) val = String(stmt.getAsObject().value ?? '')
    stmt.free()
    return val
  }

  private async authSet(key: string, value: string): Promise<void> {
    const db = await getDatabase()
    db.run('INSERT OR REPLACE INTO auth (key, value) VALUES (?, ?)', [key, value])
    saveDatabase()
  }

  private async authDelete(key: string): Promise<void> {
    const db = await getDatabase()
    db.run('DELETE FROM auth WHERE key = ?', [key])
    saveDatabase()
  }

  // ── 启动时从 auth 表恢复会话 ──
  async loadOnStartup(): Promise<void> {
    const mode = await this.authGet('persist_mode')
    this._persistMode = (mode === 'credential') ? 'credential' : 'cookie'

    const username = await this.authGet('username')
    const cookiesJson = await this.authGet('session_cookies')
    if (username && cookiesJson) {
      try {
        const cookies = JSON.parse(cookiesJson) as Record<string, string>
        this.getAdapter()['cookieJar'] = cookies
        this._username = username
      } catch { /* 损坏的 cookie 数据，忽略 */ }
    }
  }

  // ── 登录 ──
  async login(username: string, password: string): Promise<{ success: boolean; error?: string }> {
    const result = await this.getAdapter().login(username, password)
    if (!result.success) return result

    this._username = username
    invalidateCookieCache()

    // 持久化 cookie + username（两种模式都存）
    const cookies = { ...this.getAdapter()['cookieJar'] }
    await this.authSet('session_cookies', JSON.stringify(cookies))
    await this.authSet('username', username)

    // 凭据模式额外存加密密码
    if (this._persistMode === 'credential' && safeStorage.isEncryptionAvailable()) {
      const enc = safeStorage.encryptString(password)
      await this.authSet('enc_password', enc.toString('base64'))
    }
    return { success: true }
  }

  // ── 退出登录 ──
  async logout(): Promise<void> {
    this.getAdapter()['cookieJar'] = {}
    this._username = null
    await this.authDelete('session_cookies')
    await this.authDelete('username')
    await this.authDelete('enc_password')
    invalidateCookieCache()
  }

  // ── 状态查询 ──
  getStatus(): AccountState {
    return {
      loggedIn: this._username !== null,
      username: this._username,
      persistMode: this._persistMode
    }
  }

  // ── 切换持久化模式 ──
  async setPersistMode(mode: PersistMode): Promise<void> {
    this._persistMode = mode
    await this.authSet('persist_mode', mode)
    // 切到 cookie 模式时删除加密密码
    if (mode === 'cookie') {
      await this.authDelete('enc_password')
    }
  }

  // ── 校验会话有效性 ──
  async validateSession(): Promise<{ valid: boolean; username: string | null }> {
    if (!this._username) return { valid: false, username: null }
    try {
      await this.getAdapter().getFavorites(1)
      return { valid: true, username: this._username }
    } catch {
      // cookie 失效
      if (this._persistMode === 'credential') {
        // 尝试自动重登
        const encPwd = await this.authGet('enc_password')
        if (encPwd && safeStorage.isEncryptionAvailable()) {
          try {
            const password = safeStorage.decryptString(Buffer.from(encPwd, 'base64'))
            const result = await this.login(this._username, password)
            if (result.success) return { valid: true, username: this._username }
          } catch { /* 解密失败，忽略 */ }
        }
      }
      // cookie 模式或重登失败：标记未登录
      this._username = null
      await this.authDelete('session_cookies')
      return { valid: false, username: null }
    }
  }

  // ── 在线收藏/历史转发 ──
  async getFavorites(page = 1): Promise<{ results: MangaListItem[]; totalPages: number }> {
    if (!this._username) throw new Error('未登录')
    return this.getAdapter().getFavorites(page)
  }

  async getHistory(page = 1): Promise<{ results: MangaListItem[]; totalPages: number }> {
    if (!this._username) throw new Error('未登录')
    return this.getAdapter().getHistory(page)
  }
}

export const accountService = new AccountService()
```

注意：`this.getAdapter()['cookieJar']` 用括号访问私有字段。这是刻意的——accountService 和 JmWebAdapter 同属 main 层，用 bracket 访问绕过 TS 的 private 检查。若 TS 严格报错，改用 `(this.getAdapter() as any).cookieJar`。

- [ ] **Step 2: 验证编译**

Run: `npm run build`
Expected: 编译通过。若 `this.getAdapter()['cookieJar']` 报 TS 错误，改用 `as any` 访问方式。

- [ ] **Step 3: Commit**

```bash
git add src/main/accountService.ts
git commit -m "feat: accountService 单例模块（登录态/持久化/会话校验）"
```

---

### Task 5: 账户 IPC handlers + contentApi 委托

**Files:**
- Modify: `src/main/ipc.ts` (auth handlers 区域追加 account:* / auth:setPersistMode)
- Modify: `src/main/contentApi.ts:104-125` (login/favorites 改委托，新增 content:history)
- Modify: `src/main/index.ts:77-95` (app.whenReady 调 accountService.loadOnStartup)

**Interfaces:**
- Consumes: Task 4 的 `accountService`
- Produces: IPC channels `account:logout`, `account:getStatus`, `account:validateSession`, `auth:setPersistMode`, `content:history`

- [ ] **Step 1: 在 ipc.ts 的 auth handlers 之后（文件末尾 `}` 之前）追加 account IPC**

在 `src/main/ipc.ts` 末尾的 `auth:get` handler 之后、`cache:clearAll` 之前（或文件末尾 `function toObject` 之前）插入：

```typescript
  // Account session (delegated to accountService singleton)
  ipcMain.handle('account:logout', async () => {
    const { accountService } = await import('./accountService')
    await accountService.logout()
  })

  ipcMain.handle('account:getStatus', async () => {
    const { accountService } = await import('./accountService')
    return accountService.getStatus()
  })

  ipcMain.handle('account:validateSession', async () => {
    const { accountService } = await import('./accountService')
    return accountService.validateSession()
  })

  ipcMain.handle('auth:setPersistMode', async (_event, mode: 'cookie' | 'credential') => {
    const { accountService } = await import('./accountService')
    await accountService.setPersistMode(mode)
  })
```

注意：用动态 `await import()` 避免顶层 import 循环依赖风险（accountService import 了 database，ipc 也 import database，静态 import 链可能循环）。实际上 accountService→database 和 ipc→database 是同源不循环，但动态 import 更稳妥。如果编译/运行无循环问题，后续可改为顶层 import。

- [ ] **Step 2: 改写 contentApi.ts 的 login/favorites handler + 新增 content:history**

在 `src/main/contentApi.ts` 顶部 import 区（line 4 之后）追加：

```typescript
import { accountService } from './accountService'
```

将 line 104-114 的 `content:login` handler 替换为：

```typescript
// Login delegated to accountService singleton (single adapter instance)
ipcMain.handle('content:login', async (_event, username: string, password: string) => {
  try {
    await ensureReady()
    return await accountService.login(username, password)
  } catch (err) {
    return { success: false, error: String(err) }
  }
})
```

将 line 117-125 的 `content:favorites` handler 替换为：

```typescript
// Favorites delegated to accountService (uses persisted session)
ipcMain.handle('content:favorites', async (_event, page?: number) => {
  try {
    const data = await accountService.getFavorites(page ?? 1)
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})
```

在 `content:favorites` 之后追加 `content:history`：

```typescript
ipcMain.handle('content:history', async (_event, page?: number) => {
  try {
    const data = await accountService.getHistory(page ?? 1)
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})
```

注意：`content:favorites` 和 `content:history` 不再调 `ensureReady()`——session warmup 已在登录前完成，且 accountService 持有的 adapter 有自己的 cookie，不依赖 scraper session。

- [ ] **Step 3: 在 index.ts 的 app.whenReady 中调 loadOnStartup**

在 `src/main/index.ts` line 77 `app.whenReady().then(() => {` 之后、`registerIpcHandlers()` 之前插入：

```typescript
  // Restore account session from auth table (cookies / username / persist mode)
  import('./accountService').then(({ accountService }) => {
    accountService.loadOnStartup().catch((e) => console.error('[account] loadOnStartup failed:', e))
  })
```

放在 `registerIpcHandlers()` 之前，确保 session 在 IPC handler 可能被调用前恢复。用动态 import 保持与 ipc.ts 一致。

- [ ] **Step 4: 验证编译**

Run: `npm run build`
Expected: 编译通过。

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc.ts src/main/contentApi.ts src/main/index.ts
git commit -m "feat: 账户 IPC + contentApi 委托 accountService + 启动恢复会话"
```

---

### Task 6: preload 暴露新 IPC 方法

**Files:**
- Modify: `src/preload/index.ts:36-39` (auth 区域后) 和 `:84-94` (content 区域)

**Interfaces:**
- Produces: `window.electronAPI` 新增方法：`accountLogout`, `accountGetStatus`, `accountValidateSession`, `authSetPersistMode`, `contentHistory`, `historyUpsert`, `historyUpsertPage`, `historyListLocal`, `historyGetLocal`, `historyRemoveLocal`, `historyClearLocal`

- [ ] **Step 1: 在 preload/index.ts 的 auth 区域（line 38-39 之后）追加账户/历史方法**

将现有 auth 区域：

```typescript
  // Auth
  authSave: (key: string, value: string) => ipcRenderer.invoke('auth:save', key, value),
  authGet: (key: string) => ipcRenderer.invoke('auth:get', key),
```

替换为：

```typescript
  // Auth
  authSave: (key: string, value: string) => ipcRenderer.invoke('auth:save', key, value),
  authGet: (key: string) => ipcRenderer.invoke('auth:get', key),
  authSetPersistMode: (mode: 'cookie' | 'credential') => ipcRenderer.invoke('auth:setPersistMode', mode),

  // Account session
  accountLogout: () => ipcRenderer.invoke('account:logout'),
  accountGetStatus: () => ipcRenderer.invoke('account:getStatus'),
  accountValidateSession: () => ipcRenderer.invoke('account:validateSession'),
```

- [ ] **Step 2: 在 preload/index.ts 的 content 区域（contentFavorites 之后）追加 contentHistory**

将：

```typescript
  contentFavorites: (page?: number) => ipcRenderer.invoke('content:favorites', page),
```

替换为：

```typescript
  contentFavorites: (page?: number) => ipcRenderer.invoke('content:favorites', page),
  contentHistory: (page?: number) => ipcRenderer.invoke('content:history', page),
```

- [ ] **Step 3: 在 preload/index.ts 末尾（contentWarmupStatus 之后、闭合 `}` 之前）追加本地历史方法**

在 `contentWarmupStatus: () => ipcRenderer.invoke('content:warmupStatus')` 之后追加：

```typescript
,

  // Local history
  historyUpsert: (data: Record<string, unknown>) => ipcRenderer.invoke('history:upsert', data),
  historyUpsertPage: (mangaId: string, pageIndex: number) => ipcRenderer.invoke('history:upsertPage', mangaId, pageIndex),
  historyListLocal: () => ipcRenderer.invoke('history:listLocal'),
  historyGetLocal: (mangaId: string) => ipcRenderer.invoke('history:getLocal', mangaId),
  historyRemoveLocal: (mangaId: string) => ipcRenderer.invoke('history:removeLocal', mangaId),
  historyClearLocal: () => ipcRenderer.invoke('history:clearLocal')
```

注意：前面的逗号是为了接在 `contentWarmupStatus` 行之后。确保 JSON 对象语法正确。

- [ ] **Step 4: 验证编译**

Run: `npm run build`
Expected: 编译通过。

- [ ] **Step 5: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat: preload 暴露账户/历史 IPC 方法"
```

---

### Task 7: accountStore (renderer zustand store)

**Files:**
- Create: `src/renderer/src/stores/accountStore.ts`

**Interfaces:**
- Consumes: `window.electronAPI.accountGetStatus`, `accountValidateSession`, `accountLogout`, `contentLogin`, `authSetPersistMode`
- Produces: `useAccountStore` hook，state：`{loggedIn, username, persistMode, validating, login, logout, validateOnStartup, setPersistMode}`

- [ ] **Step 1: 创建 src/renderer/src/stores/accountStore.ts**

```typescript
import { create } from 'zustand'

type PersistMode = 'cookie' | 'credential'

interface AccountState {
  loggedIn: boolean
  username: string | null
  persistMode: PersistMode
  validating: boolean
  login: (username: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  validateOnStartup: () => Promise<void>
  setPersistMode: (mode: PersistMode) => Promise<void>
}

export const useAccountStore = create<AccountState>((set) => ({
  loggedIn: false,
  username: null,
  persistMode: 'cookie',
  validating: false,

  login: async (username: string, password: string): Promise<boolean> => {
    const result = await window.electronAPI?.contentLogin(username, password)
    if (result?.success) {
      set({ loggedIn: true, username })
      return true
    }
    return false
  },

  logout: async (): Promise<void> => {
    await window.electronAPI?.accountLogout()
    set({ loggedIn: false, username: null })
  },

  validateOnStartup: async (): Promise<void> => {
    set({ validating: true })
    try {
      const status = await window.electronAPI?.accountGetStatus()
      if (status?.loggedIn && status.username) {
        set({ loggedIn: true, username: status.username, persistMode: status.persistMode })
        // 静默校验 cookie 有效性（凭据模式会自动重登）
        const result = await window.electronAPI?.accountValidateSession()
        if (result?.valid && result.username) {
          set({ loggedIn: true, username: result.username })
        } else {
          set({ loggedIn: false, username: null })
        }
      } else if (status?.persistMode) {
        set({ persistMode: status.persistMode })
      }
    } catch (e) {
      console.error('[accountStore] validateOnStartup failed:', e)
    } finally {
      set({ validating: false })
    }
  },

  setPersistMode: async (mode: PersistMode): Promise<void> => {
    await window.electronAPI?.authSetPersistMode(mode)
    set({ persistMode: mode })
  }
}))
```

- [ ] **Step 2: 验证编译**

Run: `npm run build`
Expected: 编译通过。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/stores/accountStore.ts
git commit -m "feat: accountStore zustand store (登录/验证/持久化模式)"
```

---

### Task 8: App.tsx 挂载时调 validateOnStartup

**Files:**
- Modify: `src/renderer/src/App.tsx:178` (App 函数体内)

**Interfaces:**
- Consumes: Task 7 的 `useAccountStore.validateOnStartup`

- [ ] **Step 1: 在 App.tsx 顶部 import 区追加 accountStore 导入**

在 `import { useAppStore } from './stores/appStore'` 之后追加：

```typescript
import { useAccountStore } from './stores/accountStore'
```

- [ ] **Step 2: 在 App 函数体内 useAppStore 解构之后追加 validateOnStartup 调用**

将：

```typescript
export default function App({ darkMode, onToggleDarkMode }: AppProps): JSX.Element {
  const styles = useStyles()
  const { currentPage, setCurrentPage, networkStatus } = useAppStore()
```

替换为：

```typescript
export default function App({ darkMode, onToggleDarkMode }: AppProps): JSX.Element {
  const styles = useStyles()
  const { currentPage, setCurrentPage, networkStatus } = useAppStore()
  const validateOnStartup = useAccountStore((s) => s.validateOnStartup)

  React.useEffect(() => {
    validateOnStartup()
  }, [validateOnStartup])
```

注意：App.tsx 已 import React（line 1），无需额外导入。

- [ ] **Step 3: 验证编译**

Run: `npm run build`
Expected: 编译通过。

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: App 挂载时验证账户会话"
```

---

### Task 9: 扩展 ReaderState + MangaDetailPage 补全 openReader 字段 + 接线收藏按钮

**Files:**
- Modify: `src/renderer/src/stores/appStore.ts:3-7,42-43` (ReaderState 接口 + openReader)
- Modify: `src/renderer/src/pages/MangaDetailPage.tsx:82-83,185-189,211-216` (liked 初始化 + openReader 调用 + Heart 接线)

**Interfaces:**
- Produces: `ReaderState` 新增 `mangaId, mangaCoverUrl, chapterIndex, resumePageIndex?`。MangaDetailPage Heart 按钮真实接线 `favoritesAdd/favoritesRemove`。

- [ ] **Step 1: 扩展 appStore.ts 的 ReaderState 接口**

将 `src/renderer/src/stores/appStore.ts` 的：

```typescript
interface ReaderState {
  mangaTitle: string
  chapterTitle: string
  chapterUrl: string
}
```

替换为：

```typescript
interface ReaderState {
  mangaId: string
  mangaTitle: string
  mangaCoverUrl: string
  chapterIndex: number
  chapterTitle: string
  chapterUrl: string
  resumePageIndex?: number
}
```

`openReader` action 签名已用 `ReaderState` 类型，无需改 set 逻辑。

- [ ] **Step 2: MangaDetailPage 初始化 liked 状态 + 补全 openReader 调用 + Heart 接线**

在 `src/renderer/src/pages/MangaDetailPage.tsx` 中：

(a) 在 line 82 附近（`const [orderAsc...` 之前）追加 liked 初始化 effect。将：

```typescript
  const [orderAsc, setOrderAsc] = React.useState(false)
  const [liked, setLiked] = React.useState(false)
```

替换为：

```typescript
  const [orderAsc, setOrderAsc] = React.useState(false)
  const [liked, setLiked] = React.useState(false)
```

然后在 detail load 的 `useEffect` 之后（line 111 `}, [currentMangaId])` 之后）追加查收藏状态 effect：

```typescript
  React.useEffect(() => {
    if (!currentMangaId) return
    let cancelled = false
    async function checkFav(): Promise<void> {
      const list = await window.electronAPI?.favoritesList()
      if (cancelled) return
      const ids = (list ?? []).map((f: any) => f.manga_id)
      setLiked(ids.includes(currentMangaId))
    }
    checkFav()
    return () => { cancelled = true }
  }, [currentMangaId])
```

(b) 将"开始阅读"按钮的 `openReader` 调用（line 185-188）替换为补全字段：

```typescript
                onClick={() => openReader({
                  mangaId: manga.id,
                  mangaTitle: manga.title,
                  mangaCoverUrl: manga.coverUrl,
                  chapterIndex: manga.chapters[0].index,
                  chapterTitle: manga.chapters[0].title,
                  chapterUrl: manga.chapters[0].url
                })}
```

(c) 将章节列表的 `openReader` 调用（两处：line 237-242 的 onClick 和 onKeyDown）替换为补全字段。将：

```typescript
                  onClick={() => openReader({
                    mangaTitle: manga.title,
                    chapterTitle: ch.title,
                    chapterUrl: ch.url
                  })}
                  onKeyDown={(e) => { if (e.key === 'Enter') openReader({ mangaTitle: manga.title, chapterTitle: ch.title, chapterUrl: ch.url }) }}
```

替换为：

```typescript
                  onClick={() => openReader({
                    mangaId: manga.id,
                    mangaTitle: manga.title,
                    mangaCoverUrl: manga.coverUrl,
                    chapterIndex: ch.index,
                    chapterTitle: ch.title,
                    chapterUrl: ch.url
                  })}
                  onKeyDown={(e) => { if (e.key === 'Enter') openReader({ mangaId: manga.id, mangaTitle: manga.title, mangaCoverUrl: manga.coverUrl, chapterIndex: ch.index, chapterTitle: ch.title, chapterUrl: ch.url }) }}
```

(d) 将 Heart 按钮的 onClick（line 213-215）替换为真实接线：

```typescript
                onClick={async () => {
                  if (!window.electronAPI) return
                  const wasLiked = liked
                  setLiked(!wasLiked)
                  try {
                    if (wasLiked) {
                      await window.electronAPI.favoritesRemove(manga.id)
                    } else {
                      await window.electronAPI.favoritesAdd({
                        mangaId: manga.id,
                        title: manga.title,
                        coverUrl: manga.coverUrl
                      })
                    }
                  } catch {
                    setLiked(wasLiked) // 回滚
                  }
                }}
```

- [ ] **Step 3: 验证编译**

Run: `npm run build`
Expected: 编译通过。

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/stores/appStore.ts src/renderer/src/pages/MangaDetailPage.tsx
git commit -m "feat: 扩展 ReaderState 字段 + 详情页收藏按钮接线本地收藏"
```

---

### Task 10: ReaderPage 写本地历史 + 续读跳转

**Files:**
- Modify: `src/renderer/src/pages/ReaderPage.tsx` (load effect + 翻页 + closeReader 调用)

**Interfaces:**
- Consumes: Task 9 扩展后的 `readerState`（含 mangaId/chapterIndex/mangaCoverUrl/resumePageIndex）；Task 6 的 `historyUpsert/historyUpsertPage`

- [ ] **Step 1: 在 ReaderPage 的章节加载 useEffect 中，加载成功后写历史 + 续读跳转**

在 `src/renderer/src/pages/ReaderPage.tsx` 的 load 函数中，`setPages(pageList)` 之后（约 line 379）追加历史写入和续读：

将：

```typescript
        // URLs come from scraperWindow — convert to jmimg:// proxy
        // so the renderer can load them through the main process
        // (which adds proper Referer + session cookies).
        setPages(pageList)
      } catch (err) {
```

替换为：

```typescript
        // URLs come from scraperWindow — convert to jmimg:// proxy
        // so the renderer can load them through the main process
        // (which adds proper Referer + session cookies).
        setPages(pageList)

        // 续读：若指定了 resumePageIndex，跳到该页
        const resume = readerState!.resumePageIndex
        if (typeof resume === 'number' && resume > 0 && resume < pageList.length) {
          setCurrentPage(resume)
        }

        // 写历史：记录"开始读"这一章
        const rs = readerState!
        window.electronAPI?.historyUpsert({
          manga_id: rs.mangaId,
          manga_title: rs.mangaTitle,
          chapter_index: rs.chapterIndex,
          chapter_title: rs.chapterTitle,
          chapter_url: rs.chapterUrl,
          cover_url: rs.mangaCoverUrl,
          page_index: rs.resumePageIndex ?? 0,
          total_pages: pageList.length
        })
      } catch (err) {
```

- [ ] **Step 2: 翻页时防抖写历史**

在 ReaderPage 的 `goNext`/`goPrev` callback 之后（约 line 397），追加防抖写历史 effect。在 `useEffect`（键盘处理，line 399-410）之前插入：

```typescript
  // 翻页时防抖写历史（2s 内连续翻页只写一次）
  const historyTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushHistory = React.useCallback((pageIndex: number): void => {
    if (historyTimer.current) clearTimeout(historyTimer.current)
    historyTimer.current = setTimeout(() => {
      if (readerState?.mangaId) {
        window.electronAPI?.historyUpsertPage(readerState.mangaId, pageIndex)
      }
    }, 2000)
  }, [readerState?.mangaId])

  useEffect(() => {
    if (pages.length > 0) flushHistory(currentPage)
  }, [currentPage, pages.length, flushHistory])
```

注意：需确保 `useEffect` 已在文件顶部 import（line 1 已 import `useEffect`）。

- [ ] **Step 3: 关闭阅读器时立即 flush 最终页码**

在 ReaderPage 中找到 `closeReader` 的使用处（line 428 `onClick={closeReader}`）。将 `closeReader` 调用改为先 flush 再关闭：

将：

```typescript
          style={{ color: '#cccccc' }} onClick={closeReader}
```

替换为：

```typescript
          style={{ color: '#cccccc' }} onClick={() => {
            if (historyTimer.current) {
              clearTimeout(historyTimer.current)
              if (readerState?.mangaId) {
                window.electronAPI?.historyUpsertPage(readerState.mangaId, currentPage)
              }
            }
            closeReader()
          }}
```

- [ ] **Step 4: 验证编译**

Run: `npm run build`
Expected: 编译通过。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/pages/ReaderPage.tsx
git commit -m "feat: ReaderPage 写本地历史 + 续读跳转"
```

---

### Task 11: FavoritesPage 重写（登录区 + Tab + 在线/本地收藏 + 历史）

**Files:**
- Modify: `src/renderer/src/pages/FavoritesPage.tsx` (整文件重写)

**Interfaces:**
- Consumes: `useAccountStore`（Task 7）、`window.electronAPI.contentFavorites/contentHistory/favoritesList/historyListLocal/historyGetLocal/historyClearLocal/favoritesRemove`；`useAppStore.openReader/setCurrentMangaId`；`MangaCard`（components）；`toJmImg`（utils/image）

- [ ] **Step 1: 整文件重写 FavoritesPage.tsx**

```tsx
import React from 'react'
import {
  makeStyles, tokens, Text, Button, Input, Spinner, TabList, Tab,
  Card, Tooltip
} from '@fluentui/react-components'
import {
  Person20Regular, Key20Regular, Dismiss20Regular,
  ArrowPrevious20Regular, ArrowNext20Regular, Delete20Regular
} from '@fluentui/react-icons'
import { MangaCard, type MangaCardData } from '../components'
import { useAppStore } from '../stores/appStore'
import { useAccountStore } from '../stores/accountStore'
import { toJmImg } from '../utils/image'

const useStyles = makeStyles({
  root: { padding: '24px', height: '100%', overflow: 'auto' },
  accountBar: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '12px 16px', marginBottom: '16px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium
  },
  loginForm: {
    display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap'
  },
  userInfo: {
    display: 'flex', alignItems: 'center', gap: '8px', flex: 1
  },
  hint: { fontSize: '12px', color: tokens.colorNeutralForeground3, marginTop: '4px' },
  tabRow: { marginBottom: '16px' },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px'
  },
  statusMsg: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '60px 0',
    color: tokens.colorNeutralForeground3, gap: '12px'
  },
  historyItem: {
    display: 'flex', gap: '12px', padding: '12px',
    borderRadius: tokens.borderRadiusMedium, cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground2 },
    alignItems: 'center'
  },
  historyCover: {
    width: '48px', minWidth: '48px', height: '64px', objectFit: 'cover',
    borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground3
  },
  historyInfo: { flex: 1, minWidth: 0 },
  historyTitle: {
    fontSize: '14px', fontWeight: 500, color: tokens.colorNeutralForeground1,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
  },
  historyMeta: { fontSize: '12px', color: tokens.colorNeutralForeground3, marginTop: '4px' },
  historyActions: { display: 'flex', alignItems: 'center', gap: '4px' },
  subTabRow: { marginBottom: '12px' },
  pagination: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: '12px', marginTop: '24px', marginBottom: '12px'
  },
  pageText: { fontSize: '13px', color: tokens.colorNeutralForeground2, minWidth: '80px', textAlign: 'center' },
  sectionHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: '12px'
  }
})

type MainTab = 'online-fav' | 'local-fav' | 'history'
type HistoryTab = 'local-history' | 'online-history'

interface LocalFavorite {
  manga_id: string; title: string; cover_url: string; added_at: number
}
interface LocalHistoryRow {
  manga_id: string; manga_title: string; chapter_index: number
  chapter_title: string; chapter_url: string; cover_url: string
  page_index: number; total_pages: number; read_at: number
}

export default function FavoritesPage(): JSX.Element {
  const styles = useStyles()
  const { loggedIn, username, validating, login, logout } = useAccountStore()
  const openReader = useAppStore((s) => s.openReader)
  const setCurrentMangaId = useAppStore((s) => s.setCurrentMangaId)

  const [loginUser, setLoginUser] = React.useState('')
  const [loginPwd, setLoginPwd] = React.useState('')
  const [loginLoading, setLoginLoading] = React.useState(false)
  const [loginErr, setLoginErr] = React.useState('')

  const [mainTab, setMainTab] = React.useState<MainTab>('local-fav')
  const [historyTab, setHistoryTab] = React.useState<HistoryTab>('local-history')

  // 在线收藏
  const [onlineFav, setOnlineFav] = React.useState<MangaCardData[]>([])
  const [onlineFavPage, setOnlineFavPage] = React.useState(1)
  const [onlineFavTotal, setOnlineFavTotal] = React.useState(1)
  const [onlineFavLoading, setOnlineFavLoading] = React.useState(false)
  const [onlineFavErr, setOnlineFavErr] = React.useState('')

  // 本地收藏
  const [localFav, setLocalFav] = React.useState<LocalFavorite[]>([])

  // 本地历史
  const [localHistory, setLocalHistory] = React.useState<LocalHistoryRow[]>([])

  // 在线历史
  const [onlineHistory, setOnlineHistory] = React.useState<MangaCardData[]>([])
  const [onlineHistoryPage, setOnlineHistoryPage] = React.useState(1)
  const [onlineHistoryTotal, setOnlineHistoryTotal] = React.useState(1)
  const [onlineHistoryLoading, setOnlineHistoryLoading] = React.useState(false)
  const [onlineHistoryErr, setOnlineHistoryErr] = React.useState('')

  // ── 登录处理 ──
  const handleLogin = async (): Promise<void> => {
    if (!loginUser.trim() || !loginPwd.trim()) {
      setLoginErr('请输入用户名和密码')
      return
    }
    setLoginLoading(true)
    setLoginErr('')
    const ok = await login(loginUser.trim(), loginPwd)
    if (!ok) setLoginErr('登录失败，请检查用户名和密码')
    setLoginLoading(false)
  }

  // ── 加载本地收藏 ──
  const loadLocalFav = React.useCallback(async (): Promise<void> => {
    const list = (await window.electronAPI?.favoritesList()) as LocalFavorite[] | undefined
    setLocalFav(list ?? [])
  }, [])

  // ── 加载本地历史 ──
  const loadLocalHistory = React.useCallback(async (): Promise<void> => {
    const list = (await window.electronAPI?.historyListLocal()) as LocalHistoryRow[] | undefined
    setLocalHistory(list ?? [])
  }, [])

  // ── 加载在线收藏 ──
  const loadOnlineFav = React.useCallback(async (page: number): Promise<void> => {
    if (!loggedIn) return
    setOnlineFavLoading(true)
    setOnlineFavErr('')
    try {
      const result = await window.electronAPI?.contentFavorites(page)
      if (result?.ok && result.data) {
        setOnlineFav(result.data.results.map((m: any) => ({
          id: m.id, title: m.title, coverUrl: m.coverUrl
        })))
        setOnlineFavTotal(result.data.totalPages ?? 1)
        setOnlineFavPage(page)
      } else {
        setOnlineFavErr(result?.error || '加载失败')
      }
    } catch (e) {
      setOnlineFavErr(String(e))
    }
    setOnlineFavLoading(false)
  }, [loggedIn])

  // ── 加载在线历史 ──
  const loadOnlineHistory = React.useCallback(async (page: number): Promise<void> => {
    if (!loggedIn) return
    setOnlineHistoryLoading(true)
    setOnlineHistoryErr('')
    try {
      const result = await window.electronAPI?.contentHistory(page)
      if (result?.ok && result.data) {
        setOnlineHistory(result.data.results.map((m: any) => ({
          id: m.id, title: m.title, coverUrl: m.coverUrl, latestChapter: m.latestChapter
        })))
        setOnlineHistoryTotal(result.data.totalPages ?? 1)
        setOnlineHistoryPage(page)
      } else {
        setOnlineHistoryErr(result?.error || '加载失败')
      }
    } catch (e) {
      setOnlineHistoryErr(String(e))
    }
    setOnlineHistoryLoading(false)
  }, [loggedIn])

  // ── Tab 切换时加载数据 ──
  React.useEffect(() => {
    if (mainTab === 'local-fav') loadLocalFav()
    else if (mainTab === 'online-fav' && loggedIn) loadOnlineFav(1)
    else if (mainTab === 'history') {
      if (historyTab === 'local-history') loadLocalHistory()
      else if (historyTab === 'online-history' && loggedIn) loadOnlineHistory(1)
    }
  }, [mainTab, historyTab, loggedIn, loadLocalFav, loadOnlineFav, loadLocalHistory, loadOnlineHistory])

  // ── 续读 ──
  const handleResume = async (mangaId: string): Promise<void> => {
    const row = (await window.electronAPI?.historyGetLocal(mangaId)) as LocalHistoryRow | null
    if (!row) return
    openReader({
      mangaId: row.manga_id,
      mangaTitle: row.manga_title,
      mangaCoverUrl: row.cover_url,
      chapterIndex: row.chapter_index,
      chapterTitle: row.chapter_title,
      chapterUrl: row.chapter_url,
      resumePageIndex: row.page_index
    })
  }

  // ── 删除本地历史单条 ──
  const handleRemoveHistory = async (mangaId: string): Promise<void> => {
    await window.electronAPI?.historyRemoveLocal(mangaId)
    loadLocalHistory()
  }

  // ── 清空本地历史 ──
  const handleClearHistory = async (): Promise<void> => {
    await window.electronAPI?.historyClearLocal()
    loadLocalHistory()
  }

  // ── 删除本地收藏 ──
  const handleRemoveFav = async (mangaId: string): Promise<void> => {
    await window.electronAPI?.favoritesRemove(mangaId)
    loadLocalFav()
  }

  return (
    <div className={styles.root}>
      {/* 账户区 */}
      <div className={styles.accountBar}>
        {validating ? (
          <Spinner size="tiny" />
        ) : loggedIn ? (
          <>
            <div className={styles.userInfo}>
              <Person20Regular />
              <Text weight="semibold">{username}</Text>
            </div>
            <Button size="small" icon={<Dismiss20Regular />} onClick={logout}>退出登录</Button>
          </>
        ) : (
          <div className={styles.loginForm}>
            <Input
              placeholder="用户名 / 邮箱"
              value={loginUser}
              onChange={(_e, d) => setLoginUser(d.value)}
              contentBefore={<Person20Regular />}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLogin() }}
              disabled={loginLoading}
              size="small"
            />
            <Input
              type="password"
              placeholder="密码"
              value={loginPwd}
              onChange={(_e, d) => setLoginPwd(d.value)}
              contentBefore={<Key20Regular />}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLogin() }}
              disabled={loginLoading}
              size="small"
            />
            <Button appearance="primary" size="small" onClick={handleLogin} disabled={loginLoading}>
              {loginLoading ? <Spinner size="tiny" /> : '登录'}
            </Button>
            {loginErr && <Text size={200} style={{ color: tokens.colorStatusDangerForeground1 }}>{loginErr}</Text>}
          </div>
        )}
      </div>
      {!loggedIn && !validating && (
        <div className={styles.hint}>登录后可同步您的禁漫天堂在线收藏和历史记录</div>
      )}

      {/* 主 Tab */}
      <div className={styles.tabRow}>
        <TabList selectedValue={mainTab} onTabSelect={(_e, d) => setMainTab(d.value as MainTab)}>
          <Tab value="online-fav">在线收藏</Tab>
          <Tab value="local-fav">本地收藏</Tab>
          <Tab value="history">历史记录</Tab>
        </TabList>
      </div>

      {/* 在线收藏 */}
      {mainTab === 'online-fav' && (
        !loggedIn ? (
          <div className={styles.statusMsg}><Text>请先登录后查看在线收藏</Text></div>
        ) : onlineFavLoading ? (
          <div className={styles.statusMsg}><Spinner size="large" /><Text>加载中...</Text></div>
        ) : onlineFavErr ? (
          <div className={styles.statusMsg}><Text>⚠️ {onlineFavErr}</Text></div>
        ) : onlineFav.length === 0 ? (
          <div className={styles.statusMsg}><Text>暂无在线收藏</Text></div>
        ) : (
          <>
            <div className={styles.grid}>
              {onlineFav.map((m) => <MangaCard key={m.id} manga={m} />)}
            </div>
            <div className={styles.pagination}>
              <Button size="small" icon={<ArrowPrevious20Regular />} disabled={onlineFavPage <= 1}
                onClick={() => loadOnlineFav(onlineFavPage - 1)}>上一页</Button>
              <span className={styles.pageText}>{onlineFavPage} / {onlineFavTotal}</span>
              <Button size="small" icon={<ArrowNext20Regular />} disabled={onlineFavPage >= onlineFavTotal}
                onClick={() => loadOnlineFav(onlineFavPage + 1)}>下一页</Button>
            </div>
          </>
        )
      )}

      {/* 本地收藏 */}
      {mainTab === 'local-fav' && (
        localFav.length === 0 ? (
          <div className={styles.statusMsg}>
            <Text>暂无本地收藏</Text>
            <Text size={200}>在漫画详情页点击爱心收藏</Text>
          </div>
        ) : (
          <div className={styles.grid}>
            {localFav.map((f) => (
              <div key={f.manga_id} style={{ position: 'relative' }}>
                <MangaCard manga={{ id: f.manga_id, title: f.title, coverUrl: f.cover_url }} />
                <Tooltip content="取消收藏" relationship="label">
                  <Button size="small" appearance="subtle" icon={<Dismiss20Regular />}
                    style={{ position: 'absolute', top: '4px', right: '4px' }}
                    onClick={(e) => { e.stopPropagation(); handleRemoveFav(f.manga_id) }} />
                </Tooltip>
              </div>
            ))}
          </div>
        )
      )}

      {/* 历史记录 */}
      {mainTab === 'history' && (
        <>
          <div className={styles.subTabRow}>
            <TabList selectedValue={historyTab} onTabSelect={(_e, d) => setHistoryTab(d.value as HistoryTab)} size="small">
              <Tab value="local-history">本地历史</Tab>
              <Tab value="online-history">在线历史</Tab>
            </TabList>
          </div>

          {historyTab === 'local-history' && (
            localHistory.length === 0 ? (
              <div className={styles.statusMsg}><Text>暂无阅读历史</Text></div>
            ) : (
              <>
                <div className={styles.sectionHeader}>
                  <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
                    {localHistory.length} 条记录
                  </Text>
                  <Button size="small" appearance="subtle" icon={<Delete20Regular />}
                    onClick={handleClearHistory}>清空</Button>
                </div>
                {localHistory.map((h) => (
                  <div key={h.manga_id} className={styles.historyItem}
                    onClick={() => handleResume(h.manga_id)}
                    role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleResume(h.manga_id) }}
                  >
                    {h.cover_url ? (
                      <img className={styles.historyCover} src={toJmImg(h.cover_url)} alt={h.manga_title} />
                    ) : (
                      <div className={styles.historyCover} />
                    )}
                    <div className={styles.historyInfo}>
                      <div className={styles.historyTitle}>{h.manga_title}</div>
                      <div className={styles.historyMeta}>
                        {h.chapter_title} · 第 {h.page_index + 1}/{h.total_pages || '?'} 页
                      </div>
                    </div>
                    <div className={styles.historyActions}>
                      <Tooltip content="删除" relationship="label">
                        <Button size="small" appearance="subtle" icon={<Dismiss20Regular />}
                          onClick={(e) => { e.stopPropagation(); handleRemoveHistory(h.manga_id) }} />
                      </Tooltip>
                    </div>
                  </div>
                ))}
              </>
            )
          )}

          {historyTab === 'online-history' && (
            !loggedIn ? (
              <div className={styles.statusMsg}><Text>请先登录后查看在线历史</Text></div>
            ) : onlineHistoryLoading ? (
              <div className={styles.statusMsg}><Spinner size="large" /><Text>加载中...</Text></div>
            ) : onlineHistoryErr ? (
              <div className={styles.statusMsg}>
                <Text>⚠️ {onlineHistoryErr}</Text>
                <Text size={200}>在线历史页可能无法抓取，请使用本地历史</Text>
              </div>
            ) : onlineHistory.length === 0 ? (
              <div className={styles.statusMsg}><Text>暂无在线历史</Text></div>
            ) : (
              <>
                <div className={styles.grid}>
                  {onlineHistory.map((m) => <MangaCard key={m.id} manga={m} />)}
                </div>
                <div className={styles.pagination}>
                  <Button size="small" icon={<ArrowPrevious20Regular />} disabled={onlineHistoryPage <= 1}
                    onClick={() => loadOnlineHistory(onlineHistoryPage - 1)}>上一页</Button>
                  <span className={styles.pageText}>{onlineHistoryPage} / {onlineHistoryTotal}</span>
                  <Button size="small" icon={<ArrowNext20Regular />} disabled={onlineHistoryPage >= onlineHistoryTotal}
                    onClick={() => loadOnlineHistory(onlineHistoryPage + 1)}>下一页</Button>
                </div>
              </>
            )
          )}
        </>
      )}
    </div>
  )
}
```

注意：
- `toJmImg` 已在 utils/image 存在（ReaderPage 使用过）。
- 本地收藏卡片右上角的取消收藏按钮用 `e.stopPropagation()` 阻止冒泡到 MangaCard 的点击。
- `MangaCard` 的 `latestChapter` 字段已存在于 `MangaCardData` 接口（components/MangaCard.tsx:46），在线历史可直接用。
- `contentFavorites` 返回 `{ok, data: {results, totalPages}}`，`contentHistory` 同结构。

- [ ] **Step 2: 验证编译**

Run: `npm run build`
Expected: 编译通过。若 `any` 类型报严格错误，检查 tsconfig strict 设置；本项目 SearchPage 也用 `any`，应可通过。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/pages/FavoritesPage.tsx
git commit -m "feat: FavoritesPage 重写（登录区+Tab+在线/本地收藏+历史+续读）"
```

---

### Task 12: SettingsPage 新增账户区

**Files:**
- Modify: `src/renderer/src/pages/SettingsPage.tsx:22-25` (在"外观"区前插入账户区)

**Interfaces:**
- Consumes: `useAccountStore`（loggedIn/username/persistMode/logout/setPersistMode）；`useAppStore.setCurrentPage`（跳收藏页登录）

- [ ] **Step 1: 在 SettingsPage.tsx 顶部追加 imports**

将：

```typescript
import { useAppStore } from '../stores/appStore'
```

替换为：

```typescript
import { useAppStore } from '../stores/appStore'
import { useAccountStore } from '../stores/accountStore'
import {
  Dropdown, Option, type OptionOnSelectData, type SelectionEvents
} from '@fluentui/react-components'
```

注意：用 `Dropdown`+`Option` 做持久化模式切换（与 CategoriesPage 的 Select 范式一致，但 Dropdown 更适合单选场景；若项目已用 Select，统一用 Select——参照 CategoriesPage.tsx 用的是 `Select`，这里也用 Select 保持一致）。

修正 import（与项目一致用 Select）：

```typescript
import { useAppStore } from '../stores/appStore'
import { useAccountStore } from '../stores/accountStore'
import {
  Select, type OptionOnSelectData, type SelectionEvents
} from '@fluentui/react-components'
```

- [ ] **Step 2: 在 SettingsPage 函数体内解构 accountStore**

将：

```typescript
  const { darkMode, toggleDarkMode, networkStatus } = useAppStore()
```

替换为：

```typescript
  const { darkMode, toggleDarkMode, networkStatus } = useAppStore()
  const { loggedIn, username, persistMode, logout, setPersistMode } = useAccountStore()
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)

  const onPersistModeChange = (_e: SelectionEvents, d: OptionOnSelectData): void => {
    setPersistMode(d.optionValue as 'cookie' | 'credential')
  }
```

- [ ] **Step 3: 在"外观"区之前插入账户区 JSX**

在 return 的 `<div className={styles.root}>` 之后、"外观"section 之前插入：

```tsx
      {/* Account */}
      <div className={styles.section}>
        <Text size={500} weight="semibold" className={styles.sectionTitle}>账户</Text>
        <Card className={styles.card}>
          {loggedIn ? (
            <div className={styles.row}>
              <div>
                <Text weight="semibold">已登录: {username}</Text>
                <div><Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>禁漫天堂账户</Text></div>
              </div>
              <Button size="small" appearance="secondary" onClick={logout}>退出登录</Button>
            </div>
          ) : (
            <div className={styles.row}>
              <div>
                <Text weight="semibold">未登录</Text>
                <div><Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>登录后可同步在线收藏和历史</Text></div>
              </div>
              <Button size="small" appearance="primary" onClick={() => setCurrentPage('favorites')}>去登录</Button>
            </div>
          )}
        </Card>
        <Card className={styles.card}>
          <div className={styles.row}>
            <div>
              <Text weight="semibold">登录持久化模式</Text>
              <div><Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                {persistMode === 'cookie'
                  ? '仅 Cookie：重启后验证 Cookie 有效性，失效需重新登录'
                  : '自动重登：加密保存密码，重启后自动重新登录'}
              </Text></div>
            </div>
            <Select value={persistMode} onOptionSelect={onPersistModeChange} style={{ width: '160px' }}>
              <Option value="cookie">仅 Cookie</Option>
              <Option value="credential">自动重登</Option>
            </Select>
          </div>
        </Card>
      </div>
```

- [ ] **Step 4: 验证编译**

Run: `npm run build`
Expected: 编译通过。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/pages/SettingsPage.tsx
git commit -m "feat: SettingsPage 新增账户区（状态/退出/持久化模式）"
```

---

### Task 13: 最终构建验证 + 冒烟检查

**Files:** 无修改，仅验证

- [ ] **Step 1: 完整构建**

Run: `npm run build`
Expected: 编译通过，无 TypeScript 错误，输出 `out/` 目录。

- [ ] **Step 2: 检查所有新 IPC 已接线**

用 grep 确认每个新 IPC channel 在 main + preload + 至少一个 renderer 调用点都存在：

```bash
rg "history:upsert|history:upsertPage|history:listLocal|history:getLocal|history:removeLocal|history:clearLocal|account:logout|account:getStatus|account:validateSession|auth:setPersistMode|content:history" src/
```

Expected: 每个 channel 至少在 `ipc.ts`/`contentApi.ts`（handler）、`preload/index.ts`（暴露）、renderer（调用点）出现。

- [ ] **Step 3: 确认无遗留占位**

```bash
rg "占位|placeholder" src/renderer/src/pages/FavoritesPage.tsx src/renderer/src/pages/SettingsPage.tsx
```

Expected: 无匹配（占位已替换为真实实现）。

- [ ] **Step 4: 检查 git 状态干净**

```bash
git status
```

Expected: working tree clean（所有改动已提交）。

- [ ] **Step 5: 查看 commit 历史**

```bash
git log --oneline -15
```

Expected: 能看到本分支的 12 个 feat commit + 之前的 spec commit，均在 `feature/account-login-favorites-history` 分支。

---

## Self-Review 结果

**1. Spec coverage（逐项核对）：**
- ✅ 1.1 accountService 单例 → Task 4
- ✅ 1.2 修复 adapter 实例 bug → Task 5（contentApi 委托）
- ✅ 1.3 getHistory 方法 → Task 3
- ✅ 1.4 reading_history schema 迁移 + IPC → Task 1 + Task 2
- ✅ 1.5 账户 IPC → Task 5
- ✅ 1.6 设置持久化模式 → Task 12
- ✅ 2.1 accountStore → Task 7
- ✅ 2.2 FavoritesPage 重写 → Task 11
- ✅ 2.3 LoginDialog 保留不删 → 不动（无 task，符合"保留"决策）
- ✅ 2.4 MangaDetailPage 收藏按钮接线 → Task 9
- ✅ 2.5 ReaderPage 写历史 + 续读 → Task 10
- ✅ 2.6 MangaCard 续读角标不做 → 无 task（符合 YAGNI 决策）
- ✅ 2.7 SettingsPage 账户区 → Task 12
- ✅ 2.8 preload 暴露 → Task 6
- ✅ App.tsx validateOnStartup → Task 8
- ✅ ReaderState 扩展 → Task 9

**2. Placeholder scan:** 无 TBD/TODO/"implement later"。每步含完整代码。

**3. Type consistency:**
- `PersistMode = 'cookie' | 'credential'`：accountService（Task 4）、accountStore（Task 7）、SettingsPage（Task 12）一致。
- `ReaderState` 新字段：appStore（Task 9）、MangaDetailPage（Task 9）、ReaderPage（Task 10）、FavoritesPage（Task 11）一致使用 `mangaId/mangaCoverUrl/chapterIndex/resumePageIndex`。
- `LocalHistoryRow` 字段名与 DB 列名（Task 1/2）一致：`manga_id/manga_title/chapter_index/chapter_title/chapter_url/cover_url/page_index/total_pages/read_at`。
- IPC channel 名：main（Task 2/5）、preload（Task 6）、renderer（Task 11）一致。
