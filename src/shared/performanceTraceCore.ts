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
