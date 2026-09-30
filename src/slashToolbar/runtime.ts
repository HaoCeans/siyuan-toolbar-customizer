/**
 * 斜杠菜单工具栏 —— 运行时（独立文件）
 *
 * 一条固定在屏幕底部、叠在思源自带键盘工具条之上的插入按钮栏：
 * 软键盘打开时出现，收起时滑出；点按钮直接插入，或展开底部面板选择。
 *
 * 与思源原生栏的关系：
 * - 显隐以 body.mobile-keyboard--open 为主判据（思源自己维护），配合
 *   siyuan-mobile-keyboard-change（收起有 300ms 延迟，正好做过渡动画）与
 *   siyuan-mobile-keyboard-hiding（退场前提前让位）
 * - 位置实测 #keyboardToolbar 的 top，层级取它的 z-index + 1（该值来自思源全局计数器，会持续增长）
 */

import type { ISlashEntry } from './catalog'
import { t } from '../i18n/runtime'
import { isMobileDevice } from '../toolbarManager'
import { renderButtonIcon } from '../ui/buttonIconRender'
import { logger } from '../utils/logger'
import {
  getAvailablePanelEntries,
  getBarSlashButtons,
  getSlashEntry,
  getSlashEntryName,
} from './catalog'
import { executeSlashEntry } from './insert'
import {
  injectSlashToolbarStyle,
  removeSlashToolbarStyle,
} from './style'

/** 原生键盘工具条（思源斜杠面板）展开时的让位阈值 */
const UTIL_OPEN_PX = 90
/** 长按判定时间（长按直接插图） */
const LONG_PRESS_MS = 480
/** 面板下滑关闭距离 */
const SHEET_DRAG_CLOSE_PX = 64
/** 面板点选判定：位移超过该值视为滚动 */
const SHEET_TAP_PX = 10
/** 视口高度兜底判定：与历史最大高度差超过该值视为键盘打开 */
const VIEWPORT_OPEN_DELTA = 120

type TTranslator = (key: string, fallback: string) => string

let enabled = false
let order: string[] = []
let initialized = false

let barEl: HTMLDivElement | null = null
let sheetEl: HTMLDivElement | null = null
let savedRange: Range | null = null
let maxViewportH = 0
let busy = false
let touchMode = false
let measureTimer: number | undefined
let bodyClassObserver: MutationObserver | undefined
let bodyChildObserver: MutationObserver | undefined
let heartbeatTimer: number | undefined
let sheetResolve: ((entry: ISlashEntry | null) => void) | null = null
let viewportBound = false

/** 取思源界面语言文案 */
const syLang: TTranslator = (key, fallback) => {
  const dictionary = (window as any).siyuan?.languages
  return (dictionary && dictionary[key]) || fallback
}

const buttonName = (id: string, fallback: string) => t(`slashToolbar.button.${id}`, undefined, fallback)

const viewportH = () => (window.visualViewport?.height || window.innerHeight)
const viewportW = () => (window.visualViewport?.width || window.innerWidth)

const isKeyboardOpen = () => {
  if (document.body.classList.contains('mobile-keyboard--open')) {
    return true
  }
  // 兜底：body class 尚未更新时，用视口高度回落判断
  const height = viewportH()
  if (!maxViewportH) {
    maxViewportH = height
  }
  if (height > maxViewportH) {
    maxViewportH = height
  }
  return maxViewportH - height > VIEWPORT_OPEN_DELTA
}

const inEditor = () => {
  const wysiwyg = document.querySelector<HTMLElement>('.protyle-wysiwyg')
  if (!wysiwyg) {
    return false
  }
  const rect = wysiwyg.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

const dialogOpen = () => {
  const dialog = document.querySelector<HTMLElement>('.b3-dialog--open, .b3-dialog')
  return !!dialog && dialog.getBoundingClientRect().height > 0
}

const nativeKeyboardBar = () => {
  const element = document.getElementById('keyboardToolbar')
  if (!element || element.classList.contains('fn__none')) {
    return null
  }
  const rect = element.getBoundingClientRect()
  if (rect.height <= 0 || rect.width < viewportW() * 0.5) {
    return null
  }
  return {
    element,
    rect,
  }
}

const shouldShow = () => {
  if (!enabled || !initialized) {
    return false
  }
  const siyuan = (window as any).siyuan
  if (siyuan?.config?.readonly || siyuan?.isPublish) {
    return false
  }
  if (!isKeyboardOpen()) {
    return false
  }
  const nativeBar = nativeKeyboardBar()
  if (!nativeBar) {
    return false
  }
  // 思源斜杠工具面板展开时（键盘工具条变高）让位，避免两条栏叠在一起
  if (nativeBar.rect.height > UTIL_OPEN_PX) {
    return false
  }
  return inEditor() && !dialogOpen()
}

const updateVisibility = () => {
  if (!barEl) {
    return
  }
  const visible = shouldShow()
  barEl.classList.toggle('sy-mb-hidden', !visible)
  if (!visible) {
    closeSheet(null)
  }
}

const applyMeasure = () => {
  if (!barEl) {
    return
  }
  const nativeBar = nativeKeyboardBar()
  const offset = nativeBar ? Math.max(0, Math.round(viewportH() - nativeBar.rect.top)) : 48
  barEl.style.setProperty('--sy-mb-offset', `${offset}px`)
  document.documentElement.style.setProperty('--sy-mb-stack', `${offset}px`)
  if (nativeBar) {
    const nativeZIndex = Number.parseInt(window.getComputedStyle(nativeBar.element).zIndex, 10) || 0
    if (nativeZIndex > 0) {
      barEl.style.zIndex = String(nativeZIndex + 1)
    }
  }
  updateVisibility()
}

const scheduleMeasure = (delay = 0) => {
  window.clearTimeout(measureTimer)
  measureTimer = window.setTimeout(() => {
    measureTimer = undefined
    applyMeasure()
  }, delay)
}

const captureRange = () => {
  try {
    const selection = window.getSelection()
    savedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null
  } catch {
    savedRange = null
  }
}

const setBusy = (value: boolean) => {
  busy = value
  barEl?.querySelectorAll('.sy-mb-btn').forEach((button) => {
    button.classList.toggle('sy-mb-busy', value)
  })
}

const vibrate = () => {
  try {
    navigator.vibrate?.(10)
  } catch {
    // 不支持震动时忽略
  }
}

/* ------------------------------------------------------------- 二级面板 */

const closeSheet = (entry: ISlashEntry | null) => {
  if (!sheetEl) {
    return
  }
  const resolve = sheetResolve
  sheetResolve = null
  sheetEl.classList.remove('sy-mb-open')
  const panel = sheetEl.querySelector<HTMLElement>('.sy-mb-panel')
  if (panel) {
    panel.style.transition = ''
    panel.style.transform = ''
  }
  window.setTimeout(() => {
    if (sheetEl && !sheetEl.classList.contains('sy-mb-open')) {
      sheetEl.style.display = 'none'
    }
  }, 240)
  resolve?.(entry)
}

const bindSheetTap = (row: HTMLElement, onTap: () => void) => {
  let startX = 0
  let startY = 0
  let moved = false
  row.addEventListener('touchstart', (event) => {
    const touch = event.touches[0]
    if (!touch) {
      return
    }
    startX = touch.clientX
    startY = touch.clientY
    moved = false
  }, { passive: true })
  row.addEventListener('touchmove', (event) => {
    const touch = event.touches[0]
    if (!touch) {
      return
    }
    if (Math.abs(touch.clientX - startX) > SHEET_TAP_PX || Math.abs(touch.clientY - startY) > SHEET_TAP_PX) {
      moved = true
    }
  }, { passive: true })
  row.addEventListener('touchend', (event) => {
    if (moved) {
      return
    }
    if (event.cancelable) {
      event.preventDefault()
    }
    onTap()
  }, { passive: false })
  row.addEventListener('click', () => {
    if (!moved) {
      onTap()
    }
  })
}

/** 按住面板顶部小横条下滑关闭：只改 transform，不触发 focus/blur，软键盘不会收起 */
const bindSheetDrag = () => {
  if (!sheetEl) {
    return
  }
  const panel = sheetEl.querySelector<HTMLElement>('.sy-mb-panel')
  const zone = sheetEl.querySelector<HTMLElement>('.sy-mb-grip-zone')
  if (!panel || !zone) {
    return
  }
  let startY = 0
  let startAt = 0
  let dy = 0
  let dragging = false

  const finish = () => {
    if (!dragging) {
      return
    }
    dragging = false
    const distance = dy
    const quick = distance > 24 && Date.now() - startAt < 260
    dy = 0
    panel.style.transition = ''
    panel.style.transform = ''
    if (distance >= SHEET_DRAG_CLOSE_PX || quick) {
      closeSheet(null)
    }
  }

  zone.addEventListener('touchstart', (event) => {
    const touch = event.touches[0]
    if (!touch) {
      return
    }
    startY = touch.clientY
    startAt = Date.now()
    dy = 0
    dragging = true
    panel.style.transition = 'none'
  }, { passive: true })
  zone.addEventListener('touchmove', (event) => {
    if (!dragging) {
      return
    }
    const touch = event.touches[0]
    if (!touch) {
      return
    }
    dy = Math.max(0, touch.clientY - startY)
    panel.style.transform = `translateY(${dy}px)`
    if (event.cancelable) {
      event.preventDefault()
    }
  }, { passive: false })
  zone.addEventListener('touchend', finish)
  zone.addEventListener('touchcancel', finish)
}

const showSheet = (entries: ISlashEntry[]): Promise<ISlashEntry | null> => {
  return new Promise((resolve) => {
    if (!sheetEl) {
      resolve(null)
      return
    }
    closeSheet(null)
    const panel = sheetEl.querySelector<HTMLElement>('.sy-mb-panel')
    const list = sheetEl.querySelector<HTMLElement>('.sy-mb-list')
    if (!panel || !list) {
      resolve(null)
      return
    }
    panel.style.transition = ''
    panel.style.transform = ''
    list.innerHTML = ''
    if (!entries.length) {
      const empty = document.createElement('div')
      empty.className = 'sy-mb-empty'
      empty.textContent = t('slashToolbar.empty', undefined, '当前环境下没有可用项')
      list.appendChild(empty)
    }
    entries.forEach((entry) => {
      const row = document.createElement('div')
      row.className = 'sy-mb-item'
      const iconBox = document.createElement('span')
      iconBox.className = 'sy-mb-item-icon'
      renderButtonIcon(iconBox, entry.icon, 20)
      const text = document.createElement('span')
      text.className = 'sy-mb-item-text'
      text.textContent = getSlashEntryName(entry, syLang)
      row.appendChild(iconBox)
      row.appendChild(text)
      bindSheetTap(row, () => closeSheet(entry))
      list.appendChild(row)
    })

    const mask = sheetEl.querySelector<HTMLElement>('.sy-mb-mask')
    const onMaskTap = (event: Event) => {
      if (event.cancelable) {
        event.preventDefault()
      }
      closeSheet(null)
    }
    if (mask && sheetEl.dataset.maskBound !== 'true') {
      mask.addEventListener('click', onMaskTap)
      mask.addEventListener('touchend', onMaskTap, { passive: false })
      sheetEl.dataset.maskBound = 'true'
    }

    sheetResolve = resolve
    sheetEl.style.display = 'block'
    requestAnimationFrame(() => sheetEl?.classList.add('sy-mb-open'))
  })
}

/* --------------------------------------------------------------- 按钮 */

const runEntry = async (entry: ISlashEntry) => {
  if (busy) {
    return
  }
  setBusy(true)
  try {
    const ok = await executeSlashEntry(entry, savedRange)
    if (!ok) {
      logger.warn('[slashToolbar] 插入未执行:', entry.id)
    }
  } finally {
    setBusy(false)
    scheduleMeasure()
  }
}

const bindBarButton = (element: HTMLElement, panelId: string | undefined, entryId: string | undefined, longPressEntryId: string | undefined) => {
  let longPressTimer: number | undefined
  let moved = false
  let fired = false
  let startX = 0
  let startY = 0

  const cancelLongPress = () => {
    if (longPressTimer !== undefined) {
      window.clearTimeout(longPressTimer)
      longPressTimer = undefined
    }
  }

  const pressIn = () => element.classList.add('sy-mb-press')
  const pressOut = () => element.classList.remove('sy-mb-press')

  const onTap = async () => {
    if (panelId) {
      const entries = getAvailablePanelEntries(panelId)
      if (!entries.length) {
        return
      }
      const picked = await showSheet(entries)
      if (picked) {
        await runEntry(picked)
      }
      return
    }
    const entry = entryId ? getSlashEntry(entryId) : undefined
    if (entry) {
      await runEntry(entry)
    }
  }

  const onLongPress = longPressEntryId
    ? async () => {
      const entry = getSlashEntry(longPressEntryId)
      if (entry) {
        vibrate()
        await runEntry(entry)
      }
    }
    : undefined

  element.addEventListener('touchstart', (event) => {
    touchMode = true
    // 阻止默认行为，避免焦点从 contenteditable 被抢走导致软键盘收起
    if (event.cancelable) {
      event.preventDefault()
    }
    captureRange()
    moved = false
    fired = false
    const touch = event.touches[0]
    if (touch) {
      startX = touch.clientX
      startY = touch.clientY
    }
    pressIn()
    if (onLongPress) {
      cancelLongPress()
      longPressTimer = window.setTimeout(() => {
        longPressTimer = undefined
        fired = true
        pressOut()
        void onLongPress()
      }, LONG_PRESS_MS)
    }
  }, { passive: false })

  element.addEventListener('touchmove', (event) => {
    const touch = event.touches[0]
    if (!touch) {
      return
    }
    if (Math.abs(touch.clientX - startX) > 10 || Math.abs(touch.clientY - startY) > 10) {
      moved = true
      cancelLongPress()
      pressOut()
    }
  }, { passive: true })

  element.addEventListener('touchend', (event) => {
    if (event.cancelable) {
      event.preventDefault()
    }
    cancelLongPress()
    pressOut()
    if (!fired && !moved) {
      void onTap()
    }
  }, { passive: false })

  element.addEventListener('touchcancel', () => {
    cancelLongPress()
    pressOut()
  })

  element.addEventListener('mousedown', (event) => {
    if (touchMode) {
      return
    }
    event.preventDefault()
    captureRange()
    pressIn()
  })

  element.addEventListener('mouseup', (event) => {
    if (touchMode) {
      return
    }
    event.preventDefault()
    pressOut()
    void onTap()
  })

  element.addEventListener('click', (event) => event.preventDefault())
  element.addEventListener('contextmenu', (event) => {
    event.preventDefault()
    if (onLongPress) {
      void onLongPress()
    }
  })
}

const renderBar = () => {
  if (!barEl) {
    return
  }
  barEl.querySelectorAll('.sy-mb-btn').forEach((button) => button.remove())
  getBarSlashButtons(order).forEach(({
    button,
    panel,
    entry,
  }) => {
    const element = document.createElement('button')
    element.className = 'sy-mb-btn'
    element.type = 'button'
    const label = buttonName(button.id, button.fallback)
    element.setAttribute('aria-label', label)
    element.title = label
    const iconBox = document.createElement('span')
    iconBox.className = 'sy-mb-icon-box'
    renderButtonIcon(iconBox, button.icon, 20)
    const svg = iconBox.querySelector('svg')
    if (svg) {
      svg.classList.add('sy-mb-icon')
    } else {
      // 非思源图标（Emoji / 文本，如内置样式的 A）走文字样式，尺寸与 .sy-mb-icon 对齐
      iconBox.classList.add('sy-mb-icon')
      iconBox.style.display = 'flex'
      iconBox.style.alignItems = 'center'
      iconBox.style.justifyContent = 'center'
      iconBox.style.fontSize = '18px'
      iconBox.style.lineHeight = '1'
    }
    element.appendChild(iconBox)
    const longPressEntryId = button.longPressEntryId && (!entry || entry.id !== button.longPressEntryId)
      ? button.longPressEntryId
      : undefined
    bindBarButton(element, panel?.id, entry?.id, longPressEntryId)
    barEl?.appendChild(element)
  })
}

const buildBar = () => {
  barEl = document.createElement('div')
  barEl.id = 'syMobileToolbar'
  barEl.className = 'sy-mb-hidden'
  barEl.setAttribute('role', 'toolbar')
  barEl.setAttribute('aria-label', t('slashToolbar.title', undefined, '斜杠菜单工具栏'))
  document.body.appendChild(barEl)

  sheetEl = document.createElement('div')
  sheetEl.id = 'syMobileToolbarSheet'
  sheetEl.style.display = 'none'
  sheetEl.innerHTML = '<div class="sy-mb-mask"></div>'
    + '<div class="sy-mb-panel">'
    + '<div class="sy-mb-grip-zone"><div class="sy-mb-grip"></div></div>'
    + '<div class="sy-mb-list"></div>'
    + '</div>'
  document.body.appendChild(sheetEl)

  // 静态部分只绑一次：遮罩点击关闭、面板小横条下滑关闭
  const mask = sheetEl.querySelector<HTMLElement>('.sy-mb-mask')
  const onMaskTap = (event: Event) => {
    if (event.cancelable) {
      event.preventDefault()
    }
    closeSheet(null)
  }
  mask?.addEventListener('click', onMaskTap)
  mask?.addEventListener('touchend', onMaskTap, { passive: false })
  sheetEl.dataset.maskBound = 'true'
  bindSheetDrag()

  document.body.classList.add('sy-mb-enabled')
  renderBar()
}

/* ----------------------------------------------------------- 事件绑定 */

const onKeyboardSignal = () => {
  scheduleMeasure(60)
  scheduleMeasure(320)
}

const onKeyboardHiding = () => {
  maxViewportH = 0
  scheduleMeasure(120)
}

const onViewportChange = () => {
  scheduleMeasure(120)
}

const onOrientationChange = () => {
  maxViewportH = 0
  scheduleMeasure(300)
}

const bindEvents = () => {
  window.addEventListener('siyuan-mobile-keyboard-change', onKeyboardSignal)
  window.addEventListener('siyuan-mobile-keyboard-hiding', onKeyboardHiding)
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('orientationchange', onOrientationChange)
  if (!viewportBound && window.visualViewport) {
    window.visualViewport.addEventListener('resize', onViewportChange)
    window.visualViewport.addEventListener('scroll', onViewportChange)
    viewportBound = true
  }
  bodyClassObserver = new MutationObserver(() => {
    scheduleMeasure()
  })
  bodyClassObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
  })
  bodyChildObserver = new MutationObserver(() => {
    if (busy) {
      return
    }
    scheduleMeasure(160)
  })
  bodyChildObserver.observe(document.body, {
    childList: true,
    subtree: true,
  })
  heartbeatTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') {
      applyMeasure()
    }
  }, 1500)
}

const unbindEvents = () => {
  window.removeEventListener('siyuan-mobile-keyboard-change', onKeyboardSignal)
  window.removeEventListener('siyuan-mobile-keyboard-hiding', onKeyboardHiding)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('orientationchange', onOrientationChange)
  if (viewportBound && window.visualViewport) {
    window.visualViewport.removeEventListener('resize', onViewportChange)
    window.visualViewport.removeEventListener('scroll', onViewportChange)
    viewportBound = false
  }
  bodyClassObserver?.disconnect()
  bodyClassObserver = undefined
  bodyChildObserver?.disconnect()
  bodyChildObserver = undefined
  window.clearInterval(heartbeatTimer)
  heartbeatTimer = undefined
  window.clearTimeout(measureTimer)
  measureTimer = undefined
}

/* --------------------------------------------------------------- 对外 */

/**
 * 同步斜杠菜单工具栏（幂等）：开启时建好并按 order 渲染，关闭时拆干净。
 * 由插件 onLayoutReady、设置面板开关、以及"完全恢复思源原始状态"共同调用。
 */
export const syncSlashToolbar = (nextEnabled: boolean, nextOrder: unknown): void => {
  enabled = nextEnabled === true
  order = Array.isArray(nextOrder) ? nextOrder as string[] : []

  if (!enabled || !isMobileDevice()) {
    destroySlashToolbar()
    return
  }
  if (!initialized) {
    injectSlashToolbarStyle()
    buildBar()
    bindEvents()
    initialized = true
  } else {
    renderBar()
  }
  maxViewportH = 0
  scheduleMeasure()
}

/** 拆卸：卸载、关闭开关、恢复思源原始状态时都走这里 */
export const destroySlashToolbar = (): void => {
  if (!initialized && !barEl && !sheetEl) {
    return
  }
  closeSheet(null)
  unbindEvents()
  barEl?.remove()
  sheetEl?.remove()
  barEl = null
  sheetEl = null
  document.body.classList.remove('sy-mb-enabled')
  document.documentElement.style.removeProperty('--sy-mb-stack')
  removeSlashToolbarStyle()
  savedRange = null
  busy = false
  maxViewportH = 0
  initialized = false
}

/** 只重建按钮（设置里改顺序后用，不必整条拆掉） */
export const refreshSlashToolbarButtons = (nextOrder: unknown): void => {
  order = Array.isArray(nextOrder) ? nextOrder as string[] : []
  if (initialized) {
    renderBar()
    scheduleMeasure()
  }
}
