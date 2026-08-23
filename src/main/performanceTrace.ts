import {
  createPerfEventBuffer,
  formatPerfEvent,
  startPerfSpan,
  type PerfEvent,
  type PerfMetadata,
  type PerfSpan
} from '../shared/performanceTraceCore'

const events = createPerfEventBuffer(500)

export function beginMainPerfSpan(
  name: string,
  metadata: PerfMetadata = {}
): PerfSpan {
  return startPerfSpan(name, metadata, undefined, (event) => {
    events.push(event)
    console.info(formatPerfEvent(event))
  })
}

export function listMainPerfEvents(): PerfEvent[] {
  return events.list()
}

export function clearMainPerfEvents(): void {
  events.clear()
}
