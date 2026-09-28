import React from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
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
  Settings20Filled
} from '@fluentui/react-icons'
import { useAppStore } from '../stores/appStore'

export const NAV_WIDTH = 208

const useStyles = makeStyles({
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
    backgroundColor: 'transparent',
    border: 'none',
    width: '100%',
    textAlign: 'left',
    boxSizing: 'border-box',
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
  }
})

type PrimaryNavPageId = 'home' | 'categories' | 'search' | 'favorites' | 'downloads' | 'settings'

interface NavItemDef {
  id: PrimaryNavPageId
  icon: React.ReactElement
  iconActive: React.ReactElement
  label: string
}

const navItems: NavItemDef[] = [
  { id: 'home', icon: <Home20Regular />, iconActive: <Home20Filled />, label: '首页' },
  { id: 'categories', icon: <Library20Regular />, iconActive: <Library20Filled />, label: '分类' },
  { id: 'search', icon: <Search20Regular />, iconActive: <Search20Filled />, label: '搜索' },
  { id: 'favorites', icon: <Heart20Regular />, iconActive: <Heart20Filled />, label: '收藏' },
  { id: 'downloads', icon: <ArrowDownload20Regular />, iconActive: <ArrowDownload20Filled />, label: '下载' },
  { id: 'settings', icon: <Settings20Regular />, iconActive: <Settings20Filled />, label: '设置' }
]

function AppNavigation(): JSX.Element {
  const styles = useStyles()
  const currentPage = useAppStore((state) => state.currentPage)
  const setCurrentPage = useAppStore((state) => state.setCurrentPage)

  return (
    <nav className={styles.nav}>
      {navItems.map((item) => {
        const active = currentPage === item.id
        return (
          <button
            key={item.id}
            type="button"
            className={mergeClasses(styles.navItem, active && styles.navItemActive)}
            onClick={() => setCurrentPage(item.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                setCurrentPage(item.id)
              }
            }}
          >
            <span className={styles.navIcon}>
              {active ? item.iconActive : item.icon}
            </span>
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}

export default React.memo(AppNavigation)
