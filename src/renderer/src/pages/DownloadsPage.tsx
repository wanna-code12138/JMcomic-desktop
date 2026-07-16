import React from 'react'
import { makeStyles, tokens, Text, DataGrid, DataGridHeader, DataGridRow, DataGridCell, DataGridBody, TableColumnDefinition, createTableColumn } from '@fluentui/react-components'

interface DownloadItem {
  id: number
  title: string
  chapter: string
  progress: number
  status: 'downloading' | 'completed' | 'paused' | 'failed'
}

const useStyles = makeStyles({
  root: { padding: '24px', height: '100%', overflow: 'auto' },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 0',
    color: 'var(--ac-text-3)',
    gap: '12px'
  }
})

export default function DownloadsPage(): JSX.Element {
  const styles = useStyles()
  const [downloads] = React.useState<DownloadItem[]>([])

  if (downloads.length === 0) {
    return (
      <div className={styles.root}>
        <Text size={600} weight="semibold">下载管理</Text>
        <div className={styles.emptyState}>
          <Text size={400}>📥 暂无下载任务</Text>
          <Text size={200}>浏览漫画时点击下载即可添加到队列</Text>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <Text size={600} weight="semibold" style={{ marginBottom: '16px' }}>下载管理</Text>
      {/* Will implement DataGrid with real data */}
    </div>
  )
}
