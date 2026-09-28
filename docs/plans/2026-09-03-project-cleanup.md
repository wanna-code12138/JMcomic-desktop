# 项目废弃文件清理实施计划

> **For implementation:** Execute tasks in order, one task at a time, following the test-driven-development skill; keep the checkbox (`- [ ]`) list updated, and verify each task before moving on.

**Goal:** 删除已经回滚且不再提供在线账号功能的代码与文档，保留当前匿名内容读取链路，并留下可供未来性能优化参考的 API 化笔记。

**Architecture:** 当前生产路径仍使用 `src/main/contentApi.ts` 中的匿名直连/浏览器双通道，`JmWebAdapter` 的搜索、分类和章节页面读取不能删除。移除旧登录弹窗、在线收藏/登录适配器方法及其 preload/IPC 暴露；数据库 `auth` 表和个人数据清除逻辑继续保留，用于清理历史版本可能残留的凭据。旧账号设计资料删除后，以一份不含凭据和动态令牌的性能笔记记录 API 化方向。

**Tech Stack:** Electron 43、electron-vite、React 18、TypeScript、Node.js 测试脚本、sql.js。

## Global Constraints

- 不新增依赖，不执行真实账号登录、写操作或购买请求。
- 保留用户已有的文档删除改动，不恢复已删除的旧计划/性能文档。
- 保留 `src/main/siteAdapter.ts` 的匿名搜索、分类、章节页面能力。
- 保留数据库 `auth` 表与个人数据清除逻辑，但不再暴露新的在线账号 API。
- 不删除 `.git`、`node_modules/`、`out/` 或用户数据；构建产物通过构建命令验证其可再生性。

---

### Task 1: 建立清理前基线

**Files:**
- Read: `package.json`
- Read: `src/main/__tests__/`

**Interfaces:**
- Consumes: 当前工作区和现有测试入口。
- Produces: 清理前的分支、状态和构建/测试基线。

- [x] **Step 1: Confirm branch and preserve unrelated worktree changes**

```powershell
git branch --show-current
git status --short --branch
```

Expected: 当前分支为 `codex/cleanup-abandoned-files`；用户已有的文档删除和未跟踪文件保持可见。

- [x] **Step 2: Run the current production build**

```powershell
npm run build
```

Expected: electron-vite successfully builds main, preload, and renderer output.

### Task 2: Remove the abandoned online-account implementation surface

**Files:**
- Delete: `src/renderer/src/components/LoginDialog.tsx`
- Modify: `src/renderer/src/components/index.ts`
- Modify: `src/main/__tests__/winuiVisualContract.test.ts`
- Modify: `src/main/siteAdapter.ts`
- Modify: `src/main/types.ts`
- Modify: `src/main/httpClient.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Delete: `src/renderer/src/stores/index.ts`

**Interfaces:**
- Consumes: Existing `contentApi.ts` → `JmWebAdapter` anonymous content path.
- Produces: No renderer-facing login/auth IPC; `JmWebAdapter` retains public content methods; legacy credential clearing remains available.

- [x] **Step 1: Remove the login-only renderer file and stale barrel export**

Delete `LoginDialog.tsx` and remove its export from the still-used component barrel. Remove the `loginDialog` source read and its dialog-specific assertions from `winuiVisualContract.test.ts`; retain the chapter dialog assertions.

- [x] **Step 2: Remove account-only adapter methods and cookie state**

Delete `JmWebAdapter.login`, `JmWebAdapter.getFavorites`, `_username`, `cookieJar`, `serializeCookies`, and `parseSetCookie`. Keep `probe`, `search`, `listAlbums`, `getMangaDetail`, and `getChapterPages`; make `fetchHtml` send only the existing referer header.

- [x] **Step 3: Remove account-only IPC and preload methods**

Delete `SiteAdapter.login` and `SiteAdapter.getFavorites`, and remove `authSave`, `authGet`, `auth:save`, and `auth:get` handlers. Keep the `auth` table and `clearPersonalData` deletion path for old local databases.

- [x] **Step 4: Remove obsolete HTTP account compatibility code**

Keep the default-session cookie collection and `invalidateCookieCache()` used by Cloudflare warmup, but remove caller-cookie merging, login-specific redirect support, and the unused generic `http:get`/`http:getHtml` IPC handlers. Remove the matching unused `httpGet` preload method.

- [x] **Step 5: Update current project documentation**

Remove the login dialog from the README component list and change architecture text so it describes anonymous public content access; note that `auth` is retained only for legacy personal-data cleanup.

### Task 3: Replace discarded account documents with a compact performance note

**Files:**
- Delete: `docs/design/2026-08-24-online-account-design.md`
- Delete: `docs/design/2026-08-27-online-account-implementation-design.md`
- Delete: `docs/research/2026-08-24-jm-account-protocol-reference.md`
- Create: `docs/performance/2026-09-03-public-api-content-path.md`

**Interfaces:**
- Consumes: The existing local research notes and rollback history, without copying credentials, AVS, cookies, or dynamic tokens.
- Produces: A short future-reference document describing candidate JSON endpoints, request/decryption/profile concerns, and the browser-to-API performance migration idea.

- [x] **Step 1: Write the replacement performance note**

Record that the current browser/DOM path costs roughly seconds per page, while a future main-process API path could fetch structured manifests and metadata directly, keep browser extraction as fallback, and validate host/profile/response shape before enabling it. Include only endpoint names, stable field-shape observations, and explicit unknowns.

- [x] **Step 2: Delete the detailed online-account documents**

Remove the superseded account design and research documents after the replacement note is created and checked for secret-like material.

### Task 4: Verify the resulting project

**Files:**
- Read: `src/main/__tests__/*.test.ts`
- Read: `src/main/__tests__/winuiVisualContract.test.ts`

**Interfaces:**
- Consumes: Updated production source and tests.
- Produces: Passing unit tests, production build, clean diff checks, and no references to deleted account files.

- [x] **Step 1: Run every main-process test through the repository’s CI loop**

```powershell
$failed = $false
Get-ChildItem src/main/__tests__/*.test.ts | ForEach-Object {
  npx tsx $_.FullName
  if ($LASTEXITCODE -ne 0) { $failed = $true }
}
if ($failed) { exit 1 }
```

Expected: every test exits zero.

- [x] **Step 2: Build and check references**

```powershell
npm run build
rg -n "LoginDialog|authSave|authGet|auth:save|auth:get|getFavorites|httpGet|http:getHtml|在线登录|在线账号" src README.md docs/ARCHITECTURE.md
git diff --check
```

Expected: build succeeds; the reference search returns no deleted implementation/API names; `git diff --check` returns zero.

- [x] **Step 3: Review the final change scope**

```powershell
git status --short
git diff --stat
git diff --name-status
```

Expected: only the approved cleanup files plus the user-approved pre-existing document deletions are changed.

### Task 5: Commit the cleanup change

**Files:**
- Commit: only files belonging to this cleanup task.

**Interfaces:**
- Consumes: Verified cleanup diff.
- Produces: A reviewable commit on `codex/cleanup-abandoned-files`; unrelated user work remains separate.

- [x] **Step 1: Stage only cleanup files**

```powershell
  git add src/main/__tests__/contentValidation.test.ts src/main/__tests__/winuiVisualContract.test.ts src/main/siteAdapter.ts src/main/types.ts src/main/httpClient.ts src/main/ipc.ts src/preload/index.ts src/renderer/src/components/LoginDialog.tsx src/renderer/src/components/index.ts src/renderer/src/stores/index.ts README.md docs/ARCHITECTURE.md docs/performance/2026-09-03-public-api-content-path.md docs/plans/2026-09-03-project-cleanup.md
```

- [x] **Step 2: Commit the verified cleanup**

```powershell
git commit -m "chore: 清理废弃在线账号代码"
```
