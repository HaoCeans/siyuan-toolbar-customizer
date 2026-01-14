/**
 * 工具栏管理器
 * 负责移动端工具栏调整和自定义按钮功能
 */

import { getFrontend, showMessage } from "siyuan";

// ===== 配置接口 =====
export interface MobileToolbarConfig {
  openInputOffset: string;    // 打开输入框时距离底部高度
  closeInputOffset: string;   // 关闭输入框时距离底部高度
  heightThreshold: number;    // 高度变化阈值百分比
}

export interface ButtonConfig {
  id: string;                 // 唯一标识
  name: string;              // 按钮名称
  type: 'builtin' | 'template'; // 功能类型
  builtinId?: string;        // 思源功能ID（如：menuSearch）
  template?: string;         // 模板内容
  icon: string;              // 图标（思源图标或Emoji）
  iconSize: number;          // 图标大小（px）
  marginRight: number;       // 右侧边距（px）
  sort: number;              // 排序（数字越小越靠左）
  platform: 'desktop' | 'mobile' | 'both'; // 显示平台
}

// ===== 默认配置 =====
export const DEFAULT_MOBILE_CONFIG: MobileToolbarConfig = {
  openInputOffset: '50px',
  closeInputOffset: '0px',
  heightThreshold: 70
}

export const DEFAULT_BUTTONS_CONFIG: ButtonConfig[] = [
  {
    id: 'search',
    name: '搜索',
    type: 'builtin',
    builtinId: 'menuSearch',
    icon: 'iconSearch',
    iconSize: 18,
    marginRight: 8,
    sort: 1,
    platform: 'both'
  },
  {
    id: 'recent',
    name: '最近文档',
    type: 'builtin',
    builtinId: 'menuRecent',
    icon: 'iconHistory',
    iconSize: 18,
    marginRight: 8,
    sort: 2,
    platform: 'both'
  },
  {
    id: 'template1',
    name: '插入待办',
    type: 'template',
    template: '- [ ] ',
    icon: 'iconCheck',
    iconSize: 18,
    marginRight: 8,
    sort: 3,
    platform: 'both'
  }
]

// ===== 工具函数 =====
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
  
  const setupToolbar = () => {
    // 找到面包屑元素
    const breadcrumb = document.querySelector('.protyle-breadcrumb__bar')
    if (!breadcrumb) {
      // 尝试其他可能的选择器
      const altBreadcrumb = document.querySelector('.protyle-breadcrumb')
      if (!altBreadcrumb) {
        console.warn('未找到工具栏元素')
        return false
      }
      setupToolbarForElement(altBreadcrumb)
      return true
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
        
        console.log(`移动端工具栏位置更新: ${inputMethodOpen ? '输入法打开' : '输入法关闭'}, 偏移量: ${inputMethodOpen ? config.openInputOffset : config.closeInputOffset}`)
      }
      
      // 更新记录的高度
      lastKnownHeight = currentHeight
    }

    // 初始调用一次
    updateToolbarPosition()
    
    // 设置初始属性
    toolbar.setAttribute('data-input-method', 'close')
    
    // 监听窗口大小变化
    window.addEventListener('resize', updateToolbarPosition)
    
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

    console.log('移动端工具栏调整已启用')
  }

  // 尝试设置工具栏
  if (!setupToolbar()) {
    // 如果没找到，延迟尝试
    setTimeout(() => {
      if (!setupToolbar()) {
        console.warn('无法找到工具栏元素，移动端调整功能未启用')
      }
    }, 2000)
  }
  
  // 监听DOM变化，确保工具栏加载后能应用样式
  const observer = new MutationObserver(() => {
    setupToolbar()
  })
  
  observer.observe(document.body, {
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
  
  // 监听编辑器加载事件
  document.addEventListener('click', (e) => {
    // 检查是否点击了编辑器区域
    const target = e.target as HTMLElement
    if (target.closest('.protyle')) {
      // 延迟执行，确保编辑器完全加载
      setTimeout(() => setupEditorButtons(configs), 100)
    }
  }, true)
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
    
    console.log(`编辑器按钮设置完成，添加了${buttonsToAdd.length}个按钮`)
  })
}

function createButtonElement(config: ButtonConfig): HTMLElement {
  const button = document.createElement('button')
  button.dataset.customButton = config.id
  button.className = 'block__icon fn__flex-center ariaLabel'
  button.setAttribute('aria-label', config.name)
  button.title = config.name
  button.style.cssText = `
    font-size: ${config.iconSize}px;
    margin-right: ${config.marginRight}px;
    line-height: 1;
    cursor: pointer;
    user-select: none;
    transition: all 0.2s ease;
    min-width: 32px;
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    padding: 4px;
    
    &:hover {
      background-color: var(--b3-theme-hover);
      transform: translateY(-1px);
    }
  `
  
  // 设置图标
  if (config.icon.startsWith('icon')) {
    // 思源图标
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', `${config.iconSize}`)
    svg.setAttribute('height', `${config.iconSize}`)
    svg.style.cssText = 'display: block;'
    
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
    use.setAttribute('href', `#${config.icon}`)
    svg.appendChild(use)
    
    button.appendChild(svg)
  } else {
    // Emoji或文本图标
    button.textContent = config.icon
    button.style.cssText += `
      font-size: ${config.iconSize}px;
      display: flex;
      align-items: center;
      justify-content: center;
    `
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
  console.log(`点击按钮: ${config.name}`)
  
  if (config.type === 'builtin') {
    // 执行思源内置功能
    executeBuiltinFunction(config)
  } else if (config.type === 'template') {
    // 插入模板
    insertTemplate(config)
  }
}

function executeBuiltinFunction(config: ButtonConfig) {
  if (!config.builtinId) {
    showMessage(`按钮"${config.name}"未配置功能ID`, 3000, 'error')
    return
  }
  
  // 查找对应的思源菜单项
  const menuItem = document.getElementById(config.builtinId)
  if (menuItem) {
    menuItem.click()
    console.log(`执行思源功能: ${config.builtinId}`)
  } else {
    showMessage(`未找到功能: ${config.builtinId}`, 3000, 'error')
    console.warn(`未找到菜单项: ${config.builtinId}`)
    
    // 尝试查找其他可能的位置
    const altMenuItem = document.querySelector(`[data-menu-id="${config.builtinId}"]`) as HTMLElement
    if (altMenuItem) {
      altMenuItem.click()
      console.log(`通过data-menu-id找到并执行: ${config.builtinId}`)
    }
  }
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
      
      showMessage(`已插入模板: ${config.name}`, 2000, 'info')
      console.log(`插入模板: ${config.template.substring(0, 20)}...`)
    } catch (error) {
      console.error('插入模板失败:', error)
      showMessage('插入模板失败，请确保编辑器处于可编辑状态', 3000, 'error')
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