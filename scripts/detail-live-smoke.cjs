// Real public API/HTML and real application routes, isolated profile; replace cover images only.
const { app, net, session, BrowserWindow, ipcMain } = require('electron')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const runId = process.env.JM_DETAIL_LIVE_RUN || `detail-live-${Date.now()}`
const root = resolve('work', runId), evidence = resolve('outputs/detail-chapters-fix', runId)
mkdirSync(evidence, { recursive: true })
for (const key of ['userData', 'sessionData', 'downloads', 'temp', 'crashDumps']) {
  const directory = join(root, key); mkdirSync(directory, { recursive: true }); app.setPath(key, directory)
}
process.env.PORTABLE_EXECUTABLE_DIR = join(root, 'portable')
mkdirSync(process.env.PORTABLE_EXECUTABLE_DIR, { recursive: true })
delete process.env.ELECTRON_RENDERER_URL
delete process.env.PORTABLE_EXECUTABLE_FILE
const applicationRoot = resolve(process.env.JM_DETAIL_LIVE_APP || '.')
const report = { timestamp: new Date().toISOString(), applicationRoot, scope: 'Real anonymous detail routes; no account data or comic image downloads', rows: [], detailCalls: [] }
const originalFetch = net.fetch.bind(net)
const placeholder = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZXkAAAAASUVORK5CYII=', 'base64')
net.fetch = (url, options) => /\/media\/(albums|photos)\//.test(new URL(url).pathname)
  ? Promise.resolve(new Response(placeholder, { headers: { 'Content-Type': 'image/png' } }))
  : originalFetch(url, options)
const register = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, handler) => register(channel, async (...args) => {
  const response = await handler(...args)
  if (channel === 'content:detail') report.detailCalls.push({ id: args[1], ok: response.ok, chapters: response.data?.chapters.length, error: response.error })
  return response
})
const seenSessions = new WeakSet()
function blockImages(target) {
  if (seenSessions.has(target)) return
  seenSessions.add(target)
  target.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => callback({ cancel: details.resourceType === 'image' || details.resourceType === 'media' }))
}
app.on('session-created', blockImages)
app.whenReady().then(() => blockImages(session.defaultSession))
let finished = false
function finish(code) {
  if (finished) return
  finished = true
  writeFileSync(join(evidence, 'result.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report)); app.exit(code)
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function run(win) {
  const wc = win.webContents, js = source => wc.executeJavaScript(source, true)
  async function wait(source, label, ms = 45000) {
    const deadline = Date.now() + ms
    while (Date.now() < deadline) { if (await js(source)) return; await delay(100) }
    throw Error(`Timed out: ${label}`)
  }
  async function click(label) {
    const query = `[...document.querySelectorAll('button,[role="button"],[role="tab"]')].find(e=>e.getBoundingClientRect().width>0&&(e.textContent.trim()===${JSON.stringify(label)}||e.getAttribute('aria-label')===${JSON.stringify(label)}))`
    await wait(`Boolean(${query})`, label); await js(`${query}.click()`)
  }
  const currentCards = `.app-page-surface[data-current="true"] .manga-card`
  const cardIds = String.raw`([...document.querySelectorAll('${currentCards}')].map(card=>{try{return atob(new URL(card.querySelector('img').src).pathname.slice(1).replaceAll('-','+').replaceAll('_','/')).match(/\/albums\/(\d+)/)?.[1]}catch{return null}}).filter(Boolean))`
  async function card(id) {
    await wait(`${cardIds}.includes('${id}')`, `card ${id}`)
    await js(String.raw`[...document.querySelectorAll('${currentCards}')].find(card=>{try{return atob(new URL(card.querySelector('img').src).pathname.slice(1).replaceAll('-','+').replaceAll('_','/')).match(/\/albums\/(\d+)/)?.[1]==='${id}'}catch{return false}}).click()`)
  }
  async function record(entry, id) {
    const deadline = Date.now() + 135000
    while (Date.now() < deadline) {
      const result = await js(`(()=>{const e=document.querySelector('[data-page-id="detail"][data-current="true"]');if(!e)return null;const ok=e.innerText.includes('开始阅读');return ok||e.innerText.includes('加载失败')?{ok,error:ok?undefined:e.innerText.slice(0,200)}:null})()`)
      if (result) { report.rows.push({ entry, id, ...result }); console.log(JSON.stringify(report.rows.at(-1))); writeFileSync(join(evidence, 'result.json'), JSON.stringify(report, null, 2)); return }
      await delay(100)
    }
    report.unresolved = await js(`({page:document.querySelector('.app-page-surface[data-current="true"]')?.dataset.pageId,text:document.querySelector('[data-page-id="detail"]')?.innerText.slice(0,300),cards:${cardIds}})`)
    throw Error(`Unresolved detail from ${entry}`)
  }
  await wait(`Boolean(window.electronAPI)`, 'preload')
  await click('分类')
  await wait(`Boolean(document.querySelector('[data-page-id="categories"] [role="combobox"]'))`, 'category dropdown')
  await js(`document.querySelector('[data-page-id="categories"] [role="combobox"]').click()`)
  await wait(`Boolean([...document.querySelectorAll('[role="option"]')].find(e=>e.textContent.trim()==='同人'))`, 'doujin option')
  await js(`[...document.querySelectorAll('[role="option"]')].find(e=>e.textContent.trim()==='同人').click()`)
  const ids = (process.env.JM_DETAIL_LIVE_IDS || '1477646,1477645,1449617').split(',')
  for (const id of ids) {
    await click('分类'); await card(id); await record('分类/同人', id)
  }
  await click('首页'); await click('最新')
  await wait(`${cardIds}.length>0`, 'home latest cards')
  const homeId = (await js(cardIds))[0]
  await card(homeId); await record('首页/最新', homeId)
  for (const id of ids) {
    await click('首页')
    await click('新建阅读标签')
    await wait(`document.activeElement===document.querySelector('[data-reader-start] input')`, 'focused new-tab input')
    await wc.insertText(id)
    await js(`document.querySelector('[data-reader-start] button[type="submit"]').click()`)
    await record('新标签页', id)
  }
  report.warmup = await js('window.electronAPI.contentWarmupStatus()')
  finish(process.env.JM_DETAIL_LIVE_EXPECT_SUCCESS && report.rows.some(row=>!row.ok) ? 1 : 0)
}
app.on('browser-window-created', (_event, win) => {
  win.show = () => {}; win.showInactive = () => {}; win.setSkipTaskbar(true)
  win.webContents.setBackgroundThrottling(false)
  win.webContents.once('did-finish-load', () => {
    if (win.webContents.getURL().includes('/out/renderer/index.html')) run(win).catch(error => { report.error = String(error); finish(1) })
  })
})
setTimeout(() => { report.error = 'Live detail watchdog'; finish(1) }, 300000).unref()
require(join(applicationRoot, 'out/main/index.js'))
