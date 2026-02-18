/**
 * 手机端按钮列表项模块
 * 负责创建和管理移动端的按钮配置界面
 */

import { ButtonConfig } from '../../toolbarManager'
import { showClickSequenceSelector } from '../clickSequenceSelector'
import { showButtonSelector, ButtonInfo } from '../buttonSelector'
import {
  createInputField,
  createSelectField,
  createTextareaField,
  createSwitchField,
  createIconField,
  createLineNumberedTextarea,
  updateIconDisplay
} from '../fields'
import { showConfirmDialog as showConfirmDialogModal } from '../dialog'
import { showIconPicker as showIconPickerModal } from '../iconPicker'

/**
 * 手机端按钮上下文接口
 * 使用依赖注入模式，提供插件实例的方法访问
 */
export interface MobileButtonContext {
  isAuthorToolActivated: () => boolean
  showConfirmDialog: (message: string) => Promise<boolean>
  showIconPicker: (currentValue: string, onSelect: (icon: string) => void) => void
  showButtonIdPicker: (currentValue: string, onSelect: (result: ButtonInfo) => void) => void
  buttonConfigs: ButtonConfig[]
  mobileButtonConfigs: ButtonConfig[]
  recalculateOverflow: () => void
}

/**
 * 创建手机端按钮列表项
 * @param button - 按钮配置对象
 * @param index - 按钮索引
 * @param renderList - 重新渲染列表的回调函数
 * @param configsArray - 按钮配置数组
 * @param context - 依赖注入的上下文对象
 * @returns 按钮列表项元素
 */
export function createMobileButtonItem(
  button: ButtonConfig,
  index: number,
  renderList: () => void,
  configsArray: ButtonConfig[],
  context: MobileButtonContext
): HTMLElement {
  const isOverflowButton = button.id === 'overflow-button-mobile'
  const item = document.createElement('div')
  // 扩展工具栏按钮使用特殊样式凸显
  if (isOverflowButton) {
    item.style.cssText = `
      border: 2px solid var(--b3-theme-primary);
      border-radius: 6px;
      padding: 12px;
      background: linear-gradient(135deg, rgba(66, 133, 244, 0.1), rgba(102, 126, 234, 0.08));
      box-shadow: 0 2px 8px rgba(66, 133, 244, 0.2);
      position: relative;
      transition: all 0.2s ease;
    `
  } else {
    item.style.cssText = `
      border: 1px solid var(--b3-border-color);
      border-radius: 6px;
      padding: 12px;
      background: var(--b3-theme-surface);
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      position: relative;
      transition: all 0.2s ease;
    `
  }
  // 扩展工具栏按钮不可拖动
  item.draggable = !isOverflowButton

  let isExpanded = false

  // 触摸拖拽相关变量
  let touchStartY = 0
  let touchStartTime = 0
  let isDragging = false
  let longPressTimer: number | null = null
  let draggedElement: HTMLElement | null = null
  let placeholder: HTMLElement | null = null
  let initialTouchY = 0

  // 桌面端拖拽事件（扩展工具栏按钮跳过）
  if (!isOverflowButton) {
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

        // 重新计算溢出层级
        context.recalculateOverflow()
        renderList()
      }
    }
  }

  // 移动端触摸拖拽事件（扩展工具栏按钮跳过）
  const handleTouchStart = (e: TouchEvent) => {
    // 扩展工具栏按钮不可拖动
    if (isOverflowButton) return
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

        // 重新计算溢出层级
        context.recalculateOverflow()
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
  updateIconDisplay(iconSpan, button.icon)

  const infoDiv = document.createElement('div')
  infoDiv.style.cssText = 'flex: 1; min-width: 0;'
  const typeLabels: Record<string, string> = {
    'builtin': '①思源内置功能【简单】',
    'template': '②手写模板插入【简单】',
    'shortcut': '③电脑端快捷键【简单】',
    'click-sequence': '④自动化模拟点击【难】',
    'quick-note': '⑤一键记事【简单】',
    'author-tool': '⑥鲸鱼定制工具箱'
  }
  const typeLabel = typeLabels[button.type] || button.type

  // 获取溢出层级信息
  const overflowLevel = button.overflowLevel ?? 0
  const overflowBtn = context.mobileButtonConfigs.find(btn => btn.id === 'overflow-button-mobile')
  const isOverflowEnabled = overflowBtn?.enabled !== false
  const overflowLayers = (overflowBtn?.layers || 1)

  // 只有在扩展工具栏启用时才显示层级信息
  let levelLabel = ''
  if (isOverflowEnabled && overflowLevel > 0) {
    levelLabel = `<span style="color: var(--b3-theme-primary); font-weight: 600;">第${overflowLevel}层</span>`
  } else if (isOverflowEnabled && overflowLevel === 0) {
    levelLabel = `<span style="color: #22c55e; font-weight: 600;"> · 常见</span>`
  }

  const isAuthorTool = button.type === 'author-tool'
  const typeStyle = isAuthorTool
    ? 'font-size: 11px; color: #a855f7; font-weight: 600;'
    : 'font-size: 11px; color: var(--b3-theme-on-surface-light);'
  infoDiv.innerHTML = `
    <div style="font-weight: 500; font-size: 14px; color: var(--b3-theme-on-background); margin-bottom: 4px;">${button.name}</div>
    <div style="${typeStyle}">
      ${typeLabel}${levelLabel}
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
    if (await context.showConfirmDialog(`确定删除"${button.name}"？`)) {
      // 从配置数组中删除
      const realIndex = configsArray.findIndex(btn => btn.id === button.id)
      if (realIndex !== -1) {
        configsArray.splice(realIndex, 1)
        // 确保排序值连续
        configsArray.sort((a, b) => a.sort - b.sort).forEach((btn, idx) => {
          btn.sort = idx + 1
        })
        // 重新计算溢出层级
        context.recalculateOverflow()
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
    // 重新计算溢出层级（启用/禁用会影响按钮是否显示）
    context.recalculateOverflow()
    renderList()
  }
  // 根据启用状态设置透明度
  if (button.enabled === false) {
    item.style.opacity = '0.5'
  }

  // 扩展工具栏按钮不显示拖动手柄和删除按钮
  if (!isOverflowButton) {
    header.appendChild(dragHandle)
  }
  header.appendChild(iconSpan)
  header.appendChild(infoDiv)
  header.appendChild(expandIcon)
  header.appendChild(enabledToggle)
  if (!isOverflowButton) {
    header.appendChild(deleteBtn)
  }

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
  const nameField = createInputField('名称', button.name, '按钮显示名称', (v) => {
    button.name = v
    infoDiv.querySelector('div:first-child')!.textContent = v
  })
  editForm.appendChild(nameField)
  const nameInput = nameField.querySelector('input') as HTMLInputElement

  // 扩展工具栏按钮：添加层数配置，跳过类型选择
  if (isOverflowButton) {
    // 层数设置容器（凸显样式）
    const layersContainer = document.createElement('div')
    layersContainer.style.cssText = `
      padding: 12px;
      border: 2px solid var(--b3-theme-primary);
      border-radius: 6px;
      background: linear-gradient(135deg, rgba(66, 133, 244, 0.1), rgba(102, 126, 234, 0.08));
    `

    // 层数输入
    const layersField = createInputField('扩展工具栏层数', (button.layers || 1).toString(), '1-5层，点击后弹出对应层数的工具栏', (v) => {
      let num = parseInt(v) || 1
      if (num < 1) num = 1
      if (num > 5) num = 5
      button.layers = num
      // 重新计算溢出层级
      context.recalculateOverflow()
      renderList()
    }, 'number')
    layersField.querySelector('input')!.min = '1'
    layersField.querySelector('input')!.max = '5'
    layersContainer.appendChild(layersField)

    // 说明文字
    const descDiv = document.createElement('div')
    descDiv.style.cssText = `
      margin-top: 10px;
      padding: 10px;
      background: var(--b3-theme-background);
      border-radius: 4px;
      font-size: 12px;
      line-height: 1.6;
      color: var(--b3-theme-on-surface);
    `
    descDiv.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 6px; color: var(--b3-theme-primary);">💡 扩展工具栏说明</div>
      <div>• <strong>关闭按钮</strong>：只显示思源默认工具栏</div>
      <div>• <strong>开启按钮</strong>：工具栏第一位显示"⋯"按钮</div>
      <div>• <strong>点击"⋯"</strong>：弹出扩展工具栏</div>
      <div style="margin-top: 4px;">📊 <strong>层数设置</strong>：1层=1个工具栏，最多5层</div>
    `
    layersContainer.appendChild(descDiv)

    editForm.appendChild(layersContainer)
  } else {
    // 类型选择 - 普通按钮显示
    const typeOptions = [
      { value: 'builtin', label: '①思源内置功能【简单】' },
      { value: 'template', label: '②手写模板插入【简单】' },
      { value: 'shortcut', label: '③电脑端快捷键【简单】' },
      { value: 'click-sequence', label: '④自动化模拟点击【难】' },
      { value: 'quick-note', label: '⑤一键记事【简单】' }
    ]
    if (context.isAuthorToolActivated()) {
      typeOptions.push(
        { value: 'author-tool', label: '⑥鲸鱼定制工具箱' }
      )
    }
    const typeField = createSelectField('选择功能', button.type, typeOptions, (v) => {
      button.type = v as any
      updateTypeFields()
    })
    editForm.appendChild(typeField)
  }

  // 类型相关字段的容器（扩展工具栏按钮不显示）
  const typeFieldsContainer = document.createElement('div')
  typeFieldsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 10px;'
  if (!isOverflowButton) {
    editForm.appendChild(typeFieldsContainer)
  }

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
      input.className = 'b3-text-field'
      input.style.cssText = 'flex: 1;'

      const selectBtn = document.createElement('button')
      selectBtn.className = 'b3-button b3-button--outline'
      selectBtn.textContent = '选择'
      selectBtn.style.cssText = 'padding: 6px 12px; font-size: 13px; flex-shrink: 0; white-space: nowrap;'

      input.oninput = () => {
        button.builtinId = input.value
      }

      selectBtn.onclick = () => {
        context.showButtonIdPicker(input.value, (result) => {
          input.value = result.id
          button.builtinId = result.id
          // 自动填充名称和图标
          button.name = result.name
          button.icon = result.icon
          // 更新显示
          infoDiv.querySelector('div:first-child')!.textContent = result.name
          updateIconDisplay(iconSpan, result.icon)
          // 同步更新名称和图标输入框
          if (nameInput) nameInput.value = result.name
          if (iconInput) iconInput.value = result.icon
          if (iconPreview) updateIconDisplay(iconPreview, result.icon)
        })
      }

      inputWrapper.appendChild(input)
      inputWrapper.appendChild(selectBtn)
      builtinContainer.appendChild(label)
      builtinContainer.appendChild(inputWrapper)
      typeFieldsContainer.appendChild(builtinContainer)
    } else if (button.type === 'template') {
      const templateContainer = document.createElement('div')
      templateContainer.style.cssText = 'display: flex; flex-direction: column; gap: 6px;'

      const textarea = createTextareaField('模板内容', button.template || '', '插入的文本', (v) => { button.template = v })
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
      
      // 笔记本ID配置（可选）
      const notebookIdLabel = document.createElement('label')
      notebookIdLabel.textContent = '📚 追加到每日笔记（可选）'
      notebookIdLabel.style.cssText = 'font-size: 13px; font-weight: 500; margin-top: 8px;'
      templateContainer.appendChild(notebookIdLabel)
      
      const notebookIdInput = document.createElement('input')
      notebookIdInput.type = 'text'
      notebookIdInput.className = 'b3-text-field'
      notebookIdInput.placeholder = '笔记本ID，留空则在当前编辑器插入'
      notebookIdInput.value = button.templateNotebookId || ''
      notebookIdInput.style.cssText = 'font-size: 13px;'
      notebookIdInput.onchange = () => { button.templateNotebookId = notebookIdInput.value }
      templateContainer.appendChild(notebookIdInput)
      
      const notebookIdHint = document.createElement('div')
      notebookIdHint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light);'
      notebookIdHint.textContent = '💡 填写笔记本ID后，点击按钮将直接追加到该笔记本的每日笔记'
      templateContainer.appendChild(notebookIdHint)
      
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
        const isMobileConfig = configsArray === context.mobileButtonConfigs
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
      const textareaContainer = createLineNumberedTextarea(
        button.clickSequence?.join('\n') || '',
        (value) => {
          button.clickSequence = value.split('\n').filter(line => line.trim())
        }
      )
      clickSequenceContainer.appendChild(textareaContainer)

      const hint = document.createElement('div')
      hint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light); padding-left: 4px;'
      hint.innerHTML = '<div style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(139, 92, 246, 0.1)); border: 1px solid rgba(59, 130, 246, 0.4); border-radius: 6px; padding: 8px 12px; margin-bottom: 10px;"><strong style="color: var(--b3-theme-primary);">🌟 社区可用代码分享（推荐）</strong><br><a href="https://ld246.com/article/1771266377449" target="_blank" style="color: var(--b3-theme-primary); text-decoration: none; font-weight: 500;">https://ld246.com/article/1771266377449</a></div>💡 每行填写一个选择器，支持：<br>• 简单标识符（如 barSettings）<br>• CSS选择器（如 #barSettings）<br>• <strong>文本内容（如 text:复制块引用）</strong><br><a href="https://github.com/HaoCeans/siyuan-toolbar-customizer/blob/main/README_BUILTIN_IDS.md" target="_blank" style="color: var(--b3-theme-primary); text-decoration: none; font-weight: 500;">思源笔记常用功能 ID 速查表（GitHub）</a><br><a href="https://github.com/HaoCeans/siyuan-toolbar-customizer/blob/main/README_CLICK_SEQUENCE.md" target="_blank" style="color: var(--b3-theme-primary); text-decoration: none; font-weight: 500;">模拟点击序列使用说明（GitHub）</a><br><a href="#" id="view-common-ids-link" style="color: var(--b3-theme-primary); text-decoration: none; font-weight: 500;">查看常用ID（部分） →</a>'

      // 绑定"查看常用ID（部分）"链接点击事件
      const link = hint.querySelector('#view-common-ids-link')
      if (link) {
        (link as HTMLElement).onclick = (e) => {
          e.preventDefault()
          setTimeout(() => {
            const settingItems = Array.from(document.querySelectorAll('.b3-label'))
            const helpSection = settingItems.find(item => {
              const descEl = item.querySelector('.b3-label__text')
              const text = descEl?.textContent
              return descEl && text?.includes('思源内置菜单ID参考')
            })

            if (helpSection) {
              helpSection.scrollIntoView({ behavior: 'smooth', block: 'center' })
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

      clickSequenceContainer.appendChild(hint)

      typeFieldsContainer.appendChild(clickSequenceContainer)
    } else if (button.type === 'shortcut') {
      // 快捷键配置
      const shortcutContainer = document.createElement('div')
      shortcutContainer.style.cssText = 'display: flex; flex-direction: column; gap: 6px;'

      const inputField = createInputField('快捷键组合', button.shortcutKey || '', '快捷键格式：Alt+5 / Ctrl+B等', (v) => { button.shortcutKey = v })
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
    } else if (button.type === 'author-tool') {
      // 鲸鱼定制工具箱配置
      const authorToolContainer = document.createElement('div')
      authorToolContainer.style.cssText = 'display: flex; flex-direction: column; gap: 10px; padding: 12px; background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(59, 130, 246, 0.08)); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 6px;'

      const header = document.createElement('div')
      header.style.cssText = 'display: flex; align-items: center; gap: 8px;'
      header.innerHTML = '<span style="font-size: 16px;">🔐</span><span style="font-weight: 600; color: #8b5cf6;">鲸鱼定制工具箱配置</span>'
      authorToolContainer.appendChild(header)

      const desc = document.createElement('div')
      desc.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface-light);'
      desc.textContent = '选择功能类型并配置相关参数。'
      authorToolContainer.appendChild(desc)

      // 子类型选择
      const subtypeLabel = document.createElement('label')
      subtypeLabel.textContent = '功能类型'
      subtypeLabel.style.cssText = 'font-size: 13px; font-weight: 500; margin-top: 8px;'
      authorToolContainer.appendChild(subtypeLabel)

      const subtypeSelect = document.createElement('select')
      subtypeSelect.className = 'b3-text-field'
      subtypeSelect.style.cssText = 'font-size: 13px; padding: 8px;'
      const currentSubtype = button.authorToolSubtype || 'button-sequence'
      subtypeSelect.innerHTML = `
        <option value="button-sequence" ${currentSubtype === 'button-sequence' ? 'selected' : ''}>① 连续点击自定义按钮</option>
        <option value="open-doc" ${currentSubtype === 'open-doc' ? 'selected' : ''}>② 打开指定ID块</option>
        <option value="database" ${currentSubtype === 'database' ? 'selected' : ''}>③ 数据库悬浮弹窗</option>
        <option value="diary-bottom" ${currentSubtype === 'diary-bottom' ? 'selected' : ''}>④ 日记底部</option>
        <option value="life-log" ${currentSubtype === 'life-log' ? 'selected' : ''}>⑤ 叶归LifeLog适配</option>
        <option value="popup-select" ${currentSubtype === 'popup-select' ? 'selected' : ''}>⑥ 弹窗框模板选择</option>
        <option value="scroll-doc" ${currentSubtype === 'scroll-doc' ? 'selected' : ''}>⑦ 滚动文档顶部或底部</option>
      `
      subtypeSelect.onchange = () => {
        button.authorToolSubtype = subtypeSelect.value as 'open-doc' | 'database' | 'diary-bottom' | 'life-log' | 'popup-select' | 'button-sequence' | 'scroll-doc'
        ;(subtypeSelect as any).refreshForm?.()
      }
      authorToolContainer.appendChild(subtypeSelect)

      // 打开指定ID块配置区
      const docConfigDiv = document.createElement('div')
      docConfigDiv.id = 'open-doc-config-mobile'

      docConfigDiv.appendChild(createInputField('📱 目标块ID', button.mobileTargetDocId || '', '如: 20251215234003-j3i7wjc 或 20251215234003-j3i7wjc-a1b2c3', (v) => { button.mobileTargetDocId = v }))

      // 添加提示
      const docHint = document.createElement('div')
      docHint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light); margin-top: 4px;'
      docHint.textContent = '💡 支持文档ID（打开文档）或块ID（打开文档并定位到该块）'
      docConfigDiv.appendChild(docHint)

      authorToolContainer.appendChild(docConfigDiv)

      // 数据库悬浮弹窗配置区
      const dbConfigDiv = document.createElement('div')
      dbConfigDiv.id = 'db-config-mobile'
      dbConfigDiv.style.cssText = 'display: flex; flex-direction: column; gap: 8px;'

      // 数据库块ID
      dbConfigDiv.appendChild(createInputField('数据库块ID', button.dbBlockId || '', '如: 20251215234003-j3i7wjc', (v) => { button.dbBlockId = v }))

      // 数据库ID
      dbConfigDiv.appendChild(createInputField('数据库ID（可选）', button.dbId || '', '如: 20251215234003-4kzcfp3', (v) => { button.dbId = v }))

      // 视图名称
      dbConfigDiv.appendChild(createInputField('视图名称', button.viewName || '', '如: 今日DO表格', (v) => { button.viewName = v }))

      // 主键列
      dbConfigDiv.appendChild(createInputField('主键列名称', button.primaryKeyColumn || 'DO', '如: DO', (v) => { button.primaryKeyColumn = v }))

      // 起始时间
      dbConfigDiv.appendChild(createInputField('起始时间', button.startTimeStr || 'now', 'now 或 HH:MM', (v) => { button.startTimeStr = v }))

      // 行间额外分钟
      dbConfigDiv.appendChild(createInputField('行间额外分钟数', (button.extraMinutes ?? 20).toString(), '如: 20', (v) => { button.extraMinutes = parseInt(v) || 20 }, 'number'))

      // 最大显示行数
      dbConfigDiv.appendChild(createInputField('最大显示行数', (button.maxRows ?? 5).toString(), '如: 5', (v) => { button.maxRows = parseInt(v) || 5 }, 'number'))

      // 显示模式
      const displayModeLabel = document.createElement('label')
      displayModeLabel.textContent = '显示模式'
      displayModeLabel.style.cssText = 'font-size: 13px; font-weight: 500;'
      dbConfigDiv.appendChild(displayModeLabel)

      const displayModeSelect = document.createElement('select')
      displayModeSelect.className = 'b3-text-field'
      displayModeSelect.style.cssText = 'font-size: 13px; padding: 8px;'
      const currentDisplayMode = button.dbDisplayMode || 'cards'
      displayModeSelect.innerHTML = `
        <option value="cards" ${currentDisplayMode === 'cards' ? 'selected' : ''}>卡片模式</option>
        <option value="table" ${currentDisplayMode === 'table' ? 'selected' : ''}>表格模式</option>
      `
      displayModeSelect.onchange = () => { button.dbDisplayMode = displayModeSelect.value as 'cards' | 'table' }
      dbConfigDiv.appendChild(displayModeSelect)

      // 要显示的列名
      dbConfigDiv.appendChild(createInputField('显示列名（逗号分隔）', (button.showColumns || []).join(','), 'DO,预计分钟,时间段', (v) => {
        button.showColumns = v.split(',').map(s => s.trim()).filter(s => s)
      }))

      // 时间段列名
      dbConfigDiv.appendChild(createInputField('时间段列名', button.timeRangeColumnName || '时间段', '如: 时间段', (v) => { button.timeRangeColumnName = v }))

      authorToolContainer.appendChild(dbConfigDiv)

      // 叶归LifeLog适配配置区
      const lifeLogConfigDiv = document.createElement('div')
      lifeLogConfigDiv.id = 'life-log-config-mobile'
      lifeLogConfigDiv.style.cssText = 'display: flex; flex-direction: column; gap: 8px;'
      
      // 笔记本ID输入
      const notebookIdLabel = document.createElement('label')
      notebookIdLabel.textContent = '📚 笔记本ID'
      notebookIdLabel.style.cssText = 'font-size: 13px; font-weight: 500;'
      lifeLogConfigDiv.appendChild(notebookIdLabel)
      
      const notebookIdInput = document.createElement('input')
      notebookIdInput.type = 'text'
      notebookIdInput.className = 'b3-text-field'
      notebookIdInput.placeholder = '请输入笔记本ID，如：20250101000000-aaaaaa'
      notebookIdInput.value = button.lifeLogNotebookId || ''
      notebookIdInput.style.cssText = 'font-size: 13px;'
      notebookIdInput.onchange = () => { button.lifeLogNotebookId = notebookIdInput.value }
      lifeLogConfigDiv.appendChild(notebookIdInput)
      
      const notebookIdHint = document.createElement('div')
      notebookIdHint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light);'
      notebookIdHint.textContent = '💡 指定内容将要追加到的笔记本ID，不能为空'
      lifeLogConfigDiv.appendChild(notebookIdHint)
      
      // 分类选项输入
      const categoriesLabel = document.createElement('label')
      categoriesLabel.textContent = '📝 分类选项（每行一个）'
      categoriesLabel.style.cssText = 'font-size: 13px; font-weight: 500; margin-top: 8px;'
      lifeLogConfigDiv.appendChild(categoriesLabel)

      const categoriesTextarea = document.createElement('textarea')
      categoriesTextarea.className = 'b3-text-field'
      categoriesTextarea.value = button.lifeLogCategories?.join('\n') || '学习\n工作\n生活'
      categoriesTextarea.placeholder = '每行输入一个分类，例如：\n学习\n工作\n生活'
      categoriesTextarea.rows = 4
      categoriesTextarea.style.cssText = 'font-size: 13px; resize: vertical; min-height: 100px;'
      categoriesTextarea.onchange = () => { 
        button.lifeLogCategories = categoriesTextarea.value.split('\n').map(cat => cat.trim()).filter(cat => cat)
      }
      lifeLogConfigDiv.appendChild(categoriesTextarea)

      const categoriesHint = document.createElement('div')
      categoriesHint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light);'
      categoriesHint.textContent = '💡 每行输入一个分类选项，点击按钮后会弹出选择对话框'
      lifeLogConfigDiv.appendChild(categoriesHint)

      authorToolContainer.appendChild(lifeLogConfigDiv)

      // 弹窗框模板选择配置区
      const popupSelectConfigDiv = document.createElement('div')
      popupSelectConfigDiv.id = 'popup-select-config-mobile'
      popupSelectConfigDiv.style.cssText = 'display: flex; flex-direction: column; gap: 8px;'

      const popupSelectTitle = document.createElement('label')
      popupSelectTitle.textContent = '📋 模板列表'
      popupSelectTitle.style.cssText = 'font-size: 13px; font-weight: 500;'
      popupSelectConfigDiv.appendChild(popupSelectTitle)

      const popupSelectHint = document.createElement('div')
      popupSelectHint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light);'
      popupSelectHint.textContent = '💡 左边填模板名称（显示在弹窗上），右边填插入的模板内容'
      popupSelectConfigDiv.appendChild(popupSelectHint)

      const popupSelectRowsContainer = document.createElement('div')
      popupSelectRowsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 6px;'
      popupSelectConfigDiv.appendChild(popupSelectRowsContainer)

      if (!button.popupSelectTemplates || button.popupSelectTemplates.length === 0) {
        button.popupSelectTemplates = [
          { name: '', content: '' },
          { name: '', content: '' },
          { name: '', content: '' }
        ]
      }

      const renderPopupSelectRows = () => {
        popupSelectRowsContainer.innerHTML = ''
        button.popupSelectTemplates!.forEach((tpl, idx) => {
          const row = document.createElement('div')
          row.style.cssText = 'display: flex; align-items: center; gap: 6px;'

          const nameInput = document.createElement('input')
          nameInput.type = 'text'
          nameInput.className = 'b3-text-field'
          nameInput.placeholder = '模板名称'
          nameInput.value = tpl.name
          nameInput.style.cssText = 'font-size: 13px; flex: 1; min-width: 0;'
          nameInput.onchange = () => { button.popupSelectTemplates![idx].name = nameInput.value }

          const contentInput = document.createElement('input')
          contentInput.type = 'text'
          contentInput.className = 'b3-text-field'
          contentInput.placeholder = '模板内容'
          contentInput.value = tpl.content
          contentInput.style.cssText = 'font-size: 13px; flex: 2; min-width: 0;'
          contentInput.onchange = () => { button.popupSelectTemplates![idx].content = contentInput.value }

          const deleteBtn = document.createElement('button')
          deleteBtn.textContent = '✕'
          deleteBtn.style.cssText = 'padding: 4px 8px; border: 1px solid var(--b3-border-color); border-radius: 4px; background: var(--b3-theme-surface); color: var(--b3-theme-on-surface); cursor: pointer; font-size: 12px; flex-shrink: 0;'
          deleteBtn.onclick = () => {
            if (button.popupSelectTemplates!.length > 1) {
              button.popupSelectTemplates!.splice(idx, 1)
              renderPopupSelectRows()
            }
          }

          row.appendChild(nameInput)
          row.appendChild(contentInput)
          row.appendChild(deleteBtn)
          popupSelectRowsContainer.appendChild(row)
        })
      }
      renderPopupSelectRows()

      const addRowBtn = document.createElement('button')
      addRowBtn.textContent = '+ 添加模板'
      addRowBtn.style.cssText = 'padding: 6px 12px; border: 1px dashed var(--b3-border-color); border-radius: 4px; background: var(--b3-theme-surface); color: var(--b3-theme-on-surface); cursor: pointer; font-size: 13px; align-self: flex-start;'
      addRowBtn.onclick = () => {
        button.popupSelectTemplates!.push({ name: '', content: '' })
        renderPopupSelectRows()
      }
      popupSelectConfigDiv.appendChild(addRowBtn)

      authorToolContainer.appendChild(popupSelectConfigDiv)

      // 连续点击自定义按钮配置区
      const buttonSequenceConfigDiv = document.createElement('div')
      buttonSequenceConfigDiv.id = 'button-sequence-config-mobile'
      buttonSequenceConfigDiv.style.cssText = 'display: flex; flex-direction: column; gap: 8px;'

      const buttonSequenceTitle = document.createElement('label')
      buttonSequenceTitle.textContent = '🔗 按钮序列'
      buttonSequenceTitle.style.cssText = 'font-size: 13px; font-weight: 500;'
      buttonSequenceConfigDiv.appendChild(buttonSequenceTitle)

      const buttonSequenceHint = document.createElement('div')
      buttonSequenceHint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light);'
      buttonSequenceHint.textContent = '💡 左边选择要点击的按钮，右边填点击后等待的间隔时间（毫秒）'
      buttonSequenceConfigDiv.appendChild(buttonSequenceHint)

      const buttonSequenceRowsContainer = document.createElement('div')
      buttonSequenceRowsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 6px;'
      buttonSequenceConfigDiv.appendChild(buttonSequenceRowsContainer)

      if (!button.buttonSequenceSteps || button.buttonSequenceSteps.length === 0) {
        button.buttonSequenceSteps = [
          { buttonName: '', delayMs: 200 },
          { buttonName: '', delayMs: 200 },
          { buttonName: '', delayMs: 200 }
        ]
      }

      // 获取可选择的按钮列表（排除当前按钮自己和扩展工具栏按钮，按 sort 排序）
      const getAvailableButtonsMobile = () => {
        return context.buttonConfigs
          .filter(btn => btn.id !== button.id && btn.id !== 'overflow-button-mobile')
          .sort((a, b) => a.sort - b.sort)
      }

      const renderButtonSequenceRows = () => {
        buttonSequenceRowsContainer.innerHTML = ''
        const availableButtons = getAvailableButtonsMobile()
        
        button.buttonSequenceSteps!.forEach((step, idx) => {
          const row = document.createElement('div')
          row.style.cssText = 'display: flex; align-items: center; gap: 6px;'

          // 改为下拉选择框
          const nameSelect = document.createElement('select')
          nameSelect.className = 'b3-select'
          
          // 使用 DOM 方式构建选项（避免 HTML 转义问题）
          const defaultOption = document.createElement('option')
          defaultOption.value = ''
          defaultOption.textContent = '-- 请选择按钮 --'
          nameSelect.appendChild(defaultOption)
          
          availableButtons.forEach((btn) => {
            const option = document.createElement('option')
            option.value = btn.id  // 使用按钮ID作为value，避免名称重复问题
            const iconDisplay = btn.icon.startsWith('icon') ? '⭐' : btn.icon
            option.textContent = `${iconDisplay} ${btn.name}`
            // 通过ID匹配当前选中的按钮
            const currentBtn = availableButtons.find(b => b.name === step.buttonName)
            if (currentBtn && currentBtn.id === btn.id) {
              option.selected = true
            }
            nameSelect.appendChild(option)
          })
          
          nameSelect.onchange = () => {
            // 根据选中的ID找到对应的按钮名称
            const selectedBtn = availableButtons.find(b => b.id === nameSelect.value)
            if (selectedBtn) {
              button.buttonSequenceSteps![idx].buttonName = selectedBtn.name
            }
          }

          const delayInput = document.createElement('input')
          delayInput.type = 'number'
          delayInput.className = 'b3-text-field'
          delayInput.placeholder = '间隔(ms)'
          delayInput.value = String(step.delayMs || 200)
          delayInput.style.cssText = 'font-size: 13px; flex: 1; min-width: 60px;'
          delayInput.onchange = () => { button.buttonSequenceSteps![idx].delayMs = parseInt(delayInput.value) || 200 }

          const deleteBtn = document.createElement('button')
          deleteBtn.textContent = '✕'
          deleteBtn.style.cssText = 'padding: 4px 8px; border: 1px solid var(--b3-border-color); border-radius: 4px; background: var(--b3-theme-surface); color: var(--b3-theme-on-surface); cursor: pointer; font-size: 12px; flex-shrink: 0;'
          deleteBtn.onclick = () => {
            if (button.buttonSequenceSteps!.length > 1) {
              button.buttonSequenceSteps!.splice(idx, 1)
              renderButtonSequenceRows()
            }
          }

          row.appendChild(nameSelect)
          row.appendChild(delayInput)
          row.appendChild(deleteBtn)
          buttonSequenceRowsContainer.appendChild(row)
        })
      }
      renderButtonSequenceRows()

      const addSequenceRowBtn = document.createElement('button')
      addSequenceRowBtn.textContent = '+ 添加步骤'
      addSequenceRowBtn.style.cssText = 'padding: 6px 12px; border: 1px dashed var(--b3-border-color); border-radius: 4px; background: var(--b3-theme-surface); color: var(--b3-theme-on-surface); cursor: pointer; font-size: 13px; align-self: flex-start;'
      addSequenceRowBtn.onclick = () => {
        button.buttonSequenceSteps!.push({ buttonName: '', delayMs: 200 })
        renderButtonSequenceRows()
      }
      buttonSequenceConfigDiv.appendChild(addSequenceRowBtn)

      authorToolContainer.appendChild(buttonSequenceConfigDiv)

      // 滚动文档配置区
      const scrollDocConfigDiv = document.createElement('div')
      scrollDocConfigDiv.id = 'scroll-doc-config-mobile'
      scrollDocConfigDiv.style.cssText = 'display: flex; flex-direction: column; gap: 8px;'

      const scrollDocTitle = document.createElement('label')
      scrollDocTitle.textContent = '📜 滚动方向'
      scrollDocTitle.style.cssText = 'font-size: 13px; font-weight: 500;'
      scrollDocConfigDiv.appendChild(scrollDocTitle)

      // 单选按钮组
      const radioContainer = document.createElement('div')
      radioContainer.style.cssText = 'display: flex; flex-direction: column; gap: 6px;'

      const currentDirection = button.scrollDirection || 'top'

      // 滚动到顶部选项
      const topRadioWrapper = document.createElement('label')
      topRadioWrapper.style.cssText = 'display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px;'
      const topRadio = document.createElement('input')
      topRadio.type = 'radio'
      topRadio.name = `scroll-direction-mobile-${button.id}`
      topRadio.value = 'top'
      topRadio.checked = currentDirection === 'top'
      topRadio.onchange = () => { button.scrollDirection = 'top' }
      topRadioWrapper.appendChild(topRadio)
      topRadioWrapper.appendChild(document.createTextNode('滚动文档顶部'))
      radioContainer.appendChild(topRadioWrapper)

      // 滚动到底部选项
      const bottomRadioWrapper = document.createElement('label')
      bottomRadioWrapper.style.cssText = 'display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px;'
      const bottomRadio = document.createElement('input')
      bottomRadio.type = 'radio'
      bottomRadio.name = `scroll-direction-mobile-${button.id}`
      bottomRadio.value = 'bottom'
      bottomRadio.checked = currentDirection === 'bottom'
      bottomRadio.onchange = () => { button.scrollDirection = 'bottom' }
      bottomRadioWrapper.appendChild(bottomRadio)
      bottomRadioWrapper.appendChild(document.createTextNode('滚动文档底部'))
      radioContainer.appendChild(bottomRadioWrapper)

      scrollDocConfigDiv.appendChild(radioContainer)
      authorToolContainer.appendChild(scrollDocConfigDiv)

      // 日记底部配置区（说明 + 笔记本ID + 等待时间配置）
      const diaryConfigDiv = document.createElement('div')
      diaryConfigDiv.id = 'diary-config-mobile'
      diaryConfigDiv.style.cssText = 'display: flex; flex-direction: column; gap: 10px; padding: 15px; background: linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(59, 130, 246, 0.1)); border-radius: 8px; border: 1px solid rgba(34, 197, 94, 0.3);'

      const diaryTitle = document.createElement('div')
      diaryTitle.style.cssText = 'font-size: 14px; font-weight: 600; color: #22c55e; display: flex; align-items: center; gap: 8px;'
      diaryTitle.innerHTML = '<span>📇</span><span>功能说明</span>'
      diaryConfigDiv.appendChild(diaryTitle)

      const diaryDesc = document.createElement('div')
      diaryDesc.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); line-height: 1.6;'
      diaryDesc.innerHTML = '此功能会：<br>1. 使用快捷键 <b>Alt+5</b> 或 API 打开日记<br>2. 自动滚动到文档底部<br>💡 配置笔记本ID后将直接使用API，无需弹窗选择'
      diaryConfigDiv.appendChild(diaryDesc)

      // 笔记本ID配置
      const diaryNotebookIdContainerMobile = document.createElement('div')
      diaryNotebookIdContainerMobile.style.cssText = 'display: flex; flex-direction: column; gap: 6px; margin-top: 8px;'

      const diaryNotebookIdLabelMobile = document.createElement('label')
      diaryNotebookIdLabelMobile.textContent = '📚 笔记本ID（可选）'
      diaryNotebookIdLabelMobile.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); font-weight: 500;'
      diaryNotebookIdContainerMobile.appendChild(diaryNotebookIdLabelMobile)

      const diaryNotebookIdInputMobile = document.createElement('input')
      diaryNotebookIdInputMobile.type = 'text'
      diaryNotebookIdInputMobile.value = button.diaryNotebookId || ''
      diaryNotebookIdInputMobile.placeholder = '留空则使用 Alt+5 快捷键，如：20250101000000-aaaaaa'
      diaryNotebookIdInputMobile.style.cssText = 'width: 100%; padding: 8px 12px; border: 1px solid var(--b3-border-color); border-radius: 4px; background: var(--b3-theme-background); color: var(--b3-theme-on-background); font-size: 14px;'
      diaryNotebookIdInputMobile.addEventListener('input', () => {
        button.diaryNotebookId = diaryNotebookIdInputMobile.value
      })
      diaryNotebookIdContainerMobile.appendChild(diaryNotebookIdInputMobile)

      const diaryNotebookIdHintMobile = document.createElement('div')
      diaryNotebookIdHintMobile.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface); opacity: 0.7;'
      diaryNotebookIdHintMobile.textContent = '💡 填写后将直接调用API创建日记，不会弹出选择框'
      diaryNotebookIdContainerMobile.appendChild(diaryNotebookIdHintMobile)

      diaryConfigDiv.appendChild(diaryNotebookIdContainerMobile)

      // 等待时间配置（移动端）
      const waitTimeContainer = document.createElement('div')
      waitTimeContainer.style.cssText = 'display: flex; flex-direction: column; gap: 6px; margin-top: 8px;'

      const waitTimeLabel = document.createElement('label')
      waitTimeLabel.textContent = '⏱ 移动端等待时间（毫秒）'
      waitTimeLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); font-weight: 500;'
      waitTimeContainer.appendChild(waitTimeLabel)

      const waitTimeInput = document.createElement('input')
      waitTimeInput.type = 'number'
      waitTimeInput.value = String(button.diaryWaitTime || 1000)
      waitTimeInput.min = '100'
      waitTimeInput.max = '10000'
      waitTimeInput.step = '100'
      waitTimeInput.style.cssText = 'width: 100%; padding: 8px 12px; border: 1px solid var(--b3-border-color); border-radius: 4px; background: var(--b3-theme-background); color: var(--b3-theme-on-background); font-size: 14px;'
      waitTimeInput.addEventListener('input', () => {
        button.diaryWaitTime = parseInt(waitTimeInput.value) || 1000
      })
      waitTimeContainer.appendChild(waitTimeInput)

      const waitTimeHint = document.createElement('div')
      waitTimeHint.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface); opacity: 0.7;'
      waitTimeHint.textContent = '💡 移动端加载日记较慢时可增加此值，默认 1000ms'
      waitTimeContainer.appendChild(waitTimeHint)

      diaryConfigDiv.appendChild(waitTimeContainer)

      authorToolContainer.appendChild(diaryConfigDiv)

      // 根据当前选择显示/隐藏配置区
      const updateVisibility = () => {
        const subtype = subtypeSelect.value
        if (subtype === 'database') {
          docConfigDiv.style.display = 'none'
          dbConfigDiv.style.display = 'flex'
          diaryConfigDiv.style.display = 'none'
          lifeLogConfigDiv.style.display = 'none'
          popupSelectConfigDiv.style.display = 'none'
          buttonSequenceConfigDiv.style.display = 'none'
          scrollDocConfigDiv.style.display = 'none'
        } else if (subtype === 'diary-bottom') {
          docConfigDiv.style.display = 'none'
          dbConfigDiv.style.display = 'none'
          diaryConfigDiv.style.display = 'flex'
          lifeLogConfigDiv.style.display = 'none'
          popupSelectConfigDiv.style.display = 'none'
          buttonSequenceConfigDiv.style.display = 'none'
          scrollDocConfigDiv.style.display = 'none'
        } else if (subtype === 'life-log') {
          docConfigDiv.style.display = 'none'
          dbConfigDiv.style.display = 'none'
          diaryConfigDiv.style.display = 'none'
          lifeLogConfigDiv.style.display = 'flex'
          popupSelectConfigDiv.style.display = 'none'
          buttonSequenceConfigDiv.style.display = 'none'
          scrollDocConfigDiv.style.display = 'none'
        } else if (subtype === 'popup-select') {
          docConfigDiv.style.display = 'none'
          dbConfigDiv.style.display = 'none'
          diaryConfigDiv.style.display = 'none'
          lifeLogConfigDiv.style.display = 'none'
          popupSelectConfigDiv.style.display = 'flex'
          buttonSequenceConfigDiv.style.display = 'none'
          scrollDocConfigDiv.style.display = 'none'
        } else if (subtype === 'button-sequence') {
          docConfigDiv.style.display = 'none'
          dbConfigDiv.style.display = 'none'
          diaryConfigDiv.style.display = 'none'
          lifeLogConfigDiv.style.display = 'none'
          popupSelectConfigDiv.style.display = 'none'
          buttonSequenceConfigDiv.style.display = 'flex'
          scrollDocConfigDiv.style.display = 'none'
        } else if (subtype === 'scroll-doc') {
          docConfigDiv.style.display = 'none'
          dbConfigDiv.style.display = 'none'
          diaryConfigDiv.style.display = 'none'
          lifeLogConfigDiv.style.display = 'none'
          popupSelectConfigDiv.style.display = 'none'
          buttonSequenceConfigDiv.style.display = 'none'
          scrollDocConfigDiv.style.display = 'flex'
        } else {
          docConfigDiv.style.display = 'flex'
          dbConfigDiv.style.display = 'none'
          diaryConfigDiv.style.display = 'none'
          lifeLogConfigDiv.style.display = 'none'
          popupSelectConfigDiv.style.display = 'none'
          buttonSequenceConfigDiv.style.display = 'none'
          scrollDocConfigDiv.style.display = 'none'
        }
      }
      ;(subtypeSelect as any).refreshForm = updateVisibility
      updateVisibility()

      typeFieldsContainer.appendChild(authorToolContainer)
    } else if (button.type === 'quick-note') {
      // 一键记事配置（单选模式）
      const quickNoteContainer = document.createElement('div');
      quickNoteContainer.style.cssText = 'display: flex; flex-direction: column; gap: 12px; padding: 12px; background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.08)); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 6px;';

      const header = document.createElement('div');
      header.style.cssText = 'display: flex; align-items: center; gap: 8px;';
      header.innerHTML = '<span style="font-size: 16px;">📝</span><span style="font-weight: 600; color: #3b82f6;">一键记事配置</span>';
      quickNoteContainer.appendChild(header);

      const desc = document.createElement('div');
      desc.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface-light);';
      desc.textContent = '选择保存方式并配置目标ID，点击按钮后直接进入记事编辑界面。';
      quickNoteContainer.appendChild(desc);

      // 保存方式选择
      const saveTypeLabel = document.createElement('label');
      saveTypeLabel.textContent = '💾 保存方式选择';
      saveTypeLabel.style.cssText = 'font-size: 13px; font-weight: 500; margin-top: 8px;';
      quickNoteContainer.appendChild(saveTypeLabel);

      // 单选按钮组
      const radioContainer = document.createElement('div');
      radioContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px; margin-top: 4px;';

      const options = [
        { value: 'daily', label: '📘 保存到笔记本日记', description: '内容保存到指定笔记本的当日日记' },
        { value: 'document', label: '📄 追加到指定文档', description: '内容直接追加到指定文档底部' }
      ];

      // 获取当前配置
      const currentSaveType = button.quickNoteSaveType || 'daily';

      options.forEach(option => {
        const optionDiv = document.createElement('div');
        optionDiv.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 8px; border: 1px solid var(--b3-border-color); border-radius: 6px; cursor: pointer;';

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'quickNoteSaveType';
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
        optionDiv.onclick = () => {
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
          button.quickNoteSaveType = option.value as 'daily' | 'document';
          
          // 设置当前选项的选中样式
          optionDiv.style.borderColor = 'var(--b3-theme-primary)';
          optionDiv.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
          
          // 更新ID输入框提示
          updateIdInputPlaceholder();
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

      quickNoteContainer.appendChild(radioContainer);

      // 统一的ID输入框
      const idLabel = document.createElement('label');
      idLabel.id = 'quick-note-id-label';
      idLabel.style.cssText = 'font-size: 13px; font-weight: 500; margin-top: 12px;';
      quickNoteContainer.appendChild(idLabel);

      const idInput = document.createElement('input');
      idInput.type = 'text';
      idInput.className = 'b3-text-field';
      idInput.id = 'quick-note-id-input';
      idInput.style.cssText = 'font-size: 13px;';

      // 根据选择类型更新输入框
      function updateIdInputPlaceholder() {
        const saveType = button.quickNoteSaveType || 'daily';
        const labelEl = quickNoteContainer.querySelector('#quick-note-id-label') as HTMLLabelElement;
        const inputEl = quickNoteContainer.querySelector('#quick-note-id-input') as HTMLInputElement;

        // 添加空值检查
        if (!labelEl || !inputEl) {
          return;
        }

        if (saveType === 'document') {
          labelEl.textContent = '📄 目标文档ID';
          inputEl.placeholder = '请输入文档ID，如：20250101000000-aaaaaa';
          inputEl.value = button.quickNoteDocumentId || '';
        } else {
          labelEl.textContent = '📘 目标笔记本ID';
          inputEl.placeholder = '请粘贴DailyNote所在笔记本ID';
          inputEl.value = button.quickNoteNotebookId || '';
        }
      }

      // 初始化显示 - 使用setTimeout确保DOM已渲染
      setTimeout(() => {
        updateIdInputPlaceholder();
      }, 0);

      idInput.onchange = () => {
        const saveType = button.quickNoteSaveType || 'daily';
        const value = idInput.value.trim();
        
        if (saveType === 'document') {
          button.quickNoteDocumentId = value;
          // 清空笔记本ID避免混淆
          button.quickNoteNotebookId = '';
        } else {
          button.quickNoteNotebookId = value;
          // 清空文档ID避免混淆
          button.quickNoteDocumentId = '';
        }
      };

      quickNoteContainer.appendChild(idInput);

      const idHint = document.createElement('div');
      idHint.id = 'quick-note-id-hint';
      idHint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light); margin-top: 4px;';
      quickNoteContainer.appendChild(idHint);

      // 更新提示文字
      function updateIdHint() {
        const saveType = button.quickNoteSaveType || 'daily';
        const idHint = quickNoteContainer.querySelector('#quick-note-id-hint') as HTMLDivElement;
        
        // 添加空值检查
        if (!idHint) {
          return;
        }
        
        if (saveType === 'document') {
          idHint.textContent = '💡 内容将直接追加到该文档底部';
        } else {
          idHint.textContent = '💡 内容将保存到该笔记本的当日日记中';
        }
      }

      updateIdHint();

      typeFieldsContainer.appendChild(quickNoteContainer);
    }
  }

  // 初始化类型字段（扩展工具栏按钮跳过）
  if (!isOverflowButton) {
    updateTypeFields()
  }

  // 图标输入框 - 需要保存引用以便在选择按钮时更新
  const iconField = createIconField('图标', button.icon, (v) => {
    button.icon = v
    // 更新显示的图标 - 使用特定的 class 来查找
    const iconSpan = item.querySelector('.toolbar-customizer-button-icon') as HTMLElement
    if (iconSpan) updateIconDisplay(iconSpan, v)
  }, context.showIconPicker)
  editForm.appendChild(iconField)
  const iconInput = iconField.querySelector('input') as HTMLInputElement
  const iconPreview = iconField.querySelector('span') as HTMLElement
  editForm.appendChild(createInputField('图标大小', button.iconSize.toString(), '18', (v) => { button.iconSize = parseInt(v) || 18 }, 'number'))
  editForm.appendChild(createInputField('按钮宽度', button.minWidth.toString(), '32', (v) => { button.minWidth = parseInt(v) || 32 }, 'number'))
  editForm.appendChild(createInputField('右边距', button.marginRight.toString(), '8', (v) => { button.marginRight = parseInt(v) || 8 }, 'number'))
  // 扩展工具栏按钮不显示排序字段（固定第一位）
  if (!isOverflowButton) {
    editForm.appendChild(createInputField('排序', button.sort.toString(), '数字越小越靠左', (v) => {
      button.sort = parseInt(v) || 1
      // 重新分配排序值
      const sortedButtons = [...context.buttonConfigs].sort((a, b) => a.sort - b.sort)
      sortedButtons.forEach((btn, idx) => {
        btn.sort = idx + 1
      })
      renderList()
    }, 'number'))
  }

  // 右上角提示开关（手机端）
  editForm.appendChild(createSwitchField('右上角提示', button.showNotification, (v) => {
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
