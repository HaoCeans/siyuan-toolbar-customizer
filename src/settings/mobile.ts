/**
 * 手机端设置模块
 * 处理手机端思源手机端增强的设置界面
 */

import { validateActivationCode } from '../utils/activationCodeValidator'

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
  quickNoteInsertPosition?: 'top' | 'bottom'  // 一键记事插入位置：顶部/底部
  // 一键记事按钮样式配置
  useCustomButtonStyle?: boolean    // 是否使用自定义按钮样式
  quickNoteButtonMinWidth?: number  // 按钮自身宽度
  quickNoteButtonMargin?: number    // 按钮自身外边距
  quickNoteButtonPadding?: number   // 按钮内容的内边距
  quickNoteButtonGap?: number       // 按钮之间的间距
  // 工具栏样式配置
  toolbarStyle?: 'default' | 'divider'  // 工具栏样式：默认或带分割线
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
  showIconPicker: (currentValue: string, onSelect: (icon: string) => void, iconSize?: number) => void
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
  // === 自定义滑杆组件 ===
  const createCustomSlider = (
    labelText: string,
    initialValue: number,
    min: number,
    max: number,
    unit: string,
    onSave: (value: number) => Promise<void>
  ): HTMLElement => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; align-items: center; gap: 12px; width: 100%; padding: 4px 0;';

    const label = document.createElement('span');
    label.textContent = labelText;
    label.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); min-width: 70px;';

    // 滑杆容器 - 更大以容纳滑块
    const sliderContainer = document.createElement('div');
    sliderContainer.style.cssText = `
      position: relative;
      flex: 1;
      height: 20px;
      display: flex;
      align-items: center;
    `;

    // 轨道背景
    const track = document.createElement('div');
    track.style.cssText = `
      position: absolute;
      left: 0;
      right: 0;
      height: 6px;
      background: var(--b3-theme-background);
      border: 1px solid var(--b3-theme-border);
      border-radius: 3px;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
    `;

    // 进度条（已填充部分）
    const progress = document.createElement('div');
    const percent = ((initialValue - min) / (max - min)) * 100;
    progress.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      width: ${percent}%;
      background: linear-gradient(to bottom, var(--b3-theme-primary) 0%, var(--b3-theme-primary) 100%);
      border-radius: 3px 0 0 3px;
    `;

    // 滑块圆圈
    const thumb = document.createElement('div');
    thumb.style.cssText = `
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      left: ${percent}%;
      width: 18px;
      height: 18px;
      background: linear-gradient(135deg, #ffffff 0%, #f0f0f0 100%);
      border: 2px solid var(--b3-theme-primary);
      border-radius: 50%;
      cursor: grab;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25), 0 1px 2px rgba(0, 0, 0, 0.15);
      transition: transform 0.15s ease-out, box-shadow 0.15s ease-out;
      touch-action: none;
      z-index: 10;
    `;

    // 值显示
    const valueDisplay = document.createElement('span');
    valueDisplay.textContent = `${initialValue}${unit}`;
    valueDisplay.style.cssText = 'min-width: 50px; text-align: right; font-size: 13px; color: var(--b3-theme-on-surface); font-variant-numeric: tabular-nums; font-weight: 500;';

    // 拖动逻辑
    let isDragging = false;
    let sliderRect = null;
    let currentValue = initialValue;

    const updateSlider = (clientX: number) => {
      if (!sliderRect) return;

      const newPercent = Math.max(0, Math.min(1, (clientX - sliderRect.left) / sliderRect.width));
      const newValue = Math.round(min + newPercent * (max - min));

      thumb.style.left = `${newPercent * 100}%`;
      progress.style.width = `${newPercent * 100}%`;
      valueDisplay.textContent = `${newValue}${unit}`;
      currentValue = newValue;

      return newValue;
    };

    const handlePointerDown = (e: PointerEvent) => {
      isDragging = true;
      sliderRect = sliderContainer.getBoundingClientRect();
      thumb.style.cursor = 'grabbing';
      thumb.style.transform = 'translate(-50%, -50%) scale(1.15)';
      thumb.style.boxShadow = '0 3px 8px rgba(0, 0, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.2)';
      e.preventDefault();

      const moveHandler = (e: PointerEvent) => {
        if (isDragging) {
          updateSlider(e.clientX);
        }
      };

      const upHandler = async () => {
        if (isDragging) {
          isDragging = false;
          thumb.style.cursor = 'grab';
          thumb.style.transform = 'translate(-50%, -50%)';
          thumb.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.25), 0 1px 2px rgba(0, 0, 0, 0.15)';
          await onSave(currentValue);
        }
        document.removeEventListener('pointermove', moveHandler);
        document.removeEventListener('pointerup', upHandler);
        document.removeEventListener('pointercancel', upHandler);
      };

      document.addEventListener('pointermove', moveHandler);
      document.addEventListener('pointerup', upHandler);
      document.addEventListener('pointercancel', upHandler);
    };

    thumb.addEventListener('pointerdown', handlePointerDown);

    // 触摸支持
    thumb.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      handlePointerDown(new PointerEvent('pointerdown', {
        clientX: touch.clientX,
        clientY: touch.clientY,
        bubbles: true,
        cancelable: true
      }));
    });

    // 添加元素到容器
    sliderContainer.appendChild(track);
    sliderContainer.appendChild(progress);
    sliderContainer.appendChild(thumb);
    container.appendChild(label);
    container.appendChild(sliderContainer);
    container.appendChild(valueDisplay);

    return container;
  };



  // === 无标签滑杆创建函数 ===
  const createCustomSliderWithoutLabel = (
    initialValue: number,
    min: number,
    max: number,
    unit: string,
    onSave: (value: number) => Promise<void>
  ): HTMLElement => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; align-items: center; gap: 12px; width: 100%; padding: 4px 0;';

    // 滑杆容器 - 更大以容纳滑块
    const sliderContainer = document.createElement('div');
    sliderContainer.style.cssText = `
      position: relative;
      flex: 1;
      height: 20px;
      display: flex;
      align-items: center;
    `;

    // 轨道背景
    const track = document.createElement('div');
    track.style.cssText = `
      position: absolute;
      left: 0;
      right: 0;
      height: 6px;
      background: var(--b3-theme-background);
      border: 1px solid var(--b3-theme-border);
      border-radius: 3px;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
    `;

    // 进度条（已填充部分）
    const progress = document.createElement('div');
    const percent = ((initialValue - min) / (max - min)) * 100;
    progress.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      width: ${percent}%;
      background: linear-gradient(to bottom, var(--b3-theme-primary) 0%, var(--b3-theme-primary) 100%);
      border-radius: 3px 0 0 3px;
    `;

    // 滑块圆圈
    const thumb = document.createElement('div');
    thumb.style.cssText = `
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      left: ${percent}%;
      width: 18px;
      height: 18px;
      background: linear-gradient(135deg, #ffffff 0%, #f0f0f0 100%);
      border: 2px solid var(--b3-theme-primary);
      border-radius: 50%;
      cursor: grab;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25), 0 1px 2px rgba(0, 0, 0, 0.15);
      transition: transform 0.15s ease-out, box-shadow 0.15s ease-out;
      touch-action: none;
      z-index: 10;
    `;

    // 值显示
    const valueDisplay = document.createElement('span');
    valueDisplay.textContent = `${initialValue}${unit}`;
    valueDisplay.style.cssText = 'min-width: 50px; text-align: right; font-size: 13px; color: var(--b3-theme-on-surface); font-variant-numeric: tabular-nums; font-weight: 500;';

    // 拖动逻辑
    let isDragging = false;
    let sliderRect = null;
    let currentValue = initialValue;

    const updateSlider = (clientX: number) => {
      if (!sliderRect) return;

      const newPercent = Math.max(0, Math.min(1, (clientX - sliderRect.left) / sliderRect.width));
      const newValue = Math.round(min + newPercent * (max - min));

      thumb.style.left = `${newPercent * 100}%`;
      progress.style.width = `${newPercent * 100}%`;
      valueDisplay.textContent = `${newValue}${unit}`;
      currentValue = newValue;

      return newValue;
    };

    const handlePointerDown = (e: PointerEvent) => {
      isDragging = true;
      sliderRect = sliderContainer.getBoundingClientRect();
      thumb.style.cursor = 'grabbing';
      thumb.style.transform = 'translate(-50%, -50%) scale(1.15)';
      thumb.style.boxShadow = '0 3px 8px rgba(0, 0, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.2)';
      e.preventDefault();

      const moveHandler = (e: PointerEvent) => {
        if (isDragging) {
          updateSlider(e.clientX);
        }
      };

      const upHandler = async () => {
        if (isDragging) {
          isDragging = false;
          thumb.style.cursor = 'grab';
          thumb.style.transform = 'translate(-50%, -50%)';
          thumb.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.25), 0 1px 2px rgba(0, 0, 0, 0.15)';
          await onSave(currentValue);
        }
        document.removeEventListener('pointermove', moveHandler);
        document.removeEventListener('pointerup', upHandler);
        document.removeEventListener('pointercancel', upHandler);
      };

      document.addEventListener('pointermove', moveHandler);
      document.addEventListener('pointerup', upHandler);
      document.addEventListener('pointercancel', upHandler);
    };

    thumb.addEventListener('pointerdown', handlePointerDown);

    // 触摸支持
    thumb.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      handlePointerDown(new PointerEvent('pointerdown', {
        clientX: touch.clientX,
        clientY: touch.clientY,
        bubbles: true,
        cancelable: true
      }));
    });

    // 添加元素到容器
    sliderContainer.appendChild(track);
    sliderContainer.appendChild(progress);
    sliderContainer.appendChild(thumb);
    container.appendChild(sliderContainer);
    container.appendChild(valueDisplay);

    return container;
  };

  // === 分组标题样式 ===
  const createGroupTitle = (icon: string, title: string, id?: string) => {
    setting.addItem({
      title: '',
      description: '',
      createActionElement: () => {
        const wrapper = document.createElement('div')
        wrapper.style.cssText = `
          margin: 0 -16px;
          width: calc(100% + 32px);
        `
        const titleEl = document.createElement('div')
        if (id) {
          titleEl.id = id
        }
        titleEl.style.cssText = `
          padding: 16px;
          font-size: 16px;
          font-weight: 700;
          color: #6a1b9a;
          background: #f3e5f5;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: 8px;
        `
        titleEl.innerHTML = `<span style="font-size: 20px;">${icon}</span><span style="font-size: 17px;">${title}</span>`
        wrapper.appendChild(titleEl)
        return wrapper
      }
    })
  }

  // === 说明文字样式 ===
  const createNotice = (content: string) => {
    setting.addItem({
      title: '',
      description: '',
      createActionElement: () => {
        const wrapper = document.createElement('div')
        wrapper.style.cssText = `
          margin: 0 -16px;
          width: calc(100% + 32px);
        `
        const container = document.createElement('div')
        container.style.cssText = `
          padding: 14px 18px;
          background: #ffebee;
          border: 1px solid #ffcdd2;
          border-radius: 6px;
          font-size: 16px;
          font-weight: 600;
          color: var(--b3-theme-on-surface);
          line-height: 1.6;
        `
        container.textContent = content
        wrapper.appendChild(container)
        return wrapper
      }
    })
  }

  // === 自定义按钮 ===
  createGroupTitle('📱','手机端自定义按钮')

  // 说明文字
  setting.addItem({
    title: '',
    description: '',
    createActionElement: () => {
      const wrapper = document.createElement('div')
      wrapper.style.cssText = `
        margin: 0 -16px;
        width: calc(100% + 32px);
      `
      const container = document.createElement('div')
      container.style.cssText = `
        padding: 10px 14px;
        background: #ffebee;
        border: 1px solid #ffcdd2;
        border-radius: 6px;
        font-size: 15px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
        line-height: 1.5;
      `
      container.innerHTML = '💡使用说明:<br>①点击+添加新按钮<br>②在按钮内选择6种功能<br>③点击右下角保存到工具栏<br>④按钮列表（长按拖动排序）'
      wrapper.appendChild(container)
      return wrapper
    }
  })

  setting.addItem({
    title: '',
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
            },
            saveData: context.saveData
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
        const newButtonIndex = context.buttonConfigs.length + 1
        const newButton: ButtonConfig = {
          id: `button_${Date.now()}`,
          name: `新按钮${newButtonIndex}`,
          type: 'builtin',
          builtinId: 'menuSearch',
          icon: '♥️',
          iconSize: context.mobileGlobalButtonConfig.iconSize,
          minWidth: context.mobileGlobalButtonConfig.minWidth,
          marginRight: context.mobileGlobalButtonConfig.marginRight,
          sort: newButtonIndex,
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
  createGroupTitle('1️⃣ ','全局按钮配置')

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

// 说明文字
  createNotice('📱手机端配置调整，修改后会批量应用到每个按钮配置值，单个按钮的独立配置优先级更高')

  // 全局配置启用开关（放在最前面）
  setting.addItem({
    title: '①启用全局按钮配置',
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
    title: '②图标大小 (px)',
    description: '💡 所有按钮的图标大小，建议与【按钮宽度】设置相同',
    createActionElement: () => {
      const config = context.mobileGlobalButtonConfig;
      const currentValue = config.iconSize || 16;
      
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        8,    // 最小值
        50,   // 最大值，改为50px
        'px',
        async (value) => {
          config.iconSize = value;
          // 只有启用全局配置时才批量应用到按钮
          if (config.enabled ?? true) {
            context.mobileButtonConfigs.forEach(btn => btn.iconSize = value)
            await context.saveData('mobileButtonConfigs', context.mobileButtonConfigs)
            // 重新计算溢出层级（按钮宽度可能变化）
            context.recalculateOverflow()
          }
          await context.saveData('mobileGlobalButtonConfig', config)
          Notify.showInfoIconSizeModified()
        }
      );

      // 根据全局配置启用状态设置滑杆的禁用状态
      if (!(config.enabled ?? true)) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }

      return slider;
    }
  })

  // 按钮宽度
  setting.addItem({
    title: '③按钮宽度 (px)📏',
    description: '💡 所有按钮的最小宽度，建议与【图标大小】设置相同，效果更好',
    createActionElement: () => {
      const config = context.mobileGlobalButtonConfig;
      const currentValue = config.minWidth || 32;
      
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        16,   // 最小值
        50,   // 最大值，改为50px
        'px',
        async (value) => {
          config.minWidth = value;
          // 只有启用全局配置时才批量应用到按钮
          if (config.enabled ?? true) {
            context.mobileButtonConfigs.forEach(btn => btn.minWidth = value)
            await context.saveData('mobileButtonConfigs', context.mobileButtonConfigs)
            // 重新计算溢出层级（按钮宽度变化）
            context.recalculateOverflow()
          }
          await context.saveData('mobileGlobalButtonConfig', config)
          Notify.showInfoButtonWidthModified()
        }
      );

      // 根据全局配置启用状态设置滑杆的禁用状态
      if (!(config.enabled ?? true)) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }

      return slider;
    }
  })

  // 右边距
  setting.addItem({
    title: '④右边距 (px)➡️',
    description: '💡 所有按钮的右侧边距',
    createActionElement: () => {
      const config = context.mobileGlobalButtonConfig;
      const currentValue = config.marginRight || 8;
      
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0,    // 最小值
        20,   // 最大值
        'px',
        async (value) => {
          config.marginRight = value;
          // 只有启用全局配置时才批量应用到按钮
          if (config.enabled ?? true) {
            context.mobileButtonConfigs.forEach(btn => btn.marginRight = value)
            await context.saveData('mobileButtonConfigs', context.mobileButtonConfigs)
            // 重新计算溢出层级（按钮宽度变化）
            context.recalculateOverflow()
          }
          await context.saveData('mobileGlobalButtonConfig', config)
          Notify.showInfoMarginRightModified()
        }
      );

      // 根据全局配置启用状态设置滑杆的禁用状态
      if (!(config.enabled ?? true)) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }

      return slider;
    }
  })

  // 右上角提示
  setting.addItem({
    title: '⑤右上角提示📢',
    description: '💡 所有按钮是否显示右上角提示',
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

  // === 移动端工具栏设置 ===

  // === 全局工具栏配置 ===
  createGroupTitle('2️⃣ ','全局工具栏配置')

  // 说明文字
  createNotice('📱手机端工具栏样式调整，推荐配置：40px高、分割线、跟随主题、100%')

  // 工具栏自身高度
  setting.addItem({
    title: '①工具栏自身高度',
    description: '💡设置工具栏自身的高度',
    createActionElement: () => {
      // 解析当前值，如果当前值不是数字则使用默认值
      const currentValue = parseInt(context.mobileConfig.toolbarHeight) || 40;
      
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0,    // 最小值
        100,  // 最大值，按要求设置为100px
        'px',
        async (value) => {
          context.mobileConfig.toolbarHeight = value.toString();
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
          context.applyMobileToolbarStyle();
        }
      );

      return slider;
    }
  })

  // 工具栏样式选择
  setting.addItem({
    title: '②工具栏样式选择',
    description: '💡选择工具栏的显示样式',
    createActionElement: () => {
      const container = document.createElement('div')
      container.style.cssText = 'display: flex; flex-direction: column; gap: 8px;'

      const config = context.mobileFeatureConfig as any
      const currentStyle = config.toolbarStyle || 'default'

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
      defaultRadio.name = 'toolbar-style'
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
      dividerRadio.name = 'toolbar-style'
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
        config.toolbarStyle = 'default'
        updateSelection()
        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
        // 触发自定义事件通知工具栏更新样式
        window.dispatchEvent(new CustomEvent('toolbar-style-changed', { detail: 'default' }))
      }

      dividerOption.onclick = async () => {
        dividerRadio.checked = true
        config.toolbarStyle = 'divider'
        updateSelection()
        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
        // 触发自定义事件通知工具栏更新样式
        window.dispatchEvent(new CustomEvent('toolbar-style-changed', { detail: 'divider' }))
      }

      container.appendChild(defaultOption)
      container.appendChild(dividerOption)

      return container
    }
  })

  // 工具栏背景颜色（明亮模式 + 黑暗模式）
  setting.addItem({
    title: '③工具栏背景颜色',
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
        await context.saveData('mobileToolbarConfig', context.mobileConfig)
        context.applyMobileToolbarStyle()
      }

      lightTextInput.onchange = async () => {
        const colorValue = lightTextInput.value.trim()
        if (colorValue) {
          context.mobileConfig.toolbarBackgroundColor = colorValue
          lightColorPicker.value = colorValue.startsWith('#') ? colorValue : '#f8f9fa'
          await context.saveData('mobileToolbarConfig', context.mobileConfig)
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
        await context.saveData('mobileToolbarConfig', context.mobileConfig)
        context.applyMobileToolbarStyle()
      }

      darkTextInput.onchange = async () => {
        const colorValue = darkTextInput.value.trim()
        if (colorValue) {
          context.mobileConfig.toolbarBackgroundColorDark = colorValue
          darkColorPicker.value = colorValue.startsWith('#') ? colorValue : '#1a1a1a'
          await context.saveData('mobileToolbarConfig', context.mobileConfig)
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
        await context.saveData('mobileToolbarConfig', context.mobileConfig)
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
    title: '④工具栏透明度',
    description: '💡(0=完全透明，100=完全不透明)',
    createActionElement: () => {
      const currentValue = Math.round((context.mobileConfig.toolbarOpacity ?? 1) * 100);
      return createCustomSlider(
        '透明度：',
        currentValue,
        0,
        100,
        '%',
        async (value) => {
          context.mobileConfig.toolbarOpacity = value / 100;
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
          context.applyMobileToolbarStyle();
        }
      );
    }
  })

  // 工具栏层级（共享配置）
  setting.addItem({
    title: '⑤工具栏层级',
    description: '💡值越大，越不容易被遮挡。默认5，显示在设置上层为512（顶部和底部通用）',
    createActionElement: () => {
      const currentValue = context.mobileConfig.toolbarZIndex ?? 512;
      
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0,    // 最小值
        512,  // 最大值，按要求设置为512
        '',   // 层级不需要单位
        async (value) => {
          context.mobileConfig.toolbarZIndex = value;
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
          context.applyMobileToolbarStyle();
        }
      );

      return slider;
    }
  })

  // === 工具栏位置配置（整合顶部和底部配置） ===
  createGroupTitle('3️⃣ ','工具栏位置配置')

  // 说明文字
  createNotice('📍选择📱工具栏显示位置，下方会显示对应的配置选项；默认配置已经调好，若修改，请认真阅读和理解')

  setting.addItem({
    title: '',
    description: '',
    createActionElement: () => {
      const wrapper = document.createElement('div')
      wrapper.style.cssText = `
        margin: 0 -16px;
        width: calc(100% + 32px);
      `
      const container = document.createElement('div')
      container.style.cssText = 'display: flex; gap: 24px; align-items: center; justify-content: center;'

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
        label.style.cssText = 'display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 16px; font-weight: 600;'

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

          await context.saveData('mobileToolbarConfig', context.mobileConfig)

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

          // 动态显示/隐藏整个配置分区
          document.querySelectorAll('.top-toolbar-section').forEach(el => {
            const parent = el.closest('.b3-dialog__content .config__item') as HTMLElement
            if (parent) {
              parent.style.display = isTop ? '' : 'none'
            }
          })

          document.querySelectorAll('.bottom-toolbar-section').forEach(el => {
            const parent = el.closest('.b3-dialog__content .config__item') as HTMLElement
            if (parent) {
              parent.style.display = isBottom ? '' : 'none'
            }
          })

          // 同时显示/隐藏分区下的所有配置项
          const updateSectionVisibility = (className: string, show: boolean) => {
            document.querySelectorAll(className).forEach(el => {
              const input = el as HTMLInputElement
              const item = input.closest('.b3-dialog__content .config__item') as HTMLElement
              if (item) {
                item.style.display = show ? '' : 'none'
              }
            })
          }

          updateSectionVisibility('.top-toolbar-setting', isTop)
          updateSectionVisibility('.bottom-toolbar-setting', isBottom)

          // 重新初始化工具栏
          context.updateMobileToolbar()
        }

        const text = document.createElement('span')
        text.textContent = option.label

        label.appendChild(radio)
        label.appendChild(text)
        container.appendChild(label)
      })

      // 初始化时根据当前配置设置显示状态（使用setTimeout确保DOM已渲染）
      setTimeout(() => {
        const isTop = context.mobileConfig.enableTopToolbar
        const isBottom = context.mobileConfig.enableBottomToolbar

        document.querySelectorAll('.top-toolbar-section').forEach(el => {
          const parent = el.closest('.b3-dialog__content .config__item') as HTMLElement
          if (parent) {
            parent.style.display = isTop ? '' : 'none'
          }
        })

        document.querySelectorAll('.bottom-toolbar-section').forEach(el => {
          const parent = el.closest('.b3-dialog__content .config__item') as HTMLElement
          if (parent) {
            parent.style.display = isBottom ? '' : 'none'
          }
        })

        const updateSectionVisibility = (className: string, show: boolean) => {
          document.querySelectorAll(className).forEach(el => {
            const input = el as HTMLInputElement
            const item = input.closest('.b3-dialog__content .config__item') as HTMLElement
            if (item) {
              item.style.display = show ? '' : 'none'
            }
          })
        }

        updateSectionVisibility('.top-toolbar-setting', isTop)
        updateSectionVisibility('.bottom-toolbar-setting', isBottom)
      }, 100)

      wrapper.appendChild(container)
      return wrapper
    }
  })

  // === 顶部工具栏专用配置（作为子分区） ===
  // 子分区标题项，使用思源原生的 config__item 结构
  setting.addItem({
    title: '',
    description: '',
    createActionElement: () => {
      const div = document.createElement('div')
      div.className = 'top-toolbar-section'
      div.innerHTML = '<span style="font-size: 14px; font-weight: 600; color: #3b82f6; display: flex; align-items: center; gap: 6px;"><span>⬆️</span><span>顶部工具栏配置</span></span>'
      return div
    }
  })

  setting.addItem({
    title: '①距离顶部高度',
    description: '💡顶部工具栏距离屏幕顶部的距离（仅在顶部固定时有效）',
    createActionElement: () => {
      // 解析当前值，提取数字部分
      const currentValueStr = context.mobileConfig.topToolbarOffset ?? '50px';
      const currentValue = parseInt(currentValueStr) || 50;
      
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0,    // 最小值
        100,  // 最大值，按要求设置为100px
        'px',
        async (value) => {
          context.mobileConfig.topToolbarOffset = value + 'px';
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
          context.applyMobileToolbarStyle();
        }
      );
      
      // 为滑杆添加顶部工具栏设置类名，以便动态显示/隐藏功能正常工作
      slider.classList.add('top-toolbar-setting');

      // 根据顶部工具栏启用状态设置滑杆的禁用状态
      if (!context.mobileConfig.enableTopToolbar) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }

      return slider;
    }
  })

  setting.addItem({
    title: '②扩展工具栏距离顶部工具栏',
    description: '💡扩展工具栏第1层距离顶部主工具栏的距离（仅在顶部固定时有效）',
    createActionElement: () => {
      // 解析当前值，提取数字部分
      const currentValueStr = context.mobileConfig.overflowToolbarDistanceTop ?? '8px';
      const currentValue = parseInt(currentValueStr) || 8;
      
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0,    // 最小值
        50,   // 最大值，按要求设置为50px
        'px',
        async (value) => {
          context.mobileConfig.overflowToolbarDistanceTop = value + 'px';
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
        }
      );
      
      // 为滑杆添加顶部工具栏设置类名，以便动态显示/隐藏功能正常工作
      slider.classList.add('top-toolbar-setting');

      // 根据顶部工具栏启用状态设置滑杆的禁用状态
      if (!context.mobileConfig.enableTopToolbar) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }

      return slider;
    }
  })

  setting.addItem({
    title: '③扩展工具栏自身高度',
    description: '💡顶部模式时扩展工具栏每一层的高度',
    createActionElement: () => {
      // 解析当前值，提取数字部分
      const currentValueStr = context.mobileConfig.overflowToolbarHeightTop ?? '40px';
      const currentValue = parseInt(currentValueStr) || 40;
      
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0,    // 最小值
        100,  // 最大值，按要求设置为100px
        'px',
        async (value) => {
          context.mobileConfig.overflowToolbarHeightTop = value + 'px';
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
        }
      );
      
      // 为滑杆添加顶部工具栏设置类名，以便动态显示/隐藏功能正常工作
      slider.classList.add('top-toolbar-setting');

      // 根据顶部工具栏启用状态设置滑杆的禁用状态
      if (!context.mobileConfig.enableTopToolbar) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }

      return slider;
    }
  })

  // === 底部工具栏专用配置（作为子分区） ===
  // 子分区标题项，使用思源原生的 config__item 结构
  setting.addItem({
    title: '',
    description: '',
    createActionElement: () => {
      const div = document.createElement('div')
      div.className = 'bottom-toolbar-section'
      div.innerHTML = '<span style="font-size: 14px; font-weight: 600; color: #22c55e; display: flex; align-items: center; gap: 6px;"><span>⬇️</span><span>底部工具栏配置</span></span>'
      return div
    }
  })

  setting.addItem({
    title: '①输入法关闭时底部高度',
    description: '💡输入法关闭时，工具栏距底部距离（仅在底部固定时有效）',
    createActionElement: () => {
      // 解析当前值，提取数字部分
      const currentValueStr = context.mobileConfig.closeInputOffset ?? '0';
      const currentValue = parseInt(currentValueStr) || 0;
      
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0,    // 最小值
        20,   // 最大值，按要求设置为20px
        'px',
        async (value) => {
          context.mobileConfig.closeInputOffset = value + 'px';
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
          context.applyMobileToolbarStyle();
        }
      );
      
      // 为滑杆添加底部工具栏设置类名，以便动态显示/隐藏功能正常工作
      slider.classList.add('bottom-toolbar-setting');

      // 根据底部工具栏启用状态设置滑杆的禁用状态
      if (!context.mobileConfig.enableBottomToolbar) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }

      return slider;
    }
  })


  setting.addItem({
    title: '②输入法打开时底部高度',
    description: '💡输入法弹出时，底部工具栏距底部距离（仅在底部固定时有效）',
    createActionElement: () => {
      // 解析当前值，提取数字部分
      const currentValueStr = context.mobileConfig.openInputOffset ?? '0';
      const currentValue = parseInt(currentValueStr) || 0;
      
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0,    // 最小值
        100,  // 最大值，按要求设置为100px
        'px',
        async (value) => {
          context.mobileConfig.openInputOffset = value + 'px';
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
          context.applyMobileToolbarStyle();
        }
      );
      
      // 为滑杆添加底部工具栏设置类名，以便动态显示/隐藏功能正常工作
      slider.classList.add('bottom-toolbar-setting');

      // 根据底部工具栏启用状态设置滑杆的禁用状态
      if (!context.mobileConfig.enableBottomToolbar) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }

      return slider;
    }
  })

  setting.addItem({
    title: '③输入法灵敏度检查',
    description: '💡不建议修改：窗口高度变化超过此百分比触发：30-90（仅在底部固定时有效）',
    createActionElement: () => {
      // 解析当前值，提取数字部分
      const currentValue = context.mobileConfig.heightThreshold ?? 70;
      
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0,    // 最小值
        100,  // 最大值，按要求设置为100
        '',   // 无单位
        async (value) => {
          context.mobileConfig.heightThreshold = value;
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
          // 需要重新初始化工具栏检测器以应用新阈值
          context.updateMobileToolbar();
        }
      );
      
      // 为滑杆添加底部工具栏设置类名，以便动态显示/隐藏功能正常工作
      slider.classList.add('bottom-toolbar-setting');

      // 根据底部工具栏启用状态设置滑杆的禁用状态
      if (!context.mobileConfig.enableBottomToolbar) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }

      return slider;
    }
  })

  setting.addItem({
    title: '④扩展工具栏距离底部工具栏',
    description: '💡扩展工具栏第1层距离底部主工具栏的距离（仅在底部固定时有效）',
    createActionElement: () => {
      // 解析当前值，提取数字部分
      const currentValueStr = context.mobileConfig.overflowToolbarDistanceBottom ?? '8px';
      const currentValue = parseInt(currentValueStr) || 8;
      
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0,    // 最小值
        20,   // 最大值，按要求设置为20px
        'px',
        async (value) => {
          context.mobileConfig.overflowToolbarDistanceBottom = value + 'px';
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
        }
      );
      
      // 为滑杆添加底部工具栏设置类名，以便动态显示/隐藏功能正常工作
      slider.classList.add('bottom-toolbar-setting');

      // 根据底部工具栏启用状态设置滑杆的禁用状态
      if (!context.mobileConfig.enableBottomToolbar) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }

      return slider;
    }
  })

  setting.addItem({
    title: '⑤扩展工具栏自身高度',
    description: '💡底部模式时扩展工具栏每一层的高度',
    createActionElement: () => {
      // 解析当前值，提取数字部分
      const currentValueStr = context.mobileConfig.overflowToolbarHeightBottom ?? '40px';
      const currentValue = parseInt(currentValueStr) || 40;
      
      const slider = createCustomSliderWithoutLabel(
        currentValue,
        0,    // 最小值
        100,  // 最大值，按要求设置为100px
        'px',
        async (value) => {
          context.mobileConfig.overflowToolbarHeightBottom = value + 'px';
          await context.saveData('mobileToolbarConfig', context.mobileConfig);
        }
      );
      
      // 为滑杆添加底部工具栏设置类名，以便动态显示/隐藏功能正常工作
      slider.classList.add('bottom-toolbar-setting');

      // 根据底部工具栏启用状态设置滑杆的禁用状态
      if (!context.mobileConfig.enableBottomToolbar) {
        slider.style.opacity = '0.5';
        slider.style.pointerEvents = 'none';
      }

      return slider;
    }
  })


  // === 一键记事弹窗 ===
  createGroupTitle('4️⃣ ','一键记事弹窗', 'quick-note-settings-section')

  // 说明文字
  createNotice('📝请先选择触发方式，再配置笔记本或文档ID，选择插入位置，进行弹窗细化设置。')
  

  


  // ===触发：后台切前台 ===
  setting.addItem({
    title: '',
    description: '',
    createActionElement: () => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `
        margin: 0 -16px;
        width: calc(100% + 32px);
      `;
      
      const container = document.createElement('div');
      container.style.cssText = 'display: flex; flex-direction: column; gap: 12px; padding: 16px; background: var(--b3-theme-background); border: 1px solid var(--b3-border-color); border-radius: 8px;';
  
      // 获取当前配置值，设置默认值
      const config = context.mobileFeatureConfig as any
      const currentPopupConfig = config.popupConfig || 'bothModes'
  
      // 创建选项按钮
      
      // 添加触发方式说明
      const triggerInfo = document.createElement('div');
      triggerInfo.style.cssText = 'padding: 12px; background: #e3f2fd; border: 1px solid #bbdefb; border-radius: 6px; margin-bottom: 16px; font-size: 14px; line-height: 1.5;';
      triggerInfo.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 8px; color: #1976d2;">💡触发方式说明：</div>
        <div style="margin-bottom: 6px;">📱 方式一：按钮触发，请到顶部添加新按钮，选择功能④一键记事弹窗【简单】⏫</div>
        <div>📱 方式二：自动触发：后台切前台⬇️</div>
      `;
      container.appendChild(triggerInfo);
      
      const options = [
        { type: 'description', content: '请设置方式二：自动触发记事功能的条件' },
        { value: 'disabled', label: '①关闭自启动', description: '完全关闭自启动记事功能' },
        { value: 'smallWindowOnly', label: '②只在小窗模式下启用自启动', description: '仅当检测到小窗模式时自动触发记事' },
        { value: 'bothModes', label: '③小窗和全屏模式都启用自启动', description: '无论全屏还是小窗模式都自动触发记事' }
      ]
  
      options.forEach(option => {
        //处理描述项
        if (option.type === 'description') {
          const descContainer = document.createElement('div');
          descContainer.style.cssText = 'padding: 8px 12px; background: #fff3e0; border: 1px solid #ffe0b2; border-radius: 4px; margin-bottom: 8px; font-size: 13px; color: #e65100;';
          descContainer.textContent = option.content;
          container.appendChild(descContainer);
          return;
        }
        
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
        desc.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface);'
  
        labelContainer.appendChild(label)
        labelContainer.appendChild(desc)
  
        optionContainer.appendChild(radio)
        optionContainer.appendChild(labelContainer)
  
        // 添加选中状态样式
        if (radio.checked) {
          optionContainer.style.cssText += ' background: var(--b3-theme-primary-lightest); border-color: var(--b3-theme-primary);'
        }
  
        //点击事件处理
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
  
      wrapper.appendChild(container);
      return wrapper
    }
  })

  // 一键记事保存配置（整合保存方式和ID配置）
  setting.addItem({
    title: '',
    description: '',
    createActionElement: () => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `
        margin: 0 -16px;
        width: calc(100% + 32px);
      `;
      
      const container = document.createElement('div');
      container.style.cssText = 'display: flex; flex-direction: column; gap: 12px; padding: 12px; background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.08)); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 6px;';
      
      // 标题
      const titleDiv = document.createElement('div');
      titleDiv.textContent = '①一键记事保存配置';
      titleDiv.style.cssText = 'font-size: 16px; font-weight: 600; color: var(--b3-theme-on-background);';
      container.appendChild(titleDiv);
      
      // 描述
      const descDiv = document.createElement('div');
      descDiv.textContent = '💡 选择保存方式配置对应的目标ID，实时联动更新';
      descDiv.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); margin-bottom: 8px;';
      container.appendChild(descDiv);
  
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
        { value: 'document', label: '📄 追加到指定文档', description: '内容直接追加到指定文档底部或顶部' }
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
        desc.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface); margin-top: 2px;';
  
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
      hint.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface);';

      // 根据选择类型更新ID输入框
      function updateIdInput() {
        const saveType = config.quickNoteSaveType || 'daily';
        const labelEl = idConfigContainer.querySelector('#quick-note-setting-id-label') as HTMLLabelElement;
        const inputEl = idConfigContainer.querySelector('#quick-note-setting-id-input') as HTMLInputElement;
        const hintEl = idConfigContainer.querySelector('#quick-note-setting-id-hint') as HTMLDivElement;

        // 添加空值检查
        if (!labelEl || !inputEl || !hintEl) {
          return;
        }

        if (saveType === 'document') {
          labelEl.textContent = '📄 目标文档ID';
          inputEl.placeholder = '请输入文档ID，如：20250101000000-aaaaaa';
          inputEl.value = config.quickNoteDocumentId || '';
          hintEl.textContent = '💡 内容将直接追加到该文档底部或顶部';
        } else {
          labelEl.textContent = '📘 目标笔记本ID';
          inputEl.placeholder = '请粘贴DailyNote所在笔记本ID';
          inputEl.value = config.quickNoteNotebookId || '';
          hintEl.textContent = '💡 内容将保存到该笔记本的当日日记中';
        }
      }

      // 初始化显示 - 使用setTimeout确保DOM已渲染
      setTimeout(() => {
        updateIdInput();
      }, 0);
  
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
        
      wrapper.appendChild(container);
      return wrapper;
    }
  });

  // ===插入位置选择 ===
  setting.addItem({
    title: '②位置选择',
    description: '💡 选择一键记事内容插入到文档的位置',
    createActionElement: () => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `
        margin: 0 -16px;
        width: calc(100% + 32px);
      `;
      
      const container = document.createElement('div');
      container.style.cssText = 'display: flex; flex-direction: column; gap: 12px; padding: 16px; background: var(--b3-theme-background); border: 1px solid var(--b3-border-color); border-radius: 8px;';

      const config = context.mobileFeatureConfig as any
      const currentPosition = config.quickNoteInsertPosition || 'bottom'

      const options = [
        {
          value: 'top',
          label: '①插入到文档顶部',
          description: '最新内容显示在最上面，适合日记、每日清单等'
        },
        {
          value: 'bottom',
          label: '②插入到文档底部',
          description: '按时间顺序记录，适合常规笔记'
        }
      ]

      options.forEach(option => {
        const optionContainer = document.createElement('div')
        optionContainer.style.cssText = 'display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 8px; cursor: pointer; transition: all 0.2s ease;'

        const radio = document.createElement('input')
        radio.type = 'radio'
        radio.name = 'quickNoteInsertPosition'
        radio.value = option.value
        radio.checked = currentPosition === option.value
        radio.style.cssText = 'transform: scale(1.3);'

        const labelContainer = document.createElement('div')
        labelContainer.style.cssText = 'flex: 1;'

        const label = document.createElement('div')
        label.textContent = option.label
        label.style.cssText = 'font-weight: 500; color: var(--b3-theme-on-background); margin-bottom: 4px;'

        const desc = document.createElement('div')
        desc.textContent = option.description
        desc.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface);'

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
            const radioInput = r as HTMLInputElement
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
          config.quickNoteInsertPosition = option.value
          await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
        }

        container.appendChild(optionContainer)
      })

      wrapper.appendChild(container);
      return wrapper
    }
  })

  //弹编辑器样式选择
  setting.addItem({
    title: '③弹窗编辑器样式选择',
    description: '选择一键记事弹窗的UI风格',
    createActionElement: () => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `
        margin: 0 -16px;
        width: calc(100% + 32px);
      `;
      
      const container = document.createElement('div');
      container.style.cssText = 'display: flex; flex-direction: column; gap: 8px; padding: 16px; background: var(--b3-theme-background); border: 1px solid var(--b3-border-color); border-radius: 8px;';

      const config = context.mobileFeatureConfig as any;
      const currentStyle = config.quickNoteStyle || 'apple';

      const options = [
        { value: 'default', label: '① 默认风格' },
        { value: 'apple', label: '② 苹果风格' }
      ];

      options.forEach(option => {
        const optionDiv = document.createElement('div');
        optionDiv.style.cssText = `
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          border: 2px solid ${currentStyle === option.value ? 'var(--b3-theme-primary)' : 'transparent'};
          background: ${currentStyle === option.value ? 'rgba(59, 130, 246, 0.1)' : 'transparent'};
        `;

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'quickNoteStyle';
        radio.value = option.value;
        radio.checked = currentStyle === option.value;
        radio.style.cssText = 'cursor: pointer;';

        const label = document.createElement('span');
        label.textContent = option.label;
        label.style.cssText = 'font-size: 14px; flex: 1;';

        optionDiv.appendChild(radio);
        optionDiv.appendChild(label);

        optionDiv.addEventListener('click', () => {
          // 更新选中状态
          container.querySelectorAll('div').forEach(div => {
            div.style.borderColor = 'transparent';
            div.style.background = 'transparent';
          });
          optionDiv.style.borderColor = 'var(--b3-theme-primary)';
          optionDiv.style.background = 'rgba(59, 130, 246, 0.1)';
          
          // 更新radio
          const radioInput = optionDiv.querySelector('input');
          if (radioInput) radioInput.checked = true;
          
          // 保存配置
          config.quickNoteStyle = option.value;
          context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
        });

        container.appendChild(optionDiv);
      });

      wrapper.appendChild(container);
      return wrapper
    }
  });

  

  // ===弹窗按钮排序方法 ===
  setting.addItem({
    title: '④弹窗按钮排序方法',
    description: '💡 选择一键记事弹窗中工具栏按钮的排列方式',
    createActionElement: () => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `
        margin: 0 -16px;
        width: calc(100% + 32px);
      `;
      
      const container = document.createElement('div');
      container.style.cssText = 'display: flex; flex-direction: column; gap: 12px; padding: 16px; background: var(--b3-theme-background); border: 1px solid var(--b3-border-color); border-radius: 8px;';

      // 获取当前配置值，设置默认值
      const config = context.mobileFeatureConfig as any
      const currentSortMethod = config.quickNoteSortMethod || 'bottomToolbar'

      // 创建选项按钮
      const options = [
        { 
          value: 'topToolbar', 
          label: '①顶部工具栏排序', 
          description: '从右往左排列，不满行时居中。适合习惯顶部工具栏的用户' 
        },
        { 
          value: 'bottomToolbar', 
          label: '②底部工具栏排序', 
          description: '从左往右排列，不满行时靠左。适合习惯底部工具栏的用户' 
        }
      ]

      options.forEach(option => {
        const optionContainer = document.createElement('div')
        optionContainer.style.cssText = 'display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 8px; cursor: pointer; transition: all 0.2s ease;'

        const radio = document.createElement('input')
        radio.type = 'radio'
        radio.name = 'quickNoteSortMethod'
        radio.value = option.value
        radio.checked = currentSortMethod === option.value
        radio.style.cssText = 'transform: scale(1.3);'

        const labelContainer = document.createElement('div')
        labelContainer.style.cssText = 'flex: 1;'

        const label = document.createElement('div')
        label.textContent = option.label
        label.style.cssText = 'font-weight: 500; color: var(--b3-theme-on-background); margin-bottom: 4px;'

        const desc = document.createElement('div')
        desc.textContent = option.description
        desc.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface);'

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
          config.quickNoteSortMethod = option.value
          await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
        }

        container.appendChild(optionContainer)
      })

      wrapper.appendChild(container);
      return wrapper
    }
  })

  // ===弹窗输入框字体大小 ===
  setting.addItem({
    title: '⑤弹窗输入框字体大小',
    description: '💡 调节一键记事弹窗中输入框的字体大小',
    createActionElement: () => {
      const config = context.mobileFeatureConfig as any;
      const currentFontSize = config.quickNoteFontSize || 18;

      return createCustomSlider(
        '字体大小：',
        currentFontSize,
        12,
        30,
        'px',
        async (value) => {
          config.quickNoteFontSize = value;
          await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
        }
      );
    }
  })

  // 按钮样式配置模式切换
  setting.addItem({
    title: '⑥按钮样式配置',
    description: '💡 选择使用默认配置或自定义配置按钮样式',
    createActionElement: () => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `
        margin: 0 -16px;
        width: calc(100% + 32px);
      `;
      
      const container = document.createElement('div');
      container.style.cssText = 'display: flex; flex-direction: column; gap: 12px; padding: 16px; background: var(--b3-theme-background); border: 1px solid var(--b3-border-color); border-radius: 8px;';

      const config = context.mobileFeatureConfig as any;
      const useCustom = config.useCustomButtonStyle || false;

      // 选项容器
      const optionsContainer = document.createElement('div');
      optionsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

      // 默认配置选项
      const defaultOption = document.createElement('div');
      defaultOption.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid var(--b3-border-color); border-radius: 6px; cursor: pointer;';

      const defaultRadio = document.createElement('input');
      defaultRadio.type = 'radio';
      defaultRadio.name = 'button-style-config';
      defaultRadio.checked = !useCustom;
      defaultRadio.style.cssText = 'transform: scale(1.2);';

      const defaultLabel = document.createElement('span');
      defaultLabel.textContent = '使用默认配置';
      defaultLabel.style.cssText = 'font-size: 14px;';

      defaultOption.appendChild(defaultRadio);
      defaultOption.appendChild(defaultLabel);

      // 自定义配置选项
      const customOption = document.createElement('div');
      customOption.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid var(--b3-border-color); border-radius: 6px; cursor: pointer;';

      const customRadio = document.createElement('input');
      customRadio.type = 'radio';
      customRadio.name = 'button-style-config';
      customRadio.checked = useCustom;
      customRadio.style.cssText = 'transform: scale(1.2);';

      const customLabel = document.createElement('span');
      customLabel.textContent = '使用自定义配置';
      customLabel.style.cssText = 'font-size: 14px;';

      customOption.appendChild(customRadio);
      customOption.appendChild(customLabel);

      // 更新选中样式
      const updateSelection = () => {
        if (defaultRadio.checked) {
          defaultOption.style.borderColor = 'var(--b3-theme-primary)';
          defaultOption.style.backgroundColor = 'var(--b3-theme-primary-lightest)';
          customOption.style.borderColor = 'var(--b3-border-color)';
          customOption.style.backgroundColor = 'transparent';
        } else {
          customOption.style.borderColor = 'var(--b3-theme-primary)';
          customOption.style.backgroundColor = 'var(--b3-theme-primary-lightest)';
          defaultOption.style.borderColor = 'var(--b3-border-color)';
          defaultOption.style.backgroundColor = 'transparent';
        }
      };

      updateSelection();

      // 点击事件
      defaultOption.onclick = async () => {
        defaultRadio.checked = true;
        config.useCustomButtonStyle = false;
        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
        updateSelection();
        // 触发自定义事件通知设置项显示/隐藏
        window.dispatchEvent(new CustomEvent('quicknote-button-style-changed', { detail: false }));
      };

      customOption.onclick = async () => {
        customRadio.checked = true;
        config.useCustomButtonStyle = true;
        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
        updateSelection();
        // 触发自定义事件通知设置项显示/隐藏
        window.dispatchEvent(new CustomEvent('quicknote-button-style-changed', { detail: true }));
      };

      optionsContainer.appendChild(defaultOption);
      optionsContainer.appendChild(customOption);
      container.appendChild(optionsContainer);

      wrapper.appendChild(container);
      return wrapper
    }
  })

  // === 滑杆创建辅助函数 ===
  const createSliderRow = (
    labelText: string,
    configKey: string,
    min: number,
    max: number,
    defaultValue: number,
    unit: string = 'px',
    showBorder: boolean = true
  ): HTMLElement => {
    const row = document.createElement('div');
    row.style.cssText = `display: flex; align-items: center; gap: 12px; padding: 8px 0;${showBorder ? ' border-bottom: 1px solid var(--b3-border-color);' : ''}`;

    const label = document.createElement('span');
    label.textContent = labelText;
    label.style.cssText = 'min-width: 100px; font-size: 14px;';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.value = String((context.mobileFeatureConfig as any)[configKey] || defaultValue);
    slider.style.cssText = 'flex: 1; cursor: pointer;';

    const valueDisplay = document.createElement('span');
    valueDisplay.textContent = `${slider.value}${unit}`;
    valueDisplay.style.cssText = 'min-width: 45px; text-align: right; font-size: 14px;';

    slider.oninput = () => {
      valueDisplay.textContent = `${slider.value}${unit}`;
      (context.mobileFeatureConfig as any)[configKey] = parseInt(slider.value);
    };

    slider.onchange = async () => {
      (context.mobileFeatureConfig as any)[configKey] = parseInt(slider.value);
      await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
    };

    row.appendChild(label);
    row.appendChild(slider);
    row.appendChild(valueDisplay);

    return row;
  };

  // 创建按钮样式自定义配置容器
  const createButtonStyleConfigContainer = () => {
    const wrapper = document.createElement('div');
    wrapper.id = 'quicknote-button-style-configs';
    wrapper.style.cssText = 'display: flex; flex-direction: column; gap: 8px; width: 100%;';

    const config = context.mobileFeatureConfig as any;
    const useCustom = config.useCustomButtonStyle || false;

    // 根据初始状态设置显示/隐藏
    if (!useCustom) {
      wrapper.style.display = 'none';
    }

    // 监听切换事件
    window.addEventListener('quicknote-button-style-changed', ((e: CustomEvent) => {
      wrapper.style.display = e.detail ? 'flex' : 'none';
    }) as EventListener);

    // 使用自定义滑杆组件
    wrapper.appendChild(createCustomSlider('按钮高度:', config.quickNoteButtonHeight || 40, 24, 66, 'px', async (value) => {
      config.quickNoteButtonHeight = value;
      await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
    }));

    wrapper.appendChild(createCustomSlider('按钮宽度:', config.quickNoteButtonMinWidth || 36, 20, 60, 'px', async (value) => {
      config.quickNoteButtonMinWidth = value;
      await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
    }));

    wrapper.appendChild(createCustomSlider('外边距:', config.quickNoteButtonMargin || 2, 0, 10, 'px', async (value) => {
      config.quickNoteButtonMargin = value;
      await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
    }));

    wrapper.appendChild(createCustomSlider('内边距:', config.quickNoteButtonPadding || 8, 0, 20, 'px', async (value) => {
      config.quickNoteButtonPadding = value;
      await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
    }));

    wrapper.appendChild(createCustomSlider('按钮间距:', config.quickNoteButtonGap || 6, 0, 20, 'px', async (value) => {
      config.quickNoteButtonGap = value;
      await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig);
    }));

    return wrapper;
  };

  // 添加按钮样式配置容器
  setting.addItem({
    title: '',
    description: '',
    createActionElement: () => createButtonStyleConfigContainer()
  });

  // === 小功能选择 ===
  createGroupTitle('5️⃣ ','小功能选择')

  // 说明文字
  createNotice('⚙️调整手机端的图标隐藏设置，注意打开扩展工具栏，会强制隐藏，若想用面包屑等，请滚动到顶部，关闭扩展工具栏按钮')

  // 检查扩展工具栏按钮是否启用
  const isOverflowButtonEnabled = () => {
    const overflowBtn = context.mobileButtonConfigs.find(btn => btn.id === 'overflow-button-mobile')
    return overflowBtn?.enabled !== false
  }


  setting.addItem({
    title: '①面包屑图标隐藏',
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
    title: '②锁定编辑按钮隐藏',
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
    title: '③文档菜单按钮隐藏',
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
    title: '④更多按钮隐藏',
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
    title: '⑤禁止左右滑动弹出',
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

  // === 使用帮助 ===
  createGroupTitle('6️⃣ ','手机端关闭与激活码')

  // 说明文字（已移除）

  // ⚠️ 手机端完全恢复思源原始状态
  setting.addItem({
    title: '',
    description: '',
    createActionElement: () => {
      const container = document.createElement('div')
      container.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin: 0 -16px;
        width: calc(100% + 32px);
        padding: 16px;
        background: linear-gradient(135deg, rgba(255, 77, 77, 0.15), rgba(255, 120, 77, 0.1));
        border: 2px solid rgba(255, 77, 77, 0.4);
        border-radius: 8px;
        box-sizing: border-box;
      `

      const headerRow = document.createElement('div')
      headerRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;'

      const titleEl = document.createElement('label')
      titleEl.style.cssText = 'font-size: 15px; font-weight: 700; color: #ff4d4d;'
      titleEl.textContent = '⚠️ 手机端完全恢复思源原始状态'

      const toggle = document.createElement('input')
      toggle.type = 'checkbox'
      toggle.className = 'b3-switch'
      toggle.checked = context.mobileFeatureConfig.disableCustomButtons ?? false
      toggle.style.cssText = 'transform: scale(1.2);'
      toggle.onchange = async () => {
        context.mobileFeatureConfig.disableCustomButtons = toggle.checked
        await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
        context.applyFeatures()
      }

      headerRow.appendChild(titleEl)
      headerRow.appendChild(toggle)
      container.appendChild(headerRow)

      const descEl = document.createElement('div')
      descEl.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface); line-height: 1.5; opacity: 0.9;'
      descEl.textContent = '💡 开启后：隐藏所有自定义按钮 + 取消所有工具栏样式修改，让思源恢复到未安装插件时的原始状态'
      container.appendChild(descEl)

      return container
    }
  })

  // ⑥鲸鱼定制工具箱激活
  setting.addItem({
    title: '',
    description: '',
    createActionElement: () => {
      const container = document.createElement('div')
      container.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin: 0 -16px;
        width: calc(100% + 32px);
        padding: 16px;
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(59, 130, 246, 0.1));
        border: 2px solid rgba(139, 92, 246, 0.4);
        border-radius: 8px;
        box-sizing: border-box;
      `

      // 标题和状态行
      const headerRow = document.createElement('div')
      headerRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;'

      const titleEl = document.createElement('label')
      titleEl.style.cssText = 'font-size: 15px; font-weight: 700; color: #8b5cf6;'
      titleEl.textContent = '🔐 鲸鱼定制工具箱:永久激活'

      // 激活状态显示
      const statusEl = document.createElement('span')
      statusEl.style.cssText = 'font-size: 12px; padding: 2px 8px; border-radius: 4px;'
      if (context.isAuthorToolActivated()) {
        statusEl.style.cssText += ' background: rgba(34, 197, 94, 0.2); color: #22c55e;'
        statusEl.textContent = '✓ 已激活'
      } else {
        statusEl.style.cssText += ' background: rgba(255, 77, 77, 0.2); color: #ff4d4d;'
        statusEl.textContent = '✗ 未激活'
      }

      headerRow.appendChild(titleEl)
      headerRow.appendChild(statusEl)
      container.appendChild(headerRow)

      // 说明文字
      const descEl = document.createElement('div')
      descEl.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface); line-height: 1.5; opacity: 0.9;'
      descEl.textContent = '💡 输入激活码后可解锁「⑥鲸鱼定制工具箱」功能类型。激活码获取：请进QQ群1018010924咨询群主！'
      container.appendChild(descEl)

      // 输入框和按钮容器
      const inputRow = document.createElement('div')
      inputRow.style.cssText = 'display: flex; gap: 8px; align-items: center;'

      const input = document.createElement('input')
      input.type = 'text'
      input.className = 'b3-text-field'
      input.placeholder = '请输入激活码'
      input.value = context.mobileFeatureConfig.authorCode ?? ''
      input.style.cssText = 'flex: 1; max-width: 200px;'

      const btn = document.createElement('button')
      btn.className = 'b3-button b3-button--text'
      btn.textContent = '验证激活'
      btn.onclick = async () => {
        const code = input.value.trim()
        if (validateActivationCode(code)) {
          // 同时激活两端
          context.mobileFeatureConfig.authorActivated = true
          context.mobileFeatureConfig.authorCode = code
          context.desktopFeatureConfig.authorActivated = true
          context.desktopFeatureConfig.authorCode = code
          await context.saveData('mobileFeatureConfig', context.mobileFeatureConfig)
          await context.saveData('desktopFeatureConfig', context.desktopFeatureConfig)
          statusEl.style.cssText = 'font-size: 12px; padding: 2px 8px; border-radius: 4px; background: rgba(34, 197, 94, 0.2); color: #22c55e;'
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
      
      // 根据激活状态决定是否显示输入框和验证按钮
      if (context.isAuthorToolActivated()) {
        inputRow.style.display = 'none'  // 激活后隐藏输入框和验证按钮
        // 添加重新激活按钮到容器中
        const reActivateBtn = document.createElement('button')
        reActivateBtn.className = 'b3-button b3-button--info'
        reActivateBtn.textContent = '重新激活'
        reActivateBtn.style.cssText = 'margin-left: 8px;'
        reActivateBtn.onclick = () => {
          // 显示输入框和验证按钮
          inputRow.style.display = 'flex'
          // 隐藏重新激活按钮
          reActivateBtn.style.display = 'none'
        }
        container.appendChild(reActivateBtn)
      }
      
      container.appendChild(inputRow)

      return container
    }
  })

  // 鲸鱼定制工具箱功能列表说明
  setting.addItem({
    title: '',
    description: '',
    createActionElement: () => {
      const container = document.createElement('div')
      container.style.cssText = `
        margin: 0 -16px;
        width: calc(100% + 32px);
        padding: 16px;
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(59, 130, 246, 0.05));
        border-radius: 8px;
        box-sizing: border-box;
      `
      container.innerHTML = `
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
      return container
    }
  })
}
