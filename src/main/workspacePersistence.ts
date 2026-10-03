import { getDatabase, saveDatabase } from './database'
import { getSettings } from './settingsStore'
import { normalizeWorkspaceSnapshot, WORKSPACE_MAX_BYTES, type WorkspaceSnapshot } from '../shared/workspaceSnapshot'

export function parseStoredWorkspace(value: unknown): WorkspaceSnapshot | null {
  if (typeof value !== 'string' || value.length > WORKSPACE_MAX_BYTES) return null
  try { return normalizeWorkspaceSnapshot(JSON.parse(value)) } catch { return null }
}

export async function readWorkspaceSnapshot(): Promise<WorkspaceSnapshot | null> {
  if (!(await getSettings()).restoreReaderWorkspace) return null
  const db = await getDatabase()
  const raw = db.exec("SELECT value FROM settings WHERE key='readerWorkspaceSnapshot'")[0]?.values[0]?.[0]
  const snapshot = parseStoredWorkspace(raw)
  if (raw && !snapshot) throw Error('上次的标签记录损坏，原记录已保留。你可以继续打开新的标签。')
  // The history table is newer than the tab snapshot after a crash while scrolling.
  for (const tab of snapshot?.tabs ?? []) {
    if (tab.kind !== 'book') continue
    const row = db.exec('SELECT chapter_index, page_index, page_offset, is_local FROM reading_history WHERE manga_id=?', [tab.reader.mangaId])[0]?.values[0]
    if (row && Number(row[0]) === tab.reader.chapterIndex && Boolean(row[3]) === Boolean(tab.reader.local)) {
      tab.reader.resumePageIndex = Math.max(0, Number(row[1]) || 0)
      tab.reader.resumePageOffset = Math.max(0, Math.min(1, Number(row[2]) || 0))
    }
  }
  return snapshot
}

let writes: Promise<unknown> = Promise.resolve()
export function writeWorkspaceSnapshot(raw: unknown): Promise<void> {
  const snapshot = normalizeWorkspaceSnapshot(raw)
  if (!snapshot) return Promise.reject(Error('标签记录无效或超过限制'))
  const result = writes.then(async () => {
    if (!(await getSettings()).restoreReaderWorkspace) return
    const db = await getDatabase()
    const previous = db.exec("SELECT value FROM settings WHERE key='readerWorkspaceSnapshot'")[0]?.values[0]?.[0]
    if (previous && !parseStoredWorkspace(previous)) db.run("INSERT OR IGNORE INTO settings (key,value) VALUES ('readerWorkspaceRecovery',?)", [previous])
    db.run("INSERT OR REPLACE INTO settings (key,value) VALUES ('readerWorkspaceSnapshot',?)", [JSON.stringify(snapshot)])
    await saveDatabase()
  })
  writes = result.catch(() => {})
  return result
}
