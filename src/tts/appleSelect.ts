/**
 * 电脑端 / 手机端朗读面板共用的自定义下拉组件。
 * 替代原生 <select>：弹层样式与面板一致，跟随思源亮暗主题（全部使用主题变量），
 * 并处理了触屏交互（touchend 响应 + 点外部关闭）。
 *
 * 兼容原生 select 的常用子集：调用方可以像以前一样读写 .value、
 * appendChild 一个 <option>（会被"消费"进选项列表，不真正挂到 DOM）。
 */
import { lucideSvg } from './ttsIconHelper'

export type AppleSelectEl = HTMLDivElement & {
  value: string
  appendChild(child: HTMLOptionElement): void
}

export interface AppleSelectOptions {
  /** 触发行字号（默认 13px，桌面端） */
  fontSize?: string
  /** 触发行内边距（默认 8px 12px） */
  padding?: string
  /** 触发行宽度（默认 flex:1 自适应） */
  width?: string
  /** 弹层字号（默认与 fontSize 一致） */
  popupFontSize?: string
  /** 弹层选项行内边距（默认 9px 12px） */
  rowPadding?: string
  /** 弹层最大高度（默认 380px） */
  maxHeight?: number
}

interface AppleSelectOption {
  value: string
  text: string
}

let openPopup: HTMLElement | null = null
let openOwner = -1
const popupCleanup: Array<() => void> = []
let uidCounter = 0

export function closeAppleSelectPopup(): void {
  openPopup?.remove()
  openPopup = null
  openOwner = -1
  while (popupCleanup.length) popupCleanup.pop()?.()
}

/** 同一元素上 touchend 与 click 的去抖：触屏走 touchend，鼠标走 click */
function onTap(el: HTMLElement, fn: (e: Event) => void): void {
  let lastTouch = 0
  el.addEventListener('touchend', (e) => {
    lastTouch = Date.now()
    e.preventDefault()
    fn(e)
  }, { passive: false })
  el.addEventListener('click', (e) => {
    if (Date.now() - lastTouch < 700) return
    fn(e)
  })
}

export function createAppleSelectEl(opts: AppleSelectOptions = {}): AppleSelectEl {
  const uid = ++uidCounter
  const {
    fontSize = '13px',
    padding = '8px 12px',
    width = '',
    popupFontSize = fontSize,
    rowPadding = '9px 12px',
    maxHeight = 380,
  } = opts

  const root = document.createElement('div') as unknown as AppleSelectEl
  const options: AppleSelectOption[] = []
  let current = ''

  const labelEl = document.createElement('span')
  labelEl.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
  const chevron = document.createElement('span')
  chevron.style.cssText = 'display:inline-flex;align-items:center;opacity:0.45;flex-shrink:0;'
  chevron.innerHTML = lucideSvg('chevron-down', 14)

  const renderLabel = () => {
    const found = options.find(o => o.value === current)
    labelEl.textContent = found ? found.text : ''
  }

  root.style.cssText = `
    ${width ? `width:${width};` : 'flex:1;'}
    padding: ${padding}; border-radius: 10px;
    border: none;
    background: color-mix(in srgb, var(--b3-theme-on-surface) 6%, transparent);
    color: var(--b3-theme-on-background);
    font-size: ${fontSize};
    letter-spacing: -0.01em;
    outline: none;
    cursor: pointer;
    display: flex; align-items: center; gap: 6px;
    user-select: none; -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  `
  root.dataset.appleSelect = 'true'
  root.appendChild(labelEl)
  root.appendChild(chevron)

  onTap(root, () => {
    if (openOwner === uid) { closeAppleSelectPopup(); return }
    closeAppleSelectPopup()
    if (options.length === 0) return

    const popup = document.createElement('div')
    popup.style.cssText = `
      position: fixed; z-index: 2100;
      min-width: 180px; max-height: ${maxHeight}px; overflow-y: auto;
      background: var(--b3-menu-background);
      border: 1px solid var(--b3-border-color);
      border-radius: 12px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.18), 0 0 0 0.5px rgba(0,0,0,0.06);
      padding: 6px;
      font-size: ${popupFontSize}; color: var(--b3-theme-on-background);
      -webkit-tap-highlight-color: transparent;
    `
    for (const opt of options) {
      const rowEl = document.createElement('div')
      const selected = opt.value === current
      rowEl.style.cssText = `
        padding: ${rowPadding}; border-radius: 8px; cursor: pointer;
        display: flex; align-items: center; gap: 8px;
        white-space: nowrap;
        background: ${selected ? 'color-mix(in srgb, var(--b3-theme-primary) 12%, transparent)' : 'transparent'};
        color: ${selected ? 'var(--b3-theme-primary)' : 'inherit'};
        font-weight: ${selected ? '600' : '400'};
        touch-action: manipulation;
      `
      const textSpan = document.createElement('span')
      textSpan.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;'
      textSpan.textContent = opt.text
      rowEl.appendChild(textSpan)
      if (selected) {
        const check = document.createElement('span')
        check.style.cssText = 'display:inline-flex;align-items:center;flex-shrink:0;'
        check.innerHTML = lucideSvg('check', 14)
        rowEl.appendChild(check)
      }
      onTap(rowEl, (ev) => {
        ev.stopPropagation()
        if (current === opt.value) { closeAppleSelectPopup(); return }
        current = opt.value
        renderLabel()
        closeAppleSelectPopup()
        root.dispatchEvent(new CustomEvent('change'))
      })
      rowEl.addEventListener('mouseenter', () => {
        if (opt.value !== current) rowEl.style.background = 'color-mix(in srgb, var(--b3-theme-on-surface) 8%, transparent)'
      })
      rowEl.addEventListener('mouseleave', () => {
        if (opt.value !== current) rowEl.style.background = 'transparent'
      })
      popup.appendChild(rowEl)
    }

    document.body.appendChild(popup)
    openPopup = popup
    openOwner = uid

    // 定位：默认向下展开；剩余空间不足且上方够用时向上翻
    const rect = root.getBoundingClientRect()
    const width2 = Math.max(rect.width, 200)
    popup.style.width = `${width2}px`
    const popupHeight = Math.min(popup.scrollHeight, maxHeight)
    const spaceBelow = window.innerHeight - rect.bottom
    if (spaceBelow < popupHeight + 12 && rect.top > popupHeight + 12) {
      popup.style.top = `${Math.max(8, rect.top - popupHeight - 6)}px`
    } else {
      popup.style.top = `${Math.min(window.innerHeight - popupHeight - 8, rect.bottom + 6)}px`
    }
    popup.style.left = `${Math.max(8, Math.min(window.innerWidth - width2 - 8, rect.left))}px`

    // 点外部关闭（capture 阶段，避免被面板的 stopPropagation 拦截）
    const outside = (ev: Event) => {
      const target = ev.target as Node
      if (popup.contains(target) || root.contains(target)) return
      closeAppleSelectPopup()
    }
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') closeAppleSelectPopup() }
    document.addEventListener('click', outside, true)
    document.addEventListener('touchstart', outside, true)
    document.addEventListener('keydown', onKey, true)
    popupCleanup.push(() => {
      document.removeEventListener('click', outside, true)
      document.removeEventListener('touchstart', outside, true)
      document.removeEventListener('keydown', onKey, true)
    })
  })

  Object.defineProperties(root, {
    value: {
      get: () => current,
      set: (v: string) => {
        current = v
        // 值不在选项中时回退到第一项（模拟原生 select 不出现空白）
        if (v && !options.some(o => o.value === v) && options.length > 0) current = options[0].value
        renderLabel()
      },
    },
  })
  // 覆盖 appendChild：调用方 append 的 <option> 会被"消费"进选项列表
  ;(root as unknown as { appendChild: (child: HTMLOptionElement) => void }).appendChild = (child: HTMLOptionElement) => {
    options.push({ value: child.value, text: child.textContent || child.value })
    if (child.selected || options.length === 1) current = child.value
    renderLabel()
  }

  return root
}
