import { getDatabase, saveDatabase } from './database'
import { normalizeSettings, type AppSettings } from './settingsCore'

let cached: AppSettings | null = null

function serialize(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  return String(value ?? '')
}

export async function getSettings(): Promise<AppSettings> {
  if (cached) return cached
  const db = await getDatabase()
  const raw: Record<string, unknown> = {}
  const results = db.exec('SELECT key, value FROM settings')
  if (results.length > 0) {
    for (const row of results[0].values) {
      raw[String(row[0])] = String(row[1])
    }
  }
  cached = normalizeSettings(raw)
  return cached
}

export async function updateSettings(patch: Record<string, unknown>): Promise<AppSettings> {
  const current = await getSettings()
  const merged = normalizeSettings({ ...current, ...patch })
  const db = await getDatabase()
  for (const [key, value] of Object.entries(merged)) {
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, serialize(value)])
  }
  saveDatabase()
  cached = merged
  return merged
}
