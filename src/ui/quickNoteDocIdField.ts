import type { ButtonConfig } from '../toolbarManager'
/**
 * ④一键记事弹窗【简单】按钮：目标文档 ID 输入框（双端共用）。
 * 填写后按钮固定追加到该文档（覆盖全局保存方式与目标）；留空跟随全局一键记事设置。
 * 执行链路见 executeQuickNote（toolbarManager）：按钮值经临时配置注入 → resolveQuickNoteTargetConfig 解析。
 */
import { t } from '../i18n/runtime'

export function createQuickNoteTargetDocIdField(button: ButtonConfig): HTMLDivElement {
  const field = document.createElement('div')
  field.style.cssText = 'display: flex; flex-direction: column; gap: 4px;'

  const label = document.createElement('label')
  label.textContent = t('ui.buttonItems.quickNoteTargetDocIdLabel', undefined, '🎯 目标文档 ID（可选）')
  label.style.cssText = 'font-size: 13px;'
  field.appendChild(label)

  const input = document.createElement('input')
  input.className = 'b3-text-field'
  input.type = 'text'
  input.placeholder = t('ui.buttonItems.quickNoteTargetDocIdPlaceholder', undefined, '留空则跟随全局一键记事设置')
  input.value = button.quickNoteTargetDocId || ''
  input.style.cssText = 'font-size: 13px;'
  input.onchange = () => {
    button.quickNoteTargetDocId = input.value.trim()
  }
  field.appendChild(input)

  const hint = document.createElement('div')
  hint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light); line-height: 1.5;'
  hint.textContent = t(
    'ui.buttonItems.quickNoteTargetDocIdHelp',
    undefined,
    '填写后：此按钮固定追加到该文档，优先于全局设置的保存方式和目标。留空：使用【一键记事弹窗】全局配置（日记笔记本或全局文档ID）。插入位置（顶部/底部）始终跟随全局设置。',
  )
  field.appendChild(hint)

  return field
}
