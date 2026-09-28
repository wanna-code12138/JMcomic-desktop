import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import { resolve, join } from 'node:path'
import initSqlJs from 'sql.js'
import { loadModule } from './helpers/loadModule'

test('database initialization shares one instance; failed replacement preserves the previous database', async () => {
  await fsp.mkdir(resolve('work'), { recursive: true })
  const root = await fsp.mkdtemp(resolve('work/database-regression-'))
  const path = join(root, 'reader.db')
  let rejectRename = false
  let writes = 0
  const loaded = loadModule<typeof import('../database')>('src/main/database.ts', {
    electron: { app: { getPath: () => root } },
    './dataPaths': { getDatabasePath: () => path, getAppDataDir: () => root, getLegacyDatabasePath: () => '', migrateLegacyDatabase() {} },
    './ioMetrics': { beginIoPerfSpan: () => ({ finish() {} }) },
    './performanceTrace': { beginMainPerfSpan: () => ({ finish() {} }) },
    fs: { ...fs, writeFileSync: (...args: Parameters<typeof fs.writeFileSync>) => { writes++; return fs.writeFileSync(...args) } },
    'fs/promises': { ...fsp, rename: async (from: string, to: string) => { if (rejectRename) throw new Error('replacement blocked'); writes++; await fsp.rename(from, to) } }
  })
  try {
    const [first, second] = await Promise.all([loaded.getDatabase(), loaded.getDatabase()])
    assert.strictEqual(first, second, 'parallel callers must not create databases that overwrite each other')
    first.run("INSERT INTO settings VALUES ('test', 'before')")
    await loaded.saveDatabase()
    const before = await fsp.readFile(path)
    first.run("UPDATE settings SET value = 'after'")
    rejectRename = true
    await assert.rejects(async () => loaded.saveDatabase(), /replacement blocked/)
    assert.deepEqual(await fsp.readFile(path), before)
    rejectRename = false
    await loaded.databaseCoordinator.flush()
    const SQL = await initSqlJs()
    const disk = new SQL.Database(await fsp.readFile(path))
    assert.equal(disk.exec("SELECT value FROM settings WHERE key = 'test'")[0].values[0][0], 'after')
    disk.close()
    const previousWrites = writes
    for (let i = 0; i < 100; i++) {
      first.run("UPDATE settings SET value = ? WHERE key = 'test'", [String(i)])
      loaded.scheduleDatabaseSave('history')
    }
    await loaded.closeDatabase()
    assert.equal(writes - previousWrites, 1)
  } finally {
    rejectRename = false
    await loaded.closeDatabase()
    await fsp.rm(root, { recursive: true, force: true })
  }
})
