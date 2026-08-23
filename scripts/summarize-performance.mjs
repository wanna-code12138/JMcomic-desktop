import { readFile } from 'node:fs/promises'

const paths = process.argv.slice(2)
if (paths.length === 0) {
  throw new Error('usage: node scripts/summarize-performance.mjs <log> [log...]')
}

const groups = new Map()
const contents = await Promise.all(paths.map((path) => readFile(path, 'utf-8')))
const lines = contents.join('\n').split(/\r?\n/)

const addValue = (key, value) => {
  const values = groups.get(key) ?? []
  values.push(value)
  groups.set(key, values)
}

for (const line of lines) {
  const at = line.indexOf('[perf] ')
  if (at < 0) continue

  const event = JSON.parse(line.slice(at + 7))
  if (typeof event.elapsedMs !== 'number') continue

  const key = `${event.name}.${event.phase}`
  addValue(key, event.elapsedMs)
  if (typeof event.outcome === 'string') {
    addValue(`${key}.outcome.${event.outcome}`, event.elapsedMs)
  }
  if (typeof event.metadata?.cache === 'boolean') {
    addValue(`${key}.cache.${event.metadata.cache ? 'hit' : 'miss'}`, event.elapsedMs)
  }
  if (typeof event.metadata?.source === 'string') {
    addValue(`${key}.source.${event.metadata.source}`, event.elapsedMs)
  }
}

const pick = (values, fraction) =>
  values[Math.max(0, Math.ceil(values.length * fraction) - 1)]

const summary = {}
for (const [key, values] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
  values.sort((a, b) => a - b)
  summary[key] = {
    count: values.length,
    p50: pick(values, 0.5),
    p95: pick(values, 0.95),
    max: values.at(-1)
  }
}

console.log(JSON.stringify(summary, null, 2))
