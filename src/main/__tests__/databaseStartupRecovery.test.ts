import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as fs from 'node:fs/promises'
import { resolve, join } from 'node:path'
import initSqlJs from 'sql.js'
import { loadModule } from './helpers/loadModule'

test('a corrupt primary recovers verified backup and preserves original bytes; failed initialization never publishes a bad instance', async () => {
  await fs.mkdir(resolve('work'), { recursive: true })
  const root = await fs.mkdtemp(resolve('work/database-startup-'))
  const path = join(root, 'reader.db')
  const SQL = await initSqlJs()
  const good = new SQL.Database()
  good.run("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT); INSERT INTO settings VALUES ('themeMode', 'dark')")
  const backup = Buffer.from(good.export()); good.close()
  const ports = {
    electron: { app: { getPath: () => root } },
    './dataPaths': { getDatabasePath: () => path, getAppDataDir: () => root, getLegacyDatabasePath: () => '', migrateLegacyDatabase() {} },
    './ioMetrics': { beginIoPerfSpan: () => ({ finish() {} }) },
    './performanceTrace': { beginMainPerfSpan: () => ({ finish() {} }) }
  }
  const corrupt = Buffer.from('not a sqlite database')
  const loaded = loadModule<typeof import('../database')>('src/main/database.ts', ports)
  try {
    await fs.writeFile(path, corrupt)
    await fs.writeFile(`${path}.bak`, backup)
    const database = await loaded.getDatabase()
    assert.equal(database.exec("SELECT value FROM settings WHERE key='themeMode'")[0].values[0][0], 'dark')
    const preserved = (await fs.readdir(root)).find(name => name.includes('.corrupt-'))
    assert.ok(preserved, 'damaged primary must be retained for recovery')
    assert.deepEqual(await fs.readFile(join(root, preserved)), corrupt)
    await loaded.saveDatabase()
    const savedBackup = new SQL.Database(await fs.readFile(`${path}.bak`))
    assert.equal(savedBackup.exec('PRAGMA quick_check')[0].values[0][0], 'ok'); savedBackup.close()
    await loaded.closeDatabase()
    await fs.writeFile(path, corrupt); await fs.writeFile(`${path}.bak`, corrupt)
    const failed = loadModule<typeof import('../database')>('src/main/database.ts', ports)
    await assert.rejects(failed.getDatabase())
    await assert.rejects(failed.getDatabase(), 'second attempt must not return an invalid published instance')
    assert.deepEqual(await fs.readFile(path), corrupt)
  } finally { await loaded.closeDatabase(); await fs.rm(root, { recursive: true, force: true }) }
})
