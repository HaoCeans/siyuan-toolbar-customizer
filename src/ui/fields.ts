/**
 * 字段创建工具模块
 * 提供设置界面中各种输入字段的创建函数
 */

import { showIconPicker as showIconPickerModal } from './iconPicker'

/**
 * 更新图标显示
 * @param element - 要更新图标的元素
 * @param iconValue - 图标值（emoji、lucide:图标名 或 icon名）
 */
export function updateIconDisplay(element: HTMLElement, iconValue: string): void {
  element.innerHTML = ''

  if (!iconValue) {
    element.textContent = '?'
    return
  }

  // 检查是否是 lucide 图标（格式: lucide:图标名）
  if (iconValue.startsWith('lucide:')) {
    const iconName = iconValue.replace('lucide:', '')
    // 使用 SVG 来显示 lucide 图标
    element.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <use href="#${iconName}"></use>
      </svg>
    `
    // 如果 SVG 找不到，回退到显示文本
    const svg = element.querySelector('svg')
    if (svg) {
      const use = svg.querySelector('use')
      if (use) {
        // 检查图标是否存在
        const existingSymbol = document.getElementById(iconName)
        if (!existingSymbol) {
          // 图标不存在，显示图标名
          element.innerHTML = `<span style="font-size: 10px;">${iconName}</span>`
        }
      }
    }
  } else if (iconValue.startsWith('icon')) {
    // 思源内置图标
    element.innerHTML = `<svg class="b3-svg" style="width: 16px; height: 16px;"><use xlink:href="#${iconValue}"></use></svg>`
  } else if (/\.(png|jpg|jpeg|gif|svg)$/i.test(iconValue)) {
    // 图片路径（自定义图标）
    // 使用绝对路径，思源插件资源路径格式
    const pluginName = 'siyuan-toolbar-customizer'
    const imagePath = iconValue.startsWith('/plugins/') ? iconValue : `/plugins/${pluginName}/${iconValue}`
    element.innerHTML = `<img src="${imagePath}" style="width: 20px; height: 20px; object-fit: contain;"/>`
  } else {
    // Emoji 或其他文本
    element.textContent = iconValue
  }
}

/**
 * 创建电脑端图标字段（支持 emoji 和 lucide 图标）
 * @param label - 字段标签
 * @param value - 当前图标值
 * @param onChange - 值变化回调
 * @param showIconPickerFn - 显示图标选择器的函数
 * @returns 字段元素
 */
export function createDesktopIconField(
  label: string,
  value: string,
  onChange: (value: string) => void,
  showIconPickerFn: (currentValue: string, onSelect: (icon: string) => void, iconSize?: number) => void,
  iconSize?: number
): HTMLElement {
  const field = document.createElement('div')
  field.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;'

  const labelEl = document.createElement('label')
  labelEl.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); min-width: 120px;'
  labelEl.textContent = label

  const inputWrapper = document.createElement('div')
  inputWrapper.className = 'fn__flex-1'
  inputWrapper.style.cssText = 'display: flex; gap: 8px; align-items: center;'

  // 图标展示区域（代替输入框）
  const iconDisplay = document.createElement('div')
  iconDisplay.className = 'b3-text-field'
  iconDisplay.style.cssText = `
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 32px;
    cursor: pointer;
    background: var(--b3-theme-background);
  `
  iconDisplay.title = '点击选择图标'

  // 图标容器
  const iconContainer = document.createElement('span')
  iconContainer.style.cssText = `
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
  `
  updateIconDisplay(iconContainer, value)
  iconDisplay.appendChild(iconContainer)

  // 隐藏的实际值存储
  const hiddenInput = document.createElement('input')
  hiddenInput.type = 'hidden'
  hiddenInput.value = value

  // 点击图标区域打开图标选择器
  const openIconPicker = () => {
    showIconPickerFn(hiddenInput.value, (selectedIcon) => {
      hiddenInput.value = selectedIcon
      onChange(selectedIcon)
      updateIconDisplay(iconContainer, selectedIcon)
    }, iconSize)
  }

  iconDisplay.onclick = openIconPicker

  inputWrapper.appendChild(iconDisplay)
  inputWrapper.appendChild(hiddenInput)

  field.appendChild(labelEl)
  field.appendChild(inputWrapper)
  return field
}

/**
 * 创建电脑端普通输入字段
 * @param label - 字段标签
 * @param value - 当前值
 * @param placeholder - 占位符文本
 * @param onChange - 值变化回调
 * @param type - 输入框类型（text/number 等）
 * @returns 字段元素
 */
export function createDesktopField(
  label: string,
  value: string,
  placeholder: string,
  onChange: (value: string) => void,
  type: string = 'text'
): HTMLElement {
  const field = document.createElement('div')
  field.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;'

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

/**
 * 创建电脑端选择字段
 * @param label - 字段标签
 * @param value - 当前值
 * @param options - 选项数组
 * @param onChange - 值变化回调
 * @returns 字段元素
 */
export function createDesktopSelectField(
  label: string,
  value: string,
  options: Array<{ value: string; label: string }>,
  onChange: (value: string) => void
): HTMLElement {
  const field = document.createElement('div')
  field.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;'

  const labelEl = document.createElement('label')
  labelEl.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); min-width: 120px;'
  labelEl.textContent = label

  const select = document.createElement('select')
  select.className = 'b3-text-field fn__flex-1'
  select.style.cssText = 'padding: 6px 8px;'

  options.forEach(option => {
    const optionEl = document.createElement('option')
    optionEl.value = option.value
    optionEl.textContent = option.label
    if (option.value === value) {
      optionEl.selected = true
    }
    select.appendChild(optionEl)
  })

  select.onchange = () => onChange(select.value)

  field.appendChild(labelEl)
  field.appendChild(select)
  return field
}

/**
 * 创建带行号的文本框
 * @param initialValue - 初始值
 * @param onChange - 值变化回调
 * @returns 文本框容器元素
 */
export function createLineNumberedTextarea(
  initialValue: string,
  onChange: (value: string) => void
): HTMLElement {
  const container = document.createElement('div')
  container.style.cssText = 'display: flex; border: 1px solid var(--b3-border-color); border-radius: 4px; overflow: hidden;'

  const lineNumbers = document.createElement('div')
  lineNumbers.style.cssText = `
    background: var(--b3-theme-surface);
    color: var(--b3-theme-on-surface-light);
    padding: 8px 4px;
    text-align: right;
    font-family: monospace;
    font-size: 12px;
    line-height: 1.5;
    min-width: 30px;
    user-select: none;
    border-right: 1px solid var(--b3-border-color);
  `

  const textarea = document.createElement('textarea')
  textarea.className = 'b3-text-field'
  textarea.value = initialValue
  textarea.style.cssText = `
    flex: 1;
    resize: vertical;
    min-height: 100px;
    font-family: monospace;
    font-size: 12px;
    border: none;
    border-radius: 0;
  `

  const updateLineNumbers = () => {
    const lines = textarea.value.split('\n')
    lineNumbers.innerHTML = lines.map((_, i) => `<div>${i + 1}</div>`).join('')
  }

  textarea.oninput = () => {
    updateLineNumbers()
    onChange(textarea.value)
  }

  textarea.onscroll = () => {
    lineNumbers.scrollTop = textarea.scrollTop
  }

  updateLineNumbers()

  // 将 updateLineNumbers 方法挂载到容器上，方便外部调用
  ;(container as any).updateLineNumbers = updateLineNumbers

  container.appendChild(lineNumbers)
  container.appendChild(textarea)

  return container
}

/**
 * 创建手机端输入字段
 * @param label - 字段标签
 * @param value - 当前值
 * @param placeholder - 占位符文本
 * @param onChange - 值变化回调
 * @param type - 输入框类型（text/number 等）
 * @returns 字段元素
 */
export function createInputField(
  label: string,
  value: string,
  placeholder: string,
  onChange: (value: string) => void,
  type: string = 'text'
): HTMLElement {
  const field = document.createElement('div')
  field.style.cssText = 'display: flex; flex-direction: column; gap: 6px;'

  const labelEl = document.createElement('label')
  labelEl.style.cssText = 'font-size: 13px; font-weight: 500; color: var(--b3-theme-on-background);'
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

/**
 * 创建手机端选择字段
 * @param label - 字段标签
 * @param value - 当前值
 * @param options - 选项数组
 * @param onChange - 值变化回调
 * @returns 字段元素
 */
export function createSelectField(
  label: string,
  value: string,
  options: Array<{ value: string; label: string }>,
  onChange: (value: string) => void
): HTMLElement {
  const field = document.createElement('div')
  field.style.cssText = 'display: flex; flex-direction: column; gap: 6px;'

  const labelEl = document.createElement('label')
  labelEl.style.cssText = 'font-size: 13px; font-weight: 500; color: var(--b3-theme-on-background);'
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

  select.addEventListener('change', () => {
    onChange(select.value)
  })

  field.appendChild(labelEl)
  field.appendChild(select)
  return field
}

/**
 * 创建手机端文本域字段
 * @param label - 字段标签
 * @param value - 当前值
 * @param placeholder - 占位符文本
 * @param onChange - 值变化回调
 * @returns 字段元素
 */
export function createTextareaField(
  label: string,
  value: string,
  placeholder: string,
  onChange: (value: string) => void
): HTMLElement {
  const field = document.createElement('div')
  field.style.cssText = 'display: flex; flex-direction: column; gap: 6px;'

  const labelEl = document.createElement('label')
  labelEl.style.cssText = 'font-size: 13px; font-weight: 500; color: var(--b3-theme-on-background);'
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
    min-height: 20px;
    box-sizing: border-box;
    width: 100%;
  `
  textarea.onchange = () => onChange(textarea.value)

  field.appendChild(labelEl)
  field.appendChild(textarea)
  return field
}

/**
 * 创建手机端开关字段
 * @param label - 字段标签
 * @param checked - 是否选中
 * @param onChange - 值变化回调
 * @returns 字段元素
 */
export function createSwitchField(
  label: string,
  checked: boolean,
  onChange: (value: boolean) => void
): HTMLElement {
  const field = document.createElement('div')
  field.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 4px 0;'

  const labelEl = document.createElement('label')
  labelEl.style.cssText = 'font-size: 13px; font-weight: 500; color: var(--b3-theme-on-background);'
  labelEl.textContent = label

  const switchEl = document.createElement('input')
  switchEl.type = 'checkbox'
  switchEl.className = 'b3-switch'
  switchEl.checked = checked
  switchEl.style.cssText = 'transform: scale(1.2);'
  switchEl.onchange = () => onChange(switchEl.checked)

  field.appendChild(labelEl)
  field.appendChild(switchEl)
  return field
}

/**
 * 创建手机端图标字段（支持 emoji 和 lucide 图标）
 * @param label - 字段标签
 * @param value - 当前图标值
 * @param onChange - 值变化回调
 * @param showIconPickerFn - 显示图标选择器的函数
 * @returns 字段元素
 */
export function createIconField(
  label: string,
  value: string,
  onChange: (value: string) => void,
  showIconPickerFn: (currentValue: string, onSelect: (icon: string) => void, iconSize?: number) => void,
  iconSize?: number
): HTMLElement {
  const field = document.createElement('div')
  field.style.cssText = 'display: flex; flex-direction: column; gap: 6px;'

  // 标题行：仅标签
  const labelRow = document.createElement('div')
  labelRow.style.cssText = 'display: flex; align-items: center;'

  const labelEl = document.createElement('label')
  labelEl.style.cssText = 'font-size: 13px; font-weight: 500; color: var(--b3-theme-on-background);'
  labelEl.textContent = label

  labelRow.appendChild(labelEl)

  const inputWrapper = document.createElement('div')
  inputWrapper.style.cssText = 'display: flex; gap: 8px; align-items: center;'

  // 图标展示区域（代替输入框）
  const iconDisplay = document.createElement('div')
  iconDisplay.className = 'b3-text-field'
  iconDisplay.style.cssText = `
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 36px;
    cursor: pointer;
    background: var(--b3-theme-background);
    border-radius: 6px;
    border: 1px solid var(--b3-border-color);
  `
  iconDisplay.title = '点击选择图标'

  // 图标容器
  const iconContainer = document.createElement('span')
  iconContainer.style.cssText = `
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
  `
  updateIconDisplay(iconContainer, value)
  iconDisplay.appendChild(iconContainer)

  // 隐藏的实际值存储
  const hiddenInput = document.createElement('input')
  hiddenInput.type = 'hidden'
  hiddenInput.value = value

  // 点击图标区域或选择按钮都打开图标选择器
  const openIconPicker = () => {
    showIconPickerFn(hiddenInput.value, (selectedIcon) => {
      hiddenInput.value = selectedIcon
      onChange(selectedIcon)
      updateIconDisplay(iconContainer, selectedIcon)
    }, iconSize)
  }

  iconDisplay.onclick = openIconPicker

  inputWrapper.appendChild(iconDisplay)
  inputWrapper.appendChild(hiddenInput)

  // 提示信息
  const hint = document.createElement('div')
  hint.style.cssText = 'font-size: 10px; color: var(--b3-theme-on-surface-light); margin-top: 2px;'
  hint.textContent = '点击输入框选择图标'

  field.appendChild(labelRow)
  field.appendChild(inputWrapper)
  field.appendChild(hint)
  return field
}
