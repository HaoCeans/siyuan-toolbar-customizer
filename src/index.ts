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
  private buttonConfigs: ButtonConfig[] = DEFAULT_BUTTONS_CONFIG
  private currentEditingButton: ButtonConfig | null = null

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

      const savedButtonConfigs = await this.loadData('buttonConfigs')
      if (savedButtonConfigs) {
        this.buttonConfigs = savedButtonConfigs
      }
    } catch (error) {
      console.warn('加载配置失败，使用默认配置:', error)
    }

    // ===== 初始化 Vue 应用 =====
    init(this)
    
    // ===== 初始化插件功能 =====
    this.initPluginFunctions()
  }

  // 初始化插件功能
  private initPluginFunctions() {
    // 清理旧的功能
    cleanup()
    
    // ===== 初始化移动端工具栏调整 =====
    initMobileToolbarAdjuster(this.mobileConfig)
    
    // ===== 初始化自定义按钮 =====
    initCustomButtons(this.buttonConfigs)
  }

  onunload() {
    // 清理资源
    cleanup()
    destroy()
  }

  openSetting() {
    const setting = new Setting({
      width: this.isMobile ? '100%' : '800px',
      height: this.isMobile ? '100%' : '70vh',
      confirmCallback: async () => {
        await this.saveData('mobileToolbarConfig', this.mobileConfig)
        await this.saveData('buttonConfigs', this.buttonConfigs)
        
        showMessage('设置已保存，正在重载...', 2000, 'info')
        
        setTimeout(() => {
          this.initPluginFunctions()
          showMessage('设置已生效', 2000, 'info')
        }, 1000)
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
  }

  // 电脑端设置布局
  private createDesktopSettingLayout(setting: Setting) {
    // === 移动端工具栏设置 ===
    setting.addItem({
      title: '📱 移动端工具栏',
      description: '调整输入法弹出时的工具栏位置',
      direction: 'row',
      createActionElement: () => {
        const container = document.createElement('div')
        container.style.cssText = 'display: flex; flex-direction: column; gap: 12px;'
        
        container.appendChild(this.createDesktopField('输入法打开偏移', this.mobileConfig.openInputOffset, '例如：50px', (v) => {
          this.mobileConfig.openInputOffset = v
        }))
        
        container.appendChild(this.createDesktopField('输入法关闭偏移', this.mobileConfig.closeInputOffset, '例如：0px', (v) => {
          this.mobileConfig.closeInputOffset = v
        }))
        
        container.appendChild(this.createDesktopField('高度变化阈值(%)', this.mobileConfig.heightThreshold.toString(), '30-90', (v) => {
          this.mobileConfig.heightThreshold = parseInt(v) || 70
        }, 'number'))
        
        return container
      }
    })

    // === 自定义按钮管理 ===
    setting.addItem({
      title: '🎛️ 自定义按钮',
      description: '管理工具栏自定义按钮',
      direction: 'row',
      createActionElement: () => {
        const container = document.createElement('div')
        container.style.cssText = 'display: flex; flex-direction: column; gap: 8px; width: 100%;'
        
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
            marginRight: 8,
            sort: this.buttonConfigs.length + 1,
            platform: 'both'
          }
          this.buttonConfigs.push(newButton)
          renderList()
        }
        
        // 按钮列表
        const listContainer = document.createElement('div')
        listContainer.style.cssText = 'max-height: 400px; overflow-y: auto; border: 1px solid var(--b3-border-color); border-radius: 4px; padding: 8px;'
        
        const renderList = () => {
          listContainer.innerHTML = ''
          const sortedButtons = [...this.buttonConfigs].sort((a, b) => a.sort - b.sort)
          
          sortedButtons.forEach((button, index) => {
            const item = this.createDesktopButtonItem(button, index, renderList)
            listContainer.appendChild(item)
          })
        }
        
        renderList()
        
        container.appendChild(addBtn)
        container.appendChild(listContainer)
        return container
      }
    })

    // === 使用帮助 ===
    setting.addItem({
      title: '💡 常用功能ID',
      description: '思源内置菜单ID参考',
      direction: 'row',
      createActionElement: () => {
        const container = document.createElement('div')
        container.style.cssText = 'font-size: 13px; line-height: 1.6;'
        
        const idList = [
          { id: 'menuSearch', name: '搜索' },
          { id: 'menuRecent', name: '最近文档' },
          { id: 'menuFileTree', name: '文件树' },
          { id: 'menuOutline', name: '大纲' },
          { id: 'menuBacklink', name: '反链' },
          { id: 'menuGraph', name: '关系图' },
          { id: 'menuDailyNote', name: '日记' },
          { id: 'menuTag', name: '标签' }
        ]
        
        container.innerHTML = idList.map(item => 
          `<div style="margin: 4px 0;"><code style="background: var(--b3-theme-surface); padding: 2px 6px; border-radius: 3px;">${item.id}</code> - ${item.name}</div>`
        ).join('')
        
        return container
      }
    })
  }

  // 手机端设置布局
  private createMobileSettingLayout(setting: Setting) {
    // === 移动端工具栏设置 ===
    setting.addItem({
      title: '📱 移动端工具栏',
      description: '',
      createActionElement: () => document.createElement('div')
    })

    setting.addItem({
      title: '输入法打开偏移',
      description: '例如：50px',
      createActionElement: () => {
        const input = document.createElement('input')
        input.className = 'b3-text-field fn__flex-center fn__size200'
        input.value = this.mobileConfig.openInputOffset
        input.onchange = () => { this.mobileConfig.openInputOffset = input.value }
        return input
      }
    })

    setting.addItem({
      title: '输入法关闭偏移',
      description: '例如：0px',
      createActionElement: () => {
        const input = document.createElement('input')
        input.className = 'b3-text-field fn__flex-center fn__size200'
        input.value = this.mobileConfig.closeInputOffset
        input.onchange = () => { this.mobileConfig.closeInputOffset = input.value }
        return input
      }
    })

    setting.addItem({
      title: '高度变化阈值(%)',
      description: '30-90',
      createActionElement: () => {
        const input = document.createElement('input')
        input.className = 'b3-text-field fn__flex-center fn__size200'
        input.type = 'number'
        input.value = this.mobileConfig.heightThreshold.toString()
        input.onchange = () => { this.mobileConfig.heightThreshold = parseInt(input.value) || 70 }
        return input
      }
    })

    // === 自定义按钮 ===
    setting.addItem({
      title: '🎛️ 自定义按钮',
      description: '',
      createActionElement: () => document.createElement('div')
    })

    setting.addItem({
      title: '按钮管理',
      description: '点击展开编辑',
      createActionElement: () => {
        const container = document.createElement('div')
        container.style.cssText = 'width: 100%;'
        
        // 添加按钮
        const addBtn = document.createElement('button')
        addBtn.className = 'b3-button b3-button--outline'
        addBtn.style.cssText = 'width: 100%; margin-bottom: 8px;'
        addBtn.textContent = '+ 添加新按钮'
        addBtn.onclick = () => {
          const newButton: ButtonConfig = {
            id: `button_${Date.now()}`,
            name: '新按钮',
            type: 'builtin',
            builtinId: 'menuSearch',
            icon: 'iconHeart',
            iconSize: 18,
            marginRight: 8,
            sort: this.buttonConfigs.length + 1,
            platform: 'both'
          }
          this.buttonConfigs.push(newButton)
          renderList()
        }
        
        const listContainer = document.createElement('div')
        listContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px;'
        
        const renderList = () => {
          listContainer.innerHTML = ''
          const sortedButtons = [...this.buttonConfigs].sort((a, b) => a.sort - b.sort)
          
          sortedButtons.forEach((button, index) => {
            const item = this.createMobileButtonItem(button, index, renderList)
            listContainer.appendChild(item)
          })
        }
        
        renderList()
        
        container.appendChild(addBtn)
        container.appendChild(listContainer)
        return container
      }
    })

    // === 帮助 ===
    setting.addItem({
      title: '💡 使用帮助',
      description: '常用功能ID',
      createActionElement: () => {
        const container = document.createElement('div')
        container.style.cssText = 'font-size: 12px; line-height: 1.6; width: 100%;'
        
        const idList = [
          { id: 'menuSearch', name: '搜索' },
          { id: 'menuRecent', name: '最近' },
          { id: 'menuFileTree', name: '文件树' },
          { id: 'menuOutline', name: '大纲' }
        ]
        
        container.innerHTML = idList.map(item => 
          `<div style="margin: 4px 0;"><code>${item.id}</code> - ${item.name}</div>`
        ).join('')
        
        return container
      }
    })
  }

  // 电脑端字段创建
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
  private createDesktopButtonItem(button: ButtonConfig, index: number, renderList: () => void): HTMLElement {
    const item = document.createElement('div')
    item.style.cssText = `
      padding: 8px;
      border: 1px solid var(--b3-border-color);
      border-radius: 4px;
      margin-bottom: 4px;
      background: var(--b3-theme-background);
    `
    
    let isExpanded = false
    
    // 头部
    const header = document.createElement('div')
    header.style.cssText = 'display: flex; align-items: center; gap: 8px; cursor: pointer;'
    
    const iconSpan = document.createElement('span')
    iconSpan.style.cssText = 'font-size: 16px;'
    if (button.icon.startsWith('icon')) {
      iconSpan.innerHTML = `<svg style="width: 16px; height: 16px;"><use xlink:href="#${button.icon}"></use></svg>`
    } else {
      iconSpan.textContent = button.icon
    }
    
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
        this.buttonConfigs.splice(index, 1)
        renderList()
      }
    }
    
    header.appendChild(iconSpan)
    header.appendChild(nameSpan)
    header.appendChild(expandIcon)
    header.appendChild(deleteBtn)
    
    // 编辑表单
    const editForm = document.createElement('div')
    editForm.style.cssText = 'display: none; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--b3-border-color); gap: 8px; flex-direction: column;'
    
    editForm.appendChild(this.createDesktopField('名称', button.name, '按钮名称', (v) => { button.name = v; nameSpan.textContent = v }))
    editForm.appendChild(this.createDesktopSelectField('类型', button.type, [
      { value: 'builtin', label: '内置功能' },
      { value: 'template', label: '插入模板' }
    ], (v) => { 
      button.type = v as any
      editForm.replaceWith(this.createDesktopButtonEditForm(button))
    }))
    
    if (button.type === 'builtin') {
      editForm.appendChild(this.createDesktopField('功能ID', button.builtinId || '', 'menuSearch', (v) => { button.builtinId = v }))
    } else {
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
    }
    
    editForm.appendChild(this.createDesktopField('图标', button.icon, 'iconSearch', (v) => { button.icon = v }))
    editForm.appendChild(this.createDesktopField('图标大小', button.iconSize.toString(), '18', (v) => { button.iconSize = parseInt(v) || 18 }, 'number'))
    editForm.appendChild(this.createDesktopField('右边距', button.marginRight.toString(), '8', (v) => { button.marginRight = parseInt(v) || 8 }, 'number'))
    editForm.appendChild(this.createDesktopField('排序', button.sort.toString(), '1', (v) => { button.sort = parseInt(v) || 1 }, 'number'))
    editForm.appendChild(this.createDesktopSelectField('平台', button.platform, [
      { value: 'desktop', label: '仅电脑' },
      { value: 'mobile', label: '仅手机' },
      { value: 'both', label: '两端' }
    ], (v) => { button.platform = v as any }))
    
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
  private createMobileButtonItem(button: ButtonConfig, index: number, renderList: () => void): HTMLElement {
    const item = document.createElement('div')
    item.style.cssText = 'border: 1px solid var(--b3-border-color); border-radius: 4px; padding: 10px; background: var(--b3-theme-background);'
    
    let isExpanded = false
    
    const header = document.createElement('div')
    header.style.cssText = 'display: flex; align-items: center; gap: 8px; cursor: pointer;'
    
    const iconSpan = document.createElement('span')
    iconSpan.style.cssText = 'font-size: 14px;'
    if (button.icon.startsWith('icon')) {
      iconSpan.innerHTML = `<svg style="width: 14px; height: 14px;"><use xlink:href="#${button.icon}"></use></svg>`
    } else {
      iconSpan.textContent = button.icon
    }
    
    const nameSpan = document.createElement('span')
    nameSpan.style.cssText = 'flex: 1; font-size: 13px;'
    nameSpan.textContent = button.name
    
    const expandIcon = document.createElement('span')
    expandIcon.textContent = '▼'
    expandIcon.style.cssText = 'font-size: 10px; transition: transform 0.2s;'
    
    const deleteBtn = document.createElement('button')
    deleteBtn.className = 'b3-button b3-button--text'
    deleteBtn.textContent = '删'
    deleteBtn.style.cssText = 'padding: 2px 6px; font-size: 11px;'
    deleteBtn.onclick = (e) => {
      e.stopPropagation()
      if (confirm(`确定删除"${button.name}"？`)) {
        this.buttonConfigs.splice(index, 1)
        renderList()
      }
    }
    
    header.appendChild(iconSpan)
    header.appendChild(nameSpan)
    header.appendChild(expandIcon)
    header.appendChild(deleteBtn)
    
    const editForm = document.createElement('div')
    editForm.style.cssText = 'display: none; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--b3-border-color); gap: 8px; flex-direction: column;'
    
    editForm.appendChild(this.createInputField('名称', button.name, '按钮名称', (v) => { button.name = v; nameSpan.textContent = v }))
    editForm.appendChild(this.createSelectField('类型', button.type, [
      { value: 'builtin', label: '内置' },
      { value: 'template', label: '模板' }
    ], (v) => { button.type = v as any }))
    
    if (button.type === 'builtin') {
      editForm.appendChild(this.createInputField('功能ID', button.builtinId || '', 'menuSearch', (v) => { button.builtinId = v }))
    } else {
      editForm.appendChild(this.createTextareaField('模板', button.template || '', '插入内容', (v) => { button.template = v }))
    }
    
    editForm.appendChild(this.createInputField('图标', button.icon, 'iconSearch', (v) => { button.icon = v }))
    editForm.appendChild(this.createInputField('排序', button.sort.toString(), '1', (v) => { button.sort = parseInt(v) || 1 }, 'number'))
    editForm.appendChild(this.createSelectField('平台', button.platform, [
      { value: 'desktop', label: '电脑' },
      { value: 'mobile', label: '手机' },
      { value: 'both', label: '两端' }
    ], (v) => { button.platform = v as any }))
    
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
    const card = document.createElement('div')
    card.style.cssText = `
      background: var(--b3-theme-surface);
      border-radius: ${this.isMobile ? '8px' : '12px'};
      padding: ${this.isMobile ? '12px' : '20px'};
      border: 1px solid var(--b3-border-color);
      transition: all 0.2s ease;
      box-sizing: border-box;
      ${this.isMobile ? '' : '&:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }'}
    `

    const header = document.createElement('div')
    header.style.cssText = `
      display: flex;
      align-items: center;
      gap: ${this.isMobile ? '8px' : '12px'};
      margin-bottom: ${this.isMobile ? '12px' : '16px'};
      padding-bottom: ${this.isMobile ? '8px' : '12px'};
      border-bottom: 2px solid var(--b3-theme-primary-lightest);
    `
    header.innerHTML = `
      <span style="font-size: ${this.isMobile ? '20px' : '24px'};">📱</span>
      <div style="flex: 1;">
        <div style="font-size: ${this.isMobile ? '14px' : '16px'}; font-weight: 600; color: var(--b3-theme-on-background);">移动端工具栏</div>
        <div style="font-size: ${this.isMobile ? '11px' : '12px'}; color: var(--b3-theme-on-surface-light); margin-top: 4px;">调整输入法弹出时的位置</div>
      </div>
    `

    const form = document.createElement('div')
    form.style.cssText = `display: flex; flex-direction: column; gap: ${this.isMobile ? '12px' : '14px'};`

    // 输入法打开时偏移
    form.appendChild(this.createInputField(
      '输入法打开偏移',
      this.mobileConfig.openInputOffset,
      '例如：50px',
      (value) => { this.mobileConfig.openInputOffset = value }
    ))

    // 输入法关闭时偏移
    form.appendChild(this.createInputField(
      '输入法关闭偏移',
      this.mobileConfig.closeInputOffset,
      '例如：0px',
      (value) => { this.mobileConfig.closeInputOffset = value }
    ))

    // 高度变化阈值
    form.appendChild(this.createInputField(
      '高度变化阈值(%)',
      this.mobileConfig.heightThreshold.toString(),
      '30-90',
      (value) => { this.mobileConfig.heightThreshold = parseInt(value) || 70 },
      'number'
    ))

    card.appendChild(header)
    card.appendChild(form)
    return card
  }

  // 创建按钮管理卡片
  private createButtonsManagementCard(): HTMLElement {
    const card = document.createElement('div')
    card.style.cssText = `
      background: var(--b3-theme-surface);
      border-radius: ${this.isMobile ? '8px' : '12px'};
      padding: ${this.isMobile ? '12px' : '20px'};
      border: 1px solid var(--b3-border-color);
      transition: all 0.2s ease;
      box-sizing: border-box;
      ${this.isMobile ? 'grid-column: 1;' : ''}
      ${this.isMobile ? '' : '&:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }'}
    `

    const header = document.createElement('div')
    header.style.cssText = `
      display: flex;
      align-items: center;
      gap: ${this.isMobile ? '8px' : '12px'};
      margin-bottom: ${this.isMobile ? '12px' : '16px'};
      padding-bottom: ${this.isMobile ? '8px' : '12px'};
      border-bottom: 2px solid var(--b3-theme-primary-lightest);
    `
    header.innerHTML = `
      <span style="font-size: ${this.isMobile ? '20px' : '24px'};">🎛️</span>
      <div style="flex: 1;">
        <div style="font-size: ${this.isMobile ? '14px' : '16px'}; font-weight: 600; color: var(--b3-theme-on-background);">自定义按钮</div>
        <div style="font-size: ${this.isMobile ? '11px' : '12px'}; color: var(--b3-theme-on-surface-light); margin-top: 4px;">管理工具栏按钮</div>
      </div>
      <button class="b3-button b3-button--outline" id="add-button-btn" style="padding: ${this.isMobile ? '4px 10px' : '6px 12px'}; font-size: ${this.isMobile ? '12px' : '14px'};">
        + 添加
      </button>
    `

    // 按钮列表容器
    const listContainer = document.createElement('div')
    listContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: ${this.isMobile ? '6px' : '8px'};
      max-height: ${this.isMobile ? '60vh' : '500px'};
      overflow-y: auto;
    `

    const renderList = () => {
      listContainer.innerHTML = ''
      const sortedButtons = [...this.buttonConfigs].sort((a, b) => a.sort - b.sort)
      
      sortedButtons.forEach((button, index) => {
        const item = this.createButtonItem(button, index, listContainer, renderList)
        listContainer.appendChild(item)
      })
    }

    // 添加按钮事件
    const addBtn = header.querySelector('#add-button-btn') as HTMLButtonElement
    addBtn.onclick = () => {
      const newButton: ButtonConfig = {
        id: `button_${Date.now()}`,
        name: '新按钮',
        type: 'builtin',
        builtinId: 'menuSearch',
        icon: 'iconHeart',
        iconSize: 18,
        marginRight: 8,
        sort: this.buttonConfigs.length + 1,
        platform: 'both'
      }
      this.buttonConfigs.push(newButton)
      renderList()
    }

    renderList()

    card.appendChild(header)
    card.appendChild(listContainer)
    return card
  }

  // 创建按钮列表项（带内联编辑）
  private createButtonItem(button: ButtonConfig, index: number, container: HTMLElement, renderList: () => void): HTMLElement {
    const item = document.createElement('div')
    item.style.cssText = `
      background: var(--b3-theme-background);
      border: 1px solid var(--b3-border-color);
      border-radius: ${this.isMobile ? '6px' : '8px'};
      padding: ${this.isMobile ? '10px' : '12px'};
      transition: all 0.2s ease;
      box-sizing: border-box;
    `

    // 折叠状态
    let isExpanded = false

    // 头部（可点击折叠/展开）
    const itemHeader = document.createElement('div')
    itemHeader.style.cssText = `
      display: flex;
      align-items: center;
      gap: ${this.isMobile ? '8px' : '12px'};
      cursor: pointer;
    `

    const iconSpan = document.createElement('span')
    iconSpan.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: ${this.isMobile ? '28px' : '32px'};
      height: ${this.isMobile ? '28px' : '32px'};
      border-radius: 6px;
      background: var(--b3-theme-surface);
      font-size: ${this.isMobile ? '14px' : '16px'};
      flex-shrink: 0;
    `
    if (button.icon.startsWith('icon')) {
      iconSpan.innerHTML = `<svg style="width: ${this.isMobile ? '16px' : '18px'}; height: ${this.isMobile ? '16px' : '18px'};"><use xlink:href="#${button.icon}"></use></svg>`
    } else {
      iconSpan.textContent = button.icon
    }

    const infoDiv = document.createElement('div')
    infoDiv.style.cssText = `flex: 1; min-width: 0;`
    infoDiv.innerHTML = `
      <div style="font-weight: 500; font-size: ${this.isMobile ? '13px' : '14px'}; color: var(--b3-theme-on-background); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${button.name}</div>
      <div style="font-size: ${this.isMobile ? '10px' : '11px'}; color: var(--b3-theme-on-surface-light); margin-top: 2px;">
        ${button.type === 'builtin' ? '内置' : '模板'} | ${button.platform === 'both' ? '两端' : button.platform === 'desktop' ? '电脑' : '手机'}
      </div>
    `

    const expandIcon = document.createElement('span')
    expandIcon.textContent = '▼'
    expandIcon.style.cssText = `
      font-size: ${this.isMobile ? '10px' : '12px'};
      color: var(--b3-theme-on-surface-light);
      transition: transform 0.2s ease;
      flex-shrink: 0;
    `

    const deleteBtn = document.createElement('button')
    deleteBtn.className = 'b3-button b3-button--text'
    deleteBtn.textContent = '删除'
    deleteBtn.style.cssText = `
      padding: ${this.isMobile ? '2px 6px' : '4px 8px'};
      font-size: ${this.isMobile ? '11px' : '12px'};
      color: var(--b3-card-error-color);
      flex-shrink: 0;
    `
    deleteBtn.onclick = (e) => {
      e.stopPropagation()
      if (confirm(`确定删除"${button.name}"？`)) {
        this.buttonConfigs.splice(index, 1)
        renderList()
      }
    }

    itemHeader.appendChild(iconSpan)
    itemHeader.appendChild(infoDiv)
    itemHeader.appendChild(expandIcon)
    itemHeader.appendChild(deleteBtn)

    // 编辑表单（初始隐藏）
    const editForm = document.createElement('div')
    editForm.style.cssText = `
      display: none;
      margin-top: ${this.isMobile ? '10px' : '12px'};
      padding-top: ${this.isMobile ? '10px' : '12px'};
      border-top: 1px solid var(--b3-border-color);
    `
    editForm.appendChild(this.createButtonEditForm(button))

    // 切换展开/折叠
    itemHeader.onclick = (e) => {
      if ((e.target as HTMLElement).closest('button')) return
      isExpanded = !isExpanded
      editForm.style.display = isExpanded ? 'block' : 'none'
      expandIcon.style.transform = isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
    }

    item.appendChild(itemHeader)
    item.appendChild(editForm)
    return item
  }

  // 创建按钮编辑表单
  private createButtonEditForm(button: ButtonConfig): HTMLElement {
    const form = document.createElement('div')
    form.style.cssText = `display: flex; flex-direction: column; gap: 12px;`

    form.appendChild(this.createInputField('名称', button.name, '按钮显示名称', (v) => { button.name = v }))
    
    form.appendChild(this.createSelectField('类型', button.type, [
      { value: 'builtin', label: '内置功能' },
      { value: 'template', label: '插入模板' }
    ], (v) => { 
      button.type = v as 'builtin' | 'template'
      // 重新渲染以显示/隐藏相关字段
      form.parentElement!.replaceChild(this.createButtonEditForm(button), form)
    }))

    if (button.type === 'builtin') {
      form.appendChild(this.createInputField('功能ID', button.builtinId || '', '如：menuSearch', (v) => { button.builtinId = v }))
    } else {
      form.appendChild(this.createTextareaField('模板内容', button.template || '', '插入的文本', (v) => { button.template = v }))
    }

    form.appendChild(this.createInputField('图标', button.icon, '如：iconSearch或🔍', (v) => { button.icon = v }))
    form.appendChild(this.createInputField('图标大小', button.iconSize.toString(), '像素', (v) => { button.iconSize = parseInt(v) || 18 }, 'number'))
    form.appendChild(this.createInputField('右边距', button.marginRight.toString(), '像素', (v) => { button.marginRight = parseInt(v) || 8 }, 'number'))
    form.appendChild(this.createInputField('排序', button.sort.toString(), '数字越小越靠左', (v) => { button.sort = parseInt(v) || 1 }, 'number'))
    
    form.appendChild(this.createSelectField('平台', button.platform, [
      { value: 'desktop', label: '仅电脑' },
      { value: 'mobile', label: '仅手机' },
      { value: 'both', label: '两端' }
    ], (v) => { button.platform = v as 'desktop' | 'mobile' | 'both' }))

    return form
  }

  // 创建帮助卡片
  private createHelpCard(): HTMLElement {
    const card = document.createElement('div')
    card.style.cssText = `
      background: var(--b3-theme-surface);
      border-radius: ${this.isMobile ? '8px' : '12px'};
      padding: ${this.isMobile ? '12px' : '20px'};
      border: 1px solid var(--b3-border-color);
      transition: all 0.2s ease;
      box-sizing: border-box;
      ${this.isMobile ? 'grid-column: 1;' : ''}
      ${this.isMobile ? '' : '&:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }'}
    `

    const header = document.createElement('div')
    header.style.cssText = `
      display: flex;
      align-items: center;
      gap: ${this.isMobile ? '8px' : '12px'};
      margin-bottom: ${this.isMobile ? '12px' : '16px'};
      padding-bottom: ${this.isMobile ? '8px' : '12px'};
      border-bottom: 2px solid var(--b3-theme-primary-lightest);
    `
    header.innerHTML = `
      <span style="font-size: ${this.isMobile ? '20px' : '24px'};">💡</span>
      <div style="flex: 1;">
        <div style="font-size: ${this.isMobile ? '14px' : '16px'}; font-weight: 600; color: var(--b3-theme-on-background);">使用帮助</div>
        <div style="font-size: ${this.isMobile ? '11px' : '12px'}; color: var(--b3-theme-on-surface-light); margin-top: 4px;">常用功能ID参考</div>
      </div>
    `

    const content = document.createElement('div')
    content.style.cssText = `
      font-size: ${this.isMobile ? '12px' : '13px'};
      line-height: 1.6;
      color: var(--b3-theme-on-surface);
    `

    const idList = [
      { id: 'menuSearch', name: '搜索' },
      { id: 'menuRecent', name: '最近文档' },
      { id: 'menuFileTree', name: '文件树' },
      { id: 'menuOutline', name: '大纲' },
      { id: 'menuBacklink', name: '反链' },
      { id: 'menuGraph', name: '关系图' },
      { id: 'menuDailyNote', name: '日记' },
      { id: 'menuTag', name: '标签' },
      { id: 'menuPlugin', name: '插件' },
      { id: 'menuSetting', name: '设置' }
    ]

    const grid = document.createElement('div')
    grid.style.cssText = `
      display: grid;
      grid-template-columns: 1fr;
      gap: ${this.isMobile ? '6px' : '8px'};
      margin-bottom: ${this.isMobile ? '12px' : '16px'};
    `

    idList.forEach(item => {
      const chip = document.createElement('div')
      chip.style.cssText = `
        padding: ${this.isMobile ? '6px 10px' : '8px 12px'};
        background: var(--b3-theme-background);
        border-radius: 6px;
        font-size: ${this.isMobile ? '11px' : '12px'};
        display: flex;
        justify-content: space-between;
        align-items: center;
        border: 1px solid var(--b3-border-color);
      `
      chip.innerHTML = `
        <span style="color: var(--b3-theme-on-surface-light);">${item.name}</span>
        <code style="background: var(--b3-theme-surface); padding: 2px 6px; border-radius: 4px; font-size: ${this.isMobile ? '10px' : '11px'};">${item.id}</code>
      `
      grid.appendChild(chip)
    })

    const tip = document.createElement('div')
    tip.style.cssText = `
      padding: ${this.isMobile ? '10px' : '12px'};
      background: var(--b3-theme-primary-lightest);
      border-radius: ${this.isMobile ? '6px' : '8px'};
      border-left: 3px solid var(--b3-theme-primary);
      font-size: ${this.isMobile ? '11px' : '12px'};
      line-height: 1.5;
      color: var(--b3-theme-on-surface);
    `
    tip.innerHTML = `<strong>提示：</strong>打开浏览器开发者工具（F12），点击思源菜单项，在元素面板中查看ID属性获取更多功能ID。`

    content.appendChild(grid)
    content.appendChild(tip)

    card.appendChild(header)
    card.appendChild(content)
    return card
  }

  // 通用输入框创建方法
  private createInputField(label: string, value: string, placeholder: string, onChange: (value: string) => void, type: string = 'text'): HTMLElement {
    const field = document.createElement('div')
    field.style.cssText = `display: flex; flex-direction: column; gap: 4px;`

    const labelEl = document.createElement('label')
    labelEl.style.cssText = `font-size: ${this.isMobile ? '12px' : '13px'}; font-weight: 500; color: var(--b3-theme-on-surface);`
    labelEl.textContent = label

    const input = document.createElement('input')
    input.type = type
    input.value = value
    input.placeholder = placeholder
    input.className = 'b3-text-field'
    input.style.cssText = `
      padding: ${this.isMobile ? '6px 8px' : '8px 10px'};
      border-radius: 6px;
      border: 1px solid var(--b3-border-color);
      background: var(--b3-theme-background);
      color: var(--b3-theme-on-background);
      font-size: ${this.isMobile ? '12px' : '13px'};
      box-sizing: border-box;
      width: 100%;
    `
    input.onchange = () => onChange(input.value)

    field.appendChild(labelEl)
    field.appendChild(input)
    return field
  }

  // 选择框创建方法
  private createSelectField(label: string, value: string, options: Array<{value: string, label: string}>, onChange: (value: string) => void): HTMLElement {
    const field = document.createElement('div')
    field.style.cssText = `display: flex; flex-direction: column; gap: 4px;`

    const labelEl = document.createElement('label')
    labelEl.style.cssText = `font-size: ${this.isMobile ? '12px' : '13px'}; font-weight: 500; color: var(--b3-theme-on-surface);`
    labelEl.textContent = label

    const select = document.createElement('select')
    select.className = 'b3-select'
    select.style.cssText = `
      padding: ${this.isMobile ? '6px 8px' : '8px 10px'};
      border-radius: 6px;
      border: 1px solid var(--b3-border-color);
      background: var(--b3-theme-background);
      color: var(--b3-theme-on-background);
      font-size: ${this.isMobile ? '12px' : '13px'};
      box-sizing: border-box;
      width: 100%;
    `
    
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

  // 文本域创建方法
  private createTextareaField(label: string, value: string, placeholder: string, onChange: (value: string) => void): HTMLElement {
    const field = document.createElement('div')
    field.style.cssText = `display: flex; flex-direction: column; gap: 4px;`

    const labelEl = document.createElement('label')
    labelEl.style.cssText = `font-size: ${this.isMobile ? '12px' : '13px'}; font-weight: 500; color: var(--b3-theme-on-surface);`
    labelEl.textContent = label

    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.placeholder = placeholder
    textarea.className = 'b3-text-field'
    textarea.style.cssText = `
      padding: ${this.isMobile ? '6px 8px' : '8px 10px'};
      border-radius: 6px;
      border: 1px solid var(--b3-border-color);
      background: var(--b3-theme-background);
      color: var(--b3-theme-on-background);
      font-size: ${this.isMobile ? '12px' : '13px'};
      resize: vertical;
      min-height: ${this.isMobile ? '50px' : '60px'};
      box-sizing: border-box;
      width: 100%;
    `
    textarea.onchange = () => onChange(textarea.value)

    field.appendChild(labelEl)
    field.appendChild(textarea)
    return field
  }
}