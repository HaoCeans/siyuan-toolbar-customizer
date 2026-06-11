/**
 * 工具栏管理器
 * 负责移动端工具栏调整和自定义按钮功能
 */

import { Dialog, fetchSyncPost, getFrontend, showMessage, openTab as siyuanOpenTab, openMobileFileById } from "siyuan";
// 通知模块
import * as Notify from "./notification";
// 手机端标签页Tab模块
import { toggleVisibility as toggleMobileTabs } from "./ui/mobileTabs";
import { toggleVisibility as toggleDesktopTabs } from "./ui/desktopTabs";
// 手机端悬浮大纲模块
import { toggleVisibility as toggleMobileOutline } from "./ui/mobileOutline";
import { toggleVisibility as toggleDesktopOutline } from "./ui/desktopOutline";
import { toggleVisibility as toggleMobileDocNav } from "./ui/mobileDocNav";
import { toggleVisibility as toggleDesktopDocNav } from "./ui/desktopDocNav";
import { isDesktopQuickNoteOverflowToolbarEnabled } from "./quickNote/desktopCapture";
// TTS 朗读模块
import { showTTSOptionsDesktop } from "./tts/desktopPanel";
import { showTTSOptionsMobile, cleanupMobileTTS } from "./tts/mobilePanel";
import { destroyTTSEngine } from "./tts/ttsEngine";
import { destroyHttpTTSEngine } from "./tts/httpTtsEngine";
import { destroyMobileTTSEngine } from "./tts/mobileTtsEngine";
import { destroyEdgeTTSEngine, destroyGoogleTTSEngine } from "./tts/edgeTtsEngine";

// ===== 插件实例（用于需要 app 参数的 API 调用） =====
export let pluginInstance: any = null;

/**
 * 设置插件实例（在插件初始化时调用）
 */
export function setPluginInstance(plugin: any): void {
  pluginInstance = plugin;
}

// ===== 配置接口 =====
export interface MobileToolbarConfig {
  // 底部工具栏配置
  enableBottomToolbar: boolean; // 是否将工具栏置底
  openInputOffset: string;    // 打开输入框时距离底部高度
  closeInputOffset: string;   // 关闭输入框时距离底部高度
  heightThreshold: number;    // 高度变化阈值百分比
  overflowToolbarDistanceBottom?: string;  // 扩展工具栏距离底部工具栏的距离
  overflowToolbarHeightBottom?: string;  // 底部模式扩展工具栏高度
  bottomToolbarRetryDelay?: number;      // 底部工具栏重试延迟（毫秒，0=无重试）

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
  overflowToolbarDistanceTop?: string  // 扩展工具栏距离顶部工具栏的距离（如 "8px"）
  overflowToolbarHeightTop?: string     // 顶部模式扩展工具栏高度（如 "40px"）
  topToolbarRetryDelay?: number;        // 顶部工具栏重试延迟（毫秒，0=无重试）
}

export interface ButtonConfig {
  id: string;                 // 唯一标识
  name: string;              // 按钮名称
  type: 'builtin' | 'builtin-refresh' | 'template' | 'click-sequence' | 'shortcut' | 'author-tool' | 'quick-note' | 'popup-select'; // 功能类型
  builtinId?: string;        // 思源功能ID（如：menuSearch）
  builtinRefreshType?: 'refresh' | 'reload' | 'fullscreen' | 'doc-fullscreen'; // 思源功能类型：刷新、重载、全屏、文档全屏
  template?: string;         // 模板内容
    templateNotebookId?: string; // 模板追加到每日笔记的笔记本ID（可选，为空则在当前编辑器插入）
  clickSequence?: string[];  // 模拟点击选择器序列
  shortcutKey?: string;      // 快捷键组合
  targetDocId?: string;      // 打开指定ID块：目标块ID（桌面端），支持文档ID或块ID
  mobileTargetDocId?: string; // 打开指定ID块：目标块ID（移动端），支持文档ID或块ID
  // 鲸鱼定制工具箱 - 数据库悬浮弹窗配置
  authorToolSubtype?: 'open-doc' | 'database' | 'diary' | 'life-log' | 'popup-select' | 'button-sequence' | 'scroll-doc' | 'image-upload' | 'mobile-tabs' | 'mobile-outline' | 'doc-nav' | 'slide-comment' | 'tts'; // 作者工具子类型：open-doc=打开指定ID块, database=数据库悬浮弹窗, diary=日记, life-log=叶归LifeLog适配, popup-select=弹窗框模板选择, button-sequence=连续点击自定义按钮, scroll-doc=滚动文档顶部或底部, image-upload=图片快捷导入日记, mobile-tabs=手机端标签页Tab, mobile-outline=手机端悬浮大纲, doc-nav=手机端前一篇/后一篇文档, slide-comment=滑动快速批注, tts=文档朗读
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
  diaryPosition?: 'top' | 'bottom'; // 日记功能：打开后位置（top=顶部不滚动，bottom=底部自动滚动）
  diaryWaitTime?: number;     // 日记底部功能：移动端等待时间（毫秒，默认 1000）
  diaryNotebookId?: string;   // 日记底部功能：指定笔记本ID（留空则使用Alt+5快捷键）
  lifeLogCategories?: string[]; // 叶归LifeLog适配：分类选项列表
  lifeLogNotebookId?: string; // 叶归LifeLog适配：目标笔记本ID
  imageUploadMode?: 'manual' | 'daily-note'; // 图片快捷导入：插入模式（manual=手动位置, daily-note=日记底部）
  imageUploadNotebookId?: string; // 图片快捷导入：日记模式目标笔记本ID
  cardContainerHeight?: string; // 卡片模式容器高度
  cardScrollMaxHeight?: string; // 卡片模式滚动容器最大高度
  // 一键记事配置
  quickNoteNotebookId?: string; // 一键记事：目标笔记本ID
  quickNoteDocumentId?: string; // 一键记事：目标文档ID
  quickNoteSaveType?: 'daily' | 'document'; // 一键记事：保存方式（新增）
  quickNoteInsertPosition?: 'top' | 'bottom'; // 一键记事：插入位置（顶部/底部）
  quickNoteInputFormat?: 'plain' | 'block'; // 一键记事：输入格式（plain=纯文本, block=思源块格式）
  // 弹窗选择输入配置
  popupSelectTemplates?: { name: string; content: string }[]; // 弹窗选择：模板列表
  // 连续点击自定义按钮配置
  buttonSequenceSteps?: { buttonId: string; buttonName: string; delayMs: number }[]; // 连续点击：按钮ID、按钮名称和间隔时间列表
    scrollDirection?: 'top' | 'bottom'; // 滚动文档：滚动方向（top=顶部, bottom=底部）
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
  showName?: boolean;        // 是否在按钮上显示名称（默认false）
  floatOpacity?: number;     // 悬浮弹窗透明度 (0~1)，默认 0.72
  autoHideOnScroll?: boolean; // 悬浮面板：向上滚动隐藏、向下滚动显示（仅 mobile 侧相关功能）
  floatPanelPosition?: 'top' | 'center' | 'bottom'; // 悬浮弹窗垂直位置：top=顶部, center=居中(默认), bottom=底部
  maxVisibleTabs?: number;   // 手机端标签页：最大可见标签数 (1~10)，超出后可滚动，默认 10
  showInContextMenu?: boolean; // 是否显示在文本右键菜单中（仅模板类型，默认false）
  buttonsPerLayer?: number[];  // 桌面端扩展工具栏：每层按钮数量，如 [8, 5, 5, 5, 5]（仅 overflow-button-desktop 使用）
  overflowToolbarHeight?: number;  // 桌面端扩展工具栏高度(px)，默认 32（仅 overflow-button-desktop 使用）
  overflowToolbarWidth?: number;   // 桌面端扩展工具栏宽度(px)，默认 0 表示与主工具栏同宽，最大 1300
}

// 全局按钮配置（用于批量设置所有按钮的默认值）
export interface GlobalButtonConfig {
  enabled: boolean           // 是否启用全局配置批量应用（默认true，保持向后兼容）
  iconSize: number;          // 图标大小（px）
  minWidth: number;          // 按钮最小宽度（px）
  marginRight: number;       // 右侧边距（px）
  showNotification: boolean; // 是否显示右上角提示
  externalButtonsReserveWidth?: number; // 其他插件按钮预留宽度（px，仅影响主工具栏溢出计算，默认0）
}

// 桌面端全局按钮默认值
export const DEFAULT_DESKTOP_GLOBAL_BUTTON_CONFIG: GlobalButtonConfig = {
  enabled: true,
  iconSize: 18,
  minWidth: 32,
  marginRight: 8,
  showNotification: true,
  externalButtonsReserveWidth: 0
}

// 手机端全局按钮默认值
export const DEFAULT_MOBILE_GLOBAL_BUTTON_CONFIG: GlobalButtonConfig = {
  enabled: true,
  iconSize: 23,
  minWidth: 23,
  marginRight: 10,
  showNotification: true,
  externalButtonsReserveWidth: 0
}

// 兼容性：保留旧的导出名称（默认为桌面端）
export const DEFAULT_GLOBAL_BUTTON_CONFIG = DEFAULT_DESKTOP_GLOBAL_BUTTON_CONFIG

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
  toolbarZIndex: 5,
  useThemeColor: true,        // 颜色跟随主题

  // 顶部工具栏配置
  enableTopToolbar: false,    // 默认不启用（与底部工具栏互斥）
  topToolbarOffset: '50px',   // 距离顶部 50px
  topToolbarPaddingLeft: '0px', // 顶部工具栏左边距（居中显示）
}

export const DEFAULT_BUTTONS_CONFIG: ButtonConfig[] = []

// 桌面端默认按钮（9个，包含扩展工具栏按钮）
export const DEFAULT_DESKTOP_BUTTONS: ButtonConfig[] = [
  {
    id: 'overflow-button-desktop',
    name: '扩展工具栏',
    type: 'builtin',
    builtinId: 'overflow',
    icon: '⋯',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 0,
    platform: 'desktop',
    showNotification: false,
    enabled: false,
    layers: 1,
    buttonsPerLayer: [6, 6, 6, 6, 6],
    overflowToolbarHeight: 30,
    overflowToolbarWidth: 300
  },
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
    clickSequence: ['barPlugins', 'text:思源手机端增强'],
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
  },
  {
    id: 'recent-docs-desktop',
    name: '最近文档',
    type: 'shortcut',
    shortcutKey: 'Ctrl+E',
    icon: '📸',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 8,
    platform: 'desktop',
    showNotification: true
  }
]

// 移动端默认按钮（9个，包含扩展工具栏按钮）
export const DEFAULT_MOBILE_BUTTONS: ButtonConfig[] = [
  {
    id: 'overflow-button-mobile',
    name: '扩展工具栏',
    type: 'builtin',
    builtinId: 'overflow',
    icon: '⋯',
    iconSize: 23,
    minWidth: 23,
    marginRight: 10,
    sort: 0,
    platform: 'mobile',
    showNotification: true,
    layers: 2
  },
  {
    id: 'more-mobile',
    name: '更多',
    type: 'builtin',
    builtinId: 'more',
    icon: '✨',
    iconSize: 23,
    minWidth: 23,
    marginRight: 10,
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
    iconSize: 23,
    minWidth: 23,
    marginRight: 10,
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
    iconSize: 23,
    minWidth: 23,
    marginRight: 10,
    sort: 3,
    platform: 'mobile',
    showNotification: true
  },
  {
    id: 'plugin-settings-mobile',
    name: '插件设置',
    type: 'click-sequence',
    clickSequence: ['toolbarMore', 'menuPlugin', 'text:思源手机端增强'],
    icon: '⚙️',
    iconSize: 23,
    minWidth: 23,
    marginRight: 10,
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
    iconSize: 23,
    minWidth: 23,
    marginRight: 10,
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
    iconSize: 23,
    minWidth: 23,
    marginRight: 10,
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
    iconSize: 23,
    minWidth: 23,
    marginRight: 10,
    sort: 7,
    platform: 'mobile',
    showNotification: true
  },
  {
    id: 'recent-docs-mobile',
    name: '最近文档',
    type: 'builtin',
    builtinId: 'menuRecent',
    icon: '📸',
    iconSize: 23,
    minWidth: 23,
    marginRight: 10,
    sort: 8,
    platform: 'mobile',
    showNotification: true
  }
]

// ===== 扩展工具栏辅助常量 =====
const OVERFLOW_BUTTON_ID_MOBILE = 'overflow-button-mobile'
const OVERFLOW_BUTTON_ID_DESKTOP = 'overflow-button-desktop'

function isOverflowButton(id: string): boolean {
  return id === OVERFLOW_BUTTON_ID_MOBILE || id === OVERFLOW_BUTTON_ID_DESKTOP
}

// ===== 工具函数 =====
// 保存监听器引用以便清理
let resizeHandler: (() => void) | null = null
let mutationObserver: MutationObserver | null = null
let customButtonClickHandler: ((e: Event) => void) | null = null  // 专门用于自定义按钮的点击处理
let overflowCloseHandler: ((e: Event) => void) | null = null  // 扩展工具栏点击外部关闭监听器
let toolbarObserver: MutationObserver | null = null  // 用于监听工具栏渲染的观察器
// MutationObserver 防抖用的待执行定时器（需要能在 cleanup 中清理）
let pendingTimer: ReturnType<typeof setTimeout> | null = null
let toolbarStyleChangeHandler: (() => void) | null = null  // 工具栏样式变化事件处理器
let activeTimers: Set<ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>> = new Set()  // 跟踪所有活动的定时器（包括 setTimeout 和 setInterval）
const activeObservers: Set<MutationObserver> = new Set()  // 跟踪所有活动的 MutationObserver
let focusEventHandlers: Array<{ element: HTMLElement; focusHandler: () => void; blurHandler: () => void }> = []  // 跟踪焦点事件监听器以便清理
let isSettingUpToolbar = false  // 防止 MutationObserver 递归调用的标志
let currentButtonConfigs: ButtonConfig[] = []  // 保存当前按钮配置，用于重试机制
const toolbarCheckTimers = new Map<Element, ReturnType<typeof setTimeout>>()  // [已弃用] 保留兼容，不再写入

// 导出工具栏管理器对象
export const toolbarManager = {
  executeButton: async (config: ButtonConfig) => {
    await handleButtonClick(config);
  }
};

// 在初始化时设置全局变量
export function setGlobalToolbarManager() {
  (window as any).__toolbarManager = {
    executeButton: toolbarManager.executeButton,
    // 添加获取所有按钮配置的方法
    getAllButtonConfigs: () => {
      if (pluginInstance) {
        // 返回当前平台的按钮配置
        return pluginInstance.buttonConfigs || []
      }
      return []
    }
  };
}

/**
 * 安全的 setTimeout，返回的定时器会被跟踪以便清理
 */
function safeSetTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout> {
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
  activeTimers.forEach(timerId => {
    clearTimeout(timerId)
    clearInterval(timerId)
  })
  activeTimers.clear()
  activeObservers.forEach(obs => obs.disconnect())
  activeObservers.clear()
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
export function getButtonWidth(button: ButtonConfig): number {
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
export function calculateButtonOverflow(
  buttons: ButtonConfig[],
  overflowToolbarLayers: number = 1,
  externalButtonsReserveWidth: number = 0
): ButtonConfig[] {
  // 过滤出启用的移动端按钮，按排序值排序（从左到右）
  const enabledButtons = buttons.filter(btn =>
    btn.enabled !== false &&
    (btn.platform === 'mobile' || btn.platform === 'both') &&
    !isOverflowButton(btn.id)
  ).sort((a, b) => a.sort - b.sort)

  // 获取扩展工具栏按钮（⋯）
  const overflowButton = buttons.find(btn => isOverflowButton(btn.id))

  // 获取可用宽度
  const toolbarAvailableWidth = getToolbarAvailableWidth()

  // 主工具栏：需要预留 “⋯” 按钮 + 其他插件按钮预留宽度
  let mainAvailableWidth = toolbarAvailableWidth
  if (overflowButton && overflowButton.enabled !== false) {
    mainAvailableWidth -= getButtonWidth(overflowButton)
  }
  const reserveWidth = Math.max(0, Number(externalButtonsReserveWidth) || 0)
  mainAvailableWidth -= reserveWidth

  // 扩展工具栏实际渲染有 left:10px; right:10px; 共 20px 边距 + border:1px 左右共 2px
  // toolbarAvailableWidth 是面包屑宽度减去面包屑内边距，不含扩展工具栏的这 22px
  const overflowAvailableWidth = toolbarAvailableWidth - 22

  if (mainAvailableWidth <= 0 || overflowAvailableWidth <= 0) {
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

  // 检查扩展工具栏是否启用：禁用时 maxLayers = 0，溢出的按钮将被隐藏
  const isOverflowEnabled = overflowButton && overflowButton.enabled !== false
  const maxLayers = isOverflowEnabled ? (overflowToolbarLayers || 1) : 0

  // 逐个按钮计算层号：从左往右填
  let currentWidth = 0
  let currentLayer = 0

  for (const { button, width } of buttonWidths) {
    const availableWidthForLayer = currentLayer === 0 ? mainAvailableWidth : overflowAvailableWidth
    // 检查当前层是否已满
    if (currentWidth + width > availableWidthForLayer) {
      currentLayer++
      currentWidth = 0
      // 超过最大层数就放在隐藏层（overflowLevel = maxLayers + 1）
      if (currentLayer > maxLayers) {
        currentLayer = maxLayers + 1
      }
    }

    overflowMap.set(button.id, currentLayer)
    currentWidth += width
  }

  // 更新所有按钮的 overflowLevel
  const result = buttons.map(btn => {
    if (isOverflowButton(btn.id)) {
      return { ...btn, overflowLevel: 0 }
    }

    const newLevel = overflowMap.get(btn.id)
    if (newLevel !== undefined) {
      return { ...btn, overflowLevel: newLevel }
    }
    return { ...btn, overflowLevel: btn.overflowLevel ?? 0 }
  })

  return result
}

// ===== 移动端工具栏调整 =====

/**
 * 判断是否为移动端
 */
export function isMobileDevice(): boolean {
  const frontend = getFrontend()
  // 区分移动端和浏览器移动端模式
  const isNativeMobile = frontend === 'mobile'  // 原生移动端APP
  const isBrowserMobile = frontend === 'browser-mobile'  // 浏览器移动端模式
  const isMobile = isNativeMobile || isBrowserMobile
  return isMobile
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

  // 弹窗上下文特殊处理：如果弹窗开启了 overflow，强制显示 overflow 按钮
  // （即使主工具栏 overflow 按钮被禁用，弹窗里仍然需要显示）
  if (
    !isMobile &&
    isOverflowButton(button.id) &&
    typeof document !== 'undefined' &&
    document.body.hasAttribute('data-quick-note-block-window') &&
    isDesktopQuickNoteOverflowToolbarEnabled()
  ) {
    return true
  }

  // 检查是否启用
  if (button.enabled === false) return false

  // 检查平台
  if (button.platform === 'both') return true
  if (button.platform === 'mobile' && isMobile) return true
  if (button.platform === 'desktop' && !isMobile) return true

  return false
}

/**
 * 检查元素是否是输入框或可编辑元素（用于判断是否需要保持输入法状态）
 */
function isInputOrEditable(element: HTMLElement): boolean {
  if (!element) return false

  const tagName = element.tagName.toLowerCase()

  // 检查是否是输入框类型
  if (tagName === 'textarea' || tagName === 'input') {
    return true
  }

  // 检查是否是 contenteditable 元素（思源编辑器）
  if (element.isContentEditable) {
    return true
  }

  // 检查是否有 contenteditable 属性
  if (element.getAttribute('contenteditable') === 'true') {
    return true
  }

  return false
}

/**
 * 检查按钮是否应该显示在主工具栏（而非扩展工具栏）
 */
function shouldShowInMainToolbar(button: ButtonConfig): boolean {
  // 扩展工具栏按钮：启用时显示，禁用时隐藏
  // 弹窗上下文 + 弹窗 overflow 开启时，强制显示
  if (isOverflowButton(button.id)) {
    if (
      typeof document !== 'undefined' &&
      document.body.hasAttribute('data-quick-note-block-window') &&
      isDesktopQuickNoteOverflowToolbarEnabled()
    ) {
      return true
    }
    return button.enabled !== false
  }

  // 检查 overflowLevel：0 表示在主工具栏可见，>0 表示在扩展工具栏
  const overflowLevel = button.overflowLevel ?? 0
  return overflowLevel === 0
}

/**
 * 应用工具栏背景颜色（顶部和底部工具栏通用）
 */
export function applyToolbarBackgroundColor(config: MobileToolbarConfig, disableCustomButtons: boolean = false) {
  const backgroundColorStyleId = 'mobile-toolbar-background-color-style'
  let backgroundColorStyle = document.getElementById(backgroundColorStyleId) as HTMLStyleElement

  // 如果禁用了自定义按钮，则移除背景颜色样式
  if (disableCustomButtons) {
    if (backgroundColorStyle) {
      backgroundColorStyle.remove()
    }
    return
  }

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
      body.siyuan-toolbar-top-mode .protyle-breadcrumb,
      body.siyuan-toolbar-top-mode .protyle-breadcrumb__bar {
        background-color: var(--b3-theme-surface) !important;
        opacity: ${config.toolbarOpacity} !important;
      }

      /* 底部工具栏 - 使用主题颜色 */
      .protyle-breadcrumb__bar,
      .protyle-breadcrumb {
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
        body.siyuan-toolbar-top-mode .protyle-breadcrumb,
        body.siyuan-toolbar-top-mode .protyle-breadcrumb__bar {
          background-color: ${config.toolbarBackgroundColor} !important;
          opacity: ${config.toolbarOpacity} !important;
        }

        /* 底部工具栏 - 自定义颜色 */
        .protyle-breadcrumb__bar,
        .protyle-breadcrumb {
          background-color: ${config.toolbarBackgroundColor} !important;
          opacity: ${config.toolbarOpacity} !important;
        }
      }

      /* 黑暗模式 */
      html[data-theme-mode="dark"] {
        /* 顶部工具栏 - 自定义颜色（黑暗模式） */
        body.siyuan-toolbar-top-mode .protyle-breadcrumb,
        body.siyuan-toolbar-top-mode .protyle-breadcrumb__bar {
          background-color: ${config.toolbarBackgroundColorDark} !important;
          opacity: ${config.toolbarOpacity} !important;
        }

        /* 底部工具栏 - 自定义颜色（黑暗模式） */
        .protyle-breadcrumb__bar,
        .protyle-breadcrumb {
          background-color: ${config.toolbarBackgroundColorDark} !important;
          opacity: ${config.toolbarOpacity} !important;
        }
      }
    `
  }
}

// ===== 移动端工具栏调整 =====
export function initMobileToolbarAdjuster(config: MobileToolbarConfig, disableCustomButtons: boolean = false) {
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
      // 防止递归调用
      if (isSettingUpToolbar) return false

      // 优先查找 .protyle-breadcrumb（移动端使用）
      let breadcrumb = document.querySelector('.protyle-breadcrumb:not(.protyle-breadcrumb__bar)')

      // 如果没找到，尝试查找 .protyle-breadcrumb__bar（桌面端使用）
      if (!breadcrumb) {
        breadcrumb = document.querySelector('.protyle-breadcrumb__bar')
      }

      if (!breadcrumb) {
        return false
      }

      isSettingUpToolbar = true
      try {
        setupToolbarForElement(breadcrumb)
      } finally {
        isSettingUpToolbar = false
      }
      return true
    }

    const setupToolbarForElement = (toolbar: Element) => {
      // 防止重复设置
      if ((toolbar as HTMLElement).dataset.toolbarCustomized === 'true') return

      // 标记已设置
      (toolbar as HTMLElement).dataset.toolbarCustomized = 'true'

      // 初始设置
      let baseHeight = window.innerHeight  // 基准高度（输入法关闭时的高度）
      let inputMethodOpen = false

      // 创建 CSS 变量
      document.documentElement.style.setProperty('--mobile-toolbar-offset', config.closeInputOffset)
      
      // 更新工具栏位置
      function updateToolbarPosition() {
        const currentHeight = window.innerHeight
      
        // 计算高度变化百分比（相对于基准高度）
        const heightRatio = currentHeight / baseHeight
      
        // 如果当前高度比基准高度小阈值以上，认为输入法打开了
        const threshold = config.heightThreshold / 100
        const isNowOpen = heightRatio <= threshold
      
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
            // 重置基准高度为当前高度（因为现在输入法已关闭）
            baseHeight = currentHeight
          }
        }
      }
      
      // 延迟初始化，让 DOM 先渲染完成
      safeSetTimeout(() => {
        updateToolbarPosition()
        // 设置初始属性（根据实际状态）
        toolbar.setAttribute('data-input-method', inputMethodOpen ? 'open' : 'close')
      }, 100)

      // 监听窗口大小变化（替代 200ms 轮询，仅在尺寸变化时检测）
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

      // 如果禁用了自定义按钮，则不应用移动端工具栏样式
      if (disableCustomButtons) {
        style.textContent = ''
      } else {
        style.textContent = `
          /* 移动端工具栏样式 - iOS z-index 修复版 */
          @media (max-width: 768px) {
            .protyle-breadcrumb__bar[data-input-method],
            .protyle-breadcrumb[data-input-method] {
              position: fixed !important;
              bottom: calc(var(--mobile-toolbar-offset) + env(safe-area-inset-bottom)) !important;
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
              bottom: calc(var(--mobile-toolbar-offset) + env(safe-area-inset-bottom)) !important;
            }

            .protyle-breadcrumb__bar[data-input-method="close"],
            .protyle-breadcrumb[data-input-method="close"] {
              bottom: calc(var(--mobile-toolbar-offset) + env(safe-area-inset-bottom)) !important;
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
    }

    // 尝试设置工具栏
    if (!setupToolbar()) {
      // 如果没找到，根据配置延迟尝试
      const retryDelay = config.bottomToolbarRetryDelay ?? 2000;  // 默认 2000ms
      if (retryDelay > 0) {
        safeSetTimeout(() => {
          setupToolbar()
        }, retryDelay)
      }
    }

    // 应用背景颜色
    applyToolbarBackgroundColor(config, disableCustomButtons)

    // 防抖变量
    let observerTimer: ReturnType<typeof setTimeout> | null = null

    // 添加页面变化检测函数
    function updateToolbarVisibility() {
      const toolbars = document.querySelectorAll('[data-toolbar-customized="true"][data-input-method]') as NodeListOf<HTMLElement>
      // 只添加自定义属性，不改变原生逻辑
    }

    // 合并的 MutationObserver 回调（添加防抖）
    const handleMutation = () => {
      // 防止递归调用：如果正在设置工具栏，跳过
      if (isSettingUpToolbar) return
      if (observerTimer !== null) {
        clearTimeout(observerTimer)
      }
      observerTimer = safeSetTimeout(() => {
        // 设置标志，防止递归
        isSettingUpToolbar = true
        try {
          setupToolbar()
          updateToolbarVisibility()
        } finally {
          isSettingUpToolbar = false
        }
        observerTimer = null
      }, 100)
    }
    
    // 监听 DOM 变化（缩小监听范围，只监听直接子元素变化）
    const toolbarContainer = document.querySelector('.layout__center') ||
                            document.querySelector('.fn__flex-1.fn__flex-column') ||
                            document.body
    if (mutationObserver) mutationObserver.disconnect()
    mutationObserver = new MutationObserver(handleMutation)
    mutationObserver.observe(toolbarContainer, {
      childList: true,  // 只监听直接子元素
      subtree: false    // 不监听后代节点，提升性能
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
    // padding-top 只需补偿工具栏自身高度，不加 topToolbarOffset（.protyle 已位于原生顶栏下方）
    const paddingTopValue = toolbarHeightValue

    // 如果禁用了自定义按钮，则不应用顶部工具栏样式
    if (disableCustomButtons) {
      topToolbarStyle.textContent = ''
    } else {
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
    }

    // ===== 应用顶部工具栏背景颜色 =====
    applyToolbarBackgroundColor(config, disableCustomButtons)
    
    // ===== 添加重试加载机制（防止加载失效）=====
    const retryDelay = config.topToolbarRetryDelay ?? 0;  // 默认 0ms（无重试）
    if (retryDelay > 0) {
      safeSetTimeout(() => {
        // 重新检查并设置顶部工具栏
        if (config.enableTopToolbar) {
          applyToolbarBackgroundColor(config, disableCustomButtons)
        }
      }, retryDelay)
    }
  }
}

// ===== 自定义按钮功能 =====
export function initCustomButtons(configs: ButtonConfig[]) {
  // 保存当前配置，用于后续重试机制
  currentButtonConfigs = configs

  // 添加全局样式：移除主工具栏按钮的 focus 和 active 状态阴影（排除扩展工具栏按钮）
  if (!document.getElementById('custom-button-focus-style')) {
    const focusStyle = document.createElement('style')
    focusStyle.id = 'custom-button-focus-style'
    focusStyle.textContent = `
      /* 移除主工具栏自定义按钮的 focus 状态样式（包括阴影） */
      .protyle-breadcrumb__bar [data-custom-button]:not([data-custom-button="overflow-button-mobile"]):not([data-custom-button="overflow-button-desktop"]):focus,
      .protyle-breadcrumb [data-custom-button]:not([data-custom-button="overflow-button-mobile"]):not([data-custom-button="overflow-button-desktop"]):focus,
      .protyle-breadcrumb__bar [data-custom-button]:not([data-custom-button="overflow-button-mobile"]):not([data-custom-button="overflow-button-desktop"]):focus-visible,
      .protyle-breadcrumb [data-custom-button]:not([data-custom-button="overflow-button-mobile"]):not([data-custom-button="overflow-button-desktop"]):focus-visible {
        background-color: transparent !important;
        background: transparent !important;
        box-shadow: none !important;
        -webkit-box-shadow: none !important;
        outline: none !important;
        border: none !important;
        transform: none !important;
        filter: none !important;
        text-shadow: none !important;
        opacity: 1 !important;
      }
      /* 移除主工具栏自定义按钮的 active 状态阴影（点击时） */
      .protyle-breadcrumb__bar [data-custom-button]:not([data-custom-button="overflow-button-mobile"]):not([data-custom-button="overflow-button-desktop"]):active,
      .protyle-breadcrumb [data-custom-button]:not([data-custom-button="overflow-button-mobile"]):not([data-custom-button="overflow-button-desktop"]):active {
        background-color: transparent !important;
        background: transparent !important;
        box-shadow: none !important;
        -webkit-box-shadow: none !important;
        outline: none !important;
        border: none !important;
        transform: none !important;
        filter: none !important;
      }
      /* 保留主工具栏自定义按钮的 hover 状态背景（桌面端） */
      .protyle-breadcrumb__bar [data-custom-button]:not([data-custom-button="overflow-button-mobile"]):not([data-custom-button="overflow-button-desktop"]):hover,
      .protyle-breadcrumb [data-custom-button]:not([data-custom-button="overflow-button-mobile"]):not([data-custom-button="overflow-button-desktop"]):hover {
        /* 允许 JavaScript 控制悬停效果 */
      }
            
    `
    document.head.appendChild(focusStyle)
  }

  // 注意：这里不要做“全局清理所有按钮”，否则在文档切换/动态刷新时会出现
  // “按钮整排先消失再出现”的闪烁。按钮的增删改由 createButtonsForEditors
  // 在每个编辑器内做差异判断后局部更新即可。

  // 清理旧的工具栏观察器
  if (toolbarObserver) {
    toolbarObserver.disconnect()
    toolbarObserver = null
  }

  // 初始设置：用 rAF 等待一帧，尽量避免因 DOM 尚未就绪而反复重建
  // 额外加一个短延迟重试，覆盖某些设备/模式下工具栏渲染较慢的情况
  requestAnimationFrame(() => setupEditorButtons(configs))
  safeSetTimeout(() => setupEditorButtons(configs), 200)

  // 点击编辑器时触发按钮创建（不再使用 MutationObserver 持续监听，避免卡顿）

  // 移除旧的工具栏样式变化监听器
  if (toolbarStyleChangeHandler) {
    window.removeEventListener('toolbar-style-changed', toolbarStyleChangeHandler)
  }

  // 监听工具栏样式变化事件
  toolbarStyleChangeHandler = () => {
    const editors = document.querySelectorAll('.protyle')
    createButtonsForEditors(editors, configs)
  }
  window.addEventListener('toolbar-style-changed', toolbarStyleChangeHandler)

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
  // 清理分割线
  const oldDividers = document.querySelectorAll('[data-toolbar-divider]')
  oldDividers.forEach(div => div.remove())
}

function setupEditorButtons(configs: ButtonConfig[]) {
  // 保存按钮配置到全局变量，供扩展工具栏使用
  (window as any).__mobileButtonConfigs = configs

  // 找到扩展工具栏按钮，获取层数配置
  const overflowBtn = configs.find(btn => btn.id === OVERFLOW_BUTTON_ID_MOBILE)
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

      const reserveWidth = pluginInstance?.mobileGlobalButtonConfig?.externalButtonsReserveWidth ?? 0
      const updatedButtons = calculateButtonOverflow(configs, overflowLayers, reserveWidth)
      // 更新 configs 中的 overflowLevel
      updatedButtons.forEach(btn => {
        const original = configs.find(b => b.id === btn.id)
        if (original) {
          original.overflowLevel = btn.overflowLevel
        }
      })
    }

    // 溢出检测完成后再创建按钮（重新获取编辑器以确保 DOM 是最新的）
    const editors = document.querySelectorAll('.protyle')
    createButtonsForEditors(editors, configs)
  }

  // 启动溢出计算（完成后会创建按钮）
  requestAnimationFrame(calculateOverflowWithDelay)
}

/**
 * 为编辑器创建按钮
 */
export function createButtonsForEditors(editors: NodeListOf<Element>, configs: ButtonConfig[]) {
  // 获取工具栏样式配置（根据当前平台读取对应配置）
  const isMobile = pluginInstance?.isMobile
  const featureConfig = isMobile ? pluginInstance?.mobileFeatureConfig : pluginInstance?.desktopFeatureConfig
  const toolbarStyle = featureConfig?.toolbarStyle || 'default'
  const disableCustomButtons = featureConfig?.disableCustomButtons || false
  const useDivider = !disableCustomButtons && toolbarStyle === 'divider'

  // 桌面端：先关闭所有已打开的扩展工具栏（防止标签切换后残留）
  if (!isMobile) {
    document.querySelectorAll('.desktop-overflow-toolbar-layer').forEach(el => el.remove())
  }

  // 桌面端：根据 buttonsPerLayer 计算溢出层级
  let effectiveConfigs = configs
  if (!isMobile) {
    // 弹窗上下文：检查是否在一键记事弹窗 + 弹窗 overflow 是否启用
    const isPopupContext = typeof document !== 'undefined'
      && document.body.hasAttribute('data-quick-note-block-window')
    const forceOverflowEnabled = isPopupContext && isDesktopQuickNoteOverflowToolbarEnabled()
    const updated = calculateDesktopOverflow(configs, forceOverflowEnabled)
    // 同步 overflowLevel 回原数组
    updated.forEach(btn => {
      const original = configs.find(b => b.id === btn.id)
      if (original) original.overflowLevel = btn.overflowLevel
    })
  }

  editors.forEach(editor => {
    // 找到锁定编辑按钮
    const readonlyBtn = editor.querySelector('.protyle-breadcrumb__bar [data-type="readonly"]') ||
                        editor.querySelector('.protyle-breadcrumb [data-type="readonly"]')
    if (!readonlyBtn) return

    // 过滤并排序按钮（sort降序：大→小，这样sort 0在最右边，紧挨锁定按钮）
    const buttonsToAdd = configs
      .filter(button => shouldShowButton(button) && shouldShowInMainToolbar(button))
      .sort((a, b) => b.sort - a.sort) // 降序

    // 检查现有按钮是否与配置匹配，如果完全匹配则跳过重建
    const existingButtons = editor.querySelectorAll('[data-custom-button]')
    if (existingButtons.length > 0 && existingButtons.length === buttonsToAdd.length) {
      const existingIds = new Set(Array.from(existingButtons).map(btn => (btn as HTMLElement).dataset.customButton))
      const allMatch = buttonsToAdd.every(b => existingIds.has(b.id))
      if (allMatch) return // 按钮已存在且配置匹配，跳过
    }

    // 清理旧的插件按钮和分割线
    existingButtons.forEach(btn => btn.remove())
    const oldDividers = editor.querySelectorAll('[data-toolbar-divider]')
    oldDividers.forEach(div => div.remove())

    // 添加新按钮（插入到锁定按钮的左边）
    buttonsToAdd.forEach((buttonConfig, index) => {
      // 创建按钮配置副本，如果使用分割线则减少右边距1px
      const adjustedConfig = { ...buttonConfig }
      if (useDivider) {
        // 所有按钮右边距减1px，给分割线腾空间
        adjustedConfig.marginRight = Math.max(0, (buttonConfig.marginRight || 8) - 1)
      }

      // 如果需要分割线且不是第一个按钮，先添加分割线
      if (useDivider && index > 0) {
        const divider = document.createElement('div')
        divider.dataset.toolbarDivider = 'true'
        divider.style.cssText = `
          width: 1px;
          height: 20px;
          background: var(--b3-border-color);
          margin: 0;
          flex-shrink: 0;
          align-self: center;
        `
        readonlyBtn.insertAdjacentElement('beforebegin', divider)
      }

      const button = createButtonElement(adjustedConfig)
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
    background-color: rgba(0, 0, 0, 0) !important;
    color: var(--b3-theme-on-surface) !important;
    cursor: pointer !important;
    user-select: none !important;

    /* 移除聚焦轮廓和 active 状态 */
    outline: none !important;
    box-shadow: none !important;

    /* 过渡效果：仅过渡 opacity 和 transform，不过渡 background-color 避免暗黑模式闪白 */
    transition: opacity 0.15s ease, transform 0.15s ease !important;

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

  // 扩展工具栏按钮：设置 tabindex="-1" 阻止通过 Tab 键获得焦点
  if (isOverflowButton(config.id)) {
    button.setAttribute('tabindex', '-1')
  }

  // 应用基础样式（完全可控）
  button.style.cssText = getButtonBaseStyle(config)

  // 强制移除所有可能的阴影效果（覆盖思源全局样式）
  button.style.setProperty('box-shadow', 'none', 'important')
  button.style.setProperty('-webkit-box-shadow', 'none', 'important')
  button.style.setProperty('filter', 'none', 'important')

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
  } else if (/\.(png|jpg|jpeg|gif|svg)$/i.test(config.icon)) {
    // 图片路径（自定义图标）
    const pluginName = 'siyuan-toolbar-customizer'
    const imagePath = config.icon.startsWith('/plugins/') ? config.icon : `/plugins/${pluginName}/${config.icon}`
    const img = document.createElement('img')
    img.src = imagePath
    img.style.cssText = `
      width: ${config.iconSize}px;
      height: ${config.iconSize}px;
      object-fit: contain;
      flex-shrink: 0;
      display: block;
    `
    button.appendChild(img)
  } else {
    // Emoji 或文本图标
    const iconSpan = document.createElement('span')
    iconSpan.style.fontSize = `${config.iconSize}px`
    iconSpan.style.lineHeight = '1'
    iconSpan.textContent = config.icon
    button.appendChild(iconSpan)
  }

  // 如果开启显示名称，显示文字代替图标
  if (config.showName) {
    const nameLength = config.name?.length || 0
    // 最多显示4个字，超过则截取前4个字
    const displayName = nameLength > 4 ? config.name?.slice(0, 4) : config.name
    button.innerHTML = ''
    const nameSpan = document.createElement('span')
    nameSpan.textContent = displayName
    // 动态计算字体大小：字数越少字体越大，字数越多字体越小
    const displayLength = displayName?.length || 0
    let fontSize = 18 // 默认字体大小
    if (displayLength === 1) fontSize = 22
    else if (displayLength === 2) fontSize = 20
    else if (displayLength === 3) fontSize = 18
    else if (displayLength >= 4) fontSize = 16
    nameSpan.style.cssText = `
      font-size: ${fontSize}px;
      width: 100%;
      text-align: center;
    `
    button.appendChild(nameSpan)
  }

  // 添加 hover 效果（与思源原生按钮一致）
  button.addEventListener('mouseenter', () => {
    button.classList.add('custom-button-hover')
  })
  button.addEventListener('mouseleave', () => {
    button.classList.remove('custom-button-hover')
  })
  button.addEventListener('touchstart', () => {
    button.classList.add('custom-button-hover')
  }, { passive: true })
  button.addEventListener('touchend', () => {
    button.classList.remove('custom-button-hover')
  })

  // 保存选区的变量（用于快捷键按钮）
  let savedSelection: Range | null = null
  let lastActiveElement: HTMLElement | null = null
  let isTouchEvent = false

  // 扩展工具栏按钮的特殊处理：阻止焦点转移
  if (isOverflowButton(config.id)) {
    // 使用 pointerdown 事件（在鼠标/触摸按下时触发，早于 mousedown/touchstart）
    // 设置 pointer-events: none 可以完全阻止焦点转移，但也会阻止点击
    // 所以我们用另一种方法：阻止按钮成为默认焦点目标
    button.addEventListener('pointerdown', (e) => {
      // 保存当前焦点元素
      lastActiveElement = document.activeElement as HTMLElement
    })

    // touchstart 保存状态
    button.addEventListener('touchstart', () => {
      isTouchEvent = true
      lastActiveElement = document.activeElement as HTMLElement
    }, { passive: true })

    // touchend 清除标记
    button.addEventListener('touchend', () => {
      setTimeout(() => { isTouchEvent = false }, 100)
    })
  } else {
    // 其他按钮：保持原有逻辑
    // 在 mousedown 时保存选区和焦点元素（此时编辑器还未失去焦点）
    button.addEventListener('mousedown', (e) => {
      if (isTouchEvent) return // 如果是触摸事件，跳过 mousedown
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        savedSelection = selection.getRangeAt(0).cloneRange()
      }
      lastActiveElement = document.activeElement as HTMLElement
    })

    // 移动端：touchstart 时保存状态
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
  }

  // 绑定点击事件
  button.addEventListener('click', async (e) => {
    e.stopPropagation()

    // 扩展工具栏按钮特殊处理（toggle 扩展工具栏）
    if (isOverflowButton(config.id)) {
      button.blur()
      if (lastActiveElement && isInputOrEditable(lastActiveElement)) {
        lastActiveElement.focus({ preventScroll: true })
      }
      if (config.id === OVERFLOW_BUTTON_ID_MOBILE) {
        showOverflowToolbar(config)
      } else if (config.id === OVERFLOW_BUTTON_ID_DESKTOP) {
        showDesktopOverflowToolbar(config, button)
      }
      return
    }

    // 主工具栏按钮点击后立即移除焦点和背景色（避免“阴影”一直显示）
    button.blur()
    button.style.setProperty('background-color', 'transparent', 'important')
    button.style.setProperty('background', 'transparent', 'important')
    
    // 弹窗框模板选择特殊处理：立即恢复焦点，保持输入法不关闭
    const isPopupSelect = config.type === 'author-tool' && config.authorToolSubtype === 'popup-select'
    if (isPopupSelect && lastActiveElement && isInputOrEditable(lastActiveElement)) {
      lastActiveElement.focus({ preventScroll: true })
    }
    
    // 如果扩展工具栏已打开，先关闭它（其他按钮点击会关闭扩展工具栏）
    const existingLayers = document.querySelectorAll('.overflow-toolbar-layer, .desktop-overflow-toolbar-layer')
    if (existingLayers.length > 0) {
      existingLayers.forEach(el => el.remove())
      // 移除扩展工具栏按钮的激活状态
      const overflowButton = document.querySelector('[data-custom-button="overflow-button-mobile"], [data-custom-button="overflow-button-desktop"]') as HTMLElement
      if (overflowButton) {
        overflowButton.classList.remove('overflow-active')
        overflowButton.style.backgroundColor = 'transparent'
      }
    }

    // 将保存的选区和按钮元素传递给处理函数（使用 await 保持 async 链条）
    await handleButtonClick(config, savedSelection, lastActiveElement, null)

    // builtin 类型的按钮不恢复焦点，让输入法自然关闭
    // 其他类型恢复焦点（preventScroll 防止浏览器自动滚动到顶部）
    if (config.type !== 'builtin') {
      if (lastActiveElement && lastActiveElement !== document.activeElement) {
        ;(lastActiveElement as HTMLElement).focus({ preventScroll: true })
      }
    }
  })

  return button
}


/**
 * 显示/隐藏扩展工具栏弹窗
 * @param config 扩展工具栏按钮配置
 */
function showOverflowToolbar(config: ButtonConfig) {
  // 获取扩展工具栏按钮
  const overflowButton = document.querySelector(`[data-custom-button="${config.id}"]`) as HTMLElement

  // 检查是否已存在扩展工具栏（存在则关闭）
  const existingLayers = document.querySelectorAll('.overflow-toolbar-layer')

  if (existingLayers.length > 0) {
    // 移除所有工具栏层
    existingLayers.forEach(el => el.remove())
    // 移除按钮的激活状态
    if (overflowButton) {
      overflowButton.classList.remove('overflow-active')
      overflowButton.style.backgroundColor = 'transparent'
      overflowButton.blur()
    }
    // 清理点击外部关闭监听器
    if (overflowCloseHandler) {
      document.removeEventListener('click', overflowCloseHandler)
      document.removeEventListener('touchend', overflowCloseHandler)
      overflowCloseHandler = null
    }
    Notify.showOverflowToolbarClosed(config.showNotification !== false)
    return
  }

  // 添加按钮的激活状态
  if (overflowButton) {
    overflowButton.classList.add('overflow-active')
    overflowButton.style.backgroundColor = 'var(--b3-list-hover)'
  }

  // 检测工具栏位置：通过 body 类名判断是否启用了底部工具栏
  const isBottomToolbar = document.body.classList.contains('siyuan-toolbar-customizer-enabled')

  // 获取层数配置（1-5层）
  const layers = config.layers || 1

  // 获取移动端工具栏配置
  const mobileConfig = (window as any).__mobileToolbarConfig as MobileToolbarConfig

  // 工具栏高度和间距（根据顶部/底部模式从不同配置读取，默认值 40px 和 4px）
  const toolbarHeight = isBottomToolbar
    ? (parseInt(mobileConfig?.overflowToolbarHeightBottom || '') || 40)
    : (parseInt(mobileConfig?.overflowToolbarHeightTop || '') || 40)
  const toolbarSpacing = 4

  // 顶部工具栏和底部工具栏的不同偏移
  // 顶部模式：计算 = topToolbarOffset + 主工具栏高度 + overflowToolbarDistanceTop
  let topOffset = 100  // 默认值（无 mobileConfig 时的兜底）
  if (mobileConfig) {
    const topOffsetNum = parseInt(String(mobileConfig.topToolbarOffset ?? '50'), 10)
    const safeTop = Number.isNaN(topOffsetNum) ? 50 : topOffsetNum
    const _distanceTop = parseInt(String(mobileConfig.overflowToolbarDistanceTop ?? ''), 10)
    const distanceTopNum = Number.isNaN(_distanceTop) ? 8 : _distanceTop
    const mainToolbarHeightTop = parseInt(String(mobileConfig.toolbarHeight ?? '40'), 10) || 40
    topOffset = safeTop + mainToolbarHeightTop + distanceTopNum
  }
  // 底部模式：计算 = closeInputOffset + 主工具栏高度 + overflowToolbarDistanceBottom
  // 注意：不能用 if (mobileConfig?.closeInputOffset) —— 持久化里可能是数字 0、null、""，会误判为假，
  // 从而整段不执行、bottomOffset 恒为 60，导致 overflowToolbarDistanceBottom 永远不生效。
  let bottomOffset = 60
  if (mobileConfig) {
    const bottomOffsetNum = parseInt(String(mobileConfig.closeInputOffset ?? '0'), 10)
    const safeBottom = Number.isNaN(bottomOffsetNum) ? 0 : bottomOffsetNum
    const _distanceBottom = parseInt(String(mobileConfig.overflowToolbarDistanceBottom ?? ''), 10)
    const distanceBottomNum = Number.isNaN(_distanceBottom) ? 8 : _distanceBottom
    const mainToolbarHeightBottom = parseInt(String(mobileConfig.toolbarHeight ?? '40'), 10) || 40
    bottomOffset = safeBottom + mainToolbarHeightBottom + distanceBottomNum
  }

  // 获取所有按钮配置
  const allButtons = (window as any).__mobileButtonConfigs || []

  // 过滤出启用的按钮（排除扩展工具栏按钮本身）
  const enabledButtons = allButtons.filter((btn: ButtonConfig) =>
    btn.enabled !== false &&
    (btn.platform === 'mobile' || btn.platform === 'both') &&
    btn.id !== OVERFLOW_BUTTON_ID_MOBILE
  )

  // 获取工具栏样式配置（根据当前平台读取对应配置）
  const isMobile = pluginInstance?.isMobile
  const featureConfig = isMobile ? pluginInstance?.mobileFeatureConfig : pluginInstance?.desktopFeatureConfig
  const toolbarStyle = featureConfig?.toolbarStyle || 'default'
  const disableCustomButtons = featureConfig?.disableCustomButtons || false
  const useDivider = !disableCustomButtons && toolbarStyle === 'divider'

  // 根据工具栏位置选择动画方向
  const animationName = isBottomToolbar ? 'slideUp' : 'slideDown'

  // 添加动画样式和按钮状态样式
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
      /* 移除自定义按钮的 focus 状态样式（保留 active 状态以显示点击效果） */
      [data-custom-button]:focus {
        background-color: transparent !important;
        box-shadow: none !important;
        outline: none !important;
        transform: none !important;
      }
      /* 移除扩展工具栏按钮的 focus 状态样式 */
      .overflow-toolbar-layer button:focus {
        background-color: transparent !important;
        box-shadow: none !important;
        outline: none !important;
        transform: none !important;
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
      /* 移除自定义按钮的 focus 状态样式（保留 active 状态以显示点击效果） */
      [data-custom-button]:focus {
        background-color: transparent !important;
        box-shadow: none !important;
        outline: none !important;
        transform: none !important;
      }
      /* 移除扩展工具栏按钮的 focus 状态样式 */
      .overflow-toolbar-layer button:focus {
        background-color: transparent !important;
        box-shadow: none !important;
        outline: none !important;
        transform: none !important;
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
    if (mobileConfig) {
      if (mobileConfig.useThemeColor) {
        // 使用主题颜色时，只需要调整透明度
        toolbar.style.backgroundColor = `var(--b3-theme-surface)`
        toolbar.style.opacity = mobileConfig.toolbarOpacity.toString()
      } else {
        // 使用自定义颜色
        const isDark = document.documentElement.getAttribute('data-theme-mode') === 'dark'
        const bgColor = isDark ? mobileConfig.toolbarBackgroundColorDark : mobileConfig.toolbarBackgroundColor
        toolbar.style.backgroundColor = bgColor
        toolbar.style.opacity = mobileConfig.toolbarOpacity.toString()
      }
    }

    // 添加该层的所有按钮
    layerButtons.forEach((btn: ButtonConfig, index: number) => {
      // 如果需要分割线且不是第一个按钮，先添加分割线
      if (useDivider && index > 0) {
        const divider = document.createElement('div')
        divider.dataset.toolbarDivider = 'true'
        divider.style.cssText = `
          width: 1px;
          height: 20px;
          background: var(--b3-border-color);
          margin: 0;
          flex-shrink: 0;
          align-self: center;
        `
        toolbar.appendChild(divider)
      }

      // 创建按钮配置副本，如果使用分割线则减少右边距1px
      const adjustedBtn = { ...btn }
      if (useDivider) {
        adjustedBtn.marginRight = Math.max(0, (btn.marginRight || 8) - 1)
      }

      const layerBtn = document.createElement('button')
      // 使用与主工具栏相同的样式函数，确保完全一致
      layerBtn.className = 'fn__flex-center ariaLabel'
      layerBtn.style.cssText = getButtonBaseStyle(adjustedBtn)
      layerBtn.setAttribute('aria-label', btn.name)
      layerBtn.dataset.customButton = btn.id  // 添加 data-custom-button 属性，使按钮可被查找

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
      } else if (/\.(png|jpg|jpeg|gif|svg)$/i.test(btn.icon)) {
        // 图片路径（自定义图标）
        const pluginName = 'siyuan-toolbar-customizer'
        const imagePath = btn.icon.startsWith('/plugins/') ? btn.icon : `/plugins/${pluginName}/${btn.icon}`
        const img = document.createElement('img')
        img.src = imagePath
        img.style.cssText = `
          width: ${btn.iconSize}px;
          height: ${btn.iconSize}px;
          object-fit: contain;
          flex-shrink: 0;
          display: block;
        `
        layerBtn.appendChild(img)
      } else {
        // Emoji 或文本图标
        const iconSpan = document.createElement('span')
        iconSpan.style.fontSize = `${btn.iconSize}px`
        iconSpan.style.lineHeight = '1'
        iconSpan.textContent = btn.icon
        layerBtn.appendChild(iconSpan)
      }

      // 如果开启显示名称，显示文字代替图标
      if (btn.showName) {
        const nameLength = btn.name?.length || 0
        // 最多显示4个字，超过则截取前4个字
        const displayName = nameLength > 4 ? btn.name?.slice(0, 4) : btn.name
        layerBtn.innerHTML = ''
        const nameSpan = document.createElement('span')
        nameSpan.textContent = displayName
        // 动态计算字体大小：字数越少字体越大，字数越多字体越小
        const displayLength = displayName?.length || 0
        let fontSize = 18 // 默认字体大小
        if (displayLength === 1) fontSize = 22
        else if (displayLength === 2) fontSize = 20
        else if (displayLength === 3) fontSize = 18
        else if (displayLength >= 4) fontSize = 16
        nameSpan.style.cssText = `
          font-size: ${fontSize}px;
          width: 100%;
          text-align: center;
        `
        layerBtn.appendChild(nameSpan)
      }

      // 添加 hover 效果（与思源原生按钮一致）
      layerBtn.addEventListener('mouseenter', () => {
        layerBtn.classList.add('custom-button-hover')
      })
      layerBtn.addEventListener('mouseleave', () => {
        layerBtn.classList.remove('custom-button-hover')
      })
      layerBtn.addEventListener('touchstart', () => {
        layerBtn.classList.add('custom-button-hover')
      }, { passive: true })
      layerBtn.addEventListener('touchend', () => {
        layerBtn.classList.remove('custom-button-hover')
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
      layerBtn.addEventListener('click', async (e) => {
        e.stopPropagation()
        e.preventDefault()  // 阻止默认行为，包括按钮获得焦点

        // 关闭扩展工具栏
        document.querySelectorAll('.overflow-toolbar-layer').forEach(el => el.remove())

        // 弹窗框模板选择特殊处理：在执行功能前先恢复焦点，保持输入法不关闭
        const isPopupSelect = btn.type === 'author-tool' && btn.authorToolSubtype === 'popup-select'
        if (isPopupSelect && lastActiveElement && isInputOrEditable(lastActiveElement)) {
          lastActiveElement.focus({ preventScroll: true })
        }

        // 将保存的选区传递给处理函数（使用 await 保持 async 链条）
        await handleButtonClick(btn, savedSelection, lastActiveElement)

        // builtin 类型的按钮不恢复焦点，让输入法自然关闭
        // 其他类型恢复焦点，保持输入法打开（preventScroll 防止浏览器自动滚动到顶部）
        if (btn.type !== 'builtin') {
          if (lastActiveElement && lastActiveElement !== document.activeElement) {
            ;(lastActiveElement as HTMLElement).focus({ preventScroll: true })
          }
        }

        // 确保按钮没有焦点（使用 setTimeout 确保在其他操作之后）
        setTimeout(() => layerBtn.blur(), 0)
      })

      toolbar.appendChild(layerBtn)
    })

    // 阻止触摸事件冒泡到 document，防止被其他 handler 意外关闭
    toolbar.addEventListener('touchstart', (e) => {
      e.stopPropagation()
    }, { passive: true })

    document.body.appendChild(toolbar)
  }

  Notify.showOverflowToolbarOpened(layers, config.showNotification !== false)

  // 点击/触摸外部关闭
  const closeOnOutside = (e: Event) => {
    const target = e.target as HTMLElement
    const overflowButton = document.querySelector(`[data-custom-button="${config.id}"]`) as HTMLElement
    const hasToolbar = document.querySelector('.overflow-toolbar-layer')

    if (hasToolbar && !target.closest('.overflow-toolbar-layer') && (!overflowButton || !overflowButton.contains(target))) {
      document.querySelectorAll('.overflow-toolbar-layer').forEach(el => el.remove())
      // 移除溢出按钮的焦点和激活状态
      if (overflowButton) {
        overflowButton.classList.remove('overflow-active')
        overflowButton.style.backgroundColor = 'transparent'
        overflowButton.blur()
      }
      if (overflowCloseHandler) {
        document.removeEventListener('click', overflowCloseHandler)
        document.removeEventListener('touchend', overflowCloseHandler)
        overflowCloseHandler = null
      }
    }
  }
  overflowCloseHandler = closeOnOutside
  setTimeout(() => {
    if (overflowCloseHandler) {
      document.addEventListener('click', overflowCloseHandler)
      document.addEventListener('touchend', overflowCloseHandler)
    }
  }, 100)
}

/**
 * 桌面端扩展工具栏：按 buttonsPerLayer 手动分配溢出层级
 * 按 sort 排序后，前 buttonsPerLayer[0] 个 → 主工具栏，接下来 buttonsPerLayer[1] 个 → 第1层，以此类推
 */
export function calculateDesktopOverflow(buttons: ButtonConfig[], forceEnabled = false): ButtonConfig[] {
  const overflowBtn = buttons.find(btn => btn.id === OVERFLOW_BUTTON_ID_DESKTOP)
  if (!overflowBtn || (overflowBtn.enabled === false && !forceEnabled)) {
    // 扩展工具栏未启用，所有按钮都在主工具栏
    return buttons.map(btn => ({ ...btn, overflowLevel: 0 }))
  }

  const buttonsPerLayer = overflowBtn.buttonsPerLayer || [8, 5, 5, 5, 5]
  const layers = overflowBtn.layers || 1

  // 按 sort 排序的普通按钮（排除溢出按钮本身）
  const normalButtons = buttons
    .filter(btn => !isOverflowButton(btn.id) && btn.enabled !== false)
    .sort((a, b) => a.sort - b.sort)

  // 分配层级
  const overflowMap = new Map<string, number>()
  let idx = 0
  for (let layer = 0; layer <= layers; layer++) {
    const count = buttonsPerLayer[layer] ?? (layer === 0 ? 8 : 5)
    // count === 0 时跳过该层，按钮不会被分配到这层
    for (let i = 0; i < count && idx < normalButtons.length; i++, idx++) {
      overflowMap.set(normalButtons[idx].id, layer)
    }
  }
  // 剩余的按钮分配到最后一层之后（隐藏）
  while (idx < normalButtons.length) {
    overflowMap.set(normalButtons[idx].id, layers + 1)
    idx++
  }

  return buttons.map(btn => {
    if (isOverflowButton(btn.id)) return { ...btn, overflowLevel: 0 }
    const newLevel = overflowMap.get(btn.id)
    if (newLevel !== undefined) return { ...btn, overflowLevel: newLevel }
    return { ...btn, overflowLevel: btn.overflowLevel ?? 0 }
  })
}

// 存储桌面端溢出工具栏的点击外部关闭处理器
let desktopOverflowCloseHandlers = new WeakMap<HTMLElement, (e: MouseEvent) => void>()

/**
 * 关闭指定面包屑栏的桌面端扩展工具栏
 */
function closeDesktopOverflowToolbar(breadcrumbBar: HTMLElement, overflowButton: HTMLElement) {
  breadcrumbBar.querySelectorAll('.desktop-overflow-toolbar-layer').forEach(el => el.remove())
  // 恢复面包屑栏原始 overflow 和 position
  breadcrumbBar.style.removeProperty('overflow')
  breadcrumbBar.style.removeProperty('position')
  // 恢复父容器 overflow
  const breadcrumb = breadcrumbBar.closest('.protyle-breadcrumb') as HTMLElement
  if (breadcrumb) {
    breadcrumb.style.removeProperty('overflow')
  }
  overflowButton.classList.remove('overflow-active')
  overflowButton.style.setProperty('background-color', 'rgba(0, 0, 0, 0)', 'important')
  overflowButton.blur()
  // 移除外部点击处理器
  const handler = desktopOverflowCloseHandlers.get(breadcrumbBar)
  if (handler) {
    document.removeEventListener('click', handler)
    desktopOverflowCloseHandlers.delete(breadcrumbBar)
  }
}

/**
 * 桌面端：显示/隐藏扩展工具栏弹窗
 * 与手机端不同，使用 absolute 定位相对于面包屑栏，自然支持多编辑器
 */
function showDesktopOverflowToolbar(config: ButtonConfig, clickedButton: HTMLElement) {
  // 桌面端有两种面包屑容器：.protyle-breadcrumb__bar 和 .protyle-breadcrumb
  const breadcrumbBar = clickedButton.closest('.protyle-breadcrumb__bar') as HTMLElement
    || clickedButton.closest('.protyle-breadcrumb:not(.protyle-breadcrumb__bar)') as HTMLElement
  if (!breadcrumbBar) return

  // 检查此编辑器的溢出是否已打开
  const existingLayers = breadcrumbBar.querySelectorAll('.desktop-overflow-toolbar-layer')
  if (existingLayers.length > 0) {
    closeDesktopOverflowToolbar(breadcrumbBar, clickedButton)
    return
  }

  // 设置面包屑栏支持 absolute 定位的子元素
  breadcrumbBar.style.position = 'relative'
  breadcrumbBar.style.overflow = 'visible'
  // 确保父容器也不裁剪
  const breadcrumb = breadcrumbBar.closest('.protyle-breadcrumb') as HTMLElement
  if (breadcrumb) {
    breadcrumb.style.overflow = 'visible'
  }

  // 添加按钮的激活状态
  clickedButton.classList.add('overflow-active')
  clickedButton.style.backgroundColor = 'color-mix(in srgb, var(--b3-theme-on-surface) 10%, transparent)'

  const layers = config.layers || 1
  const toolbarHeight = config.overflowToolbarHeight || 32
  const toolbarWidthPx = Math.min(config.overflowToolbarWidth || 0, 1300)

  // 获取桌面端按钮配置
  const allButtons = pluginInstance?.desktopButtonConfigs || []
  const enabledButtons = allButtons.filter((btn: ButtonConfig) =>
    btn.enabled !== false &&
    (btn.platform === 'desktop' || btn.platform === 'both') &&
    btn.id !== OVERFLOW_BUTTON_ID_DESKTOP
  )

  // 添加动画样式
  let animationStyle = document.getElementById('desktop-overflow-toolbar-animation')
  if (!animationStyle) {
    animationStyle = document.createElement('style')
    animationStyle.id = 'desktop-overflow-toolbar-animation'
    animationStyle.textContent = `
      @keyframes desktopOverflowSlideDown {
        from { opacity: 0; transform: translateY(-6px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .desktop-overflow-toolbar-layer {
        animation: desktopOverflowSlideDown 0.2s ease-out;
      }
      .desktop-overflow-toolbar-layer button:focus {
        background-color: transparent !important;
        box-shadow: none !important;
        outline: none !important;
      }
    `
    document.head.appendChild(animationStyle)
  }

  // 按层创建工具栏
  for (let i = 0; i < layers; i++) {
    const layerNum = i + 1
    const layerButtons = enabledButtons
      .filter((btn: ButtonConfig) => (btn.overflowLevel ?? 0) === layerNum)
      .sort((a: ButtonConfig, b: ButtonConfig) => b.sort - a.sort) // 降序

    if (layerButtons.length === 0) continue

    const toolbar = document.createElement('div')
    toolbar.className = 'desktop-overflow-toolbar-layer'
    toolbar.dataset.overflowLayer = String(layerNum)
    toolbar.style.cssText = `
      position: absolute;
      top: calc(100% + ${i * (toolbarHeight + 6)}px);
      right: 0;
      ${toolbarWidthPx > 0 ? `width: ${toolbarWidthPx}px;` : 'left: 0;'}
      height: ${toolbarHeight}px;
      background: color-mix(in srgb, var(--b3-theme-background) 72%, transparent);
      backdrop-filter: blur(24px) saturate(180%);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
      border: 1px solid var(--b3-theme-primary);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding: 0 6px;
      z-index: ${10000 + i};
      box-shadow:
        0 0 0 0.5px color-mix(in srgb, var(--b3-border-color) 30%, transparent),
        0 2px 8px rgba(0, 0, 0, 0.06),
        0 8px 24px rgba(0, 0, 0, 0.08);
    `

    // 添加该层的按钮
    layerButtons.forEach((btn: ButtonConfig) => {
      const layerBtn = document.createElement('button')
      layerBtn.className = 'fn__flex-center ariaLabel'
      layerBtn.style.cssText = getButtonBaseStyle(btn)
      layerBtn.setAttribute('aria-label', btn.name)
      layerBtn.dataset.customButton = btn.id

      // 渲染图标（与主工具栏保持一致的完整分支）
      if (btn.icon.startsWith('icon')) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('width', `${btn.iconSize}`)
        svg.setAttribute('height', `${btn.iconSize}`)
        svg.style.cssText = 'flex-shrink: 0; display: block;'
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
        use.setAttribute('href', `#${btn.icon}`)
        svg.appendChild(use)
        layerBtn.appendChild(svg)
      } else if (btn.icon.startsWith('lucide:')) {
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
            const svg = layerBtn.querySelector('svg')
            if (svg) {
              svg.style.cssText = 'flex-shrink: 0; display: block;'
            }
          } else {
            layerBtn.textContent = btn.icon
            layerBtn.style.fontSize = `${btn.iconSize}px`
          }
        } catch (e) {
          layerBtn.textContent = btn.icon
          layerBtn.style.fontSize = `${btn.iconSize}px`
        }
      } else if (/\.(png|jpg|jpeg|gif|svg)$/i.test(btn.icon)) {
        const pluginName = 'siyuan-toolbar-customizer'
        const imagePath = btn.icon.startsWith('/plugins/') ? btn.icon : `/plugins/${pluginName}/${btn.icon}`
        const img = document.createElement('img')
        img.src = imagePath
        img.style.cssText = `
          width: ${btn.iconSize}px;
          height: ${btn.iconSize}px;
          object-fit: contain;
          flex-shrink: 0;
          display: block;
        `
        layerBtn.appendChild(img)
      } else {
        const iconSpan = document.createElement('span')
        iconSpan.style.fontSize = `${btn.iconSize}px`
        iconSpan.style.lineHeight = '1'
        iconSpan.textContent = btn.icon
        layerBtn.appendChild(iconSpan)
      }

      // 显示名称
      if (btn.showName) {
        const displayName = btn.name?.length > 4 ? btn.name.slice(0, 4) : btn.name
        layerBtn.innerHTML = ''
        const nameSpan = document.createElement('span')
        nameSpan.textContent = displayName
        const displayLength = displayName?.length || 0
        let fontSize = 18
        if (displayLength === 1) fontSize = 22
        else if (displayLength === 2) fontSize = 20
        else if (displayLength === 3) fontSize = 18
        else if (displayLength >= 4) fontSize = 16
        nameSpan.style.cssText = `font-size: ${fontSize}px; width: 100%; text-align: center;`
        layerBtn.appendChild(nameSpan)
      }

      // hover 效果 — 苹果风格柔和过渡
      layerBtn.style.transition = 'background-color 0.15s ease, transform 0.15s ease'
      layerBtn.style.borderRadius = '6px'
      layerBtn.addEventListener('mouseenter', () => {
        layerBtn.style.backgroundColor = 'color-mix(in srgb, var(--b3-theme-on-surface) 8%, transparent)'
      })
      layerBtn.addEventListener('mouseleave', () => {
        layerBtn.style.backgroundColor = 'transparent'
      })

      // 保存选区
      let savedSelection: Range | null = null
      let lastActiveElement: HTMLElement | null = null
      layerBtn.addEventListener('mousedown', () => {
        const selection = window.getSelection()
        if (selection && selection.rangeCount > 0) {
          savedSelection = selection.getRangeAt(0).cloneRange()
        }
        lastActiveElement = document.activeElement as HTMLElement
      })

      // 点击执行功能
      layerBtn.addEventListener('click', async (e) => {
        e.stopPropagation()
        e.preventDefault()

        // 关闭扩展工具栏
        closeDesktopOverflowToolbar(breadcrumbBar, clickedButton)

        await handleButtonClick(btn, savedSelection, lastActiveElement)

        if (btn.type !== 'builtin' && lastActiveElement && lastActiveElement !== document.activeElement) {
          ;(lastActiveElement as HTMLElement).focus({ preventScroll: true })
        }
        setTimeout(() => layerBtn.blur(), 0)
      })

      toolbar.appendChild(layerBtn)
    })

    breadcrumbBar.appendChild(toolbar)
  }

  // 检查是否实际创建了任何层
  const createdLayers = breadcrumbBar.querySelectorAll('.desktop-overflow-toolbar-layer')
  if (createdLayers.length === 0) {
    // 没有溢出按钮可显示，恢复状态并提示
    breadcrumbBar.style.removeProperty('overflow')
    breadcrumbBar.style.removeProperty('position')
    const breadcrumb = breadcrumbBar.closest('.protyle-breadcrumb') as HTMLElement
    if (breadcrumb) breadcrumb.style.removeProperty('overflow')
    clickedButton.classList.remove('overflow-active')
    clickedButton.style.removeProperty('background-color')
    showMessage('扩展工具栏中没有按钮，请在设置中调整「每层按钮数量」配置', 3000, 'info')
    return
  }

  Notify.showOverflowToolbarOpened(layers, config.showNotification !== false)

  // 点击外部关闭
  const closeHandler = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (!target.closest('.desktop-overflow-toolbar-layer') &&
        !target.closest(`[data-custom-button="${OVERFLOW_BUTTON_ID_DESKTOP}"]`)) {
      closeDesktopOverflowToolbar(breadcrumbBar, clickedButton)
    }
  }
  desktopOverflowCloseHandlers.set(breadcrumbBar, closeHandler)
  safeSetTimeout(() => document.addEventListener('click', closeHandler), 50)
}

/**
 * 处理按钮点击
 */
async function handleButtonClick(
  config: ButtonConfig,
  savedSelection: Range | null,
  lastActiveElement: HTMLElement | null,
  clickedButton: HTMLElement | null
) {
  // 如果开启了右上角提示，显示消息
  const notificationEnabled = config.showNotification !== false
  Notify.showButtonExecNotification(config.name, notificationEnabled)

  // 执行功能
  if (config.type === 'builtin') {
    // 执行思源内置功能
    executeBuiltinFunction(config)
  } else if (config.type === 'builtin-refresh') {
    // 执行思源刷新、重载、全屏功能
    executeBuiltinRefreshFunction(config)
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
    // 执行鲸鱼定制工具箱
    await executeAuthorTool(config, savedSelection, lastActiveElement)
  } else if (config.type === 'quick-note') {
    // 执行一键记事功能
    await executeQuickNote(config)
  } else if (config.type === 'popup-select') {
    // 执行弹窗选择输入功能
    await executePopupSelect(config, savedSelection, lastActiveElement)
  }

  // 功能执行完成后，延迟移除按钮焦点（1000ms）
  if (clickedButton) {
    setTimeout(() => {
      clickedButton.blur()
    }, 1000)
  }
}

function executeBuiltinFunction(config: ButtonConfig) {
  if (!config.builtinId) {
    Notify.showErrorButtonNotConfigured(config.name)
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
  Notify.showErrorBuiltinNotFound(config.builtinId)
}

/**
 * 执行思源刷新、重载、全屏功能
 * @param config 按钮配置
 */
function executeBuiltinRefreshFunction(config: ButtonConfig) {
  if (!config.builtinRefreshType) {
    // 如果没有指定功能类型，默认为刷新
    config.builtinRefreshType = 'refresh'
  }
  
  switch (config.builtinRefreshType) {
    case 'refresh':
      // 刷新当前文档
      try {
        // 方法1: 尝试通过 data-type 点击内置按钮
        const refreshBtn = document.querySelector('[data-type="refresh"]') as HTMLElement
        if (refreshBtn) {
          refreshBtn.click()
        } else {
          // 方法2: 通过思源 API 刷新（推荐方法）
          const { fetchSyncPost } = (window as any).siyuan
          if (fetchSyncPost) {
            // 获取当前编辑器实例并刷新
            const editors = (window as any).siyuan?.layout?.getLayout().children.find((child: any) => child.type === 'wnd')?.children.find((child: any) => child.type === 'tab')?.children.filter((child: any) => child.headElement?.dataset.docId)
            
            if (editors && editors.length > 0) {
              const editor = editors[0]
              const docId = editor.headElement?.dataset.docId
              const notebookId = editor.notebookId
              const path = editor.path
              
              if (docId && notebookId && path) {
                fetchSyncPost('/api/filetree/getDoc', {
                  id: docId,
                  notebook: notebookId,
                  path: path
                })
              }
            } else {
              // 如果找不到编辑器，尝试其他方法
              const refreshBtn2 = document.querySelector('#barRefresh') as HTMLElement
              if (refreshBtn2) {
                refreshBtn2.click()
              } else {
                // 方法3: 尝试通过思源API刷新当前文档
                const currentTab = document.querySelector('.layout-tab-bar .item--cur')
                if (currentTab) {
                  const refreshAction = currentTab.querySelector('[data-type="fold-current-doc"]') as HTMLElement
                  if (refreshAction) {
                    refreshAction.click()
                  }
                }
                
                // 方法4: 尝试直接调用思源的刷新功能
                if ((window as any).siyuan?.protyle) {
                  // 尝试获取当前编辑器并刷新
                  const protyles = document.querySelectorAll('.protyle')
                  protyles.forEach((protyle: Element) => {
                    const instance = (protyle as any).protyle
                    if (instance && instance.model && instance.model.refetch) {
                      instance.model.refetch()
                    }
                  })
                }
              }
            }
          } else {
            // 如果没有API可用，尝试原始方法
            const refreshBtn3 = document.querySelector('#barRefresh') as HTMLElement
            if (refreshBtn3) {
              refreshBtn3.click()
            } else {
              // 方法3: 尝试通过思源API刷新当前文档
              const currentTab = document.querySelector('.layout-tab-bar .item--cur')
              if (currentTab) {
                const refreshAction = currentTab.querySelector('[data-type="fold-current-doc"]') as HTMLElement
                if (refreshAction) {
                  refreshAction.click()
                }
              }
              
              // 方法4: 尝试直接调用思源的刷新功能
              if ((window as any).siyuan?.protyle) {
                // 尝试获取当前编辑器并刷新
                const protyles = document.querySelectorAll('.protyle')
                protyles.forEach((protyle: Element) => {
                  const instance = (protyle as any).protyle
                  if (instance && instance.model && instance.model.refetch) {
                    instance.model.refetch()
                  }
                })
              }
            }
          }
        }
      } catch (error) {
        console.warn('刷新文档失败:', error)
        
        // 备用方法：尝试使用F5快捷键
        try {
          const keyEvent = {
            key: 'F5',
            code: 'F5',
            keyCode: 116,
            which: 116,
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window
          };
          
          const eventDown = new KeyboardEvent('keydown', keyEvent);
          window.dispatchEvent(eventDown);
        } catch (e) {
          console.warn('F5快捷键方法也失败:', e)
        }
      }
      
      // 额外方案：总是尝试触发F5快捷键作为补充
      try {
        const keyEvent = {
          key: 'F5',
          code: 'F5',
          keyCode: 116,
          which: 116,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
          metaKey: false,
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window
        };
        
        const eventDown = new KeyboardEvent('keydown', keyEvent);
        window.dispatchEvent(eventDown);
      } catch (e) {
        console.warn('F5快捷键补充方案失败:', e)
      }
      break
      
    case 'reload':
      // 重新载入思源
      try {
        // 使用思源的重载功能
        if ((window as any).siyuan && (window as any).siyuan.reload) {
          (window as any).siyuan.reload()
        } else {
          // 如果没有API可用，尝试刷新页面
          location.reload()
        }
      } catch (error) {
        console.warn('重载思源失败:', error)
        // 如果JavaScript方法失败，尝试刷新页面
        location.reload()
      }
      break
      
    case 'fullscreen':
      // 全屏来回切换
      try {
        const doc = document.documentElement
        if (!document.fullscreenElement) {
          // 进入全屏
          if (doc.requestFullscreen) {
            doc.requestFullscreen()
          } else if ((doc as any).webkitRequestFullscreen) { /* Safari */
            (doc as any).webkitRequestFullscreen()
          } else if ((doc as any).msRequestFullscreen) { /* IE11 */
            (doc as any).msRequestFullscreen()
          }
        } else {
          // 退出全屏
          if (document.exitFullscreen) {
            document.exitFullscreen()
          } else if ((document as any).webkitExitFullscreen) { /* Safari */
            (document as any).webkitExitFullscreen()
          } else if ((document as any).msExitFullscreen) { /* IE11 */
            (document as any).msExitFullscreen()
          }
        }
      } catch (error) {
        console.warn('全屏切换失败:', error)
      }
      break
      
    case 'doc-fullscreen':
      // 文档全屏切换 - 仅使用快捷键方案
      try {
        // 构建完整的键盘事件对象（参考快捷键功能实现）
        const keyEvent = {
          key: 'y',
          code: 'KeyY',
          keyCode: 89,
          which: 89,
          ctrlKey: false,
          shiftKey: false,
          altKey: true,
          metaKey: false,
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window
        };
        
        // 尝试在活动编辑器上触发事件（优先方案）
        const activeEditor = document.querySelector('.protyle-wysiwyg.protyle-wysiwyg--select') || document.querySelector('.protyle-wysiwyg:not(.fn__none):not(.fn__hidden)') as HTMLElement;
        
        if (activeEditor instanceof HTMLElement) {
          // 先聚焦到编辑器
          activeEditor.focus();
          
          // 延迟触发，确保焦点设置完成
          setTimeout(() => {
            const eventDown = new KeyboardEvent('keydown', keyEvent);
            activeEditor.dispatchEvent(eventDown);
          }, 50);
        } else {
          // 如果没有找到编辑器，在 window 上触发事件
          const eventDown = new KeyboardEvent('keydown', keyEvent);
          window.dispatchEvent(eventDown);
        }
      } catch (error) {
        console.error('文档全屏切换失败:', error);
        
        // 备用方案：在 document 上触发
        try {
          const keyEvent = {
            key: 'y',
            code: 'KeyY',
            keyCode: 89,
            which: 89,
            ctrlKey: false,
            shiftKey: false,
            altKey: true,
            metaKey: false,
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window
          };
          
          const eventDown = new KeyboardEvent('keydown', keyEvent);
          document.dispatchEvent(eventDown);
        } catch (e) {
          console.error('备用方案也失败:', e);
        }
      }
      break
      
    default:
      console.warn('未知的刷新功能类型:', config.builtinRefreshType)
  }
}

export function insertTemplate(config: ButtonConfig, savedSelection: Range | null = null, lastActiveElement: HTMLElement | null = null) {
  if (!config.template) {
    Notify.showErrorTemplateNotConfigured(config.name)
    return
  }

  // 处理模板变量
  const processedTemplate = processTemplateVariables(config.template)
  
  // 如果配置了笔记本ID，使用 appendDailyNoteBlock API 追加到每日笔记
  if (config.templateNotebookId && config.templateNotebookId.trim()) {
    const notebookId = config.templateNotebookId.trim()
    // 异步执行追加操作
    ;(async () => {
      try {
        const response = await fetchSyncPost('/api/block/appendDailyNoteBlock', {
          data: processedTemplate,
          dataType: 'markdown',
          notebook: notebookId
        })
        
        if (response.code === 0) {
          if (config.showNotification) {
            Notify.showInfoCopySuccess()
          }
        } else {
          console.warn('[模板插入] 追加到每日笔记失败:', response.msg)
          // 尝试替代方案
          await appendToDailyNoteAlternative(notebookId, processedTemplate, config.showNotification)
        }
      } catch (error) {
        console.warn('[模板插入] appendDailyNoteBlock API调用失败，尝试替代方案:', error)
        await appendToDailyNoteAlternative(notebookId, processedTemplate, config.showNotification)
      }
    })()
    return
  }

  // 原有逻辑：在当前编辑器光标位置插入
  // 优先使用保存的焦点元素，否则使用当前焦点元素
  const targetElement = lastActiveElement || document.activeElement
  
  // 检查是否在一键记事弹窗中（textarea元素）
  const isQuickNoteDialog = targetElement?.closest('#quick-note-dialog') || targetElement?.closest('#quick-note-dialog-desktop')
  if (isQuickNoteDialog && targetElement?.tagName === 'TEXTAREA') {
    // 在一键记事弹窗的textarea中插入模板
    const textarea = targetElement as HTMLTextAreaElement
    const startPos = textarea.selectionStart || textarea.value.length
    const endPos = textarea.selectionEnd || textarea.value.length
    
    // 插入模板内容
    textarea.value = textarea.value.substring(0, startPos) + processedTemplate + textarea.value.substring(endPos)
    
    // 更新光标位置到插入内容之后
    const newCursorPos = startPos + processedTemplate.length
    textarea.setSelectionRange(newCursorPos, newCursorPos)
    textarea.focus()
    
    // 显示插入成功提示（如果启用）
    if (config.showNotification !== false) {
      Notify.showInfoTemplateInserted(true)
    }
    return
  }
  
  // 原有逻辑：在思源编辑器中插入
  const activeEditor = targetElement?.closest('.protyle')
  if (!activeEditor) {
    Notify.showInfoEditorNotFocused()
    return
  }
  
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
      Notify.showErrorInsertTemplateFailed()
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
export function processTemplateVariables(template: string): string {
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

/**
 * 显示模板右键菜单（用于一键记事弹窗等 textarea 场景）
 * 在 textarea 上弹出包含模板按钮的自定义右键菜单
 */
export function showTemplateContextMenu(e: MouseEvent, textarea: HTMLTextAreaElement) {
  e.preventDefault()
  e.stopPropagation()

  const desktopConfigs = pluginInstance?.desktopButtonConfigs || []
  const mobileConfigs = pluginInstance?.mobileButtonConfigs || []
  const allConfigs = [...desktopConfigs, ...mobileConfigs]
  const contextMenuButtons = allConfigs.filter(
    (btn: ButtonConfig) => btn.type === 'template' && btn.showInContextMenu && btn.template && btn.enabled !== false
  )

  if (contextMenuButtons.length === 0) return

  // 移除旧的自定义右键菜单
  const oldMenu = document.getElementById('template-context-menu')
  if (oldMenu) oldMenu.remove()

  const menu = document.createElement('div')
  menu.id = 'template-context-menu'
  menu.style.cssText = `
    position: fixed;
    z-index: 999999;
    background: var(--b3-menu-background, #fff);
    border: 1px solid var(--b3-border-color, #e0e0e0);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    padding: 4px 0;
    min-width: 120px;
  `

  contextMenuButtons.forEach((btn: ButtonConfig) => {
    const item = document.createElement('div')
    item.style.cssText = `
      padding: 8px 16px;
      cursor: pointer;
      font-size: 14px;
      color: var(--b3-theme-on-background, #333);
      display: flex;
      align-items: center;
      gap: 8px;
      white-space: nowrap;
    `
    item.textContent = btn.name || '模板插入'
    item.addEventListener('mouseenter', () => {
      item.style.background = 'var(--b3-list-hover, #f0f0f0)'
    })
    item.addEventListener('mouseleave', () => {
      item.style.background = ''
    })
    item.addEventListener('click', () => {
      menu.remove()
      // 在 textarea 中插入模板内容
      const processed = processTemplateVariables(btn.template || '')
      const start = textarea.selectionStart || textarea.value.length
      const end = textarea.selectionEnd || textarea.value.length
      textarea.value = textarea.value.substring(0, start) + processed + textarea.value.substring(end)
      const newPos = start + processed.length
      textarea.setSelectionRange(newPos, newPos)
      textarea.focus()
    })
    menu.appendChild(item)
  })

  // 定位菜单
  document.body.appendChild(menu)

  const menuRect = menu.getBoundingClientRect()
  let x = e.clientX
  let y = e.clientY
  if (x + menuRect.width > window.innerWidth) x = window.innerWidth - menuRect.width - 4
  if (y + menuRect.height > window.innerHeight) y = window.innerHeight - menuRect.height - 4
  menu.style.left = x + 'px'
  menu.style.top = y + 'px'

  // 点击其他地方关闭菜单
  const closeMenu = () => {
    menu.remove()
    document.removeEventListener('click', closeMenu)
    document.removeEventListener('contextmenu', closeMenu, true)
  }
  setTimeout(() => {
    document.addEventListener('click', closeMenu)
    document.addEventListener('contextmenu', closeMenu, true)
  }, 0)
}

// ===== 点击序列执行 =====
/**
 * 执行点击序列
 */
async function executeClickSequence(config: ButtonConfig) {
  if (!config.clickSequence || config.clickSequence.length === 0) {
    Notify.showErrorClickSequenceNotConfigured(config.name)
    return
  }

  for (let i = 0; i < config.clickSequence.length; i++) {
    const selector = config.clickSequence[i].trim()
    if (!selector) continue // 跳过空选择器

    // 判断是否为悬浮操作（* 前缀）
    const isHover = selector.startsWith('*')
    const actualSelector = isHover ? selector.substring(1).trim() : selector

    // 尝试执行当前步骤，最多重试2次
    let success = false
    for (let retry = 0; retry <= 2; retry++) {
      try {
        // 等待元素出现（最多5秒）
        const element = await waitForElement(actualSelector, 5000)

        if (!element) {
          throw new Error(`未找到元素: ${actualSelector}`)
        }

        // 检查元素是否可见
        if (!isVisible(element)) {
          throw new Error(`元素不可见: ${actualSelector}`)
        }

        // 悬浮或点击元素
        if (isHover) {
          hoverElement(element)
        } else {
          clickElement(element)
        }
        success = true
        break // 成功后跳出重试循环
      } catch (error) {
        if (retry === 2) {
          // 最后一次重试也失败
          Notify.showErrorClickSequenceStepFailed(i + 1, actualSelector)
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
}

/**
 * 获取当前活动的 protyle 实例
 * 通过 window.siyuan 的各种属性查找
 */
function getCurrentProtyle(): any {
  const windowObj = window as any

  // 方式1：通过 window.siyuan.blocks 查找
  if (windowObj.siyuan?.blocks?.length > 0) {
    const activeBlock = windowObj.siyuan.blocks.find((b: any) =>
      b.protyle && !b.protyle.element?.classList.contains('fn__hidden')
    )
    if (activeBlock?.protyle) {
      return activeBlock.protyle
    }
  }

  // 方式2：通过 window.siyuan.layout 查找
  if (windowObj.siyuan?.layout?.centerLayout?.children) {
    const children = windowObj.siyuan.layout.centerLayout.children
    for (const item of children) {
      // 尝试多种可能的路径
      const element = item?.model?.element || item?.element || item?.tab?.element
      if (element && !element.classList.contains('fn__none')) {
        const editor = element.querySelector('.protyle') || element.closest('.protyle')
        if (editor) {
          const protyle = (editor as any).protyle || (editor as any).__protyle
          if (protyle) return protyle
        }
      }
    }
  }

  // 方式3：通过 window.siyuan.editor 或 editors
  if (windowObj.siyuan?.editor) {
    return windowObj.siyuan.editor.protyle || windowObj.siyuan.editor
  }
  if (windowObj.siyuan?.editors?.length > 0) {
    const activeEditor = windowObj.siyuan.editors.find((e: any) =>
      e.protyle && !e.protyle.element?.classList.contains('fn__hidden')
    )
    if (activeEditor?.protyle) return activeEditor.protyle
  }

  // 方式4：通过 DOM 反查 protyle 实例
  const activeProtyleEl = document.querySelector('.protyle:not(.fn__hidden):not(.fn__none)') as HTMLElement
  if (activeProtyleEl) {
    const protyle = (activeProtyleEl as any).protyle ||
                    (activeProtyleEl as any).__protyle ||
                    (activeProtyleEl as any).protyleInstance
    if (protyle) return protyle

    // 如果元素本身没有，尝试从子元素查找
    const wysiwyg = activeProtyleEl.querySelector('.protyle-wysiwyg')
    if (wysiwyg) {
      const p = (wysiwyg as any).protyle || (wysiwyg as any).__protyle
      if (p) return p
    }
  }

  // 方式5：遍历所有 .protyle 元素
  const allProtyles = document.querySelectorAll('.protyle')
  for (const el of allProtyles) {
    const p = (el as any).protyle || (el as any).__protyle || (el as any).protyleInstance
    if (p?.contentElement) {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        return p
      }
    }
  }

  return null
}

/**
 * 通过 DOM 获取 contentElement（原生方式）
 */
function getContentElementFromDOM(): HTMLElement | null {
  // 查找当前活动的 protyle
  const activeProtyle = document.querySelector('.protyle:not(.fn__hidden):not(.fn__none)') as HTMLElement
  if (!activeProtyle) return null

  // 在 protyle 内部查找 contentElement（通常是 .protyle-content）
  const contentEl = activeProtyle.querySelector('.protyle-content') as HTMLElement
  if (contentEl) return contentEl

  // 备选：查找 .protyle-scroll（仅作为最后手段，实际应使用 .protyle-content）
  const scrollEl = activeProtyle.querySelector('.protyle-scroll') as HTMLElement
  if (scrollEl) return scrollEl

  // 备选：查找 .protyle-wysiwyg 的父元素
  const wysiwyg = activeProtyle.querySelector('.protyle-wysiwyg')
  if (wysiwyg && wysiwyg.parentElement) {
    return wysiwyg.parentElement as HTMLElement
  }

  return null
}

/**
 * 执行滚动文档到顶部或底部
 * 电脑端使用模拟键盘快捷键，手机端直接操作 scrollTop
 */
function executeScrollDoc(config: ButtonConfig) {
  const direction = config.scrollDirection || 'top'

  // 检查是否有活动的编辑器
  const activeProtyle = document.querySelector('.protyle:not(.fn__hidden):not(.fn__none)')
  if (!activeProtyle) {
    Notify.showInfoEditorNotFocused()
    return
  }

  // 手机端：直接操作 .protyle-content 的 scrollTop 实现滚动
  // 注意：不能用 .protyle-scroll（那是导航箭头UI组件，不是滚动容器）
  if (isMobileDevice()) {
    const scrollEl = activeProtyle.querySelector('.protyle-content') as HTMLElement
    if (scrollEl) {
      scrollEl.scrollTop = direction === 'top' ? 0 : scrollEl.scrollHeight
    }
    return
  }

  // 电脑端：先尝试键盘事件，若滚动未生效则回退到 scrollIntoView
  // 注意：.protyle-scroll 是导航箭头UI组件（position: absolute），不能用来检测滚动
  const scrollEl = activeProtyle.querySelector('.protyle-content') as HTMLElement
  const scrollTopBefore = scrollEl ? scrollEl.scrollTop : 0

  const key = direction === 'top' ? 'Home' : 'End'
  const event = new KeyboardEvent('keydown', {
    key: key,
    code: key,
    ctrlKey: true,
    bubbles: true,
    cancelable: true
  })

  // 分发给编辑器容器
  activeProtyle.dispatchEvent(event)

  // 同时分发给 wysiwyg 编辑区域，确保被捕获
  const wysiwyg = activeProtyle.querySelector('.protyle-wysiwyg')
  if (wysiwyg) {
    wysiwyg.dispatchEvent(event)
  }

  // 检测滚动是否生效，未生效则用 scrollIntoView 回退
  requestAnimationFrame(() => {
    if (scrollEl && scrollEl.scrollTop === scrollTopBefore) {
      const content = activeProtyle.querySelector('.protyle-content') as HTMLElement
      if (content) {
        if (direction === 'top') {
          content.firstElementChild?.scrollIntoView({ behavior: 'instant', block: 'start' })
        } else {
          content.lastElementChild?.scrollIntoView({ behavior: 'instant', block: 'end' })
        }
      }
    }
  })
}

/**
 * 根据按钮名称查找按钮配置
 * 通过遍历所有按钮配置，匹配按钮名称
 */
function findButtonConfigByName(buttonName: string): ButtonConfig | null {
  const toolbarManager = (window as any).__toolbarManager
  if (!toolbarManager) return null

  const configs = toolbarManager.getAllButtonConfigs?.()
  if (!configs || configs.length === 0) return null

  return configs.find((c: ButtonConfig) => c.name === buttonName) || null
}

function findButtonConfigById(buttonId: string): ButtonConfig | null {
  const toolbarManager = (window as any).__toolbarManager
  if (!toolbarManager) return null

  const configs = toolbarManager.getAllButtonConfigs?.()
  if (!configs || configs.length === 0) return null

  return configs.find((c: ButtonConfig) => c.id === buttonId) || null
}

/**
 * 执行连续点击自定义按钮序列
 * 根据按钮ID查找按钮配置并直接执行功能，无需弹出扩展工具栏
 */
async function executeButtonSequence(config: ButtonConfig) {
  const steps = config.buttonSequenceSteps

  if (!steps || steps.length === 0) {
    Notify.showErrorClickSequenceNotConfigured(config.name)
    return
  }

  // 过滤掉空的步骤（按钮ID为空的）
  const validSteps = steps.filter(step => step.buttonId && step.buttonId.trim())

  if (validSteps.length === 0) {
    Notify.showErrorClickSequenceNotConfigured(config.name)
    return
  }

  // 保存当前选区和焦点元素
  const savedSelection = saveSelection()
  const lastActiveElement = document.activeElement as HTMLElement | null

  for (let i = 0; i < validSteps.length; i++) {
    const step = validSteps[i]
    const buttonId = step.buttonId.trim()
    const delayMs = step.delayMs || 200

    // 根据按钮ID查找按钮配置
    const buttonConfig = findButtonConfigById(buttonId)

    if (!buttonConfig) {
      // 找不到按钮配置，停止整个序列
      Notify.showErrorClickSequenceStepFailed(i + 1, `按钮ID"${buttonId}"`)
      return
    }

    // 防止死循环：如果目标按钮也是连续点击类型，则跳过
    if (buttonConfig.type === 'author-tool' && buttonConfig.authorToolSubtype === 'button-sequence') {
      console.warn(`[连续点击] 跳过步骤 ${i + 1}：按钮"${buttonConfig.name}"是连续点击类型，避免循环调用`)
      continue
    }

    // 直接执行按钮功能（不通过 DOM 点击，无需弹出扩展工具栏）
    try {
      await handleButtonClick(buttonConfig, savedSelection, lastActiveElement)
    } catch (error) {
      Notify.showErrorClickSequenceStepFailed(i + 1, `按钮"${buttonConfig.name}"`)
      return
    }

    // 执行后等待指定间隔时间
    await delay(delayMs)
  }
}

// 查找扩展工具栏按钮（手机端或桌面端）
function findOverflowButton(): HTMLElement | null {
  return document.querySelector('[data-custom-button="overflow-button-mobile"], [data-custom-button="overflow-button-desktop"]') as HTMLElement
}

/**
 * 根据按钮名称查找自定义按钮
 * 通过遍历所有带 data-custom-button 属性的按钮，匹配按钮名称
 */
function findCustomButtonByName(buttonName: string): HTMLElement | null {
  // 先从全局配置中查找按钮ID（通过名称找ID）
  const toolbarManager = (window as any).__toolbarManager
  let targetButtonId: string | null = null

  if (toolbarManager) {
    const configs = toolbarManager.getAllButtonConfigs?.()

    if (configs && configs.length > 0) {
      const config = configs.find((c: ButtonConfig) => c.name === buttonName)
      if (config) {
        targetButtonId = config.id
      }
    }
  }

  // 查找所有自定义按钮（包括主工具栏和扩展工具栏）
  const customButtons = document.querySelectorAll('[data-custom-button]')

  for (const btn of customButtons) {
    const button = btn as HTMLElement
    const buttonId = button.dataset.customButton

    // 优先通过ID匹配
    if (targetButtonId && buttonId === targetButtonId) {
      return button
    }

    // 备用方案：通过按钮的 title 匹配
    if (button.title === buttonName) {
      return button
    }
  }

  // 如果还没找到，检查按钮是否在扩展工具栏中（扩展工具栏可能使用不同的属性）
  const overflowToolbarButtons = document.querySelectorAll('.overflow-toolbar-layer [data-custom-button]')

  for (const btn of overflowToolbarButtons) {
    const button = btn as HTMLElement
    const buttonId = button.dataset.customButton

    if (targetButtonId && buttonId === targetButtonId) {
      return button
    }

    if (button.title === buttonName) {
      return button
    }
  }

  return null
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
        activeObservers.delete(observer)
        // 清理超时定时器
        if (activeTimers.has(timerId)) {
          clearTimeout(timerId)
          activeTimers.delete(timerId)
        }
        resolve(element)
      }
    })

    activeObservers.add(observer)
    observer.observe(document.body, {
      childList: true,
      subtree: true
    })

    // 超时处理 - 使用 tracked timeout
    const timerId = safeSetTimeout(() => {
      observer.disconnect()
      activeObservers.delete(observer)
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

function hoverElement(element: HTMLElement): void {
  element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true, view: window }))
  element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }))
}

/**
 * 执行日记功能
 * 根据 diaryPosition 参数决定打开日记后滚动到顶部还是底部
 * 如果配置了 notebookId，直接调用API创建/打开日记
 * 否则使用 Alt+5 快捷键模拟（电脑端和手机端）
 */
async function executeDiary(config: ButtonConfig) {
  try {
    const windowObj = window as any
    const position = config.diaryPosition || 'bottom' // 默认为底部

    // 检测是否为手机端
    const isMobile = /mobile|android|iphone|ipad/i.test(navigator.userAgent) ||
                     windowObj.siyuan?.config?.fronted === 'mobile' ||
                     document.body.classList.contains('mobile')

    // ==================== 滚动到底部函数（仅在 position === 'bottom' 时使用） ====================
    let scrollAttempts = 0
    const maxScrollAttempts = 2  // 减少重试次数：5次 -> 2次
    const retryDelay = 150  // 减少重试间隔：200ms -> 150ms

    // DOM 缓存：避免重复查询
    let cachedProtyles: NodeListOf<HTMLElement> | null = null

    function startScrolling() {
      if (position === 'bottom') {
        scrollAttempts = 0
        cachedProtyles = null // 重置缓存
        scrollToBottom()
      } else if (position === 'top' && !isMobile) {
        // 电脑端顶部模式：滚动到顶部
        scrollAttempts = 0
        cachedProtyles = null // 重置缓存
        scrollToTop()
      }
    }

    function scrollToBottom() {
      scrollAttempts++

      // 使用缓存或查询 DOM
      const allProtyles = cachedProtyles || document.querySelectorAll('.protyle') as NodeListOf<HTMLElement>

      // 首次查询时缓存结果
      if (!cachedProtyles) {
        cachedProtyles = allProtyles
      }

      // 如果找不到任何 protyle 元素，说明文档还未加载，需要重试
      if (allProtyles.length === 0) {
        if (scrollAttempts < maxScrollAttempts) {
          safeSetTimeout(scrollToBottom, retryDelay)
          return
        }
      }

      let scrolled = false
      let hasScrollableContent = false

      allProtyles.forEach((protyle) => {
        // 尝试滚动 .protyle-content 元素
        const content = protyle.querySelector('.protyle-content') as HTMLElement
        if (content) {
          if (content.scrollHeight > content.clientHeight) {
            // 有可滚动的内容，执行滚动
            content.scrollTop = content.scrollHeight
            scrolled = true
          }
          hasScrollableContent = true
        }
      })

      // 显示通知（只显示一次）
      if (config.showNotification !== false && scrollAttempts === 1) {
        if (scrolled) {
          Notify.showInfoDiaryOpenedAndScrolled()
        } else if (hasScrollableContent || allProtyles.length > 0) {
          // 找到了 protyle 但没有滚动（文档内容较少），也视为成功
          Notify.showInfoDiaryOpened()
        }
      }

      // 如果没有找到任何 protyle，继续重试
      if (!hasScrollableContent && scrollAttempts < maxScrollAttempts) {
        safeSetTimeout(scrollToBottom, retryDelay)
      }
    }

    // ==================== 滚动到顶部函数（仅电脑端 position === 'top' 时使用） ====================
    function scrollToTop() {
      scrollAttempts++

      // 使用缓存或查询 DOM
      const allProtyles = cachedProtyles || document.querySelectorAll('.protyle') as NodeListOf<HTMLElement>

      // 首次查询时缓存结果
      if (!cachedProtyles) {
        cachedProtyles = allProtyles
      }

      // 如果找不到任何 protyle 元素，说明文档还未加载，需要重试
      if (allProtyles.length === 0) {
        if (scrollAttempts < maxScrollAttempts) {
          safeSetTimeout(scrollToTop, retryDelay)
          return
        }
      }

      let scrolled = false

      allProtyles.forEach((protyle) => {
        // 尝试滚动 .protyle-content 元素到顶部
        const content = protyle.querySelector('.protyle-content') as HTMLElement
        if (content) {
          content.scrollTop = 0
          scrolled = true
        }
      })

      // 显示通知（只显示一次）
      if (config.showNotification !== false && scrollAttempts === 1) {
        if (scrolled) {
          Notify.showInfoDiaryOpened()
        } else if (allProtyles.length > 0) {
          // 找到了 protyle，也视为成功
          Notify.showInfoDiaryOpened()
        }
      }

      // 如果没有找到任何 protyle，继续重试
      if (!scrolled && allProtyles.length === 0 && scrollAttempts < maxScrollAttempts) {
        safeSetTimeout(scrollToTop, retryDelay)
      }
    }

    // ==================== 如果配置了笔记本ID，使用API直接创建/打开日记 ====================
    if (config.diaryNotebookId && config.diaryNotebookId.trim()) {
      try {
        // 调用思源API创建日记
        const response = await fetchSyncPost('/api/filetree/createDailyNote', {
          notebook: config.diaryNotebookId.trim()
        })

        if (response.code === 0 && response.data?.id) {
          const docId = response.data.id

          // 打开创建的日记文档（createDailyNote不会自动跳转，需要手动打开）
          try {
            if (isMobile) {
              // 移动端使用 openMobileFileById
              await openMobileFileById(pluginInstance.app, docId)
            } else {
              // 桌面端使用 openTab
              await siyuanOpenTab({
                app: pluginInstance.app,
                doc: {
                  id: docId
                }
              })
            }
          } catch (openError) {
            console.warn('[日记功能] 打开文档失败:', openError)
          }

          // 根据位置模式，等待文档加载后滚动
          if (position === 'bottom') {
            // 底部模式：滚动到底部
            const waitTime = isMobile ? (config.diaryWaitTime || 1000) : 800
            safeSetTimeout(startScrolling, waitTime)
          } else if (position === 'top' && !isMobile) {
            // 顶部模式（仅电脑端）：滚动到顶部
            safeSetTimeout(startScrolling, 800)
          } else {
            // 其他情况（移动端顶部模式等），显示成功通知
            if (config.showNotification !== false) {
              Notify.showInfoDiaryOpened()
            }
          }
          return
        } else {
          console.warn('[日记功能] API调用失败:', response.msg)
          // API失败，回退到快捷键方式
        }
      } catch (apiError) {
        console.warn('[日记功能] API调用异常:', apiError)
        // API异常，回退到快捷键方式
      }
    }

    // ==================== 未配置笔记本ID或API失败，使用快捷键方式 ====================
    // 从思源 keymap 中获取 dailyNote 的快捷键
    let hotkeyToTrigger = '⌥5' // 默认 Alt+5

    if (windowObj.siyuan?.config?.keymap?.general?.dailyNote) {
      const keymapItem = windowObj.siyuan.config.keymap.general.dailyNote
      hotkeyToTrigger = keymapItem.custom || keymapItem.default
    }

    // ==================== 电脑端流程 ====================
    if (!isMobile) {
      // 1. 触发快捷键
      const keyEvent = parseHotkeyToKeyEvent(hotkeyToTrigger)
      if (keyEvent) {
        window.dispatchEvent(new KeyboardEvent('keydown', keyEvent))
      }

      // 2. 根据位置模式，等待文档加载后滚动
      if (position === 'bottom') {
        // 底部模式：滚动到底部
        safeSetTimeout(startScrolling, 800)
      } else if (position === 'top') {
        // 顶部模式（仅电脑端）：滚动到顶部
        safeSetTimeout(startScrolling, 800)
      } else {
        // 其他情况，显示成功通知
        if (config.showNotification !== false) {
          Notify.showInfoDiaryOpened()
        }
      }
      return
    }

    // ==================== 手机端流程 ====================
    // 1. 触发快捷键
    const keyEvent = parseHotkeyToKeyEvent(hotkeyToTrigger)
    if (keyEvent) {
      window.dispatchEvent(new KeyboardEvent('keydown', keyEvent))
    }

    // 2. 使用 MutationObserver 等待对话框出现并自动确认（比轮询更高效）
    let dialogFound = false
    let dialogTimeout: ReturnType<typeof setTimeout> | null = null

    const confirmDialog = () => {
      if (dialogFound) return

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
            dialogFound = true

            // 清除超时定时器
            if (dialogTimeout) {
              clearTimeout(dialogTimeout)
              dialogTimeout = null
            }

            // 直接点击确定按钮
            (confirmBtn as HTMLElement).click()

            // 根据位置模式决定后续操作
            if (position === 'bottom') {
              // 对话框确认后，使用配置的等待时间后再滚动
              const waitTime = config.diaryWaitTime || 1000
              safeSetTimeout(startScrolling, waitTime)
            } else {
              // 顶部模式，显示成功通知
              if (config.showNotification !== false) {
                Notify.showInfoDiaryOpened()
              }
            }
            return
          }
        }
      }
    }

    // 使用 MutationObserver 监听 DOM 变化
    const observer = new MutationObserver(() => {
      confirmDialog()
    })

    activeObservers.add(observer)
    observer.observe(document.body, {
      childList: true,
      subtree: true
    })

    // 立即检查一次（可能在触发快捷键前对话框已存在）
    confirmDialog()

    // 设置超时保护（3秒后停止观察）
    dialogTimeout = safeSetTimeout(() => {
      observer.disconnect()
      activeObservers.delete(observer)

      // 如果没找到对话框，直接开始滚动
      if (!dialogFound) {
        if (position === 'bottom') {
          // 延迟500ms后开始滚动
          safeSetTimeout(startScrolling, 500)
        } else {
          // 显示成功通知
          if (config.showNotification !== false) {
            Notify.showInfoDiaryOpened()
          }
        }
      }
    }, 3000)

  } catch (error) {
    console.error('日记功能失败:', error)
    Notify.showErrorDiaryFailed(error)
  }
}

/**
 * 执行文档朗读（TTS）— 根据平台弹出选项面板
 */
function executeTTS() {
  const isMobile = isMobileDevice()
  if (isMobile) {
    showTTSOptionsMobile()
  } else {
    showTTSOptionsDesktop()
  }
}

/**
 * 执行鲸鱼定制工具箱
 */
async function executeAuthorTool(config: ButtonConfig, savedSelection: Range | null = null, lastActiveElement: HTMLElement | null = null) {
  const subtype = config.authorToolSubtype || 'button-sequence'

  // 弹窗框模板选择类型
  if (subtype === 'popup-select') {
    await executePopupSelect(config, savedSelection, lastActiveElement)
    return
  }

  // 连续点击自定义按钮类型
  if (subtype === 'button-sequence') {
    await executeButtonSequence(config)
    return
  }

  // 滚动文档顶部或底部类型
  if (subtype === 'scroll-doc') {
    executeScrollDoc(config)
    return
  }

  // 日记类型（兼容旧的 diary-top 和 diary-bottom）
  if (subtype === 'diary' || subtype === 'diary-top' || subtype === 'diary-bottom') {
    await executeDiary(config)
    return
  }

  // 数据库悬浮弹窗类型
  if (subtype === 'database') {
    executeDatabaseQuery(config)
    return
  }

  // 叶归LifeLog适配类型
  if (subtype === 'life-log') {
    try {
      const categories = config.lifeLogCategories || ['学习', '工作', '生活']

      // 创建选择对话框（不恢复焦点，因为接下来还要弹出输入框）
      const selectedCategory = await showCategorySelectionDialog(categories, { restoreFocus: false })

      if (selectedCategory) {
        // 保存当前焦点元素和滚动位置（在弹出输入框之前）
        const activeElementBeforeInput = document.activeElement as HTMLElement
        // 查找思源实际的滚动容器（优先活动 protyle 内的 .protyle-content）
        const activeProtyle = document.querySelector('.protyle:not(.fn__hidden):not(.fn__none)')
        const scrollContainer = (activeProtyle?.querySelector('.protyle-content') || document.querySelector('.layout__center')) as HTMLElement | null
        const scrollPositionBefore = scrollContainer
          ? scrollContainer.scrollTop
          : (window.pageYOffset || document.documentElement.scrollTop)

        // 弹出输入框，让用户输入具体内容
        const inputContent = await showTextInputDialog('请输入内容', '例如：写插件')

        if (inputContent !== null) {
          // 获取当前时间
          const now = new Date()
          const hours = String(now.getHours()).padStart(2, '0')
          const minutes = String(now.getMinutes()).padStart(2, '0')

          // 生成内容格式：19:50 工作：输入内容\n
          const content = `${hours}:${minutes} ${selectedCategory}：${inputContent}\n`

          // 获取笔记本ID
          const notebookId = config.lifeLogNotebookId

          if (!notebookId) {
            // 如果没有配置笔记本ID，给出提示
            Notify.showErrorCommandCannotExecute('请先配置笔记本ID');
            return;
          }

          try {
            // 尝试使用appendDailyNoteBlock API将内容追加到指定笔记本的每日笔记
            const response = await fetchSyncPost('/api/block/appendDailyNoteBlock', {
              data: content,
              dataType: 'markdown',
              notebook: notebookId
            });

            if (response.code === 0) {
              if (config.showNotification) {
                Notify.showInfoCopySuccess() // 使用现有的成功通知
              }

              // 延迟恢复滚动位置（等待思源完成跳转）
              setTimeout(() => {
                // 恢复滚动位置到思源的实际滚动容器（优先活动 protyle）
                const activeProtyleNow = document.querySelector('.protyle:not(.fn__hidden):not(.fn__none)')
                const currentScrollContainer = (activeProtyleNow?.querySelector('.protyle-content') || document.querySelector('.layout__center')) as HTMLElement | null
                if (currentScrollContainer) {
                  currentScrollContainer.scrollTop = scrollPositionBefore
                } else {
                  window.scrollTo(0, scrollPositionBefore)
                }

                // 移动端不恢复焦点，避免重新弹出输入法
                const frontend = getFrontend()
                const isMobileDevice = frontend === 'mobile' || frontend === 'browser-mobile'
                if (!isMobileDevice && activeElementBeforeInput && document.contains(activeElementBeforeInput)) {
                  try {
                    activeElementBeforeInput.focus({ preventScroll: true })
                  } catch (e) {
                    // 如果无法聚焦，忽略错误
                    console.warn('[叶归LifeLog适配] 恢复焦点失败:', e)
                  }
                }
              }, 300) // 300ms延迟，确保思源的跳转动画完成
            } else {
              console.warn('[叶归LifeLog适配] 追加到每日笔记失败:', response.msg)
              // 如果API调用失败，尝试使用替代方案
              await appendToDailyNoteAlternative(notebookId, content, config.showNotification);
            }
          } catch (apiError) {
            console.warn('[叶归LifeLog适配] appendDailyNoteBlock API调用失败，尝试替代方案:', apiError)
            // 如果API调用失败，尝试使用替代方案
            await appendToDailyNoteAlternative(notebookId, content, config.showNotification);
          }
        }
      }
    } catch (error) {
      console.warn('[叶归LifeLog适配] 执行失败:', error)
      Notify.showErrorCommandCannotExecute('叶归LifeLog适配')
    }
    return
  }

  // ⑧图片快捷导入日记
  if (subtype === 'image-upload') {
    await executeImageUpload(config)
    return
  }

  // ⑨标签页Tab（桌面端和移动端分别实现）
  if (subtype === 'mobile-tabs' || subtype === 'desktop-tabs') {
    if (isDesktopDevice()) {
      executeDesktopTabs(config)
    } else {
      executeMobileTabs(config)
    }
    return
  }

  // ⑩悬浮大纲（桌面端和移动端分别实现）
  if (subtype === 'mobile-outline' || subtype === 'desktop-outline') {
    if (isDesktopDevice()) {
      executeDesktopOutline(config)
    } else {
      executeMobileOutline(config)
    }
    return
  }

  // ⑪前一篇/后一篇文档（桌面端和移动端分别实现）
  if (subtype === 'doc-nav' || subtype === 'desktop-doc-nav') {
    if (isDesktopDevice()) {
      executeDesktopDocNav(config)
    } else {
      executeMobileDocNav(config)
    }
    return
  }

  // ⑫滑动快速批注（调用鲸鱼快速批注插件的 toggleSlideCommentMode）
  if (subtype === 'slide-comment') {
    const app = pluginInstance?.app
    if (app?.plugins) {
      const commentPlugin = app.plugins.find((p: any) => {
        return typeof p.toggleSlideCommentMode === 'function'
      })
      if (commentPlugin) {
        const isActive = (commentPlugin as any).toggleSlideCommentMode()
        if (config.showNotification) {
          showMessage(isActive ? '✅ 滑动快速批注已开启' : '❌ 滑动快速批注已关闭')
        }
      } else {
        Notify.showErrorCommandCannotExecute('未找到鲸鱼快速批注插件，请先安装并启用')
      }
    }
    return
  }

  // ⑬文档朗读（TTS）
  if (subtype === 'tts') {
    executeTTS()
    return
  }

  // 打开指定ID块类型（默认）
  const frontend = getFrontend()
  const isMobile = frontend === 'mobile' || frontend === 'browser-mobile'

  // 根据平台获取对应的目标ID配置
  const targetId = isMobile ? config.mobileTargetDocId : config.targetDocId

  if (!targetId) {
    Notify.showErrorCommandCannotExecute('未配置目标块ID')
    return
  }

  try {
    // 先获取块信息，提取文档ID（rootID）
    const blockInfo = await fetchSyncPost('/api/block/getBlockInfo', { id: targetId })

    if (blockInfo.code !== 0 || !blockInfo.data) {
      Notify.showErrorCommandCannotExecute(`获取块信息: ${targetId}`)
      return
    }

    const docId = blockInfo.data.rootID

    if (isMobile) {
      // 移动端使用 openMobileFileById 打开文档
      await openMobileFileById(pluginInstance.app, docId)
    } else {
      // 桌面端使用 openTab 打开文档（使用文档ID而非块ID，避免只显示块内容）
      await siyuanOpenTab({
        app: pluginInstance.app,
        doc: { id: docId }  // 使用文档ID打开整个文档
        // 注意：不设置 keepCursor，让思源自动跳转到新打开的标签页
      })
    }

    // 等待文档加载后滚动到目标块
    setTimeout(() => {
      const blockElement = document.querySelector(`[data-node-id="${targetId}"]`)
      if (blockElement) {
        blockElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // 高亮显示目标块
        ;(blockElement as HTMLElement).style.backgroundColor = 'var(--b3-theme-primary-lightest)'
        setTimeout(() => {
          ;(blockElement as HTMLElement).style.backgroundColor = ''
        }, 2000)
      }
    }, 500)

  } catch (error) {
    console.warn('[打开指定ID块] 打开失败:', error)
    Notify.showErrorCommandCannotExecute(`打开块: ${targetId}`)
  }
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
 * ⑧图片快捷导入日记
 */
async function executeImageUpload(config: ButtonConfig) {
  // 创建文件选择器
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = 'image/*'
  fileInput.style.display = 'none'
  document.body.appendChild(fileInput)

  fileInput.onchange = async () => {
    // 清除图片选择器标记，恢复一键记事弹窗的正常触发
    ;(window as any).__imagePickerActive = false
    const file = fileInput.files?.[0]
    document.body.removeChild(fileInput)
    if (!file) return

    try {
      // 上传图片到思源资源库
      // 字段名必须是 file[]（对应思源内核 form.File["file[]"]）
      const formData = new FormData()
      formData.append('file[]', file)

      // 使用原生 fetch，避免 fetchSyncPost 的 processMessage 触发 UI 刷新
      const httpResponse = await fetch('/api/asset/upload', {
        method: 'POST',
        body: formData
      })
      const response = await httpResponse.json()

      if (response.code !== 0) {
        console.error('[图片快捷导入] 上传失败:', response)
        Notify.showErrorCommandCannotExecute('图片上传失败: ' + (response.msg || ''))
        return
      }

      // 思源返回 succMap 格式: { "filename.jpg": "assets/xxx-xxx.jpg" }
      const succMap = response.data?.succMap
      if (!succMap || Object.keys(succMap).length === 0) {
        console.error('[图片快捷导入] succMap 为空:', response.data)
        Notify.showErrorCommandCannotExecute('图片上传失败: 无返回路径')
        return
      }

      const uploadedPath = Object.values(succMap)[0] as string

      if (!uploadedPath) {
        Notify.showErrorCommandCannotExecute('图片上传失败: 路径为空')
        return
      }

      // 插入到日记底部
      const notebookId = config.imageUploadNotebookId
      if (!notebookId) {
        Notify.showErrorCommandCannotExecute('请先配置笔记本ID')
        return
      }

      const imageMarkdown = `![](${uploadedPath})\n`

      // 使用原生 fetch 调用，避免 fetchSyncPost 的 processMessage 触发 UI 刷新导致滚动位置重置
      const appendResponse = await fetch('/api/block/appendDailyNoteBlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: imageMarkdown,
          dataType: 'markdown',
          notebook: notebookId
        })
      })
      const appendResult = await appendResponse.json()

      if (appendResult.code === 0) {
        if (config.showNotification) {
          Notify.showInfoCopySuccess()
        }
      } else {
        Notify.showErrorCommandCannotExecute('追加到日记失败: ' + (appendResult.msg || ''))
      }
    } catch (error) {
      console.warn('[图片快捷导入日记] 执行失败:', error)
      Notify.showErrorCommandCannotExecute('图片导入失败')
    }
  }

  // 标记图片选择器激活，防止切后台时触发一键记事弹窗
  ;(window as any).__imagePickerActive = true
  // 兼容：部分浏览器支持 cancel 事件（用户取消选择时清除标记）
  fileInput.addEventListener('cancel', () => {
    ;(window as any).__imagePickerActive = false
    try { document.body.removeChild(fileInput) } catch { /* ignore */ }
  })
  fileInput.click()
  // 安全兜底：30秒后自动清除标记（防止 onchange/cancel 均不触发的极端情况）
  setTimeout(() => { ;(window as any).__imagePickerActive = false }, 30000)
}

/**
 * 显示分类选择对话框
 */
async function showCategorySelectionDialog(categories: string[], options?: { restoreFocus?: boolean }): Promise<string | null> {
  const { restoreFocus = true } = options || {};
  return new Promise((resolve) => {
    // 保存当前焦点元素
    const activeElement = document.activeElement as HTMLElement;
    
    // 创建遮罩
    const overlay = document.createElement('div')
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 2147483647;
    `
    
    // 防止遮罩捕获焦点
    overlay.tabIndex = -1;

    // 创建对话框容器
    const dialog = document.createElement('div')
    dialog.style.cssText = `
      background: var(--b3-theme-background);
      border-radius: 8px;
      padding: 20px;
      min-width: 200px;
      max-width: 80vw;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      display: flex;
      flex-direction: column;
      gap: 8px;
    `

    // 添加标题
    const title = document.createElement('div')
    title.textContent = '请选择分类'
    title.style.cssText = `
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 12px;
      color: var(--b3-theme-on-background);
      text-align: center;
    `
    dialog.appendChild(title)

    // 为每个分类创建按钮
    categories.forEach(category => {
      const button = document.createElement('button')
      button.textContent = category
      button.style.cssText = `
        padding: 12px 16px;
        border: 1px solid var(--b3-border-color);
        border-radius: 4px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        font-size: 14px;
        cursor: pointer;
        transition: background-color 0.2s;
      `
      button.onclick = () => {
        // 先移除对话框，稍后插入内容以避免输入法冲突
        if (overlay.parentNode) document.body.removeChild(overlay)
        // 添加短暂延迟以确保对话框完全移除后再插入内容
        setTimeout(() => {
          // 恢复焦点到原始元素（仅在需要时）
          if (restoreFocus && activeElement && document.contains(activeElement)) {
            try {
              activeElement.focus({ preventScroll: true });
            } catch (e) {
              // 如果无法聚焦原始元素，忽略错误
            }
          }
          resolve(category)
        }, 100)
      }
      dialog.appendChild(button)
    })

    // 添加取消按钮
    const cancelButton = document.createElement('button')
    cancelButton.textContent = '取消'
    cancelButton.style.cssText = `
      padding: 12px 16px;
      border: 1px solid var(--b3-border-color);
      border-radius: 4px;
      background: var(--b3-theme-surface);
      color: var(--b3-theme-on-surface);
      font-size: 14px;
      cursor: pointer;
      margin-top: 12px;
    `
    cancelButton.onclick = () => {
      if (overlay.parentNode) document.body.removeChild(overlay)
      setTimeout(() => {
        // 恢复焦点到原始元素（仅在需要时）
        if (restoreFocus && activeElement && document.contains(activeElement)) {
          try {
            activeElement.focus({ preventScroll: true });
          } catch (e) {
            // 如果无法聚焦原始元素，忽略错误
          }
        }
        resolve(null)
      }, 100)
    }
    dialog.appendChild(cancelButton)

    // 添加键盘事件监听（仅电脑端）
    // 注意：必须在按钮创建之后添加事件监听器
    const frontend = getFrontend();
    const isDesktop = frontend === 'desktop';

    if (isDesktop) {
      // 为取消按钮添加键盘事件
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          cancelButton.click();
        }
      };

      overlay.addEventListener('keydown', handleKeyDown);

      // 确保overlay可以接收键盘事件
      overlay.tabIndex = -1;
    }

    overlay.appendChild(dialog)
    document.body.appendChild(overlay)
    
    // 尝试保持焦点在原始元素上（如果它还存在）
    setTimeout(() => {
      if (activeElement && document.contains(activeElement)) {
        try {
          activeElement.focus({ preventScroll: true });
        } catch (e) {
          // 如果无法聚焦原始元素，忽略错误
        }
      }
    }, 0);

    // 点击遮罩关闭
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        if (overlay.parentNode) document.body.removeChild(overlay)
        setTimeout(() => {
          // 恢复焦点到原始元素
          if (activeElement && document.contains(activeElement)) {
            try {
              activeElement.focus({ preventScroll: true });
            } catch (e) {
              // 如果无法聚焦原始元素，忽略错误
            }
          }
          resolve(null)
        }, 100)
      }
    }
  })
}

async function showTextInputDialog(prompt: string, placeholder?: string): Promise<string | null> {
  return new Promise((resolve) => {
    // 保存当前焦点元素
    const activeElement = document.activeElement as HTMLElement;
    
    // 创建遮罩
    const overlay = document.createElement('div')
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 2147483647;
    `;
    
    // 防止遮罩捕获焦点
    overlay.tabIndex = -1;

    // 创建对话框容器
    const dialog = document.createElement('div')
    dialog.style.cssText = `
      background: var(--b3-theme-background);
      border-radius: 8px;
      padding: 20px;
      min-width: 280px;
      max-width: 80vw;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      display: flex;
      flex-direction: column;
      gap: 12px;
    `;

    // 添加标题
    const title = document.createElement('div')
    title.textContent = prompt;
    title.style.cssText = `
      font-size: 16px;
      font-weight: 600;
      color: var(--b3-theme-on-background);
      text-align: center;
    `;
    dialog.appendChild(title);

    // 添加输入框
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder || '';
    input.style.cssText = `
      padding: 10px 12px;
      border: 1px solid var(--b3-border-color);
      border-radius: 4px;
      background: var(--b3-theme-surface);
      color: var(--b3-theme-on-surface);
      font-size: 14px;
    `;
    
    // 确保输入框获得焦点
    setTimeout(() => {
      if (document.contains(input)) {
        input.focus();
      }
    }, 0);
    
    dialog.appendChild(input);

    // 按钮容器
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 8px;
      margin-top: 8px;
    `;

    // 取消按钮
    const cancelButton = document.createElement('button');
    cancelButton.textContent = '取消';
    cancelButton.style.cssText = `
      flex: 1;
      padding: 10px 16px;
      border: 1px solid var(--b3-border-color);
      border-radius: 4px;
      background: var(--b3-theme-surface);
      color: var(--b3-theme-on-surface);
      font-size: 14px;
      cursor: pointer;
    `;
    cancelButton.onclick = () => {
      if (overlay.parentNode) document.body.removeChild(overlay);
      setTimeout(() => {
        // 恢复焦点到原始元素
        if (activeElement && document.contains(activeElement)) {
          try {
            activeElement.focus({ preventScroll: true });
          } catch (e) {
            // 如果无法聚焦原始元素，忽略错误
          }
        }
        resolve(null);
      }, 100);
    };
    buttonContainer.appendChild(cancelButton);

    // 确认按钮
    const confirmButton = document.createElement('button');
    confirmButton.textContent = '确认';
    confirmButton.style.cssText = `
      flex: 1;
      padding: 10px 16px;
      border: 1px solid var(--b3-border-color);
      border-radius: 4px;
      background: var(--b3-theme-primary);
      color: var(--b3-theme-on-primary);
      font-size: 14px;
      cursor: pointer;
    `;
    confirmButton.onclick = () => {
      if (overlay.parentNode) document.body.removeChild(overlay);
      setTimeout(() => {
        // 恢复焦点到原始元素
        if (activeElement && document.contains(activeElement)) {
          try {
            activeElement.focus({ preventScroll: true });
          } catch (e) {
            // 如果无法聚焦原始元素，忽略错误
          }
        }
        resolve(input.value.trim() || null);
      }, 100);
    };
    buttonContainer.appendChild(confirmButton);

    dialog.appendChild(buttonContainer);

    // 添加键盘事件监听（仅电脑端）
    // 注意：必须在按钮创建之后添加事件监听器
    const frontend = getFrontend();
    const isDesktop = frontend === 'desktop';

    if (isDesktop) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          // 触发确认按钮点击
          confirmButton.click();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          // 触发取消按钮点击
          cancelButton.click();
        }
      });
    }

    // 已禁用点击遮罩关闭功能，避免误触关闭对话框
    // 用户必须通过按钮或键盘快捷键来关闭对话框
    // overlay.onclick = null;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    // 尝试保持焦点在输入框上
    setTimeout(() => {
      if (activeElement && document.contains(activeElement)) {
        try {
          activeElement.focus({ preventScroll: true });
        } catch (e) {
          // 如果无法聚焦原始元素，忽略错误
        }
      }
    }, 0);
  });
}

/**
 * 将内容追加到每日笔记的替代方案（当appendDailyNoteBlock API不可用时）
 */
async function appendToDailyNoteAlternative(notebookId: string, content: string, showNotification?: boolean) {
  try {
    // 首先获取每日笔记的ID
    const dailyNoteResponse = await fetchSyncPost('/api/filetree/getDailyNote', {
      notebook: notebookId
    });
    
    if (dailyNoteResponse.code === 0 && dailyNoteResponse.data.box) {
      const docId = dailyNoteResponse.data.id;
      
      // 使用appendBlock API将内容追加到每日笔记
      const appendResponse = await fetchSyncPost('/api/block/appendBlock', {
        dataType: 'markdown',
        data: content,
        parentID: docId
      });
      
      if (appendResponse.code === 0) {
        if (showNotification) {
          Notify.showInfoCopySuccess();
        }
      } else {
        console.warn('[叶归LifeLog适配] 替代方案追加失败:', appendResponse.msg);
        // 如果追加失败，回退到插入到当前编辑器
        await insertContentToEditor(content);
      }
    } else {
      // 如果获取每日笔记失败，创建一个新的每日笔记
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      
      const title = `${year}年${month}月${day}日`;
      
      const createResponse = await fetchSyncPost('/api/filetree/createDailyNote', {
        notebook: notebookId,
        title: title
      });
      
      if (createResponse.code === 0 && createResponse.data) {
        // 创建成功后，再追加内容
        const appendResponse = await fetchSyncPost('/api/block/appendBlock', {
          dataType: 'markdown',
          data: content,
          parentID: createResponse.data
        });
        
        if (appendResponse.code === 0) {
          if (showNotification) {
            Notify.showInfoCopySuccess();
          }
        } else {
          console.warn('[叶归LifeLog适配] 创建后追加失败:', appendResponse.msg);
          // 如果追加失败，回退到插入到当前编辑器
          await insertContentToEditor(content);
        }
      } else {
        console.warn('[叶归LifeLog适配] 创建每日笔记失败:', createResponse.msg);
        // 如果创建失败，回退到插入到当前编辑器
        await insertContentToEditor(content);
      }
    }
  } catch (error) {
    console.warn('[叶归LifeLog适配] 替代方案执行失败:', error);
    // 如果所有方法都失败，回退到插入到当前编辑器
    await insertContentToEditor(content);
  }
}

/**
 * 将内容插入到编辑器
 */
async function insertContentToEditor(content: string): Promise<void> {
  // 查找当前活动的编辑器
  const activeProtyle = document.querySelector('.protyle:not(.fn__hidden)') as HTMLElement
  
  if (!activeProtyle) {
    // 如果没有找到活动编辑器，尝试查找任何编辑器
    const protyles = document.querySelectorAll('.protyle')
    if (protyles.length > 0) {
      // 使用最后一个编辑器
      for (let i = protyles.length - 1; i >= 0; i--) {
        const protyle = protyles[i] as HTMLElement
        if (!protyle.classList.contains('fn__hidden')) {
          await insertToSpecificProtyle(protyle, content)
          return
        }
      }
      // 如果都没有显示的，就用第一个
      await insertToSpecificProtyle(protyles[0] as HTMLElement, content)
      return
    }
  } else {
    await insertToSpecificProtyle(activeProtyle, content)
    return
  }

  // 如果仍然找不到编辑器，尝试通过思源API插入
  console.warn('未找到编辑器，无法插入内容')
}

/**
 * 模拟文本输入
 */
function simulateTextInput(text: string, targetElement: HTMLElement): void {
  // 创建一个临时输入框
  const tempInput = document.createElement('textarea')
  tempInput.value = text
  tempInput.style.cssText = 'position: fixed; top: 0; left: 0; opacity: 0;'
  document.body.appendChild(tempInput)
  tempInput.focus()
  tempInput.select()
  
  // 复制内容
  document.execCommand('copy')
  
  // 焦点回到目标元素
  targetElement.focus()
  
  // 触发粘贴事件
  const pasteEvent = new ClipboardEvent('paste', {
    clipboardData: new DataTransfer(),
    bubbles: true,
    cancelable: true
  })
  targetElement.dispatchEvent(pasteEvent)
  
  // 清理临时元素
  document.body.removeChild(tempInput)
}

/**
 * 向特定编辑器插入内容
 */
async function insertToSpecificProtyle(protyle: HTMLElement, content: string): Promise<void> {
  // 尝试获取编辑器实例
  const contentElement = protyle.querySelector('.protyle-content')
  if (contentElement) {
    // 如果编辑器可见，尝试插入内容
    try {
      // 在移动端避免强制获取焦点以防止输入法弹跳
      const frontend = getFrontend();
      const isMobile = frontend === 'mobile' || frontend === 'browser-mobile';
      
      if (!isMobile) {
        // 桌面端可以安全地获取焦点
        (contentElement as HTMLElement).focus();
      }
      
      // 使用document.execCommand插入内容
      document.execCommand('insertText', false, content)
    } catch (e) {
      console.warn('使用execCommand插入失败:', e)
      // 备用方法：直接在DOM中插入
      try {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createTextNode(content));
          range.collapse(false);
        } else {
          // 如果没有选择区域，直接追加到内容末尾
          contentElement.textContent += content;
        }
      } catch (domError) {
        console.warn('DOM插入方法也失败:', domError);
      }
    }
  }
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
 * 执行数据库悬浮弹窗
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
      Notify.showErrorCannotGetDatabaseId()
      return
    }

    // 获取属性视图信息
    const avResponse = await fetchSyncPost('/api/av/getAttributeView', {
      id: avId
    })

    if (avResponse.code !== 0 || !avResponse.data) {
      Notify.showErrorDatabaseInfoFailed()
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
      Notify.showErrorDataFetchFailed()
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
    console.error('数据库悬浮弹窗失败:', error)
    Notify.showErrorQueryFailed(error)
  }
}

/**
 * 显示数据库悬浮弹窗结果弹窗
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
    Notify.showInfoNoData()
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
        min-width: 80px;
        flex-shrink: 0;
        font-weight: 500;
      }
      .task-field-value {
        color: #1D1D1F;
        font-size: 13px;
        font-weight: 400;
        flex-grow: 1;
        word-break: keep-all;
        overflow-wrap: break-word;
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
          cardsHtml += `<div class="task-field"><span class="task-field-label">${col}</span><span class="task-field-value">${value}</span></div>`
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
  dialog.element.addEventListener('click', async (e) => {
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

    try {
      // 先获取块信息，提取文档ID（rootID）
      const response = await fetchSyncPost('/api/block/getBlockInfo', { id: blockId })

      if (response.code !== 0 || !response.data) {
        console.warn('[数据库弹窗] 获取块信息失败:', response)
        return
      }

      const docId = response.data.rootID

      if (isMobile) {
        // ==================== 手机端：使用 openMobileFileById 打开文档 ====================
        await openMobileFileById(pluginInstance.app, docId)

        // 等待文档加载后滚动到目标块
        setTimeout(() => {
          const blockElement = document.querySelector(`[data-node-id="${blockId}"]`)
          if (blockElement) {
            blockElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
            // 高亮显示
            ;(blockElement as HTMLElement).style.backgroundColor = 'var(--b3-theme-primary-lightest)'
            setTimeout(() => {
              ;(blockElement as HTMLElement).style.backgroundColor = ''
            }, 2000)
          }
        }, 500)
      } else {
        // ==================== 电脑端：使用 openTab 打开文档 ====================
        await siyuanOpenTab({
          app: pluginInstance.app,
          doc: { id: docId }
          // 注意：不设置 keepCursor，让思源自动跳转到新打开的标签页
        })

        // 等待文档加载后滚动到目标块
        setTimeout(() => {
          const blockElement = document.querySelector(`[data-node-id="${blockId}"]`)
          if (blockElement) {
            blockElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
            // 高亮显示
            ;(blockElement as HTMLElement).style.backgroundColor = 'var(--b3-theme-primary-lightest)'
            setTimeout(() => {
              ;(blockElement as HTMLElement).style.backgroundColor = ''
            }, 2000)
          }
        }, 500)
      }
    } catch (err) {
      console.warn('[数据库弹窗] 打开块失败:', err)
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

  // 清理持续检测定时器
  toolbarCheckTimers.forEach((timer, toolbarElement) => {
    clearTimeout(timer)
  })
  toolbarCheckTimers.clear()

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

  if (customButtonClickHandler) {
    document.removeEventListener('click', customButtonClickHandler, true)
    customButtonClickHandler = null
  }

  if (overflowCloseHandler) {
    document.removeEventListener('click', overflowCloseHandler)
    document.removeEventListener('touchend', overflowCloseHandler)
    overflowCloseHandler = null
  }

  // 清理工具栏观察器
  if (pendingTimer) {
    clearTimeout(pendingTimer)
    pendingTimer = null
  }
  if (toolbarObserver) {
    toolbarObserver.disconnect()
    toolbarObserver = null
  }

  // 清理工具栏样式变化事件监听器
  if (toolbarStyleChangeHandler) {
    window.removeEventListener('toolbar-style-changed', toolbarStyleChangeHandler)
    toolbarStyleChangeHandler = null
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

  // 清理扩展工具栏弹出层 DOM
  document.querySelectorAll('.overflow-toolbar-layer, .desktop-overflow-toolbar-layer').forEach(el => el.remove())
  document.documentElement.style.removeProperty('--mobile-toolbar-offset')

  // 清理全局变量
  delete (window as any).__mobileToolbarConfig
  delete (window as any).__mobileButtonConfigs
  delete (window as any).__toolbarManager

  // 重新设置全局工具栏管理器（cleanup 后可能被其他模块引用）
  setGlobalToolbarManager()

  // 清理残留的 CSS 样式元素
  const idsToRemove = [
    'mobile-toolbar-background-color-style',
    'mobile-toolbar-custom-style',
    'top-toolbar-custom-style',
    'overflow-toolbar-animation',
    'desktop-overflow-toolbar-animation',
    'custom-button-focus-style',
    'mobile-toolbar-dynamic-style',
    'popup-select-scrollbar-style'
  ]
  idsToRemove.forEach(id => {
    const el = document.getElementById(id)
    if (el) el.remove()
  })

  // 清理 TTS 朗读引擎
  destroyTTSEngine()
  destroyHttpTTSEngine()
  destroyMobileTTSEngine()
  destroyEdgeTTSEngine()
  destroyGoogleTTSEngine()
  cleanupMobileTTS()

  // 重置模块级变量
  currentButtonConfigs = []
  isSettingUpToolbar = false
  // 注意：不要在这里设置 pluginInstance = null
  // cleanup() 在重初始化时也会被调用（initPluginFunctions → cleanup → initCustomButtons）
  // 如果设为 null，后续异步代码读取 pluginInstance 会拿到 null，导致：
  //   - pluginInstance?.isMobile 为 undefined（平台判断错误）
  //   - pluginInstance?.desktopButtonConfigs 为 []（扩展工具栏无按钮）
  // pluginInstance 只应在 onunload 时清除
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

  // 规范化主键：兼容用户输入的符号/大小写差异（移动端常见）
  // 例如：⇧⌘↑ / ⇧⌘↓ / ⇧ENTER / ENTER 等
  const normalizeMainKey = (key: string): string => {
    const k = key.trim()
    if (k === '↑') return 'ArrowUp'
    if (k === '↓') return 'ArrowDown'
    if (k === '←') return 'ArrowLeft'
    if (k === '→') return 'ArrowRight'
    if (k.toUpperCase() === 'ENTER') return 'Enter'
    if (k.toUpperCase() === 'ESC') return 'Escape'
    if (k.toUpperCase() === 'SPACE') return 'Space'
    if (k.toUpperCase() === 'TAB') return 'Tab'
    if (k.toUpperCase() === 'BACKSPACE') return 'Backspace'
    if (k.toUpperCase() === 'DEL') return 'Delete'
    // 统一特殊键大小写：ArrowUp / Enter / Escape 等保持首字母大写
    // 若是 ArrowUp/Down 这种，保持原样；否则做首字母大写的弱规范
    if (/^arrow(up|down|left|right)$/i.test(k)) {
      const dir = k.slice(5).toLowerCase()
      return `Arrow${dir.charAt(0).toUpperCase()}${dir.slice(1)}`
    }
    if (/^f\d{1,2}$/i.test(k)) return k.toUpperCase()
    // 其他保持原样（单字母/数字走后续逻辑）
    return k
  }

  mainKey = normalizeMainKey(mainKey)

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
  // 思源 _getKeymapString() 顺序: ⌃(Mac Ctrl) → ⌥(Alt) → ⇧(Shift) → ⌘(Win Ctrl/Cmd)
  // 例如: Ctrl+Shift+Alt+K -> ⌥⇧⌘K
  const modifiers: string[] = []
  let mainKey = ''

  for (const char of result) {
    if (char === '⇧') modifiers.push('⇧')
    else if (char === '⌘') modifiers.push('⌘')
    else if (char === '⌃') modifiers.push('⌃')
    else if (char === '⌥') modifiers.push('⌥')
    else mainKey += char
  }

  // 思源 _getKeymapString() 拼接顺序: ⌃(Mac Ctrl) → ⌥(Alt) → ⇧(Shift) → ⌘(Win Ctrl/Cmd)
  const sortOrder = { '⌃': 0, '⌥': 1, '⇧': 2, '⌘': 3 }
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
export function getActiveProtyle(): any | null {
  const windowObj = window as any

  // 移动端：直接从 window.siyuan.mobile.editor.protyle 获取
  if (windowObj.siyuan?.mobile?.editor?.protyle) {
    return windowObj.siyuan.mobile.editor.protyle
  }

  // 桌面端：优先通过活动标签页获取（和思源 getActiveTab 同一逻辑）
  const activeTabElement = document.querySelector('.layout__wnd--active .item--focus')
  if (activeTabElement) {
    const activeId = activeTabElement.getAttribute('data-id')
    if (activeId && windowObj.siyuan?.layout?.centerLayout?.children) {
      const children = windowObj.siyuan.layout.centerLayout.children
      for (const child of children) {
        if (child.children && child.children.length > 0) {
          for (const tab of child.children) {
            if (tab.id === activeId && tab.model?.editor?.protyle) {
              return tab.model.editor.protyle
            }
          }
        }
      }
    }
  }

  // 备用1：遍历 layout children 查找可见的 protyle
  if (windowObj.siyuan?.layout?.centerLayout?.children) {
    const children = windowObj.siyuan.layout.centerLayout.children
    for (const child of children) {
      if (child.children && child.children.length > 0) {
        for (const tab of child.children) {
          if (tab.model?.editor?.protyle) {
            return tab.model.editor.protyle
          }
          if (tab.panelElement) {
            const protyleDiv = tab.panelElement.querySelector('.protyle')
            if (protyleDiv && (protyleDiv as any).protyle) {
              return (protyleDiv as any).protyle
            }
          }
        }
      }
      if (child.model?.editor?.protyle) {
        return child.model.editor.protyle
      }
    }
  }

  // 备用2：从所有 .protyle 元素中查找
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

      // 快捷键触发成功，直接返回
      return
    }
  }

  // ========== 备用方法：点击按钮 ==========
  const generalCommandHandlers: Record<string, () => void> = {
    'dailyNote': () => {
      const siyuan = (window as any).siyuan

      // 方法1: 尝试使用 window.siyuan 中的函数
      if (siyuan) {
        // 尝试查找可能的日记相关函数
        for (const key in siyuan) {
          if (typeof siyuan[key] === 'function' && key.toLowerCase().includes('daily')) {
            try {
              siyuan[key]()
              return
            } catch (e) {
              // 调用失败，继续尝试
            }
          }
        }
      }

      // 方法2: 尝试通过 fetchSyncPost 调用思源 API
      try {
        if (typeof (window as any).fetchSyncPost === 'function') {
          ;(window as any).fetchSyncPost('/api/notebook/lsNotebooks', {}).then((result: any) => {
            if (result.code === 0 && result.data) {
              result.data.notebooks?.find((nb: any) =>
                nb.name?.includes('日记') || nb.name?.includes('Daily')
              )
            }
          })
        }
      } catch (e) {
        // API 调用失败
      }

      // 方法3: 查找并触发菜单容器
      const menuContainers = document.querySelectorAll('.b3-menu, [role="menu"]')

      menuContainers.forEach(menu => {
        const items = menu.querySelectorAll('.b3-menu__item, [role="menuitem"]')
        items.forEach(item => {
          const text = item.textContent?.trim()
          if (text?.includes('日记')) {
            ;(item as HTMLElement).click()
          }
        })
      })
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

  Notify.showErrorCommandCannotExecute(command)
}

/**
 * 执行快捷键（主入口函数）
 */
function executeShortcut(config: ButtonConfig, savedSelection: Range | null = null, lastActiveElement: HTMLElement | null = null) {
  if (!config.shortcutKey) {
    Notify.showErrorShortcutNotConfigured(config.name)
    return
  }

  try {
    // 转换为思源的快捷键格式
    const siyuanHotkey = convertToSiyuanHotkey(config.shortcutKey)

    // ⌘/ 是思源硬编码的块菜单快捷键，不走 keymap 也不走键盘事件模拟，直接调用内部函数
    if (siyuanHotkey === '⌘/') {
      try {
        // 恢复编辑器焦点和选区
        const editArea =
          (lastActiveElement?.matches?.('[contenteditable="true"]') ? lastActiveElement : null) ||
          getActiveProtyleElement()?.querySelector('[contenteditable="true"]') as HTMLElement
        if (editArea && savedSelection) {
          editArea.focus()
          restoreSelection(savedSelection)
        }

        // 尝试多种方式获取 protyle 实例
        const windowObj = window as any
        let protyle: any = getActiveProtyle()

        if (!protyle) {
          const protyleEl = document.querySelector('.protyle:not(.fn__none)')
          protyle = protyleEl?.['protyle'] || protyleEl?.['__protoyle']
        }

        if (!protyle) {
          protyle = windowObj.siyuan?.editor?.protyle
        }

        if (!protyle) {
          const layout = windowObj.siyuan?.layout?.centerLayout
          if (layout?.children) {
            for (const child of layout.children) {
              if (child.model?.editor?.protyle) {
                protyle = child.model.editor.protyle
                break
              }
              if (child.children) {
                for (const tab of child.children) {
                  if (tab.model?.editor?.protyle) {
                    protyle = tab.model.editor.protyle
                    break
                  }
                }
              }
              if (protyle) break
            }
          }
        }

        if (protyle?.gutter && protyle?.wysiwyg?.element) {
          const selectElements = Array.from(
            protyle.wysiwyg.element.querySelectorAll('.protyle-wysiwyg--select')
          )
          let targetElement: HTMLElement | null = null

          if (selectElements.length > 0) {
            targetElement = selectElements[0] as HTMLElement
          } else {
            const selection = window.getSelection()
            if (selection && selection.rangeCount > 0) {
              const node = selection.anchorNode
              if (node) {
                const el = node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement
                targetElement = el?.closest('[data-node-id]') as HTMLElement
              }
            }
          }

          if (targetElement) {
            if (selectElements.length > 1) {
              protyle.gutter.renderMultipleMenu(protyle, selectElements as HTMLElement[])
            } else {
              protyle.gutter.renderMenu(protyle, targetElement)
            }
            const rect = targetElement.getBoundingClientRect()
            windowObj.siyuan?.menus?.menu?.popup({ x: rect.left, y: rect.top, isLeft: true })
            return
          }
        }

        // 备用方案：模拟右键菜单事件
        const selection = window.getSelection()
        if (selection && selection.rangeCount > 0) {
          const node = selection.anchorNode
          if (node) {
            const el = node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement
            const block = el?.closest('[data-node-id]') as HTMLElement
            if (block) {
              block.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window }))
              return
            }
          }
        }
      } catch (e) {
        console.warn('⌘/ 块菜单执行失败:', e)
      }
      return
    }

    // 优先通过 app.plugins 直接查找并执行插件命令（避免 dispatchEvent keyCode 不可靠的问题）
    const app = pluginInstance?.app
    if (app?.plugins) {
      let matchedCmd: any = null

      for (const plugin of app.plugins) {
        if (!plugin.commands) continue
        for (const cmd of plugin.commands) {
          if (cmd.customHotkey === siyuanHotkey) {
            matchedCmd = cmd
            break
          }
        }
        if (matchedCmd) break
      }

      if (matchedCmd) {
        const cmd = matchedCmd
        const hasEditorCallback = !!cmd.editorCallback

        // 恢复编辑器焦点和选区（editorCallback 需要正确的光标位置）
        if (hasEditorCallback && savedSelection) {
          const editArea =
            (lastActiveElement?.matches?.('[contenteditable="true"]') ? lastActiveElement : null) ||
            getActiveProtyleElement()?.querySelector('[contenteditable="true"]') as HTMLElement

          if (editArea) {
            editArea.focus()
            setTimeout(() => {
              restoreSelection(savedSelection)
              try {
                const protyle = getActiveProtyle()
                if (protyle) {
                  cmd.editorCallback(protyle)
                } else if (cmd.callback) {
                  cmd.callback()
                }
              } catch (e) {
                console.warn('插件命令 editorCallback 执行失败:', e)
              }
            }, 50)
            return
          }
        }

        // 非 editorCallback 或无保存选区，直接调用
        try {
          if (cmd.callback) {
            cmd.callback()
          } else if (cmd.editorCallback) {
            const protyle = getActiveProtyle()
            if (protyle) cmd.editorCallback(protyle)
          } else if (cmd.fileTreeCallback) {
            cmd.fileTreeCallback()
          } else if (cmd.dockCallback) {
            const el = document.querySelector('.layout__tab--active')
            if (el) cmd.dockCallback(el)
          } else if (cmd.globalCallback) {
            cmd.globalCallback()
          }
        } catch (e) {
          console.warn('插件命令回调执行失败:', e)
        }
        return
      }
    }

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
                  Notify.showInfoCopySuccess()
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
                    Notify.showInfoCopied(ref)
                  }
                } else {
                  Notify.showErrorCopyFailed()
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
                try {
                  // 恢复选区到之前的位置
                  restoreSelection(savedSelection)

                  // 触发键盘事件
                  const eventDown = new KeyboardEvent('keydown', keyEvent)
                  editArea.dispatchEvent(eventDown)
                } catch (e) {
                  // 部分思源快捷键（如 Ctrl+/ 块菜单）依赖内部选区状态，无法通过模拟键盘事件触发
                  console.warn('快捷键模拟执行失败:', config.shortcutKey, e)
                }
              }, 50)
              return
            }
          }

          // 通用命令：在 window 上触发
          const eventDown = new KeyboardEvent('keydown', keyEvent)
          window.dispatchEvent(eventDown)

          return
        }
      }

      Notify.showErrorCommandCannotExecute(command)
    } else {
      // 未在 keymap 中找到命令，直接触发用户输入的快捷键
      const keyEvent = parseHotkeyToKeyEvent(siyuanHotkey)
      if (keyEvent) {
        try {
          // 尽量向”当前编辑器可编辑区域”派发（很多快捷键只在编辑器焦点内生效）
          const protyleElement = getActiveProtyleElement()
          const editArea =
            (lastActiveElement?.matches?.('[contenteditable=”true”]') ? lastActiveElement : null) ||
            (protyleElement?.querySelector?.('[contenteditable=”true”]') as HTMLElement | null) ||
            (document.activeElement?.matches?.('[contenteditable=”true”]') ? (document.activeElement as HTMLElement) : null)

          const eventDown = new KeyboardEvent('keydown', keyEvent)
          const eventUp = new KeyboardEvent('keyup', keyEvent)

          if (editArea) {
            editArea.focus?.()
            editArea.dispatchEvent(eventDown)
            editArea.dispatchEvent(eventUp)
          } else {
            window.dispatchEvent(eventDown)
            window.dispatchEvent(eventUp)
          }
        } catch (e) {
          // 思源内部处理此快捷键时出错（可能不是有效快捷键）
          console.warn('思源处理此快捷键时出错:', e)
          Notify.showWarningShortcutMaybeInvalid(config.shortcutKey)
        }
      } else {
        Notify.showErrorShortcutCannotParse(config.shortcutKey)
      }
    }

  } catch (error) {
    console.error('执行快捷键失败:', error)
    Notify.showErrorShortcutFailed(config.shortcutKey, error)
  }
}

// 导入 windowDetector 中的函数
import {
  showSmallWindowTip as showSmallWindowTipFromDetector,
  triggerDesktopQuickNoteCapture,
} from './windowDetector';

// 一键记事执行函数
async function executeQuickNote(_config: ButtonConfig) {
  try {
    const tempPlugin = {
      mobileFeatureConfig: {
        ...(pluginInstance?.mobileFeatureConfig || {}),
        __quickNoteButtonTrigger: true,
      },
    };
    (window as any).__pluginInstance = tempPlugin;

    if (!isMobileDevice()) {
      await triggerDesktopQuickNoteCapture(true);
      return;
    }

    await showSmallWindowTipFromDetector();

  } catch (error) {
    console.error('一键记事执行失败:', error);
    const message = `按钮 "${_config.name}" 的一键记事功能执行失败`;
    showMessage(message, 3000, 'error');
  } finally {
    // 清理按钮触发标记，防止残留导致后续自启动弹窗被误判为按钮触发
    if ((window as any).__pluginInstance?.mobileFeatureConfig) {
      delete (window as any).__pluginInstance.mobileFeatureConfig.__quickNoteButtonTrigger;
    }
  }
}

/**
 * 执行弹窗选择输入功能
 */
async function executePopupSelect(config: ButtonConfig, savedSelection: Range | null = null, lastActiveElement: HTMLElement | null = null) {
  const templates = config.popupSelectTemplates || []
  
  if (templates.length === 0) {
    showMessage(`按钮 "${config.name}" 未配置模板列表`, 3000, 'error')
    return
  }
  
  // 显示模板选择弹窗
  const selectedTemplate = await showPopupSelectDialog(templates)
  
  if (selectedTemplate) {
    // 处理模板变量
    const processedContent = processTemplateVariables(selectedTemplate.content)
    
    // 优先使用保存的焦点元素，否则使用当前焦点元素
    const targetElement = lastActiveElement || document.activeElement
    
    // 检查是否在一键记事弹窗中（textarea元素）
    const isQuickNoteDialog = targetElement?.closest('#quick-note-dialog') || targetElement?.closest('#quick-note-dialog-desktop')
    if (isQuickNoteDialog && targetElement?.tagName === 'TEXTAREA') {
      // 在一键记事弹窗的textarea中插入模板
      const textarea = targetElement as HTMLTextAreaElement
      const startPos = textarea.selectionStart || textarea.value.length
      const endPos = textarea.selectionEnd || textarea.value.length
      
      // 插入模板内容
      textarea.value = textarea.value.substring(0, startPos) + processedContent + textarea.value.substring(endPos)
      
      // 更新光标位置到插入内容之后
      const newCursorPos = startPos + processedContent.length
      textarea.setSelectionRange(newCursorPos, newCursorPos)
      textarea.focus()
      return
    }
    
    // 原有逻辑：在思源编辑器中插入
    const activeEditor = targetElement?.closest('.protyle')
    
    if (activeEditor) {
      const contentEditable = activeEditor.querySelector('[contenteditable="true"]')
      if (contentEditable) {
        const inputEvent = new Event('input', { bubbles: true })
        try {
          document.execCommand('insertText', false, processedContent)
          contentEditable.dispatchEvent(inputEvent)
        } catch (error) {
          Notify.showErrorInsertTemplateFailed()
        }
      }
    } else {
      Notify.showInfoEditorNotFocused()
    }
  }
}

/**
 * 显示弹窗选择对话框
 */
export async function showPopupSelectDialog(templates: { name: string; content: string }[]): Promise<{ name: string; content: string } | null> {
  return new Promise((resolve) => {
    // 保存当前焦点元素
    const activeElement = document.activeElement as HTMLElement;
    
    // 阻止焦点转移的通用处理器
    const preventFocusLoss = (e: Event) => {
      e.preventDefault();
    };
    
    // 创建遮罩（居中显示，不挤占输入法区域）
    const overlay = document.createElement('div')
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 2147483647;
      padding: 20px;
    `
    
    overlay.tabIndex = -1;
    overlay.addEventListener('mousedown', preventFocusLoss);
    overlay.addEventListener('touchstart', preventFocusLoss);

    // 创建对话框容器
    const dialog = document.createElement('div')
    dialog.tabIndex = -1;
    dialog.style.cssText = `
      background: var(--b3-theme-background);
      border-radius: 12px;
      padding: 20px;
      width: 320px;
      max-width: 90vw;
      max-height: 60vh;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
      display: flex;
      flex-direction: column;
    `
    // 阻止 dialog 上的事件冒泡到 overlay 导致误关闭，但同样阻止焦点转移
    dialog.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });

    // 添加标题
    const title = document.createElement('div')
    title.textContent = '请选择模板'
    title.style.cssText = `
      font-size: 17px;
      font-weight: 600;
      padding-bottom: 16px;
      color: var(--b3-theme-on-background);
      text-align: center;
      border-bottom: 1px solid var(--b3-border-color);
      flex-shrink: 0;
    `
    dialog.appendChild(title)

    // 创建按钮容器（可滚动）
    const buttonContainer = document.createElement('div')
    buttonContainer.style.cssText = `
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 16px 4px 8px 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
      scrollbar-width: thin;
      scrollbar-color: var(--b3-scroll-color) transparent;
    `
    // Webkit 滚动条样式
    const styleId = 'popup-select-scrollbar-style'
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = `
        .popup-select-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .popup-select-scroll::-webkit-scrollbar-track {
          background: transparent;
          border-radius: 3px;
        }
        .popup-select-scroll::-webkit-scrollbar-thumb {
          background: var(--b3-scroll-color);
          border-radius: 3px;
        }
        .popup-select-scroll::-webkit-scrollbar-thumb:hover {
          background: var(--b3-theme-on-surface-light);
        }
      `
      document.head.appendChild(style)
    }
    buttonContainer.className = 'popup-select-scroll'

    // 关闭弹窗并恢复焦点的通用函数
    const closeAndResolve = (result: { name: string; content: string } | null) => {
      if (overlay.parentNode) {
        document.body.removeChild(overlay)
      }
      setTimeout(() => {
        if (activeElement && document.contains(activeElement)) {
          try {
            activeElement.focus({ preventScroll: true });
          } catch (e) {}
        }
        resolve(result)
      }, 100)
    }

    // 为每个模板创建按钮
    templates.forEach(template => {
      const button = document.createElement('button')
      button.tabIndex = -1;
      button.textContent = template.name
      button.style.cssText = `
        padding: 14px 16px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        font-size: 15px;
        cursor: pointer;
        transition: all 0.2s ease;
        text-align: left;
        flex-shrink: 0;
      `
      button.onmouseenter = () => {
        button.style.backgroundColor = 'var(--b3-theme-primary-lightest)'
        button.style.borderColor = 'var(--b3-theme-primary-light)'
      }
      button.onmouseleave = () => {
        button.style.backgroundColor = 'var(--b3-theme-surface)'
        button.style.borderColor = 'var(--b3-border-color)'
      }
      // 阻止 mousedown 导致的焦点转移（保持输入法状态）
      button.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      // 桌面端使用 click 事件
      button.onclick = (e) => {
        e.preventDefault();
        closeAndResolve(template)
      }
      // 移动端滑动检测：记录起始位置
      let touchStartY = 0;
      let touchStartX = 0;
      button.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        if (e.touches.length > 0) {
          touchStartY = e.touches[0].clientY;
          touchStartX = e.touches[0].clientX;
        }
      }, { passive: true });
      // 移动端：touchend 检测是否为滑动
      button.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // 检测滑动距离，超过 10px 认为是滑动，不触发点击
        if (e.changedTouches.length > 0) {
          const touchEndY = e.changedTouches[0].clientY;
          const touchEndX = e.changedTouches[0].clientX;
          const deltaY = Math.abs(touchEndY - touchStartY);
          const deltaX = Math.abs(touchEndX - touchStartX);
          if (deltaY > 10 || deltaX > 10) {
            return; // 是滑动，不触发点击
          }
        }
        closeAndResolve(template);
      });
      buttonContainer.appendChild(button)
    })
    
    dialog.appendChild(buttonContainer)

    // 添加取消按钮（底部固定）
    const cancelButton = document.createElement('button')
    cancelButton.tabIndex = -1;
    cancelButton.textContent = '取消'
    cancelButton.style.cssText = `
      padding: 12px 16px;
      border: none;
      border-radius: 8px;
      background: var(--b3-theme-surface);
      color: var(--b3-theme-on-surface-light);
      font-size: 14px;
      cursor: pointer;
      margin-top: 12px;
      flex-shrink: 0;
      transition: all 0.2s ease;
    `
    cancelButton.onmouseenter = () => {
      cancelButton.style.backgroundColor = 'var(--b3-theme-error-lighter)'
      cancelButton.style.color = 'var(--b3-theme-error)'
    }
    cancelButton.onmouseleave = () => {
      cancelButton.style.backgroundColor = 'var(--b3-theme-surface)'
      cancelButton.style.color = 'var(--b3-theme-on-surface-light)'
    }
    // 阻止 mousedown 导致的焦点转移（保持输入法状态）
    cancelButton.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    // 桌面端使用 click 事件
    cancelButton.onclick = (e) => {
      e.preventDefault();
      closeAndResolve(null)
    }
    // 移动端滑动检测：记录起始位置
    let cancelTouchStartY = 0;
    let cancelTouchStartX = 0;
    cancelButton.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      if (e.touches.length > 0) {
        cancelTouchStartY = e.touches[0].clientY;
        cancelTouchStartX = e.touches[0].clientX;
      }
    }, { passive: true });
    // 移动端：touchend 检测是否为滑动
    cancelButton.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 检测滑动距离，超过 10px 认为是滑动，不触发点击
      if (e.changedTouches.length > 0) {
        const touchEndY = e.changedTouches[0].clientY;
        const touchEndX = e.changedTouches[0].clientX;
        const deltaY = Math.abs(touchEndY - cancelTouchStartY);
        const deltaX = Math.abs(touchEndX - cancelTouchStartX);
        if (deltaY > 10 || deltaX > 10) {
          return; // 是滑动，不触发点击
        }
      }
      closeAndResolve(null);
    });
    dialog.appendChild(cancelButton)

    overlay.appendChild(dialog)
    document.body.appendChild(overlay)
    
    // 关键：弹窗显示后立即恢复焦点，保持输入法不关闭
    if (activeElement && document.contains(activeElement)) {
      try {
        activeElement.focus({ preventScroll: true });
      } catch (e) {}
    }
  })
}

/**
 * ⑨标签页Tab（移动端） - 切换显示/隐藏悬浮Tab栏
 */
function executeMobileTabs(config: ButtonConfig) {
  toggleMobileTabs(config)
}

/**
 * ⑩悬浮大纲（移动端） - 切换显示/隐藏悬浮大纲面板
 */
function executeMobileOutline(config: ButtonConfig) {
  toggleMobileOutline(config)
}

/**
 * ⑪前一篇/后一篇文档（移动端） - 切换显示/隐藏文档导航栏
 */
function executeMobileDocNav(config: ButtonConfig) {
  toggleMobileDocNav(config)
}

/**
 * 桌面端标签页Tab - 切换显示/隐藏悬浮Tab栏
 */
function executeDesktopTabs(config: ButtonConfig) {
  toggleDesktopTabs(config)
}

/**
 * 桌面端悬浮大纲 - 切换显示/隐藏悬浮大纲面板
 */
function executeDesktopOutline(config: ButtonConfig) {
  toggleDesktopOutline(config)
}

/**
 * 桌面端前一篇/后一篇文档 - 切换显示/隐藏文档导航栏
 */
function executeDesktopDocNav(config: ButtonConfig) {
  toggleDesktopDocNav(config)
}