# WinUI Fluent Visual Refresh Implementation Plan

> **For implementation:** Execute tasks in order, one task at a time, following the test-driven-development skill; keep the checkbox (`- [ ]`) list updated, and verify each task before moving on.

**Goal:** Replace Aurora Clay styling with a restrained WinUI/Fluent workbench visual system while preserving routes, state, IPC, reader behavior, and all business logic.

**Architecture:** Introduce one neutral Fluent theme and one semantic surface-style module, then migrate the shell and shared components before page-specific styles. The reader image component, virtualizer, page order, and descramble math are outside this plan; only reader chrome may consume the new tokens.

**Tech Stack:** React 18, Fluent UI React v9, Griffel `makeStyles`, CSS custom properties, Electron Mica.

## Global Constraints

- Do not change Zustand state transitions, IPC calls, page routes, chapter order, or image URLs.
- Do not change `DescrambledImage`, `getNum`, MD5, canvas coordinates, or the download descrambler.
- Keep Mica support; ordinary content surfaces must not use `backdrop-filter`.
- Use one Windows-blue brand ramp, neutral semantic tokens, 4/6/8px radii, and 100–160ms color/opacity transitions.
- Run `imageCorrectnessContract.test.ts` before and after every renderer batch.

---

### Task 1: Establish the WinUI visual contract and theme

**Files:**
- Create: `src/renderer/src/theme/winuiTheme.ts`
- Create: `src/renderer/src/theme/surfaceStyles.ts`
- Create: `src/main/__tests__/winuiVisualContract.test.ts`
- Modify: `src/renderer/src/main.tsx`
- Modify: `src/renderer/src/assets/global.css`

**Interfaces:**
- Produces `winuiLightTheme`, `winuiDarkTheme`, `appSurface`, `flatCard`, `flatToolbar`, and semantic `--ui-*` CSS tokens.
- Existing pages continue to use FluentProvider and the current light/dark store values.

- [ ] **Step 1: Write the failing contract test**

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const theme = readFileSync('src/renderer/src/theme/winuiTheme.ts', 'utf8')
const surfaces = readFileSync('src/renderer/src/theme/surfaceStyles.ts', 'utf8')
assert.match(theme, /winuiLightTheme/)
assert.match(theme, /winuiDarkTheme/)
assert.doesNotMatch(surfaces, /backdropFilter|radial-gradient|brand-glow/)
assert.match(surfaces, /var\(--ui-stroke-card\)/)
```

- [ ] **Step 2: Run red**

Run: `npx tsx src/main/__tests__/winuiVisualContract.test.ts`

Expected: module/file-not-found for the new theme files.

- [ ] **Step 3: Implement the theme and semantic surfaces**

Use a Fluent brand ramp centered on Windows blue `#0f6cbd`. Define neutral background, stroke, text, status, radius, and motion tokens in `.ui-light` and `.ui-dark`. Implement `appSurface`, `flatCard`, and `flatToolbar` with opaque/low-transparency backgrounds and 1px strokes; no blur, gradients, glow, or hover translation.

- [ ] **Step 4: Switch the root provider and verify green**

Replace the Aurora theme imports in `main.tsx`, rename root classes to `ui-light`/`ui-dark`, run the target test, `imageCorrectnessContract.test.ts`, and `npm run build`.

- [ ] **Step 5: Commit**

```powershell
git add src/renderer/src/theme/winuiTheme.ts src/renderer/src/theme/surfaceStyles.ts src/renderer/src/main.tsx src/renderer/src/assets/global.css src/main/__tests__/winuiVisualContract.test.ts
git commit -m "style: 建立 WinUI Fluent 视觉基础"
```

### Task 2: Rebuild the application shell

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/TitleBar.tsx`
- Modify: `src/main/__tests__/winuiVisualContract.test.ts`

**Interfaces:**
- Consumes semantic `--ui-*` tokens and surface styles.
- Preserves `PageId`, `navItems`, `pageComponents`, network status, title-bar window controls, and download indicators.

- [ ] **Step 1: Add failing shell assertions**

Assert that `App.tsx` contains a 2px active indicator and does not import `clayStyles`; assert that `TitleBar.tsx` has no `backdropFilter` or `borderRadius: '999px'`.

- [ ] **Step 2: Run red**

Run the visual contract test and expect the shell assertions to fail.

- [ ] **Step 3: Implement the flat shell**

Use a 208px navigation pane, 36px title bar, neutral background, 2px left active indicator, 8px nav radius, and color-only 120ms interaction states. Remove page rise animation and glass status bar; keep status text and icons.

- [ ] **Step 4: Verify**

Run the visual contract test, correctness contract, and production build. Launch the app in light and dark mode and confirm keyboard focus remains visible on every navigation item.

- [ ] **Step 5: Commit**

```powershell
git add src/renderer/src/App.tsx src/renderer/src/components/TitleBar.tsx src/main/__tests__/winuiVisualContract.test.ts
git commit -m "style: 重构 WinUI 应用壳层"
```

### Task 3: Flatten shared content components

**Files:**
- Modify: `src/renderer/src/components/MangaCard.tsx`
- Modify: `src/renderer/src/components/LoginDialog.tsx`
- Modify: `src/renderer/src/components/ChapterSelectDialog.tsx`
- Modify: `src/main/__tests__/winuiVisualContract.test.ts`

**Interfaces:**
- `MangaCardData` and every component prop remain unchanged.

- [ ] **Step 1: Add failing component assertions**

Assert that MangaCard has no `translateY`, image zoom, or blur; dialogs must use `--ui-bg-dialog` and `--ui-stroke-card`.

- [ ] **Step 2: Run red**

Expected: assertions fail against current hover movement and glass dialog styles.

- [ ] **Step 3: Implement restrained shared components**

Keep fixed 3:4 cover sizing, replace shadows with strokes, use opacity/background hover only, retain the favorite button and keyboard behavior, and use 8px dialog corners.

- [ ] **Step 4: Verify and commit**

Run the visual test, correctness contract, and build; then commit as `style: 平面化公共内容组件`.

### Task 4: Migrate content pages and reader chrome

**Files:**
- Modify: `src/renderer/src/pages/HomePage.tsx`
- Modify: `src/renderer/src/pages/CategoriesPage.tsx`
- Modify: `src/renderer/src/pages/SearchPage.tsx`
- Modify: `src/renderer/src/pages/FavoritesPage.tsx`
- Modify: `src/renderer/src/pages/DownloadsPage.tsx`
- Modify: `src/renderer/src/pages/SettingsPage.tsx`
- Modify: `src/renderer/src/pages/MangaDetailPage.tsx`
- Modify only styles above `DescrambledImage`: `src/renderer/src/pages/ReaderPage.tsx`
- Modify: `src/main/__tests__/winuiVisualContract.test.ts`

**Interfaces:**
- Page component exports and all data operations remain unchanged.
- Reader toolbar/page controls may change style; reader content markup and math may not.

- [ ] **Step 1: Add failing forbidden-style scan**

Scan migrated files for `--ac-glass`, `--ac-clay`, `radial-gradient`, `brand-glow`, and hover `translateY`; list any remaining references in the failure output.

- [ ] **Step 2: Run red**

Expected: the scan reports current Aurora references.

- [ ] **Step 3: Migrate pages in two reviewable batches**

Batch A: Home, Categories, Search, Favorites. Batch B: Downloads, Settings, Detail, reader chrome. Use consistent 24px page padding, 4px spacing rhythm, compact list rows, neutral status surfaces, and Fluent semantic colors.

- [ ] **Step 4: Visual verification**

Capture light/dark screenshots for Home, Detail, Downloads, Settings, and Reader at 1500×900. Confirm no clipping at 1100×700, visible focus rings, stable 3:4 covers, and no changes to reader image layout.

- [ ] **Step 5: Remove retired Aurora modules**

Delete `auroraTheme.ts` and `clayStyles.ts` only after `rg -n 'auroraTheme|clayStyles|--ac-glass|--ac-clay' src/renderer/src` returns no references outside immutable reader-specific tokens.

- [ ] **Step 6: Full verification and commit**

Run all main tests, the correctness contract, `npm run build`, `git diff --check`, and commit as `style: 完成 WinUI Fluent 页面重构`.

