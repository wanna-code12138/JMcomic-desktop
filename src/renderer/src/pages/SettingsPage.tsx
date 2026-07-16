import React from 'react'
import {
  makeStyles, tokens, Text, Switch, Slider, Button,
  Card, CardHeader, Input, Label, Divider,
  Select, Field, Spinner
} from '@fluentui/react-components'
import { ArrowSync20Regular } from '@fluentui/react-icons'
import { useAppStore } from '../stores/appStore'
import { useAccountStore } from '../stores/accountStore'
import {
  Dropdown, Option, type OptionOnSelectData, type SelectionEvents
} from '@fluentui/react-components'

const useStyles = makeStyles({
  root: { padding: '24px', height: '100%', overflow: 'auto', maxWidth: '720px' },
  section: { marginBottom: '32px' },
  sectionTitle: { marginBottom: '16px', display: 'block' },
  card: { marginBottom: '16px' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px' }
})

export default function SettingsPage(): JSX.Element {
  const styles = useStyles()
  const { darkMode, toggleDarkMode, networkStatus } = useAppStore()
  const { loggedIn, username, persistMode, logout, setPersistMode } = useAccountStore()
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)

  const onPersistModeChange = (_e: SelectionEvents, d: OptionOnSelectData): void => {
    setPersistMode(d.optionValue as 'cookie' | 'credential')
  }

  return (
    <div className={styles.root}>
      {/* Account */}
      <div className={styles.section}>
        <Text size={500} weight="semibold" className={styles.sectionTitle}>账户</Text>
        <Card className={styles.card}>
          {loggedIn ? (
            <div className={styles.row}>
              <div>
                <Text weight="semibold">已登录: {username}</Text>
                <div><Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>禁漫天堂账户</Text></div>
              </div>
              <Button size="small" appearance="secondary" onClick={logout}>退出登录</Button>
            </div>
          ) : (
            <div className={styles.row}>
              <div>
                <Text weight="semibold">未登录</Text>
                <div><Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>登录后可同步在线收藏和历史</Text></div>
              </div>
              <Button size="small" appearance="primary" onClick={() => setCurrentPage('favorites')}>去登录</Button>
            </div>
          )}
        </Card>
        <Card className={styles.card}>
          <div className={styles.row}>
            <div>
              <Text weight="semibold">登录持久化模式</Text>
              <div><Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                {persistMode === 'cookie'
                  ? '仅 Cookie：重启后验证 Cookie 有效性，失效需重新登录'
                  : '自动重登：加密保存密码，重启后自动重新登录'}
              </Text></div>
            </div>
            <Dropdown
              value={persistMode === 'cookie' ? '仅 Cookie' : '自动重登'}
              onOptionSelect={onPersistModeChange}
              size="small"
              style={{ width: '160px' }}
            >
              <Option value="cookie">仅 Cookie</Option>
              <Option value="credential">自动重登</Option>
            </Dropdown>
          </div>
        </Card>
      </div>

      {/* Appearance */}
      <div className={styles.section}>
        <Text size={500} weight="semibold" className={styles.sectionTitle}>外观</Text>
        <Card className={styles.card}>
          <div className={styles.row}>
            <div>
              <Text weight="semibold">深色模式</Text>
              <div><Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>切换深浅色主题</Text></div>
            </div>
            <Switch checked={darkMode} onChange={toggleDarkMode} />
          </div>
        </Card>
        <Card className={styles.card}>
          <div className={styles.row}>
            <div>
              <Text weight="semibold">Mica 云母材质</Text>
              <div><Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Windows 11 半透明背景效果</Text></div>
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
              <div><Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>覆盖系统代理，填写 HTTP/SOCKS5 地址</Text></div>
            </div>
            <Input placeholder="例如: http://127.0.0.1:7890" style={{ width: '280px' }} />
          </div>
        </Card>
        <Card className={styles.card}>
          <div className={styles.row}>
            <div>
              <Text weight="semibold">当前网络状态</Text>
              <div>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  {networkStatus === 'online' ? '🟢 直连正常 — 可直接访问禁漫天堂'
                    : networkStatus === 'degraded' ? '🟡 代理连接 — 通过系统代理访问中'
                    : '🔴 无法访问 — 请检查代理或网络'}
                </Text>
                <Text size={100} style={{ color: tokens.colorNeutralForeground4, display: 'block', marginTop: '4px' }}>
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
              <div><Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>缓存已浏览的漫画图片</Text></div>
            </div>
            <Button size="small" appearance="secondary">清空缓存</Button>
          </div>
        </Card>
        <Card className={styles.card}>
          <div style={{ marginBottom: '12px' }}>
            <Text weight="semibold">缓存大小限制</Text>
          </div>
          <Slider min={100} max={5000} defaultValue={1000} />
          <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginTop: '4px' }}>当前限制: 1 GB</Text>
        </Card>
      </div>

      {/* About */}
      <div className={styles.section}>
        <Text size={500} weight="semibold" className={styles.sectionTitle}>关于</Text>
        <Card className={styles.card}>
          <Text weight="semibold">JMComic Desktop</Text>
          <div><Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>版本 1.0.0 · Electron + React + Fluent UI</Text></div>
        </Card>
      </div>
    </div>
  )
}
