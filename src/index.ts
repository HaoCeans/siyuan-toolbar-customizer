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
  isMobileDevice
} from './toolbarManager'

// 导入 UI 组件
import { showConfirmDialog as showConfirmDialogModal } from './ui/dialog'
import { showButtonSelector, type ButtonInfo } from './ui/buttonSelector'
import { showIconPicker as showIconPickerModal } from './ui/iconPicker'
import { showClickSequenceSelector } from './ui/clickSequenceSelector'
import { updateIconDisplay as updateIconDisplayUtil } from './data/icons'

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
    toolbarButtonWidth: 20      // 工具栏按钮全局宽度（px）
  }

  // 手机端小功能配置
  private mobileFeatureConfig = {
    hideBreadcrumbIcon: true,   // 面包屑图标隐藏
    hideReadonlyButton: true,   // 锁定编辑按钮隐藏
    hideDocMenuButton: true,    // 文档菜单按钮隐藏
    hideMoreButton: true,       // 更多按钮隐藏
    toolbarButtonWidth: 32,     // 工具栏按钮全局宽度（px）
    disableMobileSwipe: true,   // 手机端禁止左右滑动弹出
    disableFileTree: true,      // 禁止右滑弹出文档树
    disableSettingMenu: true    // 禁止左滑弹出设置菜单
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

      // 向后兼容：尝试加载旧的 featureConfig 并迁移到对应平台
      const savedLegacyFeatureConfig = await this.loadData('featureConfig')
      if (savedLegacyFeatureConfig) {
        // 只迁移新配置中存在的属性
        const desktopProps = ['hideBreadcrumbIcon', 'hideReadonlyButton', 'hideDocMenuButton', 'hideMoreButton', 'toolbarButtonWidth']
        const mobileProps = ['hideBreadcrumbIcon', 'hideReadonlyButton', 'hideDocMenuButton', 'hideMoreButton', 'toolbarButtonWidth', 'disableMobileSwipe', 'disableFileTree', 'disableSettingMenu']

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
          // 标记已显示过欢迎提示
          this.saveData('hasShownWelcome', true)
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
    
    // 移除动态样式
    this.removeFeatureStyles()
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
        await this.saveData('mobileToolbarConfig', this.mobileConfig)
        await this.saveData('desktopButtonConfigs', this.desktopButtonConfigs)
        await this.saveData('mobileButtonConfigs', this.mobileButtonConfigs)
        await this.saveData('desktopFeatureConfig', this.desktopFeatureConfig)
        await this.saveData('mobileFeatureConfig', this.mobileFeatureConfig)
        
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
      this.createMobileSettingLayout(setting)
    } else {
      // 电脑端：使用标签切换布局
      this.createDesktopSettingLayout(setting)
    }

    setting.open('工具栏定制器')

    // 电脑端：对话框打开后注入标签栏
    if (!this.isMobile) {
      this.injectTabSwitcher()
    }
  }

  // 电脑端设置布局
  private createDesktopSettingLayout(setting: Setting) {
    // === 电脑端配置项 ===

    // 电脑端自定义按钮
    setting.addItem({
      title: '🖥️ 电脑端自定义按钮',
      description: '管理电脑端工具栏自定义按钮（可拖动排序）',
      createActionElement: () => {
        const wrapper = document.createElement('div')
        wrapper.className = 'toolbar-customizer-content'
        wrapper.dataset.tabGroup = 'desktop'
        wrapper.style.cssText = 'display: flex; flex-direction: column; gap: 8px; width: 100%;'

        const listContainer = document.createElement('div')
        listContainer.style.cssText = 'display: flex; flex-direction: column; gap: 10px;'

        let lastAddedButtonId: string | null = null

        const renderList = () => {
          listContainer.innerHTML = ''
          const sortedButtons = [...this.desktopButtonConfigs].sort((a, b) => a.sort - b.sort)

          sortedButtons.forEach((button, index) => {
            const item = this.createDesktopButtonItem(button, index, renderList, this.desktopButtonConfigs)
            listContainer.appendChild(item)

            if (lastAddedButtonId && button.id === lastAddedButtonId) {
              setTimeout(() => {
                const header = item.querySelector('[style*="cursor: pointer"]') as HTMLElement
                if (header) {
                  header.click()
                  item.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                }
                lastAddedButtonId = null
              }, 100)
            }
          })
        }

        const addBtn = document.createElement('button')
        addBtn.className = 'b3-button b3-button--outline'
        addBtn.style.cssText = 'width: 100%; margin-bottom: 12px; padding: 10px; border-radius: 6px; font-size: 14px;'
        addBtn.textContent = '+ 添加新按钮'
        addBtn.onclick = () => {
          const newButton: ButtonConfig = {
            id: `button_${Date.now()}`,
            name: '新按钮',
            type: 'builtin',
            builtinId: 'menuSearch',
            icon: 'iconHeart',
            iconSize: 18,
            minWidth: 32,
            marginRight: 8,
            sort: this.desktopButtonConfigs.length + 1,
            platform: 'both',
            showNotification: true,
            enabled: true
          }
          this.desktopButtonConfigs.push(newButton)
          lastAddedButtonId = newButton.id
          renderList()
        }

        renderList()
        wrapper.appendChild(addBtn)
        wrapper.appendChild(listContainer)
        return wrapper
      }
    })

    // 小功能选择
    setting.addItem({
      title: '⚙️ 小功能选择',
      description: '界面微调与体验优化',
      createActionElement: () => {
        const container = document.createElement('div')
        container.className = 'toolbar-customizer-content'
        container.dataset.tabGroup = 'desktop'
        container.style.cssText = 'display: flex; flex-direction: column; gap: 12px;'

        const createSwitchItem = (labelText: string, checked: boolean, onChange: (value: boolean) => void) => {
          const item = document.createElement('div')
          item.style.cssText = 'display: flex; align-items: center; gap: 12px;'

          const label = document.createElement('label')
          label.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); min-width: 120px;'
          label.textContent = labelText

          const switchEl = document.createElement('input')
          switchEl.type = 'checkbox'
          switchEl.className = 'b3-switch'
          switchEl.checked = checked
          switchEl.onchange = async () => {
            onChange(switchEl.checked)
            await this.saveData('desktopFeatureConfig', this.desktopFeatureConfig)
            this.applyFeatures()
          }

          item.appendChild(label)
          item.appendChild(switchEl)
          return item
        }

        // 工具栏按钮宽度
        const widthItem = document.createElement('div')
        widthItem.style.cssText = 'display: flex; flex-direction: column; gap: 4px;'

        const widthRow = document.createElement('div')
        widthRow.style.cssText = 'display: flex; align-items: center; gap: 12px;'

        const widthLabel = document.createElement('label')
        widthLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); min-width: 120px;'
        widthLabel.textContent = '工具栏按钮宽度'

        const widthInput = document.createElement('input')
        widthInput.type = 'number'
        widthInput.value = this.desktopFeatureConfig.toolbarButtonWidth.toString()
        widthInput.className = 'b3-text-field'
        widthInput.style.cssText = 'width: 80px;'
        widthInput.onchange = async () => {
          this.desktopFeatureConfig.toolbarButtonWidth = parseInt(widthInput.value) || 32
          await this.saveData('desktopFeatureConfig', this.desktopFeatureConfig)
          this.applyFeatures()
        }

        widthRow.appendChild(widthLabel)
        widthRow.appendChild(widthInput)

        const widthDesc = document.createElement('div')
        widthDesc.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light); padding-left: 4px;'
        widthDesc.textContent = '💡 可整体调整按钮间的宽度'

        widthItem.appendChild(widthRow)
        widthItem.appendChild(widthDesc)
        container.appendChild(widthItem)

        container.appendChild(createSwitchItem('面包屑图标隐藏', this.desktopFeatureConfig.hideBreadcrumbIcon, (v) => {
          this.desktopFeatureConfig.hideBreadcrumbIcon = v
        }))

        container.appendChild(createSwitchItem('锁定编辑按钮隐藏', this.desktopFeatureConfig.hideReadonlyButton, (v) => {
          this.desktopFeatureConfig.hideReadonlyButton = v
        }))

        container.appendChild(createSwitchItem('文档菜单按钮隐藏', this.desktopFeatureConfig.hideDocMenuButton, (v) => {
          this.desktopFeatureConfig.hideDocMenuButton = v
        }))

        container.appendChild(createSwitchItem('更多按钮隐藏', this.desktopFeatureConfig.hideMoreButton, (v) => {
          this.desktopFeatureConfig.hideMoreButton = v
        }))

        return container
      }
    })

    // === 手机端配置项 ===

    // 手机端自定义按钮
    setting.addItem({
      title: '📱 手机端自定义按钮',
      description: `已配置 ${this.mobileButtonConfigs.length} 个按钮，点击展开编辑`,
      createActionElement: () => {
        const wrapper = document.createElement('div')
        wrapper.className = 'toolbar-customizer-content'
        wrapper.dataset.tabGroup = 'mobile'
        wrapper.style.cssText = 'display: flex; flex-direction: column; gap: 8px; width: 100%;'

        const listContainer = document.createElement('div')
        listContainer.style.cssText = 'display: flex; flex-direction: column; gap: 10px;'

        let lastAddedButtonId: string | null = null

        const renderList = () => {
          listContainer.innerHTML = ''
          const sortedButtons = [...this.mobileButtonConfigs].sort((a, b) => a.sort - b.sort)

          sortedButtons.forEach((button, index) => {
            const item = this.createMobileButtonItem(button, index, renderList, this.mobileButtonConfigs)
            listContainer.appendChild(item)

            if (lastAddedButtonId && button.id === lastAddedButtonId) {
              setTimeout(() => {
                const header = item.querySelector('[style*="cursor: pointer"]') as HTMLElement
                if (header) {
                  header.click()
                  item.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }
                lastAddedButtonId = null
              }, 100)
            }
          })
        }

        const addBtn = document.createElement('button')
        addBtn.className = 'b3-button b3-button--outline'
        addBtn.style.cssText = 'width: 100%; margin-bottom: 12px; padding: 10px; border-radius: 6px; font-size: 14px;'
        addBtn.textContent = '+ 添加新按钮'
        addBtn.onclick = () => {
          const newButton: ButtonConfig = {
            id: `button_${Date.now()}`,
            name: '新按钮',
            type: 'builtin',
            builtinId: 'menuSearch',
            icon: 'iconHeart',
            iconSize: 18,
            minWidth: 32,
            marginRight: 8,
            sort: this.mobileButtonConfigs.length + 1,
            platform: 'both',
            showNotification: true,
            enabled: true
          }
          this.mobileButtonConfigs.push(newButton)
          lastAddedButtonId = newButton.id
          renderList()
        }

        renderList()
        wrapper.appendChild(addBtn)
        wrapper.appendChild(listContainer)
        return wrapper
      }
    })

    // 底部工具栏配置
    setting.addItem({
      title: '📱 底部工具栏配置',
      description: '💡 开启后才能调整输入法位置相关设置',
      createActionElement: () => {
        const container = document.createElement('div')
        container.className = 'toolbar-customizer-content'
        container.dataset.tabGroup = 'mobile'
        container.style.cssText = 'display: flex; flex-direction: column; gap: 12px;'

        // 是否将工具栏置底
        const toggleRow = document.createElement('div')
        toggleRow.style.cssText = `
         width:100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          background: var(--b3-theme-surface);
          border-radius: 8px;
          border: 1px solid var(--b3-border-color);
        `

        const toggleLabel = document.createElement('span')
        toggleLabel.textContent = '是否将工具栏置底'
        toggleLabel.style.cssText = 'font-size: 14px; color: var(--b3-theme-on-surface); font-weight: 500;'

        const toggle = document.createElement('input')
        toggle.type = 'checkbox'
        toggle.className = 'b3-switch'
        toggle.checked = this.mobileConfig.enableBottomToolbar
        toggle.onchange = async () => {
          this.mobileConfig.enableBottomToolbar = toggle.checked
          await this.saveData('mobileConfig', this.mobileConfig)
        }

        toggleRow.appendChild(toggleLabel)
        toggleRow.appendChild(toggle)
        container.appendChild(toggleRow)

        return container
      }
    })
  }

  // 注入标签切换器
  private injectTabSwitcher() {
    // 等待对话框渲染完成
    setTimeout(() => {
      const dialogContent = document.querySelector('.b3-dialog__content')
      if (!dialogContent) return

      // 隐藏配置项的标题部分（左边的 .fn__flex-1），因为我们用标签切换器了
      const style = document.createElement('style')
      style.textContent = `
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

      const previewConfig = {
      width: '100%',                 // 宽度：'100%' / '300px' / '20rem' 等
      fontSize: '17px',
      textColor: '#000000ff',         // 文字颜色
      bgColor: '#a3bcf1ff',            // 默认背景色
      hoverBgColor: '#2563eb',       // 悬停背景色
      borderColor: '#2563eb'         // 边框颜色
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
      const switchTab = (type: 'desktop' | 'mobile') => {
        // 更新按钮样式
        if (type === 'desktop') {
          desktopTab.classList.add('b3-button--primary')
          desktopTab.classList.remove('b3-button--outline')
          mobileTab.classList.remove('b3-button--primary')
          mobileTab.classList.add('b3-button--outline')
          previewLink.style.display = 'none'
          previewHint.style.display = 'none'
        } else {
          mobileTab.classList.add('b3-button--primary')
          mobileTab.classList.remove('b3-button--outline')
          desktopTab.classList.remove('b3-button--primary')
          desktopTab.classList.add('b3-button--outline')
          previewLink.style.display = 'block'
          previewHint.style.display = 'block'
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

      tabsContainer.appendChild(desktopTab)
      tabsContainer.appendChild(mobileTab)

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

  // 手机端设置布局
  private createMobileSettingLayout(setting: Setting) {
    // === 分组标题样式 ===
    const createGroupTitle = (icon: string, title: string) => {
      setting.addItem({
        title: '',
        description: '',
        createActionElement: () => {
          const titleEl = document.createElement('div')
          titleEl.style.cssText = `
            padding: 16px 16px 8px 16px;
            margin: 8px -16px 0 -16px;
            font-size: 15px;
            font-weight: 600;
            color: var(--b3-theme-on-background);
            border-bottom: 1px solid var(--b3-border-color);
            background: var(--b3-theme-surface);
            display: flex;
            align-items: center;
            gap: 8px;
          `
          titleEl.innerHTML = `<span style="font-size: 18px;">${icon}</span>${title}`
          return titleEl
        }
      })
    }

    // === 自定义按钮 ===
    createGroupTitle('📱', '手机端自定义按钮')

    setting.addItem({
      title: '按钮列表（可长按拖动排序）',
      description: `已配置 ${this.isMobile ? this.mobileButtonConfigs.length : this.desktopButtonConfigs.length} 个按钮，点击展开编辑`,
      createActionElement: () => {
        const container = document.createElement('div')
        container.style.cssText = 'width: 100%; padding: 8px 0;'
        
        // 添加按钮
        const addBtn = document.createElement('button')
        addBtn.className = 'b3-button b3-button--outline'
        addBtn.style.cssText = `
          width: 100%;
          margin-bottom: 12px;
          padding: 10px;
          font-size: 14px;
          border-radius: 6px;
        `
        addBtn.textContent = '+ 添加新按钮'
        
        const listContainer = document.createElement('div')
        listContainer.style.cssText = 'display: flex; flex-direction: column; gap: 10px;'
        
        let lastAddedButtonId: string | null = null
        
        const renderList = () => {
          listContainer.innerHTML = ''
          const sortedButtons = [...this.buttonConfigs].sort((a, b) => a.sort - b.sort)
          
          sortedButtons.forEach((button, index) => {
            const item = this.createMobileButtonItem(button, index, renderList, this.buttonConfigs)
            listContainer.appendChild(item)
            
            // 只有在是刚添加的按钮时才自动展开
            if (lastAddedButtonId && button.id === lastAddedButtonId) {
              // 使用 setTimeout 确保 DOM 已渲染
              setTimeout(() => {
                const header = item.querySelector('[style*="cursor: pointer"]') as HTMLElement
                if (header) {
                  header.click()
                  // 滚动到该按钮
                  item.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }
                // 清除标记
                lastAddedButtonId = null
              }, 100)
            }
          })
        }
        
        addBtn.onclick = () => {
          const newButton: ButtonConfig = {
            id: `button_${Date.now()}`,
            name: '新按钮',
            type: 'builtin',
            builtinId: 'menuSearch',
            icon: 'iconHeart',
            iconSize: 18,
            minWidth: 32,
            marginRight: 8,
            sort: this.buttonConfigs.length + 1,
            platform: 'both',
            showNotification: true
          }
          this.buttonConfigs.push(newButton)
          lastAddedButtonId = newButton.id
          renderList()
        }
        
        renderList()
        
        container.appendChild(addBtn)
        container.appendChild(listContainer)
        return container
      }
    })


    // === 移动端工具栏设置 ===

    // === 全局工具栏配置 ===
    createGroupTitle('📱', '全局工具栏配置')

    // 工具栏按钮宽度
    setting.addItem({
      title: '📏栏内按钮均匀分布',
      description: '💡可整体调整按钮间的宽度。<br>   调整建议：每次增加50，会明显变化，感觉合适后，再微调！',
      createActionElement: () => {
        const input = document.createElement('input')
        input.className = 'b3-text-field fn__flex-center fn__size200'
        input.type = 'number'
        input.value = this.mobileFeatureConfig.toolbarButtonWidth.toString()
        input.style.cssText = 'font-size: 14px; padding: 8px;'
        input.onchange = async () => {
          this.mobileFeatureConfig.toolbarButtonWidth = parseInt(input.value) || 32
          await this.saveData('mobileFeatureConfig', this.mobileFeatureConfig)
          this.applyFeatures()
        }
        return input
      }
    })

    // 工具栏自身高度
    setting.addItem({
      title: '①工具栏自身高度',
      description: '💡设置工具栏自身的高度',
      createActionElement: () => {
        const input = document.createElement('input')
        input.className = 'b3-text-field fn__flex-center fn__size200'
        input.type = 'text'
        input.value = this.mobileConfig.toolbarHeight
        input.style.cssText = 'font-size: 14px; padding: 8px;'
        input.onchange = async () => {
          this.mobileConfig.toolbarHeight = input.value
          await this.saveData('mobileConfig', this.mobileConfig)
          this.applyMobileToolbarStyle()
        }
        return input
      }
    })

    // 工具栏背景颜色
    setting.addItem({
      title: '②工具栏背景颜色',
      description: '💡点击色块选择颜色，或直接输入颜色值，或跟随主题',
      createActionElement: () => {
        const container = document.createElement('div')
        container.style.cssText = 'display: flex; align-items: center; gap: 8px;'

        // 颜色选择器
        const colorPicker = document.createElement('input')
        colorPicker.type = 'color'
        colorPicker.value = this.mobileConfig.toolbarBackgroundColor
        colorPicker.style.cssText = 'width: 50px; height: 36px; border: 1px solid var(--b3-border-color); border-radius: 4px; cursor: pointer; flex-shrink: 0;'

        // 文本输入框（鸿蒙系统备用）
        const textInput = document.createElement('input')
        textInput.className = 'b3-text-field'
        textInput.type = 'text'
        textInput.value = this.mobileConfig.toolbarBackgroundColor
        textInput.placeholder = '#f8f9fa'
        textInput.style.cssText = 'width: 80px; font-size: 14px; padding: 6px 8px;'

        // 跟随主题颜色开关
        const themeCheckbox = document.createElement('input')
        themeCheckbox.type = 'checkbox'
        themeCheckbox.className = 'b3-switch'
        themeCheckbox.checked = this.mobileConfig.useThemeColor || false
        themeCheckbox.style.cssText = 'transform: scale(0.8); margin-left: 4px;'

        // 主题色标签
        const themeLabel = document.createElement('span')
        themeLabel.textContent = '跟随主题'
        themeLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-background); margin-left: 2px;'

        // 更新禁用状态
        const updateDisabledState = () => {
          const isTheme = themeCheckbox.checked
          colorPicker.disabled = isTheme
          textInput.disabled = isTheme
          colorPicker.style.opacity = isTheme ? '0.4' : ''
          textInput.style.opacity = isTheme ? '0.4' : ''
        }

        // 初始化禁用状态
        updateDisabledState()

        // 同步颜色选择器和文本框
        colorPicker.onchange = async () => {
          this.mobileConfig.toolbarBackgroundColor = colorPicker.value
          textInput.value = colorPicker.value
          await this.saveData('mobileConfig', this.mobileConfig)
          this.applyMobileToolbarStyle()
        }

        textInput.onchange = async () => {
          const colorValue = textInput.value.trim()
          if (colorValue) {
            this.mobileConfig.toolbarBackgroundColor = colorValue
            colorPicker.value = colorValue.startsWith('#') ? colorValue : '#f8f9fa'
            await this.saveData('mobileConfig', this.mobileConfig)
            this.applyMobileToolbarStyle()
          }
        }

        // 主题色开关变化
        themeCheckbox.onchange = async () => {
          this.mobileConfig.useThemeColor = themeCheckbox.checked
          updateDisabledState()
          await this.saveData('mobileConfig', this.mobileConfig)
          this.applyMobileToolbarStyle()
        }

        container.appendChild(colorPicker)
        container.appendChild(textInput)
        container.appendChild(themeCheckbox)
        container.appendChild(themeLabel)
        return container
      }
    })

    // 工具栏透明度
    setting.addItem({
      title: '③工具栏透明度',
      description: '💡(0=完全透明，100=完全不透明)',
      createActionElement: () => {
        const container = document.createElement('div')
        container.style.cssText = 'display: flex; align-items: center; gap: 10px;'

        const slider = document.createElement('input')
        slider.type = 'range'
        slider.min = '0'
        slider.max = '100'
        slider.value = String(Math.round(this.mobileConfig.toolbarOpacity * 100))
        slider.style.cssText = 'width: 150px; cursor: pointer;'

        const valueLabel = document.createElement('span')
        valueLabel.textContent = `${Math.round(this.mobileConfig.toolbarOpacity * 100)}%`
        valueLabel.style.cssText = 'min-width: 40px; font-size: 14px; color: var(--b3-theme-on-surface);'

        slider.oninput = () => {
          valueLabel.textContent = `${slider.value}%`
        }

        slider.onchange = async () => {
          this.mobileConfig.toolbarOpacity = parseInt(slider.value) / 100
          await this.saveData('mobileConfig', this.mobileConfig)
          this.applyMobileToolbarStyle()
        }

        container.appendChild(slider)
        container.appendChild(valueLabel)
        return container
      }
    })

    // === 底部工具栏配置 ===
    createGroupTitle('📱', '底部工具栏配置')

    setting.addItem({
      title: '是否将工具栏置底',
      description: '💡开启后才能调整输入法位置相关设置',
      createActionElement: () => {
        const toggle = document.createElement('input')
        toggle.type = 'checkbox'
        toggle.className = 'b3-switch'
        toggle.checked = this.mobileConfig.enableBottomToolbar
        toggle.style.cssText = 'transform: scale(1.2);'
        toggle.onchange = async () => {
          this.mobileConfig.enableBottomToolbar = toggle.checked
          await this.saveData('mobileConfig', this.mobileConfig)
          // 动态更新底部专用设置的禁用状态
          document.querySelectorAll('.bottom-toolbar-setting').forEach(el => {
            (el as HTMLInputElement).disabled = !toggle.checked
            ;(el as HTMLInputElement).style.opacity = toggle.checked ? '' : '0.5'
          })
        }
        return toggle
      }
    })

    setting.addItem({
      title: '①输入法关闭时高度',
      description: '💡输入法关闭时，工具栏距底部距离（仅在工具栏置底时有效）',
      createActionElement: () => {
        const input = document.createElement('input')
        input.className = 'b3-text-field fn__flex-center fn__size200 bottom-toolbar-setting'
        input.type = 'text'
        input.value = this.mobileConfig.closeInputOffset
        input.style.cssText = 'font-size: 14px; padding: 8px;'
        input.disabled = !this.mobileConfig.enableBottomToolbar
        if (!this.mobileConfig.enableBottomToolbar) input.style.opacity = '0.5'
        input.onchange = () => {
          this.mobileConfig.closeInputOffset = input.value
        }
        return input
      }
    })


    setting.addItem({
      title: '②输入法打开时高度',
      description: '💡输入法弹出时，工具栏距底部距离（仅在工具栏置底时有效）',
      createActionElement: () => {
        const input = document.createElement('input')
        input.className = 'b3-text-field fn__flex-center fn__size200 bottom-toolbar-setting'
        input.value = this.mobileConfig.openInputOffset
        input.style.cssText = 'font-size: 14px; padding: 8px;'
        input.disabled = !this.mobileConfig.enableBottomToolbar
        if (!this.mobileConfig.enableBottomToolbar) input.style.opacity = '0.5'
        input.onchange = () => {
          this.mobileConfig.openInputOffset = input.value
        }
        return input
      }
    })

    setting.addItem({
      title: '③工具栏层级',
      description: '💡值越大，越不容易被遮挡。默认值为5,显示在设置上层为10,完全不隐藏为100。',
      createActionElement: () => {
        const input = document.createElement('input')
        input.className = 'b3-text-field fn__flex-center fn__size200 bottom-toolbar-setting'
        input.type = 'number'
        input.value = this.mobileConfig.toolbarZIndex.toString()
        input.style.cssText = 'font-size: 14px; padding: 8px;'
        input.min = '0'
        input.max = '100'
        input.disabled = !this.mobileConfig.enableBottomToolbar
        if (!this.mobileConfig.enableBottomToolbar) input.style.opacity = '0.5'
        input.onchange = () => {
          this.mobileConfig.toolbarZIndex = parseInt(input.value) || 2
          this.applyMobileToolbarStyle()
        }
        return input
      }
    })

    setting.addItem({
      title: '④输入法灵敏度检查',
      description: '💡不建议修改：窗口高度变化超过此百分比触发：30-90（仅在工具栏置底时有效）',
      createActionElement: () => {
        const input = document.createElement('input')
        input.className = 'b3-text-field fn__flex-center fn__size200 bottom-toolbar-setting'
        input.type = 'number'
        input.value = this.mobileConfig.heightThreshold.toString()
        input.style.cssText = 'font-size: 14px; padding: 8px;'
        input.min = '30'
        input.max = '90'
        input.disabled = !this.mobileConfig.enableBottomToolbar
        if (!this.mobileConfig.enableBottomToolbar) input.style.opacity = '0.5'
        input.onchange = () => { this.mobileConfig.heightThreshold = parseInt(input.value) || 70 }
        return input
      }
    })


    // === 小功能选择 ===
    createGroupTitle('⚙️', '小功能选择')


    setting.addItem({
      title: '面包屑图标隐藏',
      description: '💡开启后隐藏面包屑左侧的图标',
      createActionElement: () => {
        const toggle = document.createElement('input')
        toggle.type = 'checkbox'
        toggle.className = 'b3-switch'
        toggle.checked = this.mobileFeatureConfig.hideBreadcrumbIcon
        toggle.style.cssText = 'transform: scale(1.2);'
        toggle.onchange = async () => {
          this.mobileFeatureConfig.hideBreadcrumbIcon = toggle.checked
          await this.saveData('mobileFeatureConfig', this.mobileFeatureConfig)
          this.applyFeatures()
        }
        return toggle
      }
    })

    setting.addItem({
      title: '锁定编辑按钮隐藏',
      description: '💡隐藏工具栏的锁定编辑按钮',
      createActionElement: () => {
        const toggle = document.createElement('input')
        toggle.type = 'checkbox'
        toggle.className = 'b3-switch'
        toggle.checked = this.mobileFeatureConfig.hideReadonlyButton
        toggle.style.cssText = 'transform: scale(1.2);'
        toggle.onchange = async () => {
          this.mobileFeatureConfig.hideReadonlyButton = toggle.checked
          await this.saveData('mobileFeatureConfig', this.mobileFeatureConfig)
          this.applyFeatures()
        }
        return toggle
      }
    })

    setting.addItem({
      title: '文档菜单按钮隐藏',
      description: '💡隐藏工具栏的文档菜单按钮',
      createActionElement: () => {
        const toggle = document.createElement('input')
        toggle.type = 'checkbox'
        toggle.className = 'b3-switch'
        toggle.checked = this.mobileFeatureConfig.hideDocMenuButton
        toggle.style.cssText = 'transform: scale(1.2);'
        toggle.onchange = async () => {
          this.mobileFeatureConfig.hideDocMenuButton = toggle.checked
          await this.saveData('mobileFeatureConfig', this.mobileFeatureConfig)
          this.applyFeatures()
        }
        return toggle
      }
    })

    setting.addItem({
      title: '更多按钮隐藏',
      description: '💡隐藏工具栏的更多按钮',
      createActionElement: () => {
        const toggle = document.createElement('input')
        toggle.type = 'checkbox'
        toggle.className = 'b3-switch'
        toggle.checked = this.mobileFeatureConfig.hideMoreButton
        toggle.style.cssText = 'transform: scale(1.2);'
        toggle.onchange = async () => {
          this.mobileFeatureConfig.hideMoreButton = toggle.checked
          await this.saveData('mobileFeatureConfig', this.mobileFeatureConfig)
          this.applyFeatures()
        }
        return toggle
      }
    })

    // 手机端禁止左右滑动弹出
    setting.addItem({
      title: '禁止左右滑动弹出',
      description: '💡开启后禁止左右滑动弹出文档树和设置菜单',
      createActionElement: () => {
        const toggle = document.createElement('input')
        toggle.type = 'checkbox'
        toggle.className = 'b3-switch'
        toggle.checked = this.mobileFeatureConfig.disableMobileSwipe
        toggle.style.cssText = 'transform: scale(1.2);'
        toggle.onchange = async () => {
          this.mobileFeatureConfig.disableMobileSwipe = toggle.checked
          await this.saveData('mobileFeatureConfig', this.mobileFeatureConfig)
          this.applyFeatures()
        }
        return toggle
      }
    })

    // === 使用帮助 ===
    createGroupTitle('💡', '使用帮助')

    setting.addItem({
      title: '手机端常用功能ID',
      description: '思源内置菜单ID参考（F12查看更多）',
      createActionElement: () => {
        const container = document.createElement('div')
        container.style.cssText = `
          font-size: 13px;
          line-height: 1.8;
          width: 100%;
          padding: 8px 0;
          max-height: 400px;
          overflow-y: auto;
        `
        
        const idList = [
          { id: 'toolbarMore', name: '右上角：设置' },
          { id: 'toolbarFile', name: '左上角：文档树' },
          { id: 'menuAccount', name: '个人信息' },
          { id: 'menuRecent', name: '最近的文档' },
          { id: 'menuSearch', name: '搜索' },
          { id: 'menuCommand', name: '命令面板' },
          { id: 'menuSyncNow', name: '立即同步' },
          { id: 'menuNewDoc', name: '新建文档' },
          { id: 'menuNewNotebook', name: '新建笔记本' },
          { id: 'menuNewDaily', name: '日记' },
          { id: 'menuCard', name: '间隔重复' },
          { id: 'menuLock', name: '锁屏' },
          { id: 'menuHistory', name: '数据历史' },
          { id: 'menuEditor', name: '编辑器' },
          { id: 'menuFileTree', name: '文档树' },
          { id: 'menuRiffCard', name: '闪卡' },
          { id: 'menuAI', name: 'AI' },
          { id: 'menuAssets', name: '资源' },
          { id: 'menuAppearance', name: '外观' },
          { id: 'menuSync', name: '云端' },
          { id: 'menuPublish', name: '发布' },
          { id: 'menuAbout', name: '关于' },
          { id: 'menuPlugin', name: '插件' }
        ]
        
        container.innerHTML = idList.map(item => 
          `<div style="margin: 6px 0; padding: 6px; background: var(--b3-theme-surface); border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
            <span style="color: var(--b3-theme-on-surface);">${item.name}</span>
            <code style="background: var(--b3-theme-background); padding: 3px 8px; border-radius: 3px; font-size: 11px;">${item.id}</code>
          </div>`
        ).join('')
        
        return container
      }
    })
  }

  // 电脑端字段创建
  // 电脑端图标字段（支持emoji和lucide图标）
  private createDesktopIconField(label: string, value: string, onChange: (value: string) => void): HTMLElement {
    const field = document.createElement('div')
    field.style.cssText = 'display: flex; align-items: center; gap: 12px;'
    
    const labelEl = document.createElement('label')
    labelEl.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); min-width: 120px;'
    labelEl.textContent = label
    
    const inputWrapper = document.createElement('div')
    inputWrapper.className = 'fn__flex-1'
    inputWrapper.style.cssText = 'display: flex; gap: 8px; align-items: center;'
    
    const input = document.createElement('input')
    input.type = 'text'
    input.value = value
    input.placeholder = 'emoji、lucide:图标名 或 icon名'
    input.className = 'b3-text-field'
    input.style.cssText = 'flex: 1;'
    
    // 预览图标
    const preview = document.createElement('span')
    preview.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 4px;
      background: var(--b3-theme-background);
      border: 1px solid var(--b3-border-color);
      font-size: 14px;
      flex-shrink: 0;
    `
    this.updateIconDisplay(preview, value)
    
    // 选择按钮
    const selectBtn = document.createElement('button')
    selectBtn.className = 'b3-button b3-button--outline'
    selectBtn.textContent = '选择'
    selectBtn.style.cssText = 'padding: 4px 12px; font-size: 12px; flex-shrink: 0;'
    
    input.oninput = () => {
      onChange(input.value)
      this.updateIconDisplay(preview, input.value)
    }
    
    selectBtn.onclick = () => {
      this.showIconPicker(input.value, (selectedIcon) => {
        input.value = selectedIcon
        onChange(selectedIcon)
        this.updateIconDisplay(preview, selectedIcon)
      })
    }
    
    inputWrapper.appendChild(input)
    inputWrapper.appendChild(preview)
    inputWrapper.appendChild(selectBtn)
    
    field.appendChild(labelEl)
    field.appendChild(inputWrapper)
    return field
  }

  // 电脑端普通输入字段
  private createDesktopField(label: string, value: string, placeholder: string, onChange: (value: string) => void, type: string = 'text'): HTMLElement {
    const field = document.createElement('div')
    field.style.cssText = 'display: flex; align-items: center; gap: 12px;'
    
    const labelEl = document.createElement('label')
    labelEl.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); min-width: 120px;'
    labelEl.textContent = label
    
    const input = document.createElement('input')
    input.type = type
    input.value = value
    input.placeholder = placeholder
    input.className = 'b3-text-field fn__flex-1'
    input.onchange = () => onChange(input.value)
    
    field.appendChild(labelEl)
    field.appendChild(input)
    return field
  }

  // 按钮选择器（已迁移到 ui/buttonSelector.ts）
  private showButtonIdPicker(currentValue: string, onSelect: (result: ButtonInfo) => void) {
    showButtonSelector({ currentValue, onSelect })
  }

  // 自定义确认对话框（已迁移到 ui/dialog.ts，兼容鸿蒙系统）
  private showConfirmDialog(message: string): Promise<boolean> {
    return showConfirmDialogModal({ message, confirmText: '删除', cancelText: '取消' })
  }

  // 电脑端按钮列表项
  private createDesktopButtonItem(button: ButtonConfig, index: number, renderList: () => void, configsArray: ButtonConfig[]): HTMLElement {
    const item = document.createElement('div')
    item.style.cssText = `
      border: 1px solid var(--b3-border-color);
      border-radius: 6px;
      padding: 12px;
      background: var(--b3-theme-surface);
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      margin-bottom: 8px;
      transition: all 0.2s ease;
    `
    item.draggable = true
    
    let isExpanded = false
    
    // 拖拽事件
    item.ondragstart = (e) => {
      e.dataTransfer!.effectAllowed = 'move'
      e.dataTransfer!.setData('text/plain', index.toString())
      item.style.opacity = '0.4'
    }
    
    item.ondragend = (e) => {
      item.style.opacity = '1'
    }
    
    item.ondragover = (e) => {
      e.preventDefault()
      e.dataTransfer!.dropEffect = 'move'
      item.style.borderColor = 'var(--b3-theme-primary)'
    }
    
    item.ondragleave = (e) => {
      item.style.borderColor = 'var(--b3-border-color)'
    }
    
    item.ondrop = (e) => {
      e.preventDefault()
      item.style.borderColor = 'var(--b3-border-color)'
      
      const fromIndex = parseInt(e.dataTransfer!.getData('text/plain'))
      const toIndex = index
      
      if (fromIndex !== toIndex) {
        // 交换按钮位置
        const sortedButtons = [...configsArray].sort((a, b) => a.sort - b.sort)
        const [movedButton] = sortedButtons.splice(fromIndex, 1)
        sortedButtons.splice(toIndex, 0, movedButton)
        
        // 重新分配 sort 值
        sortedButtons.forEach((btn, idx) => {
          btn.sort = idx + 1
        })
        
        renderList()
      }
    }

    // 头部
    const header = document.createElement('div')
    header.style.cssText = 'display: flex; align-items: center; gap: 10px; cursor: pointer;'

    const dragHandle = document.createElement('span')
    dragHandle.textContent = '⋮⋮'
    dragHandle.style.cssText = `
      font-size: 18px;
      color: var(--b3-theme-on-surface-light);
      cursor: move;
      flex-shrink: 0;
    `
    dragHandle.title = '拖动排序'

    const iconSpan = document.createElement('span')
    iconSpan.className = 'toolbar-customizer-button-icon'
    iconSpan.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 6px;
      background: var(--b3-theme-background);
      font-size: 16px;
      flex-shrink: 0;
    `
    this.updateIconDisplay(iconSpan, button.icon)

    // 使用 infoDiv 来显示名称和类型描述（手机端风格）
    const infoDiv = document.createElement('div')
    infoDiv.style.cssText = 'flex: 1; min-width: 0;'
    infoDiv.innerHTML = `
      <div style="font-weight: 500; font-size: 14px; color: var(--b3-theme-on-background); margin-bottom: 4px;">${button.name}</div>
      <div style="font-size: 11px; color: var(--b3-theme-on-surface-light);">
        ${button.type === 'builtin' ? '①思源内置功能【简单】' : button.type === 'template' ? '①手写模板插入【简单】' : button.type === 'shortcut' ? '②电脑端快捷键【简单】' : '③自动化模拟点击【难】'}
      </div>
    `

    const expandIcon = document.createElement('span')
    expandIcon.textContent = '▼'
    expandIcon.style.cssText = `
      font-size: 10px;
      color: var(--b3-theme-on-surface-light);
      transition: transform 0.2s ease;
      flex-shrink: 0;
    `

    const deleteBtn = document.createElement('button')
    deleteBtn.className = 'b3-button b3-button--text'
    deleteBtn.textContent = '删除'
    deleteBtn.style.cssText = `
      padding: 4px 10px;
      font-size: 12px;
      color: var(--b3-card-error-color);
      flex-shrink: 0;
      border-radius: 4px;
    `
    deleteBtn.onclick = async (e) => {
      e.stopPropagation()
      if (await this.showConfirmDialog(`确定删除"${button.name}"？`)) {
        // 从配置数组中删除
        const realIndex = configsArray.findIndex(btn => btn.id === button.id)
        if (realIndex !== -1) {
          configsArray.splice(realIndex, 1)
          // 确保排序值连续
          configsArray.sort((a, b) => a.sort - b.sort).forEach((btn, idx) => {
            btn.sort = idx + 1
          })
          renderList()
        }
      }
    }

    // 启用/禁用开关
    const enabledToggle = document.createElement('input')
    enabledToggle.type = 'checkbox'
    enabledToggle.className = 'b3-switch'
    enabledToggle.checked = button.enabled !== false
    enabledToggle.style.cssText = 'transform: scale(0.8); flex-shrink: 0; cursor: pointer;'
    enabledToggle.title = button.enabled !== false ? '点击禁用按钮' : '点击启用按钮'
    enabledToggle.onclick = (e) => {
      e.stopPropagation()
      button.enabled = enabledToggle.checked
      enabledToggle.title = enabledToggle.checked ? '点击禁用按钮' : '点击启用按钮'
      // 更新按钮项的透明度
      item.style.opacity = enabledToggle.checked ? '1' : '0.5'
    }
    // 根据启用状态设置透明度
    if (button.enabled === false) {
      item.style.opacity = '0.5'
    }

    header.appendChild(dragHandle)
    header.appendChild(iconSpan)
    header.appendChild(infoDiv)
    header.appendChild(expandIcon)
    header.appendChild(enabledToggle)
    header.appendChild(deleteBtn)

    // 编辑表单
    const editForm = document.createElement('div')
    editForm.className = 'toolbar-customizer-edit-form'
    editForm.style.cssText = `
      display: none;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--b3-border-color);
      gap: 10px;
      flex-direction: column;
    `

    // 名称输入框
    const nameField = this.createDesktopField('名称', button.name, '按钮显示名称', (v) => {
      button.name = v
      infoDiv.querySelector('div:first-child')!.textContent = v
    })
    editForm.appendChild(nameField)
    editForm.appendChild(this.createDesktopSelectField('选择功能', button.type, [
      { value: 'template', label: '①手写模板插入【简单】' },
      { value: 'shortcut', label: '②电脑端快捷键【简单】' },
      { value: 'click-sequence', label: '③自动化模拟点击【难】' }
    ], (v) => {
      button.type = v as any

      // 保存当前展开状态
      const wasExpanded = item.dataset.expanded === 'true'

      // 重新渲染表单
      const newForm = document.createElement('div')
      newForm.className = 'toolbar-customizer-edit-form'
      newForm.style.cssText = editForm.style.cssText
      newForm.style.display = wasExpanded ? 'flex' : 'none'
      this.populateDesktopEditForm(newForm, button, iconSpan, infoDiv, item, renderList)
      editForm.replaceWith(newForm)

      // 更新类型描述显示
      const typeDesc = infoDiv.querySelector('div:last-child')
      if (typeDesc) {
        typeDesc.textContent = button.type === 'builtin' ? '①思源内置功能【简单】' : button.type === 'template' ? '①手写模板插入【简单】' : button.type === 'shortcut' ? '②电脑端快捷键【简单】' : '③自动化模拟点击【难】'
      }
    }))
    
    // 电脑端隐藏'思源内置功能'类型，代码保留以便后续使用
    // if (button.type === 'builtin') {
    //   const builtinContainer = document.createElement('div')
    //   builtinContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px;'
    //   
    //   builtinContainer.appendChild(this.createDesktopField('按钮选择器', button.builtinId || '', 'menuSearch', (v) => { button.builtinId = v }))
    //   
    //   const hint = document.createElement('div')
    //   hint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light); padding-left: 4px; display: flex; align-items: center; gap: 8px;'
    //   hint.innerHTML = '💡 支持: id、data-id、data-type、class、按钮文本 <a href="#" style="color: var(--b3-theme-primary); text-decoration: none; font-weight: 500;">查看常用ID →</a>'
    //   
    //   const link = hint.querySelector('a')
    //   if (link) {
    //     link.onclick = (e) => {
    //       e.preventDefault()
    //       setTimeout(() => {
    //         const settingItems = Array.from(document.querySelectorAll('.b3-label'))
    //         const helpSection = settingItems.find(item => {
    //           const descEl = item.querySelector('.b3-label__text')
    //           const text = descEl?.textContent
    //           return descEl && text?.includes('思源内置菜单ID参考')
    //         })
    //         
    //         if (helpSection) {
    //           helpSection.scrollIntoView({ behavior: 'smooth', block: 'center' })
    //           const helpElement = helpSection as HTMLElement
    //           const originalBg = helpElement.style.background
    //           helpElement.style.background = 'var(--b3-theme-primary-lightest)'
    //           setTimeout(() => {
    //             helpElement.style.background = originalBg
    //           }, 2000)
    //         }
    //       }, 100)
    //     }
    //   }
    //   
    //   builtinContainer.appendChild(hint)
    //   editForm.appendChild(builtinContainer)
    // } else 
    
    if (button.type === 'template') {
      const templateField = document.createElement('div')
      templateField.style.cssText = 'display: flex; flex-direction: column; gap: 4px;'
      const label = document.createElement('label')
      label.textContent = '模板内容'
      label.style.cssText = 'font-size: 13px;'
      const textarea = document.createElement('textarea')
      textarea.className = 'b3-text-field'
      textarea.value = button.template || ''
      textarea.style.cssText = 'resize: vertical; min-height: 80px;'
      textarea.onchange = () => { button.template = textarea.value }
      
      // 添加变量说明
      const hint = document.createElement('div')
      hint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light); padding: 8px; background: var(--b3-theme-surface); border-radius: 4px; margin-top: 4px;'
      hint.innerHTML = `
        <div style="font-weight: 500; margin-bottom: 4px;">💡 支持的模板变量：</div>
        <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-family: monospace;">
          <code>{{date}}</code><span>当前日期 (2026-01-18)</span>
          <code>{{time}}</code><span>当前时间 (14:30:45)</span>
          <code>{{datetime}}</code><span>日期时间 (2026-01-18 14:30:45)</span>
          <code>{{year}}</code><span>年份 (2026)</span>
          <code>{{month}}</code><span>月份 (01)</span>
          <code>{{day}}</code><span>日期 (18)</span>
          <code>{{hour}}</code><span>小时 (14)</span>
          <code>{{minute}}</code><span>分钟 (30)</span>
          <code>{{second}}</code><span>秒 (45)</span>
          <code>{{week}}</code><span>星期几 (星期六)</span>
        </div>
      `
      
      templateField.appendChild(label)
      templateField.appendChild(textarea)
      templateField.appendChild(hint)
      editForm.appendChild(templateField)
    } else if (button.type === 'click-sequence') {
      // 点击序列配置
      const clickSequenceField = document.createElement('div')
      clickSequenceField.style.cssText = 'display: flex; flex-direction: column; gap: 4px;'

      // 标签行容器（包含标签和选择按钮）
      const labelRow = document.createElement('div')
      labelRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px;'

      const label = document.createElement('label')
      label.textContent = '点击序列（每行一个选择器）'
      label.style.cssText = 'font-size: 13px;'
      labelRow.appendChild(label)

      // 预设按钮
      const presetBtn = document.createElement('button')
      presetBtn.className = 'b3-button b3-button--outline'
      presetBtn.textContent = '选择'
      presetBtn.style.cssText = 'padding: 4px 12px; font-size: 12px; white-space: nowrap;'
      presetBtn.onclick = () => {
        showClickSequenceSelector({
          platform: 'desktop',
          onSelect: (sequence) => {
            const textarea = textareaContainer.querySelector('textarea') as HTMLTextAreaElement
            if (textarea) {
              textarea.value = sequence.join('\n')
              button.clickSequence = sequence
              // 更新行号显示
              ;(textareaContainer as any).updateLineNumbers()
            }
          }
        })
      }
      labelRow.appendChild(presetBtn)

      clickSequenceField.appendChild(labelRow)

      // 创建带行号的 textarea
      const textareaContainer = this.createLineNumberedTextarea(
        button.clickSequence?.join('\n') || '',
        (value) => {
          button.clickSequence = value.split('\n').filter(line => line.trim())
        }
      )
      clickSequenceField.appendChild(textareaContainer)

      const hint = document.createElement('div')
      hint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light); padding-left: 4px;'
      hint.innerHTML = '💡 每行填写一个选择器，支持：<br>• 简单标识符（如 barSettings）<br>• CSS选择器（如 #barSettings）<br>• <strong>文本内容（如 text:复制块引用）</strong>'
      clickSequenceField.appendChild(hint)

      editForm.appendChild(clickSequenceField)
    } else if (button.type === 'shortcut') {
      // 快捷键配置
      const shortcutField = document.createElement('div')
      shortcutField.style.cssText = 'display: flex; flex-direction: column; gap: 4px;'
      
      const label = document.createElement('label')
      label.textContent = '快捷键组合'
      label.style.cssText = 'font-size: 13px;'
      shortcutField.appendChild(label)
      
      const input = document.createElement('input')
      input.className = 'b3-text-field fn__flex-1'
      input.type = 'text'
      input.placeholder = '快捷键格式：Alt+5 / Ctrl+B等'
      input.value = button.shortcutKey || ''
      input.style.cssText = 'font-family: monospace;'
      input.onchange = () => { button.shortcutKey = input.value }
      
      shortcutField.appendChild(input)
      
      const hint = document.createElement('div')
      hint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light); padding: 8px; background: var(--b3-theme-surface); border-radius: 4px; overflow-x: auto;'
      hint.innerHTML = `
        <table style="width: 100%; border-collapse: collapse; font-family: monospace;">
          <tr><td>💡更多快捷键，请查看：思源桌面端➡设置➡快捷键</td></tr>
          <tr><th style="padding: 4px; text-align: left; border-bottom: 1px solid var(--b3-theme-border);">快捷键</th><th style="padding: 4px; text-align: left; border-bottom: 1px solid var(--b3-theme-border);">功能</th></tr>
          <tr><td><code>Alt+5</code></td><td>打开日记</td></tr>
          <tr><td><code>Alt+P</code></td><td>打开设置</td></tr>
          <tr><td><code>Alt+Shift+P</code></td><td>命令面板</td></tr>
          <tr><td><code>Ctrl+P</code></td><td>全局搜索</td></tr>
          <tr><td><code>Ctrl+F</code></td><td>当前文档搜索</td></tr>
          <tr><td><code>Ctrl+H</code></td><td>替换</td></tr>
          <tr><td><code>Ctrl+N</code></td><td>新建文档</td></tr>
          <tr><td><code>Alt+1</code></td><td>文件树</td></tr>
          <tr><td><code>Alt+2</code></td><td>大纲</td></tr>
          <tr><td><code>Alt+3</code></td><td>书签</td></tr>
          <tr><td><code>Alt+4</code></td><td>标签</td></tr>
          <tr><td><code>Alt+7</code></td><td>反向链接</td></tr>
          <tr><td><code>Ctrl+W</code></td><td>关闭标签页</td></tr>
        </table>
      `
      
      shortcutField.appendChild(hint)
      editForm.appendChild(shortcutField)
    }
    
    editForm.appendChild(this.createDesktopIconField('图标', button.icon, (v) => { 
      button.icon = v
      // 更新显示的图标
      this.updateIconDisplay(iconSpan, v)
    }))
    editForm.appendChild(this.createDesktopField('图标大小', button.iconSize.toString(), '18', (v) => { button.iconSize = parseInt(v) || 18 }, 'number'))
    editForm.appendChild(this.createDesktopField('按钮宽度', button.minWidth.toString(), '32', (v) => { button.minWidth = parseInt(v) || 32 }, 'number'))
    editForm.appendChild(this.createDesktopField('右边距', button.marginRight.toString(), '8', (v) => { button.marginRight = parseInt(v) || 8 }, 'number'))
    editForm.appendChild(this.createDesktopField('排序', button.sort.toString(), '1', (v) => { 
      button.sort = parseInt(v) || 1
      // 重新分配排序值
      const sortedButtons = [...this.buttonConfigs].sort((a, b) => a.sort - b.sort)
      sortedButtons.forEach((btn, idx) => {
        btn.sort = idx + 1
      })
      renderList()
    }, 'number'))
    
    // 右上角提示开关
    const notificationItem = document.createElement('div')
    notificationItem.style.cssText = 'display: flex; align-items: center; gap: 12px;'
    
    const notificationLabel = document.createElement('label')
    notificationLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); min-width: 120px;'
    notificationLabel.textContent = '右上角提示（默认打开提示）'
    
    const notificationSwitch = document.createElement('input')
    notificationSwitch.type = 'checkbox'
    notificationSwitch.className = 'b3-switch'
    notificationSwitch.checked = button.showNotification
    notificationSwitch.onchange = () => { button.showNotification = notificationSwitch.checked }
    
    notificationItem.appendChild(notificationLabel)
    notificationItem.appendChild(notificationSwitch)
    editForm.appendChild(notificationItem)

    // 使用数据属性存储展开状态，设置统一的展开/收起处理器
    item.dataset.expanded = 'false'
    header.onclick = (e) => {
      // 过滤：不处理点击输入框、下拉框、按钮、开关
      const target = e.target as HTMLElement
      if (target.closest('button') || target.closest('input') || target.closest('select') || target.closest('.b3-switch')) return

      // 切换状态
      const currentState = item.dataset.expanded === 'true'
      item.dataset.expanded = (!currentState).toString()

      // 查找表单（通过 class 名称）
      const currentForm = item.querySelector('.toolbar-customizer-edit-form') as HTMLElement
      if (currentForm) {
        currentForm.style.display = (!currentState) ? 'flex' : 'none'
      }
      expandIcon.style.transform = (!currentState) ? 'rotate(180deg)' : 'rotate(0deg)'
    }

    item.appendChild(header)
    item.appendChild(editForm)
    return item
  }

  // 填充电脑端编辑表单
  private populateDesktopEditForm(form: HTMLElement, button: ButtonConfig, iconSpan: HTMLElement, infoDiv: HTMLElement, item: HTMLElement, renderList?: () => void) {
    form.appendChild(this.createDesktopField('名称', button.name, '按钮名称', (v) => {
      button.name = v
      const nameEl = infoDiv.querySelector('div:first-child')
      if (nameEl) nameEl.textContent = v
    }))
    form.appendChild(this.createDesktopSelectField('选择功能', button.type, [
      { value: 'template', label: '①手写模板插入【简单】' },
      { value: 'shortcut', label: '②电脑端快捷键【简单】' },
      { value: 'click-sequence', label: '③自动化模拟点击【难】' }
    ], (v) => {
      button.type = v as any

      // 保存当前展开状态
      const wasExpanded = item.dataset.expanded === 'true'

      const newForm = document.createElement('div')
      newForm.className = 'toolbar-customizer-edit-form'
      newForm.style.cssText = form.style.cssText
      newForm.style.display = wasExpanded ? 'flex' : 'none'
      this.populateDesktopEditForm(newForm, button, iconSpan, infoDiv, item, renderList)
      form.replaceWith(newForm)

      // 更新类型描述显示
      const typeDesc = infoDiv.querySelector('div:last-child')
      if (typeDesc) {
        typeDesc.textContent = button.type === 'builtin' ? '①思源内置功能【简单】' : button.type === 'template' ? '①手写模板插入【简单】' : button.type === 'shortcut' ? '②电脑端快捷键【简单】' : '③自动化模拟点击【难】'
      }
    }))

    // 电脑端隐藏'思源内置功能'类型，代码保留以便后续使用
    // if (button.type === 'builtin') {
    //   const builtinContainer = document.createElement('div')
    //   builtinContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px;'
    //   
    //   builtinContainer.appendChild(this.createDesktopField('按钮选择器', button.builtinId || '', 'menuSearch', (v) => { button.builtinId = v }))
    //   
    //   const hint = document.createElement('div')
    //   hint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light); padding-left: 4px;'
    //   hint.innerHTML = '💡 支持: id、data-id、data-type、class、按钮文本 <a href="#" style="color: var(--b3-theme-primary); text-decoration: none; font-weight: 500;">查看常用ID →</a>'
    //   
    //   const link = hint.querySelector('a')
    //   if (link) {
    //     link.onclick = (e) => {
    //       e.preventDefault()
    //       setTimeout(() => {
    //         const settingItems = Array.from(document.querySelectorAll('.b3-label'))
    //         const helpSection = settingItems.find(item => {
    //           const descEl = item.querySelector('.b3-label__text')
    //           const text = descEl?.textContent
    //           return descEl && text?.includes('思源内置菜单ID参考')
    //         })
    //         
    //         if (helpSection) {
    //           helpSection.scrollIntoView({ behavior: 'smooth', block: 'center' })
    //           const helpElement = helpSection as HTMLElement
    //           const originalBg = helpElement.style.background
    //           helpElement.style.background = 'var(--b3-theme-primary-lightest)'
    //           setTimeout(() => {
    //             helpElement.style.background = originalBg
    //           }, 2000)
    //         }
    //       }, 100)
    //     }
    //   }
    //   
    //   builtinContainer.appendChild(hint)
    //   form.appendChild(builtinContainer)
    // } else 
    
    if (button.type === 'template') {
      const templateField = document.createElement('div')
      templateField.style.cssText = 'display: flex; flex-direction: column; gap: 4px;'
      const label = document.createElement('label')
      label.textContent = '模板内容'
      label.style.cssText = 'font-size: 13px;'
      const textarea = document.createElement('textarea')
      textarea.className = 'b3-text-field'
      textarea.value = button.template || ''
      textarea.style.cssText = 'resize: vertical; min-height: 80px;'
      textarea.onchange = () => { button.template = textarea.value }
      
      // 添加变量说明
      const hint = document.createElement('div')
      hint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light); padding: 8px; background: var(--b3-theme-surface); border-radius: 4px; margin-top: 4px;'
      hint.innerHTML = `
        <div style="font-weight: 500; margin-bottom: 4px;">💡 支持的模板变量：</div>
        <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-family: monospace;">
          <code>{{date}}</code><span>当前日期 (2026-01-18)</span>
          <code>{{time}}</code><span>当前时间 (14:30:45)</span>
          <code>{{datetime}}</code><span>日期时间 (2026-01-18 14:30:45)</span>
          <code>{{year}}</code><span>年份 (2026)</span>
          <code>{{month}}</code><span>月份 (01)</span>
          <code>{{day}}</code><span>日期 (18)</span>
          <code>{{hour}}</code><span>小时 (14)</span>
          <code>{{minute}}</code><span>分钟 (30)</span>
          <code>{{second}}</code><span>秒 (45)</span>
          <code>{{week}}</code><span>星期几 (星期六)</span>
        </div>
      `
      
      templateField.appendChild(label)
      templateField.appendChild(textarea)
      templateField.appendChild(hint)
      form.appendChild(templateField)
    } else if (button.type === 'click-sequence') {
      // 点击序列配置
      const clickSequenceField = document.createElement('div')
      clickSequenceField.style.cssText = 'display: flex; flex-direction: column; gap: 4px;'

      // 标签行容器（包含标签和选择按钮）
      const labelRow = document.createElement('div')
      labelRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px;'

      const label = document.createElement('label')
      label.textContent = '点击序列（每行一个选择器）'
      label.style.cssText = 'font-size: 13px;'
      labelRow.appendChild(label)

      // 预设按钮
      const presetBtn = document.createElement('button')
      presetBtn.className = 'b3-button b3-button--outline'
      presetBtn.textContent = '选择'
      presetBtn.style.cssText = 'padding: 4px 12px; font-size: 12px; white-space: nowrap;'
      presetBtn.onclick = () => {
        showClickSequenceSelector({
          platform: this.isMobile ? 'mobile' : 'desktop',
          onSelect: (sequence) => {
            const textarea = textareaContainer.querySelector('textarea') as HTMLTextAreaElement
            if (textarea) {
              textarea.value = sequence.join('\n')
              button.clickSequence = sequence
              // 更新行号显示
              ;(textareaContainer as any).updateLineNumbers()
            }
          }
        })
      }
      labelRow.appendChild(presetBtn)

      clickSequenceField.appendChild(labelRow)

      // 创建带行号的 textarea
      const textareaContainer = this.createLineNumberedTextarea(
        button.clickSequence?.join('\n') || '',
        (value) => {
          button.clickSequence = value.split('\n').filter(line => line.trim())
        }
      )
      clickSequenceField.appendChild(textareaContainer)

      const hint = document.createElement('div')
      hint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light); padding-left: 4px;'
      hint.innerHTML = '💡 每行填写一个选择器，支持：<br>• 简单标识符（如 barSettings）<br>• CSS选择器（如 #barSettings）<br>• <strong>文本内容（如 text:复制块引用）</strong>'
      clickSequenceField.appendChild(hint)

      form.appendChild(clickSequenceField)
    } else if (button.type === 'shortcut') {
      // 快捷键配置
      const shortcutField = document.createElement('div')
      shortcutField.style.cssText = 'display: flex; flex-direction: column; gap: 4px;'
      
      const label = document.createElement('label')
      label.textContent = '快捷键组合'
      label.style.cssText = 'font-size: 13px;'
      shortcutField.appendChild(label)
      
      const input = document.createElement('input')
      input.className = 'b3-text-field fn__flex-1'
      input.type = 'text'
      input.placeholder = '快捷键格式：Alt+5 / Ctrl+B等'
      input.value = button.shortcutKey || ''
      input.style.cssText = 'font-family: monospace;'
      input.onchange = () => { button.shortcutKey = input.value }
      
      shortcutField.appendChild(input)
      
      const hint = document.createElement('div')
      hint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light); padding: 8px; background: var(--b3-theme-surface); border-radius: 4px; overflow-x: auto;'
      hint.innerHTML = `
        <table style="width: 100%; border-collapse: collapse; font-family: monospace;">
          <tr><td>💡更多快捷键，请查看：思源桌面端➡设置➡快捷键</td></tr>
          <tr><th style="padding: 4px; text-align: left; border-bottom: 1px solid var(--b3-theme-border);">快捷键</th><th style="padding: 4px; text-align: left; border-bottom: 1px solid var(--b3-theme-border);">功能</th></tr>
          <tr><td><code>Alt+5</code></td><td>打开日记</td></tr>
          <tr><td><code>Alt+P</code></td><td>打开设置</td></tr>
          <tr><td><code>Alt+Shift+P</code></td><td>命令面板</td></tr>
          <tr><td><code>Ctrl+P</code></td><td>全局搜索</td></tr>
          <tr><td><code>Ctrl+F</code></td><td>当前文档搜索</td></tr>
          <tr><td><code>Ctrl+H</code></td><td>替换</td></tr>
          <tr><td><code>Ctrl+N</code></td><td>新建文档</td></tr>
          <tr><td><code>Alt+1</code></td><td>文件树</td></tr>
          <tr><td><code>Alt+2</code></td><td>大纲</td></tr>
          <tr><td><code>Alt+3</code></td><td>书签</td></tr>
          <tr><td><code>Alt+4</code></td><td>标签</td></tr>
          <tr><td><code>Alt+7</code></td><td>反向链接</td></tr>
          <tr><td><code>Ctrl+W</code></td><td>关闭标签页</td></tr>
        </table>
      `
      
      shortcutField.appendChild(hint)
      form.appendChild(shortcutField)
    }
    
    form.appendChild(this.createDesktopIconField('图标', button.icon, (v) => { 
      button.icon = v
      // 需要找到对应的 iconSpan 来更新，这里简化处理
    }))
    form.appendChild(this.createDesktopField('图标大小', button.iconSize.toString(), '18', (v) => { button.iconSize = parseInt(v) || 18 }, 'number'))
    form.appendChild(this.createDesktopField('按钮宽度', button.minWidth.toString(), '32', (v) => { button.minWidth = parseInt(v) || 32 }, 'number'))
    form.appendChild(this.createDesktopField('右边距', button.marginRight.toString(), '8', (v) => { button.marginRight = parseInt(v) || 8 }, 'number'))
    form.appendChild(this.createDesktopField('排序', button.sort.toString(), '1', (v) => { 
      button.sort = parseInt(v) || 1
      // 重新分配排序值
      const sortedButtons = [...this.buttonConfigs].sort((a, b) => a.sort - b.sort)
      sortedButtons.forEach((btn, idx) => {
        btn.sort = idx + 1
      })
      if (renderList) renderList()
    }, 'number'))
    
    // 右上角提示开关
    const notificationItem = document.createElement('div')
    notificationItem.style.cssText = 'display: flex; align-items: center; gap: 12px;'
    
    const notificationLabel = document.createElement('label')
    notificationLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); min-width: 120px;'
    notificationLabel.textContent = '右上角提示'
    
    const notificationSwitch = document.createElement('input')
    notificationSwitch.type = 'checkbox'
    notificationSwitch.className = 'b3-switch'
    notificationSwitch.checked = button.showNotification
    notificationSwitch.onchange = () => { button.showNotification = notificationSwitch.checked }
    
    notificationItem.appendChild(notificationLabel)
    notificationItem.appendChild(notificationSwitch)
    form.appendChild(notificationItem)
  }

  // 电脑端选择框
  private createDesktopSelectField(label: string, value: string, options: Array<{value: string, label: string}>, onChange: (value: string) => void): HTMLElement {
    const field = document.createElement('div')
    field.style.cssText = 'display: flex; align-items: center; gap: 12px;'

    const labelEl = document.createElement('label')
    labelEl.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); min-width: 120px;'
    labelEl.textContent = label

    const select = document.createElement('select')
    select.className = 'b3-text-field fn__flex-1'
    select.style.cssText = `
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid var(--b3-border-color);
      background: var(--b3-theme-background);
      color: var(--b3-theme-on-background);
      font-size: 14px;
      cursor: pointer;
    `

    options.forEach(opt => {
      const option = document.createElement('option')
      option.value = opt.value
      option.textContent = opt.label
      select.appendChild(option)
    })
    select.value = value

    // 使用 addEventListener 确保事件正确绑定
    select.addEventListener('change', () => {
      console.log('Desktop select changed to:', select.value)
      onChange(select.value)
    })

    field.appendChild(labelEl)
    field.appendChild(select)
    return field
  }

  // 手机端按钮列表项
  private createMobileButtonItem(button: ButtonConfig, index: number, renderList: () => void, configsArray: ButtonConfig[]): HTMLElement {
    const item = document.createElement('div')
    item.style.cssText = `
      border: 1px solid var(--b3-border-color);
      border-radius: 6px;
      padding: 12px;
      background: var(--b3-theme-surface);
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      position: relative;
      transition: all 0.2s ease;
    `
    item.draggable = true
    
    let isExpanded = false
    
    // 触摸拖拽相关变量
    let touchStartY = 0
    let touchStartTime = 0
    let isDragging = false
    let longPressTimer: number | null = null
    let draggedElement: HTMLElement | null = null
    let placeholder: HTMLElement | null = null
    let initialTouchY = 0
    
    // 桌面端拖拽事件
    item.ondragstart = (e) => {
      e.dataTransfer!.effectAllowed = 'move'
      e.dataTransfer!.setData('text/plain', index.toString())
      item.style.opacity = '0.4'
    }
    
    item.ondragend = (e) => {
      item.style.opacity = '1'
    }
    
    item.ondragover = (e) => {
      e.preventDefault()
      e.dataTransfer!.dropEffect = 'move'
      item.style.borderColor = 'var(--b3-theme-primary)'
    }
    
    item.ondragleave = (e) => {
      item.style.borderColor = 'var(--b3-border-color)'
    }
    
    item.ondrop = (e) => {
      e.preventDefault()
      item.style.borderColor = 'var(--b3-border-color)'
      
      const fromIndex = parseInt(e.dataTransfer!.getData('text/plain'))
      const toIndex = index
      
      if (fromIndex !== toIndex) {
        // 交换按钮位置
        const sortedButtons = [...configsArray].sort((a, b) => a.sort - b.sort)
        const [movedButton] = sortedButtons.splice(fromIndex, 1)
        sortedButtons.splice(toIndex, 0, movedButton)
        
        // 重新分配 sort 值
        sortedButtons.forEach((btn, idx) => {
          btn.sort = idx + 1
        })
        
        renderList()
      }
    }
    
    // 移动端触摸拖拽事件
    const handleTouchStart = (e: TouchEvent) => {
      // 如果已经在拖拽或展开状态，不响应
      if (isDragging || isExpanded) return
      
      const touch = e.touches[0]
      touchStartY = touch.clientY
      touchStartTime = Date.now()
      initialTouchY = touch.clientY
      
      // 长按检测
      longPressTimer = window.setTimeout(() => {
        const now = Date.now()
        if (now - touchStartTime >= 300 && !isDragging && !isExpanded) {
          // 开始拖拽
          isDragging = true
          draggedElement = item
          
          // 创建占位符
          placeholder = document.createElement('div')
          placeholder.style.cssText = `
            height: ${item.offsetHeight}px;
            border: 2px dashed var(--b3-theme-primary);
            border-radius: 6px;
            margin: 4px 0;
            background: var(--b3-theme-background);
            opacity: 0.5;
          `
          
          // 样式变化 - 使用 transform 和 will-change 优化性能
          item.style.willChange = 'transform, opacity'
          item.style.opacity = '0.8'
          item.style.transform = 'scale(1.05)'
          item.style.boxShadow = '0 8px 16px rgba(0,0,0,0.2)'
          item.style.zIndex = '1000'
          item.style.position = 'fixed'
          item.style.width = `${item.offsetWidth}px`
          item.style.left = `${item.getBoundingClientRect().left}px`
          item.style.top = `${touch.clientY - item.offsetHeight / 2}px`
          item.style.pointerEvents = 'none' // 避免干扰触摸检测
          
          // 插入占位符
          item.parentElement?.insertBefore(placeholder, item)
          
          // 震动反馈
          if (navigator.vibrate) {
            navigator.vibrate(50)
          }
        }
      }, 300)
    }
    
    const handleTouchMove = (e: TouchEvent) => {
      // 如果还没开始拖拽，但手指移动了超过10px，取消长按检测
      if (!isDragging) {
        const touch = e.touches[0]
        const deltaY = Math.abs(touch.clientY - initialTouchY)
        if (deltaY > 10 && longPressTimer) {
          clearTimeout(longPressTimer)
          longPressTimer = null
        }
        return
      }
      
      if (!draggedElement || !placeholder) return
      
      e.preventDefault()
      e.stopPropagation()
      const touch = e.touches[0]
      
      // 使用 transform 代替直接修改 top，性能更好
      const currentTop = touch.clientY - draggedElement.offsetHeight / 2
      const initialTop = parseFloat(draggedElement.style.top) || currentTop
      const deltaY = currentTop - initialTop
      draggedElement.style.transform = `scale(1.05) translateY(${deltaY}px)`
      
      // 节流：使用 requestAnimationFrame 优化重排
      requestAnimationFrame(() => {
        if (!draggedElement || !placeholder) return
        
        // 检测与其他项的位置关系
        const allItems = Array.from(item.parentElement?.children || []).filter(
          (el) => el !== draggedElement && el !== placeholder && el.hasAttribute('draggable')
        ) as HTMLElement[]
        
        let targetItem: HTMLElement | null = null
        let insertBefore = true
        
        for (const otherItem of allItems) {
          const rect = otherItem.getBoundingClientRect()
          const centerY = rect.top + rect.height / 2
          
          if (touch.clientY < centerY && touch.clientY > rect.top - 20) {
            targetItem = otherItem
            insertBefore = true
            break
          } else if (touch.clientY > centerY && touch.clientY < rect.bottom + 20) {
            targetItem = otherItem
            insertBefore = false
            break
          }
        }
        
        // 移动占位符
        if (targetItem && placeholder && placeholder.parentElement) {
          if (insertBefore) {
            targetItem.parentElement?.insertBefore(placeholder, targetItem)
          } else {
            targetItem.parentElement?.insertBefore(placeholder, targetItem.nextSibling)
          }
        }
      })
    }
    
    const handleTouchEnd = (e: TouchEvent) => {
      // 清除长按定时器
      if (longPressTimer) {
        clearTimeout(longPressTimer)
        longPressTimer = null
      }
      
      // 如果没有在拖拽状态，直接返回
      if (!isDragging) {
        return
      }
      
      e.preventDefault()
      e.stopPropagation()
      
      isDragging = false
      
      if (draggedElement && placeholder) {
        // 计算新位置
        const allItems = Array.from(item.parentElement?.children || []).filter(
          (el) => el.hasAttribute('draggable')
        ) as HTMLElement[]
        
        const oldIndex = allItems.indexOf(draggedElement)
        
        // 插入到占位符位置
        placeholder.parentElement?.insertBefore(draggedElement, placeholder)
        placeholder.remove()
        
        // 恢复样式 - 使用 transition 实现平滑过渡
        draggedElement.style.transition = 'all 0.2s ease'
        draggedElement.style.willChange = 'auto'
        draggedElement.style.opacity = '1'
        draggedElement.style.transform = ''
        draggedElement.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'
        draggedElement.style.zIndex = ''
        draggedElement.style.position = 'relative'
        draggedElement.style.width = ''
        draggedElement.style.left = ''
        draggedElement.style.top = ''
        draggedElement.style.pointerEvents = ''
        
        // 移除 transition
        setTimeout(() => {
          if (draggedElement) {
            draggedElement.style.transition = ''
          }
        }, 200)
        
        // 计算新的索引
        const newAllItems = Array.from(item.parentElement?.children || []).filter(
          (el) => el.hasAttribute('draggable')
        ) as HTMLElement[]
        const newIndex = newAllItems.indexOf(draggedElement)
        
        // 更新排序
        if (oldIndex !== newIndex && oldIndex !== -1 && newIndex !== -1) {
          const sortedButtons = [...configsArray].sort((a, b) => a.sort - b.sort)
          const [movedButton] = sortedButtons.splice(oldIndex, 1)
          sortedButtons.splice(newIndex, 0, movedButton)
          
          sortedButtons.forEach((btn, idx) => {
            btn.sort = idx + 1
          })
          
          renderList()
        }
      }
      
      draggedElement = null
      placeholder = null
      touchStartY = 0
      touchStartTime = 0
      initialTouchY = 0
    }
    
    // 绑定触摸事件到拖动手柄
    item.addEventListener('touchstart', handleTouchStart, { passive: true })
    item.addEventListener('touchmove', handleTouchMove, { passive: false })
    item.addEventListener('touchend', handleTouchEnd)
    item.addEventListener('touchcancel', handleTouchEnd)
    
    const header = document.createElement('div')
    header.style.cssText = 'display: flex; align-items: center; gap: 10px; cursor: pointer;'
    
    const dragHandle = document.createElement('span')
    dragHandle.textContent = '⋮⋮'
    dragHandle.style.cssText = `
      font-size: 18px;
      color: var(--b3-theme-on-surface-light);
      cursor: move;
      touch-action: none;
    `
    dragHandle.title = '长按拖动排序'

    const iconSpan = document.createElement('span')
    iconSpan.className = 'toolbar-customizer-button-icon'
    iconSpan.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 6px;
      background: var(--b3-theme-background);
      font-size: 16px;
      flex-shrink: 0;
    `
    this.updateIconDisplay(iconSpan, button.icon)
    
    const infoDiv = document.createElement('div')
    infoDiv.style.cssText = 'flex: 1; min-width: 0;'
    infoDiv.innerHTML = `
      <div style="font-weight: 500; font-size: 14px; color: var(--b3-theme-on-background); margin-bottom: 4px;">${button.name}</div>
      <div style="font-size: 11px; color: var(--b3-theme-on-surface-light);">
        ${button.type === 'builtin' ? '①思源内置功能【简单】' : button.type === 'template' ? '②手写模板插入【简单】' : button.type === 'shortcut' ? '③电脑端快捷键【简单】' : '④自动化模拟点击【难】'}
      </div>
    `
    
    const expandIcon = document.createElement('span')
    expandIcon.textContent = '▼'
    expandIcon.style.cssText = `
      font-size: 10px;
      color: var(--b3-theme-on-surface-light);
      transition: transform 0.2s ease;
      flex-shrink: 0;
    `
    
    const deleteBtn = document.createElement('button')
    deleteBtn.className = 'b3-button b3-button--text'
    deleteBtn.textContent = '删除'
    deleteBtn.style.cssText = `
      padding: 4px 10px;
      font-size: 12px;
      color: var(--b3-card-error-color);
      flex-shrink: 0;
      border-radius: 4px;
    `
    deleteBtn.onclick = async (e) => {
      e.stopPropagation()
      if (await this.showConfirmDialog(`确定删除"${button.name}"？`)) {
        // 从配置数组中删除
        const realIndex = configsArray.findIndex(btn => btn.id === button.id)
        if (realIndex !== -1) {
          configsArray.splice(realIndex, 1)
          // 确保排序值连续
          configsArray.sort((a, b) => a.sort - b.sort).forEach((btn, idx) => {
            btn.sort = idx + 1
          })
          renderList()
        }
      }
    }

    // 启用/禁用开关
    const enabledToggle = document.createElement('input')
    enabledToggle.type = 'checkbox'
    enabledToggle.className = 'b3-switch'
    enabledToggle.checked = button.enabled !== false
    enabledToggle.style.cssText = 'transform: scale(0.8); flex-shrink: 0; cursor: pointer;'
    enabledToggle.title = button.enabled !== false ? '点击禁用按钮' : '点击启用按钮'
    enabledToggle.onclick = (e) => {
      e.stopPropagation()
      button.enabled = enabledToggle.checked
      enabledToggle.title = enabledToggle.checked ? '点击禁用按钮' : '点击启用按钮'
      // 更新按钮项的透明度
      item.style.opacity = enabledToggle.checked ? '1' : '0.5'
    }
    // 根据启用状态设置透明度
    if (button.enabled === false) {
      item.style.opacity = '0.5'
    }

    header.appendChild(dragHandle)
    header.appendChild(iconSpan)
    header.appendChild(infoDiv)
    header.appendChild(expandIcon)
    header.appendChild(enabledToggle)
    header.appendChild(deleteBtn)
    
    const editForm = document.createElement('div')
    editForm.style.cssText = `
      display: none;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--b3-border-color);
      gap: 10px;
      flex-direction: column;
    `

    // 名称输入框 - 需要保存引用以便在选择按钮时更新
    const nameField = this.createInputField('名称', button.name, '按钮显示名称', (v) => {
      button.name = v
      infoDiv.querySelector('div:first-child')!.textContent = v
    })
    editForm.appendChild(nameField)
    const nameInput = nameField.querySelector('input') as HTMLInputElement
    
    // 类型选择 - 需要动态更新表单
    const typeField = this.createSelectField('选择功能', button.type, [
      { value: 'builtin', label: '①思源内置功能【简单】' },
      { value: 'template', label: '②手写模板插入【简单】' },
      { value: 'shortcut', label: '③电脑端快捷键【简单】' },
      { value: 'click-sequence', label: '④自动化模拟点击【难】' }
    ], (v) => { 
      button.type = v as any
      // 重新渲染整个表单
      updateTypeFields()
    })
    editForm.appendChild(typeField)
    
    // 类型相关字段的容器
    const typeFieldsContainer = document.createElement('div')
    typeFieldsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 10px;'
    editForm.appendChild(typeFieldsContainer)
    
    // 更新类型相关字段的函数
    const updateTypeFields = () => {
      typeFieldsContainer.innerHTML = ''
      if (button.type === 'builtin') {
        // 按钮选择器字段（带选择按钮）
        const builtinContainer = document.createElement('div')
        builtinContainer.style.cssText = 'display: flex; flex-direction: column; gap: 6px;'

        const label = document.createElement('label')
        label.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface);'
        label.textContent = '按钮选择器'

        const inputWrapper = document.createElement('div')
        inputWrapper.style.cssText = 'display: flex; gap: 8px; align-items: center;'

        const input = document.createElement('input')
        input.type = 'text'
        input.value = button.builtinId || ''
        input.placeholder = '选择或输入按钮ID'
        input.className = 'b3-text-field fn__flex-1'
        input.style.cssText = 'flex: 1;'

        const selectBtn = document.createElement('button')
        selectBtn.className = 'b3-button b3-button--outline'
        selectBtn.textContent = '选择'
        selectBtn.style.cssText = 'padding: 6px 12px; font-size: 13px; flex-shrink: 0; white-space: nowrap;'

        input.oninput = () => {
          button.builtinId = input.value
        }

        selectBtn.onclick = () => {
          this.showButtonIdPicker(input.value, (result) => {
            input.value = result.id
            button.builtinId = result.id
            // 自动填充名称和图标
            button.name = result.name
            button.icon = result.icon
            // 更新显示
            infoDiv.querySelector('div:first-child')!.textContent = result.name
            this.updateIconDisplay(iconSpan, result.icon)
            // 同步更新名称和图标输入框
            if (nameInput) nameInput.value = result.name
            if (iconInput) iconInput.value = result.icon
            if (iconPreview) this.updateIconDisplay(iconPreview, result.icon)
          })
        }

        inputWrapper.appendChild(input)
        inputWrapper.appendChild(selectBtn)
        builtinContainer.appendChild(label)
        builtinContainer.appendChild(inputWrapper)

        // 添加帮助链接
        const hint = document.createElement('div')
        hint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light); margin-top: -4px; padding-left: 4px;'
        hint.innerHTML = '💡 <a href="#" style="color: var(--b3-theme-primary); text-decoration: none; font-weight: 500;">查看常用ID →</a>'

        const link = hint.querySelector('a')
        if (link) {
          link.onclick = (e) => {
            e.preventDefault()
            // 使用 setTimeout 确保 DOM 完全渲染后再查找
            setTimeout(() => {
              const settingItems = Array.from(document.querySelectorAll('.b3-label'))
              const helpSection = settingItems.find(item => {
                const descEl = item.querySelector('.b3-label__text')
                const text = descEl?.textContent
                // 查找包含"思源内置菜单ID参考"的项
                return descEl && text?.includes('思源内置菜单ID参考')
              })

              if (helpSection) {
                // 先滚动到该区域
                helpSection.scrollIntoView({ behavior: 'smooth', block: 'center' })
                // 添加高亮效果
                const helpElement = helpSection as HTMLElement
                const originalBg = helpElement.style.background
                helpElement.style.background = 'var(--b3-theme-primary-lightest)'
                setTimeout(() => {
                  helpElement.style.background = originalBg
                }, 2000)
              }
            }, 100)
          }
        }

        builtinContainer.appendChild(hint)
        typeFieldsContainer.appendChild(builtinContainer)
      } else if (button.type === 'template') {
        const templateContainer = document.createElement('div')
        templateContainer.style.cssText = 'display: flex; flex-direction: column; gap: 6px;'
        
        const textarea = this.createTextareaField('模板内容', button.template || '', '插入的文本', (v) => { button.template = v })
        templateContainer.appendChild(textarea)
        
        // 添加变量说明
        const hint = document.createElement('div')
        hint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light); padding: 8px; background: var(--b3-theme-surface); border-radius: 4px;'
        hint.innerHTML = `
          <div style="font-weight: 500; margin-bottom: 6px;">💡 支持的模板变量：</div>
          <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 8px; font-family: monospace; font-size: 10px;">
            <code>{{date}}</code><span>日期 (2026-01-18)</span>
            <code>{{time}}</code><span>时间 (14:30:45)</span>
            <code>{{datetime}}</code><span>日期时间</span>
            <code>{{year}}</code><span>年份 (2026)</span>
            <code>{{month}}</code><span>月份 (01)</span>
            <code>{{day}}</code><span>日 (18)</span>
            <code>{{hour}}</code><span>小时 (14)</span>
            <code>{{minute}}</code><span>分钟 (30)</span>
            <code>{{second}}</code><span>秒 (45)</span>
            <code>{{week}}</code><span>星期几</span>
          </div>
        `
        templateContainer.appendChild(hint)
        typeFieldsContainer.appendChild(templateContainer)
      } else if (button.type === 'click-sequence') {
        // 点击序列配置
        const clickSequenceContainer = document.createElement('div')
        clickSequenceContainer.style.cssText = 'display: flex; flex-direction: column; gap: 6px;'

        // 标签行容器（包含标签和选择按钮）
        const labelRow = document.createElement('div')
        labelRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px;'

        const label = document.createElement('label')
        label.textContent = '点击序列（每行一个选择器）'
        label.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface);'
        labelRow.appendChild(label)

        // 预设按钮
        const presetBtn = document.createElement('button')
        presetBtn.className = 'b3-button b3-button--outline'
        presetBtn.textContent = '选择'
        presetBtn.style.cssText = 'padding: 4px 12px; font-size: 12px; white-space: nowrap;'
        presetBtn.onclick = () => {
          // 根据配置数组判断当前是手机配置还是电脑配置区域
          const isMobileConfig = configsArray === this.mobileButtonConfigs
          showClickSequenceSelector({
            platform: isMobileConfig ? 'mobile' : 'desktop',
            onSelect: (sequence) => {
              const textarea = textareaContainer.querySelector('textarea') as HTMLTextAreaElement
              if (textarea) {
                textarea.value = sequence.join('\n')
                button.clickSequence = sequence
                // 更新行号显示
                ;(textareaContainer as any).updateLineNumbers()
              }
            }
          })
        }
        labelRow.appendChild(presetBtn)

        clickSequenceContainer.appendChild(labelRow)

        // 创建带行号的 textarea
        const textareaContainer = this.createLineNumberedTextarea(
          button.clickSequence?.join('\n') || '',
          (value) => {
            button.clickSequence = value.split('\n').filter(line => line.trim())
          }
        )
        clickSequenceContainer.appendChild(textareaContainer)

        const hint = document.createElement('div')
        hint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light); padding-left: 4px;'
        hint.innerHTML = '💡 每行填写一个选择器，支持：<br>• 简单标识符（如 barSettings）<br>• CSS选择器（如 #barSettings）<br>• <strong>文本内容（如 text:复制块引用）</strong>'
        clickSequenceContainer.appendChild(hint)

        typeFieldsContainer.appendChild(clickSequenceContainer)
      } else if (button.type === 'shortcut') {
        // 快捷键配置
        const shortcutContainer = document.createElement('div')
        shortcutContainer.style.cssText = 'display: flex; flex-direction: column; gap: 6px;'
        
        const inputField = this.createInputField('快捷键组合', button.shortcutKey || '', '快捷键格式：Alt+5 / Ctrl+B等', (v) => { button.shortcutKey = v })
        inputField.querySelector('input')!.style.fontFamily = 'monospace'
        shortcutContainer.appendChild(inputField)
        
        // 添加快捷键提示
        const hint = document.createElement('div')
        hint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light); padding: 8px; background: var(--b3-theme-surface); border-radius: 4px; overflow-x: auto;'
        hint.innerHTML = `
          <table style="width: 100%; border-collapse: collapse; font-family: monospace;">
            <tr><td>💡更多快捷键，请查看：思源桌面端➡设置➡快捷键</td></tr>
            <tr><th style="padding: 4px; text-align: left; border-bottom: 1px solid var(--b3-theme-border);">快捷键</th><th style="padding: 4px; text-align: left; border-bottom: 1px solid var(--b3-theme-border);">功能</th></tr>
            <tr><td><code>Alt+5</code></td><td>打开日记</td></tr>
            <tr><td><code>Alt+P</code></td><td>打开设置</td></tr>
            <tr><td><code>Alt+Shift+P</code></td><td>命令面板</td></tr>
            <tr><td><code>Ctrl+P</code></td><td>全局搜索</td></tr>
            <tr><td><code>Ctrl+F</code></td><td>当前文档搜索</td></tr>
            <tr><td><code>Ctrl+H</code></td><td>替换</td></tr>
            <tr><td><code>Ctrl+N</code></td><td>新建文档</td></tr>
            <tr><td><code>Alt+1</code></td><td>文件树</td></tr>
            <tr><td><code>Alt+2</code></td><td>大纲</td></tr>
            <tr><td><code>Alt+3</code></td><td>书签</td></tr>
            <tr><td><code>Alt+4</code></td><td>标签</td></tr>
            <tr><td><code>Alt+7</code></td><td>反向链接</td></tr>
            <tr><td><code>Ctrl+W</code></td><td>关闭标签页</td></tr>
          </table>
        `
        
        shortcutContainer.appendChild(hint)
        typeFieldsContainer.appendChild(shortcutContainer)
      }
    }

    // 初始化类型字段
    updateTypeFields()

    // 图标输入框 - 需要保存引用以便在选择按钮时更新
    const iconField = this.createIconField('图标', button.icon, (v) => {
      button.icon = v
      // 更新显示的图标 - 使用特定的 class 来查找
      const iconSpan = item.querySelector('.toolbar-customizer-button-icon') as HTMLElement
      if (iconSpan) this.updateIconDisplay(iconSpan, v)
    })
    editForm.appendChild(iconField)
    const iconInput = iconField.querySelector('input') as HTMLInputElement
    const iconPreview = iconField.querySelector('span') as HTMLElement
    editForm.appendChild(this.createInputField('图标大小', button.iconSize.toString(), '18', (v) => { button.iconSize = parseInt(v) || 18 }, 'number'))
    editForm.appendChild(this.createInputField('按钮宽度', button.minWidth.toString(), '32', (v) => { button.minWidth = parseInt(v) || 32 }, 'number'))
    editForm.appendChild(this.createInputField('右边距', button.marginRight.toString(), '8', (v) => { button.marginRight = parseInt(v) || 8 }, 'number'))
    editForm.appendChild(this.createInputField('排序', button.sort.toString(), '数字越小越靠左', (v) => { 
      button.sort = parseInt(v) || 1
      // 重新分配排序值
      const sortedButtons = [...this.buttonConfigs].sort((a, b) => a.sort - b.sort)
      sortedButtons.forEach((btn, idx) => {
        btn.sort = idx + 1
      })
      renderList()
    }, 'number'))
    
    // 右上角提示开关（手机端）
    editForm.appendChild(this.createSwitchField('右上角提示', button.showNotification, (v) => {
      button.showNotification = v
    }))
    
    header.onclick = (e) => {
      if ((e.target as HTMLElement).closest('button')) return
      isExpanded = !isExpanded
      editForm.style.display = isExpanded ? 'flex' : 'none'
      expandIcon.style.transform = isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
    }
    
    item.appendChild(header)
    item.appendChild(editForm)
    return item
  }

  // 通用输入框创建方法（手机端用）
  private createInputField(label: string, value: string, placeholder: string, onChange: (value: string) => void, type: string = 'text'): HTMLElement {
    const field = document.createElement('div')
    field.style.cssText = `display: flex; flex-direction: column; gap: 6px;`

    const labelEl = document.createElement('label')
    labelEl.style.cssText = `font-size: 13px; font-weight: 500; color: var(--b3-theme-on-background);`
    labelEl.textContent = label

    const input = document.createElement('input')
    input.type = type
    input.value = value
    input.placeholder = placeholder
    input.className = 'b3-text-field'
    input.style.cssText = `
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid var(--b3-border-color);
      background: var(--b3-theme-background);
      color: var(--b3-theme-on-background);
      font-size: 14px;
      box-sizing: border-box;
      width: 100%;
    `
    input.onchange = () => onChange(input.value)

    field.appendChild(labelEl)
    field.appendChild(input)
    return field
  }

  // 选择框创建方法（手机端用）
  private createSelectField(label: string, value: string, options: Array<{value: string, label: string}>, onChange: (value: string) => void): HTMLElement {
    const field = document.createElement('div')
    field.style.cssText = `display: flex; flex-direction: column; gap: 6px;`

    const labelEl = document.createElement('label')
    labelEl.style.cssText = `font-size: 13px; font-weight: 500; color: var(--b3-theme-on-background);`
    labelEl.textContent = label

    const select = document.createElement('select')
    select.className = 'b3-text-field'
    select.style.cssText = `
      width: 100%;
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid var(--b3-border-color);
      background: var(--b3-theme-background);
      color: var(--b3-theme-on-background);
      font-size: 14px;
      cursor: pointer;
    `

    options.forEach(opt => {
      const option = document.createElement('option')
      option.value = opt.value
      option.textContent = opt.label
      select.appendChild(option)
    })

    select.value = value

    // 使用 addEventListener 确保事件正确绑定
    select.addEventListener('change', () => {
      console.log('Select changed to:', select.value)
      onChange(select.value)
    })

    field.appendChild(labelEl)
    field.appendChild(select)
    return field
  }

  // 文本域创建方法（手机端用）
  private createTextareaField(label: string, value: string, placeholder: string, onChange: (value: string) => void): HTMLElement {
    const field = document.createElement('div')
    field.style.cssText = `display: flex; flex-direction: column; gap: 6px;`

    const labelEl = document.createElement('label')
    labelEl.style.cssText = `font-size: 13px; font-weight: 500; color: var(--b3-theme-on-background);`
    labelEl.textContent = label

    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.placeholder = placeholder
    textarea.className = 'b3-text-field'
    textarea.style.cssText = `
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid var(--b3-border-color);
      background: var(--b3-theme-background);
      color: var(--b3-theme-on-background);
      font-size: 14px;
      resize: vertical;
      min-height: 60px;
      box-sizing: border-box;
      width: 100%;
    `
    textarea.onchange = () => onChange(textarea.value)

    field.appendChild(labelEl)
    field.appendChild(textarea)
    return field
  }

  // 开关创建方法（手机端用）
  private createSwitchField(label: string, checked: boolean, onChange: (value: boolean) => void): HTMLElement {
    const field = document.createElement('div')
    field.style.cssText = `display: flex; align-items: center; justify-content: space-between; padding: 4px 0;`

    const labelEl = document.createElement('label')
    labelEl.style.cssText = `font-size: 13px; font-weight: 500; color: var(--b3-theme-on-background);`
    labelEl.textContent = label

    const switchEl = document.createElement('input')
    switchEl.type = 'checkbox'
    switchEl.className = 'b3-switch'
    switchEl.checked = checked
    switchEl.style.cssText = `transform: scale(1.2);`
    switchEl.onchange = () => onChange(switchEl.checked)

    field.appendChild(labelEl)
    field.appendChild(switchEl)
    return field
  }

  // 图标选择字段（支持emoji和lucide图标）
  private createIconField(label: string, value: string, onChange: (value: string) => void): HTMLElement {
    const field = document.createElement('div')
    field.style.cssText = `display: flex; flex-direction: column; gap: 6px;`

    // 标题行：标签、选择按钮
    const labelRow = document.createElement('div')
    labelRow.style.cssText = `display: flex; align-items: center; justify-content: space-between;`

    const labelEl = document.createElement('label')
    labelEl.style.cssText = `font-size: 13px; font-weight: 500; color: var(--b3-theme-on-background);`
    labelEl.textContent = label

    // 选择按钮
    const selectBtn = document.createElement('button')
    selectBtn.className = 'b3-button b3-button--outline'
    selectBtn.textContent = '选择'
    selectBtn.style.cssText = `
      padding: 4px 12px;
      font-size: 12px;
      flex-shrink: 0;
    `

    labelRow.appendChild(labelEl)
    labelRow.appendChild(selectBtn)

    const inputWrapper = document.createElement('div')
    inputWrapper.style.cssText = `display: flex; gap: 8px; align-items: center;`

    const input = document.createElement('input')
    input.type = 'text'
    input.value = value
    input.placeholder = '输入emoji、lucide:图标名 或 icon名'
    input.className = 'b3-text-field'
    input.style.cssText = `
      flex: 1;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid var(--b3-border-color);
      background: var(--b3-theme-background);
      color: var(--b3-theme-on-background);
      font-size: 14px;
      box-sizing: border-box;
    `

    // 预览图标
    const preview = document.createElement('span')
    preview.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 6px;
      background: var(--b3-theme-background);
      border: 1px solid var(--b3-border-color);
      font-size: 16px;
      flex-shrink: 0;
    `
    this.updateIconDisplay(preview, value)

    input.oninput = () => {
      onChange(input.value)
      this.updateIconDisplay(preview, input.value)
    }

    // 点击选择按钮显示图标选择器
    selectBtn.onclick = () => {
      this.showIconPicker(input.value, (selectedIcon) => {
        input.value = selectedIcon
        onChange(selectedIcon)
        this.updateIconDisplay(preview, selectedIcon)
      })
    }

    inputWrapper.appendChild(input)
    inputWrapper.appendChild(preview)

    // 提示信息（移到下一行）
    const hint = document.createElement('div')
    hint.style.cssText = `font-size: 10px; color: var(--b3-theme-on-surface-light); margin-top: 2px;`
    hint.textContent = '🔍emoji | lucide:图标名 | icon名'

    field.appendChild(labelRow)
    field.appendChild(inputWrapper)
    field.appendChild(hint)
    return field
  }

  // 图标选择器（已迁移到 ui/iconPicker.ts）
  private showIconPicker(currentValue: string, onSelect: (icon: string) => void) {
    showIconPickerModal({ currentValue, onSelect })
  }

  // 更新图标显示（已迁移到 data/icons.ts）
  private updateIconDisplay(element: HTMLElement, iconValue: string) {
    updateIconDisplayUtil(element, iconValue)
  }

  // 应用小功能
  private applyFeatures() {
    // 移除旧样式
    this.removeFeatureStyles()

    const style = document.createElement('style')
    style.id = 'toolbar-customizer-feature-style'

    let styleContent = ''

    // 面包屑图标隐藏（使用 transform 缩放到 0，保持按钮位置不变）
    if (this.featureConfig.hideBreadcrumbIcon) {
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
    if (this.featureConfig.hideReadonlyButton) {
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
    if (this.featureConfig.hideDocMenuButton) {
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
    if (this.featureConfig.hideMoreButton) {
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
    
    // 工具栏按钮全局宽度
    if (this.featureConfig.toolbarButtonWidth !== 32) {
      styleContent += `
        .protyle-breadcrumb__bar button[data-custom-button],
        .protyle-breadcrumb button[data-custom-button] {
          min-width: ${this.featureConfig.toolbarButtonWidth}px !important;
        }
      `
    }
    
    // 手机端禁止左右滑动弹出
    if (this.isMobile && this.featureConfig.disableMobileSwipe) {
      const { disableFileTree, disableSettingMenu } = this.featureConfig
      
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

  // 设置手机端滑动禁用
  private setupMobileSwipeDisable() {
    if (!this.isMobile || !this.featureConfig.disableMobileSwipe) return
    if (!document.getElementById('sidebar')) return
    
    let startX = 0
    let isFristMove = true
    let mask: HTMLElement | null = null
    
    const touchStartHandler = (e: TouchEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('#menu, #sidebar')) return
      
      isFristMove = true
      const touch = e.touches[0]
      startX = touch.clientX
    }
    
    const touchMoveHandler = (e: TouchEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('#menu, #sidebar')) return
      
      if (isFristMove) {
        isFristMove = false
        document.getElementById('menu')?.classList.add('moving')
        document.getElementById('sidebar')?.classList.add('moving')
        mask = document.querySelector('.side-mask')
        mask?.classList.add('moving')
      }
      
      const touch = e.touches[0]
      const currentX = touch?.clientX || 0
      const diffX = currentX - startX
      
      if (Math.abs(diffX) > 0 && mask) {
        if (diffX < 0) {
          // 左滑 设置菜单
          if (mask.classList.contains('move-right')) mask.classList.remove('move-right')
          if (!mask.classList.contains('move-left')) mask.classList.add('move-left')
        } else {
          // 右滑 文档树
          if (mask.classList.contains('move-left')) mask.classList.remove('move-left')
          if (!mask.classList.contains('move-right')) mask.classList.add('move-right')
        }
        startX = currentX
      }
    }
    
    const touchEndHandler = (e: TouchEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('#menu, #sidebar')) return
      
      if (!isFristMove) {
        this.closeMobilePanel()
      }
      isFristMove = true
      document.getElementById('menu')?.classList.remove('moving')
      document.getElementById('sidebar')?.classList.remove('moving')
      document.querySelector('.side-mask')?.classList.remove('moving')
    }
    
    // 移除旧监听器（如果存在）
    document.removeEventListener('touchstart', touchStartHandler as any, true)
    document.removeEventListener('touchmove', touchMoveHandler as any, false)
    document.removeEventListener('touchend', touchEndHandler as any, false)
    
    // 添加新监听器
    document.addEventListener('touchstart', touchStartHandler as any, true)
    document.addEventListener('touchmove', touchMoveHandler as any, false)
    document.addEventListener('touchend', touchEndHandler as any, false)
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

  // 应用手机端工具栏样式
  private applyMobileToolbarStyle() {
    if (!this.isMobile) return

    // 使用 style 标签来覆盖 toolbarManager 中的 !important 样式
    const styleId = 'mobile-toolbar-background-color-style'
    let style = document.getElementById(styleId) as HTMLStyleElement

    if (!style) {
      style = document.createElement('style')
      style.id = styleId
      document.head.appendChild(style)
    }

    // 生成 CSS 规则，使用 !important 来覆盖默认样式
    const cssRules: string[] = []

    // 判断是否使用主题颜色
    const bgColor = this.mobileConfig.useThemeColor
      ? 'var(--b3-theme-surface)'
      : this.mobileConfig.toolbarBackgroundColor

    // 通用设置：应用于顶部和底部工具栏（包括底部置底工具栏）
    cssRules.push(`
      @media (max-width: 768px) {
        .protyle-breadcrumb,
        .protyle-breadcrumb__bar,
        .protyle-breadcrumb__bar[data-input-method],
        .protyle-breadcrumb[data-input-method] {
          background-color: ${bgColor} !important;
          opacity: ${this.mobileConfig.toolbarOpacity} !important;
          height: ${this.mobileConfig.toolbarHeight} !important;
          min-height: ${this.mobileConfig.toolbarHeight} !important;
        }
      }
    `)

    // 底部专用设置：仅应用于置底工具栏
    if (this.mobileConfig.enableBottomToolbar) {
      cssRules.push(`
        @media (max-width: 768px) {
          .protyle-breadcrumb__bar[data-input-method],
          .protyle-breadcrumb[data-input-method] {
            z-index: ${this.mobileConfig.toolbarZIndex} !important;
          }
        }
      `)
    }

    style.textContent = cssRules.join('\n')
    // 确保样式在最后（最高优先级）
    document.head.appendChild(style)
  }

  // 移除功能样式
  private removeFeatureStyles() {
    const style = document.getElementById('toolbar-customizer-feature-style')
    if (style) {
      style.remove()
    }
  }

  /**
   * 创建带行号的 textarea
   * @param initialValue 初始值
   * @param onChange 内容变化回调
   * @returns HTMLElement 容器元素
   */
  private createLineNumberedTextarea(initialValue: string, onChange: (value: string) => void): HTMLElement {
    const container = document.createElement('div')
    container.style.cssText = `
      display: flex;
      border: 1px solid var(--b3-border-color);
      border-radius: 4px;
      overflow: hidden;
      background: var(--b3-theme-background);
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace;
      font-size: 13px;
      line-height: 1.5;
    `

    // 行号列
    const lineNumbers = document.createElement('div')
    lineNumbers.style.cssText = `
      padding: 8px 8px 8px 12px;
      background: var(--b3-theme-surface);
      color: var(--b3-theme-on-surface-light);
      text-align: right;
      user-select: none;
      border-right: 1px solid var(--b3-border-color);
      min-width: 40px;
    `

    // textarea
    const textarea = document.createElement('textarea')
    textarea.className = 'b3-text-field'
    textarea.value = initialValue
    textarea.style.cssText = `
      flex: 1;
      resize: vertical;
      min-height: 120px;
      border: none;
      padding: 8px 12px;
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
      background: transparent;
      outline: none;
      box-shadow: none;
    `
    textarea.placeholder = '.selector1\n.selector2\n.selector3'

    // 更新行号
    const updateLineNumbers = () => {
      const lines = textarea.value.split('\n').length
      lineNumbers.innerHTML = Array.from({ length: lines }, (_, i) => i + 1).join('<br>')
    }

    // 将更新函数暴露为容器的方法
    ;(container as any).updateLineNumbers = updateLineNumbers

    // 初始化行号
    updateLineNumbers()

    // 监听内容变化
    textarea.addEventListener('input', () => {
      updateLineNumbers()
      onChange(textarea.value)
    })

    // 同步滚动
    textarea.addEventListener('scroll', () => {
      lineNumbers.scrollTop = textarea.scrollTop
    })

    container.appendChild(lineNumbers)
    container.appendChild(textarea)

    return container
  }
}
