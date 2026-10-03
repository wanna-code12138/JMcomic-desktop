import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeSettings } from '../settingsCore'
import { normalizeWorkspaceSnapshot } from '../../shared/workspaceSnapshot'
import { readStartupPreferences, writeStartupPreferences } from '../startupPreferences'

test('experience preferences are independent and old settings migrate to safe defaults', () => {
  const defaults = normalizeSettings({}) as any
  assert.equal(defaults.animationsEnabled, true)
  assert.equal(defaults.restoreReaderWorkspace, false)
  assert.equal(defaults.downloadFormat, 'ask')
  const set = normalizeSettings({ animationsEnabled: 'false', restoreReaderWorkspace: 'true', downloadFormat: 'pdf', browseRatio: 1 }) as any
  assert.equal(set.animationsEnabled, false); assert.equal(set.restoreReaderWorkspace, true)
  assert.equal(set.downloadFormat, 'pdf'); assert.equal(set.browseRatio, 0.65)
  assert.equal((normalizeSettings({ downloadFormat: 'zip', browseRatio: 'bad' }) as any).downloadFormat, 'ask')
})

test('workspace snapshots whitelist metadata, deduplicate content and bound imported data', () => {
  const book = { id: 'tab:1', kind: 'book', pinned: true, customTitle: 'Saved', reader: { mangaId: '12', mangaTitle: 'Book', mangaCoverUrl: 'https://image.test/12.jpg', chapterIndex: 2, chapterTitle: 'C3', chapterUrl: '/photo/123', resumePageIndex: 8, resumePageOffset: 0.5, auth: 'secret', pixels: [1, 2] } }
  const result = normalizeWorkspaceSnapshot({ version: 1, tabs: [book, { ...book, id: 'tab:2' }, { id: 'empty', kind: 'start', pinned: false }], activeId: 'tab:1', auth: 'secret' })!
  assert.equal(result.tabs.length, 2); assert.equal(result.tabs[0].pinned, true)
  assert.equal(result.tabs[0].reader?.resumePageIndex, 8)
  assert.ok(!JSON.stringify(result).includes('secret')); assert.ok(!JSON.stringify(result).includes('pixels'))
  assert.equal(normalizeWorkspaceSnapshot({ version: 9, tabs: [] }), null)
  assert.equal(normalizeWorkspaceSnapshot({ version: 1, tabs: Array(101).fill(book) }), null)
  assert.equal(normalizeWorkspaceSnapshot({ version: 1, tabs: [{ ...book, reader: { ...book.reader, chapterUrl: 'file:///C:/private.txt' } }] }), null)
  assert.equal(normalizeWorkspaceSnapshot({ version: 1, tabs: [{ ...book, id: 'x'.repeat(1000) }] }), null)
})

test('GPU startup settings are atomic, bounded, boolean-only and preserve malformed source', async () => {
  mkdirSync('work', { recursive: true })
  const root = mkdtempSync(join(process.cwd(), 'work', 'startup-prefs-')), file = join(root, 'startup-preferences.json')
  try {
    assert.equal(readStartupPreferences(file).hardwareAcceleration, true)
    await writeStartupPreferences(file, false)
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { version: 1, hardwareAcceleration: false })
    assert.equal(readStartupPreferences(file).hardwareAcceleration, false)
    await assert.rejects(writeStartupPreferences(file, 'false' as any))
    writeFileSync(file, '{broken')
    assert.equal(readStartupPreferences(file).hardwareAcceleration, true)
    assert.equal(readFileSync(file, 'utf8'), '{broken')
    writeFileSync(file, ' '.repeat(16385))
    assert.equal(readStartupPreferences(file).hardwareAcceleration, true)
  } finally { rmSync(root, { recursive: true }) }
})
