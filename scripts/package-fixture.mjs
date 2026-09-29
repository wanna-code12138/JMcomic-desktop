import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Serialized into the actual EXE before its entrypoint. Only external I/O is substituted.
// No project module loader or production implementation is installed in the EXE.
export function installPackageFixture(exportPath) {
  const { app, session, net, nativeImage, dialog } = process.mainModule.require('electron')
  const bitmap = Buffer.alloc(16 * 23 * 4)
  for (let y = 0; y < 23; y++) for (let x = 0; x < 16; x++) {
    const offset = (y * 16 + x) * 4
    bitmap.fill(y * 10, offset, offset + 3)
    bitmap[offset + 3] = 255
  }
  const png = nativeImage.createFromBitmap(bitmap, { width: 16, height: 23 }).toPNG()
  net.fetch = async url => String(url).includes('/media/photos/267000/golden.png')
    ? new Response(png, { headers: { 'Content-Type': 'image/png' } })
    : new Response('Synthetic offline response', { status: 503 })
  globalThis.fetch = async () => { throw Error('External fetch disabled during package fixture QA') }
  app.whenReady().then(() => session.defaultSession.protocol.handle('https', () => new Response(
    '<!doctype html><title>Package test fixture</title><a href="/album/104">合成测试目录</a>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )))
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportPath })
}

export async function testPackageFixture({ js, main, waitFor, click, clickElement, report, downloadDir }) {
  await waitFor(() => js(`window.electronAPI.contentWarmupStatus().then(state=>state.phase==='verified')`), 'synthetic startup verification')
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
  assert.ok(await js(`document.querySelector('.reader-heading').textContent.includes('离线阅读')`))
  const imageState = await js(`(()=>{const image=document.querySelector('[data-reader-viewport] [data-index="0"] img'),r=image.getBoundingClientRect(),v=document.querySelector('[data-reader-viewport]').getBoundingClientRect();return {width:image.naturalWidth,height:image.naturalHeight,visible:getComputedStyle(image).visibility==='visible'&&r.width>0&&r.top<v.bottom&&r.bottom>v.top}})()`)
  assert.deepEqual(imageState, { width:16, height:23, visible:true })
  report.assertions.push('actual pointer input opens the downloaded chapter and its first page is visible in the production reader')
}
