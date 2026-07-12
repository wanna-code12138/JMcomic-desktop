import React from 'react'
import {
  makeStyles,
  tokens,
  Tooltip
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
  Settings20Filled
} from '@fluentui/react-icons'

const NAV_WIDTH = 220

const iconMap: Record<string, { regular: JSX.Element; filled: JSX.Element }> = {
  Home: { regular: <Home20Regular />, filled: <Home20Filled /> },
  Library: { regular: <Library20Regular />, filled: <Library20Filled /> },
  Search: { regular: <Search20Regular />, filled: <Search20Filled /> },
  Heart: { regular: <Heart20Regular />, filled: <Heart20Filled /> },
  ArrowDownload: { regular: <ArrowDownload20Regular />, filled: <ArrowDownload20Filled /> },
  Settings: { regular: <Settings20Regular />, filled: <Settings20Filled /> }
}

const useStyles = makeStyles({
  nav: {
    width: `${NAV_WIDTH}px`,
    minWidth: `${NAV_WIDTH}px`,
    display: 'flex',
    flexDirection: 'column',
    padding: '8px',
    gap: '2px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderRight: `1px solid ${tokens.colorNeutralStroke1}`,
    userSelect: 'none',
    flexShrink: 0
  },
  item: {
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
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground2
    }
  },
  itemActive: {
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground1,
    fontWeight: 600
  },
  icon: {
    display: 'flex',
    alignItems: 'center',
    width: '20px',
    height: '20px',
    flexShrink: 0
  }
})

interface NavItemDef {
  id: string
  icon: string
  text: string
}

interface NavigationViewProps {
  selected: string
  onSelect: (id: string) => void
  children: React.ReactElement<NavItemDef>[]
}

export default function NavigationView({ selected, onSelect, children }: NavigationViewProps): JSX.Element {
  const styles = useStyles()
  const items: NavItemDef[] = React.Children.map(children, (child) => child.props) ?? []

  return (
    <nav className={styles.nav}>
      {items.map((item) => {
        const isActive = item.id === selected
        const icons = iconMap[item.icon]
        return (
          <Tooltip key={item.id} content={item.text} relationship="label" positioning="after">
            <div
              className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
              onClick={() => onSelect(item.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onSelect(item.id) }}
            >
              <span className={styles.icon}>
                {isActive ? icons?.filled ?? icons?.regular : icons?.regular ?? null}
              </span>
              {item.text}
            </div>
          </Tooltip>
        )
      })}
    </nav>
  )
}

export function NavigationViewItem(_props: NavItemDef): null {
  // This is just a declaration component — real rendering is done in NavigationView
  return null
}
