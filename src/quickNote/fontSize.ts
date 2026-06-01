import { pluginInstance } from '../toolbarManager'

const DEFAULT_QUICK_NOTE_FONT_SIZE = 18
const MIN_QUICK_NOTE_FONT_SIZE = 12
const MAX_QUICK_NOTE_FONT_SIZE = 30

/** 一键记事弹窗输入框字体大小（px，12–30） */
export function getQuickNoteFontSize(): number {
  const raw = pluginInstance?.mobileFeatureConfig?.quickNoteFontSize
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_QUICK_NOTE_FONT_SIZE
  return Math.min(MAX_QUICK_NOTE_FONT_SIZE, Math.max(MIN_QUICK_NOTE_FONT_SIZE, Math.round(n)))
}
