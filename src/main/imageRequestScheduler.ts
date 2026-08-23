export interface ImageRequestScheduler {
  run<T>(key: string, task: () => Promise<T>): Promise<T>
  activeCount(): number
  pendingCount(): number
}

interface QueueEntry<T> {
  key: string
  task: () => Promise<T>
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason: unknown) => void
}

export function createImageRequestScheduler(maxConcurrent: number): ImageRequestScheduler {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
    throw new RangeError('maxConcurrent must be a positive integer')
  }

  const queue: QueueEntry<unknown>[] = []
  const inFlight = new Map<string, Promise<unknown>>()
  let active = 0

  function drain(): void {
    while (active < maxConcurrent && queue.length > 0) {
      const entry = queue.shift()!
      active++

      let result: Promise<unknown>
      try {
        result = entry.task()
      } catch (error) {
        result = Promise.reject(error)
      }

      result.then(entry.resolve, entry.reject).finally(() => {
        active--
        if (inFlight.get(entry.key) === entry.promise) inFlight.delete(entry.key)
        drain()
      })
    }
  }

  function run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const existing = inFlight.get(key)
    if (existing) return existing as Promise<T>

    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    const entry: QueueEntry<T> = { key, task, promise, resolve, reject }
    inFlight.set(key, promise)
    queue.push(entry as QueueEntry<unknown>)
    drain()
    return promise
  }

  return {
    run,
    activeCount: () => active,
    pendingCount: () => queue.length
  }
}
