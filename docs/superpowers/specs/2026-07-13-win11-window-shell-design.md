# Windows 11 现代化窗口外壳 + Snap 适配

**日期**: 2026-07-13
**分支**: `feature/win11-window-shell`
**范围**: 窗口外壳 + 侧边导航 + 状态栏（内容页不动）

## 目标

1. 右上角最大化/还原按钮做出视觉区别
2. 适配 Windows 11 的窗口贴合手势（拖到顶部最大化、Snap Layouts 悬浮面板、Win+Arrow 等）
3. 整体设计语言符合 Windows 11 标准

## 关键决策

「全屏化」= 最大化（保留标题栏，非沉浸式 kiosk）。
采用 **`titleBarStyle: 'hidden'` + `titleBarOverlay`**（原生 caption 按钮），而非 `frame: false` 自定义按钮。
原因：Snap Layouts 悬浮面板依赖系统原生 caption 按钮锚定，自定义按钮无法触发。

## Section 1 — 主进程窗口改造 (`src/main/index.ts`)

- 移除 `frame: false`，保留 `titleBarStyle: 'hidden'`，新增 `titleBarOverlay`：
  - `{ color, symbolColor, height: 32 }`，初始浅色配色。
- 保留 `transparent: true` + `backgroundColor: '#00000000'` + `setBackgroundMaterial('mica')`（不回归当前可用的 Mica）。
- 新增 IPC `window:setCaptionTheme(dark: boolean)`：主进程持浅/深两套 `{ color, symbolColor }`，调用 `mainWindow.setTitleBarOverlay(...)`。
  - 浅色: `color = #fafafa` (grey98 = colorNeutralBackground2), `symbolColor = #242424` (grey14 = colorNeutralForeground1)
  - 深色: `color = #1f1f1f` (grey12), `symbolColor = #ffffff`
- 保留 `maximize`/`unmaximize` → `window:maximizeChange` 事件。
- 保留现有 `window:minimize`/`window:maximize`/`window:close`/`window:isMaximized` IPC（reader 工具栏可能仍用）。

> 最大化/还原图标由 Windows 原生 caption 按钮自动切换 —— 满足第 1 点。

## Section 2 — TitleBar 组件 (`src/renderer/src/components/TitleBar.tsx`)

- 高度 36px → 32px（对齐 caption overlay）。
- 移除自定义 最小化/最大化/关闭 三个按钮（由原生 caption 接管）。
- 仅保留深色模式切换按钮，置于原生 caption 按钮左侧。
- 右侧 `.actions` 容器加 `paddingRight: 140px`，避免被原生 caption overlay（~138px）遮挡。
- 深色模式切换时同步调用 `window.electronAPI.setCaptionTheme(dark)`。
- 订阅 `onMaximizeChange`：最大化时给根容器加 `maximized` class（用于移除外边框）。

## Section 3 — 应用外壳 + 导航 + 状态栏 (`src/renderer/src/App.tsx`)

- 窗口外边框（Win11 卡片感）：`.root` 加 `border: 1px solid colorNeutralStroke2` + `borderRadius: 8px` + `overflow: hidden`；最大化时通过 `maximized` class 移除 border + radius（DWM 已把最大化窗口变方角）。
- 导航栏 Win11 风格重做（全部用 Fluent `tokens`，深色自动适配）：
  - 选中：背景 `colorNeutralBackground2Selected`、圆角 `borderRadiusMedium`、文字 `colorBrandForeground1` + `fontWeight 600`、图标 Filled。
  - 悬停：`colorNeutralBackground2Hover`；按下：`colorNeutralBackground2Pressed`。
  - 间距：垂直 4px gap、每项 `8px 12px` padding、顶部留 8px。
  - **不加** "JMComic" 小标题。
- 状态栏细化：
  - 背景 `colorNeutralBackground2`；文本分隔符 `"|"` 换成 1px 细竖线（`colorNeutralStroke2`）。
  - 左：网络状态图标 + 文字；右：版本号右对齐（`marginLeft: auto`）。

## Section 4 — 边界与验证

- 构建验证项：确认 Win11 上 Mica 在保留 `transparent: true` 下仍显示；Snap Layouts hover 面板出现。
- 不动：内容页（首页/详情/搜索/收藏/下载/设置/阅读器）样式；reader 工具栏。
- 不动冗余的 `NavigationView.tsx`（不在范围内）。
