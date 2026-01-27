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
  DEFAULT_BUTTONS_CONFIG,
  DEFAULT_DESKTOP_BUTTONS,
  DEFAULT_MOBILE_BUTTONS,
  DEFAULT_MOBILE_CONFIG,
  MobileToolbarConfig,
  ButtonConfig,
  GlobalButtonConfig,
  DEFAULT_GLOBAL_BUTTON_CONFIG,
  isMobileDevice,
  calculateButtonOverflow
} from './toolbarManager'

// 导入 UI 组件
import { showConfirmDialog as showConfirmDialogModal } from './ui/dialog'
import { showButtonSelector, type ButtonInfo } from './ui/buttonSelector'
import { showIconPicker as showIconPickerModal } from './ui/iconPicker'
import { showClickSequenceSelector } from './ui/clickSequenceSelector'
import { updateIconDisplay as updateIconDisplayUtil } from './data/icons'
// 导入标签切换器
import { injectTabSwitcher as injectTabSwitcherUtil, cleanupTabSwitcher } from './ui/tabs'
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
  private desktopGlobalButtonConfig: GlobalButtonConfig = { ...DEFAULT_GLOBAL_BUTTON_CONFIG }
  private mobileGlobalButtonConfig: GlobalButtonConfig = { ...DEFAULT_GLOBAL_BUTTON_CONFIG }

  // 全局事件处理器引用（用于清理）
  private touchStartHandler: any = null
  private touchMoveHandler: any = null
  private touchEndHandler: any = null

  // 待保存的欢迎标记（延迟到用户保存设置时写入）
  private _pendingWelcomeSave = false

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
    disableCustomButtons: false,// 禁用所有自定义按钮（恢复思源原始状态，仅桌面端）
    showAllNotifications: true, // 一键开启所有按钮右上角提示
    authorActivated: false,     // 作者自用工具是否已激活
    authorCode: ''              // 作者自用工具激活码
  }

  // 手机端小功能配置
  private mobileFeatureConfig = {
    hideBreadcrumbIcon: true,   // 面包屑图标隐藏
    hideReadonlyButton: true,   // 锁定编辑按钮隐藏
    hideDocMenuButton: true,    // 文档菜单按钮隐藏
    hideMoreButton: true,       // 更多按钮隐藏
    disableMobileSwipe: true,   // 手机端禁止左右滑动弹出
    disableFileTree: true,      // 禁止右滑弹出文档树
    disableSettingMenu: true,   // 禁止左滑弹出设置菜单
    showAllNotifications: true, // 一键开启所有按钮右上角提示
    authorActivated: false,     // 作者自用工具是否已激活
    authorCode: ''              // 作者自用工具激活码
  }

  // 检查作者功能是否已激活
  private isAuthorToolActivated(): boolean {
    // 电脑端和手机端共享激活状态
    return this.desktopFeatureConfig.authorActivated || this.mobileFeatureConfig.authorActivated
  }

  // 获取当前平台的功能配置（向后兼容）
  private get featureConfig() {
    return this.isMobile ? this.mobileFeatureConfig : this.desktopFeatureConfig
  }

  async onload() {
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
      }

      // 加载电脑端按钮配置
      const savedDesktopButtons = await this.loadData('desktopButtonConfigs')
      if (Array.isArray(savedDesktopButtons)) {
        // 配置存在且是数组，使用保存的配置
        this.desktopButtonConfigs = savedDesktopButtons.map((btn: any) => ({
          ...btn,
          minWidth: btn.minWidth !== undefined ? btn.minWidth : 32,
          showNotification: btn.showNotification !== undefined ? btn.showNotification : true,
          clickSequence: btn.clickSequence || []
        }))
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
            iconSize: 18,
            minWidth: 32,
            marginRight: 8,
            sort: 0,
            platform: 'mobile',
            showNotification: false,
            layers: 1
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

      // 同步全局按钮配置的 showNotification 到所有电脑端按钮
      // 确保全局配置和单个按钮配置保持一致
      if (this.desktopGlobalButtonConfig.showNotification !== undefined) {
        this.desktopButtonConfigs.forEach(btn => {
          btn.showNotification = this.desktopGlobalButtonConfig.showNotification
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

      // 同步全局按钮配置的 showNotification 到所有手机端按钮
      // 确保全局配置和单个按钮配置保持一致
      if (this.mobileGlobalButtonConfig.showNotification !== undefined) {
        this.mobileButtonConfigs.forEach(btn => {
          btn.showNotification = this.mobileGlobalButtonConfig.showNotification
        })
      }

      // 同步 showAllNotifications 设置到所有按钮
      // 电脑端
      this.desktopButtonConfigs.forEach(btn => {
        if (this.desktopFeatureConfig.showAllNotifications !== undefined) {
          btn.showNotification = this.desktopFeatureConfig.showAllNotifications
        }
      })
      // 手机端
      this.mobileButtonConfigs.forEach(btn => {
        if (this.mobileFeatureConfig.showAllNotifications !== undefined) {
          btn.showNotification = this.mobileFeatureConfig.showAllNotifications
        }
      })

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
      // 检查是否显示过首次安装提示
      const hasShownWelcome = await this.loadData('hasShownWelcome')
      if (!hasShownWelcome) {
        // 延迟显示欢迎提示，确保界面完全加载
        setTimeout(() => {
          if (this.isMobile) {
            showMessage('欢迎使用本插件！🎉\n\n已经默认添加按钮：\n①更多\n②打开菜单\n③锁住文档\n④插件设置\n⑤打开日记\n⑥插入时间\n⑦搜索', 0, 'info')
          } else {
            showMessage('欢迎使用本插件🎉\n\n已经默认添加按钮：\n①更多\n②打开菜单\n③锁住文档\n④插件设置\n⑤打开日记\n⑥插入时间\n⑦伺服浏览器', 0, 'info')
          }
          // 只设置标记，不立即写入，等待用户保存设置时一并写入
          this._pendingWelcomeSave = true
        }, 2000)
      }
    } catch (error) {
      console.warn('加载配置失败，使用默认配置:', error)
    }

    // ===== 初始化 Vue 应用 =====
    init(this)
    
    // ===== 应用小功能 =====
    this.applyFeatures()
  }

  // 布局就绪后初始化（确保 DOM 完全加载）
  onLayoutReady() {
    this.initPluginFunctions()
    
    // ===== 应用手机端工具栏样式 =====
    if (this.isMobile) {
      // 延迟应用以确保 toolbarManager 的样式已经加载
      setTimeout(() => {
        this.applyMobileToolbarStyle()
      }, 500)
    }
  }

  // 初始化插件功能
  private initPluginFunctions() {
    // 清理旧的功能
    cleanup()
  
    // ===== 初始化移动端工具栏调整 =====
    initMobileToolbarAdjuster(this.mobileConfig)

    // ===== 初始化自定义按钮 =====
    // 根据当前平台选择对应的按钮配置
    const buttonsToInit = this.isMobile ? this.mobileButtonConfigs : this.desktopButtonConfigs
    initCustomButtons(buttonsToInit)
  }

  onunload() {
    // 清理资源
    cleanup()
    destroy()

    // 清理标签切换器资源
    cleanupTabSwitcher()

    // 移除动态样式
    this.removeFeatureStyles()

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
    // 卸载时删除插件配置数据
    await this.removeData('mobileToolbarConfig')
    await this.removeData('desktopButtonConfigs')
    await this.removeData('mobileButtonConfigs')
    await this.removeData('featureConfig')
  }

  openSetting() {
    const setting = new Setting({
      width: this.isMobile ? '100%' : '800px',
      height: this.isMobile ? '100%' : '70vh',
      confirmCallback: async () => {
        // 同步全局按钮配置到所有按钮（在保存前）
        // 获取当前的全局配置值
        const globalIconSize = this.mobileGlobalButtonConfig.iconSize
        const globalMinWidth = this.mobileGlobalButtonConfig.minWidth
        const globalMarginRight = this.mobileGlobalButtonConfig.marginRight
        const globalShowNotification = this.mobileGlobalButtonConfig.showNotification

        // 应用到所有移动端按钮
        this.mobileButtonConfigs.forEach(btn => {
          // 只有当按钮使用的是默认值时才更新（避免覆盖用户自定义值）
          // 这里简单处理：总是更新，因为用户可以在全局配置中修改
          btn.iconSize = globalIconSize
          btn.minWidth = globalMinWidth
          btn.marginRight = globalMarginRight
          // showNotification 暂时保留原有逻辑，如果未设置则使用全局值
          if (btn.showNotification === undefined) {
            btn.showNotification = globalShowNotification
          }
        })

        // 如果扩展工具栏按钮启用，强制隐藏相关按钮
        const overflowBtn = this.mobileButtonConfigs.find(btn => btn.id === 'overflow-button-mobile')
        if (overflowBtn && overflowBtn.enabled !== false) {
          this.mobileFeatureConfig.hideBreadcrumbIcon = true
          this.mobileFeatureConfig.hideReadonlyButton = true
          this.mobileFeatureConfig.hideDocMenuButton = true
          this.mobileFeatureConfig.hideMoreButton = true

          // 重新计算所有按钮的溢出层级
          const overflowLayers = overflowBtn.layers || 1
          console.log('[保存设置] 准备调用溢出检测，层数:', overflowLayers)
          const updatedButtons = calculateButtonOverflow(this.mobileButtonConfigs, overflowLayers)
          // 更新按钮的溢出层级
          updatedButtons.forEach(btn => {
            const original = this.mobileButtonConfigs.find(b => b.id === btn.id)
            if (original) {
              original.overflowLevel = btn.overflowLevel
            }
          })
        }

        await this.saveData('mobileToolbarConfig', this.mobileConfig)
        await this.saveData('desktopButtonConfigs', this.desktopButtonConfigs)
        await this.saveData('mobileButtonConfigs', this.mobileButtonConfigs)
        await this.saveData('desktopFeatureConfig', this.desktopFeatureConfig)
        await this.saveData('mobileFeatureConfig', this.mobileFeatureConfig)

        // 如果有待保存的欢迎标记，一并保存
        if (this._pendingWelcomeSave) {
          await this.saveData('hasShownWelcome', true)
          this._pendingWelcomeSave = false
        }

        showMessage('设置已保存，正在重载...', 2000, 'info')

        // 使用官方 API 重载界面
        await fetchSyncPost('/api/system/reloadUI', {})
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
        desktopFeatureConfig: this.desktopFeatureConfig,
        mobileFeatureConfig: this.mobileFeatureConfig,
        mobileConfig: this.mobileConfig,
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

    setting.open('工具栏定制器')

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
      applyMobileToolbarStyle: () => this.applyMobileToolbarStyle(),
      updateMobileToolbar: () => {
        initMobileToolbarAdjuster(this.mobileConfig)
        const buttonsToInit = this.mobileButtonConfigs
        initCustomButtons(buttonsToInit)
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
          const updatedButtons = calculateButtonOverflow(this.mobileButtonConfigs, overflowLayers)
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
  private showIconPicker(currentValue: string, onSelect: (icon: string) => void) {
    showIconPickerModal({ currentValue, onSelect })
  }

  // 应用小功能
  private applyFeatures() {
    // 移除旧样式
    this.removeFeatureStyles()

    const style = document.createElement('style')
    style.id = 'toolbar-customizer-feature-style'

    let styleContent = ''

    // 面包屑图标隐藏（使用 transform 缩放到 0，保持按钮位置不变）
    // 当桌面端禁用自定义按钮时，跳过此设置
    if (this.featureConfig.hideBreadcrumbIcon && !(this.desktopFeatureConfig.disableCustomButtons && !this.isMobile)) {
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
    if (this.featureConfig.hideReadonlyButton && !(this.desktopFeatureConfig.disableCustomButtons && !this.isMobile)) {
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
    if (this.featureConfig.hideDocMenuButton && !(this.desktopFeatureConfig.disableCustomButtons && !this.isMobile)) {
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
    if (this.featureConfig.hideMoreButton && !(this.desktopFeatureConfig.disableCustomButtons && !this.isMobile)) {
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
    if (!this.isMobile && this.desktopFeatureConfig.toolbarHeight !== undefined && this.desktopFeatureConfig.toolbarHeight !== 32 && !this.desktopFeatureConfig.disableCustomButtons) {
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

    // 桌面端：禁用自定义按钮（恢复思源原始状态）
    // 前面的所有修改CSS都已跳过，这里只需要隐藏自定义按钮
    if (!this.isMobile && this.desktopFeatureConfig.disableCustomButtons) {
      styleContent += `
        /* 隐藏所有自定义按钮 */
        .protyle-breadcrumb__bar button[data-custom-button],
        .protyle-breadcrumb button[data-custom-button] {
          display: none !important;
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

    // 注意：背景颜色由 toolbarManager 中的 applyToolbarBackgroundColor 处理
    // 这里只处理需要动态更新的样式（如工具栏高度）

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
    document.head.appendChild(style)
  }

  // 移除功能样式
  private removeFeatureStyles() {
    const style = document.getElementById('toolbar-customizer-feature-style')
    if (style) {
      style.remove()
    }
  }
}
