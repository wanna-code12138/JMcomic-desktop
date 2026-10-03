// Real Chromium measurements; all content and persistence come from reader-smoke's isolated fixture.
const assert = require('node:assert/strict')
const { writeFileSync, readFileSync, statSync } = require('node:fs')
const { join, resolve } = require('node:path')

module.exports = async ({win,js,wait,clickText,clickSelector,showTools,screenshot,mark,evidence,report}) => {
  const observations = { themes: [], motion: {} }
  const violations = []
  const check = (ok, message) => { if (!ok) violations.push(message) }
  const capture = async name => {
    await screenshot(name)
    assert.ok(statSync(join(evidence, `${name}.png`)).size > 1000, `Screenshot must exist: ${name}`)
  }
  win.setSize(1280,860)
  await wait(`innerWidth === ${win.getContentSize()[0]}`, 'visual baseline window size')
  await showTools()
  // Sample immediately after an action; ordinary click/screenshot helpers wait for animation completion.
  const motion = async (name, action) => {
    await js(`new Promise(resolve=>setTimeout(resolve,300))`)
    observations.motion[name] = await js(`(async()=>{
      const recorded=new Map(), original=Element.prototype.animate;
      const sample=()=>document.getAnimations().filter(a => a.effect.target?.matches('.reader-toolbar,.workspace-menu,.app-page-surface,.browse-pane,.reading-pane,.app-navigation-slot') && a.effect.getTiming().iterations !== Infinity)
        .forEach(a=>recorded.set(a,{kind:a.animationName || a.transitionProperty || 'WAAPI',
          target:a.effect.target?.classList.contains('reader-toolbar')?'reader-toolbar':
            a.effect.target?.classList.contains('workspace-menu')?'workspace-menu':
            a.effect.target?.dataset.pageId || a.effect.target?.getAttribute('data-reader-workspace') || a.effect.target?.tagName,
          timing:((t)=>({duration:t.duration,delay:t.delay,easing:t.easing,fill:t.fill,iterations:t.iterations}))(a.effect.getTiming()),
          frames:a.effect.getKeyframes().map(f=>Object.fromEntries(['offset','easing','composite','opacity','transform'].filter(k=>k in f).map(k=>[k,f[k]])))}));
      Element.prototype.animate=function(...args){const a=original.apply(this,args);sample();return a};
      document.addEventListener('animationstart',sample,true); document.addEventListener('transitionrun',sample,true);
      try { ${action}; await new Promise(resolve=>setTimeout(resolve,350)); }
      finally { Element.prototype.animate=original;document.removeEventListener('animationstart',sample,true);document.removeEventListener('transitionrun',sample,true); }
      return [...recorded.values()]
        .filter(a=>!['background-color','border-color','box-shadow','color'].includes(a.kind))
        .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
    })()`)
    await wait(`document.getAnimations().every(a=>a.playState!=='running'||a.effect.getTiming().iterations===Infinity)`, `${name} settled`)
  }
  observations.motion.geometry = await js(`(()=>{const height=s=>Math.round(document.querySelector(s).getBoundingClientRect().height*1000)/1000;return {header:height('.reader-workspace-header'),toolbar:height('.reader-toolbar'),tabsPadding:getComputedStyle(document.querySelector('.reader-tabs')).paddingTop}})()`)
  assert.deepEqual(observations.motion.geometry,{header:44,toolbar:40,tabsPadding:'5px'})
  await motion('toolsOut', `document.querySelector('[data-reader-tools-toggle]').click()`)
  await motion('toolsIn', `document.querySelector('[data-reader-tools-toggle]').click()`)
  await motion('menuIn', `document.querySelector('[data-reader-tab]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:860,clientY:80}))`)
  await motion('menuOut', `document.querySelector('.workspace-menu').dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Escape'}))`)
  await clickSelector('nav [aria-label="设置"]')
  await motion('pageSwitch', `document.querySelector('nav [aria-label="收藏"]').click()`)
  await motion('readerHide', `document.querySelector('[aria-label="收起阅读侧栏"]').click()`)
  await motion('readerShow', `document.querySelector('[data-reader-visibility-toggle]').click()`)
  writeFileSync(join(evidence,'motion-observations.json'),JSON.stringify(observations.motion,null,2))
  for (const key of ['toolsOut','toolsIn','menuIn','menuOut','pageSwitch','readerHide','readerShow']) {
    assert.ok(observations.motion[key].length, `${key} must have a recorded animation`)
  }
  if (process.env.JM_QA_VISUAL === 'motion-only') { mark('runtime motion baseline captured',observations.motion);return }
  await clickSelector('[aria-label="收起阅读侧栏"]')
  for (const theme of ['light','dark']) {
    await clickSelector('nav [aria-label="设置"]')
    await clickText(theme==='light'?'浅色':'深色')
    await wait(`Boolean(document.querySelector('.ui-${theme}'))`, `${theme} theme`)
    const sample = { theme, widths: [], contrast: [] }
    for (const width of [672,480,300]) {
      if (!await js(`Boolean(document.querySelector('[data-reader-workspace]')?.getBoundingClientRect().width)`)) await clickSelector('[data-reader-visibility-toggle]')
      // Exercise the existing width variable, without mutating product code or replacing its layout engine.
      await js(`document.querySelector('[data-browse-pane]').style.setProperty('--browse-width','${width}px');document.querySelector('.settings-page').scrollTop=0`)
      const rows = await js(`(()=>{const root=document.querySelector('.settings-page');const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
        return {width:document.querySelector('[data-browse-pane]').getBoundingClientRect().width,overflow:root.scrollWidth-root.clientWidth,
          switches:[...root.querySelectorAll('.fui-Switch')].map(s=>({text:rect(s.parentElement.firstElementChild),control:rect(s),label:s.parentElement.firstElementChild.textContent})),
          cards:[...root.querySelectorAll('.fui-Card')].slice(0,2).map(rect)}})()`)
      sample.widths.push(rows)
      check(Math.abs(rows.width-width)<=1, `${theme}: browse must reach ${width}px`)
      check(rows.overflow<=1, `${theme}/${width}: no horizontal settings overflow (${rows.overflow})`)
      rows.switches.forEach(row=>check(row.control.x>=row.text.right-1 && row.control.y<row.text.bottom && row.control.bottom>row.text.y,
        `${theme}/${width}: switch stays beside its description (${row.label.slice(0,24)})`))
      check(Math.abs(rows.cards[1].y-rows.cards[0].bottom)<=1, `${theme}/${width}: adjacent settings share a divider`)
      await capture(`settings-${theme}-${width}`)
    }
    await js(`document.querySelector('[data-browse-pane]').style.removeProperty('--browse-width')`)
    await clickSelector('[aria-label="收起阅读侧栏"]')
    await capture(`settings-${theme}-wide`)
    await clickSelector('[aria-label="Mica 云母材质"]')
    await wait(`Boolean(document.querySelector('[aria-label="纯色不透明窗口"]'))`,'solid setting exposed')
    if (!await js(`document.querySelector('[aria-label="纯色不透明窗口"]').checked`)) await clickSelector('[aria-label="纯色不透明窗口"]')
    await wait(`Boolean(document.querySelector('.ui-solid'))`,'solid theme applied')
    await capture(`settings-${theme}-solid`)
    await clickSelector('[aria-label="纯色不透明窗口"]')
    await wait(`!document.querySelector('.ui-solid')`,'acrylic option applied')
    await capture(`settings-${theme}-acrylic`)
    await clickSelector('[aria-label="Mica 云母材质"]')
    await clickText('配置…')
    await capture(`preferences-dialog-${theme}`)
    await clickText('取消')
    for (const [nav,id] of [['首页','home'],['分类','categories'],['搜索','search'],['收藏','favorites'],['下载','downloads']]) {
      await clickSelector(`nav [aria-label="${nav}"]`)
      await wait(`Boolean(document.querySelector('[data-page-id="${id}"][data-current="true"]'))`, `${id} ready`)
      await capture(`${id}-${theme}`)
      await clickSelector('[data-reader-visibility-toggle]')
      await js(`document.querySelector('[data-browse-pane]').style.setProperty('--browse-width','300px')`)
      const bounds=await js(`(()=>{const root=document.querySelector('[data-page-id="${id}"][data-current="true"]').firstElementChild;return {client:root.clientWidth,scroll:root.scrollWidth}})()`)
      check(bounds.scroll<=bounds.client+1,`${theme}/${id}/300: no horizontal overflow (${bounds.scroll-bounds.client})`)
      await capture(`${id}-${theme}-300`)
      await js(`document.querySelector('[data-browse-pane]').style.removeProperty('--browse-width')`)
      await clickSelector('[aria-label="收起阅读侧栏"]')
    }
    await clickSelector('nav [aria-label="收藏"]')
    await js(`[...document.querySelectorAll('.manga-card')].find(e=>e.textContent.includes('山间来信') && e.getBoundingClientRect().width>0).click()`)
    await wait(`Boolean(document.querySelector('.manga-detail-title'))`, 'detail ready')
    sample.contrast = await js(`(()=>{
      const lum=c=>{const v=c.map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2]};
      const parse=c=>c.match(/[\\d.]+/g).map(Number);const blend=(a,b)=>a.slice(0,3).map((n,i)=>n*(a[3]??1)+b[i]*(1-(a[3]??1)));
      const bg=e=>{const chain=[];for(let p=e;p;p=p.parentElement)chain.unshift(p);return chain.reduce((c,p)=>blend(parse(getComputedStyle(p).backgroundColor),c),[255,255,255])};
      return [...document.querySelectorAll('[data-current="true"] .fui-Badge')].map(e=>{const c=getComputedStyle(e),b=bg(e),f=blend(parse(c.color),b),l=[lum(f),lum(b)].sort((a,b)=>b-a);return {text:e.textContent,ratio:(l[0]+.05)/(l[1]+.05),foreground:c.color,background:c.backgroundColor}})
    })()`)
    assert.ok(sample.contrast.length,'Synthetic detail must include tags')
    sample.contrast.forEach(c=>check(c.ratio>=4.5,`${theme}: tag ${c.text} contrast ${c.ratio.toFixed(2)} must reach 4.5`))
    await capture(`detail-${theme}`)
    await clickText('选择格式…')
    await wait(`Boolean(document.querySelector('.fui-DialogSurface'))`,'chapter picker')
    await capture(`chapters-dialog-${theme}`)
    await clickText('下载 (2)')
    await wait(`Boolean(document.querySelector('[data-download-format-dialog][open]'))`,'native format dialog')
    await capture(`format-dialog-${theme}`)
    await clickText('取消')
    await clickSelector('[aria-label="新建阅读标签"]')
    await wait(`Boolean(document.querySelector('[data-reader-start]'))`,'start page')
    await capture(`start-${theme}`)
    const startId=await js(`document.querySelector('[data-reader-tab][aria-selected=true]').dataset.readerTab`)
    await clickSelector(`[data-close-reader="${startId}"]`)
    await clickSelector('[aria-label="收起阅读侧栏"]')
    await clickSelector('nav [aria-label="设置"]');await clickText('打开诊断页')
    await capture(`diagnostics-${theme}`)
    observations.themes.push(sample)
  }
  await clickSelector('nav [aria-label="设置"]')
  win.webContents.debugger.attach('1.3')
  try {
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'forced-colors',value:'active'}]})
    assert.equal(await js(`matchMedia('(forced-colors: active)').matches`),true)
    await capture('settings-forced-colors')
    assert.ok(await js(`(()=>{const s=getComputedStyle(document.querySelector('.settings-group'));return s.borderTopColor!==s.backgroundColor})()`),'forced colors retain group boundaries')
  } finally { await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[]});win.webContents.debugger.detach() }
  const baseline = process.env.JM_QA_MOTION_BASELINE
  writeFileSync(join(evidence,'visual-observations.json'),JSON.stringify({...observations,violations},null,2))
  if (baseline) { const prior=JSON.parse(readFileSync(resolve(baseline),'utf8'));assert.deepEqual(observations.motion,prior.motion??prior,'Runtime motion timing and geometry must match the baseline') }
  report.visual = { observations:'visual-observations.json', violations }
  mark('visual measurements and screenshots captured', { themes:observations.themes.length, violations })
  assert.deepEqual(violations,[], 'Visual requirements must hold at all tested widths and themes')
}
