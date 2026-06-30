/**
 * 桌面端块格式一键记事 — 纯 BrowserWindow 方式
 */
import { fetchSyncPost, showMessage } from 'siyuan'
import { createQuickNoteDraftBlock, type QuickNoteSaveTarget } from './kernelBlock'
import { pluginInstance } from '../toolbarManager'

const WIN_W = 600, WIN_H = 500, BOUNDS_KEY = '__qn_block_window_bounds'
const QUICKNOTE_TITLE = '⚡ 快捷记事'
let qnWinId: number | null = null

const HIDE_CSS = '.layout-tab-bar,.protyle-title,.protyle-background,.protyle-breadcrumb,.protyle-scroll,#status,.toolbar__window,#pinWindow,#minWindow,#maxWindow,#restoreWindow,#closeWindow{display:none!important}'
const HIDE_JS = `(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(HIDE_CSS)};document.head.appendChild(s)})()`
const TITLE_JS = `(function(){var t=${JSON.stringify(QUICKNOTE_TITLE)};document.title=t;Object.defineProperty(document,'title',{get:function(){return t},set:function(){return t}})})()`

function getBW(): any { try { return (window as any).require?.('@electron/remote')?.BrowserWindow ?? null } catch { return null } }
function getMainId(): number | null { try { return (window as any).require?.('@electron/remote')?.getCurrentWindow?.()?.id ?? null } catch { return null } }
function loadBounds(): any { try { const r = localStorage.getItem(BOUNDS_KEY); return r ? JSON.parse(r) : null } catch { return null } }
function saveBounds(win: any): void { try { if (!win || win.isDestroyed?.()) return; const b = win.getBounds?.(); if (b) localStorage.setItem(BOUNDS_KEY, JSON.stringify(b)) } catch {} }
function getBounds() {
  const s = loadBounds(); if (s) return s
  try { const sc = (window as any).require?.('@electron/remote')?.screen?.getPrimaryDisplay?.(); if (sc) { const { width: sw, height: sh } = sc.workAreaSize; return { x: Math.round((sw - WIN_W) / 2), y: Math.round((sh - WIN_H) / 2), width: WIN_W, height: WIN_H } } } catch {}
  return { x: 100, y: 100, width: WIN_W, height: WIN_H }
}

export function resolveSaveTarget(isFromButton: boolean): QuickNoteSaveTarget {
  const g: any = pluginInstance?.mobileFeatureConfig ?? {}
  const t: any = (window as any).__pluginInstance?.mobileFeatureConfig
  const cfg = (isFromButton && t) ? t : g
  return { saveType: cfg?.quickNoteSaveType || 'daily', notebookId: cfg?.quickNoteNotebookId || '', documentId: cfg?.quickNoteDocumentId || '', insertPosition: cfg?.quickNoteInsertPosition || 'bottom' }
}

function createOneWindow(blockId: string): boolean {
  try { const BW = getBW(), mainId = getMainId(); if (BW) { for (const w of (BW.getAllWindows?.() || [])) { try { if (!w || w.isDestroyed?.() || w.id === mainId) continue; if ((w.getTitle?.() || '') === QUICKNOTE_TITLE) w.destroy?.() } catch {} } } } catch {}
  const BW = getBW()
  if (!BW) { showMessage('无法创建窗口', 3000, 'error'); return false }
  try {
    const bounds = getBounds()
    const win = new BW({
      show: false, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
      minWidth: 300, minHeight: 200, alwaysOnTop: true, frame: true,
      title: QUICKNOTE_TITLE, webPreferences: { contextIsolation: false, nodeIntegration: true },
    })
    qnWinId = win.id
    win.on('close', () => saveBounds(win))
    win.on('resize', () => saveBounds(win))
    win.on('move', () => saveBounds(win))

    const version = new URL(window.location.href).searchParams.get('v') || ''
    const vPart = version ? 'v=' + encodeURIComponent(version) + '&' : ''
    const json = encodeURIComponent(JSON.stringify([{
      title: QUICKNOTE_TITLE, pin: true, active: true,
      instance: 'Tab', action: 'Tab',
      children: { blockId, rootId: blockId, mode: 'wysiwyg', instance: 'Editor', action: ['cb-get-focus'] },
    }]))
    const url = window.location.protocol + '//' + window.location.host + '/stage/build/app/window.html?' + vPart + 'json=' + json

    // 事件注册在 loadURL 之前，确保不遗漏
    win.webContents.on('dom-ready', () => { win.webContents.executeJavaScript(HIDE_JS).catch(() => {}) })
    win.webContents.once('did-finish-load', () => {
      win.webContents.executeJavaScript(HIDE_JS).catch(() => {})
      win.webContents.executeJavaScript(TITLE_JS).catch(() => {})
      try { win.setTitle(QUICKNOTE_TITLE) } catch {}
      win.show(); win.focus()
    })
    win.loadURL(url)
    return true
  } catch (e) { showMessage('创建窗口失败', 3000, 'error'); return false }
}

export async function toggleDesktopQuickNoteBlockWindow(isFromButton = false): Promise<boolean> {
  const BW = getBW(); if (!BW) return false
  const mainId = getMainId()
  for (const w of (BW.getAllWindows?.() || [])) {
    try { if (!w || w.isDestroyed?.() || w.id === mainId) continue; if (w.id !== qnWinId) continue; if (typeof w.isVisible === 'function' && w.isVisible()) { w.hide(); return true } w.show(); w.focus(); return true } catch {}
  }
  const target = resolveSaveTarget(isFromButton)
  if (target.saveType === 'document' && !target.documentId) { showMessage('请先配置文档 ID', 3000, 'error'); return false }
  if (target.saveType === 'daily' && !target.notebookId) { showMessage('请先配置笔记本 ID', 3000, 'error'); return false }
  const blockId = await createQuickNoteDraftBlock(target)
  if (!blockId) { showMessage('创建编辑块失败', 3000, 'error'); return false }
  return createOneWindow(blockId)
}

export function destroyDesktopQuickNoteBlockWindow(): void {
  try { const BW = getBW(), mainId = getMainId(); if (BW) { for (const w of (BW.getAllWindows?.() || [])) { try { if (!w || w.isDestroyed?.() || w.id === mainId) continue; if ((w.getTitle?.() || '') === QUICKNOTE_TITLE) w.destroy?.() } catch {} } } } catch {}
  qnWinId = null
}

export function shouldUseDesktopQuickNoteBlockWindow(isFromButton = false): boolean {
  try { return (pluginInstance?.mobileFeatureConfig as any)?.quickNoteInputFormat === 'block' } catch { return false }
}
