/**
 * 工具栏管理器
 * 负责移动端工具栏调整和自定义按钮功能
 */

import { Dialog, fetchSyncPost, getFrontend, showMessage } from "siyuan";

// ===== 配置接口 =====
export interface MobileToolbarConfig {
  // 底部工具栏配置
  enableBottomToolbar: boolean; // 是否将工具栏置底
  openInputOffset: string;    // 打开输入框时距离底部高度
  closeInputOffset: string;   // 关闭输入框时距离底部高度
  heightThreshold: number;    // 高度变化阈值百分比

  // 共享样式配置（顶部和底部工具栏都使用）
  toolbarBackgroundColor: string; // 工具栏背景颜色（明亮模式）
  toolbarBackgroundColorDark: string; // 工具栏背景颜色（黑暗模式）
  toolbarOpacity: number;     // 工具栏透明度 (0-1)
  toolbarHeight: string;      // 工具栏高度
  toolbarZIndex: number;      // 工具栏层级
  useThemeColor: boolean;     // 是否使用主题颜色

  // 顶部工具栏专用配置
  enableTopToolbar: boolean;  // 是否启用顶部工具栏（固定定位模式）
  topToolbarOffset: string;   // 顶部工具栏距离顶部的距离（如 "50px"）
  topToolbarPaddingLeft: string; // 顶部工具栏左边距
}

export interface ButtonConfig {
  id: string;                 // 唯一标识
  name: string;              // 按钮名称
  type: 'builtin' | 'template' | 'click-sequence' | 'shortcut' | 'author-tool'; // 功能类型
  builtinId?: string;        // 思源功能ID（如：menuSearch）
  template?: string;         // 模板内容
  clickSequence?: string[];  // 模拟点击选择器序列
  shortcutKey?: string;      // 快捷键组合
  targetDocId?: string;      // 作者自用工具：目标文档ID
  authorScript?: string;     // 作者自用工具：自定义脚本
  // 作者自用工具 - 数据库查询配置
  authorToolSubtype?: 'script' | 'database' | 'diary-bottom'; // 作者工具子类型：script=自定义脚本, database=数据库查询, diary-bottom=日记底部
  dbBlockId?: string;        // 数据库块ID
  dbId?: string;             // 数据库ID（属性视图ID）
  viewName?: string;         // 视图名称
  primaryKeyColumn?: string; // 主键列名称（用于点击跳转）
  startTimeStr?: string;     // 起始时间：'now' 或 'HH:MM' 格式
  extraMinutes?: number;     // 行间额外分钟数（第一行不加）
  maxRows?: number;          // 最大显示行数
  dbDisplayMode?: 'cards' | 'table'; // 显示模式：cards=卡片, table=表格
  showColumns?: string[];    // 要显示的列名数组
  timeRangeColumnName?: string; // 时间段列的名称
  icon: string;              // 图标（思源图标或Emoji）
  iconSize: number;          // 图标大小（px）
  minWidth: number;          // 按钮最小宽度（px）
  marginRight: number;       // 右侧边距（px）
  sort: number;              // 排序（数字越小越靠左）
  platform: 'desktop' | 'mobile' | 'both'; // 显示平台
  showNotification: boolean; // 是否显示右上角提示
  enabled?: boolean;         // 是否启用（默认true）
  layers?: number;           // 扩展工具栏层数（1-5），仅扩展工具栏按钮使用
  overflowLevel?: number;    // 溢出层级（0=底部工具栏可见，1-N=第几层扩展工具栏）
}

// 全局按钮配置（用于批量设置所有按钮的默认值）
export interface GlobalButtonConfig {
  iconSize: number;          // 图标大小（px）
  minWidth: number;          // 按钮最小宽度（px）
  marginRight: number;       // 右侧边距（px）
  showNotification: boolean; // 是否显示右上角提示
}

export const DEFAULT_GLOBAL_BUTTON_CONFIG: GlobalButtonConfig = {
  iconSize: 16,
  minWidth: 32,
  marginRight: 8,
  showNotification: true
}

// ===== 默认配置 =====
export const DEFAULT_MOBILE_CONFIG: MobileToolbarConfig = {
  // 底部工具栏配置
  enableBottomToolbar: true,
  openInputOffset: '50px',
  closeInputOffset: '0px',
  heightThreshold: 70,

  // 共享样式配置
  toolbarBackgroundColor: '#f8f9fa',
  toolbarBackgroundColorDark: '#1a1a1a',
  toolbarOpacity: 1.0,        // 100% 透明度
  toolbarHeight: '40px',      // 工具栏高度
  toolbarZIndex: 512,
  useThemeColor: true,        // 颜色跟随主题

  // 顶部工具栏配置
  enableTopToolbar: false,    // 默认不启用（与底部工具栏互斥）
  topToolbarOffset: '50px',   // 距离顶部 50px
  topToolbarPaddingLeft: '0px', // 顶部工具栏左边距（居中显示）
}

export const DEFAULT_BUTTONS_CONFIG: ButtonConfig[] = []

// 桌面端默认按钮（7个）
export const DEFAULT_DESKTOP_BUTTONS: ButtonConfig[] = [
  {
    id: 'more-desktop',
    name: '更多',
    type: 'click-sequence',
    clickSequence: ['more'],
    icon: '✨',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 1,
    platform: 'desktop',
    showNotification: false
  },
  {
    id: 'doc-desktop',
    name: '打开菜单',
    type: 'click-sequence',
    clickSequence: ['doc'],
    icon: '🧩',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 2,
    platform: 'desktop',
    showNotification: false
  },
  {
    id: 'readonly-desktop',
    name: '锁住文档',
    type: 'click-sequence',
    clickSequence: ['readonly'],
    icon: '🔒',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 3,
    platform: 'desktop',
    showNotification: false
  },
  {
    id: 'plugin-settings-desktop',
    name: '插件设置',
    type: 'click-sequence',
    clickSequence: ['barPlugins', 'text:工具栏定制器'],
    icon: '⚙️',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 4,
    platform: 'desktop',
    showNotification: true
  },
  {
    id: 'open-diary-desktop',
    name: '打开日记',
    type: 'shortcut',
    shortcutKey: 'Alt+5',
    icon: '🗓️',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 5,
    platform: 'desktop',
    showNotification: true
  },
  {
    id: 'template-time-desktop',
    name: '插入时间',
    type: 'template',
    template: '{{hour}}时{{minute}}分',
    icon: '⏰',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 6,
    platform: 'desktop',
    showNotification: true
  },
  {
    id: 'open-browser-desktop',
    name: '伺服浏览器',
    type: 'click-sequence',
    clickSequence: ['barWorkspace', 'config', 'text:关于', 'text:打开浏览器'],
    icon: '🔗',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 7,
    platform: 'desktop',
    showNotification: true
  }
]

// 移动端默认按钮（8个，包含扩展工具栏按钮）
export const DEFAULT_MOBILE_BUTTONS: ButtonConfig[] = [
  {
    id: 'overflow-button-mobile',
    name: '扩展工具栏',
    type: 'builtin',
    builtinId: 'overflow',
    icon: '⋯',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 0,
    platform: 'mobile',
    showNotification: false,
    layers: 1
  },
  {
    id: 'more-mobile',
    name: '更多',
    type: 'builtin',
    builtinId: 'more',
    icon: '✨',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 1,
    platform: 'mobile',
    showNotification: true
  },
  {
    id: 'doc-mobile',
    name: '打开菜单',
    type: 'builtin',
    builtinId: 'doc',
    icon: '🧩',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 2,
    platform: 'mobile',
    showNotification: true
  },
  {
    id: 'readonly-mobile',
    name: '锁住文档',
    type: 'builtin',
    builtinId: 'readonly',
    icon: '🔒',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 3,
    platform: 'mobile',
    showNotification: true
  },
  {
    id: 'plugin-settings-mobile',
    name: '插件设置',
    type: 'click-sequence',
    clickSequence: ['toolbarMore', 'menuPlugin', 'text:工具栏定制器'],
    icon: '⚙️',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 4,
    platform: 'mobile',
    showNotification: true
  },
  {
    id: 'open-diary-mobile',
    name: '打开日记',
    type: 'shortcut',
    shortcutKey: 'Alt+5',
    icon: '🗓️',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 5,
    platform: 'mobile',
    showNotification: true
  },
  {
    id: 'template-time-mobile',
    name: '插入时间',
    type: 'template',
    template: '{{hour}}时{{minute}}分',
    icon: '⏰',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 6,
    platform: 'mobile',
    showNotification: true
  },
  {
    id: 'search-mobile',
    name: '搜索',
    type: 'builtin',
    builtinId: 'menuSearch',
    icon: '🔎',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 7,
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
let focusEventHandlers: Array<{ element: HTMLElement; focusHandler: () => void; blurHandler: () => void }> = []  // 跟踪焦点事件监听器以便清理

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
function clearAllTimers() {
  activeTimers.forEach(timerId => clearTimeout(timerId))
  activeTimers.clear()
}

/**
 * 获取底部工具栏的宽度
 * 动态检测，适配不同手机屏幕
 * @returns 工具栏宽度（px），找不到时返回 0
 */
export function getBottomToolbarWidth(): number {
  // 优先查找 .protyle-breadcrumb（移动端使用）
  let breadcrumb = document.querySelector('.protyle-breadcrumb:not(.protyle-breadcrumb__bar)') as HTMLElement

  // 如果没找到，尝试查找 .protyle-breadcrumb__bar（桌面端使用）
  if (!breadcrumb) {
    breadcrumb = document.querySelector('.protyle-breadcrumb__bar') as HTMLElement
  }

  if (!breadcrumb) {
    return 0
  }

  // 获取工具栏的实际宽度
  const rect = breadcrumb.getBoundingClientRect()
  return rect.width
}

/**
 * 获取底部工具栏内可用宽度（排除内边距和固定元素）
 * @returns 可用宽度（px）
 */
export function getToolbarAvailableWidth(): number {
  const breadcrumb = document.querySelector('.protyle-breadcrumb:not(.protyle-breadcrumb__bar)') as HTMLElement ||
                     document.querySelector('.protyle-breadcrumb__bar') as HTMLElement

  if (!breadcrumb) {
    return 0
  }

  const computedStyle = window.getComputedStyle(breadcrumb)
  const rect = breadcrumb.getBoundingClientRect()

  // 减去左右内边距
  const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0
  const paddingRight = parseFloat(computedStyle.paddingRight) || 0

  return rect.width - paddingLeft - paddingRight
}

/**
 * 计算按钮的占用宽度（包括图标、边距）
 * @param button 按钮配置
 * @returns 占用宽度（px）
 */
function getButtonWidth(button: ButtonConfig): number {
  // 主工具栏按钮的宽度计算（与 createButtonElement 的样式保持一致）
  // CSS: min-width + padding(0 8px = 16px) + margin-right
  const paddingX = 16 // padding: 0 8px (左右各 8px)
  const buttonWidth = button.minWidth + paddingX
  const totalWidth = buttonWidth + button.marginRight
  return totalWidth
}

/**
 * 重新计算所有按钮的溢出层级
 * 根据底部工具栏宽度，将按钮分配到可见区域或扩展工具栏
 * @param buttons 所有按钮配置
 * @param overflowToolbarLayers 扩展工具栏层数
 * @returns 更新后的按钮配置
 */
export function calculateButtonOverflow(buttons: ButtonConfig[], overflowToolbarLayers: number = 1): ButtonConfig[] {
  // 过滤出启用的移动端按钮，按排序值排序（从左到右）
  const enabledButtons = buttons.filter(btn =>
    btn.enabled !== false &&
    (btn.platform === 'mobile' || btn.platform === 'both') &&
    btn.id !== 'overflow-button-mobile'
  ).sort((a, b) => a.sort - b.sort)

  // 获取扩展工具栏按钮（⋯）
  const overflowButton = buttons.find(btn => btn.id === 'overflow-button-mobile')

  // 获取可用宽度
  let availableWidth = getToolbarAvailableWidth()

  // 如果扩展工具栏按钮已启用，需要减去它占用的宽度
  if (overflowButton && overflowButton.enabled !== false) {
    const overflowButtonWidth = getButtonWidth(overflowButton)
    availableWidth -= overflowButtonWidth
  }

  if (availableWidth <= 0) {
    return buttons.map(btn => ({ ...btn, overflowLevel: 0 }))
  }

  // 计算每个按钮的宽度
  const buttonWidths = enabledButtons.map(btn => ({
    button: btn,
    width: getButtonWidth(btn)
  }))

  // 创建按钮ID到溢出层级的映射
  const overflowMap = new Map<string, number>()

  // 按层级分配按钮
  // 0层=底部工具栏可见，1-N层=扩展工具栏
  // 策略：从左往右填，当前层满了移到下一层
  // buttonWidths 已按 sort 升序：sort0(右) → sort1 → sort2 → ... → sortN(左)

  const maxLayers = overflowToolbarLayers || 1

  // 逐个按钮计算层号：从左往右填
  let currentWidth = 0
  let currentLayer = 0

  for (const { button, width } of buttonWidths) {
    // 检查当前层是否已满
    if (currentWidth + width > availableWidth) {
      currentLayer++
      currentWidth = 0
      // 超过最大层数就放在最后一层
      if (currentLayer > maxLayers) {
        currentLayer = maxLayers
      }
    }

    overflowMap.set(button.id, currentLayer)
    currentWidth += width
    console.log(`  [分配] ${button.name} (sort=${button.sort}, 宽度=${width}) → 第${currentLayer}层`)
  }

  // 更新所有按钮的 overflowLevel
  const result = buttons.map(btn => {
    if (btn.id === 'overflow-button-mobile') {
      return { ...btn, overflowLevel: 0 }
    }

    const newLevel = overflowMap.get(btn.id)
    if (newLevel !== undefined) {
      return { ...btn, overflowLevel: newLevel }
    }
    return { ...btn, overflowLevel: btn.overflowLevel ?? 0 }
  })

  // 输出层级分配结果
  console.log('[溢出检测] 层级分配结果:')
  enabledButtons.forEach(btn => {
    const layer = overflowMap.get(btn.id) ?? 0
    console.log(`  - ${btn.name}: 第${layer}层${layer === 0 ? '(可见)' : '(扩展工具栏)'}`)
  })

  return result
}

// ===== 移动端工具栏调整 =====

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

  // 检查平台
  if (button.platform === 'both') return true
  if (button.platform === 'mobile' && isMobile) return true
  if (button.platform === 'desktop' && !isMobile) return true

  return false
}

/**
 * 检查按钮是否应该显示在主工具栏（而非扩展工具栏）
 */
function shouldShowInMainToolbar(button: ButtonConfig): boolean {
  // 扩展工具栏按钮永远显示
  if (button.id === 'overflow-button-mobile') return true

  // 检查 overflowLevel：0 表示在主工具栏可见，>0 表示在扩展工具栏
  const overflowLevel = button.overflowLevel ?? 0
  return overflowLevel === 0
}

/**
 * 应用工具栏背景颜色（顶部和底部工具栏通用）
 */
function applyToolbarBackgroundColor(config: MobileToolbarConfig) {
  const backgroundColorStyleId = 'mobile-toolbar-background-color-style'
  let backgroundColorStyle = document.getElementById(backgroundColorStyleId) as HTMLStyleElement

  if (!backgroundColorStyle) {
    backgroundColorStyle = document.createElement('style')
    backgroundColorStyle.id = backgroundColorStyleId
    document.head.appendChild(backgroundColorStyle)
  }

  // 根据配置应用背景颜色
  if (config.useThemeColor) {
    // 使用主题颜色时，只调整透明度，使用CSS变量
    backgroundColorStyle.textContent = `
      /* 顶部工具栏 - 使用主题颜色 */
      body.siyuan-toolbar-top-mode .protyle-breadcrumb:not([data-toolbar-customized]),
      body.siyuan-toolbar-top-mode .protyle-breadcrumb__bar:not([data-toolbar-customized]) {
        background-color: var(--b3-theme-surface) !important;
        opacity: ${config.toolbarOpacity} !important;
      }

      /* 底部工具栏 - 使用主题颜色 */
      .protyle-breadcrumb__bar[data-input-method],
      .protyle-breadcrumb[data-input-method] {
        background-color: var(--b3-theme-surface) !important;
        opacity: ${config.toolbarOpacity} !important;
      }
    `
  } else {
    // 使用自定义颜色
    backgroundColorStyle.textContent = `
      /* 明亮模式 */
      html:not([data-theme-mode="dark"]) {
        /* 顶部工具栏 - 自定义颜色 */
        body.siyuan-toolbar-top-mode .protyle-breadcrumb:not([data-toolbar-customized]),
        body.siyuan-toolbar-top-mode .protyle-breadcrumb__bar:not([data-toolbar-customized]) {
          background-color: ${config.toolbarBackgroundColor} !important;
          opacity: ${config.toolbarOpacity} !important;
        }

        /* 底部工具栏 - 自定义颜色 */
        .protyle-breadcrumb__bar[data-input-method],
        .protyle-breadcrumb[data-input-method] {
          background-color: ${config.toolbarBackgroundColor} !important;
          opacity: ${config.toolbarOpacity} !important;
        }
      }

      /* 黑暗模式 */
      html[data-theme-mode="dark"] {
        /* 顶部工具栏 - 自定义颜色（黑暗模式） */
        body.siyuan-toolbar-top-mode .protyle-breadcrumb:not([data-toolbar-customized]),
        body.siyuan-toolbar-top-mode .protyle-breadcrumb__bar:not([data-toolbar-customized]) {
          background-color: ${config.toolbarBackgroundColorDark} !important;
          opacity: ${config.toolbarOpacity} !important;
        }

        /* 底部工具栏 - 自定义颜色（黑暗模式） */
        .protyle-breadcrumb__bar[data-input-method],
        .protyle-breadcrumb[data-input-method] {
          background-color: ${config.toolbarBackgroundColorDark} !important;
          opacity: ${config.toolbarOpacity} !important;
        }
      }
    `
  }
}

// ===== 移动端工具栏调整 =====
export function initMobileToolbarAdjuster(config: MobileToolbarConfig) {
  // 仅在移动端初始化
  if (!isMobileDevice()) return

  // 保存配置到全局变量，供扩展工具栏使用
  (window as any).__mobileToolbarConfig = config

  // 判断工具栏模式
  if (config.enableBottomToolbar) {
    // === 底部工具栏模式 ===
    // 移除顶部模式标记，添加底部模式标记
    document.body.classList.add('siyuan-toolbar-customizer-enabled')
    document.body.classList.remove('siyuan-toolbar-top-mode')

    // 移除顶部工具栏样式
    const topToolbarStyleToRemove = document.getElementById('top-toolbar-custom-style')
    if (topToolbarStyleToRemove) {
      topToolbarStyleToRemove.remove()
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
        const focusHandler = () => {
          safeSetTimeout(updateToolbarPosition, 300)
        }
        const blurHandler = () => {
          safeSetTimeout(updateToolbarPosition, 300)
        }
        input.addEventListener('focus', focusHandler)
        input.addEventListener('blur', blurHandler)
        // 保存引用以便清理
        focusEventHandlers.push({ element: input as HTMLElement, focusHandler, blurHandler })
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
        /* 移动端工具栏样式 - iOS z-index 修复版 */
        @media (max-width: 768px) {
          .protyle-breadcrumb__bar[data-input-method],
          .protyle-breadcrumb[data-input-method] {
            position: fixed !important;
            bottom: calc(var(--mobile-toolbar-offset, 0px) + env(safe-area-inset-bottom)) !important;
            top: auto !important;
            left: 0 !important;
            right: 0 !important;
            z-index: ${config.toolbarZIndex} !important;
            border-top: 1px solid var(--b3-border-color) !important;
            padding: 8px 12px !important;
            padding-bottom: max(8px, env(safe-area-inset-bottom)) !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1) !important;
            transition: bottom 0.3s ease !important;
            backdrop-filter: blur(10px);
            height: ${config.toolbarHeight} !important;
            min-height: ${config.toolbarHeight} !important;
            /* iOS z-index 修复 - 启用硬件加速提升层级 */
            -webkit-transform: translateZ(0);
            transform: translateZ(0);
            -webkit-backface-visibility: hidden;
            backface-visibility: hidden;
            will-change: transform;
          }

          .protyle-breadcrumb__bar[data-input-method="open"],
          .protyle-breadcrumb[data-input-method="open"] {
            bottom: calc(var(--mobile-toolbar-offset, 50px) + env(safe-area-inset-bottom)) !important;
          }

          .protyle-breadcrumb__bar[data-input-method="close"],
          .protyle-breadcrumb[data-input-method="close"] {
            bottom: calc(var(--mobile-toolbar-offset, 0px) + env(safe-area-inset-bottom)) !important;
          }

          /* 防止编辑器内容被遮挡 - 仅在启用底部工具栏且工具栏显示时应用 */
          body.siyuan-toolbar-customizer-enabled .protyle {
            padding-bottom: calc(${config.toolbarHeight} + env(safe-area-inset-bottom) + 10px) !important;
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

    // 应用背景颜色
    applyToolbarBackgroundColor(config)

    // 防抖变量
    let observerTimer: number | null = null

    // 添加页面变化检测函数
    function updateToolbarVisibility() {
      const toolbars = document.querySelectorAll('[data-toolbar-customized="true"][data-input-method]') as NodeListOf<HTMLElement>
      // 只添加自定义属性，不改变原生逻辑
    }

    // 合并的 MutationObserver 回调（添加防抖）
    const handleMutation = () => {
      if (observerTimer !== null) {
        clearTimeout(observerTimer)
      }
      observerTimer = safeSetTimeout(() => {
        setupToolbar()
        updateToolbarVisibility()
        observerTimer = null
      }, 100)
    }

    // 监听DOM变化
    const toolbarContainer = document.querySelector('.layout__center') ||
                            document.querySelector('.fn__flex-1.fn__flex-column') ||
                            document.body
    mutationObserver = new MutationObserver(handleMutation)
    mutationObserver.observe(toolbarContainer, {
      childList: true,
      subtree: true
    })

    // 页面加载完成后检查一次
    updateToolbarVisibility()

    return
  }

  // === 顶部工具栏模式 ===
  if (config.enableTopToolbar) {
    // 移除底部模式标记，添加顶部模式标记
    document.body.classList.remove('siyuan-toolbar-customizer-enabled')
    document.body.classList.add('siyuan-toolbar-top-mode')

    // 移除底部工具栏相关样式
    const existingStyle = document.getElementById('mobile-toolbar-custom-style')
    if (existingStyle) {
      existingStyle.remove()
    }

    // 移除工具栏的自定义属性
    const toolbars = document.querySelectorAll('[data-toolbar-customized="true"], .protyle-breadcrumb__bar[data-input-method], .protyle-breadcrumb[data-input-method]') as NodeListOf<HTMLElement>
    toolbars.forEach(toolbar => {
      toolbar.removeAttribute('data-toolbar-customized')
      toolbar.removeAttribute('data-input-method')
      toolbar.style.position = ''
      toolbar.style.bottom = ''
      toolbar.style.top = ''
      toolbar.style.left = ''
      toolbar.style.right = ''
      toolbar.style.zIndex = ''
      toolbar.style.backgroundColor = ''
      toolbar.style.paddingBottom = ''
    })

    // 重置 protyle 的底部内边距
    const protyles = document.querySelectorAll('.protyle') as NodeListOf<HTMLElement>
    protyles.forEach(protyle => {
      protyle.style.setProperty('padding-bottom', '0', 'important')
    })

    // ===== 应用顶部工具栏样式 =====
    let topToolbarStyle = document.getElementById('top-toolbar-custom-style')
    if (!topToolbarStyle) {
      topToolbarStyle = document.createElement('style')
      topToolbarStyle.id = 'top-toolbar-custom-style'
      document.head.appendChild(topToolbarStyle)
    }

    // 计算顶部偏移量（工具栏位置 + 工具栏高度 + 额外间距）
    const topOffsetValue = parseInt(config.topToolbarOffset) || 50
    const toolbarHeightValue = parseInt(config.toolbarHeight) || 52
    const paddingTopValue = topOffsetValue + toolbarHeightValue + 10

    topToolbarStyle.textContent = `
      /* 顶部工具栏样式 - 固定定位，脱离文档流，避免按钮重插导致的位置跳动 */
      @media (max-width: 768px) {
        body.siyuan-toolbar-top-mode .protyle-breadcrumb:not([data-toolbar-customized]) {
          position: fixed !important;
          top: ${config.topToolbarOffset} !important;
          bottom: auto !important;
          left: 0 !important;
          right: 0 !important;
          z-index: ${config.toolbarZIndex} !important;
          padding: 8px 12px !important;
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
          border-bottom: 1px solid var(--b3-border-color) !important;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1) !important;
          transition: top 0.3s ease !important;
          backdrop-filter: blur(10px);
          height: ${config.toolbarHeight} !important;
          min-height: ${config.toolbarHeight} !important;
          /* 硬件加速，提升层级稳定性 */
          -webkit-transform: translateZ(0);
          transform: translateZ(0);
          -webkit-backface-visibility: hidden;
          backface-visibility: hidden;
          will-change: transform;
        }

        /* 隐藏空白间距 */
        body.siyuan-toolbar-top-mode .protyle-breadcrumb:not([data-toolbar-customized]) > .protyle-breadcrumb__space {
          display: none !important;
        }

        /* 隐藏原生按钮 */
        body.siyuan-toolbar-top-mode .protyle-breadcrumb:not([data-toolbar-customized]) > .protyle-breadcrumb__icon[data-type="mobile-menu"],
        body.siyuan-toolbar-top-mode .protyle-breadcrumb:not([data-toolbar-customized]) > .protyle-breadcrumb__icon[data-type="exit-focus"] {
          display: none !important;
        }

        /* 最左边的按钮左边距为0 */
        body.siyuan-toolbar-top-mode .protyle-breadcrumb:not([data-toolbar-customized]) > .first-custom-button {
          margin-left: 0 !important;
        }

        /* 防止编辑器内容被顶部工具栏遮挡 */
        body.siyuan-toolbar-top-mode .protyle {
          padding-top: ${paddingTopValue}px !important;
        }

        /* 使用思源原生的隐藏类 */
        body.siyuan-toolbar-top-mode .protyle-breadcrumb:not([data-toolbar-customized]).fn__none {
          display: none !important;
        }
      }

      /* 桌面端样式 */
      @media (min-width: 769px) {
        body.siyuan-toolbar-top-mode .protyle-breadcrumb__bar:not([data-toolbar-customized]) {
          position: fixed !important;
          top: ${config.topToolbarOffset} !important;
          bottom: auto !important;
          left: 0 !important;
          right: 0 !important;
          z-index: ${config.toolbarZIndex} !important;
          padding: 8px 12px !important;
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
          border-bottom: 1px solid var(--b3-border-color) !important;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1) !important;
          height: ${config.toolbarHeight} !important;
          min-height: ${config.toolbarHeight} !important;
          /* 硬件加速 */
          -webkit-transform: translateZ(0);
          transform: translateZ(0);
          -webkit-backface-visibility: hidden;
          backface-visibility: hidden;
          will-change: transform;
        }

        /* 隐藏空白间距（桌面端） */
        body.siyuan-toolbar-top-mode .protyle-breadcrumb__bar:not([data-toolbar-customized]) > .protyle-breadcrumb__space {
          display: none !important;
        }

        /* 隐藏原生按钮（桌面端） */
        body.siyuan-toolbar-top-mode .protyle-breadcrumb__bar:not([data-toolbar-customized]) > .protyle-breadcrumb__icon[data-type="mobile-menu"],
        body.siyuan-toolbar-top-mode .protyle-breadcrumb__bar:not([data-toolbar-customized]) > .protyle-breadcrumb__icon[data-type="exit-focus"] {
          display: none !important;
        }

        /* 最左边的按钮左边距为0（桌面端） */
        body.siyuan-toolbar-top-mode .protyle-breadcrumb__bar:not([data-toolbar-customized]) > .first-custom-button {
          margin-left: 0 !important;
        }

        /* 防止编辑器内容被顶部工具栏遮挡（桌面端） */
        body.siyuan-toolbar-top-mode .protyle {
          padding-top: ${paddingTopValue}px !important;
        }
      }
    `

    // ===== 应用顶部工具栏背景颜色 =====
    applyToolbarBackgroundColor(config)
  }
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
    const target = e.target as HTMLElement

    // 如果点击的是自定义按钮本身，不触发重新插入（避免按钮被重新插入导致位置变化）
    if (target.closest('[data-custom-button]')) {
      return
    }

    // 如果点击的是扩展工具栏弹出层，不触发重新插入
    if (target.closest('.overflow-toolbar-layer')) {
      return
    }

    // 检查是否点击了编辑器区域
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
  // 保存按钮配置到全局变量，供扩展工具栏使用
  (window as any).__mobileButtonConfigs = configs

  // 找到扩展工具栏按钮，获取层数配置
  const overflowBtn = configs.find(btn => btn.id === 'overflow-button-mobile')
  const overflowLayers = (overflowBtn && overflowBtn.enabled !== false) ? (overflowBtn.layers || 1) : 0

  // 使用 requestAnimationFrame 确保工具栏已经渲染完成后再计算溢出
  const calculateOverflowWithDelay = () => {
    if (overflowLayers > 0) {
      // 尝试获取工具栏宽度，如果为0则等待重试
      const availableWidth = getToolbarAvailableWidth()
      if (availableWidth <= 0) {
        // 工具栏还没渲染完成，延迟重试
        requestAnimationFrame(() => calculateOverflowWithDelay())
        return
      }

      console.log('[setupEditorButtons] 准备调用溢出检测，层数:', overflowLayers, '可用宽度:', availableWidth)
      const updatedButtons = calculateButtonOverflow(configs, overflowLayers)
      // 更新 configs 中的 overflowLevel
      updatedButtons.forEach(btn => {
        const original = configs.find(b => b.id === btn.id)
        if (original) {
          original.overflowLevel = btn.overflowLevel
        }
      })
    }
  }

  // 启动溢出计算
  requestAnimationFrame(calculateOverflowWithDelay)

  // 找到所有编辑器
  const editors = document.querySelectorAll('.protyle')

  editors.forEach(editor => {
    // 找到锁定编辑按钮
    const readonlyBtn = editor.querySelector('.protyle-breadcrumb__bar [data-type="readonly"]') ||
                        editor.querySelector('.protyle-breadcrumb [data-type="readonly"]')
    if (!readonlyBtn) return

    // 过滤并排序按钮（sort降序：大→小，这样sort 0在最右边，紧挨锁定按钮）
    const buttonsToAdd = configs
      .filter(button => shouldShowButton(button) && shouldShowInMainToolbar(button))
      .sort((a, b) => b.sort - a.sort) // 降序

    // 清理旧的插件按钮
    const oldButtons = editor.querySelectorAll('[data-custom-button]')
    oldButtons.forEach(btn => btn.remove())

    // 添加新按钮（插入到锁定按钮的左边）
    buttonsToAdd.forEach((buttonConfig, index) => {
      const button = createButtonElement(buttonConfig)
      // 第一个按钮（最左边）添加特殊类，用于移除左边距
      if (index === 0) {
        button.classList.add('first-custom-button')
      }
      readonlyBtn.insertAdjacentElement('beforebegin', button)
    })
  })
}

/**
 * 获取按钮的通用样式（与扩展工具栏保持一致的完全控制）
 */
function getButtonBaseStyle(config: ButtonConfig): string {
  return `
    /* 完全覆盖思源原生样式，使用 !important 确保优先级 */
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;

    /* 尺寸控制 */
    min-width: ${config.minWidth}px !important;
    height: ${config.minWidth}px !important;

    /* 间距控制 */
    margin-left: 0 !important;
    margin-right: ${config.marginRight}px !important;
    padding: 0 8px !important;

    /* 外观样式：与思源原生按钮一致（无边框、透明背景） */
    border: none !important;
    border-radius: 4px !important;
    background-color: transparent !important;
    color: var(--b3-theme-on-surface) !important;
    cursor: pointer !important;
    user-select: none !important;

    /* 移除聚焦轮廓 */
    outline: none !important;

    /* 过渡效果 */
    transition: all 0.2s ease !important;

    /* Flexbox 相关 */
    flex-shrink: 0 !important;
    gap: 4px !important;

    /* 清除思源原生样式影响 */
    opacity: 1 !important;
    line-height: 1 !important;
  `
}

function createButtonElement(config: ButtonConfig): HTMLElement {
  const button = document.createElement('button')
  button.dataset.customButton = config.id
  // 保留必要的功能性类，移除 block__icon（避免思源样式干扰）
  button.className = 'fn__flex-center ariaLabel'
  button.setAttribute('aria-label', config.name)
  button.title = config.name

  // 应用基础样式（完全可控）
  button.style.cssText = getButtonBaseStyle(config)

  // 设置图标内容
  if (config.icon.startsWith('icon')) {
    // 思源图标
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', `${config.iconSize}`)
    svg.setAttribute('height', `${config.iconSize}`)
    svg.style.cssText = 'flex-shrink: 0; display: block;'

    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
    use.setAttribute('href', `#${config.icon}`)
    svg.appendChild(use)

    button.appendChild(svg)
  } else if (config.icon.startsWith('lucide:')) {
    // Lucide 图标
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
        // 确保 SVG 样式正确
        const svg = button.querySelector('svg')
        if (svg) {
          svg.style.cssText = 'flex-shrink: 0; display: block;'
        }
      } else {
        // 图标不存在，使用文本
        button.textContent = config.icon
        button.style.fontSize = `${config.iconSize}px`
      }
    } catch (e) {
      button.textContent = config.icon
      button.style.fontSize = `${config.iconSize}px`
    }
  } else {
    // Emoji 或文本图标
    const iconSpan = document.createElement('span')
    iconSpan.style.fontSize = `${config.iconSize}px`
    iconSpan.style.lineHeight = '1'
    iconSpan.textContent = config.icon
    button.appendChild(iconSpan)
  }

  // 添加 hover 效果（与思源原生按钮一致）
  button.addEventListener('mouseenter', () => {
    button.style.backgroundColor = 'var(--b3-list-hover) !important'
    button.style.color = 'var(--b3-theme-on-background) !important'
  })
  button.addEventListener('mouseleave', () => {
    button.style.backgroundColor = 'transparent !important'
    button.style.color = 'var(--b3-theme-on-surface) !important'
  })
  button.addEventListener('touchstart', () => {
    button.style.backgroundColor = 'var(--b3-list-hover) !important'
    button.style.color = 'var(--b3-theme-on-background) !important'
  }, { passive: true })
  button.addEventListener('touchend', () => {
    button.style.backgroundColor = 'transparent !important'
    button.style.color = 'var(--b3-theme-on-surface) !important'
  })

  // 保存选区的变量（用于快捷键按钮）
  let savedSelection: Range | null = null
  let lastActiveElement: HTMLElement | null = null
  let isTouchEvent = false

  // 在 mousedown 时保存选区和焦点元素（此时编辑器还未失去焦点）
  button.addEventListener('mousedown', (e) => {
    if (isTouchEvent) return // 如果是触摸事件，跳过 mousedown
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      savedSelection = selection.getRangeAt(0).cloneRange()
    }
    lastActiveElement = document.activeElement as HTMLElement
  })

  // 移动端：touchstart 时保存状态，但不阻止默认
  button.addEventListener('touchstart', (e) => {
    isTouchEvent = true
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      savedSelection = selection.getRangeAt(0).cloneRange()
    }
    lastActiveElement = document.activeElement as HTMLElement
  }, { passive: true })

  // touchend 时重置标记
  button.addEventListener('touchend', () => {
    setTimeout(() => { isTouchEvent = false }, 100)
  })

  // 绑定点击事件
  button.addEventListener('click', (e) => {
    e.stopPropagation()

    // 扩展工具栏按钮特殊处理
    if (config.id === 'overflow-button-mobile') {
      // 立即恢复焦点，防止输入法关闭
      if (lastActiveElement && lastActiveElement !== document.activeElement) {
        ;(lastActiveElement as HTMLElement).focus()
      }
      showOverflowToolbar(config)
      return
    }

    // 将保存的选区传递给处理函数
    handleButtonClick(config, savedSelection, lastActiveElement)

    // builtin 类型的按钮不恢复焦点，让输入法自然关闭
    // 其他类型恢复焦点
    if (config.type !== 'builtin') {
      if (lastActiveElement && lastActiveElement !== document.activeElement) {
        ;(lastActiveElement as HTMLElement).focus()
      }
    }

    // 点击完成后立即移除按钮焦点
    button.blur()
  })

  return button
}


/**
 * 显示/隐藏扩展工具栏弹窗
 * @param config 扩展工具栏按钮配置
 */
function showOverflowToolbar(config: ButtonConfig) {
  // 检查是否已存在扩展工具栏（存在则关闭）
  const existingLayers = document.querySelectorAll('.overflow-toolbar-layer')

  if (existingLayers.length > 0) {
    // 移除所有工具栏层
    existingLayers.forEach(el => el.remove())
    // 移除溢出按钮的焦点
    const overflowButton = document.querySelector(`[data-custom-button="${config.id}"]`) as HTMLElement
    if (overflowButton) {
      overflowButton.blur()
    }
    showMessage('扩展工具栏已关闭', 1000, 'info')
    return
  }

  // 检测工具栏位置：通过 body 类名判断是否启用了底部工具栏
  const isBottomToolbar = document.body.classList.contains('siyuan-toolbar-customizer-enabled')

  // 获取层数配置（1-5层）
  const layers = config.layers || 1

  // 工具栏高度和间距
  const toolbarHeight = 40
  const toolbarSpacing = 4

  // 顶部工具栏和底部工具栏的不同偏移
  const topOffset = 100      // 顶部工具栏下方距离
  const bottomOffset = 60   // 底部工具栏上方距离

  // 获取所有按钮配置
  const allButtons = (window as any).__mobileButtonConfigs || []

  // 过滤出启用的按钮（排除扩展工具栏按钮本身）
  const enabledButtons = allButtons.filter((btn: ButtonConfig) =>
    btn.enabled !== false &&
    (btn.platform === 'mobile' || btn.platform === 'both') &&
    btn.id !== 'overflow-button-mobile'
  )

  // 根据工具栏位置选择动画方向
  const animationName = isBottomToolbar ? 'slideUp' : 'slideDown'

  // 添加动画样式
  let animationStyle = document.getElementById('overflow-toolbar-animation')
  if (!animationStyle) {
    animationStyle = document.createElement('style')
    animationStyle.id = 'overflow-toolbar-animation'
    animationStyle.textContent = `
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes slideDown {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .overflow-toolbar-layer {
        animation: ${animationName} 0.2s ease-out;
      }
    `
    document.head.appendChild(animationStyle)
  } else {
    // 更新动画方向
    animationStyle.textContent = `
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes slideDown {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .overflow-toolbar-layer {
        animation: ${animationName} 0.2s ease-out;
      }
    `
  }

  // 根据层数创建多个工具栏，并在每层显示对应的按钮
  for (let i = 0; i < layers; i++) {
    const layerNum = i + 1

    // 找出属于当前层的按钮，按 sort 降序排序（大→小，左→右，即视觉上从右到左）
    const layerButtons = enabledButtons
      .filter((btn: ButtonConfig) => (btn.overflowLevel ?? 0) === layerNum)
      .sort((a, b) => b.sort - a.sort) // 降序

    // 空层不显示
    if (layerButtons.length === 0) {
      continue
    }

    const toolbar = document.createElement('div')
    toolbar.className = 'overflow-toolbar-layer'
    toolbar.id = `overflow-toolbar-layer-${layerNum}`

    // 根据工具栏位置计算不同的 CSS
    let positionCss = ''
    if (isBottomToolbar) {
      // 底部工具栏：从下往上堆叠
      // 使用 --mobile-toolbar-offset 确保输入法打开时不会与底部工具栏重叠
      const bottomPos = bottomOffset + (i * (toolbarHeight + toolbarSpacing))
      positionCss = `
        position: fixed;
        bottom: calc(var(--mobile-toolbar-offset, 0px) + ${bottomPos}px);
      `
    } else {
      // 顶部工具栏：从上往下堆叠
      const topPos = topOffset + (i * (toolbarHeight + toolbarSpacing))
      positionCss = `
        position: fixed;
        top: ${topPos}px;
      `
    }

    toolbar.style.cssText = `
      ${positionCss}
      left: 10px;
      right: 10px;
      height: ${toolbarHeight}px;
      background: var(--b3-theme-surface);
      border: 1px solid var(--b3-theme-primary);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding: 0 12px;
      z-index: ${1000 + i};
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `

    // 应用工具栏背景颜色和透明度配置
    const mobileConfig = (window as any).__mobileToolbarConfig as MobileToolbarConfig
    if (mobileConfig) {
      if (mobileConfig.useThemeColor) {
        // 使用主题颜色时，只需要调整透明度
        toolbar.style.backgroundColor = `var(--b3-theme-surface)`
        toolbar.style.opacity = mobileConfig.toolbarOpacity.toString()
      } else {
        // 使用自定义颜色
        const isDark = document.body.classList.contains('b3-theme-dark')
        const bgColor = isDark ? mobileConfig.toolbarBackgroundColorDark : mobileConfig.toolbarBackgroundColor
        toolbar.style.backgroundColor = bgColor
        toolbar.style.opacity = mobileConfig.toolbarOpacity.toString()
      }
    }

    // 添加该层的所有按钮
    layerButtons.forEach((btn: ButtonConfig) => {
      const layerBtn = document.createElement('button')
      // 使用与主工具栏相同的样式函数，确保完全一致
      layerBtn.className = 'fn__flex-center ariaLabel'
      layerBtn.style.cssText = getButtonBaseStyle(btn)
      layerBtn.title = btn.name

      // 清空按钮内容
      layerBtn.innerHTML = ''

      // 根据图标类型渲染（与主工具栏保持一致）
      if (btn.icon.startsWith('icon')) {
        // 思源内置图标
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('width', `${btn.iconSize}`)
        svg.setAttribute('height', `${btn.iconSize}`)
        svg.style.cssText = 'flex-shrink: 0; display: block;'
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
        use.setAttribute('href', `#${btn.icon}`)
        svg.appendChild(use)
        layerBtn.appendChild(svg)
      } else if (btn.icon.startsWith('lucide:')) {
        // Lucide 图标
        const iconName = btn.icon.substring(7)
        try {
          const lucideIcons = require('lucide')
          const IconComponent = lucideIcons[iconName]
          if (IconComponent) {
            const svgString = IconComponent.toSvg({
              width: btn.iconSize,
              height: btn.iconSize
            })
            layerBtn.innerHTML = svgString
            // 确保 SVG 样式正确
            const svg = layerBtn.querySelector('svg')
            if (svg) {
              svg.style.cssText = 'flex-shrink: 0; display: block;'
            }
          } else {
            // 图标不存在，使用文本
            layerBtn.textContent = btn.icon
            layerBtn.style.fontSize = `${btn.iconSize}px`
          }
        } catch (e) {
          layerBtn.textContent = btn.icon
          layerBtn.style.fontSize = `${btn.iconSize}px`
        }
      } else {
        // Emoji 或文本图标
        const iconSpan = document.createElement('span')
        iconSpan.style.fontSize = `${btn.iconSize}px`
        iconSpan.style.lineHeight = '1'
        iconSpan.textContent = btn.icon
        layerBtn.appendChild(iconSpan)
      }

      // 添加 hover 效果（与思源原生按钮一致）
      layerBtn.addEventListener('mouseenter', () => {
        layerBtn.style.backgroundColor = 'var(--b3-list-hover) !important'
        layerBtn.style.color = 'var(--b3-theme-on-background) !important'
      })
      layerBtn.addEventListener('mouseleave', () => {
        layerBtn.style.backgroundColor = 'transparent !important'
        layerBtn.style.color = 'var(--b3-theme-on-surface) !important'
      })
      layerBtn.addEventListener('touchstart', () => {
        layerBtn.style.backgroundColor = 'var(--b3-list-hover) !important'
        layerBtn.style.color = 'var(--b3-theme-on-background) !important'
      }, { passive: true })
      layerBtn.addEventListener('touchend', () => {
        layerBtn.style.backgroundColor = 'transparent !important'
        layerBtn.style.color = 'var(--b3-theme-on-surface) !important'
      })

      // 保存选区的变量（每个按钮独立保存）
      let savedSelection: Range | null = null
      let lastActiveElement: HTMLElement | null = null
      let isTouchEvent = false

      // 在 mousedown 时保存选区和焦点元素
      layerBtn.addEventListener('mousedown', (e) => {
        if (isTouchEvent) return
        const selection = window.getSelection()
        if (selection && selection.rangeCount > 0) {
          savedSelection = selection.getRangeAt(0).cloneRange()
        }
        lastActiveElement = document.activeElement as HTMLElement
      })

      // 移动端：touchstart 时保存状态
      layerBtn.addEventListener('touchstart', (e) => {
        isTouchEvent = true
        const selection = window.getSelection()
        if (selection && selection.rangeCount > 0) {
          savedSelection = selection.getRangeAt(0).cloneRange()
        }
        lastActiveElement = document.activeElement as HTMLElement
      }, { passive: true })

      // touchend 时重置标记
      layerBtn.addEventListener('touchend', () => {
        setTimeout(() => { isTouchEvent = false }, 100)
      })

      // 点击按钮执行功能
      layerBtn.addEventListener('click', (e) => {
        e.stopPropagation()

        // 移除按钮焦点，防止显示聚焦轮廓
        layerBtn.blur()

        // 关闭扩展工具栏
        document.querySelectorAll('.overflow-toolbar-layer').forEach(el => el.remove())

        // 将保存的选区传递给处理函数
        handleButtonClick(btn, savedSelection, lastActiveElement)

        // builtin 类型的按钮不恢复焦点，让输入法自然关闭
        // 其他类型恢复焦点，保持输入法打开
        if (btn.type !== 'builtin') {
          if (lastActiveElement && lastActiveElement !== document.activeElement) {
            ;(lastActiveElement as HTMLElement).focus()
          }
        }
      })

      toolbar.appendChild(layerBtn)
    })

    document.body.appendChild(toolbar)
  }

  showMessage(`扩展工具栏已弹出（${layers}层）`, 1000, 'info')

  // 点击外部关闭
  const closeOnClickOutside = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const overflowButton = document.querySelector(`[data-custom-button="${config.id}"]`) as HTMLElement
    const hasToolbar = document.querySelector('.overflow-toolbar-layer')

    if (hasToolbar && !target.closest('.overflow-toolbar-layer') && (!overflowButton || !overflowButton.contains(target))) {
      document.querySelectorAll('.overflow-toolbar-layer').forEach(el => el.remove())
      // 移除溢出按钮的焦点
      if (overflowButton) {
        overflowButton.blur()
      }
      document.removeEventListener('click', closeOnClickOutside)
    }
  }
  setTimeout(() => {
    document.addEventListener('click', closeOnClickOutside)
  }, 100)
}

function handleButtonClick(config: ButtonConfig, savedSelection: Range | null = null, lastActiveElement: HTMLElement | null = null) {
  // 如果开启了右上角提示，显示消息
  // 注意：showNotification 默认为 true，只有明确设置为 false 时才不显示
  const shouldShow = config.showNotification !== false
  if (shouldShow) {
    showMessage(`执行: ${config.name}`, 1500, 'info')
  }

  if (config.type === 'builtin') {
    // 执行思源内置功能
    executeBuiltinFunction(config)
  } else if (config.type === 'template') {
    // 插入模板，传递保存的选区和焦点元素
    insertTemplate(config, savedSelection, lastActiveElement)
  } else if (config.type === 'click-sequence') {
    // 执行点击序列
    executeClickSequence(config)
  } else if (config.type === 'shortcut') {
    // 执行快捷键，传递保存的选区
    executeShortcut(config, savedSelection, lastActiveElement)
  } else if (config.type === 'author-tool') {
    // 执行作者自用工具
    executeAuthorTool(config)
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

function insertTemplate(config: ButtonConfig, savedSelection: Range | null = null, lastActiveElement: HTMLElement | null = null) {
  if (!config.template) {
    showMessage(`按钮"${config.name}"未配置模板内容`, 3000, 'error')
    return
  }

  // 优先使用保存的焦点元素，否则使用当前焦点元素
  const targetElement = lastActiveElement || document.activeElement
  const activeEditor = targetElement?.closest('.protyle')
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

  // 执行完成提示（受 showNotification 控制）
  if (config.showNotification !== false) {
    showMessage(`${config.name} 执行完成`, 1500, 'info')
  }
}

/**
 * 等待元素出现
 * @param selector CSS选择器或简单标识符（支持智能匹配）
 * @param timeout 超时时间（毫秒）
 * @returns Promise<HTMLElement | null>
 */
function waitForElement(selector: string, timeout: number = 5000): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    // 智能查找元素（支持8种方式）
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

      // 否则使用 7 种智能匹配方式
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
      // 优先在工具栏中查找（避免找到文档块上的同名按钮）
      element = document.querySelector(`.protyle-breadcrumb__bar [data-type="${selector}"]`) as HTMLElement
      if (!element) {
        element = document.querySelector(`.protyle-breadcrumb [data-type="${selector}"]`) as HTMLElement
      }
      if (!element) {
        element = document.querySelector(`[data-type="${selector}"]`) as HTMLElement
      }
      if (element) return element

      // 5. 通过 class 查找（支持多个class，用空格分隔）
      const classNames = selector.split(' ')
      if (classNames.length > 0) {
        const classSelector = classNames.map(c => `.${c}`).join('')
        element = document.querySelector(classSelector) as HTMLElement
        if (element) return element
      }

      // 6. 通过 SVG 图标引用查找（如 iconMore）
      // 注意：需要同时检查 href 和 xlink:href（不同浏览器/环境可能使用不同属性）
      let svgUse = document.querySelector(`use[href="#${selector}"]`) as HTMLElement
      if (!svgUse) {
        svgUse = document.querySelector(`use[xlink\\:href="#${selector}"]`) as HTMLElement
      }
      if (svgUse) {
        // 找到包含该 SVG use 元素的按钮
        const button = svgUse.closest('button')
        if (button) return button as HTMLElement
      }

      // 7. 通过文本内容查找按钮（兼容旧的方式）
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
        // 清理超时定时器
        if (activeTimers.has(timerId)) {
          clearTimeout(timerId)
          activeTimers.delete(timerId)
        }
        resolve(element)
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true
    })

    // 超时处理 - 使用 tracked timeout
    const timerId = safeSetTimeout(() => {
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
  // 使用 TreeWalker 遍历文本节点，性能优于 querySelectorAll('*')
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // 跳过纯空白节点
        if (node.textContent?.trim() === '') {
          return NodeFilter.FILTER_SKIP
        }
        // 检查文本是否匹配
        if (node.textContent?.trim() === searchText) {
          return NodeFilter.FILTER_ACCEPT
        }
        return NodeFilter.FILTER_SKIP
      }
    }
  )

  let node: Node | null
  while ((node = walker.nextNode())) {
    // 找到匹配的文本节点，返回其父元素（通常是按钮、链接等可点击元素）
    let parent = node.parentElement
    // 向上查找，直到找到一个可交互的元素
    while (parent && parent !== document.body) {
      const tagName = parent.tagName.toLowerCase()
      if (['button', 'a', 'span', 'div', 'b3-menu__item', 'b3-menu__label'].includes(tagName) ||
          parent.classList.contains('b3-menu__item') ||
          parent.classList.contains('b3-menu__label') ||
          parent.getAttribute('role') === 'menuitem') {
        return parent as HTMLElement
      }
      parent = parent.parentElement
    }
  }

  return null
}

/**
 * 检查元素是否可见
 * 注意：工具栏按钮即使被隐藏（transform: scale(0)）也应该被认为是"可见"的，
 * 因为它们仍然可以被 JavaScript 点击
 */
function isVisible(element: HTMLElement): boolean {
  if (!element) return false

  // 检查是否是工具栏按钮（这些按钮即使被隐藏也可以被点击）
  const isToolbarButton = element.matches('.protyle-breadcrumb__bar button, .protyle-breadcrumb button, .protyle-breadcrumb__icon')

  const style = window.getComputedStyle(element)
  if (style.display === 'none') {
    return false
  }

  // 对于工具栏按钮，跳过 visibility、opacity 和尺寸检查
  // （因为它们可能被 transform: scale(0) 隐藏但仍可点击）
  if (!isToolbarButton) {
    if (style.visibility === 'hidden' || style.opacity === '0') {
      return false
    }

    const rect = element.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      return false
    }
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

/**
 * 执行日记底部功能
 * 打开日记后跳转到文档底部
 * 电脑端：直接触发 Alt+5 并滚动
 * 手机端：触发 Alt+5，自动确认对话框，然后滚动
 */
async function executeDiaryBottom(config: ButtonConfig) {
  try {
    const windowObj = window as any

    // 检测是否为手机端
    const isMobile = /mobile|android|iphone|ipad/i.test(navigator.userAgent) ||
                     windowObj.siyuan?.config?.fronted === 'mobile' ||
                     document.body.classList.contains('mobile')

    // 从思源 keymap 中获取 dailyNote 的快捷键
    let hotkeyToTrigger = '⌥5' // 默认 Alt+5

    if (windowObj.siyuan?.config?.keymap?.general?.dailyNote) {
      const keymapItem = windowObj.siyuan.config.keymap.general.dailyNote
      hotkeyToTrigger = keymapItem.custom || keymapItem.default
    }

    // ==================== 滚动到底部函数（电脑端和手机端共用） ====================
    let scrollAttempts = 0
    const maxScrollAttempts = 20
    const retryDelay = 200

    function startScrolling() {
      scrollAttempts = 0
      scrollToBottom()
    }

    function scrollToBottom() {
      scrollAttempts++

      // 查找所有 .protyle 元素
      const allProtyles = document.querySelectorAll('.protyle') as NodeListOf<HTMLElement>
      let scrolled = false

      allProtyles.forEach((protyle) => {
        // 尝试滚动 .protyle-content 元素
        const content = protyle.querySelector('.protyle-content') as HTMLElement
        if (content && content.scrollHeight > content.clientHeight) {
          content.scrollTop = content.scrollHeight
          scrolled = true
        }
      })

      if (scrolled) {
        if (config.showNotification !== false) {
          showMessage('已打开日记并跳转到底部', 1500, 'info')
        }
        return
      }

      if (scrollAttempts < maxScrollAttempts) {
        safeSetTimeout(scrollToBottom, retryDelay)
      } else {
        if (config.showNotification !== false) {
          showMessage('日记已打开', 1500, 'info')
        }
      }
    }

    // ==================== 电脑端流程 ====================
    if (!isMobile) {
      // 1. 触发快捷键
      const keyEvent = parseHotkeyToKeyEvent(hotkeyToTrigger)
      if (keyEvent) {
        window.dispatchEvent(new KeyboardEvent('keydown', keyEvent))
      }

      // 2. 等待文档加载后滚动到底部（800ms 延迟）
      safeSetTimeout(startScrolling, 800)
      return
    }

    // ==================== 手机端流程 ====================
    // 1. 触发快捷键
    const keyEvent = parseHotkeyToKeyEvent(hotkeyToTrigger)
    if (keyEvent) {
      window.dispatchEvent(new KeyboardEvent('keydown', keyEvent))
    }

    // 2. 等待对话框出现并自动确认（每步延迟500ms）
    let dialogCheckAttempts = 0
    const maxDialogChecks = 15

    const checkAndConfirmDialog = () => {
      dialogCheckAttempts++

      // 查找日记笔记本选择对话框
      const dialogs = document.querySelectorAll('.b3-dialog__container')
      for (const dialog of dialogs) {
        const select = dialog.querySelector('select.b3-select')
        const header = dialog.querySelector('.b3-dialog__header')
        const confirmBtn = dialog.querySelector('.b3-button--text:not(.b3-button--cancel)')

        // 判断是否是日记选择对话框
        if (select && header && confirmBtn) {
          const headerText = header.textContent || ''
          if (headerText.includes('选择') || headerText.includes('请先')) {
            // 直接点击确定按钮
            (confirmBtn as HTMLElement).click()
            // 对话框确认后，延迟1000ms再滚动
            safeSetTimeout(startScrolling, 1000)
            return
          }
        }
      }

      if (dialogCheckAttempts < maxDialogChecks) {
        safeSetTimeout(checkAndConfirmDialog, 100)
      } else {
        // 没有检测到对话框，延迟500ms后开始滚动
        safeSetTimeout(startScrolling, 500)
      }
    }

    // 延迟500ms后开始检查对话框
    safeSetTimeout(checkAndConfirmDialog, 500)

  } catch (error) {
    console.error('日记底部功能失败:', error)
    showMessage(`❌ 打开日记失败: ${error}`, 3000, 'error')
  }
}

/**
 * 执行作者自用工具
 */
function executeAuthorTool(config: ButtonConfig) {
  const subtype = config.authorToolSubtype || 'script'

  // 日记底部类型
  if (subtype === 'diary-bottom') {
    executeDiaryBottom(config)
    return
  }

  // 数据库查询类型
  if (subtype === 'database') {
    executeDatabaseQuery(config)
    return
  }

  // 自定义脚本类型（默认）
  // 如果配置了目标文档ID，打开该文档
  if (config.targetDocId) {
    // 使用思源 API 打开块，忽略返回值
    fetch('/api/block/openBlockDoc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: config.targetDocId })
    }).catch(() => {})
  }

  // 如果配置了自定义脚本，执行它
  if (config.authorScript) {
    try {
      // 使用 Function 构造器创建一个安全的执行环境
      const scriptFn = new Function('config', 'fetchSyncPost', 'showMessage', config.authorScript)
      scriptFn(config, fetchSyncPost, showMessage)
    } catch (err) {
      showMessage(`执行脚本失败: ${err}`, 3000, 'error')
    }
  }

  showMessage(`执行作者工具: ${config.name}`, 1500, 'info')
}

/**
 * 解析时间字符串为分钟数
 */
function parseTimeToMinutes(timeStr: string = 'now'): number {
  if (timeStr === 'now' || !timeStr) {
    const now = new Date()
    return now.getHours() * 60 + now.getMinutes()
  }

  // 处理 HH:MM 格式
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/)
  if (match) {
    const hours = parseInt(match[1], 10)
    const minutes = parseInt(match[2], 10)
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return hours * 60 + minutes
    }
  }

  // 无效格式，使用当前时间
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

/**
 * 将分钟数转换为 HH:MM 格式
 */
function minutesToHHMM(minutes: number): string {
  const hours = Math.floor(minutes / 60) % 24
  const mins = minutes % 60
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}

/**
 * 根据配置格式化时间段
 */
function formatTimeRange(startMinutes: number, endMinutes: number): string {
  const startTime = minutesToHHMM(startMinutes)
  const endTime = minutesToHHMM(endMinutes)

  // 计算是否跨天
  if (endMinutes < startMinutes) {
    return `⏳${startTime} - ${endTime}（次日）`
  }
  return `⏳${startTime} - ${endTime}`
}

/**
 * 解析单元格值
 */
function parseCellValue(cell: any): { content: string; blockId: string } {
  if (!cell || !cell.value) {
    return { content: '', blockId: '' }
  }

  const value = cell.value
  const type = value.type

  switch (type) {
    case 'text':
      return { content: value.text?.content || '', blockId: '' }
    case 'block':
      return { content: value.block?.content || '', blockId: value.block?.id || '' }
    case 'select':
    case 'mSelect':
      // select 类型也用 mSelect 存储值
      if (value.mSelect && Array.isArray(value.mSelect) && value.mSelect.length > 0) {
        return { content: value.mSelect[0].content || '', blockId: '' }
      }
      return { content: '', blockId: '' }
    case 'number':
      return { content: value.number?.content?.toString() || '', blockId: '' }
    case 'date':
      if (value.date?.content) {
        return { content: new Date(value.date.content).toLocaleDateString(), blockId: '' }
      }
      return { content: '', blockId: '' }
    case 'checkbox':
      return { content: value.checkbox?.checked ? '✓' : '✗', blockId: '' }
    default:
      return { content: '', blockId: '' }
  }
}

/**
 * 执行数据库查询
 */
async function executeDatabaseQuery(config: ButtonConfig) {
  try {
    // 获取配置参数
    const dbBlockId = config.dbBlockId || ''
    const dbId = config.dbId || ''
    const viewName = config.viewName || ''
    const primaryKeyColumn = config.primaryKeyColumn || 'DO'
    const startTimeStr = config.startTimeStr || 'now'
    const extraMinutes = config.extraMinutes || 20
    const maxRows = config.maxRows || 5
    const displayMode = config.dbDisplayMode || 'cards'
    const showColumns = config.showColumns || [primaryKeyColumn, '预计分钟', '时间段']
    const timeRangeColumnName = config.timeRangeColumnName || '时间段'

    // 确定 avId
    let avId = dbId

    // 如果没有提供 dbId，尝试从 blockId 获取
    if (!avId && dbBlockId) {
      const blockResponse = await fetchSyncPost('/api/query/sql', {
        stmt: `SELECT content FROM blocks WHERE id='${dbBlockId}'`
      })
      if (blockResponse.code === 0 && blockResponse.data?.length > 0) {
        const content = blockResponse.data[0].content
        const match = content.match(/data-av-id="([^"]+)"/)
        if (match) avId = match[1]
      }
    }

    if (!avId) {
      showMessage('❌ 无法获取数据库ID，请检查配置', 3000, 'error')
      return
    }

    // 获取属性视图信息
    const avResponse = await fetchSyncPost('/api/av/getAttributeView', {
      id: avId
    })

    if (avResponse.code !== 0 || !avResponse.data) {
      showMessage('❌ 获取数据库信息失败', 3000, 'error')
      return
    }

    const attributeView = avResponse.data.av

    // 查找视图ID
    let viewId = ''
    if (viewName && attributeView.views) {
      const matchedView = attributeView.views.find((v: any) => v.name === viewName)
      if (matchedView) viewId = matchedView.id
      else if (attributeView.views.length > 0) viewId = attributeView.views[0].id
    } else if (attributeView.views?.length > 0) {
      viewId = attributeView.views[0].id
    }

    // 获取视图数据
    const renderResponse = await fetchSyncPost('/api/av/renderAttributeView', {
      id: avId,
      viewID: viewId,
      page: 1,
      pageSize: maxRows + 10
    })

    if (renderResponse.code !== 0 || !renderResponse.data) {
      showMessage('❌ 获取数据失败', 3000, 'error')
      return
    }

    // 构建键映射 - 从 renderResponse.data.view.columns 获取
    const keyMap: Record<string, { name: string; type: string }> = {}
    if (renderResponse.data.view?.columns) {
      renderResponse.data.view.columns.forEach((col: any) => {
        keyMap[col.id] = { name: col.name, type: col.type }
      })
    }

    // 处理数据 - 从 renderResponse.data.view.rows 获取
    const rows = renderResponse.data.view?.rows || []
    const processedRows: Array<{ id: string; blockId: string; values: Record<string, string> }> = []

    // 计算时间段
    let currentTime = parseTimeToMinutes(startTimeStr)

    rows.slice(0, maxRows).forEach((row: any, rowIndex) => {
      const rowData: Record<string, string> = {}
      let rowBlockId = ''

      if (row.cells) {
        row.cells.forEach((cell: any) => {
          if (!cell.value?.keyID) return

          const keyInfo = keyMap[cell.value.keyID]
          if (!keyInfo) return

          const parsed = parseCellValue(cell)
          rowData[keyInfo.name] = parsed.content

          if (keyInfo.name === primaryKeyColumn) {
            rowBlockId = parsed.blockId
          }
        })
      }

      // 计算时间
      const durationStr = rowData['预计分钟'] || rowData['分钟'] || rowData['时长'] || '0'
      const durationMatch = durationStr.match(/\d+/)
      const duration = durationMatch ? parseInt(durationMatch[0]) : 0

      // 第一行不加额外分钟，后续行加
      const extraToAdd = (processedRows.length > 0) ? extraMinutes : 0
      const startTime = currentTime + extraToAdd
      const endTime = startTime + duration

      rowData[timeRangeColumnName] = formatTimeRange(startTime, endTime)

      // 更新 currentTime 为本行结束时间（供下一行使用）
      currentTime = endTime

      processedRows.push({
        id: row.id,
        blockId: rowBlockId,
        values: rowData
      })
    })

    // 显示弹窗
    showDatabasePopup(processedRows, config, primaryKeyColumn, timeRangeColumnName, displayMode, showColumns, attributeView.name)

  } catch (error: any) {
    console.error('数据库查询失败:', error)
    showMessage(`❌ 查询失败: ${error.message || error}`, 3000, 'error')
  }
}

/**
 * 显示数据库查询结果弹窗
 */
function showDatabasePopup(
  rows: Array<{ id: string; blockId: string; values: Record<string, string> }>,
  config: ButtonConfig,
  primaryKeyColumn: string,
  timeRangeColumnName: string,
  displayMode: string,
  showColumns: string[],
  dbName: string = '查询结果'
) {
  const rowCount = rows.length

  if (rowCount === 0) {
    showMessage('没有数据', 3000, 'info')
    return
  }

  let contentHtml = ''

  if (displayMode === 'table') {
    // 表格模式
    let tableHtml = '<table style="width: 100%; border-collapse: collapse; font-size: 13px;"><thead><tr>'

    // 表头
    showColumns.forEach(col => {
      tableHtml += `<th style="border-bottom: 2px solid #007AFF; padding: 8px 6px; text-align: ${col === timeRangeColumnName ? 'center' : 'left'}; font-weight: 600; color: ${col === primaryKeyColumn ? '#800080' : '#1D1D1F'}; background-color: #F8F8F8; white-space: nowrap;">${col}</th>`
    })

    tableHtml += '</tr></thead><tbody>'

    // 表体
    rows.forEach((rowData, rowIndex) => {
      tableHtml += `<tr style="background-color: ${rowIndex % 2 === 0 ? '#FFFFFF' : '#F9F9F9'};">`

      showColumns.forEach(col => {
        const value = rowData.values[col] || ''

        if (col === primaryKeyColumn && rowData.blockId) {
          const displayValue = value.length > 25 ? value.substring(0, 25) + '...' : value
          tableHtml += `<td style="border-bottom: 1px solid #E5E5E5; padding: 8px 6px;"><span class="block-link" data-block-id="${rowData.blockId}" style="color: #800080; text-decoration: underline; cursor: pointer; font-weight: 600;">${displayValue}</span></td>`
        } else {
          tableHtml += `<td style="border-bottom: 1px solid #E5E5E5; padding: 8px 6px; color: ${col === timeRangeColumnName ? '#007AFF' : '#1D1D1D'}; text-align: ${col === timeRangeColumnName ? 'center' : 'left'}; ${col === timeRangeColumnName ? 'font-weight: bold; background: rgba(0, 122, 255, 0.08);' : ''}">${value}</td>`
        }
      })

      tableHtml += '</tr>'
    })

    tableHtml += '</tbody></table>'
    contentHtml = tableHtml
  } else {
    // 卡片模式
    let cardsHtml = `<style>
      .cards-container {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 650px;
        overflow-y: auto;
      }
      .task-card {
        background-color: #FFFFFF;
        border: 1px solid #E5E5E5;
        border-radius: 8px;
        padding: 10px 13px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      }
      .task-field {
        margin-bottom: 5px;
        line-height: 1.4;
        display: flex;
        align-items: center;
      }
      .task-field-label {
        color: #8E8E93;
        font-size: 13px;
        margin-right: 10px;
        display: inline-block;
        width: 40px;
        flex-shrink: 0;
        font-weight: 500;
      }
      .task-field-value {
        color: #1D1D1F;
        font-size: 13px;
        font-weight: 400;
        flex-grow: 1;
        word-break: break-word;
      }
      .task-field-value.primary-key {
        color: #800080;
        font-weight: 600;
        text-decoration: underline;
        cursor: pointer;
      }
      .time-range-display {
        display: inline-block;
        background: linear-gradient(135deg, #FF8A00, #FFB347);
        color: #ffffff;
        padding: 6px 14px;
        font-size: 14px;
        font-weight: 700;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(255, 138, 0, 0.25);
        letter-spacing: 0.5px;
        text-align: center;
        width: 100%;
        box-sizing: border-box;
      }
      .time-range-container {
        display: flex;
        justify-content: center;
        align-items: center;
        margin-top: 4px;
        width: 100%;
      }
    </style><div class="cards-container">`

    rows.forEach((rowData) => {
      cardsHtml += '<div class="task-card">'

      showColumns.forEach(col => {
        const value = rowData.values[col] || ''
        const isTimeRange = col === timeRangeColumnName

        if (col === primaryKeyColumn && rowData.blockId) {
          cardsHtml += `<div class="task-field"><span class="block-link task-field-value primary-key" data-block-id="${rowData.blockId}">${value}</span></div>`
        } else if (isTimeRange) {
          cardsHtml += `<div class="time-range-container"><span class="time-range-display">${value}</span></div>`
        } else {
          const shortLabel = col.length > 4 ? col.substring(0, 4) : col
          cardsHtml += `<div class="task-field"><span class="task-field-label">${shortLabel}</span><span class="task-field-value">${value}</span></div>`
        }
      })

      cardsHtml += '</div>'
    })

    cardsHtml += '</div>'
    contentHtml = cardsHtml
  }

  // 构建说明文字
  const noteHtml = '<div style="margin-top: 14px; font-size: 11px; color: #8E8E93; text-align: center;">双击关闭 | 点击紫色文字可跳转</div>'

  // 创建 Dialog，使用数据库名称作为标题
  const dialog = new Dialog({
    title: dbName || '查询结果',
    content: `
      <div class="b3-dialog__content" style="padding: ${displayMode === 'table' ? '0' : '12px'};">
        ${contentHtml}
        ${noteHtml}
      </div>
    `,
    width: displayMode === 'table' ? '500px' : '380px',
    destroyCallback: () => {
      // 弹窗关闭时的回调
    }
  })

  // 设置标题居中
  const headerElement = dialog.element.querySelector('.b3-dialog__header')
  if (headerElement) {
    (headerElement as HTMLElement).style.textAlign = 'center'
  }

  // 双击关闭弹窗（绑定到整个 dialog，排除 block-link）
  dialog.element.addEventListener('dblclick', (e) => {
    if ((e.target as HTMLElement).classList.contains('block-link')) {
      return
    }
    dialog.destroy()
  })

  // 手机端触摸双击关闭
  let lastTapTime = 0
  dialog.element.addEventListener('touchend', (e) => {
    const target = e.target as HTMLElement
    if (target.classList.contains('block-link')) {
      return
    }

    const currentTime = new Date().getTime()
    const tapLength = currentTime - lastTapTime

    if (tapLength < 300 && tapLength > 0) {
      // 双击检测到
      dialog.destroy()
      e.preventDefault()
    }
    lastTapTime = currentTime
  })

  // 使用事件委托处理 block-link 点击
  dialog.element.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (!target.classList.contains('block-link')) {
      return
    }

    const blockId = target.dataset.blockId
    if (!blockId) {
      return
    }

    e.preventDefault()
    e.stopPropagation()

    // 关闭弹窗
    dialog.destroy()

    const isMobile = isMobileDevice()

    if (isMobile) {
      // 手机端：模拟点击文件树
      fetchSyncPost('/api/block/getBlockInfo', { id: blockId }).then((response) => {
        if (response.code === 0 && response.data) {
          const rootId = response.data.rootID

          const findDocElement = (id: string) => {
            const selectors = [
              `[data-node-id="${id}"]`,
              `[data-url-id="${id}"]`,
              `.b3-list-item[data-url-id="${id}"]`,
              `[data-type="doc"][data-id="${id}"]`,
              `li[data-id="${id}"]`
            ]
            for (const selector of selectors) {
              const el = document.querySelector(selector)
              if (el) return el
            }
            return null
          }

          let retries = 0
          const tryOpenDoc = () => {
            const fileTreeDoc = findDocElement(rootId)
            if (fileTreeDoc) {
              fileTreeDoc.click()
              setTimeout(() => {
                const block = document.querySelector(`[data-node-id="${blockId}"]`)
                if (block) {
                  block.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  block.dispatchEvent(new MouseEvent('click', {
                    view: window,
                    bubbles: true,
                    cancelable: true
                  }))
                }
              }, 500)
            } else if (retries < 5) {
              retries++
              setTimeout(tryOpenDoc, 200)
            }
          }

          tryOpenDoc()
        }
      }).catch((err) => {
        console.log('手机端打开失败:', err)
      })
    } else {
      // 电脑端：直接使用 siyuan:// 超链接
      window.location.href = 'siyuan://blocks/' + blockId
    }
  })
}

// ===== 清理函数 =====
export function cleanup() {
  // 移除 body 标记类
  document.body.classList.remove('siyuan-toolbar-customizer-enabled')
  document.body.classList.remove('siyuan-toolbar-top-mode')

  // 移除顶部工具栏样式
  const topToolbarStyle = document.getElementById('top-toolbar-custom-style')
  if (topToolbarStyle) {
    topToolbarStyle.remove()
  }

  // 清理所有定时器
  clearAllTimers()

  // 清理自定义按钮
  cleanupCustomButtons()

  // 移除事件监听器
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
    resizeHandler = null
  }

  // 清理焦点事件监听器
  focusEventHandlers.forEach(({ element, focusHandler, blurHandler }) => {
    element.removeEventListener('focus', focusHandler)
    element.removeEventListener('blur', blurHandler)
  })
  focusEventHandlers = []

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
                if (config.showNotification !== false) {
                  showMessage(`复制成功`, 1500, 'info')
                }
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
                  if (config.showNotification !== false) {
                    showMessage(`已复制: ${ref}`, 1500, 'info')
                  }
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

                if (config.showNotification !== false) {
                  showMessage(`执行: ${config.shortcutKey}`, 1500, 'info')
                }
              }, 50)
              return
            }
          }

          // 通用命令：在 window 上触发
          const eventDown = new KeyboardEvent('keydown', keyEvent)
          window.dispatchEvent(eventDown)

          console.log('已触发键盘事件:', hotkeyToTrigger, '目标: 全局')
          if (config.showNotification !== false) {
            showMessage(`执行: ${config.shortcutKey}`, 1500, 'info')
          }
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
          if (config.showNotification !== false) {
            showMessage(`执行: ${config.shortcutKey}`, 1500, 'info')
          }
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