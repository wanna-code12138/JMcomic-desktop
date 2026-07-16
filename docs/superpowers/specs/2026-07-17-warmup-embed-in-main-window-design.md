# 安全验证窗口内嵌主窗口

**日期**: 2026-07-17
**分支**: `fix/warmup-embed-in-main-window`
**范围**: 把每次启动弹出的"JMComic — 安全验证"独立 BrowserWindow，改成内嵌在主窗口内容区的 WebContentsView

## 背景与问题

`src/main/sessionWarmup.ts` 的 `warmupSession()` 每次启动都 `new BrowserWindow({ width:500, height:620, title:'JMComic — 安全验证' })`，弹一个独立 OS 窗口让用户过 Cloudflare / 18 岁验证。该窗口：

- 是第二个 OS 窗口，会跑到主窗口后面，用户经常看不到、以为程序卡住
- 与主窗口分离，体验割裂
- 主窗口 HomePage 此时只显示一个 Spinner + "请在弹出的窗口中完成安全验证" 提示，用户却找不到那个弹窗

## 目标

**单 OS 窗口完成验证**。验证页内嵌在主窗口里，不再弹独立窗口。验证通过后内嵌视图消失，底下早已加载好的 App 直接露出。

## 不改的部分（边界）

明确不动，行为完全保持：

- `siteAdapter.ts`（登录/收藏/历史抓取逻辑）
- `scraperWindow.ts`（隐藏抓取窗口、内容缓存、互斥锁）
- `networkProbe.ts`（网络探测、域名选择）
- `httpClient.ts` 的 cookie 机制（`invalidateCookieCache` 仍按原样调用）
- 验证通过的检测逻辑：注入 JS 轮询 `document.title` / `body.innerText`、2 分钟超时、`window.__jm_warmup_done` / `__jm_warmup_timeout` 标志
- `app:warmupDone` IPC 通知 + renderer 端 `onWarmupDone` 等待流程
- session 共享：验证视图仍用 `session.defaultSession`，cookie 自动落到 scraperWindow / httpClient
- `contentApi.ts` 的 `ensureReady()` / `content:warmupStatus` 行为
- 所有登录/收藏/历史功能（本任务不涉及）

## 设计

### 核心思路

用 `WebContentsView`（Electron 33 推荐的多视图 API）替换独立 `BrowserWindow`。主窗口先创建，验证视图作为子视图叠加在主窗口内容区上方（y = 标题栏高度 32px），验证通过后移除子视图。

### 涉及文件

| 文件 | 改动 |
|---|---|
| `src/main/sessionWarmup.ts` | 核心重写：`new BrowserWindow` → `new WebContentsView`；addChildView 到主窗口；setBounds 跟随；finish() 移除视图 |
| `src/main/index.ts` | 调整启动顺序：`createWindow()` 提到 `warmupSession()` 之前；把 mainWindow 引用传给 warmup；加 resize 监听更新 view bounds |
| `src/renderer/src/pages/HomePage.tsx` | 改 warmup 提示文案：去掉"弹出的窗口"措辞 |

### 1. `index.ts` 启动顺序调整

当前：
```ts
warmupSession().then(() => { ... send('app:warmupDone') })
createWindow()
```

改为：
```ts
createWindow()  // 先建主窗口
warmupSession(mainWindow).then(() => { ... })  // 再内嵌验证视图
```

`mainWindow` 已是模块级变量，`warmupSession` 直接取它（或新增可选参数接收）。要求：调用时 `mainWindow` 必须已创建且未销毁。

### 2. `sessionWarmup.ts` 核心重写

**构造**：
```ts
const view = new WebContentsView({
  webPreferences: {
    session: session.defaultSession,
    nodeIntegration: false,
    contextIsolation: true
  }
})
mainWindow.contentView.addChildView(view)
updateBounds()  // 见下
view.webContents.loadURL(targetUrl)
```

**bounds 计算**：视图占满标题栏以下区域。
```ts
function updateBounds(): void {
  if (mainWindow.isDestroyed() || viewDestroyed) return
  const [w, h] = mainWindow.getContentSize()
  view.setBounds({ x: 0, y: 32, width: w, height: Math.max(0, h - 32) })
}
updateBounds()
mainWindow.on('resize', updateBounds)
```
- y=32 对应 TitleBar 的 `TITLE_BAR_HEIGHT`（`src/renderer/src/components/TitleBar.tsx:13`）
- 用 `getContentSize()` 取内容区尺寸（不含标题栏/caption）
- 高度做 `Math.max(0, ...)` 防负数

**检测逻辑（完全保留）**：
- `view.webContents.on('did-finish-load', ...)` 注入轮询脚本（title/body 判断 + `__jm_warmup_done`/`__jm_warmup_timeout`）
- `setInterval` 每 1.5s `view.webContents.executeJavaScript(...)` 读 done/timeout
- 2 分钟安全超时
- `view.webContents.on('closed')` 不再适用（view 没有 closed 事件）—— 改用 `view.webContents.on('destroyed')` 兜底，或依赖 finish() 主动清理

**finish() 清理**：
```ts
const finish = (): void => {
  if (resolved) return
  resolved = true
  warmupDone = true
  invalidateCookieCache()
  mainWindow.off('resize', updateBounds)
  try {
    mainWindow.contentView.removeChildView(view)
    view.webContents.destroy()
  } catch { /* ok */ }
  // 通知其他窗口（原逻辑：除自己外的所有窗口）
  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('app:warmupDone'))
  resolve()
}
```

- 原来用 `w.id !== warmupWin.id` 排除自己；现在没有 warmupWin id，主窗口本身就是接收方，`getAllWindows().forEach` 全发即可（主窗口 renderer 正在等 `app:warmupDone`）
- `view.webContents.destroy()` 释放资源

**loadURL 失败**、**用户关窗**：原 `warmupWin.on('closed')` 触发 finish。现在 view 无法被用户单独关闭，但主窗口关闭时 `app.on('window-all-closed')` 会走 `closeDatabase()` + `app.quit()`，warmupPromise 无人 await 也无妨。保留 loadURL catch → finish() 兜底。

### 3. `HomePage.tsx` 文案

当前（`src/renderer/src/pages/HomePage.tsx:138-159`）：
```
正在建立安全连接...
请在弹出的窗口中完成安全验证
验证成功后窗口会自动关闭并开始加载内容
[未弹出窗口？点此重试]
```

改为：
```
正在建立安全连接...
请在上方完成安全验证
验证成功后将自动开始加载内容
[验证卡住？点此重试]
```

- "上方"对应视图叠在主窗口内容区
- 去掉"弹出窗口"措辞
- 按钮文案同步

注意：HomePage 的 Spinner 态在验证期间**会被视图盖住**（视图 z 序在上），用户实际看到的是 JM 验证页。Spinner 文案改动是兜底/无障碍场景（比如视图加载失败、用户用读屏）才看得到。仍改文案以保持一致。

### 数据流

```
app.ready
  → createWindow()              主窗口 + renderer App 启动
  → warmupSession(mainWindow)
      → new WebContentsView     加载 JM 首页
      → addChildView 到主窗口   叠在 y=32 区域
      → 轮询 webContents         检测 Cloudflare 通过
      → finish()
          → invalidateCookieCache()
          → removeChildView + destroy
          → send('app:warmupDone')
  → renderer 收到 → HomePage load() 继续
  → 后续 scraperWindow 用 defaultSession cookie 抓内容
```

### 错误处理

| 情况 | 行为 |
|---|---|
| mainWindow 已销毁 | `updateBounds` / finish() 做防御 `isDestroyed()` 检查 |
| loadURL 失败 | catch → finish()（与原逻辑一致） |
| 2 分钟超时 | finish() 接受现状（cookies 可能已设） |
| view.webContents.destroy 抛错 | try/catch 吞掉 |
| 主窗口在验证中被关闭 | `window-all-closed` → app.quit，warmupPromise 悬空无害 |

### 测试

项目无测试框架。验证手段：

1. `npm run build`（TypeScript 编译通过）
2. `npm run dev` 手动验证：
   - 启动时只见一个 OS 窗口
   - 主窗口内容区显示 JM 验证页（Cloudflare checkbox / 18岁确认）
   - 完成验证后视图消失，HomePage 内容加载出来
   - 窗口 resize 时验证页跟随调整大小，不出现白边/错位
   - 验证期间标题栏（含 min/max/close）仍可操作
3. Windows 平台验证（项目仅支持 Windows，safeStorage/DPAPI）

## 验收标准

- [ ] 启动只有 1 个 OS 窗口，无第二个窗口弹出
- [ ] 验证页显示在主窗口内容区（标题栏下方），不会被藏到主窗口后面
- [ ] 通过验证后验证页消失，App 内容正常加载
- [ ] 窗口 resize 验证页跟随
- [ ] scraperWindow 内容抓取仍正常（cookie 共享未破坏）
- [ ] `npm run build` 通过
