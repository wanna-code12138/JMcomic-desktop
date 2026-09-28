export type DatabaseScheduleReason = 'history' | 'download' | 'favorite' | 'settings'

export interface DatabaseWriteCoordinatorOptions {
  debounceMs?: number
  writer: () => Promise<void>
}

export interface DatabaseWriteCoordinator {
  schedule(reason: DatabaseScheduleReason): void
  flush(): Promise<void>
  close(timeoutMs?: number): Promise<'flushed' | 'timeout'>
}

export function createDatabaseWriteCoordinator(
  options: DatabaseWriteCoordinatorOptions
): DatabaseWriteCoordinator {
  const debounceMs = options.debounceMs ?? 100
  let isDirty = false
  let timer: NodeJS.Timeout | null = null
  let activeFlush: Promise<void> | null = null

  async function executeFlush(): Promise<void> {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }

    if (activeFlush !== null) {
      await activeFlush
      // The preceding waiter may already have started the next writer and cleared dirty.
      // Recheck both in-flight and dirty state before reporting that all writes drained.
      return executeFlush()
    }

    if (!isDirty) return

    isDirty = false
    const currentPromise = (async () => {
      await options.writer()
    })().catch((error) => {
      isDirty = true
      throw error
    }).finally(() => {
      if (activeFlush === currentPromise) {
        activeFlush = null
      }
    })

    activeFlush = currentPromise
    await currentPromise

    // 如果在当前写入过程中又有新的 schedule 到来，继续执行下一轮 flush
    if (isDirty) {
      return executeFlush()
    }
  }

  return {
    schedule(_reason: DatabaseScheduleReason): void {
      isDirty = true
      if (timer === null && activeFlush === null) {
        timer = setTimeout(() => {
          timer = null
          void executeFlush().catch(() => {})
        }, debounceMs)
      }
    },

    async flush(): Promise<void> {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      // 保证将当前在途和积压的 dirty 彻底刷新完成
      if (activeFlush !== null || isDirty) {
        await executeFlush()
      }
    },

    async close(timeoutMs = 2000): Promise<'flushed' | 'timeout'> {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }

      let timeoutHandle: NodeJS.Timeout | null = null
      const timeoutPromise = new Promise<'timeout'>((resolve) => {
        timeoutHandle = setTimeout(() => resolve('timeout'), timeoutMs)
      })

      const flushPromise = executeFlush().then(() => 'flushed' as const)

      const result = await Promise.race([flushPromise, timeoutPromise])
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle)
      }
      return result
    }
  }
}
