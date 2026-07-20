/**
 * 电脑端设置模块
 * 处理电脑端思源手机端增强的设置界面
 */

import { validateActivationCode } from '../utils/activationCodeValidator'

import type { Setting } from 'siyuan'
import type { GlobalButtonConfig, ButtonConfig } from '../toolbarManager'
import { calculateButtonOverflow } from '../toolbarManager'
import { createDesktopButtonItem, type DesktopButtonContext } from '../ui/buttonItems/desktop'
import { createMobileButtonItem, type MobileButtonContext } from '../ui/buttonItems/mobile'
import { createToolbarPreview } from '../ui/toolbarPreview'
import { fetchSyncPost, showMessage } from 'siyuan'
import * as Notify from '../notification'
import { showButtonSelector } from '../ui/buttonSelector'
import { createDesktopQuickNoteSettingsSection } from '../ui/desktopQuickNoteSettings'

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
  container.style.cssText = 'display: flex; flex-direction: column; gap: 12px; padding: 16px;'

  // 外层模块框
  const moduleBox = document.createElement('div')
  moduleBox.style.cssText = `
    border: 2px solid var(--b3-border-color);
    border-radius: 8px;
    background: var(--b3-theme-surface);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  `

  // 模块标题
  const moduleTitle = document.createElement('div')
  moduleTitle.style.cssText = `
    font-size: 14px;
    font-weight: 600;
    color: var(--b3-theme-primary);
    padding-bottom: 8px;
    border-bottom: 1px solid var(--b3-border-color);
    margin-bottom: 4px;
  `
  moduleTitle.textContent = '全局按钮配置'
  moduleBox.appendChild(moduleTitle)

  const createRow = (
    label: string,
    inputValue: string | number | boolean,
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
      input.checked = !!inputValue
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
  moduleBox.appendChild(iconSizeRow)

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
  moduleBox.appendChild(widthRow)

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
  moduleBox.appendChild(marginRow)

  // 右上角提示
  const { row: notifyRow, input: notifyToggle } = createRow(
    '右上角提示',
    config.showNotification,
    'checkbox',
    async (input) => {
      onConfigChange({ ...config, showNotification: input.checked })
    }
  )
  moduleBox.appendChild(notifyRow)

  // 说明文字
  const hint = document.createElement('div')
  hint.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface-light); margin-top: 8px; padding: 8px; background: var(--b3-theme-background); border-radius: 4px;'
  hint.innerHTML = '💡 修改后会批量应用到所有按钮单个按钮的独立配置优先级更高'
  moduleBox.appendChild(hint)

  container.appendChild(moduleBox)
  return container
}

/**
 * 功能配置接口
 */
export interface FeatureConfig {
  toolbarHeight?: number
  toolbarStyle?: 'default' | 'divider'
  hideBreadcrumbIcon: boolean
  hideReadonlyButton: boolean
  hideDocMenuButton: boolean
  hideMoreButton: boolean
  disableCustomButtons: boolean
  authorCode?: string
  authorActivated?: boolean
  authorAccount?: string
  quickNoteGlobalCaptureEnabled?: boolean
  quickNoteOverflowToolbarEnabled?: boolean
  quickNoteToolbarVisible?: boolean
  quickNoteFontSize?: number  // 电脑端弹窗字体大小（独立于手机端）
  quickNoteBlockWindowPersist?: boolean  // 块格式弹窗后台常驻
  quickNoteHideFloatingToolbar?: boolean  // 块格式弹窗中是否隐藏底部悬浮胶囊
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
  dangerLabel.textContent = '⚠️ 电脑端完全恢复思源原始状态'

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

  // 鲸鱼定制工具箱激活码输入
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
  activationLabel.textContent = '🔐 鲸鱼定制工具箱激活'

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
  activationDesc.textContent = '💡 输入激活码后可解锁「⑥鲸鱼定制工具箱」功能类型。激活码获取：请进QQ群1018010924咨询群主！'

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
  
  // 根据激活状态决定是否显示输入框
  if (isAuthorToolActivated()) {
    activationInputRow.style.display = 'none'  // 激活后隐藏输入框和按钮
  }

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
  mobileGlobalButtonConfig: GlobalButtonConfig
  desktopFeatureConfig: FeatureConfig
  mobileFeatureConfig: FeatureConfig
  mobileConfig: any
  version?: string
  isAuthorToolActivated: () => boolean
  showConfirmDialog: (message: string) => Promise<boolean>
  showIconPicker: (currentValue: string, onSelect: (icon: string) => void, iconSize?: number) => void
  saveData: (key: string, value: any) => Promise<void>
  applyFeatures: () => void
  applyDesktopToolbarPosition: () => void
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
  // 预先注入样式：隐藏非 desktop 标签的配置项
  // 这样可以避免打开设置时的闪烁（先显示全部，然后隐藏部分）
  const preloadStyle = document.createElement('style')
  preloadStyle.id = 'toolbar-customizer-preload-hide'
  preloadStyle.textContent = `
    .b3-dialog__content .config-item {
      display: none !important;
    }
    .b3-dialog__content .config-item[data-tabgroup="desktop"] {
      display: block !important;
    }
    .b3-dialog__content .config-item[data-tabgroup="activation"] {
      display: block !important;
    }
  `
  document.head.appendChild(preloadStyle)


	  // 数据迁移
	  setting.addItem({
	    title: '📋 数据迁移',
	    description: '查看版本更新，导入/导出插件配置',
    createActionElement: () => {
      const container = document.createElement('div')
      container.id = 'version-update-section'
      container.className = 'toolbar-customizer-content'
      container.dataset.tabGroup = 'version'
      container.style.cssText = 'display: flex; flex-direction: column; gap: 12px; padding: 16px; background: var(--b3-theme-background); border-radius: 8px;'

      // 数据迁移按钮样式（覆盖 focus 时的主题色边框/阴影）
      if (!document.getElementById('toolbar-customizer-transfer-style')) {
        const style = document.createElement('style')
        style.id = 'toolbar-customizer-transfer-style'
        style.textContent = `
          .toolbar-customizer-transfer-btn:focus,
          .toolbar-customizer-transfer-btn:focus-visible,
          .toolbar-customizer-transfer-btn:active {
            outline: none !important;
            box-shadow: none !important;
          }
          .toolbar-customizer-transfer-btn:hover {
            box-shadow: none !important;
          }
          .toolbar-customizer-transfer-import:focus,
          .toolbar-customizer-transfer-import:focus-visible,
          .toolbar-customizer-transfer-import:active {
            border-color: #ff4d4d !important;
          }
          .toolbar-customizer-transfer-import {
            border: 1px solid #ff4d4d !important;
            border-color: #ff4d4d !important;
            color: #ff4d4d !important;
          }
          .toolbar-customizer-transfer-import:hover {
            border: 1px solid #ff4d4d !important;
            border-color: #ff4d4d !important;
            color: #ff4d4d !important;
          }
          .toolbar-customizer-transfer-export:focus,
          .toolbar-customizer-transfer-export:focus-visible,
          .toolbar-customizer-transfer-export:active {
            border-color: var(--b3-theme-primary) !important;
          }
          .toolbar-customizer-transfer-export:hover {
            border-color: var(--b3-theme-primary) !important;
            color: var(--b3-theme-primary) !important;
          }
        `
        document.head.appendChild(style)
      }

      // 当前版本框
      const versionBox = document.createElement('div')
      versionBox.style.cssText = 'padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 6px; margin-bottom: 8px;'
      
      // 版本比较函数
      function compareVersions(current: string, latest: string): boolean {
        const currentParts = current.split('.').map(Number);
        const latestParts = latest.split('.').map(Number);
        
        for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
          const currentPart = currentParts[i] || 0;
          const latestPart = latestParts[i] || 0;
          
          if (currentPart > latestPart) return true;
          if (currentPart < latestPart) return false;
        }
        
        return true; // 相同版本时返回true表示已是最新版
      }
      
      const versionRow = document.createElement('div')
      versionRow.style.cssText = 'display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--b3-theme-on-background);'
      
      // 版本号文本
      const versionText = document.createElement('span')
      versionText.style.cssText = 'display: flex; align-items: center; gap: 4px;'
      
      const versionPrefix = document.createElement('span')
      versionPrefix.textContent = '当前版本：V'
      versionPrefix.style.cssText = 'color: #1890ff; font-weight: bold;'
      
      const versionNumber = document.createElement('strong')
      // 使用传入的上下文版本号
      const pluginVersion = context.version || '1.0.0'
      versionNumber.textContent = pluginVersion
      versionNumber.style.cssText = 'color: var(--b3-theme-primary); font-size: 15px; font-weight: bold;'
      
      versionText.appendChild(versionPrefix)
      versionText.appendChild(versionNumber)
      
      versionRow.appendChild(versionText)
      
      // 检查更新链接
      const updateLink = document.createElement('a')
      updateLink.href = '#'
      updateLink.style.cssText = 'display: flex; align-items: center; gap: 4px; color: var(--b3-theme-primary); text-decoration: none; margin-left: auto; cursor: pointer;'
      
      const updateIcon = document.createElement('span')
      updateIcon.innerHTML = '🔃'
      updateIcon.style.cssText = 'font-size: 18px;'
      
      const updateText = document.createElement('span')
      updateText.textContent = '检查更新'
      
      updateLink.appendChild(updateIcon)
      updateLink.appendChild(updateText)
      
      updateLink.onclick = async (e) => {
        e.preventDefault();
        
        try {
          // 显示检查中提示
          const checkingMsg = document.createElement('div');
          checkingMsg.textContent = '正在检查更新...';
          checkingMsg.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 12px 24px; background: var(--b3-menu-background); color: var(--b3-menu-item--hover); border: 1px solid var(--b3-border-color); border-radius: 4px; z-index: 9999;';
          document.body.appendChild(checkingMsg);
          
          // 获取最新版本信息
          const response = await fetch('https://api.github.com/repos/HaoCeans/siyuan-toolbar-customizer/releases/latest');
          const releaseData = await response.json();
          
          // 移除检查提示
          document.body.removeChild(checkingMsg);
          
          if (releaseData && releaseData.tag_name) {
            const latestVersion = releaseData.tag_name.replace(/^v/i, ''); // 移除开头的v
            const currentVersion = context.version || '1.0.0';
            
            // 比较版本号
            if (compareVersions(currentVersion, latestVersion)) {
              // 当前已是最新版本
              const latestMsg = document.createElement('div');
              latestMsg.innerHTML = `✅ 已是最新版本 v${currentVersion}`;
              latestMsg.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 24px 32px; background: var(--b3-menu-background); color: var(--b3-success-text); border: 2px solid var(--b3-border-color); border-radius: 8px; z-index: 9999; box-shadow: 0 8px 24px rgba(0,0,0,0.2); font-size: 18px; min-width: 300px; text-align: center;';
              document.body.appendChild(latestMsg);
              
              // 3秒后自动移除提示
              setTimeout(() => {
                if (document.body.contains(latestMsg)) {
                  document.body.removeChild(latestMsg);
                }
              }, 3000);
            } else {
              // 存在新版本，询问是否下载
              const updateMsg = document.createElement('div');
              updateMsg.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 32px; background: var(--b3-menu-background); border: 3px solid var(--b3-theme-primary); border-radius: 16px; z-index: 9999; box-shadow: 0 12px 40px rgba(0,0,0,0.3); min-width: 500px; font-size: 18px;';
              
              const msgText = document.createElement('div');
              msgText.textContent = `发现新版本 v${latestVersion}，是否前往下载？`;
              msgText.style.cssText = 'margin-bottom: 20px; font-size: 18px; font-weight: bold;';
              
              const instructionText = document.createElement('div');
              instructionText.innerHTML = '<strong style="color: var(--b3-theme-primary);">更新流程：</strong><br/>1. 点击下载<strong style="color: #ff6b35;">package.zip</strong>包<br/>2. 解压后，替换<strong style="color: #ff6b35;">插件文件夹</strong><br/><br/><strong style="color: var(--b3-theme-primary);">如何找到插件文件夹：</strong><br/>①打开插件市场   ②找到《手机端增强》插件   ③右边文件夹图标   ④点击打开';
              instructionText.style.cssText = 'margin-bottom: 20px; font-size: 16px; color: var(--b3-font-color-secondary); line-height: 1.6; padding: 12px; background-color: var(--b3-list-background); border-radius: 6px; border-left: 4px solid var(--b3-theme-primary); border: 1px solid var(--b3-border-color);';
              
              const buttonContainer = document.createElement('div');
              buttonContainer.style.cssText = 'display: flex; gap: 12px; justify-content: flex-end;';
              
              const confirmBtn = document.createElement('button');
              confirmBtn.textContent = '前往下载';
              confirmBtn.className = 'b3-button b3-button--outline';
              confirmBtn.style.cssText = 'padding: 6px 12px; font-size: 13px;';
              confirmBtn.onclick = () => {
                window.open('https://github.com/HaoCeans/siyuan-toolbar-customizer/releases', '_blank');
                document.body.removeChild(updateMsg);
              };
              
              const cancelBtn = document.createElement('button');
              cancelBtn.textContent = '取消';
              cancelBtn.className = 'b3-button b3-button--outline';
              cancelBtn.style.cssText = 'padding: 6px 12px; font-size: 13px;';
              cancelBtn.onclick = () => {
                document.body.removeChild(updateMsg);
              };
              
              buttonContainer.appendChild(cancelBtn);
              buttonContainer.appendChild(confirmBtn);
              
              updateMsg.appendChild(msgText);
              updateMsg.appendChild(instructionText);
              updateMsg.appendChild(buttonContainer);
              document.body.appendChild(updateMsg);
            }
          } else {
            // 获取版本信息失败
            const errorMsg = document.createElement('div');
            errorMsg.textContent = '获取版本信息失败';
            errorMsg.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 12px 24px; background: var(--b3-menu-background); color: #ff6b6b; border: 1px solid var(--b3-border-color); border-radius: 4px; z-index: 9999;';
            document.body.appendChild(errorMsg);
            
            setTimeout(() => {
              if (document.body.contains(errorMsg)) {
                document.body.removeChild(errorMsg);
              }
            }, 3000);
          }
        } catch (error) {
          // 移除检查提示（如果还存在）
          const checkingMsgs = document.querySelectorAll('div');
          checkingMsgs.forEach(el => {
            if (el.textContent === '正在检查更新...') {
              document.body.removeChild(el);
            }
          });
          
          // 显示错误信息
          const errorMsg = document.createElement('div');
          errorMsg.textContent = '网络错误，无法检查更新';
          errorMsg.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 12px 24px; background: var(--b3-menu-background); color: #ff6b6b; border: 1px solid var(--b3-border-color); border-radius: 4px; z-index: 9999;';
          document.body.appendChild(errorMsg);
          
          setTimeout(() => {
            if (document.body.contains(errorMsg)) {
              document.body.removeChild(errorMsg);
            }
          }, 3000);
        }
      };
      
      versionRow.appendChild(updateLink)
      
      versionBox.appendChild(versionRow)

      // 导入/导出配置
      const transferBox = document.createElement('div')
      transferBox.style.cssText = 'padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 6px; margin-bottom: 8px; overflow-x: auto;'

      const transferRow = document.createElement('div')
      transferRow.style.cssText = 'display: flex; align-items: center; gap: 12px; min-height: 34px;'

      const transferLabel = document.createElement('div')
      transferLabel.style.cssText = 'font-size: 14px; font-weight: 700; white-space: nowrap; flex: 1; min-width: 0;'

      const transferTitle = document.createElement('span')
      transferTitle.textContent = '数据迁移：'
      transferTitle.style.cssText = 'color: var(--b3-theme-on-surface-light);'

      const transferWarn = document.createElement('span')
      transferWarn.textContent = '导入数据时，原始数据会覆盖，请先导出！'
      transferWarn.style.cssText = 'color: #ff4d4d; margin-left: 6px;'

      transferLabel.appendChild(transferTitle)
      transferLabel.appendChild(transferWarn)

      const exportBtn = document.createElement('button')
      exportBtn.className = 'b3-button b3-button--outline'
      exportBtn.textContent = '导出数据'
      exportBtn.style.cssText = 'padding: 6px 12px; font-size: 13px; margin-left: auto; border-color: var(--b3-theme-primary); color: var(--b3-theme-primary);'
      exportBtn.classList.add('toolbar-customizer-transfer-btn', 'toolbar-customizer-transfer-export')
      exportBtn.onclick = () => {
        try {
          const payload = {
            schema: 'siyuan-toolbar-customizer:full-config',
            exportedAt: new Date().toISOString(),
            pluginVersion: context.version || 'unknown',
            data: {
              mobileToolbarConfig: context.mobileConfig,
              desktopButtonConfigs: context.desktopButtonConfigs,
              mobileButtonConfigs: context.mobileButtonConfigs,
              desktopFeatureConfig: context.desktopFeatureConfig,
              mobileFeatureConfig: context.mobileFeatureConfig,
              desktopGlobalButtonConfig: context.desktopGlobalButtonConfig,
              mobileGlobalButtonConfig: context.mobileGlobalButtonConfig,
            }
          }
          const text = JSON.stringify(payload, null, 2)
          const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          const safeVer = String(context.version || 'unknown').replace(/[^\w.-]+/g, '_')
          a.href = url
          a.download = `siyuan-toolbar-customizer-config_${safeVer}.json`
          document.body.appendChild(a)
          a.click()
          a.remove()
          URL.revokeObjectURL(url)
          showMessage('已导出配置文件', 2000, 'info')
        } catch (e) {
          console.warn('[导出配置] 失败:', e)
          showMessage('导出失败', 3000, 'error')
        }
      }

      const importBtn = document.createElement('button')
      importBtn.className = 'b3-button b3-button--outline'
      importBtn.textContent = '导入数据'
      importBtn.style.cssText = 'padding: 6px 12px; font-size: 13px; border: 1px solid #ff4d4d !important; border-color: #ff4d4d !important; color: #ff4d4d !important; outline: none !important; box-shadow: none !important; background: transparent;'
      importBtn.classList.add('toolbar-customizer-transfer-btn', 'toolbar-customizer-transfer-import')

      const fileInput = document.createElement('input')
      fileInput.type = 'file'
      fileInput.accept = 'application/json,.json'
      fileInput.style.display = 'none'

      const applyImported = async (data: any) => {
        // 用“替换内容”的方式更新引用，避免上下文引用断开
        if (data.mobileToolbarConfig) {
          Object.assign(context.mobileConfig, data.mobileToolbarConfig)
        }
        if (Array.isArray(data.desktopButtonConfigs)) {
          context.desktopButtonConfigs.length = 0
          context.desktopButtonConfigs.push(...data.desktopButtonConfigs)
        }
        if (Array.isArray(data.mobileButtonConfigs)) {
          context.mobileButtonConfigs.length = 0
          context.mobileButtonConfigs.push(...data.mobileButtonConfigs)
        }
        if (data.desktopFeatureConfig) {
          Object.assign(context.desktopFeatureConfig, data.desktopFeatureConfig)
        }
        if (data.mobileFeatureConfig) {
          Object.assign(context.mobileFeatureConfig, data.mobileFeatureConfig)
        }
        if (data.desktopGlobalButtonConfig) {
          Object.assign(context.desktopGlobalButtonConfig, data.desktopGlobalButtonConfig)
        }
        if (data.mobileGlobalButtonConfig) {
          Object.assign(context.mobileGlobalButtonConfig, data.mobileGlobalButtonConfig)
        }

        // 全量写入存储，然后重载 UI
        try {
          await context.saveData('mobileToolbarConfig', context.mobileConfig)
          await context.saveData('desktopButtonConfigs', context.desktopButtonConfigs)
          await context.saveData('mobileButtonConfigs', context.mobileButtonConfigs)
          await context.saveData('desktopFeatureConfig', context.desktopFeatureConfig)
          await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
          await context.saveData('desktopGlobalButtonConfig', context.desktopGlobalButtonConfig)
          await context.saveData('mobileGlobalButtonConfig', context.mobileGlobalButtonConfig)
        } catch (e) {
          console.warn('[导入配置] 保存失败:', e)
          showMessage('导入保存时部分失败，建议重载后检查配置', 3000, 'error')
          return
        }

        showMessage('导入成功，正在重载...', 2000, 'info')
        await fetchSyncPost('/api/ui/reloadUI', {})
      }

      fileInput.onchange = async () => {
        const file = fileInput.files?.[0]
        fileInput.value = ''
        if (!file) return

        const ok = await context.showConfirmDialog('导入将覆盖当前所有配置，是否继续？')
        if (!ok) return

        try {
          const text = await file.text()
          const json = JSON.parse(text)
          const data = json?.data ?? json
          await applyImported(data)
        } catch (e) {
          console.warn('[导入配置] 失败:', e)
          showMessage('导入失败：文件格式不正确', 3000, 'error')
        }
      }

      importBtn.onclick = () => fileInput.click()

      transferRow.appendChild(transferLabel)
      transferRow.appendChild(exportBtn)
      transferRow.appendChild(importBtn)
      transferRow.appendChild(fileInput)

      transferBox.appendChild(transferRow)
      container.appendChild(transferBox)
      container.appendChild(versionBox)
      
      // 问题反馈框
      const contactBox = document.createElement('div')
      contactBox.style.cssText = 'padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 6px; margin-bottom: 8px;'
      
      const contactRow = document.createElement('div')
      contactRow.style.cssText = 'display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--b3-theme-on-background);'
      
      const contactText = document.createElement('span')
      contactText.style.cssText = 'display: flex; align-items: center; gap: 4px;'
      
      const contactPrefix = document.createElement('span')
      contactPrefix.textContent = '问题反馈：QQ群 '
      contactPrefix.style.cssText = 'color: #ff6b35; font-weight: bold;'
      
      const qqNumber = document.createElement('strong')
      qqNumber.textContent = '1018010924'
      qqNumber.style.cssText = 'color: var(--b3-theme-primary); font-size: 15px; font-weight: bold;'
      
      const contactSuffix = document.createElement('span')
      contactSuffix.textContent = ' （若右边链接无效，请搜索群添加）'
      
      contactText.appendChild(contactPrefix)
      contactText.appendChild(qqNumber)
      contactText.appendChild(contactSuffix)
      
      const qqLink = document.createElement('a')
      qqLink.href = 'https://qm.qq.com/q/EzwqDQpYA0'
      qqLink.target = '_blank'
      qqLink.style.cssText = 'display: flex; align-items: center; gap: 4px; color: var(--b3-theme-primary); text-decoration: none; margin-left: auto;'
      
      const qqIcon = document.createElement('span')
      qqIcon.innerHTML = '💬'
      qqIcon.style.cssText = 'font-size: 18px;'
      
      const qqText = document.createElement('span')
      qqText.textContent = '点击加群'
      
      qqLink.appendChild(qqIcon)
      qqLink.appendChild(qqText)
      
      contactRow.appendChild(contactText)
      contactRow.appendChild(qqLink)
      
      contactBox.appendChild(contactRow)
      container.appendChild(contactBox)

      // 打赏支持框
      const donationBox = document.createElement('div')
      donationBox.style.cssText = 'padding: 16px; margin-top: 16px; border: 1px solid var(--b3-border-color); border-radius: 8px;'
            
      const donationTitle = document.createElement('div')
      donationTitle.style.cssText = 'font-size: 20px; font-weight: bold; color: var(--b3-theme-on-background); text-align: center; margin-bottom: 12px;'
      donationTitle.textContent = '🧧 打赏支持'
            
      const donationText = document.createElement('div')
      donationText.style.cssText = 'font-size: 18px; color: var(--b3-theme-on-background); text-align: center; margin-bottom: 16px;'
      donationText.textContent = '感谢您的支持与反馈，这将鼓励作者持续开发'
            
      // 二维码容器 - 横向排列
      const qrContainer = document.createElement('div')
      qrContainer.style.cssText = 'display: flex; gap: 16px; align-items: center; justify-content: center;'
            
      // 二维码图片
      const qrImg1 = document.createElement('img')
      qrImg1.src = 'https://raw.githubusercontent.com/HaoCeans/siyuan-toolbar-customizer/main/payment2.png'
      qrImg1.alt = '打赏二维码'
      qrImg1.style.cssText = 'width: 300px; height: 300px; object-fit: contain; border-radius: 4px;'
            
      const qrImg2 = document.createElement('img')
      qrImg2.src = 'https://raw.githubusercontent.com/HaoCeans/siyuan-toolbar-customizer/main/payment1.png'
      qrImg2.alt = '打赏二维码'
      qrImg2.style.cssText = 'width: 300px; height: 300px; object-fit: contain; border-radius: 4px;'
            
      qrContainer.appendChild(qrImg1)
      qrContainer.appendChild(qrImg2)
            
      donationBox.appendChild(donationTitle)
      donationBox.appendChild(donationText)
      donationBox.appendChild(qrContainer)

      container.appendChild(donationBox)

      return container
    }
  })

  // 激活与权益
  setting.addItem({
    title: '🔐 激活与权益',
    description: '激活码输入、功能列表、打赏支持',
    createActionElement: () => {
      const container = document.createElement('div')
      container.className = 'toolbar-customizer-content'
      container.dataset.tabGroup = 'activation'
      container.style.cssText = 'display: flex; flex-direction: column; gap: 12px; padding: 16px; background: var(--b3-theme-background); border-radius: 8px;'

      // ========== 付款用户账号块 ==========
      // 账号块已迁移到「查看激活方式」弹窗内（showActivationInfoModal），这里仅保留 currentUserName 闭包供弹窗复用
      const currentUserName = () => {
        const u = (window as any).siyuan?.user
        return (u && typeof u.userName === 'string' && u.userName) || ''
      }

      // 鲸鱼定制工具箱整体框
      const whaleToolboxContainer = document.createElement('div')
      whaleToolboxContainer.id = 'whale-toolbox-activation-desktop'
      whaleToolboxContainer.style.cssText = `
        padding: 16px;
        margin-top: 16px;
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(59, 130, 246, 0.1));
        border: 2px solid rgba(139, 92, 246, 0.4);
        border-radius: 8px;
      `
      
      // 鲸鱼定制工具箱激活码输入
      const activationItem = document.createElement('div')
      activationItem.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 16px 0;
        border-bottom: 1px solid rgba(139, 92, 246, 0.3);
      `
            
      const activationHeader = document.createElement('div')
      activationHeader.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;'
            
      const activationLabel = document.createElement('label')
      activationLabel.style.cssText = 'font-size: 15px; font-weight: 700; color: #8b5cf6; min-width: 180px;'
      activationLabel.textContent = '🔐 鲸鱼定制工具箱激活'
            
      const statusContainer = document.createElement('div')
      statusContainer.style.cssText = 'display: flex; align-items: center; gap: 8px;'
      
      const activationStatus = document.createElement('span')
      activationStatus.style.cssText = 'font-size: 12px; padding: 2px 8px; border-radius: 4px;'
      if (context.isAuthorToolActivated()) {
        activationStatus.style.cssText += ' background: rgba(34, 197, 94, 0.2); color: #22c55e;'
        activationStatus.textContent = '✓ 已激活'
      } else {
        activationStatus.style.cssText += ' background: rgba(255, 77, 77, 0.2); color: #ff4d4d;'
        activationStatus.textContent = '✗ 未激活'
      }
      
      // 添加重新激活按钮到状态容器中
      if (context.isAuthorToolActivated()) {
        const reActivateBtn = document.createElement('button')
        reActivateBtn.className = 'b3-button b3-button--info'
        reActivateBtn.textContent = '重新激活'
        reActivateBtn.style.cssText = 'padding: 2px 8px; font-size: 12px; height: 24px;'
        reActivateBtn.onclick = () => {
          // 显示输入框和验证按钮
          activationInputRow.style.display = 'flex'
          // 隐藏按钮容器
          ;(reActivateBtn.parentElement as HTMLElement).style.display = 'none'
        }
        statusContainer.appendChild(reActivateBtn)

        // 「清除激活」按钮：真正撤销激活状态（临时调试/特殊场景用，不可逆）
        const clearBtn = document.createElement('button')
        clearBtn.className = 'b3-button b3-button--danger'
        clearBtn.textContent = '清除激活'
        clearBtn.style.cssText = 'padding: 2px 8px; font-size: 12px; height: 24px; margin-left: 4px;'
        clearBtn.onclick = async () => {
          if (!window.confirm('确定要清除激活状态吗？\n\n此操作会立即清空当前激活码与账号绑定，所有付费功能将无法使用，需要重新输入有效激活码才能恢复。')) return
          try {
            clearBtn.disabled = true
            clearBtn.textContent = '清除中...'
            context.desktopFeatureConfig.authorActivated = false
            context.desktopFeatureConfig.authorCode = ''
            context.desktopFeatureConfig.authorAccount = ''
            context.mobileFeatureConfig.authorActivated = false
            context.mobileFeatureConfig.authorCode = ''
            context.mobileFeatureConfig.authorAccount = ''
            await context.saveData('desktopFeatureConfig', context.desktopFeatureConfig)
            await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
            showMessage('激活状态已清除，正在重载...', 2000, 'info')
            setTimeout(() => window.location.reload(), 1000)
          } catch (err) {
            console.error('[ClearActivation] 清除失败:', err)
            showMessage('清除失败，请重试', 3000, 'error')
            clearBtn.disabled = false
            clearBtn.textContent = '清除激活'
          }
        }
        statusContainer.appendChild(clearBtn)
      }
      
      statusContainer.appendChild(activationStatus)
            
      activationHeader.appendChild(activationLabel)
      activationHeader.appendChild(statusContainer)
            
      const activationDesc = document.createElement('div')
      activationDesc.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface); line-height: 1.5; opacity: 0.9;'
      activationDesc.textContent = '💡 输入激活码后可解锁「⑥鲸鱼定制工具箱」功能类型。若想获得激活码，请点击下方「📘 查看激活方式」按钮查看方案与定价。'
            
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
        if (!code || activationBtn.disabled) return
        // 获取当前思源账号名
        const u = (window as any).siyuan?.user
        const userName = (u && typeof u.userName === 'string' && u.userName) || ''
        if (!userName) {
          showMessage('未检测到思源账号，请先在思源登录账号后再激活', 3000, 'error')
          return
        }
        // 禁用按钮防重复点击
        activationBtn.disabled = true
        activationBtn.textContent = '验证中...'
        try {
          if (validateActivationCode(code, userName)) {
            // 同时激活两端
            context.desktopFeatureConfig.authorActivated = true
            context.desktopFeatureConfig.authorCode = code
            context.desktopFeatureConfig.authorAccount = userName
            context.mobileFeatureConfig.authorActivated = true
            context.mobileFeatureConfig.authorCode = code
            context.mobileFeatureConfig.authorAccount = userName
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
        } finally {
          activationBtn.disabled = false
          activationBtn.textContent = '验证激活'
        }
      }
            
      activationInputRow.appendChild(activationInput)
      activationInputRow.appendChild(activationBtn)
      
      // 根据激活状态决定是否显示输入框和验证按钮
      if (context.isAuthorToolActivated()) {
        activationInputRow.style.display = 'none'  // 激活后隐藏输入框和验证按钮
      }
            
      activationItem.appendChild(activationHeader)
      activationItem.appendChild(activationDesc)
      activationItem.appendChild(activationInputRow)
      
      whaleToolboxContainer.appendChild(activationItem)

      // "查看激活方式"按钮：紧跟激活码输入区，独立成全宽一行，点击弹出激活方式说明弹窗（与手机端一致）
      // showActivationInfoModal 在后面定义，onclick 是异步闭包引用，调用时已存在
      const infoBtn = document.createElement('button')
      infoBtn.className = 'b3-button b3-button--text'
      infoBtn.style.cssText = 'width: 100%; margin-top: 8px; padding: 8px; border: 1px solid #722ed1; border-radius: 6px; background: rgba(114, 46, 209, 0.08); color: #722ed1; font-weight: 600;'
      infoBtn.textContent = '📘 查看激活方式'
      infoBtn.onclick = () => showActivationInfoModal(context.isAuthorToolActivated())
      whaleToolboxContainer.appendChild(infoBtn)
            
      // 鲸鱼定制工具箱功能列表说明
      const whaleFunctionListContainer = document.createElement('div')
      whaleFunctionListContainer.style.cssText = `
        padding: 16px 0;
        margin-top: 16px;
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(59, 130, 246, 0.05));
        border-radius: 8px;
        box-sizing: border-box;
      `
      whaleFunctionListContainer.innerHTML = `
        <div style="font-size: 14px; color: var(--b3-theme-primary); margin-bottom: 12px; font-weight: 600;">🐋 鲸鱼定制工具箱功能列表（17项）</div>
        <div style="font-size: 12px; color: var(--b3-theme-on-surface); margin-bottom: 12px; line-height: 1.6;">激活后即可使用以下高级功能，让你的思源笔记效率翻倍：</div>
      `

	      interface __TabData { key: string; label: string; sub: string; icon: string; rows: string[] }
	      const __allRows = [
        rowTr('⓪', '一键记事弹窗块格式', '一键记事弹窗支持思源块格式输入，富文本编辑，插入标题、列表、代码块等' +
          '<a href="javascript:void(0)" onclick="(function(){var b=document.querySelector(\'button[data-tab=desktop]\');b&&b.click();setTimeout(function(){var el=document.getElementById(\'quick-note-format-section-desktop\');if(!el)return;el.scrollIntoView({behavior:\'smooth\',block:\'center\'});el.classList.remove(\'jump-highlight\');void el.offsetWidth;el.classList.add(\'jump-highlight\');setTimeout(function(){el.classList.remove(\'jump-highlight\')},2000)},300)})()" style="color:var(--b3-theme-primary);font-size:12px;text-decoration:underline;margin-left:8px;">👉设置</a>'),
        rowTr('①', '连续点击自定义按钮', '一键自动执行多个按钮操作，告别重复点击，工作流自动化'),
        rowTr('②', '打开指定ID块', '精准跳转到任意文档任意位置，省时省力'),
        rowTr('③', '数据库悬浮弹窗', '悬浮窗口快速查看数据库，无需切换页面，数据触手可及'),
        rowTr('④', '日记底部', '一键直达日记末尾，快速追加内容，记录生活点滴'),
        rowTr('⑤', '叶归LifeLog适配', '与LifeLog插件深度整合，时间记录更智能，生活管理更高效'),
        rowTr('⑥', '弹窗框模板选择', '弹出式模板选择器，快速插入常用内容，写作效率倍增'),
        rowTr('⑦', '滚动文档顶部或底部', '一键直达文档首尾，长文档浏览更轻松'),
        rowTr('⑧', '图片快捷导入日记', '一键选择图片导入笔记。若开启思源块编辑模式，可插入记事弹窗编辑器光标处'),
        rowTr('⑨', '悬浮标签页Tab', '多文档快速切换，悬浮Tab栏，自动管理'),
        rowTr('⑩', '悬浮大纲', '左侧悬浮大纲面板，标题快速跳转，阅读长文必备'),
        rowTr('⑪', '前一篇/后一篇文档', '底部悬浮导航栏，按文件树顺序浏览文档'),
		        rowTr('⑫', '滑动快速批注<br><span style="color:#10b981;font-size:11px;">免费</span>', '完美联动「鲸鱼快速批注」插件，请先在电脑端下载该插件才能使用！' +
		          '<br/><button onclick="alert(\'① 请到思源工作空间的 data/plugins/ 目录下，新建 siyuan-comment 文件夹\\n② 将下载的压缩包解压到 siyuan-comment 文件夹\\n③ 重载思源，在插件市场搜索「鲸鱼快速批注」打开插件\\n\\n如遇问题请进QQ群：1018010924\');location.href=\'https://github.com/HaoCeans/siyuan-comment/releases/download/v1.0.0/siyuan-comment.zip\'" style="margin-top:4px;padding:4px 12px;border-radius:6px;border:none;background:var(--b3-theme-primary);color:#fff;cursor:pointer;font-size:12px;outline:none;transition:opacity 0.2s;">⬇️ 下载最新版</button>'),
        rowTr('⑬', '文档朗读', '使用浏览器语音合成朗读当前文档，支持语速调节、段落高亮'),
        rowTr('⑭', '一键清理空块', '自动扫描并删除文档中空块（无文本段落/标题/列表项），预览确认后批量删除'),
        rowTr('⑮', '沉浸阅读模式<br><span style="color:#10b981;font-size:11px;">免费</span>', '🔒一键锁定文档防误编辑 + 上滑自动隐藏工具栏，全屏沉浸阅读'),
        rowTr('⑯', '快速添加附件', '📎选择任意文件上传，可自定义名称，图片支持压缩；有光标插光标处，无光标追加日记（记事弹窗中不生效）'),
      ]

      function rowTr(num: string, name: string, desc: string): string {
        return `<tr>
          <td style="padding:10px 4px;text-align:center;color:var(--b3-theme-primary);font-weight:500;">${num}</td>
          <td style="padding:10px;font-weight:500;">${name}</td>
          <td style="padding:10px;color:var(--b3-theme-on-surface);font-size:12px;">${desc}</td>
        </tr>`
      }

      const __tabs: __TabData[] = [
        { key: 'all', label: '全部功能', sub: '17项', icon: '📋', rows: __allRows },
        { key: 'reading', label: '批注阅读', sub: '6项', icon: '📖', rows: [__allRows[9], __allRows[10], __allRows[11], __allRows[13], __allRows[15], __allRows[12]] },
        { key: 'notes', label: '笔记与日记', sub: '5项', icon: '✍️', rows: [__allRows[0], __allRows[4], __allRows[5], __allRows[8], __allRows[16]] },
        { key: 'edit', label: '编辑提效', sub: '3项', icon: '⚡', rows: [__allRows[1], __allRows[6], __allRows[14]] },
        { key: 'nav', label: '导航与浏览', sub: '3项', icon: '🧭', rows: [__allRows[2], __allRows[3], __allRows[7]] },
      ]

      const __tabBar = document.createElement('div')
      __tabBar.style.cssText = 'display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;'
      whaleFunctionListContainer.appendChild(__tabBar)

      const __containers: Record<string, HTMLElement> = {}
      __tabs.forEach(t => {
        const btn = document.createElement('button')
        btn.style.cssText = 'display:flex;align-items:center;gap:4px;padding:7px 14px;border-radius:8px;border:1px solid var(--b3-border-color);background:var(--b3-theme-surface);color:var(--b3-theme-on-surface);cursor:pointer;font-size:13px;outline:none;white-space:nowrap;transition:all 0.15s;'
        btn.innerHTML = `${t.icon} ${t.label} <span style="font-size:11px;opacity:0.6;">${t.sub}</span>`
        __tabBar.appendChild(btn)

        const wrap = document.createElement('div')
        wrap.style.display = 'none'
        wrap.innerHTML = `
          <table style="width:100%;font-size:13px;border-collapse:collapse;margin-top:8px;">
            <thead>
              <tr style="background:var(--b3-theme-primary-lightest);">
                <th style="padding:10px;text-align:center;width:36px;">序号</th>
                <th style="padding:10px;text-align:left;">功能名称</th>
                <th style="padding:10px;text-align:left;">功能说明</th>
              </tr>
            </thead>
            <tbody>${t.rows.join('')}</tbody>
          </table>
          <div style="padding:12px;text-align:center;color:var(--b3-theme-primary);font-style:italic;font-size:13px;">持续更新中~</div>
        `
        whaleFunctionListContainer.appendChild(wrap)
        __containers[t.key] = wrap

        btn.onclick = () => {
          Object.values(__containers).forEach(c => c.style.display = 'none')
          wrap.style.display = ''
          __tabBar.querySelectorAll('button').forEach(b => {
            b.style.background = 'var(--b3-theme-surface)'
            b.style.color = 'var(--b3-theme-on-surface)'
            b.style.borderColor = 'var(--b3-border-color)'
          })
          btn.style.background = 'var(--b3-theme-primary)'
          btn.style.color = '#fff'
          btn.style.borderColor = 'var(--b3-theme-primary)'
        }
      })
      ;(__tabBar.querySelector('button') as HTMLElement)?.click()
      whaleToolboxContainer.appendChild(whaleFunctionListContainer)
            
      container.appendChild(whaleToolboxContainer)

      // 注入收款码弹窗样式
      if (!document.getElementById('toolbar-customizer-pay-style')) {
        const payStyle = document.createElement('style')
        payStyle.id = 'toolbar-customizer-pay-style'
        payStyle.textContent = `
          .toolbar-customizer-pay-overlay {
            position: fixed; inset: 0; z-index: 9999;
            background: rgba(0,0,0,0.45);
            display: flex; align-items: center; justify-content: center;
            padding: 16px;
          }
          .toolbar-customizer-pay-dialog {
            position: relative;
            background: var(--b3-theme-background);
            border-radius: 14px;
            padding: 20px;
            max-width: 300px; width: 100%;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
          }
          .toolbar-customizer-pay-close {
            position: absolute; top: 8px; right: 12px;
            background: transparent; border: none; font-size: 22px;
            color: var(--b3-theme-on-surface); cursor: pointer; line-height: 1;
          }
          .toolbar-customizer-pay-title {
            font-size: 14px; font-weight: 600; text-align: center;
            margin-bottom: 14px; color: var(--b3-theme-on-background);
          }
          .toolbar-customizer-pay-current {
            display: flex; justify-content: center; margin-bottom: 14px;
          }
          .toolbar-customizer-pay-qr {
            width: 240px; height: auto; aspect-ratio: 1; border-radius: 8px;
            border: 1px solid var(--b3-border-color); object-fit: contain;
            display: flex; align-items: center; justify-content: center;
            font-size: 10px; color: var(--b3-theme-on-surface); text-align: center;
            background: var(--b3-theme-surface);
          }
          .toolbar-customizer-pay-tabs {
            display: flex; gap: 8px; justify-content: center; margin-bottom: 14px;
          }
          .toolbar-customizer-pay-tab {
            padding: 6px 22px; font-size: 13px; cursor: pointer;
            background: transparent; color: var(--b3-theme-on-surface);
            border: 1px solid var(--b3-border-color); border-radius: 20px;
            transition: all 0.15s;
          }
          .toolbar-customizer-pay-tab.active {
            background: var(--b3-theme-primary); color: var(--b3-theme-on-primary);
            border-color: var(--b3-theme-primary);
          }
          .toolbar-customizer-pay-tip {
            font-size: 11px; color: var(--b3-theme-on-surface);
            text-align: center; line-height: 1.5;
          }
        `
        document.head.appendChild(payStyle)
      }

      // 收款码弹窗函数
      const showPayModal = async (planName: string) => {
        // 创建遮罩层
        const overlay = document.createElement('div')
        overlay.className = 'toolbar-customizer-pay-overlay'
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove() }

        // 对话框
        const dialog = document.createElement('div')
        dialog.className = 'toolbar-customizer-pay-dialog'

        // 关闭按钮
        const closeBtn = document.createElement('button')
        closeBtn.className = 'toolbar-customizer-pay-close'
        closeBtn.textContent = '×'
        closeBtn.onclick = () => overlay.remove()

        // 标题
        const titleEl = document.createElement('div')
        titleEl.className = 'toolbar-customizer-pay-title'
        titleEl.textContent = `${planName}`

        // 二维码图片区域
        const qrCurrent = document.createElement('div')
        qrCurrent.className = 'toolbar-customizer-pay-current'

        const qrImg = document.createElement('img')
        qrImg.className = 'toolbar-customizer-pay-qr'
        qrImg.alt = '收款码'
        qrCurrent.appendChild(qrImg)

        // Tab 切换（微信/支付宝）
        const tabContainer = document.createElement('div')
        tabContainer.className = 'toolbar-customizer-pay-tabs'

        const wechatTab = document.createElement('button')
        wechatTab.className = 'toolbar-customizer-pay-tab active'
        wechatTab.textContent = '微信'

        const alipayTab = document.createElement('button')
        alipayTab.className = 'toolbar-customizer-pay-tab'
        alipayTab.textContent = '支付宝'

        // 加载收款码（清除旧内容后重新加载）
      const loadQr = (tab: 'wechat' | 'alipay') => {
        // 清除之前的占位符或图片
        qrCurrent.innerHTML = ''

        const fileName = tab === 'wechat' ? 'pay-wechat.png' : 'pay-alipay.png'
        const url = `/plugins/siyuan-toolbar-customizer/${fileName}?_t=${Date.now()}`

        const img = document.createElement('img')
        img.className = 'toolbar-customizer-pay-qr'
        img.alt = '收款码'
        img.onload = () => {
          qrCurrent.appendChild(img)
        }
        img.onerror = () => {
          // 图片加载失败，显示占位文字
          const placeholder = document.createElement('div')
          placeholder.className = 'toolbar-customizer-pay-qr'
          placeholder.textContent = '收款码占位'
          qrCurrent.appendChild(placeholder)
        }
        img.src = url
      }

      wechatTab.onclick = () => {
        wechatTab.classList.add('active')
        alipayTab.classList.remove('active')
        loadQr('wechat')
      }

      alipayTab.onclick = () => {
        alipayTab.classList.add('active')
        wechatTab.classList.remove('active')
        loadQr('alipay')
      }

      tabContainer.appendChild(wechatTab)
      tabContainer.appendChild(alipayTab)

      // 底部提示
      const tip = document.createElement('div')
      tip.className = 'toolbar-customizer-pay-tip'
      tip.innerHTML = `
        付款后请将用户名${currentUserName() ? '<strong>' + currentUserName() + '</strong>' : '（你的思源账号）'}和付款截图发至 17114555244@qq.com 邮箱或<a href="https://qm.qq.com/q/EzwqDQpYA0" target="_blank" style="color:var(--b3-theme-primary);text-decoration:none;border-bottom:1px dashed var(--b3-theme-primary);">加入QQ群</a>联系群主。
      `

      dialog.appendChild(closeBtn)
      dialog.appendChild(titleEl)
      dialog.appendChild(qrCurrent)
      dialog.appendChild(tabContainer)
      dialog.appendChild(tip)
      overlay.appendChild(dialog)
      document.body.appendChild(overlay)

      // 默认加载微信收款码
      loadQr('wechat')
      }

      /**
       * 弹出"激活方式说明"弹窗（电脑端）。
       * 内容与手机端 showActivationInfoModal 一致：定价原则 + 激活码方案 + 付款账号（含复制）+ 付款发码流程。
       * 布局为电脑端宽屏适配：2×2 方案卡片网格、面板更宽。
       */
      const showActivationInfoModal = (isActivated: boolean): void => {
        // 遮罩
        const overlay = document.createElement('div')
        overlay.style.cssText = `
          position: fixed; inset: 0; z-index: 2000;
          background: rgba(0, 0, 0, 0.5);
          display: flex; align-items: center; justify-content: center;
          padding: 16px; box-sizing: border-box;
        `

        // 弹窗面板（电脑端：最大宽 560px，最大高度 85vh，内容滚动）
        const panel = document.createElement('div')
        panel.style.cssText = `
          background: var(--b3-theme-background);
          border-radius: 12px;
          width: 100%; max-width: 560px;
          max-height: 85vh;
          display: flex; flex-direction: column;
          overflow: hidden;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        `

        // 标题栏（含关闭按钮）
        const header = document.createElement('div')
        header.style.cssText = `
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 16px; border-bottom: 1px solid var(--b3-border-color);
          flex-shrink: 0;
        `
        const title = document.createElement('div')
        title.style.cssText = 'font-size: 16px; font-weight: 700; color: #722ed1;'
        title.textContent = '🔐 激活方式说明'
        const closeBtn = document.createElement('button')
        closeBtn.className = 'b3-button b3-button--text'
        closeBtn.textContent = '✕'
        closeBtn.style.cssText = 'font-size: 18px; padding: 2px 8px; color: var(--b3-theme-on-surface);'
        closeBtn.onclick = () => overlay.remove()
        header.appendChild(title)
        header.appendChild(closeBtn)
        panel.appendChild(header)

        // 内容区（可滚动）
        const content = document.createElement('div')
        content.style.cssText = 'padding: 14px 16px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 14px;'

        // ===== 区块1：定价原则 =====
        const pricingBox = document.createElement('div')
        pricingBox.style.cssText = 'padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 6px; background: var(--b3-theme-surface);'

        const pricingTitle = document.createElement('div')
        pricingTitle.style.cssText = 'font-size: 14px; font-weight: bold; color: var(--b3-theme-on-background); margin-bottom: 10px;'
        pricingTitle.textContent = '📐 激活方案定价原则'
        pricingBox.appendChild(pricingTitle)

        const principles = [
          { text: '免费功能已经占据80%，通常免费功能已经可以满足需求', highlight: false },
          { text: '鲸鱼定制工具箱功能均为定制，每项功能，作者均额外花费大量时间制作，并调整适配', highlight: false },
          { text: '目前鲸鱼定制工具箱有17项定制功能，其中2项免费，共15项付费功能', highlight: false },
          { text: '基于花费的时间和精力，以及前期的定制均为免费，作者决定每项定制定价为3元，进而决定永久价格', highlight: true },
          { text: '后续将继续增加定制功能，价格也会适当上涨', highlight: false },
          { text: '同时适当增加部分免费定制功能，不大幅调整价格', highlight: false },
        ]
        principles.forEach((item, idx) => {
          const row = document.createElement('div')
          row.style.cssText = `display: flex; gap: 6px; font-size: 13px; line-height: 1.55; margin-bottom: 5px; padding: ${item.highlight ? '7px 8px' : '0'}; border-radius: ${item.highlight ? '6px' : '0'}; background: ${item.highlight ? 'color-mix(in srgb, var(--b3-theme-primary) 10%, transparent)' : 'transparent'};`
          const num = document.createElement('span')
          num.style.cssText = `flex: none; font-weight: 600; color: ${item.highlight ? '#d4380d' : 'var(--b3-theme-primary)'};`
          num.textContent = `${idx + 1}.`
          const txt = document.createElement('span')
          txt.style.cssText = `flex: 1; color: var(--b3-theme-on-background); font-weight: ${item.highlight ? '600' : '400'};`
          txt.textContent = item.text
          row.appendChild(num)
          row.appendChild(txt)
          pricingBox.appendChild(row)
        })
        content.appendChild(pricingBox)

        // ===== 区块2：激活码方案（4 卡片，电脑端 2×2 网格） =====
        const plansBox = document.createElement('div')
        plansBox.style.cssText = 'padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 6px;'

        const plansTitle = document.createElement('div')
        plansTitle.style.cssText = 'font-size: 16px; font-weight: bold; color: #722ed1; margin-bottom: 12px; text-align: center;'
        plansTitle.textContent = '📦 激活码方案'
        plansBox.appendChild(plansTitle)

        // 电脑端 2×2 网格
        const plansWrapper = document.createElement('div')
        plansWrapper.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 10px;'

        const planCards = [
          { name: '永久正价', price: '45', unit: '元', duration: '永久', badge: '', hot: false, desc: '鲸鱼定制工具箱永久激活码（电脑+手机），解锁全部15项付费功能', features: ['永久激活码（电脑+手机）', '15项付费功能全解锁'] },
          { name: '普通优惠', price: '36', unit: '元', duration: '8折', badge: '推荐', hot: true, desc: '鲸鱼定制工具箱永久激活码（电脑+手机），限时优惠 10 个，送完即止', features: ['永久激活码（电脑+手机）', '限时8折优惠'] },
          { name: '学生优惠', price: '22.5', unit: '元', duration: '5折', badge: '', hot: false, desc: '需提供可证明在读学生身份的信息', features: ['永久激活码（电脑+手机）', '限时5折优惠', '需学生身份证明'] },
          { name: '定制开发', price: '100', unit: '元起', duration: '手工费', badge: '', hot: false, desc: '有专门需求的可联系作者开发专属功能，只展示给你自己使用，也可决定是否纳入工具箱', features: ['专属功能定制', '仅自己可见/纳入工具箱', '作者评估实现'] },
        ]

        planCards.forEach(card => {
          const cardEl = document.createElement('div')
          const borderClr = card.hot ? 'var(--b3-theme-primary)' : 'var(--b3-border-color)'
          const bgClr = card.hot ? 'color-mix(in srgb, var(--b3-theme-primary) 5%, var(--b3-theme-background))' : 'var(--b3-theme-background)'
          cardEl.style.cssText = `position: relative; border: 1px solid ${borderClr}; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 3px; background: ${bgClr};`

          if (card.badge) {
            const badge = document.createElement('div')
            badge.textContent = card.badge
            badge.style.cssText = 'position: absolute; top: -8px; right: 10px; background: var(--b3-theme-primary); color: var(--b3-theme-on-primary); font-size: 10px; padding: 2px 8px; border-radius: 10px;'
            cardEl.appendChild(badge)
          }

          const nameEl = document.createElement('div')
          nameEl.style.cssText = 'font-size: 14px; font-weight: 600; color: var(--b3-theme-on-background);'
          nameEl.textContent = card.name
          cardEl.appendChild(nameEl)

          const durationEl = document.createElement('div')
          durationEl.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface);'
          durationEl.textContent = card.duration
          cardEl.appendChild(durationEl)

          const priceRow = document.createElement('div')
          priceRow.style.cssText = 'margin: 2px 0;'
          const priceNum = document.createElement('span')
          priceNum.style.cssText = 'font-size: 22px; font-weight: 700; color: var(--b3-theme-primary);'
          priceNum.textContent = card.price
          priceRow.appendChild(priceNum)
          if (card.unit) {
            const priceUnit = document.createElement('span')
            priceUnit.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface); margin-left: 2px;'
            priceUnit.textContent = card.unit
            priceRow.appendChild(priceUnit)
          }
          cardEl.appendChild(priceRow)

          const descEl = document.createElement('div')
          descEl.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface); line-height: 1.5; margin: 2px 0 6px;'
          descEl.textContent = card.desc
          cardEl.appendChild(descEl)

          card.features.forEach(f => {
            const feat = document.createElement('div')
            feat.style.cssText = 'font-size: 10px; color: var(--b3-theme-on-surface); line-height: 1.4; padding-left: 6px;'
            feat.textContent = '• ' + f
            cardEl.appendChild(feat)
          })

          const buyBtn = document.createElement('button')
          const btnBg = card.hot ? 'var(--b3-theme-primary)' : 'transparent'
          const btnClr = card.hot ? 'var(--b3-theme-on-primary)' : 'var(--b3-theme-on-background)'
          const btnBdr = card.hot ? 'var(--b3-theme-primary)' : 'var(--b3-border-color)'
          buyBtn.style.cssText = `margin-top: 8px; padding: 7px 0; font-size: 12px; cursor: pointer; background: ${btnBg}; color: ${btnClr}; border: 1px solid ${btnBdr}; border-radius: 6px;`
          buyBtn.textContent = '扫码购买'
          // 电脑端：复用闭包内的 showPayModal（单参版，用户名走闭包）
          buyBtn.onclick = () => showPayModal(card.name)
          cardEl.appendChild(buyBtn)

          plansWrapper.appendChild(cardEl)
        })

        plansBox.appendChild(plansWrapper)
        content.appendChild(plansBox)

        // ===== 区块3：付款账号（含复制） =====
        const accountBox = document.createElement('div')
        accountBox.style.cssText = 'padding: 10px 12px; background: var(--b3-theme-surface); border-radius: 10px;'

        const accountHint = document.createElement('div')
        accountHint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface); margin-bottom: 6px;'
        accountHint.textContent = '付款时请提供以下用户名'
        accountBox.appendChild(accountHint)

        const accountRow = document.createElement('div')
        accountRow.style.cssText = 'display: flex; align-items: center; gap: 8px;'
        const accountName = document.createElement('span')
        accountName.style.cssText = 'font-size: 15px; font-weight: 700; color: var(--b3-theme-on-background);'
        accountName.textContent = currentUserName() || '未登录思源账号'
        accountRow.appendChild(accountName)

        const copyBtn = document.createElement('button')
        copyBtn.style.cssText = 'padding: 2px 10px; font-size: 12px; color: var(--b3-theme-primary); background: transparent; border: 1px solid var(--b3-theme-primary); border-radius: 4px; cursor: pointer;'
        copyBtn.textContent = '复制'
        copyBtn.onclick = async () => {
          const name = currentUserName()
          if (!name) {
            copyBtn.textContent = '未登录'
            setTimeout(() => { copyBtn.textContent = '复制' }, 2000)
            return
          }
          try {
            if (navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(name)
            } else {
              const ta = document.createElement('textarea')
              ta.value = name
              ta.style.position = 'fixed'
              ta.style.opacity = '0'
              document.body.appendChild(ta)
              ta.select()
              document.execCommand('copy')
              document.body.removeChild(ta)
            }
            copyBtn.textContent = '已复制！'
            setTimeout(() => { copyBtn.textContent = '复制' }, 2000)
          } catch {
            copyBtn.textContent = '复制失败'
            setTimeout(() => { copyBtn.textContent = '复制' }, 2000)
          }
        }
        accountRow.appendChild(copyBtn)
        accountBox.appendChild(accountRow)

        const accountNotice = document.createElement('div')
        accountNotice.style.cssText = 'font-size: 11px; color: #d4380d; margin-top: 6px; padding: 6px 8px; background: color-mix(in srgb, #ff4d4f 8%, transparent); border-radius: 4px; line-height: 1.5; font-weight: 500;'
        accountNotice.textContent = '激活码将根据该用户名直接绑定你的思源账号，请务必发送'
        accountBox.appendChild(accountNotice)

        const accountTip = document.createElement('div')
        accountTip.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface); margin-top: 6px; line-height: 1.5;'
        accountTip.innerHTML = '无法在付款备注提供时，可将用户名和付款截图发送至 17114555244@qq.com，或 <a href="https://qm.qq.com/q/EzwqDQpYA0" target="_blank" style="color:var(--b3-theme-primary);text-decoration:none;border-bottom:1px dashed var(--b3-theme-primary);">加入 QQ 群</a>联系群主。'
        accountBox.appendChild(accountTip)
        content.appendChild(accountBox)

        // ===== 区块4：付款发码流程 =====
        const flowBox = document.createElement('div')
        flowBox.style.cssText = 'padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 6px;'

        const flowTitle = document.createElement('div')
        flowTitle.style.cssText = 'font-size: 15px; font-weight: bold; color: #722ed1; margin-bottom: 12px;'
        flowTitle.textContent = '📋 付款发码流程'
        flowBox.appendChild(flowTitle)

        const flowSteps = document.createElement('div')
        flowSteps.style.cssText = 'display: flex; flex-direction: column; gap: 10px;'
        const steps = [
          { title: '选择方案', desc: '选择适合你的套餐方案，点击「扫码购买」' },
          { title: '扫码转账', desc: '使用微信或支付宝扫码付款，付款备注请提供用户名「<strong>' + (currentUserName() || (isActivated ? '已激活用户' : '你的思源账号用户名')) + '</strong>」' },
          { title: '提供信息', desc: '将付款截图和用户名<strong>' + (currentUserName() || '（你的思源账号）') + '</strong>发送至 17114555244@qq.com 邮箱，或<a href="https://qm.qq.com/q/EzwqDQpYA0" target="_blank" style="color:var(--b3-theme-primary);text-decoration:none;border-bottom:1px dashed var(--b3-theme-primary);">加入 QQ 群</a>联系群主' },
          { title: '获取激活码', desc: '群主核实后发放激活码，回到本页粘贴激活即可解锁全部功能' },
        ]
        steps.forEach((step, i) => {
          const stepRow = document.createElement('div')
          stepRow.style.cssText = 'display: flex; gap: 8px;'
          const stepNum = document.createElement('span')
          stepNum.textContent = String(i + 1)
          stepNum.style.cssText = 'flex: none; width: 22px; height: 22px; border-radius: 50%; background: var(--b3-theme-primary); color: var(--b3-theme-on-primary); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600;'
          stepRow.appendChild(stepNum)
          const stepContent = document.createElement('div')
          stepContent.style.cssText = 'flex: 1;'
          const stepH = document.createElement('div')
          stepH.style.cssText = 'font-size: 13px; font-weight: 600; color: var(--b3-theme-on-background);'
          stepH.textContent = step.title
          stepContent.appendChild(stepH)
          const stepD = document.createElement('div')
          stepD.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface); line-height: 1.5; margin-top: 2px;'
          stepD.innerHTML = step.desc
          stepContent.appendChild(stepD)
          stepRow.appendChild(stepContent)
          flowSteps.appendChild(stepRow)
        })
        flowBox.appendChild(flowSteps)
        content.appendChild(flowBox)

        panel.appendChild(content)
        overlay.appendChild(panel)

        // 点击遮罩外部关闭
        overlay.onclick = (e) => {
          if (e.target === overlay) overlay.remove()
        }

        document.body.appendChild(overlay)
      }

      return container
    }
  })

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
            buttonConfigs: context.desktopButtonConfigs,
            saveData: context.saveData,
            recalculateOverflow: () => { context.refreshButtons() },
            updateDesktopToolbar: () => { context.refreshButtons() }
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
        // 同步刷新工具栏预览（反映卡片列表里的删除/启用禁用/图标改动）
        previewEl?.refresh()
      }

      const addBtn = document.createElement('button')
      addBtn.className = 'b3-button b3-button--outline'
      addBtn.style.cssText = 'width: 100%; margin-bottom: 12px; padding: 10px; border-radius: 6px; font-size: 14px;'
      addBtn.textContent = '+ 添加新按钮'
      addBtn.onclick = () => {
        const newButtonIndex = context.desktopButtonConfigs.length + 1
        const newButton: ButtonConfig = {
          id: `button_${Date.now()}`,
          name: `新按钮${newButtonIndex}`,
          type: 'template',
          template: '',
          icon: '♥️',
          iconSize: context.desktopGlobalButtonConfig.iconSize,
          minWidth: context.desktopGlobalButtonConfig.minWidth,
          marginRight: context.desktopGlobalButtonConfig.marginRight,
          sort: newButtonIndex,
          platform: 'both',
          showNotification: context.desktopGlobalButtonConfig.showNotification,
          enabled: true
        }
        context.desktopButtonConfigs.push(newButton)
        lastAddedButtonId = newButton.id
        renderList()
      }

      // 工具栏所见即所得预览（放在最上方，便于一眼看清布局 + 直接拖动排序）
      let previewEl: any = null
      try {
        previewEl = createToolbarPreview({
          getButtons: () => context.desktopButtonConfigs,
          isMobile: false,
          onChanged: renderList,
        })
      } catch (e) {
        console.error('[DesktopPreview] 创建预览失败:', e)
        const errEl = document.createElement('div')
        errEl.style.cssText = 'color:var(--b3-card-error-color);font-size:12px;padding:8px;'
        errEl.textContent = '⚠️ 工具栏预览加载失败，请检查控制台错误'
        wrapper.appendChild(errEl)
      }

      renderList()
      if (previewEl) {
        wrapper.appendChild(previewEl)
        // previewEl 已挂载到 DOM，刷新使缩放计算（依赖 clientWidth）生效
        previewEl.refresh()
      }
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

    // 外层模块框
    const moduleBox = document.createElement('div')
    moduleBox.style.cssText = `
      border: 2px solid var(--b3-border-color);
      border-radius: 8px;
      background: var(--b3-theme-surface);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    `

    // 模块标题
    const moduleTitle = document.createElement('div')
    moduleTitle.style.cssText = `
      font-size: 16px;
      font-weight: 700;
      color: var(--b3-theme-primary);
      padding-bottom: 8px;
      border-bottom: 1px solid var(--b3-border-color);
      margin-bottom: 4px;
      text-align: center;
    `
    moduleTitle.textContent = '电脑端全局按钮配置🖥️'
    moduleBox.appendChild(moduleTitle)

    // 说明文字（放在开关上面）
    const hint = document.createElement('div')
    hint.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); padding: 10px 12px; background: var(--b3-theme-primary-lightest); border-radius: 6px; line-height: 1.5;'
    hint.innerHTML = '💡 开启后会批量应用到所有按钮，单个按钮的独立配置优先级更高<br>⚠️建议：按钮图标大小与按钮宽度，设置数值相同，效果会更好'
    moduleBox.appendChild(hint)

    const createRow = (label: string, inputValue: string | number | boolean, inputType: 'text' | 'number' | 'checkbox', onChange: (input: HTMLInputElement) => void) => {
      const row = document.createElement('div')
      row.style.cssText = 'display: flex; align-items: center; justify-content: space-between;'

      const labelSpan = document.createElement('span')
      labelSpan.textContent = label
      labelSpan.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-background);'

      const input = document.createElement('input')
      input.className = inputType === 'checkbox' ? 'b3-switch' : 'b3-text-field'
      input.type = inputType

      if (inputType === 'checkbox') {
        input.checked = !!inputValue
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

    // 全局配置启用开关（放在最前面）
    const { row: enabledRow, input: enabledToggle } = createRow(
      '🔓启用电脑端全局按钮配置',
      context.desktopGlobalButtonConfig.enabled ?? true,
      'checkbox',
      async (input) => {
        context.desktopGlobalButtonConfig.enabled = input.checked
        // 打开开关时，立即应用全局配置到所有按钮
        if (input.checked) {
          context.desktopButtonConfigs.forEach(btn => {
            btn.iconSize = context.desktopGlobalButtonConfig.iconSize
            btn.minWidth = context.desktopGlobalButtonConfig.minWidth
            btn.marginRight = context.desktopGlobalButtonConfig.marginRight
            btn.showNotification = context.desktopGlobalButtonConfig.showNotification
          })
          await context.saveData('desktopButtonConfigs', context.desktopButtonConfigs)
          context.refreshButtons()
        }
        await context.saveData('desktopGlobalButtonConfig', context.desktopGlobalButtonConfig)
        Notify.showGlobalConfigEnabledStatus(input.checked)
        // 更新配置项的禁用状态
        updateConfigItemsDisabled(!input.checked)
      }
    )
    moduleBox.appendChild(enabledRow)

    // 分隔线
    const separator = document.createElement('div')
    separator.style.cssText = 'height: 1px; background: var(--b3-border-color); margin: 4px 0;'
    moduleBox.appendChild(separator)

    // 收集所有配置项的 input，用于统一控制禁用状态
    const configInputs: HTMLInputElement[] = []

    // 图标大小
    const { row: iconSizeRow, input: iconSizeInput } = createRow(
      '①电脑按钮图标大小 (px)',
      context.desktopGlobalButtonConfig.iconSize,
      'number',
      async (input) => {
        const newValue = parseInt(input.value) || 16
        context.desktopGlobalButtonConfig.iconSize = newValue
        // 只有启用全局配置时才批量应用到按钮
        if (context.desktopGlobalButtonConfig.enabled ?? true) {
          context.desktopButtonConfigs.forEach(btn => btn.iconSize = newValue)
          await context.saveData('desktopButtonConfigs', context.desktopButtonConfigs)
        }
        await context.saveData('desktopGlobalButtonConfig', context.desktopGlobalButtonConfig)
        Notify.showInfoIconSizeApplied()
      }
    )
    moduleBox.appendChild(iconSizeRow)
    configInputs.push(iconSizeInput)

    // 按钮宽度
    const { row: widthRow, input: widthInput } = createRow(
      '②电脑按钮宽度 (px)📏',
      context.desktopGlobalButtonConfig.minWidth,
      'number',
      async (input) => {
        const newValue = parseInt(input.value) || 32
        context.desktopGlobalButtonConfig.minWidth = newValue
        // 只有启用全局配置时才批量应用到按钮
        if (context.desktopGlobalButtonConfig.enabled ?? true) {
          context.desktopButtonConfigs.forEach(btn => btn.minWidth = newValue)
          await context.saveData('desktopButtonConfigs', context.desktopButtonConfigs)
        }
        await context.saveData('desktopGlobalButtonConfig', context.desktopGlobalButtonConfig)
        Notify.showInfoButtonWidthApplied()
      }
    )
    moduleBox.appendChild(widthRow)
    configInputs.push(widthInput)

    // 右边距
    const { row: marginRow, input: marginInput } = createRow(
      '③电脑按钮右边距 (px)➡️',
      context.desktopGlobalButtonConfig.marginRight,
      'number',
      async (input) => {
        const newValue = parseInt(input.value) || 8
        context.desktopGlobalButtonConfig.marginRight = newValue
        // 只有启用全局配置时才批量应用到按钮
        if (context.desktopGlobalButtonConfig.enabled ?? true) {
          context.desktopButtonConfigs.forEach(btn => btn.marginRight = newValue)
          await context.saveData('desktopButtonConfigs', context.desktopButtonConfigs)
        }
        await context.saveData('desktopGlobalButtonConfig', context.desktopGlobalButtonConfig)
        Notify.showInfoMarginRightApplied()
      }
    )
    moduleBox.appendChild(marginRow)
    configInputs.push(marginInput)

    // 右上角提示
    const { row: notifyRow, input: notifyToggle } = createRow(
      ' ④电脑按钮右上角提示📢',
      context.desktopGlobalButtonConfig.showNotification,
      'checkbox',
      async (input) => {
        context.desktopGlobalButtonConfig.showNotification = input.checked
        // 只有启用全局配置时才批量应用到按钮
        if (context.desktopGlobalButtonConfig.enabled ?? true) {
          context.desktopButtonConfigs.forEach(btn => btn.showNotification = input.checked)
          await context.saveData('desktopButtonConfigs', context.desktopButtonConfigs)
        }
        await context.saveData('desktopGlobalButtonConfig', context.desktopGlobalButtonConfig)
        // 刷新按钮以应用新配置
        context.refreshButtons()
        Notify.showNotificationToggleStatus(input.checked)
      }
    )
    moduleBox.appendChild(notifyRow)
    configInputs.push(notifyToggle)

    // 更新配置项禁用状态的函数
    const updateConfigItemsDisabled = (disabled: boolean) => {
      configInputs.forEach(input => {
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

    // 根据初始状态设置禁用
    const isEnabled = context.desktopGlobalButtonConfig.enabled ?? true
    if (!isEnabled) {
      updateConfigItemsDisabled(true)
    }

    container.appendChild(moduleBox)
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

      // 工具栏高度模块框
      const toolbarBox = document.createElement('div')
      toolbarBox.style.cssText = `
        border: 2px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-surface);
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      `

      // 模块标题
      const toolbarTitle = document.createElement('div')
      toolbarTitle.style.cssText = `
        font-size: 16px;
        font-weight: 700;
        color: var(--b3-theme-primary);
        padding-bottom: 8px;
        border-bottom: 1px solid var(--b3-border-color);
        margin-bottom: 4px;
        text-align: center;
      `
      toolbarTitle.textContent = '电脑端全局工具栏配置🖥️'
      toolbarBox.appendChild(toolbarTitle)

      // 说明文字
      const toolbarHint = document.createElement('div')
      toolbarHint.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); padding: 10px 12px; background: var(--b3-theme-primary-lightest); border-radius: 6px; line-height: 1.5;'
      toolbarHint.innerHTML = '💡 调整电脑端顶部工具栏的整体样式和显示效果'
      toolbarBox.appendChild(toolbarHint)

      // 工具栏高度
      const heightItem = document.createElement('div')
      heightItem.style.cssText = 'display: flex; flex-direction: column; gap: 4px;'

      const heightRow = document.createElement('div')
      heightRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;'

      const heightLabel = document.createElement('label')
      heightLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); min-width: 120px;'
      heightLabel.textContent = '①电脑端工具栏高度'

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

      heightItem.appendChild(heightRow)
      toolbarBox.appendChild(heightItem)

      // 工具栏样式选择
      const styleItem = document.createElement('div')
      styleItem.style.cssText = 'display: flex; flex-direction: column; gap: 8px;'

      const styleLabel = document.createElement('label')
      styleLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface);'
      styleLabel.textContent = '②电脑端工具栏样式选择'
      styleItem.appendChild(styleLabel)

      const styleContainer = document.createElement('div')
      styleContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px;'

      const currentStyle = context.desktopFeatureConfig.toolbarStyle || 'default'

      // 默认样式选项
      const defaultOption = document.createElement('div')
      defaultOption.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border: 1px solid ${currentStyle === 'default' ? 'var(--b3-theme-primary)' : 'var(--b3-border-color)'};
        border-radius: 6px;
        cursor: pointer;
        background: ${currentStyle === 'default' ? 'rgba(66, 133, 244, 0.08)' : 'transparent'};
      `

      const defaultRadio = document.createElement('input')
      defaultRadio.type = 'radio'
      defaultRadio.name = 'desktop-toolbar-style'
      defaultRadio.checked = currentStyle === 'default'
      defaultRadio.style.cssText = 'cursor: pointer;'

      const defaultLabel = document.createElement('span')
      defaultLabel.textContent = '默认样式'
      defaultLabel.style.cssText = 'font-size: 13px; flex: 1;'

      defaultOption.appendChild(defaultRadio)
      defaultOption.appendChild(defaultLabel)

      // 分割线样式选项
      const dividerOption = document.createElement('div')
      dividerOption.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border: 1px solid ${currentStyle === 'divider' ? 'var(--b3-theme-primary)' : 'var(--b3-border-color)'};
        border-radius: 6px;
        cursor: pointer;
        background: ${currentStyle === 'divider' ? 'rgba(66, 133, 244, 0.08)' : 'transparent'};
      `

      const dividerRadio = document.createElement('input')
      dividerRadio.type = 'radio'
      dividerRadio.name = 'desktop-toolbar-style'
      dividerRadio.checked = currentStyle === 'divider'
      dividerRadio.style.cssText = 'cursor: pointer;'

      const dividerLabel = document.createElement('span')
      dividerLabel.textContent = '加分割线'
      dividerLabel.style.cssText = 'font-size: 13px; flex: 1;'

      dividerOption.appendChild(dividerRadio)
      dividerOption.appendChild(dividerLabel)

      // 更新选中样式
      const updateSelection = () => {
        defaultOption.style.borderColor = defaultRadio.checked ? 'var(--b3-theme-primary)' : 'var(--b3-border-color)'
        defaultOption.style.background = defaultRadio.checked ? 'rgba(66, 133, 244, 0.08)' : 'transparent'
        dividerOption.style.borderColor = dividerRadio.checked ? 'var(--b3-theme-primary)' : 'var(--b3-border-color)'
        dividerOption.style.background = dividerRadio.checked ? 'rgba(66, 133, 244, 0.08)' : 'transparent'
      }

      // 点击事件
      defaultOption.onclick = async () => {
        defaultRadio.checked = true
        context.desktopFeatureConfig.toolbarStyle = 'default'
        updateSelection()
        await context.saveData('desktopFeatureConfig', context.desktopFeatureConfig)
        // 触发自定义事件通知工具栏更新样式
        window.dispatchEvent(new CustomEvent('toolbar-style-changed', { detail: 'default' }))
      }

      dividerOption.onclick = async () => {
        dividerRadio.checked = true
        context.desktopFeatureConfig.toolbarStyle = 'divider'
        updateSelection()
        await context.saveData('desktopFeatureConfig', context.desktopFeatureConfig)
        // 触发自定义事件通知工具栏更新样式
        window.dispatchEvent(new CustomEvent('toolbar-style-changed', { detail: 'divider' }))
      }

      styleContainer.appendChild(defaultOption)
      styleContainer.appendChild(dividerOption)
      styleItem.appendChild(styleContainer)
      toolbarBox.appendChild(styleItem)

      // ===== ③工具栏位置选择（原生顶部 / 悬浮胶囊）=====
      const positionItem = document.createElement('div')
      positionItem.style.cssText = 'display: flex; flex-direction: column; gap: 8px;'

      const positionLabel = document.createElement('label')
      positionLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface);'
      positionLabel.textContent = '③工具栏位置选择'
      positionItem.appendChild(positionLabel)

      const positionContainer = document.createElement('div')
      positionContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px;'

      const cfg = context.desktopFeatureConfig as any
      const currentPosition = cfg.enableFloatingToolbar === true ? 'floating' : 'native'

      const positionOptions = [
        { value: 'native', label: '原生顶部（思源默认）' },
        { value: 'floating', label: '底部悬浮胶囊' },
      ]

      const positionRadios: HTMLInputElement[] = []
      const positionOptionEls: HTMLElement[] = []

      positionOptions.forEach(opt => {
        const optionEl = document.createElement('div')
        optionEl.style.cssText = `
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border: 1px solid ${currentPosition === opt.value ? 'var(--b3-theme-primary)' : 'var(--b3-border-color)'};
          border-radius: 6px;
          cursor: pointer;
          background: ${currentPosition === opt.value ? 'rgba(66, 133, 244, 0.08)' : 'transparent'};
        `
        const radio = document.createElement('input')
        radio.type = 'radio'
        radio.name = 'desktop-toolbar-position'
        radio.value = opt.value
        radio.checked = currentPosition === opt.value
        radio.style.cssText = 'cursor: pointer;'
        positionRadios.push(radio)
        positionOptionEls.push(optionEl)

        const labelEl = document.createElement('span')
        labelEl.textContent = opt.label
        labelEl.style.cssText = 'font-size: 13px; flex: 1;'

        optionEl.appendChild(radio)
        optionEl.appendChild(labelEl)
        positionContainer.appendChild(optionEl)
      })

      const updatePositionSelection = () => {
        positionRadios.forEach((r, i) => {
          const opt = positionOptions[i]
          positionOptionEls[i].style.borderColor = r.checked ? 'var(--b3-theme-primary)' : 'var(--b3-border-color)'
          positionOptionEls[i].style.background = r.checked ? 'rgba(66, 133, 244, 0.08)' : 'transparent'
        })
      }

      // 胶囊分区显隐辅助函数（与 mobile.ts 一致：通过 closest 找到 .config-item 行容器）
      const toggleFloatingSection = (show: boolean) => {
        const section = document.getElementById('desktop-floating-toolbar-section')
        if (section) {
          // 分区容器本身是 toolbarBox 内的一个 div，直接显隐即可（它在 toolbarBox 内，不依赖 .config-item）
          section.style.display = show ? '' : 'none'
        }
        // 同步显隐"会隐藏面包屑"提示
        const hint = document.getElementById('desktop-floating-toolbar-hint')
        if (hint) {
          hint.style.display = show ? '' : 'none'
        }
      }

      const handlePositionChange = async (value: string) => {
        cfg.enableFloatingToolbar = (value === 'floating')
        updatePositionSelection()
        await context.saveData('desktopFeatureConfig', context.desktopFeatureConfig)
        toggleFloatingSection(value === 'floating')
        context.applyDesktopToolbarPosition()
      }

      positionRadios.forEach((r, i) => {
        positionOptionEls[i].onclick = async () => {
          r.checked = true
          await handlePositionChange(r.value)
        }
      })

      positionItem.appendChild(positionContainer)

      // 选中"底部悬浮胶囊"时显示的提示：会自动隐藏文档路径（面包屑）
      const floatingHint = document.createElement('div')
      floatingHint.id = 'desktop-floating-toolbar-hint'
      floatingHint.style.cssText = `display: ${currentPosition === 'floating' ? '' : 'none'}; font-size: 12px; color: var(--b3-theme-on-surface); padding: 6px 10px; background: var(--b3-theme-primary-lightest); border-radius: 4px; line-height: 1.5;`
      floatingHint.textContent = '⚠️ 请注意：切换为悬浮胶囊后会自动隐藏文档面包屑（路径条），胶囊中只保留工具按钮。'
      positionItem.appendChild(floatingHint)

      toolbarBox.appendChild(positionItem)

      // ===== ④悬浮胶囊样式配置（仅 enableFloatingToolbar=true 时显示）=====
      const floatingSection = document.createElement('div')
      floatingSection.id = 'desktop-floating-toolbar-section'
      floatingSection.style.cssText = `display: ${currentPosition === 'floating' ? '' : 'none'}; flex-direction: column; gap: 10px; padding-top: 8px; border-top: 1px dashed var(--b3-border-color); margin-top: 4px;`

      const floatingSectionTitle = document.createElement('div')
      floatingSectionTitle.style.cssText = 'font-size: 13px; font-weight: 600; color: var(--b3-theme-primary);'
      floatingSectionTitle.textContent = '💊 悬浮胶囊样式配置'
      floatingSection.appendChild(floatingSectionTitle)

      // 通用：创建一个带 range 滑杆的配置行
      const createSliderRow = (
        labelText: string,
        currentValue: number,
        min: number,
        max: number,
        unit: string,
        onSave: (value: number) => Promise<void>
      ): HTMLElement => {
        const row = document.createElement('div')
        row.style.cssText = 'display: flex; align-items: center; gap: 10px;'

        const label = document.createElement('label')
        label.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); min-width: 110px;'
        label.textContent = labelText

        const slider = document.createElement('input')
        slider.type = 'range'
        slider.className = 'b3-slider'
        slider.min = String(min)
        slider.max = String(max)
        slider.value = String(currentValue)
        slider.style.cssText = 'flex: 1; cursor: pointer;'

        const valueDisplay = document.createElement('span')
        valueDisplay.style.cssText = 'min-width: 56px; text-align: right; font-size: 12px; color: var(--b3-theme-on-surface); font-variant-numeric: tabular-nums;'
        valueDisplay.textContent = `${currentValue}${unit}`

        slider.oninput = () => {
          valueDisplay.textContent = `${slider.value}${unit}`
        }
        slider.onchange = async () => {
          const v = parseInt(slider.value, 10)
          if (!Number.isNaN(v)) {
            await onSave(v)
          }
        }

        row.appendChild(label)
        row.appendChild(slider)
        row.appendChild(valueDisplay)
        return row
      }

      // 距底部距离
      floatingSection.appendChild(createSliderRow(
        '距底部距离',
        cfg.floatingToolbarMargin ?? 20, 0, 100, 'px',
        async (v) => {
          cfg.floatingToolbarMargin = v
          await context.saveData('desktopFeatureConfig', context.desktopFeatureConfig)
          context.applyDesktopToolbarPosition()
        }
      ))

      // 圆角大小
      floatingSection.appendChild(createSliderRow(
        '圆角大小',
        cfg.floatingToolbarBorderRadius ?? 24, 0, 50, 'px',
        async (v) => {
          cfg.floatingToolbarBorderRadius = v
          await context.saveData('desktopFeatureConfig', context.desktopFeatureConfig)
          context.applyDesktopToolbarPosition()
        }
      ))

      // 胶囊高度
      floatingSection.appendChild(createSliderRow(
        '胶囊高度',
        cfg.floatingToolbarHeight ?? 40, 24, 80, 'px',
        async (v) => {
          cfg.floatingToolbarHeight = v
          await context.saveData('desktopFeatureConfig', context.desktopFeatureConfig)
          context.applyDesktopToolbarPosition()
        }
      ))

      // 胶囊宽度（0=auto 自适应）
      floatingSection.appendChild(createSliderRow(
        '胶囊宽度 (0=自适应)',
        cfg.floatingToolbarWidth ?? 0, 0, 1200, 'px',
        async (v) => {
          cfg.floatingToolbarWidth = v
          await context.saveData('desktopFeatureConfig', context.desktopFeatureConfig)
          context.applyDesktopToolbarPosition()
        }
      ))

      // 毛玻璃 / 实心 样式选择（radio 二选一，复用上面的卡片样式）
      const styleModeRow = document.createElement('div')
      styleModeRow.style.cssText = 'display: flex; flex-direction: column; gap: 6px;'
      const styleModeLabel = document.createElement('label')
      styleModeLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface);'
      styleModeLabel.textContent = '胶囊样式'
      styleModeRow.appendChild(styleModeLabel)

      const styleModeContainer = document.createElement('div')
      styleModeContainer.style.cssText = 'display: flex; gap: 8px;'
      const currentStyleMode = cfg.floatingToolbarStyle === 'solid' ? 'solid' : 'glass'
      const styleModeOptions = [
        { value: 'glass', label: '毛玻璃（半透明）' },
        { value: 'solid', label: '实心（跟随主题）' },
      ]
      const styleModeRadios: HTMLInputElement[] = []
      const styleModeOptionEls: HTMLElement[] = []
      styleModeOptions.forEach(opt => {
        const optEl = document.createElement('div')
        optEl.style.cssText = `
          display: flex; align-items: center; gap: 6px; padding: 6px 10px;
          border: 1px solid ${currentStyleMode === opt.value ? 'var(--b3-theme-primary)' : 'var(--b3-border-color)'};
          border-radius: 6px; cursor: pointer;
          background: ${currentStyleMode === opt.value ? 'rgba(66, 133, 244, 0.08)' : 'transparent'};
          flex: 1;
        `
        const radio = document.createElement('input')
        radio.type = 'radio'
        radio.name = 'desktop-floating-style'
        radio.value = opt.value
        radio.checked = currentStyleMode === opt.value
        styleModeRadios.push(radio)
        styleModeOptionEls.push(optEl)
        const lbl = document.createElement('span')
        lbl.textContent = opt.label
        lbl.style.cssText = 'font-size: 13px;'
        optEl.appendChild(radio)
        optEl.appendChild(lbl)
        styleModeContainer.appendChild(optEl)
      })
      styleModeRadios.forEach((r, i) => {
        styleModeOptionEls[i].onclick = async () => {
          r.checked = true
          styleModeOptionEls.forEach((el, j) => {
            el.style.borderColor = styleModeRadios[j].checked ? 'var(--b3-theme-primary)' : 'var(--b3-border-color)'
            el.style.background = styleModeRadios[j].checked ? 'rgba(66, 133, 244, 0.08)' : 'transparent'
          })
          cfg.floatingToolbarStyle = r.value as 'glass' | 'solid'
          await context.saveData('desktopFeatureConfig', context.desktopFeatureConfig)
          context.applyDesktopToolbarPosition()
        }
      })
      styleModeRow.appendChild(styleModeContainer)
      floatingSection.appendChild(styleModeRow)

      // 滚动隐藏开关（上滑隐藏、下滑显示）
      const scrollHideRow = document.createElement('div')
      scrollHideRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 4px;'

      const scrollHideLabel = document.createElement('label')
      scrollHideLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); flex: 1;'
      scrollHideLabel.textContent = '🔄 滚动隐藏（上滑隐藏，下滑显示）'

      const scrollHideToggle = document.createElement('input')
      scrollHideToggle.type = 'checkbox'
      scrollHideToggle.className = 'b3-switch'
      scrollHideToggle.checked = cfg.floatingToolbarScrollHide === true
      scrollHideToggle.style.cssText = 'cursor: pointer;'
      scrollHideToggle.onchange = async () => {
        cfg.floatingToolbarScrollHide = scrollHideToggle.checked
        await context.saveData('desktopFeatureConfig', context.desktopFeatureConfig)
        context.applyDesktopToolbarPosition()
      }

      scrollHideRow.appendChild(scrollHideLabel)
      scrollHideRow.appendChild(scrollHideToggle)
      floatingSection.appendChild(scrollHideRow)

      // 在记事弹窗（块格式）中隐藏底部胶囊
      const qnHideRow = document.createElement('div')
      qnHideRow.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 4px 0;'
      const qnHideLabel = document.createElement('label')
      qnHideLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); flex: 1;'
      qnHideLabel.textContent = '📝 记事弹窗中隐藏底部胶囊'
      const qnHideToggle = document.createElement('input')
      qnHideToggle.type = 'checkbox'
      qnHideToggle.className = 'b3-switch'
      qnHideToggle.checked = cfg.quickNoteHideFloatingToolbar !== false
      qnHideToggle.style.cssText = 'cursor: pointer;'
      qnHideToggle.onchange = async () => {
        cfg.quickNoteHideFloatingToolbar = qnHideToggle.checked
        await context.saveData('desktopFeatureConfig', context.desktopFeatureConfig)
      }
      qnHideRow.appendChild(qnHideLabel)
      qnHideRow.appendChild(qnHideToggle)
      floatingSection.appendChild(qnHideRow)

      toolbarBox.appendChild(floatingSection)

      container.appendChild(toolbarBox)

      // 小功能选择模块框
      const featureBox = document.createElement('div')
      featureBox.style.cssText = `
        border: 2px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-surface);
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      `

      // 模块标题
      const featureTitle = document.createElement('div')
      featureTitle.style.cssText = `
        font-size: 16px;
        font-weight: 700;
        color: var(--b3-theme-primary);
        padding-bottom: 8px;
        border-bottom: 1px solid var(--b3-border-color);
        margin-bottom: 4px;
        text-align: center;
      `
      featureTitle.textContent = '电脑端小功能选择⚙️'
      featureBox.appendChild(featureTitle)

      // 说明文字
      const featureHint = document.createElement('div')
      featureHint.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); padding: 10px 12px; background: var(--b3-theme-primary-lightest); border-radius: 6px; line-height: 1.5;'
      featureHint.innerHTML = '💡 调整电脑端的图标隐藏设置'
      featureBox.appendChild(featureHint)

      featureBox.appendChild(createSwitchItem('①面包屑图标隐藏', context.desktopFeatureConfig.hideBreadcrumbIcon, (v) => {
        context.desktopFeatureConfig.hideBreadcrumbIcon = v
      }))

      featureBox.appendChild(createSwitchItem('②锁定编辑按钮隐藏', context.desktopFeatureConfig.hideReadonlyButton, (v) => {
        context.desktopFeatureConfig.hideReadonlyButton = v
      }))

      featureBox.appendChild(createSwitchItem('③文档菜单按钮隐藏', context.desktopFeatureConfig.hideDocMenuButton, (v) => {
        context.desktopFeatureConfig.hideDocMenuButton = v
      }))

      featureBox.appendChild(createSwitchItem('④更多按钮隐藏', context.desktopFeatureConfig.hideMoreButton, (v) => {
        context.desktopFeatureConfig.hideMoreButton = v
      }))

      container.appendChild(featureBox)

      container.appendChild(createDesktopQuickNoteSettingsSection({
        mobileFeatureConfig: context.mobileFeatureConfig as Record<string, unknown>,
        desktopFeatureConfig: context.desktopFeatureConfig,
        isAuthorToolActivated: context.isAuthorToolActivated,
        saveMobileConfig: () => context.saveData('mobileFeatureConfig', context.mobileFeatureConfig),
        saveDesktopConfig: () => context.saveData('desktopFeatureConfig', context.desktopFeatureConfig),
        createSwitchItem,
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
      dangerLabel.textContent = '⚠️ 电脑端完全恢复思源原始状态'

      const dangerSwitch = document.createElement('input')
      dangerSwitch.type = 'checkbox'
      dangerSwitch.className = 'b3-switch'
      dangerSwitch.checked = context.desktopFeatureConfig.disableCustomButtons
      dangerSwitch.onchange = async () => {
        context.desktopFeatureConfig.disableCustomButtons = dangerSwitch.checked
        await context.saveData('desktopFeatureConfig', context.desktopFeatureConfig)
        context.applyFeatures()
        context.refreshButtons()
      }

      dangerHeader.appendChild(dangerLabel)
      dangerHeader.appendChild(dangerSwitch)

      const dangerDesc = document.createElement('div')
      dangerDesc.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface); line-height: 1.5; opacity: 0.9;'
      dangerDesc.textContent = '💡 开启后：隐藏所有自定义按钮 + 取消所有工具栏样式修改（按钮宽度、工具栏高度、隐藏原生按钮等），让思源恢复到未安装插件时的原始状态'

      dangerItem.appendChild(dangerHeader)
      dangerItem.appendChild(dangerDesc)

      container.appendChild(dangerItem)

      return container
    }
  })

  // === 手机端配置项（电脑端也可以配置手机端按钮）===

  // 手机端自定义按钮
  setting.addItem({
    title: '手机端自定义按钮📱',
    description: `已配置 ${context.mobileButtonConfigs.length} 个按钮，点击展开编辑`,
    createActionElement: () => {
      const wrapper = document.createElement('div')
      wrapper.className = 'toolbar-customizer-content'
	      wrapper.dataset.tabGroup = 'mobile'
	      wrapper.style.cssText = 'display: flex; flex-direction: column; gap: 8px; width: 100%;'

	      // 提示：电脑端的手机配置仅展示部分功能
	      const mobileNotice = document.createElement('div')
		      mobileNotice.style.cssText = `
		        font-size: 13px; color: #a855f7; background: color-mix(in srgb, #a855f7 8%, transparent);
		        border: 1px solid color-mix(in srgb, #a855f7 20%, transparent); border-radius: 6px;
		        padding: 10px 12px; text-align: center;
		      `
		      mobileNotice.textContent = '注意：电脑端和手机端完全独立、互不影响；此部分仅展示手机端20%的功能，请同步至手机端后，使用手机端插件设置的剩余80%功能：一键记事弹窗、朗读、批注等等'
	      wrapper.appendChild(mobileNotice)

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
            mobileButtonConfigs: context.mobileButtonConfigs,
            recalculateOverflow: () => {
              // 电脑端编辑手机端按钮时，被 calculateButtonOverflow 模拟 375px 宽度计算分层
              const overflowBtn = context.mobileButtonConfigs.find((b: any) => b.id === 'overflow-button-mobile')
              const overflowLayers = (overflowBtn && overflowBtn.enabled !== false) ? (overflowBtn.layers || 1) : 0
              // 模拟典型手机宽度 375px，使按钮能分配到正确的扩展层
              const updated = calculateButtonOverflow(context.mobileButtonConfigs, overflowLayers, 0, 375)
              updated.forEach((btn: any) => {
                const original = context.mobileButtonConfigs.find((b: any) => b.id === btn.id)
                if (original) original.overflowLevel = btn.overflowLevel
              })
            }
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
        // 同步刷新工具栏预览（反映卡片列表里的删除/启用禁用/图标改动）
        previewEl?.refresh()
      }

      const addBtn = document.createElement('button')
      addBtn.className = 'b3-button b3-button--outline'
      addBtn.style.cssText = 'width: 100%; margin-bottom: 12px; padding: 10px; border-radius: 6px; font-size: 14px;'
      addBtn.textContent = '+ 添加新按钮'
      addBtn.onclick = () => {
        const newButtonIndex = context.mobileButtonConfigs.length + 1
        const newButton: ButtonConfig = {
          id: `button_${Date.now()}`,
          name: `新按钮${newButtonIndex}`,
          type: 'builtin',
          builtinId: 'menuSearch',
          icon: '♥️',
          iconSize: 18,
          minWidth: 32,
          marginRight: 8,
          sort: newButtonIndex,
          platform: 'both',
          showNotification: true,
          enabled: true
        }
        context.mobileButtonConfigs.push(newButton)
        lastAddedButtonId = newButton.id
        renderList()
      }

      // 手机端工具栏预览（这里虽在电脑端设置面板内，但操作的是 mobileButtonConfigs，用手机端样式）
      let previewEl: any = null
      try {
	        previewEl = createToolbarPreview({
	          getButtons: () => context.mobileButtonConfigs,
	          isMobile: true,
	          isTopMode: context.mobileConfig?.enableTopToolbar,
	          onChanged: renderList,
	        })
      } catch (e) {
        console.error('[MobilePreview] 创建预览失败:', e)
        const errEl = document.createElement('div')
        errEl.style.cssText = 'color:var(--b3-card-error-color);font-size:12px;padding:8px;'
        errEl.textContent = '⚠️ 工具栏预览加载失败，请检查控制台错误'
        wrapper.appendChild(errEl)
      }

	      renderList()
      if (previewEl) {
        wrapper.appendChild(previewEl)
        // previewEl 已挂载到 DOM，刷新使缩放计算（依赖 clientWidth）生效
        previewEl.refresh()
      }
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
        await context.saveData('mobileToolbarConfig', context.mobileConfig)
      }

      toggleRow.appendChild(toggleLabel)
      toggleRow.appendChild(toggle)
      container.appendChild(toggleRow)

      return container
    }
  })
}
