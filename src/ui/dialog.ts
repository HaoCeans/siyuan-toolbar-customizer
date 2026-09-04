import { t } from '../i18n/runtime'
/**
 * 自定义对话框
 * 用于替代 window.confirm 等原生对话框，兼容鸿蒙系统
 */

import { logger } from '@/utils/logger'
export interface ConfirmDialogOptions {
  title?: string
  message: string
  hint?: string  // 底部提示文字（带颜色）
  confirmText?: string
  cancelText?: string
  /** 额外的动作按钮（如"导出配置"），点击执行成功（不抛异常）后自动启用确认按钮 */
  extraButton?: {
    text: string
    onClick: () => void | Promise<void>
  }
  /** 确认按钮初始禁用（配合 extraButton：先完成动作再放行确认，如"先导出再恢复"） */
  confirmInitiallyDisabled?: boolean
}

/**
 * 显示自定义确认对话框
 * @returns Promise<boolean> - 用户选择结果
 */
export function showConfirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  const { title = t('dialog.confirmTitle', undefined, '确认'), message, hint, confirmText = t('dialog.confirm', undefined, '确定'), cancelText = t('dialog.cancel', undefined, '取消'), extraButton, confirmInitiallyDisabled } = options

  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      padding: 20px;
    `

    const dialog = document.createElement('div')
    dialog.style.cssText = `
      background: var(--b3-theme-background);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      max-width: 320px;
      width: 100%;
      overflow: hidden;
    `

    const content = document.createElement('div')
    content.style.cssText = `
      padding: 20px;
    `

    const titleElement = document.createElement('div')
    titleElement.textContent = title
    titleElement.style.cssText = `
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 12px;
      color: var(--b3-theme-on-background);
    `

    const messageElement = document.createElement('div')
    messageElement.textContent = message
    messageElement.style.cssText = `
      font-size: 14px;
      color: var(--b3-theme-on-background);
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    `

    content.appendChild(titleElement)
    content.appendChild(messageElement)

    // 提示文字（带颜色）
    if (hint) {
      const hintElement = document.createElement('div')
      hintElement.textContent = hint
      hintElement.style.cssText = `
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px dashed var(--b3-border-color);
        font-size: 13px;
        color: #f59e0b;
        font-weight: 500;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
      `
      content.appendChild(hintElement)
    }

    const buttons = document.createElement('div')
    buttons.style.cssText = `
      display: flex;
      border-top: 1px solid var(--b3-border-color);
    `

    // 额外动作按钮（如"导出配置"）：执行成功后才放行确认按钮
    if (extraButton) {
      const extraBtn = document.createElement('button')
      extraBtn.className = 'b3-button'
      extraBtn.textContent = extraButton.text
      extraBtn.style.cssText = `
        flex: 1;
        border: none;
        border-radius: 0;
        padding: 12px;
        background: var(--b3-theme-background);
        color: #f59e0b;
        font-weight: 600;
      `
      extraBtn.onclick = async () => {
        extraBtn.disabled = true
        try {
          await extraButton.onClick()
          // 动作完成 → 放行确认
          confirmButton.disabled = false
          confirmButton.style.opacity = ''
        } catch (e) {
          logger.warn('[dialog extraButton] 执行失败:', e)
        } finally {
          extraBtn.disabled = false
        }
      }
      buttons.appendChild(extraBtn)
    }

    const cancelButton = document.createElement('button')
    cancelButton.className = 'b3-button'
    cancelButton.textContent = cancelText
    cancelButton.style.cssText = `
      flex: 1;
      border: none;
      border-radius: 0;
      padding: 12px;
      background: var(--b3-theme-background);
      color: var(--b3-theme-on-background);
      ${extraButton ? 'border-left: 1px solid var(--b3-border-color);' : ''}
    `

    const confirmButton = document.createElement('button')
    confirmButton.className = 'b3-button'
    confirmButton.textContent = confirmText
    confirmButton.style.cssText = `
      flex: 1;
      border: none;
      border-radius: 0;
      padding: 12px;
      border-left: 1px solid var(--b3-border-color);
      background: var(--b3-theme-primary);
      color: var(--b3-theme-on-primary);
    `
    // 初始禁用确认按钮（配合 extraButton 的"先导出再确认"流程）
    if (confirmInitiallyDisabled) {
      confirmButton.disabled = true
      confirmButton.style.opacity = '0.5'
    }

    cancelButton.onclick = () => {
      document.body.removeChild(overlay)
      resolve(false)
    }

    confirmButton.onclick = () => {
      document.body.removeChild(overlay)
      resolve(true)
    }

    buttons.appendChild(cancelButton)
    buttons.appendChild(confirmButton)

    dialog.appendChild(content)
    dialog.appendChild(buttons)
    overlay.appendChild(dialog)

    // 点击背景不关闭，强制用户必须选择按钮

    document.body.appendChild(overlay)
  })
}
