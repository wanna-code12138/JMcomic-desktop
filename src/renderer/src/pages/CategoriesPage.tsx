import React from 'react'
import {
  makeStyles, Text, Button, Dropdown,
  Option, Skeleton, SkeletonItem, Spinner,
  type OptionOnSelectData, type SelectionEvents
} from '@fluentui/react-components'
import {
  ArrowPrevious20Regular, ArrowNext20Regular,
  Dismiss20Regular, Search20Regular
} from '@fluentui/react-icons'
import { MangaCard, type MangaCardData } from '../components'
import {
  CATEGORIES, ORDERS, TIMES, POPULAR_TAGS,
  type CategoryOption
} from '../constants/categories'

const useStyles = makeStyles({
  root: { padding: '24px', height: '100%', overflow: 'auto' },
  title: { marginBottom: '16px', display: 'block', color: 'var(--ac-text-1)' },
  filterBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'flex-end',
    marginBottom: '16px'
  },
  filterItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: '120px'
  },
  filterLabel: {
    fontSize: '12px',
    color: 'var(--ac-text-2)',
    fontWeight: 600,
    paddingLeft: '4px'
  },
  tagSection: { marginBottom: '16px' },
  tagHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--ac-text-2)',
    marginBottom: '10px'
  },
  tagList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px'
  },
  tagChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    height: '30px',
    padding: '0 12px',
    borderRadius: 'var(--ac-radius-pill)',
    backgroundColor: 'color-mix(in srgb, var(--ac-brand) 10%, transparent)',
    border: '1px solid color-mix(in srgb, var(--ac-brand) 15%, transparent)',
    color: 'var(--ac-text-2)',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, transform 0.15s',
    ':hover': {
      backgroundColor: 'color-mix(in srgb, var(--ac-brand) 18%, transparent)',
      border: '1px solid color-mix(in srgb, var(--ac-brand) 25%, transparent)',
      color: 'var(--ac-brand)',
      transform: 'translateY(-1px)'
    }
  },
  tagChipActive: {
    backgroundColor: 'color-mix(in srgb, var(--ac-brand) 25%, transparent)',
    border: '1px solid color-mix(in srgb, var(--ac-brand) 40%, transparent)',
    color: 'var(--ac-brand)',
    fontWeight: 600,
    ':hover': {
      backgroundColor: 'color-mix(in srgb, var(--ac-brand) 32%, transparent)',
      border: '1px solid color-mix(in srgb, var(--ac-brand) 50%, transparent)',
      color: 'var(--ac-brand)'
    }
  },
  selectedTagWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '16px'
  },
  selectedTagChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    height: '32px',
    padding: '0 4px 0 12px',
    borderRadius: 'var(--ac-radius-pill)',
    backgroundColor: 'color-mix(in srgb, var(--ac-brand) 22%, transparent)',
    border: '1px solid color-mix(in srgb, var(--ac-brand) 35%, transparent)',
    color: 'var(--ac-brand)',
    fontSize: '13px',
    fontWeight: 600
  },
  selectedTagDismiss: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    borderRadius: 'var(--ac-radius-badge)',
    cursor: 'pointer',
    color: 'var(--ac-brand)',
    ':hover': {
      backgroundColor: 'color-mix(in srgb, var(--ac-danger) 20%, transparent)',
      color: 'var(--ac-danger)'
    }
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
    color: 'var(--ac-text-3)',
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
    color: 'var(--ac-text-2)',
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
    borderRadius: 'var(--ac-radius-card)'
  }
})

function CategorySkeleton(): JSX.Element {
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

export default function CategoriesPage(): JSX.Element {
  const styles = useStyles()

  const [category, setCategory] = React.useState('0')
  const [subCategory, setSubCategory] = React.useState('')
  const [order, setOrder] = React.useState('mr')
  const [time, setTime] = React.useState('a')
  const [selectedTag, setSelectedTag] = React.useState('')

  const [results, setResults] = React.useState<MangaCardData[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [totalPages, setTotalPages] = React.useState(1)
  const [hasSearched, setHasSearched] = React.useState(false)

  const currentCat: CategoryOption | undefined = CATEGORIES.find((c) => c.value === category)
  const showSubCategory = !!(currentCat?.subCategories && currentCat.subCategories.length > 0)

  const fetchCategory = React.useCallback(async (p: number): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      const result = await window.electronAPI?.contentCategory({
        category,
        subCategory: subCategory || undefined,
        tag: selectedTag || undefined,
        order,
        time,
        page: p
      })
      if (result?.ok) {
        const data = ((result.data as MangaCardData[]) || [])
          .filter((c) => !/随便看|隨便看|随便看看|隨便看看|換一換|换一换|随机|random/i.test(c.title))
        setResults(data)
        setTotalPages((result.totalPages as number) || 1)
        if (data.length === 0) {
          setError('当前筛选条件下没有漫画')
        }
      } else {
        setResults([])
        setTotalPages(1)
        setError(result?.error || '加载失败')
      }
    } catch (err) {
      setResults([])
      setTotalPages(1)
      setError(String(err))
    } finally {
      setLoading(false)
      setHasSearched(true)
    }
  }, [category, subCategory, selectedTag, order, time])

  const resetAndFetch = React.useCallback((p: number): void => {
    setPage(p)
    void fetchCategory(p)
  }, [fetchCategory])

  React.useEffect(() => {
    resetAndFetch(1)
  }, [resetAndFetch])

  const onCategoryChange = (_e: SelectionEvents, d: OptionOnSelectData): void => {
    if (!d.optionValue) return
    setCategory(d.optionValue)
    setSubCategory('')
  }

  const onSubCategoryChange = (_e: SelectionEvents, d: OptionOnSelectData): void => {
    if (!d.optionValue) return
    setSubCategory(d.optionValue)
  }

  const onOrderChange = (_e: SelectionEvents, d: OptionOnSelectData): void => {
    if (!d.optionValue) return
    setOrder(d.optionValue)
  }

  const onTimeChange = (_e: SelectionEvents, d: OptionOnSelectData): void => {
    if (!d.optionValue) return
    setTime(d.optionValue)
    // JM 的时间筛选（t≠a）仅支持 o=mv（最多观看），搭配 o=mr（最新）会返回空结果。
    // 选了非"全部"的时间后，自动把排序切到"最多观看"。
    if (d.optionValue !== 'a' && order === 'mr') {
      setOrder('mv')
    }
  }

  const onTagClick = (tag: string): void => {
    setSelectedTag((prev) => (prev === tag ? '' : tag))
  }

  const clearTag = (): void => {
    setSelectedTag('')
  }

  const gotoPage = (p: number): void => {
    if (p < 1 || p > totalPages || p === page || loading) return
    setPage(p)
    void fetchCategory(p)
  }

  return (
    <div className={styles.root}>
      <Text size={600} weight="semibold" className={styles.title}>分类浏览</Text>

      <div className={styles.filterBar}>
        <div className={styles.filterItem}>
          <span className={styles.filterLabel}>类型</span>
          <Dropdown
            value={CATEGORIES.find((c) => c.value === category)?.label ?? '全部'}
            onOptionSelect={onCategoryChange}
            size="small"
          >
            {CATEGORIES.map((c) => (
              <Option key={c.value} value={c.value}>{c.label}</Option>
            ))}
          </Dropdown>
        </div>

        {showSubCategory && (
          <div className={styles.filterItem}>
            <span className={styles.filterLabel}>子类型</span>
            <Dropdown
              value={subCategory
                ? currentCat?.subCategories?.find((s) => s.value === subCategory)?.label ?? '不限'
                : '不限'}
              onOptionSelect={onSubCategoryChange}
              size="small"
            >
              <Option value="">不限</Option>
              {currentCat?.subCategories?.map((s) => (
                <Option key={s.value} value={s.value}>{s.label}</Option>
              ))}
            </Dropdown>
          </div>
        )}

        <div className={styles.filterItem}>
          <span className={styles.filterLabel}>排序</span>
          <Dropdown
            value={ORDERS.find((o) => o.value === order)?.label ?? '最新'}
            onOptionSelect={onOrderChange}
            size="small"
          >
            {ORDERS.map((o) => (
              <Option key={o.value} value={o.value}>{o.label}</Option>
            ))}
          </Dropdown>
        </div>

        <div className={styles.filterItem}>
          <span className={styles.filterLabel}>时间</span>
          <Dropdown
            value={TIMES.find((t) => t.value === time)?.label ?? '全部'}
            onOptionSelect={onTimeChange}
            size="small"
          >
            {TIMES.map((t) => (
              <Option key={t.value} value={t.value}>{t.label}</Option>
            ))}
          </Dropdown>
        </div>
      </div>

      <div className={styles.tagSection}>
        <div className={styles.tagHeader}>
          <Search20Regular style={{ width: '14px', height: '14px' }} />
          热门标签{selectedTag ? '（已选标签会叠加在类型之上筛选）' : '（点击标签筛选）'}
        </div>
        <div className={styles.tagList}>
          {POPULAR_TAGS.map((tag) => (
            <div
              key={tag}
              className={selectedTag === tag
                ? `${styles.tagChip} ${styles.tagChipActive}`
                : styles.tagChip}
              role="button"
              tabIndex={0}
              onClick={() => onTagClick(tag)}
              onKeyDown={(e) => { if (e.key === 'Enter') onTagClick(tag) }}
            >
              {tag}
            </div>
          ))}
        </div>
      </div>

      {selectedTag && (
        <div className={styles.selectedTagWrap}>
          <div className={styles.selectedTagChip}>
            标签: {selectedTag}
            <span
              className={styles.selectedTagDismiss}
              role="button"
              tabIndex={0}
              aria-label="清除标签"
              onClick={clearTag}
              onKeyDown={(e) => { if (e.key === 'Enter') clearTag() }}
            >
              <Dismiss20Regular style={{ width: '12px', height: '12px' }} />
            </span>
          </div>
        </div>
      )}

      {loading && (
        <div className={styles.statusMsg}>
          <Spinner size="large" />
          <Text size={400}>正在加载...</Text>
        </div>
      )}

      {!loading && error && (
        <div className={styles.statusMsg}>
          <Text size={500} weight="semibold">⚠️ {error === '当前筛选条件下没有漫画' ? '暂无漫画' : '加载出错'}</Text>
          <Text size={300} style={{ maxWidth: '600px', textAlign: 'center' }}>{error}</Text>
        </div>
      )}

      {!loading && !error && results.length > 0 && (
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

      {!loading && !error && hasSearched && results.length === 0 && (
        <div className={styles.statusMsg}>
          <Text size={400}>当前筛选条件下没有漫画</Text>
          <Text size={200} style={{ opacity: 0.6 }}>试试切换类型或清除标签</Text>
        </div>
      )}
    </div>
  )
}
