/**
 * 电脑端设置模块
 * 处理电脑端工具栏定制器的设置界面
 */

import type { Setting } from 'siyuan'
import type { GlobalButtonConfig, ButtonConfig } from '../toolbarManager'
import { createDesktopButtonItem, type DesktopButtonContext } from '../ui/buttonItems/desktop'
import { createMobileButtonItem, type MobileButtonContext } from '../ui/buttonItems/mobile'
import { showMessage } from 'siyuan'
import * as Notify from '../notification'
import { showButtonSelector } from '../ui/buttonSelector'

/**
 * 创建电脑端全局按钮配置
 * @param config - 当前全局按钮配置
 * @param onConfigChange - 配置变化回调
 * @returns 配置容器元素
 */
export function createDesktopGlobalButtonConfig(
  config: GlobalButtonConfig,
  onConfigChange: (newConfig: GlobalButtonConfig) => void
): HTMLElement {
  const container = document.createElement('div')
  container.className = 'toolbar-customizer-content'
  container.dataset.tabGroup = 'desktop'
  container.style.cssText = 'display: flex; flex-direction: column; gap: 12px; padding: 8px 0;'

  const createRow = (
    label: string,
    inputValue: string | number,
    inputType: 'text' | 'number' | 'checkbox',
    onChange: (input: HTMLInputElement) => void
  ) => {
    const row = document.createElement('div')
    row.style.cssText = 'display: flex; align-items: center; justify-content: space-between;'

    const labelSpan = document.createElement('span')
    labelSpan.textContent = label
    labelSpan.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-background);'

    const input = document.createElement('input')
    input.className = inputType === 'checkbox' ? 'b3-switch' : 'b3-text-field'
    input.type = inputType

    if (inputType === 'checkbox') {
      input.checked = inputValue as boolean
      input.style.cssText = 'transform: scale(1.2);'
    } else {
      input.value = inputValue.toString()
      input.style.cssText = 'width: 80px; font-size: 14px; padding: 6px 8px;'
    }

    input.onchange = () => onChange(input)

    row.appendChild(labelSpan)
    row.appendChild(input)
    return { row, input }
  }

  // 图标大小
  const { row: iconSizeRow, input: iconSizeInput } = createRow(
    '图标大小 (px)',
    config.iconSize,
    'number',
    async (input) => {
      const newValue = parseInt(input.value) || 16
      onConfigChange({ ...config, iconSize: newValue })
    }
  )
  container.appendChild(iconSizeRow)

  // 按钮宽度
  const { row: widthRow, input: widthInput } = createRow(
    '按钮宽度 (px)',
    config.minWidth,
    'number',
    async (input) => {
      const newValue = parseInt(input.value) || 32
      onConfigChange({ ...config, minWidth: newValue })
    }
  )
  container.appendChild(widthRow)

  // 右边距
  const { row: marginRow, input: marginInput } = createRow(
    '右边距 (px)',
    config.marginRight,
    'number',
    async (input) => {
      const newValue = parseInt(input.value) || 8
      onConfigChange({ ...config, marginRight: newValue })
    }
  )
  container.appendChild(marginRow)

  // 右上角提示
  const { row: notifyRow, input: notifyToggle } = createRow(
    '右上角提示',
    config.showNotification,
    'checkbox',
    async (input) => {
      onConfigChange({ ...config, showNotification: input.checked })
    }
  )
  container.appendChild(notifyRow)

  // 说明文字
  const hint = document.createElement('div')
  hint.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface-light); margin-top: 8px; padding: 8px; background: var(--b3-theme-background); border-radius: 4px;'
  hint.innerHTML = '💡 修改后会批量应用到所有按钮单个按钮的独立配置优先级更高'
  container.appendChild(hint)

  return container
}

/**
 * 功能配置接口
 */
export interface FeatureConfig {
  toolbarHeight?: number
  hideBreadcrumbIcon: boolean
  hideReadonlyButton: boolean
  hideDocMenuButton: boolean
  hideMoreButton: boolean
  disableCustomButtons: boolean
  authorCode?: string
  authorActivated?: boolean
}

/**
 * 创建开关设置项
 * @param labelText - 标签文本
 * @param checked - 是否选中
 * @param onChange - 变化回调
 * @returns 设置项元素
 */
function createSwitchItem(
  labelText: string,
  checked: boolean,
  onChange: (value: boolean) => void
): HTMLElement {
  const item = document.createElement('div')
  item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;'

  const label = document.createElement('label')
  label.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); min-width: 120px;'
  label.textContent = labelText

  const switchEl = document.createElement('input')
  switchEl.type = 'checkbox'
  switchEl.className = 'b3-switch'
  switchEl.checked = checked
  switchEl.onchange = () => {
    onChange(switchEl.checked)
  }

  item.appendChild(label)
  item.appendChild(switchEl)
  return item
}

/**
 * 创建电脑端小功能选择配置
 * @param config - 当前功能配置
 * @param onConfigChange - 配置变化回调
 * @param isAuthorToolActivated - 作者工具是否已激活
 * @param onAuthorActivate - 作者激活回调
 * @returns 配置容器元素
 */
export function createDesktopFeatureConfig(
  config: FeatureConfig,
  onConfigChange: (newConfig: FeatureConfig) => void,
  isAuthorToolActivated: () => boolean,
  onAuthorActivate: (code: string) => void
): HTMLElement {
  const container = document.createElement('div')
  container.className = 'toolbar-customizer-content'
  container.dataset.tabGroup = 'desktop'
  container.style.cssText = 'display: flex; flex-direction: column; gap: 12px; width: 100% !important; max-width: 100% !important;'

  // 工具栏高度
  const heightItem = document.createElement('div')
  heightItem.style.cssText = 'display: flex; flex-direction: column; gap: 4px;'

  const heightRow = document.createElement('div')
  heightRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;'

  const heightLabel = document.createElement('label')
  heightLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); min-width: 120px;'
  heightLabel.textContent = '工具栏高度'

  const heightInput = document.createElement('input')
  heightInput.type = 'number'
  heightInput.value = config.toolbarHeight?.toString() || '32'
  heightInput.className = 'b3-text-field'
  heightInput.style.cssText = 'width: 80px;'
  heightInput.onchange = () => {
    onConfigChange({ ...config, toolbarHeight: parseInt(heightInput.value) || 32 })
  }

  heightRow.appendChild(heightLabel)
  heightRow.appendChild(heightInput)

  const heightDesc = document.createElement('div')
  heightDesc.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light); padding-left: 4px;'
  heightDesc.textContent = '💡 调整工具栏的整体高度（仅桌面端）'

  heightItem.appendChild(heightRow)
  heightItem.appendChild(heightDesc)
  container.appendChild(heightItem)

  // 各项开关
  container.appendChild(createSwitchItem('面包屑图标隐藏', config.hideBreadcrumbIcon, (v) => {
    onConfigChange({ ...config, hideBreadcrumbIcon: v })
  }))

  container.appendChild(createSwitchItem('锁定编辑按钮隐藏', config.hideReadonlyButton, (v) => {
    onConfigChange({ ...config, hideReadonlyButton: v })
  }))

  container.appendChild(createSwitchItem('文档菜单按钮隐藏', config.hideDocMenuButton, (v) => {
    onConfigChange({ ...config, hideDocMenuButton: v })
  }))

  container.appendChild(createSwitchItem('更多按钮隐藏', config.hideMoreButton, (v) => {
    onConfigChange({ ...config, hideMoreButton: v })
  }))

  // ⚠️ 特殊醒目样式：禁用自定义按钮
  const dangerItem = document.createElement('div')
  dangerItem.style.cssText = `
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
    padding: 16px !important;
    margin-top: 12px !important;
    background: linear-gradient(135deg, rgba(255, 77, 77, 0.15), rgba(255, 120, 77, 0.1)) !important;
    border: 2px solid rgba(255, 77, 77, 0.4) !important;
    border-radius: 8px !important;
  `

  const dangerHeader = document.createElement('div')
  dangerHeader.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;'

  const dangerLabel = document.createElement('label')
  dangerLabel.style.cssText = 'font-size: 15px; font-weight: 700; color: #ff4d4d; min-width: 180px;'
  dangerLabel.textContent = '⚠️ 完全恢复思源原始状态'

  const dangerSwitch = document.createElement('input')
  dangerSwitch.type = 'checkbox'
  dangerSwitch.className = 'b3-switch'
  dangerSwitch.checked = config.disableCustomButtons
  dangerSwitch.onchange = () => {
    onConfigChange({ ...config, disableCustomButtons: dangerSwitch.checked })
  }

  dangerHeader.appendChild(dangerLabel)
  dangerHeader.appendChild(dangerSwitch)

  const dangerDesc = document.createElement('div')
  dangerDesc.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface); line-height: 1.5; opacity: 0.9;'
  dangerDesc.textContent = '💡 开启后：隐藏所有自定义按钮 + 取消所有工具栏样式修改（按钮宽度、工具栏高度、隐藏原生按钮等），让思源恢复到未安装插件时的原始状态'

  dangerItem.appendChild(dangerHeader)
  dangerItem.appendChild(dangerDesc)
  container.appendChild(dangerItem)

  // 作者自用工具激活码输入
  const activationItem = document.createElement('div')
  activationItem.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    margin-top: 12px;
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(59, 130, 246, 0.1));
    border: 2px solid rgba(139, 92, 246, 0.4);
    border-radius: 8px;
  `

  const activationHeader = document.createElement('div')
  activationHeader.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;'

  const activationLabel = document.createElement('label')
  activationLabel.style.cssText = 'font-size: 15px; font-weight: 700; color: #8b5cf6; min-width: 180px;'
  activationLabel.textContent = '🔐 作者自用工具激活'

  const activationStatus = document.createElement('span')
  activationStatus.style.cssText = 'font-size: 12px; padding: 2px 8px; border-radius: 4px;'
  if (isAuthorToolActivated()) {
    activationStatus.style.cssText += ' background: rgba(34, 197, 94, 0.2); color: #22c55e;'
    activationStatus.textContent = '✓ 已激活'
  } else {
    activationStatus.style.cssText += ' background: rgba(255, 77, 77, 0.2); color: #ff4d4d;'
    activationStatus.textContent = '✗ 未激活'
  }

  activationHeader.appendChild(activationLabel)
  activationHeader.appendChild(activationStatus)

  const activationDesc = document.createElement('div')
  activationDesc.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface); line-height: 1.5; opacity: 0.9;'
  activationDesc.textContent = '💡 输入激活码后可解锁「⑥作者自用工具」功能类型'

  const activationInputRow = document.createElement('div')
  activationInputRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-top: 4px;'

  const activationInput = document.createElement('input')
  activationInput.type = 'text'
  activationInput.className = 'b3-text-field'
  activationInput.placeholder = '请输入激活码'
  activationInput.value = config.authorCode || ''
  activationInput.style.cssText = 'flex: 1; max-width: 200px;'

  const activationBtn = document.createElement('button')
  activationBtn.className = 'b3-button b3-button--text'
  activationBtn.textContent = '验证激活'
  activationBtn.onclick = () => {
    onAuthorActivate(activationInput.value.trim())
  }

  activationInputRow.appendChild(activationInput)
  activationInputRow.appendChild(activationBtn)

  activationItem.appendChild(activationHeader)
  activationItem.appendChild(activationDesc)
  activationItem.appendChild(activationInputRow)

  container.appendChild(activationItem)

  return container
}

/**
 * 电脑端设置上下文接口
 * 使用依赖注入模式，提供插件实例的方法访问
 */
export interface DesktopSettingsContext {
  desktopButtonConfigs: ButtonConfig[]
  mobileButtonConfigs: ButtonConfig[]
  desktopGlobalButtonConfig: GlobalButtonConfig
  desktopFeatureConfig: FeatureConfig
  mobileFeatureConfig: FeatureConfig
  mobileConfig: any
  isAuthorToolActivated: () => boolean
  showConfirmDialog: (message: string) => Promise<boolean>
  showIconPicker: (currentValue: string, onSelect: (icon: string) => void) => void
  saveData: (key: string, value: any) => Promise<void>
  applyFeatures: () => void
  refreshButtons: () => void
}

/**
 * 创建电脑端设置布局
 * @param setting - 思源 Setting 对象
 * @param context - 依赖注入的上下文对象
 */
export function createDesktopSettingLayout(
  setting: Setting,
  context: DesktopSettingsContext
): void {
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
        const sortedButtons = [...context.desktopButtonConfigs].sort((a, b) => a.sort - b.sort)

        sortedButtons.forEach((button, index) => {
          const buttonContext: DesktopButtonContext = {
            isAuthorToolActivated: context.isAuthorToolActivated,
            showConfirmDialog: context.showConfirmDialog,
            showIconPicker: context.showIconPicker,
            buttonConfigs: context.desktopButtonConfigs
          }
          const item = createDesktopButtonItem(button, index, renderList, context.desktopButtonConfigs, buttonContext)
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
          icon: '♥️',
          iconSize: 18,
          minWidth: 32,
          marginRight: 8,
          sort: context.desktopButtonConfigs.length + 1,
          platform: 'both',
          showNotification: true,
          enabled: true
        }
        context.desktopButtonConfigs.push(newButton)
        lastAddedButtonId = newButton.id
        renderList()
      }

      renderList()
      wrapper.appendChild(addBtn)
      wrapper.appendChild(listContainer)
      return wrapper
    }
  })

  // === 电脑端全局按钮配置 ===
  const createDesktopGlobalButtonConfigElement = () => {
    const container = document.createElement('div')
    container.className = 'toolbar-customizer-content'
    container.dataset.tabGroup = 'desktop'
    container.style.cssText = 'display: flex; flex-direction: column; gap: 12px; padding: 8px 0;'

    const createRow = (label: string, inputValue: string | number, inputType: 'text' | 'number' | 'checkbox', onChange: (input: HTMLInputElement) => void) => {
      const row = document.createElement('div')
      row.style.cssText = 'display: flex; align-items: center; justify-content: space-between;'

      const labelSpan = document.createElement('span')
      labelSpan.textContent = label
      labelSpan.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-background);'

      const input = document.createElement('input')
      input.className = inputType === 'checkbox' ? 'b3-switch' : 'b3-text-field'
      input.type = inputType

      if (inputType === 'checkbox') {
        input.checked = inputValue as boolean
        input.style.cssText = 'transform: scale(1.2);'
      } else {
        input.value = inputValue.toString()
        input.style.cssText = 'width: 80px; font-size: 14px; padding: 6px 8px;'
      }

      input.onchange = () => onChange(input)

      row.appendChild(labelSpan)
      row.appendChild(input)
      return { row, input }
    }

    // 图标大小
    const { row: iconSizeRow, input: iconSizeInput } = createRow(
      '图标大小 (px)',
      context.desktopGlobalButtonConfig.iconSize,
      'number',
      async (input) => {
        const newValue = parseInt(input.value) || 16
        context.desktopGlobalButtonConfig.iconSize = newValue
        context.desktopButtonConfigs.forEach(btn => btn.iconSize = newValue)
        await context.saveData('desktopGlobalButtonConfig', context.desktopGlobalButtonConfig)
        await context.saveData('desktopButtonConfigs', context.desktopButtonConfigs)
        Notify.showInfoIconSizeApplied()
      }
    )
    container.appendChild(iconSizeRow)

    // 按钮宽度
    const { row: widthRow, input: widthInput } = createRow(
      '按钮宽度 (px)',
      context.desktopGlobalButtonConfig.minWidth,
      'number',
      async (input) => {
        const newValue = parseInt(input.value) || 32
        context.desktopGlobalButtonConfig.minWidth = newValue
        context.desktopButtonConfigs.forEach(btn => btn.minWidth = newValue)
        await context.saveData('desktopGlobalButtonConfig', context.desktopGlobalButtonConfig)
        await context.saveData('desktopButtonConfigs', context.desktopButtonConfigs)
        Notify.showInfoButtonWidthApplied()
      }
    )
    container.appendChild(widthRow)

    // 右边距
    const { row: marginRow, input: marginInput } = createRow(
      '右边距 (px)',
      context.desktopGlobalButtonConfig.marginRight,
      'number',
      async (input) => {
        const newValue = parseInt(input.value) || 8
        context.desktopGlobalButtonConfig.marginRight = newValue
        context.desktopButtonConfigs.forEach(btn => btn.marginRight = newValue)
        await context.saveData('desktopGlobalButtonConfig', context.desktopGlobalButtonConfig)
        await context.saveData('desktopButtonConfigs', context.desktopButtonConfigs)
        Notify.showInfoMarginRightApplied()
      }
    )
    container.appendChild(marginRow)

    // 右上角提示
    const { row: notifyRow, input: notifyToggle } = createRow(
      '右上角提示',
      context.desktopGlobalButtonConfig.showNotification,
      'checkbox',
      async (input) => {
        context.desktopGlobalButtonConfig.showNotification = input.checked
        context.desktopButtonConfigs.forEach(btn => btn.showNotification = input.checked)
        await context.saveData('desktopGlobalButtonConfig', context.desktopGlobalButtonConfig)
        await context.saveData('desktopButtonConfigs', context.desktopButtonConfigs)
        // 刷新按钮以应用新配置
        context.refreshButtons()
        Notify.showNotificationToggleStatus(input.checked)
      }
    )
    container.appendChild(notifyRow)

    // 说明文字
    const hint = document.createElement('div')
    hint.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface-light); margin-top: 8px; padding: 8px; background: var(--b3-theme-background); border-radius: 4px;'
    hint.innerHTML = '💡 修改后会批量应用到所有按钮单个按钮的独立配置优先级更高'
    container.appendChild(hint)

    return container
  }

  setting.addItem({
    title: '🔧 电脑端全局按钮配置',
    description: '批量设置所有按钮的默认值（图标大小、宽度、边距、提示）',
    createActionElement: createDesktopGlobalButtonConfigElement
  })


  // 小功能选择
  setting.addItem({
    title: '⚙️ 小功能选择',
    description: '界面微调与体验优化',
    createActionElement: () => {
      const container = document.createElement('div')
      container.className = 'toolbar-customizer-content'
      container.dataset.tabGroup = 'desktop'
      container.style.cssText = 'display: flex; flex-direction: column; gap: 12px; width: 100% !important; max-width: 100% !important;'

      const createSwitchItem = (labelText: string, checked: boolean, onChange: (value: boolean) => void) => {
        const item = document.createElement('div')
        item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;'

        const label = document.createElement('label')
        label.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); min-width: 120px;'
        label.textContent = labelText

        const switchEl = document.createElement('input')
        switchEl.type = 'checkbox'
        switchEl.className = 'b3-switch'
        switchEl.checked = checked
        switchEl.onchange = async () => {
          onChange(switchEl.checked)
          await context.saveData('desktopFeatureConfig', context.desktopFeatureConfig)
          context.applyFeatures()
        }

        item.appendChild(label)
        item.appendChild(switchEl)
        return item
      }

      // 工具栏高度
      const heightItem = document.createElement('div')
      heightItem.style.cssText = 'display: flex; flex-direction: column; gap: 4px;'

      const heightRow = document.createElement('div')
      heightRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;'

      const heightLabel = document.createElement('label')
      heightLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); min-width: 120px;'
      heightLabel.textContent = '工具栏高度'

      const heightInput = document.createElement('input')
      heightInput.type = 'number'
      heightInput.value = context.desktopFeatureConfig.toolbarHeight?.toString() || '32'
      heightInput.className = 'b3-text-field'
      heightInput.style.cssText = 'width: 80px;'
      heightInput.onchange = async () => {
        context.desktopFeatureConfig.toolbarHeight = parseInt(heightInput.value) || 32
        await context.saveData('desktopFeatureConfig', context.desktopFeatureConfig)
        context.applyFeatures()
      }

      heightRow.appendChild(heightLabel)
      heightRow.appendChild(heightInput)

      const heightDesc = document.createElement('div')
      heightDesc.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light); padding-left: 4px;'
      heightDesc.textContent = '💡 调整工具栏的整体高度（仅桌面端）'

      heightItem.appendChild(heightRow)
      heightItem.appendChild(heightDesc)
      container.appendChild(heightItem)

      container.appendChild(createSwitchItem('面包屑图标隐藏', context.desktopFeatureConfig.hideBreadcrumbIcon, (v) => {
        context.desktopFeatureConfig.hideBreadcrumbIcon = v
      }))

      container.appendChild(createSwitchItem('锁定编辑按钮隐藏', context.desktopFeatureConfig.hideReadonlyButton, (v) => {
        context.desktopFeatureConfig.hideReadonlyButton = v
      }))

      container.appendChild(createSwitchItem('文档菜单按钮隐藏', context.desktopFeatureConfig.hideDocMenuButton, (v) => {
        context.desktopFeatureConfig.hideDocMenuButton = v
      }))

      container.appendChild(createSwitchItem('更多按钮隐藏', context.desktopFeatureConfig.hideMoreButton, (v) => {
        context.desktopFeatureConfig.hideMoreButton = v
      }))

      // ⚠️ 特殊醒目样式：禁用自定义按钮
      const dangerItem = document.createElement('div')
      dangerItem.style.cssText = `
        display: flex !important;
        flex-direction: column !important;
        gap: 8px !important;
        padding: 16px !important;
        margin-top: 12px !important;
        background: linear-gradient(135deg, rgba(255, 77, 77, 0.15), rgba(255, 120, 77, 0.1)) !important;
        border: 2px solid rgba(255, 77, 77, 0.4) !important;
        border-radius: 8px !important;
      `

      const dangerHeader = document.createElement('div')
      dangerHeader.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;'

      const dangerLabel = document.createElement('label')
      dangerLabel.style.cssText = 'font-size: 15px; font-weight: 700; color: #ff4d4d; min-width: 180px;'
      dangerLabel.textContent = '⚠️ 完全恢复思源原始状态'

      const dangerSwitch = document.createElement('input')
      dangerSwitch.type = 'checkbox'
      dangerSwitch.className = 'b3-switch'
      dangerSwitch.checked = context.desktopFeatureConfig.disableCustomButtons
      dangerSwitch.onchange = async () => {
        context.desktopFeatureConfig.disableCustomButtons = dangerSwitch.checked
        await context.saveData('desktopFeatureConfig', context.desktopFeatureConfig)
        context.applyFeatures()
      }

      dangerHeader.appendChild(dangerLabel)
      dangerHeader.appendChild(dangerSwitch)

      const dangerDesc = document.createElement('div')
      dangerDesc.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface); line-height: 1.5; opacity: 0.9;'
      dangerDesc.textContent = '💡 开启后：隐藏所有自定义按钮 + 取消所有工具栏样式修改（按钮宽度、工具栏高度、隐藏原生按钮等），让思源恢复到未安装插件时的原始状态'

      dangerItem.appendChild(dangerHeader)
      dangerItem.appendChild(dangerDesc)

      container.appendChild(dangerItem)

      // 作者自用工具激活码输入
      const activationItem = document.createElement('div')
      activationItem.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 16px;
        margin-top: 12px;
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(59, 130, 246, 0.1));
        border: 2px solid rgba(139, 92, 246, 0.4);
        border-radius: 8px;
      `

      const activationHeader = document.createElement('div')
      activationHeader.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;'

      const activationLabel = document.createElement('label')
      activationLabel.style.cssText = 'font-size: 15px; font-weight: 700; color: #8b5cf6; min-width: 180px;'
      activationLabel.textContent = '🔐 作者自用工具激活'

      const activationStatus = document.createElement('span')
      activationStatus.style.cssText = 'font-size: 12px; padding: 2px 8px; border-radius: 4px;'
      if (context.isAuthorToolActivated()) {
        activationStatus.style.cssText += ' background: rgba(34, 197, 94, 0.2); color: #22c55e;'
        activationStatus.textContent = '✓ 已激活'
      } else {
        activationStatus.style.cssText += ' background: rgba(255, 77, 77, 0.2); color: #ff4d4d;'
        activationStatus.textContent = '✗ 未激活'
      }

      activationHeader.appendChild(activationLabel)
      activationHeader.appendChild(activationStatus)

      const activationDesc = document.createElement('div')
      activationDesc.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface); line-height: 1.5; opacity: 0.9;'
      activationDesc.textContent = '💡 输入激活码后可解锁「⑥作者自用工具」功能类型'

      const activationInputRow = document.createElement('div')
      activationInputRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-top: 4px;'

      const activationInput = document.createElement('input')
      activationInput.type = 'text'
      activationInput.className = 'b3-text-field'
      activationInput.placeholder = '请输入激活码'
      activationInput.value = context.desktopFeatureConfig.authorCode || ''
      activationInput.style.cssText = 'flex: 1; max-width: 200px;'

      const activationBtn = document.createElement('button')
      activationBtn.className = 'b3-button b3-button--text'
      activationBtn.textContent = '验证激活'
      activationBtn.onclick = async () => {
        const code = activationInput.value.trim()
        if (code === '88888888') {
          // 同时激活两端
          context.desktopFeatureConfig.authorActivated = true
          context.desktopFeatureConfig.authorCode = code
          context.mobileFeatureConfig.authorActivated = true
          context.mobileFeatureConfig.authorCode = code
          await context.saveData('desktopFeatureConfig', context.desktopFeatureConfig)
          await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
          activationStatus.style.cssText = 'font-size: 12px; padding: 2px 8px; border-radius: 4px; background: rgba(34, 197, 94, 0.2); color: #22c55e;'
          activationStatus.textContent = '✓ 已激活'
          Notify.showInfoAuthorToolActivated()
          // 延迟后重新加载设置页面
          setTimeout(() => {
            window.location.reload()
          }, 1500)
        } else {
          Notify.showErrorActivationCodeInvalid()
        }
      }

      activationInputRow.appendChild(activationInput)
      activationInputRow.appendChild(activationBtn)

      activationItem.appendChild(activationHeader)
      activationItem.appendChild(activationDesc)
      activationItem.appendChild(activationInputRow)

      container.appendChild(activationItem)

      return container
    }
  })

  // === 手机端配置项（电脑端也可以配置手机端按钮）===

  // 手机端自定义按钮
  setting.addItem({
    title: '📱 手机端自定义按钮',
    description: `已配置 ${context.mobileButtonConfigs.length} 个按钮，点击展开编辑`,
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
        const sortedButtons = [...context.mobileButtonConfigs].sort((a, b) => a.sort - b.sort)

        sortedButtons.forEach((button, index) => {
          const buttonContext: MobileButtonContext = {
            isAuthorToolActivated: context.isAuthorToolActivated,
            showConfirmDialog: context.showConfirmDialog,
            showIconPicker: context.showIconPicker,
            showButtonIdPicker: (currentValue: string, onSelect: (result: any) => void) => {
              showButtonSelector({ currentValue, onSelect })
            },
            buttonConfigs: context.mobileButtonConfigs,
            mobileButtonConfigs: context.mobileButtonConfigs
          }
          const item = createMobileButtonItem(button, index, renderList, context.mobileButtonConfigs, buttonContext)
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
          icon: '♥️',
          iconSize: 18,
          minWidth: 32,
          marginRight: 8,
          sort: context.mobileButtonConfigs.length + 1,
          platform: 'both',
          showNotification: true,
          enabled: true
        }
        context.mobileButtonConfigs.push(newButton)
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
      container.style.cssText = 'display: flex; flex-direction: column; gap: 12px; width: 100% !important; max-width: 100% !important;'

      // 是否将工具栏置底
      const toggleRow = document.createElement('div')
      toggleRow.style.cssText = `
        width: 100%;
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
      toggle.checked = context.mobileConfig.enableBottomToolbar
      toggle.onchange = async () => {
        context.mobileConfig.enableBottomToolbar = toggle.checked
        await context.saveData('mobileConfig', context.mobileConfig)
      }

      toggleRow.appendChild(toggleLabel)
      toggleRow.appendChild(toggle)
      container.appendChild(toggleRow)

      return container
    }
  })
}
