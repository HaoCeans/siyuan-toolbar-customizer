import { pluginInstance } from '../toolbarManager'

const DEFAULT_QUICK_NOTE_FONT_SIZE = 14
const MIN_QUICK_NOTE_FONT_SIZE = 12
const MAX_QUICK_NOTE_FONT_SIZE = 30

/** 一键记事弹窗输入框字体大小（px，12–30）。桌面优先读 desktopFeatureConfig，否则优先读 mobileFeatureConfig */
export function getQuickNoteFontSize(isMobile?: boolean): number {
  // 手机端：优先读手机端独立配置；桌面端 / 未知：优先读桌面端独立配置
  const raw = isMobile
    ? (pluginInstance?.mobileFeatureConfig?.quickNoteFontSize ?? pluginInstance?.desktopFeatureConfig?.quickNoteFontSize)
    : (pluginInstance?.desktopFeatureConfig?.quickNoteFontSize ?? pluginInstance?.mobileFeatureConfig?.quickNoteFontSize)
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_QUICK_NOTE_FONT_SIZE
  return Math.min(MAX_QUICK_NOTE_FONT_SIZE, Math.max(MIN_QUICK_NOTE_FONT_SIZE, Math.round(n)))
}
