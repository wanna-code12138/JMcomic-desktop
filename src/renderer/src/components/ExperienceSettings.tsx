import React from 'react'
import { Card, Switch, Button, Text } from '@fluentui/react-components'
import { useAppStore } from '../stores/appStore'
import type { GraphicsStatus } from '../../../shared/graphicsContracts'

export default function ExperienceSettings({ cardClass, rowClass }: { cardClass: string; rowClass: string }): JSX.Element {
  const animations = useAppStore(state => state.animationsEnabled)
  const restore = useAppStore(state => state.restoreReaderWorkspace)
  const [gpu, setGpu] = React.useState<GraphicsStatus | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  React.useEffect(() => {
    window.electronAPI?.graphicsGet().then(setGpu).catch(() => setError('无法读取图形设置'))
    return window.electronAPI?.onGraphicsChanged(setGpu)
  }, [])
  const update = async (key: 'animationsEnabled' | 'restoreReaderWorkspace', value: boolean): Promise<void> => {
    try {
      const settings = await window.electronAPI?.settingsSet({ [key]: value })
      if (settings) useAppStore.setState({ [key]: settings[key] })
      if (key === 'restoreReaderWorkspace' && value) {
        const state = useAppStore.getState()
        await window.electronAPI?.workspaceSet({ version: 1, tabs: state.readerTabs, activeId: state.activeReaderId })
      }
      setError('')
    } catch { setError('设置未能保存，请检查磁盘空间后重试。') }
  }
  return <>
    <Card className={cardClass}><div className={rowClass}>
      <div><Text weight="semibold">界面动画</Text><p className="settings-caption">页面、标签、分栏和控件的轻量过渡；遵循系统的减少动态效果设置。</p></div>
      <Switch aria-label="界面动画" checked={animations} onChange={(_event, data) => { void update('animationsEnabled', data.checked) }} />
    </div></Card>
    <Card className={cardClass}><div className={rowClass}>
      <div><Text weight="semibold">GPU 硬件加速</Text><p className="settings-caption">让可用的图形硬件辅助渲染，兼容集成与独立显卡。驱动不支持时自动回退。</p></div>
      <Switch aria-label="GPU 硬件加速" checked={gpu?.requested ?? true} disabled={busy || !gpu} onChange={async (_event, data) => {
        setBusy(true)
        try { const result = await window.electronAPI?.graphicsSet(data.checked); if (result) setGpu(result); setError('') }
        catch { setError('图形设置未能保存，请检查磁盘空间后重试。') } finally { setBusy(false) }
      }} />
    </div><p className="settings-caption" data-graphics-status>
      {!gpu?.initialized ? '正在检测图形能力…' : !gpu.runningPreference ? '当前使用软件渲染' : gpu.hardwareActive && gpu.compositor === 'enabled' ? '当前已启用硬件加速' : '当前由 Chromium 使用兼容渲染路径'}
    </p>{gpu?.restartRequired && <div className="settings-restart"><Text size={200}>重启后生效，阅读位置会先保存。</Text><Button size="small" onClick={() => { void window.electronAPI?.appRestart() }}>保存并重启</Button></div>}</Card>
    <Card className={cardClass}><div className={rowClass}>
      <div><Text weight="semibold">下次启动恢复阅读标签</Text><p className="settings-caption">恢复打开的漫画、标签名称、顺序和阅读位置。</p></div>
      <Switch aria-label="下次启动恢复阅读标签" checked={restore} onChange={(_event, data) => { void update('restoreReaderWorkspace', data.checked) }} />
    </div></Card>
    {error && <p role="alert" className="settings-error">{error}</p>}
  </>
}
