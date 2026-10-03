// Read-only anonymous protocol probe; retain structural metadata only, never images or response bodies.
const { app, net, BrowserWindow } = require('electron')
const { mkdirSync, writeFileSync } = require('node:fs')
const { resolve, join } = require('node:path')
require('tsx/cjs')
const { createJmApiFetchPort } = require('../src/main/content/jmAppApiFetchPort.ts')
const { createJmAppApiTransport } = require('../src/main/content/jmAppApiTransport.ts')
const { JM_API_ORIGINS } = require('../src/main/content/jmAppApiDomainResolver.ts')
const { BUILTIN_JM_API_PROFILES, withRuntimeVersion } = require('../src/main/content/jmAppApiProfiles.ts')
const { parseSettingPayload, parseListPayload, parseAlbumPayload, parseComicReadPayload } = require('../src/main/content/jmAppApiSchemas.ts')
const root = resolve('work/detail-chapters-probe')
const evidence = resolve('outputs/detail-chapters-fix')
mkdirSync(root, { recursive: true }); mkdirSync(evidence, { recursive: true })
app.setPath('userData', root); app.setPath('sessionData', root)
const report = { timestamp: new Date().toISOString(), bootstrap: [], albums: [], web: [] }
const file = process.env.JM_DETAIL_PROBE_OUTPUT || 'live-before.json'
const save = () => writeFileSync(join(evidence, file), JSON.stringify(report, null, 2))
const port = createJmApiFetchPort((url, init) => net.fetch(url, init))
app.whenReady().then(async () => {
  let transport, imageOrigin
  for (const apiOrigin of JM_API_ORIGINS) {
    try {
      const route = { apiOrigin, imageOrigin: 'https://cdn-msp.18comic.vip', profile: BUILTIN_JM_API_PROFILES[0] }
      const probe = createJmAppApiTransport({ route, fetchPort: port, maxNetworkAttempts: 1 })
      const setting = parseSettingPayload(await probe.request('setting'))
      imageOrigin = new URL(setting.imgHost.includes('://') ? setting.imgHost : `https://${setting.imgHost}`).origin
      route.imageOrigin = imageOrigin; route.profile = withRuntimeVersion(route.profile, setting.jm3Version)
      transport = createJmAppApiTransport({ route, fetchPort: port, maxNetworkAttempts: 1 })
      report.bootstrap.push({ apiOrigin, ok: true }); break
    } catch (error) { report.bootstrap.push({ apiOrigin, error: error.message }) }
  }
  if (!transport) throw Error('Anonymous API unavailable')
  const categoryName = process.env.JM_DETAIL_PROBE_CATEGORY || '0'
  const category = parseListPayload(await transport.request('category', { c: categoryName, page: '1', order: '', o: 'mr' }), imageOrigin)
  const ids = process.env.JM_DETAIL_PROBE_IDS?.split(',') || [...new Set([...category.results.slice(0, 6).map(card => card.id), '1215915'])]
  for (const id of ids) {
    const row = { id, source: category.results.some(card => card.id === id) ? `category-${categoryName}-latest` : 'control' }
    try {
      const raw = await transport.request('detail', { id })
      row.shape = { id: raw.id, titlePresent: Boolean(raw.name || raw.title), seriesType: Array.isArray(raw.series) ? 'array' : typeof raw.series, seriesCount: raw.series?.length, episodeCount: raw.episodes?.length, totalPage: raw.total_page }
      try { const result = parseAlbumPayload(raw, imageOrigin); row.detail = { ok: true, chapterCount: result.chapters.length, firstChapter: result.chapters[0]?.url } }
      catch (error) { row.detail = { ok: false, error: error.message } }
      if (Array.isArray(raw.series) && raw.series.length === 0) {
        const pages = parseComicReadPayload(await transport.request('pages', { id }), imageOrigin, id)
        row.albumIdRead = { ok: true, pages: pages.pages.length, scrambleId: pages.scrambleId }
      }
    } catch (error) { row.error = error.message }
    report.albums.push(row); save(); console.log(JSON.stringify(row))
  }
  const failures = report.albums.filter(row => row.detail?.ok === false).slice(0, 2)
  for (const row of failures) {
    const win = new BrowserWindow({ show: false, webPreferences: { images: false, nodeIntegration: false, contextIsolation: true } })
    try {
      await win.loadURL(`https://18comic.vip/album/${row.id}/`)
      const metadata = await win.webContents.executeJavaScript(`({path:location.pathname,bookNamePresent:Boolean(document.querySelector('#book-name')),photoLinks:document.querySelectorAll('a[href*="/photo/"]').length,dataAlbum:document.querySelectorAll('[data-album]').length,readControls:[...document.querySelectorAll('a,button')].filter(e=>/^(開始閱讀|开始阅读|閱讀|阅读)$/.test(e.textContent.trim())).map(e=>({tag:e.tagName,href:e.getAttribute('href'),dataAlbum:e.getAttribute('data-album'),onclick:e.getAttribute('onclick')}))})`)
      report.web.push({ id: row.id, ...metadata })
    } catch (error) { report.web.push({ id: row.id, error: error.message }) }
    finally { win.destroy(); save() }
  }
  save(); app.exit(0)
}).catch(error => { report.error = error.message; save(); console.error(error.message); app.exit(1) })
setTimeout(() => { report.timeout = true; save(); app.exit(1) }, 180000).unref()
