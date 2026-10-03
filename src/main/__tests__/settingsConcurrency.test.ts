import assert from 'node:assert/strict'
import { test } from 'node:test'
import initSqlJs from 'sql.js'
import { loadModule } from './helpers/loadModule'

test('simultaneous reader and app preference updates retain both patches', async () => {
  const SQL = await initSqlJs(); const database = new SQL.Database()
  database.run('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)')
  const loaded = loadModule<typeof import('../settingsStore')>('src/main/settingsStore.ts', {
    './database': { getDatabase: async () => database, saveDatabase: async () => { await new Promise(resolve => setTimeout(resolve, 5)) } },
    './dataPaths': { getDefaultDownloadDir: () => 'D:/Downloads' }
  })
  try {
    await Promise.all([loaded.updateSettings({ readerZoom: 1.4 }), loaded.updateSettings({ themeMode: 'dark' })])
    const settings = await loaded.getSettings()
    assert.equal(settings.readerZoom, 1.4)
    assert.equal(settings.themeMode, 'dark')
    assert.equal(database.exec("SELECT value FROM settings WHERE key='readerZoom'")[0].values[0][0], '1.4')
  } finally { database.close() }
})
