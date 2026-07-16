import type { GriffelStyle } from '@fluentui/react-components'

// 毛玻璃面板：半透明底 + backdrop-blur + 玻璃边框 + 内顶高光 + 外柔投影 + 大圆角
export const glassPanel: GriffelStyle = {
  backgroundColor: 'var(--ac-glass-bg)',
  backdropFilter: 'blur(var(--ac-blur-panel))',
  WebkitBackdropFilter: 'blur(var(--ac-blur-panel))',
  border: '1px solid var(--ac-glass-border)',
  boxShadow: 'inset 0 1px 0 var(--ac-glass-inset-hi), var(--ac-glass-shadow)',
  borderRadius: 'var(--ac-radius-card)'
}

// 毛玻璃面板 hover（叠加在 glassPanel 上用）
export const glassPanelHover: GriffelStyle = {
  ':hover': {
    backgroundColor: 'var(--ac-glass-bg-hover)'
  }
}

// 卡片级毛玻璃（blur 较浅）
export const glassCard: GriffelStyle = {
  backgroundColor: 'var(--ac-glass-bg)',
  backdropFilter: 'blur(var(--ac-blur-card))',
  WebkitBackdropFilter: 'blur(var(--ac-blur-card))',
  border: '1px solid var(--ac-glass-border)',
  boxShadow: 'inset 0 1px 0 var(--ac-glass-inset-hi), var(--ac-glass-shadow)',
  borderRadius: 'var(--ac-radius-card)',
  ':hover': {
    backgroundColor: 'var(--ac-glass-bg-hover)'
  }
}

// 新拟物凸起（选中态导航项/Tab/按钮）
export const clayRaised: GriffelStyle = {
  backgroundColor: 'var(--ac-glass-bg-hover)',
  boxShadow:
    'var(--ac-clay-shadow-dark), var(--ac-clay-shadow-light), var(--ac-clay-inset-border)'
}

// 玻璃次按钮
export const glassButton: GriffelStyle = {
  backgroundColor: 'var(--ac-glass-bg)',
  backdropFilter: 'blur(var(--ac-blur-card))',
  WebkitBackdropFilter: 'blur(var(--ac-blur-card))',
  border: '1px solid var(--ac-glass-border)',
  boxShadow: 'inset 0 1px 0 var(--ac-glass-inset-hi), var(--ac-glass-shadow)',
  borderRadius: 'var(--ac-radius-button)',
  color: 'var(--ac-text-2)',
  ':hover': {
    backgroundColor: 'var(--ac-glass-bg-hover)',
    transform: 'translateY(-1px)'
  }
}

// 渐变主按钮
export const primaryButton: GriffelStyle = {
  background: 'linear-gradient(135deg, var(--ac-brand), var(--ac-brand-2))',
  color: '#ffffff',
  borderRadius: 'var(--ac-radius-button)',
  boxShadow: '0 4px 10px var(--ac-brand-glow)',
  border: 'none',
  ':hover': {
    transform: 'translateY(-1px)',
    boxShadow: '0 6px 16px var(--ac-brand-glow-hover)'
  }
}

// 彩色标签 chip（品牌紫）
export const clayChip: GriffelStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  height: '28px',
  padding: '0 12px',
  borderRadius: 'var(--ac-radius-pill)',
  backgroundColor: 'color-mix(in srgb, var(--ac-brand) 12%, transparent)',
  border: '1px solid color-mix(in srgb, var(--ac-brand) 18%, transparent)',
  color: 'var(--ac-brand)',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background-color 0.15s, transform 0.15s',
  ':hover': {
    backgroundColor: 'color-mix(in srgb, var(--ac-brand) 20%, transparent)',
    transform: 'translateY(-1px)'
  }
}

// 激活态标签 chip（品牌紫加浓）
export const clayChipActive: GriffelStyle = {
  backgroundColor: 'color-mix(in srgb, var(--ac-brand) 22%, transparent)',
  border: '1px solid color-mix(in srgb, var(--ac-brand) 35%, transparent)',
  color: 'var(--ac-brand)',
  ':hover': {
    backgroundColor: 'color-mix(in srgb, var(--ac-brand) 30%, transparent)'
  }
}

// 极光背景层（body 容器）
export const auroraBody: GriffelStyle = {
  flex: 1,
  overflow: 'hidden',
  minHeight: 0,
  position: 'relative',
  backgroundColor: 'var(--ac-base-bg)',
  backgroundImage:
    'radial-gradient(circle at 12% 18%, var(--ac-aurora-1), transparent 45%),' +
    'radial-gradient(circle at 88% 12%, var(--ac-aurora-2), transparent 40%),' +
    'radial-gradient(circle at 72% 88%, var(--ac-aurora-3), transparent 45%)',
  backgroundAttachment: 'fixed'
}

// 玻璃输入框（内凹陷呼应新拟物）
export const glassInput: GriffelStyle = {
  backgroundColor: 'var(--ac-glass-bg)',
  border: '1px solid var(--ac-glass-border)',
  borderRadius: 'var(--ac-radius-button)',
  boxShadow: 'var(--ac-input-inset)',
  color: 'var(--ac-text-1)'
}
