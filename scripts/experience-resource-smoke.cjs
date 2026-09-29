const assert=require('node:assert/strict')
const {writeFileSync}=require('node:fs')
const {join}=require('node:path')
module.exports=async({app,win,js,wait,clickSelector,screenshot,mark,evidence,report})=>{
  const gpu=await js('window.electronAPI.graphicsGet()')
  assert.equal(gpu.runningPreference,process.env.JM_QA_GRAPHICS==='on')
  await clickSelector('nav [aria-label="设置"]')
  await wait(`Boolean(document.querySelector('[aria-label="界面动画"]'))`,'animation preference')
  const animations=process.env.JM_QA_RESOURCE_MATRIX==='on'
  if(!animations) await clickSelector('[aria-label="界面动画"]')
  await wait(`document.documentElement.dataset.motion==='${animations?'on':'off'}'`,'requested motion state')
  await clickSelector('nav [aria-label="收藏"]');await screenshot('matrix-start')
  const samples=[]
  const sample=async phase=>({phase,processes:app.getAppMetrics().map(p=>({type:p.type,privateKB:p.memory.privateBytes,cpu:p.cpu.percentCPUUsage})),
    renderer:await js(`({readers:document.querySelectorAll('.reader-root').length,images:document.querySelectorAll('[data-reader-viewport] img,[data-reader-viewport] canvas').length,tabs:document.querySelectorAll('[data-reader-tab]').length,animations:document.getAnimations().filter(a=>a.playState==='running').length,animationDetails:document.getAnimations().filter(a=>a.playState==='running').map(a=>({name:a.animationName,target:a.effect?.target?.className,currentTime:a.currentTime,timing:a.effect?.getComputedTiming()})),heap:performance.memory?.usedJSHeapSize})`)})
  samples.push(await sample('before'))
  const started=performance.now()
  const cycles=Number(process.env.JM_QA_CYCLES||12), idleMs=Number(process.env.JM_QA_IDLE_MS||600)
  for(let i=0;i<cycles;i++){
    await clickSelector('[data-new-reader-tab]')
    await wait(`Boolean(document.querySelector('[data-reader-start]'))`,'start tab')
    assert.equal(await js(`document.querySelectorAll('.reader-root').length`),0)
    const id=await js(`document.querySelector('[data-reader-tab][aria-selected=true]').dataset.readerTab`)
    await clickSelector(`[data-close-reader="${id}"]`)
    await wait(`document.querySelectorAll('[data-reader-tab]').length===1 && document.querySelectorAll('.reader-root').length===1`,'single active reader')
    await clickSelector('[aria-label="收起阅读侧栏"]')
    await wait(`document.querySelector('[data-reader-workspace]').getBoundingClientRect().width===0`,'hidden')
    await clickSelector('[data-reader-visibility-toggle]')
    if(i%3===0)samples.push(await sample(`cycle-${i+1}`))
  }
  await screenshot('matrix-end')
  await new Promise(resolve=>setTimeout(resolve,idleMs))
  const after=await sample('settled');samples.push(after)
  writeFileSync(join(evidence,'samples.json'),JSON.stringify(samples,null,2))
  assert.equal(after.renderer.readers,1);assert.equal(after.renderer.tabs,1)
  assert.ok(after.renderer.images<=7,'virtual reader retains only nearby pages')
  assert.equal(after.renderer.animations,0,'no decorative animation remains running at idle')
  const result={scope:`Isolated hidden Electron, synthetic content, ${cycles} new/close/hide/show cycles and ${idleMs}ms idle. Includes test fixture memory; CPU is an instantaneous process sample, not a GPU utilization or presented-FPS measurement.`,cycles,idleMs,gpu,motion:animations,elapsedMs:Math.round(performance.now()-started),samples,
    peakPrivateMB:Math.max(...samples.map(s=>s.processes.reduce((n,p)=>n+p.privateKB,0)))/1024}
  report.resourceMatrix=result
  writeFileSync(join(evidence,'resource-matrix.json'),JSON.stringify(result,null,2))
  mark('GPU startup preference, animation independence, one active reader, bounded images and zero idle animations',{gpu,motion:animations,peakPrivateMB:result.peakPrivateMB})
}
