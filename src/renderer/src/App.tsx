import React, { useEffect, useState } from 'react'
import {
  makeStyles,
  tokens,
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
import { useAppStore } from './stores/appStore'
import {
  HomePage, CategoriesPage, SearchPage,
  FavoritesPage, DownloadsPage, SettingsPage,
  MangaDetailPage, ReaderPage
} from './pages'
import TitleBar from './components/TitleBar'

const NAV_WIDTH = 220
const STATUS_BAR_HEIGHT = 28
const WINDOW_RADIUS = '8px'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: WINDOW_RADIUS,
    // Clip content to the rounded corners (transparent window shows desktop in the notch)
    // — Win11-style rounded window when restored.
  },
  rootMaximized: {
    border: 'none',
    borderRadius: '0px'
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
    gap: '4px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderRight: `1px solid ${tokens.colorNeutralStroke1}`,
    userSelect: 'none',
    flexShrink: 0
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 12px',
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 400,
    color: tokens.colorNeutralForeground2,
    transition: 'background-color 0.1s ease',
    textDecoration: 'none',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground2Hover,
      color: tokens.colorNeutralForeground2Hover
    },
    ':active': {
      backgroundColor: tokens.colorNeutralBackground2Pressed
    }
  },
  navItemActive: {
    backgroundColor: tokens.colorNeutralBackground2Selected,
    color: tokens.colorBrandForeground1,
    fontWeight: 600,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground2Selected,
      color: tokens.colorBrandForeground1
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
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    height: `${STATUS_BAR_HEIGHT}px`,
    paddingLeft: '12px',
    paddingRight: '12px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
    fontSize: '12px',
    color: tokens.colorNeutralForeground3,
    gap: '10px',
    flexShrink: 0
  },
  statusSeparator: {
    width: '1px',
    height: '12px',
    backgroundColor: tokens.colorNeutralStroke2,
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
  const [maximized, setMaximized] = useState(false)

  // Track window maximize state to toggle the window chrome (border + rounded
  // corners) — DWM already squares maximized windows, so we drop our CSS chrome
  // to avoid a visible 1px gap / rounded notch at the screen edge.
  useEffect(() => {
    const off = window.electronAPI?.onMaximizeChange((max: boolean) => setMaximized(max))
    window.electronAPI?.windowIsMaximized().then((max) => setMaximized(Boolean(max)))
    return () => {
      off?.()
    }
  }, [])

  const ActivePage = pageComponents[currentPage as PageId] ?? HomePage

  const networkIcon = () => {
    switch (networkStatus) {
      case 'online': return <Wifi3Regular style={{ color: tokens.colorStatusSuccessForeground1 }} />
      case 'degraded': return <Wifi1Regular style={{ color: tokens.colorStatusWarningForeground1 }} />
      default: return <WifiOff20Regular style={{ color: tokens.colorStatusDangerForeground1 }} />
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
    <div className={mergeClasses(styles.root, maximized && styles.rootMaximized)}>
      <TitleBar darkMode={darkMode} maximized={maximized} onToggleDarkMode={onToggleDarkMode} />
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
            <ActivePage />
          </div>

          {/* Status Bar */}
          <div className={styles.statusBar}>
            <span className={styles.statusItem}>
              {networkIcon()}
              {networkLabel()}
            </span>
            <span className={styles.statusSeparator} />
            <span className={styles.statusVersion}>JMComic Desktop v1.0.0</span>
          </div>
        </div>
      </div>
    </div>
  )
}
