# Aurora Clay 视觉改造

**日期**: 2026-07-17
**分支**: `feat/aurora-clay-visual`
**范围**: 把 JMComic Desktop 客户端的视觉风格从 WinUI 3 中性灰扁平，改造为 "Aurora Clay"（极光毛玻璃为主 + 新拟物触感点缀）的双主题现代风格，支持浅色/深色随系统自动切换

## 背景与问题

当前视觉风格（`src/renderer`）：

- 完全依赖 Fluent UI v9 `webLightTheme` / `webDarkTheme` 默认中性灰 token，配色单调、企业感重
- 卡片仅 `translateY(-2px) + shadow8` 轻微上浮，层次单薄
- 标题栏走原生 Mica 云母（保留），但内容区是实色 `colorNeutralBackground2`，与标题栏割裂、缺乏过渡
- 圆角克制（Fluent 默认 `borderRadiusMedium` ≈ 4-8px），偏硬朗
- `main.tsx` 虽已切 `webDarkTheme`/`webLightTheme`，但 App 内大量样式硬编码 `tokens.colorNeutralBackground*`，深色模式下观感灰暗
- 无极光光晕、无毛玻璃、无彩色强调，与"现代、多彩、简约干净"的目标差距大

用户期望：现代用色 + 毛玻璃层次 + 新拟物触感 + 扁平拟物结合 + 多彩简约干净 + 高视觉效率。

## 目标

**Aurora Clay 双主题**：以极光毛玻璃（A）为主体，在选中态/输入框等处点缀新拟物柔和触感（B），浅色/深色双套，随系统自动切换。具体：

1. 背景铺紫粉蓝三色极光径向渐变光晕
2. 标题栏 / 侧栏 / 卡片 / Hero / 状态栏 / 对话框 / 工具栏均为毛玻璃（`backdrop-filter: blur`）透出背景光晕
3. 选中态导航项 / Tab / 按钮用双向柔和阴影做新拟物凸起（浅色亮凸暗凹，深色暗凸微亮 + 1px 内描边）
4. 主按钮紫→粉渐变 + 彩色投影 + hover 上浮
5. 标签 chip 半透明彩色（紫为主，粉/绿做语义区分）
6. 圆角全面加大（窗口 28 / 面板 24 / 卡片 16 / 按钮 14 / 行项 12 / 封面 14 / 序号 10 / 胶囊 99）
7. 阅读器阅读区保持深色沉浸（不受主题影响），工具栏/导航/指示器为毛玻璃悬浮
8. `prefers-color-scheme` 跟随系统 + 手动开关，两套设计 token 自动切换

## 不改的部分（边界）

明确不动，行为完全保持：

- `src/main/**` 全部主进程逻辑（窗口创建、Mica、IPC、内容抓取、图片代理、下载、数据库）
- `src/preload/**` contextBridge 暴露的 API
- 所有页面业务逻辑（数据加载、状态管理、路由、收藏/下载/历史 IPC 调用）
- 组件结构与 props 契约（仅改样式，不改组件树和数据流）
- Fluent UI v9 组件库继续使用（`FluentProvider` / `Button` / `Input` / `Dialog` / `Tooltip` / `Badge` / `Spinner` / `Text` / `Divider` 等），但通过自定义 Theme override + `makeStyles` 覆盖外观
- 原生 Mica 标题栏材质（标题栏透明区继续透出 DWM 云母）

## 设计

### 核心思路

不引入新 UI 库。在现有 Fluent UI v9 + `makeStyles` + Tailwind 基础上：

1. **自定义 Fluent Theme**：基于 `webLightTheme` / `webDarkTheme` 用 `createLightTheme` / `createDarkTheme` + 自定义 `BrandVariants` 生成紫粉蓝品牌色 token，覆盖 `colorBrandBackground1` / `colorBrandForeground1` 等
2. **全局 CSS token 层**：在 `global.css` 定义 Aurora Clay 语义变量（`--ac-glass-bg` / `--ac-glass-border` / `--ac-shadow-raised` / `--ac-shadow-inset` / `--ac-aurora-*`），按 `prefers-color-scheme` + `.dark` / `.light` 类切换
3. **极光背景层**：在 `App.tsx` 的 `body` 容器上铺三色径向渐变（绝对定位伪元素或直接 background），毛玻璃面板透出此光晕
4. **毛玻璃 mixin**：在 `makeStyles` 用共享样式对象复用 `backdropFilter` + 半透明底 + 玻璃边框 + 内顶高光 + 外柔投影
5. **新拟物触感 mixin**：选中态用双向 box-shadow（浅色：暗投影 + 白亮投影；深色：深投影 + 微亮投影 + inset 1px 描边）
6. **圆角常量**：集中定义 `RADIUS_WINDOW=28` / `RADIUS_PANEL=24` / `RADIUS_CARD=16` / `RADIUS_BUTTON=14` / `RADIUS_ROW=12` / `RADIUS_COVER=14` / `RADIUS_BADGE=10` / `RADIUS_PILL=99`

### 涉及文件

| 文件 | 改动 |
|---|---|
| `src/renderer/src/assets/global.css` | 新增 Aurora Clay 设计 token（CSS 变量）、极光背景、毛玻璃/新拟物工具类、圆角变量、深浅色切换规则、滚动条适配 |
| `src/renderer/src/theme/auroraTheme.ts` | **新建**：自定义 Fluent BrandVariants + `createLightTheme` / `createDarkTheme` 导出 `auroraLightTheme` / `auroraDarkTheme` |
| `src/renderer/src/theme/clayStyles.ts` | **新建**：共享 `makeStyles` 样式对象（glassPanel / clayRaised / glassButton / clayChip / auroraBg），供各页面复用 |
| `src/renderer/src/main.tsx` | `webLightTheme`/`webDarkTheme` → `auroraLightTheme`/`auroraDarkTheme`；监听 `prefers-color-scheme` 同步到 store |
| `src/renderer/src/stores/appStore.ts` | 新增 `themeMode: 'system' \| 'light' \| 'dark'`（默认 `'system'`）；`darkMode` 改为由 `themeMode` + 系统查询派生的 getter；手动开关切 `themeMode` 为 `'light'`/`'dark'`；系统监听器仅当 `themeMode==='system'` 时更新 `darkMode` |
| `src/renderer/src/App.tsx` | body 加极光背景层；nav/card/statusBar 样式换 Aurora Clay；圆角加大；导航项选中态新拟物凸起 |
| `src/renderer/src/components/TitleBar.tsx` | 毛玻璃 + 大圆角底；主题切换按钮玻璃化 |
| `src/renderer/src/components/MangaCard.tsx` | 毛玻璃卡片 + 大圆角 + 内顶高光 + 彩色封面投影；收藏按钮玻璃化 |
| `src/renderer/src/components/LoginDialog.tsx` | 对话框毛玻璃模态（blur 20px）+ 极光透出；输入框内凹陷；按钮渐变 |
| `src/renderer/src/pages/HomePage.tsx` | Hero 毛玻璃面板 + Tab 大圆角新拟物选中态；卡片网格间距/圆角适配 |
| `src/renderer/src/pages/MangaDetailPage.tsx` | Hero 毛玻璃；封面大圆角 + 柔光投影；标签 chip 彩色；按钮渐变；章节项大圆角玻璃 hover + 序号方块 |
| `src/renderer/src/pages/ReaderPage.tsx` | 工具栏/导航/指示器毛玻璃悬浮；阅读区保持深色沉浸（不随主题变）；按钮玻璃化 |
| `src/renderer/src/pages/SearchPage.tsx` | 搜索历史 chip 彩色玻璃；输入框内凹陷；结果卡片复用 MangaCard |
| `src/renderer/src/pages/CategoriesPage.tsx` | 筛选 chip / 标签 chip 彩色玻璃；分页按钮玻璃化 |
| `src/renderer/src/pages/FavoritesPage.tsx` | 空状态/卡片复用 Aurora Clay |
| `src/renderer/src/pages/DownloadsPage.tsx` | 下载项卡片毛玻璃；进度条彩色渐变 |
| `src/renderer/src/pages/SettingsPage.tsx` | 设置区毛玻璃面板；开关/滑块/输入框新拟物触感 |
| `tailwind.config.js` | 不改动（视觉 token 全走 CSS 变量 + `makeStyles`，无需扩展 Tailwind） |

### 1. 设计 Token（`global.css`）

```css
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
  --ac-aurora-1: rgba(167, 139, 250, 0.28);  /* 紫 */
  --ac-aurora-2: rgba(244, 114, 182, 0.22);  /* 粉 */
  --ac-aurora-3: rgba(96, 165, 250, 0.25);   /* 蓝 */
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
  --ac-pink: #f472b6;
  --ac-blue: #60a5fa;
  --ac-green: #34d399;
  --ac-amber: #fbbf24;
  --ac-danger: #ff6b9d;
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
  --ac-pink: #f472b6;
  --ac-blue: #60a5fa;
  --ac-green: #34d399;
  --ac-amber: #fbbf24;
  --ac-danger: #ff6b9d;
}
```

### 2. 极光背景层（`App.tsx` body）

```ts
// body 容器铺三色径向渐变，毛玻璃面板透出此光晕
body: {
  flex: 1,
  overflow: 'hidden',
  minHeight: 0,
  position: 'relative',
  backgroundColor: 'var(--ac-base-bg)',
  backgroundImage: `
    radial-gradient(circle at 12% 18%, var(--ac-aurora-1), transparent 45%),
    radial-gradient(circle at 88% 12%, var(--ac-aurora-2), transparent 40%),
    radial-gradient(circle at 72% 88%, var(--ac-aurora-3), transparent 45%)
  `,
  backgroundAttachment: 'fixed'
}
```

### 3. 毛玻璃面板 mixin（`clayStyles.ts`）

```ts
export const glassPanel = {
  backgroundColor: 'var(--ac-glass-bg)',
  backdropFilter: 'blur(var(--ac-blur-panel))',
  WebkitBackdropFilter: 'blur(var(--ac-blur-panel))',
  border: `1px solid var(--ac-glass-border)`,
  boxShadow: `inset 0 1px 0 var(--ac-glass-inset-hi), var(--ac-glass-shadow)`,
  borderRadius: 'var(--ac-radius-card)'
}

export const clayRaised = {
  // 新拟物凸起（选中态）
  boxShadow: `var(--ac-clay-shadow-dark), var(--ac-clay-shadow-light), var(--ac-clay-inset-border, '')`,
  backgroundColor: 'var(--ac-glass-bg-hover)'
}

export const glassButton = {
  backgroundColor: 'var(--ac-glass-bg)',
  backdropFilter: 'blur(var(--ac-blur-card))',
  border: `1px solid var(--ac-glass-border)`,
  boxShadow: `inset 0 1px 0 var(--ac-glass-inset-hi), var(--ac-glass-shadow)`,
  borderRadius: 'var(--ac-radius-button)',
  ':hover': { backgroundColor: 'var(--ac-glass-bg-hover)', transform: 'translateY(-1px)' }
}

export const primaryButton = {
  background: 'linear-gradient(135deg, var(--ac-brand), var(--ac-brand-2))',
  color: '#fff',
  borderRadius: 'var(--ac-radius-button)',
  boxShadow: '0 4px 10px rgba(124,92,240,0.35)',
  ':hover': { transform: 'translateY(-1px)', boxShadow: '0 6px 16px rgba(124,92,240,0.5)' }
}

export const clayChip = {
  backgroundColor: 'color-mix(in srgb, var(--ac-brand) 12%, transparent)',
  color: 'var(--ac-brand)',
  border: '1px solid color-mix(in srgb, var(--ac-brand) 18%, transparent)',
  borderRadius: 'var(--ac-radius-pill)',
  ':hover': { transform: 'translateY(-1px)' }
}
```

> 注：`color-mix(in srgb, ...)` 是现代 CSS，Chromium 111+ 支持，Electron 33 内核足够。

### 4. Fluent 自定义主题（`auroraTheme.ts`）

```ts
import { createLightTheme, createDarkTheme, type BrandVariants } from '@fluentui/react-components'

// 紫粉蓝品牌色阶（Fluent 需要 10 档 shade，10 最浅 / 160 最深）
const auroraBrand: BrandVariants = {
  10: '#faf8ff', 20: '#f0ebff', 30: '#e0d7ff', 40: '#c9b8fd',
  60: '#a78bfa', 80: '#7c5cf0', 100: '#6b4ce0', 120: '#5a3ed0',
  140: '#4a30b8', 160: '#3a2490'
}

export const auroraLightTheme = createLightTheme(auroraBrand)
export const auroraDarkTheme = createDarkTheme(auroraBrand)
```

这会让所有 Fluent 组件（Button primary / Badge tint / Input focus 等）的品牌色自动变紫粉蓝。

### 5. 主题切换（`main.tsx` + `appStore.ts`）

引入三态 `themeMode`，避免手动选择被系统变化覆盖：

```ts
// appStore.ts
type ThemeMode = 'system' | 'light' | 'dark'

themeMode: 'system',                                    // 用户偏好
darkMode: window.matchMedia('(prefers-color-scheme: dark)').matches,  // 实际生效值

setThemeMode: (mode: ThemeMode) => {
  const dark = mode === 'system'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : mode === 'dark'
  useAppStore.setState({ themeMode: mode, darkMode: dark })
},

// 在 main.tsx Root 的 useEffect 里调用一次
initSystemThemeListener: () => {
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

- `TitleBar` 的主题开关：点击时 `setThemeMode(darkMode ? 'light' : 'dark')`（切到显式模式）
- 设置页可加"跟随系统"选项调回 `setThemeMode('system')`
- `main.tsx` 的 `Root` 在 `FluentProvider` 上根据 `darkMode` 切 `auroraLightTheme` / `auroraDarkTheme`，并在根 div 加 `ac-light` / `ac-dark` 类驱动 CSS 变量；`useEffect` 里调用 `initSystemThemeListener`

### 6. 阅读器特殊处理

`ReaderPage.tsx` 的 `viewerArea` / `imageWrap` / `mangaImage` 保持 `#0a0a0a` / `#111111` 深色（不引用 `--ac-*`），确保阅读沉浸不受主题影响。仅 `toolbar` / `navBtn` / `pageIndicator` 改毛玻璃悬浮：

```ts
toolbar: {
  backgroundColor: 'var(--ac-glass-bg)',
  backdropFilter: 'blur(var(--ac-blur-toolbar))',
  borderBottom: '1px solid var(--ac-glass-border)',
  // 浅色主题下文字色用 --ac-text-2，深色用 --ac-text-2（变量自动切）
}
```

### 7. 圆角映射

| 当前代码引用 | 替换为 |
|---|---|
| `tokens.borderRadiusMedium` (4px) | `var(--ac-radius-row)` (12px) |
| `tokens.borderRadiusLarge` (8px) | `var(--ac-radius-card)` (16px) |
| 手写 `borderRadius: '6px'/'8px'` | 按组件查表替换为对应 `--ac-radius-*` |

## 配色规范

### 主色板

| 语义 | 浅色 | 深色 | 用途 |
|---|---|---|---|
| 品牌紫 | `#7c5cf0` | `#a78bfa` | 主按钮、选中态、品牌强调 |
| 浅紫 | `#a78bfa` | `#c4b5fd` | 渐变终点、次要强调 |
| 极光粉 | `#f472b6` | `#f472b6` | 渐变、治愈标签、收藏心形 |
| 极光蓝 | `#60a5fa` | `#60a5fa` | 渐变、链接 |
| 成功绿 | `#34d399` | `#34d399` | 网络正常、连载中标签 |
| 警告琥珀 | `#fbbf24` | `#fbbf24` | 警告、代理状态 |
| 危险粉 | `#ff6b9d` | `#ff6b9d` | 危险/收藏（替代纯红） |

### 极光光晕（三色径向渐变）

浅色更柔和（alpha 0.22-0.28），深色更浓郁（alpha 0.4-0.5）。三个光晕分别位于左上（紫）、右上（粉）、右下（蓝），覆盖整个 body。

### 玻璃底色

| 主题 | 玻璃底 | 玻璃边框 | 内顶高光 |
|---|---|---|---|
| 浅色 | `rgba(255,255,255,0.5)` | `rgba(255,255,255,0.6)` | `rgba(255,255,255,0.9)` |
| 深色 | `rgba(255,255,255,0.06)` | `rgba(255,255,255,0.1)` | `rgba(255,255,255,0.06)` |

### 新拟物阴影（选中态凸起）

| 主题 | 暗投影 | 亮投影 | 内描边 |
|---|---|---|---|
| 浅色 | `3px 3px 7px rgba(150,140,200,0.28)` | `-3px -3px 7px rgba(255,255,255,0.95)` | 无 |
| 深色 | `3px 3px 8px rgba(0,0,0,0.45)` | `-3px -3px 8px rgba(255,255,255,0.06)` | `inset 0 0 0 1px rgba(255,255,255,0.08)` |

## 验收标准

1. `npm run dev` 启动后，主界面呈现极光光晕背景 + 毛玻璃面板 + 大圆角，浅色/深色观感与 mockup 一致
2. 系统切换浅色/深色，应用自动跟随（`prefers-color-scheme`）；手动开关也能切
3. 所有卡片 hover 上浮 + 投影加深；选中导航项呈新拟物凸起
4. 主按钮紫粉渐变 + 彩色投影；标签 chip 半透明彩色
5. 阅读器阅读区始终深色沉浸，工具栏毛玻璃悬浮，不受主题切换影响
6. 登录对话框毛玻璃模态 + 极光透出 + 输入框内凹
7. 所有圆角符合规范表（窗口28/面板24/卡片16/按钮14/行项12/封面14/序号10/胶囊99）
8. 无功能回归：导航、搜索、分类、详情、阅读、收藏、下载、设置全部正常工作
9. `npm run build` 无 TypeScript 错误
