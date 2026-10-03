import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import { loadModule } from './helpers/loadModule'
import type { MangaDetail } from '../types'

test('a partial browser detail is not cached and the next visit can recover', async () => {
  const detail: MangaDetail = {
    id: '1477646', title: '单篇合成样本', author: '', tags: [], description: '',
    coverUrl: 'https://cdn-msp.18comic.vip/media/albums/1477646.jpg',
    chapters: [{ index: 0, title: '单篇合成样本', url: '/photo/1477646' }]
  }
  let navigations = 0
  const webContents = Object.assign(new EventEmitter(), {
    executeJavaScript: async () => navigations === 1 ? { ...detail, chapters: [] } : detail
  })
  class FixtureWindow {
    webContents = webContents
    isDestroyed() { return false }
    async loadURL() { navigations++; queueMicrotask(() => webContents.emit('did-finish-load')) }
  }
  const scraper = loadModule<{ extractMangaDetail(id: string): Promise<MangaDetail> }>('src/main/scraperWindow.ts', {
    electron: { BrowserWindow: FixtureWindow, session: { defaultSession: {} } },
    './networkProbe': { getActiveDomain: () => 'example.test' },
    './performanceTrace': { beginMainPerfSpan: () => ({ finish() {} }) }
  })
  assert.equal((await scraper.extractMangaDetail(detail.id)).chapters.length, 0)
  assert.deepEqual((await scraper.extractMangaDetail(detail.id)).chapters, detail.chapters,
    'an incomplete DOM must not poison subsequent detail attempts for ten minutes')
  assert.equal(navigations, 2)
  assert.deepEqual((await scraper.extractMangaDetail(detail.id)).chapters, detail.chapters)
  assert.equal(navigations, 2, 'validated results still reuse the browser cache')
})
