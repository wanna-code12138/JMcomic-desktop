import React from 'react'
import {
  makeStyles, tokens, Text, Button, SearchBox,
  Skeleton, SkeletonItem
} from '@fluentui/react-components'
import {
  ArrowPrevious20Regular, ArrowNext20Regular,
  Search20Regular, NumberSymbol20Regular
} from '@fluentui/react-icons'
import { MangaCard, type MangaCardData } from '../components'
import { useAppStore } from '../stores/appStore'

const useStyles = makeStyles({
  root: { padding: '24px', height: '100%', overflow: 'auto' },
  searchBar: { maxWidth: '600px', marginBottom: '8px' },
  hint: {
    fontSize: '12px', color: tokens.colorNeutralForeground3,
    marginTop: '4px', marginBottom: '20px'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px'
  },
  statusMsg: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '60px 0',
    color: tokens.colorNeutralForeground3, gap: '12px'
  },
  pagination: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: '12px', marginTop: '24px', marginBottom: '12px'
  },
  pageText: {
    fontSize: '13px', color: tokens.colorNeutralForeground2,
    minWidth: '80px', textAlign: 'center'
  },
  shimmerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px'
  },
  shimmerCard: {
    aspectRatio: '3/4',
    borderRadius: tokens.borderRadiusMedium
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

  const [query, setQuery] = React.useState('')
  const [submittedQuery, setSubmittedQuery] = React.useState('')
  const [results, setResults] = React.useState<MangaCardData[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [totalPages, setTotalPages] = React.useState(1)
  const [jumpedCarPlate, setJumpedCarPlate] = React.useState(false)

  const doSearch = React.useCallback(async (q: string, p: number): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      const result = await window.electronAPI?.contentSearch(q, p)
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

  const handleSubmit = React.useCallback((value: string): void => {
    const q = value.trim()
    if (!q) return

    // 严格 6-7 位纯数字 → 视为车牌号，直接跳转详情页
    if (/^\d{6,7}$/.test(q)) {
      setJumpedCarPlate(true)
      setSubmittedQuery(q)
      setResults([])
      setCurrentMangaId(q)
      return
    }

    setJumpedCarPlate(false)
    setSubmittedQuery(q)
    setPage(1)
    void doSearch(q, 1)
  }, [doSearch, setCurrentMangaId])

  const gotoPage = React.useCallback((p: number): void => {
    if (p < 1 || p > totalPages || p === page || loading) return
    setPage(p)
    void doSearch(submittedQuery, p)
  }, [doSearch, submittedQuery, page, totalPages, loading])

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
          onSearch={(_e, d) => handleSubmit(d.value)}
          size="large"
          style={{ width: '100%' }}
        />
      </div>
      <div className={styles.hint}>
        <NumberSymbol20Regular style={{ width: '12px', height: '12px', verticalAlign: 'middle', marginRight: '4px' }} />
        提示：直接输入 6-7 位数字车号可直达本子；关键词搜索支持按标题、作者、标签。
      </div>

      {!hasQuery && (
        <div className={styles.statusMsg}>
          <Search20Regular style={{ width: '40px', height: '40px' }} />
          <Text size={400}>输入关键词开始搜索</Text>
          <Text size={200}>支持按标题、作者、标签搜索</Text>
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
            {results.map((m) => (
              <MangaCard key={m.id} manga={m} />
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
