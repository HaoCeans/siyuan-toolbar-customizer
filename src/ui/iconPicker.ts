/**
 * 图标选择器
 */

import { iconCategories, updateIconDisplay } from '../data/icons'

export interface IconPickerOptions {
  title?: string
  currentValue?: string
  onSelect: (icon: string) => void
}

/**
 * 显示图标选择器弹窗
 */
export function showIconPicker(options: IconPickerOptions): void {
  const { title = '选择图标', onSelect } = options

  // 创建弹窗
  const dialog = document.createElement('div')
  dialog.style.cssText = `
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

  const panel = document.createElement('div')
  panel.style.cssText = `
    background: var(--b3-theme-background);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    max-width: 500px;
    width: 100%;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
  `

  const header = document.createElement('div')
  header.style.cssText = `
    padding: 16px 20px;
    border-bottom: 1px solid var(--b3-border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
  `
  header.innerHTML = `<span style="font-size: 16px; font-weight: 600;">${title}</span>`

  const closeBtn = document.createElement('button')
  closeBtn.className = 'b3-button b3-button--icon'
  closeBtn.innerHTML = '<svg style="width: 16px; height: 16px;"><use xlink:href="#iconClose"></use></svg>'
  closeBtn.onclick = () => document.body.removeChild(dialog)
  header.appendChild(closeBtn)

  const content = document.createElement('div')
  content.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
  `

  // 分类标签
  const tabs = document.createElement('div')
  tabs.style.cssText = `
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  `

  let activeCategory = iconCategories[0].id

  const renderContent = (category: string) => {
    // 清空内容但保留 tabs
    const existingGrid = content.querySelector('.icon-grid')
    if (existingGrid) {
      existingGrid.remove()
    }

    const grid = document.createElement('div')
    grid.className = 'icon-grid'
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(50px, 1fr));
      gap: 8px;
    `

    let icons: string[] = []

    // 查找对应的分类
    const cat = iconCategories.find(c => c.id === category)

    if (cat) {
      icons = cat.icons
    }

    icons.forEach(icon => {
      const btn = document.createElement('button')
      btn.className = 'b3-button'
      btn.style.cssText = `
        width: 50px;
        height: 50px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        cursor: pointer;
        font-size: 24px;
        background: var(--b3-theme-background);
      `

      updateIconDisplay(btn, icon)

      btn.onclick = () => {
        onSelect(icon)
        document.body.removeChild(dialog)
      }

      btn.onmouseenter = () => {
        btn.style.background = 'var(--b3-theme-surface)'
        btn.style.borderColor = 'var(--b3-theme-primary)'
      }

      btn.onmouseleave = () => {
        btn.style.background = 'var(--b3-theme-background)'
        btn.style.borderColor = 'var(--b3-border-color)'
      }

      grid.appendChild(btn)
    })

    content.appendChild(grid)
  }

  // 创建分类标签
  iconCategories.forEach(cat => {
    const tab = document.createElement('button')
    tab.className = 'b3-button'
    tab.textContent = cat.name
    tab.dataset.categoryId = cat.id
    tab.style.cssText = `
      padding: 6px 16px;
      border-radius: 16px;
      border: 1px solid var(--b3-border-color);
      background: var(--b3-theme-background);
      color: var(--b3-theme-on-background);
      cursor: pointer;
    `

    const updateTabStyle = () => {
      if (activeCategory === cat.id) {
        tab.style.background = 'var(--b3-theme-primary)'
        tab.style.color = 'var(--b3-theme-on-primary)'
        tab.style.borderColor = 'var(--b3-theme-primary)'
      } else {
        tab.style.background = 'var(--b3-theme-background)'
        tab.style.color = 'var(--b3-theme-on-background)'
        tab.style.borderColor = 'var(--b3-border-color)'
      }
    }

    updateTabStyle()

    tab.onclick = () => {
      activeCategory = cat.id
      // 更新所有标签的样式
      tabs.querySelectorAll('button').forEach(b => {
        const categoryId = b.dataset.categoryId
        if (categoryId === cat.id) {
          b.style.background = 'var(--b3-theme-primary)'
          b.style.color = 'var(--b3-theme-on-primary)'
          b.style.borderColor = 'var(--b3-theme-primary)'
        } else {
          b.style.background = 'var(--b3-theme-background)'
          b.style.color = 'var(--b3-theme-on-background)'
          b.style.borderColor = 'var(--b3-border-color)'
        }
      })
      renderContent(cat.id)
    }

    tabs.appendChild(tab)
  })

  content.appendChild(tabs)
  // 默认显示第一个分类
  renderContent(iconCategories[0].id)

  panel.appendChild(header)
  panel.appendChild(content)
  dialog.appendChild(panel)

  // 点击背景关闭
  dialog.onclick = (e) => {
    if (e.target === dialog) {
      document.body.removeChild(dialog)
    }
  }

  document.body.appendChild(dialog)
}
