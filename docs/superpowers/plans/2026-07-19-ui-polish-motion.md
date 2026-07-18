# 界面体检修复 + 动效增强 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复界面显示正确性问题（P0），阅读器深色沉浸 + 滚动虚拟化（P1），并建立纯 CSS 动效体系（页面过渡 / 卡片 stagger / 图片淡入 / 按压反馈）。

**Architecture:** 设计稿见 `docs/superpowers/specs/2026-07-19-ui-polish-motion-design.md`。全部改动在 `src/renderer/src` 内，不动主进程。动效为纯 CSS keyframes/transitions，keyframes 集中定义在 `global.css`。阅读器新增独立深色 token（不随浅深主题切换）。

**Tech Stack:** Electron + React 18 + Fluent UI v9 (Griffel makeStyles) + Tailwind + zustand + @tanstack/react-virtual（已在依赖中）。

## Global Constraints

- 不新增任何 npm 依赖
- 不改主进程 / preload / IPC
- 不改配置文件（package.json、tsconfig、electron.vite.config.ts 等）
- 不写注释（除非原有注释风格需要保留的除外）
- 项目无测试框架：每个任务的验证命令为 `npx tsc --noEmit`（期望无输出退出码 0）；最终任务跑 `npm run build`
- 设计 token 一律使用 `--ac-*` CSS 变量，禁止再引入 Fluent `tokens.*` 颜色引用
- 工作分支 `feat/ui-polish-motion`，每个任务完成后 commit（中文简述）

---

### Task 1: P0 杂项修复包

**Files:**
- Modify: `src/renderer/src/App.tsx:1-24, 182-196`
- Modify: `src/renderer/src/pages/MangaDetailPage.tsx:54-63`
- Modify: `src/renderer/src/pages/ReaderPage.tsx:355-358`
- Delete: `src/renderer/src/components/NavigationView.tsx`

**Interfaces:**
- Consumes: 无
- Produces: 无（纯修复，不产生新接口）

四处独立修复，一个 commit：

1. `App.tsx` 状态栏网络图标颜色从 Fluent tokens 改为 `--ac-*` 变量
2. `MangaDetailPage.tsx` tagBadge 硬编码 `#7c5cf0` 改为 `var(--ac-brand)`
3. `ReaderPage.tsx` 删除 `console.log('[descramble]', ...)`
4. 删除死代码 `NavigationView.tsx`（barrel `components/index.ts` 未导出它，无需改导出）

- [ ] **Step 1: 修 App.tsx 状态栏图标颜色**

`App.tsx` 顶部 import 中删除 `tokens`（第 2-6 行）：

```tsx
import {
  makeStyles,
  mergeClasses
} from '@fluentui/react-components'
```

`networkIcon` 函数（182-188 行）改为：

```tsx
  const networkIcon = () => {
    switch (networkStatus) {
      case 'online': return <Wifi3Regular style={{ color: 'var(--ac-green)' }} />
      case 'degraded': return <Wifi1Regular style={{ color: 'var(--ac-amber)' }} />
      default: return <WifiOff20Regular style={{ color: 'var(--ac-danger)' }} />
    }
  }
```

- [ ] **Step 2: 修 MangaDetailPage.tsx tagBadge**

`useStyles` 中 `tagBadge`（54-63 行）改为：

```ts
  tagBadge: {
    backgroundColor: 'var(--ac-brand)',
    color: '#ffffff',
    cursor: 'pointer',
    transition: 'transform 0.15s, background-color 0.15s',
    ':hover': {
      transform: 'translateY(-1px)',
      opacity: 0.9
    }
  },
```

- [ ] **Step 3: 删 ReaderPage.tsx console.log**

删除第 357 行（`handleLoad` 内）：

```tsx
    console.log('[descramble]', { aid, filename, scrambleId, c, w, h, src })
```

- [ ] **Step 4: 删 NavigationView.tsx**

```bash
git rm src/renderer/src/components/NavigationView.tsx
```

- [ ] **Step 5: 验证类型**

Run: `npx tsc --noEmit`
Expected: 无输出，退出码 0（若报 `tokens` 未使用等错误，检查 Step 1 的 import 是否删干净）

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix: P0杂项修复——状态栏图标色/详情页标签色统一ac变量，删死代码与调试日志"
```

---

### Task 2: 首页 Tab 分组过滤

**Files:**
- Modify: `src/renderer/src/pages/HomePage.tsx:98-116, 145-174, 246-252`

**Interfaces:**
- Consumes: `window.electronAPI.contentHomepage()` 返回 `{ ok, data: { recommended: MangaCardData[]; latest: MangaCardData[]; popular: MangaCardData[] }, ... }`
- Produces: 无

现状：`allCards` 把三个分组 merge 成一个列表，三个 Tab 显示相同内容。改为：按 tab 渲染对应分组；merge 后的全集仅作为「随便看」卡片的随机池保留。

- [ ] **Step 1: 新增 sections state**

`HomePage` 组件内，`allCards` 声明（第 104 行）下方新增：

```tsx
  const [sections, setSections] = React.useState<{
    recommended: MangaCardData[]
    latest: MangaCardData[]
    popular: MangaCardData[]
  }>({ recommended: [], latest: [], popular: [] })
```

- [ ] **Step 2: load() 中保存分组**

`load()` 里 `setAllCards(merged)` 之后（约 165 行）新增：

```tsx
          setSections({
            recommended: data.recommended || [],
            latest: data.latest || [],
            popular: data.popular || []
          })
```

- [ ] **Step 3: 渲染按 tab 过滤**

第 246-252 行的网格渲染改为：

```tsx
      ) : (
        <div className={styles.grid}>
          {[RANDOM_CARD, ...sections[tab]].map((m) => (
            <MangaCard key={m.id} manga={m} onClick={handleCardClick} />
          ))}
        </div>
      )}
```

（`allCards` 保留：`handleCardClick` 的随机池与空态判断仍用它。）

- [ ] **Step 4: 验证类型**

Run: `npx tsc --noEmit`
Expected: 无输出

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/pages/HomePage.tsx
git commit -m "fix: 首页Tab按分组过滤，推荐/最新/热门各显示对应内容"
```

---

### Task 3: 动效基础设施 + 页面切换过渡

**Files:**
- Modify: `src/renderer/src/assets/global.css`（文件末尾追加）
- Modify: `src/renderer/src/App.tsx:99-110, 224-229`

**Interfaces:**
- Consumes: 无
- Produces: keyframes `ac-page-enter`、`ac-card-enter`（后续 Task 4 使用 `ac-card-enter`）；reduced-motion 全局兜底

- [ ] **Step 1: global.css 末尾追加 keyframes 与动效兜底**

```css
/* ===== Motion ===== */
@keyframes ac-page-enter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes ac-card-enter {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 2: App.tsx 加 pageEnter 样式**

`useStyles` 中 `pageArea`（106-110 行）下方新增：

```ts
  pageEnter: {
    height: '100%',
    animation: 'ac-page-enter 0.22s ease-out'
  },
```

- [ ] **Step 3: App.tsx 包一层 key 化容器**

第 226-228 行改为：

```tsx
          <div className={styles.pageArea}>
            <div key={currentPage} className={styles.pageEnter}>
              <ActivePage />
            </div>
          </div>
```

- [ ] **Step 4: navItem 按压反馈**

`useStyles` 中 `navItem`（66-82 行）的 transition 加 transform，并新增 `:active`：

```ts
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
    transition: 'background-color 0.15s ease, box-shadow 0.15s ease, color 0.15s ease, transform 0.15s ease',
    textDecoration: 'none',
    ':hover': {
      backgroundColor: 'var(--ac-glass-bg-hover)',
      color: 'var(--ac-text-2)'
    },
    ':active': {
      transform: 'scale(0.97)'
    }
  },
```

- [ ] **Step 5: 验证类型**

Run: `npx tsc --noEmit`
Expected: 无输出

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/assets/global.css src/renderer/src/App.tsx
git commit -m "feat: 动效基础设施+页面切换过渡+导航按压反馈"
```

---

### Task 4: MangaCard 淡入 / hover 精修 / stagger / 收藏钮可达性

**Files:**
- Modify: `src/renderer/src/components/MangaCard.tsx:32-97, 109-181`
- Modify: `src/renderer/src/pages/HomePage.tsx`（网格 map 传 index，Task 2 已改的那一段）
- Modify: `src/renderer/src/pages/CategoriesPage.tsx:395-399`
- Modify: `src/renderer/src/pages/SearchPage.tsx:354-358`
- Modify: `src/renderer/src/pages/FavoritesPage.tsx:168-172`

**Interfaces:**
- Consumes: keyframes `ac-card-enter`（Task 3）
- Produces: `MangaCard` 新增可选 prop `index?: number`（用于入场 stagger）；调用方按 `map((m, i) => <MangaCard index={i} ... />)` 传参

- [ ] **Step 1: MangaCard 样式改造**

`useStyles` 整体替换为：

```ts
const useStyles = makeStyles({
  card: {
    cursor: 'pointer',
    transition: 'transform 0.18s ease, box-shadow 0.18s ease',
    ':hover': {
      transform: 'translateY(-3px)',
      boxShadow: '0 8px 20px var(--ac-glass-shadow)'
    },
    ':active': {
      transform: 'translateY(-3px) scale(0.97)'
    }
  },
  cardEnter: {
    animation: 'ac-card-enter 0.3s ease-out both'
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
    backgroundColor: 'var(--ac-base-bg)',
    opacity: 0,
    transition: 'opacity 0.25s ease, transform 0.2s ease'
  },
  cardImageLoaded: {
    opacity: 1
  },
  cardImageHover: {
    transform: 'scale(1.03)'
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
    },
    ':focus': {
      opacity: 1
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

- [ ] **Step 2: MangaCard 组件逻辑改造**

组件签名改为（新增 `index` prop 与 `imgLoaded` state）：

```tsx
export default function MangaCard({ manga, onClick, index }: { manga: MangaCardData; onClick?: (id: string) => void; index?: number }): JSX.Element {
  const styles = useStyles()
  const setCurrentMangaId = useAppStore((s) => s.setCurrentMangaId)

  const [liked, setLiked] = React.useState(false)
  const [hovered, setHovered] = React.useState(false)
  const [imgLoaded, setImgLoaded] = React.useState(false)
```

JSX 的 card 容器与 imageWrap 部分改为：

```tsx
  return (
    <div
      className={mergeClasses(styles.card, index !== undefined && styles.cardEnter)}
      style={index !== undefined ? { animationDelay: `${Math.min(index, 12) * 30}ms` } : undefined}
      role="button"
      tabIndex={0}
      onClick={() => onClick ? onClick(manga.id) : setCurrentMangaId(manga.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick ? onClick(manga.id) : setCurrentMangaId(manga.id) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={styles.imageWrap}>
        <img
          className={mergeClasses(styles.cardImage, imgLoaded && styles.cardImageLoaded, hovered && styles.cardImageHover)}
          src={toJmImg(manga.coverUrl)}
          alt={manga.title}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
        />
        <div
          className={mergeClasses(styles.favBtn, (hovered || liked) && styles.favBtnVisible)}
          onClick={handleFavClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); void handleFavClick(e as unknown as React.MouseEvent) } }}
        >
          {liked ? <Heart20Filled style={{ color: '#ff4d4f' }} /> : <Heart20Regular />}
        </div>
      </div>
      <div className={styles.cardTitle}>{manga.title}</div>
      <div className={styles.cardMeta}>
        {manga.author ? manga.author : ''}
        {manga.latestChapter ? ` · ${manga.latestChapter}` : ''}
      </div>
    </div>
  )
```

注意：`handleFavClick` 内部已 `e.stopPropagation()`，键盘路径手动 stopPropagation 防止触发卡片跳转。

- [ ] **Step 3: 四处调用方传 index**

`HomePage.tsx` 网格（Task 2 改后）：

```tsx
          {[RANDOM_CARD, ...sections[tab]].map((m, i) => (
            <MangaCard key={m.id} manga={m} onClick={handleCardClick} index={i} />
          ))}
```

`CategoriesPage.tsx:395-399`：

```tsx
          <div className={styles.grid}>
            {results.map((m, i) => (
              <MangaCard key={m.id} manga={m} index={i} />
            ))}
          </div>
```

`SearchPage.tsx:354-358`：

```tsx
          <div className={styles.grid}>
            {results.map((m, i) => (
              <MangaCard key={m.id} manga={m} index={i} />
            ))}
          </div>
```

`FavoritesPage.tsx:168-172`：

```tsx
          <div className={styles.grid}>
            {localFav.map((f, i) => (
              <MangaCard key={f.manga_id} manga={{ id: f.manga_id, title: f.title, coverUrl: f.cover_url }} index={i} />
            ))}
          </div>
```

- [ ] **Step 4: 验证类型**

Run: `npx tsc --noEmit`
Expected: 无输出

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/MangaCard.tsx src/renderer/src/pages/HomePage.tsx src/renderer/src/pages/CategoriesPage.tsx src/renderer/src/pages/SearchPage.tsx src/renderer/src/pages/FavoritesPage.tsx
git commit -m "feat: 卡片淡入/hover缩放/入场stagger/收藏钮键盘可达"
```

---

### Task 5: 详情页封面淡入 + 章节项/chip 按压反馈

**Files:**
- Modify: `src/renderer/src/pages/MangaDetailPage.tsx:36-37, 78-90, 216-223`
- Modify: `src/renderer/src/pages/CategoriesPage.tsx:54-73`
- Modify: `src/renderer/src/pages/SearchPage.tsx:83-100`

**Interfaces:**
- Consumes: 无（`ac-*` 动画不依赖本任务新增 keyframes）
- Produces: 无

- [ ] **Step 1: 详情页封面淡入**

`MangaDetailPage.tsx` 的 `cover` 样式（37 行）改为：

```ts
  cover: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
    opacity: 0,
    transition: 'opacity 0.25s ease'
  },
  coverLoaded: {
    opacity: 1
  },
```

组件内新增 state（其他 state 声明附近）：

```tsx
  const [coverLoaded, setCoverLoaded] = React.useState(false)
```

封面 img（218 行）改为：

```tsx
            <img
              className={`${styles.cover} ${coverLoaded ? styles.coverLoaded : ''}`}
              src={toJmImg(manga.coverUrl)}
              alt={manga.title}
              onLoad={() => setCoverLoaded(true)}
            />
```

换漫画时应重置：`currentMangaId` 变化的 useEffect 里 `setLoading(true)` 下方加 `setCoverLoaded(false)`（即 146-147 行 `setLoading(true)` 之后）。

- [ ] **Step 2: 章节项按压反馈**

`chapterItem`（78-90 行）的 transition 加 transform，新增 `:active`：

```ts
  chapterItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 16px',
    borderRadius: 'var(--ac-radius-row)',
    cursor: 'pointer',
    transition: 'background-color 0.15s, box-shadow 0.15s, transform 0.15s',
    gap: '12px',
    ':hover': {
      backgroundColor: 'var(--ac-glass-bg-hover)',
      boxShadow: 'inset 0 0 0 1px var(--ac-glass-border)'
    },
    ':active': {
      transform: 'scale(0.97)'
    }
  },
```

- [ ] **Step 3: 分类页 tagChip 按压反馈**

`CategoriesPage.tsx` 的 `tagChip`（54-73 行）transition 不变（已含 transform），末尾新增 `:active`：

```ts
    ':active': {
      transform: 'scale(0.97)'
    }
```

（`tagChip` 原有 `:hover` 里也有 transform，`:active` 优先级覆盖 hover 位移，符合预期。）

- [ ] **Step 4: 搜索页 history chip 按压反馈**

`SearchPage.tsx` 的 `chip`（83-100 行）末尾新增：

```ts
    ':active': {
      transform: 'scale(0.97)'
    }
```

- [ ] **Step 5: 验证类型**

Run: `npx tsc --noEmit`
Expected: 无输出

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/pages/MangaDetailPage.tsx src/renderer/src/pages/CategoriesPage.tsx src/renderer/src/pages/SearchPage.tsx
git commit -m "feat: 详情页封面淡入+章节项与chip按压反馈"
```

---

### Task 6: 阅读器深色沉浸

**Files:**
- Modify: `src/renderer/src/assets/global.css`（`:root` 块内追加 reader token）
- Modify: `src/renderer/src/pages/ReaderPage.tsx:13-140, 583-693`

**Interfaces:**
- Consumes: 无
- Produces: reader 专用 token：`--ac-reader-bg`、`--ac-reader-glass-bg`、`--ac-reader-glass-bg-hover`、`--ac-reader-glass-border`、`--ac-reader-text-1/2/3`（Task 7 继续在同一文件工作，不依赖 token 名称之外的东西）

- [ ] **Step 1: global.css `:root` 块内追加 reader token**

在 `:root { ... }` 内 `--ac-blur-toolbar: 14px;` 之后追加：

```css
  /* 阅读器沉浸深色（不随浅深主题切换） */
  --ac-reader-bg: #0b0b14;
  --ac-reader-glass-bg: rgba(255, 255, 255, 0.08);
  --ac-reader-glass-bg-hover: rgba(255, 255, 255, 0.14);
  --ac-reader-glass-border: rgba(255, 255, 255, 0.12);
  --ac-reader-text-1: #e8e8f8;
  --ac-reader-text-2: #b4b4d0;
  --ac-reader-text-3: #8a8aa8;
```

- [ ] **Step 2: ReaderPage useStyles 改造**

`useStyles` 整体替换为：

```ts
const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: 'var(--ac-reader-bg)',
    color: 'var(--ac-reader-text-1)',
    position: 'relative',
    userSelect: 'none'
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    height: `${TOOLBAR_HEIGHT}px`,
    padding: '0 12px',
    gap: '8px',
    backgroundColor: 'var(--ac-reader-glass-bg)',
    backdropFilter: 'blur(var(--ac-blur-toolbar))',
    WebkitBackdropFilter: 'blur(var(--ac-blur-toolbar))',
    zIndex: 10,
    flexShrink: 0,
    borderBottom: '1px solid var(--ac-reader-glass-border)'
  },
  toolbarTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--ac-reader-text-2)',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  toolbarInfo: {
    fontSize: '12px',
    color: 'var(--ac-reader-text-3)'
  },
  viewerArea: {
    flex: 1,
    overflow: 'auto',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
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
    justifyContent: 'center'
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
    backgroundColor: 'var(--ac-reader-glass-bg)',
    backdropFilter: 'blur(var(--ac-blur-card))',
    WebkitBackdropFilter: 'blur(var(--ac-blur-card))',
    border: '1px solid var(--ac-reader-glass-border)',
    borderRadius: 'var(--ac-radius-button)',
    cursor: 'pointer',
    color: 'var(--ac-reader-text-2)',
    opacity: 0.4,
    transition: 'opacity 0.2s',
    ':hover': {
      opacity: 1,
      backgroundColor: 'var(--ac-reader-glass-bg-hover)'
    }
  },
  navLeft: { left: '16px' },
  navRight: { right: '16px' },
  pageIndicator: {
    position: 'absolute',
    bottom: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'var(--ac-reader-glass-bg)',
    backdropFilter: 'blur(var(--ac-blur-card))',
    WebkitBackdropFilter: 'blur(var(--ac-blur-card))',
    border: '1px solid var(--ac-reader-glass-border)',
    color: 'var(--ac-reader-text-2)',
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
    color: 'var(--ac-reader-text-3)'
  }
})
```

- [ ] **Step 3: 工具栏按钮与调试文字颜色**

工具栏三个按钮的 `style={{ color: 'var(--ac-text-2)' }}`（返回按钮 588 行、模式切换 605 行、下载 612 行）全部改为：

```tsx
style={{ color: 'var(--ac-reader-text-2)' }}
```

模式切换按钮的激活色 `'var(--ac-brand)'` 保持不变。

加载/错误态的两处 `<pre>` 内联色 `color: '#666'`（634、640 行）改为：

```tsx
color: 'var(--ac-reader-text-3)'
```

- [ ] **Step 4: DescrambledImage 加载淡入**

`DescrambledImage` 组件内新增：

```tsx
  const [loaded, setLoaded] = React.useState(false)

  React.useEffect(() => { setLoaded(false) }, [src])
```

`handleLoad` 末尾（两个分支都会执行到）加 `setLoaded(true)`；`c === 0` 分支补一行 `img.style.display = 'block'`（修复单页模式下前一张为打乱图时本图不显示的隐患）：

```tsx
    if (c === 0) {
      canvas.style.display = 'none'
      img.style.display = 'block'
      img.style.visibility = 'visible'
      setLoaded(true)
      return
    }
```

（打乱分支在 `canvas.style.display = 'block'` 之后同样加 `setLoaded(true)`。）

img 与 canvas 的 style 各加淡入：

```tsx
        style={{ ...style, display: 'block', visibility: scrambleId === 0 ? 'visible' : 'hidden', opacity: loaded ? 1 : 0, transition: 'opacity 0.25s ease' }}
```

```tsx
        style={{ ...style, display: 'none', maxWidth: '100%', height: 'auto', opacity: loaded ? 1 : 0, transition: 'opacity 0.25s ease' }}
```

- [ ] **Step 5: 验证类型**

Run: `npx tsc --noEmit`
Expected: 无输出

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/assets/global.css src/renderer/src/pages/ReaderPage.tsx
git commit -m "feat: 阅读器固定深色沉浸底，悬浮件改深色玻璃，页面图片淡入"
```

---

### Task 7: 阅读器滚动模式虚拟化

**Files:**
- Modify: `src/renderer/src/pages/ReaderPage.tsx:1-9, 417-570, 642-658`

**Interfaces:**
- Consumes: `@tanstack/react-virtual` 的 `useVirtualizer`（package.json 已有依赖 `^3.11.0`）
- Produces: 无

现状：滚动模式 `pages.map` 全量渲染所有页（每张图还带一个 canvas 副本），长章节 DOM 爆炸。改为 `useVirtualizer` 窗口化渲染。

- [ ] **Step 1: 引入 useVirtualizer**

`ReaderPage.tsx` 顶部 import 区（第 2 行后）新增：

```tsx
import { useVirtualizer } from '@tanstack/react-virtual'
```

- [ ] **Step 2: 组件内创建 virtualizer**

`ReaderPage` 组件内，`const viewerRef = React.useRef<HTMLDivElement>(null)`（426 行）之后新增：

```tsx
  const virtualizer = useVirtualizer({
    count: pages.length,
    getScrollElement: () => viewerRef.current,
    estimateSize: () => (viewerRef.current?.clientWidth ?? 800) * 1.5 + 4,
    overscan: 3,
    paddingStart: 16,
    scrollPaddingEnd: 16
  })
```

- [ ] **Step 3: 页码推算改用虚拟行**

`handleScroll`（505-516 行）替换为：

```tsx
  const handleScroll = (): void => {
    if (viewMode !== 'scroll') return
    const items = virtualizer.getVirtualItems()
    if (items.length === 0) return
    const first = items[0].index
    if (first !== currentPageRef.current) {
      setCurrentPage(first)
    }
  }
```

- [ ] **Step 4: 续读定位改用 scrollToIndex**

原「数学估算 scrollTop」的 useEffect（546-557 行）替换为：

```tsx
  React.useEffect(() => {
    if (viewMode !== 'scroll') return
    const resume = readerState?.resumePageIndex
    if (!resume || resume <= 0 || pages.length <= 1) return
    virtualizer.scrollToIndex(resume, { align: 'start' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, pages.length, readerState?.resumePageIndex])
```

- [ ] **Step 5: 滚动区渲染改虚拟列表**

滚动模式 JSX（642-658 行）替换为：

```tsx
      ) : viewMode === 'scroll' ? (
        <div className={styles.viewerArea} ref={viewerRef} onScroll={handleScroll}>
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative'
            }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const page = pages[vi.index]
              return (
                <div
                  key={vi.key}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vi.start}px)`,
                    display: 'flex',
                    justifyContent: 'center',
                    paddingBottom: '4px'
                  }}
                >
                  <DescrambledImage
                    className={styles.mangaImage}
                    src={imgSrc(page)}
                    imageUrl={page.imageUrl}
                    alt={`第 ${vi.index + 1} 页`}
                    loading="lazy"
                    scrambleId={scrambleId}
                  />
                </div>
              )
            })}
          </div>
        </div>
      ) : (
```

说明：`estimateSize` 含 +4 间距，行内 `paddingBottom: 4px` 与之对应，`measureElement` 实测后自动修正。原 `scrollMode` 样式不再被引用，从 useStyles 中删除该条目。

- [ ] **Step 6: 验证类型**

Run: `npx tsc --noEmit`
Expected: 无输出（若报 `scrollMode` 未使用，确认已从 useStyles 删除；TS 不检查未使用的样式键，仅确认无类型错误即可）

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/pages/ReaderPage.tsx
git commit -m "perf: 阅读器滚动模式虚拟化，长章节DOM节点受控"
```

---

### Task 8: 全量验证收尾

**Files:**
- 无（仅验证）

**Interfaces:**
- Consumes: Task 1-7 全部
- Produces: 无

- [ ] **Step 1: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无输出，退出码 0

- [ ] **Step 2: 全量构建**

Run: `npm run build`
Expected: electron-vite 三段（main/preload/renderer）构建成功，无 ERROR

- [ ] **Step 3: 人工冒烟清单（执行者在 `npm run dev` 下逐项确认）**

1. 首页三个 Tab 内容互不相同；「随便看」卡片仍在首位
2. 深色主题下详情页标签为亮紫（--ac-brand），浅色为深紫
3. 浅色主题下打开阅读器：阅读区为深色实底，无 Aurora 透出
4. 阅读器滚动模式：快速滚动无全量图片卡顿，页码指示跟随滚动
5. 历史记录续读：能定位到上次页码附近
6. 页面切换有淡入上移过渡；首页/分类/搜索/收藏网格卡片依次入场
7. 封面图加载时淡入；hover 卡片封面轻微放大
8. Tab 键聚焦到卡片时收藏钮可见，Enter 可切换收藏
9. 状态栏网络图标：在线绿 / 代理黄 / 离线红

- [ ] **Step 4: Commit（如有冒烟修复）**

```bash
git add -A
git commit -m "chore: 全量验证与冒烟修复"
```
