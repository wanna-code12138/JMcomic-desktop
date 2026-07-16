import {
  createLightTheme,
  createDarkTheme,
  type BrandVariants,
  type Theme
} from '@fluentui/react-components'

// 紫粉蓝品牌色阶（Fluent BrandVariants 需要 10 档：10 最浅 → 160 最深）
const auroraBrand: BrandVariants = {
  10: '#faf8ff',
  20: '#f0ebff',
  30: '#e0d7ff',
  40: '#c9b8fd',
  60: '#a78bfa',
  80: '#7c5cf0',
  100: '#6b4ce0',
  120: '#5a3ed0',
  140: '#4a30b8',
  160: '#3a2490'
}

export const auroraLightTheme: Theme = createLightTheme(auroraBrand)
export const auroraDarkTheme: Theme = createDarkTheme(auroraBrand)
