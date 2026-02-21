/**
 * 思源表情选择器
 * 使用思源原生表情数据 window.siyuan.emojis
 */

export interface EmojiPickerOptions {
  title?: string
  currentValue?: string
  onSelect: (emoji: string) => void
}

/**
 * Unicode 转 Emoji 字符串
 */
function unicodeToEmoji(unicode: string): string {
  if (!unicode) return ""

  // 自定义图片表情
  if (unicode.includes(".")) {
    return `<img src="/emojis/${unicode}" style="width:20px;height:20px;"/>`
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
 * 显示表情选择器弹窗
 */
export function showEmojiPicker(options: EmojiPickerOptions): void {
  const { title = "选择表情", onSelect } = options

  // 获取思源表情数据
  const emojiCategories = getSiYuanEmojis()
  if (!emojiCategories.length) {
    console.warn("思源表情数据未加载")
    return
  }

  // 创建弹窗
  const dialog = document.createElement("div")
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

  const panel = document.createElement("div")
  panel.style.cssText = `
    background: var(--b3-theme-background);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    width: 500px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
  `

  // 头部
  const header = document.createElement("div")
  header.style.cssText = `
    padding: 16px 20px;
    border-bottom: 1px solid var(--b3-border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
  `
  header.innerHTML = `<span style="font-size: 16px; font-weight: 600;">${title}</span>`

  const closeBtn = document.createElement("button")
  closeBtn.className = "b3-button b3-button--icon"
  closeBtn.innerHTML =
    '<svg style="width: 16px; height: 16px;"><use xlink:href="#iconClose"></use></svg>'
  closeBtn.onclick = () => document.body.removeChild(dialog)
  header.appendChild(closeBtn)

  // 内容区
  const content = document.createElement("div")
  content.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
  `

  // 分类标签
  const tabs = document.createElement("div")
  tabs.style.cssText = `
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    flex-wrap: wrap;
    border-bottom: 1px solid var(--b3-border-color);
    padding-bottom: 12px;
  `

  let activeCategory = emojiCategories[0]?.id || ""

  // 渲染表情网格
  const renderEmojis = (categoryId: string) => {
    // 清空之前的内容
    const existingGrid = content.querySelector(".emoji-grid")
    if (existingGrid) {
      existingGrid.remove()
    }

    const category = emojiCategories.find((c: any) => c.id === categoryId)
    if (!category) return

    const grid = document.createElement("div")
    grid.className = "emoji-grid"
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
      gap: 8px;
    `

    category.items.forEach((item: any) => {
      const btn = document.createElement("button")
      btn.className = "b3-button"
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

      // 显示表情
      if (item.unicode.includes(".")) {
        // 自定义图片
        btn.innerHTML = `<img src="/emojis/${item.unicode}" style="width:20px;height:20px;"/>`
      } else {
        // Unicode emoji
        btn.textContent = unicodeToEmoji(item.unicode)
      }

      // 悬停效果
      btn.onmouseenter = () => {
        btn.style.background = "var(--b3-theme-surface)"
        btn.style.borderColor = "var(--b3-theme-primary)"
      }
      btn.onmouseleave = () => {
        btn.style.background = "var(--b3-theme-background)"
        btn.style.borderColor = "var(--b3-border-color)"
      }

      // 点击选择
      btn.onclick = () => {
        const emoji = unicodeToEmoji(item.unicode)
        onSelect(emoji)
        document.body.removeChild(dialog)
      }

      grid.appendChild(btn)
    })

    content.appendChild(grid)
  }

  // 创建分类标签
  emojiCategories.forEach((cat: any, index: number) => {
    const tab = document.createElement("button")
    tab.className = "b3-button"
    tab.textContent = cat.title_zh_cn || cat.title
    tab.dataset.categoryId = cat.id
    tab.style.cssText = `
      padding: 6px 12px;
      border-radius: 16px;
      border: 1px solid var(--b3-border-color);
      background: var(--b3-theme-background);
      color: var(--b3-theme-on-background);
      cursor: pointer;
      font-size: 13px;
    `

    const updateStyle = () => {
      if (activeCategory === cat.id) {
        tab.style.background = "var(--b3-theme-primary)"
        tab.style.color = "var(--b3-theme-on-primary)"
        tab.style.borderColor = "var(--b3-theme-primary)"
      } else {
        tab.style.background = "var(--b3-theme-background)"
        tab.style.color = "var(--b3-theme-on-background)"
        tab.style.borderColor = "var(--b3-border-color)"
      }
    }

    updateStyle()

    tab.onclick = () => {
      activeCategory = cat.id
      // 更新所有标签样式
      tabs.querySelectorAll("button").forEach((b: any) => {
        const isActive = b.dataset.categoryId === cat.id
        b.style.background = isActive
          ? "var(--b3-theme-primary)"
          : "var(--b3-theme-background)"
        b.style.color = isActive
          ? "var(--b3-theme-on-primary)"
          : "var(--b3-theme-on-background)"
        b.style.borderColor = isActive
          ? "var(--b3-theme-primary)"
          : "var(--b3-border-color)"
      })
      renderEmojis(cat.id)
    }

    tabs.appendChild(tab)
  })

  content.appendChild(tabs)

  // 默认渲染第一个分类
  if (activeCategory) {
    renderEmojis(activeCategory)
  }

  // 组装
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
