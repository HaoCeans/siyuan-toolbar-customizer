/**
 * 自定义对话框
 * 用于替代 window.confirm 等原生对话框，兼容鸿蒙系统
 */

export interface ConfirmDialogOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
}

/**
 * 显示自定义确认对话框
 * @returns Promise<boolean> - 用户选择结果
 */
export function showConfirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  const { title = '确认', message, confirmText = '确定', cancelText = '取消' } = options

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
    `

    content.appendChild(titleElement)
    content.appendChild(messageElement)

    const buttons = document.createElement('div')
    buttons.style.cssText = `
      display: flex;
      border-top: 1px solid var(--b3-border-color);
    `

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

    // 点击背景关闭（等同于取消）
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay)
        resolve(false)
      }
    }

    document.body.appendChild(overlay)
  })
}
