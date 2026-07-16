# Aurora Clay 视觉改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 JMComic Desktop 客户端视觉从 WinUI 3 中性灰扁平改造为 Aurora Clay（极光毛玻璃 + 新拟物触感）双主题，支持浅色/深色随系统自动切换。

**Architecture:** 不引入新 UI 库。在现有 Fluent UI v9 + `makeStyles` + CSS 变量基础上：自定义 Fluent BrandVariants 驱动组件品牌色 → 全局 CSS 变量层（`--ac-*`）承载极光/玻璃/新拟物 token → 共享样式对象（`clayStyles.ts`）复用毛玻璃/凸起 mixin → 各页面/组件逐个替换样式。阅读器阅读区保持深色沉浸不受主题影响。

**Tech Stack:** Electron 33, React 18, TypeScript 5.6, @fluentui/react-components v9, zustand 5, Tailwind CSS 3（仅 reset），CSS 自定义属性（`color-mix` / `backdrop-filter`，Chromium 111+ 内核足够）

## Global Constraints

- **不引入新依赖** —— 仅用现有 `@fluentui/react-components` / `zustand` / CSS 变量
- **不改主进程** `src/main/**` 与 preload `src/preload/**` —— 纯渲染层改造
- **不改组件树与数据流** —— 仅改样式（makeStyles 对象 / className / CSS），不改 props 契约与业务逻辑
- **不改 `tailwind.config.js`** —— 视觉 token 全走 CSS 变量 + makeStyles
- **保留原生 Mica 标题栏** —— 标题栏透明区继续透出 DWM 云母，不碰 `setBackgroundMaterial`
- **圆角规范**（所有组件遵循）：窗口28 / 面板24 / 卡片16 / 按钮14 / 行项12 / 封面14 / 序号10 / 胶囊99
- **无测试框架** —— 项目无 test 脚本/目录；每个任务以 `npm run build`（tsc + vite）通过 + 运行时视觉验证为验收
- **不破坏功能** —— 导航/搜索/分类/详情/阅读/收藏/下载/设置全部需正常工作

## File Structure

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/renderer/src/assets/global.css` | Aurora Clay 设计 token（CSS 变量）、极光背景、滚动条适配、深浅色切换 | 修改 |
| `src/renderer/src/theme/auroraTheme.ts` | 自定义 Fluent BrandVariants → `auroraLightTheme` / `auroraDarkTheme` | 新建 |
| `src/renderer/src/theme/clayStyles.ts` | 共享 makeStyles 样式对象（glassPanel / clayRaised / glassButton / primaryButton / clayChip / auroraBody） | 新建 |
| `src/renderer/src/stores/appStore.ts` | `themeMode` 三态 + `darkMode` 派生 + 系统监听 | 修改 |
| `src/renderer/src/main.tsx` | 挂 auroraTheme + 根 div 加 `ac-light`/`ac-dark` 类 + 初始化系统监听 | 修改 |
| `src/renderer/src/App.tsx` | 极光背景层 + nav/statusBar Aurora Clay 样式 + 大圆角 + 选中态新拟物 | 修改 |
| `src/renderer/src/components/TitleBar.tsx` | 毛玻璃 + 主题切换按钮玻璃化 | 修改 |
| `src/renderer/src/components/MangaCard.tsx` | 毛玻璃卡片 + 大圆角 + 收藏按钮玻璃化 | 修改 |
| `src/renderer/src/components/LoginDialog.tsx` | 毛玻璃模态 + 输入框内凹 + 按钮渐变 | 修改 |
| `src/renderer/src/pages/HomePage.tsx` | Tab 大圆角新拟物选中态 + shimmerCard 圆角 + 状态消息玻璃化 | 修改 |
| `src/renderer/src/pages/MangaDetailPage.tsx` | Hero 毛玻璃 + 封面大圆角 + 标签彩色 + 按钮渐变 + 章节项大圆角 | 修改 |
| `src/renderer/src/pages/ReaderPage.tsx` | 工具栏/导航/指示器毛玻璃悬浮；阅读区保持深色 | 修改 |
| `src/renderer/src/pages/SearchPage.tsx` | 搜索历史 chip 彩色玻璃 + 输入框内凹 + shimmerCard 圆角 | 修改 |
| `src/renderer/src/pages/CategoriesPage.tsx` | 筛选/标签 chip 彩色玻璃 + shimmerCard 圆角 | 修改 |
| `src/renderer/src/pages/FavoritesPage.tsx` | 历史项大圆角玻璃 + 封面大圆角 | 修改 |
| `src/renderer/src/pages/DownloadsPage.tsx` | 空状态玻璃化 | 修改 |
| `src/renderer/src/pages/SettingsPage.tsx` | 设置卡片毛玻璃 + 主题改为三态选择 | 修改 |

---

## Task 1: 设计 Token 与全局 CSS（`global.css`）

**Files:**
- Modify: `src/renderer/src/assets/global.css`（全文重写 token 层，保留 Tailwind 指令与 reset）

**Interfaces:**
- Produces: 全局 CSS 变量 `--ac-radius-*` / `--ac-blur-*` / `--ac-aurora-*` / `--ac-glass-*` / `--ac-clay-*` / `--ac-text-*` / `--ac-brand` / `--ac-brand-2` / `--ac-pink` / `--ac-blue` / `--ac-green` / `--ac-amber` / `--ac-danger`，在 `.ac-light` / `.ac-dark` 类作用域下切换值。后续所有任务的 makeStyles 引用这些变量。

- [ ] **Step 1: 重写 `global.css`**

替换 `src/renderer/src/assets/global.css` 全部内容为：

```css
/* Tailwind CSS */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Global reset */
*,
*::before,
*::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #root {
  height: 100%;
  overflow: hidden;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Mica background — transparent areas show the Windows Mica effect */
html {
  background: transparent;
}

body {
  background: transparent;
}

/* ===== Aurora Clay Design Tokens ===== */
:root {
  /* 圆角档位 */
  --ac-radius-window: 28px;
  --ac-radius-panel: 24px;
  --ac-radius-card: 16px;
  --ac-radius-button: 14px;
  --ac-radius-row: 12px;
  --ac-radius-cover: 14px;
  --ac-radius-badge: 10px;
  --ac-radius-pill: 99px;

  /* 毛玻璃强度 */
  --ac-blur-panel: 14px;
  --ac-blur-card: 10px;
  --ac-blur-dialog: 20px;
  --ac-blur-toolbar: 14px;
}

/* 浅色 Aurora Clay Light */
.ac-light {
  --ac-aurora-1: rgba(167, 139, 250, 0.28);
  --ac-aurora-2: rgba(244, 114, 182, 0.22);
  --ac-aurora-3: rgba(96, 165, 250, 0.25);
  --ac-base-bg: #f4f6ff;
  --ac-glass-bg: rgba(255, 255, 255, 0.5);
  --ac-glass-bg-hover: rgba(255, 255, 255, 0.65);
  --ac-glass-border: rgba(255, 255, 255, 0.6);
  --ac-glass-inset-hi: rgba(255, 255, 255, 0.9);
  --ac-glass-shadow: 0 3px 9px rgba(150, 140, 200, 0.16);
  --ac-clay-shadow-dark: 3px 3px 7px rgba(150, 140, 200, 0.28);
  --ac-clay-shadow-light: -3px -3px 7px rgba(255, 255, 255, 0.95);
  --ac-clay-inset-border: inset 0 0 0 1px rgba(255, 255, 255, 0.5);
  --ac-text-1: #2a2a45;
  --ac-text-2: #5a5a7a;
  --ac-text-3: #7a7a9a;
  --ac-brand: #7c5cf0;
  --ac-brand-2: #a78bfa;
  --ac-brand-glow: rgba(124, 92, 240, 0.35);
  --ac-brand-glow-hover: rgba(124, 92, 240, 0.5);
  --ac-pink: #f472b6;
  --ac-blue: #60a5fa;
  --ac-green: #34d399;
  --ac-amber: #fbbf24;
  --ac-danger: #ff6b9d;
  --ac-input-inset: inset 1px 1px 3px rgba(150, 140, 200, 0.12);
  --ac-scrollbar-thumb: rgba(120, 110, 180, 0.35);
  --ac-scrollbar-thumb-hover: rgba(120, 110, 180, 0.55);
}

/* 深色 Aurora Clay Dark */
.ac-dark {
  --ac-aurora-1: rgba(167, 139, 250, 0.5);
  --ac-aurora-2: rgba(244, 114, 182, 0.4);
  --ac-aurora-3: rgba(96, 165, 250, 0.45);
  --ac-base-bg: #0f0f1e;
  --ac-glass-bg: rgba(255, 255, 255, 0.06);
  --ac-glass-bg-hover: rgba(255, 255, 255, 0.1);
  --ac-glass-border: rgba(255, 255, 255, 0.1);
  --ac-glass-inset-hi: rgba(255, 255, 255, 0.06);
  --ac-glass-shadow: 0 5px 14px rgba(0, 0, 0, 0.4);
  --ac-clay-shadow-dark: 3px 3px 8px rgba(0, 0, 0, 0.45);
  --ac-clay-shadow-light: -3px -3px 8px rgba(255, 255, 255, 0.06);
  --ac-clay-inset-border: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  --ac-text-1: #e8e8f8;
  --ac-text-2: #b4b4d0;
  --ac-text-3: #8a8aa8;
  --ac-brand: #a78bfa;
  --ac-brand-2: #c4b5fd;
  --ac-brand-glow: rgba(167, 139, 250, 0.4);
  --ac-brand-glow-hover: rgba(167, 139, 250, 0.55);
  --ac-pink: #f472b6;
  --ac-blue: #60a5fa;
  --ac-green: #34d399;
  --ac-amber: #fbbf24;
  --ac-danger: #ff6b9d;
  --ac-input-inset: inset 1px 1px 3px rgba(0, 0, 0, 0.3);
  --ac-scrollbar-thumb: rgba(255, 255, 255, 0.18);
  --ac-scrollbar-thumb-hover: rgba(255, 255, 255, 0.3);
}

/* Scrollbar styling — Aurora Clay */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--ac-scrollbar-thumb);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--ac-scrollbar-thumb-hover);
}

/* Image rendering for manga pages */
img.manga-page {
  display: block;
  max-width: 100%;
  height: auto;
  image-rendering: auto;
}
```

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: 构建成功，无 TypeScript 错误（CSS 变更不影响 tsc，但确认 vite 打包无报错）

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/assets/global.css
git commit -m "feat: Aurora Clay 设计 token 与全局 CSS 变量层"
```

---

## Task 2: Fluent 自定义主题（`auroraTheme.ts`）

**Files:**
- Create: `src/renderer/src/theme/auroraTheme.ts`

**Interfaces:**
- Produces: `auroraLightTheme: Theme` / `auroraDarkTheme: Theme`，供 Task 5 的 `main.tsx` 挂载到 `FluentProvider`。导出签名：`export const auroraLightTheme: Theme` / `export const auroraDarkTheme: Theme`

- [ ] **Step 1: 创建 `src/renderer/src/theme/auroraTheme.ts`**

```ts
import {
  createLightTheme,
  createDarkTheme,
  type BrandVariants,
  type Theme
} from '@fluentui/react-components'

// 紫粉蓝品牌色阶（Fluent BrandVariants 需要 10 档：10 最浅 → 160 最深）
const auroraBrand: BrandVariants = {
  10: '#faf8ff',
  20: '#f0ebff',
  30: '#e0d7ff',
  40: '#c9b8fd',
  60: '#a78bfa',
  80: '#7c5cf0',
  100: '#6b4ce0',
  120: '#5a3ed0',
  140: '#4a30b8',
  160: '#3a2490'
}

export const auroraLightTheme: Theme = createLightTheme(auroraBrand)
export const auroraDarkTheme: Theme = createDarkTheme(auroraBrand)
```

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: 构建成功。`createLightTheme` / `createDarkTheme` / `BrandVariants` / `Theme` 均为 `@fluentui/react-components` 已有导出，无类型错误。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/theme/auroraTheme.ts
git commit -m "feat: 自定义 Fluent Aurora 品牌主题（紫粉蓝色阶）"
```

---

## Task 3: 共享样式对象（`clayStyles.ts`）

**Files:**
- Create: `src/renderer/src/theme/clayStyles.ts`

**Interfaces:**
- Produces: 共享 `GriffStyle` 对象（makeStyles 的样式对象类型）—— `glassPanel` / `glassPanelHover` / `clayRaised` / `glassButton` / `primaryButton` / `clayChip` / `clayChipActive` / `auroraBody` / `glassInput`。后续 Task 7-17 的页面/组件用 `makeStyles({ myCard: { ...glassPanel, color: 'var(--ac-text-1)' } })` 方式展开复用。

- [ ] **Step 1: 创建 `src/renderer/src/theme/clayStyles.ts`**

```ts
import type { GriffStyle } from '@fluentui/react-components'

// 毛玻璃面板：半透明底 + backdrop-blur + 玻璃边框 + 内顶高光 + 外柔投影 + 大圆角
export const glassPanel: GriffStyle = {
  backgroundColor: 'var(--ac-glass-bg)',
  backdropFilter: 'blur(var(--ac-blur-panel))',
  WebkitBackdropFilter: 'blur(var(--ac-blur-panel))',
  border: '1px solid var(--ac-glass-border)',
  boxShadow: 'inset 0 1px 0 var(--ac-glass-inset-hi), var(--ac-glass-shadow)',
  borderRadius: 'var(--ac-radius-card)'
}

// 毛玻璃面板 hover（叠加在 glassPanel 上用）
export const glassPanelHover: GriffStyle = {
  ':hover': {
    backgroundColor: 'var(--ac-glass-bg-hover)'
  }
}

// 卡片级毛玻璃（blur 较浅）
export const glassCard: GriffStyle = {
  backgroundColor: 'var(--ac-glass-bg)',
  backdropFilter: 'blur(var(--ac-blur-card))',
  WebkitBackdropFilter: 'blur(var(--ac-blur-card))',
  border: '1px solid var(--ac-glass-border)',
  boxShadow: 'inset 0 1px 0 var(--ac-glass-inset-hi), var(--ac-glass-shadow)',
  borderRadius: 'var(--ac-radius-card)',
  ':hover': {
    backgroundColor: 'var(--ac-glass-bg-hover)'
  }
}

// 新拟物凸起（选中态导航项/Tab/按钮）
export const clayRaised: GriffStyle = {
  backgroundColor: 'var(--ac-glass-bg-hover)',
  boxShadow:
    'var(--ac-clay-shadow-dark), var(--ac-clay-shadow-light), var(--ac-clay-inset-border)'
}

// 玻璃次按钮
export const glassButton: GriffStyle = {
  backgroundColor: 'var(--ac-glass-bg)',
  backdropFilter: 'blur(var(--ac-blur-card))',
  WebkitBackdropFilter: 'blur(var(--ac-blur-card))',
  border: '1px solid var(--ac-glass-border)',
  boxShadow: 'inset 0 1px 0 var(--ac-glass-inset-hi), var(--ac-glass-shadow)',
  borderRadius: 'var(--ac-radius-button)',
  color: 'var(--ac-text-2)',
  ':hover': {
    backgroundColor: 'var(--ac-glass-bg-hover)',
    transform: 'translateY(-1px)'
  }
}

// 渐变主按钮
export const primaryButton: GriffStyle = {
  background: 'linear-gradient(135deg, var(--ac-brand), var(--ac-brand-2))',
  color: '#ffffff',
  borderRadius: 'var(--ac-radius-button)',
  boxShadow: '0 4px 10px var(--ac-brand-glow)',
  border: 'none',
  ':hover': {
    transform: 'translateY(-1px)',
    boxShadow: '0 6px 16px var(--ac-brand-glow-hover)'
  }
}

// 彩色标签 chip（品牌紫）
export const clayChip: GriffStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  height: '28px',
  padding: '0 12px',
  borderRadius: 'var(--ac-radius-pill)',
  backgroundColor: 'color-mix(in srgb, var(--ac-brand) 12%, transparent)',
  border: '1px solid color-mix(in srgb, var(--ac-brand) 18%, transparent)',
  color: 'var(--ac-brand)',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background-color 0.15s, transform 0.15s',
  ':hover': {
    backgroundColor: 'color-mix(in srgb, var(--ac-brand) 20%, transparent)',
    transform: 'translateY(-1px)'
  }
}

// 激活态标签 chip（品牌紫加浓）
export const clayChipActive: GriffStyle = {
  backgroundColor: 'color-mix(in srgb, var(--ac-brand) 22%, transparent)',
  border: '1px solid color-mix(in srgb, var(--ac-brand) 35%, transparent)',
  color: 'var(--ac-brand)',
  ':hover': {
    backgroundColor: 'color-mix(in srgb, var(--ac-brand) 30%, transparent)'
  }
}

// 极光背景层（body 容器）
export const auroraBody: GriffStyle = {
  flex: 1,
  overflow: 'hidden',
  minHeight: 0,
  position: 'relative',
  backgroundColor: 'var(--ac-base-bg)',
  backgroundImage:
    'radial-gradient(circle at 12% 18%, var(--ac-aurora-1), transparent 45%),' +
    'radial-gradient(circle at 88% 12%, var(--ac-aurora-2), transparent 40%),' +
    'radial-gradient(circle at 72% 88%, var(--ac-aurora-3), transparent 45%)',
  backgroundAttachment: 'fixed'
}

// 玻璃输入框（内凹陷呼应新拟物）
export const glassInput: GriffStyle = {
  backgroundColor: 'var(--ac-glass-bg)',
  border: '1px solid var(--ac-glass-border)',
  borderRadius: 'var(--ac-radius-button)',
  boxShadow: 'var(--ac-input-inset)',
  color: 'var(--ac-text-1)'
}
```

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: 构建成功。`GriffStyle` 是 `@fluentui/react-components` 的 makeStyles 样式对象类型，导出存在。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/theme/clayStyles.ts
git commit -m "feat: Aurora Clay 共享样式对象（毛玻璃/新拟物/渐变 mixin）"
```

---

## Task 4: 主题状态三态（`appStore.ts`）

**Files:**
- Modify: `src/renderer/src/stores/appStore.ts`

**Interfaces:**
- Produces: 新增 `themeMode: 'system' | 'light' | 'dark'`（默认 `'system'`）；`darkMode` 初始值改为读系统查询；新增 `setThemeMode(mode)` action；保留 `toggleDarkMode`（改为切显式 light/dark）；新增 `initSystemThemeListener()` 返回清理函数。供 Task 5 的 `main.tsx` 消费。

- [ ] **Step 1: 重写 `appStore.ts` 的 state 接口与实现**

替换 `src/renderer/src/stores/appStore.ts` 中 `AppState` 接口与 `create` 调用。完整新文件：

```ts
import { create } from 'zustand'

interface ReaderState {
  mangaId: string
  mangaTitle: string
  mangaCoverUrl: string
  chapterIndex: number
  chapterTitle: string
  chapterUrl: string
  resumePageIndex?: number
}

interface PendingSearch {
  query: string
  mainTag: 0 | 1
}

type ThemeMode = 'system' | 'light' | 'dark'

interface AppState {
  themeMode: ThemeMode
  darkMode: boolean
  currentPage: string
  previousPage: string
  readerSourcePage: string
  favoritesTab: string
  currentMangaId: string | null
  readerState: ReaderState | null
  networkStatus: 'online' | 'degraded' | 'offline'
  pendingSearch: PendingSearch | null
  setThemeMode: (mode: ThemeMode) => void
  setDarkMode: (dark: boolean) => void
  toggleDarkMode: () => void
  setCurrentPage: (page: string) => void
  setCurrentMangaId: (id: string | null) => void
  openReader: (state: ReaderState) => void
  closeReader: () => void
  setFavoritesTab: (tab: string) => void
  setNetworkStatus: (status: 'online' | 'degraded' | 'offline') => void
  triggerTagSearch: (tag: string) => void
  clearPendingSearch: () => void
}

const systemDark =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches

export const useAppStore = create<AppState>((set, get) => ({
  themeMode: 'system',
  darkMode: systemDark,
  currentPage: 'home',
  previousPage: 'home',
  readerSourcePage: 'home',
  favoritesTab: 'local-fav',
  currentMangaId: null,
  readerState: null,
  networkStatus: 'online',
  pendingSearch: null,
  setThemeMode: (mode) => {
    const dark =
      mode === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : mode === 'dark'
    set({ themeMode: mode, darkMode: dark })
  },
  setDarkMode: (dark) => set({ darkMode: dark, themeMode: dark ? 'dark' : 'light' }),
  toggleDarkMode: () => {
    const next = !get().darkMode
    set({ darkMode: next, themeMode: next ? 'dark' : 'light' })
  },
  setCurrentPage: (page) =>
    set({ currentPage: page, currentMangaId: page === 'detail' ? undefined : null }),
  setCurrentMangaId: (id) =>
    set((s) => ({
      currentMangaId: id,
      currentPage: id ? 'detail' : s.currentPage,
      previousPage:
        id && s.currentPage !== 'detail' && s.currentPage !== 'reader'
          ? s.currentPage
          : s.previousPage
    })),
  openReader: (state) =>
    set((s) => ({
      readerState: state,
      currentPage: 'reader',
      readerSourcePage: s.currentPage
    })),
  closeReader: () =>
    set((s) => ({
      readerState: null,
      currentPage: s.readerSourcePage
    })),
  setFavoritesTab: (tab) => set({ favoritesTab: tab }),
  setNetworkStatus: (status) => set({ networkStatus: status }),
  triggerTagSearch: (tag) =>
    set({
      pendingSearch: { query: tag, mainTag: 0 },
      currentPage: 'search'
    }),
  clearPendingSearch: () => set({ pendingSearch: null })
}))

// 初始化系统主题监听器 —— 仅当 themeMode === 'system' 时同步系统变化。
// 返回清理函数，供调用方在 useEffect 里 cleanup。
export function initSystemThemeListener(): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (e: MediaQueryListEvent): void => {
    if (useAppStore.getState().themeMode === 'system') {
      useAppStore.setState({ darkMode: e.matches })
    }
  }
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}
```

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: 构建成功。`set` / `get` 是 zustand create 的标准参数，`useAppStore.getState()` 是 zustand store 方法。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/stores/appStore.ts
git commit -m "feat: 主题三态（system/light/dark）+ 系统主题监听器"
```

---

## Task 5: 挂载主题与根类（`main.tsx`）

**Files:**
- Modify: `src/renderer/src/main.tsx`

**Interfaces:**
- Consumes: `auroraLightTheme` / `auroraDarkTheme`（Task 2）、`useAppStore.darkMode` / `initSystemThemeListener`（Task 4）
- Produces: `FluentProvider` 挂 aurora 主题；根 div 根据 `darkMode` 加 `ac-light` / `ac-dark` 类驱动 CSS 变量；系统主题变化自动同步

- [ ] **Step 1: 重写 `main.tsx`**

替换 `src/renderer/src/main.tsx` 全部内容：

```tsx
import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { FluentProvider } from '@fluentui/react-components'
import { useAppStore, initSystemThemeListener } from './stores/appStore'
import { auroraLightTheme, auroraDarkTheme } from './theme/auroraTheme'
import App from './App'
import './assets/global.css'

function Root(): JSX.Element {
  const darkMode = useAppStore((s) => s.darkMode)
  const toggleDarkMode = useAppStore((s) => s.toggleDarkMode)

  useEffect((): (() => void) => initSystemThemeListener(), [])

  return (
    <FluentProvider
      theme={darkMode ? auroraDarkTheme : auroraLightTheme}
      style={{ height: '100%' }}
    >
      <div className={darkMode ? 'ac-dark' : 'ac-light'} style={{ height: '100%' }}>
        <App darkMode={darkMode} onToggleDarkMode={toggleDarkMode} />
      </div>
    </FluentProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
```

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: 构建成功。`useEffect` 返回的 cleanup 函数签名匹配 `initSystemThemeListener` 返回的 `() => void`。

- [ ] **Step 3: 运行时验证**

Run: `npm run dev`
Expected: 应用启动，根 div 带有 `ac-light` 或 `ac-dark` 类。DevTools Elements 检查 `:root` 下有 `--ac-*` CSS 变量生效。此时页面内容区背景应为浅紫 `#f4f6ff`（浅色）或深蓝 `#0f0f1e`（深色）。极光渐变与毛玻璃尚未体现（后续 Task 完成）。

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/main.tsx
git commit -m "feat: 挂载 Aurora 主题 + 根 div ac-light/ac-dark 类 + 系统监听"
```

---

## Task 6: 主框架 Aurora Clay（`App.tsx`）

**Files:**
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `auroraBody` / `glassPanel` / `clayRaised` / `glassCard`（Task 3）、`--ac-*` CSS 变量（Task 1）
- Produces: 极光背景层 + 毛玻璃侧栏 + 新拟物选中导航项 + 毛玻璃状态栏 + 大圆角

- [ ] **Step 1: 重写 `App.tsx` 的 useStyles**

在 `src/renderer/src/App.tsx` 顶部 import 区追加：

```ts
import { auroraBody, glassPanel, clayRaised } from './theme/clayStyles'
```

替换 `const useStyles = makeStyles({ ... })` 整块（第 36-142 行）为：

```ts
const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: 'transparent'
  },
  body: {
    ...auroraBody,
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    minHeight: 0
  },
  nav: {
    width: `${NAV_WIDTH}px`,
    minWidth: `${NAV_WIDTH}px`,
    display: 'flex',
    flexDirection: 'column',
    padding: '10px',
    gap: '5px',
    backgroundColor: 'var(--ac-glass-bg)',
    backdropFilter: 'blur(var(--ac-blur-panel))',
    WebkitBackdropFilter: 'blur(var(--ac-blur-panel))',
    borderRight: '1px solid var(--ac-glass-border)',
    userSelect: 'none',
    flexShrink: 0
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '9px 12px',
    borderRadius: 'var(--ac-radius-row)',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 400,
    color: 'var(--ac-text-3)',
    transition: 'background-color 0.15s ease, box-shadow 0.15s ease, color 0.15s ease',
    textDecoration: 'none',
    ':hover': {
      backgroundColor: 'var(--ac-glass-bg-hover)',
      color: 'var(--ac-text-2)'
    }
  },
  navItemActive: {
    ...clayRaised,
    color: 'var(--ac-brand)',
    fontWeight: 600,
    ':hover': {
      color: 'var(--ac-brand)',
      backgroundColor: 'var(--ac-glass-bg-hover)'
    }
  },
  navIcon: {
    display: 'flex',
    alignItems: 'center',
    width: '20px',
    height: '20px',
    flexShrink: 0
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minWidth: 0
  },
  pageArea: {
    flex: 1,
    overflow: 'auto',
    minHeight: 0
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    height: `${STATUS_BAR_HEIGHT}px`,
    paddingLeft: '14px',
    paddingRight: '14px',
    backgroundColor: 'var(--ac-glass-bg)',
    backdropFilter: 'blur(var(--ac-blur-toolbar))',
    WebkitBackdropFilter: 'blur(var(--ac-blur-toolbar))',
    borderTop: '1px solid var(--ac-glass-border)',
    fontSize: '12px',
    color: 'var(--ac-text-3)',
    gap: '10px',
    flexShrink: 0
  },
  statusSeparator: {
    width: '1px',
    height: '12px',
    backgroundColor: 'var(--ac-glass-border)',
    flexShrink: 0
  },
  statusItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  statusVersion: {
    marginLeft: 'auto'
  }
})
```

- [ ] **Step 2: 修改网络图标颜色 token**

`App.tsx` 中 `networkIcon` 函数（第 184-190 行）使用 `tokens.colorStatusSuccessForeground1` 等，这些 token 会随 aurora 主题自动调整，**保持不变**。无需改动。

- [ ] **Step 3: 构建验证**

Run: `npm run build`
Expected: 构建成功。`...auroraBody` / `...clayRaised` 展开 GriffStyle 对象合法。

- [ ] **Step 4: 运行时验证**

Run: `npm run dev`
Expected: 内容区出现紫粉蓝极光光晕背景；侧栏呈毛玻璃半透明透出光晕；选中导航项呈新拟物凸起（浅色亮凸暗凹，深色暗凸微亮）；状态栏毛玻璃。导航点击功能正常。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: 主框架 Aurora Clay（极光背景 + 毛玻璃侧栏 + 新拟物选中态）"
```

---

## Task 7: 标题栏毛玻璃（`TitleBar.tsx`）

**Files:**
- Modify: `src/renderer/src/components/TitleBar.tsx`

- [ ] **Step 1: 重写 `TitleBar.tsx` 的 useStyles**

替换 `src/renderer/src/components/TitleBar.tsx` 中 `const useStyles = makeStyles({ ... })`（第 20-48 行）为：

```ts
const useStyles = makeStyles({
  bar: {
    display: 'flex',
    alignItems: 'center',
    height: TITLE_BAR_HEIGHT,
    paddingLeft: '14px',
    paddingRight: '4px',
    backgroundColor: 'var(--ac-glass-bg)',
    backdropFilter: 'blur(var(--ac-blur-toolbar))',
    WebkitBackdropFilter: 'blur(var(--ac-blur-toolbar))',
    borderBottom: '1px solid var(--ac-glass-border)',
    WebkitAppRegion: 'drag',
    userSelect: 'none',
    flexShrink: 0
  },
  title: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--ac-text-2)',
    marginLeft: '4px',
    flex: 1
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    paddingRight: `${CAPTION_RESERVED}px`,
    WebkitAppRegion: 'no-drag'
  }
})
```

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/TitleBar.tsx
git commit -m "feat: 标题栏毛玻璃化"
```

---

## Task 8: 漫画卡片 Aurora Clay（`MangaCard.tsx`）

**Files:**
- Modify: `src/renderer/src/components/MangaCard.tsx`

- [ ] **Step 1: 重写 `MangaCard.tsx` 的 useStyles**

替换 `src/renderer/src/components/MangaCard.tsx` 中 `const useStyles = makeStyles({ ... })`（第 32-93 行）为：

```ts
const useStyles = makeStyles({
  card: {
    cursor: 'pointer',
    transition: 'transform 0.18s ease, box-shadow 0.18s ease',
    ':hover': {
      transform: 'translateY(-3px)',
      boxShadow: '0 8px 20px var(--ac-glass-shadow)'
    }
  },
  imageWrap: {
    position: 'relative',
    borderRadius: 'var(--ac-radius-card)',
    overflow: 'hidden',
    border: '1px solid var(--ac-glass-border)',
    boxShadow: 'inset 0 1px 0 var(--ac-glass-inset-hi), var(--ac-glass-shadow)'
  },
  cardImage: {
    display: 'block',
    width: '100%',
    aspectRatio: '3/4',
    objectFit: 'cover',
    backgroundColor: 'var(--ac-base-bg)'
  },
  favBtn: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    width: '30px',
    height: '30px',
    borderRadius: 'var(--ac-radius-button)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--ac-glass-bg)',
    backdropFilter: 'blur(var(--ac-blur-card))',
    WebkitBackdropFilter: 'blur(var(--ac-blur-card))',
    color: 'var(--ac-danger)',
    cursor: 'pointer',
    opacity: 0,
    transition: 'opacity 0.18s ease, background-color 0.18s ease',
    zIndex: 2,
    ':hover': {
      backgroundColor: 'var(--ac-glass-bg-hover)'
    }
  },
  favBtnVisible: {
    opacity: 1
  },
  cardTitle: {
    fontSize: '14px',
    fontWeight: 500,
    lineHeight: '20px',
    maxHeight: '40px',
    marginTop: '9px',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    color: 'var(--ac-text-1)'
  },
  cardMeta: {
    fontSize: '12px',
    color: 'var(--ac-text-3)',
    marginTop: '4px'
  }
})
```

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 3: 运行时验证**

Run: `npm run dev`
Expected: 卡片封面区大圆角 + 玻璃边框 + 内顶高光；hover 上浮 3px + 投影加深；收藏按钮毛玻璃 + 粉色心形。

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/MangaCard.tsx
git commit -m "feat: 漫画卡片 Aurora Clay（大圆角 + 玻璃边框 + 玻璃收藏按钮）"
```

---

## Task 9: 登录对话框毛玻璃（`LoginDialog.tsx`）

**Files:**
- Modify: `src/renderer/src/components/LoginDialog.tsx`

- [ ] **Step 1: 重写 `LoginDialog.tsx` 的 useStyles**

替换 `src/renderer/src/components/LoginDialog.tsx` 中 `const useStyles = makeStyles({ ... })`（第 19-41 行）为：

```ts
const useStyles = makeStyles({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    paddingTop: '8px'
  },
  inputRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  label: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--ac-text-2)'
  },
  error: {
    color: 'var(--ac-danger)',
    fontSize: '13px',
    marginTop: '4px'
  }
})
```

- [ ] **Step 2: 给 DialogSurface 加毛玻璃样式**

在 `LoginDialog.tsx` 的 return 块中，把 `<DialogSurface>` 改为带 style：

```tsx
<DialogSurface
  style={{
    backgroundColor: 'var(--ac-glass-bg)',
    backdropFilter: 'blur(var(--ac-blur-dialog))',
    WebkitBackdropFilter: 'blur(var(--ac-blur-dialog))',
    border: '1px solid var(--ac-glass-border)',
    boxShadow: 'inset 0 1px 0 var(--ac-glass-inset-hi), var(--ac-glass-shadow)',
    borderRadius: 'var(--ac-radius-panel)'
  }}
>
```

- [ ] **Step 3: 构建验证**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/LoginDialog.tsx
git commit -m "feat: 登录对话框毛玻璃模态 + 极光透出"
```

---

## Task 10: 首页 Tab 新拟物 + 圆角（`HomePage.tsx`）

**Files:**
- Modify: `src/renderer/src/pages/HomePage.tsx`

- [ ] **Step 1: 重写 `HomePage.tsx` 的 useStyles**

替换 `src/renderer/src/pages/HomePage.tsx` 中 `const useStyles = makeStyles({ ... })`（第 15-47 行）为：

```ts
const useStyles = makeStyles({
  root: {
    padding: '24px',
    height: '100%',
    overflow: 'auto'
  },
  tabs: {
    marginBottom: '24px',
    '& .fui-TabList': {
      gap: '6px'
    },
    '& .fui-Tab': {
      borderRadius: 'var(--ac-radius-row)',
      color: 'var(--ac-text-3)',
      fontSize: '14px',
      padding: '6px 14px'
    },
    '& .fui-Tab:hover': {
      backgroundColor: 'var(--ac-glass-bg-hover)',
      color: 'var(--ac-text-2)'
    },
    '& .fui-Tab--selected': {
      backgroundColor: 'var(--ac-glass-bg-hover)',
      color: 'var(--ac-brand)',
      fontWeight: 600,
      boxShadow:
        'var(--ac-clay-shadow-dark), var(--ac-clay-shadow-light), var(--ac-clay-inset-border)'
    }
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px'
  },
  statusMsg: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 0',
    color: 'var(--ac-text-3)',
    gap: '16px'
  },
  shimmerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px'
  },
  shimmerCard: {
    aspectRatio: '3/4',
    borderRadius: 'var(--ac-radius-card)'
  }
})
```

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: 构建成功。`& .fui-Tab` 是 Fluent UI v9 Tab 的类名，makeStyles 支持后代选择器嵌套。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/pages/HomePage.tsx
git commit -m "feat: 首页 Tab 新拟物选中态 + 大圆角 + shimmer 圆角"
```

---

## Task 11: 详情页 Aurora Clay（`MangaDetailPage.tsx`）

**Files:**
- Modify: `src/renderer/src/pages/MangaDetailPage.tsx`

- [ ] **Step 1: 重写 `MangaDetailPage.tsx` 的 useStyles**

替换 `src/renderer/src/pages/MangaDetailPage.tsx` 中 `const useStyles = makeStyles({ ... })`（第 14-68 行）为：

```ts
const useStyles = makeStyles({
  root: { height: '100%', overflow: 'auto' },
  backBtn: { padding: '12px 32px 0' },
  hero: {
    display: 'flex',
    gap: '32px',
    padding: '32px',
    backgroundColor: 'var(--ac-glass-bg)',
    backdropFilter: 'blur(var(--ac-blur-panel))',
    WebkitBackdropFilter: 'blur(var(--ac-blur-panel))',
    borderBottom: '1px solid var(--ac-glass-border)',
    boxShadow: 'inset 0 1px 0 var(--ac-glass-inset-hi)'
  },
  coverWrap: {
    width: '240px',
    minWidth: '240px',
    borderRadius: 'var(--ac-radius-cover)',
    overflow: 'hidden',
    boxShadow: '0 10px 28px var(--ac-glass-shadow), inset 0 1px 0 var(--ac-glass-inset-hi)',
    aspectRatio: '3/4',
    border: '1px solid var(--ac-glass-border)',
    backgroundColor: 'var(--ac-base-bg)'
  },
  cover: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  info: { flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    color: 'var(--ac-text-1)',
    lineHeight: 1.3
  },
  carPlate: {
    fontSize: '13px',
    color: 'var(--ac-text-3)',
    letterSpacing: '0.5px',
    userSelect: 'all',
    cursor: 'text'
  },
  author: { fontSize: '15px', color: 'var(--ac-text-2)' },
  tags: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  tagBadge: {
    cursor: 'pointer',
    transition: 'transform 0.15s, background-color 0.15s',
    ':hover': {
      transform: 'translateY(-1px)'
    }
  },
  description: {
    fontSize: '14px',
    color: 'var(--ac-text-2)',
    lineHeight: 1.6
  },
  actions: { display: 'flex', gap: '12px', marginTop: '8px' },
  chaptersSection: { padding: '24px 32px' },
  chapterHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px'
  },
  chapterList: { display: 'flex', flexDirection: 'column', gap: '4px' },
  chapterItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 16px',
    borderRadius: 'var(--ac-radius-row)',
    cursor: 'pointer',
    transition: 'background-color 0.15s, box-shadow 0.15s',
    gap: '12px',
    ':hover': {
      backgroundColor: 'var(--ac-glass-bg-hover)',
      boxShadow: 'inset 0 0 0 1px var(--ac-glass-border)'
    }
  },
  chapterIndex: {
    width: '32px',
    height: '32px',
    borderRadius: 'var(--ac-radius-badge)',
    backgroundColor: 'color-mix(in srgb, var(--ac-brand) 12%, transparent)',
    border: '1px solid color-mix(in srgb, var(--ac-brand) 18%, transparent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--ac-brand)',
    flexShrink: 0
  },
  chapterTitle: {
    fontSize: '14px',
    fontWeight: 400,
    color: 'var(--ac-text-1)',
    flex: 1
  },
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px',
    gap: '16px',
    color: 'var(--ac-text-3)'
  }
})
```

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 3: 运行时验证**

Run: `npm run dev`，点击任意漫画进详情页
Expected: Hero 区毛玻璃透出极光；封面大圆角 + 柔光投影；标签 chip 彩色（Fluent Badge tint 会用 aurora 品牌紫）；章节项 hover 玻璃高亮 + 内描边；序号方块半透明品牌色。功能正常（阅读/下载/收藏按钮可点）。

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/pages/MangaDetailPage.tsx
git commit -m "feat: 详情页 Aurora Clay（毛玻璃 Hero + 大圆角封面 + 玻璃章节项）"
```

---

## Task 12: 阅读器毛玻璃悬浮（`ReaderPage.tsx`）

**Files:**
- Modify: `src/renderer/src/pages/ReaderPage.tsx`

**注意：** 阅读区（`viewerArea` / `imageWrap` / `mangaImage` / `scrollMode` / `singlePageMode` / `loading`）保持深色硬编码，**不引用 `--ac-*`**，确保阅读沉浸不受主题影响。仅改 `toolbar` / `navBtn` / `pageIndicator`。

- [ ] **Step 1: 重写 `ReaderPage.tsx` 的 useStyles 中工具栏相关部分**

替换 `src/renderer/src/pages/ReaderPage.tsx` 中 `const useStyles = makeStyles({ ... })`（第 13-57 行）为：

```ts
const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#0a0a0a',
    color: '#ffffff',
    position: 'relative',
    userSelect: 'none'
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    height: `${TOOLBAR_HEIGHT}px`,
    padding: '0 12px',
    gap: '8px',
    backgroundColor: 'var(--ac-glass-bg)',
    backdropFilter: 'blur(var(--ac-blur-toolbar))',
    WebkitBackdropFilter: 'blur(var(--ac-blur-toolbar))',
    zIndex: 10,
    flexShrink: 0,
    borderBottom: '1px solid var(--ac-glass-border)'
  },
  toolbarTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--ac-text-2)',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  toolbarInfo: {
    fontSize: '12px',
    color: 'var(--ac-text-3)'
  },
  viewerArea: {
    flex: 1,
    overflow: 'auto',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: '#0a0a0a'
  },
  scrollMode: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '16px 0'
  },
  singlePageMode: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    width: '100%'
  },
  imageWrap: {
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    backgroundColor: '#111111'
  },
  mangaImage: {
    display: 'block',
    maxWidth: '100%',
    height: 'auto',
    objectFit: 'contain'
  },
  navBtn: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 5,
    width: '48px',
    height: '80px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--ac-glass-bg)',
    backdropFilter: 'blur(var(--ac-blur-card))',
    WebkitBackdropFilter: 'blur(var(--ac-blur-card))',
    border: '1px solid var(--ac-glass-border)',
    borderRadius: 'var(--ac-radius-button)',
    cursor: 'pointer',
    color: 'var(--ac-text-2)',
    opacity: 0.4,
    transition: 'opacity 0.2s',
    ':hover': {
      opacity: 1,
      backgroundColor: 'var(--ac-glass-bg-hover)'
    }
  },
  navLeft: { left: '16px' },
  navRight: { right: '16px' },
  pageIndicator: {
    position: 'absolute',
    bottom: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'var(--ac-glass-bg)',
    backdropFilter: 'blur(var(--ac-blur-card))',
    WebkitBackdropFilter: 'blur(var(--ac-blur-card))',
    border: '1px solid var(--ac-glass-border)',
    color: 'var(--ac-text-2)',
    padding: '5px 14px',
    borderRadius: 'var(--ac-radius-pill)',
    fontSize: '12px',
    zIndex: 5
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '16px',
    color: '#888888'
  }
})
```

- [ ] **Step 2: 修复工具栏内硬编码颜色**

在 `ReaderPage.tsx` 的 return JSX 中，有几处 `style={{ color: '#cccccc' }}` 和 `tokens.colorBrandForeground1`（第 505、522、529 行附近）。把 `#cccccc` 改为 `var(--ac-text-2)`：

```tsx
// 返回按钮
<Button appearance="subtle" size="small" icon={<Dismiss20Regular />}
  style={{ color: 'var(--ac-text-2)' }} onClick={() => { ... }}
>返回</Button>

// 模式切换按钮
<Button appearance="subtle" size="small" icon={<SlideText20Regular />}
  style={{ color: viewMode === 'scroll' ? 'var(--ac-brand)' : 'var(--ac-text-2)' }}
  onClick={() => setViewMode(viewMode === 'scroll' ? 'single' : 'scroll')}
/>

// 下载按钮
<Button appearance="subtle" size="small" icon={<ArrowDownload20Regular />}
  style={{ color: 'var(--ac-text-2)' }}
  onClick={async () => { ... }}
/>
```

- [ ] **Step 3: 构建验证**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 4: 运行时验证**

Run: `npm run dev`，进入阅读器
Expected: 工具栏毛玻璃悬浮（浅色主题下浅玻璃，深色主题下深玻璃）；左右导航按钮毛玻璃；页码指示器胶囊毛玻璃；阅读区始终深色 `#0a0a0a`/`#111111` 不受主题影响。翻页/模式切换/下载功能正常。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/pages/ReaderPage.tsx
git commit -m "feat: 阅读器工具栏/导航/指示器毛玻璃悬浮，阅读区保持深色沉浸"
```

---

## Task 13: 搜索页 chip 彩色玻璃（`SearchPage.tsx`）

**Files:**
- Modify: `src/renderer/src/pages/SearchPage.tsx`

- [ ] **Step 1: 重写 `SearchPage.tsx` 的 useStyles**

替换 `src/renderer/src/pages/SearchPage.tsx` 中 `const useStyles = makeStyles({ ... })`（第 14-99 行）为：

```ts
const useStyles = makeStyles({
  root: { padding: '24px', height: '100%', overflow: 'auto' },
  searchBar: { display: 'flex', gap: '8px', maxWidth: '660px', marginBottom: '8px' },
  hint: {
    fontSize: '12px',
    color: 'var(--ac-text-3)',
    marginTop: '4px',
    marginBottom: '20px'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px'
  },
  statusMsg: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 0',
    color: 'var(--ac-text-3)',
    gap: '12px'
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    marginTop: '24px',
    marginBottom: '12px'
  },
  pageText: {
    fontSize: '13px',
    color: 'var(--ac-text-2)',
    minWidth: '80px',
    textAlign: 'center'
  },
  shimmerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px'
  },
  shimmerCard: {
    aspectRatio: '3/4',
    borderRadius: 'var(--ac-radius-card)'
  },
  historySection: {
    maxWidth: '660px',
    marginTop: '8px'
  },
  historyHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px'
  },
  historyTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--ac-text-2)'
  },
  chipList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px'
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    height: '32px',
    padding: '0 4px 0 12px',
    borderRadius: 'var(--ac-radius-pill)',
    backgroundColor: 'color-mix(in srgb, var(--ac-brand) 12%, transparent)',
    border: '1px solid color-mix(in srgb, var(--ac-brand) 18%, transparent)',
    color: 'var(--ac-brand)',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'background-color 0.15s, transform 0.15s',
    ':hover': {
      backgroundColor: 'color-mix(in srgb, var(--ac-brand) 20%, transparent)',
      transform: 'translateY(-1px)'
    }
  },
  chipText: {
    maxWidth: '200px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  chipDelete: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    borderRadius: 'var(--ac-radius-badge)',
    cursor: 'pointer',
    color: 'var(--ac-text-3)',
    ':hover': {
      backgroundColor: 'color-mix(in srgb, var(--ac-danger) 20%, transparent)',
      color: 'var(--ac-danger)'
    }
  },
  historyEmpty: {
    fontSize: '13px',
    color: 'var(--ac-text-3)',
    padding: '8px 0'
  }
})
```

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/pages/SearchPage.tsx
git commit -m "feat: 搜索页 chip 彩色玻璃 + 大圆角 + shimmer 圆角"
```

---

## Task 14: 分类页 chip 彩色玻璃（`CategoriesPage.tsx`）

**Files:**
- Modify: `src/renderer/src/pages/CategoriesPage.tsx`

- [ ] **Step 1: 重写 `CategoriesPage.tsx` 的 useStyles**

替换 `src/renderer/src/pages/CategoriesPage.tsx` 中 `const useStyles = makeStyles({ ... })`（第 17-117 行）为：

```ts
const useStyles = makeStyles({
  root: { padding: '24px', height: '100%', overflow: 'auto' },
  title: { marginBottom: '16px', display: 'block', color: 'var(--ac-text-1)' },
  filterBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'flex-end',
    marginBottom: '16px'
  },
  filterItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: '120px'
  },
  filterLabel: {
    fontSize: '12px',
    color: 'var(--ac-text-2)',
    fontWeight: 600,
    paddingLeft: '4px'
  },
  tagSection: { marginBottom: '16px' },
  tagHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--ac-text-2)',
    marginBottom: '10px'
  },
  tagList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px'
  },
  tagChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    height: '30px',
    padding: '0 12px',
    borderRadius: 'var(--ac-radius-pill)',
    backgroundColor: 'color-mix(in srgb, var(--ac-brand) 10%, transparent)',
    border: '1px solid color-mix(in srgb, var(--ac-brand) 15%, transparent)',
    color: 'var(--ac-text-2)',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, transform 0.15s',
    ':hover': {
      backgroundColor: 'color-mix(in srgb, var(--ac-brand) 18%, transparent)',
      border: '1px solid color-mix(in srgb, var(--ac-brand) 25%, transparent)',
      color: 'var(--ac-brand)',
      transform: 'translateY(-1px)'
    }
  },
  tagChipActive: {
    backgroundColor: 'color-mix(in srgb, var(--ac-brand) 25%, transparent)',
    border: '1px solid color-mix(in srgb, var(--ac-brand) 40%, transparent)',
    color: 'var(--ac-brand)',
    fontWeight: 600,
    ':hover': {
      backgroundColor: 'color-mix(in srgb, var(--ac-brand) 32%, transparent)',
      border: '1px solid color-mix(in srgb, var(--ac-brand) 50%, transparent)',
      color: 'var(--ac-brand)'
    }
  },
  selectedTagWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '16px'
  },
  selectedTagChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    height: '32px',
    padding: '0 4px 0 12px',
    borderRadius: 'var(--ac-radius-pill)',
    backgroundColor: 'color-mix(in srgb, var(--ac-brand) 22%, transparent)',
    border: '1px solid color-mix(in srgb, var(--ac-brand) 35%, transparent)',
    color: 'var(--ac-brand)',
    fontSize: '13px',
    fontWeight: 600
  },
  selectedTagDismiss: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    borderRadius: 'var(--ac-radius-badge)',
    cursor: 'pointer',
    color: 'var(--ac-brand)',
    ':hover': {
      backgroundColor: 'color-mix(in srgb, var(--ac-danger) 20%, transparent)',
      color: 'var(--ac-danger)'
    }
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px'
  },
  statusMsg: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 0',
    color: 'var(--ac-text-3)',
    gap: '12px'
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    marginTop: '24px',
    marginBottom: '12px'
  },
  pageText: {
    fontSize: '13px',
    color: 'var(--ac-text-2)',
    minWidth: '80px',
    textAlign: 'center'
  },
  shimmerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px'
  },
  shimmerCard: {
    aspectRatio: '3/4',
    borderRadius: 'var(--ac-radius-card)'
  }
})
```

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/pages/CategoriesPage.tsx
git commit -m "feat: 分类页 chip 彩色玻璃 + 大圆角 + shimmer 圆角"
```

---

## Task 15: 收藏页大圆角玻璃（`FavoritesPage.tsx`）

**Files:**
- Modify: `src/renderer/src/pages/FavoritesPage.tsx`

- [ ] **Step 1: 重写 `FavoritesPage.tsx` 的 useStyles**

替换 `src/renderer/src/pages/FavoritesPage.tsx` 中 `const useStyles = makeStyles({ ... })`（第 13-46 行）为：

```ts
const useStyles = makeStyles({
  root: { padding: '24px', height: '100%', overflow: 'auto' },
  tabRow: { marginBottom: '16px' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px'
  },
  statusMsg: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 0',
    color: 'var(--ac-text-3)',
    gap: '12px'
  },
  historyItem: {
    display: 'flex',
    gap: '12px',
    padding: '12px',
    borderRadius: 'var(--ac-radius-row)',
    cursor: 'pointer',
    transition: 'background-color 0.15s, box-shadow 0.15s',
    alignItems: 'center',
    ':hover': {
      backgroundColor: 'var(--ac-glass-bg-hover)',
      boxShadow: 'inset 0 0 0 1px var(--ac-glass-border)'
    }
  },
  historyCover: {
    width: '48px',
    minWidth: '48px',
    height: '64px',
    objectFit: 'cover',
    borderRadius: 'var(--ac-radius-badge)',
    backgroundColor: 'var(--ac-base-bg)',
    border: '1px solid var(--ac-glass-border)'
  },
  historyInfo: { flex: 1, minWidth: 0 },
  historyTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--ac-text-1)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  historyMeta: {
    fontSize: '12px',
    color: 'var(--ac-text-3)',
    marginTop: '4px'
  },
  historyActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px'
  }
})
```

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/pages/FavoritesPage.tsx
git commit -m "feat: 收藏页历史项大圆角玻璃 + 封面大圆角"
```

---

## Task 16: 下载页空状态玻璃化（`DownloadsPage.tsx`）

**Files:**
- Modify: `src/renderer/src/pages/DownloadsPage.tsx`

- [ ] **Step 1: 重写 `DownloadsPage.tsx` 的 useStyles**

替换 `src/renderer/src/pages/DownloadsPage.tsx` 中 `const useStyles = makeStyles({ ... })`（第 12-15 行）为：

```ts
const useStyles = makeStyles({
  root: { padding: '24px', height: '100%', overflow: 'auto' },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 0',
    color: 'var(--ac-text-3)',
    gap: '12px'
  }
})
```

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/pages/DownloadsPage.tsx
git commit -m "feat: 下载页空状态 Aurora Clay 配色"
```

---

## Task 17: 设置页毛玻璃 + 三态主题（`SettingsPage.tsx`）

**Files:**
- Modify: `src/renderer/src/pages/SettingsPage.tsx`

- [ ] **Step 1: 重写 `SettingsPage.tsx` 的 useStyles**

替换 `src/renderer/src/pages/SettingsPage.tsx` 中 `const useStyles = makeStyles({ ... })`（第 10-16 行）为：

```ts
const useStyles = makeStyles({
  root: {
    padding: '24px',
    height: '100%',
    overflow: 'auto',
    maxWidth: '720px'
  },
  section: { marginBottom: '32px' },
  sectionTitle: {
    marginBottom: '16px',
    display: 'block',
    color: 'var(--ac-text-1)'
  },
  card: {
    marginBottom: '16px',
    backgroundColor: 'var(--ac-glass-bg)',
    backdropFilter: 'blur(var(--ac-blur-panel))',
    WebkitBackdropFilter: 'blur(var(--ac-blur-panel))',
    border: '1px solid var(--ac-glass-border)',
    borderRadius: 'var(--ac-radius-card)',
    boxShadow: 'inset 0 1px 0 var(--ac-glass-inset-hi), var(--ac-glass-shadow)'
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '24px'
  }
})
```

- [ ] **Step 2: 改深色模式行为为三态**

在 `SettingsPage.tsx` 中把：

```tsx
const { darkMode, toggleDarkMode, networkStatus } = useAppStore()
```

改为：

```tsx
const { darkMode, themeMode, setThemeMode, networkStatus } = useAppStore()
```

把外观区"深色模式"的 Card 内容（第 27-35 行）替换为三态选择：

```tsx
<Card className={styles.card}>
  <div className={styles.row}>
    <div>
      <Text weight="semibold" style={{ color: 'var(--ac-text-1)' }}>主题模式</Text>
      <div>
        <Text size={200} style={{ color: 'var(--ac-text-3)' }}>
          跟随系统 / 浅色 / 深色
        </Text>
      </div>
    </div>
    <div style={{ display: 'flex', gap: '6px' }}>
      {(['system', 'light', 'dark'] as const).map((m) => (
        <Button
          key={m}
          size="small"
          appearance={themeMode === m ? 'primary' : 'subtle'}
          onClick={() => setThemeMode(m)}
        >
          {m === 'system' ? '跟随系统' : m === 'light' ? '浅色' : '深色'}
        </Button>
      ))}
    </div>
  </div>
</Card>
```

- [ ] **Step 3: 修其余 Card 内文字颜色**

把 `SettingsPage.tsx` 中所有 `tokens.colorNeutralForeground3` 替换为 `'var(--ac-text-3)'`，`tokens.colorNeutralForeground4` 替换为 `'var(--ac-text-3)'`。逐个替换（约 5 处）。

- [ ] **Step 4: 构建验证**

Run: `npm run build`
Expected: 构建成功。`themeMode` / `setThemeMode` 来自 Task 4 的 store。

- [ ] **Step 5: 运行时验证**

Run: `npm run dev` → 设置页
Expected: 设置卡片毛玻璃；主题三态按钮（跟随系统/浅色/深色）可切换且当前态高亮；切换后全局主题立即变化。

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/pages/SettingsPage.tsx
git commit -m "feat: 设置页毛玻璃卡片 + 主题三态选择器"
```

---

## Task 18: 全量验证与收尾

**Files:**
- 无新文件改动，仅验证

- [ ] **Step 1: 全量构建**

Run: `npm run build`
Expected: 构建成功，无 TypeScript 错误，无 vite 报错。

- [ ] **Step 2: 全功能回归验证**

Run: `npm run dev`
逐项验证：
1. 主界面极光光晕 + 毛玻璃侧栏 + 新拟物选中导航项 ✓
2. 系统切换浅色/深色，应用自动跟随 ✓
3. 设置页手动切"跟随系统/浅色/深色"三态生效 ✓
4. 卡片 hover 上浮 + 投影加深 ✓
5. 主按钮紫粉渐变 + 彩色投影（详情页/搜索页）✓
6. 标签 chip 半透明彩色（详情页/分类页/搜索历史）✓
7. 阅读器阅读区始终深色，工具栏毛玻璃悬浮 ✓
8. 登录对话框毛玻璃模态 + 极光透出 ✓
9. 圆角符合规范（卡片16/按钮14/行项12/封面14/序号10/胶囊99）✓
10. 导航/搜索/分类/详情/阅读/收藏/历史/下载/设置功能正常 ✓

- [ ] **Step 3: 提交最终状态（如有零散修正）**

```bash
git add -A
git commit -m "chore: Aurora Clay 视觉改造全量验证通过" --allow-empty
```

- [ ] **Step 4: 推送分支**

```bash
git push -u origin feat/aurora-clay-visual
```

---

## Self-Review 记录

**Spec coverage 检查：**
- 极光光晕背景 → Task 6 (auroraBody)
- 毛玻璃面板（标题栏/侧栏/卡片/Hero/状态栏/对话框/工具栏）→ Task 6/7/8/9/11/12/17
- 新拟物选中态 → Task 6 (clayRaised navItemActive) + Task 10 (Tab)
- 主按钮渐变 → Task 3 (primaryButton mixin) + Fluent theme 品牌色
- 标签 chip 彩色 → Task 11/13/14
- 圆角规范 → Task 1 (CSS 变量) + 各 Task 引用
- 阅读器沉浸 + 玻璃悬浮 → Task 12
- prefers-color-scheme + 手动开关三态 → Task 4 + Task 5 + Task 17
- 所有涉及文件清单 → Task 1-17 全覆盖

**Placeholder 扫描：** 无 TBD/TODO，每步含完整代码。

**类型一致性：** `themeMode` / `setThemeMode` / `initSystemThemeListener` 在 Task 4 定义，Task 5/17 消费签名一致。`auroraLightTheme`/`auroraDarkTheme` 在 Task 2 定义，Task 5 消费一致。`glassPanel`/`clayRaised`/`auroraBody` 在 Task 3 定义，Task 6 消费一致。
