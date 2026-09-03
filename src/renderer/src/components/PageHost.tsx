import React from 'react'
import HomePage from '../pages/HomePage'
import CategoriesPage from '../pages/CategoriesPage'
import SearchPage from '../pages/SearchPage'
import FavoritesPage from '../pages/FavoritesPage'
import PerformanceDiagnosticsPage from '../pages/PerformanceDiagnosticsPage'
import PageLoadBoundary from './PageLoadBoundary'

const MangaDetailPage = React.lazy(() => import('../pages/MangaDetailPage'))
const ReaderPage = React.lazy(() => import('../pages/ReaderPage'))
const DownloadsPage = React.lazy(() => import('../pages/DownloadsPage'))
const SettingsPage = React.lazy(() => import('../pages/SettingsPage'))

export type PageId =
  | 'home'
  | 'categories'
  | 'search'
  | 'favorites'
  | 'downloads'
  | 'settings'
  | 'detail'
  | 'reader'
  | 'diagnostics'

const pageComponents: Record<PageId, React.ComponentType> = {
  home: HomePage,
  categories: CategoriesPage,
  search: SearchPage,
  favorites: FavoritesPage,
  downloads: DownloadsPage,
  settings: SettingsPage,
  detail: MangaDetailPage,
  reader: ReaderPage,
  diagnostics: PerformanceDiagnosticsPage
}

const pageNames: Record<PageId, string> = {
  home: '首页',
  categories: '分类',
  search: '搜索',
  favorites: '收藏',
  downloads: '下载',
  settings: '设置',
  detail: '漫画详情',
  reader: '阅读器',
  diagnostics: '性能诊断'
}

export interface PageHostProps {
  currentPage: PageId
  mountedPages: readonly PageId[]
}

function PageHost({ currentPage, mountedPages }: PageHostProps): JSX.Element {
  return (
    <>
      {mountedPages.map((page) => {
        const Component = pageComponents[page] ?? HomePage
        const isCurrent = page === currentPage
        return (
          <div
            key={page}
            style={{
              height: '100%',
              minHeight: 0,
              overflow: 'hidden',
              display: isCurrent ? 'block' : 'none'
            }}
            aria-hidden={!isCurrent}
          >
            <PageLoadBoundary pageName={pageNames[page]}>
              <Component />
            </PageLoadBoundary>
          </div>
        )
      })}
    </>
  )
}

export default React.memo(PageHost)
