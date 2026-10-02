// Run with the project's Electron after npm run build. All state and content are synthetic.
const { app, net, session, BrowserWindow, nativeImage, dialog, ipcMain } = require('electron')
if(process.env.JM_QA_SCALE)app.commandLine.appendSwitch('force-device-scale-factor',process.env.JM_QA_SCALE)
const { mkdirSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { createCipheriv, createHash } = require('node:crypto')
const assert = require('node:assert/strict')
require('tsx/cjs')
const { BUILTIN_JM_API_PROFILES } = require('../src/main/content/jmAppApiProfiles.ts')
const repo = resolve(__dirname, '..')
const runId = process.env.JM_QA_RUN || `reader-${Date.now()}`
const root = join(repo, 'work', runId)
const evidence = join(repo, 'outputs', 'reader-qa', runId)
dialog.showSaveDialog = async () => ({ canceled: false, filePath: join(evidence, 'sample.cbz') })
mkdirSync(evidence, { recursive: true })
for (const key of ['userData', 'sessionData', 'downloads', 'temp', 'crashDumps']) {
  const path = join(root, key)
  mkdirSync(path, { recursive: true })
  app.setPath(key, path)
}
process.env.PORTABLE_EXECUTABLE_DIR = join(root, 'portable')
mkdirSync(process.env.PORTABLE_EXECUTABLE_DIR, { recursive: true })
if(process.env.JM_QA_GRAPHICS) {
  const dataDir=join(process.env.PORTABLE_EXECUTABLE_DIR,'JMComicData');mkdirSync(dataDir,{recursive:true})
  writeFileSync(join(dataDir,'startup-preferences.json'),JSON.stringify({version:1,hardwareAcceleration:process.env.JM_QA_GRAPHICS==='on'}))
}
if (process.env.JM_QA_DEV_URL) process.env.ELECTRON_RENDERER_URL = process.env.JM_QA_DEV_URL
else delete process.env.ELECTRON_RENDERER_URL
delete process.env.PORTABLE_EXECUTABLE_FILE

const visible = process.env.JM_QA_VISIBLE === '1'
const benchmark = Boolean(process.env.JM_QA_BENCH)
const detailEntries = process.env.JM_QA_DETAIL_ENTRIES ? require('./detail-entry-fixture.cjs') : null
if(benchmark){const log=console.log;console.log=(...args)=>{if(!String(args[0]).startsWith('[perf]'))log(...args)}}
const rendererEvents = []
if (benchmark) ipcMain.on('performance:record', (_event,value) => rendererEvents.push({ ...value, receivedAt:performance.now() }))
const report = { runId, mode: `${visible ? 'visible' : 'hidden'} Chromium / ${process.env.JM_QA_DEV_URL ? 'development StrictMode' : 'production'} / synthetic network`, assertions: [], errors: [], network: { api: 0, image: 0, blocked: 0 }, summaryQueries: 0 }
let warmupRetries = 0
let rejectPreferenceSaves = false
let rejectHistorySaves = false
let closeFailures = 0
if (process.env.JM_QA_CLOSE_RETRY) dialog.showMessageBox = async options => {
  assert.equal(options.title, '尚未完成保存')
  closeFailures++
  return { response: 0, checkboxChecked: false }
}
const registerHandle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, handler) => registerHandle(channel, (...args) => {
  if(channel === 'session:warmupRetry')warmupRetries++
  if(channel === 'download:summary')report.summaryQueries++
  if(channel === 'settings:set' && rejectPreferenceSaves && args[1]?.readerZoom !== undefined)throw Error('Synthetic preference write failure')
  if(channel === 'history:upsert' && rejectHistorySaves)throw Error('Synthetic history write failure')
  return handler(...args)
})
const mark = (name, details) => { report.assertions.push({ name, details }); console.log(`QA PASS: ${name}`) }
const fail = (error) => { report.errors.push(String(error?.stack || error)); console.error('QA FAIL:', error?.stack || error); finish(1) }
let finished = false
function finish(code) {
  if (finished) return
  finished = true
  if(report.benchmark){const {samples,...metadata}=report.benchmark;report.benchmark={...metadata,sampleCount:samples.length,rawFile:'benchmark.json'}}
  writeFileSync(join(evidence, process.env.JM_QA_RESUME ? 'restart-result.json' : 'result.json'), JSON.stringify(report, null, 2))
  console.log(`QA RESULT=${code} evidence=${evidence}`)
  app.exit(code)
}
setTimeout(() => fail(new Error('Electron QA watchdog expired')), benchmark ? 1200000 : process.env.JM_QA_RESOURCE_MATRIX ? 300000 : 90000).unref()
const blockedSessions = new WeakSet()
const blockSession = (target) => {
  if (blockedSessions.has(target)) return
  blockedSessions.add(target)
  if (detailEntries) target.protocol.handle('https', request => new Response(detailEntries.html(new URL(request.url)), { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
  target.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    if (detailEntries && details.url.startsWith('https://')) return callback({})
    if (process.env.JM_QA_DEV_URL && new URL(details.url).origin === new URL(process.env.JM_QA_DEV_URL).origin) return callback({})
    report.network.blocked++; callback({ cancel: true })
  })
}
app.on('session-created', blockSession)
app.whenReady().then(() => blockSession(session.defaultSession))
globalThis.fetch = async () => { throw new Error('External fetch disabled during QA') }

const imageCache = new Map()
let failingSecondChapter = true
let fixtureEpoch = 0
const goldenWidth = 16, goldenHeight = 23
const goldenBitmap = Buffer.alloc(goldenWidth * goldenHeight * 4)
for (let y=0;y<goldenHeight;y++) for(let x=0;x<goldenWidth;x++) {
  const offset=(y*goldenWidth+x)*4
  goldenBitmap.fill(y*10,offset,offset+3);goldenBitmap[offset+3]=255
}
const goldenPng=nativeImage.createFromBitmap(goldenBitmap,{width:goldenWidth,height:goldenHeight}).toPNG()
function syntheticPng(index, cover = false) {
  if (benchmark) index %= 6
  const key = `${index}/${cover}`
  if (imageCache.has(key)) return imageCache.get(key)
  const width = 720, height = cover ? 960 : index % 6 === 5 ? 480 : 1800 + index % 3 * 300
  const bitmap = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4
    const frame = x < 30 || x >= width - 30 || y % 480 < 24
    const noise = benchmark ? ((Math.imul((x>>1)+1,1103515245)^Math.imul((y>>1)+index*1000,1664525))>>>16)%100 : 0
    const value = frame ? 42 : 205 + Math.floor(y / 240) % 3 * 14 - noise
    bitmap[offset] = value
    bitmap[offset + 1] = Math.min(255, value + (index % 3) * 8)
    bitmap[offset + 2] = Math.max(0, value - (index % 4) * 9)
    bitmap[offset + 3] = 255
  }
  const png = nativeImage.createFromBitmap(bitmap, { width, height }).toPNG()
  imageCache.set(key, png)
  return png
}
// Prepare encoded fixtures before measurements; every stream shares the same total bandwidth.
const transfers = new Set()
if (benchmark) {
  for(let i=0;i<6;i++) syntheticPng(i)
  syntheticPng(0,true)
  report.fixture = { latencyMs:80, sharedBytesPerSecond:4*1024*1024, encodedBytes:[...imageCache.values()].map(value=>value.length), scrambled:true }
  report.network.bytes = 0
  let lastTick=performance.now()
  setInterval(()=>{
    const now=performance.now(),share = Math.max(1,Math.floor(4*1024*1024*(now-lastTick)/1000/Math.max(1,transfers.size)))
    lastTick=now
    for(const transfer of transfers) {
      const end=Math.min(transfer.bytes.length,transfer.offset+share)
      const chunk=transfer.bytes.subarray(transfer.offset,end);transfer.offset=end;report.network.bytes+=chunk.length
      transfer.controller.enqueue(chunk)
      if(end===transfer.bytes.length){transfers.delete(transfer);transfer.controller.close();transfer.detach()}
    }
  },20).unref()
}
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms))
async function fixtureImage(bytes,signal) {
  if(!benchmark)return new Response(bytes,{headers:{'Content-Type':'image/png'}})
  await sleep(80);signal?.throwIfAborted()
  let transfer
  const abort=()=>{if(transfers.delete(transfer))transfer.controller.error(new Error('fixture aborted'))}
  const body=new ReadableStream({start(controller){transfer={controller,bytes,offset:0,detach:()=>signal?.removeEventListener('abort',abort)};transfers.add(transfer)},cancel(){transfers.delete(transfer);transfer.detach()}})
  signal?.addEventListener('abort',abort,{once:true})
  return new Response(body,{headers:{'Content-Type':'image/png'}})
}
function envelope(value, headers) {
  const timestamp = new Headers(headers).get('tokenparam').split(',')[0]
  const key = createHash('md5').update(`${timestamp}${BUILTIN_JM_API_PROFILES[0].dataSecret}`).digest('hex')
  const cipher = createCipheriv('aes-256-ecb', key, null)
  return JSON.stringify({ code: 200, data: Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]).toString('base64') })
}
net.fetch = async (target, init = {}) => {
  init.signal?.throwIfAborted()
  const url = new URL(String(target))
  if (/\/media\/(photos|albums)\//.test(url.pathname)) {
    report.network.image++
    if(url.pathname.endsWith('/golden.png'))return fixtureImage(goldenPng,init.signal)
    const index = Number(url.pathname.match(/\/(\d+)\.png$/)?.[1] || 0)
    const second = url.pathname.includes('/photos/203/')
    if (second && index === 0 && failingSecondChapter && !process.env.JM_QA_PDF) return new Response('Synthetic page failure', { status: 503 })
    return fixtureImage(syntheticPng(second ? index + 37 : index, url.pathname.includes('/albums/')),init.signal)
  }
  report.network.api++
  if(benchmark){await sleep(80);init.signal?.throwIfAborted()}
  let data
  if (url.pathname === '/setting') data = { jm3_version: '2.1.7', img_host: 'https://cdn-msp.18comic.vip' }
  else if (detailEntries) data = detailEntries.payload(url)
  else if (url.pathname === '/album') data = { id: url.searchParams.get('id') || '101', name: url.searchParams.get('id') === '102' ? '海边日记 · 合成阅读样章' : '山间来信 · 合成阅读样章', author: ['阅读体验实验室'], tags: ['风景', '旅途'], description: '用于测试长图、横图与章节切换的合成内容。', series: [{ id: url.searchParams.get('id') === '102' ? '204' : benchmark?'267000':'202', sort: '1', name: '第一章 · 出发' }, { id: '203', sort: '2', name: '第二章 · 抵达' }] }
  else if (url.pathname === '/comic_read') data = { id: url.searchParams.get('id') || '202', scramble_id: benchmark?200000:0, total_page: process.env.JM_QA_PDF?3:36, images: Array.from({ length: process.env.JM_QA_PDF?3:36 }, (_, i) => `${i}.png${benchmark?'?fixture='+fixtureEpoch:''}`) }
  else if (['/categories/filter', '/search', '/promote'].includes(url.pathname)) data = { total: 1, content: [{ id: '101', name: '山间来信 · 合成阅读样章', image: '/media/albums/101.png' }] }
  else throw new Error(`Unexpected fixture route: ${url.pathname}`)
  return new Response(envelope(data, init.headers), { headers: { 'Content-Type': 'application/json' } })
}

async function run(win) {
  const wc = win.webContents
  const js = (source) => wc.executeJavaScript(source, true).catch(error=>{throw Error(`${String(error)}\nExpression: ${source.slice(0,800)}`)})
  const wait = async (expression, label) => {
    const deadline = Date.now() + 12000
    while (Date.now() < deadline) {
      if (await js(expression)) return
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error(`Timed out: ${label}\nFocus: ${await js('document.activeElement?.outerHTML.slice(0,500)')}\nTrace: ${await js('JSON.stringify(window.__qaFocusTrace)')}\n${await js('document.body.innerText.slice(-3000)')}\n${await js(`JSON.stringify([...document.querySelectorAll('.reader-image img')].map(image=>({src:image.getAttribute('src'),complete:image.complete,width:image.naturalWidth,status:image.parentElement.dataset.readerImageStatus})))`)}`)
  }
  const pointerClick = async query => {
    wc.invalidate()
    await js(`Promise.race([Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))),new Promise(resolve=>setTimeout(resolve,300))])`)
    const point = await js(`(()=>{const e=${query};if(!e)throw Error('missing click target');e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,hit:r.width>0&&r.height>0&&e.contains(document.elementFromPoint(x,y)),target:e.outerHTML.slice(0,220),cover:document.elementFromPoint(x,y)?.outerHTML.slice(0,350)}})()`)
    assert.equal(point.hit, true, 'pointer target must be visible and unobscured: '+JSON.stringify(point))
    await js(`window.__qaClickReceived=false;document.addEventListener('click',()=>{window.__qaClickReceived=true},{capture:true,once:true})`)
    wc.sendInputEvent({type:'mouseDown',x:Math.round(point.x),y:Math.round(point.y),button:'left',clickCount:1})
    wc.sendInputEvent({type:'mouseUp',x:Math.round(point.x),y:Math.round(point.y),button:'left',clickCount:1})
    await wait('window.__qaClickReceived', 'pointer click delivered to the renderer')
  }
  const clickSelector = async selector => {
    await wait(`Boolean(document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect().width)`, `visible selector ${selector}`)
    await pointerClick(`document.querySelector(${JSON.stringify(selector)})`)
  }
  const showTools = async () => {
    if (!await js(`Boolean(document.querySelector('.reader-toolbar'))`)) await clickSelector('[data-reader-tools-toggle]')
    await wait(`Boolean(document.querySelector('.reader-toolbar')?.getBoundingClientRect().height)`, 'visible reader tools')
  }
  const clickText = async (text) => {
    const query = `[...document.querySelectorAll('button,summary,[role="button"],[role="tab"]')].find(e=>e.getBoundingClientRect().width>0 && (e.innerText.trim()===${JSON.stringify(text)} || e.getAttribute('aria-label')===${JSON.stringify(text)}))`
    await wait(`Boolean(${query})`, `button ${text}`)
    await pointerClick(query)
  }
  const screenshot = async (name) => {
    wc.sendInputEvent({ type:'mouseMove', x:10, y:10 })
    wc.invalidate()
    await new Promise((resolve) => setTimeout(resolve, 350))
    try {
      if (!visible) await wc.capturePage(undefined, { stayHidden: true, stayAwake: true })
      await js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
      writeFileSync(join(evidence, `${name}.png`), (await wc.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG())
    }
    catch (error) { if (visible) throw error; report.assertions.push({ name: 'capture unavailable while hidden', details: String(error) }) }
  }
  await wait('Boolean(window.electronAPI)', 'preload')
  if (detailEntries) {
    await require('./detail-entry-smoke.cjs')({win,js,wait,clickSelector,clickText,screenshot,mark,report,detailEntries})
    finish(0);return
  }
  if(process.env.JM_QA_RESTORE_WORKSPACE) {
    await wait(`document.querySelectorAll('[data-reader-tab]').length===2 && Boolean(document.querySelector('[data-reader-start]'))`, 'workspace restored on a cold process start')
    const saved=await js('window.electronAPI.workspaceGet()'),gpu=await js('window.electronAPI.graphicsGet()')
    assert.equal(saved.tabs[0].customTitle,'跨进程恢复书签');assert.equal(saved.tabs[0].pinned,true)
    assert.equal(saved.activeId,saved.tabs[1].id)
    assert.equal(gpu.requested,false);assert.equal(gpu.runningPreference,false);assert.equal(gpu.restartRequired,false)
    assert.equal(await js(`document.querySelectorAll('.reader-root').length`),0,'background restored books do not mount images')
    await clickSelector('[data-reader-tab="online:101"]')
    await wait(`Boolean(document.querySelector('[data-reader-image-status="ready"]'))`, 'restored book opens with real IPC')
    assert.equal(await js(`document.querySelector('[data-reader-tab][aria-selected="true"]').textContent.includes('跨进程恢复书签')`),true)
    await screenshot('cold-workspace-restore')
    mark('cold restart restores start/book tabs, pin, custom title and active selection; GPU preference applies at startup',{gpu,snapshot:saved})
    finish(0);return
  }
  if(process.env.JM_QA_STARTUP) {
    await wait(`window.electronAPI.contentWarmupStatus().then(state=>state.phase==='failed')`, 'startup verification failure')
    await wait(`Boolean(document.querySelector('[data-verification-retry]'))`, 'visible verification retry after startup failure')
    await js('window.__qaNoReload = true')
    await clickText('重新验证')
    await wait(`window.electronAPI.contentWarmupStatus().then(state=>state.phase==='failed')`, 'explicit retry failure')
    assert.equal(warmupRetries,1,'the recovery button must invoke the real retry IPC')
    assert.equal(await js('window.__qaNoReload'),true,'verification retry must not reload away the workspace')
    await wait(`Boolean(document.querySelector('[data-verification-retry] button:not(:disabled)'))`, 'retry remains available after failure')
    await screenshot('startup-verification-retry')
    mark('startup failure exposes a working retry action and preserves the renderer workspace')
    assert.equal(report.errors.length,0,report.errors.join('\n'));finish(0);return
  }
  if(process.env.JM_QA_GOLDEN) {
    if(process.env.JM_QA_PACKAGE) {
      const packageRoot=resolve(process.env.JM_QA_PACKAGE)
      const packagedRequire=require('node:module').createRequire(join(packageRoot,'out/main/index.js'))
      for(const dependency of ['sql.js','cheerio','archiver'])assert.ok(packagedRequire.resolve(dependency).toLowerCase().startsWith((packageRoot+require('node:path').sep).toLowerCase()),`${dependency} must resolve inside app.asar`)
      assert.ok(require('node:fs').statSync(join(packageRoot,'node_modules/sql.js/dist/sql-wasm.wasm')).size>0)
      mark('runtime dependencies and SQL WebAssembly are present inside app.asar')
    }
    const added=await js(`window.electronAPI.downloadAdd({mangaId:'104',mangaTitle:'无损反打乱验收',chapterIndex:0,chapterTitle:'23 行金样',chapterUrl:'/photo/267000',imageUrls:['https://cdn-msp.18comic.vip/media/photos/267000/golden.png'],scrambleId:200000})`)
    assert.equal(added.ok,true)
    await wait(`window.electronAPI.downloadList().then(rows=>rows.find(row=>row.id===${added.taskId})?.status==='completed')`,'compiled main golden download')
    const task=(await js('window.electronAPI.downloadList()')).find(row=>row.id===added.taskId)
    const png=require('node:fs').readFileSync(join(task.savePath,task.storageRelpath,'0001.png'))
    assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10])
    const actual=nativeImage.createFromBuffer(png).toBitmap()
    const rows=[18,19,20,21,22,16,17,14,15,12,13,10,11,8,9,6,7,4,5,2,3,0,1]
    for(let y=0;y<goldenHeight;y++)assert.deepEqual(actual.subarray(y*goldenWidth*4,(y+1)*goldenWidth*4),goldenBitmap.subarray(rows[y]*goldenWidth*4,(rows[y]+1)*goldenWidth*4),`golden row ${y}`)
    const local=await js(`window.electronAPI.downloadChapterPages('104',0)`)
    assert.equal(local.ok,true);assert.equal(local.data.length,1)
    const dimensions=await js(`(async()=>{const image=new Image();image.src=${JSON.stringify(local.data[0].imageUrl)};await image.decode();return [image.naturalWidth,image.naturalHeight]})()`)
    assert.deepEqual(dimensions,[goldenWidth,goldenHeight])
    const exported=await js(`window.electronAPI.downloadExportCbz({taskId:${added.taskId}})`)
    assert.equal(exported.ok,true,exported.error)
    mark('packaged main and preload: IPC download, exact 23-row Canvas golden, atomic lossless file, local protocol and archiver CBZ',{package:process.env.JM_QA_PACKAGE||'out',pages:1})
    assert.equal(report.errors.length,0,report.errors.join('\n'));finish(0);return
  }
  if(benchmark){await require('./reader-benchmark.cjs')({app,win,js,wait,clickText,session,rendererEvents,report,evidence,advanceFixture:()=>fixtureEpoch++});finish(0);return}
  if (process.env.JM_QA_RESUME) {
    const saved = await js(`window.electronAPI.historyGetLocal('101')`)
    assert.equal(saved.page_index,35); assert.equal(saved.is_local,1)
    assert.equal((await js('window.electronAPI.settingsGet()')).readerZoom,1.1)
    await clickText('收藏')
    await clickText('历史记录')
    await wait(`Boolean([...document.querySelectorAll('[role="button"]')].find(e=>e.textContent.includes('第 36/36 页') && e.getBoundingClientRect().width>0))`, 'persisted history row')
    await js(`[...document.querySelectorAll('[role="button"]')].find(e=>e.textContent.includes('第 36/36 页') && e.getBoundingClientRect().width>0).click()`)
    await wait(`Boolean(document.querySelector('.reader-single-content [data-reader-image-status="ready"]'))`, 'offline resume after restart')
    assert.equal(await js(`document.querySelector('[data-reader-progress]').dataset.currentPage`),'36')
    assert.equal(await js(`document.querySelector('.reader-root').dataset.readerSource`), 'local')
    await showTools()
    await js(`document.querySelector('[aria-label="目录与缩略图"]').click()`)
    await wait(`document.querySelectorAll('.reader-chapters button').length>0`, 'local chapter directory after history resume')
    await screenshot('reader-restarted-offline')
    mark('cold process restart restores offline mode, last page, preferences and chapter directory')
    finish(0); return
  }
  if(process.env.JM_QA_WORKSPACE)await js(`window.electronAPI.favoritesAdd({ mangaId:'102', title:'海边日记 · 合成阅读样章', coverUrl:'https://cdn-msp.18comic.vip/media/albums/102.png' })`)
  await js(`window.electronAPI.favoritesAdd({ mangaId:'101', title:'山间来信 · 合成阅读样章', coverUrl:'https://cdn-msp.18comic.vip/media/albums/101.png' })`)
  await clickText('收藏')
  await wait(`Boolean([...document.querySelectorAll('.manga-card')].find(e=>e.getBoundingClientRect().width>0))`, 'favorite card')
  await screenshot('library')
  await js(`[...document.querySelectorAll('.manga-card')].find(e=>e.textContent.includes('山间来信') && e.getBoundingClientRect().width>0).click()`)
  if(process.env.JM_QA_HISTORY_RETRY)rejectHistorySaves=true
  await clickText('开始阅读')
  await wait(`Boolean([...document.images].find(e=>e.alt==='第 1 页' && e.naturalWidth>0))`, 'decoded first page')
  mark('real preload / IPC / encrypted API / jmimg / Chromium decode')
  await screenshot('reader-first')
  if (process.env.JM_QA_VISUAL) {
    await require('./visual-style-smoke.cjs')({win,js,wait,clickText,clickSelector,showTools,screenshot,mark,evidence,report})
    assert.equal(report.errors.length,0,report.errors.join('\n'));finish(0);return
  }
  if (process.env.JM_QA_CLOSE_RETRY) {
    await showTools()
    rejectPreferenceSaves = true
    await js(`document.querySelector('[aria-label="放大"]').click()`)
    await wait(`document.querySelector('.reader-save-error')?.textContent.includes('偏好暂未保存')`, 'preference write fault before closing')
    win.close()
    await wait(`!document.querySelector('[data-app-closing]') && Boolean(document.querySelector('[data-reader-transition-error]'))`, 'failed close remains usable')
    assert.equal(closeFailures, 1)
    assert.equal(win.isDestroyed(), false)
    rejectPreferenceSaves = false
    await js(`document.querySelector('[data-reader-transition-error] button').click()`)
    await wait(`!document.querySelector('[data-reader-transition-error]')`, 'recovered close save clears error')
    assert.equal((await js('window.electronAPI.settingsGet()')).readerZoom, 1.1)
    await js(`void(window.__qaOffClose=window.electronAPI.onBeforeClose(async()=>{await new Promise(done=>setTimeout(done,150));throw Error('Synthetic final save failure')}))`)
    win.close()
    await wait(`Boolean(document.querySelector('[data-app-closing]'))`, 'freeze during close preparation')
    assert.ok(await js(`document.querySelector('.app-workspace-body').inert`))
    await wait(`!document.querySelector('[data-app-closing]')`, 'main close cancellation resumes the renderer')
    assert.equal(closeFailures, 2)
    assert.equal(await js(`document.querySelector('.app-workspace-body').inert`), false)
    await js(`window.__qaOffClose();document.querySelector('[data-reader-viewport]').focus()`)
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Right' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Right' })
    await wait(`document.querySelector('[data-reader-progress]')?.dataset.currentPage==='2'`, 'continued reading after close cancellation')
    mark('preference and final-save failures retain the window; IPC cancellation restores interaction; retry clears the error')
    app.once('will-quit', event => {
      event.preventDefault()
      require('sql.js')().then(SQL => {
        const disk = new SQL.Database(require('node:fs').readFileSync(require('../src/main/dataPaths.ts').getDatabasePath()))
        assert.equal(disk.exec("SELECT page_index FROM reading_history WHERE manga_id='101'")[0].values[0][0], 1)
        disk.close()
        mark('normal close after recovery persists the final page to disk')
        assert.equal(report.errors.length, 0, report.errors.join('\n'))
        finish(0)
      }).catch(fail)
    })
    win.close(); return
  }
  if(process.env.JM_QA_PDF) {
    await require('./pdf-download-smoke.cjs')({win,js,wait,clickText,clickSelector,showTools,screenshot,mark,evidence})
    assert.equal(report.errors.length,0,report.errors.join('\n'));finish(0);return
  }
  if(process.env.JM_QA_EXPERIENCE_SETTINGS) {
    await require('./experience-settings-smoke.cjs')({win,js,wait,clickText,clickSelector,screenshot,mark})
    assert.equal(report.errors.length,0,report.errors.join('\n'));finish(0);return
  }
  if(process.env.JM_QA_MOTION) {
    await require('./experience-motion-smoke.cjs')({win,js,wait,clickSelector,screenshot,mark})
    assert.equal(report.errors.length,0,report.errors.join('\n'));finish(0);return
  }
  if(process.env.JM_QA_RESOURCE_MATRIX) {
    await require('./experience-resource-smoke.cjs')({app,win,js,wait,clickSelector,screenshot,mark,evidence,report})
    assert.equal(report.errors.length,0,report.errors.join('\n'));finish(0);return
  }
  if(process.env.JM_QA_EXPERIENCE_TABS) {
    await require('./experience-tabs-smoke.cjs')({win,js,wait,clickText,clickSelector,screenshot,mark})
    assert.equal(report.errors.length,0,report.errors.join('\n'));finish(0);return
  }
  if(process.env.JM_QA_BROWSE_LAYOUT) {
    await require('./browse-layout-smoke.cjs')({win,js,wait,clickText,clickSelector,screenshot,mark})
    assert.equal(report.errors.length,0,report.errors.join('\n'));finish(0);return
  }
  if(process.env.JM_QA_WORKSPACE) {
    await require('./reader-workspace-smoke.cjs')({win,js,wait,clickText,clickSelector,showTools,screenshot,mark,rejectSaves:value=>{rejectPreferenceSaves=value}})
    assert.equal(report.errors.length,0,report.errors.join('\n'));finish(0);return
  }
  if(process.env.JM_QA_HISTORY_RETRY) {
    await wait(`document.querySelector('.reader-save-error')?.textContent.includes('阅读位置暂未保存')`,'history write failure feedback')
    rejectHistorySaves=false
    await clickSelector('[data-close-reader="online:101"]')
    await wait(`!document.querySelector('.reader-root')`,'retry initial history write before leaving')
    assert.equal((await js(`window.electronAPI.historyGetLocal('101')`)).page_index,0)
    mark('initial history write failure can recover and save before leaving')
    finish(0);return
  }
  if(process.env.JM_QA_LAYOUT) {
    const scale=await js('window.devicePixelRatio')
    assert.equal(scale,Number(process.env.JM_QA_SCALE))
    await showTools()
    const themes=[]
    for(let theme=0;theme<2;theme++) {
      themes.push(await js(`getComputedStyle(document.querySelector('.reader-root')).getPropertyValue('--ui-bg-pane')`))
      for(const [width,height] of [[960,640],[1280,860]]) {
        win.setSize(width,height)
        await screenshot(`layout-${theme}-${width}`)
        const geometry=await js(`(()=>{const root=document.querySelector('[data-reader-workspace]').getBoundingClientRect();return [...document.querySelectorAll('.reader-toolbar button,.reader-toolbar select,.reader-workspace-header button,.reader-workspace-header summary')].filter(e=>e.getBoundingClientRect().width>0).map(e=>{const r=e.getBoundingClientRect();return {label:e.getAttribute('aria-label')||e.textContent.trim(),fits:r.left>=root.left-1&&r.right<=root.right+1&&r.top>=root.top&&r.bottom<=root.bottom+1}})})()`)
        assert.ok(geometry.every(control=>control.fits),JSON.stringify(geometry.filter(control=>!control.fits)))
      }
      if(theme===0)await js(`document.querySelector('button').click()`)
    }
    assert.notEqual(themes[0],themes[1],'theme control changes the application surface')
    mark('four window/theme layouts keep reader controls inside bounds at forced display scale',{scale,themes})
    assert.equal(report.errors.length,0,report.errors.join('\n'));finish(0);return
  }
  if(process.env.JM_QA_SAVE_RETRY) {
    await showTools()
    rejectPreferenceSaves=true
    await js(`document.querySelector('[aria-label="放大"]').click()`)
    await wait(`document.querySelector('.reader-save-error')?.textContent.includes('阅读偏好暂未保存')`,'preference save failure feedback')
    rejectPreferenceSaves=false
    await clickSelector('[data-close-reader="online:101"]')
    await wait(`!document.querySelector('.reader-root')`,'leave after save recovery')
    assert.equal((await js('window.electronAPI.settingsGet()')).readerZoom,1.1,'leaving after a transient write failure must retry the unsaved zoom')
    mark('preference save failure preserves dirty state for retry before leaving')
    finish(0);return
  }
  await js(`(() => { const page=document.querySelector('[data-index="0"]'); let viewport=page?.parentElement; while(viewport && getComputedStyle(viewport).overflowY!=='auto') viewport=viewport.parentElement; if(!viewport)throw Error('No scroll viewport'); window.qaViewport=viewport; viewport.scrollTop=11000; })()`)
  await wait(`Boolean(document.querySelector('[data-index="7"]')) || window.qaViewport.scrollTop>10000`, 'scroll position')
  await new Promise((resolve) => setTimeout(resolve, 2600))
  const position = await js(`(() => { const rect=window.qaViewport.getBoundingClientRect(); const inset=Number(window.qaViewport.dataset.readingInset||12); const pages=[...window.qaViewport.querySelectorAll('[data-index]')]; const visible=pages.find(e=>{const r=e.getBoundingClientRect(); return r.bottom>rect.top+inset && r.top<=rect.top+inset}); return {visible: Number(visible?.dataset.index), mounted:pages.map(e=>Number(e.dataset.index)), scrollTop:window.qaViewport.scrollTop}; })()`)
  const history = await js(`window.electronAPI.historyGetLocal('101')`)
  await screenshot('reader-middle')
  assert.ok(position.scrollTop > 5000 && position.visible > 0, `scroll must not snap back while images decode: ${JSON.stringify(position)}`)
  assert.equal(history.page_index, position.visible, `history must follow visible page; ${JSON.stringify(position)}`)
  mark('visible page persisted through the actual history IPC', position)
  assert.ok(history.page_offset > 0, 'within-page offset must be saved')
  const pageNumber = () => js(`Number(document.querySelector('[data-reader-progress]').dataset.currentPage)-1`)
  const select = (label, value) => js(`(() => { const e=document.querySelector('select[aria-label="${label}"]'); e.value=${JSON.stringify(value)}; e.dispatchEvent(new Event('change',{bubbles:true})); })()`)
  await showTools()
  await select('阅读模式', 'single')
  await wait(`Boolean(document.querySelector('.reader-single-content [data-index="${position.visible}"]'))`, 'same page in single mode')
  assert.equal(await pageNumber(), position.visible)
  await new Promise(resolve => setTimeout(resolve, 600))
  let saved = await js(`window.electronAPI.historyGetLocal('101')`)
  assert.ok(Math.abs(saved.page_offset-history.page_offset)<0.02, 'mode change preserves within-page offset')
  await select('阅读模式', 'scroll')
  await new Promise(resolve => setTimeout(resolve, 600))
  assert.equal(await pageNumber(), position.visible)
  mark('scroll / single mode preserves page and within-page offset')
  await select('阅读模式', 'single')
  await select('图片适配', 'height')
  await new Promise(resolve => setTimeout(resolve, 600))
  assert.ok(await js(`Math.abs(document.querySelector('.reader-single-content .reader-sheet').getBoundingClientRect().height+16-document.querySelector('[data-reader-viewport]').clientHeight)<2`), 'fit-height uses the viewport remaining below the docked toolbar with only page margins')
  await js(`document.querySelector('[aria-label="放大"]').click()`)
  await new Promise(resolve => setTimeout(resolve, 350))
  assert.equal((await js('window.electronAPI.settingsGet()')).readerZoom, 1.1)
  await clickText('阅读进度')
  await js(`document.querySelector('[aria-label="跳转页码"]').focus()`)
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Right' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Right' })
  await new Promise(resolve => setTimeout(resolve, 150))
  assert.equal(await pageNumber(), position.visible, 'input focus must suppress page shortcuts')
  await clickText('阅读进度')
  await js(`document.querySelector('[data-reader-viewport]').focus()`)
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Right' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Right' })
  await wait(`Number(document.querySelector('[data-reader-progress]').dataset.currentPage)===${position.visible+2}`, 'keyboard next page')
  await js(`document.querySelector('[aria-label="阅读设置"]').click()`)
  await select('阅读方向', 'rtl')
  await js(`document.querySelector('[data-reader-viewport]').focus()`)
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Left' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Left' })
  await wait(`Number(document.querySelector('[data-reader-progress]').dataset.currentPage)===${position.visible+3}`, 'RTL next page')
  mark('fit, persisted zoom, focus isolation and both keyboard directions')
  win.setSize(960, 640)
  await js(`document.querySelector('[aria-label="阅读设置"]').click()`)
  await screenshot('reader-compact')
  assert.ok(await js(`document.querySelector('.reader-toolbar').scrollWidth<=document.querySelector('.reader-root').clientWidth`), 'toolbar must fit minimum window')
  assert.ok(await js(`getComputedStyle(document.querySelector('.reader-toolbar')).opacity==='1' && [...document.querySelectorAll('.reader-toolbar button,.reader-toolbar select,.reader-toolbar input')].filter(e=>e.getBoundingClientRect().width>0).every(e=>{const r=e.getBoundingClientRect(),root=document.querySelector('.reader-root').getBoundingClientRect();return r.left>=root.left && r.right<=root.right && r.top>=root.top && r.bottom<=root.bottom})`), 'minimum-window controls are visible and inside the reader')
  win.setSize(1280, 860)
  await js(`document.querySelector('[aria-label="目录与缩略图"]').click()`)
  await wait(`Boolean(document.querySelector('.reader-drawer'))`, 'directory')
  await screenshot('reader-directory')
  assert.equal(await js(`Number(document.querySelector('.reader-thumbnails [aria-current="page"]')?.textContent.trim())-1`), await pageNumber(), 'current thumbnail has a selected state')
  await js(`document.querySelector('[aria-label="关闭目录"]').click()`)
  await js(`document.querySelector('[aria-label="全屏阅读"]').click()`)
  await wait('Boolean(document.fullscreenElement)', 'fullscreen')
  await screenshot('reader-fullscreen')
  await js('document.exitFullscreen()')
  await clickText('阅读进度')
  await clickText('下一章')
  await wait(`document.querySelector('.reader-root')?.dataset.readerChapter.includes('抵达')`, 'next chapter')
  await wait(`Boolean(document.querySelector('[data-reader-viewport]'))`, 'next chapter viewport')
  await wait(`document.activeElement===document.querySelector('[data-reader-viewport]')`, 'chapter change returns focus to the new viewport for continued keyboard reading')
  await wait(`Boolean(document.querySelector('.reader-image[data-reader-image-status="error"]'))`, 'individual failing page')
  await screenshot('reader-page-error')
  failingSecondChapter = false
  await clickText('重试第 1 页')
  await wait(`Boolean(document.querySelector('.reader-image[data-reader-image-status="ready"]'))`, 'next chapter decoded')
  assert.ok(await js(`document.querySelector('.reader-image img').src.includes(btoa('https://cdn-msp.18comic.vip/media/photos/203/0.png').replaceAll('+','-').replaceAll('/','_').replaceAll('=',''))`), 'chapter changes the image source')
  mark('isolated page failure and manual retry with the new chapter image')
  await clickSelector('[data-close-reader="online:101"]')
  await wait(`Boolean([...document.querySelectorAll('button')].find(e=>e.textContent==='开始阅读' && e.getBoundingClientRect().width>0))`, 'return to original detail')
  mark('minimum window, directory, fullscreen and chapter return')
  await clickText('下载')
  await new Promise(resolve=>setTimeout(resolve,200))
  const summariesBeforeDownload = report.summaryQueries
  const added = await js(`window.electronAPI.downloadAdd({ mangaId:'101', mangaTitle:'山间来信 · 合成阅读样章', chapterIndex:0, chapterTitle:'第一章 · 出发', chapterUrl:'/photo/202', imageUrls:[], coverUrl:'https://cdn-msp.18comic.vip/media/albums/101.png' })`)
  assert.equal(added.ok, true)
  await wait(`window.electronAPI.downloadList().then(rows=>rows.find(row=>row.id===${added.taskId})?.status==='completed')`, 'actual offline download')
  const task = (await js('window.electronAPI.downloadList()')).find(row => row.id === added.taskId)
  assert.ok(report.summaryQueries-summariesBeforeDownload < 12, 'page progress must not rescan the whole library for every image')
  assert.equal(task.storageRelpath.replaceAll('\\', '/'), 'manga-101/chapter-202')
  const { readFile, unlink } = require('node:fs/promises')
  const source = join(task.savePath, task.storageRelpath, '0001.png')
  assert.ok(resolve(source).startsWith(resolve(root)+require('node:path').sep), 'fixture mutation stays inside isolated work root')
  const original = await readFile(source)
  await unlink(source)
  const missing = await js(`window.electronAPI.downloadChapterPages('101',0)`)
  assert.equal(missing.ok, false, 'local reader must reject a missing first page')
  await js(`window.electronAPI.downloadRetry(${added.taskId})`)
  await wait(`window.electronAPI.downloadList().then(rows=>rows.find(row=>row.id===${added.taskId})?.status==='completed' && rows.find(row=>row.id===${added.taskId})?.available)`, 'repair missing page')
  assert.deepEqual(await readFile(source), original)
  const local = await js(`window.electronAPI.downloadChapterPages('101',0)`)
  assert.equal(local.data.length, 36)
  const localDimensions = await js(`(async()=>{const img=new Image();img.src=${JSON.stringify(local.data[0].imageUrl)};await img.decode();return {width:img.naturalWidth,height:img.naturalHeight}})()`)
  assert.deepEqual(localDimensions, { width:720, height:1800 })
  const exported = await js(`window.electronAPI.downloadExportCbz({ taskId:${added.taskId} })`)
  assert.equal(exported.ok, true, exported.error)
  const zip = await readFile(exported.path)
  const end = zip.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]))
  assert.equal(zip.readUInt16LE(end+10), 36)
  mark('real download, stable identity, missing-page repair, local protocol and CBZ export', { pages:36, archiveBytes:zip.length })
  await clickText('收藏')
  await js(`[...document.querySelectorAll('.manga-card')].find(e=>e.textContent.includes('山间来信') && e.getBoundingClientRect().width>0).click()`)
  await clickText('开始阅读')
  await wait(`Boolean(document.querySelector('[data-reader-image-status="ready"]'))`, 'online tab before offline reading')
  await clickText('下载')
  await wait(`Boolean([...document.querySelectorAll('[role="button"]')].find(e=>e.textContent.includes('山间来信') && e.getBoundingClientRect().width>0))`, 'downloaded manga card')
  await js(`[...document.querySelectorAll('[role="button"]')].find(e=>e.textContent.includes('山间来信') && e.getBoundingClientRect().width>0).click()`)
  await wait(`Boolean([...document.querySelectorAll('[role="button"]')].find(e=>e.textContent.includes('第一章') && e.getBoundingClientRect().width>0))`, 'offline chapter')
  const networkBeforeOffline = { ...report.network }
  await js(`[...document.querySelectorAll('[role="button"]')].find(e=>e.textContent.includes('第一章') && e.getBoundingClientRect().width>0).click()`)
  await wait(`document.querySelector('[data-reader-tab="local:101"]')?.getAttribute('aria-selected')==='true' && document.querySelector('.reader-root')?.dataset.readerSource==='local'`, 'local source becomes active')
  await wait(`Boolean(document.querySelector('.reader-single-content'))`, 'persisted reader mode')
  await wait(`Boolean(document.querySelector('.reader-image[data-reader-image-status="ready"]'))`, 'offline image')
  assert.equal(await js(`document.querySelector('.reader-root').dataset.readerSource`), 'local')
  assert.equal(report.network.image,networkBeforeOffline.image)
  assert.equal(report.network.api,networkBeforeOffline.api)
  mark('download library opens the full offline reader without a content or image network request')
  assert.equal(await js(`document.querySelectorAll('[data-reader-tab]').length`),2)
  assert.ok(await js(`document.querySelector('[data-reader-tab="local:101"]').getAttribute('aria-selected')==='true'`))
  assert.ok(await js(`Boolean(document.querySelector('[data-reader-tab="online:101"]'))`))
  mark('online and offline tabs for the same book coexist with the local source selected')
  await js(`document.querySelector('[data-reader-viewport]').focus()`)
  wc.sendInputEvent({type:'keyDown',keyCode:'End'}); wc.sendInputEvent({type:'keyUp',keyCode:'End'})
  await wait(`document.querySelector('[data-reader-progress]')?.dataset.currentPage==='36'`, 'last page before closing')
  assert.equal(report.errors.length, 0, report.errors.join('\n'))
  app.once('will-quit', (event) => {
    event.preventDefault()
    const initSqlJs = require('sql.js')
    const { readFileSync } = require('node:fs')
    const { getDatabasePath } = require('../src/main/dataPaths.ts')
    initSqlJs().then(SQL => {
      const disk = new SQL.Database(readFileSync(getDatabasePath()))
      const row = disk.exec("SELECT page_index, chapter_index FROM reading_history WHERE manga_id='101'")[0].values[0]
      disk.close()
      assert.equal(row[0], 35, 'normal close must persist pending reader position before destroying renderer')
      assert.equal(row[1], 0)
      mark('normal application close flushes pending reader position to disk')
      finish(0)
    }).catch(fail)
  })
  win.close()
}

app.on('browser-window-created', (_event, win) => {
  const showInactive = win.showInactive.bind(win)
  win.show = () => {}
  win.showInactive = visible ? showInactive : () => {}
  win.setSkipTaskbar(true)
  win.webContents.setBackgroundThrottling(false)
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error' && !event.message.includes('ERR_BLOCKED_BY_CLIENT') && !event.message.includes('503')) report.errors.push(`renderer: ${event.message}`)
  })
  win.webContents.once('did-finish-load', () => {
    if (win.webContents.getURL().includes('/out/renderer/index.html') || (process.env.JM_QA_DEV_URL && win.webContents.getURL().startsWith(process.env.JM_QA_DEV_URL))) {
      if (visible) showInactive()
      run(win).catch(fail)
    }
  })
})
require(join(process.env.JM_QA_PACKAGE ? resolve(process.env.JM_QA_PACKAGE) : repo, 'out', 'main', 'index.js'))
