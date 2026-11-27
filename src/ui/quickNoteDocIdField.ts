import type { ButtonConfig } from '../toolbarManager'
/**
 * ④一键记事弹窗【简单】按钮：目标文档 ID 输入框 + 「跟随当前文档」开关（双端共用）。
 * - 填写 ID：按钮固定追加到该文档（覆盖全局保存方式与目标）；留空跟随全局一键记事设置。
 * - 开启「跟随当前文档」：每次点击按钮自动使用当前所在文档作为目标；弹窗未关闭前
 *   切换文档不会改变已打开弹窗的目标（关闭后再点才会绑定到新文档）。
 * 执行链路见 executeQuickNote（toolbarManager）：按钮值经临时配置注入 → resolveQuickNoteTargetConfig 解析。
 */
import { t } from '../i18n/runtime'

export function createQuickNoteTargetDocIdField(button: ButtonConfig): HTMLDivElement {
  const field = document.createElement('div')
  field.style.cssText = 'display: flex; flex-direction: column; gap: 6px;'

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

  // 跟随当前文档开关：开启后 input 仅作备用（当前无打开文档时回退）
  const followLabel = document.createElement('label')
  followLabel.style.cssText = 'display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; user-select: none;'
  const followToggle = document.createElement('input')
  followToggle.type = 'checkbox'
  followToggle.className = 'b3-switch'
  followToggle.checked = button.quickNoteFollowCurrentDoc === true
  const followText = document.createElement('span')
  followText.textContent = t('ui.buttonItems.quickNoteFollowCurrentDocLabel', undefined, '🔗 跟随当前文档（自动使用点击时打开的文档）')
  followLabel.appendChild(followToggle)
  followLabel.appendChild(followText)
  field.appendChild(followLabel)

  const syncInputState = () => {
    const following = followToggle.checked
    input.disabled = following
    input.style.opacity = following ? '0.5' : '1'
  }
  followToggle.onchange = () => {
    button.quickNoteFollowCurrentDoc = followToggle.checked
    syncInputState()
  }
  syncInputState()

  const hint = document.createElement('div')
  hint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light); line-height: 1.5;'
  hint.textContent = t(
    'ui.buttonItems.quickNoteTargetDocIdHelp',
    undefined,
    '开启「跟随当前文档」后无需填写 ID：点击按钮时自动把当前打开的文档作为目标。弹窗未关闭（含最小化）时切换文档，再次点击仍对应原来的文档；关闭弹窗后再点击，才会绑定到当前文档。填写固定 ID 时：此按钮固定追加到该文档，优先于全局设置的保存方式和目标。',
  )
  field.appendChild(hint)

  return field
}
