import React from 'react'
import { makeStyles, Text, Button, Card } from '@fluentui/react-components'
import { ArrowLeft20Regular, ArrowSync20Regular, Copy20Regular, Delete20Regular } from '@fluentui/react-icons'
import { useAppStore } from '../stores/appStore'

const useStyles = makeStyles({
  root: {
    padding: '24px',
    height: '100%',
    overflow: 'auto',
    maxWidth: '880px'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '20px'
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  section: {
    marginBottom: '24px'
  },
  sectionTitle: {
    marginBottom: '12px',
    display: 'block',
    color: 'var(--ui-text-primary)'
  },
  card: {
    marginBottom: '12px',
    backgroundColor: 'var(--ui-bg-card)',
    border: '1px solid var(--ui-stroke-card)',
    borderRadius: 'var(--ui-radius-lg)',
    boxShadow: 'none',
    padding: '16px'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px'
  },
  metricBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  metricLabel: {
    fontSize: '12px',
    color: 'var(--ui-text-tertiary)'
  },
  metricValue: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--ui-text-primary)'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
    textAlign: 'left'
  },
  th: {
    padding: '8px 10px',
    borderBottom: '1px solid var(--ui-stroke-card)',
    color: 'var(--ui-text-secondary)',
    fontWeight: 600
  },
  td: {
    padding: '8px 10px',
    borderBottom: '1px solid var(--ui-stroke-card)',
    color: 'var(--ui-text-primary)'
  },
  actionRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    marginTop: '16px'
  },
  statusText: {
    fontSize: '12px',
    color: 'var(--ui-text-secondary)',
    marginTop: '8px'
  }
})

interface SnapshotState {
  capturedAt: number
  versions: Record<string, string>
  gpu: { featureStatus: Record<string, string>; active?: string }
  processes: Array<{ type: string; cpuPercent: number; memoryKb: number }>
  summary: Record<string, {
    count: number
    ok: number
    error: number
    cancelled: number
    timeout: number
    p50Ms: number
    p95Ms: number
    maxMs: number
  }>
  counts: { buffered: number }
}

export default function PerformanceDiagnosticsPage(): JSX.Element {
  const styles = useStyles()
  const setCurrentPage = useAppStore((state) => state.setCurrentPage)
  const [snapshot, setSnapshot] = React.useState<SnapshotState | null>(null)
  const [feedback, setFeedback] = React.useState('')

  const fetchSnapshot = React.useCallback(async () => {
    try {
      if (window.electronAPI?.performanceSnapshot) {
        const data = await window.electronAPI.performanceSnapshot()
        if (data) {
          setSnapshot(data as unknown as SnapshotState)
        }
      }
    } catch {
      // 忽略读取错误
    }
  }, [])

  React.useEffect(() => {
    fetchSnapshot()
    const timer = setInterval(() => {
      fetchSnapshot()
    }, 2000)

    return () => {
      clearInterval(timer)
    }
  }, [fetchSnapshot])

  const handleCopy = async () => {
    if (!snapshot) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2))
      setFeedback('已复制脱敏性能诊断 JSON 到剪贴板')
      setTimeout(() => setFeedback(''), 3000)
    } catch {
      setFeedback('复制失败')
    }
  }

  const handleClear = async () => {
    try {
      if (window.electronAPI?.performanceClear) {
        await window.electronAPI.performanceClear()
        await fetchSnapshot()
        setFeedback('诊断事件缓冲区已清空')
        setTimeout(() => setFeedback(''), 3000)
      }
    } catch {
      setFeedback('清空失败')
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <Button
            size="small"
            icon={<ArrowLeft20Regular />}
            appearance="subtle"
            onClick={() => setCurrentPage('settings')}
          >
            返回设置
          </Button>
          <Text size={600} weight="semibold">性能诊断与 V2 基线</Text>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button size="small" icon={<ArrowSync20Regular />} onClick={fetchSnapshot}>
            刷新
          </Button>
          <Button size="small" icon={<Copy20Regular />} onClick={handleCopy}>
            复制脱敏 JSON
          </Button>
          <Button size="small" icon={<Delete20Regular />} onClick={handleClear}>
            清空缓冲
          </Button>
        </div>
      </div>

      {feedback && <div className={styles.statusText}>{feedback}</div>}

      {/* 运行时与系统 */}
      <div className={styles.section}>
        <Text size={400} weight="semibold" className={styles.sectionTitle}>运行环境与版本</Text>
        <Card className={styles.card}>
          <div className={styles.grid}>
            <div className={styles.metricBox}>
              <span className={styles.metricLabel}>Electron</span>
              <span className={styles.metricValue}>{snapshot?.versions?.electron || '—'}</span>
            </div>
            <div className={styles.metricBox}>
              <span className={styles.metricLabel}>Chromium</span>
              <span className={styles.metricValue}>{snapshot?.versions?.chrome || '—'}</span>
            </div>
            <div className={styles.metricBox}>
              <span className={styles.metricLabel}>Node.js</span>
              <span className={styles.metricValue}>{snapshot?.versions?.node || '—'}</span>
            </div>
            <div className={styles.metricBox}>
              <span className={styles.metricLabel}>应用版本</span>
              <span className={styles.metricValue}>{snapshot?.versions?.app || '—'}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* GPU 与图形状态 */}
      <div className={styles.section}>
        <Text size={400} weight="semibold" className={styles.sectionTitle}>图形与硬件加速</Text>
        <Card className={styles.card}>
          <div className={styles.grid}>
            <div className={styles.metricBox}>
              <span className={styles.metricLabel}>活跃 GPU 设备</span>
              <span className={styles.metricValue}>{snapshot?.gpu?.active || '系统默认 GPU / 集显'}</span>
            </div>
            <div className={styles.metricBox}>
              <span className={styles.metricLabel}>2D Canvas 加速</span>
              <span className={styles.metricValue}>{snapshot?.gpu?.featureStatus?.['2d_canvas'] || '—'}</span>
            </div>
            <div className={styles.metricBox}>
              <span className={styles.metricLabel}>GPU 合成 (Compositing)</span>
              <span className={styles.metricValue}>{snapshot?.gpu?.featureStatus?.['gpu_compositing'] || '—'}</span>
            </div>
            <div className={styles.metricBox}>
              <span className={styles.metricLabel}>光栅化 (Rasterization)</span>
              <span className={styles.metricValue}>{snapshot?.gpu?.featureStatus?.['rasterization'] || '—'}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* 进程资源占用 */}
      <div className={styles.section}>
        <Text size={400} weight="semibold" className={styles.sectionTitle}>进程资源监控</Text>
        <Card className={styles.card}>
          <div className={styles.grid}>
            {(snapshot?.processes ?? []).map((proc, index) => (
              <div key={index} className={styles.metricBox}>
                <span className={styles.metricLabel}>{proc.type} 进程</span>
                <span className={styles.metricValue}>
                  CPU {proc.cpuPercent}% · 内存 {Math.round(proc.memoryKb / 1024)} MB
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* 性能事件聚合 */}
      <div className={styles.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <Text size={400} weight="semibold">近期完成事件（缓冲条数: {snapshot?.counts?.buffered ?? 0}）</Text>
        </div>
        <Card className={styles.card} style={{ overflowX: 'auto' }}>
          <Text size={200}>仅保留最近 1000 条事件；耗时包含成功、错误、超时与取消。帧间隔采集所有可见帧，不代表整个会话。</Text>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>指标名称</th>
                <th className={styles.th}>样本数</th>
                <th className={styles.th}>p50 (ms)</th>
                <th className={styles.th}>p95 (ms)</th>
                <th className={styles.th}>Max (ms)</th>
                <th className={styles.th}>成功</th>
                <th className={styles.th}>超时</th>
                <th className={styles.th}>错误</th>
                <th className={styles.th}>取消</th>
              </tr>
            </thead>
            <tbody>
              {snapshot?.summary && Object.keys(snapshot.summary).length > 0 ? (
                Object.entries(snapshot.summary).map(([name, item]) => (
                  <tr key={name}>
                    <td className={styles.td}><code>{name}</code></td>
                    <td className={styles.td}>{item.count}</td>
                    <td className={styles.td}>{item.p50Ms}</td>
                    <td className={styles.td}>{item.p95Ms}</td>
                    <td className={styles.td}>{item.maxMs}</td>
                    <td className={styles.td}>{item.ok}</td>
                    <td className={styles.td}>{item.timeout}</td>
                    <td className={styles.td}>{item.error}</td>
                    <td className={styles.td}>{item.cancelled}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className={styles.td} style={{ textAlign: 'center', color: 'var(--ui-text-tertiary)' }}>
                    暂无性能事件，可在浏览、阅读后查看
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
