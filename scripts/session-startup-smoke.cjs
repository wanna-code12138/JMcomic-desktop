// Real WebContentsView / DOM verification with a local age-confirmation fixture.
const { app, BrowserWindow, session, webContents } = require('electron')
const { mkdirSync, writeFileSync } = require('node:fs')
const { resolve, join } = require('node:path')
const assert = require('node:assert/strict')
require('tsx/cjs')
const runId = process.env.JM_QA_RUN || 'startup-verification'
const root = resolve('work', runId)
const evidence = resolve('outputs/reader-qa', runId)
for (const name of ['userData','sessionData','temp']) {
  const location=join(root,name); mkdirSync(location,{recursive:true}); app.setPath(name,location)
}
mkdirSync(evidence,{recursive:true})
process.env.PORTABLE_EXECUTABLE_DIR=root
const report={assertions:[],errors:[]}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const watchdog=setTimeout(()=>{console.error('Verification test timed out');app.exit(1)},20000)
app.whenReady().then(async()=>{
  const {loadModule}=require('../src/main/__tests__/helpers/loadModule.ts')
  const {createWarmupCoordinator}=loadModule('src/main/sessionWarmup.ts',{})
  await session.defaultSession.protocol.handle('https',()=>new Response(`<!doctype html><title>网站访问年龄确认</title>
    <div id="age"><h1>请确认已满18岁</h1><p>${'访问前请阅读并确认。'.repeat(90)}</p>
    <button onclick="document.querySelector('#age').remove()">我已滿18歲</button></div>
    <a href="/album/101">我18岁之后的日记</a>`,{headers:{'Content-Type':'text/html; charset=utf-8'}}))
  const host=new BrowserWindow({show:false,width:1280,height:860})
  await host.loadURL('about:blank')
  const coordinator=createWarmupCoordinator()
  const pending=coordinator.ensureWarmup('startup',host)
  await sleep(4200)
  assert.equal(coordinator.getWarmupState().phase,'verifying','an age-confirmation page is not verified merely because its title/body is long')
  const page=webContents.getAllWebContents().find(contents=>contents.getURL().startsWith('https://18comic.vip'))
  assert.ok(page,'the startup verification view remains available for the user')
  await page.executeJavaScript("document.querySelector('#age button').click()")
  assert.equal((await pending).phase,'verified')
  report.assertions.push('age confirmation remains visible until the fixture user confirms; known content then completes startup')
  assert.equal(host.contentView.children.length,0,'the finished verification view is detached')
  assert.strictEqual(coordinator.ensureWarmup('browser-fallback',host) instanceof Promise,true)
  assert.equal((await coordinator.ensureWarmup('browser-fallback',host)).phase,'verified')
  host.destroy()
}).catch(error=>{report.errors.push(String(error.stack||error));console.error(error)}).finally(()=>{
  clearTimeout(watchdog)
  writeFileSync(join(evidence,'result.json'),JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report))
  app.exit(report.errors.length?1:0)
})
