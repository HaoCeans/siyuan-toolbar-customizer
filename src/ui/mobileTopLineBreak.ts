/**
 * 手机端顶部工具栏：在 #toolbarSync 左侧插入 H，点击触发与 Enter 相同的分段（硬换行）
 */
import { showMessage } from 'siyuan'

const BTN_ID = 'siyuan-toolbar-customizer-mobile-linebreak'

/** pointerdown 瞬间从选区克隆（部分场景仍有效） */
let savedPointerRange: Range | null = null
/** selectionchange 期间在正文内时持续更新的光标，用于触摸离开编辑器后再点换行按钮 */
let lastCaretRange: Range | null = null

let selectionChangeRaf = 0
let onSelectionChangeBound: (() => void) | null = null

/** 延迟派发 Enter：若在下一帧前用户点了工具栏等，需取消，避免 wysiwyg.focus 关掉同步弹窗 */
let pendingEnterRaf = 0
let globalPointerGuard: ((e: PointerEvent) => void) | null = null

function getMobileWysiwyg(): HTMLElement | null {
  const protyle = (window as any).siyuan?.mobile?.editor?.protyle
  const el = protyle?.wysiwyg?.element as HTMLElement | undefined
  return el ?? null
}

function mirrorSelectionToLastCaret() {
  const wysiwyg = getMobileWysiwyg()
  if (!wysiwyg) return
  const sel = getSelection()
  if (sel.rangeCount === 0) return
  const r = sel.getRangeAt(0)
  if (!wysiwyg.contains(r.startContainer)) return
  try {
    lastCaretRange = r.cloneRange()
  } catch {
    lastCaretRange = null
  }
}

function attachSelectionMirror() {
  if (onSelectionChangeBound) return
  onSelectionChangeBound = () => {
    if (selectionChangeRaf) return
    selectionChangeRaf = requestAnimationFrame(() => {
      selectionChangeRaf = 0
      mirrorSelectionToLastCaret()
    })
  }
  document.addEventListener('selectionchange', onSelectionChangeBound)
}

function detachSelectionMirror() {
  if (onSelectionChangeBound) {
    document.removeEventListener('selectionchange', onSelectionChangeBound)
    onSelectionChangeBound = null
  }
  if (selectionChangeRaf) {
    cancelAnimationFrame(selectionChangeRaf)
    selectionChangeRaf = 0
  }
}

function cancelPendingEnterDispatch() {
  if (pendingEnterRaf) {
    cancelAnimationFrame(pendingEnterRaf)
    pendingEnterRaf = 0
  }
}

/** 在捕获阶段：点在 H 或正文外则取消尚未执行的 Enter，防止 focus 正文顶掉同步等弹窗 */
function attachGlobalPointerGuard() {
  if (globalPointerGuard) return
  globalPointerGuard = (e: PointerEvent) => {
    if (!pendingEnterRaf) return
    const t = e.target
    if (!t || !(t instanceof Element)) {
      cancelPendingEnterDispatch()
      return
    }
    if (t.closest('#' + BTN_ID)) return
    const wysiwyg = getMobileWysiwyg()
    if (wysiwyg?.contains(t)) return
    cancelPendingEnterDispatch()
  }
  document.addEventListener('pointerdown', globalPointerGuard, true)
}

function detachGlobalPointerGuard() {
  if (globalPointerGuard) {
    document.removeEventListener('pointerdown', globalPointerGuard, true)
    globalPointerGuard = null
  }
  cancelPendingEnterDispatch()
}

function removeButton() {
  document.getElementById(BTN_ID)?.remove()
}

function tryRestoreAnySavedRange(wysiwyg: HTMLElement): boolean {
  const candidates = [savedPointerRange, lastCaretRange]
  savedPointerRange = null
  for (const r of candidates) {
    if (!r) continue
    try {
      if (!wysiwyg.contains(r.startContainer)) continue
      const sel = getSelection()
      sel.removeAllRanges()
      sel.addRange(r)
      return true
    } catch {
      /* 选区已失效，试下一个 */
    }
  }
  return false
}

/**
 * 思源 keydown 里用 event.keyCode 匹配 Enter（matchHotKey("↩")），
 * 仅用 KeyboardEvent 构造函数时 keyCode 往往为 0，需补一层 getter。
 */
function createEnterKeydownEvent(): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: 'Enter',
    code: 'Enter',
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
  })
  const k = 13
  try {
    Object.defineProperty(ev, 'keyCode', { configurable: true, get: () => k })
    Object.defineProperty(ev, 'which', { configurable: true, get: () => k })
  } catch {
    // 个别 WebView 不可覆盖
  }
  return ev
}

function dispatchHardEnterInEditor() {
  cancelPendingEnterDispatch()

  const wysiwyg = getMobileWysiwyg()
  if (!wysiwyg) {
    showMessage('请先打开文档后再使用换行', 2000, 'info')
    return
  }

  tryRestoreAnySavedRange(wysiwyg)
  wysiwyg.focus({ preventScroll: true })

  pendingEnterRaf = requestAnimationFrame(() => {
    pendingEnterRaf = 0
    wysiwyg.dispatchEvent(createEnterKeydownEvent())
  })
}

function insertIfNeeded() {
  const sync = document.getElementById('toolbarSync')
  const more = document.getElementById('toolbarMore')
  const anchor = sync ?? more
  const parent = anchor?.parentElement
  if (!parent?.querySelector('#toolbarFile')) return
  if (document.getElementById(BTN_ID)) return

  attachSelectionMirror()
  attachGlobalPointerGuard()

  const btn = document.createElement('span')
  btn.id = BTN_ID
  btn.className = 'siyuan-toolbar-customizer-mobile-linebreak-btn'
  btn.setAttribute('role', 'button')
  btn.setAttribute('aria-label', '换行')
  btn.tabIndex = -1
  btn.style.cssText = [
    'box-sizing:border-box',
    'width:36px',
    'height:36px',
    'margin:6px 4px',
    'padding:0',
    'flex-shrink:0',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'overflow:hidden',
    'color:var(--b3-theme-on-surface)',
    'border-radius:var(--b3-border-radius)',
    'touch-action:manipulation',
    'user-select:none',
    '-webkit-user-select:none',
  ].join(';')

  const glyph = document.createElement('span')
  glyph.textContent = 'H'
  glyph.style.cssText =
    'display:inline-block;font-size:18px;font-weight:700;line-height:1;transform:translateY(2px)'
  btn.appendChild(glyph)

  btn.addEventListener(
    'pointerdown',
    (e) => {
      const wysiwyg = getMobileWysiwyg()
      if (wysiwyg) {
        const sel = getSelection()
        if (sel.rangeCount > 0) {
          const r = sel.getRangeAt(0)
          if (wysiwyg.contains(r.startContainer)) {
            try {
              savedPointerRange = r.cloneRange()
            } catch {
              savedPointerRange = null
            }
          }
        }
      }
      e.preventDefault()
    },
    { capture: true, passive: false }
  )

  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    dispatchHardEnterInEditor()
  })

  parent.insertBefore(btn, anchor)
}

/**
 * 根据插件配置显示或移除顶部 H 换行按钮（仅手机端 / 浏览器移动端）
 */
export function syncMobileTopLineBreakButton(isMobile: boolean, enabled: boolean, disableCustomButtons: boolean): void {
  if (!isMobile || !enabled || disableCustomButtons) {
    detachSelectionMirror()
    detachGlobalPointerGuard()
    removeButton()
    savedPointerRange = null
    lastCaretRange = null
    return
  }
  insertIfNeeded()
}

export function destroyMobileTopLineBreakButton(): void {
  detachSelectionMirror()
  detachGlobalPointerGuard()
  removeButton()
  savedPointerRange = null
  lastCaretRange = null
}
