import type { App } from 'electron'
import { mkdirSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'

export function lockAccountDataDirectory(app: Pick<App, 'setPath' | 'requestSingleInstanceLock'>, path: string): boolean {
  const absolute = resolve(path)
  mkdirSync(absolute, { recursive: true })
  app.setPath('userData', realpathSync.native(absolute))
  return app.requestSingleInstanceLock()
}
