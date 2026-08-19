import React from 'react'
import {
  makeStyles, Text, Button, SearchBox,
  Skeleton, SkeletonItem
} from '@fluentui/react-components'
import {
  ArrowPrevious20Regular, ArrowNext20Regular,
  Search20Regular, NumberSymbol20Regular,
  Dismiss20Regular, History20Regular, Delete20Regular
} from '@fluentui/react-icons'
import { MangaCard, type MangaCardData } from '../components'
import { useAppStore } from '../stores/appStore'

const useStyles = makeStyles({
  root: { padding: '24px', height: '100%', overflow: 'auto' },
  searchBar: { display: 'flex', gap: '8px', maxWidth: '660px', marginBottom: '8px' },
  hint: {
    fontSize: '12px',
    color: 'var(--ui-text-tertiary)',
    marginTop: '4px',
    marginBottom: '20px'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px'
  },
  statusMsg: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 0',
    color: 'var(--ui-text-tertiary)',
    gap: '12px'
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    marginTop: '24px',
    marginBottom: '12px'
  },
  pageText: {
    fontSize: '13px',
    color: 'var(--ui-text-secondary)',
    minWidth: '80px',
    textAlign: 'center'
  },
  shimmerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px'
  },
  shimmerCard: {
    aspectRatio: '3/4',
    borderRadius: 'var(--ui-radius-md)'
  },
  historySection: {
    maxWidth: '660px',
    marginTop: '8px'
  },
  historyHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px'
  },
  historyTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--ui-text-secondary)'
  },
  chipList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px'
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    height: '32px',
    padding: '0 4px 0 12px',
    borderRadius: 'var(--ui-radius-lg)',
    backgroundColor: 'var(--ui-bg-card)',
    border: '1px solid var(--ui-stroke-card)',
    color: 'var(--ui-brand)',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'background-color var(--ui-motion-fast) ease-out',
    ':hover': {
      backgroundColor: 'var(--ui-bg-hover)'
    },
    ':active': {
      transform: 'scale(0.97)'
    }
  },
  chipText: {
    maxWidth: '200px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  chipDelete: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    borderRadius: 'var(--ui-radius-sm)',
    cursor: 'pointer',
    color: 'var(--ui-text-tertiary)',
    ':hover': {
      backgroundColor: 'var(--ui-bg-hover)',
      color: 'var(--ui-danger)'
    }
  },
  historyEmpty: {
    fontSize: '13px',
    color: 'var(--ui-text-tertiary)',
    padding: '8px 0'
  }
})

function SearchSkeleton(): JSX.Element {
  const styles = useStyles()
  return (
    <div className={styles.shimmerGrid}>
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i}>
          <Skeleton><SkeletonItem className={styles.shimmerCard} /></Skeleton>
          <Skeleton style={{ marginTop: '8px' }}><SkeletonItem style={{ height: '14px', width: '80%' }} /></Skeleton>
          <Skeleton style={{ marginTop: '4px' }}><SkeletonItem style={{ height: '12px', width: '50%' }} /></Skeleton>
        </div>
      ))}
    </div>
  )
}

export default function SearchPage(): JSX.Element {
  const styles = useStyles()
  const setCurrentMangaId = useAppStore((s) => s.setCurrentMangaId)
  const pendingSearch = useAppStore((s) => s.pendingSearch)
  const clearPendingSearch = useAppStore((s) => s.clearPendingSearch)

  const [query, setQuery] = React.useState('')
  const [submittedQuery, setSubmittedQuery] = React.useState('')
  const [mainTag, setMainTag] = React.useState<0 | 1>(0)
  const [results, setResults] = React.useState<MangaCardData[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [totalPages, setTotalPages] = React.useState(1)
  const [jumpedCarPlate, setJumpedCarPlate] = React.useState(false)
  const [history, setHistory] = React.useState<string[]>([])

  const refreshHistory = React.useCallback(async (): Promise<void> => {
    try {
      const list = await window.electronAPI?.searchHistoryList()
      setHistory((list as string[]) || [])
    } catch { /* ignore */ }
  }, [])

  React.useEffect(() => {
    void refreshHistory()
  }, [refreshHistory])

  const saveToHistory = React.useCallback(async (q: string): Promise<void> => {
    try {
      await window.electronAPI?.searchHistoryAdd(q)
      await refreshHistory()
    } catch { /* ignore */ }
  }, [refreshHistory])

  const doSearch = React.useCallback(async (q: string, p: number, mt: 0 | 1): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      const result = await window.electronAPI?.contentSearch(q, p, mt)
      if (result?.ok) {
        setResults((result.data as MangaCardData[]) || [])
        setTotalPages((result.totalPages as number) || 1)
        if (((result.data as MangaCardData[]) || []).length === 0) {
          setError(`未找到 "${q}" 的相关漫画`)
        }
      } else {
        setResults([])
        setTotalPages(1)
        setError(result?.error || '搜索失败')
      }
    } catch (err) {
      setResults([])
      setTotalPages(1)
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSubmit = React.useCallback((value: string, mt: 0 | 1 = 0): void => {
    const q = value.trim()
    if (!q) return
    if (mt === 0) {
      void saveToHistory(q)
    }

    // 严格 6-7 位纯数字且非标签搜索 → 视为车牌号，直接跳转详情页
    if (mt === 0 && /^\d{6,7}$/.test(q)) {
      setJumpedCarPlate(true)
      setSubmittedQuery(q)
      setResults([])
      setCurrentMangaId(q)
      return
    }

    setJumpedCarPlate(false)
    setSubmittedQuery(q)
    setMainTag(mt)
    setPage(1)
    void doSearch(q, 1, mt)
  }, [doSearch, setCurrentMangaId, saveToHistory])

  const gotoPage = React.useCallback((p: number): void => {
    if (p < 1 || p > totalPages || p === page || loading) return
    setPage(p)
    void doSearch(submittedQuery, p, mainTag)
  }, [doSearch, submittedQuery, page, totalPages, loading, mainTag])

  // 处理来自其他页面的标签搜索跳转（详情页点标签 → 搜索页）
  React.useEffect(() => {
    if (pendingSearch) {
      setQuery(pendingSearch.query)
      handleSubmit(pendingSearch.query, pendingSearch.mainTag)
      clearPendingSearch()
    }
  }, [pendingSearch, handleSubmit, clearPendingSearch])

  const onChipClick = React.useCallback((q: string): void => {
    setQuery(q)
    handleSubmit(q)
  }, [handleSubmit])

  const onChipDelete = React.useCallback(async (q: string, e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    try {
      await window.electronAPI?.searchHistoryRemove(q)
      await refreshHistory()
    } catch { /* ignore */ }
  }, [refreshHistory])

  const onClearHistory = React.useCallback(async (): Promise<void> => {
    try {
      await window.electronAPI?.searchHistoryClear()
      await refreshHistory()
    } catch { /* ignore */ }
  }, [refreshHistory])

  const hasQuery = submittedQuery.length > 0
  const showEmpty = hasQuery && !loading && !error && results.length === 0 && !jumpedCarPlate

  return (
    <div className={styles.root}>
      <Text size={600} weight="semibold" style={{ marginBottom: '16px', display: 'block' }}>搜索漫画</Text>
      <div className={styles.searchBar}>
        <SearchBox
          placeholder="输入关键词或 6-7 位车号搜索..."
          value={query}
          onChange={(_e, d) => setQuery(d.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleSubmit(query)
            }
          }}
          size="large"
          style={{ flex: 1 }}
        />
        <Button appearance="primary" size="large" icon={<Search20Regular />} onClick={() => handleSubmit(query)}>
          搜索
        </Button>
      </div>
      <div className={styles.hint}>
        <NumberSymbol20Regular style={{ width: '12px', height: '12px', verticalAlign: 'middle', marginRight: '4px' }} />
        提示：直接输入 6-7 位数字车号可直达本子；关键词搜索支持按标题、作者、标签。
      </div>

      {!hasQuery && (
        <div className={styles.historySection}>
          <div className={styles.historyHeader}>
            <span className={styles.historyTitle}>
              <History20Regular style={{ width: '16px', height: '16px' }} />
              搜索历史
            </span>
            {history.length > 0 && (
              <Button
                appearance="subtle" size="small"
                icon={<Delete20Regular />}
                onClick={onClearHistory}
              >
                清空
              </Button>
            )}
          </div>
          {history.length === 0 ? (
            <div className={styles.historyEmpty}>暂无搜索记录</div>
          ) : (
            <div className={styles.chipList}>
              {history.map((q) => (
                <div
                  key={q}
                  className={styles.chip}
                  role="button"
                  tabIndex={0}
                  onClick={() => onChipClick(q)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onChipClick(q) }}
                >
                  <span className={styles.chipText}>{q}</span>
                  <span
                    className={styles.chipDelete}
                    role="button"
                    tabIndex={-1}
                    aria-label="删除"
                    onClick={(e) => { void onChipDelete(q, e) }}
                  >
                    <Dismiss20Regular style={{ width: '12px', height: '12px' }} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {hasQuery && loading && <SearchSkeleton />}

      {hasQuery && !loading && error && (
        <div className={styles.statusMsg}>
          <Text size={500} weight="semibold">⚠️ {jumpedCarPlate ? '正在跳转...' : '搜索出错'}</Text>
          <Text size={300} style={{ maxWidth: '600px', textAlign: 'center' }}>{error}</Text>
        </div>
      )}

      {showEmpty && (
        <div className={styles.statusMsg}>
          <Search20Regular style={{ width: '40px', height: '40px', opacity: 0.4 }} />
          <Text size={400}>未找到 "{submittedQuery}" 的相关漫画</Text>
        </div>
      )}

      {hasQuery && !loading && !error && results.length > 0 && (
        <>
          <div className={styles.grid}>
            {results.map((m, i) => (
              <MangaCard key={m.id} manga={m} index={i} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className={styles.pagination}>
              <Button
                appearance="subtle" size="small"
                icon={<ArrowPrevious20Regular />}
                disabled={page <= 1 || loading}
                onClick={() => gotoPage(page - 1)}
              >
                上一页
              </Button>
              <span className={styles.pageText}>
                第 {page} / {totalPages} 页
              </span>
              <Button
                appearance="subtle" size="small"
                icon={<ArrowNext20Regular />}
                disabled={page >= totalPages || loading}
                onClick={() => gotoPage(page + 1)}
              >
                下一页
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
