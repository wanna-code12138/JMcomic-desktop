import {
  type ImagePriority,
  priorityRank,
  IMAGE_REQUEST_LIMITS
} from './imageRequestPolicy'

export interface ImageRequestDescriptor {
  key: string
  host?: string
  priority?: ImagePriority
  signal?: AbortSignal
}

export interface SchedulerOptions {
  maxConcurrent?: number
  maxPerHost?: number
  maxBackground?: number
}

export interface ImageRequestScheduler {
  run<T>(
    requestOrKey: string | ImageRequestDescriptor,
    task: (signal: AbortSignal) => Promise<T>,
    holdUntil?: (value: T) => Promise<void>
  ): Promise<T>
  cancel(key: string): void
  activeCount(): number
  pendingCount(): number
  counts(): { active: number; pending: number; byHost: Record<string, number> }
}

interface Subscriber<T> {
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason: unknown) => void
  signal?: AbortSignal
  detach: () => void
}

interface QueueEntry<T> {
  key: string
  host: string
  priority: ImagePriority
  rank: number
  sequence: number
  task: (signal: AbortSignal) => Promise<T>
  holdUntil?: (value: T) => Promise<void>
  abortController: AbortController
  subscribers: Subscriber<T>[]
  inFlightPromise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
  unabortable: boolean
}

export function createImageRequestScheduler(
  optionsOrMaxConcurrent: number | SchedulerOptions = 6
): ImageRequestScheduler {
  let maxConcurrent: number = IMAGE_REQUEST_LIMITS.global
  let maxPerHost: number = IMAGE_REQUEST_LIMITS.perHost
  const maxBackground = typeof optionsOrMaxConcurrent === 'object'
    ? optionsOrMaxConcurrent.maxBackground ?? Infinity : Infinity
  if (!(maxBackground >= 1)) throw new RangeError('maxBackground must be positive')
  let activeBackground = 0

  if (typeof optionsOrMaxConcurrent === 'number') {
    if (!Number.isInteger(optionsOrMaxConcurrent) || optionsOrMaxConcurrent < 1) {
      throw new RangeError('maxConcurrent must be a positive integer')
    }
    maxConcurrent = optionsOrMaxConcurrent
  } else if (typeof optionsOrMaxConcurrent === 'object' && optionsOrMaxConcurrent !== null) {
    if (optionsOrMaxConcurrent.maxConcurrent !== undefined) {
      if (
        !Number.isInteger(optionsOrMaxConcurrent.maxConcurrent) ||
        optionsOrMaxConcurrent.maxConcurrent < 1
      ) {
        throw new RangeError('maxConcurrent must be a positive integer')
      }
      maxConcurrent = optionsOrMaxConcurrent.maxConcurrent
    }
    if (optionsOrMaxConcurrent.maxPerHost !== undefined) {
      if (
        !Number.isInteger(optionsOrMaxConcurrent.maxPerHost) ||
        optionsOrMaxConcurrent.maxPerHost < 1
      ) {
        throw new RangeError('maxPerHost must be a positive integer')
      }
      maxPerHost = optionsOrMaxConcurrent.maxPerHost
    }
  }

  const queue: QueueEntry<any>[] = []
  const inFlightByKey = new Map<string, QueueEntry<any>>()
  const activePerHost = new Map<string, number>()
  let active = 0
  let sequenceCounter = 0

  function getHostCount(host: string): number {
    return activePerHost.get(host) ?? 0
  }

  function incHostCount(host: string): void {
    activePerHost.set(host, getHostCount(host) + 1)
  }

  function decHostCount(host: string): void {
    const current = getHostCount(host)
    if (current <= 1) {
      activePerHost.delete(host)
    } else {
      activePerHost.set(host, current - 1)
    }
  }

  function drain(): void {
    while (active < maxConcurrent && queue.length > 0) {
      // 寻找满足 host 并发限制且优先级最高的条目（已按 rank/sequence 排序）
      const candidateIndex = queue.findIndex(
        (entry) => (!entry.host || getHostCount(entry.host) < maxPerHost)
          && (entry.priority !== 'background' || activeBackground < maxBackground)
      )
      if (candidateIndex === -1) {
        break
      }

      const entry = queue.splice(candidateIndex, 1)[0]
      if (entry.subscribers.length === 0 && !entry.unabortable) {
        inFlightByKey.delete(entry.key)
        continue
      }

      active++
      const startedAsBackground = entry.priority === 'background'
      if (startedAsBackground) activeBackground++
      if (entry.host) incHostCount(entry.host)

      let resultPromise: Promise<any>
      try {
        resultPromise = entry.task(entry.abortController.signal)
      } catch (err) {
        resultPromise = Promise.reject(err)
      }

      resultPromise
        .then(
          (value) => {
            entry.resolve(value)
            if (entry.holdUntil) return entry.holdUntil(value).catch(() => {})
          },
          (error) => {
            entry.reject(error)
          }
        )
        .finally(() => {
          for (const sub of entry.subscribers) sub.detach()
          entry.subscribers = []
          active--
          if (startedAsBackground) activeBackground--
          if (entry.host) decHostCount(entry.host)
          if (inFlightByKey.get(entry.key) === entry) {
            inFlightByKey.delete(entry.key)
          }
          drain()
        })
    }
  }

  function subscribe<T>(entry: QueueEntry<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) {
      entry.unabortable = true
      return entry.inFlightPromise
    }
    return new Promise<T>((resolve, reject) => {
      const abort = (): void => {
        const index = entry.subscribers.indexOf(subscriber)
        if (index !== -1) entry.subscribers.splice(index, 1)
        subscriber.detach()
        reject(signal.reason ?? new Error('Request aborted'))
        if (entry.subscribers.length === 0 && !entry.unabortable) {
          entry.abortController.abort(signal.reason)
          entry.reject(signal.reason ?? new Error('Request aborted'))
          const queued = queue.indexOf(entry)
          if (queued !== -1) queue.splice(queued, 1)
          if (inFlightByKey.get(entry.key) === entry) inFlightByKey.delete(entry.key)
        }
      }
      const subscriber: Subscriber<T> = {
        resolve, reject, signal,
        detach: () => signal.removeEventListener('abort', abort)
      }
      entry.subscribers.push(subscriber)
      entry.inFlightPromise.then(resolve, reject)
      signal.addEventListener('abort', abort, { once: true })
    })
  }

  function run<T>(
    requestOrKey: string | ImageRequestDescriptor,
    task: (signal: AbortSignal) => Promise<T>,
    holdUntil?: (value: T) => Promise<void>
  ): Promise<T> {
    const descriptor: ImageRequestDescriptor =
      typeof requestOrKey === 'string' ? { key: requestOrKey } : requestOrKey

    const key = descriptor.key
    const host = descriptor.host ?? ''
    const priority = descriptor.priority ?? 'near'
    const rank = priorityRank(priority)
    const signal = descriptor.signal

    if (signal?.aborted) {
      return Promise.reject(signal.reason ?? new Error('Request aborted'))
    }

    // Single-flight 检查：相同 key 复用在途任务
    const existing = inFlightByKey.get(key)
    if (existing) {
      // 提升已有任务的优先级（若新请求更高）
      if (rank < existing.rank) {
        existing.rank = rank
        existing.priority = priority
        // 若在排队中，重新保持队列排序
        queue.sort((a, b) => a.rank - b.rank || a.sequence - b.sequence)
      }

      const subscribed = subscribe(existing, signal)
      drain()
      return subscribed
    }

    const abortController = new AbortController()
    let entryResolve!: (value: T | PromiseLike<T>) => void
    let entryReject!: (reason: unknown) => void

    const inFlightPromise = new Promise<T>((resolve, reject) => {
      entryResolve = resolve
      entryReject = reject
    })

    const entry: QueueEntry<T> = {
      key,
      host,
      priority,
      rank,
      sequence: ++sequenceCounter,
      task,
      holdUntil,
      abortController,
      subscribers: [],
      inFlightPromise,
      resolve: entryResolve,
      reject: entryReject,
      unabortable: false
    }

    inFlightByKey.set(key, entry)

    const result = subscribe(entry, signal)

    // 插入队列并按 rank升序、sequence升序保持稳定队列
    queue.push(entry)
    queue.sort((a, b) => a.rank - b.rank || a.sequence - b.sequence)

    drain()
    return result
  }

  function cancel(key: string): void {
    const entry = inFlightByKey.get(key)
    if (!entry) return

    entry.abortController.abort(new Error(`Cancelled: ${key}`))
    const queueIdx = queue.indexOf(entry)
    if (queueIdx !== -1) {
      queue.splice(queueIdx, 1)
    }
    entry.reject(new Error(`Cancelled: ${key}`))
    for (const sub of entry.subscribers) {
      sub.reject(new Error(`Cancelled: ${key}`))
      sub.detach()
    }
    entry.subscribers = []
    inFlightByKey.delete(key)
  }

  return {
    run,
    cancel,
    activeCount: () => active,
    pendingCount: () => queue.length,
    counts: () => ({
      active,
      pending: queue.length,
      byHost: Object.fromEntries(activePerHost.entries())
    })
  }
}
