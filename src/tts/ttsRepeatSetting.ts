/**
 * 「每块朗读次数」滑杆行 — 手机端 / 电脑端朗读设置弹窗共用。
 *
 * 与「语速」滑杆放在一起，范围 1-5（TTS_REPEAT_MAX），默认 1。
 * - 拖动时实时更新右侧数值
 * - 松手（change）时写入设置；各引擎在开始播放时读取该设置
 * - 播放条上的数字胶囊仍可临时覆盖「当前块」的次数
 */

import { t } from '../i18n/runtime'
import {
  clampRepeatCount,
  getReadDirectionSetting,
  getRepeatCountSetting,
  saveTTSSettings,
  TTS_REPEAT_MAX,
} from './httpTtsEngine'

export interface RepeatSliderRow {
  row: HTMLElement
  /** 当前滑杆值（1-5） */
  getValue(): number
}

export type RepeatSliderVariant = 'mobile' | 'desktop'

const VALUE_STYLE = 'min-width:36px;text-align:right;font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;'

export function createRepeatSliderRow(variant: RepeatSliderVariant): RepeatSliderRow {
  const initial = getRepeatCountSetting()
  const row = document.createElement('div')
  const label = variant === 'mobile' ? document.createElement('div') : document.createElement('label')
  label.textContent = t('tts.repeatCountLabel', undefined, '每块朗读')
  const slider = document.createElement('input')
  slider.type = 'range'
  slider.min = '1'
  slider.max = String(TTS_REPEAT_MAX)
  slider.step = '1'
  slider.value = String(initial)
  slider.style.cssText = variant === 'mobile' ? 'flex:1' : 'flex:1;margin:0 8px;'
  slider.setAttribute('aria-label', label.textContent)
  const value = document.createElement('span')
  value.style.cssText = VALUE_STYLE
  const renderValue = () => {
    value.textContent = t('tts.repeatTimes', { n: slider.value }, `${slider.value} 次`)
  }
  renderValue()
  slider.oninput = renderValue
  // 松手才写盘，避免拖动过程中反复持久化
  slider.onchange = () => {
    saveTTSSettings({ repeatCount: clampRepeatCount(parseInt(slider.value, 10)) })
  }

  if (variant === 'mobile') {
    // 与 makeRow 相同的纵向结构：标题在上，滑杆+数值在下
    row.style.cssText = 'margin-bottom:14px'
    label.style.cssText = 'font-size:13px;margin-bottom:6px;opacity:0.6;font-weight:500;letter-spacing:-0.01em;'
    row.appendChild(label)
    const box = document.createElement('div')
    box.style.cssText = 'display:flex;align-items:center;gap:8px'
    box.appendChild(slider)
    box.appendChild(value)
    row.appendChild(box)
  } else {
    // 与 createRow 相同的横向结构：标题 | 滑杆 | 数值
    row.style.cssText = 'display:flex;align-items:center;gap:12px'
    label.style.cssText = 'font-size:13px;min-width:60px;opacity:0.6;font-weight:500;letter-spacing:-0.01em;'
    row.appendChild(label)
    row.appendChild(slider)
    row.appendChild(value)
  }

  return { row, getValue: () => clampRepeatCount(parseInt(slider.value, 10)) }
}

// ─── 朗读顺序开关（从后往前读）──

/**
 * 「从后往前读」开关行。
 * 关闭（默认）= 从前往后读；打开 = 从文档末尾往前读。
 * 切换即持久化，各引擎在开始播放时读取。
 */
export function createReadDirectionRow(variant: RepeatSliderVariant): HTMLElement {
  const backward = getReadDirectionSetting() === 'backward'
  const row = document.createElement('div')
  const label = document.createElement(variant === 'mobile' ? 'div' : 'label')
  label.textContent = t('tts.readBackward', undefined, '从后往前读')
  const tail = document.createElement('div')
  tail.style.cssText = 'display:flex;align-items:center;gap:10px;flex:none;'

  const stateText = document.createElement('span')
  stateText.style.cssText = 'font-size:12px;opacity:0.55;font-variant-numeric:tabular-nums;'

  const toggle = document.createElement('div')
  toggle.setAttribute('role', 'switch')
  toggle.setAttribute('tabindex', '0')
  toggle.style.cssText = `
    position:relative;width:44px;height:26px;border-radius:13px;flex:none;
    transition:background 0.18s ease;cursor:pointer;box-sizing:border-box;
  `
  const knob = document.createElement('div')
  knob.style.cssText = `
    position:absolute;top:2px;left:2px;width:22px;height:22px;border-radius:50%;
    background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.25);
    transition:transform 0.18s ease;
  `
  toggle.appendChild(knob)

  const render = (on: boolean) => {
    toggle.setAttribute('aria-checked', on ? 'true' : 'false')
    toggle.style.background = on ? 'var(--b3-theme-primary)' : 'rgba(127,127,127,0.35)'
    knob.style.transform = on ? 'translateX(18px)' : 'translateX(0)'
    stateText.textContent = on
      ? t('tts.readBackwardShort', undefined, '倒序')
      : t('tts.readForwardShort', undefined, '正序')
  }
  const toggleState = () => {
    const next = toggle.getAttribute('aria-checked') !== 'true'
    render(next)
    saveTTSSettings({ readDirection: next ? 'backward' : 'forward' })
  }
  toggle.onclick = toggleState
  toggle.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault()
      toggleState()
    }
  }
  render(backward)

  tail.appendChild(stateText)
  tail.appendChild(toggle)

  if (variant === 'mobile') {
    // 与 makeRow 一致的纵向节奏：标题 + 右侧开关
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px'
    label.style.cssText = 'font-size:13px;opacity:0.6;font-weight:500;letter-spacing:-0.01em;'
    row.appendChild(label)
    row.appendChild(tail)
  } else {
    row.style.cssText = 'display:flex;align-items:center;gap:12px'
    label.style.cssText = 'font-size:13px;min-width:60px;opacity:0.6;font-weight:500;letter-spacing:-0.01em;'
    row.appendChild(label)
    const spacer = document.createElement('span')
    spacer.style.cssText = 'flex:1'
    row.appendChild(spacer)
    row.appendChild(tail)
  }

  return row
}
