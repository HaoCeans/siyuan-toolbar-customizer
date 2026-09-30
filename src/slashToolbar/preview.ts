/**
 * 斜杠菜单工具栏 —— 设置内按钮预览（独立文件）
 *
 * 分两栏平铺：第一栏是工具栏实际显示的那几个按钮，第二栏是不会显示的。
 * 每栏按每行最多 5 个折行，手机上不需要横向拖动；点按钮可查看名称或面板内容。
 *
 * 约定与 toolbarPreview.ts 一致：拖动只改内存顺序，不写盘；
 * 设置弹窗点「确定」后由 confirmCallback 统一保存并 reloadUI。
 */

import type { ISlashEntry } from './catalog'
import { t } from '../i18n/runtime'
import { renderButtonIcon } from '../ui/buttonIconRender'
import {
  getAvailablePanelEntries,
  getSlashButton,
  getSlashEntryName,
  normalizeSlashOrder,
  SLASH_BAR_VISIBLE_COUNT,
} from './catalog'

export interface ISlashPreviewOptions {
  /** 取当前一级按钮顺序（直接引用，预览实时反映其变化） */
  getOrder: () => string[]
  /** 拖动后写回新顺序 */
  setOrder: (order: string[]) => void
  /** 取总开关状态 */
  getEnabled: () => boolean
  /** 切换总开关（内部负责保存与运行时同步） */
  setEnabled: (enabled: boolean) => void | Promise<void>
  /** 顺序变化后的回调（用于同步其它 UI） */
  onChanged: () => void
}

const syLang = (key: string, fallback: string) => {
  const dictionary = (window as any).siyuan?.languages
  return (dictionary && dictionary[key]) || fallback
}

const buttonName = (id: string, fallback: string) => t(`slashToolbar.button.${id}`, undefined, fallback)

export function createSlashToolbarPreview(options: ISlashPreviewOptions): HTMLElement & { refresh: () => void } {
  const {
    getOrder,
    setOrder,
    getEnabled,
    setEnabled,
    onChanged,
  } = options

  const root = document.createElement('div')
  root.style.cssText = `
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 12px;
    background: var(--b3-theme-surface);
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  `

  // 标题行：左标题、右总开关
  const header = document.createElement('div')
  header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px;'
  const title = document.createElement('div')
  title.style.cssText = 'flex:1;min-width:0;font-size:13px;font-weight:600;color:var(--b3-theme-on-surface);'
  title.textContent = t('slashToolbar.preview.title', undefined, '按钮预览（可拖动排序）')
  const toggle = document.createElement('input')
  toggle.type = 'checkbox'
  toggle.className = 'b3-switch'
  toggle.checked = getEnabled() === true
  const toggleLabel = t('slashToolbar.settings.toggle', undefined, '启用思源斜杠菜单工具栏')
  toggle.setAttribute('aria-label', toggleLabel)
  toggle.title = toggleLabel
  toggle.style.cssText = 'flex:0 0 auto;transform:scale(1.1);'
  toggle.onchange = () => {
    void setEnabled(toggle.checked)
  }
  header.appendChild(title)
  header.appendChild(toggle)
  root.appendChild(header)

  const hint = document.createElement('div')
  hint.style.cssText = 'font-size:11px;color:var(--b3-theme-on-surface-light);margin-bottom:8px;'
  hint.textContent = t('slashToolbar.preview.hint', undefined, '长按拖动排序 · 点按钮查看内容')
  root.appendChild(hint)

  const sections = document.createElement('div')
  sections.style.cssText = 'display:flex;flex-direction:column;gap:10px;'
  root.appendChild(sections)

  const detail = document.createElement('div')
  detail.style.cssText = 'margin-top:8px;'
  root.appendChild(detail)

  let dragId: string | null = null
  let expandedId: string | null = null

  const clearDragHints = () => {
    sections.querySelectorAll('[data-preview-id]').forEach((node) => {
      (node as HTMLElement).style.boxShadow = ''
    })
  }

  const swap = (fromId: string, toId: string) => {
    if (fromId === toId) {
      return
    }
    const order = normalizeSlashOrder(getOrder())
    const fromIndex = order.indexOf(fromId)
    const toIndex = order.indexOf(toId)
    if (fromIndex < 0 || toIndex < 0) {
      return
    }
    order[fromIndex] = toId
    order[toIndex] = fromId
    setOrder(order)
    onChanged()
    render()
  }

  const createChip = (id: string): HTMLElement => {
    const button = getSlashButton(id)
    if (!button) {
      return document.createElement('span')
    }
    const chip = document.createElement('div')
    chip.dataset.previewId = id
    // 预览只求看清顺序与归属，按钮贴紧排布，不留真实工具栏那么大的间距
    chip.style.cssText = `
      display: flex; align-items: center; justify-content: center;
      min-width: 26px; height: 26px; padding: 0;
      border-radius: 4px; cursor: pointer; user-select: none; flex-shrink: 0;
      color: var(--b3-theme-on-surface);
      background: ${expandedId === id ? 'color-mix(in srgb, var(--b3-theme-primary) 14%, transparent)' : 'transparent'};
      position: relative;
    `
    const label = buttonName(button.id, button.fallback)
    chip.title = label
    const iconBox = document.createElement('span')
    iconBox.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;'
    renderButtonIcon(iconBox, button.icon, 18)
    chip.appendChild(iconBox)

    // 点一下：面板型展开内容，直接插入型显示名称
    chip.addEventListener('click', (event) => {
      event.stopPropagation()
      expandedId = expandedId === id ? null : id
      render()
    })

    chip.draggable = true
    chip.addEventListener('dragstart', (event) => {
      dragId = id
      event.dataTransfer!.effectAllowed = 'move'
      event.dataTransfer!.setData('text/plain', id)
      chip.style.opacity = '0.4'
    })
    chip.addEventListener('dragend', () => {
      dragId = null
      chip.style.opacity = '1'
      clearDragHints()
    })
    chip.addEventListener('dragover', (event) => {
      if (!dragId || dragId === id) {
        return
      }
      event.preventDefault()
      event.dataTransfer!.dropEffect = 'move'
      const rect = chip.getBoundingClientRect()
      const isAfter = event.clientX > rect.left + rect.width / 2
      clearDragHints()
      chip.style.boxShadow = isAfter
        ? 'inset -3px 0 0 var(--b3-theme-primary)'
        : 'inset 3px 0 0 var(--b3-theme-primary)'
    })
    chip.addEventListener('dragleave', () => {
      chip.style.boxShadow = ''
    })
    chip.addEventListener('drop', (event) => {
      if (!dragId || dragId === id) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      clearDragHints()
      swap(dragId, id)
    })

    attachTouchDrag(chip, id)
    return chip
  }

  /** 触摸长按拖动：与工具栏预览同一套手势，跨栏也能拖 */
  const attachTouchDrag = (chip: HTMLElement, id: string) => {
    let longPressTimer: ReturnType<typeof setTimeout> | null = null
    let dragging = false
    let startX = 0
    let startY = 0
    let moved = false
    let targetId: string | null = null

    chip.addEventListener('touchstart', (event) => {
      const touch = event.touches[0]
      if (!touch) {
        return
      }
      startX = touch.clientX
      startY = touch.clientY
      moved = false
      targetId = null
      longPressTimer = setTimeout(() => {
        if (!moved) {
          dragging = true
          chip.style.opacity = '0.6'
          chip.style.transform = 'scale(1.1)'
          chip.style.zIndex = '1000'
          chip.style.position = 'relative'
          try {
            navigator.vibrate?.(40)
          } catch {
            // 不支持震动时忽略
          }
        }
      }, 300)
    }, { passive: true })

    chip.addEventListener('touchmove', (event) => {
      const touch = event.touches[0]
      if (!touch) {
        return
      }
      if (!dragging) {
        if (Math.abs(touch.clientX - startX) > 8 || Math.abs(touch.clientY - startY) > 8) {
          moved = true
          if (longPressTimer) {
            clearTimeout(longPressTimer)
            longPressTimer = null
          }
        }
        return
      }
      event.preventDefault()
      targetId = null
      const chips = sections.querySelectorAll<HTMLElement>('[data-preview-id]')
      for (const item of chips) {
        if (item.dataset.previewId === id) {
          continue
        }
        const rect = item.getBoundingClientRect()
        if (touch.clientX >= rect.left && touch.clientX <= rect.right
          && touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
          targetId = item.dataset.previewId || null
          break
        }
      }
    }, { passive: false })

    const finish = (event: TouchEvent) => {
      if (longPressTimer) {
        clearTimeout(longPressTimer)
        longPressTimer = null
      }
      if (!dragging) {
        return
      }
      if (event.cancelable) {
        event.preventDefault()
      }
      dragging = false
      chip.style.opacity = ''
      chip.style.transform = ''
      chip.style.zIndex = ''
      chip.style.position = ''
      if (targetId && targetId !== id) {
        swap(id, targetId)
      }
    }
    chip.addEventListener('touchend', finish)
    chip.addEventListener('touchcancel', finish)
  }

  /** 点击后的详情：面板型列出内容，直接插入型只显示名称 */
  const renderDetail = () => {
    detail.innerHTML = ''
    if (!expandedId) {
      return
    }
    const button = getSlashButton(expandedId)
    if (!button) {
      return
    }
    const name = buttonName(button.id, button.fallback)
    const box = document.createElement('div')
    box.style.cssText = `
      padding: 8px; border-radius: 6px; font-size: 12px;
      background: color-mix(in srgb, var(--b3-theme-primary) 6%, transparent);
      border: 1px dashed var(--b3-theme-primary);
      color: var(--b3-theme-on-surface);
    `

    if (!button.panelId) {
      const head = document.createElement('div')
      head.style.cssText = 'font-weight:600;'
      head.textContent = name
      box.appendChild(head)
      const tip = document.createElement('div')
      tip.style.cssText = 'margin-top:4px;color:var(--b3-theme-on-surface-light);'
      tip.textContent = t('slashToolbar.preview.directTip', undefined, '点一下直接插入，无二级面板')
      box.appendChild(tip)
      detail.appendChild(box)
      return
    }

    const entries = getAvailablePanelEntries(button.panelId)
    const head = document.createElement('div')
    head.style.cssText = 'font-weight:600;margin-bottom:6px;'
    head.textContent = t('slashToolbar.preview.panelHead', {
      name,
      count: entries.length,
    }, '{name} · {count} 项')
    box.appendChild(head)
    if (!entries.length) {
      const empty = document.createElement('div')
      empty.style.cssText = 'color:var(--b3-theme-on-surface-light);'
      empty.textContent = t('slashToolbar.empty', undefined, '当前环境下没有可用项')
      box.appendChild(empty)
      detail.appendChild(box)
      return
    }
    const list = document.createElement('div')
    list.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;'
    entries.forEach((entry: ISlashEntry) => {
      const item = document.createElement('span')
      item.style.cssText = `
        display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:4px;
        background: var(--b3-theme-surface); box-shadow: inset 0 0 0 1px var(--b3-border-color);
      `
      const iconBox = document.createElement('span')
      iconBox.style.cssText = 'display:inline-flex;width:14px;height:14px;align-items:center;justify-content:center;'
      renderButtonIcon(iconBox, entry.icon, 14)
      item.appendChild(iconBox)
      const text = document.createElement('span')
      text.textContent = getSlashEntryName(entry, syLang)
      item.appendChild(text)
      list.appendChild(item)
    })
    box.appendChild(list)
    detail.appendChild(box)
  }

  /** 一栏：栏标题 + 一行按钮（屏幕极窄时自动换行，不出现横向滚动条） */
  const createSection = (labelText: string, ids: string[], faded: boolean) => {
    const box = document.createElement('div')
    box.style.cssText = `
      display: flex; flex-direction: column; gap: 2px;
      padding: 6px 8px; border-radius: 6px;
      background: color-mix(in srgb, var(--b3-theme-background) 60%, transparent);
      ${faded ? 'border: 1px dashed var(--b3-border-color);' : ''}
    `
    const label = document.createElement('div')
    label.style.cssText = 'font-size:11px;color:var(--b3-theme-on-surface-light);'
    label.textContent = labelText
    box.appendChild(label)
    const rowEl = document.createElement('div')
    rowEl.style.cssText = 'display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;gap:1px;'
    ids.forEach((id) => {
      rowEl.appendChild(createChip(id))
    })
    box.appendChild(rowEl)
    sections.appendChild(box)
  }

  function render() {
    sections.innerHTML = ''
    const order = normalizeSlashOrder(getOrder())
    const shown = order.slice(0, SLASH_BAR_VISIBLE_COUNT)
    const hidden = order.slice(SLASH_BAR_VISIBLE_COUNT)
    if (shown.length) {
      createSection(
        t('slashToolbar.preview.shownLabel', { count: shown.length }, '显示在工具栏（{count} 个）'),
        shown,
        false,
      )
    }
    if (hidden.length) {
      createSection(
        t('slashToolbar.preview.hiddenLabel', undefined, '不显示，拖到上面即可上条'),
        hidden,
        true,
      )
    }
    renderDetail()
  }

  render()

  return Object.assign(root, { refresh: render })
}
