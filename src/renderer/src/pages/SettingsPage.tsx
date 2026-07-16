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
  }
})

export default function SettingsPage(): JSX.Element {
  const styles = useStyles()
  const { darkMode, themeMode, setThemeMode, networkStatus } = useAppStore()

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
          <div><Text size={200} style={{ color: 'var(--ac-text-3)' }}>版本 1.0.0 · Electron + React + Fluent UI</Text></div>
        </Card>
      </div>
    </div>
  )
}
