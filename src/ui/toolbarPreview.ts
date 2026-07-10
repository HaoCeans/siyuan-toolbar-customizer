/**
 * 工具栏所见即所得预览（电脑端 / 手机端共用）
 *
 * 在设置面板里模拟真实工具栏的横向布局与扩展工具栏分层，
 * 支持直接在预览条上拖动按钮重排序。
 *
 * 设计原则：
 * - 主动计算分层，不依赖外部 overflowLevel（因手机端分层依赖 DOM 宽度，在设置面板内不可用）
 * - 拖动只改内存数组的 sort，不 saveData、不刷新真实工具栏
 * - 点设置弹窗"确定"后由现有 confirmCallback 统一保存 + reloadUI
 */
import type { ButtonConfig } from '../toolbarManager'
import { isOverflowButton } from '../toolbarManager'
import { lucideToSvg } from '../utils/lucideHelper'

export interface ToolbarPreviewOptions {
  /** 取当前按钮配置数组（直接引用，预览会实时反映其变化） */
  getButtons: () => ButtonConfig[]
  /** true=手机端样式（居中、扩展条上叠），false=电脑端样式（右对齐、扩展条下叠） */
  isMobile: boolean
  /** true=手机端顶部工具栏模式（主条在上扩展层在下），false=底部模式（扩展层在上主条在下） */
  isTopMode?: boolean
  /** 拖动排序完成后的回调（用于触发下方卡片列表 renderList 同步） */
  onChanged: () => void
}

// 层间距
const LAYER_GAP = 6

/**
 * 创建一个工具栏预览元素。
 * 返回的 HTMLElement 上挂有 refresh() 方法，外部可在数据变化后调用以重绘预览。
 */
export function createToolbarPreview(opts: ToolbarPreviewOptions): HTMLElement & { refresh: () => void } {
  const { getButtons, isMobile, isTopMode, onChanged } = opts

  // 外层容器
    const root = document.createElement('div')
    root.style.cssText = `
      border: 1px solid var(--b3-border-color);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
      background: var(--b3-theme-surface);
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    `

      // 扩展层展开状态和缩放因子
  let overflowExpanded = true
  const SCALE_KEY = isMobile ? '__qn_preview_scale_mobile' : '__qn_preview_scale_desktop'
  let scaleFactor = Math.max(0.2, Math.min(1.5, parseFloat(localStorage.getItem(SCALE_KEY) || '0.7')))

  // 标题行（含右侧缩放控制，苹果风格）
  const title = document.createElement('div')
  title.style.cssText = `
    font-size: 12px; color: var(--b3-theme-on-surface-light);
    margin-bottom: 8px; display: flex; align-items: center; gap: 6px;
  `
  const titleLabel = document.createElement('span')
  titleLabel.textContent = '按钮预览（可拖动排序）'
  titleLabel.style.cssText = 'font-weight:600;color:var(--b3-theme-on-surface);'
  title.appendChild(titleLabel)

  // 缩放控制（右侧极简按钮）
  const scaleGroup = document.createElement('span')
  scaleGroup.style.cssText = 'margin-left:auto;display:flex;align-items:center;gap:4px;'
  const shrinkBtn = document.createElement('button')
  shrinkBtn.textContent = '−'
  shrinkBtn.style.cssText = 'font-size:12px;line-height:1;padding:1px 5px;border:none;border-radius:4px;background:color-mix(in srgb,var(--b3-theme-on-surface) 8%,transparent);color:var(--b3-theme-on-surface);cursor:pointer;'
  const scaleDisplay = document.createElement('span')
  scaleDisplay.textContent = `${Math.round(scaleFactor * 100)}%`
  scaleDisplay.style.cssText = 'font-size:11px;min-width:32px;text-align:center;color:var(--b3-theme-on-surface);font-weight:500;'
  const enlargeBtn = document.createElement('button')
  enlargeBtn.textContent = '+'
  enlargeBtn.style.cssText = shrinkBtn.style.cssText
  const updateScaleDisplay = () => {
    scaleDisplay.textContent = `${Math.round(scaleFactor * 100)}%`
    try { localStorage.setItem(SCALE_KEY, scaleFactor.toString()) } catch { /* ignore */ }
    render()
  }
  shrinkBtn.onclick = () => { scaleFactor = Math.max(0.2, Math.round((scaleFactor - 0.05) * 100) / 100); updateScaleDisplay() }
  enlargeBtn.onclick = () => { scaleFactor = Math.min(1.5, Math.round((scaleFactor + 0.05) * 100) / 100); updateScaleDisplay() }
  scaleGroup.appendChild(shrinkBtn)
  scaleGroup.appendChild(scaleDisplay)
  scaleGroup.appendChild(enlargeBtn)
  title.appendChild(scaleGroup)
  root.appendChild(title)

 
  // 工具栏渲染区
  const stage = document.createElement('div')
  stage.style.cssText = `display: flex; flex-direction: column; gap: ${LAYER_GAP}px;`
  root.appendChild(stage)

  /** 重新渲染整个预览 */
  function render(): void {
    stage.innerHTML = ''

    const buttons = getButtons()

    // 找扩展工具栏按钮配置
    const overflowBtn = buttons.find((b) => isOverflowButton(b.id))
    const overflowEnabled = overflowBtn ? overflowBtn.enabled !== false : false
    const layers = overflowBtn?.layers || 1

    // 启用的普通按钮，按 sort 降序（真实工具栏方向：sort 大靠左、小靠右）
    const visibleButtons = buttons.filter(
      (b) => !isOverflowButton(b.id) && b.enabled !== false,
    ).sort((a, b) => b.sort - a.sort)

    // 主条：overflowLevel === 0 的按钮 + 扩展按钮本身（若启用）
    const mainButtons = visibleButtons.filter((b) => (b.overflowLevel ?? 0) === 0)
    const mainBar = createBar([...mainButtons, ...(overflowEnabled && overflowBtn ? [overflowBtn] : [])], {
      isMainBar: true,
      overflowExpanded,
      onToggleOverflow: () => {
        overflowExpanded = !overflowExpanded
        render()
      },
    })

    // 扩展层渲染顺序由工具栏位置决定
    // 底部模式（手机端默认）：主条在下，扩展层在上 → 先画扩展层
    // 顶部模式（手机端顶部工具栏 / 电脑端）：主条在上，扩展层在下
    const isBottomMode = isMobile && !isTopMode
    if (isBottomMode) {
      // 扩展层在上，高层→低层
      if (overflowEnabled && overflowExpanded) {
        for (let layerNum = layers; layerNum >= 1; layerNum--) {
          const lb = visibleButtons.filter((b) => (b.overflowLevel ?? 0) === layerNum)
          if (lb.length === 0) continue
          stage.appendChild(createBar(lb, { isMainBar: false, layerNum }))
        }
      }
      stage.appendChild(mainBar)
    } else {
      // 主条在上，扩展层在下（低层→高层）
      stage.appendChild(mainBar)
      if (overflowEnabled && overflowExpanded) {
        for (let layerNum = 1; layerNum <= layers; layerNum++) {
          const lb = visibleButtons.filter((b) => (b.overflowLevel ?? 0) === layerNum)
          if (lb.length === 0) continue
          stage.appendChild(createBar(lb, { isMainBar: false, layerNum }))
        }
      }
    }
  }

  /**
   * 创建一条横向工具栏条。
   * 自动计算缩放因子：如果按钮总宽度超过容器宽度，等比缩小每个按钮的显示尺寸。
   */
  function createBar(
    barButtons: ButtonConfig[],
    barOpts: {
      isMainBar?: boolean
      overflowExpanded?: boolean
      layerNum?: number
      onToggleOverflow?: () => void
    },
  ): HTMLElement {
    const isMainBar = barOpts.isMainBar !== false

    const bar = document.createElement('div')
    // 统一右对齐（电脑端设置面板宽，居中显得奇怪）
    const align = 'flex-end'
      bar.style.cssText = `
      display: flex; flex-direction: row; align-items: center; justify-content: ${align};
      flex-wrap: nowrap; overflow: hidden; min-height: 32px;
      padding: 4px 8px; border-radius: 6px;
      ${isMainBar
        ? 'background: color-mix(in srgb, var(--b3-theme-background) 60%, transparent);'
        : 'background: color-mix(in srgb, var(--b3-theme-primary) 6%, transparent); border: 1px dashed var(--b3-theme-primary);'}
    `
	


    if (barButtons.length === 0) {
      const hint = document.createElement('span')
      hint.textContent = '（空）'
      hint.style.cssText = 'font-size:12px;color:var(--b3-theme-on-surface-light);opacity:0.6;'
      bar.appendChild(hint)
      return bar
    }

    // 在 bar 上标记层级，供跨条拖拽时识别目标层
    bar.dataset.layer = isMainBar ? '0' : String(barOpts.layerNum ?? 0)

    barButtons.forEach((button) => {
      const isOverflow = isOverflowButton(button.id)
      const el = createPreviewButton(button, {
        draggable: !isOverflow,
        scaleFactor,
        isOverflowToggle: isOverflow && isMainBar,
        overflowExpanded: barOpts.overflowExpanded,
        onToggle: barOpts.onToggleOverflow,
      })
      bar.appendChild(el)
	    })

	    return bar
	  }

  /** 交换两个按钮的位置（sort + overflowLevel 一起换），拖拽不跨层时用 */
  function swapTwo(fromId: string, toId: string): void {
    if (fromId === toId) return
    const buttons = getButtons()
    const a = buttons.find(b => b.id === fromId)
    const b = buttons.find(b => b.id === toId)
    if (!a || !b) return
    const tempSort = a.sort
    const tempLevel = a.overflowLevel
    a.sort = b.sort
    a.overflowLevel = b.overflowLevel
    b.sort = tempSort
    b.overflowLevel = tempLevel
    onChanged()
    render()
  }

  let currentDragId: string | null = null

  /**
   * 创建单个预览按钮。
   * 应用 scaleFactor 等比缩小 minWidth / iconSize / marginRight / padding。
   */
  function createPreviewButton(
    button: ButtonConfig,
    bOpts: {
      draggable: boolean
      scaleFactor?: number
      isOverflowToggle?: boolean
      overflowExpanded?: boolean
      onToggle?: () => void
    },
  ): HTMLElement {
    const sf = bOpts.scaleFactor ?? 1
    const scaledMW = Math.max(16, Math.round(button.minWidth * sf))
    const scaledIS = Math.max(10, Math.round(button.iconSize * sf))
    // 预览里按钮间距压到最低（2px），让更多空间给按钮本身
    const scaledMR = Math.max(0, Math.round(2 * sf))
    const scaledPad = Math.max(2, Math.round(8 * sf))

    // 创建带缩放值的配置副本（供渲染使用，不修改原始对象）
    const scaledConfig: ButtonConfig = {
      ...button,
      minWidth: scaledMW,
      iconSize: scaledIS,
      marginRight: scaledMR,
    }

    const el = document.createElement('div')
    el.dataset.previewId = button.id
    el.style.cssText = `
      display: flex; align-items: center; justify-content: center;
      min-width: ${scaledMW}px; height: ${scaledMW}px;
      margin-right: ${scaledMR}px; padding: 0 ${scaledPad}px;
      border: none; border-radius: 4px; background-color: rgba(0,0,0,0);
      color: var(--b3-theme-on-surface); cursor: ${bOpts.draggable ? 'grab' : 'pointer'};
      user-select: none; flex-shrink: 0; gap: ${Math.round(4 * sf)}px;
      transition: opacity 0.15s ease; position: relative;
    `
    el.title = button.name

    // 内容用缩放后的尺寸
    renderButtonContent(el, scaledConfig)

    // 扩展按钮：点击切换展开/收起
    if (bOpts.isOverflowToggle && bOpts.onToggle) {
      el.style.cursor = 'pointer'
      el.addEventListener('click', (e) => { e.stopPropagation(); bOpts.onToggle!() })
      el.style.background = bOpts.overflowExpanded === false
        ? 'color-mix(in srgb, var(--b3-theme-primary) 12%, transparent)'
        : 'color-mix(in srgb, var(--b3-theme-primary) 8%, transparent)'
    }

    if (!bOpts.draggable) return el

    el.draggable = true

    const clearAllDragHints = () => {
      root.querySelectorAll('[data-preview-id]').forEach((n) => {
        ;(n as HTMLElement).style.boxShadow = ''
      })
    }

    // HTML5 鼠标拖拽
    el.addEventListener('dragstart', (e) => {
      currentDragId = button.id
      e.dataTransfer!.effectAllowed = 'move'
      e.dataTransfer!.setData('text/plain', button.id)
      el.style.opacity = '0.4'
    })
    el.addEventListener('dragend', () => {
      currentDragId = null
      el.style.opacity = '1'
      clearAllDragHints()
    })
    el.addEventListener('dragover', (e) => {
      if (!currentDragId || currentDragId === button.id) return
      e.preventDefault()
      e.dataTransfer!.dropEffect = 'move'
      const rect = el.getBoundingClientRect()
      const isAfter = e.clientX > rect.left + rect.width / 2
      clearAllDragHints()
      el.style.boxShadow = isAfter
        ? 'inset -3px 0 0 var(--b3-theme-primary)'
        : 'inset 3px 0 0 var(--b3-theme-primary)'
    })
    el.addEventListener('dragleave', () => { el.style.boxShadow = '' })
    el.addEventListener('drop', (e) => {
      if (!currentDragId || currentDragId === button.id) return
      e.preventDefault()
      e.stopPropagation()
      clearAllDragHints()
      swapTwo(currentDragId, button.id)
    })

    // 触摸长按拖拽
    attachTouchDrag(el, button.id)

    return el
  }

  function attachTouchDrag(el: HTMLElement, buttonId: string): void {
    let longPressTimer: ReturnType<typeof setTimeout> | null = null
    let isDragging = false
    let startX = 0
    let startY = 0
    let movedSignificantly = false
    let currentTargetId: string | null = null

    const onStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      startX = touch.clientX; startY = touch.clientY
      movedSignificantly = false
      currentTargetId = null
      longPressTimer = setTimeout(() => {
        if (!movedSignificantly) {
          isDragging = true
          el.style.opacity = "0.6"
          el.style.transform = "scale(1.1)"
          el.style.zIndex = "1000"
          el.style.position = "relative"
          if (navigator.vibrate) navigator.vibrate(40)
        }
      }, 300)
    }

    const onMove = (e: TouchEvent) => {
      const touch = e.touches[0]
      const dx = Math.abs(touch.clientX - startX)
      const dy = Math.abs(touch.clientY - startY)
      if (!isDragging) {
        if (dx > 8 || dy > 8) {
          movedSignificantly = true
          if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
        }
        return
      }
      e.preventDefault()
      // 找手指下方的目标按钮（跨条也支持）
      const allButtons = root.querySelectorAll("[data-preview-id]") as NodeListOf<HTMLElement>
      currentTargetId = null
      for (const btn of allButtons) {
        if (btn.dataset.previewId === buttonId) continue
        const rect = btn.getBoundingClientRect()
        if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
            touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
          currentTargetId = btn.dataset.previewId || null
          break
        }
      }
    }

    const onEnd = (e: TouchEvent) => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
      if (!isDragging) return
      e.preventDefault()
      isDragging = false
      el.style.opacity = ""
      el.style.transform = ""
      el.style.zIndex = ""
      el.style.position = ""
      if (currentTargetId && currentTargetId !== buttonId) {
        swapTwo(buttonId, currentTargetId)
      }
    }

    el.addEventListener("touchstart", onStart, { passive: true })
    el.addEventListener("touchmove", onMove, { passive: false })
    el.addEventListener("touchend", onEnd)
    el.addEventListener("touchcancel", onEnd)
  }

  // 初次渲染
  render()

  const enhanced = root as HTMLElement & { refresh: () => void }
  enhanced.refresh = render
  return enhanced
}

// ═══════════════════════════════════════════════════════════════
// 内容渲染（复刻 createButtonElement 的 4 分支 + showName 逻辑）
// ═══════════════════════════════════════════════════════════════

function renderButtonContent(el: HTMLElement, button: ButtonConfig): void {
  if (button.showName) {
    const name = button.name || ''
    const display = name.length > 4 ? name.slice(0, 4) : name
    let fontSize = 18
    const len = display.length
    if (len === 1) fontSize = 22
    else if (len === 2) fontSize = 20
    else if (len === 3) fontSize = 18
    else if (len >= 4) fontSize = 16
    el.innerHTML = ''
    const span = document.createElement('span')
    span.textContent = display
    span.style.cssText = `font-size:${fontSize}px;width:100%;text-align:center;line-height:1;`
    el.appendChild(span)
    return
  }

  el.innerHTML = ''
  const icon = button.icon || ''

  if (icon.startsWith('icon')) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', `${button.iconSize}`)
    svg.setAttribute('height', `${button.iconSize}`)
    svg.style.cssText = 'flex-shrink:0;display:block;'
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
    use.setAttribute('href', `#${icon}`)
    svg.appendChild(use)
    el.appendChild(svg)
  } else if (icon.startsWith('lucide:')) {
    const iconName = icon.substring(7)
    const svgString = lucideToSvg(iconName, button.iconSize)
    if (svgString) {
      el.innerHTML = svgString
      const svg = el.querySelector('svg')
      if (svg) svg.style.cssText = `width:${button.iconSize}px;height:${button.iconSize}px;flex-shrink:0;`
    } else {
      const span = document.createElement('span')
      span.textContent = icon; span.style.fontSize = `${button.iconSize}px`
      el.appendChild(span)
    }
  } else if (/\.(png|jpg|jpeg|gif|svg)$/i.test(icon)) {
    const img = document.createElement('img')
    const base = '/plugins/siyuan-toolbar-customizer/'
    img.src = icon.startsWith('/') ? icon : base + icon.replace(/^\.?\//, '')
    img.style.cssText = `width:${button.iconSize}px;height:${button.iconSize}px;flex-shrink:0;`
    img.draggable = false
    el.appendChild(img)
  } else {
    const span = document.createElement('span')
    span.textContent = icon
    span.style.cssText = `font-size:${button.iconSize}px;line-height:1;flex-shrink:0;`
    el.appendChild(span)
  }
}

