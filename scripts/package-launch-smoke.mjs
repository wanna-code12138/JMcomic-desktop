// Launch the delivered EXE without a project loader. Default: real network; --fixture: synthetic external I/O.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, copyFileSync, writeFileSync, createReadStream, readFileSync } from 'node:fs'
import { resolve, join, basename } from 'node:path'
import { createHash, randomInt } from 'node:crypto'
import { createServer } from 'node:net'
import { installPackageFixture, testPackageFixture } from './package-fixture.mjs'

const original = resolve(process.argv[2] || 'dist-electron/win-unpacked/JMComic Desktop.exe')
const runId = process.argv[3] || `package-launch-${Date.now()}`
const fixture = process.argv[4] === '--fixture'
const visible = process.env.JM_QA_VISIBLE === '1'
const mangaId = fixture ? undefined : process.argv[4]
const root = resolve('work',runId), evidence = resolve('outputs/reader-qa',runId), profile = join(root,'profile')
mkdirSync(profile,{recursive:true}); mkdirSync(evidence,{recursive:true})
let executable = original
if (/Portable/i.test(basename(original))) {
  mkdirSync(join(root,'portable'),{recursive:true})
  executable = join(root,'portable',basename(original))
  copyFileSync(original,executable)
}
const sha = createHash('sha256')
for await (const chunk of createReadStream(original)) sha.update(chunk)
const report = {executable:original,sha256:sha.digest('hex'),mode:`direct packaged EXE / ${fixture?'synthetic network and save dialog':'real network'}`,fixtureWindow:fixture?(visible?'visible':'hidden'):undefined,assertions:[],errors:[]}
const sleep = ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function freePort() {
  // Windows may assign low ephemeral ports that fetch deliberately rejects (e.g. 3659).
  for(let attempt=0;attempt<20;attempt++) {
    const server=createServer()
    try {
      await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(randomInt(20000,60000),'127.0.0.1',resolve)})
      const port=server.address().port
      await new Promise(resolve=>server.close(resolve))
      return port
    } catch(error) { if(!['EADDRINUSE','EACCES'].includes(error.code))throw error }
  }
  throw Error('No available local QA inspector port')
}
const mainPort=await freePort(), rendererPort=await freePort()
const env={...process.env}
for(const name of ['NODE_PATH','NODE_OPTIONS','ELECTRON_RUN_AS_NODE','ELECTRON_RENDERER_URL','PORTABLE_EXECUTABLE_DIR','PORTABLE_EXECUTABLE_FILE']) delete env[name]
const child=spawn(executable,[`--${fixture?'inspect-brk':'inspect'}=127.0.0.1:${mainPort}`,`--remote-debugging-port=${rendererPort}`,`--user-data-dir=${profile}`],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']})
let output='', exit
child.stdout.on('data',data=>{output+=data});child.stderr.on('data',data=>{output+=data})
child.on('exit',(code,signal)=>{exit={code,signal}})
child.on('error',error=>{report.errors.push(String(error));exit={code:1}})
const clients=[]
const runtimeErrors=[]
async function waitFor(fn,label,ms=25000) {
  const deadline=Date.now()+ms
  while(Date.now()<deadline) {
    if(exit)throw Error(`Application exited before ${label}: ${JSON.stringify(exit)}`)
    const value=await fn()
    if(value)return value
    await sleep(100)
  }
  throw Error(`Timed out: ${label}`)
}
async function connect(port,predicate) {
  const target=await waitFor(async()=>{
    try { return (await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(predicate) }
    catch{return null}
  },`debug target on ${port}`)
  const socket=new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject})
  let sequence=0
  let paused
  const pending=new Map()
  socket.onmessage=event=>{
    const message=JSON.parse(event.data)
    if(!message.id) {
      if(message.method==='NodeWorker.attachedToWorker') {
        report.workerInspections??=[]
        report.workerInspections.push(message.params.workerInfo)
        // The QA --inspect-brk launch can also pause worker entrypoints. Resume through
        // the official inspector protocol; keep the packaged worker implementation intact.
        void call('NodeWorker.sendMessageToWorker',{sessionId:message.params.sessionId,
          message:JSON.stringify({id:1,method:'Runtime.runIfWaitingForDebugger'})}).catch(error=>runtimeErrors.push(String(error)))
      }
      if(message.method==='Debugger.paused')paused=message.params
      if(message.method==='Runtime.exceptionThrown')runtimeErrors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text)
      return
    }
    const entry=pending.get(message.id)
    if(!entry)return
    pending.delete(message.id);clearTimeout(entry.timer)
    message.error?entry.reject(Error(JSON.stringify(message.error))):entry.resolve(message.result)
  }
  socket.onclose=()=>{for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(Error('Application inspector closed'))}pending.clear()}
  const call=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(`Timed out: ${method}`))},90000)
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}))
  })
  const evaluate=async expression=>{
    const response=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:target.type!=='node'})
    if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text)
    return response.result?.value
  }
  const client={socket,call,evaluate,get paused(){return paused}};clients.push(client)
  await call('Runtime.enable')
  return client
}
let main,renderer
try {
  main=await connect(mainPort,target=>target.type==='node')
  if(fixture) {
    await main.call('Debugger.enable')
    await main.call('Runtime.runIfWaitingForDebugger')
    await waitFor(()=>main.paused,'packaged entrypoint pause')
    await main.evaluate(`(${installPackageFixture.toString()})(${JSON.stringify(join(evidence,'sample.cbz'))},${visible})`)
    await main.call('Debugger.resume')
    await main.call('NodeWorker.enable',{waitForDebuggerOnStart:false})
  }
  renderer=await connect(rendererPort,target=>target.type==='page'&&target.url.includes('/out/renderer/index.html'))
  report.runtime=await main.evaluate(`(()=>{const app=process.mainModule.require('electron').app;return {packaged:app.isPackaged,version:app.getVersion(),appPath:app.getAppPath(),userData:app.getPath('userData'),electron:process.versions.electron,node:process.versions.node}})()`)
  assert.equal(report.runtime.packaged,true)
  assert.equal(report.runtime.version,JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version,'the delivered EXE must expose the unified release version')
  const expectedDataDir=/Portable/i.test(basename(original))?join(root,'portable','JMComicData'):profile
  assert.equal(resolve(report.runtime.userData),expectedDataDir,'the real EXE must use its isolated canonical data directory')
  assert.ok(report.runtime.appPath.endsWith('app.asar'))
  const archiveSha=createHash('sha256')
  for await (const chunk of createReadStream(report.runtime.appPath))archiveSha.update(chunk)
  report.appArchiveSha256=archiveSha.digest('hex')
  const js=renderer.evaluate
  await waitFor(()=>js(`Boolean(window.electronAPI && document.querySelector('nav[aria-label="主导航"]'))`),'production preload and application navigation')
  report.warmupAtStartup=await js('window.electronAPI.contentWarmupStatus()')
  assert.notEqual(report.warmupAtStartup.phase,'idle','verification begins at startup')
  report.assertions.push('delivered EXE loads packaged main, preload, renderer and isolated data without a development loader')
  const clickElement=async query=>{
    const point=await js(`(()=>{const node=${query};if(!node)return null;const r=node.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    assert.ok(point,'the target must exist before pointer input')
    await renderer.call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1})
    await renderer.call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1})
  }
  const click=async(label)=>{
    const query=`[...document.querySelectorAll('button,[role="button"]')].find(node=>node.getBoundingClientRect().width>0&&(node.textContent.trim()===${JSON.stringify(label)}||node.getAttribute('aria-label')===${JSON.stringify(label)}))`
    await waitFor(()=>js(`Boolean(${query})`),`button ${label}`)
    await clickElement(query)
  }
  if(fixture)await testPackageFixture({js,main,waitFor,click,clickElement,report,downloadDir:join(root,'downloads')})
  if(fixture) {
    await click('下载')
    await waitFor(()=>js(`document.querySelector('[data-browse-pane]').textContent.includes('PDF')`),'packaged PDF library')
    const capture=async name=>{
      if (visible) {
        await sleep(300)
        await waitFor(()=>js(`document.getAnimations().every(a=>a.playState!=='running'||a.effect.getTiming().iterations===Infinity)`),`${name} visual transitions settled`)
      } else {
        await js(`Promise.race([Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))),new Promise(resolve=>setTimeout(resolve,400))])`)
      }
      await main.evaluate(`(()=>{const wc=process.mainModule.require('electron').BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/out/renderer/index.html')).webContents;
        globalThis.__qaCapture={done:false};wc.invalidate();(async()=>{
          await wc.capturePage(undefined,{stayHidden:true,stayAwake:true});
          await wc.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
          const image=await wc.capturePage(undefined,{stayHidden:true,stayAwake:true});
          process.mainModule.require('node:fs').writeFileSync(${JSON.stringify(join(evidence,name+'.png'))},image.toPNG());globalThis.__qaCapture={done:true};
        })().catch(error=>{globalThis.__qaCapture={done:true,error:String(error)}})})()`)
      await waitFor(()=>main.evaluate('globalThis.__qaCapture.done'),'packaged-window capture',10000)
      assert.equal(await main.evaluate('globalThis.__qaCapture.error'),undefined)
    }
    await capture('release-downloads')
    await click('新建阅读标签')
    await waitFor(()=>js(`Boolean(document.querySelector('[data-reader-start]'))`),'packaged new tab')
    await capture('release-start')
    await click('设置')
    await waitFor(()=>js(`Boolean(document.querySelector('[aria-label="GPU 硬件加速"]'))`),'packaged experience settings')
    await capture('release-settings')
  }
  if(mangaId) {
    assert.match(mangaId,/^\d+$/)
    console.log('QA: waiting for real startup verification before reader input')
    await waitFor(()=>js(`window.electronAPI.contentWarmupStatus().then(state=>state.phase==='verified'||state.phase==='failed')`),'startup verification completion',125000)
    report.warmupBeforeReading=await js('window.electronAPI.contentWarmupStatus()')
    assert.equal(report.warmupBeforeReading.phase,'verified','complete the real startup verification before testing reader visibility')
    const verificationViews=await main.evaluate(`process.mainModule.require('electron').BrowserWindow.getAllWindows().find(window=>window.webContents.getURL().includes('/out/renderer/index.html')).contentView.children.length`)
    assert.equal(verificationViews,0,'the verification view must not cover the reader')
    await js(`window.electronAPI.settingsSet({downloadDir:${JSON.stringify(join(root,'downloads'))}})`)
    const detailStart=performance.now()
    await js(`(async()=>{window.__packageLiveDetail=await window.electronAPI.contentDetail(${JSON.stringify(mangaId)});if(!window.__packageLiveDetail.ok)throw Error(window.__packageLiveDetail.error)})()`)
    report.detailMs=Math.round(performance.now()-detailStart)
    report.chapter=await js(`(()=>{const detail=window.__packageLiveDetail.data;return {mangaId:detail.id,chapterUrl:detail.chapters[0].url,chapterIndex:detail.chapters[0].index}})()`)
    await js(`(()=>{const item=window.__packageLiveDetail.data;return window.electronAPI.favoritesAdd({mangaId:item.id,title:item.title,coverUrl:item.coverUrl})})()`)
    await click('收藏')
    await waitFor(()=>js(`Boolean(document.querySelector('.manga-card'))`),'test favorite card')
    await clickElement(`document.querySelector('.manga-card')`)
    const firstImageStart=performance.now()
    await click('开始阅读')
    await waitFor(()=>js(`(()=>{
      const viewport=document.querySelector('[data-reader-viewport]'),page=viewport?.querySelector('[data-index="0"]'),image=page?.querySelector('.reader-image');
      if(document.querySelector('[data-reader-progress]')?.dataset.currentPage!=='1'||image?.dataset.readerImageStatus!=='ready')return false;
      const img=image.querySelector('img'),canvas=image.querySelector('canvas'),shown=getComputedStyle(canvas).display!=='none'?canvas:img;
      const r=shown.getBoundingClientRect(),v=viewport.getBoundingClientRect();
      return img.naturalWidth>0&&getComputedStyle(shown).visibility==='visible'&&r.width>0&&r.height>0&&r.top<v.bottom&&r.bottom>v.top&&r.left<v.right&&r.right>v.left;
    })()`),'visible first page from the real CDN',90000)
    report.firstImageMs=Math.round(performance.now()-firstImageStart)
    report.reader=await js(`({images:[...document.querySelectorAll('.reader-image img')].map(image=>({hasSource:Boolean(image.getAttribute('src')),width:image.naturalWidth,height:image.naturalHeight,status:image.parentElement.dataset.readerImageStatus})),pageCount:document.querySelector('[data-reader-progress]')?.textContent})`)
    assert.ok(report.reader.images.some(image=>image.width>0&&image.status==='ready'))
    report.assertions.push('first page is decoded and visible in the reader viewport after the verification view is removed; no net.fetch override')
    const downloadStart=performance.now()
    await js(`(async()=>{const detail=window.__packageLiveDetail.data,chapter=detail.chapters[0],result=await window.electronAPI.contentPages(chapter.url);if(!result.ok)throw Error(result.error);window.__packageLiveDownload=await window.electronAPI.downloadAdd({mangaId:detail.id,mangaTitle:detail.title,chapterIndex:chapter.index,chapterTitle:chapter.title,chapterUrl:chapter.url,coverUrl:detail.coverUrl,imageUrls:result.data.slice(0,3).map(page=>page.imageUrl),scrambleId:result.scrambleId});if(!window.__packageLiveDownload.ok)throw Error(window.__packageLiveDownload.error)})()`)
    await waitFor(()=>js(`window.electronAPI.downloadList().then(tasks=>tasks.find(task=>task.id===window.__packageLiveDownload.taskId)?.status==='completed')`),'same first three pages downloaded',90000)
    report.sameThreePagesDownloadMs=Math.round(performance.now()-downloadStart)
    report.downloadMeasurement='pipeline verification after reading prefetch; shared cache may be warm, not a cold-network comparison'
    report.assertions.push('the same first three CDN pages complete the download and descramble pipeline')
    report.performance=await js('window.electronAPI.performanceSnapshot()')
  }
  assert.deepEqual(runtimeErrors,[],'no uncaught main or renderer exceptions')
  await js('window.electronAPI.windowClose()').catch(error=>{if(!/closed/.test(String(error)))throw error})
  for(const client of clients)client.socket.close()
  const deadline=Date.now()+15000
  while(!exit&&Date.now()<deadline)await sleep(100)
  assert.ok(exit,'the EXE must exit after normal window close')
  assert.equal(exit.code,0)
  report.assertions.push('normal window close completes and exits the actual EXE with code 0')
} catch(error) {
  report.errors.push(String(error.stack||error))
  console.error(error)
  if(main)await main.evaluate("process.mainModule.require('electron').app.exit(1)").catch(()=>{})
} finally {
  for(const client of clients)client.socket.close()
  if(!exit)child.kill()
  writeFileSync(join(root,'process.log'),output)
  writeFileSync(join(evidence,'result.json'),JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report,null,2))
  if(report.errors.length)process.exitCode=1
}
