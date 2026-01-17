/**
 * 工具栏管理器
 * 负责移动端工具栏调整和自定义按钮功能
 */

import { getFrontend, showMessage } from "siyuan";

// ===== 配置接口 =====
export interface MobileToolbarConfig {
  enableBottomToolbar: boolean; // 是否将工具栏置底
  openInputOffset: string;    // 打开输入框时距离底部高度
  closeInputOffset: string;   // 关闭输入框时距离底部高度
  heightThreshold: number;    // 高度变化阈值百分比
  toolbarBackgroundColor: string; // 工具栏背景颜色
  toolbarOpacity: number;     // 工具栏透明度 (0-1)
}

export interface ButtonConfig {
  id: string;                 // 唯一标识
  name: string;              // 按钮名称
  type: 'builtin' | 'template' | 'click-sequence'; // 功能类型
  builtinId?: string;        // 思源功能ID（如：menuSearch）
  template?: string;         // 模板内容
  clickSequence?: string[];  // 模拟点击选择器序列
  icon: string;              // 图标（思源图标或Emoji）
  iconSize: number;          // 图标大小（px）
  minWidth: number;          // 按钮最小宽度（px）
  marginRight: number;       // 右侧边距（px）
  sort: number;              // 排序（数字越小越靠左）
  platform: 'desktop' | 'mobile' | 'both'; // 显示平台
  showNotification: boolean; // 是否显示右上角提示
}

// ===== 默认配置 =====
export const DEFAULT_MOBILE_CONFIG: MobileToolbarConfig = {
  enableBottomToolbar: true,
  openInputOffset: '50px',
  closeInputOffset: '0px',
  heightThreshold: 70,
  toolbarBackgroundColor: '#f8f9fa',
  toolbarOpacity: 0.95
}

export const DEFAULT_BUTTONS_CONFIG: ButtonConfig[] = []

// 桌面端默认按钮
export const DEFAULT_DESKTOP_BUTTONS: ButtonConfig[] = [
  {
    id: 'plugin-settings-desktop',
    name: '插件设置',
    type: 'click-sequence',
    clickSequence: ['barPlugins', 'text:工具栏定制器'],
    icon: 'iconSettings',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 1,
    platform: 'desktop',
    showNotification: true
  },
  {
    id: 'template1',
    name: '插入待办',
    type: 'template',
    template: '- [ ] ',
    icon: 'iconCheck',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 2,
    platform: 'desktop',
    showNotification: true
  }
]

// 移动端默认按钮
export const DEFAULT_MOBILE_BUTTONS: ButtonConfig[] = [
  {
    id: 'plugin-settings-mobile',
    name: '插件设置',
    type: 'click-sequence',
    clickSequence: ['toolbarMore', 'menuPlugin', 'text:工具栏定制器'],
    icon: 'iconSettings',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 1,
    platform: 'mobile',
    showNotification: true
  },
  {
    id: 'recent-mobile',
    name: '最近文档',
    type: 'builtin',
    builtinId: 'menuRecent',
    icon: 'iconHistory',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 2,
    platform: 'mobile',
    showNotification: true
  },
  {
    id: 'search-mobile',
    name: '搜索',
    type: 'builtin',
    builtinId: 'menuSearch',
    icon: 'iconSearch',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 3,
    platform: 'mobile',
    showNotification: true
  },
  {
    id: 'template1-mobile',
    name: '插入待办',
    type: 'template',
    template: '- [ ] ',
    icon: 'iconCheck',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 4,
    platform: 'mobile',
    showNotification: true
  }
]

// ===== 工具函数 =====
// 保存监听器引用以便清理
let resizeHandler: (() => void) | null = null
let mutationObserver: MutationObserver | null = null
let clickHandler: ((e: Event) => void) | null = null

/**
 * 判断是否为移动端
 */
export function isMobileDevice(): boolean {
  const frontend = getFrontend()
  return frontend === 'mobile' || frontend === 'browser-mobile'
}

/**
 * 判断是否为桌面端
 */
function isDesktopDevice(): boolean {
  return !isMobileDevice()
}

/**
 * 检查是否应该显示按钮
 */
function shouldShowButton(button: ButtonConfig): boolean {
  const isMobile = isMobileDevice()
  
  if (button.platform === 'both') return true
  if (button.platform === 'mobile' && isMobile) return true
  if (button.platform === 'desktop' && !isMobile) return true
  
  return false
}

// ===== 移动端工具栏调整 =====
export function initMobileToolbarAdjuster(config: MobileToolbarConfig) {
  // 仅在移动端初始化
  if (!isMobileDevice()) return
  
  // 如果未启用工具栏置底，则移除相关样式并返回
  if (!config.enableBottomToolbar) {
    // 移除之前可能添加的样式
    const existingStyle = document.getElementById('mobile-toolbar-custom-style')
    if (existingStyle) {
      existingStyle.remove()
    }
    // 移除工具栏的自定义属性
    const toolbars = document.querySelectorAll('[data-toolbar-customized="true"]')
    toolbars.forEach(toolbar => {
      (toolbar as HTMLElement).removeAttribute('data-toolbar-customized')
      (toolbar as HTMLElement).removeAttribute('data-input-method')
    })
    return
  }
  
  const setupToolbar = () => {
    // 优先查找 .protyle-breadcrumb（移动端使用）
    let breadcrumb = document.querySelector('.protyle-breadcrumb:not(.protyle-breadcrumb__bar)')
    
    // 如果没找到，尝试查找 .protyle-breadcrumb__bar（桌面端使用）
    if (!breadcrumb) {
      breadcrumb = document.querySelector('.protyle-breadcrumb__bar')
    }
    
    if (!breadcrumb) {
      return false
    }
    
    setupToolbarForElement(breadcrumb)
    return true
  }

  const setupToolbarForElement = (toolbar: Element) => {
    // 防止重复设置
    if ((toolbar as HTMLElement).dataset.toolbarCustomized === 'true') return
    
    // 标记已设置
    (toolbar as HTMLElement).dataset.toolbarCustomized = 'true'
    
    // 初始设置
    let lastKnownHeight = window.innerHeight
    let inputMethodOpen = false

    // 创建CSS变量
    document.documentElement.style.setProperty('--mobile-toolbar-offset', config.closeInputOffset)

    // 更新工具栏位置
    function updateToolbarPosition() {
      const currentHeight = window.innerHeight
      
      // 计算高度变化百分比
      const heightRatio = currentHeight / lastKnownHeight
      
      // 如果当前高度比上次记录的高度小阈值以上，认为输入法打开了
      const threshold = config.heightThreshold / 100
      const isNowOpen = heightRatio < threshold
      
      if (isNowOpen !== inputMethodOpen) {
        inputMethodOpen = isNowOpen
        
        if (inputMethodOpen) {
          // 输入法打开时
          document.documentElement.style.setProperty('--mobile-toolbar-offset', config.openInputOffset)
          toolbar.setAttribute('data-input-method', 'open')
        } else {
          // 输入法关闭时
          document.documentElement.style.setProperty('--mobile-toolbar-offset', config.closeInputOffset)
          toolbar.setAttribute('data-input-method', 'close')
        }
      }
      
      // 更新记录的高度
      lastKnownHeight = currentHeight
    }

    // 初始调用一次
    updateToolbarPosition()
    
    // 设置初始属性
    toolbar.setAttribute('data-input-method', 'close')
    
    // 监听窗口大小变化
    resizeHandler = updateToolbarPosition
    window.addEventListener('resize', resizeHandler)
    
    // 监听焦点事件，作为辅助判断
    const textInputs = document.querySelectorAll('textarea, input[type="text"], .protyle-wysiwyg, .protyle-content, .protyle-input')
    textInputs.forEach(input => {
      input.addEventListener('focus', () => {
        setTimeout(updateToolbarPosition, 300)
      })
      
      input.addEventListener('blur', () => {
        setTimeout(updateToolbarPosition, 300)
      })
    })

    // 添加CSS样式
    const styleId = 'mobile-toolbar-style'
    let style = document.getElementById(styleId) as HTMLStyleElement
    if (!style) {
      style = document.createElement('style')
      style.id = styleId
      document.head.appendChild(style)
    }
    
    style.textContent = `
      /* 移动端工具栏样式 - 修复版 */
      @media (max-width: 768px) {
        .protyle-breadcrumb__bar[data-input-method],
        .protyle-breadcrumb[data-input-method] {
          position: fixed !important;
          bottom: var(--mobile-toolbar-offset, 0px) !important;
          top: auto !important;
          left: 0 !important;
          right: 0 !important;
          z-index: 2147483647 !important;
          background: var(--b3-theme-surface) !important;
          border-top: 1px solid var(--b3-border-color) !important;
          padding: 8px 12px !important;
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
          box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1) !important;
          transition: bottom 0.3s ease !important;
          backdrop-filter: blur(10px);
          background-color: rgba(var(--b3-theme-surface-rgb), 0.95) !important;
        }
        
        .protyle-breadcrumb__bar[data-input-method="open"],
        .protyle-breadcrumb[data-input-method="open"] {
          bottom: var(--mobile-toolbar-offset, 50px) !important;
        }
        
        .protyle-breadcrumb__bar[data-input-method="close"],
        .protyle-breadcrumb[data-input-method="close"] {
          bottom: var(--mobile-toolbar-offset, 0px) !important;
        }
        
        /* 防止编辑器内容被遮挡 */
        .protyle {
          padding-bottom: 60px !important;
        }
        
        /* 安全区域适配 */
        .protyle-breadcrumb__bar[data-input-method],
        .protyle-breadcrumb[data-input-method] {
          padding-bottom: max(8px, env(safe-area-inset-bottom)) !important;
        }
      }
    `
  }

  // 尝试设置工具栏
  if (!setupToolbar()) {
    // 如果没找到，延迟尝试
    setTimeout(() => {
      setupToolbar()
    }, 2000)
  }
  
  // 监听DOM变化，确保工具栏加载后能应用样式
  mutationObserver = new MutationObserver(() => {
    setupToolbar()
  })
  
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true
  })
}

// ===== 自定义按钮功能 =====
export function initCustomButtons(configs: ButtonConfig[]) {
  // 清理旧的插件按钮
  cleanupCustomButtons()
  
  // 初始设置
  setTimeout(() => setupEditorButtons(configs), 1000)
  
  // 移除旧的监听器
  if (clickHandler) {
    document.removeEventListener('click', clickHandler, true)
  }
  
  // 监听编辑器加载事件
  clickHandler = (e: Event) => {
    // 检查是否点击了编辑器区域
    const target = e.target as HTMLElement
    if (target.closest('.protyle')) {
      // 延迟执行，确保编辑器完全加载
      setTimeout(() => setupEditorButtons(configs), 100)
    }
  }
  document.addEventListener('click', clickHandler, true)
}

function cleanupCustomButtons() {
  // 清理旧的插件按钮
  const oldButtons = document.querySelectorAll('[data-custom-button]')
  oldButtons.forEach(btn => btn.remove())
}

function setupEditorButtons(configs: ButtonConfig[]) {
  // 找到所有编辑器
  const editors = document.querySelectorAll('.protyle')
  
  editors.forEach(editor => {
    // 找到退出聚焦按钮
    const exitFocusBtn = editor.querySelector('.protyle-breadcrumb__bar [data-type="exit-focus"]') || 
                        editor.querySelector('.protyle-breadcrumb [data-type="exit-focus"]')
    if (!exitFocusBtn) return
    
    // 过滤并排序按钮
    const buttonsToAdd = configs
      .filter(button => shouldShowButton(button))
      .sort((a, b) => a.sort - b.sort)
    
    // 清理旧的插件按钮
    const oldButtons = editor.querySelectorAll('[data-custom-button]')
    oldButtons.forEach(btn => btn.remove())
    
    // 添加新按钮
    buttonsToAdd.forEach(buttonConfig => {
      const button = createButtonElement(buttonConfig)
      exitFocusBtn.insertAdjacentElement('afterend', button)
    })
  })
}

function createButtonElement(config: ButtonConfig): HTMLElement {
  const button = document.createElement('button')
  button.dataset.customButton = config.id
  button.className = 'block__icon fn__flex-center ariaLabel'
  button.setAttribute('aria-label', config.name)
  button.title = config.name
  
  // 基础样式（包含用户可配置的最小宽度）
  const baseStyle = `
    line-height: 1;
    cursor: pointer;
    user-select: none;
    transition: all 0.2s ease;
    min-width: ${config.minWidth}px;
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    padding: 4px;
  `
  
  // 设置图标
  if (config.icon.startsWith('icon')) {
    // 思源图标
    button.style.cssText = baseStyle + `
      margin-right: ${config.marginRight}px;
    `
    
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', `${config.iconSize}`)
    svg.setAttribute('height', `${config.iconSize}`)
    svg.style.cssText = 'display: block;'
    
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
    use.setAttribute('href', `#${config.icon}`)
    svg.appendChild(use)
    
    button.appendChild(svg)
  } else if (config.icon.startsWith('lucide:')) {
    // Lucide 图标
    button.style.cssText = baseStyle + `
      margin-right: ${config.marginRight}px;
    `
    
    const iconName = config.icon.substring(7)
    try {
      const lucideIcons = require('lucide')
      const IconComponent = lucideIcons[iconName]
      
      if (IconComponent) {
        const svgString = IconComponent.toSvg({ 
          width: config.iconSize, 
          height: config.iconSize
        })
        button.innerHTML = svgString
      } else {
        button.textContent = config.icon
      }
    } catch (e) {
      button.textContent = config.icon
    }
  } else {
    // Emoji 或文本图标
    button.style.cssText = baseStyle + `
      font-size: ${config.iconSize}px;
      margin-right: ${config.marginRight}px;
    `
    button.textContent = config.icon
  }
  
  // 绑定点击事件
  button.addEventListener('click', (e) => {
    e.stopPropagation()
    e.preventDefault()
    handleButtonClick(config)
  })
  
  return button
}

function handleButtonClick(config: ButtonConfig) {
  // 如果开启了右上角提示，显示消息
  if (config.showNotification) {
    showMessage(`执行: ${config.name}`, 1500, 'info')
  }
  
  if (config.type === 'builtin') {
    // 执行思源内置功能
    executeBuiltinFunction(config)
  } else if (config.type === 'template') {
    // 插入模板
    insertTemplate(config)
  } else if (config.type === 'click-sequence') {
    // 执行点击序列
    executeClickSequence(config)
  }
}

function executeBuiltinFunction(config: ButtonConfig) {
  if (!config.builtinId) {
    showMessage(`按钮"${config.name}"未配置功能ID`, 3000, 'error')
    return
  }
  
  // 尝试多种方式查找按钮
  let menuItem: HTMLElement | null = null
  
  // 1. 通过 id 查找
  menuItem = document.getElementById(config.builtinId)
  if (menuItem) {
    clickElement(menuItem)
    return
  }
  
  // 2. 通过 data-id 查找
  menuItem = document.querySelector(`[data-id="${config.builtinId}"]`) as HTMLElement
  if (menuItem) {
    clickElement(menuItem)
    return
  }
  
  // 3. 通过 data-menu-id 查找
  menuItem = document.querySelector(`[data-menu-id="${config.builtinId}"]`) as HTMLElement
  if (menuItem) {
    clickElement(menuItem)
    return
  }
  
  // 4. 通过 data-type 查找
  menuItem = document.querySelector(`[data-type="${config.builtinId}"]`) as HTMLElement
  if (menuItem) {
    clickElement(menuItem)
    return
  }
  
  // 5. 通过 class 查找（支持多个class，用空格分隔）
  const classNames = config.builtinId.split(' ')
  if (classNames.length > 0) {
    const classSelector = classNames.map(c => `.${c}`).join('')
    menuItem = document.querySelector(classSelector) as HTMLElement
    if (menuItem) {
      clickElement(menuItem)
      return
    }
  }
  
  // 6. 通过文本内容查找按钮
  const allButtons = document.querySelectorAll('button')
  for (const btn of allButtons) {
    const label = btn.querySelector('.b3-menu__label')?.textContent?.trim()
    if (label === config.builtinId) {
      clickElement(btn as HTMLElement)
      return
    }
  }
  
  // 所有方法都失败
  showMessage(`未找到功能: ${config.builtinId}`, 3000, 'error')
}

function insertTemplate(config: ButtonConfig) {
  if (!config.template) {
    showMessage(`按钮"${config.name}"未配置模板内容`, 3000, 'error')
    return
  }
  
  // 获取当前焦点所在的编辑器
  const activeEditor = document.activeElement?.closest('.protyle')
  if (!activeEditor) {
    showMessage('请先聚焦到编辑器', 3000, 'warning')
    return
  }
  
  // 插入模板内容
  const contentEditable = activeEditor.querySelector('[contenteditable="true"]')
  if (contentEditable) {
    // 创建输入事件
    const inputEvent = new Event('input', { bubbles: true })
    
    try {
      // 尝试使用execCommand插入文本
      document.execCommand('insertText', false, config.template)
      
      // 触发输入事件
      contentEditable.dispatchEvent(inputEvent)
    } catch (error) {
      showMessage('插入模板失败，请确保编辑器处于可编辑状态', 3000, 'error')
    }
  }
}

// ===== 点击序列执行 =====
/**
 * 执行点击序列
 */
async function executeClickSequence(config: ButtonConfig) {
  if (!config.clickSequence || config.clickSequence.length === 0) {
    showMessage(`按钮"${config.name}"未配置点击序列`, 3000, 'error')
    return
  }

  for (let i = 0; i < config.clickSequence.length; i++) {
    const selector = config.clickSequence[i].trim()
    if (!selector) continue // 跳过空选择器

    // 尝试执行当前步骤，最多重试2次
    let success = false
    for (let retry = 0; retry <= 2; retry++) {
      try {
        // 等待元素出现（最多5秒）
        const element = await waitForElement(selector, 5000)
        
        if (!element) {
          throw new Error(`未找到元素: ${selector}`)
        }

        // 检查元素是否可见
        if (!isVisible(element)) {
          throw new Error(`元素不可见: ${selector}`)
        }

        // 点击元素
        clickElement(element)
        success = true
        break // 成功后跳出重试循环
      } catch (error) {
        if (retry === 2) {
          // 最后一次重试也失败
          showMessage(`点击序列失败: 步骤 ${i + 1} - ${selector}`, 3000, 'error')
          return
        }
        
        // 等待一小段时间后重试
        await delay(300)
      }
    }

    if (!success) {
      return // 如果步骤失败，停止整个序列
    }

    // 步骤之间稍微延迟，让界面有时间响应
    await delay(200)
  }

  showMessage(`${config.name} 执行完成`, 1500, 'info')
}

/**
 * 等待元素出现
 * @param selector CSS选择器或简单标识符（支持智能匹配）
 * @param timeout 超时时间（毫秒）
 * @returns Promise<HTMLElement | null>
 */
function waitForElement(selector: string, timeout: number = 5000): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    // 智能查找元素（支持7种方式）
    const findElement = (): HTMLElement | null => {
      // 检查是否是文本查询模式 (text:xxx)
      if (selector.startsWith('text:')) {
        const searchText = selector.substring(5).trim()
        return findElementByText(searchText)
      }
      
      // 如果包含 CSS 选择器特殊字符，直接使用标准查询
      if (selector.includes('#') || selector.includes('.') || selector.includes('[') || selector.includes('>') || selector.includes(' ')) {
        return document.querySelector(selector) as HTMLElement
      }
      
      // 否则使用 6 种智能匹配方式
      let element: HTMLElement | null = null
      
      // 1. 通过 id 查找
      element = document.getElementById(selector)
      if (element) return element
      
      // 2. 通过 data-id 属性查找
      element = document.querySelector(`[data-id="${selector}"]`) as HTMLElement
      if (element) return element
      
      // 3. 通过 data-menu-id 属性查找
      element = document.querySelector(`[data-menu-id="${selector}"]`) as HTMLElement
      if (element) return element
      
      // 4. 通过 data-type 属性查找
      element = document.querySelector(`[data-type="${selector}"]`) as HTMLElement
      if (element) return element
      
      // 5. 通过 class 查找（支持多个class，用空格分隔）
      const classNames = selector.split(' ')
      if (classNames.length > 0) {
        const classSelector = classNames.map(c => `.${c}`).join('')
        element = document.querySelector(classSelector) as HTMLElement
        if (element) return element
      }
      
      // 6. 通过文本内容查找按钮（兼容旧的方式）
      const allButtons = document.querySelectorAll('button')
      for (const btn of allButtons) {
        const label = btn.querySelector('.b3-menu__label')?.textContent?.trim()
        if (label === selector) {
          return btn as HTMLElement
        }
      }
      
      return null
    }
    
    // 先检查元素是否已存在
    const element = findElement()
    if (element) {
      resolve(element)
      return
    }

    // 使用MutationObserver监听DOM变化
    const observer = new MutationObserver(() => {
      const element = findElement()
      if (element) {
        observer.disconnect()
        clearTimeout(timeoutId)
        resolve(element)
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true
    })

    // 超时处理
    const timeoutId = setTimeout(() => {
      observer.disconnect()
      resolve(null)
    }, timeout)
  })
}

/**
 * 通过文本内容查找元素（支持多种元素类型）
 * @param searchText 要搜索的文本内容
 * @returns 找到的元素或null
 */
function findElementByText(searchText: string): HTMLElement | null {
  // 1. 查找按钮（最常见）
  const allButtons = document.querySelectorAll('button')
  for (const btn of allButtons) {
    // 检查按钮的直接文本内容
    if (btn.textContent?.trim() === searchText) {
      return btn as HTMLElement
    }
    // 检查按钮内的 label
    const label = btn.querySelector('.b3-menu__label')?.textContent?.trim()
    if (label === searchText) {
      return btn as HTMLElement
    }
  }
  
  // 2. 查找菜单项
  const menuItems = document.querySelectorAll('.b3-menu__item')
  for (const item of menuItems) {
    if (item.textContent?.trim() === searchText) {
      return item as HTMLElement
    }
  }
  
  // 3. 查找链接
  const links = document.querySelectorAll('a')
  for (const link of links) {
    if (link.textContent?.trim() === searchText) {
      return link as HTMLElement
    }
  }
  
  // 4. 查找 span 和 div（文本容器）
  const textElements = document.querySelectorAll('span, div')
  for (const el of textElements) {
    // 直接比较 textContent（去除首尾空格）
    if (el.textContent?.trim() === searchText) {
      return el as HTMLElement
    }
  }
  
  // 5. 通用查找（最后的备选方案）- 查找所有可点击元素
  const allElements = document.querySelectorAll('*')
  for (const el of allElements) {
    if (el.textContent?.trim() === searchText) {
      return el as HTMLElement
    }
  }
  
  return null
}

/**
 * 检查元素是否可见
 */
function isVisible(element: HTMLElement): boolean {
  if (!element) return false
  
  const style = window.getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false
  }
  
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) {
    return false
  }
  
  return true
}

/**
 * 延迟执行
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 点击元素
 */
function clickElement(element: HTMLElement): void {
  // 尝试多种点击方式以确保兼容性
  try {
    // 方式1: 标准click()
    element.click()
  } catch (e) {
    try {
      // 方式2: 模拟鼠标事件
      const event = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      })
      element.dispatchEvent(event)
    } catch (e2) {
      // 点击元素失败
    }
  }
}

// ===== 辅助函数：重新加载编辑器按钮 =====
export function reloadEditorButtons(configs: ButtonConfig[]) {
  setupEditorButtons(configs)
}

// ===== 清理函数 =====
export function cleanup() {
  // 清理自定义按钮
  cleanupCustomButtons()
  
  // 移除事件监听器
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
    resizeHandler = null
  }
  
  if (mutationObserver) {
    mutationObserver.disconnect()
    mutationObserver = null
  }
  
  if (clickHandler) {
    document.removeEventListener('click', clickHandler, true)
    clickHandler = null
  }
  
  // 清理移动端样式
  const style = document.getElementById('mobile-toolbar-style')
  if (style) {
    style.remove()
  }
  
  // 清理属性
  const toolbars = document.querySelectorAll('.protyle-breadcrumb__bar, .protyle-breadcrumb')
  toolbars.forEach(toolbar => {
    toolbar.removeAttribute('data-input-method')
    toolbar.removeAttribute('data-toolbar-customized')
  })
  
  // 移除CSS变量
  document.documentElement.style.removeProperty('--mobile-toolbar-offset')
}