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
import * as lucideIcons from 'lucide';

// 导入新功能模块
import { 
  initMobileToolbarAdjuster,
  initCustomButtons,
  cleanup,
  DEFAULT_BUTTONS_CONFIG,
  DEFAULT_MOBILE_CONFIG,
  MobileToolbarConfig,
  ButtonConfig,
  isMobileDevice
} from './toolbarManager'

// 读取插件配置
let PluginInfo = {
  version: '',
}
try {
  PluginInfo = PluginInfoString
} catch (err) {
  console.log('Plugin info parse error: ', err)
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
  
  // 小功能配置
  private featureConfig = {
    hideBreadcrumbIcon: false,
    hideReadonlyButton: false,
    hideDocMenuButton: false,
    hideMoreButton: false,
    toolbarButtonWidth: 32,  // 工具栏按钮全局宽度（px）
    disableMobileSwipe: false,  // 手机端禁止左右滑动弹出
    disableFileTree: true,      // 禁止右滑弹出文档树
    disableSettingMenu: true    // 禁止左滑弹出设置菜单
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

    console.log('插件加载，平台:', this.platform)

    // ===== 加载配置 =====
    try {
      const savedMobileConfig = await this.loadData('mobileToolbarConfig')
      if (savedMobileConfig) {
        this.mobileConfig = {
          ...DEFAULT_MOBILE_CONFIG,
          ...savedMobileConfig
        }
      }

      // 检测并迁移旧的单一配置到分离的桌面/移动端配置
      const oldButtonConfigs = await this.loadData('buttonConfigs')
      
      // 加载电脑端按钮配置
      const savedDesktopButtons = await this.loadData('desktopButtonConfigs')
      if (savedDesktopButtons && savedDesktopButtons.length > 0) {
        this.desktopButtonConfigs = savedDesktopButtons.map((btn: any) => ({
          ...btn,
          minWidth: btn.minWidth !== undefined ? btn.minWidth : 32,
          showNotification: btn.showNotification !== undefined ? btn.showNotification : true,
          clickSequence: btn.clickSequence || []
        }))
      } else if (oldButtonConfigs && oldButtonConfigs.length > 0) {
        // 迁移旧配置到桌面端配置
        console.log('检测到旧配置，迁移到桌面端配置')
        this.desktopButtonConfigs = oldButtonConfigs.map((btn: any) => ({
          ...btn,
          minWidth: btn.minWidth !== undefined ? btn.minWidth : 32,
          showNotification: btn.showNotification !== undefined ? btn.showNotification : true,
          clickSequence: btn.clickSequence || []
        }))
        // 保存迁移后的配置
        await this.saveData('desktopButtonConfigs', this.desktopButtonConfigs)
      } else {
        // 如果没有保存的配置，使用默认配置
        this.desktopButtonConfigs = DEFAULT_BUTTONS_CONFIG.map(btn => ({...btn}))
      }

      // 加载手机端按钮配置
      const savedMobileButtons = await this.loadData('mobileButtonConfigs')
      if (savedMobileButtons && savedMobileButtons.length > 0) {
        this.mobileButtonConfigs = savedMobileButtons.map((btn: any) => ({
          ...btn,
          minWidth: btn.minWidth !== undefined ? btn.minWidth : 32,
          showNotification: btn.showNotification !== undefined ? btn.showNotification : true,
          clickSequence: btn.clickSequence || []
        }))
      } else if (oldButtonConfigs && oldButtonConfigs.length > 0) {
        // 迁移旧配置到移动端配置
        console.log('检测到旧配置，迁移到移动端配置')
        this.mobileButtonConfigs = oldButtonConfigs.map((btn: any) => ({
          ...btn,
          minWidth: btn.minWidth !== undefined ? btn.minWidth : 32,
          showNotification: btn.showNotification !== undefined ? btn.showNotification : true,
          clickSequence: btn.clickSequence || []
        }))
        // 保存迁移后的配置
        await this.saveData('mobileButtonConfigs', this.mobileButtonConfigs)
      } else {
        // 如果没有保存的配置，使用默认配置
        this.mobileButtonConfigs = DEFAULT_BUTTONS_CONFIG.map(btn => ({...btn}))
      }
      
      const savedFeatureConfig = await this.loadData('featureConfig')
      if (savedFeatureConfig) {
        this.featureConfig = {
          ...this.featureConfig,
          ...savedFeatureConfig
        }
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
    console.log('布局就绪，初始化插件功能')
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

  openSetting() {
    const setting = new Setting({
      width: this.isMobile ? '100%' : '800px',
      height: this.isMobile ? '100%' : '70vh',
      confirmCallback: async () => {
        await this.saveData('mobileToolbarConfig', this.mobileConfig)
        await this.saveData('desktopButtonConfigs', this.desktopButtonConfigs)
        await this.saveData('mobileButtonConfigs', this.mobileButtonConfigs)
        await this.saveData('featureConfig', this.featureConfig)
        
        showMessage('设置已保存，正在重载...', 2000, 'info')
        
        // 使用官方 API 重载界面
        await fetchSyncPost('/api/system/reloadUI', {})
      }
    })

    if (this.isMobile) {
      // 手机端：使用思源原生 b3-label 布局
      this.createMobileSettingLayout(setting)
    } else {
      // 电脑端：使用 fn__size200 左右分栏布局
      this.createDesktopSettingLayout(setting)
    }

    setting.open('工具栏定制器')
    
    // 在对话框打开后添加美化样式
    setTimeout(() => {
      const dialog = document.querySelector('.b3-dialog--open')
      if (dialog) {
        dialog.classList.add('toolbar-customizer-settings')
      }
    }, 0)
  }

  // 电脑端设置布局
  private createDesktopSettingLayout(setting: Setting) {


    // === 电脑端自定义按钮管理 ===
    setting.addItem({
      title: '🖥️ 电脑端自定义按钮',
      description: '管理电脑端工具栏自定义按钮（可拖动排序）',
      direction: 'row',
      createActionElement: () => {
        const container = document.createElement('div')
        container.style.cssText = 'display: flex; flex-direction: column; gap: 8px; width: 100%;'
        
        // 按钮列表
        const listContainer = document.createElement('div')
        listContainer.style.cssText = 'max-height: 400px; overflow-y: auto; border: 1px solid var(--b3-border-color); border-radius: 4px; padding: 8px;'
        
        let lastAddedButtonId: string | null = null
        
        const renderList = () => {
          listContainer.innerHTML = ''
          const sortedButtons = [...this.desktopButtonConfigs].sort((a, b) => a.sort - b.sort)
          
          sortedButtons.forEach((button, index) => {
            const item = this.createDesktopButtonItem(button, index, renderList, this.desktopButtonConfigs)
            listContainer.appendChild(item)
            
            // 只有在是刚添加的按钮时才自动展开
            if (lastAddedButtonId && button.id === lastAddedButtonId) {
              // 使用 setTimeout 确保 DOM 已渲染
              setTimeout(() => {
                const header = item.querySelector('[style*="cursor: pointer"]') as HTMLElement
                if (header) {
                  header.click()
                  // 滚动到该按钮
                  item.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                }
                // 清除标记
                lastAddedButtonId = null
              }, 100)
            }
          })
        }
        
        // 添加按钮
        const addBtn = document.createElement('button')
        addBtn.className = 'b3-button b3-button--outline'
        addBtn.innerHTML = '+ 添加新按钮'
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

    // === 小功能选择 ===
    setting.addItem({
      title: '⚙️ 小功能选择',
      description: '界面微调与体验优化',
      direction: 'row',
      createActionElement: () => {
        const container = document.createElement('div')
        container.style.cssText = 'display: flex; flex-direction: column; gap: 12px;'
        
        // 创建开关项的辅助函数
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
            await this.saveData('featureConfig', this.featureConfig)
            this.applyFeatures()
          }
          
          item.appendChild(label)
          item.appendChild(switchEl)
          return item
        }
        
        // 工具栏按钮宽度（放第一个）
        const widthItem = document.createElement('div')
        widthItem.style.cssText = 'display: flex; flex-direction: column; gap: 4px;'
        
        const widthRow = document.createElement('div')
        widthRow.style.cssText = 'display: flex; align-items: center; gap: 12px;'
        
        const widthLabel = document.createElement('label')
        widthLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); min-width: 120px;'
        widthLabel.textContent = '工具栏按钮宽度'
        
        const widthInput = document.createElement('input')
        widthInput.type = 'number'
        widthInput.value = this.featureConfig.toolbarButtonWidth.toString()
        widthInput.className = 'b3-text-field'
        widthInput.style.cssText = 'width: 80px;'
        widthInput.onchange = async () => {
          this.featureConfig.toolbarButtonWidth = parseInt(widthInput.value) || 32
          await this.saveData('featureConfig', this.featureConfig)
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
        
        // 面包屑图标隐藏
        container.appendChild(createSwitchItem('面包屑图标隐藏', this.featureConfig.hideBreadcrumbIcon, (v) => {
          this.featureConfig.hideBreadcrumbIcon = v
        }))
        
        // 锁定编辑按钮隐藏
        container.appendChild(createSwitchItem('锁定编辑按钮隐藏', this.featureConfig.hideReadonlyButton, (v) => {
          this.featureConfig.hideReadonlyButton = v
        }))
        
        // 文档菜单按钮隐藏
        container.appendChild(createSwitchItem('文档菜单按钮隐藏', this.featureConfig.hideDocMenuButton, (v) => {
          this.featureConfig.hideDocMenuButton = v
        }))
        
        // 更多按钮隐藏
        container.appendChild(createSwitchItem('更多按钮隐藏', this.featureConfig.hideMoreButton, (v) => {
          this.featureConfig.hideMoreButton = v
        }))
        
        // 手机端禁止左右滑动弹出
        if (this.isMobile) {
          container.appendChild(createSwitchItem('禁止左右滑动弹出', this.featureConfig.disableMobileSwipe, (v) => {
            this.featureConfig.disableMobileSwipe = v
          }))
        }
        
        return container
      }
    })

    // === 使用帮助（电脑端）===
    setting.addItem({
      title: '📖 使用说明和介绍',
      description: '功能介绍和使用指南',
      direction: 'row',
      createActionElement: () => {
        const container = document.createElement('div')
        container.style.cssText = 'font-size: 13px; line-height: 1.8; max-height: 400px; overflow-y: auto; padding-right: 8px;'
        
        container.innerHTML = `
          <div style="margin-bottom: 20px;">
            <div style="font-weight: bold; color: var(--b3-theme-primary); margin-bottom: 12px; font-size: 14px;">功能：手写模板插入</div>
            <ol style="margin: 0; padding-left: 20px;">
              <li>可设置模板内容</li>
              <li>点击一键插入</li>
              <li>支持md格式</li>
            </ol>
          </div>
          
          <div style="margin-bottom: 20px;">
            <div style="font-weight: bold; color: var(--b3-theme-primary); margin-bottom: 12px; font-size: 14px;">功能：模拟点击序列</div>
            
            <div style="margin-bottom: 12px;">
              <div style="font-weight: 500; margin-bottom: 8px;">1️⃣ 打开CSS选择器</div>
              <ol style="margin: 0; padding-left: 20px; color: var(--b3-theme-on-surface-light);">
                <li>点击左上角主菜单</li>
                <li>点击开发者工具</li>
                <li>Ctrl+Shift+C 开启选择器</li>
                <li>选中目标按钮</li>
                <li>查看并复制 ID 等属性</li>
              </ol>
            </div>
            
            <div style="margin-bottom: 12px;">
              <div style="font-weight: 500; margin-bottom: 8px;">2️⃣ 配置点击序列</div>
              <div style="padding-left: 20px; color: var(--b3-theme-on-surface-light);">根据想执行的顺序，依次添加元素 ID 即可！</div>
            </div>
            
            <div style="margin-bottom: 8px;">
              <div style="font-weight: 500; margin-bottom: 8px;">3️⃣ 支持识别方式</div>
              <div style="padding-left: 20px;">
                <code style="background: var(--b3-theme-surface); padding: 2px 6px; border-radius: 3px; font-size: 11px;">id</code>
                <code style="background: var(--b3-theme-surface); padding: 2px 6px; border-radius: 3px; font-size: 11px;">data-id</code>
                <code style="background: var(--b3-theme-surface); padding: 2px 6px; border-radius: 3px; font-size: 11px;">data-type</code>
                <code style="background: var(--b3-theme-surface); padding: 2px 6px; border-radius: 3px; font-size: 11px;">class</code>
                <code style="background: var(--b3-theme-surface); padding: 2px 6px; border-radius: 3px; font-size: 11px;">按钮文本</code>
              </div>
            </div>
          </div>
        `
        
        return container
      }
    })
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
      description: `已配置 ${this.buttonConfigs.length} 个按钮，点击展开编辑`,
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
            const item = this.createMobileButtonItem(button, index, renderList, this.mobileButtonConfigs)
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
    createGroupTitle('📱', '工具栏配置')

    setting.addItem({
      title: '是否将工具栏置底',
      description: '开启后才能调整输入法位置相关设置',
      createActionElement: () => {
        const toggle = document.createElement('input')
        toggle.type = 'checkbox'
        toggle.className = 'b3-switch'
        toggle.checked = this.mobileConfig.enableBottomToolbar
        toggle.style.cssText = 'transform: scale(1.2);'
        toggle.onchange = async () => {
          this.mobileConfig.enableBottomToolbar = toggle.checked
          await this.saveData('mobileConfig', this.mobileConfig)
        }
        return toggle
      }
    })

    setting.addItem({
      title: '输入法打开偏移',
      description: '输入法弹出时工具栏距底部距离，如：50px',
      createActionElement: () => {
        const input = document.createElement('input')
        input.className = 'b3-text-field fn__flex-center fn__size200'
        input.value = this.mobileConfig.openInputOffset
        input.style.cssText = 'font-size: 14px; padding: 8px;'
        input.disabled = !this.mobileConfig.enableBottomToolbar
        if (!this.mobileConfig.enableBottomToolbar) {
          input.style.cssText += 'background-color: var(--b3-theme-surface); color: var(--b3-theme-on-surface-light); cursor: not-allowed;'
        }
        input.onchange = () => { this.mobileConfig.openInputOffset = input.value }
        return input
      }
    })

    setting.addItem({
      title: '输入法关闭偏移',
      description: '输入法关闭时工具栏距底部距离，如：0px',
      createActionElement: () => {
        const input = document.createElement('input')
        input.className = 'b3-text-field fn__flex-center fn__size200'
        input.value = this.mobileConfig.closeInputOffset
        input.style.cssText = 'font-size: 14px; padding: 8px;'
        input.disabled = !this.mobileConfig.enableBottomToolbar
        if (!this.mobileConfig.enableBottomToolbar) {
          input.style.cssText += 'background-color: var(--b3-theme-surface); color: var(--b3-theme-on-surface-light); cursor: not-allowed;'
        }
        input.onchange = () => { this.mobileConfig.closeInputOffset = input.value }
        return input
      }
    })

    setting.addItem({
      title: '高度变化阈值',
      description: '窗口高度变化超过此百分比时触发（30-90）',
      createActionElement: () => {
        const input = document.createElement('input')
        input.className = 'b3-text-field fn__flex-center fn__size200'
        input.type = 'number'
        input.value = this.mobileConfig.heightThreshold.toString()
        input.style.cssText = 'font-size: 14px; padding: 8px;'
        input.min = '30'
        input.max = '90'
        input.disabled = !this.mobileConfig.enableBottomToolbar
        if (!this.mobileConfig.enableBottomToolbar) {
          input.style.cssText += 'background-color: var(--b3-theme-surface); color: var(--b3-theme-on-surface-light); cursor: not-allowed;'
        }
        input.onchange = () => { this.mobileConfig.heightThreshold = parseInt(input.value) || 70 }
        return input
      }
    })

    // 工具栏背景颜色
    setting.addItem({
      title: '工具栏背景颜色',
      description: '点击选择工具栏背景颜色',
      createActionElement: () => {
        const colorPicker = document.createElement('input')
        colorPicker.type = 'color'
        colorPicker.value = this.mobileConfig.toolbarBackgroundColor
        colorPicker.style.cssText = 'width: 60px; height: 40px; border: 1px solid var(--b3-border-color); border-radius: 4px; cursor: pointer;'
        
        colorPicker.onchange = async () => {
          this.mobileConfig.toolbarBackgroundColor = colorPicker.value
          await this.saveData('mobileConfig', this.mobileConfig)
          this.applyMobileToolbarStyle()
        }
        
        return colorPicker
      }
    })

    // 工具栏透明度
    setting.addItem({
      title: '透明度',
      description: '(0=完全透明，100=完全不透明)',
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

    
    // === 小功能选择 ===
    createGroupTitle('⚙️', '小功能选择')

    // 工具栏按钮宽度
    setting.addItem({
      title: '工具栏按钮宽度',
      description: '💡 可整体调整按钮间的宽度',
      createActionElement: () => {
        const input = document.createElement('input')
        input.className = 'b3-text-field fn__flex-center fn__size200'
        input.type = 'number'
        input.value = this.featureConfig.toolbarButtonWidth.toString()
        input.style.cssText = 'font-size: 14px; padding: 8px;'
        input.onchange = async () => {
          this.featureConfig.toolbarButtonWidth = parseInt(input.value) || 32
          await this.saveData('featureConfig', this.featureConfig)
          this.applyFeatures()
        }
        return input
      }
    })

    setting.addItem({
      title: '面包屑图标隐藏',
      description: '开启后隐藏面包屑左侧的图标',
      createActionElement: () => {
        const toggle = document.createElement('input')
        toggle.type = 'checkbox'
        toggle.className = 'b3-switch'
        toggle.checked = this.featureConfig.hideBreadcrumbIcon
        toggle.style.cssText = 'transform: scale(1.2);'
        toggle.onchange = async () => {
          this.featureConfig.hideBreadcrumbIcon = toggle.checked
          await this.saveData('featureConfig', this.featureConfig)
          this.applyFeatures()
        }
        return toggle
      }
    })

    setting.addItem({
      title: '锁定编辑按钮隐藏',
      description: '隐藏工具栏的锁定编辑按钮',
      createActionElement: () => {
        const toggle = document.createElement('input')
        toggle.type = 'checkbox'
        toggle.className = 'b3-switch'
        toggle.checked = this.featureConfig.hideReadonlyButton
        toggle.style.cssText = 'transform: scale(1.2);'
        toggle.onchange = async () => {
          this.featureConfig.hideReadonlyButton = toggle.checked
          await this.saveData('featureConfig', this.featureConfig)
          this.applyFeatures()
        }
        return toggle
      }
    })

    setting.addItem({
      title: '文档菜单按钮隐藏',
      description: '隐藏工具栏的文档菜单按钮',
      createActionElement: () => {
        const toggle = document.createElement('input')
        toggle.type = 'checkbox'
        toggle.className = 'b3-switch'
        toggle.checked = this.featureConfig.hideDocMenuButton
        toggle.style.cssText = 'transform: scale(1.2);'
        toggle.onchange = async () => {
          this.featureConfig.hideDocMenuButton = toggle.checked
          await this.saveData('featureConfig', this.featureConfig)
          this.applyFeatures()
        }
        return toggle
      }
    })

    setting.addItem({
      title: '更多按钮隐藏',
      description: '隐藏工具栏的更多按钮',
      createActionElement: () => {
        const toggle = document.createElement('input')
        toggle.type = 'checkbox'
        toggle.className = 'b3-switch'
        toggle.checked = this.featureConfig.hideMoreButton
        toggle.style.cssText = 'transform: scale(1.2);'
        toggle.onchange = async () => {
          this.featureConfig.hideMoreButton = toggle.checked
          await this.saveData('featureConfig', this.featureConfig)
          this.applyFeatures()
        }
        return toggle
      }
    })

    // 手机端禁止左右滑动弹出
    setting.addItem({
      title: '禁止左右滑动弹出',
      description: '开启后禁止左右滑动弹出文档树和设置菜单',
      createActionElement: () => {
        const toggle = document.createElement('input')
        toggle.type = 'checkbox'
        toggle.className = 'b3-switch'
        toggle.checked = this.featureConfig.disableMobileSwipe
        toggle.style.cssText = 'transform: scale(1.2);'
        toggle.onchange = async () => {
          this.featureConfig.disableMobileSwipe = toggle.checked
          await this.saveData('featureConfig', this.featureConfig)
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

  // 电脑端按钮列表项
  private createDesktopButtonItem(button: ButtonConfig, index: number, renderList: () => void, configsArray: ButtonConfig[]): HTMLElement {
    const item = document.createElement('div')
    item.style.cssText = `
      padding: 8px;
      border: 1px solid var(--b3-border-color);
      border-radius: 4px;
      margin-bottom: 4px;
      background: var(--b3-theme-background);
      cursor: move;
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
    header.style.cssText = 'display: flex; align-items: center; gap: 8px; cursor: pointer;'
    
    const dragHandle = document.createElement('span')
    dragHandle.textContent = '⋮⋮'
    dragHandle.style.cssText = 'font-size: 16px; color: var(--b3-theme-on-surface-light); cursor: move;'
    dragHandle.title = '拖动排序'
    
    const iconSpan = document.createElement('span')
    iconSpan.style.cssText = 'font-size: 16px;'
    this.updateIconDisplay(iconSpan, button.icon)
    
    const nameSpan = document.createElement('span')
    nameSpan.style.cssText = 'flex: 1; font-size: 13px;'
    nameSpan.textContent = button.name
    
    const expandIcon = document.createElement('span')
    expandIcon.textContent = '▼'
    expandIcon.style.cssText = 'font-size: 10px; transition: transform 0.2s;'
    
    const deleteBtn = document.createElement('button')
    deleteBtn.className = 'b3-button b3-button--text'
    deleteBtn.textContent = '删除'
    deleteBtn.style.cssText = 'padding: 2px 8px; font-size: 12px;'
    deleteBtn.onclick = (e) => {
      e.stopPropagation()
      if (confirm(`确定删除"${button.name}"？`)) {
        // 通过button.id查找在原数组中的真实索引
        const realIndex = configsArray.findIndex(btn => btn.id === button.id)
        if (realIndex !== -1) {
          configsArray.splice(realIndex, 1)
          // 删除后重新分配排序值
          const sortedButtons = [...configsArray].sort((a, b) => a.sort - b.sort)
          sortedButtons.forEach((btn, idx) => {
            btn.sort = idx + 1
          })
          renderList()
        }
      }
    }
    
    header.appendChild(dragHandle)
    header.appendChild(iconSpan)
    header.appendChild(nameSpan)
    header.appendChild(expandIcon)
    header.appendChild(deleteBtn)
    
    // 编辑表单
    const editForm = document.createElement('div')
    editForm.style.cssText = 'display: none; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--b3-border-color); gap: 8px; flex-direction: column;'
    
    editForm.appendChild(this.createDesktopField('名称', button.name, '按钮名称', (v) => { button.name = v; nameSpan.textContent = v }))
    editForm.appendChild(this.createDesktopSelectField('类型', button.type, [
      // { value: 'builtin', label: '思源内置功能' },  // 电脑端隐藏，代码保留
      { value: 'template', label: '手写模板插入' },
      { value: 'click-sequence', label: '模拟点击序列' }
    ], (v) => { 
      button.type = v as any
      // 重新渲染表单
      const newForm = document.createElement('div')
      newForm.style.cssText = editForm.style.cssText
      newForm.style.display = 'flex'
      this.populateDesktopEditForm(newForm, button, nameSpan)
      editForm.replaceWith(newForm)
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
      textarea.style.cssText = 'resize: vertical; min-height: 60px;'
      textarea.onchange = () => { button.template = textarea.value }
      templateField.appendChild(label)
      templateField.appendChild(textarea)
      editForm.appendChild(templateField)
    } else if (button.type === 'click-sequence') {
      // 点击序列配置
      const clickSequenceField = document.createElement('div')
      clickSequenceField.style.cssText = 'display: flex; flex-direction: column; gap: 4px;'
      
      const label = document.createElement('label')
      label.textContent = '点击序列（每行一个选择器）'
      label.style.cssText = 'font-size: 13px;'
      clickSequenceField.appendChild(label)
      
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

  // 填充电脑端编辑表单
  private populateDesktopEditForm(form: HTMLElement, button: ButtonConfig, nameSpan: HTMLElement, renderList?: () => void) {
    form.appendChild(this.createDesktopField('名称', button.name, '按钮名称', (v) => { button.name = v; nameSpan.textContent = v }))
    form.appendChild(this.createDesktopSelectField('类型', button.type, [
      // { value: 'builtin', label: '思源内置功能' },  // 电脑端隐藏，代码保留
      { value: 'template', label: '手写模板插入' },
      { value: 'click-sequence', label: '模拟点击序列' }
    ], (v) => { 
      button.type = v as any
      const newForm = document.createElement('div')
      newForm.style.cssText = form.style.cssText
      newForm.style.display = 'flex'
      this.populateDesktopEditForm(newForm, button, nameSpan, renderList)
      form.replaceWith(newForm)
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
      textarea.style.cssText = 'resize: vertical; min-height: 60px;'
      textarea.onchange = () => { button.template = textarea.value }
      templateField.appendChild(label)
      templateField.appendChild(textarea)
      form.appendChild(templateField)
    } else if (button.type === 'click-sequence') {
      // 点击序列配置
      const clickSequenceField = document.createElement('div')
      clickSequenceField.style.cssText = 'display: flex; flex-direction: column; gap: 4px;'
      
      const label = document.createElement('label')
      label.textContent = '点击序列（每行一个选择器）'
      label.style.cssText = 'font-size: 13px;'
      clickSequenceField.appendChild(label)
      
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
    select.className = 'b3-select fn__flex-1'
    options.forEach(opt => {
      const option = document.createElement('option')
      option.value = opt.value
      option.textContent = opt.label
      select.appendChild(option)
    })
    select.value = value
    select.onchange = () => onChange(select.value)
    
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
        ${button.type === 'builtin' ? '思源内置功能' : button.type === 'template' ? '手写模板插入' : '模拟点击序列'}
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
    deleteBtn.onclick = (e) => {
      e.stopPropagation()
      if (confirm(`确定删除"${button.name}"？`)) {
        // 通过button.id查找在原数组中的真实索引
        const realIndex = configsArray.findIndex(btn => btn.id === button.id)
        if (realIndex !== -1) {
          configsArray.splice(realIndex, 1)
          // 删除后重新分配排序值
          const sortedButtons = [...configsArray].sort((a, b) => a.sort - b.sort)
          sortedButtons.forEach((btn, idx) => {
            btn.sort = idx + 1
          })
          renderList()
        }
      }
    }
    
    header.appendChild(dragHandle)
    header.appendChild(iconSpan)
    header.appendChild(infoDiv)
    header.appendChild(expandIcon)
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
    
    editForm.appendChild(this.createInputField('名称', button.name, '按钮显示名称', (v) => { 
      button.name = v
      infoDiv.querySelector('div:first-child')!.textContent = v
    }))
    
    // 类型选择 - 需要动态更新表单
    const typeField = this.createSelectField('类型', button.type, [
      { value: 'builtin', label: '思源内置功能' },
      { value: 'template', label: '手写模板插入' },
      { value: 'click-sequence', label: '模拟点击序列' }
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
        // 按钮选择器字段
        const selectorField = this.createInputField('按钮选择器', button.builtinId || '', 'menuSearch', (v) => { button.builtinId = v })
        typeFieldsContainer.appendChild(selectorField)
        
        // 添加提示
        const hint = document.createElement('div')
        hint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light); margin-top: -6px; padding-left: 4px;'
        hint.innerHTML = '💡 支持: id、data-id、data-type、class、按钮文本 <a href="#" style="color: var(--b3-theme-primary); text-decoration: none; font-weight: 500;">查看常用ID →</a>'
        
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
                // 手机端查找 description 包含"思源内置菜单ID参考（F12查看更多）"的项
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
        
        typeFieldsContainer.appendChild(hint)
      } else if (button.type === 'template') {
        typeFieldsContainer.appendChild(this.createTextareaField('模板内容', button.template || '', '插入的文本', (v) => { button.template = v }))
      } else if (button.type === 'click-sequence') {
        // 点击序列配置
        const clickSequenceContainer = document.createElement('div')
        clickSequenceContainer.style.cssText = 'display: flex; flex-direction: column; gap: 6px;'
        
        const label = document.createElement('label')
        label.textContent = '点击序列（每行一个选择器）'
        label.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface);'
        clickSequenceContainer.appendChild(label)
        
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
      }
    }
    
    // 初始化类型字段
    updateTypeFields()
    
    editForm.appendChild(this.createIconField('图标', button.icon, (v) => { 
      button.icon = v
      // 更新显示的图标
      const iconSpan = item.querySelector('span') as HTMLElement
      this.updateIconDisplay(iconSpan, v)
    }))
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
    select.className = 'b3-select'
    // 移除内联样式，让 CSS 文件中的样式生效
    
    options.forEach(opt => {
      const option = document.createElement('option')
      option.value = opt.value
      option.textContent = opt.label
      select.appendChild(option)
    })
    
    select.value = value
    select.onchange = () => onChange(select.value)

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

  // 图标选择器弹窗
  private showIconPicker(currentValue: string, onSelect: (icon: string) => void) {
    const dialog = document.createElement('div')
    dialog.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 20px;
    `

    const panel = document.createElement('div')
    panel.style.cssText = `
      background: var(--b3-theme-background);
      border-radius: 8px;
      max-width: 600px;
      width: 100%;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    `

    // 标题栏
    const header = document.createElement('div')
    header.style.cssText = `
      padding: 16px 20px;
      border-bottom: 1px solid var(--b3-border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
    `
    header.innerHTML = `
      <div style="font-size: 16px; font-weight: 500;">选择图标</div>
    `
    
    const closeBtn = document.createElement('button')
    closeBtn.className = 'b3-button b3-button--text'
    closeBtn.textContent = '✕'
    closeBtn.style.cssText = `padding: 4px 8px; font-size: 18px;`
    closeBtn.onclick = () => document.body.removeChild(dialog)
    header.appendChild(closeBtn)

    // 搜索框
    const searchWrapper = document.createElement('div')
    searchWrapper.style.cssText = `padding: 12px 20px; border-bottom: 1px solid var(--b3-border-color);`
    const searchInput = document.createElement('input')
    searchInput.type = 'text'
    searchInput.placeholder = '搜索图标...'
    searchInput.className = 'b3-text-field'
    searchInput.style.cssText = `width: 100%; padding: 8px 12px;`
    searchWrapper.appendChild(searchInput)

    // 内容区域
    const content = document.createElement('div')
    content.style.cssText = `
      padding: 20px;
      overflow-y: auto;
      flex: 1;
    `

    // 分类标签
    const tabs = document.createElement('div')
    tabs.style.cssText = `
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    `

    const categories = [
      { id: 'emoji', name: 'Emoji', icons: ['😀', '😊', '🎉', '❤️', '⭐', '🔥', '💡', '🎨', '📝', '🔍', '⚙️', '📁', '🏠', '💻', '📱', '🌙', '☀️', '🌟', '✨', '🎯', '📌', '✅', '❌', '➕', '➖'] },
      { id: 'lucide', name: 'Lucide 图标', icons: [] }
    ]

    // 获取常用的 Lucide 图标
    const commonLucideIcons = [
      'Search', 'Settings', 'Menu', 'Home', 'User', 'Mail', 'Bell', 'Heart', 'Star', 
      'Bookmark', 'Calendar', 'Clock', 'Download', 'Upload', 'Trash', 'Edit', 'Copy', 
      'Share', 'Send', 'Save', 'Plus', 'Minus', 'Check', 'X', 'ChevronRight', 'ChevronLeft',
      'ChevronUp', 'ChevronDown', 'ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown',
      'File', 'Folder', 'Image', 'Video', 'Music', 'Code', 'Database', 'Cloud',
      'Lock', 'Unlock', 'Eye', 'EyeOff', 'Filter', 'Refresh', 'Info', 'AlertCircle',
      'CheckCircle', 'XCircle', 'HelpCircle', 'Zap', 'Sun', 'Moon', 'Volume', 'Volume2'
    ]

    let activeCategory = 'emoji'

    const renderContent = (category: string, filter: string = '') => {
      content.innerHTML = ''
      
      const grid = document.createElement('div')
      grid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(50px, 1fr));
        gap: 8px;
      `

      let icons: string[] = []
      
      if (category === 'emoji') {
        icons = categories[0].icons.filter(icon => !filter || icon.includes(filter))
      } else if (category === 'lucide') {
        icons = commonLucideIcons
          .filter(name => !filter || name.toLowerCase().includes(filter.toLowerCase()))
          .map(name => `lucide:${name}`)
      }

      icons.forEach(icon => {
        const btn = document.createElement('button')
        btn.className = 'b3-button'
        btn.style.cssText = `
          width: 50px;
          height: 50px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--b3-border-color);
          border-radius: 6px;
          cursor: pointer;
          font-size: 24px;
          background: var(--b3-theme-background);
        `
        
        this.updateIconDisplay(btn, icon)
        
        btn.onclick = () => {
          onSelect(icon)
          document.body.removeChild(dialog)
        }
        
        btn.onmouseenter = () => {
          btn.style.background = 'var(--b3-theme-surface)'
          btn.style.borderColor = 'var(--b3-theme-primary)'
        }
        
        btn.onmouseleave = () => {
          btn.style.background = 'var(--b3-theme-background)'
          btn.style.borderColor = 'var(--b3-border-color)'
        }
        
        grid.appendChild(btn)
      })

      content.appendChild(grid)
    }

    // 创建分类标签
    categories.forEach(cat => {
      const tab = document.createElement('button')
      tab.className = 'b3-button'
      tab.textContent = cat.name
      tab.style.cssText = `
        padding: 6px 16px;
        border-radius: 16px;
      `
      
      const updateTabStyle = () => {
        if (activeCategory === cat.id) {
          tab.classList.add('b3-button--outline')
          tab.style.background = 'var(--b3-theme-primary)'
          tab.style.color = 'var(--b3-theme-on-primary)'
        } else {
          tab.classList.remove('b3-button--outline')
          tab.style.background = ''
          tab.style.color = ''
        }
      }
      
      updateTabStyle()
      
      tab.onclick = () => {
        activeCategory = cat.id
        tabs.querySelectorAll('button').forEach(b => {
          b.style.background = ''
          b.style.color = ''
        })
        updateTabStyle()
        renderContent(cat.id, searchInput.value)
      }
      
      tabs.appendChild(tab)
    })

    // 搜索功能
    searchInput.oninput = () => {
      renderContent(activeCategory, searchInput.value)
    }

    content.appendChild(tabs)
    renderContent('emoji')

    panel.appendChild(header)
    panel.appendChild(searchWrapper)
    panel.appendChild(content)
    dialog.appendChild(panel)

    // 点击背景关闭
    dialog.onclick = (e) => {
      if (e.target === dialog) {
        document.body.removeChild(dialog)
      }
    }

    document.body.appendChild(dialog)
  }

  // 更新图标显示
  private updateIconDisplay(element: HTMLElement, iconValue: string) {
    element.innerHTML = ''
    
    if (!iconValue) {
      element.textContent = '?'
      return
    }

    // 检查是否是 lucide 图标（格式：lucide:IconName）
    if (iconValue.startsWith('lucide:')) {
      const iconName = iconValue.substring(7) // 去掉 "lucide:" 前缀
      const IconComponent = (lucideIcons as any)[iconName]
      
      if (IconComponent) {
        try {
          const svgString = IconComponent.toSvg({ 
            width: 16, 
            height: 16,
            color: 'var(--b3-theme-on-background)'
          })
          element.innerHTML = svgString
        } catch (e) {
          element.textContent = iconValue
        }
      } else {
        element.textContent = '?'
      }
    }
    // 检查是否是思源内置图标（格式：icon开头）
    else if (iconValue.startsWith('icon')) {
      element.innerHTML = `<svg style="width: 16px; height: 16px;"><use xlink:href="#${iconValue}"></use></svg>`
    }
    // 否则当作 emoji 或文本
    else {
      element.textContent = iconValue
    }
  }

  // 应用小功能
  private applyFeatures() {
    // 移除旧样式
    this.removeFeatureStyles()
    
    const style = document.createElement('style')
    style.id = 'toolbar-customizer-feature-style'
    
    let styleContent = ''
    
    // 面包屑图标隐藏
    if (this.featureConfig.hideBreadcrumbIcon) {
      styleContent += `
        .protyle-breadcrumb__icon {
          display: none !important;
        }
      `
    }
    
    // 锁定编辑按钮隐藏
    if (this.featureConfig.hideReadonlyButton) {
      styleContent += `
        .protyle-breadcrumb__bar button[data-type="readonly"],
        .protyle-breadcrumb button[data-type="readonly"] {
          display: none !important;
        }
      `
    }
    
    // 文档菜单按钮隐藏
    if (this.featureConfig.hideDocMenuButton) {
      styleContent += `
        .protyle-breadcrumb__bar button[data-type="doc"],
        .protyle-breadcrumb button[data-type="doc"] {
          display: none !important;
        }
      `
    }
    
    // 更多按钮隐藏
    if (this.featureConfig.hideMoreButton) {
      styleContent += `
        .protyle-breadcrumb__bar button[data-type="more"],
        .protyle-breadcrumb button[data-type="more"] {
          display: none !important;
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
    
    if (this.mobileConfig.toolbarBackgroundColor) {
      cssRules.push(`
        @media (max-width: 768px) {
          .protyle-breadcrumb__bar[data-input-method],
          .protyle-breadcrumb[data-input-method] {
            background-color: ${this.mobileConfig.toolbarBackgroundColor} !important;
            opacity: ${this.mobileConfig.toolbarOpacity} !important;
          }
        }
      `)
    }
    
    style.textContent = cssRules.join('\n')
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
