import {
  createDarkTheme,
  createLightTheme,
  type BrandVariants,
  type Theme
} from '@fluentui/react-components'

const windowsBlue: BrandVariants = {
  10: '#061724',
  20: '#082338',
  30: '#0a304c',
  40: '#0c3d61',
  60: '#0e5690',
  80: '#0f6cbd',
  100: '#2886de',
  120: '#62abf5',
  140: '#a4d3ff',
  160: '#e5f3ff'
}

export const winuiLightTheme: Theme = createLightTheme(windowsBlue)
export const winuiDarkTheme: Theme = createDarkTheme(windowsBlue)

winuiDarkTheme.colorBrandForeground1 = '#62abf5'
winuiDarkTheme.colorBrandForeground2 = '#a4d3ff'
