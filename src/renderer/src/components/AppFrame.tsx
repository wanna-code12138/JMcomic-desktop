import React from 'react'
import { makeStyles } from '@fluentui/react-components'
import { appSurface } from '../theme/surfaceStyles'

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
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minWidth: 0
  },
  pageArea: {
    flex: 1,
    overflow: 'hidden',
    minHeight: 0
  }
})

export interface AppFrameProps {
  titleBar: React.ReactNode
  navigation: React.ReactNode
  page: React.ReactNode
  statusBar: React.ReactNode
}

export default function AppFrame({
  titleBar,
  navigation,
  page,
  statusBar
}: AppFrameProps): JSX.Element {
  const styles = useStyles()

  return (
    <div className={styles.root}>
      {titleBar}
      <div className={styles.body}>
        {navigation}
        <div className={styles.content}>
          <div className={styles.pageArea}>
            {page}
          </div>
          {statusBar}
        </div>
      </div>
    </div>
  )
}
