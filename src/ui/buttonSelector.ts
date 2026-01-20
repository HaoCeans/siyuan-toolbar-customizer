/**
 * 按钮选择器
 * 用于选择思源内置按钮ID
 */

import { updateIconDisplay } from '../data/icons'

export interface ButtonInfo {
  id: string
  name: string
  icon: string
}

export interface ButtonSelectorOptions {
  currentValue?: string
  onSelect: (result: ButtonInfo) => void
}

// 思源内置按钮列表
const BUILTIN_BUTTONS: ButtonInfo[] = [
  { id: 'toolbarMore', name: '右上角：设置', icon: 'iconSettings' },
  { id: 'toolbarFile', name: '左上角：文档树', icon: 'iconFolder' },
  { id: 'menuAccount', name: '个人信息', icon: 'iconAccount' },
  { id: 'menuRecent', name: '最近的文档', icon: 'iconList' },
  { id: 'menuSearch', name: '搜索', icon: 'iconSearch' },
  { id: 'menuCommand', name: '命令面板', icon: 'iconTerminal' },
  { id: 'menuSyncNow', name: '立即同步', icon: 'iconCloudSucc' },
  { id: 'menuNewDoc', name: '新建文档', icon: 'iconFile' },
  { id: 'menuNewNotebook', name: '新建笔记本', icon: 'iconFilesRoot' },
  { id: 'menuNewDaily', name: '日记', icon: 'iconCalendar' },
  { id: 'menuCard', name: '间隔重复', icon: 'iconRiffCard' },
  { id: 'menuLock', name: '锁屏', icon: 'iconLock' },
  { id: 'menuHistory', name: '数据历史', icon: 'iconHistory' },
  { id: 'menuEditor', name: '编辑器', icon: 'iconEdit' },
  { id: 'menuFileTree', name: '文档树', icon: 'iconFolder' },
  { id: 'menuRiffCard', name: '闪卡', icon: 'iconSparkles' },
  { id: 'menuAI', name: 'AI', icon: 'iconSparkles' },
  { id: 'menuAssets', name: '资源', icon: 'iconImage' },
  { id: 'menuAppearance', name: '外观', icon: 'iconTheme' },
  { id: 'menuSync', name: '云端', icon: 'iconCloud' },
  { id: 'menuPublish', name: '发布', icon: 'iconUpload' },
  { id: 'menuAbout', name: '关于', icon: 'iconInfo' },
  { id: 'menuPlugin', name: '插件', icon: 'iconPlugin' }
]

/**
 * 显示按钮选择器弹窗
 */
export function showButtonSelector(options: ButtonSelectorOptions): void {
  const { currentValue = '', onSelect } = options

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
    max-width: 400px;
    width: 100%;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
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
  header.innerHTML = `<div style="font-size: 16px; font-weight: 500;">选择按钮</div>`

  const closeBtn = document.createElement('button')
  closeBtn.className = 'b3-button b3-button--text'
  closeBtn.textContent = '✕'
  closeBtn.style.cssText = `padding: 4px 8px; font-size: 18px;`
  closeBtn.onclick = () => document.body.removeChild(overlay)
  header.appendChild(closeBtn)

  // 搜索框
  const searchWrapper = document.createElement('div')
  searchWrapper.style.cssText = `padding: 12px 20px; border-bottom: 1px solid var(--b3-border-color);`
  const searchInput = document.createElement('input')
  searchInput.type = 'text'
  searchInput.placeholder = '搜索按钮...'
  searchInput.className = 'b3-text-field'
  searchInput.style.cssText = `width: 100%; padding: 8px 12px;`
  searchWrapper.appendChild(searchInput)

  // 内容区域
  const content = document.createElement('div')
  content.style.cssText = `
    padding: 16px;
    overflow-y: auto;
    flex: 1;
  `

  // 按钮列表容器
  const buttonList = document.createElement('div')
  buttonList.style.cssText = `display: flex; flex-direction: column; gap: 8px;`

  // 渲染按钮列表
  const renderButtons = (filter: string = '') => {
    buttonList.innerHTML = ''

    // 过滤并渲染按钮
    const filteredButtons = BUILTIN_BUTTONS.filter(
      b => b.name.toLowerCase().includes(filter.toLowerCase()) ||
           b.id.toLowerCase().includes(filter.toLowerCase())
    )

    if (filteredButtons.length === 0) {
      const noResult = document.createElement('div')
      noResult.style.cssText = `
        text-align: center;
        padding: 20px;
        color: var(--b3-theme-on-surface-light);
        font-size: 13px;
      `
      noResult.textContent = '未找到匹配的按钮'
      buttonList.appendChild(noResult)
      return
    }

    // 渲染按钮项
    filteredButtons.forEach(btn => {
      const btnItem = document.createElement('div')
      const isSelected = btn.id === currentValue
      btnItem.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        border-radius: 6px;
        cursor: pointer;
        background: ${isSelected ? 'var(--b3-theme-primary-lightest)' : 'var(--b3-theme-surface)'};
        border: 1px solid ${isSelected ? 'var(--b3-theme-primary)' : 'var(--b3-border-color)'};
        transition: all 0.2s;
      `

      // 图标
      const iconSpan = document.createElement('span')
      iconSpan.style.cssText = `
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      `
      updateIconDisplay(iconSpan, btn.icon)

      // 名称
      const nameSpan = document.createElement('span')
      nameSpan.style.cssText = `
        font-size: 14px;
        color: var(--b3-theme-on-surface);
        flex: 1;
      `
      nameSpan.textContent = btn.name

      // ID
      const idSpan = document.createElement('code')
      idSpan.style.cssText = `
        font-size: 11px;
        background: var(--b3-theme-background);
        padding: 3px 8px;
        border-radius: 3px;
        color: var(--b3-theme-primary);
        flex-shrink: 0;
      `
      idSpan.textContent = btn.id

      btnItem.appendChild(iconSpan)
      btnItem.appendChild(nameSpan)
      btnItem.appendChild(idSpan)

      btnItem.onclick = () => {
        onSelect(btn)
        document.body.removeChild(overlay)
      }

      // 触摸反馈
      btnItem.ontouchstart = () => {
        btnItem.style.background = 'var(--b3-theme-primary)'
      }
      btnItem.ontouchend = () => {
        btnItem.style.background = isSelected ? 'var(--b3-theme-primary-lightest)' : 'var(--b3-theme-surface)'
      }

      buttonList.appendChild(btnItem)
    })
  }

  // 初始渲染
  renderButtons()

  // 搜索事件
  searchInput.oninput = () => {
    renderButtons(searchInput.value)
  }

  content.appendChild(buttonList)

  // 组装
  dialog.appendChild(header)
  dialog.appendChild(searchWrapper)
  dialog.appendChild(content)
  overlay.appendChild(dialog)
  document.body.appendChild(overlay)

  // 点击遮罩关闭
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay)
    }
  }

  // 聚焦搜索框
  setTimeout(() => searchInput.focus(), 100)
}
