import assert from 'assert'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, sep } from 'path'
import {
  getPortableDir,
  resolveDataDir,
  getDatabasePath,
  migrateLegacyDatabase,
  DATA_DIR_NAME,
  DB_FILE_NAME
} from '../dataPaths'

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`  PASS: ${name}`)
  } catch (err) {
    console.log(`  FAIL: ${name}`)
    console.log(`        ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  }
}

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

// ─── getPortableDir ────────────────────────────────────────────────

test('getPortableDir returns PORTABLE_EXECUTABLE_DIR when set', () => {
  const env = { PORTABLE_EXECUTABLE_DIR: 'D:\\tools\\JMComic' }
  assert.strictEqual(getPortableDir(env), 'D:\\tools\\JMComic')
})

test('getPortableDir falls back to dirname of PORTABLE_EXECUTABLE_FILE', () => {
  const env = { PORTABLE_EXECUTABLE_FILE: 'D:\\tools\\JMComic\\JMComic Desktop Portable 1.0.2.exe' }
  assert.strictEqual(getPortableDir(env), 'D:\\tools\\JMComic')
})

test('getPortableDir returns null when no portable env is set', () => {
  assert.strictEqual(getPortableDir({}), null)
})

test('getPortableDir ignores blank values', () => {
  assert.strictEqual(getPortableDir({ PORTABLE_EXECUTABLE_DIR: '   ' }), null)
})

// ─── resolveDataDir / getDatabasePath ──────────────────────────────

test('resolveDataDir uses JMComicData next to the portable exe', () => {
  const dir = resolveDataDir('D:\\tools\\JMComic', 'C:\\Users\\me\\AppData\\Roaming\\jmcomic-desktop')
  assert.strictEqual(dir, join('D:\\tools\\JMComic', DATA_DIR_NAME))
})

test('resolveDataDir falls back to userData when not portable', () => {
  const fallback = 'C:\\Users\\me\\AppData\\Roaming\\jmcomic-desktop'
  assert.strictEqual(resolveDataDir(null, fallback), fallback)
})

test('getDatabasePath appends jmcomic.db', () => {
  assert.strictEqual(getDatabasePath('D:\\tools\\JMComic\\JMComicData'), join('D:\\tools\\JMComic\\JMComicData', DB_FILE_NAME))
})

// ─── migrateLegacyDatabase ─────────────────────────────────────────

test('migrateLegacyDatabase copies legacy db into data dir when target missing', () => {
  const root = makeTempDir('jm-data-')
  const legacyDir = join(root, 'legacy')
  const targetDir = join(root, 'JMComicData')
  const legacyPath = join(legacyDir, 'jmcomic.db')
  const targetPath = join(targetDir, 'jmcomic.db')
  try {
    mkdirSync(legacyDir, { recursive: true })
    writeFileSync(legacyPath, 'LEGACY-DB-BYTES')
    const migrated = migrateLegacyDatabase({ legacyPath, targetPath })
    assert.strictEqual(migrated, true)
    assert.strictEqual(readFileSync(targetPath, 'utf-8'), 'LEGACY-DB-BYTES')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('migrateLegacyDatabase never overwrites existing portable db', () => {
  const root = makeTempDir('jm-data-')
  const legacyPath = join(root, 'legacy', 'jmcomic.db')
  const targetPath = join(root, 'JMComicData', 'jmcomic.db')
  try {
    mkdirSync(join(root, 'legacy'), { recursive: true })
    mkdirSync(join(root, 'JMComicData'), { recursive: true })
    writeFileSync(legacyPath, 'LEGACY-DB-BYTES')
    writeFileSync(targetPath, 'PORTABLE-DB-BYTES')
    const migrated = migrateLegacyDatabase({ legacyPath, targetPath })
    assert.strictEqual(migrated, false)
    assert.strictEqual(readFileSync(targetPath, 'utf-8'), 'PORTABLE-DB-BYTES')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('migrateLegacyDatabase no-ops when legacy db is missing', () => {
  const root = makeTempDir('jm-data-')
  const legacyPath = join(root, 'legacy', 'jmcomic.db')
  const targetPath = join(root, 'JMComicData', 'jmcomic.db')
  try {
    const migrated = migrateLegacyDatabase({ legacyPath, targetPath })
    assert.strictEqual(migrated, false)
    assert.strictEqual(existsSync(targetPath), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// sanity: path helper used in production file names
test('DB_FILE_NAME is jmcomic.db', () => {
  assert.strictEqual(DB_FILE_NAME, 'jmcomic.db')
  assert.ok(sep)
})

console.log('\nAll tests completed.')
if (process.exitCode) {
  console.log('Some tests failed.')
} else {
  console.log('All tests passed!')
}
