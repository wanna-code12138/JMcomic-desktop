import React from 'react'
import { makeStyles } from '@fluentui/react-components'
import { appSurface } from '../theme/surfaceStyles'
import { useAppStore } from '../stores/appStore'
import { animateElement, useExitPresence } from '../motion/motion'
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
  const readerElement = React.useRef<HTMLDivElement | null>(null)
  const readerPresent = useExitPresence(readerVisible && Boolean(reader))
  const storageError = useAppStore(state => state.workspaceStorageError)
  const ratio = useAppStore(state => state.browseRatio)
  const collapsed = useAppStore(state => state.readerSidebarCollapsed)
  const [available, setAvailable] = React.useState(1000)
  const [guide, setGuide] = React.useState<number | null>(null)
  const drag = React.useRef<{ left: number; width: number } | null>(null)
  const prior = React.useRef(new Map<Element, DOMRect>())
  const oldReader = readerElement.current ? prior.current.get(readerElement.current) : undefined
  const exiting = readerPresent && !readerVisible
  const browseWidth = Math.max(300, Math.min(available - 480, available * ratio))
  const commitRatio = (value: number): void => {
    const next = Math.max(0.25, Math.min(0.65, value))
    useAppStore.setState({ browseRatio: next })
    void window.electronAPI?.settingsSet({ browseRatio: next }).catch(() => useAppStore.setState({ workspaceStorageError: '分栏宽度暂未保存，请重试。' }))
  }
  React.useLayoutEffect(() => { if (body.current) body.current.inert = closing }, [closing])
  React.useLayoutEffect(() => {
    const element = body.current
    if (!element) return
    const update = (): void => setAvailable(element.clientWidth - (element.querySelector('.app-navigation-slot')?.getBoundingClientRect().width ?? 0) - 6)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    const nav = element.querySelector('.app-navigation-slot'); if (nav) observer.observe(nav)
    return () => observer.disconnect()
  }, [collapsed, readerExpanded])
  React.useLayoutEffect(() => {
    const next = new Map<Element, DOMRect>(), animations: Animation[] = []
    for (const element of body.current?.querySelectorAll<HTMLElement>(':scope > .reading-pane,:scope > .browse-pane,:scope > .app-navigation-slot') ?? []) {
      const rect = element.getBoundingClientRect(), old = prior.current.get(element)
      next.set(element, rect)
      if (!rect.width || element.getAttribute('data-exiting') === 'true') continue
      const delta = old?.width ? old.x - rect.x : element.classList.contains('reading-pane') ? 24 : -12
      if (!old || old.width !== rect.width || delta) {
        const animation = animateElement(element, [{ opacity: old?.width ? .85 : 0, transform: `translateX(${delta}px)` }, { opacity: 1, transform: 'translateX(0)' }], 200)
        if (animation) animations.push(animation)
      }
    }
    prior.current = next
    return () => animations.forEach(animation => animation.cancel())
  }, [Boolean(reader), readerExpanded, readerVisible, collapsed, browseWidth])

  return (
    <div className={styles.root}>
      {titleBar}
      <div ref={body} className={`${styles.body} app-workspace-body`} data-reader-open={Boolean(reader) && readerVisible}
        style={{ '--browse-width': `${browseWidth}px` } as React.CSSProperties}>
        <div className="app-navigation-slot" hidden={readerExpanded}>{navigation}</div>
        <div className={`${styles.content} browse-pane`} data-browse-pane hidden={readerExpanded} tabIndex={-1}>
          <div className={styles.pageArea}>
            {page}
          </div>
          {storageError && <div className="workspace-storage-error" role="alert">{storageError}<button aria-label="关闭标签记录提示" onClick={() => useAppStore.setState({ workspaceStorageError: '' })}>×</button></div>}
          {statusBar}
        </div>
        {reader && readerVisible && !readerExpanded && <div className="workspace-divider" role="separator" aria-label="调整浏览与阅读宽度" aria-orientation="vertical"
          aria-valuemin={25} aria-valuemax={65} aria-valuenow={Math.round(ratio * 100)} tabIndex={0}
          onDoubleClick={() => commitRatio(0.4)} onKeyDown={event => {
            if (event.key === 'Escape') { drag.current = null; setGuide(null); return }
            if (['ArrowLeft','ArrowRight','Home','Enter'].includes(event.key)) {
              event.preventDefault(); commitRatio(event.key === 'Home' || event.key === 'Enter' ? 0.4 : ratio + (event.key === 'ArrowRight' ? .02 : -.02))
            }
          }}
          onPointerDown={event => {
            if (event.button !== 0) return
            event.currentTarget.setPointerCapture(event.pointerId)
            drag.current = { left: body.current!.querySelector('[data-browse-pane]')!.getBoundingClientRect().left, width: available }
            setGuide(event.clientX - body.current!.getBoundingClientRect().left)
          }}
          onPointerMove={event => {
            if (!drag.current) return
            const width = Math.max(300, Math.min(drag.current.width - 480, event.clientX - drag.current.left))
            setGuide(drag.current.left + width - body.current!.getBoundingClientRect().left)
          }}
          onPointerUp={event => {
            if (!drag.current) return
            const width = Math.max(300, Math.min(drag.current.width - 480, event.clientX - drag.current.left))
            commitRatio(width / drag.current.width); drag.current = null; setGuide(null)
            event.currentTarget.releasePointerCapture(event.pointerId)
          }} onLostPointerCapture={() => { drag.current = null; setGuide(null) }} />}
        {guide !== null && <div className="workspace-divider-guide" style={{ left: guide }} />}
        {reader && <div ref={element => { readerElement.current = element; if (element) element.inert = !readerVisible }} className="reading-pane"
          data-expanded={readerExpanded} data-exiting={exiting} hidden={!readerPresent} aria-hidden={!readerVisible || undefined}
          style={exiting && oldReader ? { position: 'absolute', top: 0, bottom: 0, left: oldReader.x - (body.current?.getBoundingClientRect().x ?? 0), width: oldReader.width, zIndex: 70 } : undefined}>{reader}</div>}
      </div>
      {closing && <div className="app-close-pending" data-app-closing role="status">正在保存并关闭…</div>}
    </div>
  )
}
