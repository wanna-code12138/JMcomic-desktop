import React from 'react'
import {
  makeStyles,
  mergeClasses
} from '@fluentui/react-components'
import {
  Home20Regular,
  Home20Filled,
  Library20Regular,
  Library20Filled,
  Search20Regular,
  Search20Filled,
  Heart20Regular,
  Heart20Filled,
  ArrowDownload20Regular,
  ArrowDownload20Filled,
  Settings20Regular,
  Settings20Filled,
  Wifi1Regular,
  Wifi2Regular,
  Wifi3Regular,
  WifiOff20Regular
} from '@fluentui/react-icons'
import { appSurface } from './theme/surfaceStyles'
import { useAppStore } from './stores/appStore'
import {
  HomePage, CategoriesPage, SearchPage,
  FavoritesPage, DownloadsPage, SettingsPage,
  MangaDetailPage, ReaderPage
} from './pages'
import TitleBar from './components/TitleBar'

const NAV_WIDTH = 208
const STATUS_BAR_HEIGHT = 28

const useStyles = makeStyles({
  root: {
    ...appSurface,
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: 'var(--ui-bg-app)'
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    minHeight: 0
  },
  nav: {
    width: `${NAV_WIDTH}px`,
    minWidth: `${NAV_WIDTH}px`,
    display: 'flex',
    flexDirection: 'column',
    padding: '8px',
    gap: '2px',
    backgroundColor: 'var(--ui-bg-pane)',
    borderRight: '1px solid var(--ui-stroke-card)',
    userSelect: 'none',
    flexShrink: 0
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    minHeight: '36px',
    padding: '0 10px',
    position: 'relative',
    borderRadius: 'var(--ui-radius-lg)',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 400,
    color: 'var(--ui-text-secondary)',
    transition: 'background-color var(--ui-motion-fast) ease-out, color var(--ui-motion-fast) ease-out',
    textDecoration: 'none',
    ':hover': {
      backgroundColor: 'var(--ui-bg-hover)',
      color: 'var(--ui-text-primary)'
    },
    ':focus-visible': {
      outline: '2px solid var(--ui-brand)',
      outlineOffset: '-2px'
    }
  },
  navItemActive: {
    backgroundColor: 'var(--ui-bg-selected)',
    color: 'var(--ui-text-primary)',
    fontWeight: 600,
    '::before': {
      content: '""',
      position: 'absolute',
      left: '0',
      top: '8px',
      bottom: '8px',
      width: '2px',
      borderRadius: '1px',
      backgroundColor: 'var(--ui-brand)'
    },
    ':hover': {
      color: 'var(--ui-text-primary)',
      backgroundColor: 'var(--ui-bg-selected)'
    }
  },
  navIcon: {
    display: 'flex',
    alignItems: 'center',
    width: '20px',
    height: '20px',
    flexShrink: 0
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minWidth: 0
  },
  pageArea: {
    flex: 1,
    overflow: 'auto',
    minHeight: 0
  },
  pageEnter: {
    height: '100%'
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    height: `${STATUS_BAR_HEIGHT}px`,
    paddingLeft: '14px',
    paddingRight: '14px',
    backgroundColor: 'var(--ui-bg-toolbar)',
    borderTop: '1px solid var(--ui-stroke-card)',
    fontSize: '12px',
    color: 'var(--ui-text-tertiary)',
    gap: '10px',
    flexShrink: 0
  },
  statusSeparator: {
    width: '1px',
    height: '12px',
    backgroundColor: 'var(--ui-stroke-card)',
    flexShrink: 0
  },
  statusItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  statusVersion: {
    marginLeft: 'auto'
  }
})

type PageId = 'home' | 'categories' | 'search' | 'favorites' | 'downloads' | 'settings'

interface NavItem {
  id: PageId
  icon: React.ReactElement
  iconActive: React.ReactElement
  label: string
}

const navItems: NavItem[] = [
  { id: 'home', icon: <Home20Regular />, iconActive: <Home20Filled />, label: '首页' },
  { id: 'categories', icon: <Library20Regular />, iconActive: <Library20Filled />, label: '分类' },
  { id: 'search', icon: <Search20Regular />, iconActive: <Search20Filled />, label: '搜索' },
  { id: 'favorites', icon: <Heart20Regular />, iconActive: <Heart20Filled />, label: '收藏' },
  { id: 'downloads', icon: <ArrowDownload20Regular />, iconActive: <ArrowDownload20Filled />, label: '下载' },
  { id: 'settings', icon: <Settings20Regular />, iconActive: <Settings20Filled />, label: '设置' }
]

const pageComponents: Record<string, React.ComponentType> = {
  home: HomePage,
  categories: CategoriesPage,
  search: SearchPage,
  favorites: FavoritesPage,
  downloads: DownloadsPage,
  settings: SettingsPage,
  detail: MangaDetailPage,
  reader: ReaderPage
}

interface AppProps {
  darkMode: boolean
  onToggleDarkMode: () => void
}

export default function App({ darkMode, onToggleDarkMode }: AppProps): JSX.Element {
  const styles = useStyles()
  const { currentPage, setCurrentPage, networkStatus } = useAppStore()
  const [appVersion, setAppVersion] = React.useState('1.0.3')

  React.useEffect(() => {
    window.electronAPI?.appVersion().then((v) => {
      if (v) setAppVersion(String(v))
    })
  }, [])

  const ActivePage = pageComponents[currentPage as PageId] ?? HomePage

  const networkIcon = () => {
    switch (networkStatus) {
      case 'online': return <Wifi3Regular style={{ color: 'var(--ui-success)' }} />
      case 'degraded': return <Wifi1Regular style={{ color: 'var(--ui-warning)' }} />
      default: return <WifiOff20Regular style={{ color: 'var(--ui-danger)' }} />
    }
  }

  const networkLabel = () => {
    switch (networkStatus) {
      case 'online': return '网络正常'
      case 'degraded': return '代理连接'
      default: return '无法访问'
    }
  }

  return (
    <div className={styles.root}>
      <TitleBar darkMode={darkMode} onToggleDarkMode={onToggleDarkMode} />
      <div className={styles.body}>
        {/* Navigation View */}
        <nav className={styles.nav}>
          {navItems.map((item) => {
            const active = currentPage === item.id
            return (
              <div
                key={item.id}
                className={mergeClasses(styles.navItem, active && styles.navItemActive)}
                onClick={() => setCurrentPage(item.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') setCurrentPage(item.id) }}
              >
                <span className={styles.navIcon}>
                  {active ? item.iconActive : item.icon}
                </span>
                {item.label}
              </div>
            )
          })}
        </nav>

        {/* Content */}
        <div className={styles.content}>
          <div className={styles.pageArea}>
            <div key={currentPage} className={styles.pageEnter}>
              <ActivePage />
            </div>
          </div>

          {/* Status Bar */}
          <div className={styles.statusBar}>
            <span className={styles.statusItem}>
              {networkIcon()}
              {networkLabel()}
            </span>
            <span className={styles.statusSeparator} />
            <span className={styles.statusVersion}>JMComic Desktop v{appVersion}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
