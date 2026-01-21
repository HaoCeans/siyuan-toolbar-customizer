/**
 * 点击序列选择器
 * 用于快速选择预设的点击序列
 */

export interface ClickSequenceOption {
  id: string
  name: string
  description: string
  sequence: string[]
}

export interface ClickSequenceSelectorOptions {
  platform: 'desktop' | 'mobile'
  onSelect: (sequence: string[]) => void
}

// 预设的点击序列
const PRESET_SEQUENCES: ClickSequenceOption[] = [
  // 电脑端预设
  {
    id: 'plugin-settings-desktop',
    name: '①打开插件设置',
    description: '电脑端：插件 → 工具栏定制器',
    sequence: ['barPlugins', 'text:工具栏定制器']
  },
  {
    id: 'open-browser-desktop',
    name: '②打开伺服浏览器',
    description: '电脑端：工作区 → 配置 → 关于 → 打开浏览器',
    sequence: ['barWorkspace', 'config', 'text:关于', 'text:打开浏览器']
  },
  // 手机端预设
  {
    id: 'plugin-settings-mobile',
    name: '①打开插件设置',
    description: '手机端：更多 → 插件 → 工具栏定制器',
    sequence: ['toolbarMore', 'menuPlugin', 'text:工具栏定制器']
  },
  {
    id: 'open-browser-mobile',
    name: '②打开伺服浏览器',
    description: '手机端：更多 → 关于',
    sequence: ['toolbarMore', 'menuAbout']
  }
]

/**
 * 显示点击序列选择器弹窗
 */
export function showClickSequenceSelector(options: ClickSequenceSelectorOptions): void {
  const { platform, onSelect } = options

  // 根据平台过滤预设
  const platformSuffix = platform === 'desktop' ? 'desktop' : 'mobile'
  const filteredPresets = PRESET_SEQUENCES.filter(p => p.id.endsWith(platformSuffix))

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
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    max-width: 400px;
    width: 100%;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
  `

  // 标题栏
  const header = document.createElement('div')
  header.style.cssText = `
    padding: 16px 20px;
    border-bottom: 1px solid var(--b3-border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
  `
  header.innerHTML = `<span style="font-size: 16px; font-weight: 600;">选择点击序列</span>`

  const closeBtn = document.createElement('button')
  closeBtn.className = 'b3-button b3-button--text'
  closeBtn.textContent = '✕'
  closeBtn.style.cssText = `padding: 4px 8px; font-size: 18px;`
  closeBtn.onclick = () => document.body.removeChild(overlay)
  header.appendChild(closeBtn)

  // 内容区域
  const content = document.createElement('div')
  content.style.cssText = `
    padding: 16px 20px;
    overflow-y: auto;
    flex: 1;
  `

  // 序列列表
  const sequenceList = document.createElement('div')
  sequenceList.style.cssText = `display: flex; flex-direction: column; gap: 8px;`

  filteredPresets.forEach(preset => {
    const item = document.createElement('div')
    item.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 12px;
      border-radius: 6px;
      cursor: pointer;
      background: var(--b3-theme-surface);
      border: 1px solid var(--b3-border-color);
      transition: all 0.2s;
    `

    const headerRow = document.createElement('div')
    headerRow.style.cssText = `display: flex; align-items: center; gap: 8px;`

    const nameSpan = document.createElement('span')
    nameSpan.style.cssText = `
      font-size: 14px;
      font-weight: 500;
      color: var(--b3-theme-on-background);
    `
    nameSpan.textContent = preset.name

    const descSpan = document.createElement('span')
    descSpan.style.cssText = `
      font-size: 11px;
      color: var(--b3-theme-on-surface-light);
    `
    descSpan.textContent = preset.description

    headerRow.appendChild(nameSpan)
    headerRow.appendChild(descSpan)

    // 序列预览
    const preview = document.createElement('code')
    preview.style.cssText = `
      font-size: 11px;
      color: var(--b3-theme-primary);
      background: var(--b3-theme-primary-lightest);
      padding: 6px 8px;
      border-radius: 4px;
      font-family: monospace;
      white-space: pre-wrap;
    `
    preview.textContent = preset.sequence.join(' → ')

    item.appendChild(headerRow)
    item.appendChild(preview)

    item.onclick = () => {
      onSelect(preset.sequence)
      document.body.removeChild(overlay)
    }

    // 悬停效果
    item.onmouseenter = () => {
      item.style.background = 'var(--b3-theme-primary-lightest)'
      item.style.borderColor = 'var(--b3-theme-primary)'
    }

    item.onmouseleave = () => {
      item.style.background = 'var(--b3-theme-surface)'
      item.style.borderColor = 'var(--b3-border-color)'
    }

    sequenceList.appendChild(item)
  })

  // 提示信息
  const hint = document.createElement('div')
  hint.style.cssText = `
    margin-top: 12px;
    padding: 8px;
    background: var(--b3-theme-surface);
    border-radius: 4px;
    font-size: 11px;
    color: var(--b3-theme-on-surface-light);
  `
  hint.textContent = '💡 点击上方选项将序列填入输入框'

  content.appendChild(sequenceList)
  content.appendChild(hint)

  dialog.appendChild(header)
  dialog.appendChild(content)
  overlay.appendChild(dialog)

  // 点击遮罩关闭
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay)
    }
  }

  document.body.appendChild(overlay)
}
