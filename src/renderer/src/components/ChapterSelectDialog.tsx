import React from 'react'
import {
  Button, Checkbox, Dialog, DialogActions, DialogBody, DialogContent,
  DialogSurface, DialogTitle, makeStyles, Spinner, Text
} from '@fluentui/react-components'

export interface ChapterOption {
  index: number
  title: string
}

const useStyles = makeStyles({
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    maxHeight: '360px',
    overflow: 'auto',
    padding: '4px 0'
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    borderRadius: '6px',
    ':hover': {
      backgroundColor: 'var(--ui-bg-hover)'
    }
  },
  quickRow: {
    display: 'flex',
    gap: '6px',
    marginBottom: '8px'
  },
  busy: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 0',
    color: 'var(--ui-text-secondary)'
  }
})

export default function ChapterSelectDialog(props: {
  open: boolean
  chapters: ChapterOption[]
  busy?: boolean
  busyText?: string
  onConfirm: (indices: number[]) => void
  onCancel: () => void
}): JSX.Element {
  const { open, chapters, busy, busyText, onConfirm, onCancel } = props
  const styles = useStyles()
  const [selected, setSelected] = React.useState<Set<number>>(new Set())

  // 每次打开时重置为全选
  React.useEffect(() => {
    if (open) {
      setSelected(new Set(chapters.map((c) => c.index)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const toggle = (index: number): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const all = chapters.length
  const count = selected.size

  return (
    <Dialog open={open} onOpenChange={(_e, d) => { if (!d.open && !busy) onCancel() }}>
      <DialogSurface
        style={{
          backgroundColor: 'var(--ui-bg-dialog)',
          border: '1px solid var(--ui-stroke-card)',
          borderRadius: 'var(--ui-radius-lg)'
        }}
      >
        <DialogBody>
          <DialogTitle>选择要下载的章节</DialogTitle>
          <DialogContent>
            {busy ? (
              <div className={styles.busy}>
                <Spinner size="small" />
                <Text size={300}>{busyText ?? '正在添加下载任务…'}</Text>
              </div>
            ) : (
              <>
                <div className={styles.quickRow}>
                  <Button size="small" appearance="secondary" onClick={() => setSelected(new Set(chapters.map((c) => c.index)))}>全选</Button>
                  <Button size="small" appearance="secondary" onClick={() => setSelected(new Set())}>全不选</Button>
                  <Button
                    size="small"
                    appearance="secondary"
                    onClick={() => setSelected((prev) => {
                      const next = new Set<number>()
                      for (const c of chapters) {
                        if (!prev.has(c.index)) next.add(c.index)
                      }
                      return next
                    })}
                  >
                    反选
                  </Button>
                  <Text size={200} style={{ marginLeft: 'auto', alignSelf: 'center', color: 'var(--ui-text-tertiary)' }}>
                    已选 {count} / {all}
                  </Text>
                </div>
                <div className={styles.list}>
                  {chapters.map((c) => (
                    <div key={c.index} className={styles.row}>
                      <Checkbox
                        checked={selected.has(c.index)}
                        onChange={() => toggle(c.index)}
                        label={`${c.index + 1}. ${c.title}`}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" disabled={busy} onClick={onCancel}>取消</Button>
            <Button
              appearance="primary"
              disabled={busy || count === 0}
              onClick={() => onConfirm([...selected].sort((a, b) => a - b))}
            >
              下载 ({count})
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
