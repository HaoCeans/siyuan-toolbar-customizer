/**
 * 手机端设置模块
 * 处理手机端思源手机端增强的设置界面
 */

import type { Setting } from 'siyuan'
import type { GlobalButtonConfig } from '../toolbarManager'
import type { ButtonConfig } from '../toolbarManager'
import { showMessage } from 'siyuan'
import * as Notify from '../notification'
import { createMobileButtonItem, type MobileButtonContext } from '../ui/buttonItems/mobile'
import { calculateButtonOverflow, getToolbarAvailableWidth, getButtonWidth } from '../toolbarManager'

/**
 * 手机端工具栏配置接口
 */
export interface MobileToolbarConfig {
  // 底部工具栏配置
  enableBottomToolbar: boolean
  closeInputOffset?: string
  openInputOffset?: string
  heightThreshold?: number
  overflowToolbarDistanceBottom?: string  // 扩展工具栏距离底部工具栏的距离
  overflowToolbarHeightBottom?: string    // 底部模式扩展工具栏高度

  // 共享样式配置
  toolbarHeight: string
  toolbarBackgroundColor?: string
  toolbarBackgroundColorDark?: string
  useThemeColor?: boolean
  toolbarOpacity?: number
  toolbarZIndex?: number

  // 顶部工具栏配置
  enableTopToolbar?: boolean
  topToolbarOffset?: string
  overflowToolbarDistanceTop?: string  // 扩展工具栏距离顶部工具栏的距离
  overflowToolbarHeightTop?: string     // 顶部模式扩展工具栏高度
}

/**
 * 手机端功能配置接口
 */
export interface MobileFeatureConfig {
  hideBreadcrumbIcon: boolean
  hideReadonlyButton: boolean
  hideDocMenuButton: boolean
  hideMoreButton: boolean
  disableCustomButtons: boolean
  disableMobileSwipe?: boolean
  authorCode?: string
  authorActivated?: boolean
  popupConfig?: 'disabled' | 'smallWindowOnly' | 'bothModes'
  quickNoteNotebookId?: string
  quickNoteDocumentId?: string  // 新增：一键记事目标文档ID
}

/**
 * 手机端设置上下文接口
 * 用于依赖注入，将插件实例的方法和数据传递给设置创建函数
 */
export interface MobileSettingsContext {
  buttonConfigs: ButtonConfig[]
  mobileButtonConfigs: ButtonConfig[]
  mobileGlobalButtonConfig: GlobalButtonConfig
  mobileFeatureConfig: MobileFeatureConfig
  mobileConfig: MobileToolbarConfig
  desktopFeatureConfig: MobileFeatureConfig
  isAuthorToolActivated: () => boolean
  showConfirmDialog: (message: string) => Promise<boolean>
  showIconPicker: (currentValue: string, onSelect: (icon: string) => void) => void
  showButtonIdPicker: (currentValue: string, onSelect: (result: any) => void) => void
  saveData: (key: string, value: any) => Promise<void>
  applyFeatures: () => void
  applyMobileToolbarStyle: () => void
  updateMobileToolbar: () => void
  recalculateOverflow: () => void
}

/**
 * 创建手机端全局按钮配置项（单个）
 * @param title - 设置项标题
 * @param description - 设置项描述
 * @param config - 当前全局按钮配置
 * @param onUpdate - 配置更新回调
 * @returns 设置项创建函数
 */
export function createMobileGlobalConfigItem(
  title: string,
  description: string,
  config: GlobalButtonConfig,
  onUpdate: (newConfig: GlobalButtonConfig) => void
): { title: string; description: string; createActionElement: () => HTMLElement } {
  return {
    title,
    description,
    createActionElement: () => {
      const input = document.createElement('input')
      input.className = 'b3-text-field fn__flex-center fn__size200'
      input.type = 'number'
      input.value = config.iconSize.toString()
      input.style.cssText = 'font-size: 14px; padding: 8px;'
      input.onchange = () => {
        const newValue = parseInt(input.value) || 16
        onUpdate({ ...config, iconSize: newValue })
      }
      return input
    }
  }
}

/**
 * 创建手机端工具栏配置项
 * @param title - 设置项标题
 * @param description - 设置项描述
 * @param config - 当前工具栏配置
 * @param onSave - 保存回调
 * @returns 设置项创建函数
 */
export function createMobileToolbarConfigItem(
  title: string,
  description: string,
  config: MobileToolbarConfig,
  onSave: (newConfig: MobileToolbarConfig) => void
): { title: string; description: string; createActionElement: () => HTMLElement } {
  return {
    title,
    description,
    createActionElement: () => {
      const input = document.createElement('input')
      input.className = 'b3-text-field fn__flex-center fn__size200'
      input.type = 'text'
      input.value = config.toolbarHeight
      input.style.cssText = 'font-size: 14px; padding: 8px;'
      input.onchange = () => {
        onSave({ ...config, toolbarHeight: input.value })
      }
      return input
    }
  }
}

/**
 * 创建手机端工具栏背景颜色配置项
 * @param config - 当前工具栏配置
 * @param onSave - 保存回调
 * @returns 设置项创建函数
 */
export function createMobileToolbarColorConfigItem(
  config: MobileToolbarConfig,
  onSave: (newConfig: MobileToolbarConfig) => void
): { title: string; description: string; createActionElement: () => HTMLElement } {
  return {
    title: '②工具栏背景颜色',
    description: '💡点击色块选择颜色，或直接输入颜色值，或跟随主题',
    createActionElement: () => {
      const container = document.createElement('div')
      container.style.cssText = 'display: flex; flex-direction: column; gap: 10px;'

      // 明亮模式颜色行
      const lightRow = document.createElement('div')
      lightRow.style.cssText = 'display: flex; align-items: center; gap: 8px;'

      const lightLabel = document.createElement('span')
      lightLabel.textContent = '☀️ 明亮模式：'
      lightLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-background); min-width: 85px;'

      // 明亮模式颜色选择器
      const lightColorPicker = document.createElement('input')
      lightColorPicker.type = 'color'
      lightColorPicker.value = config.toolbarBackgroundColor || '#f8f9fa'
      lightColorPicker.style.cssText = 'width: 50px; height: 36px; border: 1px solid var(--b3-border-color); border-radius: 4px; cursor: pointer; flex-shrink: 0;'

      // 明亮模式文本输入框
      const lightTextInput = document.createElement('input')
      lightTextInput.className = 'b3-text-field'
      lightTextInput.type = 'text'
      lightTextInput.value = config.toolbarBackgroundColor || '#f8f9fa'
      lightTextInput.placeholder = '#f8f9fa'
      lightTextInput.style.cssText = 'width: 80px; font-size: 14px; padding: 6px 8px;'

      lightColorPicker.onchange = () => {
        onSave({ ...config, toolbarBackgroundColor: lightColorPicker.value })
        lightTextInput.value = lightColorPicker.value
      }

      lightTextInput.onchange = () => {
        const colorValue = lightTextInput.value.trim()
        if (colorValue) {
          onSave({ ...config, toolbarBackgroundColor: colorValue })
          lightColorPicker.value = colorValue.startsWith('#') ? colorValue : '#f8f9fa'
        }
      }

      lightRow.appendChild(lightLabel)
      lightRow.appendChild(lightColorPicker)
      lightRow.appendChild(lightTextInput)

      // 黑暗模式颜色行
      const darkRow = document.createElement('div')
      darkRow.style.cssText = 'display: flex; align-items: center; gap: 8px;'

      const darkLabel = document.createElement('span')
      darkLabel.textContent = '🌙 黑暗模式：'
      darkLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-background); min-width: 85px;'

      // 黑暗模式颜色选择器
      const darkColorPicker = document.createElement('input')
      darkColorPicker.type = 'color'
      darkColorPicker.value = config.toolbarBackgroundColorDark || '#1e1e1e'
      darkColorPicker.style.cssText = 'width: 50px; height: 36px; border: 1px solid var(--b3-border-color); border-radius: 4px; cursor: pointer; flex-shrink: 0;'

      // 黑暗模式文本输入框
      const darkTextInput = document.createElement('input')
      darkTextInput.className = 'b3-text-field'
      darkTextInput.type = 'text'
      darkTextInput.value = config.toolbarBackgroundColorDark || '#1e1e1e'
      darkTextInput.placeholder = '#1e1e1e'
      darkTextInput.style.cssText = 'width: 80px; font-size: 14px; padding: 6px 8px;'

      darkColorPicker.onchange = () => {
        onSave({ ...config, toolbarBackgroundColorDark: darkColorPicker.value })
        darkTextInput.value = darkColorPicker.value
      }

      darkTextInput.onchange = () => {
        const colorValue = darkTextInput.value.trim()
        if (colorValue) {
          onSave({ ...config, toolbarBackgroundColorDark: colorValue })
          darkColorPicker.value = colorValue.startsWith('#') ? colorValue : '#1e1e1e'
        }
      }

      darkRow.appendChild(darkLabel)
      darkRow.appendChild(darkColorPicker)
      darkRow.appendChild(darkTextInput)

      // 跟随主题选项
      const followThemeRow = document.createElement('div')
      followThemeRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-top: 4px;'

      const followThemeCheckbox = document.createElement('input')
      followThemeCheckbox.type = 'checkbox'
      followThemeCheckbox.className = 'b3-switch'
      followThemeCheckbox.checked = !config.toolbarBackgroundColor && !config.toolbarBackgroundColorDark
      followThemeCheckbox.style.cssText = 'transform: scale(1.2);'
      followThemeCheckbox.onchange = () => {
        if (followThemeCheckbox.checked) {
          onSave({
            ...config,
            toolbarBackgroundColor: undefined,
            toolbarBackgroundColorDark: undefined
          })
          lightTextInput.value = ''
          darkTextInput.value = ''
        }
      }

      const followThemeLabel = document.createElement('label')
      followThemeLabel.textContent = '跟随主题（默认）'
      followThemeLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-background);'

      followThemeRow.appendChild(followThemeCheckbox)
      followThemeRow.appendChild(followThemeLabel)

      container.appendChild(lightRow)
      container.appendChild(darkRow)
      container.appendChild(followThemeRow)

      return container
    }
  }
}

/**
 * 创建底部工具栏配置项
 * @param config - 当前工具栏配置
 * @param onSave - 保存回调
 * @returns 设置项创建函数
 */
export function createBottomToolbarConfigItem(
  config: MobileToolbarConfig,
  onSave: (newConfig: MobileToolbarConfig) => void
): { title: string; description: string; createActionElement: () => HTMLElement } {
  return {
    title: '📱 底部工具栏配置',
    description: '💡 开启后才能调整输入法位置相关设置',
    createActionElement: () => {
      const container = document.createElement('div')
      container.className = 'toolbar-customizer-content'
      container.dataset.tabGroup = 'mobile'
      container.style.cssText = 'display: flex; flex-direction: column; gap: 12px; width: 100% !important; max-width: 100% !important;'

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
      toggle.checked = config.enableBottomToolbar
      toggle.onchange = () => {
        onSave({ ...config, enableBottomToolbar: toggle.checked })
      }

      toggleRow.appendChild(toggleLabel)
      toggleRow.appendChild(toggle)
      container.appendChild(toggleRow)

      return container
    }
  }
}

/**
 * 创建手机端设置布局
 * 这是手机端设置界面创建的主入口函数
 * @param setting - SiYuan Setting 对象
 * @param context - 手机端设置上下文（依赖注入）
 */
export function createMobileSettingLayout(
  setting: Setting,
  context: MobileSettingsContext
): void {
  // === 分组标题样式 ===
  const createGroupTitle = (icon: string, title: string) => {
    setting.addItem({
      title: '',
      description: '',
      createActionElement: () => {
        const titleEl = document.createElement('div')
        titleEl.className = 'fn__flex-center fn__size200'
        titleEl.style.cssText = `
          padding: 16px 16px 8px 16px;
          margin: 8px -16px 0 -16px;
          font-size: 16px;
          font-weight: 700;
          color: var(--b3-theme-on-background);
          background: var(--b3-theme-surface);
          display: flex;
          align-items: center;
          gap: 8px;
          border-bottom: 2px solid var(--b3-border-color);
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
    description: `已配置 ${context.mobileButtonConfigs.length} 个按钮，点击展开编辑`,
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
        const sortedButtons = [...context.buttonConfigs].sort((a, b) => a.sort - b.sort)

        sortedButtons.forEach((button, index) => {
          const mobileButtonContext: MobileButtonContext = {
            isAuthorToolActivated: context.isAuthorToolActivated,
            showConfirmDialog: context.showConfirmDialog,
            showIconPicker: context.showIconPicker,
            showButtonIdPicker: context.showButtonIdPicker,
            buttonConfigs: context.buttonConfigs,
            mobileButtonConfigs: context.mobileButtonConfigs,
            recalculateOverflow: () => {
              // 获取扩展工具栏按钮的层数配置
              const overflowBtn = context.buttonConfigs.find(btn => btn.id === 'overflow-button-mobile')
              const overflowLayers = (overflowBtn && overflowBtn.enabled !== false) ? (overflowBtn.layers || 1) : 0
              // 重新计算溢出层级
              const updatedButtons = calculateButtonOverflow(context.buttonConfigs, overflowLayers)
              // 更新配置中的 overflowLevel
              updatedButtons.forEach(btn => {
                const original = context.buttonConfigs.find(b => b.id === btn.id)
                if (original) {
                  original.overflowLevel = btn.overflowLevel
                }
              })
            }
          }
          const item = createMobileButtonItem(button, index, renderList, context.buttonConfigs, mobileButtonContext)
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
          icon: '♥️',
          iconSize: context.mobileGlobalButtonConfig.iconSize,
          minWidth: context.mobileGlobalButtonConfig.minWidth,
          marginRight: context.mobileGlobalButtonConfig.marginRight,
          sort: context.buttonConfigs.length + 1,
          platform: 'both',
          showNotification: context.mobileGlobalButtonConfig.showNotification,
          overflowLevel: 0 // 初始为可见，稍后重新计算
        }
        context.buttonConfigs.push(newButton)

        // 获取扩展工具栏按钮的层数配置
        const overflowBtn = context.mobileButtonConfigs.find(btn => btn.id === 'overflow-button-mobile')
        const overflowLayers = (overflowBtn?.enabled !== false) ? (overflowBtn.layers || 1) : 0

        // 如果启用了扩展工具栏，重新计算溢出层级
        if (overflowLayers > 0) {
          console.log('[添加按钮] 准备调用溢出检测，层数:', overflowLayers)
          const updated = calculateButtonOverflow(context.buttonConfigs, overflowLayers)
          // 更新所有按钮的溢出层级
          updated.forEach(btn => {
            const original = context.buttonConfigs.find(b => b.id === btn.id)
            if (original) {
              original.overflowLevel = btn.overflowLevel
            }
          })
        }

        lastAddedButtonId = newButton.id
        renderList()
      }

      renderList()

      container.appendChild(addBtn)
      container.appendChild(listContainer)
      return container
    }
  })

  // === 手机端全局按钮配置 ===
  createGroupTitle('📱', '全局按钮配置')

  // 存储所有配置项的 input 元素，用于统一控制禁用状态
  const mobileConfigInputs: HTMLInputElement[] = []

  // 更新配置项禁用状态的函数
  const updateMobileConfigItemsDisabled = (disabled: boolean) => {
    mobileConfigInputs.forEach(input => {
      input.disabled = disabled
      if (disabled) {
        input.style.opacity = '0.5'
        input.style.cursor = 'not-allowed'
      } else {
        input.style.opacity = ''
        input.style.cursor = ''
      }
    })
  }

  // 全局配置启用开关（放在最前面）
  setting.addItem({
    title: '🔘 启用全局按钮配置',
    description: '💡 关闭后，修改全局配置不会影响已有按钮，仅作为新建按钮的默认值',
    createActionElement: () => {
      const toggle = document.createElement('input')
      toggle.type = 'checkbox'
      toggle.className = 'b3-switch'
      toggle.checked = context.mobileGlobalButtonConfig.enabled ?? true
      toggle.style.cssText = 'transform: scale(1.2);'
      toggle.onchange = async () => {
        context.mobileGlobalButtonConfig.enabled = toggle.checked
        // 打开开关时，立即应用全局配置到所有按钮
        if (toggle.checked) {
          context.mobileButtonConfigs.forEach(btn => {
            btn.iconSize = context.mobileGlobalButtonConfig.iconSize
            btn.minWidth = context.mobileGlobalButtonConfig.minWidth
            btn.marginRight = context.mobileGlobalButtonConfig.marginRight
            btn.showNotification = context.mobileGlobalButtonConfig.showNotification
          })
          await context.saveData('mobileButtonConfigs', context.mobileButtonConfigs)
          // 重新计算溢出层级（按钮宽度可能变化）
          context.recalculateOverflow()
          // 刷新按钮以应用新配置
          context.updateMobileToolbar()
        }
        await context.saveData('mobileGlobalButtonConfig', context.mobileGlobalButtonConfig)
        Notify.showGlobalConfigEnabledStatus(toggle.checked)
        // 更新配置项的禁用状态
        updateMobileConfigItemsDisabled(!toggle.checked)
      }
      return toggle
    }
  })

  // 图标大小
  setting.addItem({
    title: '🆖 图标大小 (px)',
    description: '所有按钮的图标大小',
    createActionElement: () => {
      const input = document.createElement('input')
      input.className = 'b3-text-field fn__flex-center fn__size200'
      input.type = 'number'
      input.value = context.mobileGlobalButtonConfig.iconSize.toString()
      input.style.cssText = 'font-size: 14px; padding: 8px;'
      input.onchange = async () => {
        const newValue = parseInt(input.value) || 16
        context.mobileGlobalButtonConfig.iconSize = newValue
        // 只有启用全局配置时才批量应用到按钮
        if (context.mobileGlobalButtonConfig.enabled ?? true) {
          context.mobileButtonConfigs.forEach(btn => btn.iconSize = newValue)
          await context.saveData('mobileButtonConfigs', context.mobileButtonConfigs)
          // 重新计算溢出层级（按钮宽度可能变化）
          context.recalculateOverflow()
        }
        await context.saveData('mobileGlobalButtonConfig', context.mobileGlobalButtonConfig)
        Notify.showInfoIconSizeModified()
      }
      // 存储引用并设置初始禁用状态
      mobileConfigInputs.push(input)
      if (!(context.mobileGlobalButtonConfig.enabled ?? true)) {
        input.disabled = true
        input.style.opacity = '0.5'
        input.style.cursor = 'not-allowed'
      }
      return input
    }
  })

  // 按钮宽度
  setting.addItem({
    title: '📏 按钮宽度 (px)',
    description: '所有按钮的最小宽度',
    createActionElement: () => {
      const input = document.createElement('input')
      input.className = 'b3-text-field fn__flex-center fn__size200'
      input.type = 'number'
      input.value = context.mobileGlobalButtonConfig.minWidth.toString()
      input.style.cssText = 'font-size: 14px; padding: 8px;'
      input.onchange = async () => {
        const newValue = parseInt(input.value) || 32
        context.mobileGlobalButtonConfig.minWidth = newValue
        // 只有启用全局配置时才批量应用到按钮
        if (context.mobileGlobalButtonConfig.enabled ?? true) {
          context.mobileButtonConfigs.forEach(btn => btn.minWidth = newValue)
          await context.saveData('mobileButtonConfigs', context.mobileButtonConfigs)
          // 重新计算溢出层级（按钮宽度变化）
          context.recalculateOverflow()
        }
        await context.saveData('mobileGlobalButtonConfig', context.mobileGlobalButtonConfig)
        Notify.showInfoButtonWidthModified()
      }
      // 存储引用并设置初始禁用状态
      mobileConfigInputs.push(input)
      if (!(context.mobileGlobalButtonConfig.enabled ?? true)) {
        input.disabled = true
        input.style.opacity = '0.5'
        input.style.cursor = 'not-allowed'
      }
      return input
    }
  })

  // 右边距
  setting.addItem({
    title: '➡️ 右边距 (px)',
    description: '所有按钮的右侧边距',
    createActionElement: () => {
      const input = document.createElement('input')
      input.className = 'b3-text-field fn__flex-center fn__size200'
      input.type = 'number'
      input.value = context.mobileGlobalButtonConfig.marginRight.toString()
      input.style.cssText = 'font-size: 14px; padding: 8px;'
      input.onchange = async () => {
        const newValue = parseInt(input.value) || 8
        context.mobileGlobalButtonConfig.marginRight = newValue
        // 只有启用全局配置时才批量应用到按钮
        if (context.mobileGlobalButtonConfig.enabled ?? true) {
          context.mobileButtonConfigs.forEach(btn => btn.marginRight = newValue)
          await context.saveData('mobileButtonConfigs', context.mobileButtonConfigs)
          // 重新计算溢出层级（按钮宽度变化）
          context.recalculateOverflow()
        }
        await context.saveData('mobileGlobalButtonConfig', context.mobileGlobalButtonConfig)
        Notify.showInfoMarginRightModified()
      }
      // 存储引用并设置初始禁用状态
      mobileConfigInputs.push(input)
      if (!(context.mobileGlobalButtonConfig.enabled ?? true)) {
        input.disabled = true
        input.style.opacity = '0.5'
        input.style.cursor = 'not-allowed'
      }
      return input
    }
  })

  // 右上角提示
  setting.addItem({
    title: '📢 右上角提示',
    description: '所有按钮是否显示右上角提示',
    createActionElement: () => {
      const toggle = document.createElement('input')
      toggle.type = 'checkbox'
      toggle.className = 'b3-switch'
      toggle.checked = context.mobileGlobalButtonConfig.showNotification
      toggle.style.cssText = 'transform: scale(1.2);'
      toggle.onchange = async () => {
        context.mobileGlobalButtonConfig.showNotification = toggle.checked
        // 只有启用全局配置时才批量应用到按钮
        if (context.mobileGlobalButtonConfig.enabled ?? true) {
          context.mobileButtonConfigs.forEach(btn => btn.showNotification = toggle.checked)
          await context.saveData('mobileButtonConfigs', context.mobileButtonConfigs)
        }
        await context.saveData('mobileGlobalButtonConfig', context.mobileGlobalButtonConfig)
        // 刷新按钮以应用新配置
        context.updateMobileToolbar()
        Notify.showNotificationToggleStatus(toggle.checked)
      }
      // 存储引用并设置初始禁用状态
      mobileConfigInputs.push(toggle)
      if (!(context.mobileGlobalButtonConfig.enabled ?? true)) {
        toggle.disabled = true
        toggle.style.opacity = '0.5'
        toggle.style.cursor = 'not-allowed'
      }
      return toggle
    }
  })

  // 说明文字
  setting.addItem({
    title: '💡注意',
    description: '修改后会批量应用到每个按钮配置值，单个按钮的独立配置优先级更高（仅限手机端📱）'
  })


  // === 移动端工具栏设置 ===

  // === 全局工具栏配置 ===
  createGroupTitle('📱', '全局工具栏配置')

  // 工具栏自身高度
  setting.addItem({
    title: '①工具栏自身高度',
    description: '💡设置工具栏自身的高度',
    createActionElement: () => {
      const input = document.createElement('input')
      input.className = 'b3-text-field fn__flex-center fn__size200'
      input.type = 'text'
      input.value = context.mobileConfig.toolbarHeight
      input.style.cssText = 'font-size: 14px; padding: 8px;'
      input.onchange = async () => {
        context.mobileConfig.toolbarHeight = input.value
        await context.saveData('mobileConfig', context.mobileConfig)
        context.applyMobileToolbarStyle()
      }
      return input
    }
  })

  // 工具栏背景颜色（明亮模式 + 黑暗模式）
  setting.addItem({
    title: '②工具栏背景颜色',
    description: '💡点击色块选择颜色，或直接输入颜色值，或跟随主题',
    createActionElement: () => {
      const container = document.createElement('div')
      container.style.cssText = 'display: flex; flex-direction: column; gap: 10px;'

      // 明亮模式颜色行
      const lightRow = document.createElement('div')
      lightRow.style.cssText = 'display: flex; align-items: center; gap: 8px;'

      const lightLabel = document.createElement('span')
      lightLabel.textContent = '☀️ 明亮模式：'
      lightLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-background); min-width: 85px;'

      // 明亮模式颜色选择器
      const lightColorPicker = document.createElement('input')
      lightColorPicker.type = 'color'
      lightColorPicker.value = context.mobileConfig.toolbarBackgroundColor || '#f8f9fa'
      lightColorPicker.style.cssText = 'width: 50px; height: 36px; border: 1px solid var(--b3-border-color); border-radius: 4px; cursor: pointer; flex-shrink: 0;'

      // 明亮模式文本输入框
      const lightTextInput = document.createElement('input')
      lightTextInput.className = 'b3-text-field'
      lightTextInput.type = 'text'
      lightTextInput.value = context.mobileConfig.toolbarBackgroundColor || '#f8f9fa'
      lightTextInput.placeholder = '#f8f9fa'
      lightTextInput.style.cssText = 'width: 80px; font-size: 14px; padding: 6px 8px;'

      lightColorPicker.onchange = async () => {
        context.mobileConfig.toolbarBackgroundColor = lightColorPicker.value
        lightTextInput.value = lightColorPicker.value
        await context.saveData('mobileConfig', context.mobileConfig)
        context.applyMobileToolbarStyle()
      }

      lightTextInput.onchange = async () => {
        const colorValue = lightTextInput.value.trim()
        if (colorValue) {
          context.mobileConfig.toolbarBackgroundColor = colorValue
          lightColorPicker.value = colorValue.startsWith('#') ? colorValue : '#f8f9fa'
          await context.saveData('mobileConfig', context.mobileConfig)
          context.applyMobileToolbarStyle()
        }
      }

      lightRow.appendChild(lightLabel)
      lightRow.appendChild(lightColorPicker)
      lightRow.appendChild(lightTextInput)

      // 黑暗模式颜色行
      const darkRow = document.createElement('div')
      darkRow.style.cssText = 'display: flex; align-items: center; gap: 8px;'

      const darkLabel = document.createElement('span')
      darkLabel.textContent = '🌙 黑暗模式：'
      darkLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-background); min-width: 85px;'

      // 黑暗模式颜色选择器
      const darkColorPicker = document.createElement('input')
      darkColorPicker.type = 'color'
      darkColorPicker.value = context.mobileConfig.toolbarBackgroundColorDark || '#1a1a1a'
      darkColorPicker.style.cssText = 'width: 50px; height: 36px; border: 1px solid var(--b3-border-color); border-radius: 4px; cursor: pointer; flex-shrink: 0;'

      // 黑暗模式文本输入框
      const darkTextInput = document.createElement('input')
      darkTextInput.className = 'b3-text-field'
      darkTextInput.type = 'text'
      darkTextInput.value = context.mobileConfig.toolbarBackgroundColorDark || '#1a1a1a'
      darkTextInput.placeholder = '#1a1a1a'
      darkTextInput.style.cssText = 'width: 80px; font-size: 14px; padding: 6px 8px;'

      darkColorPicker.onchange = async () => {
        context.mobileConfig.toolbarBackgroundColorDark = darkColorPicker.value
        darkTextInput.value = darkColorPicker.value
        await context.saveData('mobileConfig', context.mobileConfig)
        context.applyMobileToolbarStyle()
      }

      darkTextInput.onchange = async () => {
        const colorValue = darkTextInput.value.trim()
        if (colorValue) {
          context.mobileConfig.toolbarBackgroundColorDark = colorValue
          darkColorPicker.value = colorValue.startsWith('#') ? colorValue : '#1a1a1a'
          await context.saveData('mobileConfig', context.mobileConfig)
          context.applyMobileToolbarStyle()
        }
      }

      darkRow.appendChild(darkLabel)
      darkRow.appendChild(darkColorPicker)
      darkRow.appendChild(darkTextInput)

      // 跟随主题开关行
      const themeRow = document.createElement('div')
      themeRow.style.cssText = 'display: flex; align-items: center; gap: 8px;'

      // 跟随主题颜色开关
      const themeCheckbox = document.createElement('input')
      themeCheckbox.type = 'checkbox'
      themeCheckbox.className = 'b3-switch'
      themeCheckbox.checked = context.mobileConfig.useThemeColor || false
      themeCheckbox.style.cssText = 'transform: scale(0.8);'

      // 主题色标签
      const themeLabel = document.createElement('span')
      themeLabel.textContent = '🎨 跟随主题颜色（自动适应明暗模式）'
      themeLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-background);'

      // 更新禁用状态
      const updateDisabledState = () => {
        const isTheme = themeCheckbox.checked
        lightColorPicker.disabled = isTheme
        lightTextInput.disabled = isTheme
        darkColorPicker.disabled = isTheme
        darkTextInput.disabled = isTheme
        lightColorPicker.style.opacity = isTheme ? '0.4' : ''
        lightTextInput.style.opacity = isTheme ? '0.4' : ''
        darkColorPicker.style.opacity = isTheme ? '0.4' : ''
        darkTextInput.style.opacity = isTheme ? '0.4' : ''
      }

      // 初始化禁用状态
      updateDisabledState()

      // 主题色开关变化
      themeCheckbox.onchange = async () => {
        context.mobileConfig.useThemeColor = themeCheckbox.checked
        updateDisabledState()
        await context.saveData('mobileConfig', context.mobileConfig)
        context.applyMobileToolbarStyle()
      }

      themeRow.appendChild(themeCheckbox)
      themeRow.appendChild(themeLabel)

      container.appendChild(lightRow)
      container.appendChild(darkRow)
      container.appendChild(themeRow)

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
      slider.value = String(Math.round((context.mobileConfig.toolbarOpacity ?? 1) * 100))
      slider.style.cssText = 'width: 150px; cursor: pointer;'

      const valueLabel = document.createElement('span')
      valueLabel.textContent = `${Math.round((context.mobileConfig.toolbarOpacity ?? 1) * 100)}%`
      valueLabel.style.cssText = 'min-width: 40px; font-size: 14px; color: var(--b3-theme-on-surface);'

      slider.oninput = () => {
        valueLabel.textContent = `${slider.value}%`
      }

      slider.onchange = async () => {
        context.mobileConfig.toolbarOpacity = parseInt(slider.value) / 100
        await context.saveData('mobileConfig', context.mobileConfig)
        context.applyMobileToolbarStyle()
      }

      container.appendChild(slider)
      container.appendChild(valueLabel)
      return container
    }
  })

  // 工具栏层级（共享配置）
  setting.addItem({
    title: '④工具栏层级',
    description: '💡值越大，越不容易被遮挡。默认512，显示在设置上层为1000（顶部和底部通用）',
    createActionElement: () => {
      const input = document.createElement('input')
      input.className = 'b3-text-field fn__flex-center fn__size200'
      input.type = 'number'
      input.value = (context.mobileConfig.toolbarZIndex ?? 512).toString()
      input.style.cssText = 'font-size: 14px; padding: 8px;'
      input.min = '0'
      input.max = '10000'
      input.onchange = async () => {
        context.mobileConfig.toolbarZIndex = parseInt(input.value) || 512
        await context.saveData('mobileConfig', context.mobileConfig)
        context.applyMobileToolbarStyle()
      }
      return input
    }
  })

  // === 工具栏位置配置 ===
  createGroupTitle('📍', '工具栏位置配置')

  setting.addItem({
    title: '工具栏位置',
    description: '💡选择工具栏显示位置（顶部固定/底部固定）',
    createActionElement: () => {
      const container = document.createElement('div')
      container.style.cssText = 'display: flex; gap: 12px; align-items: center;'

      const options = [
        { value: 'top', label: '顶部固定' },
        { value: 'bottom', label: '底部固定' }
      ]

      // 确定当前选中的值
      const getCurrentValue = () => {
        if (context.mobileConfig.enableTopToolbar) return 'top'
        return 'bottom'  // 默认底部
      }

      options.forEach(option => {
        const label = document.createElement('label')
        label.style.cssText = 'display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 13px;'

        const radio = document.createElement('input')
        radio.type = 'radio'
        radio.name = 'toolbar-position'
        radio.value = option.value
        radio.checked = getCurrentValue() === option.value
        radio.style.cssText = 'cursor: pointer;'

        radio.onchange = async () => {
          // 更新配置（互斥，只启用一个）
          context.mobileConfig.enableTopToolbar = option.value === 'top'
          context.mobileConfig.enableBottomToolbar = option.value === 'bottom'

          await context.saveData('mobileConfig', context.mobileConfig)

          // 动态更新底部/顶部专用设置的禁用状态
          const isBottom = option.value === 'bottom'
          const isTop = option.value === 'top'

          document.querySelectorAll('.bottom-toolbar-setting').forEach(el => {
            (el as HTMLInputElement).disabled = !isBottom
            ;(el as HTMLInputElement).style.opacity = isBottom ? '' : '0.5'
          })

          document.querySelectorAll('.top-toolbar-setting').forEach(el => {
            (el as HTMLInputElement).disabled = !isTop
            ;(el as HTMLInputElement).style.opacity = isTop ? '' : '0.5'
          })

          // 重新初始化工具栏
          context.updateMobileToolbar()
        }

        const text = document.createElement('span')
        text.textContent = option.label

        label.appendChild(radio)
        label.appendChild(text)
        container.appendChild(label)
      })

      return container
    }
  })

  // === 顶部工具栏专用配置 ===
  createGroupTitle('⬆️', '顶部工具栏配置')

  setting.addItem({
    title: '①距离顶部高度',
    description: '💡顶部工具栏距离屏幕顶部的距离（仅在顶部固定时有效）',
    createActionElement: () => {
      const input = document.createElement('input')
      input.className = 'b3-text-field fn__flex-center fn__size200 top-toolbar-setting'
      input.type = 'text'
      input.value = context.mobileConfig.topToolbarOffset ?? '50px'
      input.style.cssText = 'font-size: 14px; padding: 8px;'
      input.disabled = !context.mobileConfig.enableTopToolbar
      if (!context.mobileConfig.enableTopToolbar) input.style.opacity = '0.5'
      input.onchange = async () => {
        context.mobileConfig.topToolbarOffset = input.value
        await context.saveData('mobileConfig', context.mobileConfig)
        context.applyMobileToolbarStyle()
      }
      return input
    }
  })

  setting.addItem({
    title: '②扩展工具栏距离顶部工具栏',
    description: '💡扩展工具栏第1层距离顶部主工具栏的距离（仅在顶部固定时有效）',
    createActionElement: () => {
      const input = document.createElement('input')
      input.className = 'b3-text-field fn__flex-center fn__size200 top-toolbar-setting'
      input.type = 'text'
      input.value = context.mobileConfig.overflowToolbarDistanceTop ?? '8px'
      input.style.cssText = 'font-size: 14px; padding: 8px;'
      input.disabled = !context.mobileConfig.enableTopToolbar
      if (!context.mobileConfig.enableTopToolbar) input.style.opacity = '0.5'
      input.onchange = async () => {
        context.mobileConfig.overflowToolbarDistanceTop = input.value
        await context.saveData('mobileConfig', context.mobileConfig)
      }
      return input
    }
  })

  setting.addItem({
    title: '③扩展工具栏自身高度',
    description: '💡顶部模式时扩展工具栏每一层的高度',
    createActionElement: () => {
      const input = document.createElement('input')
      input.className = 'b3-text-field fn__flex-center fn__size200 top-toolbar-setting'
      input.type = 'text'
      input.value = context.mobileConfig.overflowToolbarHeightTop ?? '40px'
      input.style.cssText = 'font-size: 14px; padding: 8px;'
      input.disabled = !context.mobileConfig.enableTopToolbar
      if (!context.mobileConfig.enableTopToolbar) input.style.opacity = '0.5'
      input.onchange = async () => {
        context.mobileConfig.overflowToolbarHeightTop = input.value
        await context.saveData('mobileConfig', context.mobileConfig)
      }
      return input
    }
  })

  // === 底部工具栏专用配置 ===
  createGroupTitle('⬇️', '底部工具栏配置')

  setting.addItem({
    title: '①输入法关闭时底部高度',
    description: '💡输入法关闭时，工具栏距底部距离（仅在底部固定时有效）',
    createActionElement: () => {
      const input = document.createElement('input')
      input.className = 'b3-text-field fn__flex-center fn__size200 bottom-toolbar-setting'
      input.type = 'text'
      input.value = context.mobileConfig.closeInputOffset ?? ''
      input.style.cssText = 'font-size: 14px; padding: 8px;'
      input.disabled = !context.mobileConfig.enableBottomToolbar
      if (!context.mobileConfig.enableBottomToolbar) input.style.opacity = '0.5'
      input.onchange = async () => {
        context.mobileConfig.closeInputOffset = input.value
        await context.saveData('mobileConfig', context.mobileConfig)
        context.applyMobileToolbarStyle()
      }
      return input
    }
  })


  setting.addItem({
    title: '②输入法打开时底部高度',
    description: '💡输入法弹出时，底部工具栏距底部距离（仅在底部固定时有效）',
    createActionElement: () => {
      const input = document.createElement('input')
      input.className = 'b3-text-field fn__flex-center fn__size200 bottom-toolbar-setting'
      input.value = context.mobileConfig.openInputOffset ?? ''
      input.style.cssText = 'font-size: 14px; padding: 8px;'
      input.disabled = !context.mobileConfig.enableBottomToolbar
      if (!context.mobileConfig.enableBottomToolbar) input.style.opacity = '0.5'
      input.onchange = async () => {
        context.mobileConfig.openInputOffset = input.value
        await context.saveData('mobileConfig', context.mobileConfig)
        context.applyMobileToolbarStyle()
      }
      return input
    }
  })

  setting.addItem({
    title: '③输入法灵敏度检查',
    description: '💡不建议修改：窗口高度变化超过此百分比触发：30-90（仅在底部固定时有效）',
    createActionElement: () => {
      const input = document.createElement('input')
      input.className = 'b3-text-field fn__flex-center fn__size200 bottom-toolbar-setting'
      input.type = 'number'
      input.value = (context.mobileConfig.heightThreshold ?? 70).toString()
      input.style.cssText = 'font-size: 14px; padding: 8px;'
      input.min = '30'
      input.max = '90'
      input.disabled = !context.mobileConfig.enableBottomToolbar
      if (!context.mobileConfig.enableBottomToolbar) input.style.opacity = '0.5'
      input.onchange = async () => {
        context.mobileConfig.heightThreshold = parseInt(input.value) || 70
        await context.saveData('mobileConfig', context.mobileConfig)
        // 需要重新初始化工具栏检测器以应用新阈值
        context.updateMobileToolbar()
      }
      return input
    }
  })

  setting.addItem({
    title: '④扩展工具栏距离底部工具栏',
    description: '💡扩展工具栏第1层距离底部主工具栏的距离（仅在底部固定时有效）',
    createActionElement: () => {
      const input = document.createElement('input')
      input.className = 'b3-text-field fn__flex-center fn__size200 bottom-toolbar-setting'
      input.type = 'text'
      input.value = context.mobileConfig.overflowToolbarDistanceBottom ?? '8px'
      input.style.cssText = 'font-size: 14px; padding: 8px;'
      input.disabled = !context.mobileConfig.enableBottomToolbar
      if (!context.mobileConfig.enableBottomToolbar) input.style.opacity = '0.5'
      input.onchange = async () => {
        context.mobileConfig.overflowToolbarDistanceBottom = input.value
        await context.saveData('mobileConfig', context.mobileConfig)
      }
      return input
    }
  })

  setting.addItem({
    title: '⑤扩展工具栏自身高度',
    description: '💡底部模式时扩展工具栏每一层的高度',
    createActionElement: () => {
      const input = document.createElement('input')
      input.className = 'b3-text-field fn__flex-center fn__size200 bottom-toolbar-setting'
      input.type = 'text'
      input.value = context.mobileConfig.overflowToolbarHeightBottom ?? '40px'
      input.style.cssText = 'font-size: 14px; padding: 8px;'
      input.disabled = !context.mobileConfig.enableBottomToolbar
      if (!context.mobileConfig.enableBottomToolbar) input.style.opacity = '0.5'
      input.onchange = async () => {
        context.mobileConfig.overflowToolbarHeightBottom = input.value
        await context.saveData('mobileConfig', context.mobileConfig)
      }
      return input
    }
  })


  // === 小功能选择 ===
  createGroupTitle('⚙️', '小功能选择')

  // 检查扩展工具栏按钮是否启用
  const isOverflowButtonEnabled = () => {
    const overflowBtn = context.mobileButtonConfigs.find(btn => btn.id === 'overflow-button-mobile')
    return overflowBtn?.enabled !== false
  }


  setting.addItem({
    title: '面包屑图标隐藏',
    description: '💡开启后隐藏面包屑左侧的图标',
    createActionElement: () => {
      const toggle = document.createElement('input')
      toggle.type = 'checkbox'
      toggle.className = 'b3-switch'
      const overflowEnabled = isOverflowButtonEnabled()
      toggle.checked = overflowEnabled ? true : context.mobileFeatureConfig.hideBreadcrumbIcon
      toggle.style.cssText = 'transform: scale(1.2);'
      if (overflowEnabled) {
        toggle.disabled = true
        toggle.style.opacity = '0.5'
      }
      toggle.onchange = async () => {
        context.mobileFeatureConfig.hideBreadcrumbIcon = toggle.checked
        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
        context.applyFeatures()
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
      const overflowEnabled = isOverflowButtonEnabled()
      toggle.checked = overflowEnabled ? true : context.mobileFeatureConfig.hideReadonlyButton
      toggle.style.cssText = 'transform: scale(1.2);'
      if (overflowEnabled) {
        toggle.disabled = true
        toggle.style.opacity = '0.5'
      }
      toggle.onchange = async () => {
        context.mobileFeatureConfig.hideReadonlyButton = toggle.checked
        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
        context.applyFeatures()
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
      const overflowEnabled = isOverflowButtonEnabled()
      toggle.checked = overflowEnabled ? true : context.mobileFeatureConfig.hideDocMenuButton
      toggle.style.cssText = 'transform: scale(1.2);'
      if (overflowEnabled) {
        toggle.disabled = true
        toggle.style.opacity = '0.5'
      }
      toggle.onchange = async () => {
        context.mobileFeatureConfig.hideDocMenuButton = toggle.checked
        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
        context.applyFeatures()
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
      const overflowEnabled = isOverflowButtonEnabled()
      toggle.checked = overflowEnabled ? true : context.mobileFeatureConfig.hideMoreButton
      toggle.style.cssText = 'transform: scale(1.2);'
      if (overflowEnabled) {
        toggle.disabled = true
        toggle.style.opacity = '0.5'
      }
      toggle.onchange = async () => {
        context.mobileFeatureConfig.hideMoreButton = toggle.checked
        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
        context.applyFeatures()
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
      toggle.checked = context.mobileFeatureConfig.disableMobileSwipe ?? false
      toggle.style.cssText = 'transform: scale(1.2);'
      toggle.onchange = async () => {
        context.mobileFeatureConfig.disableMobileSwipe = toggle.checked
        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
        context.applyFeatures()
      }
      return toggle
    }
  })

  // 鲸鱼定制工具箱激活码输入
  setting.addItem({
    title: '🔐 鲸鱼定制工具箱激活',
    description: '💡输入激活码解锁「⑥鲸鱼定制工具箱」功能类型。激活码获取：请进QQ群1018010924咨询群主！',
    createActionElement: () => {
      const container = document.createElement('div')
      container.style.cssText = 'display: flex; flex-direction: column; gap: 10px; width: 100%;'

      // 激活状态显示
      const statusEl = document.createElement('div')
      statusEl.style.cssText = 'font-size: 13px; padding: 4px 10px; border-radius: 4px; display: inline-block; width: fit-content;'
      if (context.isAuthorToolActivated()) {
        statusEl.style.cssText += ' background: rgba(34, 197, 94, 0.2); color: #22c55e;'
        statusEl.textContent = '✓ 已激活'
      } else {
        statusEl.style.cssText += ' background: rgba(255, 77, 77, 0.2); color: #ff4d4d;'
        statusEl.textContent = '✗ 未激活'
      }
      container.appendChild(statusEl)

      // 输入框和按钮容器
      const inputRow = document.createElement('div')
      inputRow.style.cssText = 'display: flex; gap: 8px; align-items: center;'

      const input = document.createElement('input')
      input.type = 'text'
      input.className = 'b3-text-field'
      input.placeholder = '请输入激活码'
      input.value = context.mobileFeatureConfig.authorCode ?? ''
      input.style.cssText = 'flex: 1;'

      const btn = document.createElement('button')
      btn.className = 'b3-button b3-button--text'
      btn.textContent = '验证激活'
      btn.onclick = async () => {
        const code = input.value.trim()
        if (code === '88888888') {
          // 同时激活两端
          context.mobileFeatureConfig.authorActivated = true
          context.mobileFeatureConfig.authorCode = code
          context.desktopFeatureConfig.authorActivated = true
          context.desktopFeatureConfig.authorCode = code
          await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
          await context.saveData('desktopFeatureConfig', context.desktopFeatureConfig)
          statusEl.style.cssText = 'font-size: 13px; padding: 4px 10px; border-radius: 4px; display: inline-block; width: fit-content; background: rgba(34, 197, 94, 0.2); color: #22c55e;'
          statusEl.textContent = '✓ 已激活'
          Notify.showInfoAuthorToolActivated()
          // 延迟后重新加载设置页面
          setTimeout(() => {
            window.location.reload()
          }, 1500)
        } else {
          Notify.showErrorActivationCodeInvalid()
        }
      }

      inputRow.appendChild(input)
      inputRow.appendChild(btn)
      container.appendChild(inputRow)

      return container
    }
  })


  
  // === 自启动一键记事 ===
  createGroupTitle('📝', '自启动一键记事')

  // 一键记事保存配置（整合保存方式和ID配置）
  setting.addItem({
    title: '💾 一键记事保存配置',
    description: '选择保存方式并配置对应的目标ID，实时联动更新',
    createActionElement: () => {
      const container = document.createElement('div');
      container.style.cssText = 'display: flex; flex-direction: column; gap: 12px; padding: 12px; background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.08)); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 6px;';
  
      const config = context.mobileFeatureConfig as any;
      const currentSaveType = config.quickNoteSaveType || 'daily';
  
      // 保存方式选择
      const saveTypeLabel = document.createElement('label');
      saveTypeLabel.textContent = '选择保存方式：';
      saveTypeLabel.style.cssText = 'font-size: 13px; font-weight: 500;';
      container.appendChild(saveTypeLabel);
  
      // 单选按钮组
      const radioContainer = document.createElement('div');
      radioContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px; margin-top: 4px;';
  
      const options = [
        { value: 'daily', label: '📘 保存到笔记本日记', description: '内容保存到指定笔记本的当日日记' },
        { value: 'document', label: '📄 追加到指定文档', description: '内容直接追加到指定文档底部' }
      ];
  
      options.forEach(option => {
        const optionDiv = document.createElement('div');
        optionDiv.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 8px; border: 1px solid var(--b3-border-color); border-radius: 6px; cursor: pointer;';
  
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'quickNoteSaveTypeSetting';
        radio.value = option.value;
        radio.checked = currentSaveType === option.value;
        radio.style.cssText = 'transform: scale(1.2);';
  
        const labelDiv = document.createElement('div');
        labelDiv.style.cssText = 'flex: 1;';
  
        const label = document.createElement('div');
        label.textContent = option.label;
        label.style.cssText = 'font-size: 13px; font-weight: 500; color: var(--b3-theme-on-background);';
  
        const desc = document.createElement('div');
        desc.textContent = option.description;
        desc.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light); margin-top: 2px;';
  
        // 点击事件处理
        optionDiv.onclick = async () => {
          // 清除其他选中状态
          const allRadios = radioContainer.querySelectorAll('input[type="radio"]');
          allRadios.forEach(r => (r as HTMLInputElement).checked = false);
          
          // 清除所有选项的选中样式 - 使用更准确的选择器
          const allOptionDivs = radioContainer.children;
          for (let i = 0; i < allOptionDivs.length; i++) {
            const div = allOptionDivs[i] as HTMLElement;
            if (div !== optionDiv) { // 排除当前点击的选项
              div.style.borderColor = 'var(--b3-border-color)';
              div.style.backgroundColor = 'transparent';
            }
          }
            
          // 选中当前项
          radio.checked = true;
          config.quickNoteSaveType = option.value as 'daily' | 'document';
          
          // 设置当前选项的选中样式
          optionDiv.style.borderColor = 'var(--b3-theme-primary)';
          optionDiv.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
            
          // 更新ID输入框
          updateIdInput();
            
          // 保存配置
          await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
        };
  
        // 默认选中样式
        if (radio.checked) {
          optionDiv.style.borderColor = 'var(--b3-theme-primary)';
          optionDiv.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
        }
  
        labelDiv.appendChild(label);
        labelDiv.appendChild(desc);
        optionDiv.appendChild(radio);
        optionDiv.appendChild(labelDiv);
        radioContainer.appendChild(optionDiv);
      });
  
      container.appendChild(radioContainer);
  
      // ID配置区域
      const idConfigContainer = document.createElement('div');
      idConfigContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px; margin-top: 12px;';
  
      const idLabel = document.createElement('label');
      idLabel.id = 'quick-note-setting-id-label';
      idLabel.style.cssText = 'font-size: 13px; font-weight: 500;';
      idConfigContainer.appendChild(idLabel);
  
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'b3-text-field';
      input.id = 'quick-note-setting-id-input';
      input.style.cssText = 'font-size: 14px; padding: 8px; width: 100%;';
  
      const hint = document.createElement('div');
      hint.id = 'quick-note-setting-id-hint';
      hint.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface-light);';
  
      // 根据选择类型更新ID输入框
      function updateIdInput() {
        const saveType = config.quickNoteSaveType || 'daily';
        const idLabel = container.querySelector('#quick-note-setting-id-label') as HTMLLabelElement;
        const idInput = container.querySelector('#quick-note-setting-id-input') as HTMLInputElement;
        const idHint = container.querySelector('#quick-note-setting-id-hint') as HTMLDivElement;
          
        // 添加空值检查
        if (!idLabel || !idInput || !idHint) {
          return;
        }
          
        if (saveType === 'document') {
          idLabel.textContent = '📄 目标文档ID';
          idInput.placeholder = '请输入文档ID，如：20250101000000-aaaaaa';
          idInput.value = config.quickNoteDocumentId || '';
          idHint.textContent = '💡 内容将直接追加到该文档底部';
        } else {
          idLabel.textContent = '📘 目标笔记本ID';
          idInput.placeholder = '请输入笔记本ID，如：20250101000000-aaaaaa';
          idInput.value = config.quickNoteNotebookId || '';
          idHint.textContent = '💡 内容将保存到该笔记本的当日日记中';
        }
      }
  
      // 初始化显示
      updateIdInput();
  
      input.onchange = async () => {
        const saveType = config.quickNoteSaveType || 'daily';
        const value = input.value.trim();
          
        if (saveType === 'document') {
          config.quickNoteDocumentId = value;
          // 清空笔记本ID避免混淆
          config.quickNoteNotebookId = '';
        } else {
          config.quickNoteNotebookId = value;
          // 清空文档ID避免混淆
          config.quickNoteDocumentId = '';
        }
        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
      };
  
      idConfigContainer.appendChild(input);
      idConfigContainer.appendChild(hint);
      container.appendChild(idConfigContainer);
  
      return container;
    }
  });

  setting.addItem({
    title: '自启动一键记事',
    description: '💡设置自动触发记事功能的条件和默认存储位置',
    createActionElement: () => {
      const container = document.createElement('div')
      container.style.cssText = 'display: flex; flex-direction: column; gap: 12px; width: 100%;'
  
      // 获取当前配置值，设置默认值
      const config = context.mobileFeatureConfig as any
      const currentPopupConfig = config.popupConfig || 'bothModes'
  
      // 创建选项按钮
      const options = [
        { value: 'disabled', label: '①关闭自启动', description: '完全关闭自启动记事功能' },
        { value: 'smallWindowOnly', label: '②只在小窗模式下启用自启动', description: '仅当检测到小窗模式时自动触发记事' },
        { value: 'bothModes', label: '③小窗和全屏模式都启用自启动', description: '无论全屏还是小窗模式都自动触发记事' }
      ]
  
      options.forEach(option => {
        const optionContainer = document.createElement('div')
        optionContainer.style.cssText = 'display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 8px; cursor: pointer; transition: all 0.2s ease;'
  
        const radio = document.createElement('input')
        radio.type = 'radio'
        radio.name = 'popupConfig'
        radio.value = option.value
        radio.checked = currentPopupConfig === option.value
        radio.style.cssText = 'transform: scale(1.3);'
  
        const labelContainer = document.createElement('div')
        labelContainer.style.cssText = 'flex: 1;'
  
        const label = document.createElement('div')
        label.textContent = option.label
        label.style.cssText = 'font-weight: 500; color: var(--b3-theme-on-background); margin-bottom: 4px;'
  
        const desc = document.createElement('div')
        desc.textContent = option.description
        desc.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface-light);'
  
        labelContainer.appendChild(label)
        labelContainer.appendChild(desc)
  
        optionContainer.appendChild(radio)
        optionContainer.appendChild(labelContainer)
  
        // 添加选中状态样式
        if (radio.checked) {
          optionContainer.style.cssText += ' background: var(--b3-theme-primary-lightest); border-color: var(--b3-theme-primary);'
        }
  
        // 点击事件处理
        optionContainer.onclick = async () => {
          // 更新所有选项的选中状态
          container.querySelectorAll('input[type="radio"]').forEach(r => {
            const radioInput = r as HTMLInputElement;
            const container = r.closest('div[style*="cursor: pointer"]') as HTMLElement
            if (r === radio) {
              radioInput.checked = true
              if (container) {
                container.style.cssText = container.style.cssText.replace(/background: [^;]+; border-color: [^;]+;/, '') + ' background: var(--b3-theme-primary-lightest); border-color: var(--b3-theme-primary);'
              }
            } else {
              radioInput.checked = false
              if (container) {
                container.style.cssText = container.style.cssText.replace(/background: [^;]+; border-color: [^;]+;/, '')
              }
            }
          })
  
          // 保存配置
          config.popupConfig = option.value
          await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
        }
  
        container.appendChild(optionContainer)
      })
  
      return container
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
