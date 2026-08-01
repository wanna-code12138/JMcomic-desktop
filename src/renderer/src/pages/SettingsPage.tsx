import React from 'react'
import {
  makeStyles, Text, Switch, Slider, Button,
  Card, Input
} from '@fluentui/react-components'
import { ArrowSync20Regular } from '@fluentui/react-icons'
import { useAppStore } from '../stores/appStore'

const useStyles = makeStyles({
  root: {
    padding: '24px',
    height: '100%',
    overflow: 'auto',
    maxWidth: '720px'
  },
  section: { marginBottom: '32px' },
  sectionTitle: {
    marginBottom: '16px',
    display: 'block',
    color: 'var(--ac-text-1)'
  },
  card: {
    marginBottom: '16px',
    backgroundColor: 'var(--ac-glass-bg)',
    backdropFilter: 'blur(var(--ac-blur-panel))',
    WebkitBackdropFilter: 'blur(var(--ac-blur-panel))',
    border: '1px solid var(--ac-glass-border)',
    borderRadius: 'var(--ac-radius-card)',
    boxShadow: 'inset 0 1px 0 var(--ac-glass-inset-hi), var(--ac-glass-shadow)'
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '24px'
  },
  buttonRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px'
  },
  statusText: {
    display: 'block',
    marginTop: '10px',
    color: 'var(--ac-text-2)',
    wordBreak: 'break-all'
  },
  subPanel: {
    marginTop: '14px',
    paddingTop: '12px',
    borderTop: '1px dashed var(--ac-glass-border)'
  }
})

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`
  return `${Math.max(0, Math.round(bytes / 1024))} KB`
}

function formatLimit(mb: number): string {
  if (mb >= 1024) {
    const gb = mb / 1024
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`
  }
  return `${mb} MB`
}

export default function SettingsPage(): JSX.Element {
  const styles = useStyles()
  const {
    themeMode, setThemeMode, networkStatus, setNetworkStatus,
    micaEnabled, solidWindow, setMicaEnabled, setSolidWindow
  } = useAppStore()

  const [dataStatus, setDataStatus] = React.useState('')
  const [appVersion, setAppVersion] = React.useState('1.0.3')

  // 手动代理
  const [proxyEnabled, setProxyEnabled] = React.useState(false)
  const [proxyUrl, setProxyUrl] = React.useState('')
  const [proxyBusy, setProxyBusy] = React.useState(false)
  const [proxyStatus, setProxyStatus] = React.useState('')

  // 网络探测
  const [probeInfo, setProbeInfo] = React.useState('')
  const [probeBusy, setProbeBusy] = React.useState(false)

  // 图片缓存
  const [cacheLimitMb, setCacheLimitMb] = React.useState(1000)
  const [cacheSize, setCacheSize] = React.useState(0)
  const [cacheStatus, setCacheStatus] = React.useState('')
  const cacheTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // 下载
  const [downloadDir, setDownloadDir] = React.useState('')
  const [downloadConcurrency, setDownloadConcurrency] = React.useState(4)
  const [downloadRetries, setDownloadRetries] = React.useState(3)
  const [downloadResumeOnStartup, setDownloadResumeOnStartup] = React.useState(true)
  const downloadTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    window.electronAPI?.appVersion().then((v) => {
      if (v) setAppVersion(String(v))
    })

    window.electronAPI?.settingsGet().then((s) => {
      if (!s) return
      setProxyEnabled(s.proxyEnabled)
      setProxyUrl(s.proxyUrl)
      setCacheLimitMb(s.cacheLimitMb)
      setDownloadDir(s.downloadDir)
      setDownloadConcurrency(s.downloadConcurrency)
      setDownloadRetries(s.downloadRetries)
      setDownloadResumeOnStartup(s.downloadResumeOnStartup)
    })

    window.electronAPI?.imageCacheSize().then((bytes) => {
      if (typeof bytes === 'number') setCacheSize(bytes)
    })

    // 进入设置页时刷新一次真实网络状态（顺带修正全局状态栏）
    window.electronAPI?.networkProbe().then((result) => {
      if (!result) return
      setNetworkStatus(result.status)
      setProbeInfo(`延迟 ${result.latency} ms · ${result.via === 'proxy' ? '代理连接' : '直连'}${result.url ? ` · ${result.url}` : ''}`)
    })

    return () => {
      if (cacheTimer.current) clearTimeout(cacheTimer.current)
      if (downloadTimer.current) clearTimeout(downloadTimer.current)
    }
  }, [setNetworkStatus])

  const handleMicaChange = (checked: boolean): void => {
    setMicaEnabled(checked)
    window.electronAPI?.settingsSet({ micaEnabled: checked })
  }

  const handleSolidChange = (checked: boolean): void => {
    setSolidWindow(checked)
    window.electronAPI?.settingsSet({ solidWindow: checked })
  }

  const handleProxyToggle = async (checked: boolean): Promise<void> => {
    setProxyEnabled(checked)
    if (!checked) {
      setProxyBusy(true)
      const result = await window.electronAPI?.networkApplyProxy(false, '')
      setProxyBusy(false)
      setProxyStatus(
        result?.ok
          ? '已关闭手动代理，恢复系统代理'
          : `关闭失败：${result?.error ?? '未知错误'}`
      )
    } else {
      setProxyStatus('填写代理地址后点击“应用并测试”')
    }
  }

  const handleProxyApply = async (): Promise<void> => {
    if (!proxyUrl.trim()) {
      setProxyStatus('请输入代理地址')
      return
    }
    setProxyBusy(true)
    const result = await window.electronAPI?.networkApplyProxy(true, proxyUrl)
    setProxyBusy(false)
    if (!result) return
    if (!result.ok) {
      setProxyStatus(`❌ ${result.error ?? '设置失败'}`)
      return
    }
    if (result.proxyUrl) setProxyUrl(result.proxyUrl)
    if (result.probe) {
      setNetworkStatus(result.probe.status)
      setProbeInfo(`延迟 ${result.probe.latency} ms · ${result.probe.via === 'proxy' ? '代理连接' : '直连'}${result.probe.url ? ` · ${result.probe.url}` : ''}`)
      setProxyStatus(
        result.probe.status === 'online'
          ? '✅ 代理已生效，访问正常'
          : result.probe.status === 'degraded'
            ? '✅ 代理已生效（经代理访问）'
            : '⚠️ 代理已设置，但当前无法访问目标站点'
      )
    } else {
      setProxyStatus('✅ 代理已生效')
    }
  }

  const handleProbe = async (): Promise<void> => {
    setProbeBusy(true)
    const result = await window.electronAPI?.networkProbe()
    setProbeBusy(false)
    if (!result) return
    setNetworkStatus(result.status)
    setProbeInfo(
      `延迟 ${result.latency} ms · ${result.via === 'proxy' ? '代理连接' : '直连'}${result.url ? ` · ${result.url}` : ''}` +
      (result.proxyUrl ? ` · 代理 ${result.proxyUrl}` : '')
    )
  }

  const handleCacheLimitChange = (value: number): void => {
    setCacheLimitMb(value)
    if (cacheTimer.current) clearTimeout(cacheTimer.current)
    cacheTimer.current = setTimeout(() => {
      window.electronAPI?.settingsSet({ cacheLimitMb: value })
    }, 500)
  }

  const handleClearImageCache = async (): Promise<void> => {
    const count = await window.electronAPI?.imageClearCache()
    const bytes = await window.electronAPI?.imageCacheSize()
    if (typeof bytes === 'number') setCacheSize(bytes)
    setCacheStatus(`已清空 ${Number(count ?? 0)} 个图片缓存文件`)
  }

  const handleChooseDownloadDir = async (): Promise<void> => {
    const result = await window.electronAPI?.downloadChooseDir()
    if (!result || result.canceled || !result.path) return
    setDownloadDir(String(result.path))
    await window.electronAPI?.settingsSet({ downloadDir: String(result.path) })
  }

  const handleDownloadDirApply = async (): Promise<void> => {
    const dir = downloadDir.trim()
    if (!dir) return
    setDownloadDir(dir)
    await window.electronAPI?.settingsSet({ downloadDir: dir })
  }

  const handleConcurrencyChange = (value: number): void => {
    setDownloadConcurrency(value)
    if (downloadTimer.current) clearTimeout(downloadTimer.current)
    downloadTimer.current = setTimeout(() => {
      window.electronAPI?.settingsSet({ downloadConcurrency: value })
    }, 400)
  }

  const handleRetriesChange = (value: number): void => {
    setDownloadRetries(value)
    if (downloadTimer.current) clearTimeout(downloadTimer.current)
    downloadTimer.current = setTimeout(() => {
      window.electronAPI?.settingsSet({ downloadRetries: value })
    }, 400)
  }

  const handleResumeChange = (checked: boolean): void => {
    setDownloadResumeOnStartup(checked)
    window.electronAPI?.settingsSet({ downloadResumeOnStartup: checked })
  }

  const handleExportPersonalData = async (): Promise<void> => {
    const result = await window.electronAPI?.personalDataExport()
    if (!result) return
    if (result.canceled) {
      setDataStatus('已取消导出')
      return
    }
    setDataStatus(`已导出到 ${String(result.path)}`)
  }

  const handleImportPersonalData = async (): Promise<void> => {
    const result = await window.electronAPI?.personalDataImport()
    if (!result) return
    if (result.canceled) {
      setDataStatus('已取消导入')
      return
    }
    if (result.error) {
      setDataStatus(`导入失败：${String(result.error)}`)
      return
    }
    const c = result.imported as Record<string, number>
    setDataStatus(
      `导入完成：收藏 ${c.favorites} 条、历史 ${c.readingHistory} 条、` +
      `搜索 ${c.searchHistory} 条、下载 ${c.downloads} 条` +
      `（跳过 ${Number(result.skipped)} 条无效数据）`
    )
  }

  const handleClearPersonalData = async (): Promise<void> => {
    const confirmed = window.confirm(
      '确定要清除所有内部个人数据吗？\n\n' +
      '收藏、阅读历史、搜索历史、下载记录和登录凭据都会被删除，且无法恢复。'
    )
    if (!confirmed) return
    const counts = await window.electronAPI?.personalDataClear()
    if (!counts) return
    setDataStatus(
      `已清除：收藏 ${counts.favorites} 条、历史 ${counts.readingHistory} 条、` +
      `搜索 ${counts.searchHistory} 条、下载 ${counts.downloads} 条、登录凭据 ${counts.auth} 条`
    )
  }

  return (
    <div className={styles.root}>
      {/* Appearance */}
      <div className={styles.section}>
        <Text size={500} weight="semibold" className={styles.sectionTitle}>外观</Text>
        <Card className={styles.card}>
          <div className={styles.row}>
            <div>
              <Text weight="semibold" style={{ color: 'var(--ac-text-1)' }}>主题模式</Text>
              <div>
                <Text size={200} style={{ color: 'var(--ac-text-3)' }}>
                  跟随系统 / 浅色 / 深色
                </Text>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['system', 'light', 'dark'] as const).map((m) => (
                <Button
                  key={m}
                  size="small"
                  appearance={themeMode === m ? 'primary' : 'subtle'}
                  onClick={() => {
                    setThemeMode(m)
                    window.electronAPI?.settingsSet({ themeMode: m })
                  }}
                >
                  {m === 'system' ? '跟随系统' : m === 'light' ? '浅色' : '深色'}
                </Button>
              ))}
            </div>
          </div>
        </Card>
        <Card className={styles.card}>
          <div className={styles.row}>
            <div>
              <Text weight="semibold">Mica 云母材质</Text>
              <div><Text size={200} style={{ color: 'var(--ac-text-3)' }}>Windows 11 半透明背景效果</Text></div>
            </div>
            <Switch checked={micaEnabled} onChange={(_e, d) => handleMicaChange(d.checked)} />
          </div>
          {!micaEnabled && (
            <div className={styles.subPanel}>
              <div className={styles.row}>
                <div>
                  <Text weight="semibold">纯色不透明窗口</Text>
                  <div><Text size={200} style={{ color: 'var(--ac-text-3)' }}>关闭时为亚克力；打开此开关用纯色背景，节省 GPU</Text></div>
                </div>
                <Switch checked={solidWindow} onChange={(_e, d) => handleSolidChange(d.checked)} />
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Network */}
      <div className={styles.section}>
        <Text size={500} weight="semibold" className={styles.sectionTitle}>网络</Text>
        <Card className={styles.card}>
          <div className={styles.row}>
            <div>
              <Text weight="semibold">手动代理</Text>
              <div><Text size={200} style={{ color: 'var(--ac-text-3)' }}>覆盖系统代理，填写 HTTP/SOCKS5 地址</Text></div>
            </div>
            <Switch checked={proxyEnabled} onChange={(_e, d) => handleProxyToggle(d.checked)} />
          </div>
          <div className={styles.buttonRow} style={{ marginTop: '12px' }}>
            <Input
              placeholder="例如: http://127.0.0.1:7890"
              style={{ width: '280px' }}
              value={proxyUrl}
              disabled={!proxyEnabled}
              onChange={(_e, d) => setProxyUrl(d.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleProxyApply() }}
            />
            <Button
              size="small"
              appearance="secondary"
              disabled={!proxyEnabled || proxyBusy}
              onClick={handleProxyApply}
            >
              {proxyBusy ? '应用中…' : '应用并测试'}
            </Button>
          </div>
          {proxyStatus && <Text size={200} className={styles.statusText}>{proxyStatus}</Text>}
        </Card>
        <Card className={styles.card}>
          <div className={styles.row}>
            <div>
              <Text weight="semibold">当前网络状态</Text>
              <div>
                <Text size={200} style={{ color: 'var(--ac-text-3)' }}>
                  {networkStatus === 'online' ? '🟢 直连正常 — 可直接访问禁漫天堂'
                    : networkStatus === 'degraded' ? '🟡 代理连接 — 通过代理访问中'
                    : '🔴 无法访问 — 请检查代理或网络'}
                </Text>
              </div>
              {probeInfo && <Text size={200} className={styles.statusText}>{probeInfo}</Text>}
            </div>
            <Button size="small" icon={<ArrowSync20Regular />} disabled={probeBusy} onClick={handleProbe}>
              {probeBusy ? '探测中…' : '重新探测'}
            </Button>
          </div>
        </Card>
      </div>

      {/* Downloads */}
      <div className={styles.section}>
        <Text size={500} weight="semibold" className={styles.sectionTitle}>下载</Text>
        <Card className={styles.card}>
          <div className={styles.row}>
            <div>
              <Text weight="semibold">下载目录</Text>
              <div>
                <Text size={200} style={{ color: 'var(--ac-text-3)' }}>
                  漫画按「目录/漫画名/章节名」保存，新任务使用此目录
                </Text>
              </div>
            </div>
            <Button size="small" appearance="secondary" onClick={handleChooseDownloadDir}>选择…</Button>
          </div>
          <div className={styles.buttonRow} style={{ marginTop: '12px' }}>
            <Input
              style={{ flex: 1 }}
              value={downloadDir}
              placeholder="下载目录"
              onChange={(_e, d) => setDownloadDir(d.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleDownloadDirApply() }}
            />
            <Button size="small" appearance="secondary" onClick={handleDownloadDirApply}>应用</Button>
          </div>
        </Card>
        <Card className={styles.card}>
          <div style={{ marginBottom: '8px' }}>
            <Text weight="semibold">同时下载章节数</Text>
            <Text size={200} style={{ color: 'var(--ac-text-3)', display: 'block', marginTop: '2px' }}>
              当前 {downloadConcurrency} 个任务并行（1–8）
            </Text>
          </div>
          <Slider
            min={1}
            max={8}
            step={1}
            value={downloadConcurrency}
            onChange={(_e, d) => handleConcurrencyChange(d.value)}
          />
        </Card>
        <Card className={styles.card}>
          <div style={{ marginBottom: '8px' }}>
            <Text weight="semibold">图片失败重试次数</Text>
            <Text size={200} style={{ color: 'var(--ac-text-3)', display: 'block', marginTop: '2px' }}>
              当前 {downloadRetries} 次（0–6，单张图片下载失败后自动重试）
            </Text>
          </div>
          <Slider
            min={0}
            max={6}
            step={1}
            value={downloadRetries}
            onChange={(_e, d) => handleRetriesChange(d.value)}
          />
        </Card>
        <Card className={styles.card}>
          <div className={styles.row}>
            <div>
              <Text weight="semibold">启动时自动续传</Text>
              <div>
                <Text size={200} style={{ color: 'var(--ac-text-3)' }}>
                  打开应用后自动继续未完成（含上次中断）的下载任务
                </Text>
              </div>
            </div>
            <Switch checked={downloadResumeOnStartup} onChange={(_e, d) => handleResumeChange(d.checked)} />
          </div>
        </Card>
      </div>

      {/* Personal data */}
      <div className={styles.section}>
        <Text size={500} weight="semibold" className={styles.sectionTitle}>个人数据</Text>
        <Card className={styles.card}>
          <div style={{ marginBottom: '12px' }}>
            <Text weight="semibold">数据随程序文件存放</Text>
            <div>
              <Text size={200} style={{ color: 'var(--ac-text-3)' }}>
                便携版的数据保存在 exe 同目录的 JMComicData 文件夹中，复制整个文件夹即可随程序迁移
              </Text>
            </div>
          </div>
          <div className={styles.buttonRow}>
            <Button size="small" appearance="secondary" onClick={handleExportPersonalData}>
              导出个人数据
            </Button>
            <Button size="small" appearance="secondary" onClick={handleImportPersonalData}>
              导入个人数据
            </Button>
            <Button
              size="small"
              appearance="secondary"
              style={{ color: 'var(--ac-danger, #d13438)' }}
              onClick={handleClearPersonalData}
            >
              清除个人数据
            </Button>
          </div>
          {dataStatus && (
            <Text size={200} className={styles.statusText}>{dataStatus}</Text>
          )}
        </Card>
      </div>

      {/* Cache */}
      <div className={styles.section}>
        <Text size={500} weight="semibold" className={styles.sectionTitle}>缓存</Text>
        <Card className={styles.card}>
          <div className={styles.row}>
            <div>
              <Text weight="semibold">图片缓存</Text>
              <div><Text size={200} style={{ color: 'var(--ac-text-3)' }}>缓存已浏览的漫画图片，重开阅读器不再重复下载</Text></div>
              {cacheSize > 0 && (
                <Text size={200} style={{ color: 'var(--ac-text-3)', display: 'block', marginTop: '4px' }}>
                  当前占用 {formatBytes(cacheSize)}
                </Text>
              )}
            </div>
            <Button size="small" appearance="secondary" onClick={handleClearImageCache}>清空缓存</Button>
          </div>
          {cacheStatus && <Text size={200} className={styles.statusText}>{cacheStatus}</Text>}
        </Card>
        <Card className={styles.card}>
          <div style={{ marginBottom: '8px' }}>
            <Text weight="semibold">缓存大小限制</Text>
          </div>
          <Slider
            min={100}
            max={5000}
            step={100}
            value={cacheLimitMb}
            onChange={(_e, d) => handleCacheLimitChange(d.value)}
          />
          <Text size={200} style={{ color: 'var(--ac-text-3)', marginTop: '4px' }}>
            当前限制: {formatLimit(cacheLimitMb)}（超出后自动删除最旧的图片）
          </Text>
        </Card>
      </div>

      {/* About */}
      <div className={styles.section}>
        <Text size={500} weight="semibold" className={styles.sectionTitle}>关于</Text>
        <Card className={styles.card}>
          <Text weight="semibold">JMComic Desktop</Text>
          <div><Text size={200} style={{ color: 'var(--ac-text-3)' }}>版本 {appVersion} · Electron + React + Fluent UI</Text></div>
        </Card>
      </div>
    </div>
  )
}
