export interface CacheMaintenanceScheduler {
  schedule(): Promise<void>
  isScheduled(): boolean
}

export function createCacheMaintenanceScheduler(
  runMaintenance: () => Promise<void>
): CacheMaintenanceScheduler {
  let scheduled: Promise<void> | null = null

  function schedule(): Promise<void> {
    if (scheduled) return scheduled

    const tracked = Promise.resolve()
      .then(runMaintenance)
      .catch((error) => {
        console.warn('[image-cache] maintenance failed:', error)
      })
      .finally(() => {
        if (scheduled === tracked) scheduled = null
      })
    scheduled = tracked
    return tracked
  }

  return {
    schedule,
    isScheduled: () => scheduled !== null
  }
}
