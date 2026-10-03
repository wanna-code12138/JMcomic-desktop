import React from 'react'
import { Button, Select, Spinner, Tab, TabList, Text } from '@fluentui/react-components'
import { useAccountRead } from './useAccountRead'
import { useAccountStore } from '../stores/accountStore'
import { useCommunityStyles } from './communityStyles'
import { toJmImg } from '../utils/image'

function Calendar({ visible }: { visible: boolean }): JSX.Element {
  const styles = useCommunityStyles(), state = useAccountStore(store => store.state)
  const load = React.useCallback((generation: number) => window.electronAPI!.accountDaily(generation), [])
  const query = useAccountRead(visible, load), [busy, setBusy] = React.useState(false), [message, setMessage] = React.useState('')
  const sending = React.useRef(false)
  const checkIn = async (): Promise<void> => {
    if (sending.current || state.phase !== 'authenticated') return
    sending.current = true; setBusy(true); setMessage('')
    try {
      const reply = await window.electronAPI!.accountCheckIn(state.generation, crypto.randomUUID())
      if (useAccountStore.getState().state.generation !== state.generation) return
      if (reply.ok) { setMessage(reply.data.status === 'signed' ? '签到成功。' : '今天已经签到，无需重复签到。'); if (reply.data.calendar) query.replace(reply.data.calendar) }
      else setMessage(reply.error)
    } catch { setMessage('签到结果尚未确认，请先刷新日历。') } finally { sending.current = false; setBusy(false) }
  }
  return <div className={styles.stack}>
    <Text className={styles.hint}>仅在点击时签到；日期和记录以服务端为准。</Text>
    <div className={styles.row}><Button appearance="primary" disabled={busy || query.loading || !query.data || state.phase !== 'authenticated'} onClick={() => void checkIn()}>{busy ? '正在签到…' : '手动签到'}</Button>
      <Button disabled={busy || query.loading} onClick={query.refresh}>刷新日历</Button></div>
    {query.loading && <Spinner size="small" label="加载签到日历…" />}
    {(message || query.error) && <Text role="status" className={styles.hint}>{message || query.error}</Text>}
    {query.data && <><Text weight="semibold">{query.data.title || '当前签到活动'} · {query.data.progress}</Text>
      <div aria-label="签到日历" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '6px' }}>
        {query.data.days.map((day, index) => <div key={`${day.date}:${index}`} style={{ border: '1px solid var(--ui-stroke-card)', borderRadius: '6px', padding: '8px 2px', textAlign: 'center' }}>
          <div>{day.date}</div><Text size={200}>{day.signed === null ? '未知' : day.signed ? '已签' : '未签'}{day.bonus ? ' · 奖' : ''}</Text>
        </div>)}
      </div></>}
  </div>
}
function History({ visible }: { visible: boolean }): JSX.Element {
  const styles = useCommunityStyles(), [year, setYear] = React.useState('')
  const loadYears = React.useCallback((generation: number) => window.electronAPI!.accountDailyYears(generation), [])
  const years = useAccountRead(visible, loadYears)
  React.useEffect(() => { if (!year && years.data?.length) setYear(years.data.at(-1)!) }, [year, years.data])
  const loadMonths = React.useCallback((generation: number) => window.electronAPI!.accountDailyHistory(year, generation), [year])
  const months = useAccountRead(visible && Boolean(year), loadMonths)
  return <div className={styles.stack}>
    <div className={styles.row}><Select aria-label="签到历史年份" value={year} onChange={(_, data) => setYear(data.value)}>{years.data?.map(value => <option key={value}>{value}</option>)}</Select>
      <Button disabled={years.loading || months.loading} onClick={() => { years.refresh(); months.refresh() }}>刷新活动历史</Button></div>
    {(years.loading || months.loading) && <Spinner size="small" label="加载活动历史…" />}
    {(years.error || months.error) && <Text role="alert" className={styles.error}>{years.error || months.error}</Text>}
    <Text className={styles.hint}>服务端提供的历史签到活动月份。</Text>
    {months.data?.length === 0 && <Text>暂无历史活动</Text>}
    <div className={styles.grid}>{months.data?.map(month => <div key={month.id} className={styles.card}><Text weight="semibold">{month.year} 年 {month.month} 月</Text>
      {month.image && <img src={toJmImg(month.image)} alt={`${month.year} 年 ${month.month} 月签到活动`} loading="lazy" style={{ width: '100%', maxHeight: '180px', objectFit: 'contain', marginTop: '10px' }} />}</div>)}</div>
  </div>
}
function Tasks({ visible }: { visible: boolean }): JSX.Element {
  const styles = useCommunityStyles(), load = React.useCallback((generation: number) => window.electronAPI!.accountTasks(generation), [])
  const query = useAccountRead(visible, load)
  return <div className={styles.stack}><div className={styles.row}><Text className={styles.hint}>查看任务说明和完成状态。</Text><Button disabled={query.loading} onClick={query.refresh}>刷新任务</Button></div>
    {query.loading && <Spinner size="small" label="加载任务…" />}{query.error && <Text role="alert" className={styles.error}>{query.error}</Text>}
    {query.data?.length === 0 && <Text>暂无任务</Text>}
    {query.data?.map(task => <article key={task.id} className={styles.separator}><div className={styles.row}><Text weight="semibold">{task.name}</Text><Text className={styles.hint}>{task.done === null ? '状态未知' : task.done ? '已完成' : '未完成'}</Text></div><div className={styles.body}>{task.text}</div></article>)}
  </div>
}
export default function AccountActivityPanel({ visible }: { visible: boolean }): JSX.Element {
  const styles = useCommunityStyles(), [tab, setTab] = React.useState('daily')
  return <section className={`${styles.card} ${styles.stack}`} aria-label="账户活动">
    <TabList selectedValue={tab} onTabSelect={(_, data) => setTab(String(data.value))}><Tab value="daily">签到日历</Tab><Tab value="history">活动历史</Tab><Tab value="tasks">任务</Tab></TabList>
    {tab === 'daily' && <Calendar visible={visible} />}{tab === 'history' && <History visible={visible} />}{tab === 'tasks' && <Tasks visible={visible} />}
  </section>
}
