/**
 * 图标选择器
 * 三级分区结构：本体图标 | 思源图标 | 阿里图标
 */

import { iconCategories, aliIconCategories, updateIconDisplay } from '../data/icons'

export interface IconPickerOptions {
  title?: string
  currentValue?: string
  iconSize?: number  // 图标大小（px），默认24
  onSelect: (icon: string) => void
}

type PartitionType = 'local' | 'siyuan' | 'ali'

/**
 * Unicode 转 Emoji 字符串
 */
function unicodeToEmoji(unicode: string): string {
  if (!unicode) return ""

  // 自定义图片表情
  if (unicode.includes(".")) {
    return unicode
  }

  // Unicode emoji
  return unicode
    .split("-")
    .map((item) => {
      const code = item.length < 5 ? "0" + item : item
      return String.fromCodePoint(parseInt(code, 16))
    })
    .join("")
}

/**
 * 获取思源表情数据
 */
function getSiYuanEmojis() {
  return (window as any).siyuan?.emojis || []
}

/**
 * 显示图标选择器弹窗
 */
export function showIconPicker(options: IconPickerOptions): void {
  const { title = '选择图标', iconSize = 24, onSelect } = options

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

  // ===== 一级分区标签 =====
  const partitionTabs = document.createElement('div')
  partitionTabs.style.cssText = `
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 2px solid var(--b3-border-color);
  `

  // ===== 二级分类标签容器 =====
  const categoryTabs = document.createElement('div')
  categoryTabs.style.cssText = `
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  `

  let activePartition: PartitionType = 'local'
  let activeCategory = iconCategories[0].id

  // ===== 渲染本体图标内容 =====
  const renderLocalContent = (categoryId: string) => {
    const existingGrid = content.querySelector('.icon-grid')
    if (existingGrid) {
      existingGrid.remove()
    }

    const grid = document.createElement('div')
    grid.className = 'icon-grid'
    // 根据图标大小动态计算按钮大小（图标大小 + 边距）
    const btnSize = Math.max(40, iconSize + 16)
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(${btnSize}px, 1fr));
      gap: 8px;
    `

    const cat = iconCategories.find(c => c.id === categoryId)
    if (!cat) return

    cat.icons.forEach(icon => {
      const btn = document.createElement('button')
      btn.className = 'b3-button'
      btn.style.cssText = `
        width: ${btnSize}px;
        height: ${btnSize}px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        cursor: pointer;
        font-size: ${iconSize}px;
        background: var(--b3-theme-background);
        padding: 0;
      `

      // 创建图标容器
      const iconSpan = document.createElement('span')
      iconSpan.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
      `
      updateIconDisplay(iconSpan, icon, iconSize)
      btn.appendChild(iconSpan)

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

  // ===== 渲染思源表情内容 =====
  const renderSiyuanContent = (categoryId: string) => {
    const existingGrid = content.querySelector('.icon-grid')
    if (existingGrid) {
      existingGrid.remove()
    }

    const grid = document.createElement('div')
    grid.className = 'icon-grid'
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
      gap: 8px;
    `

    const emojiCategories = getSiYuanEmojis()
    const category = emojiCategories.find((c: any) => c.id === categoryId)
    if (!category) return

    category.items.forEach((item: any) => {
      const btn = document.createElement('button')
      btn.className = 'b3-button'
      btn.style.cssText = `
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        cursor: pointer;
        font-size: 20px;
        background: var(--b3-theme-background);
        padding: 0;
      `

      if (item.unicode.includes(".")) {
        btn.innerHTML = `<img src="/emojis/${item.unicode}" style="width:20px;height:20px;"/>`
      } else {
        btn.textContent = unicodeToEmoji(item.unicode)
      }

      btn.onclick = () => {
        const emoji = unicodeToEmoji(item.unicode)
        onSelect(emoji)
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

  // ===== 渲染阿里图标内容 =====
  const renderAliContent = (categoryId: string) => {
    const existingGrid = content.querySelector('.icon-grid')
    if (existingGrid) {
      existingGrid.remove()
    }

    const grid = document.createElement('div')
    grid.className = 'icon-grid'
    // 根据图标大小动态计算按钮大小（图标大小 + 边距）
    const btnSize = Math.max(40, iconSize + 16)
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(${btnSize}px, 1fr));
      gap: 8px;
    `

    const cat = aliIconCategories.find(c => c.id === categoryId)
    if (!cat) return

    cat.icons.forEach(icon => {
      const btn = document.createElement('button')
      btn.className = 'b3-button'
      btn.style.cssText = `
        width: ${btnSize}px;
        height: ${btnSize}px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        cursor: pointer;
        font-size: ${iconSize}px;
        background: var(--b3-theme-background);
        padding: 0;
      `

      // 创建图标容器
      const iconSpan = document.createElement('span')
      iconSpan.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
      `
      updateIconDisplay(iconSpan, icon, iconSize)
      btn.appendChild(iconSpan)

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

  // ===== 更新二级分类标签 =====
  const updateCategoryTabs = () => {
    categoryTabs.innerHTML = ''

    if (activePartition === 'local') {
      // 生成本地图标分类标签
      // 默认选择"表情"分类（emoji-smileys）
      const defaultCategoryId = 'emoji-smileys'
      activeCategory = iconCategories.find(c => c.id === defaultCategoryId)?.id || iconCategories[0]?.id

      iconCategories.forEach(cat => {
        const tab = createCategoryTab(cat.id, cat.name, activeCategory === cat.id, () => {
          activeCategory = cat.id
          updateCategoryTabStyles()
          renderLocalContent(cat.id)
        })
        categoryTabs.appendChild(tab)
      })
      // 渲染默认分类
      renderLocalContent(activeCategory)
    } else if (activePartition === 'siyuan') {
      // 生成思源表情分类标签
      // 默认选择"笑脸和人类"分类（people）
      const emojiCategories = getSiYuanEmojis()
      const defaultCategoryId = 'people'
      activeCategory = emojiCategories.find((c: any) => c.id === defaultCategoryId)?.id || emojiCategories[0]?.id

      emojiCategories.forEach((cat: any) => {
        const tab = createCategoryTab(cat.id, cat.title_zh_cn || cat.title, activeCategory === cat.id, () => {
          activeCategory = cat.id
          updateCategoryTabStyles()
          renderSiyuanContent(cat.id)
        })
        categoryTabs.appendChild(tab)
      })
      // 渲染默认分类
      if (activeCategory) {
        renderSiyuanContent(activeCategory)
      }
    } else if (activePartition === 'ali') {
      // 生成阿里图标分类标签
      // 默认选择"食物图标"分类
      const defaultCategoryId = 'ali-food'
      activeCategory = aliIconCategories.find(c => c.id === defaultCategoryId)?.id || aliIconCategories[0]?.id

      aliIconCategories.forEach(cat => {
        const tab = createCategoryTab(cat.id, cat.name, activeCategory === cat.id, () => {
          activeCategory = cat.id
          updateCategoryTabStyles()
          renderAliContent(cat.id)
        })
        categoryTabs.appendChild(tab)
      })
      // 渲染默认分类
      renderAliContent(activeCategory)
    }
  }

  // ===== 创建分类标签按钮 =====
  const createCategoryTab = (id: string, name: string, isActive: boolean, onClick: () => void) => {
    const tab = document.createElement('button')
    tab.className = 'b3-button'
    tab.textContent = name
    tab.dataset.categoryId = id
    tab.style.cssText = `
      padding: 6px 16px;
      border-radius: 16px;
      border: 1px solid var(--b3-border-color);
      background: ${isActive ? 'var(--b3-theme-primary)' : 'var(--b3-theme-background)'};
      color: ${isActive ? 'var(--b3-theme-on-primary)' : 'var(--b3-theme-on-background)'};
      cursor: pointer;
      font-size: 13px;
    `

    tab.onclick = onClick
    return tab
  }

  // ===== 更新分类标签样式 =====
  const updateCategoryTabStyles = () => {
    categoryTabs.querySelectorAll('button').forEach(b => {
      const isActive = b.dataset.categoryId === activeCategory
      b.style.background = isActive ? 'var(--b3-theme-primary)' : 'var(--b3-theme-background)'
      b.style.color = isActive ? 'var(--b3-theme-on-primary)' : 'var(--b3-theme-on-background)'
      b.style.borderColor = isActive ? 'var(--b3-theme-primary)' : 'var(--b3-border-color)'
    })
  }

  // ===== 创建分区标签 =====
  const createPartitionTab = (type: PartitionType, label: string) => {
    const tab = document.createElement('button')
    tab.className = 'b3-button'
    tab.textContent = label
    tab.dataset.partition = type
    tab.style.cssText = `
      padding: 8px 20px;
      border-radius: 20px;
      border: 2px solid ${type === activePartition ? 'var(--b3-theme-primary)' : 'var(--b3-border-color)'};
      background: ${type === activePartition ? 'var(--b3-theme-primary)' : 'var(--b3-theme-background)'};
      color: ${type === activePartition ? 'var(--b3-theme-on-primary)' : 'var(--b3-theme-on-background)'};
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      transition: all 0.2s;
    `

    tab.onclick = () => {
      if (activePartition === type) return

      activePartition = type
      activeCategory = '' // 重置分类

      // 更新分区标签样式
      partitionTabs.querySelectorAll('button').forEach(b => {
        const bType = b.dataset.partition as PartitionType
        const isActive = bType === type
        b.style.background = isActive ? 'var(--b3-theme-primary)' : 'var(--b3-theme-background)'
        b.style.color = isActive ? 'var(--b3-theme-on-primary)' : 'var(--b3-theme-on-background)'
        b.style.borderColor = isActive ? 'var(--b3-theme-primary)' : 'var(--b3-border-color)'
      })

      // 更新分类标签和内容
      updateCategoryTabs()
    }

    return tab
  }

  // 添加分区标签
  partitionTabs.appendChild(createPartitionTab('local', '本体图标'))
  partitionTabs.appendChild(createPartitionTab('siyuan', '思源图标'))
  partitionTabs.appendChild(createPartitionTab('ali', '阿里图标'))

  // 组装界面
  content.appendChild(partitionTabs)
  content.appendChild(categoryTabs)

  // 初始化显示本体图标分类
  updateCategoryTabs()

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
