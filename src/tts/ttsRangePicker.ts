/**
 * 段落滚动选择器 — 朗读范围「起始块 / 结束块」
 *
 * 为什么不做输入框：文档段落可能上百，靠键盘输入下标太麻烦；这里用滚轮式选择，
 * 鼠标滚轮、触摸上划/下划、键盘上下键都能切换，并且每一项带块内容预览，
 * 能直接认出是哪一块。
 */

import { t } from '../i18n/runtime'
import type { ParagraphInfo } from './ttsEngine'

export interface ParagraphPicker {
  element: HTMLElement
  getValue(): number
  setValue(value: number): void
  /** 限制可选范围（段落下标），当前值会被夹取 */
  setBounds(min: number, max: number): void
  /** 仅用户操作触发；程序 setValue/setBounds 不触发 */
  onChange?: (value: number) => void
}

/** 预览文本最大长度（超出截断） */
const PREVIEW_MAX = 30
/** 滚轮累计多少 deltaY 走一格 */
const WHEEL_STEP = 40
/** 触摸滑动多少 px 走一格 */
const SWIPE_STEP = 32
/** 单次滑动最多切换几格（防止触控板惯性一下飞很远） */
const MAX_STEPS_PER_EVENT = 3
/** 右侧上/下按钮一次跳多少块 */
const JUMP_STEP = 20

// 与 lucide 的 ChevronUp 一致
const CHEVRON_UP = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>'
// 与 lucide 的 ChevronDown 一致
const CHEVRON_DOWN = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>'

function cleanPreview(text: string): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim()
  return clean.length > PREVIEW_MAX ? `${clean.slice(0, PREVIEW_MAX)}…` : clean
}

export function createParagraphPicker(opts: {
  paragraphs: ParagraphInfo[]
  initial: number
  /** 行高（手机端可放宽），默认 26 */
  rowHeight?: number
}): ParagraphPicker {
  const total = opts.paragraphs.length
  const lastIndex = Math.max(0, total - 1)
  const rowHeight = opts.rowHeight ?? 26
  let min = 0
  let max = lastIndex
  let value = Math.max(min, Math.min(Math.round(opts.initial), max))
  let onChangeHandler: ((value: number) => void) | undefined

  const root = document.createElement('div')
  root.tabIndex = 0
  root.dataset.ttsRangePicker = 'true'
  root.setAttribute('role', 'spinbutton')
  root.style.cssText = `
    flex: 1; min-width: 0;
    display: flex; flex-direction: row; align-items: stretch; gap: 4px;
    padding: 4px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--b3-theme-on-surface) 6%, transparent);
    outline: none; user-select: none; touch-action: none;
    overflow: hidden;
    transition: box-shadow 0.15s ease;
  `

  // 三行滚动区（左）
  const wheel = document.createElement('div')
  wheel.style.cssText = 'flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center;'
  root.appendChild(wheel)

  // 整块跳转按钮（右）：上/下各跳 JUMP_STEP 块
  const jumpCol = document.createElement('div')
  jumpCol.style.cssText = 'flex: none; width: 26px; display: flex; flex-direction: column; gap: 3px;'
  const makeJumpBtn = (direction: 'up' | 'down'): HTMLElement => {
    const btn = document.createElement('div')
    btn.dataset.ttsStep = direction
    btn.innerHTML = direction === 'up' ? CHEVRON_UP : CHEVRON_DOWN
    // 只用 aria-label（无障碍），不设 title，避免鼠标悬浮时弹出原生提示框
    btn.setAttribute('aria-label', t(
      direction === 'up' ? 'tts.rangeJumpUp' : 'tts.rangeJumpDown',
      { step: JUMP_STEP },
      direction === 'up' ? `上移 ${JUMP_STEP} 块` : `下移 ${JUMP_STEP} 块`,
    ))
    btn.style.cssText = `
      flex: 1;
      display: flex; align-items: center; justify-content: center;
      border-radius: 7px;
      background: color-mix(in srgb, var(--b3-theme-on-surface) 8%, transparent);
      color: var(--b3-theme-on-background);
      cursor: pointer; opacity: 1;
      transition: background 0.15s ease, opacity 0.15s ease;
    `
    btn.addEventListener('pointerdown', (e) => e.stopPropagation())
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'color-mix(in srgb, var(--b3-theme-primary) 18%, transparent)'
    })
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'color-mix(in srgb, var(--b3-theme-on-surface) 8%, transparent)'
    })
    return btn
  }
  const jumpUpBtn = makeJumpBtn('up')
  const jumpDownBtn = makeJumpBtn('down')
  jumpCol.appendChild(jumpUpBtn)
  jumpCol.appendChild(jumpDownBtn)
  root.appendChild(jumpCol)

  const makeRow = (): HTMLElement => {
    const row = document.createElement('div')
    row.style.cssText = `
      height: ${rowHeight}px; line-height: ${rowHeight}px;
      padding: 0 8px; border-radius: 6px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      font-size: 12px; opacity: 0.35;
      transition: background 0.15s ease, opacity 0.15s ease;
    `
    wheel.appendChild(row)
    return row
  }
  const prevRow = makeRow()
  const curRow = makeRow()
  const nextRow = makeRow()
  curRow.style.opacity = '1'
  curRow.style.fontWeight = '600'
  curRow.style.fontSize = '13px'
  curRow.style.background = 'color-mix(in srgb, var(--b3-theme-primary) 12%, transparent)'
  prevRow.style.cursor = 'pointer'
  nextRow.style.cursor = 'pointer'

  const describe = (index: number): string => {
    if (index < 0 || index >= total) return ''
    const label = t('tts.paragraph', { index: index + 1 }, `第 ${index + 1} 段`)
    const preview = cleanPreview(opts.paragraphs[index].text)
    return preview ? `${label} · ${preview}` : label
  }

  const render = (): void => {
    prevRow.textContent = describe(value - 1)
    curRow.textContent = describe(value)
    nextRow.textContent = describe(value + 1)
    root.setAttribute('aria-valuemin', String(min + 1))
    root.setAttribute('aria-valuemax', String(max + 1))
    root.setAttribute('aria-valuenow', String(value + 1))
    // 到边界时把对应跳转按钮变淡并禁用
    const atTop = value <= min
    const atBottom = value >= max
    jumpUpBtn.style.opacity = atTop ? '0.25' : '1'
    jumpDownBtn.style.opacity = atBottom ? '0.25' : '1'
    jumpUpBtn.style.pointerEvents = atTop ? 'none' : 'auto'
    jumpDownBtn.style.pointerEvents = atBottom ? 'none' : 'auto'
  }

  const apply = (next: number, notify: boolean): void => {
    const clamped = Math.max(min, Math.min(max, Math.round(next)))
    if (clamped === value) {
      render()
      return
    }
    value = clamped
    render()
    if (notify) {
      onChangeHandler?.(value)
      // 供外部（如手机端「准备音频」状态）监听范围变化
      root.dispatchEvent(new CustomEvent('tts-range-change', { detail: value, bubbles: true }))
    }
  }

  const step = (delta: number): void => apply(value + delta, true)

  // ── 鼠标滚轮（保持原有速度：一格一块）──
  let wheelAcc = 0
  root.addEventListener('wheel', (e) => {
    e.preventDefault()
    e.stopPropagation()
    wheelAcc += e.deltaY
    let steps = 0
    while (Math.abs(wheelAcc) >= WHEEL_STEP && steps < MAX_STEPS_PER_EVENT) {
      const dir = wheelAcc > 0 ? 1 : -1
      step(dir)
      wheelAcc -= dir * WHEEL_STEP
      steps++
    }
    if (steps >= MAX_STEPS_PER_EVENT) wheelAcc = 0
  }, { passive: false })

  // ── 触摸上划 / 下划（上划 = 下一项）──
  let touchStartY = 0
  let touchStartX = 0
  let swiping = false
  root.addEventListener('touchstart', (e) => {
    const touch = e.touches[0]
    touchStartY = touch?.clientY ?? 0
    touchStartX = touch?.clientX ?? 0
    swiping = false
    e.stopPropagation()
  }, { passive: true })
  root.addEventListener('touchmove', (e) => {
    const touch = e.touches[0]
    if (!touch) return
    const dy = touch.clientY - touchStartY
    const dx = touch.clientX - touchStartX
    if (!swiping && Math.abs(dy) > Math.abs(dx)) swiping = true
    if (swiping) {
      e.preventDefault()
      e.stopPropagation()
    }
  }, { passive: false })
  root.addEventListener('touchend', (e) => {
    if (!swiping) return
    const endY = e.changedTouches[0]?.clientY ?? touchStartY
    const dy = endY - touchStartY
    if (Math.abs(dy) >= SWIPE_STEP) {
      const count = Math.min(MAX_STEPS_PER_EVENT, Math.max(1, Math.round(Math.abs(dy) / SWIPE_STEP)))
      step(dy < 0 ? count : -count)
    }
    swiping = false
    e.stopPropagation()
  }, { passive: true })

  // ── 右侧上/下按钮：一次跳 JUMP_STEP 块 ──
  jumpUpBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    step(-JUMP_STEP)
  })
  jumpDownBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    step(JUMP_STEP)
  })

  // ── 键盘 ──
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      step(e.shiftKey ? -JUMP_STEP : -1)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      step(e.shiftKey ? JUMP_STEP : 1)
    } else if (e.key === 'PageUp') {
      e.preventDefault()
      step(-JUMP_STEP)
    } else if (e.key === 'PageDown') {
      e.preventDefault()
      step(JUMP_STEP)
    } else if (e.key === 'Home') {
      e.preventDefault()
      apply(min, true)
    } else if (e.key === 'End') {
      e.preventDefault()
      apply(max, true)
    }
  })

  // ── 点击上下两行 ──
  prevRow.addEventListener('click', (e) => {
    e.stopPropagation()
    step(-1)
  })
  nextRow.addEventListener('click', (e) => {
    e.stopPropagation()
    step(1)
  })

  root.addEventListener('focus', () => {
    root.style.boxShadow = '0 0 0 2px color-mix(in srgb, var(--b3-theme-primary) 35%, transparent)'
  })
  root.addEventListener('blur', () => {
    root.style.boxShadow = 'none'
  })

  render()

  return {
    element: root,
    getValue: () => value,
    setValue: (v: number) => apply(v, false),
    setBounds: (nextMin: number, nextMax: number) => {
      min = Math.max(0, Math.min(Math.round(nextMin), lastIndex))
      max = Math.max(min, Math.min(Math.round(nextMax), lastIndex))
      apply(value, false)
    },
    get onChange() { return onChangeHandler },
    set onChange(fn: ((value: number) => void) | undefined) { onChangeHandler = fn },
  }
}

/** 让起始/结束两个选择器互相约束：起点不能超过终点，终点不能小于起点 */
export function linkParagraphPickers(start: ParagraphPicker, end: ParagraphPicker, total: number): void {
  const lastIndex = Math.max(0, total - 1)
  start.setBounds(0, end.getValue())
  end.setBounds(start.getValue(), lastIndex)
  start.onChange = (value: number) => end.setBounds(value, lastIndex)
  end.onChange = (value: number) => start.setBounds(0, value)
}
