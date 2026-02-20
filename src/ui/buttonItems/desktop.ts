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
    'author-tool': '⑥鲸鱼定制工具箱'
  }
  const typeLabel = typeLabels[button.type] || button.type
  const isAuthorTool = button.type === 'author-tool'
  const typeStyle = isAuthorTool
    ? 'font-size: 11px; color: #a855f7; font-weight: 600;'
    : 'font-size: 11px; color: var(--b3-theme-on-surface-light);'
  infoDiv.innerHTML = `
    <div style="font-weight: 500; font-size: 14px; color: var(--b3-theme-on-background); margin-bottom: 4px;">${button.name}</div>
    <div style="${typeStyle}">
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

  // 构建功能类型选项数组（根据激活状态决定是否显示鲸鱼定制工具箱）
  const typeOptions = [
    { value: 'template', label: '①手写模板插入【简单】' },
    { value: 'shortcut', label: '②电脑端快捷键【简单】' },
    { value: 'click-sequence', label: '③自动化模拟点击【难】' },
    { value: 'quick-note', label: '⑤一键记事【简单】' }
  ]
  if (context.isAuthorToolActivated()) {
    typeOptions.push(
      { value: 'author-tool', label: '⑥鲸鱼定制工具箱' }
    )
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
        'quick-note': '⑤一键记事【简单】',
        'author-tool': '⑥鲸鱼定制工具箱'
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
  //   hint.innerHTML = '💡 支持: id、data-id、data-type、class、按钮文本 <a href="#" style="color: var(--b3-theme-primary); text-decoration: none; font-weight: 500;">查看常用ID（部分） →</a>'

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

    // 笔记本ID配置（可选）
    const notebookIdLabel = document.createElement('label')
    notebookIdLabel.textContent = '📚 追加到每日笔记（可选）'
    notebookIdLabel.style.cssText = 'font-size: 13px; font-weight: 500; margin-top: 12px;'
    
    const notebookIdInput = document.createElement('input')
    notebookIdInput.type = 'text'
    notebookIdInput.className = 'b3-text-field'
    notebookIdInput.placeholder = '笔记本ID，留空则在当前编辑器光标位置插入'
    notebookIdInput.value = button.templateNotebookId || ''
    notebookIdInput.style.cssText = 'font-size: 13px;'
    notebookIdInput.onchange = () => { button.templateNotebookId = notebookIdInput.value }
    
    const notebookIdHint = document.createElement('div')
    notebookIdHint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light);'
    notebookIdHint.textContent = '💡 填写笔记本ID后，点击按钮将直接追加到该笔记本的每日笔记；留空则需先选择编辑器'

    templateField.appendChild(label)
    templateField.appendChild(textarea)
    templateField.appendChild(hint)
    templateField.appendChild(notebookIdLabel)
    templateField.appendChild(notebookIdInput)
    templateField.appendChild(notebookIdHint)
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
    hint.innerHTML = '<div style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(139, 92, 246, 0.1)); border: 1px solid rgba(59, 130, 246, 0.4); border-radius: 6px; padding: 8px 12px; margin-bottom: 10px;"><strong style="color: var(--b3-theme-primary);">🌟 社区可用代码分享（推荐）</strong><br><a href="https://ld246.com/article/1771266377449" target="_blank" style="color: var(--b3-theme-primary); text-decoration: none; font-weight: 500;">https://ld246.com/article/1771266377449</a></div>💡 每行填写一个选择器，支持：<br>• 简单标识符（如 barSettings）<br>• CSS选择器（如 #barSettings）<br>• <strong>文本内容（如 text:复制块引用）</strong><br><a href="https://github.com/HaoCeans/siyuan-toolbar-customizer/blob/main/README_BUILTIN_IDS.md" target="_blank" style="color: var(--b3-theme-primary); text-decoration: none; font-weight: 500;">思源笔记常用功能 ID 速查表（GitHub）</a><br><a href="https://github.com/HaoCeans/siyuan-toolbar-customizer/blob/main/README_CLICK_SEQUENCE.md" target="_blank" style="color: var(--b3-theme-primary); text-decoration: none; font-weight: 500;">模拟点击序列使用说明（GitHub）</a>'
    clickSequenceField.appendChild(hint)

    editForm.appendChild(clickSequenceField)
  } else if (button.type === 'quick-note') {
    // 一键记事配置（单选模式）
    const quickNoteField = document.createElement('div');
    quickNoteField.style.cssText = 'display: flex; flex-direction: column; gap: 12px; padding: 12px; background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.08)); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 6px;';

    const header = document.createElement('div');
    header.style.cssText = 'display: flex; align-items: center; gap: 8px;';
    header.innerHTML = '<span style="font-size: 16px;">📝</span><span style="font-weight: 600; color: #3b82f6;">一键记事配置</span>';
    quickNoteField.appendChild(header);

    const desc = document.createElement('div');
    desc.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface-light);';
    desc.textContent = '选择保存方式并配置目标ID，点击按钮后直接进入记事编辑界面。';
    quickNoteField.appendChild(desc);

    // 保存方式选择
    const saveTypeLabel = document.createElement('label');
    saveTypeLabel.textContent = '💾 保存方式选择';
    saveTypeLabel.style.cssText = 'font-size: 13px; font-weight: 500; margin-top: 8px;';
    quickNoteField.appendChild(saveTypeLabel);

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

    quickNoteField.appendChild(radioContainer);

    // 统一的ID输入框
    const idLabel = document.createElement('label');
    idLabel.id = 'quick-note-id-label-desktop';
    idLabel.style.cssText = 'font-size: 13px; font-weight: 500; margin-top: 12px;';
    quickNoteField.appendChild(idLabel);

    const idInput = document.createElement('input');
    idInput.type = 'text';
    idInput.className = 'b3-text-field';
    idInput.id = 'quick-note-id-input-desktop';
    idInput.style.cssText = 'font-size: 13px;';

    // 根据选择类型更新输入框
    function updateIdInputPlaceholder() {
      const saveType = button.quickNoteSaveType || 'daily';
      const labelEl = quickNoteField.querySelector('#quick-note-id-label-desktop') as HTMLLabelElement;
      const inputEl = quickNoteField.querySelector('#quick-note-id-input-desktop') as HTMLInputElement;

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

    quickNoteField.appendChild(idInput);

    const idHint = document.createElement('div');
    idHint.id = 'quick-note-id-hint-desktop';
    idHint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light); margin-top: 4px;';
    quickNoteField.appendChild(idHint);

    // 更新提示文字
    function updateIdHint() {
      const saveType = button.quickNoteSaveType || 'daily';
      const idHint = quickNoteField.querySelector('#quick-note-id-hint-desktop') as HTMLDivElement;
      
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

    editForm.appendChild(quickNoteField);
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
    // 鲸鱼定制工具箱配置
    const authorToolField = document.createElement('div')
    authorToolField.style.cssText = 'display: flex; flex-direction: column; gap: 12px; padding: 12px; background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(59, 130, 246, 0.08)); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 6px;'

    const header = document.createElement('div')
    header.style.cssText = 'display: flex; align-items: center; gap: 8px;'
    header.innerHTML = '<span style="font-size: 16px;">🔐</span><span style="font-weight: 600; color: #8b5cf6;">鲸鱼定制工具箱配置</span>'
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
      // 刷新表单以显示/隐藏相关配置
      if ((subtypeSelect as any).refreshForm) {
        (subtypeSelect as any).refreshForm()
      }
    }
    authorToolField.appendChild(subtypeSelect)

    // 打开指定ID块配置区
    const docConfigDiv = document.createElement('div')
    docConfigDiv.id = 'open-doc-config'
    docConfigDiv.style.cssText = 'display: flex; flex-direction: column; gap: 8px;'

    // 目标块ID
    const docIdLabel = document.createElement('label')
    docIdLabel.textContent = '📄 目标块ID'
    docIdLabel.style.cssText = 'font-size: 13px; font-weight: 500;'
    docConfigDiv.appendChild(docIdLabel)

    const docIdInput = document.createElement('input')
    docIdInput.type = 'text'
    docIdInput.className = 'b3-text-field'
    docIdInput.placeholder = '如: 20251215234003-j3i7wjc 或 20251215234003-j3i7wjc-a1b2c3'
    docIdInput.value = button.targetDocId || ''
    docIdInput.style.cssText = 'font-size: 13px;'
    docIdInput.onchange = () => { button.targetDocId = docIdInput.value }
    docConfigDiv.appendChild(docIdInput)

    const docIdHint = document.createElement('div')
    docIdHint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light);'
    docIdHint.textContent = '💡 支持文档ID（打开文档）或块ID（打开文档并定位到该块）'
    docConfigDiv.appendChild(docIdHint)

    authorToolField.appendChild(docConfigDiv)

    // 数据库悬浮弹窗配置区
    const dbConfigDiv = document.createElement('div')
    dbConfigDiv.id = 'db-config'
    dbConfigDiv.style.cssText = 'display: flex; flex-direction: column; gap: 10px; padding: 10px; background: rgba(255, 255, 255, 0.5); border-radius: 6px;'

    // 日记底部配置区（说明 + 笔记本ID + 等待时间配置）
    const diaryConfigDiv = document.createElement('div')
    diaryConfigDiv.id = 'diary-config'
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
    const diaryNotebookIdContainer = document.createElement('div')
    diaryNotebookIdContainer.style.cssText = 'display: flex; flex-direction: column; gap: 6px; margin-top: 8px;'

    const diaryNotebookIdLabel = document.createElement('label')
    diaryNotebookIdLabel.textContent = '📚 笔记本ID（可选）'
    diaryNotebookIdLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); font-weight: 500;'
    diaryNotebookIdContainer.appendChild(diaryNotebookIdLabel)

    const diaryNotebookIdInput = document.createElement('input')
    diaryNotebookIdInput.type = 'text'
    diaryNotebookIdInput.className = 'b3-text-field'
    diaryNotebookIdInput.value = button.diaryNotebookId || ''
    diaryNotebookIdInput.placeholder = '留空则使用 Alt+5 快捷键，如：20250101000000-aaaaaa'
    diaryNotebookIdInput.style.cssText = 'font-size: 13px;'
    diaryNotebookIdInput.addEventListener('input', () => {
      button.diaryNotebookId = diaryNotebookIdInput.value
    })
    diaryNotebookIdContainer.appendChild(diaryNotebookIdInput)

    const diaryNotebookIdHint = document.createElement('div')
    diaryNotebookIdHint.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface); opacity: 0.7;'
    diaryNotebookIdHint.textContent = '💡 填写后将直接调用API创建日记，不会弹出选择框'
    diaryNotebookIdContainer.appendChild(diaryNotebookIdHint)

    diaryConfigDiv.appendChild(diaryNotebookIdContainer)

    // 等待时间配置（移动端）
    const waitTimeContainer = document.createElement('div')
    waitTimeContainer.style.cssText = 'display: flex; flex-direction: column; gap: 6px; margin-top: 8px;'

    const waitTimeLabel = document.createElement('label')
    waitTimeLabel.textContent = '⏱ 移动端等待时间（毫秒）'
    waitTimeLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); font-weight: 500;'
    waitTimeContainer.appendChild(waitTimeLabel)

    const waitTimeInput = document.createElement('input')
    waitTimeInput.type = 'number'
    waitTimeInput.className = 'b3-text-field'
    waitTimeInput.value = String(button.diaryWaitTime || 1000)
    waitTimeInput.placeholder = '默认 1000'
    waitTimeInput.style.cssText = 'font-size: 13px;'
    waitTimeInput.addEventListener('input', () => {
      button.diaryWaitTime = parseInt(waitTimeInput.value) || 1000
    })
    waitTimeContainer.appendChild(waitTimeInput)

    const waitTimeHint = document.createElement('div')
    waitTimeHint.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface); opacity: 0.7;'
    waitTimeHint.textContent = '💡 移动端加载日记较慢时可增加此值，范围 100-10000ms'
    waitTimeContainer.appendChild(waitTimeHint)

    diaryConfigDiv.appendChild(waitTimeContainer)

    authorToolField.appendChild(diaryConfigDiv)

    // 叶归LifeLog适配配置区
    const lifeLogConfigDiv = document.createElement('div')
    lifeLogConfigDiv.id = 'life-log-config'
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

    authorToolField.appendChild(lifeLogConfigDiv)

    // 弹窗框模板选择配置区
    const popupSelectConfigDiv = document.createElement('div')
    popupSelectConfigDiv.id = 'popup-select-config'
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

    // 初始化模板数据
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

    authorToolField.appendChild(popupSelectConfigDiv)

    // 连续点击自定义按钮配置区
    const buttonSequenceConfigDiv = document.createElement('div')
    buttonSequenceConfigDiv.id = 'button-sequence-config'
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

    // 初始化按钮序列数据
    if (!button.buttonSequenceSteps || button.buttonSequenceSteps.length === 0) {
      button.buttonSequenceSteps = [
        { buttonId: '', buttonName: '', delayMs: 200 },
        { buttonId: '', buttonName: '', delayMs: 200 },
        { buttonId: '', buttonName: '', delayMs: 200 }
      ]
    }
    // 兼容性处理：为旧数据添加 buttonId 字段
    button.buttonSequenceSteps.forEach(step => {
      if (!step.buttonId) {
        // 根据 buttonName 查找对应的 buttonId
        const matchedBtn = context.buttonConfigs.find(b => b.name === step.buttonName)
        step.buttonId = matchedBtn ? matchedBtn.id : ''
      }
    })

    // 获取可选择的按钮列表（排除当前按钮自己和扩展工具栏按钮，按 sort 排序）
    const getAvailableButtons = () => {
      return context.buttonConfigs
        .filter(btn => btn.id !== button.id && btn.id !== 'overflow-button-mobile')
        .sort((a, b) => a.sort - b.sort)
    }

    const renderButtonSequenceRows = () => {
      buttonSequenceRowsContainer.innerHTML = ''
      const availableButtons = getAvailableButtons()
      
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
          // 通过ID匹配当前选中的按钮（使用 buttonId 而不是 buttonName）
          if (step.buttonId === btn.id) {
            option.selected = true
          }
          nameSelect.appendChild(option)
        })

        nameSelect.onchange = () => {
          // 根据选中的ID找到对应的按钮名称
          const selectedBtn = availableButtons.find(b => b.id === nameSelect.value)
          if (selectedBtn) {
            button.buttonSequenceSteps![idx].buttonId = selectedBtn.id
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
      button.buttonSequenceSteps!.push({ buttonId: '', buttonName: '', delayMs: 200 })
      renderButtonSequenceRows()
    }
    buttonSequenceConfigDiv.appendChild(addSequenceRowBtn)

    authorToolField.appendChild(buttonSequenceConfigDiv)

    // 滚动文档配置区
    const scrollDocConfigDiv = document.createElement('div')
    scrollDocConfigDiv.id = 'scroll-doc-config'
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
    topRadio.name = `scroll-direction-${button.id}`
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
    bottomRadio.name = `scroll-direction-${button.id}`
    bottomRadio.value = 'bottom'
    bottomRadio.checked = currentDirection === 'bottom'
    bottomRadio.onchange = () => { button.scrollDirection = 'bottom' }
    bottomRadioWrapper.appendChild(bottomRadio)
    bottomRadioWrapper.appendChild(document.createTextNode('滚动文档底部'))
    radioContainer.appendChild(bottomRadioWrapper)

    scrollDocConfigDiv.appendChild(radioContainer)
    authorToolField.appendChild(scrollDocConfigDiv)

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
      if (subtype === 'open-doc') {
        docConfigDiv.style.display = 'flex'
        dbConfigDiv.style.display = 'none'
        diaryConfigDiv.style.display = 'none'
        lifeLogConfigDiv.style.display = 'none'
        popupSelectConfigDiv.style.display = 'none'
        buttonSequenceConfigDiv.style.display = 'none'
        scrollDocConfigDiv.style.display = 'none'
      } else if (subtype === 'database') {
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
  // 构建功能类型选项数组（根据激活状态决定是否显示鲸鱼定制工具箱）
  const typeOptions = [
    { value: 'template', label: '①手写模板插入【简单】' },
    { value: 'shortcut', label: '②电脑端快捷键【简单】' },
    { value: 'click-sequence', label: '③自动化模拟点击【难】' },
    { value: 'quick-note', label: '⑤一键记事【简单】' }
  ]
  if (context.isAuthorToolActivated()) {
    typeOptions.push(
      { value: 'author-tool', label: '⑥鲸鱼定制工具箱' }
    )
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
      typeDesc.textContent = button.type === 'builtin' ? '①思源内置功能【简单】' : button.type === 'template' ? '①手写模板插入【简单】' : button.type === 'shortcut' ? '②电脑端快捷键【简单】' : button.type === 'click-sequence' ? '③自动化模拟点击【难】' : button.type === 'quick-note' ? '⑤一键记事【简单】' : button.type === 'author-tool' ? '⑥鲸鱼定制工具箱' : button.type
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
  //   hint.innerHTML = '💡 支持: id、data-id、data-type、class、按钮文本 <a href="#" style="color: var(--b3-theme-primary); text-decoration: none; font-weight: 500;">查看常用ID（部分） →</a>'
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

    // 笔记本ID配置（可选）
    const notebookIdLabel = document.createElement('label')
    notebookIdLabel.textContent = '📚 追加到每日笔记（可选）'
    notebookIdLabel.style.cssText = 'font-size: 13px; font-weight: 500; margin-top: 12px;'

    const notebookIdInput = document.createElement('input')
    notebookIdInput.type = 'text'
    notebookIdInput.className = 'b3-text-field'
    notebookIdInput.placeholder = '笔记本ID，留空则在当前编辑器光标位置插入'
    notebookIdInput.value = button.templateNotebookId || ''
    notebookIdInput.style.cssText = 'font-size: 13px;'
    notebookIdInput.onchange = () => { button.templateNotebookId = notebookIdInput.value }

    const notebookIdHint = document.createElement('div')
    notebookIdHint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light);'
    notebookIdHint.textContent = '💡 填写笔记本ID后，点击按钮将直接追加到该笔记本的每日笔记；留空则需先选择编辑器'

    templateField.appendChild(label)
    templateField.appendChild(textarea)
    templateField.appendChild(hint)
    templateField.appendChild(notebookIdLabel)
    templateField.appendChild(notebookIdInput)
    templateField.appendChild(notebookIdHint)
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
    hint.innerHTML = '<div style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(139, 92, 246, 0.1)); border: 1px solid rgba(59, 130, 246, 0.4); border-radius: 6px; padding: 8px 12px; margin-bottom: 10px;"><strong style="color: var(--b3-theme-primary);">🌟 社区可用代码分享（推荐）</strong><br><a href="https://ld246.com/article/1771266377449" target="_blank" style="color: var(--b3-theme-primary); text-decoration: none; font-weight: 500;">https://ld246.com/article/1771266377449</a></div>💡 每行填写一个选择器，支持：<br>• 简单标识符（如 barSettings）<br>• CSS选择器（如 #barSettings）<br>• <strong>文本内容（如 text:复制块引用）</strong><br><a href="https://github.com/HaoCeans/siyuan-toolbar-customizer/blob/main/README_BUILTIN_IDS.md" target="_blank" style="color: var(--b3-theme-primary); text-decoration: none; font-weight: 500;">思源笔记常用功能 ID 速查表（GitHub）</a><br><a href="https://github.com/HaoCeans/siyuan-toolbar-customizer/blob/main/README_CLICK_SEQUENCE.md" target="_blank" style="color: var(--b3-theme-primary); text-decoration: none; font-weight: 500;">模拟点击序列使用说明（GitHub）</a>'
    clickSequenceField.appendChild(hint)

    form.appendChild(clickSequenceField)
  } else if (button.type === 'quick-note') {
    // 一键记事配置
    const quickNoteField = document.createElement('div')
    quickNoteField.style.cssText = 'display: flex; flex-direction: column; gap: 12px; padding: 12px; background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.08)); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 6px;'

    const header = document.createElement('div')
    header.style.cssText = 'display: flex; align-items: center; gap: 8px;'
    header.innerHTML = '<span style="font-size: 16px;">📝</span><span style="font-weight: 600; color: #3b82f6;">一键记事配置</span>'
    quickNoteField.appendChild(header)

    const desc = document.createElement('div')
    desc.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface-light);'
    desc.textContent = '点击按钮后直接弹出记事编辑器，快速记录内容。'
    quickNoteField.appendChild(desc)

    // 笔记本ID输入
    const notebookIdLabel = document.createElement('label')
    notebookIdLabel.textContent = '📚 目标笔记本ID（可选）'
    notebookIdLabel.style.cssText = 'font-size: 13px; font-weight: 500; margin-top: 8px;'
    quickNoteField.appendChild(notebookIdLabel)

    const notebookIdInput = document.createElement('input')
    notebookIdInput.type = 'text'
    notebookIdInput.className = 'b3-text-field'
    notebookIdInput.placeholder = '留空使用默认笔记本，如：20250101000000-aaaaaa'
    notebookIdInput.value = button.quickNoteNotebookId || ''
    notebookIdInput.style.cssText = 'font-size: 13px;'
    notebookIdInput.onchange = () => { button.quickNoteNotebookId = notebookIdInput.value }
    quickNoteField.appendChild(notebookIdInput)

    const notebookIdHint = document.createElement('div')
    notebookIdHint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light);'
    notebookIdHint.textContent = '💡 指定记事内容保存到的笔记本ID，留空则使用系统默认笔记本'
    quickNoteField.appendChild(notebookIdHint)

    // 文档ID输入
    const documentIdLabel = document.createElement('label')
    documentIdLabel.textContent = '📄 目标文档ID（可选）'
    documentIdLabel.style.cssText = 'font-size: 13px; font-weight: 500; margin-top: 8px;'
    quickNoteField.appendChild(documentIdLabel)

    const documentIdInput = document.createElement('input')
    documentIdInput.type = 'text'
    documentIdInput.className = 'b3-text-field'
    documentIdInput.placeholder = '留空则保存到日记，如：20250101000000-aaaaaa'
    documentIdInput.value = button.quickNoteDocumentId || ''
    documentIdInput.style.cssText = 'font-size: 13px;'
    documentIdInput.onchange = () => { button.quickNoteDocumentId = documentIdInput.value }
    quickNoteField.appendChild(documentIdInput)

    const documentIdHint = document.createElement('div')
    documentIdHint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light);'
    documentIdHint.textContent = '💡 指定内容追加到的文档ID，留空则使用每日日记'
    quickNoteField.appendChild(documentIdHint)

    form.appendChild(quickNoteField)
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
    // 鲸鱼定制工具箱配置
    const authorToolField = document.createElement('div')
    authorToolField.style.cssText = 'display: flex; flex-direction: column; gap: 12px; padding: 12px; background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(59, 130, 246, 0.08)); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 6px;'

    const header = document.createElement('div')
    header.style.cssText = 'display: flex; align-items: center; gap: 8px;'
    header.innerHTML = '<span style="font-size: 16px;">🔐</span><span style="font-weight: 600; color: #8b5cf6;">鲸鱼定制工具箱配置</span>'
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
    authorToolField.appendChild(subtypeSelect)

    // 打开指定ID块配置区
    const docConfigDiv = document.createElement('div')
    docConfigDiv.id = 'open-doc-config'
    docConfigDiv.style.cssText = 'display: flex; flex-direction: column; gap: 8px;'

    // 目标块ID
    const docIdLabel = document.createElement('label')
    docIdLabel.textContent = '📄 目标块ID'
    docIdLabel.style.cssText = 'font-size: 13px; font-weight: 500;'
    docConfigDiv.appendChild(docIdLabel)

    const docIdInput = document.createElement('input')
    docIdInput.type = 'text'
    docIdInput.className = 'b3-text-field'
    docIdInput.placeholder = '如: 20251215234003-j3i7wjc 或 20251215234003-j3i7wjc-a1b2c3'
    docIdInput.value = button.targetDocId || ''
    docIdInput.style.cssText = 'font-size: 13px;'
    docIdInput.onchange = () => { button.targetDocId = docIdInput.value }
    docConfigDiv.appendChild(docIdInput)

    const docIdHint = document.createElement('div')
    docIdHint.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light);'
    docIdHint.textContent = '💡 支持文档ID（打开文档）或块ID（打开文档并定位到该块）'
    docConfigDiv.appendChild(docIdHint)

    authorToolField.appendChild(docConfigDiv)

    // 数据库悬浮弹窗配置区
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

    // 日记底部配置区（说明 + 笔记本ID + 等待时间配置）
    const diaryConfigDiv = document.createElement('div')
    diaryConfigDiv.id = 'diary-config'
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
    const diaryNotebookIdContainer2 = document.createElement('div')
    diaryNotebookIdContainer2.style.cssText = 'display: flex; flex-direction: column; gap: 6px; margin-top: 8px;'

    const diaryNotebookIdLabel2 = document.createElement('label')
    diaryNotebookIdLabel2.textContent = '📚 笔记本ID（可选）'
    diaryNotebookIdLabel2.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); font-weight: 500;'
    diaryNotebookIdContainer2.appendChild(diaryNotebookIdLabel2)

    const diaryNotebookIdInput2 = document.createElement('input')
    diaryNotebookIdInput2.type = 'text'
    diaryNotebookIdInput2.className = 'b3-text-field'
    diaryNotebookIdInput2.value = button.diaryNotebookId || ''
    diaryNotebookIdInput2.placeholder = '留空则使用 Alt+5 快捷键，如：20250101000000-aaaaaa'
    diaryNotebookIdInput2.style.cssText = 'font-size: 13px;'
    diaryNotebookIdInput2.addEventListener('input', () => {
      button.diaryNotebookId = diaryNotebookIdInput2.value
    })
    diaryNotebookIdContainer2.appendChild(diaryNotebookIdInput2)

    const diaryNotebookIdHint2 = document.createElement('div')
    diaryNotebookIdHint2.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface); opacity: 0.7;'
    diaryNotebookIdHint2.textContent = '💡 填写后将直接调用API创建日记，不会弹出选择框'
    diaryNotebookIdContainer2.appendChild(diaryNotebookIdHint2)

    diaryConfigDiv.appendChild(diaryNotebookIdContainer2)

    // 等待时间配置（移动端）
    const waitTimeContainer = document.createElement('div')
    waitTimeContainer.style.cssText = 'display: flex; flex-direction: column; gap: 6px; margin-top: 8px;'

    const waitTimeLabel = document.createElement('label')
    waitTimeLabel.textContent = '⏱ 移动端等待时间（毫秒）'
    waitTimeLabel.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface); font-weight: 500;'
    waitTimeContainer.appendChild(waitTimeLabel)

    const waitTimeInput = document.createElement('input')
    waitTimeInput.type = 'number'
    waitTimeInput.className = 'b3-text-field'
    waitTimeInput.value = String(button.diaryWaitTime || 1000)
    waitTimeInput.placeholder = '默认 1000'
    waitTimeInput.style.cssText = 'font-size: 13px;'
    waitTimeInput.addEventListener('input', () => {
      button.diaryWaitTime = parseInt(waitTimeInput.value) || 1000
    })
    waitTimeContainer.appendChild(waitTimeInput)

    const waitTimeHint = document.createElement('div')
    waitTimeHint.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface); opacity: 0.7;'
    waitTimeHint.textContent = '💡 移动端加载日记较慢时可增加此值，范围 100-10000ms'
    waitTimeContainer.appendChild(waitTimeHint)

    diaryConfigDiv.appendChild(waitTimeContainer)

    authorToolField.appendChild(diaryConfigDiv)

    // 叶归LifeLog适配配置区
    const lifeLogConfigDiv = document.createElement('div')
    lifeLogConfigDiv.id = 'life-log-config'
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

    authorToolField.appendChild(lifeLogConfigDiv)

    // 弹窗框模板选择配置区
    const popupSelectConfigDiv = document.createElement('div')
    popupSelectConfigDiv.id = 'popup-select-config-2'
    popupSelectConfigDiv.style.cssText = 'display: flex; flex-direction: column; gap: 8px;'

    const popupSelectTitle2 = document.createElement('label')
    popupSelectTitle2.textContent = '📋 模板列表'
    popupSelectTitle2.style.cssText = 'font-size: 13px; font-weight: 500;'
    popupSelectConfigDiv.appendChild(popupSelectTitle2)

    const popupSelectHint2 = document.createElement('div')
    popupSelectHint2.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light);'
    popupSelectHint2.textContent = '💡 左边填模板名称（显示在弹窗上），右边填插入的模板内容'
    popupSelectConfigDiv.appendChild(popupSelectHint2)

    const popupSelectRowsContainer2 = document.createElement('div')
    popupSelectRowsContainer2.style.cssText = 'display: flex; flex-direction: column; gap: 6px;'
    popupSelectConfigDiv.appendChild(popupSelectRowsContainer2)

    if (!button.popupSelectTemplates || button.popupSelectTemplates.length === 0) {
      button.popupSelectTemplates = [
        { name: '', content: '' },
        { name: '', content: '' },
        { name: '', content: '' }
      ]
    }

    const renderPopupSelectRows2 = () => {
      popupSelectRowsContainer2.innerHTML = ''
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
            renderPopupSelectRows2()
          }
        }

        row.appendChild(nameInput)
        row.appendChild(contentInput)
        row.appendChild(deleteBtn)
        popupSelectRowsContainer2.appendChild(row)
      })
    }
    renderPopupSelectRows2()

    const addRowBtn2 = document.createElement('button')
    addRowBtn2.textContent = '+ 添加模板'
    addRowBtn2.style.cssText = 'padding: 6px 12px; border: 1px dashed var(--b3-border-color); border-radius: 4px; background: var(--b3-theme-surface); color: var(--b3-theme-on-surface); cursor: pointer; font-size: 13px; align-self: flex-start;'
    addRowBtn2.onclick = () => {
      button.popupSelectTemplates!.push({ name: '', content: '' })
      renderPopupSelectRows2()
    }
    popupSelectConfigDiv.appendChild(addRowBtn2)

    authorToolField.appendChild(popupSelectConfigDiv)

    // 连续点击自定义按钮配置区
    const buttonSequenceConfigDiv = document.createElement('div')
    buttonSequenceConfigDiv.id = 'button-sequence-config-2'
    buttonSequenceConfigDiv.style.cssText = 'display: flex; flex-direction: column; gap: 8px;'

    const buttonSequenceTitle2 = document.createElement('label')
    buttonSequenceTitle2.textContent = '🔗 按钮序列'
    buttonSequenceTitle2.style.cssText = 'font-size: 13px; font-weight: 500;'
    buttonSequenceConfigDiv.appendChild(buttonSequenceTitle2)

    const buttonSequenceHint2 = document.createElement('div')
    buttonSequenceHint2.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light);'
    buttonSequenceHint2.textContent = '💡 左边选择要点击的按钮，右边填点击后等待的间隔时间（毫秒）'
    buttonSequenceConfigDiv.appendChild(buttonSequenceHint2)

    const buttonSequenceRowsContainer2 = document.createElement('div')
    buttonSequenceRowsContainer2.style.cssText = 'display: flex; flex-direction: column; gap: 6px;'
    buttonSequenceConfigDiv.appendChild(buttonSequenceRowsContainer2)

    if (!button.buttonSequenceSteps || button.buttonSequenceSteps.length === 0) {
      button.buttonSequenceSteps = [
        { buttonId: '', buttonName: '', delayMs: 200 },
        { buttonId: '', buttonName: '', delayMs: 200 },
        { buttonId: '', buttonName: '', delayMs: 200 }
      ]
    }
    // 兼容性处理：为旧数据添加 buttonId 字段
    button.buttonSequenceSteps.forEach(step => {
      if (!step.buttonId) {
        const matchedBtn = context.buttonConfigs.find(b => b.name === step.buttonName)
        step.buttonId = matchedBtn ? matchedBtn.id : ''
      }
    })

    // 获取可选择的按钮列表（排除当前按钮自己和扩展工具栏按钮，按 sort 排序）
    const getAvailableButtons2 = () => {
      return context.buttonConfigs
        .filter(btn => btn.id !== button.id && btn.id !== 'overflow-button-mobile')
        .sort((a, b) => a.sort - b.sort)
    }

    const renderButtonSequenceRows2 = () => {
      buttonSequenceRowsContainer2.innerHTML = ''
      const availableButtons = getAvailableButtons2()
      
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
          // 通过ID匹配当前选中的按钮（使用 buttonId 而不是 buttonName）
          if (step.buttonId === btn.id) {
            option.selected = true
          }
          nameSelect.appendChild(option)
        })

        nameSelect.onchange = () => {
          // 根据选中的ID找到对应的按钮名称
          const selectedBtn = availableButtons.find(b => b.id === nameSelect.value)
          if (selectedBtn) {
            button.buttonSequenceSteps![idx].buttonId = selectedBtn.id
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
            renderButtonSequenceRows2()
          }
        }

        row.appendChild(nameSelect)
        row.appendChild(delayInput)
        row.appendChild(deleteBtn)
        buttonSequenceRowsContainer2.appendChild(row)
      })
    }
    renderButtonSequenceRows2()

    const addSequenceRowBtn2 = document.createElement('button')
    addSequenceRowBtn2.textContent = '+ 添加步骤'
    addSequenceRowBtn2.style.cssText = 'padding: 6px 12px; border: 1px dashed var(--b3-border-color); border-radius: 4px; background: var(--b3-theme-surface); color: var(--b3-theme-on-surface); cursor: pointer; font-size: 13px; align-self: flex-start;'
    addSequenceRowBtn2.onclick = () => {
      button.buttonSequenceSteps!.push({ buttonId: '', buttonName: '', delayMs: 200 })
      renderButtonSequenceRows2()
    }
    buttonSequenceConfigDiv.appendChild(addSequenceRowBtn2)

    authorToolField.appendChild(buttonSequenceConfigDiv)

    // 滚动文档配置区
    const scrollDocConfigDiv = document.createElement('div')
    scrollDocConfigDiv.id = 'scroll-doc-config-2'
    scrollDocConfigDiv.style.cssText = 'display: flex; flex-direction: column; gap: 8px;'

    const scrollDocTitle2 = document.createElement('label')
    scrollDocTitle2.textContent = '📜 滚动方向'
    scrollDocTitle2.style.cssText = 'font-size: 13px; font-weight: 500;'
    scrollDocConfigDiv.appendChild(scrollDocTitle2)

    // 单选按钮组
    const radioContainer2 = document.createElement('div')
    radioContainer2.style.cssText = 'display: flex; flex-direction: column; gap: 6px;'

    const currentDirection2 = button.scrollDirection || 'top'

    // 滚动到顶部选项
    const topRadioWrapper2 = document.createElement('label')
    topRadioWrapper2.style.cssText = 'display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px;'
    const topRadio2 = document.createElement('input')
    topRadio2.type = 'radio'
    topRadio2.name = `scroll-direction-2-${button.id}`
    topRadio2.value = 'top'
    topRadio2.checked = currentDirection2 === 'top'
    topRadio2.onchange = () => { button.scrollDirection = 'top' }
    topRadioWrapper2.appendChild(topRadio2)
    topRadioWrapper2.appendChild(document.createTextNode('滚动文档顶部'))
    radioContainer2.appendChild(topRadioWrapper2)

    // 滚动到底部选项
    const bottomRadioWrapper2 = document.createElement('label')
    bottomRadioWrapper2.style.cssText = 'display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px;'
    const bottomRadio2 = document.createElement('input')
    bottomRadio2.type = 'radio'
    bottomRadio2.name = `scroll-direction-2-${button.id}`
    bottomRadio2.value = 'bottom'
    bottomRadio2.checked = currentDirection2 === 'bottom'
    bottomRadio2.onchange = () => { button.scrollDirection = 'bottom' }
    bottomRadioWrapper2.appendChild(bottomRadio2)
    bottomRadioWrapper2.appendChild(document.createTextNode('滚动文档底部'))
    radioContainer2.appendChild(bottomRadioWrapper2)

    scrollDocConfigDiv.appendChild(radioContainer2)
    authorToolField.appendChild(scrollDocConfigDiv)

    // 根据当前选择显示/隐藏配置区
    const updateVisibility = () => {
      const subtype = subtypeSelect.value
      if (subtype === 'open-doc') {
        docConfigDiv.style.display = 'flex'
        dbConfigDiv.style.display = 'none'
        diaryConfigDiv.style.display = 'none'
        lifeLogConfigDiv.style.display = 'none'
        popupSelectConfigDiv.style.display = 'none'
        buttonSequenceConfigDiv.style.display = 'none'
        scrollDocConfigDiv.style.display = 'none'
      } else if (subtype === 'database') {
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
