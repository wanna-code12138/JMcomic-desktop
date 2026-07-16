# 安全验证窗口内嵌主窗口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把每次启动弹出的"JMComic — 安全验证"独立 BrowserWindow 改成内嵌在主窗口内容区的 WebContentsView，单 OS 窗口完成 Cloudflare / 18 岁验证。

**Architecture:** 主窗口先创建，再用 `WebContentsView` 加载 JM 首页作为子视图叠在主窗口内容区（y=32，标题栏下方）。验证通过的检测逻辑（executeJavaScript 轮询 title/body、2 分钟超时、`__jm_warmup_done`/`__jm_warmup_timeout` 标志）完全保留，只是把容器从独立 BrowserWindow 换成主窗口内的子视图。通过后移除子视图，底下早已加载好的 App 露出。

**Tech Stack:** Electron 33（`WebContentsView` + `BrowserWindow.contentView.addChildView`）、TypeScript、React 18、Fluent UI v9、electron-vite

**Spec:** `docs/superpowers/specs/2026-07-17-warmup-embed-in-main-window-design.md`

## Global Constraints

- **Electron 版本**: `^33.2.0`（已锁定，`WebContentsView` API 可用）
- **无测试框架**: 项目无 jest/vitest。每个任务的验证手段是 `npm run build`（TypeScript 编译通过）+ `npm run dev` 手动验证
- **Windows 平台**: 仅 Windows 验证
- **启动命令**: `npm run dev`（底层 `electron-vite dev`）
- **构建命令**: `npm run build`（底层 `electron-vite build`）
- **不改动**: `siteAdapter.ts`、`scraperWindow.ts`、`networkProbe.ts`、`httpClient.ts` cookie 机制、`contentApi.ts`、登录/收藏/历史功能
- **commit 风格**: 参照现有 `feat: ...` / `fix: ...` 中文 commit message
- **不删 `LoginDialog.tsx`**: 它与本任务无关，保持不动
- **TitleBar 高度 = 32px**: 定义于 `src/renderer/src/components/TitleBar.tsx:13` 的 `TITLE_BAR_HEIGHT`。验证视图的 y 偏移必须等于此值

---

## File Structure

| 文件 | 责任 | 改动类型 |
|---|---|---|
| `src/main/sessionWarmup.ts` | 把 Cloudflare 验证从独立窗口改为内嵌 WebContentsView | 核心重写 |
| `src/main/index.ts` | 调整启动顺序，主窗口先建；加 resize 监听更新 view bounds | 修改 |
| `src/renderer/src/pages/HomePage.tsx` | warmup 提示文案去掉"弹出窗口"措辞 | 修改 |

边界说明：
- `sessionWarmup.ts` 仍是 warmup 的唯一入口，对外签名从 `warmupSession()` 变为 `warmupSession(hostWindow: BrowserWindow)`，其余模块（`contentApi.ts` 的 `ensureReady()`、`index.ts` 的调用点）只需对应调整调用形式
- `index.ts` 持有模块级 `mainWindow`，负责把它传给 `warmupSession` 并在 resize 时驱动 view 更新

---

### Task 1: 主窗口提前创建 + 传递给 warmupSession

**Files:**
- Modify: `src/main/index.ts:77-95`（`app.whenReady().then(...)` 块）
- Modify: `src/main/sessionWarmup.ts:15`（`warmupSession` 签名）

**Interfaces:**
- Consumes: 无
- Produces: `warmupSession(hostWindow: BrowserWindow): Promise<void>` — 后续 Task 2 的 view 创建依赖此参数；`index.ts` 调用方在调用前必须保证 `mainWindow` 已创建且未销毁

**目的:** 现状是 `warmupSession().then(...)` 在 `createWindow()` 之前调用，warmup 内部自己 `new BrowserWindow`。本任务先把启动顺序倒过来，并把 `mainWindow` 引用传进 `warmupSession`，为 Task 2 的内嵌视图铺路。本任务结束时 `warmupSession` 内部仍用旧 BrowserWindow 逻辑（下一任务才换），但签名和调用顺序已就位 —— 中间态可编译可运行。

- [ ] **Step 1: 修改 `sessionWarmup.ts` 的 `warmupSession` 签名**

打开 `src/main/sessionWarmup.ts`，把第 15 行的函数签名从：

```ts
export async function warmupSession(): Promise<void> {
```

改为接收主窗口参数（暂不使用，仅改签名 + 加一个 defensive check，下一任务才真正使用）：

```ts
export async function warmupSession(hostWindow: BrowserWindow): Promise<void> {
```

函数体保持不变。`BrowserWindow` 已在第 1 行 import，无需新增 import。

- [ ] **Step 2: 修改 `index.ts` 的启动顺序**

打开 `src/main/index.ts`，找到 `app.whenReady().then(() => { ... })` 块（第 77-95 行）。当前是：

```ts
app.whenReady().then(() => {
  registerIpcHandlers()
  registerImageProtocol()
  startPeriodicProbe()

  // Warm up session in background — bypass Cloudflare
  warmupSession().then(() => {
    // Send status update to renderer
    BrowserWindow.getAllWindows().forEach((w) => {
      w.webContents.send('app:warmupDone')
    })
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
```

改为（`createWindow()` 提前，`warmupSession(mainWindow)` 传入引用）：

```ts
app.whenReady().then(() => {
  registerIpcHandlers()
  registerImageProtocol()
  startPeriodicProbe()

  createWindow()

  // Warm up session in background — bypass Cloudflare
  // 主窗口必须先创建，warmup 会把验证视图内嵌到主窗口内容区
  if (mainWindow) {
    warmupSession(mainWindow).then(() => {
      // Send status update to renderer
      BrowserWindow.getAllWindows().forEach((w) => {
        w.webContents.send('app:warmupDone')
      })
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
```

注意：`mainWindow` 是第 13 行的模块级变量，`createWindow()` 执行后它被赋值。`if (mainWindow)` 做空值防御。

- [ ] **Step 3: 验证编译**

Run: `npm run build`
Expected: 编译通过，无 TS 错误。`warmupSession` 现在要求传一个 `BrowserWindow` 参数，已传 `mainWindow`。

- [ ] **Step 4: 手动冒烟测试**

Run: `npm run dev`
Expected: 启动后仍弹独立验证窗口（本任务未换容器，只是改了签名和顺序），验证后 App 正常加载。确认启动顺序调整未破坏现有流程。

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/main/sessionWarmup.ts
git commit -m "refactor: warmupSession 接收主窗口引用 + 主窗口提前创建"
```

---

### Task 2: 用 WebContentsView 替换独立 BrowserWindow

**Files:**
- Modify: `src/main/sessionWarmup.ts`（核心重写，约第 15-148 行的函数体）

**Interfaces:**
- Consumes: Task 1 的 `warmupSession(hostWindow: BrowserWindow)` 签名
- Produces: 同签名，行为变更 —— 不再弹独立窗口，而是内嵌 `WebContentsView` 到 `hostWindow.contentView`

**目的:** 把 `new BrowserWindow(...)` 换成 `new WebContentsView(...)` + `hostWindow.contentView.addChildView(view)`，bounds 设为 `{x:0, y:32, width, height-32}`（y=32 对应 TitleBar 高度）。检测/超时/cookie/invalidate/通知逻辑保留。这是本计划的核心任务。

- [ ] **Step 1: 重写 `sessionWarmup.ts` 的 import**

打开 `src/main/sessionWarmup.ts`，第 1 行当前是：

```ts
import { BrowserWindow, session, ipcMain } from 'electron'
```

改为：

```ts
import { BrowserWindow, WebContentsView, session, ipcMain } from 'electron'
```

`WebContentsView` 是 Electron 33 的内置 API，无需安装新依赖。

- [ ] **Step 2: 重写 `warmupSession` 函数体**

把 `src/main/sessionWarmup.ts` 中 `warmupSession` 的整个函数体（从 `if (warmupDone) return` 到函数结束 `return warmupPromise`）替换为下面这段。保留 `warmupDone`/`warmupPromise` 模块级变量和文件末尾的 `isSessionWarmedUp`、`session:warmupStatus` IPC handler 不动。

```ts
export async function warmupSession(hostWindow: BrowserWindow): Promise<void> {
  if (warmupDone) return
  if (warmupPromise) return warmupPromise

  warmupPromise = new Promise<void>((resolve) => {
    const domain = getActiveDomain()
    const targetUrl = `https://${domain}/`

    // 内嵌 WebContentsView：加载 JM 首页让用户过 Cloudflare / 18 岁验证。
    // 用 session.defaultSession，cookie 自动共享给 scraperWindow / httpClient。
    const view = new WebContentsView({
      webPreferences: {
        session: session.defaultSession,
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    let resolved = false
    let viewDestroyed = false

    // ── bounds：视图占满标题栏（32px）以下区域 ──────────────
    const TITLE_BAR_HEIGHT = 32
    const updateBounds = (): void => {
      if (hostWindow.isDestroyed() || viewDestroyed) return
      const [w, h] = hostWindow.getContentSize()
      view.setBounds({
        x: 0,
        y: TITLE_BAR_HEIGHT,
        width: w,
        height: Math.max(0, h - TITLE_BAR_HEIGHT)
      })
    }

    hostWindow.contentView.addChildView(view)
    updateBounds()
    hostWindow.on('resize', updateBounds)

    const finish = (): void => {
      if (resolved) return
      resolved = true
      warmupDone = true
      invalidateCookieCache() // pick up fresh Cloudflare cookies
      try {
        hostWindow.off('resize', updateBounds)
      } catch { /* ok */ }
      try {
        if (!viewDestroyed) {
          hostWindow.contentView.removeChildView(view)
          view.webContents.destroy()
          viewDestroyed = true
        }
      } catch { /* ok */ }

      // Notify renderer of all windows（主窗口本身在等 app:warmupDone）
      BrowserWindow.getAllWindows().forEach((w) => {
        w.webContents.send('app:warmupDone')
      })

      resolve()
    }

    // Inject a hint overlay into the page
    view.webContents.on('did-finish-load', () => {
      view.webContents.executeJavaScript(`
        (function() {
          // Check every 1s if we passed Cloudflare
          var checkCount = 0;
          var iv = setInterval(function() {
            checkCount++;
            var title = document.title;
            var body = document.body ? document.body.innerText : '';
            // Signs that we passed Cloudflare:
            // - Title doesn't contain "Just a moment" / "Checking" / "Attention Required"
            // - Body has actual content (not just "Enable JavaScript")
            if (title &&
                title.indexOf('Just a moment') === -1 &&
                title.indexOf('Checking') === -1 &&
                title.indexOf('Attention Required') === -1 &&
                title.indexOf('DDoS') === -1 &&
                body.indexOf('Enable JavaScript and cookies to continue') === -1 &&
                (body.length > 500 || title.length > 5)) {
              clearInterval(iv);
              // Tell Electron we're done
              window.__jm_warmup_done = true;
            }
            if (checkCount > 120) { // 2 min timeout
              clearInterval(iv);
              window.__jm_warmup_timeout = true;
            }
          }, 1000);
        })();
      `).catch(() => {})
    })

    // Check page state periodically
    const checkInterval = setInterval(async () => {
      if (viewDestroyed) {
        clearInterval(checkInterval)
        finish()
        return
      }

      try {
        const result = await view.webContents.executeJavaScript(
          '(function(){ return { done: window.__jm_warmup_done || false, timeout: window.__jm_warmup_timeout || false }; })()'
        )

        if (result.done) {
          clearInterval(checkInterval)
          // Short delay for cookies to settle
          setTimeout(finish, 1000)
        }
        if (result.timeout) {
          clearInterval(checkInterval)
          // Even if timeout, accept — cookies may have been set anyway
          finish()
        }
      } catch {
        // View may be navigating, try again
      }
    }, 1500)

    // Safety timeout: 2 minutes
    setTimeout(() => {
      clearInterval(checkInterval)
      finish()
    }, 120000)

    // view.webContents 被销毁时兜底 finish
    view.webContents.on('destroyed', () => {
      viewDestroyed = true
      clearInterval(checkInterval)
      finish()
    })

    view.webContents.loadURL(targetUrl).catch(() => {
      clearInterval(checkInterval)
      finish()
    })
  })

  return warmupPromise
}
```

**关键变更点（相对原代码）：**
1. `new BrowserWindow({...})` → `new WebContentsView({ webPreferences: {...} })`
2. `hostWindow.contentView.addChildView(view)` + `updateBounds()` 替代独立窗口显示
3. `hostWindow.on('resize', updateBounds)` 跟随窗口尺寸
4. `finish()` 里 `warmupWin.close()` → `removeChildView(view)` + `view.webContents.destroy()`
5. 原来的 `warmupWin.on('closed', ...)` 改为 `view.webContents.on('destroyed', ...)` 兜底
6. `BrowserWindow.getAllWindows().forEach` 通知全部窗口（不再用 `w.id !== warmupWin.id` 排除自己，因为主窗口本身就是接收方）
7. 检测脚本、超时阈值、`invalidateCookieCache()`、`warmupDone` 标志 —— 一字未改

- [ ] **Step 3: 验证编译**

Run: `npm run build`
Expected: 编译通过。若报 `WebContentsView` 未导出，确认 Electron 版本 `^33.2.0`（package.json 已锁定）。

- [ ] **Step 4: 手动验证 — 单窗口内嵌**

Run: `npm run dev`

逐项检查：
1. 启动只见 **1 个 OS 窗口**，不再弹出第二个"JMComic — 安全验证"窗口
2. 主窗口内容区显示 JM 验证页（Cloudflare checkbox 或 18 岁确认页）
3. 验证页位于标题栏下方，标题栏（含 min/max/close 原生按钮）仍可操作
4. 拖拽窗口边缘 resize —— 验证页跟随调整大小，无白边、无错位、无内容被裁切
5. 完成验证 —— 验证页消失，HomePage 内容加载出来
6. 验证期间看任务栏 —— 只有一个窗口项，不再有两个

- [ ] **Step 5: 手动验证 — cookie 共享未破坏**

在验证通过后的 App 里：
1. 进入首页 —— 推荐漫画正常加载（scraperWindow 用 defaultSession cookie 抓取）
2. 进入搜索 —— 搜索结果正常返回
3. 进入漫画详情 —— 详情页正常加载

若以上任一返回空/报错，说明 cookie 共享被破坏，回退检查 `session: session.defaultSession` 配置是否正确。

- [ ] **Step 6: 手动验证 — 异常路径**

1. 启动后立即关闭主窗口 —— 程序应正常退出，不卡死、不报未捕获异常
2. 启动后等 2 分钟不点验证 —— 安全超时触发 finish()，验证页消失，App 尝试加载（可能因没过 Cloudflare 而显示错误，这是预期行为）
3. 启动后断网 —— loadURL 失败 → catch → finish()，验证页消失，App 显示网络错误（预期）

- [ ] **Step 7: Commit**

```bash
git add src/main/sessionWarmup.ts
git commit -m "fix: 安全验证窗口内嵌主窗口 — WebContentsView 替代独立 BrowserWindow"
```

---

### Task 3: 更新 HomePage warmup 提示文案

**Files:**
- Modify: `src/renderer/src/pages/HomePage.tsx:138-161`（`warmingUp` 分支 JSX）

**Interfaces:**
- Consumes: 无
- Produces: 无（纯文案改动，无接口影响）

**目的:** 现在验证是内嵌在主窗口内容区，不再"弹出窗口"。HomePage 的 warmingUp 态文案（Spinner + 提示）需同步去掉"弹出窗口"措辞。注意：验证期间 HomePage 的 Spinner 实际会被验证视图盖住（视图 z 序在上），用户看到的是 JM 验证页；文案改动是为一致性 + 无障碍场景兜底。

- [ ] **Step 1: 修改 `HomePage.tsx` 的 warmingUp JSX**

打开 `src/renderer/src/pages/HomePage.tsx`，找到第 138-161 行的 `if (warmingUp)` 块。当前是：

```tsx
  if (warmingUp) {
    return (
      <div className={styles.root}>
        <div className={styles.statusMsg}>
          <Spinner size="large" />
          <Text size={500} weight="semibold">正在建立安全连接...</Text>
          <Text size={300} style={{ opacity: 0.7, maxWidth: '420px', textAlign: 'center' }}>
            请在弹出的窗口中完成安全验证
          </Text>
          <Text size={200} style={{ opacity: 0.5 }}>
            验证成功后窗口会自动关闭并开始加载内容
          </Text>
          <Button
            appearance="secondary"
            size="small"
            style={{ marginTop: '12px' }}
            onClick={() => window.location.reload()}
          >
            未弹出窗口？点此重试
          </Button>
        </div>
      </div>
    )
  }
```

改为：

```tsx
  if (warmingUp) {
    return (
      <div className={styles.root}>
        <div className={styles.statusMsg}>
          <Spinner size="large" />
          <Text size={500} weight="semibold">正在建立安全连接...</Text>
          <Text size={300} style={{ opacity: 0.7, maxWidth: '420px', textAlign: 'center' }}>
            请在上方完成安全验证
          </Text>
          <Text size={200} style={{ opacity: 0.5 }}>
            验证成功后将自动开始加载内容
          </Text>
          <Button
            appearance="secondary"
            size="small"
            style={{ marginTop: '12px' }}
            onClick={() => window.location.reload()}
          >
            验证卡住？点此重试
          </Button>
        </div>
      </div>
    )
  }
```

3 处文案变更：
- "请在弹出的窗口中完成安全验证" → "请在上方完成安全验证"
- "验证成功后窗口会自动关闭并开始加载内容" → "验证成功后将自动开始加载内容"（去掉"窗口会自动关闭"）
- "未弹出窗口？点此重试" → "验证卡住？点此重试"

- [ ] **Step 2: 验证编译**

Run: `npm run build`
Expected: 编译通过。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/pages/HomePage.tsx
git commit -m "fix: HomePage warmup 提示文案去掉“弹出窗口”措辞"
```

---

## 完成验证

全部任务完成后，执行最终验收：

- [ ] **最终 build**

Run: `npm run build`
Expected: 编译通过，无 warning 新增。

- [ ] **最终手动验收（对照 spec 验收标准）**

Run: `npm run dev`

逐项核对：
1. [ ] 启动只有 1 个 OS 窗口，无第二个窗口弹出
2. [ ] 验证页显示在主窗口内容区（标题栏下方），不会被藏到主窗口后面
3. [ ] 通过验证后验证页消失，App 内容正常加载
4. [ ] 窗口 resize 验证页跟随
5. [ ] scraperWindow 内容抓取仍正常（首页/搜索/详情都能加载 —— cookie 共享未破坏）
6. [ ] `npm run build` 通过

- [ ] **合并回 main**

```bash
git checkout main
git merge fix/warmup-embed-in-main-window --no-ff
git branch -d fix/warmup-embed-in-main-window
```
