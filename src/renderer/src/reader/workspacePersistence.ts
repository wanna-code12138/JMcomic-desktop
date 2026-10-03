import { useAppStore } from '../stores/appStore'
import type { WorkspaceSnapshot } from '../../../shared/workspaceSnapshot'

export function installWorkspacePersistence(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const write = async (snapshot: WorkspaceSnapshot): Promise<void> => {
    if (timer) { clearTimeout(timer); timer = undefined }
    try { await window.electronAPI?.workspaceSet(snapshot); useAppStore.setState({ workspaceStorageError: '' }) }
    catch (error) { useAppStore.setState({ workspaceStorageError: '标签记录暂未保存，请检查磁盘空间。' }); throw error }
  }
  const unbind = useAppStore.getState().registerWorkspacePersistence(write)
  const unsubscribe = useAppStore.subscribe((state, previous) => {
    if (state.readerTabs === previous.readerTabs && state.activeReaderId === previous.activeReaderId) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      const current = useAppStore.getState()
      void write({ version: 1, tabs: current.readerTabs, activeId: current.activeReaderId }).catch(() => {})
    }, 300)
  })
  return () => { if (timer) clearTimeout(timer); unsubscribe(); unbind() }
}
