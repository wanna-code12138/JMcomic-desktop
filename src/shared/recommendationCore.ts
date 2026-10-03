export const RECOMMENDATION_TAGS = [
  '全彩', '中文', '無修正', '純愛', 'NTR', '後宮', '巨乳', '熟女',
  '校園', '連載', '劇情', '全年齡', 'SM', '調教', '觸手', '百合',
  '貧乳', '偽娘', '性轉', '人外', '足交', '肛交', '束縛', '催眠',
  '藥物', '怪物', '異種姦', '奇幻', '科幻', '武俠', '競技', '遊戲',
  '音聲', 'CG集', '漫畫', '短篇', '單本', '同人', '韓漫', '美漫'
] as const

export type RecommendationSource = 'latest' | 'weekly' | 'quality' | 'tag'

export interface RecommendationCard {
  id: string
  title: string
  coverUrl: string
  author?: string
  tags?: string[]
  latestChapter?: string
  updateTime?: string
}

export interface RecommendationPool {
  source: RecommendationSource
  tag?: string
  cards: RecommendationCard[]
}

export interface RecommendationExposure {
  id: string
  exposedAt: number
}

export interface RecommendationOptions {
  now: number
  seed: number
  limit?: number
}

export const RECOMMENDATION_INITIAL_COUNT = 24
export const RECOMMENDATION_BATCH_COUNT = 12
export const RECOMMENDATION_EXPOSURE_TTL_MS = 7 * 24 * 60 * 60_000

const SOURCE_ORDER: RecommendationSource[] = ['latest', 'weekly', 'quality', 'tag']
const SOURCE_WEIGHTS: Record<RecommendationSource, number> = {
  latest: 35,
  weekly: 25,
  quality: 20,
  tag: 20
}

function parseTags(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw !== 'string') return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function normalizeRecommendationTags(raw: unknown): string[] {
  const allowed = new Set<string>(RECOMMENDATION_TAGS)
  const selected: string[] = []
  for (const value of parseTags(raw)) {
    if (typeof value !== 'string' || !allowed.has(value) || selected.includes(value)) continue
    selected.push(value)
    if (selected.length === 8) break
  }
  return selected
}

function hash(value: string): number {
  let result = 2166136261
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

export function pruneRecommendationExposures(
  exposures: RecommendationExposure[],
  now: number
): RecommendationExposure[] {
  const cutoff = now - RECOMMENDATION_EXPOSURE_TTL_MS
  const latestById = new Map<string, number>()
  for (const exposure of exposures) {
    if (!exposure || typeof exposure.id !== 'string' || !Number.isFinite(exposure.exposedAt)) continue
    if (exposure.exposedAt <= cutoff || exposure.exposedAt > now) continue
    const current = latestById.get(exposure.id) ?? -Infinity
    if (exposure.exposedAt > current) latestById.set(exposure.id, exposure.exposedAt)
  }
  return [...latestById].map(([id, exposedAt]) => ({ id, exposedAt }))
}

export function recordRecommendationExposures(
  exposures: RecommendationExposure[],
  ids: string[],
  now: number
): RecommendationExposure[] {
  const result = pruneRecommendationExposures(exposures, now)
  const byId = new Map(result.map((exposure, index) => [exposure.id, index]))
  for (const id of ids) {
    if (!id) continue
    const index = byId.get(id)
    if (index === undefined) {
      byId.set(id, result.length)
      result.push({ id, exposedAt: now })
    } else {
      result[index] = { id, exposedAt: now }
    }
  }
  return result
}

function orderPoolCards(
  pool: RecommendationPool,
  exposedIds: Set<string>,
  seed: number
): RecommendationCard[] {
  const unique = new Map<string, RecommendationCard>()
  for (const card of pool.cards) {
    if (card?.id && !unique.has(card.id)) unique.set(card.id, card)
  }
  return [...unique.values()].sort((left, right) => {
    const exposureDifference = Number(exposedIds.has(left.id)) - Number(exposedIds.has(right.id))
    if (exposureDifference !== 0) return exposureDifference
    const leftJitter = hash(`${seed}:${pool.source}:${pool.tag ?? ''}:${left.id}`)
    const rightJitter = hash(`${seed}:${pool.source}:${pool.tag ?? ''}:${right.id}`)
    return leftJitter - rightJitter
  })
}

function interleavePools(
  pools: RecommendationPool[],
  exposedIds: Set<string>,
  seed: number
): RecommendationCard[] {
  const queues = pools.map((pool) => orderPoolCards(pool, exposedIds, seed))
  const result: RecommendationCard[] = []
  const seen = new Set<string>()
  let remaining = queues.reduce((total, queue) => total + queue.length, 0)
  while (remaining > 0) {
    for (const queue of queues) {
      while (queue.length > 0) {
        remaining--
        const card = queue.shift()!
        if (seen.has(card.id)) continue
        seen.add(card.id)
        result.push(card)
        break
      }
    }
  }
  return result
}

function diversifyAuthors(cards: RecommendationCard[]): RecommendationCard[] {
  const result = [...cards]
  for (let index = 1; index < result.length; index++) {
    const previousAuthor = result[index - 1].author?.trim()
    if (!previousAuthor || result[index].author?.trim() !== previousAuthor) continue
    const alternative = result.findIndex(
      (card, candidateIndex) => candidateIndex > index && card.author?.trim() !== previousAuthor
    )
    if (alternative > index) {
      const swap = result[index]
      result[index] = result[alternative]
      result[alternative] = swap
    }
  }
  return result
}

export function buildRecommendationFeed(
  pools: RecommendationPool[],
  exposures: RecommendationExposure[],
  options: RecommendationOptions
): RecommendationCard[] {
  const activeExposures = pruneRecommendationExposures(exposures, options.now)
  const exposedIds = new Set(activeExposures.map((exposure) => exposure.id))
  const queues = new Map<RecommendationSource, RecommendationCard[]>()
  for (const source of SOURCE_ORDER) {
    const sourcePools = pools.filter((pool) => pool.source === source && pool.cards.length > 0)
    if (sourcePools.length > 0) {
      queues.set(source, interleavePools(sourcePools, exposedIds, options.seed))
    }
  }

  const activeSources = SOURCE_ORDER.filter((source) => (queues.get(source)?.length ?? 0) > 0)
  const weights = { ...SOURCE_WEIGHTS }
  if (!activeSources.includes('tag')) {
    const baseSources = activeSources.filter((source) => source !== 'tag')
    for (const source of baseSources) weights[source] += SOURCE_WEIGHTS.tag / baseSources.length
  }

  const totalAvailable = [...queues.values()].reduce((total, queue) => total + queue.length, 0)
  const limit = Math.min(options.limit ?? totalAvailable, totalAvailable)
  const totalWeight = activeSources.reduce((total, source) => total + weights[source], 0)
  const quotas = new Map<RecommendationSource, number>()
  const remainders = activeSources.map((source) => {
    const exact = limit * weights[source] / totalWeight
    const floor = Math.floor(exact)
    quotas.set(source, floor)
    return { source, remainder: exact - floor }
  })
  let unassigned = limit - [...quotas.values()].reduce((total, quota) => total + quota, 0)
  remainders.sort((left, right) => {
    const difference = right.remainder - left.remainder
    return Math.abs(difference) > 1e-9
      ? difference
      : SOURCE_ORDER.indexOf(left.source) - SOURCE_ORDER.indexOf(right.source)
  })
  for (const { source } of remainders) {
    if (unassigned <= 0) break
    quotas.set(source, (quotas.get(source) ?? 0) + 1)
    unassigned--
  }
  const selectedBySource = new Map<RecommendationSource, number>()
  const selectedIds = new Set<string>()
  const result: RecommendationCard[] = []

  while (result.length < limit) {
    let availableSources = activeSources.filter((source) =>
      (queues.get(source)?.length ?? 0) > 0
      && (selectedBySource.get(source) ?? 0) < (quotas.get(source) ?? 0)
    )
    if (availableSources.length === 0) {
      availableSources = activeSources.filter((source) => (queues.get(source)?.length ?? 0) > 0)
    }
    if (availableSources.length === 0) break
    const targetPosition = result.length + 1
    const source = availableSources.reduce((best, candidate) => {
      const bestDeficit = targetPosition * weights[best] / totalWeight - (selectedBySource.get(best) ?? 0)
      const candidateDeficit = targetPosition * weights[candidate] / totalWeight - (selectedBySource.get(candidate) ?? 0)
      return candidateDeficit > bestDeficit ? candidate : best
    })
    const queue = queues.get(source)!
    let card: RecommendationCard | undefined
    while (queue.length > 0 && !card) {
      const candidate = queue.shift()!
      if (!selectedIds.has(candidate.id)) card = candidate
    }
    if (!card) continue
    selectedIds.add(card.id)
    selectedBySource.set(source, (selectedBySource.get(source) ?? 0) + 1)
    result.push(card)
  }

  return diversifyAuthors(result)
}

export function nextRecommendationVisibleCount(current: number, total: number): number {
  if (total <= 0) return 0
  const next = current <= 0 ? RECOMMENDATION_INITIAL_COUNT : current + RECOMMENDATION_BATCH_COUNT
  return Math.min(total, next)
}
