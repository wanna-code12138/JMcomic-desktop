import {
  startPerfSpan,
  type PerfEvent,
  type PerfMetadata,
  type PerfSpan
} from '../../../shared/performanceTraceCore'

export type RendererMetricSink = (event: PerfEvent) => void

export function startRendererMetrics(sink: RendererMetricSink): () => void {
  let observer: PerformanceObserver | null = null
  try {
    if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          sink({
            name: 'renderer.long-task',
            phase: 'finish',
            elapsedMs: Math.round(entry.duration * 100) / 100,
            outcome: 'ok',
            metadata: {}
          })
        }
      })
      observer.observe({ type: 'longtask', buffered: true })
    }
  } catch {
    // 平稳降级
  }

  let frameId: number | null = null
  let lastTime = typeof performance !== 'undefined' ? performance.now() : Date.now()

  const sampleFrame = (now: number): void => {
    const delta = now - lastTime
    lastTime = now
    if (delta > 50) {
      sink({
        name: 'renderer.frame-interval',
        phase: 'finish',
        elapsedMs: Math.round(delta * 100) / 100,
        outcome: 'ok',
        metadata: {}
      })
    }
    if (typeof requestAnimationFrame !== 'undefined') {
      frameId = requestAnimationFrame(sampleFrame)
    }
  }

  if (typeof requestAnimationFrame !== 'undefined') {
    frameId = requestAnimationFrame(sampleFrame)
  }

  return () => {
    if (observer) {
      observer.disconnect()
    }
    if (frameId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(frameId)
    }
  }
}

export function recordRendererSpan(name: string, metadata: PerfMetadata = {}): PerfSpan {
  return startPerfSpan(name, metadata, undefined, (event) => {
    if (typeof window !== 'undefined' && window.electronAPI?.performanceRecord) {
      window.electronAPI.performanceRecord(event)
    }
  })
}
