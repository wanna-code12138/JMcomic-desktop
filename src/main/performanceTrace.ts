import {
  createPerfEventBuffer,
  sanitizePerfEvent,
  startPerfSpan,
  summarizePerfEvents,
  type PerfEvent,
  type PerfMetadata,
  type PerfSpan,
  type PerfSummary
} from '../shared/performanceTraceCore'

const events = createPerfEventBuffer(1000)

export function beginMainPerfSpan(
  name: string,
  metadata: PerfMetadata = {}
): PerfSpan {
  return startPerfSpan(name, metadata, undefined, (event) => {
    const safeEvent = sanitizePerfEvent(event)
    events.push(safeEvent)
  })
}

export function pushMainPerfEvent(event: PerfEvent): void {
  events.push(sanitizePerfEvent(event))
}

export function listMainPerfEvents(): PerfEvent[] {
  return events.list()
}

export function getMainPerfSummary(): PerfSummary {
  return summarizePerfEvents(events.list())
}

export function getMainPerfEventCount(): number {
  return events.list().length
}

export function clearMainPerfEvents(): void {
  events.clear()
}
