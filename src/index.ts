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

// 导入新功能模块
import {
  initMobileToolbarAdjuster,
  initCustomButtons,
  cleanup,
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
  refreshDesktopFloatingScrollOnSwitch,
  triggerDesktopLifelogGlobalCapture
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
import { destroyDesktopQuickNoteBlockWindow, cleanupOrphanBlockWindows } from './quickNote/quickNoteBlockWindow'
import { cleanupImagePicker } from './quickNote/imageInsert'

// 导入 StressThreshold 清理函数
import {
  cleanupStressThreshold
} from './stressThreshold'

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
  private currentEditingButton: ButtonConfig | null = null

  // 全局按钮配置（批量设置所有按钮的默认值）
  private desktopGlobalButtonConfig: GlobalButtonConfig = { ...DEFAULT_DESKTOP_GLOBAL_BUTTON_CONFIG }
  private mobileGlobalButtonConfig: GlobalButtonConfig = { ...DEFAULT_MOBILE_GLOBAL_BUTTON_CONFIG }

  // 全局事件处理器引用（用于清理）
  private touchStartHandler: any = null
  private touchMoveHandler: any = null
  private touchEndHandler: any = null

  // EventBus 事件回调引用（用于清理）
  private eventBusRefreshHandler: (() => void) | null = null
  private eventBusContextMenuHandler: ((event: any) => void) | null = null
  private quickNoteTextareaContextMenuHandler: ((e: MouseEvent) => void) | null = null
  private _quickNoteTextareaDomLogged = false

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
    authorActivated: false,     // 鲸鱼定制工具箱是否已激活
    authorCode: '',              // 鲸鱼定制工具箱激活码
    authorAccount: '',           // 绑定的思源账号
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
    hideBreadcrumbIcon: true,   // 面包屑图标隐藏
    hideReadonlyButton: true,   // 锁定编辑按钮隐藏
    hideDocMenuButton: true,    // 文档菜单按钮隐藏
    hideMoreButton: true,       // 更多按钮隐藏
    toolbarStyle: 'divider' as 'default' | 'divider',  // 工具栏样式：默认或带分割线（手机端默认分割线）
    disableCustomButtons: false,// 禁用所有自定义按钮
    disableMobileSwipe: true,   // 手机端禁止左右滑动弹出
    showMobileLineBreakButton: false, // 顶部工具栏云同步左侧显示 H 换行按钮
    hideStatusBar: true,         // 手机端隐藏底部状态条 #status
    disableFileTree: true,      // 禁止右滑弹出文档树
    disableSettingMenu: true,   // 禁止左滑弹出设置菜单
    showAllNotifications: true, // 一键开启所有按钮右上角提示
    authorActivated: false,     // 鲸鱼定制工具箱是否已激活
    authorCode: '',             // 鲸鱼定制工具箱激活码
    authorAccount: '',           // 绑定的思源账号
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

  // 检查作者功能是否已激活
  private isAuthorToolActivated(): boolean {
    // 旧用户：authorActivated 为 true 且无绑定账号 -> 视为已激活（向后兼容）
    if (!this.desktopFeatureConfig.authorAccount && this.desktopFeatureConfig.authorActivated) return true
    if (!this.mobileFeatureConfig.authorAccount && this.mobileFeatureConfig.authorActivated) return true

    // 新用户：需要校验当前登录账号是否与绑定的账号一致
    const currentUser = this.getCurrentUserName()
    if (this.desktopFeatureConfig.authorActivated && this.desktopFeatureConfig.authorAccount === currentUser) return true
    if (this.mobileFeatureConfig.authorActivated && this.mobileFeatureConfig.authorAccount === currentUser) return true
    return false
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
    this.mobileFeatureConfig.authorActivated = false
    this.mobileFeatureConfig.authorCode = ''
    this.mobileFeatureConfig.authorAccount = ''
    await this.saveData('desktopFeatureConfig', this.desktopFeatureConfig)
    await this.saveData('mobileFeatureConfig', this.mobileFeatureConfig)
  }

  // 获取当前平台的功能配置（向后兼容）
  private get featureConfig() {
    return this.isMobile ? this.mobileFeatureConfig : this.desktopFeatureConfig
  }

  async onload() {
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
            showMessage('🆕 新增底部悬浮胶囊工具栏，可在「插件设置 → 电脑端全局工具栏配置」中调整位置和样式', 8000, 'info')
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
        const mobileProps = ['hideBreadcrumbIcon', 'hideReadonlyButton', 'hideDocMenuButton', 'hideMoreButton', 'disableMobileSwipe', 'disableFileTree', 'disableSettingMenu', 'showAllNotifications']

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

      if (!hasShownWelcome) {
        // 新用户，显示欢迎提示
        setTimeout(() => {
          if (this.isMobile) {
            showMessage('欢迎使用本插件！🎉\n\n已经默认添加按钮：\n①更多\n②打开菜单\n③锁住文档\n④插件设置\n⑤打开日记\n⑥插入时间\n⑦搜索\n⑧最近文档\n⑨鲸鱼快速批注', 0, 'info')
          } else {
            showMessage('欢迎使用本插件🎉\n\n已经默认添加按钮：\n①更多\n②打开菜单\n③锁住文档\n④插件设置\n⑤打开日记\n⑥插入时间\n⑦②打开伺服浏览器\n⑧最近文档\n⑨鲸鱼快速批注', 0, 'info')
          }
          // 立即写入标记，不再依赖用户打开设置面板
          this.saveData('hasShownWelcome', true).catch(() => { /* ignore */ })
        }, 2000)
      }
    } catch (error) {
      console.warn('加载配置失败，使用默认配置:', error)
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

    if (!this.isMobile) {
	      this.addCommand({
	        langKey: 'quickNoteGlobalCapture',
	        langText: '一键记事（全局捕获）',
	        hotkey: '⌥⇧N',
	        globalCallback: () => {
	          void triggerDesktopQuickNoteGlobalCapture()
	        },
	      })
	      this.addCommand({
	        langKey: 'lifelogGlobalCapture',
	        langText: '叶归LifeLog（全局捕获）',
	        hotkey: '⌥⇧L',
	        globalCallback: () => {
	          void triggerDesktopLifelogGlobalCapture()
	        },
	      })
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
              .then(() => console.log('[QuickNote] 清理残留草稿块:', blockId, 'from', key))
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

      // ===== 健康自检：冷启动慢机型上 .protyle-breadcrumb 可能晚于初始化窗口才渲染 =====
      // 此时 setupToolbar/setupEditorButtons 都会失败，且无任何兜底恢复入口（eventBus
      // 也可能已在监听器注册前触发完），导致胶囊永久消失。
      // 8 秒后自检一次：若工具栏就绪信号未成立则重建（仅 1 次，靠 reinit 内部短路防重复）。
      setTimeout(() => {
        this.reinitMobileToolbarIfMissing()
      }, 8000)
    }
  }

  // 初始化插件功能
  private async initPluginFunctions() {
    // 清理旧的功能
    cleanup()
  
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

    // ===== 使用思源 EventBus 监听编辑器加载事件（替代 MutationObserver，避免卡顿） =====
    // 先移除旧的监听器（避免重复监听）
    if (this.eventBusRefreshHandler) {
      this.eventBus.off('loaded-protyle-dynamic', this.eventBusRefreshHandler)
      this.eventBus.off('switch-protyle', this.eventBusRefreshHandler)
      this.eventBus.off('loaded-protyle-static', this.eventBusRefreshHandler)
    }
    // 定义刷新按钮的回调函数（电脑端直接创建按钮，避免 initCustomButtons 的重复清理和延迟）
    this.eventBusRefreshHandler = () => {
      if (this.isMobile) {
        // 手机端：如果禁用自定义按钮，直接返回不创建
        if (this.mobileFeatureConfig.disableCustomButtons) {
          return
        }
        // 手机端需要完整的初始化流程（包括溢出计算）
        initCustomButtons(this.mobileButtonConfigs)
      } else {
        // 电脑端直接创建按钮，无需 1 秒延迟和重复清理
        const editors = document.querySelectorAll('.protyle')
        if (editors.length > 0) {
          createButtonsForEditors(editors, this.desktopButtonConfigs)
        }
      }
      // 刷新工具栏滚动隐藏状态（切文档时锁状态可能变了）
      refreshToolbarAutoHide()
      // 刷新电脑端胶囊滚动隐藏（切文档/标签页时重置滚动基准，避免 delta 错乱导致失效）
      refreshDesktopFloatingScrollOnSwitch()
      // 刷新 Kmind-Zen 兼容检测（切文档时文档树状态可能变了）
      refreshKmindZenCompat()
    }
    // 监听编辑器动态加载完成事件（最快触发）
    this.eventBus.on('loaded-protyle-dynamic', this.eventBusRefreshHandler)
    // 监听编辑器切换事件（切换标签页时触发）
    this.eventBus.on('switch-protyle', this.eventBusRefreshHandler)
    // 监听编辑器静态加载完成事件（后备）
    this.eventBus.on('loaded-protyle-static', this.eventBusRefreshHandler)
    
    // ===== 初始化小窗模式检测器 =====
    // 在手机端检测小窗模式和前后台切换
    if (this.isMobile) {
      // 初始化小窗模式检测器
      initSmallWindowDetector()

	      // 从按钮配置中查找各模块的透明度、滚动隐藏（与 toggleVisibility 一致，避免重载后仅恢复可见态却丢失开关）
	      const findAuthorToolFloatOptions = (subtype: string): { floatOpacity?: number; autoHideOnScroll?: boolean; maxVisibleTabs?: number; floatPanelPosition?: string; collapseStyle?: 'preview' | 'minimal' } => {
	        const btn = this.mobileButtonConfigs.find(b => b.type === 'author-tool' && b.authorToolSubtype === subtype)
	        return {
	          floatOpacity: btn?.floatOpacity,
	          autoHideOnScroll: btn?.autoHideOnScroll,
	          maxVisibleTabs: btn?.maxVisibleTabs,
	          floatPanelPosition: btn?.floatPanelPosition,
	          collapseStyle: btn?.collapseStyle
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
        autoHideOnScroll: docNavOpts.autoHideOnScroll
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
      await initDesktopDocNav({
        saveData: (key, value) => this.saveData(key, value),
        loadData: (key) => this.loadData(key),
        eventBus: this.eventBus
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
          label: btn.name || '模板插入',
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
            console.warn('[QuickNote DOM] 未命中 quick-note wrapper，textarea 祖先链：', chain)
          } catch (err) {
            console.warn('[QuickNote DOM] 祖先链打印失败:', err)
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
   *  - onLayoutReady 8 秒自检（补丁2）
   *  - visibilitychange 切回前台（补丁3，windowDetector 调用）
   *
   * 就绪信号：
   *  - 底部固定/胶囊模式：.protyle-breadcrumb[__bar][data-input-method] 存在
   *  - 顶部模式：body.siyuan-toolbar-top-mode 生效（纯 CSS 驱动，breadcrumb 出现即生效，通常无需重建）
   *
   * 防重复：initMobileToolbarAdjuster 内部对 data-toolbar-customized==='true' 短路；
   *        initCustomButtons 内部做按钮差异判断。两者都允许安全重复调用。
   */
  reinitMobileToolbarIfMissing(): void {
    if (!this.isMobile) return
    // 禁用自定义按钮时不重建（与 initPluginFunctions 的跳过条件一致）
    if (this.mobileFeatureConfig.disableCustomButtons) return

    const cfg = this.mobileConfig
    const isTopMode = cfg.enableTopToolbar === true
    const isBottomOrFloating = cfg.enableBottomToolbar === true || cfg.enableFloatingToolbar === true

    // 判断"工具栏是否已就绪"
    let toolbarReady = false
    if (isTopMode) {
      // 顶部模式靠 body class + 纯 CSS 生效，breadcrumb 出现即认为就绪
      toolbarReady = document.body.classList.contains('siyuan-toolbar-top-mode')
        && !!document.querySelector('.protyle-breadcrumb, .protyle-breadcrumb__bar')
    } else if (isBottomOrFloating) {
      // 底部/胶囊模式：breadcrumb 必须被打上 data-input-method 属性才算 setup 成功
      toolbarReady = !!document.querySelector(
        '.protyle-breadcrumb[data-input-method], .protyle-breadcrumb__bar[data-input-method]'
      )
    }

    if (toolbarReady) return  // 一切正常，无需重建

    // breadcrumb 还没出现：不重建（避免提前 setup 再次失败），交给退避重试/EventBus 兜底
    const breadcrumbExists = !!document.querySelector(
      '.protyle-breadcrumb:not(.protyle-breadcrumb__bar), .protyle-breadcrumb__bar'
    )
    if (!breadcrumbExists) return

    // breadcrumb 已存在但 data-input-method 缺失：说明 setupToolbar 错过了窗口，立即重建
    initMobileToolbarAdjuster(this.mobileConfig, this.mobileFeatureConfig.disableCustomButtons)
    initCustomButtons(this.mobileButtonConfigs)
  }

  /** 思源同步仅变更插件存储数据（dataChangePlugins）时调用，不会触发 onunload/onload */
  async onDataChanged() {
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
    try { delete (window as any).__quickNoteFloatCommand } catch { /* ignore */ }

    // 清理资源
    cleanup()
    // 插件卸载时清除 pluginInstance（cleanup 中不再清除，因为重初始化时也会调用 cleanup）
    setPluginInstance(null)
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

    // 清理全局 touch 事件监听器
    if (this.touchStartHandler) {
      document.removeEventListener('touchstart', this.touchStartHandler, true)
      this.touchStartHandler = null
    }
    if (this.touchMoveHandler) {
      document.removeEventListener('touchmove', this.touchMoveHandler, false)
      this.touchMoveHandler = null
    }
    if (this.touchEndHandler) {
      document.removeEventListener('touchend', this.touchEndHandler, false)
      this.touchEndHandler = null
    }
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
          this.mobileFeatureConfig.hideBreadcrumbIcon = true
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
          showMessage('配置无变化，未保存', 3000, 'info')
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

        showMessage('设置已保存，正在重载...', 2000, 'info')

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
        mobileConfig: this.mobileConfig,
        version: this.version,
        isAuthorToolActivated: () => this.isAuthorToolActivated(),
        showConfirmDialog: (msg) => this.showConfirmDialog(msg),
        showIconPicker: (current, onSelect) => this.showIconPicker(current, onSelect),
        saveData: (key, value) => this.saveData(key, value),
        applyFeatures: () => this.applyFeatures(),
        refreshButtons: () => {
          // 刷新桌面端按钮
          initCustomButtons(this.desktopButtonConfigs)
        }
      }
      createDesktopSettingLayout(setting, context)
    }

    setting.open('思源手机端增强')

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
      mobileGlobalButtonConfig: this.mobileGlobalButtonConfig,
      mobileFeatureConfig: this.mobileFeatureConfig,
      mobileConfig: this.mobileConfig,
      desktopFeatureConfig: this.desktopFeatureConfig,
      isAuthorToolActivated: () => this.isAuthorToolActivated(),
      showConfirmDialog: (message) => this.showConfirmDialog(message),
      showIconPicker: (currentValue, onSelect) => this.showIconPicker(currentValue, onSelect),
      showButtonIdPicker: (currentValue, onSelect) => this.showButtonIdPicker(currentValue, onSelect),
      saveData: (key, value) => this.saveData(key, value),
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
    return showConfirmDialogModal({ message, confirmText: '删除', cancelText: '取消' })
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

    // ⑦手机端状态条隐藏
    if (this.isMobile && this.mobileFeatureConfig.hideStatusBar !== false) {
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

    // 手机端禁止左右滑动弹出
    if (this.isMobile && this.mobileFeatureConfig.disableMobileSwipe) {
      const { disableFileTree, disableSettingMenu } = this.mobileFeatureConfig
      
      if (disableFileTree && disableSettingMenu) {
        // 同时禁用文档树和设置菜单
        styleContent += `
          #sidebar.moving, #menu.moving, .side-mask.moving {
            display: none !important;
          }
        `
      } else if (disableFileTree) {
        // 仅禁用文档树（右滑）
        styleContent += `
          #sidebar.moving, .side-mask.moving.move-right {
            display: none !important;
          }
        `
      } else if (disableSettingMenu) {
        // 仅禁用设置菜单（左滑）
        styleContent += `
          #menu.moving, .side-mask.moving.move-left {
            display: none !important;
          }
        `
      }
      
      // 添加触摸事件监听
      this.setupMobileSwipeDisable()
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

  // 手机端滑动禁用的状态变量
  private swipeStartX = 0
  private swipeIsFirstMove = true
  private swipeMask: HTMLElement | null = null

  // 设置手机端滑动禁用
  private setupMobileSwipeDisable() {
    if (!this.isMobile || !this.mobileFeatureConfig.disableMobileSwipe) return
    if (!document.getElementById('sidebar')) return

    // 移除旧监听器（如果存在）
    if (this.touchStartHandler) {
      document.removeEventListener('touchstart', this.touchStartHandler, true)
    }
    if (this.touchMoveHandler) {
      document.removeEventListener('touchmove', this.touchMoveHandler, false)
    }
    if (this.touchEndHandler) {
      document.removeEventListener('touchend', this.touchEndHandler, false)
    }

    this.touchStartHandler = (e: TouchEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('#menu, #sidebar')) return

      this.swipeIsFirstMove = true
      const touch = e.touches[0]
      this.swipeStartX = touch.clientX
    }

    this.touchMoveHandler = (e: TouchEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('#menu, #sidebar')) return

      if (this.swipeIsFirstMove) {
        this.swipeIsFirstMove = false
        document.getElementById('menu')?.classList.add('moving')
        document.getElementById('sidebar')?.classList.add('moving')
        this.swipeMask = document.querySelector('.side-mask')
        this.swipeMask?.classList.add('moving')
      }

      const touch = e.touches[0]
      const currentX = touch?.clientX || 0
      const diffX = currentX - this.swipeStartX

      if (Math.abs(diffX) > 0 && this.swipeMask) {
        if (diffX < 0) {
          // 左滑 设置菜单
          if (this.swipeMask.classList.contains('move-right')) this.swipeMask.classList.remove('move-right')
          if (!this.swipeMask.classList.contains('move-left')) this.swipeMask.classList.add('move-left')
        } else {
          // 右滑 文档树
          if (this.swipeMask.classList.contains('move-left')) this.swipeMask.classList.remove('move-left')
          if (!this.swipeMask.classList.contains('move-right')) this.swipeMask.classList.add('move-right')
        }
        this.swipeStartX = currentX
      }
    }

    this.touchEndHandler = (e: TouchEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('#menu, #sidebar')) return

      if (!this.swipeIsFirstMove) {
        this.closeMobilePanel()
      }
      this.swipeIsFirstMove = true
      document.getElementById('menu')?.classList.remove('moving')
      document.getElementById('sidebar')?.classList.remove('moving')
      document.querySelector('.side-mask')?.classList.remove('moving')
    }

    // 添加新监听器
    document.addEventListener('touchstart', this.touchStartHandler, true)
    document.addEventListener('touchmove', this.touchMoveHandler, false)
    document.addEventListener('touchend', this.touchEndHandler, false)
  }
  
  // 关闭手机端侧边栏
  private closeMobilePanel() {
    const menu = document.getElementById('menu')
    const sidebar = document.getElementById('sidebar')
    const maskElement = document.querySelector('.side-mask') as HTMLElement
    
    if (menu) menu.style.transform = ''
    if (sidebar) sidebar.style.transform = ''
    if (maskElement) {
      maskElement.classList.add('fn__none')
      maskElement.style.opacity = ''
    }
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
