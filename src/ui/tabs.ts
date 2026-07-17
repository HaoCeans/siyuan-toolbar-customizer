/**
 * 标签切换器模块
 * 负责创建桌面端/手机端配置的标签切换功能
 */

// 保存注入的样式引用，用于清理和复用
let injectedStyle: HTMLStyleElement | null = null
// 递归调用计数器，防止无限循环
let tabSwitcherAttempts = 0
const MAX_TAB_SWITCHER_ATTEMPTS = 50  // 最多尝试 50 次（5秒）
// 跟踪待执行的定时器
let pendingTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 清理标签切换器资源
 */
export function cleanupTabSwitcher(): void {
  tabSwitcherAttempts = 0
  if (pendingTimer) {
    clearTimeout(pendingTimer)
    pendingTimer = null
  }
  if (injectedStyle && injectedStyle.parentNode) {
    injectedStyle.parentNode.removeChild(injectedStyle)
    injectedStyle = null
  }
}

/**
 * 注入标签切换器
 * 在设置对话框顶部创建电脑端/手机端配置的切换标签
 */
export function injectTabSwitcher(): void {
  // 等待对话框渲染完成，使用更长的延迟确保设置项都已创建
  pendingTimer = setTimeout(() => {
    pendingTimer = null
    const dialogContent = document.querySelector('.b3-dialog__content')
    if (!dialogContent) return

    // 检查是否有设置项，如果没有则等待更长时间
    const configItems = dialogContent.querySelectorAll('.config-item')
    if (configItems.length === 0) {
      // 设置项还没创建，再等待一段时间（有最大重试次数限制）
      tabSwitcherAttempts++
      if (tabSwitcherAttempts < MAX_TAB_SWITCHER_ATTEMPTS) {
        pendingTimer = setTimeout(() => { pendingTimer = null; injectTabSwitcher() }, 100)
      }
      return
    }

    // 重置计数器
    tabSwitcherAttempts = 0

    // 移除预加载的隐藏样式（如果存在）
    const preloadStyle = document.getElementById('toolbar-customizer-preload-hide')
    if (preloadStyle && preloadStyle.parentNode) {
      preloadStyle.parentNode.removeChild(preloadStyle)
    }

    // 隐藏配置项的标题部分（左边的 .fn__flex-1），因为我们用标签切换器了
    // 先清理已存在的样式，避免累积
    if (injectedStyle && injectedStyle.parentNode) {
      injectedStyle.parentNode.removeChild(injectedStyle)
    }

    const style = document.createElement('style')
    injectedStyle = style  // 保存引用
    style.textContent = `
      /* 隐藏标题和间距，让它们不占空间 */
      .b3-dialog__content .config-item > .fn__flex-1 {
        display: none !important;
      }
      .b3-dialog__content .config-item > .fn__space {
        display: none !important;
      }
      .b3-dialog__content .config-item > .fn__flex-column {
        width: 100% !important;
        max-width: none !important;
      }
      /* 覆盖宽度限制类，让内容容器与父容器同宽 */
      .b3-dialog__content .config-item > .fn__size200,
      .b3-dialog__content .config-item > .fn__flex-center.fn__size200 {
        width: 100% !important;
        max-width: none !important;
        min-width: auto !important;
      }
      /* 确保自定义按钮内容区域全宽 */
      .b3-dialog__content .toolbar-customizer-content {
        width: 100% !important;
        max-width: none !important;
      }
    `
    document.head.appendChild(style)

    // 创建标签栏容器 - 使用思源的分段控制器样式
    const tabsContainer = document.createElement('div')
    tabsContainer.className = 'fn__flex'
    tabsContainer.style.cssText = `
      padding: 8px 16px 16px 16px;
      gap: 8px;
    `

    // 电脑端标签
    const desktopTab = document.createElement('button')
    desktopTab.className = 'b3-button'
    desktopTab.dataset.tab = 'desktop'
    desktopTab.textContent = '🖥️ 电脑配置'
    desktopTab.style.cssText = `
      flex: 1;
      padding: 8px 16px;
      font-size: 13px;
      border-radius: 4px;
    `

    // 手机端标签
    const mobileTab = document.createElement('button')
    mobileTab.className = 'b3-button'
    mobileTab.dataset.tab = 'mobile'
    mobileTab.textContent = '📱 手机配置'
    mobileTab.style.cssText = `
      flex: 1;
      padding: 8px 16px;
      font-size: 13px;
      border-radius: 4px;
    `

    // 数据迁移标签
    const versionTab = document.createElement('button')
    versionTab.className = 'b3-button'
    versionTab.dataset.tab = 'version'
    versionTab.textContent = '📋 数据迁移'
    versionTab.style.cssText = `
      flex: 1;
      padding: 8px 16px;
      font-size: 13px;
      border-radius: 4px;
    `

    // 激活与权益标签
    const activationTab = document.createElement('button')
    activationTab.className = 'b3-button'
    activationTab.dataset.tab = 'activation'
    activationTab.textContent = '🔐 激活与权益'
    activationTab.style.cssText = `
      flex: 1;
      padding: 8px 16px;
      font-size: 13px;
      border-radius: 4px;
    `

    // 切换函数
    const switchTab = (type: 'desktop' | 'mobile' | 'version' | 'activation') => {
      // 更新按钮样式 - 先全部重置为outline
      const allTabs = [desktopTab, mobileTab, versionTab, activationTab]
      allTabs.forEach(tab => {
        tab.classList.remove('b3-button--primary')
        tab.classList.add('b3-button--outline')
      })
      // 高亮当前选中的tab
      const activeMap: Record<string, HTMLElement> = {
        desktop: desktopTab,
        mobile: mobileTab,
        version: versionTab,
        activation: activationTab,
      }
      const activeEl = activeMap[type]
      if (activeEl) {
        activeEl.classList.add('b3-button--primary')
        activeEl.classList.remove('b3-button--outline')
      }

      // 显示/隐藏对应的配置项
      // 遍历所有配置项，根据 toolbar-customizer-content 的 data-tabGroup 属性切换显示
      const allConfigItems = dialogContent.querySelectorAll('.config-item')
      allConfigItems.forEach(configItem => {
        const contentEl = configItem.querySelector('.toolbar-customizer-content')
        if (contentEl) {
          const tabGroup = (contentEl as HTMLElement).dataset.tabGroup
          if (tabGroup === type) {
            ;(configItem as HTMLElement).style.display = ''
          } else if (tabGroup) {
            ;(configItem as HTMLElement).style.display = 'none'
          }
        }
      })
    }

	    desktopTab.onclick = () => switchTab('desktop')
	    mobileTab.onclick = () => switchTab('mobile')
	    versionTab.onclick = () => switchTab('version')
	    activationTab.onclick = () => switchTab('activation')

	    tabsContainer.appendChild(desktopTab)
	    tabsContainer.appendChild(mobileTab)
	    tabsContainer.appendChild(versionTab)
	    tabsContainer.appendChild(activationTab)

	    // 插入到内容区域顶部
	    dialogContent.insertBefore(tabsContainer, dialogContent.firstChild)

    // 默认显示电脑端配置
    switchTab('desktop')
  }, 100)
}
