/**
 * 电脑端设置底部 — 一键记事统一配置区
 */

import { createDesktopQuickNoteFormatField } from './quickNoteFormatField'
import { pluginInstance } from '../toolbarManager'

export const DESKTOP_QUICK_NOTE_SECTION_ID = 'desktop-quick-note-settings-section'

export function scrollToDesktopQuickNoteSettings(): void {
  const target = document.getElementById(DESKTOP_QUICK_NOTE_SECTION_ID)
  if (!target) {
    alert('未找到【电脑端一键记事】配置区域，请切换到电脑端设置并滚动到底部')
    return
  }
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const originalBg = target.style.background
  target.style.background = 'rgba(255, 249, 196, 0.85)'
  window.setTimeout(() => {
    target.style.background = originalBg
  }, 2000)
}

/** 按钮配置内：说明 + 跳转链接 */
export function createDesktopQuickNoteButtonHint(): HTMLElement {
  const container = document.createElement('div')
  container.style.cssText =
    'display: flex; flex-direction: column; gap: 10px; padding: 12px; background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.08)); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 6px;'

  const desc = document.createElement('div')
  desc.style.cssText = 'font-size: 13px; color: var(--b3-theme-on-surface-light); line-height: 1.6;'
  desc.textContent = '本按钮用于触发一键记事。输入格式、保存目标、全局快捷键等请在电脑端设置底部统一配置。'
  container.appendChild(desc)

  const link = document.createElement('a')
  link.href = '#'
  link.textContent = '👉 点击跳转到【电脑端一键记事】配置'
  link.style.cssText = 'color: #3b82f6; text-decoration: underline; cursor: pointer; font-size: 13px;'
  link.onclick = (e) => {
    e.preventDefault()
    scrollToDesktopQuickNoteSettings()
  }
  container.appendChild(link)

  return container
}

export interface DesktopQuickNoteSettingsContext {
  mobileFeatureConfig: Record<string, unknown>
      desktopFeatureConfig: {
        quickNoteGlobalCaptureEnabled?: boolean
        quickNoteOverflowToolbarEnabled?: boolean
        quickNoteToolbarVisible?: boolean
      }
  isAuthorToolActivated: () => boolean
  saveMobileConfig: () => Promise<void>
  saveDesktopConfig: () => Promise<void>
  createSwitchItem: (label: string, checked: boolean, onChange: (v: boolean) => void) => HTMLElement
}

function createSubTitle(text: string): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = 'font-size: 14px; font-weight: 600; color: var(--b3-theme-on-background); margin-top: 4px;'
  el.textContent = text
  return el
}

function createHint(text: string): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface-light); line-height: 1.5;'
  el.textContent = text
  return el
}

function createRadioOption(
  option: { value: string; label: string; description: string },
  checked: boolean,
  onSelect: (value: string) => void,
): HTMLElement {
  const optionDiv = document.createElement('div')
  optionDiv.style.cssText =
    'display: flex; align-items: center; gap: 10px; padding: 8px; border: 1px solid var(--b3-border-color); border-radius: 6px; cursor: pointer;'

  const radio = document.createElement('input')
  radio.type = 'radio'
  radio.value = option.value
  radio.checked = checked
  radio.style.cssText = 'transform: scale(1.2);'

  const labelDiv = document.createElement('div')
  labelDiv.style.cssText = 'flex: 1;'

  const titleEl = document.createElement('div')
  titleEl.textContent = option.label
  titleEl.style.cssText = 'font-size: 13px; font-weight: 500; color: var(--b3-theme-on-background);'

  const descEl = document.createElement('div')
  descEl.textContent = option.description
  descEl.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light); margin-top: 2px;'

  const applyStyle = (selected: boolean) => {
    optionDiv.style.borderColor = selected ? 'var(--b3-theme-primary)' : 'var(--b3-border-color)'
    optionDiv.style.backgroundColor = selected ? 'rgba(59, 130, 246, 0.1)' : 'transparent'
    radio.checked = selected
  }
  applyStyle(checked)

  optionDiv.onclick = () => {
    onSelect(option.value)
  }

  labelDiv.appendChild(titleEl)
  labelDiv.appendChild(descEl)
  optionDiv.appendChild(radio)
  optionDiv.appendChild(labelDiv)
  ;(optionDiv as any).__applySelectedStyle = applyStyle

  return optionDiv
}

function clearRadioGroup(container: HTMLElement, selectedDiv: HTMLElement): void {
  container.querySelectorAll(':scope > div').forEach((div) => {
    const el = div as HTMLElement & { __applySelectedStyle?: (s: boolean) => void }
    el.__applySelectedStyle?.(div === selectedDiv)
  })
}

function createSaveConfigSection(context: DesktopQuickNoteSettingsContext): HTMLElement {
  const config = context.mobileFeatureConfig
  const section = document.createElement('div')
  section.style.cssText = 'display: flex; flex-direction: column; gap: 8px;'

  section.appendChild(createSubTitle('①保存配置'))
  section.appendChild(createHint('选择保存方式并填写对应的目标 ID'))

  const radioContainer = document.createElement('div')
  radioContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px;'

  const saveOptions = [
    { value: 'daily', label: '📘 保存到笔记本日记', description: '内容保存到指定笔记本的当日日记' },
    { value: 'document', label: '📄 追加到指定文档', description: '内容直接追加到指定文档底部或顶部' },
  ]

  const idLabel = document.createElement('label')
  idLabel.style.cssText = 'font-size: 13px; font-weight: 500; margin-top: 4px;'

  const idInput = document.createElement('input')
  idInput.type = 'text'
  idInput.className = 'b3-text-field'
  idInput.style.cssText = 'font-size: 13px;'

  const idHint = document.createElement('div')
  idHint.style.cssText = 'font-size: 12px; color: var(--b3-theme-on-surface-light);'

  const updateIdFields = () => {
    const saveType = (config.quickNoteSaveType as string) || 'daily'
    if (saveType === 'document') {
      idLabel.textContent = '📄 目标文档 ID'
      idInput.placeholder = '请输入文档 ID，如：20250101000000-aaaaaa'
      idInput.value = (config.quickNoteDocumentId as string) || ''
      idHint.textContent = '💡 内容将直接追加到该文档'
    } else {
      idLabel.textContent = '📘 目标笔记本 ID'
      idInput.placeholder = '请粘贴 DailyNote 所在笔记本 ID'
      idInput.value = (config.quickNoteNotebookId as string) || ''
      idHint.textContent = '💡 内容将保存到该笔记本的当日日记'
    }
  }

  saveOptions.forEach((option) => {
    const currentSaveType = (config.quickNoteSaveType as string) || 'daily'
    const optionDiv = createRadioOption(option, currentSaveType === option.value, async (value) => {
      clearRadioGroup(radioContainer, optionDiv)
      config.quickNoteSaveType = value
      updateIdFields()
      await context.saveMobileConfig()
    })
    radioContainer.appendChild(optionDiv)
  })

  idInput.onchange = async () => {
    const saveType = (config.quickNoteSaveType as string) || 'daily'
    const value = idInput.value.trim()
    if (saveType === 'document') {
      config.quickNoteDocumentId = value
      config.quickNoteNotebookId = ''
    } else {
      config.quickNoteNotebookId = value
      config.quickNoteDocumentId = ''
    }
    await context.saveMobileConfig()
  }

  updateIdFields()
  section.appendChild(radioContainer)
  section.appendChild(idLabel)
  section.appendChild(idInput)
  section.appendChild(idHint)

  return section
}

function createInsertPositionSection(context: DesktopQuickNoteSettingsContext): HTMLElement {
  const config = context.mobileFeatureConfig
  const section = document.createElement('div')
  section.style.cssText = 'display: flex; flex-direction: column; gap: 8px;'

  section.appendChild(createSubTitle('②插入位置'))
  section.appendChild(createHint('追加到文档时，选择插入到顶部或底部'))

  const radioContainer = document.createElement('div')
  radioContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px;'

  const options = [
    { value: 'top', label: '⬆️ 插入到顶部', description: '新内容出现在文档最前面' },
    { value: 'bottom', label: '⬇️ 插入到底部', description: '新内容追加在文档末尾' },
  ]

  options.forEach((option) => {
    const current = (config.quickNoteInsertPosition as string) || 'bottom'
    const optionDiv = createRadioOption(option, current === option.value, async (value) => {
      clearRadioGroup(radioContainer, optionDiv)
      config.quickNoteInsertPosition = value
      await context.saveMobileConfig()
    })
    radioContainer.appendChild(optionDiv)
  })

  section.appendChild(radioContainer)
  return section
}

function createFontSizeSection(context: DesktopQuickNoteSettingsContext): HTMLElement {
  const config = context.mobileFeatureConfig
  const section = document.createElement('div')
  section.style.cssText = 'display: flex; flex-direction: column; gap: 8px;'

  section.appendChild(createSubTitle('④弹窗输入框字体大小'))

  const row = document.createElement('div')
  row.style.cssText = 'display: flex; align-items: center; gap: 12px;'

  const label = document.createElement('span')
  label.style.cssText = 'font-size: 13px; min-width: 72px;'

  const slider = document.createElement('input')
  slider.type = 'range'
  slider.min = '12'
  slider.max = '30'
  slider.step = '1'
  const current = Number(config.quickNoteFontSize) || 18
  slider.value = String(current)
  label.textContent = `${current}px`

  slider.oninput = () => {
    const value = parseInt(slider.value, 10)
    label.textContent = `${value}px`
    config.quickNoteFontSize = value
  }
  slider.onchange = () => {
    void context.saveMobileConfig()
  }

  row.appendChild(label)
  row.appendChild(slider)
  section.appendChild(row)
  return section
}

/** 电脑端设置底部完整配置区 */
export function createDesktopQuickNoteSettingsSection(
  context: DesktopQuickNoteSettingsContext,
): HTMLElement {
  const box = document.createElement('div')
  box.id = DESKTOP_QUICK_NOTE_SECTION_ID
  box.style.cssText = `
    border: 2px solid rgba(59, 130, 246, 0.35);
    border-radius: 8px;
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(139, 92, 246, 0.06));
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  `

  const title = document.createElement('div')
  title.style.cssText = `
    font-size: 16px;
    font-weight: 700;
    color: #3b82f6;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(59, 130, 246, 0.25);
    text-align: center;
  `
  title.textContent = '⚡ 电脑端一键记事'
  box.appendChild(title)

  const intro = document.createElement('div')
  intro.style.cssText =
    'font-size: 13px; color: var(--b3-theme-on-surface); line-height: 1.55; padding: 8px 10px; background: rgba(255,255,255,0.45); border-radius: 6px;'
  intro.innerHTML =
    '工具栏按钮与全局快捷键共用以下配置。<br>' +
    '<strong>纯文本</strong> → 独立轻量悬浮窗（Alt+Shift+N，不唤起思源主界面）。<br>' +
    '<strong>块格式</strong> → 思源原生独立编辑窗（完整 Protyle，可置顶；编辑内容自动写入日记/文档）。'
  box.appendChild(intro)

  box.appendChild(createSaveConfigSection(context))
  box.appendChild(createInsertPositionSection(context))

  const formatField = createDesktopQuickNoteFormatField({
    desktopFeatureConfig: context.desktopFeatureConfig as { quickNoteInputFormat?: 'plain' | 'block' },
    isAuthorToolActivated: context.isAuthorToolActivated,
    saveData: async (_key, _value) => {
      await context.saveDesktopConfig()
    },
  })
  formatField.id = 'quick-note-format-section-desktop'
  box.appendChild(formatField)

  box.appendChild(createFontSizeSection(context))

  const desktopCfg = context.desktopFeatureConfig

  box.appendChild(createSubTitle('⑤记事弹窗扩展工具栏'))
  const overflowHint = createHint(
    '选择哪些按钮显示在记事弹窗中（不选或全选 = 显示全部）。勾选后点击按钮区域外即保存。',
  )
  overflowHint.style.padding = '8px 10px'
  overflowHint.style.background = 'rgba(255,255,255,0.35)'
  overflowHint.style.borderRadius = '6px'
  box.appendChild(overflowHint)
  box.appendChild(
    context.createSwitchItem(
      '开关工具栏',
      desktopCfg.quickNoteToolbarVisible !== false,
      (v) => { desktopCfg.quickNoteToolbarVisible = v },
    ),
  )

  // 按钮选择列表
  const btnList = document.createElement('div')
  box.appendChild(btnList)

  function buildBtnList() {
    const cfg = desktopCfg as any
    const currentIds: string[] = cfg.quickNoteButtonIds || []
    const allButtons = (pluginInstance?.desktopButtonConfigs || [])
      .filter((b: any) => b.id !== 'overflow-button-desktop')
      .sort((a: any, b: any) => (a.sort ?? 0) - (b.sort ?? 0))
    if (allButtons.length === 0) {
      btnList.innerHTML = '<div style="font-size:12px;color:#999;padding:8px">暂无可选按钮</div>'
      return
    }
    const isAll = currentIds.length === 0 || currentIds.length === allButtons.length
    btnList.innerHTML = `
      <div style="margin-bottom:6px;font-size:12px;color:var(--b3-theme-on-surface-light)">
        全部按钮（${allButtons.length} 个）
        <button class="b3-button b3-button--text" style="font-size:11px;padding:2px 8px;margin-left:8px" id="qn-toggle-all">${isAll ? '取消全选' : '全选'}</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${allButtons.map((b: any) => `
        <label style="display:flex;align-items:center;gap:4px;padding:4px 8px;border:1px solid var(--b3-border-color);border-radius:4px;cursor:pointer;font-size:12px;user-select:none">
          <input type="checkbox" ${currentIds.length === 0 || currentIds.includes(b.id) ? 'checked' : ''} data-bid="${b.id}">
          <span>${b.name || b.id}</span>
        </label>
      `).join('')}</div>`
    btnList.querySelectorAll('input').forEach(cb => cb.addEventListener('change', doSave))
    btnList.querySelector('#qn-toggle-all')?.addEventListener('click', () => {
      const allChecked = [...btnList.querySelectorAll<HTMLInputElement>('input')].every(c => c.checked)
      btnList.querySelectorAll<HTMLInputElement>('input').forEach(c => { c.checked = !allChecked })
      doSave()
    })
  }

  function doSave() {
    const cfg = desktopCfg as any
    const ids: string[] = []
    btnList.querySelectorAll<HTMLInputElement>('input:checked').forEach(c => ids.push(c.dataset.bid!))
    const allButtons = (pluginInstance?.desktopButtonConfigs || [])
      .filter((b: any) => b.id !== 'overflow-button-desktop')
    cfg.quickNoteButtonIds = ids.length === allButtons.length ? [] : ids
    // 只刷新按钮文本，不重建整个列表
    const toggleBtn = btnList.querySelector('#qn-toggle-all')
    if (toggleBtn) {
      toggleBtn.textContent = ids.length === allButtons.length ? '取消全选' : '全选'
    }
  }

  buildBtnList()

  const divider = document.createElement('div')
  divider.style.cssText = 'height: 1px; background: rgba(59, 130, 246, 0.2); margin: 4px 0;'
  box.appendChild(divider)

  box.appendChild(createSubTitle('⑥全局快捷键（独立悬浮窗）'))
  const captureHint = createHint(
    '默认 Alt+Shift+N，可在思源「设置 → 快捷键 → 插件」修改；再按一次关闭。思源需保持运行（可最小化到托盘）。',
  )
  captureHint.style.padding = '8px 10px'
  captureHint.style.background = 'rgba(255,255,255,0.35)'
  captureHint.style.borderRadius = '6px'
  box.appendChild(captureHint)

  box.appendChild(
    context.createSwitchItem(
      '启用全局快捷键捕获',
      desktopCfg.quickNoteGlobalCaptureEnabled !== false,
      (v) => { desktopCfg.quickNoteGlobalCaptureEnabled = v },
    ),
  )

  return box
}
