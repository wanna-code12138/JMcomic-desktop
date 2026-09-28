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
  50: '#0d4979',
  60: '#0e5690',
  70: '#0e61a6',
  80: '#0f6cbd',
  90: '#1b79cd',
  100: '#2886de',
  110: '#4599e9',
  120: '#62abf5',
  130: '#83bffa',
  140: '#a4d3ff',
  150: '#c4e3ff',
  160: '#e5f3ff'
}

export const winuiLightTheme: Theme = createLightTheme(windowsBlue)
export const winuiDarkTheme: Theme = createDarkTheme(windowsBlue)

winuiDarkTheme.colorBrandForeground1 = '#62abf5'
winuiDarkTheme.colorBrandForeground2 = '#a4d3ff'
