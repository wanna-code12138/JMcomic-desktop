import { beginMainPerfSpan } from './performanceTrace'
import type { PerfMetadata, PerfSpan } from '../shared/performanceTraceCore'

export type IoSpanName =
  | 'database.flush'
  | 'download.scan'
  | 'image-cache.scan'
  | 'network.proxy-probe'

export interface IoSpanMetadata {
  bytes?: number
  itemCount?: number
  outcome?: 'ok' | 'error' | 'skipped'
  [key: string]: unknown
}

/**
 * 记录主进程 I/O 相关的性能跟踪跨度。
 * 严格限制：metadata 仅允许记录 bytes/itemCount/outcome 等数值统计，
 * 严禁携带路径、SQL 语句、URL 或用户敏感数据。
 */
export function beginIoPerfSpan(
  name: IoSpanName,
  initialMetadata?: IoSpanMetadata
): PerfSpan {
  const sanitized: PerfMetadata = {}
  if (initialMetadata) {
    if (typeof initialMetadata.bytes === 'number') sanitized.bytes = initialMetadata.bytes
    if (typeof initialMetadata.itemCount === 'number') sanitized.itemCount = initialMetadata.itemCount
    if (typeof initialMetadata.outcome === 'string') sanitized.outcome = initialMetadata.outcome
  }
  return beginMainPerfSpan(name, sanitized)
}
