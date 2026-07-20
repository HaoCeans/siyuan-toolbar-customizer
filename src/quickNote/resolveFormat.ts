import { getFrontend } from 'siyuan'
import { pluginInstance } from '../toolbarManager'
import { isPaidFeatureUnlocked } from '../utils/licenseManager'
import { DEFAULT_QUICK_NOTE_INPUT_FORMAT, type QuickNoteInputFormat } from './types'

function isDesktopClient(): boolean {
  const frontEnd = getFrontend()
  return frontEnd !== 'mobile' && frontEnd !== 'browser-mobile'
}

/** 打开弹窗时解析输入格式（未激活时 block 回落 plain） */
export function resolveQuickNoteInputFormat(isFromButton: boolean): QuickNoteInputFormat {
  let format: QuickNoteInputFormat = DEFAULT_QUICK_NOTE_INPUT_FORMAT

  // 电脑端：格式统一读「电脑端设置 → 一键记事」全局配置
  if (isDesktopClient()) {
    format = pluginInstance?.desktopFeatureConfig?.quickNoteInputFormat || DEFAULT_QUICK_NOTE_INPUT_FORMAT
    if (format === 'block' && !isPaidFeatureUnlocked()) {
      return 'plain'
    }
    return format || DEFAULT_QUICK_NOTE_INPUT_FORMAT
  }

  const tempConfig = (window as any).__pluginInstance?.mobileFeatureConfig

  if (isFromButton && tempConfig?.quickNoteInputFormat) {
    format = tempConfig.quickNoteInputFormat
  } else if (!isFromButton) {
    format = pluginInstance?.mobileFeatureConfig?.quickNoteInputFormat || DEFAULT_QUICK_NOTE_INPUT_FORMAT
  } else {
    format = tempConfig?.quickNoteInputFormat
      || pluginInstance?.mobileFeatureConfig?.quickNoteInputFormat
      || DEFAULT_QUICK_NOTE_INPUT_FORMAT
  }

  if (format === 'block' && !isPaidFeatureUnlocked()) {
    return 'plain'
  }
  return format || DEFAULT_QUICK_NOTE_INPUT_FORMAT
}
