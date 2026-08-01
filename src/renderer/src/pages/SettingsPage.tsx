import React from 'react'
import {
  makeStyles, Text, Switch, Slider, Button,
  Card, CardHeader, Input, Label, Divider,
  Select, Field, Spinner
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
  }
})

export default function SettingsPage(): JSX.Element {
  const styles = useStyles()
  const { darkMode, themeMode, setThemeMode, networkStatus } = useAppStore()
  const [dataStatus, setDataStatus] = React.useState('')
  const [appVersion, setAppVersion] = React.useState('1.0.2')

  React.useEffect(() => {
    window.electronAPI?.appVersion().then((v) => {
      if (v) setAppVersion(String(v))
    })
  }, [])

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
                  onClick={() => setThemeMode(m)}
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
            <Switch defaultChecked={true} />
          </div>
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
            <Input placeholder="例如: http://127.0.0.1:7890" style={{ width: '280px' }} />
          </div>
        </Card>
        <Card className={styles.card}>
          <div className={styles.row}>
            <div>
              <Text weight="semibold">当前网络状态</Text>
              <div>
                <Text size={200} style={{ color: 'var(--ac-text-3)' }}>
                  {networkStatus === 'online' ? '🟢 直连正常 — 可直接访问禁漫天堂'
                    : networkStatus === 'degraded' ? '🟡 代理连接 — 通过系统代理访问中'
                    : '🔴 无法访问 — 请检查代理或网络'}
                </Text>
                <Text size={100} style={{ color: 'var(--ac-text-3)', display: 'block', marginTop: '4px' }}>
                  系统代理地址会自动从 Windows 注册表读取（当前 Clash 端口 6518 已检测）
                </Text>
              </div>
            </div>
            <Button size="small" icon={<ArrowSync20Regular />}>重新探测</Button>
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
              <div><Text size={200} style={{ color: 'var(--ac-text-3)' }}>缓存已浏览的漫画图片</Text></div>
            </div>
            <Button size="small" appearance="secondary">清空缓存</Button>
          </div>
        </Card>
        <Card className={styles.card}>
          <div style={{ marginBottom: '12px' }}>
            <Text weight="semibold">缓存大小限制</Text>
          </div>
          <Slider min={100} max={5000} defaultValue={1000} />
          <Text size={200} style={{ color: 'var(--ac-text-3)', marginTop: '4px' }}>当前限制: 1 GB</Text>
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
