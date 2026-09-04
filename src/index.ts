/**
 * ===== index.ts - 插件主入口文件 =====
 * 
 * 功能：
 * 1. 移动端工具栏位置调整
 * 2. 自定义按钮功能
 */

import {
  Plugin,
  getFrontend,
  Setting,
  showMessage,
  fetchSyncPost,
} from "siyuan";
import "@/index.scss";
import PluginInfoString from '@/../plugin.json'
import { destroy, init } from '@/main'
import { logger, setLoggingEnabled } from '@/utils/logger'
import { clearI18n, initializeI18n, t } from '@/i18n/runtime'

// 导入新功能模块
import {
  initMobileToolbarAdjuster,
  initCustomButtons,
  cleanup,
  resetCleanupState,
  createButtonsForEditors,
  DEFAULT_BUTTONS_CONFIG,
  DEFAULT_DESKTOP_BUTTONS,
  DEFAULT_MOBILE_BUTTONS,
  DEFAULT_MOBILE_CONFIG,
  MobileToolbarConfig,
  ButtonConfig,
  GlobalButtonConfig,
  DEFAULT_DESKTOP_GLOBAL_BUTTON_CONFIG,
  DEFAULT_MOBILE_GLOBAL_BUTTON_CONFIG,
  isMobileDevice,
  calculateButtonOverflow,
  setPluginInstance,
  setGlobalToolbarManager,
  applyDesktopFloatingToolbar,
  applyToolbarBackgroundColor,
  insertTemplate,
  showTemplateContextMenu,
  refreshToolbarAutoHide,
  refreshKmindZenCompat,
  refreshToggleLockIcons,
  refreshDesktopFloatingScrollOnSwitch,
  triggerDesktopLifelogGlobalCapture,
  triggerDesktopLifelogGlobalCaptureSmart,
  markDesktopBreadcrumbForFloating,
  safeSetInterval,
  clearSafeInterval,
  restoreMobileToolbarOriginal,
  getButtonDisplayName
} from './toolbarManager'

// TTS 设置持久化初始化
import { initTTSSettings } from './tts/httpTtsEngine'

// 清理残留草稿块
import { deleteQuickNoteDraftBlock } from './quickNote/kernelBlock'

import {
  initSmallWindowDetector,
  clearSmallWindowDetector,
  triggerDesktopQuickNoteGlobalCapture,
  saveQuickNotePlainTextFromFloat,
  getQuickNoteFloatTitle,
  getQuickNoteFloatPlaceholder,
} from './windowDetector'
import {
  initQuickNoteFloatWindow,
  destroyQuickNoteFloatWindow,
  handleQuickNoteFloatCommand,
  isQuickNoteFloatSaveFromButton,
} from './quickNote/quickNoteFloatWindow'
import { destroyDesktopQuickNoteBlockWindow, cleanupOrphanBlockWindows, cleanupBlockWindowResidue } from './quickNote/quickNoteBlockWindow'
import { cleanupImagePicker } from './quickNote/imageInsert'

// 导入 StressThreshold 清理函数
import {
  cleanupStressThreshold
} from './stressThreshold'

// 导入授权管理（试用期/月卡/永久统一判定）
import * as licenseManager from './utils/licenseManager'
import type { LicenseStatus } from './utils/licenseManager'

// 导入 UI 组件
import { showConfirmDialog as showConfirmDialogModal } from './ui/dialog'
import { showButtonSelector, type ButtonInfo } from './ui/buttonSelector'
import { showIconPicker as showIconPickerModal } from './ui/iconPicker'
import { showClickSequenceSelector } from './ui/clickSequenceSelector'
import { updateIconDisplay as updateIconDisplayUtil } from './data/icons'
// 导入标签切换器
import { injectTabSwitcher as injectTabSwitcherUtil, cleanupTabSwitcher } from './ui/tabs'
// 导入手机端标签页Tab模块
import { init as initMobileTabs, cleanup as cleanupMobileTabs, reloadState as reloadMobileTabsState, updateMaxVisibleTabs } from './ui/mobileTabs'
	import { init as initDesktopTabs, cleanup as cleanupDesktopTabs } from './ui/desktopTabs'
// 导入手机端悬浮大纲模块
import { init as initMobileOutline, cleanup as cleanupMobileOutline, reloadState as reloadMobileOutlineState } from './ui/mobileOutline'
	import { init as initDesktopOutline, cleanup as cleanupDesktopOutline } from './ui/desktopOutline'
import { init as initMobileDocNav, cleanup as cleanupMobileDocNav, reloadState as reloadMobileDocNavState } from './ui/mobileDocNav'
	import { init as initDesktopDocNav, cleanup as cleanupDesktopDocNav } from './ui/desktopDocNav'
import {
  syncMobileTopLineBreakButton,
  destroyMobileTopLineBreakButton
} from './ui/mobileTopLineBreak'
// 导入字段创建工具
import {
  updateIconDisplay,
  createDesktopField,
  createDesktopIconField,
  createDesktopSelectField,
  createLineNumberedTextarea
} from './ui/fields'
// 导入按钮项模块
import { createDesktopButtonItem, populateDesktopEditForm, type DesktopButtonContext } from './ui/buttonItems/desktop'
import { createMobileButtonItem, type MobileButtonContext } from './ui/buttonItems/mobile'
// 导入设置模块
import {
  createDesktopGlobalButtonConfig,
  createDesktopFeatureConfig,
  createDesktopSettingLayout,
  type DesktopSettingsContext,
  type FeatureConfig
} from './settings/desktop'
import {
  createBottomToolbarConfigItem,
  createMobileSettingLayout,
  type MobileSettingsContext
} from './settings/mobile'

// 读取插件配置
let PluginInfo = {
  version: '',
}
try {
  PluginInfo = PluginInfoString
} catch (err) {
  // Plugin info parse error
}
const { version } = PluginInfo


export default class ToolbarCustomizer extends Plugin {
  // 环境检测属性
  public isMobile: boolean
  public isBrowser: boolean
  public isLocal: boolean
  public isElectron: boolean
  public isInWindow: boolean
  public platform: string
  public readonly version = version

  // 插件配置
  private mobileConfig: MobileToolbarConfig = DEFAULT_MOBILE_CONFIG
  private desktopButtonConfigs: ButtonConfig[] = []  // 电脑端按钮配置
  private mobileButtonConfigs: ButtonConfig[] = []   // 手机端按钮配置
  private loggingEnabled = false
  private currentEditingButton: ButtonConfig | null = null

  // 全局按钮配置（批量设置所有按钮的默认值）
  private desktopGlobalButtonConfig: GlobalButtonConfig = { ...DEFAULT_DESKTOP_GLOBAL_BUTTON_CONFIG }
  private mobileGlobalButtonConfig: GlobalButtonConfig = { ...DEFAULT_MOBILE_GLOBAL_BUTTON_CONFIG }

  // EventBus 事件回调引用（用于清理）
  private eventBusRefreshHandler: (() => void) | null = null
  private eventBusContextMenuHandler: ((event: any) => void) | null = null
  private quickNoteTextareaContextMenuHandler: ((e: MouseEvent) => void) | null = null
  private _quickNoteTextareaDomLogged = false

  // 手机端工具栏自愈：protyle 事件 handler（onload 即注册，早于任何 protyle 事件）
  private eventBusReinitHandler: (() => void) | null = null
  // ws-main 心跳 handler（onload 即注册，作为长期兜底）
  private eventBusWsHeartbeatHandler: (() => void) | null = null

  // 待保存的欢迎标记（延迟到用户保存设置时写入）

  // 动态获取当前平台的按钮配置
  get buttonConfigs(): ButtonConfig[] {
    return this.isMobile ? this.mobileButtonConfigs : this.desktopButtonConfigs
  }

  // 动态设置当前平台的按钮配置  
  set buttonConfigs(configs: ButtonConfig[]) {
    if (this.isMobile) {
      this.mobileButtonConfigs = configs
    } else {
      this.desktopButtonConfigs = configs
    }
  }

  // 电脑端小功能配置
  private desktopFeatureConfig = {
    hideBreadcrumbIcon: true,   // 面包屑图标隐藏
    hideReadonlyButton: true,   // 锁定编辑按钮隐藏
    hideDocMenuButton: true,    // 文档菜单按钮隐藏
    hideMoreButton: true,       // 更多按钮隐藏
    toolbarHeight: 32,          // 工具栏高度（px）
    toolbarStyle: 'default' as 'default' | 'divider',  // 工具栏样式：默认或带分割线
    disableCustomButtons: false,// 禁用所有自定义按钮（恢复思源原始状态，仅桌面端）
    showAllNotifications: true, // 一键开启所有按钮右上角提示
    authorActivated: false,     // 鲸鱼定制工具箱是否已激活（兼容字段，新逻辑读 licensePlan）
    authorCode: '',              // 鲸鱼定制工具箱激活码（原始码，含签名）
    authorAccount: '',           // 绑定的思源账号
    // ===== 新版授权字段（v3.8+，支持 TRIAL/M30/PERM 多套餐）=====
    licensePlan: 'none' as 'none' | 'trial' | 'm30' | 'perm',  // 当前授权套餐
    licenseExpiry: '',           // 到期日 YYYYMMDD 或 'PERM'（不含宽限期）
    licenseGraceEnd: '',         // 宽限期结束日 YYYYMMDD（PERM 时为空）
    quickNoteGlobalCaptureEnabled: true,  // 电脑端：全局快捷键唤起一键记事
    quickNoteToolbarVisible: true, // 电脑端：记事弹窗开关工具栏
    quickNoteInputFormat: 'plain' as 'plain' | 'block', // 电脑端：一键记事输入格式（独立于手机端）
    quickNoteBlockWindowPersist: false, // 块格式弹窗后台常驻：默认关闭
    quickNoteBlockAutoCleanup: 5,  // 块格式弹窗隐藏后 X 秒自动清理草稿块（0=不自动清理）
    quickNoteHideFloatingToolbar: true, // 块格式弹窗中隐藏底部悬浮胶囊：默认开启
    // ===== 工具栏位置选择（原生顶部 / 悬浮胶囊）=====
    enableFloatingToolbar: true,   // 是否启用底部悬浮胶囊工具栏（true=悬浮胶囊，false=思源原生顶部）
    floatingToolbarMargin: 40,      // 胶囊距底部距离（px）
    floatingToolbarBorderRadius: 20,// 胶囊圆角（px）
    floatingToolbarHeight: 40,      // 胶囊自身高度（px）
    floatingToolbarWidth: 0,        // 胶囊宽度（0=auto 自适应内容，>0=固定宽度）
    floatingToolbarStyle: 'glass' as 'glass' | 'solid',  // 胶囊样式：glass=毛玻璃 / solid=实心
    floatingToolbarScrollHide: true,  // 胶囊滚动隐藏：上滑隐藏、下滑显示
  }

  // 手机端小功能配置
  private mobileFeatureConfig = {
    hideBreadcrumbIcon: true,   // 面包屑按钮隐藏（默认隐藏，需用时在①开关关闭即可显示）
    hideReadonlyButton: true,   // 锁定编辑按钮隐藏
    hideDocMenuButton: true,    // 文档菜单按钮隐藏
    hideMoreButton: true,       // 更多按钮隐藏
    toolbarStyle: 'divider' as 'default' | 'divider',  // 工具栏样式：默认或带分割线（手机端默认分割线）
    glassEffect: true,  // 毛玻璃背景（半透明+背景模糊，独立于分割线样式，可叠加；默认开）
    disableCustomButtons: false,// 禁用所有自定义按钮
    showMobileLineBreakButton: false, // 顶部工具栏云同步左侧显示 H 换行按钮
    hideStatusBar: true,         // 手机端隐藏底部状态条 #status
    keepTopBarVisible: false,    // 不隐藏顶栏标题（滚动沉浸时标题栏保持显示，默认关）
    showAllNotifications: true, // 一键开启所有按钮右上角提示
    authorActivated: false,     // 鲸鱼定制工具箱是否已激活（兼容字段，新逻辑读 licensePlan）
    authorCode: '',             // 鲸鱼定制工具箱激活码（原始码，含签名）
    authorAccount: '',           // 绑定的思源账号
    // ===== 新版授权字段（v3.8+，支持 TRIAL/M30/PERM 多套餐）=====
    licensePlan: 'none' as 'none' | 'trial' | 'm30' | 'perm',  // 当前授权套餐
    licenseExpiry: '',           // 到期日 YYYYMMDD 或 'PERM'（不含宽限期）
    licenseGraceEnd: '',         // 宽限期结束日 YYYYMMDD（PERM 时为空）
    popupConfig: 'bothModes' as const, // 弹窗配置：'disabled'|'smallWindowOnly'|'bothModes'
    quickNoteNotebookId: '',     // 自启动一键记事默认笔记本ID
    quickNoteFontSize: 14,       // 弹窗输入框字体大小（px）
    quickNoteSortMethod: 'bottomToolbar' as const, // 弹窗按钮排序方法：'topToolbar'|'bottomToolbar'
    quickNoteButtonHeight: 32,    // 弹窗按钮高度（px）
    quickNoteQuoteDocId: '',      // 金句占位文档 ID（留空关闭）
    quickNoteQuoteFontSize: 22,   // 金句占位字体大小（px）
    quickNoteQuoteMaxLines: 5,    // 金句占位最大显示行数
    quickNoteQuoteColorLight: '#B8860B', // 金句颜色（明亮模式）
    quickNoteQuoteColorDark: '#C9A84C',  // 金句颜色（暗黑模式）
    quickNoteAutoFocusButton: true,   // 按钮触发时自动弹出输入法
    quickNoteAutoFocusFirstPopup: true, // 自启动首次弹出时自动聚焦
    quickNoteAutoFocusRestore: true,  // 切后台再切回时自动恢复键盘
    quickNoteButtonIds: ['more-mobile', 'doc-mobile', 'plugin-settings-mobile', 'open-diary-mobile', 'template-time-mobile', 'search-mobile', 'recent-docs-mobile'],  // 弹窗按钮显示：默认排除「锁住文档」
  }

  // 检查作者功能是否已激活（含试用期/月卡/永久/宽限期，统一由 licenseManager 判定）
  private isAuthorToolActivated(): boolean {
    // licenseManager.isPaidFeatureUnlocked 内部会读取 pluginInstance（即 this）的配置
    // 综合判断：永久有效 / 月卡未过期 / 试用期内 / 月卡试用宽限期内
    return licenseManager.isPaidFeatureUnlocked()
  }

  /** 获取当前授权详细状态（供 UI 显示"试用中/月卡/永久/已过期"等动态文案） */
  private getLicenseStatus(): LicenseStatus {
    return licenseManager.getLicenseStatus()
  }

  /** 获取当前思源登录账号名 */
  private getCurrentUserName(): string {
    const u = (window as any).siyuan?.user
    return (u && typeof u.userName === 'string' && u.userName) || ''
  }

  // 安全清除激活状态（通过命令调用）
  private async clearActivationStatusSafely(): Promise<void> {
    this.desktopFeatureConfig.authorActivated = false
    this.desktopFeatureConfig.authorCode = ''
    this.desktopFeatureConfig.authorAccount = ''
    this.desktopFeatureConfig.licensePlan = 'none'
    this.desktopFeatureConfig.licenseExpiry = ''
    this.desktopFeatureConfig.licenseGraceEnd = ''
    this.mobileFeatureConfig.authorActivated = false
    this.mobileFeatureConfig.authorCode = ''
    this.mobileFeatureConfig.authorAccount = ''
    this.mobileFeatureConfig.licensePlan = 'none'
    this.mobileFeatureConfig.licenseExpiry = ''
    this.mobileFeatureConfig.licenseGraceEnd = ''
    await this.saveData('desktopFeatureConfig', this.desktopFeatureConfig)
    await this.saveData('mobileFeatureConfig', this.mobileFeatureConfig)
    // 同时清除 localStorage 试用标记
    licenseManager.clearTrial()
  }

  // 获取当前平台的功能配置（向后兼容）
  private get featureConfig() {
    return this.isMobile ? this.mobileFeatureConfig : this.desktopFeatureConfig
  }

  async onload() {
    initializeI18n(this.i18n, (window as any)?.siyuan?.config?.lang)
    // 设置插件实例（供 toolbarManager 和 windowDetector 中需要访问配置的 API 调用使用）
    setPluginInstance(this);
    
    // 设置全局工具栏管理器
    setGlobalToolbarManager();

    // ===== 环境检测 =====
    const frontEnd = getFrontend();
    this.platform = frontEnd

    this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile"
    this.isBrowser = frontEnd.includes('browser')
    this.isLocal = location.href.includes('127.0.0.1') || location.href.includes('localhost')
    this.isInWindow = location.href.includes('window.html')

    try {
      require("@electron/remote")?.require("@electron/remote/main")
      this.isElectron = true
    } catch (err) {
      this.isElectron = false
    }

    // ===== 手机端工具栏自愈：事件监听提前到 onload =====
    // 原先在 onLayoutReady→initPluginFunctions 才注册，鸿蒙杀后台恢复时 onLayoutReady
    // 深埋异步链（getLocalStorage→langs→getCloudUser→onboarding→...），任一环失败它就不触发，
    // 导致 handler 注册晚于 protyle 事件，工具栏永远建不上。
    // 这里在 onload（远早于任何 protyle 事件）就绑定，确保事件不丢。
    if (this.isMobile) {
      this.eventBusReinitHandler = () => {
        // 守卫：桌面端走 eventBusRefreshHandler 路径，不重复；禁用自定义按钮时跳过
        if (!this.isMobile) return
        if (this.mobileFeatureConfig.disableCustomButtons) return
        this.reinitMobileToolbarIfMissing()
      }
      this.eventBus.on('loaded-protyle-dynamic', this.eventBusReinitHandler)
      this.eventBus.on('loaded-protyle-static', this.eventBusReinitHandler)
      this.eventBus.on('switch-protyle', this.eventBusReinitHandler)

      // ws-main 心跳兜底：思源把每条 WebSocket 消息都转发给插件，是前端唯一确定持续到达的信号。
      // 即使三个 protyle 事件全错过，只要内核活着 WS 在推，工具栏迟早补齐。
      this.eventBusWsHeartbeatHandler = () => this.onWsHeartbeat()
      this.eventBus.on('ws-main', this.eventBusWsHeartbeatHandler)
    }

    // 日志配置独立加载；读取失败不能阻断按钮、工具栏等其他配置初始化
    try {
      const savedLoggingConfig = await this.loadData('loggingConfig')
      this.loggingEnabled = savedLoggingConfig?.enabled === true
      setLoggingEnabled(this.loggingEnabled)
    } catch (error) {
      logger.error('[日志设置] 加载失败:', error)
    }

    // ===== 加载配置 =====
    try {
      const savedMobileConfig = await this.loadData('mobileToolbarConfig')
      if (savedMobileConfig) {
        this.mobileConfig = {
          ...DEFAULT_MOBILE_CONFIG,
          ...savedMobileConfig
        }
        // 旧用户升级兼容：saved 中无 enableFloatingToolbar 字段说明是旧版配置，
        // 此时不应默认启用底部胶囊，以免覆盖用户原有的底部/顶部工具栏设置
        if (savedMobileConfig.enableFloatingToolbar === undefined) {
          this.mobileConfig.enableFloatingToolbar = false
        }
        // v3.8.6 兼容：默认位置由底部胶囊改为侧边胶囊。
        // 新默认只对"从未保存过任何位置字段"的用户生效（全新用户 saved 为空，整段跳过直接取 DEFAULT）。
        // 老用户只要保存过任意位置字段（top/bottom/floating，含旧版底部固定/顶部模式用户），
        // 就视为显式配置过位置：未开过侧边胶囊的一律保持关闭，
        // 避免 DEFAULT 的 enableSideFloatingToolbar: true 被 merge 进来与原有位置双开打架
        const hasAnyPositionSaved = savedMobileConfig.enableTopToolbar !== undefined
          || savedMobileConfig.enableBottomToolbar !== undefined
          || savedMobileConfig.enableFloatingToolbar !== undefined
        if (hasAnyPositionSaved && savedMobileConfig.enableSideFloatingToolbar === undefined) {
          this.mobileConfig.enableSideFloatingToolbar = false
        }
      }
      // 历史：长度类字段若存成无单位纯数字串（如 "45"），写入 CSS 会无效；统一补 px
      const mobileLenKeys: (keyof MobileToolbarConfig)[] = [
        'toolbarHeight',
        'closeInputOffset',
        'openInputOffset',
        'topToolbarOffset',
        'topToolbarPaddingLeft',
        'overflowToolbarDistanceBottom',
        'overflowToolbarDistanceTop',
        'overflowToolbarHeightBottom',
        'overflowToolbarHeightTop',
      ]
      const cfg = this.mobileConfig as Record<string, unknown>
      for (const key of mobileLenKeys) {
        const raw = cfg[key]
        const s = raw != null ? String(raw).trim() : ''
        if (s && /^\d+$/.test(s)) {
          cfg[key] = `${s}px`
        }
      }

      // 加载电脑端按钮配置
      const savedDesktopButtons = await this.loadData('desktopButtonConfigs')
      if (Array.isArray(savedDesktopButtons)) {
        // 配置存在且是数组，使用保存的配置
        this.desktopButtonConfigs = savedDesktopButtons.map((btn: any) => ({
          ...btn,
          minWidth: btn.minWidth !== undefined ? btn.minWidth : 32,
          showNotification: btn.showNotification !== undefined ? btn.showNotification : true,
          clickSequence: btn.clickSequence || [],
          diaryPosition: btn.diaryPosition || 'bottom'  // 确保日记位置属性被正确加载
        }))
        // 检查是否有桌面端扩展工具栏按钮，没有则添加
        const hasDesktopOverflow = this.desktopButtonConfigs.some(btn => btn.id === 'overflow-button-desktop')
        if (!hasDesktopOverflow) {
          this.desktopButtonConfigs.unshift({
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
          })
          // 重新分配排序值
          this.desktopButtonConfigs.forEach((btn, idx) => {
            btn.sort = idx
          })
        }
	      } else {
	        // 配置不存在或格式错误，使用默认配置（首次加载时不保存，等用户修改时再保存）
	        this.desktopButtonConfigs = DEFAULT_DESKTOP_BUTTONS.map(btn => ({...btn}))
	      }

      // 加载手机端按钮配置
      const savedMobileButtons = await this.loadData('mobileButtonConfigs')
      if (Array.isArray(savedMobileButtons)) {
        // 配置存在且是数组，使用保存的配置
        this.mobileButtonConfigs = savedMobileButtons.map((btn: any) => ({
          ...btn,
          minWidth: btn.minWidth !== undefined ? btn.minWidth : 32,
          showNotification: btn.showNotification !== undefined ? btn.showNotification : true,
          clickSequence: btn.clickSequence || []
        }))
        // 检查是否有扩展工具栏按钮，没有则添加
        const hasOverflowButton = this.mobileButtonConfigs.some(btn => btn.id === 'overflow-button-mobile')
        if (!hasOverflowButton) {
          this.mobileButtonConfigs.unshift({
            id: 'overflow-button-mobile',
            name: '扩展工具栏',
            nameKey: 'button.default.overflow',
            type: 'builtin',
            builtinId: 'overflow',
            icon: '⋯',
            iconSize: 20,
            minWidth: 20,
            marginRight: 15,
            sort: 0,
            platform: 'mobile',
            showNotification: true,
            layers: 2
          })
          // 重新分配排序值
          this.mobileButtonConfigs.forEach((btn, idx) => {
            btn.sort = idx
          })
        }
      } else {
        // 配置不存在或格式错误，使用默认配置（首次加载时不保存，等用户修改时再保存）
        this.mobileButtonConfigs = DEFAULT_MOBILE_BUTTONS.map(btn => ({...btn}))
      }

      // 加载电脑端小功能配置
      const savedDesktopFeatureConfig = await this.loadData('desktopFeatureConfig')
      if (savedDesktopFeatureConfig) {
        this.desktopFeatureConfig = {
          ...this.desktopFeatureConfig,
          ...savedDesktopFeatureConfig
        }
        // 老用户升级提示：已保存配置中缺少 enableFloatingToolbar 字段，说明是老用户首次升级到带悬浮胶囊的版本
        // 仅提示一次（通过 hasSeenDesktopFloatingNotice 标记控制）
        const isUpgradingOldUser = savedDesktopFeatureConfig.enableFloatingToolbar === undefined
            && !savedDesktopFeatureConfig.hasSeenDesktopFloatingNotice
        if (isUpgradingOldUser) {
          // 延迟到 DOM 就绪后显示（onload 阶段 DOM 可能还没渲染完）
          setTimeout(() => {
            showMessage(t('plugin.desktopFloatingToolbarNotice', undefined, '🆕 新增底部悬浮胶囊工具栏，可在「插件设置 → 电脑端全局工具栏配置」中调整位置和样式'), 8000, 'info')
          }, 2000)
          // 保存标记，避免重复提示
          this.desktopFeatureConfig.hasSeenDesktopFloatingNotice = true
          await this.saveData('desktopFeatureConfig', this.desktopFeatureConfig)
        }
      }

      // 向后兼容：如果电脑端没有独立的 quickNoteInputFormat，从手机端迁移一次
      if (!savedDesktopFeatureConfig?.quickNoteInputFormat && this.mobileFeatureConfig.quickNoteInputFormat) {
        this.desktopFeatureConfig.quickNoteInputFormat = this.mobileFeatureConfig.quickNoteInputFormat
        await this.saveData('desktopFeatureConfig', this.desktopFeatureConfig)
      }

      // 加载手机端小功能配置
      const savedMobileFeatureConfig = await this.loadData('mobileFeatureConfig')
      if (savedMobileFeatureConfig) {
        this.mobileFeatureConfig = {
          ...this.mobileFeatureConfig,
          ...savedMobileFeatureConfig
        }
      }

      // 加载电脑端全局按钮配置
      const savedDesktopGlobalButtonConfig = await this.loadData('desktopGlobalButtonConfig')
      if (savedDesktopGlobalButtonConfig) {
        this.desktopGlobalButtonConfig = {
          ...this.desktopGlobalButtonConfig,
          ...savedDesktopGlobalButtonConfig
        }
      }

      // 同步全局按钮配置到所有电脑端按钮（iconSize/minWidth/marginRight/showNotification）
      // 只有启用全局配置时才同步，否则保留各按钮的独立配置
      if (this.desktopGlobalButtonConfig.enabled ?? true) {
        this.desktopButtonConfigs.forEach(btn => {
          if (this.desktopGlobalButtonConfig.iconSize !== undefined) btn.iconSize = this.desktopGlobalButtonConfig.iconSize
          if (this.desktopGlobalButtonConfig.minWidth !== undefined) btn.minWidth = this.desktopGlobalButtonConfig.minWidth
          if (this.desktopGlobalButtonConfig.marginRight !== undefined) btn.marginRight = this.desktopGlobalButtonConfig.marginRight
          if (this.desktopGlobalButtonConfig.showNotification !== undefined) btn.showNotification = this.desktopGlobalButtonConfig.showNotification
        })
      }

      // 加载手机端全局按钮配置
      const savedMobileGlobalButtonConfig = await this.loadData('mobileGlobalButtonConfig')
      if (savedMobileGlobalButtonConfig) {
        this.mobileGlobalButtonConfig = {
          ...this.mobileGlobalButtonConfig,
          ...savedMobileGlobalButtonConfig
        }
      }

      // 同步全局按钮配置到所有手机端按钮（iconSize/minWidth/marginRight/showNotification）
      // 只有启用全局配置时才同步，否则保留各按钮的独立配置
      if (this.mobileGlobalButtonConfig.enabled ?? true) {
        this.mobileButtonConfigs.forEach(btn => {
          if (this.mobileGlobalButtonConfig.iconSize !== undefined) btn.iconSize = this.mobileGlobalButtonConfig.iconSize
          if (this.mobileGlobalButtonConfig.minWidth !== undefined) btn.minWidth = this.mobileGlobalButtonConfig.minWidth
          if (this.mobileGlobalButtonConfig.marginRight !== undefined) btn.marginRight = this.mobileGlobalButtonConfig.marginRight
          if (this.mobileGlobalButtonConfig.showNotification !== undefined) btn.showNotification = this.mobileGlobalButtonConfig.showNotification
        })
      }

      // 注意：已移除 showAllNotifications 的同步逻辑
      // 因为该功能已被 mobileGlobalButtonConfig.showNotification 取代

      // 向后兼容：尝试加载旧的 featureConfig 并迁移到对应平台
      const savedLegacyFeatureConfig = await this.loadData('featureConfig')
      if (savedLegacyFeatureConfig) {
        // 只迁移新配置中存在的属性
        const desktopProps = ['hideBreadcrumbIcon', 'hideReadonlyButton', 'hideDocMenuButton', 'hideMoreButton', 'toolbarHeight', 'disableCustomButtons', 'showAllNotifications']
        const mobileProps = ['hideBreadcrumbIcon', 'hideReadonlyButton', 'hideDocMenuButton', 'hideMoreButton', 'showAllNotifications']

        // 迁移到电脑端配置（只迁移电脑端支持的属性）
        desktopProps.forEach(prop => {
          if (savedLegacyFeatureConfig[prop] !== undefined) {
            (this.desktopFeatureConfig as any)[prop] = savedLegacyFeatureConfig[prop]
          }
        })

        // 迁移到手机端配置（只迁移手机端支持的属性）
        mobileProps.forEach(prop => {
          if (savedLegacyFeatureConfig[prop] !== undefined) {
            (this.mobileFeatureConfig as any)[prop] = savedLegacyFeatureConfig[prop]
          }
        })

        // 保存迁移后的配置
        await this.saveData('desktopFeatureConfig', this.desktopFeatureConfig)
        await this.saveData('mobileFeatureConfig', this.mobileFeatureConfig)

        // 删除旧配置
        await this.removeData('featureConfig')
      }

      // ===== 首次安装提示 =====
      const hasShownWelcome = await this.loadData('hasShownWelcome')

      // ===== 老用户授权迁移 =====
      // 旧版本只有 authorActivated + authorCode(WHALE-PERM-...) 字段；
      // 新版本（v3.8+）需补全 licensePlan/licenseExpiry/licenseGraceEnd 字段。
      // pluginInstance 已在 onload 开头通过 setPluginInstance(this) 注入，此处可直接调用。
      try {
        if (licenseManager.migrateLegacyPerm()) {
          await this.saveData('desktopFeatureConfig', this.desktopFeatureConfig)
          await this.saveData('mobileFeatureConfig', this.mobileFeatureConfig)
          logger.log('[License] 老用户授权字段已迁移为 perm')
        }
      } catch (migrateErr) {
        logger.warn('[License] 迁移老用户授权字段失败（不影响使用）:', migrateErr)
      }

      if (!hasShownWelcome) {
        // 新用户，显示欢迎提示
        setTimeout(() => {
          if (this.isMobile) {
            showMessage(t('plugin.welcomeMobile', undefined, '欢迎使用本插件！🎉\n\n已经默认添加按钮：\n①更多\n②打开菜单\n③锁住文档\n④插件设置\n⑤打开日记\n⑥插入时间\n⑦搜索\n⑧最近文档\n⑨鲸鱼快速批注'), 0, 'info')
          } else {
            showMessage(t('plugin.welcomeDesktop', undefined, '欢迎使用本插件🎉\n\n已经默认添加按钮：\n①更多\n②打开菜单\n③锁住文档\n④插件设置\n⑤打开日记\n⑥插入时间\n⑦打开伺服浏览器\n⑧最近文档\n⑨鲸鱼快速批注'), 0, 'info')
          }
          // 立即写入标记，不再依赖用户打开设置面板
          this.saveData('hasShownWelcome', true).catch(() => { /* ignore */ })
        }, 2000)
      }
    } catch (error) {
      logger.warn('加载配置失败，使用默认配置:', error)
    }

    // ===== 初始化 Vue 应用 =====
    init(this)
    
    // ===== 应用小功能 =====
    this.applyFeatures()

    // 电脑端：独立 Electron 悬浮窗 + 全局快捷键
    if (this.isElectron && !this.isMobile) {
      initQuickNoteFloatWindow({
        isElectron: () => this.isElectron,
        isMobile: () => this.isMobile,
        isDarkMode: () => document.documentElement.getAttribute('data-theme-mode')?.toLowerCase() === 'dark',
        getFloatTitle: () => getQuickNoteFloatTitle(isQuickNoteFloatSaveFromButton()),
        getPlaceholder: () => getQuickNoteFloatPlaceholder(isQuickNoteFloatSaveFromButton()),
        onSave: saveQuickNotePlainTextFromFloat,
      })
      ;(window as any).__quickNoteFloatCommand = (cmd: string, payload?: string) => {
        void handleQuickNoteFloatCommand(cmd, payload)
      }
    }

	    // 一键记事全局快捷键：只在主窗口注册。其回调（triggerDesktopQuickNoteCapture）
	    // 没有 document.hasFocus() 保护，若子窗口也注册，按下快捷键后思源向所有窗口
	    // 广播 siyuan-hotkey，每个窗口都会执行 → 多窗口重复弹窗。
	    if (!this.isMobile && !this.isInWindow) {
	      this.addCommand({
	        langKey: 'quickNoteGlobalCapture',
	        hotkey: '⌥⇧N',
	        globalCallback: () => {
	          void triggerDesktopQuickNoteGlobalCapture()
	        },
	      })
	    }
	    // 叶归LifeLog全局快捷键。
	    // 思源 v3.8.2+（commit 519b0e82e）起全局快捷键只分发给 workspace 主窗口，
	    // window.html 独立窗口收不到广播（详见 toolbarManager triggerDesktopLifelogGlobalCaptureSmart）。
	    // 这里仍只注册 globalCallback（主窗口注册 → OS 层 globalShortcut 保持"全局"语义），
	    // 回调内 Smart 转发：焦点在独立窗口时经 remote 把动作送进该窗口执行。
	    if (!this.isMobile) {
	      this.addCommand({
	        langKey: 'lifelogGlobalCapture',
	        hotkey: '⌥⇧L',
	        globalCallback: () => {
	          void triggerDesktopLifelogGlobalCaptureSmart()
	        },
	      })
	    }

	    // 手动清理一键记事弹窗残留（命令面板可触发）：解决"打开过弹窗后点日记/文档无反应"（残留窗口 hash 占用）
	    if (!this.isMobile && !this.isInWindow) {
      this.addCommand({
        langKey: 'cleanupQuickNoteWindows',
        hotkey: '',
        callback: async () => {
	          cleanupBlockWindowResidue()
	          destroyQuickNoteFloatWindow()
	          showMessage(t('cleanupQuickNoteWindowsDone', undefined, '一键记事弹窗残留已清理'), 3000, 'info')
	        },
	      })
	    }

	    // 独立窗口（window.html，一键记事块格式弹窗/文档独立窗口）内挂 LifeLog 执行钩子：
	    // 供主窗口 Smart 转发（executeJavaScript）调用。注意不能用窗口内 keydown 监听——
	    // ⌥⇧L 已被主窗口注册为 globalShortcut，OS 层拦截按键，keydown 到不了任何窗口。
	    if (!this.isMobile && this.isInWindow) {
	      ;(window as any).__tcLifelogTrigger = () => {
	        void triggerDesktopLifelogGlobalCapture()
	      }
	    }
		  }

  /** 插件启动时清理上次残留的草稿块（重启前未 cancelDraft 的情况） */
  private cleanupOrphanDraftBlocks(): void {
    const tryClean = (key: string) => {
      try {
        const raw = localStorage.getItem(key)
        if (raw) {
          const data = JSON.parse(raw)
          const blockId = data.draftBlockId || data.rootBlockId || null
          if (blockId) {
            localStorage.removeItem(key)
            deleteQuickNoteDraftBlock(blockId)
              .then(() => logger.log('[QuickNote] 清理残留草稿块:', blockId, 'from', key))
              .catch(() => {})
          }
        }
      } catch { /* ignore */ }
    }
    tryClean('__quickNoteDialogDraftBlockId')
    tryClean('__quickNoteBlockWindowSession')
  }

  // 布局就绪后初始化（确保 DOM 完全加载）
  onLayoutReady() {
    this.cleanupOrphanDraftBlocks()
    cleanupOrphanBlockWindows()  // 清理残留的僵尸记事弹窗
    this.initPluginFunctions()  // initPluginFunctions 是 async，不阻塞后续代码

    // ===== 初始化 TTS 设置缓存（从 plugin.loadData 读取）=====
    initTTSSettings()

    // ===== 应用手机端工具栏样式 =====
    if (this.isMobile) {
      // 延迟应用以确保 toolbarManager 的样式已经加载
      setTimeout(() => {
        this.applyMobileToolbarStyle()
      }, 500)
      syncMobileTopLineBreakButton(
        true,
        this.mobileFeatureConfig.showMobileLineBreakButton === true,
        this.mobileFeatureConfig.disableCustomButtons
      )

      // ===== 周期自愈定时器（替代旧的 8 秒一次性 setTimeout）=====
      // 旧逻辑：8 秒自检 1 次，若当时 breadcrumb 还没渲染（鸿蒙冷启动慢机型完全可能），
      // reinitMobileToolbarIfMissing 直接 return 且永不重试 → 胶囊永久消失。
      // 新逻辑：startSelfHealTimer 每 1 秒检查一次，成功即停，最多 40 次（约 40s），
      // 之后交由 ws-main 心跳（onload 已注册）长期兜底。
      this.startSelfHealTimer()
    }
  }

  // 初始化插件功能
  private async initPluginFunctions() {
    // 清理旧的功能
    cleanup()
    // 复位清理标志：cleanup() 会把 isCleanedUp 置 true，若不复位，
    // initCustomButtons 的 rAF/timeout 回调全被跳过，启动/重载后工具栏按钮
    // 无法创建，只有点文档触发事件才出现（时序 bug 根因）
    resetCleanupState()
  
    // ===== 初始化移动端工具栏调整 =====
    // 手机端：如果禁用自定义按钮，跳过工具栏位置调整（恢复思源默认顶部）
    if (!(this.isMobile && this.mobileFeatureConfig.disableCustomButtons)) {
      initMobileToolbarAdjuster(this.mobileConfig, this.mobileFeatureConfig.disableCustomButtons)
    }

    // ===== 初始化自定义按钮 =====
    // 根据当前平台选择对应的按钮配置
    // 手机端：如果禁用自定义按钮，跳过初始化
    if (this.isMobile && this.mobileFeatureConfig.disableCustomButtons) {
      // 跳过自定义按钮初始化
    } else {
      const buttonsToInit = this.isMobile ? this.mobileButtonConfigs : this.desktopButtonConfigs
      initCustomButtons(buttonsToInit)
    }

    // cleanup() 会清理掉胶囊状态（body class / style / data-input-method），这里重新应用
    this.applyDesktopToolbarPosition()

    // ===== 使用思源 EventBus 监听编辑器加载事件（替代 MutationObserver，避免卡顿） =====
    // 注意：手机端的 protyle 事件监听已提前到 onload 注册（eventBusReinitHandler），
    // 这里只给【桌面端】注册 eventBusRefreshHandler，避免手机端重复监听同一事件。
    // 手机端切文档时的 refreshToolbarAutoHide / refreshKmindZenCompat 已合并进 reinitMobileToolbarIfMissing。
    if (this.eventBusRefreshHandler) {
      this.eventBus.off('loaded-protyle-dynamic', this.eventBusRefreshHandler)
      this.eventBus.off('switch-protyle', this.eventBusRefreshHandler)
      this.eventBus.off('loaded-protyle-static', this.eventBusRefreshHandler)
    }
    // 定义刷新按钮的回调函数（电脑端直接创建按钮，避免 initCustomButtons 的重复清理和延迟）
    this.eventBusRefreshHandler = () => {
      if (this.isMobile) {
        // 手机端分支：onload 已注册独立的 reinit handler，这里不应被触发（手机端未注册此 handler）。
        // 保留分支以防被其他路径调用，安全 no-op。
        return
      }
      // 电脑端直接创建按钮，无需 1 秒延迟和重复清理
      const editors = document.querySelectorAll('.protyle')
      if (editors.length > 0) {
        createButtonsForEditors(editors, this.desktopButtonConfigs)
      }
      // 给刚出现的面包屑打 data-input-method 属性，确保胶囊 CSS 即时生效
      markDesktopBreadcrumbForFloating()
      // 刷新工具栏滚动隐藏状态（切文档时锁状态可能变了）
      refreshToolbarAutoHide()
      // 刷新电脑端胶囊滚动隐藏（切文档/标签页时重置滚动基准，避免 delta 错乱导致失效）
      refreshDesktopFloatingScrollOnSwitch()
      // 刷新 Kmind-Zen 兼容检测（切文档时文档树状态可能变了）
      refreshKmindZenCompat()
    }
    // 桌面端注册 protyle 事件（手机端在 onload 已注册，这里跳过）
    if (!this.isMobile) {
      this.eventBus.on('loaded-protyle-dynamic', this.eventBusRefreshHandler)
      this.eventBus.on('switch-protyle', this.eventBusRefreshHandler)
      this.eventBus.on('loaded-protyle-static', this.eventBusRefreshHandler)
    }
    
    // ===== 初始化小窗模式检测器 =====
    // 在手机端检测小窗模式和前后台切换
    if (this.isMobile) {
      // 初始化小窗模式检测器
      initSmallWindowDetector()

	      // 从按钮配置中查找各模块的透明度、滚动隐藏（与 toggleVisibility 一致，避免重载后仅恢复可见态却丢失开关）
      const findAuthorToolFloatOptions = (subtype: string): { floatOpacity?: number; autoHideOnScroll?: boolean; maxVisibleTabs?: number; floatPanelPosition?: string; collapseStyle?: 'preview' | 'minimal'; bottomDistance?: number } => {
        const btn = this.mobileButtonConfigs.find(b => b.type === 'author-tool' && b.authorToolSubtype === subtype)
        return {
          floatOpacity: btn?.floatOpacity,
          autoHideOnScroll: btn?.autoHideOnScroll,
          maxVisibleTabs: btn?.maxVisibleTabs,
          floatPanelPosition: btn?.floatPanelPosition,
          collapseStyle: btn?.collapseStyle,
          bottomDistance: btn?.bottomDistance
        }
      }

      const tabsOpts = findAuthorToolFloatOptions('mobile-tabs')
      const outlineOpts = findAuthorToolFloatOptions('mobile-outline')
      const docNavOpts = findAuthorToolFloatOptions('doc-nav')

	      // 初始化手机端标签页Tab模块（await 确保 switch-protyle handler 在 loadState 完成后才注册）
	      await initMobileTabs({
	        saveData: (key, value) => this.saveData(key, value),
	        loadData: (key) => this.loadData(key),
	        eventBus: this.eventBus,
	        floatOpacity: tabsOpts.floatOpacity,
	        autoHideOnScroll: tabsOpts.autoHideOnScroll,
	        maxVisibleTabs: tabsOpts.maxVisibleTabs,
	        floatPanelPosition: tabsOpts.floatPanelPosition,
	        collapseStyle: tabsOpts.collapseStyle
	      })

	      // 初始化手机端悬浮大纲模块
	      await initMobileOutline({
	        saveData: (key, value) => this.saveData(key, value),
	        loadData: (key) => this.loadData(key),
	        eventBus: this.eventBus,
	        floatOpacity: outlineOpts.floatOpacity,
	        autoHideOnScroll: outlineOpts.autoHideOnScroll,
	        floatPanelPosition: outlineOpts.floatPanelPosition,
	        collapseStyle: outlineOpts.collapseStyle
	      })

      // 初始化手机端文档导航模块
      await initMobileDocNav({
        saveData: (key, value) => this.saveData(key, value),
        loadData: (key) => this.loadData(key),
        eventBus: this.eventBus,
        floatOpacity: docNavOpts.floatOpacity,
        autoHideOnScroll: docNavOpts.autoHideOnScroll,
        bottomDistance: docNavOpts.bottomDistance
      })
    }

	    // 初始化桌面端标签页Tab模块
    if (!this.isMobile) {
      // 初始化桌面端标签页Tab模块
      await initDesktopTabs({
        saveData: (key, value) => this.saveData(key, value),
        loadData: (key) => this.loadData(key),
        eventBus: this.eventBus
      })

      // 初始化桌面端悬浮大纲模块
      await initDesktopOutline({
        saveData: (key, value) => this.saveData(key, value),
        loadData: (key) => this.loadData(key),
        eventBus: this.eventBus
      })

      // 初始化桌面端文档导航模块
      const desktopDocNavBtn = this.desktopButtonConfigs.find(b => b.type === 'author-tool' && b.authorToolSubtype === 'doc-nav')
      await initDesktopDocNav({
        saveData: (key, value) => this.saveData(key, value),
        loadData: (key) => this.loadData(key),
        eventBus: this.eventBus,
        bottomDistance: desktopDocNavBtn?.bottomDistance,
        autoHideOnScroll: desktopDocNavBtn?.autoHideOnScroll
      })
    }

    // ===== 初始化文本右键菜单模板注入 =====
    // 移除旧的监听器（避免重复监听）
    if (this.eventBusContextMenuHandler) {
      this.eventBus.off('open-menu-content', this.eventBusContextMenuHandler)
    }
    this.eventBusContextMenuHandler = (event: any) => {
      const { detail } = event
      // 收集所有开启了「显示在右键菜单」的模板按钮（桌面端+手机端都要收集）
      const allConfigs = [...this.desktopButtonConfigs, ...this.mobileButtonConfigs]
      const contextMenuButtons = allConfigs.filter(
        (btn) => btn.type === 'template' && btn.showInContextMenu && btn.template && btn.enabled !== false
      )

      if (contextMenuButtons.length === 0) return

      // 直接操作顶级菜单，避免被归入"插件"子菜单
      const menu = (window as any).siyuan?.menus?.menu
      if (!menu?.addItem) return

      // 保存 protyle 元素和选区引用，供点击时定位编辑器和恢复光标
      const protyleElement = detail?.protyle?.element as HTMLElement | undefined
      const savedRange = detail?.range as Range | undefined

      contextMenuButtons.forEach((btn) => {
        menu.addItem({
          label: getButtonDisplayName(btn) || t('toolbarManager.2', undefined, '模板插入'),
          icon: 'iconEdit',
          click: () => {
            const editorTarget = protyleElement?.querySelector('[contenteditable="true"]') as HTMLElement | undefined
            if (editorTarget) {
              editorTarget.focus()
              // 恢复右键时的选区位置
              if (savedRange) {
                const sel = window.getSelection()
                if (sel) {
                  sel.removeAllRanges()
                  sel.addRange(savedRange)
                }
              }
              insertTemplate(btn, savedRange || null, editorTarget)
            } else {
              insertTemplate(btn)
            }
          }
        })
      })
    }
    this.eventBus.on('open-menu-content', this.eventBusContextMenuHandler)

    // ===== 兼容：第三方“一键记事”弹窗 textarea 的模板右键菜单 =====
    // 第三方插件的弹窗通常使用 textarea，右键不会触发 open-menu-content（该事件仅针对 protyle 编辑器菜单）。
    // 这里用事件委托捕获“看起来像一键记事弹窗”的 textarea 右键，并复用本插件的 showTemplateContextMenu。
    if (this.quickNoteTextareaContextMenuHandler) {
      document.removeEventListener('contextmenu', this.quickNoteTextareaContextMenuHandler, true)
    }
    this.quickNoteTextareaContextMenuHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.tagName !== 'TEXTAREA') return

      const textarea = target as HTMLTextAreaElement

      // 只对“可能是一键记事弹窗”的 textarea 生效，避免影响普通输入框
      const wrapper = textarea.closest(
        '#quick-note-dialog, #quick-note-dialog-desktop, [id*="quick-note"], [id*="quickNote"], [class*="quick-note"], [class*="quickNote"]'
      )
      if (!wrapper) {
        // 调试：帮助定位第三方弹窗 DOM（只打印一次，避免刷屏）
        if (!this._quickNoteTextareaDomLogged) {
          this._quickNoteTextareaDomLogged = true
          try {
            const chain: string[] = []
            let el: HTMLElement | null = textarea
            let depth = 0
            while (el && el !== document.body && depth < 12) {
              const id = el.id ? `#${el.id}` : ''
              const cls = el.className ? `.${String(el.className).trim().replace(/\s+/g, '.')}` : ''
              chain.push(`${el.tagName.toLowerCase()}${id}${cls}`)
              el = el.parentElement
              depth++
            }
            logger.warn('[QuickNote DOM] 未命中 quick-note wrapper，textarea 祖先链：', chain)
          } catch (err) {
            logger.warn('[QuickNote DOM] 祖先链打印失败:', err)
          }
        }
        return
      }

      // 如果没有启用任何“显示在右键菜单”的模板按钮，showTemplateContextMenu 会直接 return
      showTemplateContextMenu(e, textarea)
    }
    document.addEventListener('contextmenu', this.quickNoteTextareaContextMenuHandler, true)
  }

  /**
   * 工具栏自愈：检测当前激活模式的"就绪信号"是否丢失，丢失则重建。
   *
   * 触发场景：
   *  - protyle 事件（loaded-protyle-dynamic/static、switch-protyle，handler 在 onload 注册）
   *  - ws-main 心跳（onWsHeartbeat，500ms 节流）
   *  - onLayoutReady 周期自检（startSelfHealTimer，1s 周期、最多 40 次）
   *  - visibilitychange 切回前台（windowDetector 调用，保留为额外兜底）
   *
   * 就绪信号：
   *  - 底部固定/胶囊模式：.protyle-breadcrumb[__bar][data-input-method] 存在 且 有真实按钮节点 [data-custom-button]
   *  - 顶部模式：body.siyuan-toolbar-top-mode 生效 且 有真实按钮节点（纯 CSS 驱动，breadcrumb 出现即生效）
   *
   * 幂等性：本函数可被事件/心跳/定时器任意重复调用。
   *  - breadcrumb 还没渲染：本次 return（不重建），但不阻止后续重试（由周期定时器/心跳继续触发）。
   *  - breadcrumb 已存在但就绪信号缺失：立即重建。
   *  - 已就绪：return。
   */
  reinitMobileToolbarIfMissing(): void {
    if (!this.isMobile) return
    // 禁用自定义按钮时不重建（与 initPluginFunctions 的跳过条件一致）
    if (this.mobileFeatureConfig.disableCustomButtons) return

    const cfg = this.mobileConfig
    const isTopMode = cfg.enableTopToolbar === true
    const isBottomOrFloating = cfg.enableBottomToolbar === true || cfg.enableFloatingToolbar === true

    // breadcrumb 容器是否存在（任意模式都依赖它）
    const breadcrumb = document.querySelector(
      '.protyle-breadcrumb:not(.protyle-breadcrumb__bar), .protyle-breadcrumb__bar'
    )
    // breadcrumb 还没出现：本次不重建，等下次事件/心跳/定时器再试（不在此终止整个自愈链）
    if (!breadcrumb) {
      return
    }

    // 判断"工具栏是否已就绪"——以"真实按钮节点"为最终判据，避免残留属性误判
    const hasRealButtons = !!document.querySelector('[data-custom-button]')
    let toolbarReady = false
    if (isTopMode) {
      // 顶部模式靠 body class + 纯 CSS 生效；按钮节点存在才算真完成
      toolbarReady = document.body.classList.contains('siyuan-toolbar-top-mode') && hasRealButtons
    } else if (isBottomOrFloating) {
      // 底部/胶囊模式：breadcrumb 须被打上 data-input-method 且有真实按钮
      const hasInputMethod = !!document.querySelector(
        '.protyle-breadcrumb[data-input-method], .protyle-breadcrumb__bar[data-input-method]'
      )
      toolbarReady = hasInputMethod && hasRealButtons
    }

    if (toolbarReady) {
      // 切文档后锁状态可能已变化：按钮已存在（无需重建），但要刷新 toggle-lock 图标
      // 与滚动隐藏的锁状态缓存（refreshToolbarAutoHide 原来只在重建分支刷新，会读到旧缓存）
      refreshToggleLockIcons()
      refreshToolbarAutoHide()
      return
    }

    // breadcrumb 已存在但就绪信号缺失（外壳缺失、或残留属性但无按钮）：立即重建
    initMobileToolbarAdjuster(this.mobileConfig, this.mobileFeatureConfig.disableCustomButtons)
    initCustomButtons(this.mobileButtonConfigs)
    // 重建后刷新工具栏滚动隐藏 / Kmind-Zen 兼容（原 eventBusRefreshHandler 手机端分支的职责，
    // 现因手机端不再注册 eventBusRefreshHandler 而合并到此处）
    refreshToolbarAutoHide()
    refreshKmindZenCompat()
  }

  /** ws-main 心跳节流：避免每条 WS 消息都触发 reinitMobileToolbarIfMissing */
  private _lastHeartbeatCheck = 0
  private onWsHeartbeat(): void {
    if (!this.isMobile) return
    const now = Date.now()
    if (now - this._lastHeartbeatCheck < 500) return
    this._lastHeartbeatCheck = now
    this.reinitMobileToolbarIfMissing()
  }

  /**
   * 周期自愈定时器（替代旧的 8 秒一次性 setTimeout）。
   * - 每 1 秒检查一次工具栏就绪信号；
   * - 成功（isToolbarComplete）即停；
   * - 最多 40 次（约 40s）后停止，之后交给 ws-main 心跳长期兜底。
   */
  private _selfHealTimer: ReturnType<typeof setInterval> | null = null
  private startSelfHealTimer(): void {
    if (!this.isMobile) return
    if (this._selfHealTimer) return
    let attempts = 0
    this._selfHealTimer = safeSetInterval(() => {
      attempts++
      const cfg = this.mobileConfig
      const isTopMode = cfg.enableTopToolbar === true
      const isBottomOrFloating = cfg.enableBottomToolbar === true || cfg.enableFloatingToolbar === true
      const hasBreadcrumb = !!document.querySelector(
        '.protyle-breadcrumb:not(.protyle-breadcrumb__bar), .protyle-breadcrumb__bar'
      )
      const hasRealButtons = !!document.querySelector('[data-custom-button]')
      const hasInputMethod = !!document.querySelector(
        '.protyle-breadcrumb[data-input-method], .protyle-breadcrumb__bar[data-input-method]'
      )
      const complete = hasBreadcrumb && hasRealButtons
        && (isTopMode ? document.body.classList.contains('siyuan-toolbar-top-mode') : (isBottomOrFloating ? hasInputMethod : true))
      if (complete) {
        if (this._selfHealTimer) { clearSafeInterval(this._selfHealTimer); this._selfHealTimer = null }
        return
      }
      this.reinitMobileToolbarIfMissing()
      if (attempts >= 40) {
        if (this._selfHealTimer) { clearSafeInterval(this._selfHealTimer); this._selfHealTimer = null }
      }
    }, 1000)
  }

  /** 思源同步仅变更插件存储数据（dataChangePlugins）时调用，不会触发 onunload/onload */
  async onDataChanged() {
    try {
      const savedLoggingConfig = await this.loadData('loggingConfig')
      this.loggingEnabled = savedLoggingConfig?.enabled === true
      setLoggingEnabled(this.loggingEnabled)
    } catch (error) {
      logger.error('[日志设置] 同步失败:', error)
    }

    // 重新加载按钮配置
    const savedMobileButtons = await this.loadData('mobileButtonConfigs')
    if (Array.isArray(savedMobileButtons)) {
      this.mobileButtonConfigs = savedMobileButtons.map((btn: any) => ({...btn}))
    }
    const savedDesktopButtons = await this.loadData('desktopButtonConfigs')
    if (Array.isArray(savedDesktopButtons)) {
      this.desktopButtonConfigs = savedDesktopButtons.map((btn: any) => ({...btn}))
    }

    // 重新加载浮窗模块状态（同步可能覆盖了存储数据）
    if (this.isMobile) {
      await Promise.all([
        reloadMobileTabsState(),
        reloadMobileOutlineState(),
        reloadMobileDocNavState()
      ])
    }
  }

  onunload() {
    destroyQuickNoteFloatWindow()
    destroyDesktopQuickNoteBlockWindow()
    cleanupImagePicker()
    // 清理独立窗口内 LifeLog 钩子
    try { delete (window as any).__tcLifelogTrigger } catch { /* ignore */ }
    try { delete (window as any).__quickNoteFloatCommand } catch { /* ignore */ }
    try { delete (window as any).__quicknoteButtonStyleHandler } catch { /* ignore */ }

    // 清理资源
    cleanup()
    destroy()

    // 清理标签切换器资源
    cleanupTabSwitcher()

    // 清理手机端标签页Tab资源
    cleanupMobileTabs()

    // 清理手机端悬浮大纲资源
    cleanupMobileOutline()

    // 清理手机端文档导航资源
    cleanupMobileDocNav()

    // 清理桌面端标签页Tab资源
    cleanupDesktopTabs()

    // 清理桌面端悬浮大纲资源
    cleanupDesktopOutline()

    // 清理桌面端文档导航资源
    cleanupDesktopDocNav()
    destroyMobileTopLineBreakButton()

    // 移除动态样式
    this.removeFeatureStyles()
    const dynamicStyle = document.getElementById('mobile-toolbar-dynamic-style')
    if (dynamicStyle) dynamicStyle.remove()
    const bgStyle = document.getElementById('mobile-toolbar-background-color-style')
    if (bgStyle) bgStyle.remove()

    // 清理小窗模式检测器资源
    if (typeof clearSmallWindowDetector === 'function') {
      clearSmallWindowDetector()
    }

    // 清理 StressThreshold 事件监听器
    cleanupStressThreshold(this)

    // 清理 EventBus 事件监听器
    if (this.eventBusRefreshHandler) {
      this.eventBus.off('loaded-protyle-dynamic', this.eventBusRefreshHandler)
      this.eventBus.off('switch-protyle', this.eventBusRefreshHandler)
      this.eventBus.off('loaded-protyle-static', this.eventBusRefreshHandler)
      this.eventBusRefreshHandler = null
    }

    // 清理手机端工具栏自愈监听器（onload 注册的 protyle 事件 + ws-main 心跳）
    if (this.eventBusReinitHandler) {
      this.eventBus.off('loaded-protyle-dynamic', this.eventBusReinitHandler)
      this.eventBus.off('loaded-protyle-static', this.eventBusReinitHandler)
      this.eventBus.off('switch-protyle', this.eventBusReinitHandler)
      this.eventBusReinitHandler = null
    }
    if (this.eventBusWsHeartbeatHandler) {
      this.eventBus.off('ws-main', this.eventBusWsHeartbeatHandler)
      this.eventBusWsHeartbeatHandler = null
    }

    // 清理周期自愈定时器（双保险：safeSetInterval 已被 clearAllTimers 覆盖，这里显式清更稳妥）
    if (this._selfHealTimer) {
      clearSafeInterval(this._selfHealTimer)
      this._selfHealTimer = null
    }

    // 清理右键菜单事件监听器
    if (this.eventBusContextMenuHandler) {
      this.eventBus.off('open-menu-content', this.eventBusContextMenuHandler)
      this.eventBusContextMenuHandler = null
    }

    // 清理：第三方 quick note textarea 右键菜单兼容
    if (this.quickNoteTextareaContextMenuHandler) {
      document.removeEventListener('contextmenu', this.quickNoteTextareaContextMenuHandler, true)
      this.quickNoteTextareaContextMenuHandler = null
    }

    // 所有业务模块清理完成后再释放共享运行时。
    setPluginInstance(null)
    clearI18n()

  }

  async uninstall() {
    // 保留用户配置数据，重装后可恢复
  }

  openSetting() {
    // 保存配置快照，用于变更检测
    const snapshot = JSON.stringify({
      mobileToolbarConfig: this.mobileConfig,
      desktopButtonConfigs: this.desktopButtonConfigs,
      mobileButtonConfigs: this.mobileButtonConfigs,
      desktopFeatureConfig: this.desktopFeatureConfig,
      mobileFeatureConfig: this.mobileFeatureConfig,
      desktopGlobalButtonConfig: this.desktopGlobalButtonConfig,
      mobileGlobalButtonConfig: this.mobileGlobalButtonConfig
    })

    const setting = new Setting({
      width: this.isMobile ? '100%' : '800px',
      height: this.isMobile ? '100%' : '90vh',
      confirmCallback: async () => {
        // 同步全局按钮配置到所有按钮（在保存前）
        // 只有启用了全局配置时才批量应用
        const isGlobalEnabled = this.mobileGlobalButtonConfig.enabled ?? true

        if (isGlobalEnabled) {
          // 获取当前的全局配置值
          const globalIconSize = this.mobileGlobalButtonConfig.iconSize
          const globalMinWidth = this.mobileGlobalButtonConfig.minWidth
          const globalMarginRight = this.mobileGlobalButtonConfig.marginRight
          const globalShowNotification = this.mobileGlobalButtonConfig.showNotification

          // 应用到所有移动端按钮
          this.mobileButtonConfigs.forEach(btn => {
            btn.iconSize = globalIconSize
            btn.minWidth = globalMinWidth
            btn.marginRight = globalMarginRight
            // showNotification 暂时保留原有逻辑，如果未设置则使用全局值
            if (btn.showNotification === undefined) {
              btn.showNotification = globalShowNotification
            }
          })
        }

        // 如果扩展工具栏按钮启用，强制隐藏相关按钮
        const overflowBtn = this.mobileButtonConfigs.find(btn => btn.id === 'overflow-button-mobile')
        if (overflowBtn && overflowBtn.enabled !== false) {
          // 注意：不再强制隐藏「面包屑」按钮（hideBreadcrumbIcon），它是手机端原生路径菜单入口
          this.mobileFeatureConfig.hideReadonlyButton = true
          this.mobileFeatureConfig.hideDocMenuButton = true
          this.mobileFeatureConfig.hideMoreButton = true

          // 重新计算所有按钮的溢出层级
          const overflowLayers = overflowBtn.layers || 1
          const updatedButtons = calculateButtonOverflow(
            this.mobileButtonConfigs,
            overflowLayers,
            this.mobileGlobalButtonConfig?.externalButtonsReserveWidth ?? 0
          )
          // 更新按钮的溢出层级
          updatedButtons.forEach(btn => {
            const original = this.mobileButtonConfigs.find(b => b.id === btn.id)
            if (original) {
              original.overflowLevel = btn.overflowLevel
            }
          })
        }

        // 变更检测：逐项对比当前配置与打开设置时的快照
        const savedSnapshot = JSON.parse(snapshot) as Record<string, any>
        const changed = (key: string, data: any) => JSON.stringify(data) !== JSON.stringify(savedSnapshot[key])

        const desktopButtonsChanged = changed('desktopButtonConfigs', this.desktopButtonConfigs)
        const mobileButtonsChanged = changed('mobileButtonConfigs', this.mobileButtonConfigs)
        const mobileToolbarChanged = changed('mobileToolbarConfig', this.mobileConfig)
        const desktopFeatureChanged = changed('desktopFeatureConfig', this.desktopFeatureConfig)
        const mobileFeatureChanged = changed('mobileFeatureConfig', this.mobileFeatureConfig)
        const desktopGlobalButtonChanged = changed('desktopGlobalButtonConfig', this.desktopGlobalButtonConfig)
        const mobileGlobalButtonChanged = changed('mobileGlobalButtonConfig', this.mobileGlobalButtonConfig)

        const hasAnyChange =
          desktopButtonsChanged ||
          mobileButtonsChanged ||
          mobileToolbarChanged ||
          desktopFeatureChanged ||
          mobileFeatureChanged ||
          desktopGlobalButtonChanged ||
          mobileGlobalButtonChanged

        if (!hasAnyChange) {
          showMessage(t('plugin.configUnchanged', undefined, '配置无变化，未保存'), 3000, 'info')
          await new Promise(r => setTimeout(r, 100))
          return
        }

        // 只保存实际发生变化的配置
        if (mobileToolbarChanged) {
          await this.saveData('mobileToolbarConfig', this.mobileConfig)
        }
        if (!this.isMobile && desktopButtonsChanged) {
          await this.saveData('desktopButtonConfigs', this.desktopButtonConfigs)
        }
        if (mobileButtonsChanged) {
          await this.saveData('mobileButtonConfigs', this.mobileButtonConfigs)
        }
        if (!this.isMobile && desktopFeatureChanged) {
          await this.saveData('desktopFeatureConfig', this.desktopFeatureConfig)
        }
        if (!this.isMobile && desktopGlobalButtonChanged) {
          await this.saveData('desktopGlobalButtonConfig', this.desktopGlobalButtonConfig)
        }
        if (mobileFeatureChanged) {
          await this.saveData('mobileFeatureConfig', this.mobileFeatureConfig)
        }
        if (mobileGlobalButtonChanged) {
          await this.saveData('mobileGlobalButtonConfig', this.mobileGlobalButtonConfig)
        }

        showMessage(t('plugin.settingsSavedReloading', undefined, '设置已保存，正在重载...'), 2000, 'info')

        // 使用官方 API 重载界面
        await fetchSyncPost('/api/ui/reloadUI', {})
      }
    })

    // 手机端：给对话框添加标识，用于CSS定位
    if (this.isMobile) {
      // 等待对话框渲染后添加标识
      setTimeout(() => {
        const dialog = document.querySelector('.b3-dialog:not([data-plugin-dialog])')
        if (dialog) {
          dialog.setAttribute('data-plugin-dialog', 'toolbar-customizer')
        }
      }, 50)
    }

    if (this.isMobile) {
      // 手机端：使用思源原生 b3-label 布局
      this.initMobileSettingLayout(setting)
    } else {
      // 电脑端：使用标签切换布局
      const context: DesktopSettingsContext = {
        desktopButtonConfigs: this.desktopButtonConfigs,
        mobileButtonConfigs: this.mobileButtonConfigs,
        desktopGlobalButtonConfig: this.desktopGlobalButtonConfig,
        mobileGlobalButtonConfig: this.mobileGlobalButtonConfig,
        desktopFeatureConfig: this.desktopFeatureConfig,
        mobileFeatureConfig: this.mobileFeatureConfig,
        loggingEnabled: this.loggingEnabled,
        mobileConfig: this.mobileConfig,
        version: this.version,
        isAuthorToolActivated: () => this.isAuthorToolActivated(),
        getLicenseStatus: () => this.getLicenseStatus(),
        showConfirmDialog: (msg) => this.showConfirmDialog(msg),
        showIconPicker: (current, onSelect) => this.showIconPicker(current, onSelect),
        saveData: (key, value) => this.saveData(key, value),
        removeData: (key) => this.removeData(key),
        setLoggingEnabled: async (enabled) => {
          const previous = this.loggingEnabled
          this.loggingEnabled = enabled === true
          setLoggingEnabled(this.loggingEnabled)
          try {
            await this.saveData('loggingConfig', { enabled: this.loggingEnabled })
          } catch (error) {
            this.loggingEnabled = previous
            setLoggingEnabled(previous)
            throw error
          }
        },
        resetLogging: async () => {
          await this.removeData('loggingConfig')
          this.loggingEnabled = false
          context.loggingEnabled = false
          setLoggingEnabled(false)
        },
        applyFeatures: () => this.applyFeatures(),
        applyDesktopToolbarPosition: () => this.applyDesktopToolbarPosition(),
        refreshButtons: () => {
          // 刷新桌面端按钮
          initCustomButtons(this.desktopButtonConfigs)
        }
      }
      createDesktopSettingLayout(setting, context)
    }

    setting.open(t('plugin.settingsTitle', undefined, '思源手机端增强'))

    // 电脑端：对话框打开后注入标签栏
    if (!this.isMobile) {
      this.injectTabSwitcher()
    }
  }

  // 注入标签切换器（已迁移到 ui/tabs.ts）
  private injectTabSwitcher() {
    injectTabSwitcherUtil()
  }


  // 手机端设置布局
  private initMobileSettingLayout(setting: Setting) {
    // 创建上下文对象，将插件实例的方法和数据通过依赖注入传递
    const context: MobileSettingsContext = {
      buttonConfigs: this.buttonConfigs,
      mobileButtonConfigs: this.mobileButtonConfigs,
      desktopButtonConfigs: this.desktopButtonConfigs,
      mobileGlobalButtonConfig: this.mobileGlobalButtonConfig,
      desktopGlobalButtonConfig: this.desktopGlobalButtonConfig,
      mobileFeatureConfig: this.mobileFeatureConfig,
      mobileConfig: this.mobileConfig,
      desktopFeatureConfig: this.desktopFeatureConfig,
      isAuthorToolActivated: () => this.isAuthorToolActivated(),
      getLicenseStatus: () => this.getLicenseStatus(),
      showConfirmDialog: (message) => this.showConfirmDialog(message),
      showIconPicker: (currentValue, onSelect) => this.showIconPicker(currentValue, onSelect),
      showButtonIdPicker: (currentValue, onSelect) => this.showButtonIdPicker(currentValue, onSelect),
      saveData: (key, value) => this.saveData(key, value),
      removeData: (key) => this.removeData(key),
      resetLogging: async () => {
        await this.removeData('loggingConfig')
        this.loggingEnabled = false
        setLoggingEnabled(false)
      },
      applyFeatures: () => this.applyFeatures(),
      applyDesktopToolbarPosition: () => this.applyDesktopToolbarPosition(),
      applyMobileToolbarStyle: () => this.applyMobileToolbarStyle(),
      updateMobileToolbar: () => {
        initMobileToolbarAdjuster(this.mobileConfig, this.mobileFeatureConfig.disableCustomButtons)
        const buttonsToInit = this.mobileButtonConfigs
        initCustomButtons(buttonsToInit)
        
        // 手机端功能初始化 - 但不重新初始化小窗检测器以避免弹窗意外触发
        if (this.isMobile) {
          // 只应用工具栏样式而不重新初始化检测器
          this.applyMobileToolbarStyle();
        }
      },
      recalculateOverflow: () => {
        // 获取扩展工具栏按钮的层数配置
        const overflowBtn = this.mobileButtonConfigs.find(btn => btn.id === 'overflow-button-mobile')
        const overflowLayers = (overflowBtn && overflowBtn.enabled !== false) ? (overflowBtn.layers || 1) : 0

        // 如果扩展工具栏被禁用，重置所有按钮的溢出层级
        if (overflowLayers === 0 || overflowBtn?.enabled === false) {
          this.mobileButtonConfigs.forEach(btn => {
            btn.overflowLevel = 0
          })
        } else {
          // 重新计算所有按钮的溢出层级
          const updatedButtons = calculateButtonOverflow(
            this.mobileButtonConfigs,
            overflowLayers,
            this.mobileGlobalButtonConfig?.externalButtonsReserveWidth ?? 0
          )
          updatedButtons.forEach(btn => {
            const original = this.mobileButtonConfigs.find(b => b.id === btn.id)
            if (original) {
              original.overflowLevel = btn.overflowLevel
            }
          })
        }

        // 重新创建主工具栏按钮，应用新的样式配置
        initCustomButtons(this.mobileButtonConfigs)
      }
    }

    // 调用提取后的设置创建函数
    createMobileSettingLayout(setting, context)
  }

  // 按钮选择器（已迁移到 ui/buttonSelector.ts）
  private showButtonIdPicker(currentValue: string, onSelect: (result: ButtonInfo) => void) {
    showButtonSelector({ currentValue, onSelect })
  }

  // 自定义确认对话框（已迁移到 ui/dialog.ts，兼容鸿蒙系统）
  private showConfirmDialog(message: string): Promise<boolean> {
    return showConfirmDialogModal({
      message,
      confirmText: t('dialog.delete', undefined, '删除'),
      cancelText: t('dialog.cancel', undefined, '取消')
    })
  }

  // 图标选择器（已迁移到 ui/iconPicker.ts）
  private showIconPicker(currentValue: string, onSelect: (icon: string) => void, iconSize?: number) {
    // 如果没有传入图标大小，使用桌面端全局配置的图标大小
    const size = iconSize || this.desktopGlobalButtonConfig?.iconSize || 18
    showIconPickerModal({ currentValue, onSelect, iconSize: size })
  }

  // 应用小功能
  private applyFeatures() {
    // 移除旧样式
    this.removeFeatureStyles()

    const style = document.createElement('style')
    style.id = 'toolbar-customizer-feature-style'

    let styleContent = ''

    // 面包屑图标隐藏（使用 transform 缩放到 0，保持按钮位置不变）
    // 当禁用自定义按钮时，跳过此设置
    const disableCustomButtons = this.isMobile ? this.mobileFeatureConfig.disableCustomButtons : this.desktopFeatureConfig.disableCustomButtons
    if (this.featureConfig.hideBreadcrumbIcon && !disableCustomButtons) {
      styleContent += `
        .protyle-breadcrumb__icon {
          transform: scale(0) !important;
          width: 0 !important;
          min-width: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
          overflow: hidden !important;
        }
      `
    }

    // 锁定编辑按钮隐藏（使用 transform 缩放到 0，保持按钮位置不变）
    if (this.featureConfig.hideReadonlyButton && !disableCustomButtons) {
      styleContent += `
        .protyle-breadcrumb__bar button[data-type="readonly"],
        .protyle-breadcrumb button[data-type="readonly"] {
          transform: scale(0) !important;
          width: 0 !important;
          min-width: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
          overflow: hidden !important;
        }
      `
    }

    // 文档菜单按钮隐藏（使用 transform 缩放到 0，保持按钮位置不变）
    if (this.featureConfig.hideDocMenuButton && !disableCustomButtons) {
      styleContent += `
        .protyle-breadcrumb__bar button[data-type="doc"],
        .protyle-breadcrumb button[data-type="doc"] {
          transform: scale(0) !important;
          width: 0 !important;
          min-width: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
          overflow: hidden !important;
        }
      `
    }

    // 更多按钮隐藏（使用 transform 缩放到 0，保持按钮位置不变）
    if (this.featureConfig.hideMoreButton && !disableCustomButtons) {
      styleContent += `
        .protyle-breadcrumb__bar button[data-type="more"],
        .protyle-breadcrumb button[data-type="more"] {
          transform: scale(0) !important;
          width: 0 !important;
          min-width: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
          overflow: hidden !important;
        }
      `
    }

    // 桌面端工具栏高度（仅桌面端生效，禁用自定义按钮时跳过）
    if (!this.isMobile && this.desktopFeatureConfig.toolbarHeight !== undefined && this.desktopFeatureConfig.toolbarHeight !== 32 && !disableCustomButtons) {
      styleContent += `
        .protyle-breadcrumb__bar,
        .protyle-breadcrumb {
          height: ${this.desktopFeatureConfig.toolbarHeight}px !important;
          min-height: ${this.desktopFeatureConfig.toolbarHeight}px !important;
        }
        .protyle-breadcrumb__bar > button,
        .protyle-breadcrumb > button {
          height: ${this.desktopFeatureConfig.toolbarHeight}px !important;
        }
      `
    }
    
    // 手机端工具栏高度（仅在非禁用自定义按钮时应用）
    if (this.isMobile && !disableCustomButtons) {
      styleContent += `
        @media (max-width: 768px) {
          .protyle-breadcrumb,
          .protyle-breadcrumb__bar,
          .protyle-breadcrumb__bar[data-input-method],
          .protyle-breadcrumb[data-input-method] {
            height: ${this.mobileConfig.toolbarHeight} !important;
            min-height: ${this.mobileConfig.toolbarHeight} !important;
          }
        }
      `
    }

    // ⑥换行按钮开启时隐藏顶部云同步图标（与 H 同区域，避免干扰）
    if (this.isMobile && this.mobileFeatureConfig.showMobileLineBreakButton === true && !disableCustomButtons) {
      styleContent += `
        #toolbarSync {
          display: none !important;
          visibility: hidden !important;
          width: 0 !important;
          height: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          pointer-events: none !important;
        }
      `
    }

    // ⑦手机端状态条隐藏（恢复原始状态时跳过，让状态条显示回来）
    if (this.isMobile && this.mobileFeatureConfig.hideStatusBar !== false && !disableCustomButtons) {
      styleContent += `
        #status {
          display: none !important;
        }
      `
    }

	    // 禁用自定义按钮（恢复思源原始状态）
	    // 前面的所有修改CSS都已跳过，这里只需要隐藏自定义按钮
	    if (disableCustomButtons) {
	      // ===== 清理所有插件注入的残留样式和标记 =====
	      // 样式元素
	      ;[
	        'mobile-toolbar-custom-style',
	        'mobile-toolbar-background-color-style',
	        'top-toolbar-custom-style',
	        'custom-button-focus-style',
	        'native-toolbar-lock-style',
	        'toolbar-autohide-style',
	        'kmind-zen-compat-style',
	        'overflow-toolbar-animation',
	        'desktop-overflow-toolbar-animation',
	        'mobile-toolbar-dynamic-style',
	        'popup-select-scrollbar-style',
	      ].forEach(id => document.getElementById(id)?.remove())

	      // body 类名
	      document.body.classList.remove(
	        'siyuan-toolbar-customizer-enabled',
	        'siyuan-toolbar-top-mode',
	        'toolbar-autohide-active',
	        'toolbar-locked',
	        'kmind-zen-active',
	      )

	      // CSS 变量
	      document.documentElement.style.removeProperty('--mobile-toolbar-offset')

	      // 扩展工具栏弹出层
	      document.querySelectorAll('.overflow-toolbar-layer, .desktop-overflow-toolbar-layer').forEach(el => el.remove())

	      // 面包屑上的自定义标记属性
	      document.querySelectorAll('.protyle-breadcrumb__bar[data-toolbar-customized], .protyle-breadcrumb[data-toolbar-customized]').forEach(el => {
	        el.removeAttribute('data-input-method')
	        el.removeAttribute('data-toolbar-customized')
	      })

      // 滚动隐藏残留
      document.querySelectorAll('.toolbar-scroll-hidden').forEach(el => el.classList.remove('toolbar-scroll-hidden'))

      // 彻底恢复：解绑 observer、清除面包屑 inline 样式/属性/残留 class 与 CSS 变量
      // （仅移除 style 元素不够——observer 会把样式重新注入，inline opacity/transform 也不会随 style 移除而消失）
      restoreMobileToolbarOriginal()

      // 隐藏自定义按钮的 CSS
	      styleContent += `
        /* 隐藏所有自定义按钮 */
        .protyle-breadcrumb__bar button[data-custom-button],
        .protyle-breadcrumb button[data-custom-button],
        .protyle-breadcrumb__bar [data-custom-button],
        .protyle-breadcrumb [data-custom-button],
        button[data-custom-button] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          width: 0 !important;
          height: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
        }
      `
    }

    // 不隐藏顶栏标题：顶栏始终固定原位（不随滚动位移/隐藏，避免阈值处跳变闪烁）
    // 恢复原始状态时跳过，避免残留 CSS 干预顶栏原生表现
    if (this.mobileFeatureConfig.keepTopBarVisible === true && !disableCustomButtons) {
      styleContent += `
        .mobile-topbar {
          visibility: visible !important;
          transform: translate3d(0, 0, 0) !important;
        }
      `
    }

    if (styleContent) {
      style.textContent = styleContent
      document.head.appendChild(style)
    }

    // 注入跳转高亮动画样式（功能列表→设置项跳转时使用）
    if (!document.getElementById('toolbar-customizer-jump-highlight-style')) {
      const hlStyle = document.createElement('style')
      hlStyle.id = 'toolbar-customizer-jump-highlight-style'
      hlStyle.textContent = `
        @keyframes jump-highlight-pulse {
          0%   { outline: 3px solid var(--b3-theme-primary); outline-offset: 4px; background: rgba(59, 130, 246, 0.15); }
          40%  { outline: 3px solid var(--b3-theme-primary); outline-offset: 4px; background: rgba(59, 130, 246, 0.15); }
          100% { outline: 3px solid transparent; outline-offset: 4px; background: transparent; }
        }
        .jump-highlight {
          animation: jump-highlight-pulse 2s ease-out forwards;
          border-radius: 8px;
        }
      `
      document.head.appendChild(hlStyle)
    }

    // 应用电脑端悬浮胶囊工具栏（位置/样式）
    // 与其他 feature 样式一起应用，确保禁用自定义按钮时也会被正确清理
    this.applyDesktopToolbarPosition()

    syncMobileTopLineBreakButton(
      this.isMobile,
      this.mobileFeatureConfig.showMobileLineBreakButton === true,
      disableCustomButtons
    )
  }

  /**
   * 应用电脑端工具栏位置（原生顶部 / 悬浮胶囊）。
   * 由 applyFeatures() 统一调用，以及设置面板滑杆 onChange 时调用。
   * 仅电脑端、未禁用自定义按钮时执行；其余情况会清理胶囊痕迹并恢复原生顶部。
   */
  private applyDesktopToolbarPosition() {
    if (this.isMobile) return
    const cfg = this.desktopFeatureConfig
    applyDesktopFloatingToolbar(
      {
        enableFloatingToolbar: cfg.enableFloatingToolbar === true,
        floatingToolbarMargin: cfg.floatingToolbarMargin ?? 40,
        floatingToolbarBorderRadius: cfg.floatingToolbarBorderRadius ?? 20,
        floatingToolbarHeight: cfg.floatingToolbarHeight ?? 40,
        floatingToolbarWidth: cfg.floatingToolbarWidth ?? 0,
        floatingToolbarStyle: cfg.floatingToolbarStyle === 'solid' ? 'solid' : 'glass',
        floatingToolbarScrollHide: cfg.floatingToolbarScrollHide === true,
      },
      cfg.disableCustomButtons === true
    )
  }

  // 应用手机端工具栏样式（仅用于动态更新样式，不处理背景颜色）
  private applyMobileToolbarStyle() {
    if (!this.isMobile) return
    
    // 如果禁用了自定义按钮（恢复原始状态），则不应用任何工具栏样式
    if (this.mobileFeatureConfig.disableCustomButtons) {
      // 移除可能存在的移动端工具栏样式
      const style = document.getElementById('mobile-toolbar-dynamic-style')
      if (style) {
        style.remove()
      }
      return
    }

    // 应用背景颜色（包括透明度）
    applyToolbarBackgroundColor(this.mobileConfig, this.mobileFeatureConfig.disableCustomButtons)

    // 使用不同的 style ID 来避免冲突
    const styleId = 'mobile-toolbar-dynamic-style'
    let style = document.getElementById(styleId) as HTMLStyleElement

    if (!style) {
      style = document.createElement('style')
      style.id = styleId
      document.head.appendChild(style)
    }

    const cssRules: string[] = []

    // 工具栏高度设置（所有模式通用）
    cssRules.push(`
      @media (max-width: 768px) {
        .protyle-breadcrumb,
        .protyle-breadcrumb__bar,
        .protyle-breadcrumb__bar[data-input-method],
        .protyle-breadcrumb[data-input-method] {
          height: ${this.mobileConfig.toolbarHeight} !important;
          min-height: ${this.mobileConfig.toolbarHeight} !important;
        }
      }
    `)

    style.textContent = cssRules.join('\n')
  }

  // 移除功能样式
  private removeFeatureStyles() {
    const style = document.getElementById('toolbar-customizer-feature-style')
    if (style) {
      style.remove()
    }
    const hlStyle = document.getElementById('toolbar-customizer-jump-highlight-style')
    if (hlStyle) {
      hlStyle.remove()
    }
    // 兜底清理电脑端悬浮胶囊样式（applyDesktopFloatingToolbar 在 disableCustomButtons 时也会清理，
    // 这里作为 removeFeatureStyles 的双保险）
    const floatingStyle = document.getElementById('desktop-floating-toolbar-style')
    if (floatingStyle) {
      floatingStyle.remove()
    }
    document.body.classList.remove('siyuan-toolbar-desktop-floating')
  }
}
