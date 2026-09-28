export function createShutdownController(ports: {
  saveRenderer: () => Promise<void>
  stopWork: () => Promise<void>
  closeDatabase: () => Promise<void>
  resumeWork?: () => void
}): { prepare: () => Promise<void> } {
  let pending: Promise<void> | undefined
  return { prepare() {
    if (!pending) pending = (async () => {
      await ports.saveRenderer()
      await ports.stopWork()
      await ports.closeDatabase()
    })().catch((error) => { pending = undefined; ports.resumeWork?.(); throw error })
    return pending
  } }
}
