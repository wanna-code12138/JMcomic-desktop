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
