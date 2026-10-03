import { readFileSync, statSync } from 'node:fs'
import { mkdir, open, rename, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

export interface StartupPreferences { version: 1; hardwareAcceleration: boolean }
export function readStartupPreferences(file: string): StartupPreferences {
  try {
    if (statSync(file).size > 16384) throw Error('oversize')
    const value = JSON.parse(readFileSync(file, 'utf8'))
    if (value?.version === 1 && typeof value.hardwareAcceleration === 'boolean') return { version: 1, hardwareAcceleration: value.hardwareAcceleration }
  } catch { /* A damaged preference must not prevent startup or overwrite its source. */ }
  return { version: 1, hardwareAcceleration: true }
}

let writes: Promise<unknown> = Promise.resolve()
export function writeStartupPreferences(file: string, hardwareAcceleration: boolean): Promise<void> {
  const result = writes.then(async () => {
    if (typeof hardwareAcceleration !== 'boolean') throw Error('GPU 设置必须为布尔值')
    await mkdir(dirname(file), { recursive: true })
    const temporary = `${file}.${randomUUID()}.tmp`
    try {
      const handle = await open(temporary, 'wx')
      try { await handle.writeFile(JSON.stringify({ version: 1, hardwareAcceleration })); await handle.sync() } finally { await handle.close() }
      await rename(temporary, file)
    } finally { await unlink(temporary).catch(() => {}) }
  })
  writes = result.catch(() => {})
  return result
}
