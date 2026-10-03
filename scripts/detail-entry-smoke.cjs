const assert = require('node:assert/strict')

module.exports = async ({win,js,wait,clickSelector,clickText,screenshot,mark,report,detailEntries}) => {
  const rows = report.detailEntries = []
  const detailSelector = '[data-page-id="detail"][data-current="true"]'
  await wait(`window.electronAPI.contentWarmupStatus().then(state=>state.phase==='verified')`, 'synthetic verification completes')
  async function verifyRetry() {
    await clickText('分类')
    await wait(`Boolean([...document.querySelectorAll('.app-page-surface[data-current="true"] .manga-card')].find(e=>e.textContent.includes('短暂失败后恢复样本')))`, 'transient card')
    await js(`[...document.querySelectorAll('.app-page-surface[data-current="true"] .manga-card')].find(e=>e.textContent.includes('短暂失败后恢复样本')).click()`)
    await wait(`document.querySelector('${detailSelector}')?.innerText.includes('加载失败')`, 'transient API and browser failure')
    await clickText('重新加载')
    await wait(`document.querySelector('${detailSelector}')?.innerText.includes('开始阅读')`, 'retry recovers on same detail')
    mark('visible retry recovers the same album without leaving detail')
  }
  if (process.env.JM_QA_DETAIL_RETRY_ONLY) { await verifyRetry(); return }
  for (const entry of ['分类', '首页', '新标签页']) {
    for (const id of ['110001', '110002']) {
      if (entry === '新标签页') {
        await clickText('首页')
        await wait(`Boolean(document.querySelector('[data-page-id="home"][data-current="true"]'))`, 'leave previous detail before new-tab navigation')
        await clickSelector('[aria-label="新建阅读标签"]')
        await wait(`document.activeElement===document.querySelector('[data-reader-start] input')`, 'new tab input receives focus')
        await win.webContents.insertText(`JM${id}`)
        await clickSelector('[data-reader-start] button[type="submit"]')
      } else {
        await clickText(entry)
        await wait(`Boolean([...document.querySelectorAll('.app-page-surface[data-current="true"] .manga-card')].find(e=>e.textContent.includes(${JSON.stringify(detailEntries.titles[id])})))`, `${entry} card`)
        await js(`[...document.querySelectorAll('.app-page-surface[data-current="true"] .manga-card')].find(e=>e.textContent.includes(${JSON.stringify(detailEntries.titles[id])})).click()`)
      }
      await wait(`(()=>{const e=document.querySelector('${detailSelector}');return e&&(e.innerText.includes('加载失败')||e.innerText.includes('开始阅读'))})()`, `${entry} detail resolves`)
      const text = await js(`document.querySelector('${detailSelector}').innerText`)
      rows.push({ entry, id, ok: text.includes('开始阅读') && text.includes(detailEntries.titles[id]), error: text.includes('加载失败') ? text.slice(0, 250) : undefined })
      mark('detail entry observed', rows.at(-1))
    }
  }
  await screenshot('same-book-entry-matrix')
  assert.ok(rows.every(row=>row.ok), `All three entries must load both shapes: ${JSON.stringify(rows)}`)
  assert.equal(detailEntries.browserDetails.length, 0, 'valid empty-series albums must succeed via API without browser fallback')
  await clickText('开始阅读')
  await wait(`Boolean(document.querySelector('[data-reader-image-status="ready"]'))`, 'single album opens reader')
  assert.equal(await js(`document.querySelector('.reader-root').dataset.readerSource`), 'online')
  assert.equal((await js(`window.electronAPI.contentPages('/photo/110002')`)).data.length, 3)
  mark('single album chapter enters the reader and exposes the correct pages')
  await verifyRetry()
  const fallback = await js(`window.electronAPI.contentDetail('110004')`)
  assert.equal(fallback.ok, true, fallback.error)
  assert.equal(fallback.data.chapters[0].url, '/photo/110004')
  mark('genuine API failure still falls back to a valid browser detail')
  assert.equal(report.errors.length, 0, report.errors.join('\n'))
}
