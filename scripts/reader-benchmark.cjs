const assert = require('node:assert/strict')
const { writeFileSync,readFileSync,readdirSync } = require('node:fs')
const { join } = require('node:path')
const { createHash } = require('node:crypto')
const delay = ms=>new Promise(resolve=>setTimeout(resolve,ms))
const stats = values=>{
  const a=[...values].sort((x,y)=>x-y),pick=q=>Number((a[Math.max(0,Math.ceil(a.length*q)-1)]||0).toFixed(2))
  return {n:a.length,p50:pick(.5),p95:pick(.95),max:pick(1)}
}
module.exports = async ({app,win,js,wait,clickText,session,rendererEvents,report,evidence,advanceFixture})=>{
  const variants=(process.env.JM_QA_BENCH||'baseline').split(',')
  const repeats=Number(process.env.JM_QA_REPEATS||10)
  const os=require('node:os'),hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex')
  const rendererRoot=join(__dirname,'../out/renderer/assets')
  report.benchmark={versions:process.versions,gpu:app.getGPUFeatureStatus(),environment:{cpu:os.cpus()[0].model,logicalCores:os.cpus().length,totalMemoryBytes:os.totalmem(),platform:os.platform(),release:os.release(),windowBounds:win.getBounds()},
    buildHash:hash(join(__dirname,'../out/main/index.js')),rendererHashes:Object.fromEntries(readdirSync(rendererRoot).sort().map(file=>[file,hash(join(rendererRoot,file))])),
    fixture:report.fixture,scope:'Same-process repeated reading; all visible rAF intervals, not compositor presentation timing. Unique cold URLs bypass Chromium decoded-image cache. Process memory includes synthetic fixture and test harness.',samples:[]}
  await js(`window.electronAPI.settingsSet({readerMode:'scroll',readerFit:'width',readerZoom:1,readerMaxWidth:960,readerAutoHide:false})`)
  await js(`window.electronAPI.favoritesAdd({mangaId:'101',title:'山间来信 · 合成阅读样章',coverUrl:'https://cdn-msp.18comic.vip/media/albums/101.png'})`)
  await clickText('收藏')
  await wait(`Boolean([...document.querySelectorAll('.manga-card')].find(e=>e.getBoundingClientRect().width>0))`,'benchmark favorite')
  await js(`[...document.querySelectorAll('.manga-card')].find(e=>e.getBoundingClientRect().width>0).click()`)
  await wait(`Boolean([...document.querySelectorAll('button')].find(e=>e.textContent==='开始阅读'))`,'benchmark detail')
  const memory=()=>app.getAppMetrics().map(m=>({pid:m.pid,type:m.type,creationTime:m.creationTime,privateKb:m.memory.privateBytes,workingSetKb:m.memory.workingSetSize}))
  const readable = `(index,start)=>new Promise((resolve,reject)=>{const deadline=performance.now()+15000;const frame=()=>{const viewport=document.querySelector('[data-reader-viewport]');const page=viewport?.querySelector('[data-index="'+index+'"]');const image=page?.querySelector('[data-reader-image-status="ready"]');const r=page?.getBoundingClientRect(),v=viewport?.getBoundingClientRect();if(image && r && v && r.bottom>v.top+96 && r.top<v.bottom){requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(performance.now()-start)));return}if(performance.now()>deadline){reject(Error('first visible timeout '+index));return}requestAnimationFrame(frame)};requestAnimationFrame(frame)})`
  // JIT and module imports are warmed once, outside all comparisons.
  await clickText('开始阅读');await js(`(${readable})(0,performance.now())`)
  await js(`document.querySelector('.reader-toolbar button').click()`);await delay(150)
  for(let repeat=0;repeat<repeats;repeat++) for(const variant of (repeat%2?[...variants].reverse():variants)) {
    const cold=!variant.includes('warm'),solid=variant.includes('solid')
    const overscan=Number(variant.match(/overscan([012])/)?.[1] ?? 2)
    await js(`window.__readerQaOverscan=${overscan}`)
    await js(`window.electronAPI.settingsSet({micaEnabled:${!solid},solidWindow:${solid}})`)
    await js(`window.electronAPI.historyRemoveLocal('101')`)
    if(cold){advanceFixture();await js(`window.electronAPI.cacheClearAll()`);await session.defaultSession.clearCache()}
    await delay(100)
    const before={...report.network},eventsStart=rendererEvents.length,mem=[{time:performance.now(),processes:memory()}]
    const timer=setInterval(()=>mem.push({time:performance.now(),processes:memory()}),250)
    const firstVisibleMs=await js(`(()=>{const started=performance.now();[...document.querySelectorAll('button')].find(e=>e.textContent==='开始阅读').click();return (${readable})(0,started)})()`)
    const firstMounted=await js(`[...document.querySelectorAll('[data-reader-viewport] [data-index]')].map(e=>Number(e.dataset.index))`)
    assert.equal(firstMounted.length,overscan+1,'the fixture exposes one visible long page and the selected overscan window')
    const demandMs=[],pageDelayMs=variant.includes('fast')?50:250
    for(const index of [1,2]) {
      await delay(pageDelayMs)
      demandMs.push(await js(`(()=>{const started=performance.now();const viewport=document.querySelector('[data-reader-viewport]');viewport.focus();window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));return (${readable})(${index},started)})()`))
    }
    const traceStart=rendererEvents.length
    await js(`new Promise(resolve=>{const viewport=document.querySelector('[data-reader-viewport]'),start=performance.now(),top=viewport.scrollTop;const frame=()=>{const t=performance.now()-start;viewport.scrollTop=top+Math.min(t/1500,1)*5000;if(t>=1500)resolve();else requestAnimationFrame(frame)};requestAnimationFrame(frame)})`)
    const trace=rendererEvents.slice(traceStart),all=rendererEvents.slice(eventsStart)
    clearInterval(timer)
    await js(`document.querySelector('.reader-toolbar button').click()`)
    await delay(250)
    const residual=memory()
    const sample={variant,repeat,overscan,pageDelayMs,firstMounted,firstVisibleMs,demandMs,frames:stats(trace.filter(e=>e.name==='renderer.frame-interval').map(e=>e.elapsedMs)),
      longTasks:trace.filter(e=>e.name==='renderer.long-task').map(e=>e.elapsedMs),canvas:stats(all.filter(e=>e.name==='reader.canvas'&&e.phase==='finish'&&e.metadata.scrambled).map(e=>e.elapsedMs)),
      network:Object.fromEntries(Object.keys(before).map(key=>[key,report.network[key]-before[key]])),memory:mem,residual,events:all}
    assert.ok(sample.frames.n>30,'all visible frame intervals must be captured')
    assert.ok(sample.canvas.n>0,'benchmark must exercise the real scrambled canvas path')
    if(cold)assert.ok(sample.network.bytes>0,'unique cold URLs must force actual fixture transfer, bypassing decoded Chromium cache')
    report.benchmark.samples.push(sample)
    writeFileSync(join(evidence,'benchmark.json'),JSON.stringify(report.benchmark,null,2))
    console.log(`BENCH ${variant} ${repeat+1}/${repeats}: visible=${firstVisibleMs.toFixed(1)}ms frames-p95=${sample.frames.p95}ms bytes=${sample.network.bytes}`)
  }
  report.benchmark.summary={}
  for(const variant of variants){const s=report.benchmark.samples.filter(s=>s.variant===variant);report.benchmark.summary[variant]={firstVisible:stats(s.map(s=>s.firstVisibleMs)),pageDemand:stats(s.flatMap(s=>s.demandMs)),frameP95PerTrial:stats(s.map(s=>s.frames.p95)),canvasP95PerTrial:stats(s.map(s=>s.canvas.p95)),bytes:stats(s.map(s=>s.network.bytes)),peakPrivateKb:stats(s.map(s=>Math.max(...s.memory.map(m=>m.processes.reduce((sum,p)=>sum+p.privateKb,0))))),residualPrivateKb:stats(s.map(s=>s.residual.reduce((sum,p)=>sum+p.privateKb,0)))}}
  writeFileSync(join(evidence,'benchmark.json'),JSON.stringify(report.benchmark,null,2))
  console.log(JSON.stringify(report.benchmark.summary))
}
