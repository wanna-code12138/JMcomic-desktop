import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Serialized into the actual EXE before its entrypoint. Only external I/O is substituted.
// No project module loader or production implementation is installed in the EXE.
export function installPackageFixture(exportPath, visible = false) {
  const { app, session, net, nativeImage, dialog } = process.mainModule.require('electron')
  app.on('browser-window-created', (_event, win) => {
    if (!visible) {
      win.show = () => {}
      win.showInactive = () => {}
    }
    win.setSkipTaskbar(true)
    win.webContents.setBackgroundThrottling(false)
  })
  const bitmap = Buffer.alloc(16 * 23 * 4)
  for (let y = 0; y < 23; y++) for (let x = 0; x < 16; x++) {
    const offset = (y * 16 + x) * 4
    bitmap.fill(y * 10, offset, offset + 3)
    bitmap[offset + 3] = 255
  }
  const png = nativeImage.createFromBitmap(bitmap, { width: 16, height: 23 }).toPNG()
  net.fetch = async (target, init = {}) => {
    const url = new URL(String(target))
    if(url.pathname.includes('/media/photos/267000/golden.png')) return new Response(png, { headers: { 'Content-Type': 'image/png' } })
    let data
    if(url.pathname==='/setting')data={jm3_version:'2.1.7',img_host:'cdn-msp.18comic.vip'}
    else if(url.pathname==='/album')data={id:url.searchParams.get('id'),name:'单篇打包验收',series:[]}
    else if(url.pathname==='/categories/filter'||url.pathname==='/search')data={total:1,content:[{id:'1477646',name:'单篇打包验收'}]}
    else if(url.pathname==='/comic_read')data={id:'267000',scramble_id:200000,total_page:1,images:['golden.png']}
    else return new Response('Synthetic offline response',{status:503})
    const {createHash,createCipheriv}=process.mainModule.require('node:crypto')
    const timestamp=new Headers(init.headers).get('tokenparam').split(',')[0]
    // Public protocol salt, identical to the API fixtures; this is not an account credential.
    const key=createHash('md5').update(timestamp+'185Hcomic3PAPP7R').digest('hex')
    const cipher=createCipheriv('aes-256-ecb',key,null)
    return new Response(JSON.stringify({code:200,data:Buffer.concat([cipher.update(JSON.stringify(data)),cipher.final()]).toString('base64')}),{headers:{'Content-Type':'application/json'}})
  }
  globalThis.fetch = async () => { throw Error('External fetch disabled during package fixture QA') }
  app.whenReady().then(() => session.defaultSession.protocol.handle('https', () => new Response(
    '<!doctype html><title>Package test fixture</title><a href="/album/104">合成测试目录</a>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )))
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportPath })
}

export async function testPackageFixture({ js, main, waitFor, click, clickElement, report, downloadDir }) {
  await waitFor(() => js(`window.electronAPI.contentWarmupStatus().then(state=>state.phase==='verified')`), 'synthetic startup verification')
  const standalone = await js(`window.electronAPI.contentDetail('1477646')`)
  assert.equal(standalone.ok, true, standalone.error)
  assert.deepEqual(standalone.data.chapters, [{index:0,title:'单篇打包验收',url:'/photo/1477646'}])
  await click('分类')
  const singleCard = `[...document.querySelectorAll('[data-page-id="categories"][data-current="true"] .manga-card')].find(node=>node.textContent.includes('单篇打包验收'))`
  await waitFor(() => js(`Boolean(${singleCard})`), 'packaged category standalone card')
  await clickElement(singleCard)
  await waitFor(() => js(`document.querySelector('[data-page-id="detail"][data-current="true"]')?.textContent.includes('章节列表 (1)')`), 'packaged single-chapter detail')
  report.assertions.push('actual EXE accepts empty-series standalone albums and opens their detail from the category card')
  await js(`window.electronAPI.settingsSet({downloadDir:${JSON.stringify(downloadDir)}})`)
  const added = await js(`window.electronAPI.downloadAdd({mangaId:'104',mangaTitle:'打包验收合成样章',chapterIndex:0,chapterTitle:'23行无损金样',chapterUrl:'/photo/267000',imageUrls:['https://cdn-msp.18comic.vip/media/photos/267000/golden.png'],scrambleId:200000})`)
  assert.equal(added.ok, true)
  await waitFor(() => js(`window.electronAPI.downloadList().then(tasks=>tasks.find(task=>task.id===${added.taskId})?.status==='completed')`), 'packaged download and descramble')
  const task = (await js('window.electronAPI.downloadList()')).find(task => task.id === added.taskId)
  const actualRows = await main.evaluate(`(()=>{const image=process.mainModule.require('electron').nativeImage.createFromPath(process.mainModule.require('path').join(${JSON.stringify(task.savePath)},${JSON.stringify(task.storageRelpath)},'0001.png'));const bitmap=image.toBitmap();return {size:image.getSize(),rows:Array.from({length:23},(_,y)=>bitmap[y*16*4])}})()`)
  assert.deepEqual(actualRows.size, { width: 16, height: 23 })
  assert.deepEqual(actualRows.rows, [180,190,200,210,220,160,170,140,150,120,130,100,110,80,90,60,70,40,50,20,30,0,10])
  const local = await js(`window.electronAPI.downloadChapterPages('104',0)`)
  assert.equal(local.ok, true)
  const dimensions = await js(`(async()=>{const image=new Image();image.src=${JSON.stringify(local.data[0].imageUrl)};await image.decode();return [image.naturalWidth,image.naturalHeight]})()`)
  assert.deepEqual(dimensions, [16,23])
  const exported = await js(`window.electronAPI.downloadExportCbz({taskId:${added.taskId}})`)
  assert.equal(exported.ok, true, exported.error)
  const archive = readFileSync(exported.path)
  const end = archive.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]))
  assert.ok(end >= 0)
  assert.equal(archive.readUInt16LE(end + 10), 1)
  report.assertions.push('actual EXE downloads, descrambles all 23 golden rows, decodes jmlocal and exports CBZ with packaged archiver')
  await click('下载')
  const card = text => `[...document.querySelectorAll('[role="button"]')].find(node=>node.textContent.includes(${JSON.stringify(text)})&&node.getBoundingClientRect().width>0)`
  await waitFor(() => js(`Boolean(${card('打包验收合成样章')})`), 'packaged download library')
  await clickElement(card('打包验收合成样章'))
  await waitFor(() => js(`Boolean(${card('23行无损金样')})`), 'packaged offline chapter')
  await clickElement(card('23行无损金样'))
  await waitFor(() => js(`Boolean(document.querySelector('[data-reader-viewport] [data-index="0"] .reader-image[data-reader-image-status="ready"]'))`), 'packaged offline reader first page')
  assert.equal(await js(`document.querySelector('.reader-root').dataset.readerSource`), 'local')
  const imageState = await js(`(()=>{const image=document.querySelector('[data-reader-viewport] [data-index="0"] img'),r=image.getBoundingClientRect(),v=document.querySelector('[data-reader-viewport]').getBoundingClientRect();return {width:image.naturalWidth,height:image.naturalHeight,visible:getComputedStyle(image).visibility==='visible'&&r.width>0&&r.top<v.bottom&&r.bottom>v.top}})()`)
  assert.deepEqual(imageState, { width:16, height:23, visible:true })
  report.assertions.push('actual pointer input opens the downloaded chapter and its first page is visible in the production reader')
  assert.equal(await js(`Boolean(document.querySelector('.reader-toolbar,.reader-footer,.reader-quiet-progress'))`), false)
  await click('显示阅读工具')
  await waitFor(() => js(`Boolean(document.querySelector('.reader-toolbar'))`), 'packaged manual tools')
  assert.ok(await js(`document.querySelector('.reader-toolbar').getBoundingClientRect().bottom<=document.querySelector('[data-reader-viewport]').getBoundingClientRect().top+1`))
  await click('隐藏阅读工具')
  await waitFor(() => js(`!document.querySelector('.reader-toolbar')`), 'packaged collapsed tools')
  await js(`void(window.__packageReader=document.querySelector('.reader-root'))`)
  await click('收起阅读侧栏')
  await waitFor(() => js(`document.querySelector('[data-reader-workspace]').getBoundingClientRect().width===0`), 'packaged side pane hidden')
  assert.equal(await js(`document.querySelectorAll('[data-reader-tab]').length`), 1)
  await click('显示阅读侧栏')
  await waitFor(() => js(`document.querySelector('[data-reader-workspace]').getBoundingClientRect().width>0 && document.querySelector('[data-reader-progress]')?.dataset.currentPage==='1'`), 'packaged side pane restored')
  assert.ok(await js(`window.__packageReader===document.querySelector('.reader-root')`))
  await clickElement(`document.querySelector('[data-close-reader="local:104"]')`)
  await waitFor(() => js(`!document.querySelector('[data-reader-workspace]')`), 'packaged tab X closes last book')
  report.assertions.push('actual EXE has manual docked tools, preserves its book while hidden and closes its last tab with X')
  const pdfAdded=await js(`window.electronAPI.downloadPdfAdd({mangaId:'104',mangaTitle:'打包验收合成样章',chapters:[{index:0,title:'23行无损金样',url:'/photo/267000'}]})`)
  assert.equal(pdfAdded.ok,true,pdfAdded.error)
  await waitFor(()=>js(`window.electronAPI.downloadPdfList().then(rows=>rows.find(row=>row.id===${pdfAdded.taskId})?.status==='completed')`),'packaged PDF worker and PDFKit dependencies')
  const pdf=(await js('window.electronAPI.downloadPdfList()')).find(row=>row.id===pdfAdded.taskId)
  assert.equal(pdf.totalPages,1);assert.equal(pdf.savePath,downloadDir)
  const bytes=readFileSync(process.platform==='win32'?`${pdf.savePath}\\${pdf.outputFile}`:`${pdf.savePath}/${pdf.outputFile}`)
  assert.ok(bytes.subarray(0,5).equals(Buffer.from('%PDF-')))
  assert.equal((bytes.toString('latin1').match(/\/Type \/Page\b/g)||[]).length,1)
  report.assertions.push('actual EXE launches its packaged PDF worker, restores scrambled pixels, and publishes a root-level PDF with packaged PDFKit')
}
