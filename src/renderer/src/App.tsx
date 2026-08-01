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
import { auroraBody, clayRaised } from './theme/clayStyles'
import { useAppStore } from './stores/appStore'
import {
  HomePage, CategoriesPage, SearchPage,
  FavoritesPage, DownloadsPage, SettingsPage,
  MangaDetailPage, ReaderPage
} from './pages'
import TitleBar from './components/TitleBar'

const NAV_WIDTH = 220
const STATUS_BAR_HEIGHT = 28

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: 'transparent'
  },
  body: {
    ...auroraBody,
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
    padding: '10px',
    gap: '5px',
    backgroundColor: 'var(--ac-glass-bg)',
    backdropFilter: 'blur(var(--ac-blur-panel))',
    WebkitBackdropFilter: 'blur(var(--ac-blur-panel))',
    borderRight: '1px solid var(--ac-glass-border)',
    userSelect: 'none',
    flexShrink: 0
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '9px 12px',
    borderRadius: 'var(--ac-radius-row)',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 400,
    color: 'var(--ac-text-3)',
    transition: 'background-color 0.15s ease, box-shadow 0.15s ease, color 0.15s ease, transform 0.15s ease',
    textDecoration: 'none',
    ':hover': {
      backgroundColor: 'var(--ac-glass-bg-hover)',
      color: 'var(--ac-text-2)'
    },
    ':active': {
      transform: 'scale(0.97)'
    }
  },
  navItemActive: {
    ...clayRaised,
    color: 'var(--ac-brand)',
    fontWeight: 600,
    ':hover': {
      color: 'var(--ac-brand)',
      backgroundColor: 'var(--ac-glass-bg-hover)'
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
    height: '100%',
    animation: 'ac-page-enter 0.22s ease-out'
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    height: `${STATUS_BAR_HEIGHT}px`,
    paddingLeft: '14px',
    paddingRight: '14px',
    backgroundColor: 'var(--ac-glass-bg)',
    backdropFilter: 'blur(var(--ac-blur-toolbar))',
    WebkitBackdropFilter: 'blur(var(--ac-blur-toolbar))',
    borderTop: '1px solid var(--ac-glass-border)',
    fontSize: '12px',
    color: 'var(--ac-text-3)',
    gap: '10px',
    flexShrink: 0
  },
  statusSeparator: {
    width: '1px',
    height: '12px',
    backgroundColor: 'var(--ac-glass-border)',
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
  const [appVersion, setAppVersion] = React.useState('1.0.2')

  React.useEffect(() => {
    window.electronAPI?.appVersion().then((v) => {
      if (v) setAppVersion(String(v))
    })
  }, [])

  const ActivePage = pageComponents[currentPage as PageId] ?? HomePage

  const networkIcon = () => {
    switch (networkStatus) {
      case 'online': return <Wifi3Regular style={{ color: 'var(--ac-green)' }} />
      case 'degraded': return <Wifi1Regular style={{ color: 'var(--ac-amber)' }} />
      default: return <WifiOff20Regular style={{ color: 'var(--ac-danger)' }} />
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
