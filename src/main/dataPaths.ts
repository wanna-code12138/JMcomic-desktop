import { app } from 'electron'
import { dirname, join } from 'path'
import { existsSync, mkdirSync, copyFileSync } from 'fs'

/**
 * 便携单文件版（electron-builder portable）会把原始 exe 所在目录注入到
 * PORTABLE_EXECUTABLE_DIR，运行目录则在临时解压目录中 —— 因此个人数据
 * 必须存放在 exe 旁边的数据目录里，才能"随文件走"。
 */
export const DATA_DIR_NAME = 'JMComicData'
export const DB_FILE_NAME = 'jmcomic.db'

const PORTABLE_DIR_ENV = 'PORTABLE_EXECUTABLE_DIR'
const PORTABLE_FILE_ENV = 'PORTABLE_EXECUTABLE_FILE'

export function getPortableDir(env: Record<string, string | undefined> = process.env): string | null {
  const dir = env[PORTABLE_DIR_ENV]?.trim()
  if (dir) return dir
  const file = env[PORTABLE_FILE_ENV]?.trim()
  return file ? dirname(file) : null
}

export function resolveDataDir(portableDir: string | null, fallbackDir: string): string {
  return portableDir ? join(portableDir, DATA_DIR_NAME) : fallbackDir
}

export function getAppDataDir(): string {
  return resolveDataDir(getPortableDir(), app.getPath('userData'))
}

export function getDatabasePath(dataDir = getAppDataDir()): string {
  return join(dataDir, DB_FILE_NAME)
}

/** 默认下载目录：系统"下载"文件夹下的 JMComic 子目录。 */
export function getDefaultDownloadDir(): string {
  return join(app.getPath('downloads'), 'JMComic')
}

export function getLegacyDatabasePath(userDataDir: string): string {
  return join(userDataDir, DB_FILE_NAME)
}

/**
 * 1.0.1 及之前版本把数据库放在 Electron userData 目录；升级到便携版后
 * 首次启动时把旧库复制到 exe 旁边（非破坏，仅当目标不存在时执行）。
 */
export function migrateLegacyDatabase(opts: { legacyPath: string; targetPath: string }): boolean {
  const { legacyPath, targetPath } = opts
  if (existsSync(targetPath)) return false
  if (!existsSync(legacyPath)) return false
  mkdirSync(dirname(targetPath), { recursive: true })
  copyFileSync(legacyPath, targetPath)
  return true
}
