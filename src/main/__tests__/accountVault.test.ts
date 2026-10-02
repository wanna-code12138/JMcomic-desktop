import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createCipheriv, createDecipheriv } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { createSessionVault } from '../account/sessionVault'
import type { SavedAccountSession } from '../account/accountSessionTypes'

async function main() {
  const root = resolve('work/account-vault-test'); await mkdir(root, { recursive: true })
  const dir = await mkdtemp(join(root, 'case-')); const path = join(dir, 'session.bin')
  const key = Buffer.alloc(32, 1), iv = Buffer.alloc(16, 2)
  let available = true
  const crypto = { available: () => available,
    encrypt: (s: string) => { const c = createCipheriv('aes-256-cbc', key, iv); return Buffer.concat([c.update(s), c.final()]) },
    decrypt: (b: Buffer) => { const c = createDecipheriv('aes-256-cbc', key, iv); return Buffer.concat([c.update(b), c.final()]).toString() } }
  const value: SavedAccountSession = { version: 1, origin: 'https://www.cdnhjk.net', profileId: 'python-current', appVersion: '2.1.9', imageOrigin: 'https://cdn-msp.18comic.vip',
    profile: { uid: '1', username: 'fixture-user', nickname: '测试', level: null, coins: null, experience: null, favorites: 0, favoriteLimit: null, checkedAt: 1 },
    cookies: [{ name: 'AVS', value: 'synthetic-private-cookie', domain: 'www.cdnhjk.net', path: '/', secure: true, httpOnly: true }] }
  const vault = createSessionVault(path, crypto)
  try {
    await vault.save(value)
    assert.deepEqual(await vault.load(), value, '记住的会话必须能恢复')
    const file = await readFile(path); assert.equal(file.includes(Buffer.from('synthetic-private-cookie')), false)
    assert.equal(file.includes(Buffer.from('fixture-user')), false)
    await Promise.all([vault.save(value), vault.clear()]); assert.equal(await vault.load(), null, '退出清除必须排在已开始的写入之后')
    available = false; await assert.rejects(() => vault.save(value), (e: any) => e.code === 'STORAGE')
    available = true; await writeFile(path, 'corrupt'); await assert.rejects(() => vault.load(), (e: any) => e.code === 'STORAGE')
    await vault.clear(); assert.equal(await vault.load(), null)
    console.log('PASS account vault: encrypted roundtrip, ordered clear, unavailable crypto, corrupt payload')
  } finally { assert.ok(dir.startsWith(root + '\\')); await rm(dir, { recursive: true, force: true }) }
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
