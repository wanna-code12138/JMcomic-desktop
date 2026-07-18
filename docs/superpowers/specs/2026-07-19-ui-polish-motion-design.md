# 界面体检修复 + 动效增强 设计稿

日期：2026-07-19
分支：`feat/ui-polish-motion`
状态：已获用户批准（2026-07-19）

## 背景

全面体检渲染层代码（8 页面 + 6 组件 + 主题体系）后确认三档问题：
显示正确性（P0）、阅读体验（P1）、质感反馈（P2 选定项）。
用户确认范围：**P0 全部 + P1 全部 + P2 的页面过渡/图片淡入/收藏钮可达性 + 动效加强**。
关键决策：① 阅读器固定深色沉浸底（浅色主题下阅读区也是深色）；② 动效走纯 CSS，不新增依赖。

## 一、P0 正确性修复

| # | 改动 | 位置 | 方案 |
|---|------|------|------|
| 1 | 首页 Tab 过滤 | `pages/HomePage.tsx:248` | homepage 接口返回 `{recommended, latest, popular}` 三分组，当前被 merge 成单一列表导致三个 Tab 内容相同。改为按 `tab` 状态渲染对应分组；`__random__` 卡片的随机池仍用 merge 后全集 |
| 2 | 详情页标签色 | `pages/MangaDetailPage.tsx:55` | `tagBadge` 硬编码 `#7c5cf0` → `var(--ac-brand)`，文字保持白色 |
| 3 | 状态栏图标色 | `App.tsx:184-186` | Fluent tokens（`colorStatusSuccess/Warning/DangerForeground1`）→ `--ac-green/--ac-amber/--ac-danger` |
| 4 | 生产日志 | `pages/ReaderPage.tsx:357` | 删除 `console.log('[descramble]', ...)` |
| 5 | 死代码 | `components/NavigationView.tsx` | 整文件删除（无引用，barrel 未导出） |

## 二、阅读器深色沉浸 + 虚拟化

### 2.1 深色沉浸

- 新增 token（`global.css` `:root`，不随 `.ac-light/.ac-dark` 变化）：
  - `--ac-reader-bg: #0b0b14`（阅读区实底）
  - `--ac-reader-glass-bg: rgba(255,255,255,0.08)`、`--ac-reader-glass-border: rgba(255,255,255,0.12)`（悬浮件深色玻璃）
  - `--ac-reader-text-1: #e8e8f8`、`--ac-reader-text-2: #b4b4d0`
- `ReaderPage`：
  - `root` 背景 → 不透明 `var(--ac-reader-bg)`，去掉 `backdrop-filter`
  - `viewerArea`/`imageWrap` → 透明或实底，去掉 `backdrop-filter`（解决大面积 blur 的 GPU 开销）
  - `toolbar`/`navBtn`/`pageIndicator` → 改用 reader 玻璃 token，保持毛玻璃悬浮
  - 文字色 `--ac-text-*` → `--ac-reader-text-*`

### 2.2 滚动模式虚拟化

- 使用已有依赖 `@tanstack/react-virtual` 的 `useVirtualizer`，scroll 元素为 `viewerRef`
- `estimateSize`：`viewer宽度 × 1.5 + gap`（漫画典型宽高比 2:3）
- 每个虚拟行挂 `measureElement` ref，图片加载完成/反打乱后高度变化自动实测修正
- `overscan: 3`
- 续读定位：现有"数学估算 scrollTop"改为 `virtualizer.scrollToIndex(resumePageIndex)`
- 当前页码推算：`handleScroll` 改为取虚拟行列表中第一个可见行索引（替代 scrollTop/maxScroll 比例法）

## 三、动效体系（纯 CSS）

| 动效 | 实现 | 位置 |
|------|------|------|
| 页面切换过渡 | `pageArea` 内包一层 `<div key={currentPage}>`，keyframes `ac-page-enter`：opacity 0→1 + translateY(8px)→0，220ms ease-out | `App.tsx:226`、`global.css` |
| 卡片网格 stagger | `MangaCard` 接受可选 `index` prop，容器加 `ac-card-enter` 动画 + `animationDelay: min(index,12) * 30ms` | `components/MangaCard.tsx` |
| 卡片 hover 精修 | 图片 `transform: scale(1.03)`（transition 200ms）+ 阴影加深；`imageWrap` overflow hidden 已有 | `MangaCard.tsx` |
| 图片加载淡入 | `onLoad` 置 loaded state，opacity 0→1 transition 250ms；应用于 MangaCard 封面、详情页封面、阅读器 DescrambledImage（canvas 显示时同步淡入） | 三处 |
| 按压反馈 | 可点元素 `:active { transform: scale(0.97) }`：navItem、chip、章节项、卡片 | 各处样式 |
| 动效兜底 | `@media (prefers-reduced-motion: reduce)` 内关闭全部 `ac-*` 动画与 transition | `global.css` |

### 收藏钮可达性（MangaCard）

- 显示条件：`hovered || liked || 卡片:focus-within`（mergeClasses 组合 `:focus-within` 样式）
- `tabIndex` 从 -1 改为 0，Enter 触发收藏切换

## 四、明确不做

- 不引入 framer-motion 等动画库（纯 CSS 足够）
- 不动下载页空壳、状态栏增强、设置页假控件（P3，另行立项）
- 不做超宽屏网格上限、导航折叠（P4）
- 不改阅读器翻页/缩放交互逻辑（ZoomableImage 不动）

## 五、验收标准

1. 首页三个 Tab 各显示对应分组内容，且互不重复
2. 深色主题下详情页标签与品牌色一致；状态栏网络图标三色正确
3. 浅色主题下阅读器为深色沉浸底，无 Aurora 透出；滚动流畅（长章节 DOM 节点数受控）
4. 滚动虚拟化后图片显示正确、反打乱正常、续读定位正确、页码指示正确
5. 页面切换/卡片入场/图片淡入/hover/按压动效生效；系统开"减少动画"后全部静止
6. 键盘 Tab 到卡片时收藏钮可见且 Enter 可切换收藏
7. `npm run build` 通过
