import type { GriffelStyle } from '@fluentui/react-components'

export const appSurface: GriffelStyle = {
  backgroundColor: 'var(--ui-bg-app)',
  color: 'var(--ui-text-primary)'
}

export const flatCard: GriffelStyle = {
  backgroundColor: 'var(--ui-bg-card)',
  border: '1px solid var(--ui-stroke-card)',
  borderRadius: 'var(--ui-radius-lg)',
  transitionProperty: 'background-color, border-color',
  transitionDuration: 'var(--ui-motion-fast)',
  transitionTimingFunction: 'ease-out'
}

export const flatToolbar: GriffelStyle = {
  backgroundColor: 'var(--ui-bg-toolbar)',
  border: '1px solid var(--ui-stroke-card)',
  borderRadius: 'var(--ui-radius-md)'
}

export const pageTitle: GriffelStyle = {
  display: 'block',
  fontSize: 'var(--ui-font-title)',
  lineHeight: 'var(--ui-line-title)',
  fontWeight: 600,
  color: 'var(--ui-text-primary)'
}

export const sectionHeading: GriffelStyle = {
  fontSize: 'var(--ui-font-section)',
  lineHeight: 'var(--ui-line-section)',
  fontWeight: 600,
  color: 'var(--ui-text-primary)'
}

export const caption: GriffelStyle = {
  fontSize: 'var(--ui-font-caption)',
  lineHeight: 'var(--ui-line-caption)',
  color: 'var(--ui-text-secondary)'
}

export const emptyState: GriffelStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '60px 0',
  gap: '12px',
  color: 'var(--ui-text-secondary)',
  textAlign: 'center',
  '& > svg': { width: '32px', height: '32px', color: 'var(--ui-text-tertiary)' }
}

// Keep Fluent's existing indicator and transitions; share only the static tab skin.
export const contentTabRow: GriffelStyle = {
  marginBottom: '20px',
  '& .fui-TabList': { gap: '4px' },
  '& .fui-Tab': { borderRadius: 'var(--ui-radius-md)', color: 'var(--ui-text-secondary)', fontSize: '14px', padding: '6px 12px' },
  '& .fui-Tab:hover': { backgroundColor: 'var(--ui-bg-hover)' },
  '& .fui-Tab[aria-selected="true"]': { backgroundColor: 'var(--ui-bg-selected)', color: 'var(--ui-brand)', fontWeight: 600 }
}
