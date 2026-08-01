# JMComic Desktop -- Agent Instructions

Electron 33 desktop client for 18comic.vip (Japanese adult manga site). Windows-only, WinUI 3 styling.

## Commands

```powershell
npm run dev          # Dev mode: electron-vite + HMR (also runnable via dev.bat)
npm run build        # Production build (electron-vite build)
npm run package      # Build + portable 单文件 .exe（免安装）
```

Run tests:
```powershell
npx tsx src/main/__tests__/homepageLogic.test.ts
npx tsx src/main/__tests__/homepageStream.test.ts
```
Tests use a hand-rolled `test()` helper + Node `assert` -- **no vitest/jest**. Run with `tsx` directly. A non-zero `process.exitCode` = failure.

## Architecture (must-know)

### Three processes
- **Main** (`src/main/`) -- Electron main process. Window management, IPC handlers, scraper, image proxy, DB.
- **Preload** (`src/preload/index.ts`) -- `contextBridge.exposeInMainWorld('electronAPI', ...)`. All IPC calls go through here.
- **Renderer** (`src/renderer/`) -- React 18 + Fluent UI v9 + Tailwind CSS. Entry: `src/renderer/index.html` -> `src/renderer/src/main.tsx`.

### Path aliases (tsconfig.json)
- `@/*` -> `src/renderer/src/*`
- `@main/*` -> `src/main/*`

### Content extraction: scraperWindow ONLY
**All content comes from a hidden BrowserWindow** (`src/main/scraperWindow.ts`) that loads the full 18comic page and runs `executeJavaScript` to extract DOM data. HTTP + cheerio parsing (`siteAdapter.ts`) does NOT work -- the site requires full JS rendering.

This is the biggest performance bottleneck: **3-15 seconds per page load**.

### ScraperWindow mutex (critical)
The scraperWindow is a **singleton protected by `withScraperLock`**. Two concurrent `loadURL()` calls abort each other -> `ERR_ABORTED`. All extraction functions (`extractHomepage`, `extractSearch`, etc.) go through the lock. Never call `getScraperWindow()` directly for navigation -- use the exported extraction functions.

### Image loading: jmimg:// protocol
Images MUST be loaded through the custom `jmimg://` protocol (`src/main/imageProtocol.ts`). CDN URLs are base64url-encoded into `jmimg://img/<encoded>` paths. The main process proxies the request, adding Referer + Cookie + full User-Agent. **Direct CDN URLs in `<img>` tags will fail** due to Referer/CORS checks.

The scheme must be registered as privileged **before app.ready** (done in `src/main/index.ts`).

### Database: sql.js (SQLite compiled to WASM)
- File: `{userData}/jmcomic.db`
- **Must call `saveDatabase()` after any mutation** -- sql.js works in memory, changes are lost on quit otherwise.
- Reads via `db:get`/`db:all` IPC, writes via `db:run`.
- Tables: `manga_cache`, `reading_history`, `downloads`, `favorites`, `auth`, `search_history`.

### Session warmup
On startup, a small BrowserWindow opens to let the user complete Cloudflare's challenge. `isSessionWarmedUp()` guards content extraction -- scraping won't work until the session is warmed.

### Window chrome
- Frameless with custom titlebar (`TitleBar.tsx`).
- **Mica material** background (`setBackgroundMaterial('mica')`). Do NOT set `transparent: true` -- it disables Win11 rounded corners and Snap.
- Caption buttons use `titleBarOverlay` with transparent background.

### CSP
In `src/renderer/index.html`: `img-src 'self' data: https: jmimg:`. If adding new image sources update this.

## Key constraints

- **Windows-only** -- `setBackgroundMaterial('mica')`, portable 单文件打包, all assume Windows.
- **No `page_arr` means no images**. Chapter pages depend on the site's `page_arr` global variable. If the site changes how it delivers image URLs, extraction breaks.
- **Content cache** is in-memory with 10-min TTL (`src/main/scraperWindow.ts` -> `CONTENT_CACHE`). Server restart clears it.
- **Cover images may fail**. HomePage/DetailPage use direct CDN URLs for covers, not `jmimg://`. Known issue.
- **FavoritesPage, DownloadsPage, SettingsPage** are partially implemented (UI exists, some handlers missing).
- **Proxy detection**: `dev.bat` sets `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` for China-based dev.

## File map (what lives where)

| Area | File | Purpose |
|------|------|---------|
| Entry | `src/main/index.ts` | Window creation, IPC init, protocol registration |
| Content | `src/main/scraperWindow.ts` | Hidden BrowserWindow scraper, all extraction logic |
| Content | `src/main/contentApi.ts` | IPC handlers for scraping (content:homepage, content:search, etc.) |
| Content | `src/main/homepageLogic.ts` | URL building, cache keys, card mapping |
| Content | `src/main/homepageStream.ts` | Diff/stop-polling logic for incremental homepage loading |
| Images | `src/main/imageProtocol.ts` | jmimg:// custom scheme register + handler |
| Images | `src/main/imageLoader.ts` | Disk cache + concurrent download pipeline |
| Network | `src/main/networkProbe.ts` | Multi-domain connectivity probing |
| Network | `src/main/sessionWarmup.ts` | Cloudflare challenge bypass window |
| Data | `src/main/database.ts` | sql.js init, migrations, tables |
| Data | `src/main/ipc.ts` | DB, favorites, search history, auth IPC handlers |
| Tools | `src/main/types.ts` | Core interfaces (SiteAdapter, MangaDetail, etc.) |
| IPC bridge | `src/preload/index.ts` | All electronAPI methods exposed to renderer |
| State | `src/renderer/src/stores/appStore.ts` | zustand store: routing, reader state, theme, pendingSearch |
| Pages | `src/renderer/src/pages/*` | Home, Search, Categories, Detail, Reader, Favorites, Downloads, Settings |
| Components | `src/renderer/src/components/` | MangaCard, TitleBar, LoginDialog |
