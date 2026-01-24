/**
 * 电脑端按钮列表项模块
 * 负责创建和管理桌面端的按钮配置界面
 */

import { ButtonConfig } from '../../toolbarManager'
import { showClickSequenceSelector } from '../clickSequenceSelector'
import {
  createDesktopField,
  createDesktopSelectField,
  createDesktopIconField,
  createLineNumberedTextarea,
  updateIconDisplay
} from '../fields'
import { showConfirmDialog as showConfirmDialogModal } from '../dialog'
import { showIconPicker as showIconPickerModal } from '../iconPicker'

/**
 * 电脑端按钮上下文接口
 * 使用依赖注入模式，提供插件实例的方法访问
 */
export interface DesktopButtonContext {
  isAuthorToolActivated: () => boolean
  showConfirmDialog: (message: string) => Promise<boolean>
  showIconPicker: (currentValue: string, onSelect: (icon: string) => void) => void
  buttonConfigs: ButtonConfig[]
}

/**
 * 创建电脑端按钮列表项
 * @param button - 按钮配置对象
 * @param index - 按钮索引
 * @param renderList - 重新渲染列表的回调函数
 * @param configsArray - 按钮配置数组
 * @param context - 依赖注入的上下文对象
 * @returns 按钮列表项元素
 */
export function createDesktopButtonItem(
  button: ButtonConfig,
  index: number,
  renderList: () => void,
  configsArray: ButtonConfig[],
  context: DesktopButtonContext
): HTMLElement {
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
  updateIconDisplay(iconSpan, button.icon)

  // 使用 infoDiv 来显示名称和类型描述（手机端风格）
  const infoDiv = document.createElement('div')
  infoDiv.style.cssText = 'flex: 1; min-width: 0;'
  const typeLabels: Record<string, string> = {
    'builtin': '①思源内置功能【简单】',
    'template': '①手写模板插入【简单】',
    'shortcut': '②电脑端快捷键【简单】',
    'click-sequence': '③自动化模拟点击【难】',
    'author-tool': '⑥作者自用工具'
  }
  const typeLabel = typeLabels[button.type] || button.type
  infoDiv.innerHTML = `
    <div style="font-weight: 500; font-size: 14px; color: var(--b3-theme-on-background); margin-bottom: 4px;">${button.name}</div>
    <div style="font-size: 11px; color: var(--b3-theme-on-surface-light);">
      ${typeLabel}
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
  const nameField = createDesktopField('名称', button.name, '按钮显示名称', (v) => {
    button.name = v
    infoDiv.querySelector('div:first-child')!.textContent = v
  })
  editForm.appendChild(nameField)

  // 构建功能类型选项数组（根据激活状态决定是否显示作者自用工具）
  const typeOptions = [
    { value: 'template', label: '①手写模板插入【简单】' },
    { value: 'shortcut', label: '②电脑端快捷键【简单】' },
    { value: 'click-sequence', label: '③自动化模拟点击【难】' }
  ]
  if (context.isAuthorToolActivated()) {
    typeOptions.push({ value: 'author-tool', label: '⑥作者自用工具' })
  }

  editForm.appendChild(createDesktopSelectField('选择功能', button.type, typeOptions, (v) => {
    button.type = v as any

    // 保存当前展开状态
    const wasExpanded = item.dataset.expanded === 'true'

    // 重新渲染表单
    const newForm = document.createElement('div')
    newForm.className = 'toolbar-customizer-edit-form'
    newForm.style.cssText = editForm.style.cssText
    newForm.style.display = wasExpanded ? 'flex' : 'none'
    populateDesktopEditForm(newForm, button, iconSpan, infoDiv, item, renderList, context)
    editForm.replaceWith(newForm)

    // 更新类型描述显示
    const typeDesc = infoDiv.querySelector('div:last-child')
    if (typeDesc) {
      const typeLabels: Record<string, string> = {
        'builtin': '①思源内置功能【简单】',
        'template': '①手写模板插入【简单】',
        'shortcut': '②电脑端快捷键【简单】',
        'click-sequence': '③自动化模拟点击【难】',
        'author-tool': '⑥作者自用工具'
      }
      typeDesc.textContent = typeLabels[button.type] || button.type
    }
  }))

  // 电脑端隐藏'思源内置功能'类型，代码保留以便后续使用
  // if (button.type === 'builtin') {
  //   const builtinContainer = document.createElement('div')
  //   builtinContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px;'

  //   builtinContainer.appendChild(createDesktopField('按钮选择器', button.builtinId || '', 'menuSearch', (v) => { button.builtinId = v }))

  //   const hint = document.createElement('div')
  //   hint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light); padding-left: 4px; display: flex; align-items: center; gap: 8px;'
  //   hint.innerHTML = '💡 支持: id、data-id、data-type、class、按钮文本 <a href="#" style="color: var(--b3-theme-primary); text-decoration: none; font-weight: 500;">查看常用ID →</a>'

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
  // }

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
  }

  if (button.type === 'click-sequence') {
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
    const textareaContainer = createLineNumberedTextarea(
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

  if (button.type === 'shortcut') {
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

  if (button.type === 'author-tool') {
    // 作者自用工具配置
    const authorToolField = document.createElement('div')
    authorToolField.style.cssText = 'display: flex; flex-direction: column; gap: 12px; padding: 12px; background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(59, 130, 246, 0.08)); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 6px;'

    const header = document.createElement('div')
    header.style.cssText = 'display: flex; align-items: center; gap: 8px;'
    header.innerHTML = '<span style="font-size: 16px;">🔐</span><span style="font-weight: 600; color: #8b5cf6;">作者自用工具配置</span>'
    authorToolField.appendChild(header)

    const desc = document.createElement('div')
    desc.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface-light);'
    desc.textContent = '选择功能类型并配置相关参数。'
    authorToolField.appendChild(desc)

    // 子类型选择
    const subtypeLabel = document.createElement('label')
    subtypeLabel.textContent = '功能类型'
    subtypeLabel.style.cssText = 'font-size: 13px; font-weight: 500; margin-top: 8px;'
    authorToolField.appendChild(subtypeLabel)

    const subtypeSelect = document.createElement('select')
    subtypeSelect.className = 'b3-text-field'
    subtypeSelect.style.cssText = 'font-size: 13px; padding: 8px;'
    const currentSubtype = button.authorToolSubtype || 'script'
    subtypeSelect.innerHTML = `
      <option value="script" ${currentSubtype === 'script' ? 'selected' : ''}>① 自定义脚本</option>
      <option value="database" ${currentSubtype === 'database' ? 'selected' : ''}>② 数据库查询</option>
      <option value="diary-bottom" ${currentSubtype === 'diary-bottom' ? 'selected' : ''}>③ 日记底部</option>
    `
    subtypeSelect.onchange = () => {
      button.authorToolSubtype = subtypeSelect.value as 'script' | 'database' | 'diary-bottom'
      // 刷新表单以显示/隐藏相关配置
      if ((subtypeSelect as any).refreshForm) {
        (subtypeSelect as any).refreshForm()
      }
    }
    authorToolField.appendChild(subtypeSelect)

    // 自定义脚本配置区
    const scriptConfigDiv = document.createElement('div')
    scriptConfigDiv.id = 'script-config'
    scriptConfigDiv.style.cssText = 'display: flex; flex-direction: column; gap: 8px;'

    const scriptLabel = document.createElement('label')
    scriptLabel.textContent = '自定义脚本代码'
    scriptLabel.style.cssText = 'font-size: 13px; font-weight: 500;'
    scriptConfigDiv.appendChild(scriptLabel)

    const scriptInput = document.createElement('textarea')
    scriptInput.className = 'b3-text-field'
    scriptInput.placeholder = '在此输入自定义 JavaScript 代码...'
    scriptInput.value = button.authorScript || ''
    scriptInput.style.cssText = 'resize: vertical; min-height: 100px; font-family: monospace; font-size: 12px;'
    scriptInput.onchange = () => { button.authorScript = scriptInput.value }
    scriptConfigDiv.appendChild(scriptInput)

    const scriptHint = document.createElement('div')
    scriptHint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light);'
    scriptHint.textContent = '可用变量: config, fetchSyncPost, showMessage'
    scriptConfigDiv.appendChild(scriptHint)

    // 目标文档ID（脚本模式使用）
    const docIdLabel = document.createElement('label')
    docIdLabel.textContent = '目标文档ID'
    docIdLabel.style.cssText = 'font-size: 13px; font-weight: 500; margin-top: 4px;'
    scriptConfigDiv.appendChild(docIdLabel)

    const docIdInput = document.createElement('input')
    docIdInput.type = 'text'
    docIdInput.className = 'b3-text-field'
    docIdInput.placeholder = '输入要打开的文档ID...'
    docIdInput.value = button.targetDocId || ''
    docIdInput.style.cssText = 'font-size: 13px;'
    docIdInput.onchange = () => { button.targetDocId = docIdInput.value }
    scriptConfigDiv.appendChild(docIdInput)

    authorToolField.appendChild(scriptConfigDiv)

    // 数据库查询配置区
    const dbConfigDiv = document.createElement('div')
    dbConfigDiv.id = 'db-config'
    dbConfigDiv.style.cssText = 'display: flex; flex-direction: column; gap: 10px; padding: 10px; background: rgba(255, 255, 255, 0.5); border-radius: 6px;'

    // 日记底部配置区（说明）
    const diaryConfigDiv = document.createElement('div')
    diaryConfigDiv.id = 'diary-config'
    diaryConfigDiv.style.cssText = 'display: flex; flex-direction: column; gap: 10px; padding: 15px; background: linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(59, 130, 246, 0.1)); border-radius: 8px; border: 1px solid rgba(34, 197, 94, 0.3);'

    const diaryTitle = document.createElement('div')
    diaryTitle.style.cssText = 'font-size: 14px; font-weight: 600; color: #22c55e; display: flex; align-items: center; gap: 8px;'
    diaryTitle.innerHTML = '<span>📇</span><span>功能说明</span>'
    diaryConfigDiv.appendChild(diaryTitle)

    const diaryDesc = document.createElement('div')
    diaryDesc.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); line-height: 1.6;'
    diaryDesc.innerHTML = '此功能会：<br>1. 使用快捷键 <b>Alt+5</b> 打开日记<br>2. 自动滚动到文档底部<br><br>无需配置，点击按钮即可使用。'
    diaryConfigDiv.appendChild(diaryDesc)

    authorToolField.appendChild(diaryConfigDiv)

    // 数据库块ID
    const dbBlockIdLabel = document.createElement('label')
    dbBlockIdLabel.textContent = '数据库块ID'
    dbBlockIdLabel.style.cssText = 'font-size: 13px; font-weight: 500;'
    dbConfigDiv.appendChild(dbBlockIdLabel)

    const dbBlockIdInput = document.createElement('input')
    dbBlockIdInput.type = 'text'
    dbBlockIdInput.className = 'b3-text-field'
    dbBlockIdInput.placeholder = '如: 20251215234003-j3i7wjc'
    dbBlockIdInput.value = button.dbBlockId || ''
    dbBlockIdInput.style.cssText = 'font-size: 13px;'
    dbBlockIdInput.onchange = () => { button.dbBlockId = dbBlockIdInput.value }
    dbConfigDiv.appendChild(dbBlockIdInput)

    // 数据库ID（可选）
    const dbIdLabel = document.createElement('label')
    dbIdLabel.textContent = '数据库ID（可选，留空则从块ID获取）'
    dbIdLabel.style.cssText = 'font-size: 13px; font-weight: 500;'
    dbConfigDiv.appendChild(dbIdLabel)

    const dbIdInput = document.createElement('input')
    dbIdInput.type = 'text'
    dbIdInput.className = 'b3-text-field'
    dbIdInput.placeholder = '如: 20251215234003-4kzcfp3'
    dbIdInput.value = button.dbId || ''
    dbIdInput.style.cssText = 'font-size: 13px;'
    dbIdInput.onchange = () => { button.dbId = dbIdInput.value }
    dbConfigDiv.appendChild(dbIdInput)

    // 视图名称
    const viewNameLabel = document.createElement('label')
    viewNameLabel.textContent = '视图名称'
    viewNameLabel.style.cssText = 'font-size: 13px; font-weight: 500;'
    dbConfigDiv.appendChild(viewNameLabel)

    const viewNameInput = document.createElement('input')
    viewNameInput.type = 'text'
    viewNameInput.className = 'b3-text-field'
    viewNameInput.placeholder = '如: 今日DO表格'
    viewNameInput.value = button.viewName || ''
    viewNameInput.style.cssText = 'font-size: 13px;'
    viewNameInput.onchange = () => { button.viewName = viewNameInput.value }
    dbConfigDiv.appendChild(viewNameInput)

    // 主键列
    const primaryKeyLabel = document.createElement('label')
    primaryKeyLabel.textContent = '主键列名称（用于点击跳转）'
    primaryKeyLabel.style.cssText = 'font-size: 13px; font-weight: 500;'
    dbConfigDiv.appendChild(primaryKeyLabel)

    const primaryKeyInput = document.createElement('input')
    primaryKeyInput.type = 'text'
    primaryKeyInput.className = 'b3-text-field'
    primaryKeyInput.placeholder = '如: DO'
    primaryKeyInput.value = button.primaryKeyColumn || 'DO'
    primaryKeyInput.style.cssText = 'font-size: 13px;'
    primaryKeyInput.onchange = () => { button.primaryKeyColumn = primaryKeyInput.value }
    dbConfigDiv.appendChild(primaryKeyInput)

    // 起始时间
    const startTimeLabel = document.createElement('label')
    startTimeLabel.textContent = '起始时间（now 或 HH:MM）'
    startTimeLabel.style.cssText = 'font-size: 13px; font-weight: 500;'
    dbConfigDiv.appendChild(startTimeLabel)

    const startTimeInput = document.createElement('input')
    startTimeInput.type = 'text'
    startTimeInput.className = 'b3-text-field'
    startTimeInput.placeholder = '如: now 或 09:00'
    startTimeInput.value = button.startTimeStr || 'now'
    startTimeInput.style.cssText = 'font-size: 13px;'
    startTimeInput.onchange = () => { button.startTimeStr = startTimeInput.value }
    dbConfigDiv.appendChild(startTimeInput)

    // 行间额外分钟
    const extraMinutesLabel = document.createElement('label')
    extraMinutesLabel.textContent = '行间额外分钟数（第一行不加）'
    extraMinutesLabel.style.cssText = 'font-size: 13px; font-weight: 500;'
    dbConfigDiv.appendChild(extraMinutesLabel)

    const extraMinutesInput = document.createElement('input')
    extraMinutesInput.type = 'number'
    extraMinutesInput.className = 'b3-text-field'
    extraMinutesInput.placeholder = '如: 20'
    extraMinutesInput.value = (button.extraMinutes ?? 20).toString()
    extraMinutesInput.style.cssText = 'font-size: 13px;'
    extraMinutesInput.onchange = () => { button.extraMinutes = parseInt(extraMinutesInput.value) || 20 }
    dbConfigDiv.appendChild(extraMinutesInput)

    // 最大显示行数
    const maxRowsLabel = document.createElement('label')
    maxRowsLabel.textContent = '最大显示行数'
    maxRowsLabel.style.cssText = 'font-size: 13px; font-weight: 500;'
    dbConfigDiv.appendChild(maxRowsLabel)

    const maxRowsInput = document.createElement('input')
    maxRowsInput.type = 'number'
    maxRowsInput.className = 'b3-text-field'
    maxRowsInput.placeholder = '如: 5'
    maxRowsInput.value = (button.maxRows ?? 5).toString()
    maxRowsInput.style.cssText = 'font-size: 13px;'
    maxRowsInput.onchange = () => { button.maxRows = parseInt(maxRowsInput.value) || 5 }
    dbConfigDiv.appendChild(maxRowsInput)

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

    // 要显示的列名（逗号分隔）
    const showColumnsLabel = document.createElement('label')
    showColumnsLabel.textContent = '要显示的列名（逗号分隔）'
    showColumnsLabel.style.cssText = 'font-size: 13px; font-weight: 500;'
    dbConfigDiv.appendChild(showColumnsLabel)

    const showColumnsInput = document.createElement('input')
    showColumnsInput.type = 'text'
    showColumnsInput.className = 'b3-text-field'
    showColumnsInput.placeholder = '如: DO,预计分钟,时间段'
    showColumnsInput.value = (button.showColumns || []).join(',')
    showColumnsInput.style.cssText = 'font-size: 13px;'
    showColumnsInput.onchange = () => {
      button.showColumns = showColumnsInput.value.split(',').map(s => s.trim()).filter(s => s)
    }
    dbConfigDiv.appendChild(showColumnsInput)

    // 时间段列名
    const timeRangeColLabel = document.createElement('label')
    timeRangeColLabel.textContent = '时间段列名'
    timeRangeColLabel.style.cssText = 'font-size: 13px; font-weight: 500;'
    dbConfigDiv.appendChild(timeRangeColLabel)

    const timeRangeColInput = document.createElement('input')
    timeRangeColInput.type = 'text'
    timeRangeColInput.className = 'b3-text-field'
    timeRangeColInput.placeholder = '如: 时间段'
    timeRangeColInput.value = button.timeRangeColumnName || '时间段'
    timeRangeColInput.style.cssText = 'font-size: 13px;'
    timeRangeColInput.onchange = () => { button.timeRangeColumnName = timeRangeColInput.value }
    dbConfigDiv.appendChild(timeRangeColInput)

    authorToolField.appendChild(dbConfigDiv)

    // 根据当前选择显示/隐藏配置区
    const updateVisibility = () => {
      const subtype = subtypeSelect.value
      if (subtype === 'database') {
        scriptConfigDiv.style.display = 'none'
        dbConfigDiv.style.display = 'flex'
        diaryConfigDiv.style.display = 'none'
      } else if (subtype === 'diary-bottom') {
        scriptConfigDiv.style.display = 'none'
        dbConfigDiv.style.display = 'none'
        diaryConfigDiv.style.display = 'flex'
      } else {
        scriptConfigDiv.style.display = 'flex'
        dbConfigDiv.style.display = 'none'
        diaryConfigDiv.style.display = 'none'
      }
    }
    subtypeSelect.refreshForm = updateVisibility
    updateVisibility()

    editForm.appendChild(authorToolField)
  }

  editForm.appendChild(createDesktopIconField('图标', button.icon, (v) => {
    button.icon = v
    // 更新显示的图标
    updateIconDisplay(iconSpan, v)
  }, context.showIconPicker))
  editForm.appendChild(createDesktopField('图标大小', button.iconSize.toString(), '18', (v) => { button.iconSize = parseInt(v) || 18 }, 'number'))
  editForm.appendChild(createDesktopField('按钮宽度', button.minWidth.toString(), '32', (v) => { button.minWidth = parseInt(v) || 32 }, 'number'))
  editForm.appendChild(createDesktopField('右边距', button.marginRight.toString(), '8', (v) => { button.marginRight = parseInt(v) || 8 }, 'number'))
  editForm.appendChild(createDesktopField('排序', button.sort.toString(), '1', (v) => {
    button.sort = parseInt(v) || 1
    // 重新分配排序值
    const sortedButtons = [...context.buttonConfigs].sort((a, b) => a.sort - b.sort)
    sortedButtons.forEach((btn, idx) => {
      btn.sort = idx + 1
    })
    renderList()
  }, 'number'))

  // 右上角提示开关
  const notificationItem = document.createElement('div')
  notificationItem.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;'

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

/**
 * 填充电脑端编辑表单
 * @param form - 表单元素
 * @param button - 按钮配置对象
 * @param iconSpan - 图标显示元素
 * @param infoDiv - 信息显示元素
 * @param item - 列表项元素
 * @param renderList - 重新渲染列表的回调函数
 * @param context - 依赖注入的上下文对象
 */
export function populateDesktopEditForm(
  form: HTMLElement,
  button: ButtonConfig,
  iconSpan: HTMLElement,
  infoDiv: HTMLElement,
  item: HTMLElement,
  renderList: (() => void) | undefined,
  context: DesktopButtonContext
): void {
  form.appendChild(createDesktopField('名称', button.name, '按钮名称', (v) => {
    button.name = v
    const nameEl = infoDiv.querySelector('div:first-child')
    if (nameEl) nameEl.textContent = v
  }))
  // 构建功能类型选项数组（根据激活状态决定是否显示作者自用工具）
  const typeOptions = [
    { value: 'template', label: '①手写模板插入【简单】' },
    { value: 'shortcut', label: '②电脑端快捷键【简单】' },
    { value: 'click-sequence', label: '③自动化模拟点击【难】' }
  ]
  if (context.isAuthorToolActivated()) {
    typeOptions.push({ value: 'author-tool', label: '⑥作者自用工具' })
  }
  form.appendChild(createDesktopSelectField('选择功能', button.type, typeOptions, (v) => {
    button.type = v as any

    // 保存当前展开状态
    const wasExpanded = item.dataset.expanded === 'true'

    const newForm = document.createElement('div')
    newForm.className = 'toolbar-customizer-edit-form'
    newForm.style.cssText = form.style.cssText
    newForm.style.display = wasExpanded ? 'flex' : 'none'
    populateDesktopEditForm(newForm, button, iconSpan, infoDiv, item, renderList, context)
    form.replaceWith(newForm)

    // 更新类型描述显示
    const typeDesc = infoDiv.querySelector('div:last-child')
    if (typeDesc) {
      typeDesc.textContent = button.type === 'builtin' ? '①思源内置功能【简单】' : button.type === 'template' ? '①手写模板插入【简单】' : button.type === 'shortcut' ? '②电脑端快捷键【简单】' : button.type === 'click-sequence' ? '③自动化模拟点击【难】' : button.type === 'author-tool' ? '⑥作者自用工具' : button.type
    }
  }))

  // 电脑端隐藏'思源内置功能'类型，代码保留以便后续使用
  // if (button.type === 'builtin') {
  //   const builtinContainer = document.createElement('div')
  //   builtinContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px;'
  //
  //   builtinContainer.appendChild(createDesktopField('按钮选择器', button.builtinId || '', 'menuSearch', (v) => { button.builtinId = v }))
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
    const textareaContainer = createLineNumberedTextarea(
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

  if (button.type === 'author-tool') {
    // 作者自用工具配置
    const authorToolField = document.createElement('div')
    authorToolField.style.cssText = 'display: flex; flex-direction: column; gap: 12px; padding: 12px; background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(59, 130, 246, 0.08)); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 6px;'

    const header = document.createElement('div')
    header.style.cssText = 'display: flex; align-items: center; gap: 8px;'
    header.innerHTML = '<span style="font-size: 16px;">🔐</span><span style="font-weight: 600; color: #8b5cf6;">作者自用工具配置</span>'
    authorToolField.appendChild(header)

    const desc = document.createElement('div')
    desc.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface-light);'
    desc.textContent = '选择功能类型并配置相关参数。'
    authorToolField.appendChild(desc)

    // 子类型选择
    const subtypeLabel = document.createElement('label')
    subtypeLabel.textContent = '功能类型'
    subtypeLabel.style.cssText = 'font-size: 13px; font-weight: 500; margin-top: 8px;'
    authorToolField.appendChild(subtypeLabel)

    const subtypeSelect = document.createElement('select')
    subtypeSelect.className = 'b3-text-field'
    subtypeSelect.style.cssText = 'font-size: 13px; padding: 8px;'
    const currentSubtype = button.authorToolSubtype || 'script'
    subtypeSelect.innerHTML = `
      <option value="script" ${currentSubtype === 'script' ? 'selected' : ''}>① 自定义脚本</option>
      <option value="database" ${currentSubtype === 'database' ? 'selected' : ''}>② 数据库查询</option>
      <option value="diary-bottom" ${currentSubtype === 'diary-bottom' ? 'selected' : ''}>③ 日记底部</option>
    `
    subtypeSelect.onchange = () => {
      button.authorToolSubtype = subtypeSelect.value as 'script' | 'database' | 'diary-bottom'
      ;(subtypeSelect as any).refreshForm?.()
    }
    authorToolField.appendChild(subtypeSelect)

    // 自定义脚本配置区
    const scriptConfigDiv = document.createElement('div')
    scriptConfigDiv.id = 'script-config'
    scriptConfigDiv.style.cssText = 'display: flex; flex-direction: column; gap: 8px;'

    const scriptLabel = document.createElement('label')
    scriptLabel.textContent = '自定义脚本代码'
    scriptLabel.style.cssText = 'font-size: 13px; font-weight: 500;'
    scriptConfigDiv.appendChild(scriptLabel)

    const scriptInput = document.createElement('textarea')
    scriptInput.className = 'b3-text-field'
    scriptInput.placeholder = '在此输入自定义 JavaScript 代码...'
    scriptInput.value = button.authorScript || ''
    scriptInput.style.cssText = 'resize: vertical; min-height: 100px; font-family: monospace; font-size: 12px;'
    scriptInput.onchange = () => { button.authorScript = scriptInput.value }
    scriptConfigDiv.appendChild(scriptInput)

    const scriptHint = document.createElement('div')
    scriptHint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light);'
    scriptHint.textContent = '可用变量: config, fetchSyncPost, showMessage'
    scriptConfigDiv.appendChild(scriptHint)

    // 目标文档ID（脚本模式使用）
    const docIdLabel = document.createElement('label')
    docIdLabel.textContent = '目标文档ID'
    docIdLabel.style.cssText = 'font-size: 13px; font-weight: 500; margin-top: 4px;'
    scriptConfigDiv.appendChild(docIdLabel)

    const docIdInput = document.createElement('input')
    docIdInput.type = 'text'
    docIdInput.className = 'b3-text-field'
    docIdInput.placeholder = '输入要打开的文档ID...'
    docIdInput.value = button.targetDocId || ''
    docIdInput.style.cssText = 'font-size: 13px;'
    docIdInput.onchange = () => { button.targetDocId = docIdInput.value }
    scriptConfigDiv.appendChild(docIdInput)

    authorToolField.appendChild(scriptConfigDiv)

    // 数据库查询配置区
    const dbConfigDiv = document.createElement('div')
    dbConfigDiv.id = 'db-config'
    dbConfigDiv.style.cssText = 'display: flex; flex-direction: column; gap: 10px; padding: 10px; background: rgba(255, 255, 255, 0.5); border-radius: 6px;'

    // 数据库块ID
    const dbBlockIdLabel = document.createElement('label')
    dbBlockIdLabel.textContent = '数据库块ID'
    dbBlockIdLabel.style.cssText = 'font-size: 13px; font-weight: 500;'
    dbConfigDiv.appendChild(dbBlockIdLabel)

    const dbBlockIdInput = document.createElement('input')
    dbBlockIdInput.type = 'text'
    dbBlockIdInput.className = 'b3-text-field'
    dbBlockIdInput.placeholder = '如: 20251215234003-j3i7wjc'
    dbBlockIdInput.value = button.dbBlockId || ''
    dbBlockIdInput.style.cssText = 'font-size: 13px;'
    dbBlockIdInput.onchange = () => { button.dbBlockId = dbBlockIdInput.value }
    dbConfigDiv.appendChild(dbBlockIdInput)

    // 数据库ID（可选）
    const dbIdLabel = document.createElement('label')
    dbIdLabel.textContent = '数据库ID（可选，留空则从块ID获取）'
    dbIdLabel.style.cssText = 'font-size: 13px; font-weight: 500;'
    dbConfigDiv.appendChild(dbIdLabel)

    const dbIdInput = document.createElement('input')
    dbIdInput.type = 'text'
    dbIdInput.className = 'b3-text-field'
    dbIdInput.placeholder = '如: 20251215234003-4kzcfp3'
    dbIdInput.value = button.dbId || ''
    dbIdInput.style.cssText = 'font-size: 13px;'
    dbIdInput.onchange = () => { button.dbId = dbIdInput.value }
    dbConfigDiv.appendChild(dbIdInput)

    // 视图名称
    const viewNameLabel = document.createElement('label')
    viewNameLabel.textContent = '视图名称'
    viewNameLabel.style.cssText = 'font-size: 13px; font-weight: 500;'
    dbConfigDiv.appendChild(viewNameLabel)

    const viewNameInput = document.createElement('input')
    viewNameInput.type = 'text'
    viewNameInput.className = 'b3-text-field'
    viewNameInput.placeholder = '如: 今日DO表格'
    viewNameInput.value = button.viewName || ''
    viewNameInput.style.cssText = 'font-size: 13px;'
    viewNameInput.onchange = () => { button.viewName = viewNameInput.value }
    dbConfigDiv.appendChild(viewNameInput)

    // 主键列
    const primaryKeyLabel = document.createElement('label')
    primaryKeyLabel.textContent = '主键列名称（用于点击跳转）'
    primaryKeyLabel.style.cssText = 'font-size: 13px; font-weight: 500;'
    dbConfigDiv.appendChild(primaryKeyLabel)

    const primaryKeyInput = document.createElement('input')
    primaryKeyInput.type = 'text'
    primaryKeyInput.className = 'b3-text-field'
    primaryKeyInput.placeholder = '如: DO'
    primaryKeyInput.value = button.primaryKeyColumn || 'DO'
    primaryKeyInput.style.cssText = 'font-size: 13px;'
    primaryKeyInput.onchange = () => { button.primaryKeyColumn = primaryKeyInput.value }
    dbConfigDiv.appendChild(primaryKeyInput)

    // 起始时间
    const startTimeLabel = document.createElement('label')
    startTimeLabel.textContent = '起始时间（now 或 HH:MM）'
    startTimeLabel.style.cssText = 'font-size: 13px; font-weight: 500;'
    dbConfigDiv.appendChild(startTimeLabel)

    const startTimeInput = document.createElement('input')
    startTimeInput.type = 'text'
    startTimeInput.className = 'b3-text-field'
    startTimeInput.placeholder = '如: now 或 09:00'
    startTimeInput.value = button.startTimeStr || 'now'
    startTimeInput.style.cssText = 'font-size: 13px;'
    startTimeInput.onchange = () => { button.startTimeStr = startTimeInput.value }
    dbConfigDiv.appendChild(startTimeInput)

    // 行间额外分钟
    const extraMinutesInput = document.createElement('input')
    extraMinutesInput.type = 'number'
    extraMinutesInput.className = 'b3-text-field'
    extraMinutesInput.placeholder = '如: 20'
    extraMinutesInput.value = (button.extraMinutes ?? 20).toString()
    extraMinutesInput.style.cssText = 'font-size: 13px;'
    extraMinutesInput.onchange = () => { button.extraMinutes = parseInt(extraMinutesInput.value) || 20 }
    dbConfigDiv.appendChild(extraMinutesInput)

    // 最大显示行数
    const maxRowsInput = document.createElement('input')
    maxRowsInput.type = 'number'
    maxRowsInput.className = 'b3-text-field'
    maxRowsInput.placeholder = '如: 5'
    maxRowsInput.value = (button.maxRows ?? 5).toString()
    maxRowsInput.style.cssText = 'font-size: 13px;'
    maxRowsInput.onchange = () => { button.maxRows = parseInt(maxRowsInput.value) || 5 }
    dbConfigDiv.appendChild(maxRowsInput)

    // 显示模式
    const displayModeSelect = document.createElement('select')
    displayModeSelect.className = 'b3-text-field'
    displayModeSelect.style.cssText = 'font-size: 13px; padding: 8px;'
    const currentDisplayMode = button.dbDisplayMode || 'cards'
    displayModeSelect.innerHTML = `
      <option value="cards" ${currentDisplayMode === 'cards' ? 'selected' : ''}>卡片模式</option>
      <option value="table" ${currentDisplayMode === 'table' ? 'selected' : ''}>表格模式</option>
    `
    displayModeSelect.onchange = () => {
      button.dbDisplayMode = displayModeSelect.value as 'cards' | 'table'
      // 切换卡片模式配置显示
      const cardConfigDiv = document.getElementById('card-mode-config-mobile')
      if (cardConfigDiv) {
        cardConfigDiv.style.display = displayModeSelect.value === 'cards' ? 'flex' : 'none'
      }
    }
    dbConfigDiv.appendChild(displayModeSelect)

    // 卡片模式配置（仅卡片模式显示）
    const cardConfigDiv = document.createElement('div')
    cardConfigDiv.id = 'card-mode-config-mobile'
    cardConfigDiv.style.cssText = 'display: flex; flex-direction: column; gap: 8px; margin-top: 8px;'
    if (currentDisplayMode !== 'cards') {
      cardConfigDiv.style.display = 'none'
    }

    // 容器高度
    const containerHeightLabel = document.createElement('label')
    containerHeightLabel.textContent = '容器高度（卡片模式）'
    containerHeightLabel.style.cssText = 'font-size: 13px; font-weight: 500;'
    cardConfigDiv.appendChild(containerHeightLabel)

    const containerHeightInput = document.createElement('input')
    containerHeightInput.type = 'text'
    containerHeightInput.className = 'b3-text-field'
    containerHeightInput.placeholder = '如: 700px（留空自动适应）'
    containerHeightInput.value = button.cardContainerHeight || ''
    containerHeightInput.style.cssText = 'font-size: 13px;'
    containerHeightInput.onchange = () => { button.cardContainerHeight = containerHeightInput.value }
    cardConfigDiv.appendChild(containerHeightInput)

    // 可滚动容器最大高度
    const scrollMaxHeightLabel = document.createElement('label')
    scrollMaxHeightLabel.textContent = '可滚动容器最大高度（卡片模式）'
    scrollMaxHeightLabel.style.cssText = 'font-size: 13px; font-weight: 500;'
    cardConfigDiv.appendChild(scrollMaxHeightLabel)

    const scrollMaxHeightInput = document.createElement('input')
    scrollMaxHeightInput.type = 'text'
    scrollMaxHeightInput.className = 'b3-text-field'
    scrollMaxHeightInput.placeholder = '如: 700px'
    scrollMaxHeightInput.value = button.cardScrollMaxHeight || '700px'
    scrollMaxHeightInput.style.cssText = 'font-size: 13px;'
    scrollMaxHeightInput.onchange = () => { button.cardScrollMaxHeight = scrollMaxHeightInput.value }
    cardConfigDiv.appendChild(scrollMaxHeightInput)

    dbConfigDiv.appendChild(cardConfigDiv)

    // 要显示的列名（逗号分隔）
    const showColumnsInput = document.createElement('input')
    showColumnsInput.type = 'text'
    showColumnsInput.className = 'b3-text-field'
    showColumnsInput.placeholder = '如: DO,预计分钟,时间段'
    showColumnsInput.value = (button.showColumns || []).join(',')
    showColumnsInput.style.cssText = 'font-size: 13px;'
    showColumnsInput.onchange = () => {
      button.showColumns = showColumnsInput.value.split(',').map(s => s.trim()).filter(s => s)
    }
    dbConfigDiv.appendChild(showColumnsInput)

    // 时间段列名
    const timeRangeColLabel = document.createElement('label')
    timeRangeColLabel.textContent = '时间段列名'
    timeRangeColLabel.style.cssText = 'font-size: 13px; font-weight: 500;'
    dbConfigDiv.appendChild(timeRangeColLabel)

    const timeRangeColInput = document.createElement('input')
    timeRangeColInput.type = 'text'
    timeRangeColInput.className = 'b3-text-field'
    timeRangeColInput.placeholder = '如: 时间段'
    timeRangeColInput.value = button.timeRangeColumnName || '时间段'
    timeRangeColInput.style.cssText = 'font-size: 13px;'
    timeRangeColInput.onchange = () => { button.timeRangeColumnName = timeRangeColInput.value }
    dbConfigDiv.appendChild(timeRangeColInput)

    authorToolField.appendChild(dbConfigDiv)

    // 日记底部配置区（说明）
    const diaryConfigDiv = document.createElement('div')
    diaryConfigDiv.id = 'diary-config'
    diaryConfigDiv.style.cssText = 'display: flex; flex-direction: column; gap: 10px; padding: 15px; background: linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(59, 130, 246, 0.1)); border-radius: 8px; border: 1px solid rgba(34, 197, 94, 0.3);'

    const diaryTitle = document.createElement('div')
    diaryTitle.style.cssText = 'font-size: 14px; font-weight: 600; color: #22c55e; display: flex; align-items: center; gap: 8px;'
    diaryTitle.innerHTML = '<span>📇</span><span>功能说明</span>'
    diaryConfigDiv.appendChild(diaryTitle)

    const diaryDesc = document.createElement('div')
    diaryDesc.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); line-height: 1.6;'
    diaryDesc.innerHTML = '此功能会：<br>1. 使用快捷键 <b>Alt+5</b> 打开日记<br>2. 自动滚动到文档底部<br><br>无需配置，点击按钮即可使用。'
    diaryConfigDiv.appendChild(diaryDesc)

    authorToolField.appendChild(diaryConfigDiv)

    // 根据当前选择显示/隐藏配置区
    const updateVisibility = () => {
      const subtype = subtypeSelect.value
      if (subtype === 'database') {
        scriptConfigDiv.style.display = 'none'
        dbConfigDiv.style.display = 'flex'
        diaryConfigDiv.style.display = 'none'
      } else if (subtype === 'diary-bottom') {
        scriptConfigDiv.style.display = 'none'
        dbConfigDiv.style.display = 'none'
        diaryConfigDiv.style.display = 'flex'
      } else {
        scriptConfigDiv.style.display = 'flex'
        dbConfigDiv.style.display = 'none'
        diaryConfigDiv.style.display = 'none'
      }
    }
    subtypeSelect.refreshForm = updateVisibility
    updateVisibility()

    form.appendChild(authorToolField)
  }

  form.appendChild(createDesktopIconField('图标', button.icon, (v) => {
    button.icon = v
    // 需要找到对应的 iconSpan 来更新，这里简化处理
  }, context.showIconPicker))
  form.appendChild(createDesktopField('图标大小', button.iconSize.toString(), '18', (v) => { button.iconSize = parseInt(v) || 18 }, 'number'))
  form.appendChild(createDesktopField('按钮宽度', button.minWidth.toString(), '32', (v) => { button.minWidth = parseInt(v) || 32 }, 'number'))
  form.appendChild(createDesktopField('右边距', button.marginRight.toString(), '8', (v) => { button.marginRight = parseInt(v) || 8 }, 'number'))
  form.appendChild(createDesktopField('排序', button.sort.toString(), '1', (v) => {
    button.sort = parseInt(v) || 1
    // 重新分配排序值
    const sortedButtons = [...context.buttonConfigs].sort((a, b) => a.sort - b.sort)
    sortedButtons.forEach((btn, idx) => {
      btn.sort = idx + 1
    })
    if (renderList) renderList()
  }, 'number'))

  // 右上角提示开关
  const notificationItem = document.createElement('div')
  notificationItem.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;'

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
