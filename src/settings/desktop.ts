/**
 * 电脑端设置模块
 * 处理电脑端思源手机端增强的设置界面
 */

import { validateActivationCode } from '../utils/activationCodeValidator'

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
  desktopFeatureConfig: FeatureConfig
  mobileFeatureConfig: FeatureConfig
  mobileConfig: any
  version?: string
  isAuthorToolActivated: () => boolean
  showConfirmDialog: (message: string) => Promise<boolean>
  showIconPicker: (currentValue: string, onSelect: (icon: string) => void, iconSize?: number) => void
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
  // 预先注入样式：隐藏非 desktop 标签的配置项
  // 这样可以避免打开设置时的闪烁（先显示全部，然后隐藏部分）
  const preloadStyle = document.createElement('style')
  preloadStyle.id = 'toolbar-customizer-preload-hide'
  preloadStyle.textContent = `
    .b3-dialog__content .config__item {
      display: none !important;
    }
    .b3-dialog__content .config__item[data-tab-group="desktop"] {
      display: block !important;
    }
  `
  document.head.appendChild(preloadStyle)


  // 更新、Q群、激活码获取
  setting.addItem({
    title: '🔍 更新、Q群、激活码获取',
    description: '思源手机端增强插件信息',
    createActionElement: () => {
      const container = document.createElement('div')
      container.className = 'toolbar-customizer-content'
      container.dataset.tabGroup = 'version'
      container.style.cssText = 'display: flex; flex-direction: column; gap: 12px; padding: 16px; background: var(--b3-theme-background); border-radius: 8px;'

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
      qqLink.href = 'https://qm.qq.com/cgi-bin/qm/qr?k=1018010924&jump_from=webapi'
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
      
      
            
      // 鲸鱼定制工具箱整体框
      const whaleToolboxContainer = document.createElement('div')
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
          // 隐藏重新激活按钮
          reActivateBtn.style.display = 'none'
        }
        statusContainer.appendChild(reActivateBtn)
      }
      
      statusContainer.appendChild(activationStatus)
            
      activationHeader.appendChild(activationLabel)
      activationHeader.appendChild(statusContainer)
            
      const activationDesc = document.createElement('div')
      activationDesc.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface); line-height: 1.5; opacity: 0.9;'
      activationDesc.textContent = '💡 输入激活码后可解锁「⑥鲸鱼定制工具箱」功能类型。若想获得激活码，请进QQ群1018010924咨询群主！'
            
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
        if (validateActivationCode(code)) {
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
      
      // 根据激活状态决定是否显示输入框和验证按钮
      if (context.isAuthorToolActivated()) {
        activationInputRow.style.display = 'none'  // 激活后隐藏输入框和验证按钮
      }
            
      activationItem.appendChild(activationHeader)
      activationItem.appendChild(activationDesc)
      activationItem.appendChild(activationInputRow)
      
      whaleToolboxContainer.appendChild(activationItem)
            
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
        <div style="font-size: 14px; color: var(--b3-theme-primary); margin-bottom: 12px; font-weight: 600;">🐋 鲸鱼定制工具箱功能列表</div>
        <div style="font-size: 12px; color: var(--b3-theme-on-surface); margin-bottom: 12px; line-height: 1.6;">激活后即可使用以下高级功能，让你的思源笔记效率翻倍：</div>
        <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
          <thead>
            <tr style="background: var(--b3-theme-primary-lightest);">
              <th style="padding: 10px; text-align: center; border-bottom: 2px solid var(--b3-border-color); width: 36px;">序号</th>
              <th style="padding: 10px; text-align: left; border-bottom: 2px solid var(--b3-border-color);">功能名称</th>
              <th style="padding: 10px; text-align: left; border-bottom: 2px solid var(--b3-border-color);">功能说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 10px 4px; border-bottom: 1px solid var(--b3-border-color); text-align: center; color: var(--b3-theme-primary); font-weight: 500;">①</td>
              <td style="padding: 10px; border-bottom: 1px solid var(--b3-border-color); font-weight: 500;">连续点击自定义按钮</td>
              <td style="padding: 10px; border-bottom: 1px solid var(--b3-border-color); color: var(--b3-theme-on-surface);">一键自动执行多个按钮操作，告别重复点击，工作流自动化</td>
            </tr>
            <tr style="background: var(--b3-theme-background);">
              <td style="padding: 10px 4px; border-bottom: 1px solid var(--b3-border-color); text-align: center; color: var(--b3-theme-primary); font-weight: 500;">②</td>
              <td style="padding: 10px; border-bottom: 1px solid var(--b3-border-color); font-weight: 500;">打开指定ID块</td>
              <td style="padding: 10px; border-bottom: 1px solid var(--b3-border-color); color: var(--b3-theme-on-surface);">瞬间跳转到任意文档任意位置，精准定位，省时省力</td>
            </tr>
            <tr>
              <td style="padding: 10px 4px; border-bottom: 1px solid var(--b3-border-color); text-align: center; color: var(--b3-theme-primary); font-weight: 500;">③</td>
              <td style="padding: 10px; border-bottom: 1px solid var(--b3-border-color); font-weight: 500;">数据库悬浮弹窗</td>
              <td style="padding: 10px; border-bottom: 1px solid var(--b3-border-color); color: var(--b3-theme-on-surface);">悬浮窗口快速查看数据库，无需切换页面，数据触手可及</td>
            </tr>
            <tr style="background: var(--b3-theme-background);">
              <td style="padding: 10px 4px; border-bottom: 1px solid var(--b3-border-color); text-align: center; color: var(--b3-theme-primary); font-weight: 500;">④</td>
              <td style="padding: 10px; border-bottom: 1px solid var(--b3-border-color); font-weight: 500;">日记底部</td>
              <td style="padding: 10px; border-bottom: 1px solid var(--b3-border-color); color: var(--b3-theme-on-surface);">一键直达日记末尾，快速追加内容，记录生活点滴</td>
            </tr>
            <tr>
              <td style="padding: 10px 4px; border-bottom: 1px solid var(--b3-border-color); text-align: center; color: var(--b3-theme-primary); font-weight: 500;">⑤</td>
              <td style="padding: 10px; border-bottom: 1px solid var(--b3-border-color); font-weight: 500;">叶归LifeLog适配</td>
              <td style="padding: 10px; border-bottom: 1px solid var(--b3-border-color); color: var(--b3-theme-on-surface);">与LifeLog插件深度整合，时间记录更智能，生活管理更高效</td>
            </tr>
            <tr style="background: var(--b3-theme-background);">
              <td style="padding: 10px 4px; border-bottom: 1px solid var(--b3-border-color); text-align: center; color: var(--b3-theme-primary); font-weight: 500;">⑥</td>
              <td style="padding: 10px; border-bottom: 1px solid var(--b3-border-color); font-weight: 500;">弹窗框模板选择</td>
              <td style="padding: 10px; border-bottom: 1px solid var(--b3-border-color); color: var(--b3-theme-on-surface);">弹出式模板选择器，快速插入常用内容，写作效率倍增</td>
            </tr>
            <tr>
              <td style="padding: 10px 4px; border-bottom: 1px solid var(--b3-border-color); text-align: center; color: var(--b3-theme-primary); font-weight: 500;">⑦</td>
              <td style="padding: 10px; border-bottom: 1px solid var(--b3-border-color); font-weight: 500;">滚动文档顶部或底部</td>
              <td style="padding: 10px; border-bottom: 1px solid var(--b3-border-color); color: var(--b3-theme-on-surface);">一键直达文档首尾，长文档浏览更轻松，阅读体验升级</td>
            </tr>
            <tr style="background: var(--b3-theme-background);">
              <td style="padding: 10px 4px; text-align: center; color: var(--b3-theme-primary); font-weight: 500;">⑧</td>
              <td style="padding: 10px; font-weight: 500;">持续更新中</td>
              <td style="padding: 10px; color: var(--b3-theme-on-surface);">更多实用功能开发中，欢迎进群提出你的定制需求</td>
            </tr>
          </tbody>
        </table>
      `
      whaleToolboxContainer.appendChild(whaleFunctionListContainer)
            
      container.appendChild(whaleToolboxContainer)
            
      // 功能说明框
      const featureBox = document.createElement('div')
      featureBox.style.cssText = 'padding: 16px; margin-top: 16px; border: 1px solid var(--b3-border-color); border-radius: 6px;'
            
      const featureTitle = document.createElement('div')
      featureTitle.style.cssText = 'font-size: 16px; font-weight: bold; color: #722ed1; margin-bottom: 12px;'
      featureTitle.textContent = '《鲸鱼定制工具箱》功能说明：'
            
      const featureMethod1 = document.createElement('div')
      featureMethod1.style.cssText = 'font-size: 14px; color: var(--b3-theme-on-background); margin-bottom: 8px;'
      featureMethod1.textContent = '1. 所有作者、个人的定制化需求，均会加入到工具箱。'
            
      const featureMethod2 = document.createElement('div')
      featureMethod2.style.cssText = 'font-size: 14px; color: var(--b3-theme-on-background); margin-bottom: 8px;'
      featureMethod2.textContent = '2. 核心功能：开箱即用！除基础配置外，无需折腾！'
            
      const featureMethod3 = document.createElement('div')
      featureMethod3.style.cssText = 'font-size: 14px; color: var(--b3-theme-on-background;'
      featureMethod3.textContent = '3. 本插件的免费功能，已经占据95%，如果您仍然需要单独定制功能，请私聊作者，为您私人定制！完成后，按钮将加入工具箱。'
            
      featureBox.appendChild(featureTitle)
      featureBox.appendChild(featureMethod1)
      featureBox.appendChild(featureMethod2)
      featureBox.appendChild(featureMethod3)
            
      container.appendChild(featureBox)
            
      // 激活码方案与权益说明框（移到功能说明框下面）
      const activationBox = document.createElement('div')
      activationBox.style.cssText = 'padding: 16px; margin-top: 16px; border: 1px solid var(--b3-border-color); border-radius: 6px;'
                  
      const activationTitle = document.createElement('div')
      activationTitle.style.cssText = 'font-size: 20px; font-weight: bold; color: #722ed1; margin-bottom: 16px; text-align: center; text-shadow: 1px 1px 2px rgba(0,0,0,0.1);'
      activationTitle.textContent = '激活码方案与权益说明'
      activationBox.appendChild(activationTitle)
                  
      // 正价支持方案
      const regularSection = document.createElement('div')
      regularSection.style.cssText = 'margin-bottom: 20px; padding: 12px; background: rgba(82, 196, 26, 0.05); border-radius: 6px; border-left: 3px solid #52c41a;'
                  
      const regularTitle = document.createElement('div')
      regularTitle.style.cssText = 'font-size: 16px; font-weight: bold; color: #52c41a; margin-bottom: 10px;'
      regularTitle.textContent = '1️⃣ 正价支持方案（原价 99 元）'
      regularSection.appendChild(regularTitle)
                  
      const regularContent = document.createElement('div')
      regularContent.style.cssText = 'font-size: 14px; color: var(--b3-theme-on-background); line-height: 1.6;'
      regularContent.innerHTML = `
        <div style="margin-bottom: 8px;"><strong>包含内容：</strong></div>
        <div style="margin-bottom: 6px;">• <strong>永久激活码（电脑、手机均可用）</strong></div>
        <div style="margin-bottom: 6px;">• <strong>无限次自动化代码实现（作者帮写）</strong></div>
        <div style="margin-left: 16px; margin-bottom: 6px; font-size: 13px;">• 对应功能：⑤ 自动化模拟点击（高难度功能）</div>
        <div style="margin-bottom: 6px;">• <strong>1 次定制化需求（作者实现）</strong></div>
        <div style="margin-left: 16px; margin-bottom: 4px; font-size: 13px;">• 功能可使用您的名字命名</div>
        <div style="margin-left: 16px; font-size: 13px;">• 根据需求，作者在能力与合理范围内进行评估，尽最大可能满足！</div>
      `
      regularSection.appendChild(regularContent)
      activationBox.appendChild(regularSection)
                  
      // 限时优惠方案
      const discountSection = document.createElement('div')
      discountSection.style.cssText = 'margin-bottom: 20px; padding: 12px; background: rgba(255, 107, 53, 0.05); border-radius: 6px; border-left: 3px solid #ff6b35;'
                  
      const discountTitle = document.createElement('div')
      discountTitle.style.cssText = 'font-size: 16px; font-weight: bold; color: #ff6b35; margin-bottom: 10px;'
      discountTitle.textContent = '2️⃣ 限时优惠方案（限量 50 个，送完即止）'
      discountSection.appendChild(discountTitle)
                  
      // 普通优惠
      const normalDiscount = document.createElement('div')
      normalDiscount.style.cssText = 'margin-bottom: 12px; padding: 8px; background: rgba(255, 107, 53, 0.1); border-radius: 4px;'
      normalDiscount.innerHTML = `
        <div style="font-size: 15px; font-weight: bold; color: #ff6b35; margin-bottom: 6px;">① 普通优惠价：19.8 元（2 折）</div>
        <div style="font-size: 13px; color: var(--b3-theme-on-background); margin-bottom: 4px;">• <strong>永久激活码（电脑、手机均可用）</strong></div>
        <div style="font-size: 13px; color: var(--b3-theme-on-background); margin-bottom: 4px;">• <strong>1 次自动化代码实现（作者帮写）</strong></div>
        <div style="margin-left: 16px; font-size: 12px;">• 对应功能：⑤ 自动化模拟点击（高难度功能）</div>
      `
      discountSection.appendChild(normalDiscount)
                  
      // 学生优惠
      const studentDiscount = document.createElement('div')
      studentDiscount.style.cssText = 'padding: 8px; background: rgba(255, 107, 53, 0.1); border-radius: 4px;'
      studentDiscount.innerHTML = `
        <div style="font-size: 15px; font-weight: bold; color: #ff6b35; margin-bottom: 6px;">② 学生优惠价：9.9 元（1 折）</div>
        <div style="font-size: 13px; color: var(--b3-theme-on-background); margin-bottom: 4px;">• <strong>永久激活码（电脑、手机均可用）</strong></div>
        <div style="font-size: 13px; color: var(--b3-theme-on-background);">• 备注：进群私聊群主，<strong>简单提供可证明学生身份的信息</strong></div>
      `
      discountSection.appendChild(studentDiscount)
      activationBox.appendChild(discountSection)
                  
      // 免费获取方案
      const freeSection = document.createElement('div')
      freeSection.style.cssText = 'margin-bottom: 16px; padding: 12px; background: rgba(24, 144, 255, 0.05); border-radius: 6px; border-left: 3px solid #1890ff;'
                  
      const freeTitle = document.createElement('div')
      freeTitle.style.cssText = 'font-size: 16px; font-weight: bold; color: #1890ff; margin-bottom: 8px;'
      freeTitle.textContent = '3️⃣ 免费获取方案'
      freeSection.appendChild(freeTitle)
                  
      const freeContent = document.createElement('div')
      freeContent.style.cssText = 'font-size: 14px; color: var(--b3-theme-on-background); line-height: 1.6;'
      freeContent.innerHTML = `
        <div style="margin-bottom: 6px;">1. 如果您只是想进群交流、体验功能或观望插件发展方向，也非常欢迎进群沟通交流～我会不定期随缘赠送激活码。</div>
        <div>2. 对于在群聊中活跃度较高的小伙伴，我会视情况赠送永久激活码。</div>
      `
      freeSection.appendChild(freeContent)
      activationBox.appendChild(freeSection)
                  
      // 说明
      const noticeSection = document.createElement('div')
      noticeSection.style.cssText = 'padding: 12px; background: rgba(114, 46, 209, 0.05); border-radius: 6px; border-left: 3px solid #722ed1;'
                  
      const noticeTitle = document.createElement('div')
      noticeTitle.style.cssText = 'font-size: 16px; font-weight: bold; color: #722ed1; margin-bottom: 12px;'
      noticeTitle.textContent = '说明'
      noticeSection.appendChild(noticeTitle)
                  
      const noticeList = document.createElement('div')
      noticeList.style.cssText = 'font-size: 14px; color: var(--b3-theme-on-background); line-height: 1.6;'
      noticeList.innerHTML = `
        <div style="margin-bottom: 8px;">1. 👇打赏支持后，进群私聊作者获取激活码；相关权益也均在群聊中@作者实现。</div>
        <div>2. 后续随着《鲸鱼定制工具箱》功能持续增加、复杂度提升，是否推出新的优惠或调整获取规则，将视情况而定，如有变化，会提前在群内说明。</div>
      `
      noticeSection.appendChild(noticeList)
      activationBox.appendChild(noticeSection)
            
      container.appendChild(activationBox)
            
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
            saveData: context.saveData
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
            recalculateOverflow: () => {}
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
