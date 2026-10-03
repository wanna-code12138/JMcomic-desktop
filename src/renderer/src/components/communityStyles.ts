import { makeStyles } from '@fluentui/react-components'

export const useCommunityStyles = makeStyles({
  root: { padding: '24px', height: '100%', overflowY: 'auto', boxSizing: 'border-box' },
  section: { maxWidth: '760px', marginLeft: 'auto', marginRight: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' },
  card: { padding: '20px', border: '1px solid var(--ui-stroke-card)', backgroundColor: 'var(--ui-bg-card)', borderRadius: 'var(--ui-radius-lg)', minWidth: 0 },
  row: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' },
  stack: { display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 },
  hint: { color: 'var(--ui-text-secondary)', fontSize: '13px', lineHeight: '20px' },
  error: { color: 'var(--ui-danger)', fontSize: '13px', lineHeight: '20px', overflowWrap: 'anywhere' },
  body: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '14px', lineHeight: '24px', marginTop: '8px', marginBottom: '8px' },
  separator: { borderTop: '1px solid var(--ui-stroke-card)', paddingTop: '16px', marginTop: '16px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: '16px' },
  metric: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '14px', marginTop: '16px' }
})
