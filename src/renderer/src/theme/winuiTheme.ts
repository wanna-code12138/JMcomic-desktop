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
Object.assign(winuiLightTheme, {
  colorNeutralBackground1: '#ffffff', colorNeutralBackground2: '#f7f8fa', colorNeutralBackground3: '#f3f4f6',
  colorNeutralBackground4: '#fafbfc', colorNeutralBackground1Hover: '#eef1f5', colorNeutralBackground1Pressed: '#e8f1fb',
  colorNeutralForeground1: '#20252d', colorNeutralForeground2: '#536070', colorNeutralForeground3: '#657180',
  colorNeutralStroke1: '#adb5c1', colorNeutralStroke2: '#e0e3e8',
  colorBrandBackground: '#0f6cbd', colorBrandBackgroundHover: '#115ea3', colorBrandBackgroundPressed: '#0c3d61',
  colorBrandBackgroundSelected: '#0e61a6', colorBrandBackground2: '#e8f1fb', colorNeutralForegroundOnBrand: '#ffffff',
  colorCompoundBrandBackground: '#0f6cbd', colorCompoundBrandBackgroundHover: '#115ea3', colorCompoundBrandBackgroundPressed: '#0c3d61',
  colorPaletteGreenForeground1: '#107c10', colorPaletteYellowForeground1: '#855700',
  colorPaletteRedForeground1: '#b42332', colorPaletteBerryForeground1: '#bf3d65',
  borderRadiusMedium: '6px', borderRadiusLarge: '10px'
})
Object.assign(winuiDarkTheme, {
  colorNeutralBackground1: '#202833', colorNeutralBackground2: '#1b212b', colorNeutralBackground3: '#181e26',
  colorNeutralBackground4: '#181e26',
  colorNeutralForeground1: '#e9edf4', colorNeutralForeground2: '#b8c2d1', colorNeutralForeground3: '#98a5b5',
  colorNeutralStroke1: '#52647c', colorNeutralStroke2: '#303c4c',
  colorNeutralBackground1Hover: '#2d394a', colorNeutralBackground1Pressed: '#193c5b',
  colorBrandBackground: '#62abf5', colorBrandBackgroundHover: '#83bffa', colorBrandBackgroundPressed: '#4599e9',
  colorBrandBackgroundSelected: '#4599e9', colorBrandBackground2: '#193c5b', colorNeutralForegroundOnBrand: '#102438',
  colorCompoundBrandBackground: '#62abf5', colorCompoundBrandBackgroundHover: '#83bffa', colorCompoundBrandBackgroundPressed: '#4599e9',
  colorPaletteGreenForeground1: '#6ccb5f', colorPaletteYellowForeground1: '#efc36b',
  colorPaletteRedForeground1: '#ff99a4', colorPaletteBerryForeground1: '#f19ab5',
  borderRadiusMedium: '6px', borderRadiusLarge: '10px'
})
