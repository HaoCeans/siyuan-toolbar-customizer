import floatWindowHtml from './quick-note-float-window.html?raw'
import { getDesktopQuickNoteCaptureSettings } from './desktopCapture'
import { getQuickNoteFontSize } from './fontSize'
import { resolveQuickNoteInputFormat } from './resolveFormat'
import {
  attachQuickNoteWindowBoundsPersistence,
  loadQuickNoteWindowBounds,
  readElectronWindowBounds,
} from './quickNoteWindowBounds'

export type QuickNoteFloatSource = 'globalHotkey' | 'button'

export interface QuickNoteFloatSaveResult {
  ok: boolean
  message?: string
  clear?: boolean
}

export interface QuickNoteFloatWindowDeps {
  isElectron: () => boolean
  isMobile: () => boolean
  isDarkMode: () => boolean
  getFloatTitle: () => string
  getPlaceholder: () => string
  onSave: (text: string, isFromButton: boolean) => Promise<QuickNoteFloatSaveResult>
}

let deps: QuickNoteFloatWindowDeps | null = null
let floatWindow: any = null
let floatWindowCreating = false
let mainWindow: any = null
let mainWindowListenerAttached = false
let mainWindowCloseHandler: (() => void) | null = null
let themeObserver: MutationObserver | null = null
let floatSaveIsFromButton = false
let floatWindowAllowAutoShow = true
let floatWindowWantsVisible = true
// 防止全局快捷键与 in-app hotkey 连续触发导致 minimize → immediately restore
let lastFloatToggleTime = 0
const FLOAT_TOGGLE_COOLDOWN_MS = 500

const WIN_W = 200
const WIN_H = 168
const FLOAT_MIN_W = 160
const FLOAT_MIN_H = 120
const QUICKNOTE_FLOAT_WINDOW_ELECTRON_ID_KEY = '__quickNoteFloatWindowElectronId'
const QUICKNOTE_FLOAT_WINDOW_BOUNDS_KEY = '__quickNoteFloatWindowBounds'
const QUICKNOTE_FLOAT_WINDOW_MARKER = 'quick-note-float'

function getDefaultFloatWindowBounds() {
  const screenW = window.screen.availWidth || window.screen.width
  const screenH = window.screen.availHeight || window.screen.height
  return {
    width: WIN_W,
    height: WIN_H,
    x: Math.round((screenW - WIN_W) / 2),
    y: Math.round((screenH - WIN_H) / 2 - 40),
  }
}

function loadFloatWindowBounds() {
  return loadQuickNoteWindowBounds(
    QUICKNOTE_FLOAT_WINDOW_BOUNDS_KEY,
    getDefaultFloatWindowBounds(),
    FLOAT_MIN_W,
    FLOAT_MIN_H,
  )
}

function applyFloatWindowBounds(win: any): void {
  if (!win || win.isDestroyed?.()) return
  try {
    win.setMinimumSize?.(FLOAT_MIN_W, FLOAT_MIN_H)
    const stored = loadFloatWindowBounds()
    const current = readElectronWindowBounds(win)
    const bounds = current && current.width >= FLOAT_MIN_W && current.height >= FLOAT_MIN_H
      ? current
      : stored
    win.setBounds?.(bounds, false)
  } catch {
    // ignore
  }
}

function ensureFloatWindowSizeRevision(): void {
  // 保留空实现，避免旧版 SIZE_REV 逻辑误清用户尺寸
}

function resolveFloatWindow(): any {
  if (floatWindow) {
    try {
      if (typeof floatWindow.isDestroyed === 'function' && floatWindow.isDestroyed()) {
        floatWindow = null
      } else if (!floatWindow.closed) {
        return floatWindow
      } else {
        floatWindow = null
      }
    } catch {
      floatWindow = null
    }
  }

  const remote = (window as any).require?.('@electron/remote')
  const BrowserWindow = remote?.BrowserWindow
  if (!BrowserWindow) return null

  try {
    const storedId = localStorage.getItem(QUICKNOTE_FLOAT_WINDOW_ELECTRON_ID_KEY)
    if (storedId) {
      const w = BrowserWindow.fromId?.(Number(storedId))
      if (w && !w.isDestroyed?.()) {
        floatWindow = w
        return w
      }
      localStorage.removeItem(QUICKNOTE_FLOAT_WINDOW_ELECTRON_ID_KEY)
    }
  } catch {
    // ignore
  }

  try {
    const mainId = remote.getCurrentWindow?.()?.id
    for (const w of BrowserWindow.getAllWindows?.() || []) {
      if (!w || w.isDestroyed?.() || w.id === mainId) continue
      const url = w.webContents?.getURL?.() || ''
      if (!url.startsWith('data:text/html')) continue
      if (url.includes(QUICKNOTE_FLOAT_WINDOW_MARKER) || url.includes('__setQuickNoteFloatState')) {
        floatWindow = w
        localStorage.setItem(QUICKNOTE_FLOAT_WINDOW_ELECTRON_ID_KEY, String(w.id))
        return w
      }
    }
  } catch {
    // ignore
  }

  return null
}

function canUseFloatWindow(): boolean {
  return !!(deps?.isElectron() && !deps?.isMobile())
}

export function initQuickNoteFloatWindow(d: QuickNoteFloatWindowDeps): void {
  deps = d
  ensureFloatWindowSizeRevision()
  themeObserver = new MutationObserver(() => {
    syncFloatTheme()
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme-mode'],
  })
}

export function destroyQuickNoteFloatWindow(): void {
  closeFloatWindow({ force: true })
  themeObserver?.disconnect()
  themeObserver = null
  removeMainWindowListeners()
  deps = null
}

export function isQuickNoteFloatWindowOpen(): boolean {
  return !!resolveFloatWindow()
}

function isQuickNoteWindowHidden(win: any): boolean {
  if (!win || win.isDestroyed?.()) return true
  try {
    if (win.isMinimized?.()) return true
    if (typeof win.isVisible === 'function' && !win.isVisible()) return true
  } catch {
    // ignore
  }
  return false
}

function applyFloatWindowVisibility(win: any, visible: boolean): void {
  if (!win || win.isDestroyed?.()) return
  floatWindowWantsVisible = visible
  floatWindowAllowAutoShow = visible
  try {
    if (visible) {
      applyFloatWindowBounds(win)
      if (win.isMinimized?.()) win.restore()
      win.show?.()
      win.focus?.()
      void syncFloatState()
    } else {
      // 用 hide 代替 minimize：alwaysOnTop 窗口 minimize 后在 Windows 上会被系统立即恢复，
      // 导致「最小化→立刻弹出」的闪烁；hide() 直接隐藏窗口，无此问题。
      win.hide?.()
    }
  } catch {
    // ignore
  }
}

function showFloatWindowIfAllowed(win: any): void {
  applyFloatWindowVisibility(win, floatWindowWantsVisible)
}

export function toggleQuickNoteFloatWindow(isFromButton = false): void {
  if (!canUseFloatWindow()) return

  // 冷却保护：防止短时间内连续 toggle（全局快捷键 + in-app hotkey 双触发）
  const now = Date.now()
  if (now - lastFloatToggleTime < FLOAT_TOGGLE_COOLDOWN_MS) return
  lastFloatToggleTime = now

  floatSaveIsFromButton = isFromButton
  const win = resolveFloatWindow()
  if (win) {
    try {
      applyFloatWindowVisibility(win, isQuickNoteWindowHidden(win))
    } catch {
      closeFloatWindow({ force: true })
      floatWindowWantsVisible = true
      floatWindowAllowAutoShow = true
      createFloatWindow()
    }
    return
  }

  if (floatWindowCreating) {
    floatWindowWantsVisible = !floatWindowWantsVisible
    floatWindowAllowAutoShow = floatWindowWantsVisible
    const pending = resolveFloatWindow()
    if (pending) applyFloatWindowVisibility(pending, floatWindowWantsVisible)
    return
  }

  floatWindowWantsVisible = true
  floatWindowAllowAutoShow = true
  createFloatWindow()
}

function attachMainWindowListeners(): void {
  if (!mainWindow || mainWindowListenerAttached) return
  try {
    mainWindowCloseHandler = () => closeFloatWindow({ force: true })
    mainWindow.on('close', mainWindowCloseHandler)
    mainWindowListenerAttached = true
  } catch {
    // ignore
  }
}

function removeMainWindowListeners(): void {
  if (!mainWindow) return
  try {
    if (mainWindowCloseHandler) {
      mainWindow.removeListener('close', mainWindowCloseHandler)
      mainWindowCloseHandler = null
    }
  } catch {
    // ignore
  }
  mainWindowListenerAttached = false
  mainWindow = null
}

function getFloatWindowHtml(): string {
  let html = String(floatWindowHtml || '')
  try {
    const mainId = mainWindow?.id ?? 0
    html = html.replace(/__MAIN_WINDOW_ID__/g, String(mainId))
  } catch {
    // ignore
  }
  return html
}

function createFloatWindow(): void {
  if (!canUseFloatWindow() || floatWindowCreating) return
  const existing = resolveFloatWindow()
  if (existing) {
    applyFloatWindowVisibility(existing, floatWindowWantsVisible)
    return
  }

  floatWindowAllowAutoShow = floatWindowWantsVisible
  floatWindowCreating = true
  try {
    const remote = (window as any).require?.('@electron/remote')
    if (!remote) return

    const { BrowserWindow, getCurrentWindow } = remote
    if (!mainWindowListenerAttached) {
      try {
        mainWindow = getCurrentWindow()
        attachMainWindowListeners()
      } catch {
        // ignore
      }
    }

    const bounds = loadFloatWindowBounds()

    floatWindow = new BrowserWindow({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      minWidth: FLOAT_MIN_W,
      minHeight: FLOAT_MIN_H,
      resizable: true,
      thickFrame: true,
      alwaysOnTop: true,
      frame: false,
      skipTaskbar: false,
      show: false,
      transparent: true,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false,
        webSecurity: false,
        enableRemoteModule: true,
      },
    })

    try {
      ;(window as any).require?.('@electron/remote')
        ?.require?.('@electron/remote/main')
        ?.enable?.(floatWindow.webContents)
    } catch {
      // ignore
    }

    attachQuickNoteWindowBoundsPersistence(
      floatWindow,
      QUICKNOTE_FLOAT_WINDOW_BOUNDS_KEY,
      FLOAT_MIN_W,
      FLOAT_MIN_H,
    )

    floatWindow.on('closed', () => {
      floatWindow = null
      floatWindowWantsVisible = true
      floatWindowAllowAutoShow = true
      try {
        localStorage.removeItem(QUICKNOTE_FLOAT_WINDOW_ELECTRON_ID_KEY)
      } catch {
        // ignore
      }
    })

    try {
      localStorage.setItem(QUICKNOTE_FLOAT_WINDOW_ELECTRON_ID_KEY, String(floatWindow.id))
    } catch {
      // ignore
    }

    const html = getFloatWindowHtml()
    floatWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

    floatWindow.webContents.once('did-finish-load', () => {
      applyFloatWindowBounds(floatWindow)
      syncFloatState()
      applyFloatWindowVisibility(floatWindow, floatWindowWantsVisible)
    })
  } catch (e) {
    console.error('[QuickNoteFloat] 创建悬浮窗失败:', e)
  } finally {
    floatWindowCreating = false
  }
}

async function buildFloatStatePayload(extra?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const settings = getDesktopQuickNoteCaptureSettings()
  let initialText = ''
  if (settings.pasteClipboardOnOpen) {
    try {
      initialText = (await navigator.clipboard.readText()).trim()
    } catch {
      // ignore
    }
  }
  return {
    isDark: deps?.isDarkMode() ?? false,
    title: deps?.getFloatTitle() ?? '⚡ 记事',
    placeholder: deps?.getPlaceholder() ?? '记一笔…',
    fontSize: getQuickNoteFontSize(),
    initialText,
    focus: true,
    ...extra,
  }
}

function pushFloatState(payload: Record<string, unknown>): void {
  const win = resolveFloatWindow()
  if (!win) return
  try {
    const code = `window.__setQuickNoteFloatState && window.__setQuickNoteFloatState(${JSON.stringify(payload)})`
    win.webContents.executeJavaScript(code).catch(() => {})
  } catch {
    // ignore
  }
}

async function syncFloatState(extra?: Record<string, unknown>): Promise<void> {
  if (!resolveFloatWindow()) return
  pushFloatState(await buildFloatStatePayload(extra))
}

function syncFloatTheme(): void {
  const win = resolveFloatWindow()
  if (!win || !deps) return
  try {
    const isDark = deps.isDarkMode()
    win.webContents.executeJavaScript(
      `window.__setQuickNoteFloatTheme && window.__setQuickNoteFloatTheme(${isDark})`,
    ).catch(() => {})
  } catch {
    // ignore
  }
}

function closeFloatWindow(opts?: { force?: boolean }): void {
  floatWindowCreating = false
  const win = resolveFloatWindow()
  if (!win) {
    floatWindow = null
    return
  }
  try {
    if (typeof win.isDestroyed === 'function' && win.isDestroyed()) {
      floatWindow = null
      return
    }
    if (!win.closed) {
      if (opts?.force && typeof win.destroy === 'function') win.destroy()
      else win.close()
    }
  } catch {
    // ignore
  }
  floatWindow = null
  try {
    localStorage.removeItem(QUICKNOTE_FLOAT_WINDOW_ELECTRON_ID_KEY)
  } catch {
    // ignore
  }
}

export async function handleQuickNoteFloatCommand(cmd: string, payload?: string): Promise<void> {
  if (!deps) return

  if (cmd === 'ready') {
    await syncFloatState()
    return
  }

  if (cmd === 'cancel') {
    closeFloatWindow()
    return
  }

  if (cmd === 'save') {
    let data: { text?: string } = {}
    try {
      if (payload) data = JSON.parse(decodeURIComponent(payload))
    } catch {
      pushFloatState({
        status: { text: '数据解析失败', type: 'err' },
      })
      return
    }

    const text = (data.text || '').trim()
    if (!text) {
      pushFloatState({ status: { text: '请输入内容', type: 'err' } })
      return
    }

    pushFloatState({ status: { text: '发送中…', type: '' } })

    try {
      const result = await deps.onSave(text, floatSaveIsFromButton)
      if (result.ok) {
        pushFloatState({
          status: { text: result.message || '已保存', type: 'ok' },
          clear: result.clear !== false,
          focus: true,
        })
      } else {
        pushFloatState({
          status: { text: result.message || '保存失败', type: 'err' },
        })
      }
    } catch {
      pushFloatState({ status: { text: '保存失败，请重试', type: 'err' } })
    }
  }
}

/** 全局快捷键 / 按钮：纯文本走独立悬浮窗；块格式不走悬浮窗 */
export function shouldUseQuickNoteFloatWindow(source: QuickNoteFloatSource = 'globalHotkey'): boolean {
  if (!canUseFloatWindow()) return false
  if (!getDesktopQuickNoteCaptureSettings().globalCaptureEnabled) return false
  if (resolveQuickNoteInputFormat(source === 'button') === 'block') return false
  return true
}

export function isQuickNoteFloatSaveFromButton(): boolean {
  return floatSaveIsFromButton
}
