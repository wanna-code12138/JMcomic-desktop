export type ImagePriority = 'critical' | 'near' | 'visible-grid' | 'background'

export const IMAGE_REQUEST_LIMITS = Object.freeze({
  global: 6,
  perHost: 4,
  firstByteMs: 10_000,
  totalMs: 30_000,
  retries: 2
})

const RANK: Record<ImagePriority, number> = {
  critical: 0,
  near: 1,
  'visible-grid': 2,
  background: 3
}

export function priorityRank(value: ImagePriority): number {
  return RANK[value] ?? 99
}

export function shouldRetryImage(status: number, attempt: number): boolean {
  return attempt < IMAGE_REQUEST_LIMITS.retries && (status === 429 || status >= 500)
}
