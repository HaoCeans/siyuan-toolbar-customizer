/**
 * 标签切换器模块
 * 负责创建桌面端/手机端配置的标签切换功能
 */

// 保存注入的样式引用，用于清理和复用
let injectedStyle: HTMLStyleElement | null = null
// 递归调用计数器，防止无限循环
let tabSwitcherAttempts = 0
const MAX_TAB_SWITCHER_ATTEMPTS = 50  // 最多尝试 50 次（5秒）

/**
 * 清理标签切换器资源
 */
export function cleanupTabSwitcher(): void {
  tabSwitcherAttempts = 0
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
  setTimeout(() => {
    const dialogContent = document.querySelector('.b3-dialog__content')
    if (!dialogContent) return

    // 检查是否有设置项，如果没有则等待更长时间
    const configItems = dialogContent.querySelectorAll('.config__item')
    if (configItems.length === 0) {
      // 设置项还没创建，再等待一段时间（有最大重试次数限制）
      tabSwitcherAttempts++
      if (tabSwitcherAttempts < MAX_TAB_SWITCHER_ATTEMPTS) {
        setTimeout(() => injectTabSwitcher(), 100)
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
      .b3-dialog__content .config__item > .fn__flex-1 {
        display: none !important;
      }
      .b3-dialog__content .config__item > .fn__space {
        display: none !important;
      }
      .b3-dialog__content .config__item > .fn__flex-column {
        width: 100% !important;
        max-width: none !important;
      }
      /* 覆盖宽度限制类，让内容容器与父容器同宽 */
      .b3-dialog__content .config__item > .fn__size200,
      .b3-dialog__content .config__item > .fn__flex-center.fn__size200 {
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

    // 更新、Q群、激活码获取标签
    const versionTab = document.createElement('button')
    versionTab.className = 'b3-button'
    versionTab.dataset.tab = 'version'
    versionTab.textContent = '🔍 更新、Q群、激活码获取'
    versionTab.style.cssText = `
      flex: 1;
      padding: 8px 16px;
      font-size: 13px;
      border-radius: 4px;
    `

    const previewConfig = {
      width: '100%',                 // 宽度：'100%' / '300px' / '20rem' 等
      fontSize: '17px',
      textColor: '#000000ff',         // 文字颜色
      bgColor: '#a3bcf1ff',           // 默认背景色
      hoverBgColor: '#2563eb',        // 悬停背景色
      borderColor: '#2563eb'          // 边框颜色
    }

    // 预览链接（只在手机端选中时显示）
    const previewLink = document.createElement('a')
    previewLink.href = 'http://127.0.0.1:6806/stage/build/mobile/'
    previewLink.target = '_blank'
    previewLink.className = 'b3-button b3-button--outline'
    previewLink.innerHTML = '🔍 伺服浏览器：预览手机端'

    previewLink.style.cssText = `
      width: ${previewConfig.width};
      margin-bottom: 15px;
      padding: 10px;
      border-radius: 6px;
      font-size: ${previewConfig.fontSize};
      text-align: center;
      text-decoration: none;
      display: none;
      color: ${previewConfig.textColor};
      background: ${previewConfig.bgColor};
      border: 1px solid ${previewConfig.borderColor};
    `

    previewLink.onmouseenter = () => {
      previewLink.style.background = previewConfig.hoverBgColor
    }

    previewLink.onmouseleave = () => {
      previewLink.style.background = previewConfig.bgColor
    }

    // 预览链接的说明文字
    const previewHint = document.createElement('div')
    previewHint.style.cssText = `
      font-size: 15px;
      color: var(--b3-theme-on-surface-light);
      text-align: center;
      margin-top: 4px;
      display: none;
    `
    previewHint.textContent = '💡点击打开浏览器，可预览手机端效果，本处仅支持插入按钮。更多配置，请同步至手机端设置！'

    // 切换函数
    const switchTab = (type: 'desktop' | 'mobile' | 'version') => {
      // 更新按钮样式
      if (type === 'desktop') {
        desktopTab.classList.add('b3-button--primary')
        desktopTab.classList.remove('b3-button--outline')
        mobileTab.classList.remove('b3-button--primary')
        mobileTab.classList.add('b3-button--outline')
        versionTab.classList.remove('b3-button--primary')
        versionTab.classList.add('b3-button--outline')
        previewLink.style.display = 'none'
        previewHint.style.display = 'none'
      } else if (type === 'mobile') {
        mobileTab.classList.add('b3-button--primary')
        mobileTab.classList.remove('b3-button--outline')
        desktopTab.classList.remove('b3-button--primary')
        desktopTab.classList.add('b3-button--outline')
        versionTab.classList.remove('b3-button--primary')
        versionTab.classList.add('b3-button--outline')
        previewLink.style.display = 'block'
        previewHint.style.display = 'block'
      } else { // type === 'version'
        versionTab.classList.add('b3-button--primary')
        versionTab.classList.remove('b3-button--outline')
        desktopTab.classList.remove('b3-button--primary')
        desktopTab.classList.add('b3-button--outline')
        mobileTab.classList.remove('b3-button--primary')
        mobileTab.classList.add('b3-button--outline')
        previewLink.style.display = 'none'
        previewHint.style.display = 'none'
      }

      // 显示/隐藏对应的配置项
      // 遍历所有配置项，根据 toolbar-customizer-content 的 data-tabGroup 属性切换显示
      const allConfigItems = dialogContent.querySelectorAll('.config__item')
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

    tabsContainer.appendChild(desktopTab)
    tabsContainer.appendChild(mobileTab)
    tabsContainer.appendChild(versionTab)

    // 预览链接容器（插入到标签栏后面，会在第一个配置项前面显示）
    const previewContainer = document.createElement('div')
    previewContainer.className = 'toolbar-customizer-preview-container'
    previewContainer.dataset.tabGroup = 'mobile'
    previewContainer.style.cssText = 'margin-bottom: 12px;'
    previewContainer.appendChild(previewLink)
    previewContainer.appendChild(previewHint)

    // 插入到内容区域顶部
    dialogContent.insertBefore(tabsContainer, dialogContent.firstChild)
    dialogContent.insertBefore(previewContainer, tabsContainer.nextSibling)

    // 默认显示电脑端配置
    switchTab('desktop')
  }, 100)
}
