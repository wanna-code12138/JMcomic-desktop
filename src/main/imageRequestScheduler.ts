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
}

export interface ImageRequestScheduler {
  run<T>(
    requestOrKey: string | ImageRequestDescriptor,
    task: (signal: AbortSignal) => Promise<T>
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
}

interface QueueEntry<T> {
  key: string
  host: string
  priority: ImagePriority
  rank: number
  sequence: number
  task: (signal: AbortSignal) => Promise<T>
  abortController: AbortController
  subscribers: Subscriber<T>[]
  inFlightPromise: Promise<T>
}

export function createImageRequestScheduler(
  optionsOrMaxConcurrent: number | SchedulerOptions = 6
): ImageRequestScheduler {
  let maxConcurrent = IMAGE_REQUEST_LIMITS.global
  let maxPerHost = IMAGE_REQUEST_LIMITS.perHost

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
        (entry) => !entry.host || getHostCount(entry.host) < maxPerHost
      )
      if (candidateIndex === -1) {
        break
      }

      const entry = queue.splice(candidateIndex, 1)[0]
      if (entry.subscribers.length === 0) {
        inFlightByKey.delete(entry.key)
        continue
      }

      active++
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
            for (const sub of entry.subscribers) {
              sub.resolve(value)
            }
          },
          (error) => {
            for (const sub of entry.subscribers) {
              sub.reject(error)
            }
          }
        )
        .finally(() => {
          active--
          if (entry.host) decHostCount(entry.host)
          if (inFlightByKey.get(entry.key) === entry) {
            inFlightByKey.delete(entry.key)
          }
          drain()
        })
    }
  }

  function run<T>(
    requestOrKey: string | ImageRequestDescriptor,
    task: (signal: AbortSignal) => Promise<T>
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

      if (!signal) {
        return existing.inFlightPromise
      }

      return new Promise<T>((resolve, reject) => {
        const subscriber: Subscriber<T> = { resolve, reject, signal }
        existing.subscribers.push(subscriber)

        signal.addEventListener(
          'abort',
          () => {
            const idx = existing.subscribers.indexOf(subscriber)
            if (idx !== -1) existing.subscribers.splice(idx, 1)
            reject(signal.reason ?? new Error('Request aborted'))
            if (existing.subscribers.length === 0) {
              existing.abortController.abort()
            }
          },
          { once: true }
        )
      })
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
      abortController,
      subscribers: [{ resolve: entryResolve, reject: entryReject, signal }],
      inFlightPromise
    }

    inFlightByKey.set(key, entry)

    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          const idx = entry.subscribers.findIndex((s) => s.resolve === entryResolve)
          if (idx !== -1) entry.subscribers.splice(idx, 1)
          entryReject(signal.reason ?? new Error('Request aborted'))
          if (entry.subscribers.length === 0) {
            entry.abortController.abort()
            const queueIdx = queue.indexOf(entry)
            if (queueIdx !== -1) queue.splice(queueIdx, 1)
            inFlightByKey.delete(key)
          }
        },
        { once: true }
      )
    }

    // 插入队列并按 rank升序、sequence升序保持稳定队列
    queue.push(entry)
    queue.sort((a, b) => a.rank - b.rank || a.sequence - b.sequence)

    drain()
    return inFlightPromise
  }

  function cancel(key: string): void {
    const entry = inFlightByKey.get(key)
    if (!entry) return

    entry.abortController.abort(new Error(`Cancelled: ${key}`))
    const queueIdx = queue.indexOf(entry)
    if (queueIdx !== -1) {
      queue.splice(queueIdx, 1)
    }
    for (const sub of entry.subscribers) {
      sub.reject(new Error(`Cancelled: ${key}`))
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
