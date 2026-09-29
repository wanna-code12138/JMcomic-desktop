import React from 'react'
import { makeStyles } from '@fluentui/react-components'
import { appSurface } from '../theme/surfaceStyles'
import './workspace.css'

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
  reader?: React.ReactNode
  readerExpanded?: boolean
  readerVisible?: boolean
  closing?: boolean
}

export default function AppFrame({
  titleBar,
  navigation,
  page,
  statusBar,
  reader,
  readerExpanded = false,
  readerVisible = true,
  closing = false
}: AppFrameProps): JSX.Element {
  const styles = useStyles()
  const body = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => { if (body.current) body.current.inert = closing }, [closing])

  return (
    <div className={styles.root}>
      {titleBar}
      <div ref={body} className={`${styles.body} app-workspace-body`} data-reader-open={Boolean(reader) && readerVisible}>
        <div className="app-navigation-slot" hidden={readerExpanded}>{navigation}</div>
        <div className={`${styles.content} browse-pane`} data-browse-pane hidden={readerExpanded} tabIndex={-1}>
          <div className={styles.pageArea}>
            {page}
          </div>
          {statusBar}
        </div>
        {reader && <div className="reading-pane" data-expanded={readerExpanded} hidden={!readerVisible}>{reader}</div>}
      </div>
      {closing && <div className="app-close-pending" data-app-closing role="status">正在保存并关闭…</div>}
    </div>
  )
}
