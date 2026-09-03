export type PerfValue = string | number | boolean
export type PerfMetadata = Record<string, PerfValue>
export type PerfOutcome = 'ok' | 'error' | 'cancelled' | 'timeout'

export interface PerfEvent {
  name: string
  phase: string
  elapsedMs: number
  outcome?: PerfOutcome
  metadata: PerfMetadata
}

export interface PerfSpan {
  mark: (phase: string, metadata?: PerfMetadata) => PerfEvent
  finish: (outcome?: PerfOutcome, metadata?: PerfMetadata) => PerfEvent
}

export interface PerfEventBuffer {
  push: (event: PerfEvent) => void
  list: () => PerfEvent[]
  clear: () => void
}

function roundMilliseconds(value: number): number {
  return Math.round(value * 100) / 100
}

export function startPerfSpan(
  name: string,
  metadata: PerfMetadata = {},
  now: () => number = () => performance.now(),
  sink: (event: PerfEvent) => void = () => {}
): PerfSpan {
  const startedAt = now()
  let completed: PerfEvent | undefined

  const createEvent = (
    phase: string,
    outcome: PerfOutcome | undefined,
    extra: PerfMetadata
  ): PerfEvent => ({
    name,
    phase,
    elapsedMs: roundMilliseconds(now() - startedAt),
    outcome,
    metadata: { ...metadata, ...extra }
  })

  return {
    mark(phase, extra = {}) {
      const event = createEvent(phase, undefined, extra)
      sink(event)
      return event
    },
    finish(outcome = 'ok', extra = {}) {
      if (completed) return completed
      completed = createEvent('finish', outcome, extra)
      sink(completed)
      return completed
    }
  }
}

export function createPerfEventBuffer(capacity: number): PerfEventBuffer {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new Error('capacity must be positive')
  }

  const events: PerfEvent[] = []
  return {
    push(event) {
      events.push(event)
      if (events.length > capacity) {
        events.splice(0, events.length - capacity)
      }
    },
    list() {
      return events.map((event) => ({
        ...event,
        metadata: { ...event.metadata }
      }))
    },
    clear() {
      events.length = 0
    }
  }
}

export function formatPerfEvent(event: PerfEvent): string {
  return `[perf] ${JSON.stringify(event)}`
}

export interface PerfMetricSummary {
  count: number
  ok: number
  error: number
  cancelled: number
  timeout: number
  p50Ms: number
  p95Ms: number
  maxMs: number
}

export type PerfSummary = Record<string, PerfMetricSummary>

const SAFE_METADATA = new Set([
  'page', 'provider', 'cacheState', 'fallback', 'priority', 'outcome',
  'width', 'height', 'stripCount', 'bytes', 'batchSize', 'inputType'
])

export function sanitizePerfEvent(event: PerfEvent): PerfEvent {
  const safeMeta: PerfMetadata = {}
  if (event.metadata) {
    for (const [key, value] of Object.entries(event.metadata)) {
      if (SAFE_METADATA.has(key)) {
        safeMeta[key] = value
      }
    }
  }
  return {
    name: event.name,
    phase: event.phase,
    elapsedMs: event.elapsedMs,
    ...(event.outcome !== undefined ? { outcome: event.outcome } : {}),
    metadata: safeMeta
  }
}

function pickNearestRank(values: number[], fraction: number): number {
  if (values.length === 0) return 0
  const index = Math.max(0, Math.ceil(values.length * fraction) - 1)
  return values[index] ?? 0
}

export function summarizePerfEvents(events: readonly PerfEvent[]): PerfSummary {
  const groups = new Map<string, {
    count: number
    ok: number
    error: number
    cancelled: number
    timeout: number
    elapsed: number[]
  }>()

  for (const event of events) {
    let group = groups.get(event.name)
    if (!group) {
      group = { count: 0, ok: 0, error: 0, cancelled: 0, timeout: 0, elapsed: [] }
      groups.set(event.name, group)
    }
    group.count += 1
    if (event.outcome === 'ok') group.ok += 1
    else if (event.outcome === 'error') group.error += 1
    else if (event.outcome === 'cancelled') group.cancelled += 1
    else if (event.outcome === 'timeout') group.timeout += 1

    if (typeof event.elapsedMs === 'number') {
      group.elapsed.push(event.elapsedMs)
    }
  }

  const result: PerfSummary = {}
  for (const [name, group] of groups.entries()) {
    group.elapsed.sort((a, b) => a - b)
    result[name] = {
      count: group.count,
      ok: group.ok,
      error: group.error,
      cancelled: group.cancelled,
      timeout: group.timeout,
      p50Ms: pickNearestRank(group.elapsed, 0.5),
      p95Ms: pickNearestRank(group.elapsed, 0.95),
      maxMs: group.elapsed.length > 0 ? (group.elapsed[group.elapsed.length - 1] ?? 0) : 0
    }
  }

  return result
}
