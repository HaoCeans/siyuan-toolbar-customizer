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
import { showTTSOptionsDesktop, cleanupDesktopTTS } from "./tts/desktopPanel";
import { showTTSOptionsMobile, cleanupMobileTTS } from "./tts/mobilePanel";
import { destroyTTSEngine } from "./tts/ttsEngine";
import { destroyHttpTTSEngine } from "./tts/httpTtsEngine";
import { destroyMobileTTSEngine } from "./tts/mobileTtsEngine";
import { destroyEdgeTTSEngine, destroyGoogleTTSEngine } from "./tts/edgeTtsEngine";
// 确认对话框
import { showConfirmDialog } from "./ui/dialog";
// 内置按钮 ID 别名解析（思源 v3.7 重构菜单后兼容旧配置）
import { resolveBuiltinId } from "./ui/buttonSelector";
// API 工具
import { deleteBlock } from "./api";
import { uploadImageFile, insertProtyleImageAtCaret } from "./quickNote/imageInsert";
import { lucideToSvg } from "./utils/lucideHelper";
import * as licenseManager from "./utils/licenseManager";
import { insertMultiLineText } from "./utils/protyleEnter";
import { logger, setLoggingEnabled } from "./utils/logger"
import { getLocale, t } from "./i18n/runtime";

// ===== 插件实例（用于需要 app 参数的 API 调用） =====
export let pluginInstance: any = null;

/**
 * 设置插件实例（在插件初始化时调用）
 */
export function setPluginInstance(plugin: any): void {
  pluginInstance = plugin;
  // 暴露到全局，供 licenseManager 等避免循环引用的模块使用
  (window as any).__pluginInstance = plugin;
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
  overflowFollowMainStyle?: boolean;  // 扩展工具栏样式跟随主工具栏（去高亮线框，背景/毛玻璃跟随主栏；默认 false）
  followNativeBarsAutoHide?: boolean;  // 随思源导航栏自动隐藏工具栏（默认 true）
  showNavOnOverflow?: boolean;  // 底部固定模式下：默认隐藏思源导航栏，扩展栏打开时显示在扩展栏上方（默认 true；底部胶囊模式始终生效）

  // 顶部工具栏专用配置
  enableTopToolbar: boolean;  // 是否启用顶部工具栏（固定定位模式）
  topToolbarOffset: string;   // 顶部工具栏距离顶部的距离（如 "45px"）
  topToolbarPaddingLeft: string; // 顶部工具栏左边距
  overflowToolbarDistanceTop?: string  // 扩展工具栏距离顶部工具栏的距离（如 "8px"）
  overflowToolbarHeightTop?: string     // 顶部模式扩展工具栏高度（如 "40px"）
  topToolbarRetryDelay?: number;        // 顶部工具栏重试延迟（毫秒，0=无重试）

  // 底部胶囊工具栏配置
  enableFloatingToolbar?: boolean;  // 是否启用底部胶囊工具栏（默认 false：默认位置已改为侧边胶囊）
  floatingToolbarMargin?: string;   // 胶囊距底部距离
  floatingToolbarBorderRadius?: string; // 胶囊圆角
  floatingToolbarHeight?: string;   // 胶囊自身高度
	  floatingToolbarWidth?: string;    // 胶囊固定宽度（px），0=自动
	  floatingToolbarOverflowDistance?: string; // 胶囊扩展工具栏间距（px）
      floatingToolbarStyle?: string;   // 胶囊样式：normal=普通, glass=毛玻璃
      floatingToolbarScrollHide?: boolean; // 胶囊滚动隐藏

  // 侧边胶囊工具栏配置（与底部胶囊并存，互斥于其他模式）
  enableSideFloatingToolbar?: boolean;  // 是否启用侧边胶囊工具栏（默认 true：手机端默认位置）
  // 微缩小胶囊（收起态 ⋮ 按钮）配置
  sideMiniSide?: 'left' | 'right';  // 微缩小胶囊吸附侧，默认 'left'
  sideMiniBottom?: string;   // 微缩小胶囊距底部距离（如 "100px"）
  // 展开胶囊（展开面板）配置
  sideFloatingSide?: 'left' | 'right';  // 展开面板吸附侧，默认 'left'（与微缩胶囊同侧）
  sideFloatingMargin?: string;   // 展开胶囊距侧边距离（如 "12px"）
  sideFloatingBottom?: string;   // 展开胶囊距底部距离（如 "100px"）
  sideFloatingRadius?: string;   // 展开胶囊圆角（如 "24px"）
}

export interface ButtonConfig {
  id: string;                 // 唯一标识
  name: string;              // 按钮名称
  nameKey?: string;           // 内置默认名称的翻译键（不持久化翻译结果）
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
			  authorToolSubtype?: 'open-doc' | 'database' | 'diary' | 'life-log' | 'popup-select' | 'button-sequence' | 'scroll-doc' | 'image-upload' | 'mobile-tabs' | 'mobile-outline' | 'doc-nav' | 'slide-comment' | 'tts' | 'clear-empty-blocks' | 'toggle-lock' | 'quick-attach'; // 鲸鱼定制工具子类型
	  unlockIcon?: string;       // 解锁图标（仅 toggle-lock 使用，默认 🔓）
	  lockIcon?: string;         // 锁定图标（仅 toggle-lock 使用，默认 🔒）
	  toolbarAutoHide?: boolean; // 锁定时工具栏滚动隐藏（仅 toggle-lock + 移动端，默认 false）
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
  lifeLogCatFontSize?: number; // 叶归LifeLog适配：分类按钮字体大小（px，默认14）
  lifeLogCatPadding?: number; // 叶归LifeLog适配：分类按钮上下边距（px，默认8）
  lifeLogCatHPadding?: number; // 叶归LifeLog适配：分类按钮左右边距（px，默认4）
  lifelogGlobalCaptureEnabled?: boolean; // 叶归LifeLog：电脑端全局快捷键开关
  lifeLogInputFontSize?: number; // 叶归LifeLog适配：输入框字体大小（px，默认14）
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
	  collapseStyle?: 'preview' | 'minimal'; // 折叠面板样式：preview=收起显示预览小图标, minimal=收起仅显示展开手柄
	  bottomDistance?: number;   // 前一篇/后一篇导航栏距底部距离(px)，手机端默认80，桌面端默认20
	  showInContextMenu?: boolean; // 是否显示在文本右键菜单中（仅模板类型，默认false）
  buttonsPerLayer?: number[];  // 桌面端扩展工具栏：每层按钮数量，如 [8, 5, 5, 5, 5]（仅 overflow-button-desktop 使用）
  overflowToolbarHeight?: number;  // 桌面端扩展工具栏高度(px)，默认 32（仅 overflow-button-desktop 使用）
  overflowToolbarWidth?: number;   // 桌面端扩展工具栏宽度(px)，默认 0 表示与主工具栏同宽，最大 1300
  overflowAnimation?: boolean;  // 扩展工具栏打开动画（默认 true；false=直接弹出无动画，仅扩展工具栏按钮使用）
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
  // 底部工具栏配置（默认禁用，由底部胶囊替代）
  enableBottomToolbar: false,
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
  overflowFollowMainStyle: false,  // 扩展工具栏样式跟随主工具栏（去高亮线框，背景/毛玻璃跟随主栏；默认关）
  followNativeBarsAutoHide: true,  // 随思源导航栏自动隐藏工具栏（顶部固定/底部固定/底部胶囊均生效）
  showNavOnOverflow: true,    // 底部固定模式：扩展栏打开时显示思源导航栏（默认开；底部胶囊模式始终生效）

  // 顶部工具栏配置
  enableTopToolbar: false,    // 默认不启用（与底部工具栏互斥）
  topToolbarOffset: '45px',   // 距离顶部 45px
  topToolbarPaddingLeft: '0px', // 顶部工具栏左边距（居中显示）

	  // 底部胶囊工具栏配置（默认禁用，由侧边胶囊替代为默认位置）
	  enableFloatingToolbar: false,
	  floatingToolbarMargin: '50px',
	  floatingToolbarBorderRadius: '24px',
	  floatingToolbarHeight: '40px',
	  floatingToolbarWidth: '280',     // 固定宽度 280px（'0'=自动）
	  floatingToolbarOverflowDistance: '8',  // 扩展工具栏间距（px）
      floatingToolbarStyle: 'normal',
      floatingToolbarScrollHide: true,

  // 侧边胶囊工具栏配置（默认启用：手机端默认位置为侧边胶囊）
  enableSideFloatingToolbar: true,
  sideMiniSide: 'left',     // 微缩小胶囊吸附侧（默认左侧）
  sideMiniBottom: '40px',
  sideFloatingSide: 'left',  // 展开面板吸附侧（默认与微缩胶囊同侧）
  sideFloatingMargin: '12px',
  sideFloatingBottom: '100px',
  sideFloatingRadius: '24px',
	}

export const DEFAULT_BUTTONS_CONFIG: ButtonConfig[] = []

// 桌面端默认按钮（9个，包含扩展工具栏按钮）
export const DEFAULT_DESKTOP_BUTTONS: ButtonConfig[] = [
  {
    id: 'overflow-button-desktop',
    name: '扩展工具栏',
    nameKey: 'button.default.overflow',
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
    nameKey: 'button.default.more',
    type: 'click-sequence',
    clickSequence: ['more'],
    icon: 'lucide:Menu',
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
    nameKey: 'button.default.menu',
    type: 'click-sequence',
    clickSequence: ['doc'],
    icon: 'lucide:Blocks',
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
	    nameKey: 'button.default.lock',
	    type: 'author-tool',
	    authorToolSubtype: 'toggle-lock',
	    lockIcon: 'lucide:Lock',
	    icon: 'lucide:LockOpen',
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
    nameKey: 'button.default.pluginSettings',
    type: 'click-sequence',
    clickSequence: ['barPlugins', 'text:zh-CN=思源手机端增强|en=SiYuan Mobile Enhancer'],
    icon: 'lucide:Settings',
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
    nameKey: 'button.default.dailyNote',
    type: 'shortcut',
    shortcutKey: 'Alt+5',
    icon: 'lucide:CalendarDays',
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
    nameKey: 'button.default.insertTime',
    type: 'template',
    template: '{{hour}}时{{minute}}分',
    icon: 'lucide:TimerReset',
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
    nameKey: 'button.default.openBrowser',
    type: 'click-sequence',
    clickSequence: ['barWorkspace', 'config', 'text:zh-CN=鉴权|en=Authentication', 'text:zh-CN=打开浏览器|en=Open browser'],
    icon: 'lucide:Link',
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
    nameKey: 'button.default.recent',
    type: 'shortcut',
    shortcutKey: 'Ctrl+E',
    icon: 'lucide:BookText',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 8,
    platform: 'desktop',
    showNotification: true
  },
  {
    id: 'slide-comment-desktop',
    name: '鲸鱼快速批注',
    nameKey: 'button.default.authorTool',
    type: 'author-tool',
    authorToolSubtype: 'slide-comment',
    icon: 'lucide:FormInput',
    iconSize: 18,
    minWidth: 32,
    marginRight: 8,
    sort: 9,
    platform: 'desktop',
    showNotification: true
  }
]

// 移动端默认按钮（9个，包含扩展工具栏按钮）
export const DEFAULT_MOBILE_BUTTONS: ButtonConfig[] = [
  {
    id: 'overflow-button-mobile',
    name: '扩展工具栏',
    nameKey: 'button.default.overflow',
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
    nameKey: 'button.default.more',
    type: 'builtin',
    builtinId: 'more',
    icon: 'lucide:Menu',
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
    nameKey: 'button.default.menu',
    type: 'builtin',
    builtinId: 'doc',
    icon: 'lucide:Blocks',
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
		    nameKey: 'button.default.lock',
		    type: 'author-tool',
		    authorToolSubtype: 'toggle-lock',
		    lockIcon: 'lucide:Lock',
		    icon: 'lucide:LockOpen',
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
    nameKey: 'button.default.pluginSettings',
    type: 'click-sequence',
    clickSequence: ['toolbarMore', 'text:zh-CN=插件|en=Plugin', 'text:zh-CN=思源手机端增强|en=SiYuan Mobile Enhancer'],
    icon: 'lucide:Settings',
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
    nameKey: 'button.default.dailyNote',
    type: 'shortcut',
    shortcutKey: 'Alt+5',
    icon: 'lucide:CalendarDays',
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
    nameKey: 'button.default.insertTime',
    type: 'template',
    template: '{{hour}}时{{minute}}分',
    icon: 'lucide:TimerReset',
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
    nameKey: 'button.default.search',
    type: 'builtin',
    builtinId: 'menuSearch',
    icon: 'lucide:Search',
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
    nameKey: 'button.default.recent',
    type: 'builtin',
    builtinId: 'menuRecent',
    icon: 'lucide:BookText',
    iconSize: 23,
    minWidth: 23,
    marginRight: 10,
    sort: 8,
    platform: 'mobile',
    showNotification: true
  },
  {
    id: 'slide-comment-mobile',
    name: '鲸鱼快速批注',
    nameKey: 'button.default.authorTool',
    type: 'author-tool',
    authorToolSubtype: 'slide-comment',
    icon: 'lucide:FormInput',
    iconSize: 23,
    minWidth: 23,
    marginRight: 10,
    sort: 9,
    platform: 'mobile',
    showNotification: true
  }
]

/**
 * 恢复所有配置为出厂默认（插件首次安装状态），仅保留激活/授权相关字段。
 * 用于设置页「恢复默认出厂配置」功能（桌面端/手机端共用）。
 * - 按钮、全局按钮配置、手机端工具栏配置：显式写入 DEFAULT_* 常量
 * - 小功能配置（featureConfig）：移除存储键让 onload 回退内置默认，再把授权字段单独写回，
 *   避免清掉用户已购买的激活码/授权信息（授权字段就存在 featureConfig 里）
 */
export async function resetAllConfigsToFactoryDefaults(ctx: {
  desktopButtonConfigs: ButtonConfig[]
  mobileButtonConfigs: ButtonConfig[]
  desktopGlobalButtonConfig: GlobalButtonConfig
  mobileGlobalButtonConfig: GlobalButtonConfig
  desktopFeatureConfig: Record<string, unknown>
  mobileFeatureConfig: Record<string, unknown>
  mobileConfig: MobileToolbarConfig
  saveData: (key: string, value: unknown) => Promise<void>
  removeData: (key: string) => Promise<void>
  resetLogging?: () => Promise<void>
}): Promise<void> {
  // 按钮 → 出厂默认（深拷贝，避免共享引用）
  ctx.desktopButtonConfigs.splice(0, ctx.desktopButtonConfigs.length, ...DEFAULT_DESKTOP_BUTTONS.map(b => ({ ...b })))
  ctx.mobileButtonConfigs.splice(0, ctx.mobileButtonConfigs.length, ...DEFAULT_MOBILE_BUTTONS.map(b => ({ ...b })))

  // 全局按钮配置 → 出厂默认
  Object.assign(ctx.desktopGlobalButtonConfig, { ...DEFAULT_DESKTOP_GLOBAL_BUTTON_CONFIG })
  Object.assign(ctx.mobileGlobalButtonConfig, { ...DEFAULT_MOBILE_GLOBAL_BUTTON_CONFIG })

  // 手机端工具栏配置 → 出厂默认
  Object.assign(ctx.mobileConfig, { ...DEFAULT_MOBILE_CONFIG })

  // 小功能配置 → 出厂默认（保留授权字段 + 桌面端升级提示标记）
  const preserveKeys = [
    'authorActivated', 'authorCode', 'authorAccount',
    'licensePlan', 'licenseExpiry', 'licenseGraceEnd',
    'hasSeenDesktopFloatingNotice',
  ]
  const collectPreserved = (cfg: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const k of preserveKeys) {
      if (cfg[k] !== undefined) out[k] = cfg[k]
    }
    return out
  }
  const dFeature = ctx.desktopFeatureConfig
  const mFeature = ctx.mobileFeatureConfig
  await ctx.removeData('desktopFeatureConfig')
  await ctx.removeData('mobileFeatureConfig')
  await ctx.saveData('desktopFeatureConfig', collectPreserved(dFeature))
  await ctx.saveData('mobileFeatureConfig', collectPreserved(mFeature))

  // 保存其余出厂默认
  await ctx.saveData('desktopButtonConfigs', ctx.desktopButtonConfigs)
  await ctx.saveData('mobileButtonConfigs', ctx.mobileButtonConfigs)
  await ctx.saveData('desktopGlobalButtonConfig', ctx.desktopGlobalButtonConfig)
  await ctx.saveData('mobileGlobalButtonConfig', ctx.mobileGlobalButtonConfig)
  await ctx.saveData('mobileToolbarConfig', ctx.mobileConfig)

  // 其余独立配置也一并恢复出厂（TTS 引擎/语速设置、SF 语音 API 配置）
  // key 与 src/tts/httpTtsEngine.ts 中的常量保持一致
  await ctx.removeData('siyuan-tc-tts-settings')
  await ctx.removeData('siyuan-tc-sf-api')
  if (ctx.resetLogging) {
    await ctx.resetLogging()
  } else {
    await ctx.removeData('loggingConfig')
    setLoggingEnabled(false)
  }
}

// ===== 扩展工具栏辅助常量 =====
export const OVERFLOW_BUTTON_ID_MOBILE = 'overflow-button-mobile'
export const OVERFLOW_BUTTON_ID_DESKTOP = 'overflow-button-desktop'

export function isOverflowButton(id: string): boolean {
  return id === OVERFLOW_BUTTON_ID_MOBILE || id === OVERFLOW_BUTTON_ID_DESKTOP
}

/** 当前是否为侧边胶囊模式（读取移动端配置） */
function isSideFloatingMode(): boolean {
  const mobileCfg = (window as any).__mobileToolbarConfig as { enableSideFloatingToolbar?: boolean } | undefined
  return mobileCfg?.enableSideFloatingToolbar === true
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
let isCleanedUp = false  // cleanup 标志：true 表示插件正在被卸载，rAF/timer 回调应跳过 DOM 操作
// 电脑端悬浮胶囊工具栏专用：监听新出现的 .protyle-breadcrumb__bar 以便给它打 data-input-method 属性
let desktopFloatingObserver: MutationObserver | null = null
// 上一次应用电脑端胶囊时的配置快照（用于 MutationObserver 回调里重新打属性时使用）
let lastDesktopFloatingConfig: any = null
	// 电脑端胶囊滚动隐藏专用状态（独立于手机端的 toolbarAutoHide* 变量，避免互相干扰）
	let desktopFloatingScrollBoundEl: HTMLElement | null = null   // 当前已绑定 scroll 监听的元素
	let desktopFloatingScrollHandler: (() => void) | null = null  // scroll handler 引用（解绑用）
	let desktopFloatingScrollRetryTimer: ReturnType<typeof setInterval> | null = null  // bind 重试 interval
	let desktopFloatingTabPollTimer: ReturnType<typeof setInterval> | null = null  // 标签页切换轮询（电脑端多标签页需要）
	// 桌面端胶囊滚动隐藏专用的状态变量（完全独立，不与手机端共享）
	let desktopHiddenByScroll = false
	let desktopLastScrollTop: number | null = null
	let desktopAutoHideIgnoreUntil = 0
	let desktopAutoHideLastHide = 0
	let desktopAutoHideLastShow = 0
	let desktopAutoHidePendingTimer: ReturnType<typeof setTimeout> | null = null
	let desktopAutoHideForceActive = false
	let desktopAutoHideCapsuleMode = false
	
	// ===== 工具栏滚动隐藏/显示状态（仅移动端，跟随思源原生移动栏） =====
let toolbarAutoHideScrollHandler: ((e: Event) => void) | null = null  // 保留：unbindToolbarAutoHideScroll 清理用
let toolbarAutoHideBoundEl: HTMLElement | null = null  // 保留：unbindToolbarAutoHideScroll 清理用
let toolbarHiddenByScroll = false  // 当前插件工具栏是否处于隐藏状态
let toolbarScrollBindRetryTimer: ReturnType<typeof setInterval> | null = null  // 保留：unbindToolbarAutoHideScroll 清理用
	let toolbarAutoHideCapsuleMode = false  // 当前工具栏是否为胶囊布局（与滚动隐藏开关解耦）
let toolbarAutoHidePendingTimer: ReturnType<typeof setTimeout> | null = null  // 跟踪隐藏/显示的延时定时器
// 接管模式（底部胶囊/底部固定⑦）自身滚动隐藏专用状态：思源原生栏被接管后
// mobile-chrome--hidden 永不出现，由插件滚动监听自己驱动（独立变量，不与 nativeBars 状态互踩）
let mobileScrollAutoHideBoundEl: HTMLElement | null = null  // 当前已绑定 scroll 监听的滚动容器
let mobileScrollAutoHideHandler: ((e: Event) => void) | null = null  // scroll handler 引用（解绑用）
let mobileScrollAutoHideRetryTimer: ReturnType<typeof setInterval> | null = null  // bind 重试 interval
let mobileScrollAutoHideLastScrollTop: number | null = null  // 滚动基准（切文档 scrollTop 重置时防 delta 错乱）
let mobileScrollAutoHideIgnoreUntil = 0  // hide/show 后的静默期，期间只跟踪位置不动作
let mobileScrollAutoHideLastHide = 0  // 上次隐藏时间（冷却）
let mobileScrollAutoHideLastShow = 0  // 上次显示时间（冷却）
// 滚动方向阈值与冷却常量（桌面端胶囊滚动隐藏复用）
const TOOLBAR_AUTOHIDE_THRESHOLD = 15
const TOOLBAR_AUTOHIDE_COOLDOWN_HIDE = 200  // 隐藏冷却，防止反馈滚动触发反复切换
const TOOLBAR_AUTOHIDE_COOLDOWN_SHOW = 80   // 显示冷却较短，响应更灵敏
const toolbarCheckTimers = new Map<Element, ReturnType<typeof setTimeout>>()  // [已弃用] 保留兼容，不再写入
// 思源原生移动栏状态同步：移动端插件工具栏跟随思源原生顶部/底部导航栏一起隐藏/恢复
let nativeBarsObserver: MutationObserver | null = null  // 观察 body class 中 mobile-chrome--hidden 的变化
let nativeBarsLastHidden: boolean | null = null  // 上次同步的原生栏隐藏状态，状态未变时跳过

// ===== toggle-lock 串行写入队列（防止快速连续点击导致竞态） =====
let toggleLockWriteQueue: Promise<void> = Promise.resolve()

// 导出工具栏管理器对象
export const toolbarManager = {
  executeButton: async (config: ButtonConfig) => {
    await handleButtonClick(config, null, null, null);
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
 * 安全的 setInterval，返回的定时器会被跟踪以便清理。
 * 供 index.ts 的"工具栏自愈周期重试"使用，纳入 activeTimers 后会被 clearAllTimers 统一回收。
 */
export function safeSetInterval(callback: () => void, delay: number): ReturnType<typeof setInterval> {
  const timerId = setInterval(callback, delay)
  activeTimers.add(timerId)
  return timerId
}

/**
 * 清除由 safeSetInterval 返回的定时器，并从 activeTimers 移除。
 * 不传参时会与 clearAllTimers 一起执行；这里提供"单独清某个 interval"的能力。
 */
export function clearSafeInterval(timerId: ReturnType<typeof setInterval>): void {
  clearInterval(timerId)
  activeTimers.delete(timerId)
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
 * 清理已注册的 focus/blur 监听器（focusEventHandlers）。
 * - cleanup() 全量清理时调用；
 * - setupToolbarForElement 因"残留属性但无真实按钮"重新执行前也调用，避免重复绑定累积。
 */
function detachFocusEventHandlers(): void {
  focusEventHandlers.forEach(({ element, focusHandler, blurHandler }) => {
    element.removeEventListener('focus', focusHandler)
    element.removeEventListener('blur', blurHandler)
  })
  focusEventHandlers = []
}

/**
 * 判断"完全恢复思源原始状态"是否处于开启状态。
 * 实时读取 pluginInstance 配置——initMobileToolbarAdjuster 的 disableCustomButtons 参数
 * 是调用瞬间捕获的闭包值，运行时切换开关后必须读实时配置，否则 observer/重试回调
 * 会用旧的 false 值把清理掉的样式重新注入。
 */
function isRestoreOriginalStateActive(captured: boolean): boolean {
  if (captured) return true
  return pluginInstance?.mobileFeatureConfig?.disableCustomButtons === true
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
  // 优先读带 data-input-method 的元素（胶囊/底部固定模式下这才是真实宽度的容器）。
  // 胶囊模式 CSS（width:固定值/position:fixed）只挂在 [data-input-method] 上，
  // 外层 .protyle-breadcrumb 没有限宽，读它会把原生全屏宽度当成可用宽度，
  // 导致算法误判主层能放更多按钮（实际胶囊窄，按钮挤不下）。
  const breadcrumb = document.querySelector('.protyle-breadcrumb[data-input-method]') as HTMLElement ||
                     document.querySelector('.protyle-breadcrumb__bar[data-input-method]') as HTMLElement ||
                     document.querySelector('.protyle-breadcrumb:not(.protyle-breadcrumb__bar)') as HTMLElement ||
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
 * 主栏「面包屑」按钮的最低预留宽度（px）。
 * 与 ⑥「其他插件按钮预留宽度」机制一致：从主栏预算预留左侧原生按钮宽度。
 * 中文「面包屑」约 44px、英文 "Breadcrumb" 约 74px，72px 覆盖常见语言；
 * 实际宽度大于此值时按实测值扣减（见 getVisibleNativeButtonsWidth）。
 */
const MOBILE_BREADCRUMB_RESERVE_MIN = 72

/**
 * 测量主栏中「面包屑」按钮（mobile-menu chip）的当前实际宽度。
 * 只测量该按钮本身（不统计 readonly/doc/more/context 等其他原生按钮），
 * 确保「隐藏状态下的溢出计算与历史版本完全一致」（无感更新：老用户布局零变化）。
 * 隐藏（①开关开启，scale(0)/display:none）时返回 0，不占任何预算；
 * 显示时返回真实宽度，供主栏预算预留（与 ⑥「其他插件按钮预留宽度」同机制）。
 */
function getVisibleNativeButtonsWidth(): number {
  const breadcrumb = document.querySelector(
    '.protyle-breadcrumb[data-input-method], .protyle-breadcrumb__bar[data-input-method], .protyle-breadcrumb:not(.protyle-breadcrumb__bar), .protyle-breadcrumb__bar'
  ) as HTMLElement | null
  if (!breadcrumb) return 0
  const chip = breadcrumb.querySelector(':scope > .protyle-breadcrumb__icon[data-type="mobile-menu"]') as HTMLElement | null
  if (!chip) return 0
  const style = window.getComputedStyle(chip)
  if (style.display === 'none' || style.visibility === 'hidden') return 0
  const rect = chip.getBoundingClientRect()
  if (rect.width <= 0) return 0
  return rect.width + (parseFloat(style.marginLeft) || 0) + (parseFloat(style.marginRight) || 0)
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
  externalButtonsReserveWidth: number = 0,
  availableWidth?: number   // 可选：传入则使用此宽度（预览场景），否则调 getToolbarAvailableWidth()
): ButtonConfig[] {
  // 过滤出启用的移动端按钮，按排序值排序（从左到右）
  const enabledButtons = buttons.filter(btn =>
    btn.enabled !== false &&
    (btn.platform === 'mobile' || btn.platform === 'both') &&
    !isOverflowButton(btn.id)
  ).sort((a, b) => a.sort - b.sort)

  // 获取扩展工具栏按钮（⋯）
  const overflowButton = buttons.find(btn => isOverflowButton(btn.id))

  // 获取可用宽度：有传入则用传入值（预览场景），否则读真实 DOM
  const toolbarAvailableWidth = availableWidth ?? getToolbarAvailableWidth()

  // 主工具栏：需要预留 “⋯” 按钮 + 其他插件按钮预留宽度
  let mainAvailableWidth = toolbarAvailableWidth
  if (overflowButton && overflowButton.enabled !== false) {
    mainAvailableWidth -= getButtonWidth(overflowButton)
  }
  const reserveWidth = Math.max(0, Number(externalButtonsReserveWidth) || 0)
  mainAvailableWidth -= reserveWidth
  // 与 ⑥「其他插件按钮预留宽度」同机制：从主栏预算预留「面包屑」按钮宽度。
  // ①开启（面包屑隐藏，默认状态）：不扣任何宽度，与历史版本计算完全一致（无感更新）。
  // ①关闭（面包屑显示）：预留 max(MOBILE_BREADCRUMB_RESERVE_MIN, chip 实测宽度)，
  //   兜底 72px 覆盖测量时机未就绪等场景，实测更宽时按实测扣减。
  // 仅真实 DOM 场景扣除（预览场景已传入 availableWidth，跳过）；只扣主栏预算，不扣扩展面板预算。
  if (availableWidth == null) {
    const chipHidden = pluginInstance?.mobileFeatureConfig?.hideBreadcrumbIcon === true
    if (!chipHidden) {
      mainAvailableWidth -= Math.max(MOBILE_BREADCRUMB_RESERVE_MIN, getVisibleNativeButtonsWidth())
    }
  }

  // 扩展工具栏可用宽度 = 主工具栏可用宽度 - 扩展面板相对多出的尺寸
  // 底部固定模式：扩展面板 left:10px + right:10px + border:1px×2 = 22px
  // 胶囊模式：扩展面板用 getBoundingClientRect 跟随胶囊（无 left:10/right:10），
  //   仅多出 border:1px×2 = 2px（扩展面板 padding:0 12px 的 24px 中，16px 已被按钮 padding 覆盖，不重复扣）
  // 注意：预览场景传入 availableWidth 时按底部固定模式计算（模拟旧逻辑）
  const isFloatingMode = availableWidth == null &&
    (window as any).__mobileToolbarConfig?.enableFloatingToolbar === true
  const overflowExtra = isFloatingMode ? 2 : 22
  const overflowAvailableWidth = toolbarAvailableWidth - overflowExtra

    if (mainAvailableWidth <= 0 || overflowAvailableWidth <= 0) {
      return buttons.map(btn => ({ ...btn, overflowLevel: btn.overflowLevel ?? 0 }))
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

  // 毛玻璃背景效果（glassEffect 独立开关）：半透明背景 + 背景模糊，覆盖上方实色背景规则。
  // 与②工具栏样式（分割线）正交可叠加；排除胶囊模式——胶囊有独立的 floatingToolbarStyle glass/solid 选项。
  // 与 useThemeColor / 自定义色 / 透明度并存：透明度滑杆仍作用于整个元素（含模糊区）。
  if (pluginInstance?.mobileFeatureConfig?.glassEffect === true) {
    backgroundColorStyle.textContent += `
      /* 毛玻璃样式 - 明亮模式 */
      html:not([data-theme-mode="dark"]) body:not(.siyuan-toolbar-floating) .protyle-breadcrumb,
      html:not([data-theme-mode="dark"]) body:not(.siyuan-toolbar-floating) .protyle-breadcrumb__bar,
      html:not([data-theme-mode="dark"]) body:not(.siyuan-toolbar-floating).siyuan-toolbar-top-mode .protyle-breadcrumb,
      html:not([data-theme-mode="dark"]) body:not(.siyuan-toolbar-floating).siyuan-toolbar-top-mode .protyle-breadcrumb__bar {
        background: rgba(255, 255, 255, 0.25) !important;
        border-color: rgba(0, 0, 0, 0.06) !important;
        backdrop-filter: blur(20px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
      }
      /* 毛玻璃样式 - 黑暗模式 */
      html[data-theme-mode="dark"] body:not(.siyuan-toolbar-floating) .protyle-breadcrumb,
      html[data-theme-mode="dark"] body:not(.siyuan-toolbar-floating) .protyle-breadcrumb__bar,
      html[data-theme-mode="dark"] body:not(.siyuan-toolbar-floating).siyuan-toolbar-top-mode .protyle-breadcrumb,
      html[data-theme-mode="dark"] body:not(.siyuan-toolbar-floating).siyuan-toolbar-top-mode .protyle-breadcrumb__bar {
        background: rgba(30, 30, 30, 0.3) !important;
        border-color: rgba(255, 255, 255, 0.06) !important;
        backdrop-filter: blur(20px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
      }
    `
  }
}

// ===== 桌面端悬浮胶囊工具栏 =====
/**
 * 胶囊默认堆叠层级。必须是 50：这是加入可配置层级之前硬编码的值，
 * 保持该值才能让未设置过此项的老用户升级后显示效果不变。
 */
export const DEFAULT_FLOATING_TOOLBAR_Z_INDEX = 50

/**
 * 电脑端工具栏位置配置（从 desktopFeatureConfig 中读取的位置/胶囊相关字段）。
 * 与手机端 MobileToolbarConfig 解耦，独立维护。
 */
export interface DesktopFloatingToolbarConfig {
  enableFloatingToolbar: boolean
  floatingToolbarMargin: number        // 距底部距离（px）
  floatingToolbarBorderRadius: number  // 圆角（px）
  floatingToolbarHeight: number        // 胶囊自身高度（px）
  floatingToolbarWidth: number         // 宽度（0=auto 自适应）
  floatingToolbarZIndex: number        // 堆叠层级（z-index）
  floatingToolbarStyle: 'glass' | 'solid'
  floatingToolbarScrollHide: boolean   // 滚动隐藏：上滑隐藏、下滑显示
}

/**
 * 给外层 .protyle-breadcrumb 打上 data-input-method 属性（胶囊 CSS 的钩子）。
 *
 * 关键：桌面端必须打在【外层 .protyle-breadcrumb】而不是内层 .protyle-breadcrumb__bar。
 * 因为桌面端自定义按钮（[data-custom-button]）通过 createButtonsForEditors 注入到外层
 * .protyle-breadcrumb 上，是 .protyle-breadcrumb__bar 的兄弟节点。若只给 __bar 打属性，
 * fixed 的只是文档路径条，按钮会留在顶部原位——这就是之前的 bug。
 */
export function markDesktopBreadcrumbForFloating(): void {
  // 只匹配外层（排除 __bar）；排除已标记的，避免重复
  const outers = document.querySelectorAll('.protyle-breadcrumb:not(.protyle-breadcrumb__bar):not([data-input-method])')
  if (outers.length > 0) invalidateAutoHideElsCache()
  outers.forEach(outer => {
    ;(outer as HTMLElement).setAttribute('data-input-method', 'close')
  })
}

/**
 * 清理电脑端悬浮胶囊的所有痕迹（切回原生顶部 / 禁用自定义按钮 / unload 时调用）。
 */
function cleanupDesktopFloatingToolbar(): void {
  invalidateAutoHideElsCache()
  // 先解绑滚动隐藏（包括清除残留的 toolbar-scroll-hidden class / inline transform / 共享状态）
  unbindDesktopScrollForFloating()
  // 移除 body class
  document.body.classList.remove('siyuan-toolbar-desktop-floating')
  // 移除注入的样式
  const style = document.getElementById('desktop-floating-toolbar-style')
  if (style) style.remove()
  // 移除外层 breadcrumb 上的 data-input-method 属性（仅清理由本函数设置的）
  // 仅处理外层 .protyle-breadcrumb（不含 __bar），避免误清手机端的 __bar 属性
  document.querySelectorAll('.protyle-breadcrumb:not(.protyle-breadcrumb__bar)[data-input-method]').forEach(el => {
    ;(el as HTMLElement).removeAttribute('data-input-method')
  })
  // 断开 observer
  if (desktopFloatingObserver) {
    desktopFloatingObserver.disconnect()
    desktopFloatingObserver = null
  }
  lastDesktopFloatingConfig = null
}

/**
 * 应用电脑端悬浮胶囊工具栏。
 *
 * 设计要点（与手机端对齐）：
 * - 复用思源原生【外层 .protyle-breadcrumb】作为容器（它包含路径条 + 退出聚焦 + 所有自定义按钮）
 * - 给外层打 data-input-method 属性 + 注入 CSS 把它 position:fixed 到屏幕底部居中
 * - 隐藏路径条（.protyle-breadcrumb__bar）和占位符，胶囊里只保留工具按钮（用户已确认）
 * - 容器 DOM 不变，按钮注入逻辑（createButtonsForEditors）完全无需改
 *
 * 注意：不能 fixed 内层 .protyle-breadcrumb__bar，因为桌面端按钮是 __bar 的兄弟节点，
 * 固定 __bar 只会把路径条搬到下方而按钮留在原位。
 *
 * @param config  位置/胶囊配置
 * @param disableCustomButtons  是否禁用自定义按钮（true 时清理并恢复原生顶部）
 */
export function applyDesktopFloatingToolbar(config: DesktopFloatingToolbarConfig, disableCustomButtons: boolean = false) {
  // 仅电脑端执行
  if (isMobileDevice()) return
  invalidateAutoHideElsCache()
  // 禁用自定义按钮 或 未启用胶囊：清理后退出
  if (disableCustomButtons || !config?.enableFloatingToolbar) {
    cleanupDesktopFloatingToolbar()
    return
  }

  // 保存配置快照（observer 回调里重新打属性时需要）
  lastDesktopFloatingConfig = config

  // 1. body class（便于 CSS 选择器区分模式）
  document.body.classList.add('siyuan-toolbar-desktop-floating')

  // 2. 注入/更新样式
  const styleId = 'desktop-floating-toolbar-style'
  let style = document.getElementById(styleId) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = styleId
    document.head.appendChild(style)
  }
  const margin = config.floatingToolbarMargin ?? 20
  const radius = config.floatingToolbarBorderRadius ?? 24
  const height = config.floatingToolbarHeight ?? 40
  const widthVal = config.floatingToolbarWidth ?? 0
  const rawZIndex = config.floatingToolbarZIndex ?? DEFAULT_FLOATING_TOOLBAR_Z_INDEX
  const zIndex = Number.isFinite(rawZIndex)
    ? Math.min(2147483647, Math.max(0, Math.trunc(rawZIndex)))
    : DEFAULT_FLOATING_TOOLBAR_Z_INDEX
  const widthCss = widthVal > 0 ? `${widthVal}px` : 'auto'
  const maxWidthCss = widthVal > 0 ? 'none' : '95vw'
  const isGlass = config.floatingToolbarStyle !== 'solid'  // 默认 glass
  const blur = isGlass ? 'blur(20px) saturate(180%)' : 'blur(8px)'
  // 投影保持轻盈：仅一层柔和阴影，避免胶囊显得过重
  const shadow = isGlass ? '0 2px 10px rgba(0,0,0,0.10)' : '0 2px 8px rgba(0,0,0,0.08)'

  style.textContent = `
    /* 桌面端悬浮胶囊：固定【外层 .protyle-breadcrumb】到屏幕底部居中 */
    .protyle-breadcrumb[data-input-method]:not(.protyle-breadcrumb__bar) {
      position: fixed !important;
      bottom: calc(${margin}px + env(safe-area-inset-bottom)) !important;
      top: auto !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      width: ${widthCss} !important;
      max-width: ${maxWidthCss} !important;
      border-radius: ${radius}px !important;
      height: ${height}px !important;
      min-height: ${height}px !important;
      padding: 0 10px !important;
      display: flex !important;
      justify-content: center !important;
      align-items: center !important;
      gap: 2px !important;
      z-index: ${zIndex} !important;
      box-shadow: ${shadow} !important;
      backdrop-filter: ${blur};
      -webkit-backdrop-filter: ${blur};
	      ${isGlass ? 'background: rgba(255, 255, 255, 0.45) !important; border: 1px solid rgba(0, 0, 0, 0.06) !important;' : 'background: var(--b3-theme-background) !important; border: 1px solid var(--b3-border-color) !important;'}
	      transition: opacity 0.16s ease !important;
	      -webkit-backface-visibility: hidden;
      backface-visibility: hidden;
      will-change: transform;
    }
    ${isGlass ? `
      html[data-theme-mode="dark"] .protyle-breadcrumb[data-input-method]:not(.protyle-breadcrumb__bar) {
        background: rgba(30, 30, 30, 0.5) !important;
        border-color: rgba(255, 255, 255, 0.06) !important;
      }
    ` : ''}
    /* 隐藏文档路径条（胶囊里只保留工具按钮） */
    .protyle-breadcrumb[data-input-method]:not(.protyle-breadcrumb__bar) > .protyle-breadcrumb__bar,
    .protyle-breadcrumb[data-input-method]:not(.protyle-breadcrumb__bar) > .protyle-breadcrumb__space {
      display: none !important;
    }
    /* 胶囊内按钮统一高度对齐 */
    .protyle-breadcrumb[data-input-method]:not(.protyle-breadcrumb__bar) > button {
      height: ${height - 8}px !important;
      min-height: ${height - 8}px !important;
    }
  `

  // 3. 给当前所有外层 .protyle-breadcrumb 打属性
  markDesktopBreadcrumbForFloating()

  // 4. MutationObserver 一次性兜底：标记当前已存在的 breadcrumb
  //    后续新文档靠 eventBus（loaded-protyle-dynamic / switch-protyle）处理，
  //    不需要持续观察，避免按钮注入触发 DOM 变化陷入死循环。
  if (desktopFloatingObserver) {
    desktopFloatingObserver.disconnect()
  }
  let desktopObserverTimer: ReturnType<typeof setTimeout> | null = null
  desktopFloatingObserver = new MutationObserver(() => {
    // 100ms 防抖，避免高频 DOM 变化时重复扫描
    if (desktopObserverTimer) clearTimeout(desktopObserverTimer)
    desktopObserverTimer = safeSetTimeout(() => {
      markDesktopBreadcrumbForFloating()
      // 注入按钮到新出现的编辑器
      if (currentButtonConfigs.length > 0) {
        const editors = document.querySelectorAll('.protyle')
        if (editors.length > 0) {
          createButtonsForEditors(editors, currentButtonConfigs)
        }
      }
      // 执行一次后断开，后续靠 eventBus
      if (desktopFloatingObserver) {
        desktopFloatingObserver.disconnect()
        desktopFloatingObserver = null
      }
    }, 100)
  })
  const observeTarget = document.querySelector('.layout__center') ||
                       document.querySelector('.fn__flex-1.fn__flex-column') ||
                       document.body
  desktopFloatingObserver.observe(observeTarget, { childList: true, subtree: true })

  // 5. 滚动隐藏（用户可选）：上滑隐藏、下滑显示
  //    电脑端关闭时必须先解绑（避免上次开启的监听残留），再按新配置决定是否启动
  unbindDesktopScrollForFloating()
  if (config.floatingToolbarScrollHide) {
    startDesktopScrollForFloating()
  }
}

// ===== 移动端工具栏调整 =====
export function initMobileToolbarAdjuster(config: MobileToolbarConfig, disableCustomButtons: boolean = false) {
  // 仅在移动端初始化
  if (!isMobileDevice()) return

  // 完全恢复思源原始状态：拆除一切工具栏 machinery 并返回。
  // 注意必须实时读配置——运行时切换开关时，调用方（如设置面板 updateMobileToolbar）
  // 传入的 disableCustomButtons 可能与最新配置不一致，靠捕获值判断会漏。
  if (isRestoreOriginalStateActive(disableCustomButtons)) {
    restoreMobileToolbarOriginal()
    return
  }

  // 保存配置到全局变量，供扩展工具栏使用
  (window as any).__mobileToolbarConfig = config

	  // 记录胶囊布局（底部胶囊恢复时保持 translateX(-50%) 居中；侧边胶囊用 translateZ(0)）
	  toolbarAutoHideCapsuleMode = !!(config.enableFloatingToolbar || config.enableSideFloatingToolbar)
	
	  // 判断工具栏模式
	  const isFloating = config.enableFloatingToolbar
	  const isSideFloating = config.enableSideFloatingToolbar

  if (config.enableBottomToolbar || isFloating || isSideFloating) {
    // === 底部工具栏模式 ===
    // 移除顶部模式标记，添加底部模式标记
    document.body.classList.add('siyuan-toolbar-customizer-enabled')
    document.body.classList.remove('siyuan-toolbar-top-mode')
    // 底部胶囊模式：默认隐藏思源导航栏，扩展栏打开时再显示在扩展栏上方
    document.body.classList.toggle('siyuan-toolbar-floating', !!isFloating)
    // 底部固定模式（showNavOnOverflow 开关）：独立的导航栏隐藏/显示逻辑（与底部胶囊互不共用）
    document.body.classList.toggle('siyuan-toolbar-nav-overflow', !!config.enableBottomToolbar && config.showNavOnOverflow === true)
    // 接管模式下立即让思源暂停导航栏滚动隐藏（panelOpen 占位）
    if (isNavTakeoverMode()) {
      forceMenuPanelOpen()
    }

    // 移除顶部工具栏样式
    const topToolbarStyleToRemove = document.getElementById('top-toolbar-custom-style')
    if (topToolbarStyleToRemove) {
      topToolbarStyleToRemove.remove()
    }

    const setupToolbar = () => {
      // 防止递归调用
      if (isSettingUpToolbar) return false

      // 运行时开启"完全恢复"后，本函数仍会被存活的 observer 触发（捕获的 disableCustomButtons
      // 是旧值 false）：实时判断命中即拆除 machinery，避免样式/属性被重新注入。
      if (isRestoreOriginalStateActive(disableCustomButtons)) {
        restoreMobileToolbarOriginal()
        return false
      }

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
      // 更新CSS样式（每次都要执行，使胶囊配置变更实时生效）
      const updateToolbarCSS = () => {
    let cssText = ''
        const styleId = 'mobile-toolbar-custom-style'
        let style = document.getElementById(styleId) as HTMLStyleElement
        if (!style) {
          style = document.createElement('style')
          style.id = styleId
          document.head.appendChild(style)
        }
        // 恢复原始状态时清空 CSS；实时判断兜底（setupToolbar 守卫之外的任何直达调用路径）
        if (isRestoreOriginalStateActive(disableCustomButtons)) {
          cssText = ''
	        } else {
	          const floatMargin = config.floatingToolbarMargin || '20px'
	          const floatRadius = config.floatingToolbarBorderRadius || '24px'
	          if (isSideFloating) {
	            // === 侧边胶囊模式：吸附屏幕侧边的微缩 ⋮ 按钮，点击展开全部按钮面板 ===
	            const miniSide = config.sideMiniSide === 'right' ? 'right' : 'left'  // 默认左侧
	            const miniBottom = config.sideMiniBottom || '40px'
	            const floatRadius = config.sideFloatingRadius || '24px'
	            cssText = `
	            @media (max-width: 768px) {
	              .protyle-breadcrumb__bar[data-input-method],
	              .protyle-breadcrumb[data-input-method] {
	                position: fixed !important;
	                top: auto !important;
	                ${miniSide === 'left' ? 'right: auto !important;' : 'left: auto !important;'}
	                ${miniSide}: 8px !important;
	                bottom: calc(${miniBottom} + env(safe-area-inset-bottom)) !important;
	                /* !important 覆盖思源 #editor > .protyle-breadcrumb 的滚动上移（--mobile-bar-translate-y） */
	                transform: translateZ(0) !important;
	                /* 微缩小胶囊：淡主题色背景 + 细边框 + 圆角 + 柔和阴影 */
	                width: 30px !important;
	                max-width: none !important;
	                z-index: ${config.toolbarZIndex} !important;
	                border: 1px solid var(--b3-border-color) !important;
	                border-radius: ${floatRadius} !important;
	                padding: 2px !important;
	                display: flex !important;
	                flex-direction: column !important;
	                justify-content: center !important;
	                align-items: center !important;
	                background: var(--b3-theme-surface) !important;
	                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;
	                backdrop-filter: blur(10px);
	                -webkit-backdrop-filter: blur(10px);
	                height: 32px !important;
	                min-height: 32px !important;
	                -webkit-backface-visibility: hidden;
	                backface-visibility: hidden;
	                will-change: transform;
	              }
	              /* 侧边胶囊：清除按钮自带右边距，保证 ⋮ 在胶囊正中 */
	              .protyle-breadcrumb[data-input-method] [data-custom-button],
	              .protyle-breadcrumb__bar[data-input-method] [data-custom-button] {
	                margin-right: 0 !important;
	                margin-left: 0 !important;
	              }
	              /* 侧边胶囊：隐藏容器内所有非插件按钮（思源原生 readonly/doc/more/面包屑等），只保留 ⋮ */
	              .protyle-breadcrumb[data-input-method] > :not([data-custom-button]),
	              .protyle-breadcrumb__bar[data-input-method] > :not([data-custom-button]) {
	                display: none !important;
	              }
	          `
	          } else if (isFloating) {
	            const capHeight = config.floatingToolbarHeight || config.toolbarHeight || '40px'
	            const floatWidthVal = config.floatingToolbarWidth && parseInt(config.floatingToolbarWidth) > 0
	            const floatWidth = floatWidthVal ? `${config.floatingToolbarWidth}px` : 'auto'
	            const floatMaxWidth = floatWidthVal ? 'none' : '95vw'
	            const isGlass = config.floatingToolbarStyle === 'glass'
	            const floatBlur = isGlass ? 'blur(20px) saturate(180%)' : 'blur(10px)'
	            // 投影保持轻盈：仅一层柔和阴影，与电脑端胶囊一致，避免显得过重
	            const floatShadow = isGlass
	              ? '0 2px 10px rgba(0,0,0,0.10)'
	              : '0 2px 8px rgba(0, 0, 0, 0.08)'
	            cssText = `
	            @media (max-width: 768px) {
	              .protyle-breadcrumb__bar[data-input-method],
	              .protyle-breadcrumb[data-input-method] {
	                position: fixed !important;
	                bottom: calc(${floatMargin} + var(--mobile-toolbar-offset) + env(safe-area-inset-bottom)) !important;
	                top: auto !important;
                left: 50% !important;
                /* !important 覆盖思源 #editor > .protyle-breadcrumb 的滚动上移（--mobile-bar-translate-y） */
                transform: translateX(-50%) translateY(0) !important;
	                width: ${floatWidth} !important;
	                max-width: ${floatMaxWidth} !important;
	                z-index: ${config.toolbarZIndex} !important;
	                border: 1px solid var(--b3-border-color) !important;
	                border-radius: ${floatRadius} !important;
	                padding: 8px 12px !important;
	                display: flex !important;
	                justify-content: center !important;
	                align-items: center !important;
                box-shadow: ${floatShadow} !important;
                backdrop-filter: ${floatBlur};
	                -webkit-backdrop-filter: ${floatBlur};
	                height: ${capHeight} !important;
	                min-height: ${capHeight} !important;
	                -webkit-backface-visibility: hidden;
	                backface-visibility: hidden;
	                will-change: transform;
	              }
	              ${isGlass ? `
	              /* 毛玻璃模式 */
	              .protyle-breadcrumb__bar[data-input-method],
	              .protyle-breadcrumb[data-input-method] {
	                background: rgba(255, 255, 255, 0.25) !important;
	                border-color: rgba(0, 0, 0, 0.06) !important;
	              }
	              html[data-theme-mode="dark"] .protyle-breadcrumb__bar[data-input-method],
	              html[data-theme-mode="dark"] .protyle-breadcrumb[data-input-method] {
	                background: rgba(30, 30, 30, 0.3) !important;
	                border-color: rgba(255, 255, 255, 0.06) !important;
	              }` : ''}
	              /* 底部胶囊模式：默认隐藏思源导航栏，扩展栏打开时显示在扩展栏上方（间距=扩展栏间距） */
	              body.siyuan-toolbar-floating .mobile-bottom-bar {
	                visibility: hidden !important;
	                opacity: 0 !important;
	                pointer-events: none !important;
	              }
	              body.siyuan-toolbar-floating.tc-overflow-open .mobile-bottom-bar {
	                visibility: visible !important;
	                opacity: 1 !important;
	                pointer-events: auto !important;
	                transform: translate3d(0, 0, 0) !important;
	                /* --tc-nav-bottom 由 showOverflowToolbar 打开时按实际层数动态设置 */
	                bottom: calc(var(--mobile-toolbar-offset, 0px) + var(--tc-nav-bottom, 146px) + env(safe-area-inset-bottom)) !important;
	              }
	          `
	        } else {
          // 底部固定模式 CSS（原有）
          cssText = `
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
              /* !important 覆盖思源 #editor > .protyle-breadcrumb 的滚动上移（--mobile-bar-translate-y） */
              -webkit-transform: translateZ(0) !important;
              transform: translateZ(0) !important;
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

            body.siyuan-toolbar-customizer-enabled .protyle {
              padding-bottom: calc(${config.toolbarHeight} + env(safe-area-inset-bottom) + 3px) !important;
            }

            /* 底部固定模式：思源原生导航栏下边缘对齐插件工具栏上边缘（bottom = 工具栏高度） */
            body.siyuan-toolbar-customizer-enabled .mobile-bottom-bar {
              bottom: calc(${config.toolbarHeight} + env(safe-area-inset-bottom)) !important;
            }

            /* 底部固定模式（showNavOnOverflow 开关）：默认隐藏思源导航栏，扩展栏打开时显示在扩展栏上方（独立于底部胶囊） */
            body.siyuan-toolbar-nav-overflow .mobile-bottom-bar {
              visibility: hidden !important;
              opacity: 0 !important;
              pointer-events: none !important;
            }
            body.siyuan-toolbar-nav-overflow.tc-overflow-open .mobile-bottom-bar {
              visibility: visible !important;
              opacity: 1 !important;
              pointer-events: auto !important;
              transform: translate3d(0, 0, 0) !important;
              /* --tc-nav-bottom-fixed 由 showOverflowToolbar 打开时按底部固定扩展栏位置动态设置；
                 与扩展栏同坐标系（不含 safe-area），保证间距一致 */
              bottom: calc(var(--mobile-toolbar-offset, 0px) + var(--tc-nav-bottom-fixed, 96px)) !important;
            }

            .protyle-breadcrumb__bar[data-input-method].fn__none,
            .protyle-breadcrumb[data-input-method].fn__none {
              display: none !important;
            }
          }
        `
      }

      // 底部固定 + 胶囊模式共用：隐藏原生面包屑元素
      // （顶部模式在 top-toolbar-custom-style 里有自己的版本，这里只处理底部两种模式）
      // breadcrumb 在这两种模式下都带 data-input-method 属性
      cssText += `
        @media (max-width: 768px) {
          /* 隐藏空白占位符（flex:1 会吸走空余空间，胶囊模式下尤其明显） */
          .protyle-breadcrumb__bar[data-input-method] > .protyle-breadcrumb__space,
          .protyle-breadcrumb[data-input-method] > .protyle-breadcrumb__space {
            display: none !important;
          }

          /* 隐藏原生「退出聚焦」按钮（保留「面包屑」按钮，由①开关控制显示） */
          .protyle-breadcrumb__bar[data-input-method] > .protyle-breadcrumb__icon[data-type="exit-focus"],
          .protyle-breadcrumb[data-input-method] > .protyle-breadcrumb__icon[data-type="exit-focus"] {
            display: none !important;
          }

          /* 面包屑按钮：禁止 flex 压缩（它是主栏里唯一可收缩的元素，被压扁后文字会溢出挤压） */
          .protyle-breadcrumb__bar[data-input-method] > .protyle-breadcrumb__icon[data-type="mobile-menu"],
          .protyle-breadcrumb[data-input-method] > .protyle-breadcrumb__icon[data-type="mobile-menu"] {
            flex-shrink: 0 !important;
          }

          /* 最左侧自定义按钮去掉左边距 */
          .protyle-breadcrumb__bar[data-input-method] > .first-custom-button,
          .protyle-breadcrumb[data-input-method] > .first-custom-button {
            margin-left: 0 !important;
          }
        }
      `
    }
      // 内容未变化时跳过重写（mutationObserver 100ms 防抖会高频调用，避免持续样式重算）
      if (style.textContent !== cssText) {
        style.textContent = cssText
      }
  }

      // 执行CSS更新（每次都要刷新，使配置变更实时生效）
      updateToolbarCSS()

	    // 防止重复设置：真实性以"既有属性又有真实按钮节点"为准。
	    // 仅检查属性会在鸿蒙杀后台 DOM 快照恢复场景下误判（残留 data-toolbar-customized="true"
	    // 但实际按钮节点已被思源重建清空），导致 setup 短路、data-input-method 不重打、
	    // setupEditorButtons 的就绪信号永不成立 → 空白胶囊。
	    const toolbarEl = toolbar as HTMLElement
	    const hasRealButtons = !!toolbar.querySelector('[data-custom-button]')
	    if (toolbarEl.dataset.toolbarCustomized === 'true' && hasRealButtons) return

	    // 标记已设置（首次进入，或残留属性但无按钮的重建场景）
	    toolbarEl.dataset.toolbarCustomized = 'true'
	    // 侧边胶囊：加 data-prevent-swipe 阻止思源侧栏滑出手势
	    if (isSideFloating) {
	      toolbarEl.setAttribute('data-prevent-swipe', '')
	    }

	    // 重建场景下，先清理上一轮残留的 focus/blur 监听器，避免反复 setup 时累积泄漏。
	    // 首次进入时 focusEventHandlers 为空数组，调用是安全的 no-op。
	    detachFocusEventHandlers()

	    // 初始设置
	    let baseHeight = window.innerHeight
	    let inputMethodOpen = false

	    // 创建 CSS 变量
	    document.documentElement.style.setProperty('--mobile-toolbar-offset', config.closeInputOffset)

	    // 更新工具栏位置
	    function updateToolbarPosition() {
	      const currentHeight = window.innerHeight
	      const heightRatio = currentHeight / baseHeight
	      const threshold = config.heightThreshold / 100
	      const isNowOpen = heightRatio <= threshold
	      if (isNowOpen !== inputMethodOpen) {
	        inputMethodOpen = isNowOpen
	        if (inputMethodOpen) {
	          document.documentElement.style.setProperty('--mobile-toolbar-offset', config.openInputOffset)
	          toolbar.setAttribute('data-input-method', 'open')
	        } else {
	          document.documentElement.style.setProperty('--mobile-toolbar-offset', config.closeInputOffset)
	          toolbar.setAttribute('data-input-method', 'close')
	          baseHeight = currentHeight
	        }
	      }
	    }

	    safeSetTimeout(() => {
	      updateToolbarPosition()
	      toolbar.setAttribute('data-input-method', inputMethodOpen ? 'open' : 'close')
	      // data-input-method 打上后，主动触发一次自定义按钮注入。
	      // 原因：setupEditorButtons 的就绪信号就是 [data-input-method]，但它在 initCustomButtons
	      // 里用 rAF 重试等待该属性（60 帧上限）。冷启动/杀后台恢复时，rAF 重试可能因时序错开
	      // 而错过这个属性被打上的瞬间，导致胶囊外壳就绪但里面没有自定义按钮（空白胶囊）。
	      // 这里在属性打上的同一刻主动注入，彻底消除竞态。
	      if (currentButtonConfigs.length > 0) {
	        setupEditorButtons(currentButtonConfigs)
	      }
	    }, 100)

    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler)
    }
    resizeHandler = updateToolbarPosition
    window.addEventListener('resize', resizeHandler)

	    const textInputs = document.querySelectorAll('textarea, input[type="text"], .protyle-wysiwyg, .protyle-content, .protyle-input')
	    textInputs.forEach(input => {
	      const focusHandler = () => safeSetTimeout(updateToolbarPosition, 300)
	      const blurHandler = () => safeSetTimeout(updateToolbarPosition, 300)
	      input.addEventListener('focus', focusHandler)
	      input.addEventListener('blur', blurHandler)
	      focusEventHandlers.push({ element: input as HTMLElement, focusHandler, blurHandler })
	    })
	  }


	    // 尝试设置工具栏
	    if (!setupToolbar()) {
      // 如果没找到，按退避序列多轮重试（覆盖冷启动慢机型，例如鸿蒙/安卓杀后台后恢复）
      // 原"单次 2 秒重试"在冷启动场景下经常错过窗口（breadcrumb 晚于 2 秒才渲染）。
      // 用户显式设置 bottomToolbarRetryDelay=0 时禁用重试（保留原语义）。
      const userRetryDelay = config.bottomToolbarRetryDelay
      if (userRetryDelay === 0) {
        // 用户明确禁用重试：什么都不做
      } else if (userRetryDelay && userRetryDelay > 0) {
        // 用户自定义了重试延迟：沿用旧语义（单次），向后兼容
        safeSetTimeout(() => { setupToolbar() }, userRetryDelay)
      } else {
        // 默认：6 轮退避序列（2s/3s/4s/6s/8s/12s，累计约 35 秒）
        // setupToolbar 内部对已设置元素短路（data-toolbar-customized），任一成功即停
        const backoffSchedule = [2000, 3000, 4000, 6000, 8000, 12000]
        let elapsed = 0
        for (const step of backoffSchedule) {
          elapsed += step
          safeSetTimeout(() => { setupToolbar() }, elapsed)
        }
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
    
	    // 监听 DOM 变化，检测面包屑的出现
	    // 注意：必须 subtree: true，因为 .protyle-breadcrumb 在 .protyle 内层，
	    // 首次加载时 breadcrumb 可能还未渲染，需等 SiYuan 创建文档后才出现。
	    const toolbarContainer = document.querySelector('.layout__center') ||
	                            document.querySelector('.fn__flex-1.fn__flex-column') ||
	                            document.body
	    if (mutationObserver) mutationObserver.disconnect()
	    mutationObserver = new MutationObserver(handleMutation)
	    mutationObserver.observe(toolbarContainer, {
	      childList: true,
	      subtree: true,    // 必须 true，才能监测到深层 breadcrumb 的添加
	    })

    // 页面加载完成后检查一次
    updateToolbarVisibility()

    // 底部胶囊：滚动隐藏统一跟随思源原生移动栏（由 refreshToolbarAutoHide 绑定原生状态同步），
    // 不再由插件自身滚动监听驱动（floatingToolbarScrollHide 配置保留用于兼容）

    // 底部固定模式提前返回（悬浮模式继续执行到公共代码段）
    if (!isFloating) return
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
    const topOffsetValue = parseInt(config.topToolbarOffset) || 45
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
            /* 硬件加速 + !important 覆盖思源 #editor > .protyle-breadcrumb 的滚动上移（--mobile-bar-translate-y） */
            -webkit-transform: translateZ(0) !important;
            transform: translateZ(0) !important;
            -webkit-backface-visibility: hidden;
            backface-visibility: hidden;
            will-change: transform;
          }

          /* 隐藏空白间距 */
          body.siyuan-toolbar-top-mode .protyle-breadcrumb:not([data-toolbar-customized]) > .protyle-breadcrumb__space {
            display: none !important;
          }

          /* 隐藏原生「退出聚焦」按钮（保留「面包屑」按钮） */
          body.siyuan-toolbar-top-mode .protyle-breadcrumb:not([data-toolbar-customized]) > .protyle-breadcrumb__icon[data-type="exit-focus"] {
            display: none !important;
          }

          /* 面包屑按钮：禁止 flex 压缩 */
          body.siyuan-toolbar-top-mode .protyle-breadcrumb:not([data-toolbar-customized]) > .protyle-breadcrumb__icon[data-type="mobile-menu"] {
            flex-shrink: 0 !important;
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
        // 重新检查并设置顶部工具栏（用实时配置判断，开关切换后不再注入背景样式）
        if (config.enableTopToolbar) {
          applyToolbarBackgroundColor(config, isRestoreOriginalStateActive(disableCustomButtons))
        }
      }, retryDelay)
    }
  }
}

// ===== 自定义按钮功能 =====
export function initCustomButtons(configs: ButtonConfig[]) {
  // 保存当前配置，用于后续重试机制
  currentButtonConfigs = configs

  // 延时刷新工具栏滚动隐藏状态（等工具栏 DOM 初始化完毕）
  safeSetTimeout(() => refreshToolbarAutoHide(), 500)

  // 锁定时下一元素上移填补白条
  if (!document.getElementById('native-toolbar-lock-style')) {
    const lockStyle = document.createElement('style')
    lockStyle.id = 'native-toolbar-lock-style'
    lockStyle.textContent = `
      @media (max-width: 768px) {
        body.toolbar-locked > .toolbar.toolbar--border {
          position: relative !important;
          z-index: 1 !important;
        }
        body.toolbar-locked > .toolbar.toolbar--border + * {
          margin-top: -48px;
        }
      }
    `
    document.head.appendChild(lockStyle)
  }

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

  // 立即检测一次 Kmind-Zen 兼容
  refreshKmindZenCompat()

  // 注意：这里不要做”全局清理所有按钮”，否则在文档切换/动态刷新时会出现
  // “按钮整排先消失再出现”的闪烁。按钮的增删改由 createButtonsForEditors
  // 在每个编辑器内做差异判断后局部更新即可。

  // 清理旧的工具栏观察器
  if (toolbarObserver) {
    toolbarObserver.disconnect()
    toolbarObserver = null
  }

  // 初始设置：用 rAF 等待一帧，尽量避免因 DOM 尚未就绪而反复重建
  // 额外加一个短延迟重试，覆盖某些设备/模式下工具栏渲染较慢的情况
  requestAnimationFrame(() => {
    if (isCleanedUp) return
    setupEditorButtons(configs)
  })
  safeSetTimeout(() => {
    if (isCleanedUp) return
    setupEditorButtons(configs)
  }, 200)

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
  // 标记所有按钮为已销毁状态，让事件回调中的闭包引用作废
  const oldButtons = document.querySelectorAll('[data-custom-button]')
  oldButtons.forEach(btn => {
    ;(btn as HTMLElement).dataset.toolbarDestroyed = 'true'
    btn.remove()
  })
  // 清理分割线
  const oldDividers = document.querySelectorAll('[data-toolbar-divider]')
  oldDividers.forEach(div => div.remove())
}

function setupEditorButtons(configs: ButtonConfig[], waitFrameBudget = 60) {
  // 保存按钮配置到全局变量，供扩展工具栏使用
  (window as any).__mobileButtonConfigs = configs

  // 等待 initMobileToolbarAdjuster 初始化完成后再溢出计算
  // 底部固定/胶囊模式：必须要有 data-input-method CSS (position:fixed, width:xxx) 才生效，
  //   否则 getToolbarAvailableWidth() 读到的是 SiYuan 原生全屏宽度，不是胶囊真实宽度。
  // 顶部模式：breadcrumb 不带 data-input-method（设计如此），用 body.siyuan-toolbar-top-mode
  //   + breadcrumb 存在作为 ready 信号，否则顶部模式按钮永远无法注入。
  const isTopMode = document.body.classList.contains('siyuan-toolbar-top-mode')
  const toolbarReady = isTopMode
    ? document.querySelector('.protyle-breadcrumb, .protyle-breadcrumb__bar')
    : document.querySelector('.protyle-breadcrumb[data-input-method], .protyle-breadcrumb__bar[data-input-method]')
  if (isMobileDevice() && !toolbarReady) {
    // 等工具栏就绪信号；但加 60 帧（约 1 秒）上限，避免冷启动失败时无限 rAF 空转耗电。
    // 上限到达后停止，依赖：①补丁1的退避重试 ②补丁2的 onLayoutReady 自检 ③补丁3的切前台自愈
    //   ④EventBus(loaded-protyle-*/switch-protyle) ⑤点击编辑器时的 customButtonClickHandler
    // 这些信号在工具栏就绪后都会重新触发 setupEditorButtons(currentButtonConfigs)。
    if (waitFrameBudget > 0) {
      requestAnimationFrame(() => {
        if (isCleanedUp) return
        setupEditorButtons(configs, waitFrameBudget - 1)
      })
    }
    return
  }

  // 找到扩展工具栏按钮，获取层数配置
  const overflowBtn = configs.find(btn => btn.id === OVERFLOW_BUTTON_ID_MOBILE)
  const overflowLayers = (overflowBtn && overflowBtn.enabled !== false) ? (overflowBtn.layers || 1) : 0

  // 使用 requestAnimationFrame 确保工具栏已经渲染完成后再计算溢出
  const calculateOverflowWithDelay = (widthFrameBudget = 60) => {
    if (overflowLayers > 0) {
      // 尝试获取工具栏宽度，如果为0则等待重试
      const availableWidth = getToolbarAvailableWidth()
      if (availableWidth <= 0) {
        // 工具栏还没渲染完成，延迟重试（同样加 60 帧上限，避免无限空转）
        if (widthFrameBudget > 0) {
          requestAnimationFrame(() => {
            if (isCleanedUp) return
            calculateOverflowWithDelay(widthFrameBudget - 1)
          })
        } else {
          // 宽度等不到：放弃溢出计算，但仍尝试创建按钮（用默认全宽估算，下次 eventBus/click 会修正）
          const editors = document.querySelectorAll('.protyle')
          createButtonsForEditors(editors, configs)
        }
        return
      }

      const reserveWidth = pluginInstance?.mobileGlobalButtonConfig?.externalButtonsReserveWidth ?? 0
      const updatedButtons = calculateButtonOverflow(configs, overflowLayers, reserveWidth)
      // 侧边胶囊模式：所有按钮强制进扩展面板（主工具栏只保留 overflow 省略号按钮）
      const mobileCfg = (window as any).__mobileToolbarConfig as { enableSideFloatingToolbar?: boolean } | undefined
      if (mobileCfg?.enableSideFloatingToolbar) {
        updatedButtons.forEach(btn => {
          if (!isOverflowButton(btn.id)) btn.overflowLevel = 1
        })
      }
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
  requestAnimationFrame(() => {
    if (isCleanedUp) return
    calculateOverflowWithDelay()
  })
}

/**
 * 为编辑器创建按钮
 */
export function createButtonsForEditors(editors: NodeListOf<Element>, configs: ButtonConfig[]) {
  // 获取工具栏样式配置（根据当前平台读取对应配置）
  const isMobile = pluginInstance?.isMobile
  const featureConfig = isMobile ? pluginInstance?.mobileFeatureConfig : pluginInstance?.desktopFeatureConfig
  const toolbarStyle = featureConfig?.toolbarStyle || (isMobile ? 'divider' : 'default')
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

  let hasAnyReadonlyBtn = false // 标记是否有编辑器成功找到锁定按钮并创建了按钮

  editors.forEach(editor => {
    // 找到锁定编辑按钮
    const readonlyBtn = editor.querySelector('.protyle-breadcrumb__bar [data-type="readonly"]') ||
                        editor.querySelector('.protyle-breadcrumb [data-type="readonly"]')
    if (!readonlyBtn) return
    hasAnyReadonlyBtn = true // 找到了，标记成功

    // 过滤并排序按钮（sort降序：大→小，这样sort 0在最右边，紧挨锁定按钮）
    const buttonsToAdd = configs
      .filter(button => shouldShowButton(button) && shouldShowInMainToolbar(button))
      .sort((a, b) => b.sort - a.sort) // 降序

    // 检查现有按钮是否与配置匹配，如果完全匹配则跳过重建
    const existingButtons = editor.querySelectorAll('[data-custom-button]')
    if (existingButtons.length > 0 && existingButtons.length === buttonsToAdd.length) {
      const existingIds = new Set(Array.from(existingButtons).map(btn => (btn as HTMLElement).dataset.customButton))
      const allMatch = buttonsToAdd.every(b => existingIds.has(b.id))
      if (allMatch) {
        // 按钮无需重建，但仍需更新 toggle-lock 图标（切文档时锁状态变了）
        existingButtons.forEach(btn => {
          const btnConfig = configs.find(c => c.id === (btn as HTMLElement).dataset.customButton)
          if (btnConfig?.type === 'author-tool' && btnConfig.authorToolSubtype === 'toggle-lock') {
            // 限定当前编辑器读取（wysiwyg custom-sy-readonly 权威源，移动端无只读按钮也不受影响）
            updateToggleLockIcon(btn as HTMLElement, getDocLockedState(editor))
          }
        })
        return
      }
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

	    // 为 toggle-lock 类型的按钮初始化图标（根据当前文档锁状态）
	    const toggleLockBtns = editor.querySelectorAll<HTMLElement>('[data-custom-button]')
	    toggleLockBtns.forEach(btn => {
	      const btnConfig = configs.find(c => c.id === btn.dataset.customButton)
	      if (btnConfig?.type === 'author-tool' && btnConfig.authorToolSubtype === 'toggle-lock') {
	        updateToggleLockIcon(btn, getDocLockedState(editor))
	      }
	    })
	  })

	  // 重试机制：当编辑器已存在但 breadcrumb 尚未渲染完成（readonlyBtn 未找到）时，
	  // 延迟重试，避免切标签页后按钮消失。
	  if (editors.length > 0 && !hasAnyReadonlyBtn) {
	    const retryKey = `createButtons_retry_${Date.now()}`
	    let retryCount = 0
	    const doRetry = () => {
	      retryCount++
	      if (retryCount > 10) return // 最多重试 10 次（约 3 秒）
	      const readonlyBtn = document.querySelector(
	        '.protyle-breadcrumb__bar [data-type="readonly"]'
	      ) || document.querySelector(
	        '.protyle-breadcrumb [data-type="readonly"]'
	      )
	      if (readonlyBtn) {
	        createButtonsForEditors(document.querySelectorAll('.protyle'), configs)
	      } else {
	        safeSetTimeout(doRetry, 300)
	      }
	    }
	    safeSetTimeout(doRetry, 300)
	  }
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

const DEFAULT_NAME_BY_ID: Record<string, { key: string; legacy: string[] }> = {
  'overflow-button-desktop': { key: 'button.default.overflow', legacy: ['扩展工具栏'] }, 'overflow-button-mobile': { key: 'button.default.overflow', legacy: ['扩展工具栏'] },
  'more-desktop': { key: 'button.default.more', legacy: ['更多'] }, 'more-mobile': { key: 'button.default.more', legacy: ['更多'] },
  'doc-desktop': { key: 'button.default.menu', legacy: ['打开菜单'] }, 'doc-mobile': { key: 'button.default.menu', legacy: ['打开菜单'] },
  'readonly-desktop': { key: 'button.default.lock', legacy: ['锁住文档'] }, 'readonly-mobile': { key: 'button.default.lock', legacy: ['锁住文档'] },
  'plugin-settings-desktop': { key: 'button.default.pluginSettings', legacy: ['插件设置'] }, 'plugin-settings-mobile': { key: 'button.default.pluginSettings', legacy: ['插件设置'] },
  'open-diary-desktop': { key: 'button.default.dailyNote', legacy: ['打开日记'] }, 'open-diary-mobile': { key: 'button.default.dailyNote', legacy: ['打开日记'] },
  'template-time-desktop': { key: 'button.default.insertTime', legacy: ['插入时间'] }, 'template-time-mobile': { key: 'button.default.insertTime', legacy: ['插入时间'] },
  'open-browser-desktop': { key: 'button.default.openBrowser', legacy: ['伺服浏览器'] }, 'recent-docs-desktop': { key: 'button.default.recent', legacy: ['最近文档'] }, 'recent-docs-mobile': { key: 'button.default.recent', legacy: ['最近文档'] },
  'slide-comment-desktop': { key: 'button.default.authorTool', legacy: ['鲸鱼快速批注'] }, 'slide-comment-mobile': { key: 'button.default.authorTool', legacy: ['鲸鱼快速批注'] }, 'search-mobile': { key: 'button.default.search', legacy: ['搜索'] },
}
export function getButtonDisplayName(config: Pick<ButtonConfig, 'id' | 'name' | 'nameKey'>): string {
  const entry = DEFAULT_NAME_BY_ID[config.id]
  if (!entry || (config.nameKey && config.nameKey !== entry.key)) return config.name
  return entry.legacy.includes(config.name) ? t(entry.key, undefined, config.name) : config.name
}

function createButtonElement(config: ButtonConfig): HTMLElement {
  const button = document.createElement('button')
  button.dataset.customButton = config.id
  // 保留必要的功能性类，移除 block__icon（避免思源样式干扰）
  button.className = 'fn__flex-center ariaLabel'
  button.setAttribute('aria-label', getButtonDisplayName(config))

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

  // 设置图标内容（侧边胶囊模式下 overflow 按钮显示竖排省略号 ⋮）
  const renderIcon = (isOverflowButton(config.id) && isSideFloatingMode()) ? 'lucide:EllipsisVertical' : config.icon
  // 侧边胶囊：修正按钮 inline 样式，保证 ⋮ 在胶囊正中
  // （getButtonBaseStyle 的 margin-right/padding 是 inline !important，CSS 规则压不过，
  //   且按钮实际宽度 23px+16px padding 会超出 32px 胶囊容器）
  if (isOverflowButton(config.id) && isSideFloatingMode()) {
    button.style.setProperty('margin-right', '0', 'important')
    button.style.setProperty('padding', '0', 'important')
    button.style.width = '23px'
  }
  if (renderIcon.startsWith('icon')) {
    // 思源图标
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', `${config.iconSize}`)
    svg.setAttribute('height', `${config.iconSize}`)
    svg.style.cssText = 'flex-shrink: 0; display: block;'

    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
    use.setAttribute('href', `#${renderIcon}`)
    svg.appendChild(use)

    button.appendChild(svg)
  } else if (renderIcon.startsWith('lucide:')) {
    // Lucide 图标
    const iconName = renderIcon.substring(7)
    const svgString = lucideToSvg(iconName, config.iconSize)
    if (svgString) {
      button.innerHTML = svgString
      const svg = button.querySelector('svg')
      if (svg) {
        svg.style.cssText = 'flex-shrink: 0; display: block;'
      }
    } else {
      button.textContent = renderIcon
      button.style.fontSize = `${config.iconSize}px`
    }
  } else if (/\.(png|jpg|jpeg|gif|svg)$/i.test(renderIcon)) {
    // 图片路径（自定义图标）
    const pluginName = 'siyuan-toolbar-customizer'
    const imagePath = renderIcon.startsWith('/plugins/') ? renderIcon : `/plugins/${pluginName}/${renderIcon}`
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
    iconSpan.textContent = renderIcon
    button.appendChild(iconSpan)
  }

  // 如果开启显示名称，显示文字代替图标
  if (config.showName) {
    const displayNameBase = getButtonDisplayName(config)
    const nameLength = displayNameBase.length
    // 最多显示4个字，超过则截取前4个字
    const displayName = nameLength > 4 ? displayNameBase.slice(0, 4) : displayNameBase
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
	      e.preventDefault()  // 阻止按钮获得焦点，保持编辑器焦点/输入法不关闭
	      if (isTouchEvent) return // 如果是触摸事件，跳过选区保存（touchstart 已保存）
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

	    // 按钮已被清理（cleanupCustomButtons 设置了 dataset），直接返回避免闭包泄漏
	    if (button.dataset.toolbarDestroyed === 'true') return

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

    // 连续点击诊断：记录本次点击捕获到的选区状态（快捷键按钮依赖它定位插入位置）
    if (config.type === 'shortcut') {
      logger.log('[Shortcut] 点击捕获选区', {
        button: getButtonDisplayName(config),
        ...describeSavedSelection(savedSelection),
      })
    }

    // 将保存的选区和按钮元素传递给处理函数（使用 await 保持 async 链条）
    await handleButtonClick(config, savedSelection, lastActiveElement, button)

    // builtin 类型的按钮不恢复焦点，让输入法自然关闭
    // 其他类型恢复焦点（preventScroll 防止浏览器自动滚动到顶部）
    // 弹窗和移动端朗读面板不恢复编辑器焦点，避免面板关闭时重新弹出输入法
    const skipFocusRestore =
      button.dataset.qnotePopupTrigger === 'true'
      || (config.type === 'author-tool' && config.authorToolSubtype === 'tts')
    delete button.dataset.qnotePopupTrigger
    if (config.type !== 'builtin' && !skipFocusRestore) {
      if (lastActiveElement && lastActiveElement !== document.activeElement) {
        ;(lastActiveElement as HTMLElement).focus({ preventScroll: true })
      }
    }
  })

  return button
}


/**
 * 收集面包屑工具栏中"其他插件添加的按钮"（排除：本插件自定义按钮、思源原生按钮、
 * 空白占位/路径条/分割线等非交互元素）。
 * 侧边胶囊模式的微缩胶囊会把这些按钮 CSS 隐藏，这里把它们找出来镜像进展开面板。
 */
function findExternalToolbarButtons(): HTMLElement[] {
  const found: HTMLElement[] = []
  const seen = new Set<HTMLElement>()
  const isExcluded = (el: HTMLElement): boolean => {
    if (el.hasAttribute('data-custom-button')) return true    // 本插件按钮
    if (el.hasAttribute('data-toolbar-divider')) return true  // 本插件分割线
    if (el.hasAttribute('data-type')) return true             // 思源原生按钮（readonly/doc/more/mobile-menu/exit-focus）
    if (el.classList.contains('protyle-breadcrumb__space')) return true  // 空白占位
    if (el.classList.contains('protyle-breadcrumb__bar')) return true    // 路径条容器
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return true
    return false
  }
  const collect = (host: HTMLElement) => {
    Array.from(host.children).forEach(child => {
      const el = child as HTMLElement
      if (isExcluded(el)) return
      // 只收集"像按钮"的元素：button/a、或含图标（svg/img）、或有文字/可访问名——
      // 排除纯装饰元素（如其他插件的竖向分隔条：无内容、无图标、非 button/a）
      const looksInteractive = el.tagName === 'BUTTON' || el.tagName === 'A'
        || !!el.querySelector('svg, img')
        || (el.textContent || '').trim() !== ''
        || !!el.getAttribute('aria-label')
        || !!el.getAttribute('title')
      if (!looksInteractive) return
      if (seen.has(el)) return
      seen.add(el)
      found.push(el)
    })
  }
  document.querySelectorAll(
    '.protyle-breadcrumb[data-input-method], .protyle-breadcrumb__bar[data-input-method]'
  ).forEach(host => {
    collect(host as HTMLElement)
    // 路径条容器内部若存在其他插件按钮也收集（思源原生按钮已在排除项内）
    const bar = (host as HTMLElement).classList.contains('protyle-breadcrumb__bar')
      ? null
      : (host as HTMLElement).querySelector(':scope > .protyle-breadcrumb__bar')
    if (bar) collect(bar as HTMLElement)
  })
  return found
}

/**
 * 侧边胶囊展开面板：把其他插件加到工具栏的按钮镜像进面板底部。
 * 不 clone 原按钮（监听会丢），而是复制外观 + 点击时对原按钮 dispatch click——
 * 事件从原按钮冒泡，与真实点击路径一致（元素级/容器级/document 级监听都能触发）。
 */
function appendExternalPluginButtons(toolbar: HTMLElement): void {
  const externalBtns = findExternalToolbarButtons()
  if (externalBtns.length === 0) return

  const sep = document.createElement('div')
  sep.style.cssText = 'width: 100%; height: 1px; background: var(--b3-border-color); margin: 4px 0; flex-shrink: 0;'
  toolbar.appendChild(sep)

  externalBtns.forEach(orig => {
    const mirror = document.createElement('button')
    mirror.className = 'fn__flex-center ariaLabel'
    mirror.style.cssText = `
      display: flex; align-items: center; justify-content: center;
      height: 32px; margin-bottom: 2px;
      border: none; border-radius: 6px; background: transparent;
      color: var(--b3-theme-on-surface); cursor: pointer; flex-shrink: 0;
    `
    mirror.title = orig.getAttribute('aria-label') || orig.title || ''
    // 复制外观（图标/文字），并把内嵌 svg/img 尺寸归一
    mirror.innerHTML = orig.innerHTML
    mirror.querySelectorAll('svg').forEach(s => {
      s.setAttribute('width', '20')
      s.setAttribute('height', '20')
      s.style.cssText = 'flex-shrink: 0; display: block;'
    })
    mirror.querySelectorAll('img').forEach(im => {
      im.style.cssText = 'width: 20px; height: 20px; object-fit: contain; flex-shrink: 0; display: block;'
    })
    // 去掉复制内容中的装饰竖线（inline 宽 <=2px 且较高的元素，如插件工具栏分隔条）
    mirror.querySelectorAll('div, span').forEach(el => {
      const htmlEl = el as HTMLElement
      const w = parseInt(htmlEl.style.width || '', 10)
      const h = parseInt(htmlEl.style.height || '', 10)
      if (!Number.isNaN(w) && w <= 2 && !Number.isNaN(h) && h >= 8) {
        htmlEl.remove()
      }
    })
    // 图标用 background-image 画的按钮（innerHTML 为空）：提取背景图到镜像
    if (!mirror.innerHTML.trim()) {
      const cs = window.getComputedStyle(orig)
      const bg = cs.backgroundImage
      if (bg && bg !== 'none' && !bg.includes('gradient')) {
        mirror.style.backgroundImage = bg
        mirror.style.backgroundSize = '20px 20px'
        mirror.style.backgroundRepeat = 'no-repeat'
        mirror.style.backgroundPosition = 'center'
      }
    }
    mirror.addEventListener('mouseenter', () => {
      mirror.style.background = 'color-mix(in srgb, var(--b3-theme-on-surface) 8%, transparent)'
    })
    mirror.addEventListener('mouseleave', () => { mirror.style.background = 'transparent' })
    mirror.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()
      // 关闭展开面板（与层内自定义按钮行为一致）
      document.querySelectorAll('.overflow-toolbar-layer').forEach(el => el.remove())
      // 原位触发原按钮：事件在其上触发并冒泡，插件监听路径与真实点击一致
      orig.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    })
    toolbar.appendChild(mirror)
  })
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
	  const isCapsuleMode = toolbarAutoHideCapsuleMode  // 胶囊布局下扩展栏与胶囊同宽居中
	
	  // 获取层数配置（1-5层）
	  const layers = config.layers || 1

  // 获取移动端工具栏配置
  const mobileConfig = (window as any).__mobileToolbarConfig as MobileToolbarConfig

  // 扩展面板样式是否跟随主工具栏（去高亮线框；背景/毛玻璃跟随主栏）
  const panelFollowMain = mobileConfig?.overflowFollowMainStyle === true
  // 主栏毛玻璃是否开启（跟随模式下面板用同款半透明+模糊）
  const panelGlass = panelFollowMain && pluginInstance?.mobileFeatureConfig?.glassEffect === true

  // 工具栏高度和间距（根据顶部/底部模式从不同配置读取，默认值 40px 和 4px）
  const toolbarHeight = isBottomToolbar
    ? (parseInt(mobileConfig?.overflowToolbarHeightBottom || '') || 40)
    : (parseInt(mobileConfig?.overflowToolbarHeightTop || '') || 40)
  const toolbarSpacing = 4

  // 顶部工具栏和底部工具栏的不同偏移
  // 顶部模式：计算 = topToolbarOffset + 主工具栏高度 + overflowToolbarDistanceTop
  let topOffset = 100  // 默认值（无 mobileConfig 时的兜底）
  if (mobileConfig) {
    const topOffsetNum = parseInt(String(mobileConfig.topToolbarOffset ?? '45'), 10)
    const safeTop = Number.isNaN(topOffsetNum) ? 50 : topOffsetNum
    const _distanceTop = parseInt(String(mobileConfig.overflowToolbarDistanceTop ?? ''), 10)
    const distanceTopNum = Number.isNaN(_distanceTop) ? 8 : _distanceTop
    const mainToolbarHeightTop = parseInt(String(mobileConfig.toolbarHeight ?? '40'), 10) || 40
    topOffset = safeTop + mainToolbarHeightTop + distanceTopNum
  }
	  // 底部模式：计算 = closeInputOffset + 主工具栏高度 + overflowToolbarDistanceBottom
	  // 胶囊模式：使用胶囊自身配置（floatingToolbarMargin + floatingToolbarHeight + floatingToolbarOverflowDistance）
	  // 注意：不能用 if (mobileConfig?.closeInputOffset) —— 持久化里可能是数字 0、null、""，会误判为假，
	  // 从而整段不执行、bottomOffset 恒为 60，导致 overflowToolbarDistanceBottom 永远不生效。
	  let bottomOffset = 60
	  if (mobileConfig) {
	    if (isCapsuleMode) {
	      const _margin = parseInt(String(mobileConfig.floatingToolbarMargin ?? '20'), 10)
	      const _height = parseInt(String(mobileConfig.floatingToolbarHeight ?? '40'), 10)
	      const _dist = parseInt(String(mobileConfig.floatingToolbarOverflowDistance ?? '8'), 10)
	      bottomOffset = (Number.isNaN(_margin) ? 12 : _margin)
	                + (Number.isNaN(_height) ? 40 : _height)
	                + (Number.isNaN(_dist) ? 8 : _dist)
	    } else {
	      const bottomOffsetNum = parseInt(String(mobileConfig.closeInputOffset ?? '0'), 10)
	      const safeBottom = Number.isNaN(bottomOffsetNum) ? 0 : bottomOffsetNum
	      const _distanceBottom = parseInt(String(mobileConfig.overflowToolbarDistanceBottom ?? ''), 10)
	      const distanceBottomNum = Number.isNaN(_distanceBottom) ? 8 : _distanceBottom
	      const mainToolbarHeightBottom = parseInt(String(mobileConfig.toolbarHeight ?? '40'), 10) || 40
	      bottomOffset = safeBottom + mainToolbarHeightBottom + distanceBottomNum
	    }
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
  const toolbarStyle = featureConfig?.toolbarStyle || (isMobile ? 'divider' : 'default')
  const disableCustomButtons = featureConfig?.disableCustomButtons || false
  const useDivider = !disableCustomButtons && toolbarStyle === 'divider'

  // 根据工具栏位置选择动画方向
  const animationName = isBottomToolbar ? 'slideUp' : 'slideDown'

  // 添加动画样式和按钮状态样式（overflowAnimation 关闭时不加 animation 规则，仅保留 focus 样式）
  const animRule = config.overflowAnimation === false
    ? ''
    : `.overflow-toolbar-layer {
        animation: ${animationName} 0.2s ease-out;
      }`
  let animationStyle = document.getElementById('overflow-toolbar-animation')
  if (!animationStyle) {
    animationStyle = document.createElement('style')
    animationStyle.id = 'overflow-toolbar-animation'
    document.head.appendChild(animationStyle)
  }
  animationStyle.textContent = `
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    ${animRule}
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
    /* 扩展工具栏层隐藏滚动条（窄面板滚动条难看且占位；触摸惯性滚动不受影响） */
    .overflow-toolbar-layer {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    .overflow-toolbar-layer::-webkit-scrollbar {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
    }
  `

  // 侧边胶囊模式：单层显示全部按钮（不按 overflowLevel 过滤）
  const isSideMode = isSideFloatingMode()
  let renderedLayers = 0  // 实际渲染的层数（空层跳过，导航栏位置按实际层数计算）

  // 根据层数创建多个工具栏，并在每层显示对应的按钮
  for (let i = 0; i < layers; i++) {
    const layerNum = i + 1

    // 找出属于当前层的按钮，按 sort 降序排序（大→小，左→右，即视觉上从右到左）
    const layerButtons = enabledButtons
      .filter((btn: ButtonConfig) => isSideMode ? layerNum === 1 : (btn.overflowLevel ?? 0) === layerNum)
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
    if (isSideMode) {
      // 展开胶囊：按 sideFloating* 独立定位（与微缩小胶囊位置无关），从该位置向上展开
      const mobileCfg = (window as any).__mobileToolbarConfig as MobileToolbarConfig | undefined
      const side = mobileCfg?.sideFloatingSide === 'right' ? 'right' : 'left'  // 默认左侧
      const sideMargin = mobileCfg?.sideFloatingMargin || '12px'
      const sideBottom = parseInt(String(mobileCfg?.sideFloatingBottom ?? '100'), 10) || 100
      positionCss = `
        position: fixed;
        ${side}: calc(${sideMargin} + env(safe-area-inset-${side}));
        bottom: calc(${sideBottom}px + env(safe-area-inset-bottom));
      `
    } else if (isBottomToolbar) {
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

	    // 胶囊模式：扩展面板跟随胶囊的位置和宽度
	    let horizontalCss = 'left: 10px; right: 10px;'
	    if (isSideMode) {
	      // 侧边胶囊：横向定位已由 positionCss 的 ${side} 控制
	      horizontalCss = 'width: auto;'
	    } else if (isCapsuleMode) {
	      const capsuleEl = document.querySelector(
	        '.protyle-breadcrumb__bar[data-toolbar-customized], .protyle-breadcrumb[data-toolbar-customized]'
	      ) as HTMLElement
	      if (capsuleEl) {
	        const cr = capsuleEl.getBoundingClientRect()
	        horizontalCss = `left: ${cr.left}px; width: ${cr.width}px; box-sizing: border-box;`
	      }
	    }

	    if (isSideMode) {
	      // 展开胶囊面板：纯图标竖排，超出可滚动
	      const sideBottomNum = parseInt(String(mobileConfig?.sideFloatingBottom ?? '100'), 10) || 100
	      const sideRadius = parseInt(String(mobileConfig?.sideFloatingRadius ?? '24'), 10) || 24
	      toolbar.style.cssText = `
	        ${positionCss}
	        ${horizontalCss}
	        display: flex;
	        flex-direction: column;
	        align-items: stretch;
	        gap: 2px;
	        padding: 6px;
	        max-height: calc(100vh - ${sideBottomNum + 90}px);
	        overflow-y: auto;
	        background: var(--b3-theme-surface);
	        ${panelFollowMain ? 'border: none;' : 'border: 1px solid var(--b3-theme-primary);'}
	        border-radius: ${sideRadius}px;
	        z-index: ${1000 + i};
	        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	      `
	    } else {
	    toolbar.style.cssText = `
	      ${positionCss}
	      ${horizontalCss}
	      height: ${toolbarHeight}px;
	      background: var(--b3-theme-surface);
	      ${panelFollowMain ? 'border: none;' : 'border: 1px solid var(--b3-theme-primary);'}
	      border-radius: 8px;
	      display: flex;
	      align-items: center;
	      justify-content: flex-end;
	      padding: 0 12px;
	      z-index: ${1000 + i};
	      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	    `
	    }

    // 应用工具栏背景颜色和透明度配置
    if (mobileConfig) {
      if (panelGlass) {
        // 跟随模式 + 主栏毛玻璃：与主栏同款半透明背景 + 背景模糊（透明度与主栏一致）
        const isDark = document.documentElement.getAttribute('data-theme-mode') === 'dark'
        toolbar.style.background = isDark ? 'rgba(30, 30, 30, 0.3)' : 'rgba(255, 255, 255, 0.25)'
        toolbar.style.backdropFilter = 'blur(20px) saturate(180%)'
        ;(toolbar.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = 'blur(20px) saturate(180%)'
        toolbar.style.opacity = mobileConfig.toolbarOpacity.toString()
      } else if (mobileConfig.useThemeColor) {
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
      // 如果需要分割线且不是第一个按钮，先添加分割线（侧边胶囊竖排面板用横向分割线）
      if (useDivider && index > 0) {
        const divider = document.createElement('div')
        divider.dataset.toolbarDivider = 'true'
        divider.style.cssText = isSideMode
          ? 'width: 100%; height: 1px; background: var(--b3-border-color); margin: 2px 0; flex-shrink: 0; align-self: center;'
          : `
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
      layerBtn.setAttribute('aria-label', getButtonDisplayName(btn))
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
        const svgString = lucideToSvg(iconName, btn.iconSize)
        if (svgString) {
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
	        const displayNameBase = getButtonDisplayName(btn)
	        // 最多显示4个字，超过则截取前4个字
	        const displayName = displayNameBase.length > 4 ? displayNameBase.slice(0, 4) : displayNameBase
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

      // 侧边胶囊模式：按钮改为纯图标居中竖排样式（参考移动端导航胶囊），超出可滚动
      if (isSideMode) {
        layerBtn.style.cssText = `
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          min-height: 40px;
          padding: 6px;
          border-radius: 8px;
          background: transparent;
          border: none;
          cursor: pointer;
        `
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
	        e.preventDefault()  // 阻止按钮获得焦点
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
	        await handleButtonClick(btn, savedSelection, lastActiveElement, layerBtn)

	        // builtin 和移动端朗读按钮不恢复焦点，让输入法自然关闭
	        const skipFocusRestore = btn.type === 'author-tool' && btn.authorToolSubtype === 'tts'
	        if (btn.type !== 'builtin' && !skipFocusRestore) {
	          if (lastActiveElement && lastActiveElement !== document.activeElement) {
	            ;(lastActiveElement as HTMLElement).focus({ preventScroll: true })
	          }
	        }

	        // 确保按钮没有焦点（使用 setTimeout 确保在其他操作之后）
	        setTimeout(() => layerBtn.blur(), 0)
	      })

	      toolbar.appendChild(layerBtn)

      // toggle-lock：根据当前文档锁状态更新图标
      if (btn.type === 'author-tool' && btn.authorToolSubtype === 'toggle-lock') {
        // 限定当前活动编辑器读取，避免全局查询命中 fn__none 残留的旧编辑器（串台）
        updateToggleLockIcon(layerBtn, getDocLockedState(getActiveProtyle()))
      }
	    })

    // 侧边胶囊模式：把其他插件加到工具栏的按钮镜像进面板底部（分隔线隔开）
    if (isSideMode) {
      appendExternalPluginButtons(toolbar)
    }

    // 阻止触摸事件冒泡到 document，防止被其他 handler 意外关闭
    toolbar.addEventListener('touchstart', (e) => {
      e.stopPropagation()
    }, { passive: true })

    renderedLayers = layerNum
    document.body.appendChild(toolbar)
  }

  // 底部胶囊模式：按实际渲染层数动态设置导航栏位置（--tc-nav-bottom），
  // 与层堆叠公式 bottomPos = bottomOffset + i*(toolbarHeight+toolbarSpacing) 保持一致
  if (isCapsuleMode && !isSideFloatingMode()) {
    const dist = parseInt(String(mobileConfig?.floatingToolbarOverflowDistance ?? '8'), 10) || 8
    const navBottom = bottomOffset + (Math.max(0, renderedLayers - 1)) * (toolbarHeight + toolbarSpacing) + toolbarHeight + dist
    document.documentElement.style.setProperty('--tc-nav-bottom', `${navBottom}px`)
  }
  // 底部固定模式（showNavOnOverflow 开关）：独立计算导航栏位置（--tc-nav-bottom-fixed），
  // 间距用底部扩展栏间距（overflowToolbarDistanceBottom），与胶囊互不共用
  if (isBottomToolbar && mobileConfig?.showNavOnOverflow === true && !isSideFloatingMode()) {
    const dist = parseInt(String(mobileConfig?.overflowToolbarDistanceBottom ?? '8'), 10) || 8
    const navBottom = bottomOffset + (Math.max(0, renderedLayers - 1)) * (toolbarHeight + toolbarSpacing) + toolbarHeight + dist
    document.documentElement.style.setProperty('--tc-nav-bottom-fixed', `${navBottom}px`)
  }

  Notify.showOverflowToolbarOpened(layers, config.showNotification !== false)

  // 点击/触摸外部关闭
  const closeOnOutside = (e: Event) => {
    const target = e.target as HTMLElement
    const overflowButton = document.querySelector(`[data-custom-button="${config.id}"]`) as HTMLElement
    const hasToolbar = document.querySelector('.overflow-toolbar-layer')

    // 触摸阶段（touchend）排除思源导航栏区域：触摸导航栏按钮时不能关闭扩展栏，
    // 否则合成 click 前扩展栏被移除、导航栏隐藏，导致按钮点不到（鼠标无此问题）
    const isTouchPhase = e.type === 'touchend'
    const onNavBar = !!target.closest('.mobile-bottom-bar')

    if (hasToolbar && !target.closest('.overflow-toolbar-layer') && !(isTouchPhase && onNavBar) && (!overflowButton || !overflowButton.contains(target))) {
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

  // 添加动画样式（overflowAnimation 关闭时不加 animation 规则，仅保留 focus 样式；
  // 每次打开都重写，保证开关切换后旧 animation 规则被移除）
  const animRule = config.overflowAnimation === false
    ? ''
    : `.desktop-overflow-toolbar-layer {
        animation: desktopOverflowSlideDown 0.2s ease-out;
      }`
  let animationStyle = document.getElementById('desktop-overflow-toolbar-animation')
  if (!animationStyle) {
    animationStyle = document.createElement('style')
    animationStyle.id = 'desktop-overflow-toolbar-animation'
    document.head.appendChild(animationStyle)
  }
  animationStyle.textContent = `
    @keyframes desktopOverflowSlideDown {
      from { opacity: 0; transform: translateY(-6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    ${animRule}
    .desktop-overflow-toolbar-layer button:focus {
      background-color: transparent !important;
      box-shadow: none !important;
      outline: none !important;
    }
  `

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
      layerBtn.setAttribute('aria-label', getButtonDisplayName(btn))
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
        const svgString = lucideToSvg(iconName, btn.iconSize)
        if (svgString) {
          layerBtn.innerHTML = svgString
          const svg = layerBtn.querySelector('svg')
          if (svg) {
            svg.style.cssText = 'flex-shrink: 0; display: block;'
          }
        } else {
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
        const displayNameBase = getButtonDisplayName(btn)
        const displayName = displayNameBase.length > 4 ? displayNameBase.slice(0, 4) : displayNameBase
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

	        await handleButtonClick(btn, savedSelection, lastActiveElement, null)
	        
	        if (btn.type !== 'builtin' && lastActiveElement && lastActiveElement !== document.activeElement) {
	          ;(lastActiveElement as HTMLElement).focus({ preventScroll: true })
	        }
	        setTimeout(() => layerBtn.blur(), 0)
	      })

	      toolbar.appendChild(layerBtn)

      // toggle-lock：根据当前文档锁状态更新图标
      // 注意：只读按钮是 .protyle-breadcrumb 的直接子级（bar 的兄弟），在 bar 内查不到；
      // 且要用 .protyle 范围查询，避免命中其他编辑器的按钮
      if (btn.type === 'author-tool' && btn.authorToolSubtype === 'toggle-lock') {
        updateToggleLockIcon(layerBtn, getDocLockedState(breadcrumbBar.closest('.protyle')))
      }
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
    showMessage(t('toolbarManager.1', undefined, '扩展工具栏中没有按钮，请在设置中调整「每层按钮数量」配置'), 3000, 'info')
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
 * 快捷键类型按钮的防连点间隔。
 *
 * 这类按钮等价于「替你按一次快捷键」，而思源的文档/大纲等快捷键是开关：
 * 连点 N 次就是开关 N 次，偶数次回到原样，看起来像点了没反应，中间还会闪烁。
 * 因此同一按钮在此间隔内的重复点击直接忽略（各按钮独立计时）。
 */
const SHORTCUT_CLICK_COOLDOWN_MS = 300
const lastShortcutClickAt = new Map<string, number>()

/**
 * 处理按钮点击
 */
async function handleButtonClick(
  config: ButtonConfig,
  savedSelection: Range | null,
  lastActiveElement: HTMLElement | null,
  clickedButton: HTMLElement | null
) {
  // 快捷键按钮防连点：放在最前面，连点被忽略时也不再弹提示
  if (config.type === 'shortcut') {
    const now = Date.now()
    const last = lastShortcutClickAt.get(config.id)
    if (last !== undefined && now - last < SHORTCUT_CLICK_COOLDOWN_MS) {
      logger.log('[Shortcut] 连点冷却中，本次点击已忽略', {
        buttonId: config.id,
        button: getButtonDisplayName(config),
        sinceLastMs: now - last,
        cooldownMs: SHORTCUT_CLICK_COOLDOWN_MS,
      })
      return
    }
    lastShortcutClickAt.set(config.id, now)
  }

  // 如果开启了右上角提示，显示消息
  const notificationEnabled = config.showNotification !== false
  Notify.showButtonExecNotification(getButtonDisplayName(config), notificationEnabled)

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
    // 执行点击序列，传入插件按钮用于修正隐藏按钮的菜单位置
    executeClickSequence(config, clickedButton)
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
    Notify.showErrorButtonNotConfigured(getButtonDisplayName(config))
    return
  }

  // 应用别名映射（思源 v3.7 重构手机端菜单后，旧 ID 自动转新 ID）
  const targetId = resolveBuiltinId(config.builtinId)

  // 尝试多种方式查找按钮
  let menuItem: HTMLElement | null = null

  // 1. 通过 id 查找
  menuItem = document.getElementById(targetId)
  if (menuItem) {
    clickElement(menuItem)
    return
  }

  // 2. 通过 data-id 查找
  menuItem = document.querySelector(`[data-id="${targetId}"]`) as HTMLElement
  if (menuItem) {
    clickElement(menuItem)
    return
  }

  // 3. 通过 data-menu-id 查找
  menuItem = document.querySelector(`[data-menu-id="${targetId}"]`) as HTMLElement
  if (menuItem) {
    clickElement(menuItem)
    return
  }

  // 4. 通过 data-type 查找
  menuItem = document.querySelector(`[data-type="${targetId}"]`) as HTMLElement
  if (menuItem) {
    clickElement(menuItem)
    return
  }

  // 5. 通过 class 查找（支持多个class，用空格分隔）
  const classNames = targetId.split(' ')
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
    if (label === targetId) {
      clickElement(btn as HTMLElement)
      return
    }
  }

  // 7. 手机端兜底：menu* 系列按钮藏在 #menu 里，需先打开菜单
  // 手机端思源的"搜索/日记/命令面板..."等 menu 开头的按钮，
  // 都在右上角设置(☰)按钮 #toolbarMore 打开的 #menu 菜单内。
  // 菜单关闭时这些元素不存在，需要先点 toolbarMore 打开菜单，再延迟点击目标。
  if (targetId.startsWith('menu') && isMobileDevice()) {
    const toolbarMore = document.getElementById('toolbarMore') as HTMLElement
    if (toolbarMore) {
      clickElement(toolbarMore)
      // 等菜单渲染后重试（菜单渲染是异步的，最多重试 8 次 ≈ 640ms）
      const retryClick = (attemptsLeft: number) => {
        const target = document.getElementById(targetId) ||
                       document.querySelector(`[data-id="${targetId}"]`) as HTMLElement
        if (target) {
          clickElement(target)
        } else if (attemptsLeft > 0) {
          setTimeout(() => retryClick(attemptsLeft - 1), 80)
        } else {
          Notify.showErrorBuiltinNotFound(targetId)
        }
      }
      retryClick(8)
      return
    }
  }

  // 所有方法都失败
  Notify.showErrorBuiltinNotFound(targetId)
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
        logger.warn('刷新文档失败:', error)
        
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
          dispatchKeyWithLog(document.body, eventDown, '刷新（备用F5）：派发 keydown', { stage: 'fallback' });
        } catch (e) {
          logger.warn('F5快捷键方法也失败:', e)
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
        dispatchKeyWithLog(document.body, eventDown, '刷新（补充F5）：派发 keydown', { stage: 'supplement' });
      } catch (e) {
        logger.warn('F5快捷键补充方案失败:', e)
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
        logger.warn('重载思源失败:', error)
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
        logger.warn('全屏切换失败:', error)
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
            dispatchKeyWithLog(activeEditor, eventDown, '全屏切换：派发 keydown 到编辑器', {});
          }, 50);
        } else {
          // 如果没有找到编辑器，派发到 body（元素目标，不能是 window）
          const eventDown = new KeyboardEvent('keydown', keyEvent);
          dispatchKeyWithLog(document.body, eventDown, '全屏切换：未找到编辑器，派发 keydown 到 body', {});
        }
      } catch (error) {
        logger.error('文档全屏切换失败:', error);
        
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
          dispatchKeyWithLog(document, eventDown, '全屏切换（备用）：派发 keydown 到 document', {});
        } catch (e) {
          logger.error('备用方案也失败:', e);
        }
      }
      break
      
    default:
      logger.warn('未知的刷新功能类型:', config.builtinRefreshType)
  }
}

export function insertTemplate(config: ButtonConfig, savedSelection: Range | null = null, lastActiveElement: HTMLElement | null = null) {
  if (!config.template) {
    Notify.showErrorTemplateNotConfigured(getButtonDisplayName(config))
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
          logger.warn('[模板插入] 追加到每日笔记失败:', response.msg)
          // 尝试替代方案
          await appendToDailyNoteAlternative(notebookId, processedTemplate, config.showNotification)
        }
      } catch (error) {
        logger.warn('[模板插入] appendDailyNoteBlock API调用失败，尝试替代方案:', error)
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
      if (processedTemplate.includes('\n')) {
        // 多行模板（{{newline}}）：逐行插入 + 合成 Enter 走思源官方换行链路。
        // 不能直接 execCommand 插 \n（只当普通字符进文本节点、渲染成空格，不产生新块）
        const wysiwyg = activeEditor.querySelector('.protyle-wysiwyg')
        if (wysiwyg) {
          void insertMultiLineText(wysiwyg as HTMLElement, processedTemplate)
        } else {
          // 找不到 wysiwyg 时退回原逻辑
          document.execCommand('insertText', false, processedTemplate)
          contentEditable.dispatchEvent(inputEvent)
        }
      } else {
        // 单行模板：原逻辑
        document.execCommand('insertText', false, processedTemplate)
        contentEditable.dispatchEvent(inputEvent)
      }
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
 * - {{newline}} - 换行符（\n）
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
    .replace(/\{\{newline\}\}/g, '\n')
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
    item.textContent = getButtonDisplayName(btn) || t('toolbarManager.2', undefined, '模板插入')
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
async function executeClickSequence(config: ButtonConfig, clickedButton?: HTMLElement | null) {
  if (!config.clickSequence || config.clickSequence.length === 0) {
    Notify.showErrorClickSequenceNotConfigured(getButtonDisplayName(config))
    return
  }

  // 步骤间隔：默认 200ms；序列中可写独立延迟行覆盖（如 "200ms" / "1s" / "800"，无单位=毫秒）
  let stepDelay = 200
  let isFirstStep = true
  for (let i = 0; i < config.clickSequence.length; i++) {
    const line = config.clickSequence[i].trim()
    if (!line) continue // 跳过空行

    // 延迟行：设置后续步骤的等待时间（可多次出现，取最近一次）
    const delayMatch = /^(\d+(?:\.\d+)?)\s*(ms|s)?$/i.exec(line)
    if (delayMatch) {
      const num = parseFloat(delayMatch[1])
      stepDelay = (delayMatch[2] ?? 'ms').toLowerCase() === 's' ? num * 1000 : num
      continue
    }

    // 第一步立即执行；后续步骤先等待 stepDelay（可被延迟行覆盖）
    if (!isFirstStep) {
      await delay(stepDelay)
    }
    isFirstStep = false

    const selector = line

    // 判断是否为悬浮操作（* 前缀）
    const isHover = selector.startsWith('*')
    const actualSelector = isHover ? selector.substring(1).trim() : selector

    // 尝试执行当前步骤，最多重试2次
    let success = false
    for (let retry = 0; retry <= 2; retry++) {
      try {
        // 等待元素出现（最多5秒）
        let element = await waitForElement(actualSelector, 5000)

        if (!element) {
          throw new Error(`未找到元素: ${actualSelector}`)
        }

        // 编辑器限定查找：仅对 more / doc 两个原生按钮生效
        // （切换文档后旧编辑器的 fn__none 隐藏元素会被 querySelector 优先命中，
        //  其坐标 (0,0) 导致菜单跑左上角）
        // 其他所有选择器（barPlugins、text:xxx、#id、.class 等）完全走原逻辑，不受影响
        if (clickedButton && (actualSelector === 'more' || actualSelector === 'doc')) {
          const pluginEditor = clickedButton.closest('.protyle')
          if (pluginEditor && !pluginEditor.contains(element)) {
            // 在插件按钮所在编辑器内重新查找
            const scopedEl = pluginEditor.querySelector(
              `[data-type="${actualSelector}"]`
            )
            if (scopedEl) {
              element = scopedEl as HTMLElement
            }
          }
        }

        // 等待元素动画静止（思源 v3.8 抽屉动画适配）
        // 手机端 menuPlugin / sidebar-plugin-tab 等打开时带 上拉抽屉动画，
        // 动画期间元素已挂载但位置未稳定，立即点击会失败
        await waitForElementSettled(element)

        // 检查元素是否可见（toolbarMore 例外：导航栏视觉隐藏时仍可绕过按钮直接打开更多面板）
        if (!isVisible(element) && element.id !== 'toolbarMore') {
          throw new Error(`元素不可见: ${actualSelector}`)
        }

        // 悬浮或点击元素
        if (isHover) {
          hoverElement(element)
        } else {
          // ===== 隐藏按钮菜单位置修正（仅 more / doc）=====
          // 这两个原生按钮被 CSS 完全隐藏后（transform: scale(0); width: 0），
          // getBoundingClientRect() 返回 width=0，导致思源 {x: rect.right, y: rect.bottom} 定位到错误位置,
          // 或按钮位于隐藏编辑器内坐标 (0,0) → 菜单跑左上角。
          // 用插件按钮坐标临时恢复尺寸，使思源定位函数读到正确坐标。
          const isHideMenuTarget = actualSelector === 'more' || actualSelector === 'doc'
          const nativeRect = isHideMenuTarget ? element.getBoundingClientRect() : null
          const needsPositionFix = clickedButton && isHideMenuTarget &&
              nativeRect &&
              (nativeRect.width === 0 ||
               (nativeRect.left === 0 && nativeRect.top === 0))

          if (needsPositionFix) {
            const pluginRect = clickedButton.getBoundingClientRect()
            if (pluginRect.width > 0 && pluginRect.left > 0) {
              // 插件按钮坐标有效 → 用它给原生按钮恢复尺寸
              // 不改变 position，因为底部胶囊父容器有 transform: translateX(-50%)，
              // 设 position: fixed 会相对该容器定位而非视口，导致偏移。
              element.style.setProperty('transform', 'none', 'important')
              element.style.setProperty('width', `${pluginRect.width}px`, 'important')
              element.style.setProperty('min-width', `${pluginRect.width}px`, 'important')
              element.style.setProperty('height', `${pluginRect.height}px`, 'important')

              clickElement(element)

              // 立即恢复隐藏样式（移除临时 inline 覆盖，CSS !important 重新生效）
              const restoredProps = ['transform', 'width', 'min-width', 'height']
              for (const prop of restoredProps) {
                element.style.removeProperty(prop)
              }
            } else {
              // 插件按钮坐标也无效 → 直接点击，接受思源自身的定位行为
              clickElement(element)
            }
          } else {
            clickElement(element)
          }
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
    if (isCleanedUp) return
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
    Notify.showErrorClickSequenceNotConfigured(getButtonDisplayName(config))
    return
  }

  // 兼容旧版仅保存 buttonName 的步骤，执行前即时补齐稳定 ID。
  // 设置页未打开时也必须能够执行升级前保存的连续点击配置。
  const normalizedSteps = steps.map(step => {
    if (step.buttonId && step.buttonId.trim()) return step
    const legacyName = typeof step.buttonName === 'string' ? step.buttonName.trim() : ''
    const matchedButton = legacyName ? findButtonConfigByName(legacyName) : null
    return matchedButton ? { ...step, buttonId: matchedButton.id } : step
  })

  // 过滤掉无法解析的步骤。
  const validSteps = normalizedSteps.filter(step => step.buttonId && step.buttonId.trim())

  if (validSteps.length === 0) {
    Notify.showErrorClickSequenceNotConfigured(getButtonDisplayName(config))
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
      Notify.showErrorClickSequenceStepFailed(
        i + 1,
        t('toolbarManager.buttonIdDescriptor', { buttonId }, `按钮ID"${buttonId}"`)
      )
      return
    }

    // 防止死循环：如果目标按钮也是连续点击类型，则跳过
    if (buttonConfig.type === 'author-tool' && buttonConfig.authorToolSubtype === 'button-sequence') {
      logger.warn(`[连续点击] 跳过步骤 ${i + 1}：按钮"${buttonConfig.name}"是连续点击类型，避免循环调用`)
      continue
    }

    // 直接执行按钮功能（不通过 DOM 点击，无需弹出扩展工具栏）
    try {
      await handleButtonClick(buttonConfig, savedSelection, lastActiveElement, null)
    } catch (error) {
      const buttonName = getButtonDisplayName(buttonConfig)
      Notify.showErrorClickSequenceStepFailed(
        i + 1,
        t('toolbarManager.buttonDescriptor', { buttonName }, `按钮"${buttonName}"`)
      )
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
function parseTextSelector(selector: string): string[] {
  const payload = selector.substring(5).trim()
  if (!payload) return []

  // Keep the original text:xxx syntax unchanged unless the payload is a candidate list.
  if (!payload.includes('|') || !/(?:^|\|)(?:zh-CN|zh|en)=/u.test(payload)) return [payload]

  const candidates = payload.split('|').map(part => {
    const separator = part.indexOf('=')
    if (separator <= 0) return null
    const locale = part.substring(0, separator).trim()
    const text = part.substring(separator + 1).trim()
    if (!['zh', 'zh-CN', 'en'].includes(locale) || !text) return null
    return { locale, text }
  })
  if (candidates.some(candidate => candidate === null)) return []

  const currentLocale = getLocale()
  return (candidates as Array<{ locale: string; text: string }>)
    .sort((a, b) => {
      const aPriority = a.locale === currentLocale || (currentLocale === 'zh-CN' && a.locale === 'zh') ? 0 : 1
      const bPriority = b.locale === currentLocale || (currentLocale === 'zh-CN' && b.locale === 'zh') ? 0 : 1
      return aPriority - bPriority
    })
    .map(candidate => candidate.text)
}

function waitForElement(selector: string, timeout: number = 5000): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    // 智能查找元素（支持8种方式）
    const findElement = (): HTMLElement | null => {
      // 检查是否是文本查询模式 (text:xxx)
      if (selector.startsWith('text:')) {
        const searchTexts = parseTextSelector(selector)
        logger.log('[连续点击] 文本选择器解析:', { selector, locale: getLocale(), candidates: JSON.stringify(searchTexts) })
        const result = findElementByText(searchTexts)
        logger.log('[连续点击] 文本选择器首次查找:', { selector, found: !!result, text: result?.textContent?.trim() })
        return result
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
      logger.log('[连续点击] 元素已找到:', { selector, text: element.textContent?.trim(), tag: element.tagName, className: element.className })
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
      logger.warn('[连续点击] 文本/元素等待超时:', { selector, timeout })
      resolve(null)
    }, timeout)
  })
}

/**
 * 等待目标元素及其祖先链上的动画/过渡全部结束（思源 v3.8 抽屉动画适配）
 *
 * 背景：思源 v3.8 手机端点击 toolbarMore / menuPlugin / sidebar-plugin-tab 等会触发
 * 上拉抽屉动画，菜单项/面板在动画期间已挂载但位置未稳定，点击序列下一步立即点击会失败。
 * 通过 Web Animations API 检测目标元素及祖先链上所有 running 动画，静止后再继续。
 *
 * 不支持 getAnimations() 的旧 WebView 直接放行，退回原有的固定步间延迟。
 * 有常驻动画（如无限循环 spinner）时由超时兜底，不无限等待。
 */
async function waitForElementSettled(element: HTMLElement, timeout = 2000): Promise<void> {
  if (typeof element.getAnimations !== 'function') return
  // 先等一帧以上再开始检测：CSS transition 的 Animation 对象在样式变化后的下一渲染帧才创建，
  // 立即检测会漏掉刚触发的抽屉动画（思源 v3.8 面板/菜单统一 150ms translate 滑入）
  await delay(50)
  const start = Date.now()
  while (Date.now() - start < timeout) {
    let hasRunning = false
    let node: HTMLElement | null = element
    while (node && node !== document.documentElement) {
      for (const anim of node.getAnimations()) {
        if (anim.playState === 'running') {
          hasRunning = true
          break
        }
      }
      if (hasRunning) break
      node = node.parentElement
    }
    if (!hasRunning) return
    await delay(50)
  }
}

/**
 * 通过文本内容查找元素（支持多种元素类型）
 * @param searchText 要搜索的文本内容
 * @returns 找到的元素或null
 */
function textMatchesCandidate(actualText: string, candidates: string[]): boolean {
  const normalizedText = actualText.trim()
  return candidates.some(candidate => {
    const normalizedCandidate = candidate.trim()
    if (!normalizedCandidate) return false
    if (normalizedText === normalizedCandidate) return true
    // SiYuan plugin menu labels may append the installed plugin version.
    return new RegExp(`^${escapeRegExp(normalizedCandidate)}\\s+v\\d+(?:\\.\\d+)*$`, 'u').test(normalizedText)
  })
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findElementByText(searchTexts: string[]): HTMLElement | null {
  if (searchTexts.length === 0) return null
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
        // 检查文本是否匹配任一语言候选
        if (textMatchesCandidate(node.textContent ?? '', searchTexts)) {
          logger.log('[连续点击] 找到文本节点:', { actualText: node.textContent?.trim(), candidates: searchTexts })
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
 * 绕过思源 toolbarMore 按钮，直接打开更多面板（#menu）。
 *
 * 思源 popMenu() 的核心就是：动态提升 zIndex + #menu 滑入（translateX(0px)）。
 * 不依赖导航栏按钮本身，导航栏隐藏（inert/视觉隐藏）时也能打开。
 */
function openMobileMoreMenu(): void {
  // 收起键盘（模拟 popMenu 的 activeBlur）
  const activeEl = document.activeElement as HTMLElement | null
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
    activeEl.blur()
  }
  // 关闭侧栏（模拟 popMenu 的 closePanel）
  ;['sidebar', 'sidebarRight', 'model'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.style.transform = ''
  })
  const menuElement = document.getElementById('menu')
  if (menuElement) {
    menuElement.style.zIndex = (++(window as any).siyuan.zIndex).toString()
    menuElement.style.transform = 'translateX(0px)'
  }
}

/**
 * 点击元素
 */
function clickElement(element: HTMLElement): void {
  // toolbarMore：导航栏隐藏时程序化点击不可靠（inert/pointer-events），
  // 绕过按钮直接打开更多面板
  if (element.id === 'toolbarMore') {
    openMobileMoreMenu()
    return
  }
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
 * 等待块/文档索引就绪。
 * createDailyNote 等创建类 API 返回后文档可能仍在异步索引队列，此时 getBlockInfo
 * 返回 code 3；移动端 mobile.tabs.open 内部对非 code 0 静默返回 invalid（restore 回退、
 * 无日志）——打开前先轮询，避免"日记创建成功却打不开"。
 */
async function waitForBlockIndexReady(blockId: string, maxAttempts = 16, intervalMs = 300): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const resp = await fetchSyncPost('/api/block/getBlockInfo', { id: blockId })
      if (resp?.code === 0) return
    } catch { /* 网络抖动，继续重试 */ }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
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

    // 检测是否为手机端（用插件环境判定，不要靠 UA 字符串猜——
    // openMobileFileById 是移动端专用 API，桌面端 window.siyuan.mobile 不存在，
    // UA 误判会调错打开函数导致静默失败）
    const isMobile = pluginInstance?.isMobile === true
      || windowObj.siyuan?.config?.fronted?.includes?.('mobile') === true

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
              // 移动端使用 openMobileFileById——但它走 mobile.tabs.open，
              // 内部 resolveRoot 调 getBlockInfo：刚创建的文档还在异步索引队列时
              // 会返回 code 3 → tabs.open 静默返回 invalid（restore 回退、无日志）。
              // 因此先轮询等待文档索引就绪（最多约 5 秒）再打开。
              await waitForBlockIndexReady(docId)
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
            logger.warn('[日记功能] 打开文档失败:', openError)
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
          logger.warn('[日记功能] API调用失败:', response.msg)
          // API失败，回退到快捷键方式
        }
      } catch (apiError) {
        logger.warn('[日记功能] API调用异常:', apiError)
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
      // 1. 触发快捷键（派发到 body 元素，见 executeShortcut 内的说明）
      const keyEvent = parseHotkeyToKeyEvent(hotkeyToTrigger)
      if (keyEvent) {
        dispatchKeyWithLog(document.body, new KeyboardEvent('keydown', keyEvent), '日记（电脑端）：派发 keydown', {})
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
    // 1. 触发快捷键（派发到 body 元素，避免 window 目标导致思源处理函数崩溃）
    const keyEvent = parseHotkeyToKeyEvent(hotkeyToTrigger)
    if (keyEvent) {
      dispatchKeyWithLog(document.body, new KeyboardEvent('keydown', keyEvent), '日记（手机端）：派发 keydown', {})
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
    logger.error('日记功能失败:', error)
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
 * 统一读取文档锁定状态（思源 v3.8 适配）
 *
 * 权威源是 wysiwyg 元素上的 custom-sy-readonly 属性（思源 setReadonlyByConfig 的最终判定值），
 * 按钮 data-subtype 只是它的 DOM 投影；且移动端 breadcrumb 没有只读按钮（结构性缺失），
 * 全局 querySelector('[data-type="readonly"]') 又会命中 fn__none 残留的旧编辑器（串台）。
 * 因此统一在传入的 protyle 实例 / .protyle 元素范围内读取，杜绝全局查询。
 *
 * 判定顺序：
 * ① wysiwyg 元素 custom-sy-readonly === 'true'
 * ② protyle.disabled（config.editor.readOnly 临时只读时属性可能为 'false'）
 * ③ 范围内只读按钮 data-subtype === 'lock'（兜底）
 */
function getDocLockedState(target?: any): boolean {
  const p = target?.protyle ?? target
  if (p?.wysiwyg?.element) {
    // protyle 实例路径
    const attr = (p.wysiwyg.element as HTMLElement).getAttribute('custom-sy-readonly')
    if (attr !== null) return attr === 'true' || p.disabled === true
    if (p.disabled === true) return true
    const btn = (p.element as HTMLElement | undefined)?.querySelector('.protyle-breadcrumb [data-type="readonly"]')
    if (btn) return btn.getAttribute('data-subtype') === 'lock'
    return false
  }
  if (target instanceof HTMLElement) {
    // .protyle DOM 元素路径
    const wysiwyg = target.querySelector('.protyle-wysiwyg')
    const attr = wysiwyg?.getAttribute('custom-sy-readonly')
    if (attr !== null) return attr === 'true'
    const btn = target.querySelector('.protyle-breadcrumb [data-type="readonly"]')
    if (btn) return btn.getAttribute('data-subtype') === 'lock'
  }
  return false
}

/**
 * 刷新所有 toggle-lock 按钮的图标（切换文档后锁状态变化时调用）
 * 逐编辑器限定范围读取，多编辑器并存时各自正确
 */
export function refreshToggleLockIcons(): void {
  document.querySelectorAll('.protyle').forEach(editor => {
    const locked = getDocLockedState(editor)
    editor.querySelectorAll<HTMLElement>('[data-custom-button]').forEach(btn => {
      const cfg = currentButtonConfigs.find(c => c.id === btn.dataset.customButton)
      if (cfg?.type === 'author-tool' && cfg.authorToolSubtype === 'toggle-lock') {
        updateToggleLockIcon(btn, locked)
      }
    })
  })
}

/**
 * 更新思源原生只读按钮的 DOM 状态（图标 + data-subtype 属性）
 */
function updateNativeReadonlyBtn(readonlyBtn: Element | null, locked: boolean): void {
  if (!readonlyBtn) return
  const useEl = readonlyBtn.querySelector('use') as SVGUseElement | null
  if (useEl) {
    useEl.setAttribute('xlink:href', locked ? '#iconLock' : '#iconUnlock')
    useEl.setAttribute('href', locked ? '#iconLock' : '#iconUnlock')
  }
  readonlyBtn.setAttribute('data-subtype', locked ? 'lock' : 'unlock')
}

/**
 * 执行沉浸阅读模式切换（toggle-lock）
 * 
 * 点击后切换当前文档的锁状态：
 *   解锁 → 锁（data-subtype="lock", 图标🔒）
 *   锁   → 解锁（data-subtype="unlock", 图标🔓）
 * 
 * 采用乐观 UI 更新 + 串行写入队列，消除快速连续点击的竞态条件：
 *   - 图标在点击瞬间立即切换（乐观更新），无需等待 API 响应
 *   - API 写入串行排队（toggleLockWriteQueue），确保顺序正确
 *   - 写入失败时自动回滚图标到实际状态
 * 
 * 图标会随文档切换自动更新：监听 switch-protyle 事件，
 * 根据新文档的锁状态渲染对应图标。
 */
async function executeToggleLock(config: ButtonConfig): Promise<void> {
  const protyle = getActiveProtyle()
  if (!protyle?.block?.rootID) {
    showMessage(t('toolbarManager.3', undefined, '未找到当前文档'), 2000, 'info')
    return
  }
  const docId = protyle.block.rootID

	  // 1. 读取当前锁状态 —— 统一走 getDocLockedState（wysiwyg custom-sy-readonly 权威源）：
	  //    按钮 data-subtype 只是投影（移动端甚至没有只读按钮），全局查询会串台
	  //    readonlyBtn 查找保留，仅用于下面的乐观更新（updateNativeReadonlyBtn）
	  const editorEl = protyle.element as HTMLElement | undefined
	  let readonlyBtn: Element | null = null
	  if (editorEl) {
	    readonlyBtn = editorEl.querySelector('.protyle-breadcrumb__bar [data-type="readonly"]')
	      || editorEl.querySelector('.protyle-breadcrumb [data-type="readonly"]')
	  }
	  // 兜底：全局查询（兼容 protyle.element 不可用的极端情况）
	  if (!readonlyBtn) {
	    readonlyBtn = document.querySelector('.protyle-breadcrumb__bar [data-type="readonly"]')
	  }

	  const isLocked = getDocLockedState(protyle)

	  const newLocked = !isLocked
	  const newValue = newLocked ? 'true' : 'false'

	  // 2. 乐观更新 DOM —— 立即切换图标，无需等待 API
	  updateNativeReadonlyBtn(readonlyBtn, newLocked)
	  //    自定义按钮也限定在当前编辑器内查找，避免多标签页串台
	  const customBtn = (editorEl
	    ? editorEl.querySelector(`[data-custom-button="${config.id}"]`)
	    : document.querySelector(`[data-custom-button="${config.id}"]`)) as HTMLElement | null
	  if (customBtn) {
	    updateToggleLockIcon(customBtn, newLocked)
	  }
	  //    同步乐观更新权威属性：思源在 API 写入完成前可能因 WS 推送重渲染 protyle，
	  //    setReadonlyByConfig 读 wysiwyg 元素的 custom-sy-readonly 决定锁状态——
	  //    不改它就会读到旧值，把图标覆盖回去（长文文档重渲染慢，闪变尤其明显）
	  try {
	    protyle.wysiwyg.element.setAttribute('custom-sy-readonly', newValue)
	  } catch { /* ignore */ }

  // 3. 串行写入 API（排队确保顺序，消除竞态）
  const previous = toggleLockWriteQueue
  let resolve: () => void
  toggleLockWriteQueue = new Promise<void>(r => { resolve = r })

  try {
    await previous // 等待之前所有未完成的写入
    const resp = await fetchSyncPost('/api/attr/setBlockAttrs', {
      id: docId,
      attrs: { 'custom-sy-readonly': newValue }
    })
    if (resp?.code !== 0) {
      // fetchSyncPost 失败不抛异常，必须显式检查返回码走回滚
      throw new Error(resp?.msg || '写入失败')
    }
    // 终态修正：写入期间思源可能因 WS 推送重渲染 protyle 并用自己的旧状态覆盖过图标，
    // 以确认后的状态再刷一次（含扩展工具栏里的全部 toggle-lock 按钮）
    updateNativeReadonlyBtn(readonlyBtn, newLocked)
    if (customBtn) {
      updateToggleLockIcon(customBtn, newLocked)
    }
    refreshToggleLockIcons()

    if (config.showNotification !== false) {
      showMessage(newLocked ? t('toolbarManager.4', undefined, '🔒 文档已锁定') : t('toolbarManager.5', undefined, '🔓 文档已解锁'), 1500, 'info')
    }
    refreshToolbarAutoHide()
  } catch (e) {
    // 4. 写入失败 —— 回滚图标和属性到实际状态
    updateNativeReadonlyBtn(readonlyBtn, isLocked)
    if (customBtn) {
      updateToggleLockIcon(customBtn, isLocked)
    }
    try {
      protyle.wysiwyg.element.setAttribute('custom-sy-readonly', isLocked ? 'true' : 'false')
    } catch { /* ignore */ }
    logger.warn('[toggle-lock] 切换失败:', e)
    showMessage(t('toolbarManager.6', undefined, '切换锁状态失败'), 2000, 'error')
  } finally {
    resolve!()
  }
}

/**
 * 更新 toggle-lock 按钮的图标（🔒 / 🔓）
 * 复用 createButtonElement 的图标渲染逻辑，支持 4 种类型
 */
function updateToggleLockIcon(btn: HTMLElement, isLocked: boolean): void {
  const configId = btn.dataset.customButton
  if (!configId) return

  const cfg = currentButtonConfigs.find(b => b.id === configId)
  if (!cfg) return

  const targetIcon = isLocked ? (cfg.lockIcon || cfg.icon || '🔒') : (cfg.icon || '🔓')

  // 清空按钮内容，重建图标
  btn.innerHTML = ''
  if (targetIcon.startsWith('icon')) {
    // 思源图标（SVG use）
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', `${cfg.iconSize}`)
    svg.setAttribute('height', `${cfg.iconSize}`)
    svg.style.cssText = 'flex-shrink: 0; display: block;'
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
    use.setAttribute('href', `#${targetIcon}`)
    svg.appendChild(use)
    btn.appendChild(svg)
  } else if (targetIcon.startsWith('lucide:')) {
    const iconName = targetIcon.substring(7)
    const svgString = lucideToSvg(iconName, cfg.iconSize)
    if (svgString) {
      btn.innerHTML = svgString
      const svg = btn.querySelector('svg')
      if (svg) svg.style.cssText = 'flex-shrink: 0; display: block;'
    } else {
      btn.textContent = targetIcon
      btn.style.fontSize = `${cfg.iconSize}px`
    }
  } else if (/\.(png|jpg|jpeg|gif|svg)$/i.test(targetIcon)) {
    const pluginName = 'siyuan-toolbar-customizer'
    const imagePath = targetIcon.startsWith('/plugins/') ? targetIcon : `/plugins/${pluginName}/${targetIcon}`
    const img = document.createElement('img')
    img.src = imagePath
    img.style.cssText = `width: ${cfg.iconSize}px; height: ${cfg.iconSize}px; object-fit: contain; flex-shrink: 0; display: block;`
    btn.appendChild(img)
  } else {
    // Emoji 或文本
    const iconSpan = document.createElement('span')
    iconSpan.style.fontSize = `${cfg.iconSize}px`
    iconSpan.style.lineHeight = '1'
    iconSpan.textContent = targetIcon
    btn.appendChild(iconSpan)
  }
}

/** 确保样式已注入（每次调用都更新内容，防止旧缓存） */
function ensureToolbarAutoHideStyle(): void {
  let style = document.getElementById('toolbar-autohide-style') as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = 'toolbar-autohide-style'
    document.head.appendChild(style)
  }
  const cssText = `
    .protyle-breadcrumb.toolbar-scroll-hidden,
    .protyle-breadcrumb__bar.toolbar-scroll-hidden {
      opacity: 0 !important;
      pointer-events: none !important;
      background: transparent !important;
      border-color: transparent !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
    }
    /* 工具栏隐藏时，同步收回 protyle 补偿间距（底部模式） */
    body.toolbar-autohide-active.siyuan-toolbar-customizer-enabled .protyle {
      padding-bottom: env(safe-area-inset-bottom) !important;
    }
    /* 工具栏隐藏时，同步收回 protyle 补偿间距（顶部模式） */
    body.toolbar-autohide-active.siyuan-toolbar-top-mode .protyle {
      padding-top: 0 !important;
    }
    /* 工具栏隐藏时，同步隐藏思源底部状态栏 */
    body.toolbar-autohide-active #status {
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `
  // 内容未变化时跳过重写（refreshToolbarAutoHide 会被心跳/事件高频调用，避免持续触发样式重算）
  if (style.textContent !== cssText) {
    style.textContent = cssText
  }
  if (!style.parentElement) {
    document.head.appendChild(style)
  }
}

/** 获取需要隐藏/显示的工具栏元素（覆盖底部和顶部两种模式） */
let cachedAutoHideEls: HTMLElement[] | null = null
let autoHideElsCacheDirty = true

function invalidateAutoHideElsCache(): void {
  autoHideElsCacheDirty = true
  cachedAutoHideEls = null
}

function getToolbarElementsForAutoHide(): HTMLElement[] {
  if (!autoHideElsCacheDirty && cachedAutoHideEls) {
    return cachedAutoHideEls
  }
  const els: HTMLElement[] = []
  // 底部模式：带 data-toolbar-customized 属性
  document.querySelectorAll('.protyle-breadcrumb[data-toolbar-customized], .protyle-breadcrumb__bar[data-toolbar-customized]').forEach(el => els.push(el as HTMLElement))
  // 顶部模式：匹配 top-toolbar-custom-style 完全相同的选择器
  if (document.body.classList.contains('siyuan-toolbar-top-mode')) {
    document.querySelectorAll('body.siyuan-toolbar-top-mode .protyle-breadcrumb:not([data-toolbar-customized]), body.siyuan-toolbar-top-mode .protyle-breadcrumb__bar:not([data-toolbar-customized])').forEach(el => els.push(el as HTMLElement))
  }
  // 电脑端悬浮胶囊：外层 .protyle-breadcrumb[data-input-method]（applyDesktopFloatingToolbar 打的属性）
  if (document.body.classList.contains('siyuan-toolbar-desktop-floating')) {
    document.querySelectorAll('.protyle-breadcrumb[data-input-method]:not(.protyle-breadcrumb__bar)').forEach(el => els.push(el as HTMLElement))
  }
  cachedAutoHideEls = els
  autoHideElsCacheDirty = false
  return els
}

function unbindToolbarAutoHideScroll(): void {
  if (toolbarAutoHideScrollHandler && toolbarAutoHideBoundEl) {
    toolbarAutoHideBoundEl.removeEventListener('scroll', toolbarAutoHideScrollHandler)
  }
  toolbarAutoHideScrollHandler = null
  toolbarAutoHideBoundEl = null
  if (toolbarScrollBindRetryTimer) {
    clearInterval(toolbarScrollBindRetryTimer)
    toolbarScrollBindRetryTimer = null
  }
  // 取消未触发的延时（防止解锁后 setTimeout 仍加上 class）
  if (toolbarAutoHidePendingTimer) {
    clearTimeout(toolbarAutoHidePendingTimer)
    toolbarAutoHidePendingTimer = null
  }
}

/**
 * 应用工具栏隐藏/显示状态（仅移动端）
 *
 * 直接切换显示/隐藏（无过渡动画）：加/删 toolbar-scroll-hidden + inline opacity，
 * 并同步加/删 toolbar-autohide-active 控制 protyle 补偿间距。
 * 触发来源已统一为思源原生移动栏状态（bindNativeBarsSync），不再由插件自身滚动驱动。
 */
function applyToolbarAutoHideState(hidden: boolean): void {
  if (hidden) {
    // 已隐藏则跳过
    if (toolbarHiddenByScroll) return
    // 工具栏尚未就绪时不置状态，避免隐藏后无法恢复
    const hideTargets = getToolbarElementsForAutoHide()
    if (hideTargets.length === 0) return

    toolbarHiddenByScroll = true
    // 取消上一次未执行的动画（原生栏状态快速翻转时防止残留定时器误操作）
    if (toolbarAutoHidePendingTimer) {
      clearTimeout(toolbarAutoHidePendingTimer)
      toolbarAutoHidePendingTimer = null
    }
    // 直接隐藏：收回 protyle 补偿间距 + 工具栏淡出
    document.body.classList.add('toolbar-autohide-active')
    hideTargets.forEach(el => {
      el.classList.add('toolbar-scroll-hidden')
      // 直接用 inline style 设 opacity，绕过 CSS 级联覆盖问题
      el.style.setProperty('opacity', '0', 'important')
      // 固定 inline transform，覆盖思源 #editor > .protyle-breadcrumb 的滚动上移
      // （--mobile-bar-translate-y，v3.8 移动端面包屑机制），底部胶囊保持 translateX(-50%) 居中，
      // 侧边胶囊吸附侧边用 translateZ(0)
      el.style.transform = (toolbarAutoHideCapsuleMode && !isSideFloatingMode())
        ? 'translateX(-50%) translateY(0)'
        : 'translateZ(0)'
    })
    return
  }

  // 恢复（显示）状态
  if (!toolbarHiddenByScroll) return
  toolbarHiddenByScroll = false
  // 取消上一次未执行的动画（原生栏状态快速翻转时防止残留定时器误操作）
  if (toolbarAutoHidePendingTimer) {
    clearTimeout(toolbarAutoHidePendingTimer)
    toolbarAutoHidePendingTimer = null
  }
  // 直接恢复：工具栏淡入 + 恢复 protyle 补偿间距
  document.querySelectorAll('.protyle-breadcrumb.toolbar-scroll-hidden, .protyle-breadcrumb__bar.toolbar-scroll-hidden').forEach(el => {
    const htmlEl = el as HTMLElement
    htmlEl.classList.remove('toolbar-scroll-hidden')
    htmlEl.style.removeProperty('opacity')
    // 固定 inline transform，覆盖思源 #editor > .protyle-breadcrumb 的滚动上移
    // （--mobile-bar-translate-y，v3.8 移动端面包屑机制），胶囊保持 translateX(-50%) 居中
    htmlEl.style.transform = (toolbarAutoHideCapsuleMode && !isSideFloatingMode())
      ? 'translateX(-50%) translateY(0)'
      : 'translateZ(0)'
  })
  document.body.classList.remove('toolbar-autohide-active')
}

/** 思源手机端原生移动栏（顶部标题栏 + 底部导航栏）是否处于隐藏状态
 *
 * 思源 mobileBars.ts 在滚动沉浸时给 body 切换 mobile-chrome--hidden class，
 * 顶部栏与底部导航栏是一起隐藏/恢复的，这是插件可观察到的整体信号。
 *
 * 例外：键盘打开时思源置 editing 状态，只显示键盘工具栏（editingBar），
 * 阅读栏的 mobile-chrome--hidden 不会自动移除（readingBarsOffset 保持原值），
 * 但此时插件工具栏必须保持可用，因此键盘打开（mobile-keyboard--open）时不视为隐藏。
 */
function isNativeMobileBarsHidden(): boolean {
  if (document.body.classList.contains('mobile-keyboard--open')) return false
  return document.body.classList.contains('mobile-chrome--hidden')
}

/** 绑定思源原生移动栏状态同步（仅移动端）
 *
 * 监听 body class 变化：原生栏隐藏 → 同步隐藏插件工具栏，原生栏恢复 → 同步恢复。
 * 键盘弹出、文本选择、编辑状态下面板打开等场景思源会强制显示原生栏，
 * 插件随之自动恢复，无需自行判断。
 */
function bindNativeBarsSync(): void {
  if (nativeBarsObserver) return
  if (!isMobileDevice()) return
  const observer = new MutationObserver(() => {
    // 键盘开/关（mobile-keyboard--open）等 body class 变化时刷新侧边胶囊可见性
    applySideCapsuleVisibility()
    // 顶部标题栏常驻（keepTopBarVisible）：沉浸隐藏时解除 inert/aria-hidden，保证可点击编辑
    if ((window as any).__pluginInstance?.mobileFeatureConfig?.keepTopBarVisible) {
      const topBar = document.getElementById('mobileTopBar')
      topBar?.removeAttribute('inert')
      topBar?.setAttribute('aria-hidden', 'false')
    }
    const hidden = isNativeMobileBarsHidden()
    if (hidden === nativeBarsLastHidden) return
    nativeBarsLastHidden = hidden
    applyToolbarAutoHideState(hidden)
  })
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })
  activeObservers.add(observer)
  nativeBarsObserver = observer
  nativeBarsLastHidden = isNativeMobileBarsHidden()
  // 键盘打开/关闭也会切换 body class（mobile-keyboard--open），同步刷新侧边胶囊可见性
  applySideCapsuleVisibility()
}

/** 解绑思源原生移动栏状态同步 */
function unbindNativeBarsSync(): void {
  if (nativeBarsObserver) {
    nativeBarsObserver.disconnect()
    activeObservers.delete(nativeBarsObserver)
    nativeBarsObserver = null
  }
  nativeBarsLastHidden = null
}

// ===== 侧栏/更多面板打开时隐藏侧边胶囊（思源侧栏为 100vw 全屏面板，会盖住胶囊） =====
let sidePanelsObserver: MutationObserver | null = null
const SIDE_PANEL_IDS = ['sidebar', 'sidebarRight', 'menu', 'model']

function isAnyMobilePanelOpen(): boolean {
  return SIDE_PANEL_IDS.some(id => {
    const el = document.getElementById(id)
    return !!el && el.style.transform !== '' && el.style.transform != null
  })
}

function applySideCapsuleVisibility(): void {
  if (!isSideFloatingMode()) return
  const capsule = document.querySelector(
    '.protyle-breadcrumb[data-toolbar-customized], .protyle-breadcrumb__bar[data-toolbar-customized]'
  ) as HTMLElement | null
  if (!capsule) return
  // 侧栏/更多面板打开（全屏覆盖）或键盘弹出（遮挡胶囊）时隐藏胶囊
  if (isAnyMobilePanelOpen() || document.body.classList.contains('mobile-keyboard--open')) {
    capsule.style.setProperty('display', 'none', 'important')
  } else {
    capsule.style.removeProperty('display')
  }
}

/** 绑定侧栏/更多面板状态同步（侧边胶囊模式生效） */
function bindSidePanelsSync(): void {
  if (sidePanelsObserver) return
  const observer = new MutationObserver(() => applySideCapsuleVisibility())
  SIDE_PANEL_IDS.forEach(id => {
    const el = document.getElementById(id)
    if (el) observer.observe(el, { attributes: true, attributeFilter: ['style'] })
  })
  activeObservers.add(observer)
  sidePanelsObserver = observer
  applySideCapsuleVisibility()
}

/** 解绑侧栏/更多面板状态同步并恢复胶囊显示 */
function unbindSidePanelsSync(): void {
  if (sidePanelsObserver) {
    sidePanelsObserver.disconnect()
    activeObservers.delete(sidePanelsObserver)
    sidePanelsObserver = null
  }
  // 恢复胶囊显示（移除可能残留的 display:none）
  document.querySelectorAll(
    '.protyle-breadcrumb[data-toolbar-customized], .protyle-breadcrumb__bar[data-toolbar-customized]'
  ).forEach(el => (el as HTMLElement).style.removeProperty('display'))
}

// ===== 扩展栏打开状态同步（底部胶囊/底部固定⑦：导航栏由扩展工具栏接管） =====
let overflowPanelObserver: MutationObserver | null = null
let menuPanelObserver: MutationObserver | null = null

/** 同步 tc-overflow-open：扩展栏存在 → 加 class 显示导航栏；不存在 → 移除 */
function syncOverflowOpenClass(): void {
  const open = !!document.querySelector('.overflow-toolbar-layer')
  document.body.classList.toggle('tc-overflow-open', open)
}

/** 当前是否为"导航栏由扩展工具栏接管"模式（底部胶囊 / 底部固定⑦） */
function isNavTakeoverMode(): boolean {
  return document.body.classList.contains('siyuan-toolbar-floating')
    || document.body.classList.contains('siyuan-toolbar-nav-overflow')
}

/**
 * 接管模式下让思源认为"面板打开"（panelOpen），从而暂停导航栏滚动隐藏。
 *
 * 思源 isPanelOpen() 检查 #sidebar/#sidebarRight/#menu/#model 任一元素的 inline
 * style.transform 非空；panelOpen=true 时滚动隐藏暂停（isMobileBarsScrollPaused），
 * readingBarsOffset 不增长 → bottomBarVisible 恒 true → 思源不会设置 inert、不会隐藏导航栏。
 * 给 #menu 设置与 CSS 默认值相同的 translateX(100vw)（视觉零变化），零对抗、零性能开销。
 */
function forceMenuPanelOpen(): void {
  const menuEl = document.getElementById('menu')
  if (!menuEl) return
  if (menuEl.style.transform === '') {
    menuEl.style.transform = 'translateX(100vw)'
  }
}

/** 监听 #menu 的 inline transform：被思源清空（closePanel）时恢复接管，仅接管模式下生效 */
function bindMenuPanelForce(): void {
  if (menuPanelObserver) return
  const menuEl = document.getElementById('menu')
  if (!menuEl) return
  const observer = new MutationObserver(() => {
    if (isNavTakeoverMode() && menuEl.style.transform === '') {
      menuEl.style.transform = 'translateX(100vw)'
    }
  })
  observer.observe(menuEl, { attributes: true, attributeFilter: ['style'] })
  activeObservers.add(observer)
  menuPanelObserver = observer
  if (isNavTakeoverMode()) {
    forceMenuPanelOpen()
  }
}

/** 绑定扩展栏存在性监听（面板直接挂载到 body 子级） */
function bindOverflowPanelSync(): void {
  if (overflowPanelObserver) return
  const observer = new MutationObserver((mutations) => {
    // 仅当变更涉及扩展栏节点时才同步（避免 body 子级频繁变化时全文档查询）
    let touched = false
    for (const m of mutations) {
      for (const n of Array.from(m.addedNodes).concat(Array.from(m.removedNodes))) {
        if ((n as HTMLElement).classList?.contains('overflow-toolbar-layer')) {
          touched = true
          break
        }
      }
      if (touched) break
    }
    if (touched) syncOverflowOpenClass()
  })
  observer.observe(document.body, { childList: true })
  activeObservers.add(observer)
  overflowPanelObserver = observer
  syncOverflowOpenClass()
  bindMenuPanelForce()
}

/** 解绑扩展栏存在性监听 */
function unbindOverflowPanelSync(): void {
  if (overflowPanelObserver) {
    overflowPanelObserver.disconnect()
    activeObservers.delete(overflowPanelObserver)
    overflowPanelObserver = null
  }
  // 交还 #menu 给思源管理（仅当我们设置的占位 transform 还在时清空）
  if (menuPanelObserver) {
    menuPanelObserver.disconnect()
    activeObservers.delete(menuPanelObserver)
    menuPanelObserver = null
  }
  const menuEl = document.getElementById('menu')
  if (menuEl && menuEl.style.transform === 'translateX(100vw)') {
    menuEl.style.transform = ''
  }
  document.body.classList.remove('tc-overflow-open')
}

/**
 * 完全恢复思源原始状态（手机端「完全恢复思源原始状态」开关打开时调用）：
 * 解绑全部 observer、复位隐藏状态、清除面包屑上的 inline 样式 / 属性 / 残留 body class / CSS 变量。
 * 与 cleanup() 的区别：不删除自定义按钮 DOM、不清定时器，关闭开关后功能可恢复。
 */
export function restoreMobileToolbarOriginal(): void {
  // 解绑所有 observer（含 #menu 占位 transform 还原、tc-overflow-open 移除）
  unbindToolbarAutoHideScroll()
  unbindMobileScrollAutoHide()
  unbindNativeBarsSync()
  unbindSidePanelsSync()
  unbindOverflowPanelSync()

  // 断开 initMobileToolbarAdjuster 注册的常驻面包屑 MutationObserver。
  // 关键：只移除 style 元素不够——observer 仍存活，applyFeatures 清理产生的 DOM 变更会在
  // 100ms 防抖后触发 setupToolbar → setupToolbarForElement，把胶囊 CSS / data-input-method
  // 重新注入（面包屑被隐藏、按钮居中的直接原因）。
  if (mutationObserver) {
    mutationObserver.disconnect()
    mutationObserver = null
  }
  // 移除 resize 与输入框 focus/blur 监听（同样是 initMobileToolbarAdjuster 注册的）
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
    resizeHandler = null
  }
  detachFocusEventHandlers()
  // 清理已弃用的 per-element 检测定时器（保留兼容）
  toolbarCheckTimers.forEach(timer => clearTimeout(timer))
  toolbarCheckTimers.clear()

  // 复位状态（防残留：下次重新绑定时读到旧缓存）
  toolbarHiddenByScroll = false
  toolbarAutoHideCapsuleMode = false

  // 清除面包屑上的 inline 样式 / class / 属性残留
  // （inline opacity/transform 不会随 style 元素移除而消失，是"面包屑仍被隐藏/按钮仍偏位"的根因）
  document.querySelectorAll('.protyle-breadcrumb, .protyle-breadcrumb__bar').forEach(el => {
    const htmlEl = el as HTMLElement
    htmlEl.classList.remove('toolbar-scroll-hidden')
    htmlEl.style.removeProperty('opacity')
    htmlEl.style.removeProperty('transform')
    htmlEl.style.removeProperty('display')
    htmlEl.style.removeProperty('position')
    htmlEl.style.removeProperty('bottom')
    htmlEl.style.removeProperty('top')
    htmlEl.style.removeProperty('left')
    htmlEl.style.removeProperty('right')
    htmlEl.style.removeProperty('z-index')
    htmlEl.style.removeProperty('background-color')
    htmlEl.style.removeProperty('padding-bottom')
    htmlEl.removeAttribute('data-input-method')
    htmlEl.removeAttribute('data-toolbar-customized')
    htmlEl.removeAttribute('data-prevent-swipe')
  })

  // 清除残留 body class（不除干净 isNavTakeoverMode 会持续为真，接管逻辑反复介入）
  document.body.classList.remove(
    'siyuan-toolbar-floating',
    'siyuan-toolbar-nav-overflow',
    'siyuan-toolbar-customizer-enabled',
    'siyuan-toolbar-top-mode'
  )

  // 清除导航栏接管定位用的 CSS 变量
  document.documentElement.style.removeProperty('--tc-nav-bottom')
  document.documentElement.style.removeProperty('--tc-nav-bottom-fixed')
  document.documentElement.style.removeProperty('--mobile-toolbar-offset')
}

// ===== 电脑端悬浮胶囊滚动隐藏（独立实现，不复用移动端逻辑） =====
// 设计要点：
// 1. CSS 隐藏逻辑（ensureToolbarAutoHideStyle / toolbar-scroll-hidden class）完全设备无关，直接复用
// 2. 电脑端与手机端互斥运行（isMobileDevice() 守卫），桌面端使用独立的 desktopAutoHide* 状态变量
// 3. 电脑端特有：多标签页——切换标签页后必须重绑到新活动 protyle 的 contentElement
// 5. 电脑端特有：多标签页——切换标签页后必须重绑到新活动 protyle 的 contentElement

/**
 * 获取电脑端当前活动标签页的滚动容器（.protyle-content）。
 * 手机端用 window.siyuan.mobile.editor.protyle，电脑端该对象不存在，且多标签页下
 * document.querySelector('.protyle-content') 会取到非活动标签页，所以必须专门处理。
 */
function getDesktopScrollElementForFloating(): HTMLElement | null {
  // 优先用活动 protyle 实例（与思源 getActiveTab 同一逻辑）
  const protyle = getActiveProtyle()
  if (protyle?.contentElement) return protyle.contentElement as HTMLElement
  // 兜底：DOM 查找非隐藏的 protyle 的 content
  const visibleProtyle = document.querySelector('.protyle:not(.fn__hidden):not(.fn__none)')
  if (visibleProtyle) {
    return visibleProtyle.querySelector('.protyle-content') as HTMLElement | null
  }
  return null
}

/** 解绑电脑端胶囊的 scroll 监听 + 清理所有 timer */
function unbindDesktopScrollForFloating(): void {
  if (desktopFloatingScrollHandler && desktopFloatingScrollBoundEl) {
    desktopFloatingScrollBoundEl.removeEventListener('scroll', desktopFloatingScrollHandler)
  }
  desktopFloatingScrollHandler = null
  desktopFloatingScrollBoundEl = null
  if (desktopFloatingScrollRetryTimer) {
    clearInterval(desktopFloatingScrollRetryTimer)
    desktopFloatingScrollRetryTimer = null
  }
  if (desktopFloatingTabPollTimer) {
    clearInterval(desktopFloatingTabPollTimer)
    desktopFloatingTabPollTimer = null
  }
  // 取消未触发的延时（使用桌面端独立的 pendingTimer）
  if (desktopAutoHidePendingTimer) {
    clearTimeout(desktopAutoHidePendingTimer)
    desktopAutoHidePendingTimer = null
  }
  // 恢复所有被隐藏的工具栏（清除残留的 toolbar-scroll-hidden class 和 inline transform）
  document.querySelectorAll('.protyle-breadcrumb.toolbar-scroll-hidden, .protyle-breadcrumb__bar.toolbar-scroll-hidden').forEach(el => {
    const htmlEl = el as HTMLElement
    htmlEl.classList.remove('toolbar-scroll-hidden')
    // 胶囊模式需要保留 translateX(-50%) 居中（由 applyDesktopFloatingToolbar 的 CSS 提供，清除 inline 即可）
    htmlEl.style.transform = ''
    htmlEl.style.transition = ''
  })
  document.body.classList.remove('toolbar-autohide-active')
  // 复位桌面端独立的滚动隐藏状态变量
  desktopAutoHideForceActive = false
  desktopAutoHideCapsuleMode = false
  desktopHiddenByScroll = false
  desktopLastScrollTop = null
  desktopAutoHideIgnoreUntil = 0
  desktopAutoHideLastHide = 0
  desktopAutoHideLastShow = 0
}

/**
 * 桌面端胶囊滚动隐藏的滚动事件处理器（完全独立于手机端，使用 desktop* 状态变量）。
 * scrollEl 由调用方传入（desktopFloatingScrollBoundEl），始终是 HTMLElement。
 */
function handleDesktopToolbarAutoHideScroll(scrollEl: HTMLElement): void {
  if (!desktopAutoHideForceActive) return

  const now = Date.now()

  // 静默期内只跟踪位置，不执行动作
  if (now < desktopAutoHideIgnoreUntil) {
    desktopLastScrollTop = scrollEl.scrollTop
    return
  }

  const st = scrollEl.scrollTop
  if (st == null) return

  if (desktopLastScrollTop == null) {
    desktopLastScrollTop = st
    return
  }

  const delta = st - desktopLastScrollTop
  desktopLastScrollTop = st

  // 冷却检查
  if (!desktopHiddenByScroll && delta > TOOLBAR_AUTOHIDE_THRESHOLD && now - desktopAutoHideLastShow < TOOLBAR_AUTOHIDE_COOLDOWN_HIDE) return
  if (desktopHiddenByScroll && delta < -TOOLBAR_AUTOHIDE_THRESHOLD && now - desktopAutoHideLastHide < TOOLBAR_AUTOHIDE_COOLDOWN_SHOW) return

  if (!desktopHiddenByScroll && delta > TOOLBAR_AUTOHIDE_THRESHOLD) {
    // 上滑 → 隐藏
    desktopHiddenByScroll = true
    desktopAutoHideLastHide = now
    desktopAutoHideIgnoreUntil = now + 250
    desktopLastScrollTop = st

    document.body.classList.add('toolbar-autohide-active')
    desktopAutoHidePendingTimer = setTimeout(() => {
      desktopAutoHidePendingTimer = null
      getToolbarElementsForAutoHide().forEach(el => {
        el.classList.add('toolbar-scroll-hidden')
        el.style.transform = desktopAutoHideCapsuleMode
          ? 'translateX(-50%) translateY(0)'
          : 'translateZ(0) translateY(calc(100% + 8px))'
      })
    }, 50)
  } else if (desktopHiddenByScroll && delta < -TOOLBAR_AUTOHIDE_THRESHOLD) {
    // 下滑 → 显示
    desktopHiddenByScroll = false
    desktopAutoHideLastShow = now
    desktopAutoHideIgnoreUntil = now + 250
    desktopLastScrollTop = st

    document.querySelectorAll('.protyle-breadcrumb.toolbar-scroll-hidden, .protyle-breadcrumb__bar.toolbar-scroll-hidden').forEach(el => {
      const htmlEl = el as HTMLElement
      htmlEl.style.transition = 'opacity 0.2s ease-out, transform 0.2s ease-out'
      htmlEl.classList.remove('toolbar-scroll-hidden')
      htmlEl.style.transform = desktopAutoHideCapsuleMode
        ? 'translateX(-50%) translateY(0)'
        : 'translateZ(0) translateY(0)'
    })
    desktopAutoHidePendingTimer = setTimeout(() => {
      desktopAutoHidePendingTimer = null
      document.body.classList.remove('toolbar-autohide-active')
    }, 80)
  }
}

/**
 * 启动电脑端胶囊滚动隐藏。
 * - 注入 CSS（复用 ensureToolbarAutoHideStyle）
 * - 设置桌面端独立状态标志（desktopAutoHideForceActive / desktopAutoHideCapsuleMode）
 * - 绑定 scroll 监听 + 重试 + 标签页切换轮询（电脑端特有）
 */
function startDesktopScrollForFloating(): void {
  if (!isMobileDevice()) {
    // 1. 注入 CSS（设备无关，电脑端也能用）
    ensureToolbarAutoHideStyle()
    // 2. 设置桌面端独立状态：使用专用 handler + transform 保留 translateX(-50%)
    desktopAutoHideForceActive = true
    desktopAutoHideCapsuleMode = true
    // 3. scroll handler 使用桌面端独立的 handleDesktopToolbarAutoHideScroll，
    //    不碰手机端的 toolbarAutoHide* 变量
    if (!desktopFloatingScrollHandler) {
      desktopFloatingScrollHandler = () => {
        if (desktopFloatingScrollBoundEl) {
          handleDesktopToolbarAutoHideScroll(desktopFloatingScrollBoundEl)
        }
      }
    }
  }

  // 4. 绑定 + 重试（活动 protyle 可能还没建好）
  const tryBind = () => {
    if (desktopFloatingScrollBoundEl) return  // 已绑定
    const el = getDesktopScrollElementForFloating()
    if (el) {
      el.addEventListener('scroll', desktopFloatingScrollHandler!, { passive: true })
      desktopFloatingScrollBoundEl = el
      desktopLastScrollTop = el.scrollTop  // 桌面端独立的滚动基准
    }
  }
  tryBind()
  if (!desktopFloatingScrollRetryTimer) {
    let retryCount = 0
    desktopFloatingScrollRetryTimer = setInterval(() => {
      retryCount++
      tryBind()
      if (desktopFloatingScrollBoundEl || retryCount >= 30) {
        if (desktopFloatingScrollRetryTimer) clearInterval(desktopFloatingScrollRetryTimer)
        desktopFloatingScrollRetryTimer = null
      }
    }, 200)
  }

  // 5. 标签页切换轮询（电脑端特有）：检测活动 protyle 是否变化，变化则重绑
  //    主路径是 eventBus 的 switch-protyle / loaded-protyle-dynamic 事件
  //    （由 index.ts 的 eventBusRefreshHandler → refreshDesktopFloatingScrollOnSwitch 处理）。
  //    轮询仅作为冷启动兜底：3 秒间隔，检测到一次活动 protyle 变化后立即停止。
  if (!desktopFloatingTabPollTimer) {
    let pollRetries = 0
    desktopFloatingTabPollTimer = setInterval(() => {
      pollRetries++
      const activeEl = getDesktopScrollElementForFloating()
      if (activeEl && activeEl !== desktopFloatingScrollBoundEl) {
        // 活动标签页变了，重绑
        if (desktopFloatingScrollHandler && desktopFloatingScrollBoundEl) {
          desktopFloatingScrollBoundEl.removeEventListener('scroll', desktopFloatingScrollHandler)
        }
        desktopFloatingScrollBoundEl = null
        activeEl.addEventListener('scroll', desktopFloatingScrollHandler!, { passive: true })
        desktopFloatingScrollBoundEl = activeEl
        // 使用桌面端独立的滚动基准，不碰手机端的 toolbarAutoHideBoundEl
        desktopLastScrollTop = activeEl.scrollTop
        // 切换标签页时如果工具栏处于隐藏状态，立即恢复（避免新页面看不到工具栏）
        if (desktopHiddenByScroll) {
          desktopHiddenByScroll = false
          getToolbarElementsForAutoHide().forEach(el => {
            el.classList.remove('toolbar-scroll-hidden')
            el.style.transform = desktopAutoHideCapsuleMode ? 'translateX(-50%) translateY(0)' : ''
          })
          document.body.classList.remove('toolbar-autohide-active')
        }
      }
      // 兜底轮询上限：30 次 ≈ 90 秒后停止（eventBus 此时已稳定接管）
      if (pollRetries >= 30) {
        if (desktopFloatingTabPollTimer) clearInterval(desktopFloatingTabPollTimer)
        desktopFloatingTabPollTimer = null
      }
    }, 3000)
  }
}

/**
 * 切换文档/标签页时刷新电脑端胶囊滚动隐藏状态。
 *
 * 触发时机：由插件 eventBusRefreshHandler（监听 switch-protyle / loaded-protyle-dynamic）调用。
 *
 * 解决的问题：
 * 1. 同一标签页切文档时 .protyle-content 元素复用，但 scrollTop 被重置，
 *    若不重置 desktopLastScrollTop，delta 会异常导致方向判断失效。
 * 2. 跨标签页切换时活动 protyle 变化，需要重绑 scroll 监听到新容器。
 * 3. 切换瞬间若工具栏处于隐藏状态，应立即恢复（避免新文档看不到胶囊）。
 *
 * 幂等：未启用电脑端胶囊滚动隐藏时（desktopFloatingScrollHandler 为 null）直接返回。
 */
export function refreshDesktopFloatingScrollOnSwitch(): void {
  // 仅电脑端、且已启用胶囊滚动隐藏时处理
  if (isMobileDevice()) return
  if (!desktopFloatingScrollHandler) return

	  // 1. 恢复工具栏可见状态（清除残留的隐藏 class / inline transform / body class）
	  if (desktopHiddenByScroll) {
	    desktopHiddenByScroll = false
	    document.querySelectorAll('.protyle-breadcrumb.toolbar-scroll-hidden, .protyle-breadcrumb__bar.toolbar-scroll-hidden').forEach(el => {
	      const htmlEl = el as HTMLElement
	      htmlEl.classList.remove('toolbar-scroll-hidden')
	      htmlEl.style.transform = desktopAutoHideCapsuleMode ? 'translateX(-50%) translateY(0)' : ''
	    })
	    document.body.classList.remove('toolbar-autohide-active')
	  }

	  // 2. 重置滚动基准（关键：让下一次 scroll 事件重新建立基准，避免 delta 错乱）
	  desktopLastScrollTop = null
	  desktopAutoHideIgnoreUntil = 0

	  // 3. 重绑到当前活动 protyle 的滚动容器（覆盖跨标签页切换的情况）
	  //    注意：不写 toolbarAutoHideBoundEl（桌面端有独立的 desktopFloatingScrollBoundEl，
	  //    写共享变量会破坏手机端的滚动绑定）
	  const activeEl = getDesktopScrollElementForFloating()
	  if (activeEl && activeEl !== desktopFloatingScrollBoundEl) {
	    if (desktopFloatingScrollBoundEl) {
	      desktopFloatingScrollBoundEl.removeEventListener('scroll', desktopFloatingScrollHandler)
	    }
	    activeEl.addEventListener('scroll', desktopFloatingScrollHandler, { passive: true })
	    desktopFloatingScrollBoundEl = activeEl
	    desktopLastScrollTop = activeEl.scrollTop
	  } else if (activeEl && activeEl === desktopFloatingScrollBoundEl) {
	    // 同一容器（同标签页切文档）：只重置基准为新文档的当前 scrollTop
	    desktopLastScrollTop = activeEl.scrollTop
	  }
	}

	/** 检测 Kmind-Zen 文档树是否激活，切换 body class 驱动 CSS 隐藏（仅移动端） */
	export function refreshKmindZenCompat(): void {
	  if (!isMobileDevice()) return
	  // 完全恢复思源原始状态：不重注入 kmind-zen-compat-style（该 style 含隐藏面包屑规则，
	  // applyFeatures 恢复分支会移除它，这里再注入会让"恢复"失效）
	  if (pluginInstance?.mobileFeatureConfig?.disableCustomButtons === true) return
	  if (!document.getElementById('kmind-zen-compat-style')) {
	    const kmindStyle = document.createElement('style')
	    kmindStyle.id = 'kmind-zen-compat-style'
	    kmindStyle.textContent = `
		      body.kmind-zen-active #mobile-outline-panel,
		      body.kmind-zen-active #mobile-tabs-bar {
	        display: none !important;
	      }
	      body.kmind-zen-active .protyle-breadcrumb[data-toolbar-customized],
	      body.kmind-zen-active .protyle-breadcrumb__bar[data-toolbar-customized],
	      body.kmind-zen-active.siyuan-toolbar-top-mode .protyle-breadcrumb:not([data-toolbar-customized]),
	      body.kmind-zen-active.siyuan-toolbar-top-mode .protyle-breadcrumb__bar:not([data-toolbar-customized]) {
	        display: none !important;
	      }
	    `
	    document.head.appendChild(kmindStyle)
	  }
		  // 检测 Kmind-Zen 面板是否可见（.kmind-zen-protyle-root 为文档树根容器）
			  void _applyKmindZenState()
	}

	let _kmindZenPending = false
	async function _applyKmindZenState(): Promise<void> {
	  if (_kmindZenPending) return
	  // 通过思源 API 查当前文档的 custom-kmind-zen-doctree-doc 属性
	  const protyle = getActiveProtyle()
	  const docId = protyle?.block?.rootID
	  if (docId) {
	    _kmindZenPending = true
	    try {
	      const resp = await fetchSyncPost('/api/attr/getBlockAttrs', { id: docId })
	      const isKmindZen = resp?.data?.['custom-kmind-zen-doctree-doc'] === 'true'
	      document.body.classList.toggle('kmind-zen-active', isKmindZen)
	    } catch {
	      document.body.classList.remove('kmind-zen-active')
	    } finally {
	      _kmindZenPending = false
	    }
  } else {
    document.body.classList.remove('kmind-zen-active')
  }
}

// ===== 接管模式：插件自身滚动监听驱动工具栏隐藏/显示（仅移动端） =====
// 背景：底部胶囊 / 底部固定⑦ 模式下导航栏由插件接管（forceMenuPanelOpen 让思源认为面板
// 常开 → 暂停原生滚动隐藏），body.mobile-chrome--hidden 永不出现，"随思源导航栏自动隐藏"
// 没有信号可跟。这里在接管模式下由插件自己监听编辑器滚动，还原"上滑隐藏、下滑显示"。

/** 获取移动端编辑器滚动容器（手机端所有面板均以 protyle.contentElement 为滚动容器） */
function getMobileScrollElementForAutoHide(): HTMLElement | null {
  const protyle = (window as any).siyuan?.mobile?.editor?.protyle
  return protyle?.contentElement || document.querySelector('.protyle-content')
}

/** 接管模式滚动监听：上滑隐藏、下滑显示（阈值/冷却与桌面端胶囊一致） */
function handleMobileScrollAutoHide(): void {
  const el = mobileScrollAutoHideBoundEl
  if (!el) return

  // 键盘打开时不隐藏（思源置 editing 状态，工具栏需保持可用）；若此前已隐藏则恢复
  if (document.body.classList.contains('mobile-keyboard--open')) {
    if (toolbarHiddenByScroll) applyToolbarAutoHideState(false)
    return
  }

  const now = Date.now()
  // 静默期内只跟踪位置，不执行动作（防止隐藏/显示后的反馈滚动触发反复切换）
  if (now < mobileScrollAutoHideIgnoreUntil) {
    mobileScrollAutoHideLastScrollTop = el.scrollTop
    return
  }

  const st = el.scrollTop
  if (st == null) return
  if (mobileScrollAutoHideLastScrollTop == null) {
    mobileScrollAutoHideLastScrollTop = st
    return
  }
  const delta = st - mobileScrollAutoHideLastScrollTop
  mobileScrollAutoHideLastScrollTop = st

  // 同容器切文档时 scrollTop 可能被思源重置：单次事件 delta 超上限视为基准重置，只更新基准不动作
  if (Math.abs(delta) > 800) return

  // 冷却检查（隐藏 200ms / 显示 80ms，与桌面端胶囊一致）
  if (!toolbarHiddenByScroll && delta > TOOLBAR_AUTOHIDE_THRESHOLD && now - mobileScrollAutoHideLastShow < TOOLBAR_AUTOHIDE_COOLDOWN_HIDE) return
  if (toolbarHiddenByScroll && delta < -TOOLBAR_AUTOHIDE_THRESHOLD && now - mobileScrollAutoHideLastHide < TOOLBAR_AUTOHIDE_COOLDOWN_SHOW) return

  if (!toolbarHiddenByScroll && delta > TOOLBAR_AUTOHIDE_THRESHOLD) {
    // 上滑 → 隐藏
    mobileScrollAutoHideLastHide = now
    mobileScrollAutoHideIgnoreUntil = now + 250
    mobileScrollAutoHideLastScrollTop = st
    applyToolbarAutoHideState(true)
  } else if (toolbarHiddenByScroll && delta < -TOOLBAR_AUTOHIDE_THRESHOLD) {
    // 下滑 → 显示
    mobileScrollAutoHideLastShow = now
    mobileScrollAutoHideIgnoreUntil = now + 250
    mobileScrollAutoHideLastScrollTop = st
    applyToolbarAutoHideState(false)
  }
}

function bindMobileScrollAutoHide(): void {
  if (mobileScrollAutoHideBoundEl) return
  const el = getMobileScrollElementForAutoHide()
  if (!el) return
  mobileScrollAutoHideBoundEl = el
  mobileScrollAutoHideLastScrollTop = el.scrollTop
  mobileScrollAutoHideHandler = handleMobileScrollAutoHide
  el.addEventListener('scroll', mobileScrollAutoHideHandler, { passive: true })
}

/** 滚动容器晚于工具栏出现（冷启动）时的绑定重试 */
function startMobileScrollAutoHideRetry(): void {
  if (mobileScrollAutoHideBoundEl) return
  if (mobileScrollAutoHideRetryTimer) return
  let retryCount = 0
  mobileScrollAutoHideRetryTimer = setInterval(() => {
    retryCount++
    bindMobileScrollAutoHide()
    if (mobileScrollAutoHideBoundEl || retryCount >= 30) {
      if (mobileScrollAutoHideRetryTimer) clearInterval(mobileScrollAutoHideRetryTimer)
      mobileScrollAutoHideRetryTimer = null
    }
  }, 200)
}

function unbindMobileScrollAutoHide(): void {
  if (mobileScrollAutoHideHandler && mobileScrollAutoHideBoundEl) {
    mobileScrollAutoHideBoundEl.removeEventListener('scroll', mobileScrollAutoHideHandler)
  }
  mobileScrollAutoHideHandler = null
  mobileScrollAutoHideBoundEl = null
  if (mobileScrollAutoHideRetryTimer) {
    clearInterval(mobileScrollAutoHideRetryTimer)
    mobileScrollAutoHideRetryTimer = null
  }
  mobileScrollAutoHideLastScrollTop = null
  mobileScrollAutoHideIgnoreUntil = 0
}

/**
 * 刷新工具栏自动隐藏状态（切换文档/锁定文档/初始化时调用）（仅移动端）
 *
 * 信号源分两种：
 * - 非接管模式：跟随思源原生移动栏（body.mobile-chrome--hidden），由 bindNativeBarsSync 驱动；
 * - 接管模式（底部胶囊/底部固定⑦）：思源原生滚动隐藏被 forceMenuPanelOpen 暂停，
 *   mobile-chrome--hidden 永不出现，改由插件自身滚动监听驱动（bindMobileScrollAutoHide）。
 * 桌面端胶囊滚动隐藏有独立的 refreshDesktopFloatingScrollOnSwitch，不经过此函数。
 */
export function refreshToolbarAutoHide(): void {
  // 仅移动端生效
  if (!isMobileDevice()) return

  // 完全恢复思源原始状态：插件不再干预任何显隐。
  // 否则心跳/设置变更仍会重注入 toolbar-autohide-style 并 bindNativeBarsSync，
  // 恢复模式下滚动时面包屑仍被插件隐藏（"面包屑还是被藏"的残留源）
  if (pluginInstance?.mobileFeatureConfig?.disableCustomButtons === true) {
    unbindNativeBarsSync()
    unbindMobileScrollAutoHide()
    unbindToolbarAutoHideScroll()
    if (toolbarHiddenByScroll) applyToolbarAutoHideState(false)
    return
  }

  // 侧栏/更多面板打开时隐藏侧边胶囊（与跟随隐藏开关无关，始终绑定）
  bindSidePanelsSync()
  // 扩展栏打开时显示思源导航栏（底部胶囊模式）
  bindOverflowPanelSync()

  // 开关关闭时：不跟随隐藏，解绑两种信号源并恢复工具栏显示
  const mobileCfg = (window as any).__mobileToolbarConfig as { followNativeBarsAutoHide?: boolean } | undefined
  if (mobileCfg?.followNativeBarsAutoHide === false) {
    unbindNativeBarsSync()
    unbindMobileScrollAutoHide()
    if (toolbarHiddenByScroll) applyToolbarAutoHideState(false)
    return
  }

  ensureToolbarAutoHideStyle()

  // 接管模式：由插件自身滚动监听驱动
  if (isNavTakeoverMode()) {
    unbindNativeBarsSync()
    const activeEl = getMobileScrollElementForAutoHide()
    if (activeEl && activeEl !== mobileScrollAutoHideBoundEl) {
      // 滚动容器变化（切文档/重建）：先恢复显示再重绑，避免新文档看不到工具栏
      if (toolbarHiddenByScroll) applyToolbarAutoHideState(false)
      unbindMobileScrollAutoHide()
      bindMobileScrollAutoHide()
    } else if (!mobileScrollAutoHideBoundEl) {
      bindMobileScrollAutoHide()
    }
    if (!mobileScrollAutoHideBoundEl) startMobileScrollAutoHideRetry()
    return
  }

  // 非接管模式：跟随思源原生移动栏状态
  unbindMobileScrollAutoHide()
  bindNativeBarsSync()

  // 立即同步一次当前原生栏状态（工具栏重建/文档切换后可能与缓存状态不同）
  const hidden = isNativeMobileBarsHidden()
  if (hidden !== nativeBarsLastHidden) {
    nativeBarsLastHidden = hidden
    applyToolbarAutoHideState(hidden)
  }
}

	/**
	 * 一键清理当前文档的空块
 * 
 * 扫描当前活动编辑器中的空块（无文本、无内嵌媒体、无子块的段落/标题/列表项），
 * 经用户确认后逐一删除。
 */
async function executeClearEmptyBlocks(): Promise<void> {
  // 1. 获取当前活动编辑器
  const protyle = getActiveProtyle()
  if (!protyle?.wysiwyg?.element) {
    Notify.showInfoEditorNotFocused()
    return
  }

  const wysiwyg = protyle.wysiwyg.element

  // 2. 扫描所有块，筛选空块
  const emptyBlockIds: string[] = []
  const blockElements = wysiwyg.querySelectorAll('[data-node-id]') as NodeListOf<HTMLElement>

  for (const el of blockElements) {
    // 跳过隐藏块（如折叠标题下的子块）
    if (el.offsetParent === null) continue

    const type = el.dataset.type
    const nodeId = el.dataset.nodeId

    // 只处理内容块：段落、标题、列表项
    if (!type || !['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'NodeParagraph', 'NodeHeading', 'NodeListItem'].includes(type)) continue
    if (!nodeId) continue

    // 检查是否有可见文本（思源空块含零宽空格 \u200b，.trim() 不移除它）
    const cleanedText = (el.textContent || '').replace(/[\u200b\ufeff]/g, '').trim()
    const hasText = cleanedText.length > 0
    // 检查是否有内嵌媒体（图片、视频、公式等）
    const hasEmbedded = el.querySelector(':scope > img, :scope > video, :scope > audio, :scope > iframe, .protyle-icon') !== null
    // 检查是否有子块（如 li 嵌套了列表）
    const hasChildBlocks = el.querySelector(':scope > [data-node-id]') !== null

    if (!hasText && !hasEmbedded && !hasChildBlocks) {
      emptyBlockIds.push(nodeId)
    }
  }

  // 3. 过滤掉记事弹窗正在使用的块
  const qnBlockId = (window as any).__qn_block_id as string | undefined
  if (qnBlockId) {
    const before = emptyBlockIds.length
    const filtered = emptyBlockIds.filter(id => id !== qnBlockId)
    if (filtered.length < before) {
      emptyBlockIds.length = 0
      emptyBlockIds.push(...filtered)
    }
  }

  // 4. 无空块
  if (emptyBlockIds.length === 0) {
    Notify.showSuccess(t('toolbarManager.clearEmptyBlocks.none', undefined, '当前文档没有空块'))
    return
  }

  // 5. 确认删除
  const confirmed = await showConfirmDialog({
    title: t('toolbarManager.clearEmptyBlocks.title', undefined, '清理空块'),
    message: t('toolbarManager.clearEmptyBlocks.confirm', { count: emptyBlockIds.length }, '发现 {count} 个空块，是否删除？'),
    hint: t('toolbarManager.clearEmptyBlocks.warning', undefined, '删除后不可撤销，建议先保存快照'),
    confirmText: t('toolbarManager.clearEmptyBlocks.delete', undefined, '删除'),
    cancelText: t('toolbarManager.clearEmptyBlocks.cancel', undefined, '取消'),
  })
  if (!confirmed) return

  // 5. 倒序删除（从文档末尾向上，避免 ID 失效）
  let successCount = 0
  const sortedIds = [...emptyBlockIds].reverse()
  for (const id of sortedIds) {
    try {
      const result = await deleteBlock(id)
      if (result !== null) successCount++
    } catch (e) {
      logger.warn('[清理空块] 删除异常:', id, e)
    }
  }

  // 6. 显示结果
  if (successCount === 0) {
    Notify.showErrorCommandCannotExecute(t('toolbarManager.clearEmptyBlocks.failed', undefined, '清理空块失败'))
  } else if (successCount < emptyBlockIds.length) {
    Notify.showSuccess(t('toolbarManager.clearEmptyBlocks.partialSuccess', { successCount, totalCount: emptyBlockIds.length }, '已删除 {successCount}/{totalCount} 个空块'))
  } else {
    Notify.showSuccess(t('toolbarManager.clearEmptyBlocks.success', { count: successCount }, '已删除 {count} 个空块'))
  }
}

/**
 * 执行鲸鱼定制工具箱
 */
async function executeAuthorTool(config: ButtonConfig, savedSelection: Range | null = null, lastActiveElement: HTMLElement | null = null) {
  const subtype = config.authorToolSubtype || 'button-sequence'

  // ===== 授权检查（运行时拦截，防止过期/未激活用户使用付费功能）=====
  // 永远免费的两项不拦截：toggle-lock（沉浸阅读）、slide-comment（滑动批注）
  const FREE_SUBTYPES = ['toggle-lock', 'slide-comment']
  if (!FREE_SUBTYPES.includes(subtype)) {
    const status = licenseManager.getLicenseStatus()
    if (!status.active) {
      // 已过期或未激活：弹对应通知，引导用户到设置页激活
      if (status.plan === 'trial' && status.expired) {
        Notify.showTrialExpired()
      } else if (status.expired) {
        Notify.showLicenseExpired()
      } else {
        Notify.showActivationRequired()
      }
      return  // 不执行付费功能
    }
    // 即将到期提醒（剩余 ≤ 3 天，且非永久），每天最多提示一次
    if (status.daysLeft !== Infinity && licenseManager.shouldNotifyExpiring(status.plan, status.daysLeft)) {
      Notify.showLicenseExpiringSoon(status.daysLeft)
    }
  }

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
    // 手机端：使用记事弹窗内嵌模式
    const frontend = getFrontend()
    if (frontend === 'mobile' || frontend === 'browser-mobile') {
      triggerLifelogQuickNote(config)
      return
    }
    // 桌面端：苹果风格合并对话框
    try {
      const categories = config.lifeLogCategories || ['学习', '工作', '生活']
      const result = await showLifelogDialog(categories, {
        fontSize: config.lifeLogCatFontSize,
        padding: config.lifeLogCatPadding,
        hPadding: config.lifeLogCatHPadding,
        inputFontSize: config.lifeLogInputFontSize
      })

      if (result) {
        const { category, content: inputContent } = result
        const now = new Date()
        const hours = String(now.getHours()).padStart(2, '0')
        const minutes = String(now.getMinutes()).padStart(2, '0')
        const formattedContent = `${hours}:${minutes} ${category}：${inputContent}\n`
        const notebookId = config.lifeLogNotebookId

        if (!notebookId) {
          Notify.showErrorCommandCannotExecute(t('toolbarManager.configureNotebook', undefined, '请先配置笔记本ID'))
          return
        }

        try {
          const response = await fetchSyncPost('/api/block/appendDailyNoteBlock', {
            data: formattedContent,
            dataType: 'markdown',
            notebook: notebookId,
          })

          if (response.code === 0) {
            if (config.showNotification) Notify.showInfoCopySuccess()
          } else {
            await appendToDailyNoteAlternative(notebookId, formattedContent, config.showNotification)
          }
        } catch (apiError) {
          await appendToDailyNoteAlternative(notebookId, formattedContent, config.showNotification)
        }
      }
    } catch (error) {
      logger.warn('[叶归LifeLog适配] 执行失败:', error)
      Notify.showErrorCommandCannotExecute(t('toolbarManager.lifeLogIntegration', undefined, '叶归LifeLog适配'))
    }
	    return
	  }

		  // ⑧图片快捷导入
	  if (subtype === 'image-upload') {
	    await executeImageUpload(config, savedSelection, lastActiveElement)
	    return
	  }

		  // ⑯快速添加附件（同图片快捷导入，但接受所有文件类型）
	  if (subtype === 'quick-attach') {
	    await executeImageUpload(config, savedSelection, lastActiveElement, true)
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
          showMessage(isActive ? t('toolbarManager.7', undefined, '✅ 滑动快速批注已开启') : t('toolbarManager.8', undefined, '❌ 滑动快速批注已关闭'))
        }
      } else {
        Notify.showErrorCommandCannotExecute(t(
          'toolbarManager.slideCommentPluginMissing',
          undefined,
          '未找到鲸鱼快速批注插件，请先安装并启用'
        ))
      }
    }
    return
  }

	  // ⑬文档朗读（TTS）
	  if (subtype === 'tts') {
	    executeTTS()
	    return
	  }

		  // ⑭一键清理当前文档的空块
		  if (subtype === 'clear-empty-blocks') {
		    await executeClearEmptyBlocks()
		    return
		  }

			  // ⑮沉浸阅读模式
		  if (subtype === 'toggle-lock') {
		    await executeToggleLock(config)
		    return
		  }

		  // 打开指定ID块类型（默认）
  const frontend = getFrontend()
  const isMobile = frontend === 'mobile' || frontend === 'browser-mobile'

  // 根据平台获取对应的目标ID配置
  const targetId = isMobile ? config.mobileTargetDocId : config.targetDocId

  if (!targetId) {
    Notify.showErrorCommandCannotExecute(t('toolbarManager.targetBlockNotConfigured', undefined, '未配置目标块ID'))
    return
  }

  try {
    // 先获取块信息，提取文档ID（rootID）
    const blockInfo = await fetchSyncPost('/api/block/getBlockInfo', { id: targetId })

    if (blockInfo.code !== 0 || !blockInfo.data) {
      Notify.showErrorCommandCannotExecute(t(
        'toolbarManager.getBlockInfoFailed',
        { targetId },
        `获取块信息: ${targetId}`
      ))
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
    logger.warn('[打开指定ID块] 打开失败:', error)
    Notify.showErrorCommandCannotExecute(t(
      'toolbarManager.openBlockFailed',
      { targetId },
      `打开块: ${targetId}`
    ))
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
 * ⑧图片快捷导入
 */
/**
 * 追加图片 markdown 到日记底部（原有逻辑，工具栏无光标时使用）
 */
async function appendToDailyNote(config: ButtonConfig, uploadedPath: string): Promise<void> {
  const notebookId = config.imageUploadNotebookId
  if (!notebookId) {
    Notify.showErrorCommandCannotExecute(t('toolbarManager.configureNotebook', undefined, '请先配置笔记本ID'))
    return
  }

  const imageMarkdown = `![](${uploadedPath})\n`
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
    Notify.showErrorCommandCannotExecute(t(
      'toolbarManager.appendDailyNoteFailed',
      { error: appendResult.msg || '' },
      `追加到日记失败: ${appendResult.msg || ''}`
    ))
  }
}

async function executeImageUpload(config: ButtonConfig, preSavedRange: Range | null = null, preSavedActiveEl: HTMLElement | null = null, acceptAllFiles: boolean = false) {
  // ===== 优先使用 mousedown/touchstart 阶段预存的光标（最可靠） =====
  let savedRange: Range | null = preSavedRange
  let savedEditEl: HTMLElement | null = null

  if (savedRange && preSavedActiveEl) {
    // 从预存的 activeElement 向上找 contenteditable
    let node: Node | null = preSavedActiveEl
    while (node) {
      if (node instanceof HTMLElement && node.contentEditable === 'true') {
        savedEditEl = node
        break
      }
      node = node.parentNode
    }
  }

  // 如果 preSavedActiveEl 找不到，从 Range 的 commonAncestor 向上找
  if (savedRange && !savedEditEl) {
    let node: Node | null = savedRange.commonAncestorContainer
    while (node && node !== document.body) {
      if (node instanceof HTMLElement && node.contentEditable === 'true') {
        savedEditEl = node
        break
      }
      node = node.parentNode
    }
  }

  // 兜底：当前 document.activeElement
  if (!savedEditEl) {
    const activeEl = document.activeElement
    if (activeEl) {
      const protyleEl = activeEl.closest?.('.protyle') as HTMLElement | null
      if (protyleEl) {
        const editEl = protyleEl.querySelector<HTMLElement>('[contenteditable="true"]')
        if (editEl && editEl.contains(activeEl)) {
          const sel = window.getSelection()
          if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0)
            if (editEl.contains(range.commonAncestorContainer)) {
              savedRange = range.cloneRange()
              savedEditEl = editEl
            }
          }
        }
      }
    }
  }

  // 创建文件选择器
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
	  fileInput.accept = acceptAllFiles ? '*/*' : 'image/*'
  fileInput.multiple = true
  fileInput.style.display = 'none'
  document.body.appendChild(fileInput)

	  fileInput.onchange = async () => {
	    // 清除图片选择器标记，恢复一键记事弹窗的正常触发
	    ;(window as any).__imagePickerActive = false
	    const files = fileInput.files
	    document.body.removeChild(fileInput)
	    if (!files || files.length === 0) return

	    try {
	      if (savedRange && savedEditEl && document.body.contains(savedEditEl)) {
	        // ===== 有光标 → 全部上传后一次性插入到光标位置 =====
	        try {
	          const paths: string[] = []
	          for (let i = 0; i < files.length; i++) {
	            paths.push(await uploadImageFile(files[i]))
	          }
	          insertProtyleImageAtCaret(savedEditEl, savedRange, paths)
	          if (config.showNotification) {
	            Notify.showInfoCopySuccess()
	          }
	        } catch (e) {
	          logger.warn('[图片快捷导入] 光标插入失败，回退日记追加:', e)
	          for (let i = 0; i < files.length; i++) {
	            const path = await uploadImageFile(files[i])
	            await appendToDailyNote(config, path)
	          }
	        }
	      } else {
	        // ===== 无光标 → 逐张追加到日记底部 =====
	        for (let i = 0; i < files.length; i++) {
	          const path = await uploadImageFile(files[i])
	          await appendToDailyNote(config, path)
	        }
	      }
	    } catch (error) {
	      logger.warn('[图片快捷导入] 执行失败:', error)
	      Notify.showErrorCommandCannotExecute(t('toolbarManager.imageImportFailed', undefined, '图片导入失败'))
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
  // 安全兜底：30秒后自动清除标记 + 移除 input 节点（防止 onchange/cancel 均不触发的极端情况）
  setTimeout(() => {
    ;(window as any).__imagePickerActive = false
    try { document.body.removeChild(fileInput) } catch { /* ignore */ }
  }, 30000)
}

/**
 * 关闭 LifeLog 确认弹窗（支持键盘左右选 + Enter 确认）
 */
function showCloseConfirmDialog(): Promise<boolean> {
  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);'
    const box = document.createElement('div')
    box.style.cssText = 'background:var(--b3-theme-background);border-radius:14px;padding:24px;min-width:280px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.25);'
    box.innerHTML = `<div style="font-size:16px;font-weight:600;margin-bottom:8px;color:var(--b3-theme-on-background)">${t('toolbarManager.lifeLog.closeConfirmTitle', undefined, '关闭 LifeLog？')}</div><div style="font-size:13px;color:var(--b3-theme-on-surface-light);margin-bottom:20px">${t('toolbarManager.lifeLog.closeConfirmBody', undefined, '输入框内有未保存的内容，确定要关闭吗？')}</div>`
    const btnRow = document.createElement('div')
    btnRow.style.cssText = 'display:flex;gap:10px;justify-content:center;'
    const cancelBtn = document.createElement('button')
    cancelBtn.textContent = t('toolbarManager.9', undefined, '取消')
    cancelBtn.style.cssText = 'padding:8px 24px;border-radius:8px;border:1px solid var(--b3-border-color);background:var(--b3-theme-surface);color:var(--b3-theme-on-surface);cursor:pointer;font-size:14px;outline:none;'
    const okBtn = document.createElement('button')
    okBtn.textContent = t('toolbarManager.10', undefined, '关闭')
    okBtn.style.cssText = 'padding:8px 24px;border-radius:8px;border:none;background:var(--b3-theme-primary);color:#fff;cursor:pointer;font-size:14px;outline:none;'
    btnRow.appendChild(cancelBtn)
    btnRow.appendChild(okBtn)
    box.appendChild(btnRow)
    overlay.appendChild(box)
    document.body.appendChild(overlay)

    let resolved = false
    const close = (result: boolean) => {
      if (resolved) return
      resolved = true
      window.removeEventListener('keydown', onKey, true)
      overlay.remove()
      resolve(result)
    }
    cancelBtn.onclick = () => close(false)
    okBtn.onclick = () => close(true)
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(false) })

    // 键盘：高亮选中，不依赖按钮 focus（避免被思源编辑器抢走焦点）
    let focusedIdx = 0
    const updateHighlight = () => {
      cancelBtn.style.background = focusedIdx === 0 ? 'var(--b3-theme-primary)' : 'var(--b3-theme-surface)'
      cancelBtn.style.color = focusedIdx === 0 ? '#fff' : 'var(--b3-theme-on-surface)'
      cancelBtn.style.border = focusedIdx === 0 ? 'none' : '1px solid var(--b3-border-color)'
      okBtn.style.background = focusedIdx === 1 ? 'var(--b3-theme-primary)' : 'var(--b3-theme-surface)'
      okBtn.style.color = focusedIdx === 1 ? '#fff' : 'var(--b3-theme-on-surface)'
      okBtn.style.border = focusedIdx === 1 ? 'none' : '1px solid var(--b3-border-color)'
    }
    updateHighlight()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.stopImmediatePropagation()
        focusedIdx = e.key === 'ArrowLeft'
          ? (focusedIdx - 1 + 2) % 2
          : (focusedIdx + 1) % 2
        updateHighlight()
      } else if (e.key === 'Enter') {
        e.stopImmediatePropagation()
        close(focusedIdx === 1)
      } else if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        close(false)
      }
      // 其余所有键一律拦截，不传给思源编辑器
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    window.addEventListener('keydown', onKey, true)
    // 保存引用，供插件 unload 时清理（避免插件卸载时模态未关导致 listener 泄漏）
    ;(window as any).__showConfirmKeydownHandler = onKey
  })
}

/**
 * 叶归 LifeLog 合并对话框：分类选择 + 输入内容（苹果风格）
 */
async function showLifelogDialog(categories: string[], opts?: { fontSize?: number; padding?: number; hPadding?: number; inputFontSize?: number }): Promise<{ category: string; content: string } | null> {
  const catFontSize = opts?.fontSize ?? 14
  const catPadding = opts?.padding ?? 8
  const catHPadding = opts?.hPadding ?? 4
  const inputFontSize = opts?.inputFontSize ?? 14
  return new Promise((resolve) => {
    const activeElement = document.activeElement as HTMLElement;

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 2147483647;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.4); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
      animation: tc-ll-fade-in 0.15s ease-out;
    `;
    overlay.tabIndex = -1;

    const box = document.createElement('div');
    box.style.cssText = `
      width: min(${360 + catHPadding * categories.length * 2}px, 90vw, 600px);
      max-height: 90vh;
      background: var(--b3-theme-background);
      border-radius: 14px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.2);
      animation: tc-ll-scale-in 0.2s ease-out;
      display: flex; flex-direction: column; overflow: hidden;
    `;

    // 标题（最后才收缩）
    const title = document.createElement('div');
    title.textContent = '📒 LifeLog';
    title.style.cssText = `
      padding: 18px 16px 12px; font-size: 17px; font-weight: 600;
      color: var(--b3-theme-on-background); text-align: center;
      flex: 0 1 auto; min-height: 0; overflow: hidden;
    `;
    box.appendChild(title);

    // 输入框（弹性伸缩，小窗口收缩、大窗口扩展）
    const input = document.createElement('textarea');
    input.placeholder = t('toolbarManager.11', undefined, '例如：写插件');
    input.style.cssText = `
      margin: 0 16px 12px; padding: 10px 12px;
      border: 1px solid var(--b3-border-color); border-radius: 8px;
      background: var(--b3-theme-surface); color: var(--b3-theme-on-surface);
      font-size: ${inputFontSize}px; outline: none; box-sizing: border-box; width: calc(100% - 32px);
      transition: border-color 0.2s, box-shadow 0.2s;
      flex: 1 1 120px; min-height: 60px;
      overflow-y: auto; resize: vertical;
      white-space: pre-wrap; word-wrap: break-word;
      line-height: 1.5;
      font-family: inherit;
    `;
    box.appendChild(input);

    // 分类按钮区域（第二优先收缩）
    const catWrap = document.createElement('div');
    const colCount = Math.max(2, Math.min(categories.length, 4));
    catWrap.style.cssText = `
      display: grid; grid-template-columns: repeat(${colCount}, 1fr);
      gap: 8px; padding: 0 16px 12px;
      flex: 0 1 auto; min-height: 0; overflow-y: auto;
    `;
    const normalBg = 'var(--b3-theme-surface)';
    const activeColor = 'var(--b3-theme-on-background)';

    let selectedIdx = 0;
    let focusOnCat = false;
    const catBtns: HTMLButtonElement[] = [];

    categories.forEach((cat, idx) => {
      const btn = document.createElement('button');
      btn.textContent = cat;
      btn.style.cssText = `
        font-size: ${catFontSize}px; padding: ${catPadding}px ${catHPadding}px; border: none;
        border-radius: 10px; cursor: pointer;
        transition: background 0.15s, color 0.15s, transform 0.15s;
        background: ${normalBg};
        color: ${activeColor};
        text-align: center; white-space: nowrap;
        overflow: hidden; text-overflow: ellipsis;
        min-width: 0;
        display: flex; align-items: center; justify-content: center;
      `;
      btn.onclick = () => {
        selectedIdx = idx;
        focusOnCat = true;
        updateCatHighlight();
        confirmBtn.focus();
      };
      catBtns.push(btn);
      catWrap.appendChild(btn);
    });
    // 自适应缩小字号：文字超宽时缩小而非省略（不低于 9px）
    catBtns.forEach((btn) => {
      requestAnimationFrame(() => {
        if (isCleanedUp) return
        if (btn.scrollWidth > btn.clientWidth) {
          const scale = btn.clientWidth / btn.scrollWidth;
          const baseFontSize = catFontSize;
          btn.style.fontSize = `${Math.max(9, baseFontSize * scale)}px`;
        }
      });
    });
    box.appendChild(catWrap);

    const updateCatHighlight = () => {
      catBtns.forEach((b, i) => {
        b.style.background = i === selectedIdx ? 'var(--b3-theme-primary)' : normalBg;
        b.style.color = i === selectedIdx ? 'white' : activeColor;
        b.style.transform = (focusOnCat && i === selectedIdx) ? 'scale(1.05)' : 'scale(1)';
      });
    };

    // 进入类别选择模式的通用逻辑
    const enterCatMode = (targetIdx: number) => {
      if (!focusOnCat) {
        selectedIdx = 0;
        focusOnCat = true;
        input.style.borderColor = 'var(--b3-theme-primary)';
        input.style.boxShadow = '0 0 0 2px rgba(var(--b3-theme-primary-rgb, 0,122,255), 0.2)';
        catWrap.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
        catWrap.style.transform = 'scale(1.02)';
        setTimeout(() => { catWrap.style.transform = 'scale(1)'; }, 200);
      } else {
        selectedIdx = targetIdx;
      }
      updateCatHighlight();
    };

    // 输入框键盘事件：Enter发送，Escape关闭（有内容时确认），Shift+方向键 选分类
    // Enter 在 textarea 中正常换行，箭头键正常移动光标
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        const text = input.value.trim();
        if (text) {
          // 有内容 → 弹出确认框
          const confirmed = await showCloseConfirmDialog()
          if (!confirmed) { input.focus(); return }
        }
        cleanup(); resolve(null);
      }
      else if ((e.key === 'Enter') && (e.ctrlKey || e.metaKey || e.shiftKey)) {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        if (!focusOnCat) { enterCatMode(0); }
        cleanup();
        resolve({ category: categories[selectedIdx], content: text });
      }
      // Shift+方向键 选择分类
      else if (e.shiftKey) {
        if (e.key === 'ArrowUp') { e.preventDefault(); selectedIdx = (selectedIdx - colCount + categories.length) % categories.length; enterCatMode(selectedIdx); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = (selectedIdx + colCount) % categories.length; enterCatMode(selectedIdx); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); selectedIdx = (selectedIdx - 1 + categories.length) % categories.length; enterCatMode(selectedIdx); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); selectedIdx = (selectedIdx + 1) % categories.length; enterCatMode(selectedIdx); }
      }
    });

    // 分类区域键盘事件：方向键导航，Enter发送，Escape回输入框
    catWrap.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); selectedIdx = (selectedIdx - 1 + categories.length) % categories.length; updateCatHighlight(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); selectedIdx = (selectedIdx + 1) % categories.length; updateCatHighlight(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIdx = (selectedIdx - colCount + categories.length) % categories.length; updateCatHighlight(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = (selectedIdx + colCount) % categories.length; updateCatHighlight(); }
      else if (e.key === 'Enter') { e.preventDefault(); const text = input.value.trim(); if (text) { cleanup(); resolve({ category: categories[selectedIdx], content: text }); } }
      else if (e.key === 'Escape') {
        e.preventDefault();
        focusOnCat = false;
        input.style.borderColor = '';
        input.style.boxShadow = '';
        updateCatHighlight();
        input.focus();
      }
    });
    catWrap.tabIndex = 0;

    // 分隔线
    const sep = document.createElement('div');
    sep.style.cssText = `margin: 0 16px; border-top: 0.5px solid var(--b3-border-color);`;
    box.appendChild(sep);

    // 按钮容器（最后才收缩）
    const btnRow = document.createElement('div');
    btnRow.style.cssText = `display: flex; gap: 8px; padding: 4px 16px 16px; flex: 0 1 auto; min-height: 0; overflow: hidden;`;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = t('toolbarManager.12', undefined, '取消');
    cancelBtn.style.cssText = `
      flex: 1; padding: 10px 0; font-size: 17px; background: transparent;
      color: var(--b3-theme-on-background); border: none; cursor: pointer;
      font-weight: 400;
    `;
    cancelBtn.onclick = () => { cleanup(); resolve(null); };
    btnRow.appendChild(cancelBtn);

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = t('toolbarManager.13', undefined, '发送');
    confirmBtn.style.cssText = `
      flex: 1; padding: 10px 0; font-size: 17px; background: transparent;
      color: var(--b3-theme-primary); border: none; cursor: pointer;
      font-weight: 600;
    `;
    confirmBtn.onclick = () => {
      const text = input.value.trim();
      if (!text) return;
      cleanup();
      resolve({ category: categories[selectedIdx], content: text });
    };
    btnRow.appendChild(confirmBtn);

    box.appendChild(btnRow);
    overlay.appendChild(box);

    // 注入动画（仅首次）
    if (!document.getElementById('tc-ll-anim-style')) {
      const style = document.createElement('style');
      style.id = 'tc-ll-anim-style';
      style.textContent = `
        @keyframes tc-ll-fade-in { from { opacity:0 } to { opacity:1 } }
        @keyframes tc-ll-scale-in { from { opacity:0; transform:scale(0.92) } to { opacity:1; transform:scale(1) } }
      `;
      document.head.appendChild(style);
    }
    document.body.appendChild(overlay);

    setTimeout(() => {
      if (document.contains(input)) {
        input.focus()
        input.setSelectionRange(input.value.length, input.value.length)
      }
    }, 100);

    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) { cleanup(); resolve(null); }
    });

    const cleanup = () => {
      overlay.remove();
      if (activeLifelogCleanup === cleanup) {
        activeLifelogCleanup = null
        activeLifelogInput = null
      }
      if (activeElement && document.contains(activeElement)) {
        try { activeElement.focus({ preventScroll: true }); } catch { /* ignore */ }
      }
      };
    // 注册全局状态，供快捷键再次按下时关闭
    activeLifelogCleanup = cleanup
    activeLifelogInput = input as HTMLTextAreaElement
  });
}

/**
 * 桌面端叶归LifeLog全局快捷键：弹出分类+内容对话框，追加到指定笔记本日记
 * 再按一次关闭（同 ESC），输入框有内容时提示确认
 */
let activeLifelogCleanup: (() => void) | null = null
let activeLifelogInput: HTMLTextAreaElement | null = null

/**
 * 桌面端 LifeLog 全局捕获（v3.8.2+ 适配版）。
 *
 * 思源 v3.8.2（commit 519b0e82e 插件生命周期重构）起：
 * 1. 主进程把全局快捷键从"广播所有窗口"改为定向发给 workspace 主窗口——window.html
 *    独立窗口（一键记事块格式弹窗/文档独立窗口）不在 workspaces 列表，永远收不到；
 * 2. 渲染端接收 handler 加了 if (!isWindow()) guard，window 窗口收到也丢弃。
 * 两处叠加导致独立窗口内 ⌥⇧L 完全失效；且 globalShortcut 在 OS 层拦截按键，
 * 窗口内本地 keydown 也收不到（Electron 行为）。
 *
 * 适配：全局快捷键仍由主窗口触发；若 OS 焦点在本插件的独立窗口（window.html），
 * 通过 @electron/remote 把动作转发到该窗口内执行（窗口内实例配置同源共享，
 * LifeLog 弹窗直接渲染在聚焦窗口）；焦点在主窗口时走原路径。
 */
export async function triggerDesktopLifelogGlobalCaptureSmart(): Promise<void> {
  try {
    const remote = (window as any).require?.('@electron/remote')
    const focused = remote?.BrowserWindow?.getFocusedWindow?.()
    const url = focused?.webContents?.getURL?.() || ''
    if (focused && url.includes('window.html')) {
      // 窗口内包 try-catch，把执行结果/异常栈回传主窗口日志（executeJavaScript 原始报错看不到窗口内细节）
      const inject = `
        (function () {
          try {
            if (typeof window.__tcLifelogTrigger !== 'function') {
              return 'hook-missing';
            }
            var r = window.__tcLifelogTrigger();
            if (r && typeof r.then === 'function') {
              return r.then(function () { return 'hook-ok'; })
                .catch(function (e) { return 'hook-async-error: ' + (e && e.stack ? e.stack : String(e)); });
            }
            return 'hook-ok';
          } catch (e) {
            return 'hook-error: ' + (e && e.stack ? e.stack : String(e));
          }
        })()
      `
      focused.webContents.executeJavaScript(inject).then((res: any) => {
      }).catch((err: any) => {
      })
      return
    }
  } catch (err) {
  }
  await triggerDesktopLifelogGlobalCapture()
}

export async function triggerDesktopLifelogGlobalCapture(): Promise<void> {
  if (isMobileDevice()) return
  // 多窗口环境下只有聚焦的窗口响应全局快捷键，避免所有窗口同时弹出
  if (!document.hasFocus()) {
    return
  }

  // 已有打开的弹窗 → 关闭
  if (activeLifelogCleanup) {
    const hasContent = activeLifelogInput && activeLifelogInput.value.trim().length > 0
    if (hasContent) {
      const confirmed = await showCloseConfirmDialog()
      if (!confirmed) return
    }
    activeLifelogCleanup()
    activeLifelogCleanup = null
    activeLifelogInput = null
    return
  }

  // 从桌面端按钮配置中查找第一个开启了全局快捷键的 life-log 按钮
  const desktopConfigs: ButtonConfig[] = pluginInstance?.desktopButtonConfigs || []
  const lifelogConfig = desktopConfigs.find(
    (btn: ButtonConfig) => btn.authorToolSubtype === 'life-log' && btn.lifelogGlobalCaptureEnabled
  )
  if (!lifelogConfig) {
    // 检查是否存在 life-log 按钮但未开启快捷键
    const hasLifeLogButton = desktopConfigs.some((btn: ButtonConfig) => btn.authorToolSubtype === 'life-log')
    if (hasLifeLogButton) {
      Notify.showErrorCommandCannotExecute(t(
        'toolbarManager.lifeLogEnableGlobalShortcut',
        undefined,
        '请在叶归LifeLog按钮设置中开启「全局快捷键」开关'
      ))
    }
    return
  }

  const categories = lifelogConfig?.lifeLogCategories?.length
    ? lifelogConfig.lifeLogCategories
    : ['学习', '工作', '生活']
  const notebookId = lifelogConfig?.lifeLogNotebookId || ''

  try {
    const result = await showLifelogDialog(categories, {
      fontSize: lifelogConfig.lifeLogCatFontSize,
      padding: lifelogConfig.lifeLogCatPadding,
      hPadding: lifelogConfig.lifeLogCatHPadding,
      inputFontSize: lifelogConfig.lifeLogInputFontSize
    })
    if (!result) return

    const { category, content: inputContent } = result
    const now = new Date()
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const formattedContent = `${hours}:${minutes} ${category}：${inputContent}\n`

    if (!notebookId) {
      Notify.showErrorCommandCannotExecute(t(
        'toolbarManager.lifeLogConfigureNotebook',
        undefined,
        '请先在叶归LifeLog按钮中配置笔记本ID'
      ))
      return
    }

    try {
      const response = await fetchSyncPost('/api/block/appendDailyNoteBlock', {
        data: formattedContent,
        dataType: 'markdown',
        notebook: notebookId,
      })
      if (response.code === 0) {
        Notify.showInfoCopySuccess()
      } else {
        await appendToDailyNoteAlternative(notebookId, formattedContent, true)
      }
    } catch {
      await appendToDailyNoteAlternative(notebookId, formattedContent, true)
    }
  } catch (error) {
    logger.warn('[叶归LifeLog全局] 执行失败:', error)
    Notify.showErrorCommandCannotExecute(t('toolbarManager.lifeLog', undefined, '叶归LifeLog'))
  }
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
    title.textContent = t('toolbarManager.14', undefined, '请选择分类')
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
    cancelButton.textContent = t('toolbarManager.15', undefined, '取消')
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
    cancelButton.textContent = t('toolbarManager.16', undefined, '取消');
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
    confirmButton.textContent = t('toolbarManager.17', undefined, '确认');
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
        logger.warn('[叶归LifeLog适配] 替代方案追加失败:', appendResponse.msg);
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
          logger.warn('[叶归LifeLog适配] 创建后追加失败:', appendResponse.msg);
          // 如果追加失败，回退到插入到当前编辑器
          await insertContentToEditor(content);
        }
      } else {
        logger.warn('[叶归LifeLog适配] 创建每日笔记失败:', createResponse.msg);
        // 如果创建失败，回退到插入到当前编辑器
        await insertContentToEditor(content);
      }
    }
  } catch (error) {
    logger.warn('[叶归LifeLog适配] 替代方案执行失败:', error);
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
  logger.warn('未找到编辑器，无法插入内容')
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
      logger.warn('使用execCommand插入失败:', e)
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
        logger.warn('DOM插入方法也失败:', domError);
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
    return t(
      'toolbarManager.databasePopup.nextDayTimeRange',
      { startTime, endTime },
      `⏳${startTime} - ${endTime}（次日）`
    )
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
    logger.error('数据库悬浮弹窗失败:', error)
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
  dbName: string = t('toolbarManager.databasePopup.defaultTitle', undefined, '查询结果')
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
  const noteHtml = `<div style="margin-top: 14px; font-size: 11px; color: #8E8E93; text-align: center;">${t('toolbarManager.databasePopup.bottomHint', undefined, '双击关闭 | 点击紫色文字可跳转')}</div>`

  // 创建 Dialog，使用数据库名称作为标题
  const dialog = new Dialog({
    title: dbName || t('toolbarManager.databasePopup.defaultTitle', undefined, '查询结果'),
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
        logger.warn('[数据库弹窗] 获取块信息失败:', response)
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
      logger.warn('[数据库弹窗] 打开块失败:', err)
    }
  })
}

/**
 * 复位清理标志（重初始化 cleanup() 之后调用）。
 * cleanup() 在 onunload 与重初始化时都会将 isCleanedUp 置 true；
 * 若重初始化后不复位，initCustomButtons 的 rAF/timeout 回调全部被跳过，
 * 工具栏按钮永远无法创建，只能等事件驱动（如点文档触发 loaded-protyle-dynamic）才出现。
 */
export function resetCleanupState(): void {
  isCleanedUp = false
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

  // 清理电脑端悬浮胶囊工具栏（observer + 样式 + data-input-method 属性 + body class）
  cleanupDesktopFloatingToolbar()

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

  // 清理旧的 per-element 监听器
  detachFocusEventHandlers()

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

  // 清理模态确认框 keydown 监听器（防止插件卸载时模态未关导致 listener 泄漏）
  if ((window as any).__showConfirmKeydownHandler) {
    window.removeEventListener('keydown', (window as any).__showConfirmKeydownHandler, true)
    delete (window as any).__showConfirmKeydownHandler
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

  // 关闭所有打开的桌面端溢出工具栏（先移除 document 监听，再删 DOM）
  document.querySelectorAll('.desktop-overflow-toolbar-layer').forEach(layer => {
    const breadcrumbBar = (layer as HTMLElement).closest('.protyle-breadcrumb__bar, .protyle-breadcrumb:not(.protyle-breadcrumb__bar)') as HTMLElement
    if (breadcrumbBar) {
      const overflowBtn = breadcrumbBar.querySelector('.overflow-active') as HTMLElement
      if (overflowBtn) {
        closeDesktopOverflowToolbar(breadcrumbBar, overflowBtn)
      }
    }
  })

  // 清理扩展工具栏弹出层 DOM
  document.querySelectorAll('.overflow-toolbar-layer, .desktop-overflow-toolbar-layer').forEach(el => el.remove())
  document.documentElement.style.removeProperty('--mobile-toolbar-offset')

  // 清理工具栏滚动隐藏监听和 class
  unbindToolbarAutoHideScroll()
  unbindMobileScrollAutoHide()
  // 清理思源原生移动栏状态同步
  unbindNativeBarsSync()
  // 清理侧栏/更多面板状态同步
  unbindSidePanelsSync()
  // 清理扩展栏状态同步
  unbindOverflowPanelSync()

  toolbarHiddenByScroll = false
  toolbarAutoHideCapsuleMode = false
  if (toolbarAutoHidePendingTimer) {
    clearTimeout(toolbarAutoHidePendingTimer)
    toolbarAutoHidePendingTimer = null
  }
  document.querySelectorAll('.protyle-breadcrumb.toolbar-scroll-hidden, .protyle-breadcrumb__bar.toolbar-scroll-hidden').forEach(el => { (el as HTMLElement).classList.remove('toolbar-scroll-hidden'); (el as HTMLElement).style.transform = 'translateZ(0) translateY(0)' })
  document.body.classList.remove('toolbar-autohide-active')
  document.body.classList.remove('kmind-zen-active')
  document.body.classList.remove('toolbar-locked')

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
    'popup-select-scrollbar-style',
    'toolbar-autohide-style',
    'kmind-zen-compat-style',
    'native-toolbar-lock-style'
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
  cleanupDesktopTTS()

  // 重置模块级变量
  currentButtonConfigs = []
  isCleanedUp = true
  isSettingUpToolbar = false
  // 注意：不要在这里设置 pluginInstance = null
  // cleanup() 在重初始化时也会被调用（initPluginFunctions → cleanup → initCustomButtons）
  // 如果设为 null，后续异步代码读取 pluginInstance 会拿到 null，导致：
  //   - pluginInstance?.isMobile 为 undefined（平台判断错误）
  //   - pluginInstance?.desktopButtonConfigs 为 []（扩展工具栏无按钮）
  // pluginInstance 只应在 onunload 时清除
  // 清理 Lifelog 弹窗引用（插件卸载时弹窗若还开着，清理其闭包引用）
  if (activeLifelogCleanup) {
    activeLifelogCleanup()
    activeLifelogCleanup = null
  }
  activeLifelogInput = null
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
    logger.error('复制失败:', err)
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
      // 派发到 body（元素目标）。不要派发到 window：思源处理快捷键时会对事件目标
      // 调用 closest()，window 不是元素会抛 TypeError；body 上的事件会冒泡到 window 监听器，
      // 且 body 上触发一次即可同时覆盖冒泡路径，无需重复派发。
      const eventDown = new KeyboardEvent('keydown', keyEvent)
      const eventUp = new KeyboardEvent('keyup', keyEvent)

      dispatchKeyWithLog(document.body, eventDown, 'executeSiyuanCommand：派发 keydown', { command: hotkeyToTrigger })
      dispatchKeyWithLog(document.body, eventUp, 'executeSiyuanCommand：派发 keyup', { command: hotkeyToTrigger })

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
// ─── 快捷键按钮连续点击诊断 ────────────────────────────────
// 连续快速点击同一个快捷键按钮会产生并发执行（此流程没有防抖），
// 且部分分支用 setTimeout 延迟执行，因此需要日志确认：
// 是否有重叠执行、延迟回调真正触发时保存的选区是否还有效。
let shortcutExecSeq = 0
let shortcutExecInFlight = 0

function describeSavedSelection(range: Range | null): Record<string, unknown> {
  if (!range) return { hasSelection: false }
  try {
    const container = range.commonAncestorContainer
    const el = container.nodeType === Node.ELEMENT_NODE ? container as HTMLElement : container.parentElement
    return {
      hasSelection: true,
      collapsed: range.collapsed,
      offsets: `${range.startOffset}-${range.endOffset}`,
      stillConnected: el?.isConnected ?? false,
      blockId: el?.closest('[data-node-id]')?.getAttribute('data-node-id') ?? '',
    }
  } catch (error) {
    return { hasSelection: true, selectionError: error instanceof Error ? error.message : String(error) }
  }
}

/** 派发键盘事件并记录目标。任何情况下都禁止派发到 window（思源会对目标调 closest）。 */
function dispatchKeyWithLog(
  target: EventTarget,
  event: KeyboardEvent,
  stage: string,
  context: Record<string, unknown> = {},
): void {
  const targetName = target === window
    ? 'WINDOW(禁止!)'
    : target === document.body
      ? 'BODY'
      : target === document.documentElement
        ? 'HTML'
        : (target as Element)?.tagName ?? String(target)
  logger.log(`[Shortcut] ${stage}`, { ...context, target: targetName })
  target.dispatchEvent(event)
}

function executeShortcut(config: ButtonConfig, savedSelection: Range | null = null, lastActiveElement: HTMLElement | null = null) {
  if (!config.shortcutKey) {
    Notify.showErrorShortcutNotConfigured(getButtonDisplayName(config))
    return
  }

  const execSeq = ++shortcutExecSeq
  shortcutExecInFlight++
  const execStartedAt = Date.now()
  logger.log('[Shortcut] 开始执行', {
    seq: execSeq,
    inFlight: shortcutExecInFlight,
    button: getButtonDisplayName(config),
    buttonId: config.id,
    shortcutKey: config.shortcutKey,
    lastActiveElementIsEditable: !!lastActiveElement?.matches?.('[contenteditable="true"]'),
    ...describeSavedSelection(savedSelection),
  })

  try {
    // 转换为思源的快捷键格式
    const siyuanHotkey = convertToSiyuanHotkey(config.shortcutKey)

    // ⌘/ 是思源硬编码的块菜单快捷键，不走 keymap 也不走键盘事件模拟，直接调用内部函数
    if (siyuanHotkey === '⌘/') {
      logger.log('[Shortcut] 命中：块菜单（⌘/）', { seq: execSeq })
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
        logger.warn('⌘/ 块菜单执行失败:', e)
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
            const deferredAt = Date.now()
            logger.log('[Shortcut] 命中：插件命令，已聚焦编辑器，50ms 后恢复选区并执行', {
              seq: execSeq,
              inFlight: shortcutExecInFlight,
              command: cmd.name || cmd.customHotkey,
            })
            setTimeout(() => {
              // 连续点击时这里可能同时有多次回调在跑，且共同引用同一个保存的选区
              logger.log('[Shortcut] 延迟回调触发', {
                seq: execSeq,
                delayMs: Date.now() - deferredAt,
                inFlight: shortcutExecInFlight,
                command: cmd.name || cmd.customHotkey,
                ...describeSavedSelection(savedSelection),
              })
              restoreSelection(savedSelection)
              try {
                const protyle = getActiveProtyle()
                if (protyle) {
                  cmd.editorCallback(protyle)
                } else if (cmd.callback) {
                  cmd.callback()
                }
                logger.log('[Shortcut] 延迟回调执行完毕', { seq: execSeq, command: cmd.name || cmd.customHotkey })
              } catch (e) {
                logger.warn('插件命令 editorCallback 执行失败:', e)
              }
            }, 50)
            return
          }
        }

        // 非 editorCallback 或无保存选区，直接调用
        logger.log('[Shortcut] 命中：插件命令，直接调用回调', {
          seq: execSeq,
          command: cmd.name || cmd.customHotkey,
          hasEditorCallback,
          hasSavedSelection: !!savedSelection,
        })
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
          logger.warn('插件命令回调执行失败:', e)
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
        logger.log('[Shortcut] 命中：keymap 命令，模拟键盘事件', {
          seq: execSeq,
          command,
          isEditorCommand,
          hotkeyToTrigger,
          parsed: !!keyEvent,
          activeElement: document.activeElement?.className || document.activeElement?.tagName || '',
        })
        if (keyEvent) {
          // 移动端特殊处理：复制类命令直接使用 protyle 方法
          const isMobile = isMobileDevice()
          const copyCommands = ['copyBlockRef', 'copyBlockEmbed', 'copyText', 'copyHPath', 'copyProtocol', 'copyID', 'copyPlainText']
          logger.log('[Shortcut] 分支判定', {
            seq: execSeq,
            command,
            isMobile,
            isEditorCommand,
            hasSavedSelection: !!savedSelection,
            isCopyCommand: copyCommands.includes(command),
          })

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
                logger.error('protyle 方法执行失败:', e)
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
            let editAreaSource = ''
            if (lastActiveElement?.matches('[contenteditable="true"]')) {
              editArea = lastActiveElement
              editAreaSource = 'lastActiveElement'
            } else {
              const protyleElement = getActiveProtyleElement()
              editArea = protyleElement?.querySelector('[contenteditable="true"]') as HTMLElement
              editAreaSource = protyleElement ? 'activeProtyle' : 'protyle未找到'
            }
            logger.log('[Shortcut] 编辑器命令分支', {
              seq: execSeq,
              command,
              editAreaFound: !!editArea,
              editAreaSource,
            })

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
                  dispatchKeyWithLog(editArea, eventDown, '编辑器分支：派发 keydown（50ms 延迟后）', {
                    seq: execSeq,
                    command,
                    selectionRestored: true,
                  })
                } catch (e) {
                  // 部分思源快捷键（如 Ctrl+/ 块菜单）依赖内部选区状态，无法通过模拟键盘事件触发
                  logger.warn('快捷键模拟执行失败:', config.shortcutKey, e)
                }
              }, 50)
              return
            }
          }

          // 通用命令：派发到 body（元素目标）而不是 window。
          // 思源的快捷键处理函数会对事件目标调用 closest()，window 不是元素会抛
          // "closest is not a function"；body 上的事件仍会冒泡到 window 监听器。
          const eventDown = new KeyboardEvent('keydown', keyEvent)
          dispatchKeyWithLog(document.body || document.documentElement, eventDown, '通用命令分支：派发 keydown', {
            seq: execSeq,
            command,
            reason: !isEditorCommand ? '非编辑器命令' : (savedSelection ? '编辑器内未找到可编辑区域' : '无已保存选区'),
          })

          return
        }
      }

      Notify.showErrorCommandCannotExecute(command)
    } else {
      // 未在 keymap 中找到命令，直接触发用户输入的快捷键
      logger.log('[Shortcut] 命中：keymap 中无此命令，直接派发原始快捷键', {
        seq: execSeq,
        shortcutKey: config.shortcutKey,
        siyuanHotkey,
      })
      const keyEvent = parseHotkeyToKeyEvent(siyuanHotkey)
      if (keyEvent) {
        try {
          // 尽量向”当前编辑器可编辑区域”派发（很多快捷键只在编辑器焦点内生效）
          const protyleElement = getActiveProtyleElement()
          const editArea =
            (lastActiveElement?.matches?.('[contenteditable="true"]') ? lastActiveElement : null) ||
            (protyleElement?.querySelector?.('[contenteditable="true"]') as HTMLElement | null) ||
            (document.activeElement?.matches?.('[contenteditable="true"]') ? (document.activeElement as HTMLElement) : null)

          const eventDown = new KeyboardEvent('keydown', keyEvent)
          const eventUp = new KeyboardEvent('keyup', keyEvent)

          if (editArea) {
            editArea.focus?.()
            dispatchKeyWithLog(editArea, eventDown, '原始快捷键分支：派发 keydown 到编辑器', { seq: execSeq })
            dispatchKeyWithLog(editArea, eventUp, '原始快捷键分支：派发 keyup 到编辑器', { seq: execSeq })
          } else {
            // 不能派发到 window：思源处理快捷键时会对事件目标调用 closest()，
            // window 不是元素会抛 "closest is not a function"。用 body 保证目标是元素。
            dispatchKeyWithLog(document.body || document.documentElement, eventDown, '原始快捷键分支：未找到编辑器，派发 keydown 到 body', { seq: execSeq })
            dispatchKeyWithLog(document.body || document.documentElement, eventUp, '原始快捷键分支：未找到编辑器，派发 keyup 到 body', { seq: execSeq })
          }
        } catch (e) {
          // 思源内部处理此快捷键时出错（可能不是有效快捷键）
          logger.warn('思源处理此快捷键时出错:', e)
          Notify.showWarningShortcutMaybeInvalid(config.shortcutKey)
        }
      } else {
        Notify.showErrorShortcutCannotParse(config.shortcutKey)
      }
    }

  } catch (error) {
    logger.error('执行快捷键失败:', error)
    Notify.showErrorShortcutFailed(config.shortcutKey, error)
  } finally {
    // 注意：走 setTimeout 延迟执行的分支会先返回，这里记录的是「派发」耗时，
    // 真正执行命令的耗时见「延迟回调触发」那条日志。
    shortcutExecInFlight--
    logger.log('[Shortcut] 执行结束', {
      seq: execSeq,
      inFlight: shortcutExecInFlight,
      elapsedMs: Date.now() - execStartedAt,
    })
  }
}

// 导入 windowDetector 中的函数
import {
  showSmallWindowTip as showSmallWindowTipFromDetector,
  triggerDesktopQuickNoteCapture,
  triggerLifelogQuickNote,
} from './windowDetector';

// 一键记事执行函数
async function executeQuickNote(_config: ButtonConfig) {
  let originalPluginInstance: unknown;
  let tempPlugin: unknown;
  try {
    originalPluginInstance = (window as any).__pluginInstance;
    tempPlugin = {
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
    logger.error('一键记事执行失败:', error);
    const message = t('toolbarManager.quickNote.executionFailed', { buttonName: getButtonDisplayName(_config) }, '按钮 "{buttonName}" 的一键记事功能执行失败');
    showMessage(message, 3000, 'error');
  } finally {
    // 恢复原始的 __pluginInstance（非桌面 return 分支也要恢复）
    if ((window as any).__pluginInstance === tempPlugin) {
      (window as any).__pluginInstance = originalPluginInstance;
    } else if ((window as any).__pluginInstance?.mobileFeatureConfig) {
      // 兼容：如果已被其他代码修改，至少清理触发标记
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
    showMessage(t('toolbarManager.popupSelect.templatesMissing', { buttonName: getButtonDisplayName(config) }, '按钮 "{buttonName}" 未配置模板列表'), 3000, 'error')
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
          if (processedContent.includes('\n')) {
            // 多行模板（{{newline}}）：逐行插入 + 合成 Enter 走思源官方换行链路
            const wysiwyg = activeEditor.querySelector('.protyle-wysiwyg')
            if (wysiwyg) {
              void insertMultiLineText(wysiwyg as HTMLElement, processedContent)
            } else {
              document.execCommand('insertText', false, processedContent)
              contentEditable.dispatchEvent(inputEvent)
            }
          } else {
            document.execCommand('insertText', false, processedContent)
            contentEditable.dispatchEvent(inputEvent)
          }
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
    title.textContent = t('toolbarManager.18', undefined, '请选择模板')
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
    cancelButton.textContent = t('toolbarManager.19', undefined, '取消')
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