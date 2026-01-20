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
  toolbarHeight: string;      // 工具栏高度
  toolbarZIndex: number;      // 工具栏层级
}

export interface ButtonConfig {
  id: string;                 // 唯一标识
  name: string;              // 按钮名称
  type: 'builtin' | 'template' | 'click-sequence' | 'shortcut'; // 功能类型
  builtinId?: string;        // 思源功能ID（如：menuSearch）
  template?: string;         // 模板内容
  clickSequence?: string[];  // 模拟点击选择器序列
  shortcutKey?: string;      // 快捷键组合
  icon: string;              // 图标（思源图标或Emoji）
  iconSize: number;          // 图标大小（px）
  minWidth: number;          // 按钮最小宽度（px）
  marginRight: number;       // 右侧边距（px）
  sort: number;              // 排序（数字越小越靠左）
  platform: 'desktop' | 'mobile' | 'both'; // 显示平台
  showNotification: boolean; // 是否显示右上角提示
  enabled?: boolean;         // 是否启用（默认true）
}

// ===== 默认配置 =====
export const DEFAULT_MOBILE_CONFIG: MobileToolbarConfig = {
  enableBottomToolbar: true,
  openInputOffset: '50px',
  closeInputOffset: '0px',
  heightThreshold: 70,
  toolbarBackgroundColor: '#f8f9fa',
  toolbarOpacity: 0.95,
  toolbarHeight: '30px', // 默认工具栏高度
  toolbarZIndex: 5,      // 默认工具栏层级
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
    id: 'open-diary-desktop',
    name: '打开日记',
    type: 'shortcut',
    shortcutKey: 'Alt+5',
    icon: 'iconCalendar',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 2,
    platform: 'desktop',
    showNotification: true
  },
  {
    id: 'template-time-desktop',
    name: '插入时分',
    type: 'template',
    template: '{{hour}}时{{minute}}分',
    icon: 'iconClock',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 3,
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
    id: 'open-diary-mobile',
    name: '打开日记',
    type: 'shortcut',
    shortcutKey: 'Alt+5',
    icon: 'iconCalendar',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 2,
    platform: 'mobile',
    showNotification: true
  },
  {
    id: 'template-time-mobile',
    name: '插入时分',
    type: 'template',
    template: '{{hour}}时{{minute}}分',
    icon: 'iconClock',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 3,
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
    sort: 4,
    platform: 'mobile',
    showNotification: true
  }
]

// ===== 工具函数 =====
// 保存监听器引用以便清理
let resizeHandler: (() => void) | null = null
let mutationObserver: MutationObserver | null = null
let pageObserver: MutationObserver | null = null  // 用于检测页面变化的观察器
let mobileToolbarClickHandler: ((e: Event) => void) | null = null  // 专门用于移动端工具栏的点击处理
let customButtonClickHandler: ((e: Event) => void) | null = null  // 专门用于自定义按钮的点击处理
let activeTimers: Set<number> = new Set()  // 跟踪所有活动的定时器

/**
 * 安全的 setTimeout，返回的定时器会被跟踪以便清理
 */
function safeSetTimeout(callback: () => void, delay: number): number {
  const timerId = setTimeout(() => {
    activeTimers.delete(timerId)
    callback()
  }, delay)
  activeTimers.add(timerId)
  return timerId
}

/**
 * 清除所有活动的定时器
 */
function clearAllTimers(): void {
  activeTimers.forEach(timerId => clearTimeout(timerId))
  activeTimers.clear()
}

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

  // 检查是否启用
  if (button.enabled === false) return false

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
    const toolbars = document.querySelectorAll('[data-toolbar-customized="true"]') as NodeListOf<HTMLElement>
    const toolbarsArray = Array.from(toolbars)
    toolbarsArray.forEach(toolbar => {
      toolbar.removeAttribute('data-toolbar-customized')
      toolbar.removeAttribute('data-input-method')
      // 不移除fn__none类，保留原生的隐藏状态
      // toolbar.classList.remove('fn__none')  // 同时移除可能添加的隐藏类
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
        safeSetTimeout(updateToolbarPosition, 300)
      })

      input.addEventListener('blur', () => {
        safeSetTimeout(updateToolbarPosition, 300)
      })
    })

  // 添加CSS样式
    const styleId = 'mobile-toolbar-custom-style'
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
          z-index: ${config.toolbarZIndex} !important;
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
          height: ${config.toolbarHeight} !important; /* 应用高度配置 */
          min-height: ${config.toolbarHeight} !important;
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
          padding-bottom: calc(${config.toolbarHeight} + 10px) !important;
        }
        
        /* 安全区域适配 */
        .protyle-breadcrumb__bar[data-input-method],
        .protyle-breadcrumb[data-input-method] {
          padding-bottom: max(8px, env(safe-area-inset-bottom)) !important;
        }
        
        /* 使用思源原生的隐藏类 */
        .protyle-breadcrumb__bar[data-input-method].fn__none,
        .protyle-breadcrumb[data-input-method].fn__none {
          display: none !important;
        }
      }
    `
  }

  // 尝试设置工具栏
  if (!setupToolbar()) {
    // 如果没找到，延迟尝试
    safeSetTimeout(() => {
      setupToolbar()
    }, 2000)
  }
  
  // 监听DOM变化，确保工具栏加载后能应用样式
  mutationObserver = new MutationObserver(() => {
    setupToolbar()
    // 检查当前是否在文档编辑页面，以确定是否显示工具栏
    // 仅在工具栏被标记为移动到底部时才应用我们的隐藏逻辑
    if (config.enableBottomToolbar) {
      updateToolbarVisibility()
    }
  })
  
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true
  })
  
  // 页面加载完成后检查一次
  if (config.enableBottomToolbar) {
    updateToolbarVisibility()
  }
  
  // 添加页面变化检测函数
  function updateToolbarVisibility() {
    // 获取所有工具栏元素
    const toolbars = document.querySelectorAll('[data-toolbar-customized="true"][data-input-method]') as NodeListOf<HTMLElement>
    const toolbarsArray = Array.from(toolbars)
    
    // 检查当前是否应该显示工具栏（基于原生逻辑）
    // 我们只添加自定义属性，不应改变原生的显示/隐藏逻辑
    toolbarsArray.forEach(toolbar => {
      // 检查原生的隐藏类是否存在
      // 如果原生逻辑需要隐藏工具栏，我们应该保留这个状态
      // 不主动修改原生的隐藏类
    })
  }
  
  // 监听路由变化或页面状态变化
  if (pageObserver) {
    pageObserver.disconnect()
  }
  pageObserver = new MutationObserver(() => {
    // 仅在工具栏被标记为移动到底部时才应用我们的隐藏逻辑
    if (config.enableBottomToolbar) {
      updateToolbarVisibility()
    }
  })
  
  pageObserver.observe(document.body, {
    childList: true,
    subtree: true
  })
}

// ===== 自定义按钮功能 =====
export function initCustomButtons(configs: ButtonConfig[]) {
  // 清理旧的插件按钮
  cleanupCustomButtons()

  // 初始设置
  safeSetTimeout(() => setupEditorButtons(configs), 1000)

  // 移除旧的监听器
  if (customButtonClickHandler) {
    document.removeEventListener('click', customButtonClickHandler, true)
  }

  // 监听编辑器加载事件
  customButtonClickHandler = (e: Event) => {
    // 检查是否点击了编辑器区域
    const target = e.target as HTMLElement
    if (target.closest('.protyle')) {
      // 延迟执行，确保编辑器完全加载
      safeSetTimeout(() => setupEditorButtons(configs), 100)
    }
  }
  document.addEventListener('click', customButtonClickHandler, true)
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

  // 设置图标
  if (config.icon.startsWith('icon')) {
    // 思源图标
    button.style.cssText = `
      line-height: 1;
      cursor: pointer;
      user-select: none;
      transition: all 0.2s ease;
      min-height: 32px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      padding: 4px;
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
    button.style.cssText = `
      line-height: 1;
      cursor: pointer;
      user-select: none;
      transition: all 0.2s ease;
      min-height: 32px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      padding: 4px;
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
    button.style.cssText = `
      line-height: 1;
      cursor: pointer;
      user-select: none;
      transition: all 0.2s ease;
      min-height: 32px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      padding: 4px;
      font-size: ${config.iconSize}px;
      margin-right: ${config.marginRight}px;
    `
    button.textContent = config.icon
  }

  // 保存选区的变量（用于快捷键按钮）
  let savedSelection: Range | null = null
  let lastActiveElement: HTMLElement | null = null

  // 在 mousedown 时保存选区和焦点元素（此时编辑器还未失去焦点）
  button.addEventListener('mousedown', (e) => {
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      savedSelection = selection.getRangeAt(0).cloneRange()
    }
    lastActiveElement = document.activeElement as HTMLElement
  })

  // 绑定点击事件
  button.addEventListener('click', (e) => {
    e.stopPropagation()
    e.preventDefault()

    // 将保存的选区传递给处理函数
    handleButtonClick(config, savedSelection, lastActiveElement)

    // 清理
    savedSelection = null
    lastActiveElement = null
  })

  return button
}

function handleButtonClick(config: ButtonConfig, savedSelection: Range | null = null, lastActiveElement: HTMLElement | null = null) {
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
  } else if (config.type === 'shortcut') {
    // 执行快捷键，传递保存的选区
    executeShortcut(config, savedSelection, lastActiveElement)
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
    showMessage('请先聚焦到编辑器', 3000, 'info')
    return
  }
  
  // 处理模板变量
  const processedTemplate = processTemplateVariables(config.template)
  
  // 插入模板内容
  const contentEditable = activeEditor.querySelector('[contenteditable="true"]')
  if (contentEditable) {
    // 创建输入事件
    const inputEvent = new Event('input', { bubbles: true })
    
    try {
      // 尝试使用execCommand插入文本
      document.execCommand('insertText', false, processedTemplate)
      
      // 触发输入事件
      contentEditable.dispatchEvent(inputEvent)
    } catch (error) {
      showMessage('插入模板失败，请确保编辑器处于可编辑状态', 3000, 'error')
    }
  }
}

/**
 * 处理模板变量
 * 支持的变量：
 * - {{date}} - 当前日期 YYYY-MM-DD
 * - {{time}} - 当前时间 HH:mm:ss
 * - {{datetime}} - 当前日期时间 YYYY-MM-DD HH:mm:ss
 * - {{year}} - 年份 YYYY
 * - {{month}} - 月份 MM
 * - {{day}} - 日期 DD
 * - {{hour}} - 小时 HH
 * - {{minute}} - 分钟 mm
 * - {{second}} - 秒 ss
 * - {{week}} - 星期几（中文）
 * - {{timestamp}} - Unix时间戳（毫秒）
 */
function processTemplateVariables(template: string): string {
  const now = new Date()
  
  // 格式化函数
  const pad = (num: number): string => String(num).padStart(2, '0')
  
  const year = now.getFullYear()
  const month = pad(now.getMonth() + 1)
  const day = pad(now.getDate())
  const hour = pad(now.getHours())
  const minute = pad(now.getMinutes())
  const second = pad(now.getSeconds())
  
  const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  const week = weekDays[now.getDay()]
  
  // 替换变量
  return template
    .replace(/\{\{datetime\}\}/g, `${year}-${month}-${day} ${hour}:${minute}:${second}`)
    .replace(/\{\{date\}\}/g, `${year}-${month}-${day}`)
    .replace(/\{\{time\}\}/g, `${hour}:${minute}:${second}`)
    .replace(/\{\{year\}\}/g, String(year))
    .replace(/\{\{month\}\}/g, month)
    .replace(/\{\{day\}\}/g, day)
    .replace(/\{\{hour\}\}/g, hour)
    .replace(/\{\{minute\}\}/g, minute)
    .replace(/\{\{second\}\}/g, second)
    .replace(/\{\{week\}\}/g, week)
    .replace(/\{\{timestamp\}\}/g, String(now.getTime()))
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

// ===== 清理函数 =====
export function cleanup() {
  // 清理所有定时器
  clearAllTimers()

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

  if (pageObserver) {
    pageObserver.disconnect()
    pageObserver = null
  }

  if (mobileToolbarClickHandler) {
    document.removeEventListener('click', mobileToolbarClickHandler, true)
    mobileToolbarClickHandler = null
  }

  if (customButtonClickHandler) {
    document.removeEventListener('click', customButtonClickHandler, true)
    customButtonClickHandler = null
  }

  // 清理移动端样式
  const style = document.getElementById('mobile-toolbar-custom-style')
  if (style) {
    style.remove()
  }

  // 清理属性
  const toolbars = document.querySelectorAll('.protyle-breadcrumb__bar, .protyle-breadcrumb')
  toolbars.forEach(toolbar => {
    // 只清理我们添加的属性，不干扰原生面包屑的隐藏逻辑
    if (toolbar.getAttribute('data-toolbar-customized') === 'true') {
      toolbar.removeAttribute('data-input-method')
      toolbar.removeAttribute('data-toolbar-customized')
      // 不移除fn__none类，保留原生的隐藏状态
      // toolbar.classList.remove('fn__none')
    }
  })

  // 移除CSS变量
  document.documentElement.style.removeProperty('--mobile-toolbar-offset')
}

// ===== 快捷键执行功能 =====

/**
 * 将思源格式的快捷键（如 ⌥5）解析为键盘事件参数
 */
function parseHotkeyToKeyEvent(hotkey: string): KeyboardEventInit | null {
  if (!hotkey) return null

  const event: KeyboardEventInit = {
    key: '',
    code: '',
    keyCode: undefined,
    which: undefined,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window
  }

  // 解析修饰键
  // 思源使用 ⌘ 表示主修饰键：Windows上是Ctrl，Mac上是Command
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  if (hotkey.includes('⌘')) {
    if (isMac) {
      event.metaKey = true    // Mac: Command键
    } else {
      event.ctrlKey = true    // Windows/Linux: Ctrl键
    }
  }
  if (hotkey.includes('⌃')) event.ctrlKey = true  // Ctrl键（Mac上的物理Ctrl）
  if (hotkey.includes('⇧')) event.shiftKey = true // Shift
  if (hotkey.includes('⌥')) event.altKey = true   // Alt/Option

  // 移除修饰键，获取主键
  let mainKey = hotkey
    .replace(/[⌘⌃⇧⌥]/g, '')
    .trim()

  if (!mainKey) return null

  // keyCode 映射表
  const keyCodeMap: Record<string, number> = {
    // 数字 0-9
    '0': 48, '1': 49, '2': 50, '3': 51, '4': 52,
    '5': 53, '6': 54, '7': 55, '8': 56, '9': 57,
    // 字母 A-Z
    'a': 65, 'b': 66, 'c': 67, 'd': 68, 'e': 69,
    'f': 70, 'g': 71, 'h': 72, 'i': 73, 'j': 74,
    'k': 75, 'l': 76, 'm': 77, 'n': 78, 'o': 79,
    'p': 80, 'q': 81, 'r': 82, 's': 83, 't': 84,
    'u': 85, 'v': 86, 'w': 87, 'x': 88, 'y': 89, 'z': 90,
    // 特殊键
    'Enter': 13,
    'Escape': 27,
    'Backspace': 8,
    'Tab': 9,
    'Delete': 46,
    'Space': 32,
    'ArrowUp': 38,
    'ArrowDown': 40,
    'ArrowLeft': 37,
    'ArrowRight': 39,
    'F1': 112, 'F2': 113, 'F3': 114, 'F4': 115, 'F5': 116,
    'F6': 117, 'F7': 118, 'F8': 119, 'F9': 120, 'F10': 121,
    'F11': 122, 'F12': 123
  }

  // 处理功能键 F1-F12
  if (/^F\d{1,2}$/.test(mainKey)) {
    event.key = mainKey
    event.code = mainKey
    event.keyCode = keyCodeMap[mainKey]
    event.which = keyCodeMap[mainKey]
    return event
  }

  // 处理特殊键
  if (keyCodeMap[mainKey]) {
    const specialKeyNames: Record<string, string> = {
      'Space': ' ',
      'Enter': 'Enter',
      'Escape': 'Escape',
      'Backspace': 'Backspace',
      'Tab': 'Tab',
      'Delete': 'Delete',
      'ArrowUp': 'ArrowUp',
      'ArrowDown': 'ArrowDown',
      'ArrowLeft': 'ArrowLeft',
      'ArrowRight': 'ArrowRight',
    }

    event.key = specialKeyNames[mainKey] || mainKey
    event.code = mainKey
    event.keyCode = keyCodeMap[mainKey]
    event.which = keyCodeMap[mainKey]
    return event
  }

  // 处理单个字符（字母或数字）
  if (mainKey.length === 1) {
    event.key = mainKey.toUpperCase()
    event.keyCode = keyCodeMap[mainKey.toLowerCase()]
    event.which = keyCodeMap[mainKey.toLowerCase()]

    // 设置 code
    if (/^[A-Z]$/.test(mainKey.toUpperCase())) {
      event.code = `Key${mainKey.toUpperCase()}`
    } else if (/^[0-9]$/.test(mainKey)) {
      event.code = `Digit${mainKey}`
    } else {
      event.code = mainKey
    }

    return event
  }

  return null
}

/**
 * 将用户输入的快捷键转换为思源格式的快捷键字符串
 * 思源使用 ⌘ 表示主修饰键（Windows:Ctrl, Mac:Command）
 * 例如：Alt+5 -> ⌥5, Ctrl+B -> ⌘B, Alt+P -> ⌥P
 */
function convertToSiyuanHotkey(shortcut: string): string {
  let result = shortcut.trim()

  // 替换修饰键为思源格式的符号（保留大小写）
  // 思源使用 ⌘ 表示主修饰键（Windows上是Ctrl，Mac上是Command）
  // Ctrl/Control -> ⌘, Alt -> ⌥, Shift -> ⇧
  result = result
    .replace(/ctrl\+/gi, '⌘')     // Ctrl -> ⌘
    .replace(/control\+/gi, '⌘')  // Control -> ⌘
    .replace(/shift\+/gi, '⇧')    // Shift -> ⇧
    .replace(/alt\+/gi, '⌥')      // Alt -> ⌥
    .replace(/option\+/gi, '⌥')   // Option -> ⌥ (Mac)
    .replace(/cmd\+/gi, '⌘')      // Cmd -> ⌘
    .replace(/command\+/gi, '⌘')  // Command -> ⌘
    .replace(/\+/g, '')            // 移除所有 + 号

  // 主键保持大写（思源的快捷键配置中使用大写字母）
  // 例如：Alt+P -> ⌥P，而不是 ⌥p
  const parts = result.split(/([⌘⌃⇧⌥])/)
  for (let i = 0; i < parts.length; i++) {
    // 如果不是修饰键符号，就转大写
    if (!['⌘', '⌃', '⇧', '⌥'].includes(parts[i])) {
      parts[i] = parts[i].toUpperCase()
    }
  }
  result = parts.join('')

  // 排序修饰键以匹配思源格式
  // 思源修饰键顺序: ⇧ (Shift) 在前，⌘ (Command) 在后
  // 例如: Ctrl+Shift+K -> ⇧⌘K，而不是 ⌘⇧K
  const modifiers: string[] = []
  let mainKey = ''

  for (const char of result) {
    if (char === '⇧') modifiers.push('⇧')
    else if (char === '⌘') modifiers.push('⌘')
    else if (char === '⌃') modifiers.push('⌃')
    else if (char === '⌥') modifiers.push('⌥')
    else mainKey += char
  }

  // 思源修饰键顺序: ⇧ ⌃ ⌥ ⌘ (Shift, Ctrl, Alt, Command)
  const sortOrder = { '⇧': 0, '⌃': 1, '⌥': 2, '⌘': 3 }
  modifiers.sort((a, b) => sortOrder[a] - sortOrder[b])

  result = modifiers.join('') + mainKey

  return result
}

/**
 * 在配置对象中根据快捷键查找命令名称
 */
function findCommandByKey(configObj: any, hotkey: string): string | null {
  if (!configObj) return null

  for (const key in configObj) {
    const item = configObj[key]
    // 检查 custom（用户自定义）或 default（默认）是否匹配
    if (item && (item.custom === hotkey || item.default === hotkey)) {
      return key
    }
  }

  return null
}

/**
 * 获取当前活动的 Protyle DOM 元素
 */
function getActiveProtyleElement(): HTMLElement | null {
  const activeElement = document.activeElement as HTMLElement
  if (activeElement) {
    const protyleElement = activeElement.closest('.protyle') as HTMLElement
    if (protyleElement) {
      return protyleElement
    }
  }

  const protyles = document.querySelectorAll('.protyle')
  for (const protyleElement of Array.from(protyles)) {
    if (protyleElement) {
      return protyleElement as HTMLElement
    }
  }

  return null
}

/**
 * 获取当前活动的 Protyle 实例
 * 思源的 protyle 实例可能存储在 window.siyuan.layout 或其他位置
 */
function getActiveProtyle(): any | null {
  const windowObj = window as any

  // 移动端：直接从 window.siyuan.mobile.editor.protyle 获取
  if (windowObj.siyuan?.mobile?.editor?.protyle) {
    return windowObj.siyuan.mobile.editor.protyle
  }

  // 桌面端：尝试从 layout 的 children 中查找
  if (windowObj.siyuan?.layout?.centerLayout?.children) {
    const children = windowObj.siyuan.layout.centerLayout.children
    for (const child of children) {
      if (child.children && child.children.length > 0) {
        // 找到当前活动的 tab
        for (const tab of child.children) {
          // 尝试从 panelElement 获取
          if (tab.panelElement) {
            const protyleDiv = tab.panelElement.querySelector('.protyle')
            if (protyleDiv && (protyleDiv as any).protyle) {
              return (protyleDiv as any).protyle
            }
          }
        }
      }
    }
  }

  // 尝试从所有 .protyle 元素中查找
  const protyleElements = document.querySelectorAll('.protyle')
  for (const element of Array.from(protyleElements)) {
    if ((element as any).protyle) {
      return (element as any).protyle
    }
  }

  return null
}

/**
 * 保存和恢复选区
 */
function saveSelection(): Range | null {
  const selection = window.getSelection()
  if (selection && selection.rangeCount > 0) {
    return selection.getRangeAt(0).cloneRange()
  }
  return null
}

function restoreSelection(range: Range | null) {
  if (!range) return
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

/**
 * 获取当前光标所在块的 ID
 */
function getCurrentBlockId(protyleElement: HTMLElement | null): string | null {
  if (!protyleElement) return null

  // 查找当前焦点的块元素
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null

  let node = selection.anchorNode
  while (node && node !== protyleElement) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement
      // 查找带有 data-node-id 的元素
      if (element.dataset.nodeId) {
        return element.dataset.nodeId
      }
      // 查找 .b3-list__item（块列表项）
      const listItem = element.closest('[data-node-id]')
      if (listItem && (listItem as HTMLElement).dataset.nodeId) {
        return (listItem as HTMLElement).dataset.nodeId
      }
    }
    node = node.parentElement
  }

  return null
}

/**
 * 复制文本到剪切板（兼容移动端）
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    // 尝试使用现代 Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }

    // 备用方案：使用 execCommand
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.left = '-9999px'
    textArea.style.top = '0'
    document.body.appendChild(textArea)
    textArea.select()
    const successful = document.execCommand('copy')
    document.body.removeChild(textArea)
    return successful
  } catch (err) {
    console.error('复制失败:', err)
    return false
  }
}

/**
 * 执行思源命令（通过查找思源的命令执行函数）
 */
function executeSiyuanCommand(command: string, protyle?: any) {
  const windowObj = window as any

  console.log('执行命令:', command, 'protyle:', protyle ? '有' : '无')

  // ========== 新方法：直接触发思源的快捷键处理系统 ==========
  // 思源监听键盘事件来处理快捷键，我们模拟真实的键盘事件

  // 解析快捷键（从命令反推快捷键，或者直接使用原始快捷键）
  // 首先尝试从 keymap 中查找这个命令对应的快捷键
  let hotkeyToTrigger = ''
  if (windowObj.siyuan?.config?.keymap) {
    const keymap = windowObj.siyuan.config.keymap

    // 在 general 中查找
    if (keymap.general && keymap.general[command]) {
      const item = keymap.general[command]
      hotkeyToTrigger = item.custom || item.default
    }

    // 在 editor 中查找
    if (!hotkeyToTrigger && keymap.editor) {
      if (keymap.editor.general && keymap.editor.general[command]) {
        const item = keymap.editor.general[command]
        hotkeyToTrigger = item.custom || item.default
      }
      if (keymap.editor.insert && keymap.editor.insert[command]) {
        const item = keymap.editor.insert[command]
        hotkeyToTrigger = item.custom || item.default
      }
    }
  }

  if (hotkeyToTrigger) {
    console.log('尝试触发快捷键事件:', hotkeyToTrigger)

    // 解析快捷键并创建键盘事件
    const keyEvent = parseHotkeyToKeyEvent(hotkeyToTrigger)

    if (keyEvent) {
      // 在 window 和 document.body 上同时触发快捷键事件
      const eventDown = new KeyboardEvent('keydown', keyEvent)
      const eventUp = new KeyboardEvent('keyup', keyEvent)

      // 先在 window 上触发
      window.dispatchEvent(eventDown)
      window.dispatchEvent(eventUp)

      // 再在 body 上触发
      document.body.dispatchEvent(eventDown)
      document.body.dispatchEvent(eventUp)

      console.log('已触发键盘事件:', keyEvent)

      // 快捷键触发成功，直接返回
      showMessage(`执行: ${config.shortcutKey}`, 1500, 'info')
      return
    }
  }

  // ========== 备用方法：点击按钮 ==========
  console.log('尝试备用方法：点击按钮')

  const generalCommandHandlers: Record<string, () => void> = {
    'dailyNote': () => {
      console.log('尝试通过多种方式打开日记')

      const siyuan = (window as any).siyuan

      // 方法1: 尝试使用 window.siyuan 中的函数
      if (siyuan) {
        console.log('siyuan 对象的键:', Object.keys(siyuan))

        // 尝试查找可能的日记相关函数
        for (const key in siyuan) {
          if (typeof siyuan[key] === 'function' && key.toLowerCase().includes('daily')) {
            console.log('找到日记相关函数:', key)
            try {
              siyuan[key]()
              console.log('调用成功')
              return
            } catch (e) {
              console.log('调用失败:', e)
            }
          }
        }
      }

      // 方法2: 尝试通过 fetchSyncPost 调用思源 API
      try {
        console.log('尝试通过思源 API 打开日记')

        if (typeof (window as any).fetchSyncPost === 'function') {
          console.log('fetchSyncPost 存在，尝试调用')

          ;(window as any).fetchSyncPost('/api/notebook/lsNotebooks', {}).then((result: any) => {
            console.log('笔记本列表:', result)
            if (result.code === 0 && result.data) {
              const dailyNotebook = result.data.notebooks?.find((nb: any) =>
                nb.name?.includes('日记') || nb.name?.includes('Daily')
              )
              if (dailyNotebook) {
                console.log('找到日记笔记本:', dailyNotebook)
              }
            }
          })
        }
      } catch (e) {
        console.log('API 调用失败:', e)
      }

      // 方法3: 查找并触发菜单容器
      const menuContainers = document.querySelectorAll('.b3-menu, [role="menu"]')
      console.log('找到', menuContainers.length, '个菜单容器')

      menuContainers.forEach(menu => {
        const items = menu.querySelectorAll('.b3-menu__item, [role="menuitem"]')
        items.forEach(item => {
          const text = item.textContent?.trim()
          if (text?.includes('日记')) {
            console.log('找到日记菜单项:', text)
            ;(item as HTMLElement).click()
          }
        })
      })

      console.log('所有方法尝试完毕，仍未找到打开日记的方法')
    },
    'search': () => {
      const searchBtn = document.querySelector('[data-type="search"]') as HTMLElement
      if (searchBtn) searchBtn.click()
    },
    'globalSearch': () => {
      const globalSearchBtn = document.querySelector('[data-type="globalSearch"]') as HTMLElement
      if (globalSearchBtn) globalSearchBtn.click()
    },
    'replace': () => {
      const replaceBtn = document.querySelector('[data-type="replace"]') as HTMLElement
      if (replaceBtn) replaceBtn.click()
    },
    'commandPanel': () => {
      if (windowObj.siyuan?.commandPanel) {
        windowObj.siyuan.commandPanel()
      }
    },
    'config': () => {
      const settingBtn = document.querySelector('[data-type="setting"]') as HTMLElement
      if (settingBtn) settingBtn.click()
    },
    'newFile': () => {
      const newFileBtn = document.querySelector('[data-type="newFile"]') as HTMLElement
      if (newFileBtn) newFileBtn.click()
    },
    'closeTab': () => {
      const closeTabBtn = document.querySelector('[data-type="closeTab"]') as HTMLElement
      if (closeTabBtn) closeTabBtn.click()
    },
  }

  if (generalCommandHandlers[command]) {
    generalCommandHandlers[command]()
    return
  }

  // 方法4: 对于编辑器命令，使用 protyle 实例
  if (protyle) {
    // 插入类命令（加粗、斜体、链接等）
    const insertCommands = [
      'bold', 'italic', 'underline', 'mark', 'strike', 'code', 'inline-code',
      'inline-math', 'link', 'ref', 'tag', 'check', 'list', 'ordered-list',
      'table', 'kbd', 'sup', 'sub', 'memo', 'clearInline'
    ]

    if (insertCommands.includes(command)) {
      if (protyle.insert) {
        protyle.insert(command)
        return
      }
    }

    // 编辑器通用命令
    const editorCommandHandlers: Record<string, (p: any) => void> = {
      'undo': (p) => p.document?.execUndo?.(),
      'redo': (p) => p.document?.execRedo?.(),
      'duplicate': (p) => p.duplicate?.(),
      'expand': (p) => p.document?.execExpand?.(),
      'collapse': (p) => p.document?.execCollapse?.(),
    }

    if (editorCommandHandlers[command]) {
      editorCommandHandlers[command](protyle)
      return
    }
  }

  showMessage(`无法执行命令: ${command}`, 3000, 'error')
}

/**
 * 执行快捷键（主入口函数）
 */
function executeShortcut(config: ButtonConfig, savedSelection: Range | null = null, lastActiveElement: HTMLElement | null = null) {
  if (!config.shortcutKey) {
    showMessage(`按钮"${config.name}"未配置快捷键`, 3000, 'error')
    return
  }

  try {
    // 转换为思源的快捷键格式
    const siyuanHotkey = convertToSiyuanHotkey(config.shortcutKey)
    console.log('执行快捷键:', config.shortcutKey, '-> 转换为:', siyuanHotkey)

    // 获取思源的快捷键配置
    const windowObj = window as any
    let command: string | null = null

    if (windowObj.siyuan?.config?.keymap) {
      const keymap = windowObj.siyuan.config.keymap

      // 在 general 中查找
      command = findCommandByKey(keymap.general, siyuanHotkey)

      // 在 editor.general 中查找
      if (!command && keymap.editor?.general) {
        command = findCommandByKey(keymap.editor.general, siyuanHotkey)
      }

      // 在 editor.insert 中查找
      if (!command && keymap.editor?.insert) {
        command = findCommandByKey(keymap.editor.insert, siyuanHotkey)
      }

      // 在 editor.heading 中查找
      if (!command && keymap.editor?.heading) {
        command = findCommandByKey(keymap.editor.heading, siyuanHotkey)
      }

      // 在 editor.list 中查找
      if (!command && keymap.editor?.list) {
        command = findCommandByKey(keymap.editor.list, siyuanHotkey)
      }

      // 在 editor.table 中查找
      if (!command && keymap.editor?.table) {
        command = findCommandByKey(keymap.editor.table, siyuanHotkey)
      }

      // 在 plugin 中查找
      if (!command && keymap.plugin) {
        command = findCommandByKey(keymap.plugin, siyuanHotkey)
      }
    }

    if (command) {
      console.log('找到命令:', command)

      // 获取 keymap 和该命令对应的快捷键，以及判断是否为编辑器命令
      let hotkeyToTrigger = ''
      let isEditorCommand = false
      if (windowObj.siyuan?.config?.keymap) {
        const keymap = windowObj.siyuan.config.keymap

        // 判断是否为编辑器命令
        isEditorCommand = !!(keymap.editor?.insert?.[command] ||
                             keymap.editor?.general?.[command] ||
                             keymap.editor?.heading?.[command] ||
                             keymap.editor?.list?.[command] ||
                             keymap.editor?.table?.[command])

        // 获取快捷键
        if (keymap.general && keymap.general[command]) {
          const item = keymap.general[command]
          hotkeyToTrigger = item.custom || item.default
        } else if (keymap.editor?.general && keymap.editor.general[command]) {
          const item = keymap.editor.general[command]
          hotkeyToTrigger = item.custom || item.default
        } else if (keymap.editor?.insert && keymap.editor.insert[command]) {
          const item = keymap.editor.insert[command]
          hotkeyToTrigger = item.custom || item.default
        } else if (keymap.editor?.heading && keymap.editor.heading[command]) {
          const item = keymap.editor.heading[command]
          hotkeyToTrigger = item.custom || item.default
        } else if (keymap.editor?.list && keymap.editor.list[command]) {
          const item = keymap.editor.list[command]
          hotkeyToTrigger = item.custom || item.default
        } else if (keymap.editor?.table && keymap.editor.table[command]) {
          const item = keymap.editor.table[command]
          hotkeyToTrigger = item.custom || item.default
        }
      }

      // 触发键盘事件
      if (hotkeyToTrigger) {
        const keyEvent = parseHotkeyToKeyEvent(hotkeyToTrigger)
        if (keyEvent) {
          // 移动端特殊处理：复制类命令直接使用 protyle 方法
          const isMobile = isMobileDevice()
          const copyCommands = ['copyBlockRef', 'copyBlockEmbed', 'copyText', 'copyHPath', 'copyProtocol', 'copyID', 'copyPlainText']

          if (isMobile && isEditorCommand && copyCommands.includes(command)) {
            const windowObj = window as any
            let protyle: any = null

            // 移动端：从 window.siyuan.mobile.editor.protyle 获取
            if (windowObj.siyuan?.mobile?.editor?.protyle) {
              protyle = windowObj.siyuan.mobile.editor.protyle
            }
            // 桌面端：从 layout 获取
            else if (windowObj.siyuan?.layout?.centerLayout?.children) {
              const protyleElement = getActiveProtyleElement()
              if (protyleElement) {
                const children = windowObj.siyuan.layout.centerLayout.children
                for (const child of children) {
                  if (child.children && child.children.length > 0) {
                    for (const tab of child.children) {
                      if (tab.panelElement) {
                        const p = tab.panelElement.querySelector('.protyle')
                        if (p && p === protyleElement && (p as any).protyle) {
                          protyle = (p as any).protyle
                          break
                        }
                      }
                    }
                  }
                }
              }
            }

            if (protyle && protyle[command]) {
              try {
                protyle[command]()
                showMessage(`复制成功`, 1500, 'info')
                return
              } catch (e) {
                console.error('protyle 方法执行失败:', e)
              }
            }

            // 备用方案：直接获取当前块 ID 并生成引用
            const protyleElement = getActiveProtyleElement()
            const blockId = getCurrentBlockId(protyleElement)
            if (blockId) {
              // 思源块引用格式: ((id)) 为动态引用，!((id)) 为嵌入块
              let ref = ''
              if (command === 'copyBlockEmbed') {
                ref = `!((${blockId}))`
              } else if (command === 'copyBlockRef') {
                ref = `((${blockId}))`
              } else {
                ref = `((${blockId}))`
              }

              copyToClipboard(ref).then(success => {
                if (success) {
                  showMessage(`已复制: ${ref}`, 1500, 'info')
                } else {
                  showMessage(`复制失败`, 3000, 'error')
                }
              })
              return
            }
          }

          if (isEditorCommand && savedSelection) {
            // 编辑器命令：需要恢复选区和焦点

            // 获取编辑器可编辑区域
            let editArea: HTMLElement | null = null
            if (lastActiveElement?.matches('[contenteditable="true"]')) {
              editArea = lastActiveElement
            } else {
              const protyleElement = getActiveProtyleElement()
              editArea = protyleElement?.querySelector('[contenteditable="true"]') as HTMLElement
            }

            if (editArea) {
              // 先聚焦到编辑器
              editArea.focus()

              // 延迟触发，确保聚焦完成
              setTimeout(() => {
                // 恢复选区到之前的位置
                restoreSelection(savedSelection)

                // 触发键盘事件
                const eventDown = new KeyboardEvent('keydown', keyEvent)
                editArea.dispatchEvent(eventDown)

                showMessage(`执行: ${config.shortcutKey}`, 1500, 'info')
              }, 50)
              return
            }
          }

          // 通用命令：在 window 上触发
          const eventDown = new KeyboardEvent('keydown', keyEvent)
          window.dispatchEvent(eventDown)

          console.log('已触发键盘事件:', hotkeyToTrigger, '目标: 全局')
          showMessage(`执行: ${config.shortcutKey}`, 1500, 'info')
          return
        }
      }

      showMessage(`无法执行命令: ${command}`, 3000, 'error')
    } else {
      // 未在 keymap 中找到命令，直接触发用户输入的快捷键
      console.log('未在 keymap 中找到，直接触发快捷键:', siyuanHotkey)

      const keyEvent = parseHotkeyToKeyEvent(siyuanHotkey)
      if (keyEvent) {
        try {
          const eventDown = new KeyboardEvent('keydown', keyEvent)
          window.dispatchEvent(eventDown)
          console.log('已触发键盘事件:', siyuanHotkey)
          showMessage(`执行: ${config.shortcutKey}`, 1500, 'info')
        } catch (e) {
          // 思源内部处理此快捷键时出错（可能不是有效快捷键）
          console.warn('思源处理此快捷键时出错:', e)
          showMessage(`快捷键可能无效: ${config.shortcutKey}`, 2000, 'warning')
        }
      } else {
        showMessage(`无法解析快捷键: ${config.shortcutKey}`, 3000, 'error')
      }
    }

  } catch (error) {
    console.error('执行快捷键失败:', error)
    showMessage(`执行快捷键失败: ${config.shortcutKey} - ${error}`, 3000, 'error')
  }
}