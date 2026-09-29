const assert = require('node:assert/strict')

module.exports = async ({ win, js, wait, clickText, clickSelector, screenshot, mark }) => {
  await clickText('设置')
  await wait(`Boolean([...document.querySelectorAll('button')].find(e => e.textContent === '清空缓存'))`, 'settings page loaded')
  await js(`window.__layoutReader = document.querySelector('.reader-root')`)
  const measure = () => js(`(() => {
    const button = [...document.querySelectorAll('button')].find(e => e.textContent === '清空缓存');
    let scroll = button.parentElement;
    while (scroll && !['auto', 'scroll'].includes(getComputedStyle(scroll).overflowY)) scroll = scroll.parentElement;
    if (!scroll) throw Error('No settings scroll container');
    window.__settingsScroll = scroll;
    const rect = e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width }; };
    return { browse: rect(document.querySelector('[data-browse-pane]')), scroll: rect(scroll),
      windowWidth: innerWidth, scrollTop: scroll.scrollTop, horizontalOverflow: scroll.scrollWidth - scroll.clientWidth,
      readerWidth: document.querySelector('[data-reader-workspace]').getBoundingClientRect().width,
      sameReader: window.__layoutReader === document.querySelector('.reader-root') };
  })()`)
  const samples = []
  for (const width of [1280, 960, 1600]) {
    win.setSize(width, 860)
    const contentWidth = win.getContentSize()[0]
    await wait(`Math.abs(innerWidth - ${contentWidth}) <= 1`, `window resized (requested ${width}, native content ${contentWidth})`)
    await clickText('收起阅读侧栏')
    await wait(`document.querySelector('[data-reader-workspace]').getBoundingClientRect().width === 0`, 'reading pane hidden')
    const hidden = await measure()
    samples.push({ width, state: 'hidden', ...hidden })
    await js(`window.__settingsScroll.scrollTop = window.__settingsScroll.scrollHeight`)
    await screenshot(`settings-hidden-${width}`)
    assert.ok(Math.abs(hidden.browse.right - hidden.windowWidth) <= 1, `browse pane must reclaim the reading pane: ${JSON.stringify(hidden)}`)
    assert.ok(Math.abs(hidden.scroll.right - hidden.browse.right) <= 1,
      `settings scrollbar must return to the browse pane's right edge after hiding the reader: ${JSON.stringify(hidden)}`)
    assert.ok(hidden.horizontalOverflow <= 1, 'settings must not scroll horizontally')
    assert.ok(hidden.sameReader, 'hiding must preserve the reader session')
    const scrolled = await measure()
    assert.ok(scrolled.scrollTop > 0, 'the full-width settings viewport must still scroll')
    const about = await js(`(() => { const e = [...document.querySelectorAll('span')].find(e => e.textContent === '关于'); const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; })()`)
    assert.ok(about.top >= 32 && about.bottom <= 860, 'the About section remains reachable')
    await clickText('显示阅读侧栏')
    await wait(`document.querySelector('[data-reader-workspace]').getBoundingClientRect().width >= 480`, 'reading pane restored')
    const shown = await measure()
    samples.push({ width, state: 'shown', ...shown })
    assert.ok(Math.abs(shown.scroll.right - shown.browse.right) <= 1, 'settings scrollbar tracks the narrower browsing pane')
    assert.ok(shown.sameReader, 'restoring must preserve the reader session')
  }
  await clickText('收起阅读侧栏')
  await clickSelector('nav [aria-label="展开导航"]')
  const expandedNavigation = await measure()
  assert.ok(Math.abs(expandedNavigation.scroll.right - expandedNavigation.browse.right) <= 1, 'navigation expansion must not strand the scrollbar')
  await js(`window.__settingsScroll.scrollTop = 0`)
  await clickText('深色')
  await wait(`Boolean(document.querySelector('.ui-dark'))`, 'dark settings theme')
  await js(`window.__settingsScroll.scrollTop = window.__settingsScroll.scrollHeight`)
  await screenshot('settings-hidden-dark-expanded-nav')
  const dark = await measure()
  assert.ok(Math.abs(dark.scroll.right - dark.browse.right) <= 1, 'dark mode preserves the full-width scroll viewport')
  await clickText('显示阅读侧栏')
  await clickSelector('[data-close-reader="online:101"]')
  await wait(`!document.querySelector('[data-reader-workspace]')`, 'last reader closed')
  await js(`window.__settingsScroll.scrollTop = window.__settingsScroll.scrollHeight`)
  assert.ok(await js(`Math.abs(window.__settingsScroll.getBoundingClientRect().right - document.querySelector('[data-browse-pane]').getBoundingClientRect().right) <= 1`), 'closing the last tab also restores the full settings scroll viewport')
  mark('settings scrollbar fills the browse pane across hide, restore, resize, navigation expansion and final close', samples)
}
