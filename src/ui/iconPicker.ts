/**
 * 图标选择器
 * 三级分区：思源图标 | 阿里图标 | 极简图标（Lucide）
 * 支持按关键词搜索（跨分类）
 */

import { aliIconCategories, updateIconDisplay } from '../data/icons'
import { getLucideIconNames, lucideToSvg } from '../utils/lucideHelper'

export interface IconPickerOptions {
  title?: string
  currentValue?: string
  iconSize?: number  // 图标大小（px），默认24
  onSelect: (icon: string) => void
}

type PartitionType = 'siyuan' | 'ali' | 'lucide'

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
    min-height: 400px;
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

  // ===== 搜索框 =====
  let searchKeyword = ''

  const searchWrapper = document.createElement('div')
  searchWrapper.style.cssText = `
    position: relative;
    margin-bottom: 12px;
  `

  const searchIcon = document.createElement('span')
  searchIcon.style.cssText = `
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 14px;
    color: var(--b3-theme-on-surface-light);
    pointer-events: none;
  `
  searchIcon.textContent = '🔍'

  const searchInput = document.createElement('input')
  searchInput.type = 'text'
  searchInput.className = 'b3-text-field'
  searchInput.style.cssText = `
    width: 100%;
    padding: 8px 32px 8px 32px;
    box-sizing: border-box;
    border-radius: 6px;
    font-size: 13px;
  `

  const searchClearBtn = document.createElement('button')
  searchClearBtn.style.cssText = `
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    border: none;
    background: none;
    cursor: pointer;
    font-size: 16px;
    color: var(--b3-theme-on-surface-light);
    padding: 4px;
    display: none;
    line-height: 1;
    border-radius: 4px;
  `
  searchClearBtn.textContent = '×'
  searchClearBtn.onmouseenter = () => { searchClearBtn.style.background = 'var(--b3-theme-surface)' }
  searchClearBtn.onmouseleave = () => { searchClearBtn.style.background = 'none' }

  searchWrapper.appendChild(searchIcon)
  searchWrapper.appendChild(searchInput)
  searchWrapper.appendChild(searchClearBtn)

  // ===== 一级分区标签 =====
  const partitionTabs = document.createElement('div')
  partitionTabs.style.cssText = `
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
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

  let activePartition: PartitionType = 'lucide'
  let activeCategory = ''

  // ===== 搜索框占位符根据分区动态变化 =====
  const updateSearchPlaceholder = () => {
    const map: Record<PartitionType, string> = {
      lucide: '极简图标搜索，请用拼音...',
      ali: '阿里图标搜索，请用拼音...',
      siyuan: '思源图标搜索，请用汉字...',
    }
    searchInput.placeholder = map[activePartition]
  }
  updateSearchPlaceholder()

  // ===== 通用：创建图标按钮 =====
  const createIconButton = (icon: string, onClick: () => void): HTMLElement => {
    const btnSize = Math.max(40, iconSize + 16)
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

    const iconSpan = document.createElement('span')
    iconSpan.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
    `
    updateIconDisplay(iconSpan, icon)
    btn.appendChild(iconSpan)

    btn.onclick = onClick
    btn.onmouseenter = () => {
      btn.style.background = 'var(--b3-theme-surface)'
      btn.style.borderColor = 'var(--b3-theme-primary)'
    }
    btn.onmouseleave = () => {
      btn.style.background = 'var(--b3-theme-background)'
      btn.style.borderColor = 'var(--b3-border-color)'
    }
    return btn
  }

  /**
   * 创建 Lucide 图标按钮
   * 直接用 lucideToSvg 生成内联 SVG（不依赖 DOM symbol）
   */
  const createLucideIconButton = (iconName: string, onClick: () => void): HTMLElement => {
    const btnSize = Math.max(40, iconSize + 16)
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

	    const svgHtml = lucideToSvg(iconName, iconSize)
    if (svgHtml) {
      btn.innerHTML = svgHtml
      btn.style.color = 'var(--b3-theme-on-background)'
      const svg = btn.querySelector('svg')
      if (svg) svg.style.cssText = 'flex-shrink:0;display:block;color:inherit'
    } else {
      btn.textContent = iconName.substring(0, 2)
    }

    btn.onclick = onClick
    btn.onmouseenter = () => {
      btn.style.background = 'var(--b3-theme-surface)'
      btn.style.borderColor = 'var(--b3-theme-primary)'
    }
    btn.onmouseleave = () => {
      btn.style.background = 'var(--b3-theme-background)'
      btn.style.borderColor = 'var(--b3-border-color)'
    }
    return btn
  }

  // ===== 通用：创建并替换网格容器 =====
  const replaceGrid = (): HTMLElement => {
    const existingGrid = content.querySelector('.icon-grid')
    if (existingGrid) {
      existingGrid.remove()
    }
    const btnSize = Math.max(40, iconSize + 16)
    const grid = document.createElement('div')
    grid.className = 'icon-grid'
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(${btnSize}px, 1fr));
      gap: 8px;
    `
    return grid
  }

  // ===== 搜索模式：跨分类展平搜索 =====
  const renderSearchResults = () => {
    const grid = replaceGrid()
    const keyword = searchKeyword.toLowerCase()
    const onSelectIcon = (icon: string) => {
      onSelect(icon)
      document.body.removeChild(dialog)
    }

    let matchedCount = 0

    if (activePartition === 'siyuan') {
      const emojiCategories = getSiYuanEmojis()
      emojiCategories.forEach((cat: any) => {
        const catName = (cat.title_zh_cn || cat.title || '').toLowerCase()
        ;(cat.items || []).forEach((item: any) => {
          const desc = (item.description_zh_cn || item.description || '').toLowerCase()
          const keys = (item.keywords || '').toLowerCase()
          if (desc.includes(keyword) || keys.includes(keyword) || catName.includes(keyword)) {
            const emoji = unicodeToEmoji(item.unicode)
            grid.appendChild(createIconButton(emoji, () => onSelectIcon(emoji)))
            matchedCount++
          }
        })
      })
    } else if (activePartition === 'ali') {
      aliIconCategories.forEach(cat => {
        const catName = cat.name.toLowerCase()
        cat.icons.forEach(iconPath => {
          const fileName = iconPath.split('/').pop()?.replace(/\.\w+$/, '').toLowerCase() || ''
          if (catName.includes(keyword) || fileName.includes(keyword)) {
            grid.appendChild(createIconButton(iconPath, () => onSelectIcon(iconPath)))
            matchedCount++
          }
        })
      })
    } else if (activePartition === 'lucide') {
      const allNames = getLucideIconNames()
      allNames.forEach(name => {
        if (name.toLowerCase().includes(keyword)) {
          grid.appendChild(createLucideIconButton(name, () => onSelectIcon(`lucide:${name}`)))
          matchedCount++
        }
      })
    }

    // 更新分类标签区域：显示搜索结果数量
    categoryTabs.innerHTML = ''
    const statusEl = document.createElement('div')
    statusEl.style.cssText = 'padding: 6px 0 10px 0; font-size: 13px; color: var(--b3-theme-on-surface-light);'
    if (matchedCount === 0) {
      statusEl.textContent = `未找到匹配"${keyword}"的图标`
    } else {
      statusEl.textContent = `找到 ${matchedCount} 个匹配"${keyword}"的图标`
    }
    categoryTabs.appendChild(statusEl)

    // 无结果时在网格中显示提示
    if (matchedCount === 0) {
      const emptyHint = document.createElement('div')
      emptyHint.style.cssText = `
        grid-column: 1 / -1;
        text-align: center;
        padding: 40px 20px;
        color: var(--b3-theme-on-surface-light);
        font-size: 14px;
      `
      emptyHint.textContent = '未找到匹配的图标'
      grid.appendChild(emptyHint)
    }

    content.appendChild(grid)
  }

  // ===== 搜索输入处理 =====
  const handleSearch = () => {
    const value = searchInput.value
    searchKeyword = value.trim()

    searchClearBtn.style.display = searchKeyword ? 'block' : 'none'

    if (searchKeyword) {
      // 搜索模式：隐藏分区标签，显示搜索结果
      partitionTabs.style.display = 'none'
      renderSearchResults()
    } else {
      // 非搜索模式：恢复分区标签，显示分类浏览
      partitionTabs.style.display = 'flex'
      updateCategoryTabs()
    }
  }

  searchInput.oninput = handleSearch
  searchClearBtn.onclick = () => {
    searchInput.value = ''
    handleSearch()
    searchInput.focus()
  }

  // ===== 渲染思源表情内容（按分类） =====
  const renderSiyuanContent = (categoryId: string) => {
    const grid = replaceGrid()

    const emojiCategories = getSiYuanEmojis()
    const category = emojiCategories.find((c: any) => c.id === categoryId)
    if (!category) return

    ;(category.items || []).forEach((item: any) => {
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

  // ===== 渲染阿里图标内容（按分类） =====
  const renderAliContent = (categoryId: string) => {
    const grid = replaceGrid()

    const cat = aliIconCategories.find(c => c.id === categoryId)
    if (!cat) return

    cat.icons.forEach(icon => {
      grid.appendChild(createIconButton(icon, () => {
        onSelect(icon)
        document.body.removeChild(dialog)
      }))
    })

    content.appendChild(grid)
  }

  // ===== 渲染极简图标内容（Lucide - 无分类，全量网格） =====
  const renderLucideContent = () => {
    const allNames = getLucideIconNames()

    categoryTabs.innerHTML = ''
    if (allNames.length === 0) {
      const msg = document.createElement('div')
      msg.style.cssText = 'padding: 6px 0 10px 0; font-size: 13px; color: var(--b3-theme-on-surface-light);'
      msg.textContent = 'Lucide 图标库未加载，请确认插件已正确打包 lucide 依赖'
      categoryTabs.appendChild(msg)

      const grid = replaceGrid()
      const emptyHint = document.createElement('div')
      emptyHint.style.cssText = 'grid-column:1/-1;text-align:center;padding:40px 20px;color:var(--b3-theme-on-surface-light);font-size:14px;'
      emptyHint.textContent = '未能加载 Lucide 图标列表'
      grid.appendChild(emptyHint)
      content.appendChild(grid)
      return
    }

    const countEl = document.createElement('div')
    countEl.style.cssText = 'padding: 6px 0 10px 0; font-size: 13px; color: var(--b3-theme-on-surface-light);'
    countEl.textContent = `共 ${allNames.length} 个图标`
    categoryTabs.appendChild(countEl)

    const grid = replaceGrid()
    const fragment = document.createDocumentFragment()

    allNames.forEach(name => {
      fragment.appendChild(createLucideIconButton(name, () => {
        onSelect(`lucide:${name}`)
        document.body.removeChild(dialog)
      }))
    })

    grid.appendChild(fragment)
    content.appendChild(grid)
  }

  // ===== 更新二级分类标签 =====
  const updateCategoryTabs = () => {
    categoryTabs.innerHTML = ''

    if (activePartition === 'siyuan') {
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
      if (activeCategory) {
        renderSiyuanContent(activeCategory)
      }
    } else if (activePartition === 'ali') {
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
      renderAliContent(activeCategory)
    } else if (activePartition === 'lucide') {
      // 极简图标无分类，直接渲染全量
      renderLucideContent()
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

      // 切换分区时，若有搜索关键词则自动清空
      if (searchKeyword) {
        searchInput.value = ''
        searchKeyword = ''
        searchClearBtn.style.display = 'none'
        partitionTabs.style.display = 'flex'
      }

      activePartition = type
      activeCategory = ''
      updateSearchPlaceholder()

      // 更新分区标签样式
      partitionTabs.querySelectorAll('button').forEach(b => {
        const bType = b.dataset.partition as PartitionType
        const isActive = bType === type
        b.style.background = isActive ? 'var(--b3-theme-primary)' : 'var(--b3-theme-background)'
        b.style.color = isActive ? 'var(--b3-theme-on-primary)' : 'var(--b3-theme-on-background)'
        b.style.borderColor = isActive ? 'var(--b3-theme-primary)' : 'var(--b3-border-color)'
      })

      updateCategoryTabs()
    }

    return tab
  }

  // 添加分区标签
  partitionTabs.appendChild(createPartitionTab('lucide', '极简图标'))
  partitionTabs.appendChild(createPartitionTab('ali', '阿里图标'))
  partitionTabs.appendChild(createPartitionTab('siyuan', '思源图标'))

  // 组装界面：搜索框 → 分区标签 → 分类标签
  content.appendChild(searchWrapper)
  content.appendChild(partitionTabs)
  content.appendChild(categoryTabs)

  // 初始化显示思源图标分类
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
