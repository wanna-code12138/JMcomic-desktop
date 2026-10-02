import React from 'react'
import { Button, Checkbox, Field, Input, Spinner, Tab, TabList, Text } from '@fluentui/react-components'
import { Person24Regular, ArrowClockwise20Regular } from '@fluentui/react-icons'
import { useAccountStore } from '../stores/accountStore'
import { useAppStore } from '../stores/appStore'
import { useCommunityStyles } from '../components/communityStyles'
import type { AccountNotifications } from '../../../shared/accountContracts'
import MyCommentsPanel from '../components/MyCommentsPanel'
import AccountActivityPanel from '../components/AccountActivityPanel'

export default function AccountPage(): JSX.Element {
  const styles = useCommunityStyles()
  const state = useAccountStore(store => store.state)
  const visible = useAppStore(store => store.currentPage === 'account')
  const [username, setUsername] = React.useState(''), [password, setPassword] = React.useState('')
  const [remember, setRemember] = React.useState(false), [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState(''), [tab, setTab] = React.useState('overview'), [revision, setRevision] = React.useState(0)
  const [notices, setNotices] = React.useState<{ generation: number; data: AccountNotifications } | null>(null)
  const [noticeError, setNoticeError] = React.useState(''), [loading, setLoading] = React.useState(false)
  const authenticating = state.phase === 'authenticating' || state.phase === 'restoring'
  React.useEffect(() => { if (!visible) setPassword('') }, [visible])
  React.useEffect(() => { setNotices(null); setNoticeError(''); setError('') }, [state.generation])
  React.useEffect(() => {
    if (!visible || tab !== 'notifications' || state.phase !== 'authenticated' || !window.electronAPI) return
    let cancelled = false
    setLoading(true); setNoticeError('')
    void window.electronAPI.accountNotifications(state.generation).then(reply => {
      if (cancelled) return
      if (reply.ok) setNotices({ generation: state.generation, data: reply.data }); else setNoticeError(reply.error)
    }).catch(() => { if (!cancelled) setNoticeError('通知加载失败，请重试。') }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [visible, tab, state.phase, state.generation, revision])
  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault(); if (busy) return
    const secret = password; setPassword(''); setBusy(true); setError('')
    try { const reply = await window.electronAPI!.accountLogin(username, secret, remember); if (!reply.ok) setError(reply.error) }
    catch { setError('登录请求未能完成，请重试。') } finally { setBusy(false) }
  }
  const logout = async (): Promise<void> => {
    setPassword(''); setError('')
    try { const reply = await window.electronAPI!.accountLogout(); if (!reply.ok) setError(reply.error) }
    catch { setError('退出清理未能完成，请重试。') }
  }
  const data = notices?.generation === state.generation ? notices.data : null
  const profile = state.profile
  return <div className={styles.root}><div className={styles.section}>
    <div className={styles.row}><Person24Regular /><h1 style={{ margin: 0, fontSize: '24px' }}>在线账户</h1></div>
    <Text className={styles.hint}>登录后使用在线收藏、历史、追更和通知。公开评论无需登录。</Text>
    {(error || state.message) && <div role="alert" className={styles.error}>{error || state.message}</div>}
    {authenticating && <div className={styles.row}><Spinner size="small" label={state.phase === 'restoring' ? '正在恢复会话…' : '正在登录并验证会话…'} /><Button onClick={() => void logout()}>取消</Button></div>}
    {!profile && !authenticating && <form className={`${styles.card} ${styles.stack}`} onSubmit={event => void submit(event)}>
      <Text weight="semibold" size={500}>登录</Text>
      <Field label="账号" required><Input autoComplete="username" value={username} maxLength={120} onChange={(_, data) => setUsername(data.value)} /></Field>
      <Field label="密码" required><Input type="password" autoComplete="off" value={password} maxLength={256} onChange={(_, data) => setPassword(data.value)} /></Field>
      <Checkbox label="记住会话" checked={remember} onChange={(_, data) => setRemember(data.checked === true)} />
      <Text className={styles.hint}>记住后可在本机恢复登录。只加密保存会话，不保存密码；迁移到另一台电脑时可能需要重新登录。</Text>
      <div><Button type="submit" appearance="primary" disabled={busy || !username.trim() || !password}>登录</Button></div>
    </form>}
    {profile && <>
      <div className={`${styles.card} ${styles.stack}`}>
        <div className={styles.row}><Text size={500} weight="semibold">{profile.nickname || profile.username}</Text><Text className={styles.hint}>@{profile.username}</Text></div>
        <Text className={styles.hint}>{state.phase === 'authenticated' ? '会话已验证' : '会话需要重新验证'} · {state.remembered ? '已记住会话' : '仅本次登录'}</Text>
        <div className={styles.row}><Button disabled={busy || authenticating} onClick={async () => {
          setBusy(true); setError('')
          try { const reply = await window.electronAPI!.accountVerify(state.generation); if (!reply.ok) setError(reply.error) }
          catch { setError('暂时无法验证会话。') } finally { setBusy(false) }
        }}>重新验证</Button><Button onClick={() => void logout()}>退出登录</Button></div>
      </div>
      <TabList selectedValue={tab} onTabSelect={(_, data) => setTab(String(data.value))}>
        <Tab value="overview">概览</Tab><Tab value="notifications">通知{data?.unread !== null && data?.unread !== undefined ? ` (${data.unread})` : ''}</Tab>
        <Tab value="comments">我的评论</Tab><Tab value="activity">活动</Tab>
      </TabList>
      {tab === 'comments' && <MyCommentsPanel key={state.generation} visible={visible} />}
      {tab === 'activity' && <AccountActivityPanel key={state.generation} visible={visible} />}
      {tab === 'overview' && <div className={styles.card}>
        <Text weight="semibold">账户信息</Text>
        <div className={styles.metric}>{[['等级', profile.level], ['金币', profile.coins], ['经验', profile.experience], ['收藏数量', profile.favorites], ['收藏上限', profile.favoriteLimit]].map(([label, value]) =>
          <div key={String(label)} className={styles.stack}><Text className={styles.hint}>{label}</Text><Text size={400}>{value ?? '暂不可用'}</Text></div>)}</div>
        <p className={styles.hint}>信息时间：{new Date(profile.checkedAt).toLocaleString()}</p>
        <Button onClick={() => useAppStore.getState().setCurrentPage('favorites')}>打开收藏、历史与追更</Button>
      </div>}
      {tab === 'notifications' && <div className={styles.card}>
        <div className={styles.row}><Text weight="semibold">通知</Text><Button appearance="subtle" icon={<ArrowClockwise20Regular />} disabled={loading} onClick={() => setRevision(value => value + 1)}>刷新通知</Button></div>
        {loading && <Spinner size="small" label="加载通知…" />}
        {noticeError && <p role="alert" className={styles.error}>{noticeError}</p>}
        {!loading && data && !data.items.length && <p className={styles.hint}>暂无通知</p>}
        {data?.items.map(notice => <article key={notice.id} className={styles.separator}>
          <div className={styles.row}><Text weight="semibold">{notice.title || '通知'}</Text><Text className={styles.hint}>{notice.date}</Text><Text size={200}>{notice.read ? '已读' : '未读'}</Text></div>
          <div className={styles.body}>{notice.text}</div>
          {!notice.read && <Button size="small" disabled={busy} onClick={async () => {
            setBusy(true); setNoticeError('')
            try {
              const reply = await window.electronAPI!.accountNoticeRead(notice.id, state.generation, crypto.randomUUID())
              if (useAccountStore.getState().state.generation !== state.generation) return
              if (reply.ok) setNotices({ generation: state.generation, data: reply.data }); else setNoticeError(reply.error)
            } catch { setNoticeError('尚未确认标记结果，请刷新查看。') } finally { setBusy(false) }
          }}>标为已读</Button>}
        </article>)}
      </div>}
    </>}
  </div></div>
}
