import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AccountVault, SavedAccountSession } from './accountSessionTypes'
import { CREDENTIAL_ORIGINS } from './accountTransport'
import { AccountError } from './accountErrors'

export function createSessionVault(path: string, crypto: {
  available(): boolean; encrypt(value: string): Buffer; decrypt(value: Buffer): string
}): AccountVault {
  let pending: Promise<unknown> = Promise.resolve()
  const queue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = pending.then(operation)
    pending = result.catch(() => {})
    return result
  }
  function validate(value: SavedAccountSession): void {
    if (!value || value.version !== 1 || !(CREDENTIAL_ORIGINS as readonly string[]).includes(value.origin)
      || !/^\d{1,12}$/.test(value.profile?.uid ?? '') || !Array.isArray(value.cookies) || value.cookies.length > 100
      || !value.cookies.some(cookie => cookie.name === 'AVS' && cookie.value)) throw new AccountError('STORAGE')
    const host = new URL(value.origin).hostname
    for (const cookie of value.cookies) {
      if (!cookie || typeof cookie.name !== 'string' || typeof cookie.value !== 'string' || cookie.value.length > 8192
        || cookie.domain.replace(/^\./, '') !== host || !cookie.path.startsWith('/')) throw new AccountError('STORAGE')
    }
  }
  return {
    load: () => queue(async () => {
      let bytes: Buffer
      try { bytes = await readFile(path) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw new AccountError('STORAGE') }
      try {
        if (!crypto.available() || bytes.byteLength > 256 * 1024) throw new AccountError('STORAGE')
        const value = JSON.parse(crypto.decrypt(bytes)) as SavedAccountSession
        validate(value); return value
      } catch { throw new AccountError('STORAGE') }
    }),
    save: value => queue(async () => {
      const temporary = `${path}.${randomUUID()}.tmp`
      try {
        validate(value)
        if (!crypto.available()) throw new AccountError('STORAGE')
        const encrypted = crypto.encrypt(JSON.stringify(value))
        await mkdir(dirname(path), { recursive: true })
        await writeFile(temporary, encrypted, { flag: 'wx', mode: 0o600 })
        await rename(temporary, path)
      } catch { throw new AccountError('STORAGE') }
      finally { await unlink(temporary).catch(() => {}) }
    }),
    clear: () => queue(async () => {
      try { await unlink(path) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new AccountError('STORAGE') }
    }),
    async flush() { await pending }
  }
}
