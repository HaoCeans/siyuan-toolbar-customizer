import { t } from '../i18n/runtime'
/**
 * 点击序列选择器
 * 用于快速选择预设的点击序列
 */

export interface ClickSequenceOption {
  id: string
  name: string
  description: string
  sequence: string[]
  group?: string
}

export interface ClickSequenceSelectorOptions {
  platform: 'desktop' | 'mobile'
  onSelect: (sequence: string[]) => void
}

// 预设的点击序列
function getPresetSequences(): ClickSequenceOption[] {
  return [
  // 电脑端预设
  {
    id: 'plugin-settings-desktop',
    name: t('ui.clickSequenceSelector.item.1', undefined, '①打开插件设置'),
    description: t('ui.clickSequenceSelector.1', undefined, '电脑端：插件 → 思源手机端增强'),
    sequence: ['barPlugins', 'text:zh-CN=思源手机端增强|en=SiYuan Mobile Enhancer']
  },
  {
    id: 'open-browser-desktop',
    name: t('ui.clickSequenceSelector.item.2', undefined, '②打开伺服浏览器'),
    description: t('ui.clickSequenceSelector.2', undefined, '电脑端：工作区 → 配置 → 鉴权 → 打开浏览器'),
    sequence: ['barWorkspace', 'config', 'text:zh-CN=鉴权|en=Authentication', 'text:zh-CN=打开浏览器|en=Open browser']
  },
  // 手机端预设
  // 一、左侧文档树等功能点击
  {
    id: 'sidebar-file-mobile',
    name: t('ui.clickSequenceSelector.item.3', undefined, '①文档树指定文档'),
    description: t('ui.clickSequenceSelector.3', undefined, 'toolbarFile → 文档树 → 填写文档名'),
    sequence: ['toolbarFile', 'sidebar-file-tab', 'text:此汉字删掉填文档名'],
    group: t('ui.clickSequenceSelector.group.left', undefined, '一、左侧文档树等功能点击')
  },
  {
    id: 'sidebar-outline-mobile',
    name: t('ui.clickSequenceSelector.item.4', undefined, '②大纲'),
    description: t('ui.clickSequenceSelector.4', undefined, 'toolbarFile → 大纲'),
    sequence: ['toolbarFile', 'sidebar-outline-tab'],
    group: t('ui.clickSequenceSelector.group.left', undefined, '一、左侧文档树等功能点击')
  },
  {
    id: 'sidebar-bookmark-mobile',
    name: t('ui.clickSequenceSelector.item.5', undefined, '③书签'),
    description: t('ui.clickSequenceSelector.5', undefined, 'toolbarFile → 书签'),
    sequence: ['toolbarFile', 'sidebar-bookmark-tab'],
    group: t('ui.clickSequenceSelector.group.left', undefined, '一、左侧文档树等功能点击')
  },
  {
    id: 'sidebar-tag-mobile',
    name: t('ui.clickSequenceSelector.item.6', undefined, '④标签'),
    description: t('ui.clickSequenceSelector.6', undefined, 'toolbarFile → 标签'),
    sequence: ['toolbarFile', 'sidebar-tag-tab'],
    group: t('ui.clickSequenceSelector.group.left', undefined, '一、左侧文档树等功能点击')
  },
  {
    id: 'sidebar-backlink-mobile',
    name: t('ui.clickSequenceSelector.item.7', undefined, '⑤反向链接'),
    description: t('ui.clickSequenceSelector.7', undefined, 'toolbarFile → 反向链接'),
    sequence: ['toolbarFile', 'sidebar-backlink-tab'],
    group: t('ui.clickSequenceSelector.group.left', undefined, '一、左侧文档树等功能点击')
  },
  {
    id: 'sidebar-inbox-mobile',
    name: t('ui.clickSequenceSelector.item.8', undefined, '⑥收集箱'),
    description: t('ui.clickSequenceSelector.8', undefined, 'toolbarFile → 收集箱'),
    sequence: ['toolbarFile', 'sidebar-inbox-tab'],
    group: t('ui.clickSequenceSelector.group.left', undefined, '一、左侧文档树等功能点击')
  },
  {
    id: 'sidebar-plugin-mobile',
    name: t('ui.clickSequenceSelector.item.9', undefined, '⑦电脑侧边栏'),
    description: t('ui.clickSequenceSelector.9', undefined, 'toolbarFile → 电脑侧边栏'),
    sequence: ['toolbarFile', 'sidebar-plugin-tab'],
    group: t('ui.clickSequenceSelector.group.left', undefined, '一、左侧文档树等功能点击')
  },
  // 二、右侧设置等功能点击
  {
    id: 'sync-now-mobile',
    name: t('ui.clickSequenceSelector.item.10', undefined, '①立即同步'),
    description: t('ui.clickSequenceSelector.10', undefined, 'toolbarMore → 立即同步'),
    sequence: ['toolbarMore', 'text:zh-CN=立即同步|en=Sync now'],
    group: t('ui.clickSequenceSelector.group.right', undefined, '二、右侧设置等功能点击')
  },
  {
    id: 'plugin-settings-mobile',
    name: t('ui.clickSequenceSelector.item.11', undefined, '②插件设置'),
    description: t('ui.clickSequenceSelector.11', undefined, 'toolbarMore → 插件 → 思源手机端增强'),
    sequence: ['toolbarMore', 'text:zh-CN=插件|en=Plugin', 'text:zh-CN=思源手机端增强|en=SiYuan Mobile Enhancer'],
    group: t('ui.clickSequenceSelector.group.right', undefined, '二、右侧设置等功能点击')
  }
  ]
}

/**
 * 显示点击序列选择器弹窗
 */
export function showClickSequenceSelector(options: ClickSequenceSelectorOptions): void {
  const { platform, onSelect } = options

  // 根据平台过滤预设
  const platformSuffix = platform === 'desktop' ? 'desktop' : 'mobile'
  const filteredPresets = getPresetSequences().filter(p => p.id.endsWith(platformSuffix))

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
  header.innerHTML = `<span style="font-size: 16px; font-weight: 600;">${t('ui.clickSequenceSelector.title', undefined, '选择点击模板')}</span>`

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

  let lastGroup = ''

  filteredPresets.forEach(preset => {
    // 分组标题
    if (preset.group && preset.group !== lastGroup) {
      lastGroup = preset.group
      const groupHeader = document.createElement('div')
      groupHeader.style.cssText = `
        font-size: 13px;
        font-weight: 600;
        color: var(--b3-theme-on-surface-light);
        padding: 8px 0 4px 0;
        border-top: 1px solid var(--b3-border-color);
        margin-top: 4px;
      `
      groupHeader.textContent = preset.group
      sequenceList.appendChild(groupHeader)
    }

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
  hint.textContent = t('clickSequenceSelector.hint', undefined, '💡 点击上方选项将序列填入输入框')

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
