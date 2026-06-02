/**
 * 电脑端块格式一键记事 — 思源原生 openWindow 独立子窗口（完整 Protyle）
 */

import { fetchSyncPost, openWindow, showMessage } from 'siyuan'
import {
  blockExistsInKernel,
  createQuickNoteDraftBlock,
  deleteQuickNoteDraftBlock,
  type QuickNoteSaveTarget,
} from './kernelBlock'
import { sql } from '../api'
import { pluginInstance } from '../toolbarManager'
import { resolveQuickNoteInputFormat } from './resolveFormat'
import { isDesktopQuickNoteOverflowToolbarEnabled } from './desktopCapture'
import { getQuickNoteFontSize } from './fontSize'
import {
  attachQuickNoteWindowBoundsPersistence,
  loadQuickNoteWindowBounds,
} from './quickNoteWindowBounds'
import { QUICKNOTE_BLOCK_WINDOW_ELECTRON_ID_KEY, QUICKNOTE_BLOCK_WINDOW_SESSION_KEY, saveQuickNoteBlockWindowSession } from './quickNoteBlockWindowSession'

const BLOCK_WIN_W = 280
const BLOCK_WIN_H = 196
const QUICKNOTE_BLOCK_WINDOW_BOUNDS_KEY = '__quickNoteBlockWindowBounds'
const EMPTY_BLOCK_CLEANUP_MS = 180_000
const SIYUAN_OPEN_WINDOW = 'siyuan-open-window'
const CB_GET_FOCUS = 'cb-get-focus'
const QUICK_NOTE_BLOCK_WINDOW_TITLE = '快速记事'

const QUICK_NOTE_BLOCK_WINDOW_CSS = `
  html body ul.layout-tab-bar:not(.layout-tab-bar--readonly),
  html body #status,
  html body .protyle-title,
  html body .protyle-background {
    display: none !important;
    height: 0 !important;
    min-height: 0 !important;
    max-height: 0 !important;
    overflow: hidden !important;
    padding: 0 !important;
    margin: 0 !important;
    border: none !important;
  }
  html body .layout-tab-bar .item__text {
    display: none !important;
  }
  html body .layout-tab-bar--readonly [data-type="new"],
  html body .layout-tab-bar--readonly [data-type="more"] {
    display: none !important;
  }
  html body .protyle-breadcrumb__bar,
  html body .protyle-breadcrumb__space,
  html body .protyle-breadcrumb [data-type="exit-focus"],
  html body .protyle-breadcrumb [data-type="mobile-menu"] {
    display: none !important;
  }
  html body .protyle-breadcrumb {
    justify-content: flex-end !important;
  }
  html body .protyle-scroll,
  html body .protyle-scroll__up,
  html body .protyle-scroll__down,
  html body .protyle-scroll__bar {
    display: none !important;
    pointer-events: none !important;
  }
`

const QUICKNOTE_BLOCK_WINDOW_OVERFLOW_HIDE_CSS = `
  html body [data-custom-button="overflow-button-desktop"] {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }
  html body .desktop-overflow-toolbar-layer {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }
`

function buildQuickNoteBlockWindowCss(): string {
  const fontSize = getQuickNoteFontSize()
  const fontCss = `
  html body .protyle-wysiwyg {
    font-size: ${fontSize}px !important;
  }
  html body .protyle-wysiwyg [data-node-id] {
    font-size: inherit !important;
  }
`
  if (isDesktopQuickNoteOverflowToolbarEnabled()) {
    return `${QUICK_NOTE_BLOCK_WINDOW_CSS}\n${fontCss}`
  }
  return `${QUICK_NOTE_BLOCK_WINDOW_CSS}\n${QUICKNOTE_BLOCK_WINDOW_OVERFLOW_HIDE_CSS}\n${fontCss}`
}

function buildQuickNoteBlockWindowInjectScript(): string {
  return `
(function() {
  const SESSION_KEY = ${JSON.stringify(QUICKNOTE_BLOCK_WINDOW_SESSION_KEY)};
  const hide = (sel) => document.querySelectorAll(sel).forEach(el => { el.style.display = 'none'; });

  const stripChrome = () => {
    document.title = ${JSON.stringify(QUICK_NOTE_BLOCK_WINDOW_TITLE)};
    document.body.setAttribute('data-quick-note-block-window', 'true');
    hide('ul.layout-tab-bar:not(.layout-tab-bar--readonly)');
    hide('.protyle-title');
    hide('.protyle-background');
    hide('.layout-tab-bar--readonly [data-type="new"]');
    hide('.layout-tab-bar--readonly [data-type="more"]');
    hide('.protyle-breadcrumb__bar');
    hide('.protyle-breadcrumb__space');
    hide('.protyle-breadcrumb [data-type="exit-focus"]');
    hide('.protyle-breadcrumb [data-type="mobile-menu"]');
    hide('.protyle-scroll');
    hide('.protyle-scroll__up');
    hide('.protyle-scroll__down');
    document.querySelectorAll('.layout-tab-bar .item__text').forEach(el => { el.style.display = 'none'; });
    const status = document.getElementById('status');
    if (status) status.classList.add('fn__none');
    ${isDesktopQuickNoteOverflowToolbarEnabled() ? '' : `
    hide('[data-custom-button="overflow-button-desktop"]');
    hide('.desktop-overflow-toolbar-layer');
    `}
  };

  const fetchPost = async (url, data) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  };

  const extractBlockId = (data) => {
    if (!Array.isArray(data)) return null;
    for (const tx of data) {
      const ops = tx && tx.doOperations;
      if (!Array.isArray(ops)) continue;
      for (const op of ops) {
        if (op && op.id) return op.id;
      }
    }
    return null;
  };

  const getTopBlocks = (wysiwyg) => Array.from(wysiwyg.children).filter(
    (el) => el.getAttribute('data-node-id') && !el.classList.contains('protyle-attr'),
  );

  const createDraftBlock = async (target) => {
    const markdown = '\\n';
    if (target.saveType === 'document' && target.documentId) {
      const childRes = await fetchPost('/api/block/getChildBlocks', { id: target.documentId });
      const children = childRes && childRes.code === 0 && Array.isArray(childRes.data) ? childRes.data : [];
      if (target.insertPosition === 'top') {
        if (children.length > 0) {
          const res = await fetchPost('/api/block/insertBlock', {
            dataType: 'markdown', data: markdown, nextID: children[0].id, parentID: target.documentId,
          });
          return res && res.code === 0 ? extractBlockId(res.data) : null;
        }
        const res = await fetchPost('/api/block/prependBlock', {
          dataType: 'markdown', data: markdown, parentID: target.documentId,
        });
        return res && res.code === 0 ? extractBlockId(res.data) : null;
      }
      if (children.length > 0) {
        const res = await fetchPost('/api/block/insertBlock', {
          dataType: 'markdown', data: markdown, previousID: children[children.length - 1].id, parentID: target.documentId,
        });
        return res && res.code === 0 ? extractBlockId(res.data) : null;
      }
      const res = await fetchPost('/api/block/appendBlock', {
        dataType: 'markdown', data: markdown, parentID: target.documentId,
      });
      return res && res.code === 0 ? extractBlockId(res.data) : null;
    }
    const endpoint = target.insertPosition === 'top'
      ? '/api/block/prependDailyNoteBlock'
      : '/api/block/appendDailyNoteBlock';
    const res = await fetchPost(endpoint, {
      data: '', dataType: 'markdown', notebook: target.notebookId,
    });
    return res && res.code === 0 ? extractBlockId(res.data) : null;
  };

  let recovering = false;

  const recoverEmptyQuickNote = async (editor) => {
    if (recovering || !editor || !editor.protyle) return;
    const protyle = editor.protyle;
    const wysiwyg = protyle.wysiwyg && protyle.wysiwyg.element;
    if (!wysiwyg || getTopBlocks(wysiwyg).length > 0) return;

    recovering = true;
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const session = JSON.parse(raw);
      const target = session && session.saveTarget;
      if (!target) return;

      const newId = await createDraftBlock(target);
      if (!newId) return;

      session.draftBlockId = newId;
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      protyle.block.id = newId;
      protyle.block.rootID = newId;
      protyle.block.showAll = false;
      editor.reload(false);
      window.setTimeout(() => {
        const editEl = wysiwyg.querySelector('[contenteditable="true"]');
        if (editEl) editEl.focus();
      }, 120);
    } finally {
      recovering = false;
    }
  };

  const installEmptyGuards = (editor) => {
    if (!editor || !editor.protyle || editor.__quickNoteEmptyGuard) return;
    editor.__quickNoteEmptyGuard = true;
    const protyle = editor.protyle;
    protyle.block.showAll = false;
    protyle.options.handleEmptyContent = () => { void recoverEmptyQuickNote(editor); };
    const origReload = editor.reload.bind(editor);
    editor.reload = function() {
      const wysiwyg = protyle.wysiwyg && protyle.wysiwyg.element;
      if (wysiwyg && getTopBlocks(wysiwyg).length === 0) {
        void recoverEmptyQuickNote(editor);
        return;
      }
      origReload.apply(this, arguments);
    };
    const wysiwyg = protyle.wysiwyg && protyle.wysiwyg.element;
    if (!wysiwyg || protyle.__quickNoteEmptyObserver) return;
    const observer = new MutationObserver(() => {
      if (getTopBlocks(wysiwyg).length === 0) {
        void recoverEmptyQuickNote(editor);
      }
    });
    observer.observe(wysiwyg, { childList: true });
    protyle.__quickNoteEmptyObserver = observer;
  };

  const lockProtyleScroll = () => {
    const layout = window.siyuan && window.siyuan.layout && window.siyuan.layout.centerLayout;
    if (!layout) return;
    const walk = (node) => {
      if (!node) return;
      const model = node.model;
      if (model && model.editor && model.editor.protyle) {
        const protyle = model.editor.protyle;
        installEmptyGuards(model.editor);
        if (protyle.scroll) {
          protyle.scroll.lastScrollTop = -1;
          if (protyle.scroll.element) {
            protyle.scroll.element.classList.add('fn__none');
          }
          const scrollWrap = protyle.scroll.element && protyle.scroll.element.parentElement;
          if (scrollWrap) {
            scrollWrap.classList.add('fn__none');
            scrollWrap.style.display = 'none';
          }
        }
      }
      const children = node.children || [];
      for (let i = 0; i < children.length; i++) {
        walk(children[i]);
      }
    };
    walk(layout);
  };

  const apply = () => {
    stripChrome();
    lockProtyleScroll();
  };

  apply();
  if (!window.__quickNoteBlockWindowTimer) {
    let tries = 0;
    window.__quickNoteBlockWindowTimer = window.setInterval(() => {
      apply();
      tries += 1;
      if (tries >= 30) {
        window.clearInterval(window.__quickNoteBlockWindowTimer);
        window.__quickNoteBlockWindowTimer = null;
      }
    }, 200);
  }
})();
`
}

let blockWindowOpening = false
let blockWindowAllowAutoShow = true
let blockWindowWantsVisible = true
// 防止全局快捷键与 in-app hotkey 连续触发导致 minimize → immediately restore
let lastBlockToggleTime = 0
const BLOCK_TOGGLE_COOLDOWN_MS = 500
const injectedBlockWindowIds = new Set<number>()
let trackedBlockQuickNoteWindow: any = null

function attachBlockWindowTracker(win: any): void {
  trackedBlockQuickNoteWindow = win
  attachQuickNoteWindowBoundsPersistence(
    win,
    QUICKNOTE_BLOCK_WINDOW_BOUNDS_KEY,
    BLOCK_WIN_W,
    BLOCK_WIN_H,
  )
  try {
    localStorage.setItem(QUICKNOTE_BLOCK_WINDOW_ELECTRON_ID_KEY, String(win.id))
  } catch {
    // ignore
  }
  try {
    if (win.__quickNoteBlockTracked) return
    win.__quickNoteBlockTracked = true
    win.once?.('closed', () => {
      injectedBlockWindowIds.delete(win.id)
      if (trackedBlockQuickNoteWindow === win) {
        trackedBlockQuickNoteWindow = null
      }
      blockWindowWantsVisible = true
      blockWindowAllowAutoShow = true
      try {
        localStorage.removeItem(QUICKNOTE_BLOCK_WINDOW_ELECTRON_ID_KEY)
      } catch {
        // ignore
      }
    })
  } catch {
    // ignore
  }
}

function readBlockWindowSessionDraftId(): string | null {
  try {
    const raw = localStorage.getItem(QUICKNOTE_BLOCK_WINDOW_SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as { draftBlockId?: string }
    return session?.draftBlockId || null
  } catch {
    return null
  }
}

function findTrackedBlockQuickNoteWindow(): any {
  if (trackedBlockQuickNoteWindow) {
    try {
      if (!trackedBlockQuickNoteWindow.isDestroyed?.()) {
        return trackedBlockQuickNoteWindow
      }
    } catch {
      // ignore
    }
    trackedBlockQuickNoteWindow = null
  }

  const BrowserWindow = getRemoteBrowserWindowModule()
  if (!BrowserWindow) return null

  try {
    const storedId = localStorage.getItem(QUICKNOTE_BLOCK_WINDOW_ELECTRON_ID_KEY)
    if (storedId) {
      const w = BrowserWindow.fromId?.(Number(storedId))
      if (w && !w.isDestroyed?.()) {
        attachBlockWindowTracker(w)
        return w
      }
      localStorage.removeItem(QUICKNOTE_BLOCK_WINDOW_ELECTRON_ID_KEY)
    }
  } catch {
    // ignore
  }

  const mainId = getMainWindowId()
  const draftBlockId = readBlockWindowSessionDraftId()

  try {
    for (const w of BrowserWindow.getAllWindows?.() || []) {
      if (!w || w.isDestroyed?.() || w.id === mainId) continue
      if (injectedBlockWindowIds.has(w.id)) {
        attachBlockWindowTracker(w)
        return w
      }
      const url = w.webContents?.getURL?.() || ''
      if (!url.includes('window.html')) continue
      if (draftBlockId && url.includes(draftBlockId)) {
        attachBlockWindowTracker(w)
        injectedBlockWindowIds.add(w.id)
        return w
      }
      const title = w.getTitle?.() || ''
      if (title === QUICK_NOTE_BLOCK_WINDOW_TITLE) {
        attachBlockWindowTracker(w)
        injectedBlockWindowIds.add(w.id)
        return w
      }
    }
  } catch {
    // ignore
  }
  return null
}

function isBlockQuickNoteWindowHidden(win: any): boolean {
  if (!win || win.isDestroyed?.()) return true
  try {
    if (win.isMinimized?.()) return true
    if (typeof win.isVisible === 'function' && !win.isVisible()) return true
  } catch {
    // ignore
  }
  return false
}

function applyBlockWindowVisibility(win: any, visible: boolean): void {
  if (!win || win.isDestroyed?.()) return
  blockWindowWantsVisible = visible
  blockWindowAllowAutoShow = visible
  try {
    if (visible) {
      applyBlockWindowBounds(win)
      if (win.isMinimized?.()) win.restore()
      win.show?.()
      win.focus?.()
    } else {
      // 用 hide 代替 minimize：alwaysOnTop 窗口 minimize 后在 Windows 上会被系统立即恢复，
      // 导致「最小化→立刻弹出」的闪烁；hide() 直接隐藏窗口，无此问题。
      win.hide?.()
    }
  } catch {
    trackedBlockQuickNoteWindow = null
  }
}

function showBlockWindowIfAllowed(win: any): void {
  applyBlockWindowVisibility(win, blockWindowWantsVisible)
}

function toggleBlockQuickNoteWindowVisibility(): boolean {
  const win = findTrackedBlockQuickNoteWindow()
  if (!win) return false
  applyBlockWindowVisibility(win, isBlockQuickNoteWindowHidden(win))
  return true
}

export function isQuickNoteBlockWindowOpen(): boolean {
  return !!findTrackedBlockQuickNoteWindow()
}

function resolveSaveTarget(isFromButton: boolean): QuickNoteSaveTarget {
  const tempConfig = (window as any).__pluginInstance?.mobileFeatureConfig
  const globalConfig = pluginInstance?.mobileFeatureConfig

  let saveType: 'daily' | 'document' = 'daily'
  let insertPosition: 'top' | 'bottom' = 'bottom'
  let notebookId = ''
  let documentId = ''

  const cfg = (isFromButton && tempConfig) ? tempConfig : globalConfig
  saveType = cfg?.quickNoteSaveType || 'daily'
  insertPosition = cfg?.quickNoteInsertPosition || 'bottom'
  if (saveType === 'document') {
    documentId = cfg?.quickNoteDocumentId || ''
  } else {
    notebookId = cfg?.quickNoteNotebookId || ''
  }

  return { saveType, notebookId, documentId, insertPosition }
}

async function isQuickNoteBlockEmpty(blockId: string): Promise<boolean> {
  if (!(await blockExistsInKernel(blockId))) return true
  try {
    const rows = await sql(`SELECT content, type FROM blocks WHERE id = '${blockId}'`)
    if (!rows?.length) return true
    const content = String(rows[0].content ?? '').replace(/\u200b/g, '').trim()
    if (!content) return true
    // 空段落常见 DOM
    if (/^<div[^>]*data-type="NodeParagraph"[^>]*>\s*<\/div>$/i.test(content)) return true
    return false
  } catch {
    return false
  }
}

function scheduleEmptyDraftCleanup(blockId: string): void {
  window.setTimeout(async () => {
    try {
      if (await isQuickNoteBlockEmpty(blockId)) {
        await deleteQuickNoteDraftBlock(blockId)
      }
    } catch {
      // ignore
    }
  }, EMPTY_BLOCK_CLEANUP_MS)
}

function getDefaultBlockWindowBounds(): { x: number; y: number; width: number; height: number } {
  const screenW = window.screen.availWidth || window.screen.width
  const screenH = window.screen.availHeight || window.screen.height
  return {
    width: BLOCK_WIN_W,
    height: BLOCK_WIN_H,
    x: Math.round((screenW - BLOCK_WIN_W) / 2),
    y: Math.max(0, Math.round((screenH - BLOCK_WIN_H) / 2 - 48)),
  }
}

function getBlockWindowBounds(): { x: number; y: number; width: number; height: number } {
  return loadQuickNoteWindowBounds(
    QUICKNOTE_BLOCK_WINDOW_BOUNDS_KEY,
    getDefaultBlockWindowBounds(),
    BLOCK_WIN_W,
    BLOCK_WIN_H,
  )
}

function getSiyuanVersion(): string {
  try {
    const v = new URL(window.location.href).searchParams.get('v')
    if (v) return v
  } catch {
    // ignore
  }
  return (window as any).siyuan?.config?.version || ''
}

function getElectronIpc(): { send: (channel: string, payload: unknown) => void } | null {
  try {
    return (window as any).require?.('electron')?.ipcRenderer ?? null
  } catch {
    return null
  }
}

function getRemoteBrowserWindowModule(): any {
  try {
    return (window as any).require?.('@electron/remote')?.BrowserWindow ?? null
  } catch {
    return null
  }
}

function getMainWindowId(): number | undefined {
  try {
    return (window as any).require?.('@electron/remote')?.getCurrentWindow?.()?.id
  } catch {
    return undefined
  }
}

function collectWindowIds(BrowserWindow: any): Set<number> {
  const ids = new Set<number>()
  try {
    for (const w of BrowserWindow.getAllWindows?.() || []) {
      if (w?.id != null) ids.add(w.id)
    }
  } catch {
    // ignore
  }
  return ids
}

function buildQuickNoteBlockWindowUrl(blockId: string, blockInfo: any): string {
  const json = [{
    title: QUICK_NOTE_BLOCK_WINDOW_TITLE,
    pin: true,
    active: true,
    instance: 'Tab',
    action: 'Tab',
    children: {
      notebookId: blockInfo.box,
      blockId,
      rootId: blockInfo.rootID,
      mode: 'wysiwyg',
      instance: 'Editor',
      action: [CB_GET_FOCUS],
    },
  }]

  const version = getSiyuanVersion()
  const versionPart = version ? `v=${encodeURIComponent(version)}&` : ''
  return `${window.location.protocol}//${window.location.host}/stage/build/app/window.html?${versionPart}json=${encodeURIComponent(JSON.stringify(json))}`
}

function injectQuickNoteBlockWindowChrome(win: any): void {
  if (!win || win.isDestroyed?.()) return

  const firstInject = !injectedBlockWindowIds.has(win.id)
  attachBlockWindowTracker(win)
  if (!firstInject) return

  injectedBlockWindowIds.add(win.id)
  try {
    win.setTitle?.(QUICK_NOTE_BLOCK_WINDOW_TITLE)
  } catch {
    // ignore
  }

  const wc = win.webContents
  if (!wc) return

  const applyChromeStrip = () => {
    wc.insertCSS(buildQuickNoteBlockWindowCss()).catch(() => {})
    wc.executeJavaScript(buildQuickNoteBlockWindowInjectScript()).catch(() => {})
  }

  applyChromeStrip()
  wc.on('did-finish-load', applyChromeStrip)
  applyBlockWindowVisibility(win, blockWindowWantsVisible)
}

async function waitForBlockQuickNoteWindow(timeoutMs = 3000): Promise<any> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const win = findTrackedBlockQuickNoteWindow()
    if (win) return win
    await new Promise<void>(resolve => window.setTimeout(resolve, 120))
  }
  return null
}

async function stripQuickNoteBlockWindowChrome(blockId: string, beforeIds: Set<number>): Promise<void> {
  const BrowserWindow = getRemoteBrowserWindowModule()
  if (!BrowserWindow) return

  const mainId = getMainWindowId()

  const tryInject = (): boolean => {
    try {
      for (const w of BrowserWindow.getAllWindows?.() || []) {
        if (!w || w.isDestroyed?.()) continue
        if (w.id === mainId || beforeIds.has(w.id) || injectedBlockWindowIds.has(w.id)) continue

        const url = w.webContents?.getURL?.() || ''
        if (!url.includes('window.html')) continue
        if (!url.includes(blockId)) continue

        injectQuickNoteBlockWindowChrome(w)
        return true
      }
    } catch {
      // ignore
    }
    return false
  }

  for (let i = 0; i < 50; i++) {
    await new Promise<void>(resolve => window.setTimeout(resolve, 120))
    if (tryInject()) break
  }
}

function applyBlockWindowBounds(win: any): void {
  if (!win || win.isDestroyed?.()) return
  try {
    win.setMinimumSize?.(BLOCK_WIN_W, BLOCK_WIN_H)
  } catch {
    // ignore
  }
}

function createDirectBlockBrowserWindow(
  bounds: ReturnType<typeof getBlockWindowBounds>,
  url: string,
): any {
  const BrowserWindow = getRemoteBrowserWindowModule()
  if (!BrowserWindow) return null

  const isDarwin = typeof process !== 'undefined' && process.platform === 'darwin'

  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: BLOCK_WIN_W,
    minHeight: BLOCK_WIN_H,
    show: false,
    alwaysOnTop: true,
    thickFrame: !isDarwin,
    // 与思源 siyuan-open-window 一致：Win/Linux 无边框，macOS 隐藏标题栏
    frame: isDarwin,
    titleBarStyle: 'hidden',
    transparent: isDarwin,
    title: QUICK_NOTE_BLOCK_WINDOW_TITLE,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      webviewTag: true,
      webSecurity: false,
    },
  })

  try {
    win.setTitle?.(QUICK_NOTE_BLOCK_WINDOW_TITLE)
  } catch {
    // ignore
  }

  try {
    ;(window as any).require?.('@electron/remote')
      ?.require?.('@electron/remote/main')
      ?.enable?.(win.webContents)
  } catch {
    // ignore
  }

  // ★ 在 dom-ready 就注入 CSS，让标题等元素在创建前就被隐藏
  // dom-ready 比 did-finish-load 更早触发，此时 DOM 刚解析完毕、思源 JS 还未渲染编辑器
  win.webContents.on('dom-ready', () => {
    try {
      win.webContents.insertCSS(buildQuickNoteBlockWindowCss()).catch(() => {})
    } catch { /* ignore */ }
  })

  win.loadURL(url)
  blockWindowAllowAutoShow = blockWindowWantsVisible
  win.webContents.once('did-finish-load', () => {
    try {
      win.setTitle?.(QUICK_NOTE_BLOCK_WINDOW_TITLE)
    } catch {
      // ignore
    }
    injectQuickNoteBlockWindowChrome(win)
    applyBlockWindowVisibility(win, blockWindowWantsVisible)
  })

  return win
}

async function openQuickNoteBlockWindow(blockId: string, bounds: ReturnType<typeof getBlockWindowBounds>): Promise<void> {
  const response: any = await fetchSyncPost('/api/block/getBlockInfo', { id: blockId })
  if (response?.code !== 0) {
    throw new Error(response?.msg || 'getBlockInfo failed')
  }

  const url = buildQuickNoteBlockWindowUrl(blockId, response.data)
  const BrowserWindow = getRemoteBrowserWindowModule()
  if (BrowserWindow) {
    createDirectBlockBrowserWindow(bounds, url)
    return
  }

  const ipc = getElectronIpc()
  if (!ipc) {
    openWindow({
      doc: { id: blockId },
      alwaysOnTop: true,
      width: bounds.width,
      height: bounds.height,
      position: { x: bounds.x, y: bounds.y },
    } as Parameters<typeof openWindow>[0] & { alwaysOnTop?: boolean })
    return
  }

  const beforeIds = BrowserWindow ? collectWindowIds(BrowserWindow) : new Set<number>()
  ipc.send(SIYUAN_OPEN_WINDOW, {
    position: { x: bounds.x, y: bounds.y },
    width: bounds.width,
    height: bounds.height,
    alwaysOnTop: true,
    url,
  })

  void stripQuickNoteBlockWindowChrome(blockId, beforeIds)
}

/** 电脑端：块格式 — 快捷键/按钮切换（已开则最小化，已最小化则恢复） */
export async function toggleDesktopQuickNoteBlockWindow(isFromButton = false): Promise<boolean> {
  // 冷却保护：防止短时间内连续 toggle（全局快捷键 + in-app hotkey 双触发）
  const now = Date.now()
  if (now - lastBlockToggleTime < BLOCK_TOGGLE_COOLDOWN_MS) return false
  lastBlockToggleTime = now

  if (toggleBlockQuickNoteWindowVisibility()) {
    return true
  }

  if (blockWindowOpening) {
    blockWindowWantsVisible = !blockWindowWantsVisible
    blockWindowAllowAutoShow = blockWindowWantsVisible
    const win = await waitForBlockQuickNoteWindow()
    if (win) applyBlockWindowVisibility(win, blockWindowWantsVisible)
    return true
  }

  blockWindowWantsVisible = true
  blockWindowAllowAutoShow = true
  return openDesktopQuickNoteBlockWindow(isFromButton)
}

/** 电脑端：块格式 — 创建 draft 块并用思源 openWindow 打开（alwaysOnTop，不依赖主窗口弹窗） */
export async function openDesktopQuickNoteBlockWindow(isFromButton = false): Promise<boolean> {
  const existing = findTrackedBlockQuickNoteWindow()
  if (existing) {
    toggleBlockQuickNoteWindowVisibility()
    return true
  }
  if (blockWindowOpening) {
    blockWindowWantsVisible = !blockWindowWantsVisible
    blockWindowAllowAutoShow = blockWindowWantsVisible
    return true
  }
  blockWindowOpening = true

  try {
    const target = resolveSaveTarget(isFromButton)

    if (target.saveType === 'document' && !target.documentId) {
      showMessage('请先在设置中配置文档 ID', 3000, 'error')
      return false
    }
    if (target.saveType === 'daily' && !target.notebookId) {
      showMessage('请先在设置中配置笔记本 ID', 3000, 'error')
      return false
    }

    const blockId = await createQuickNoteDraftBlock(target)
    if (!blockId) {
      showMessage('创建编辑块失败，请检查保存目标配置', 3000, 'error')
      return false
    }

    saveQuickNoteBlockWindowSession(blockId, target)

    const bounds = getBlockWindowBounds()
    try {
      await openQuickNoteBlockWindow(blockId, bounds)
    } catch (err) {
      console.error('[QuickNoteBlockWindow] openWindow failed:', err)
      await deleteQuickNoteDraftBlock(blockId)
      showMessage('打开块编辑窗失败', 3000, 'error')
      return false
    }

    scheduleEmptyDraftCleanup(blockId)
    return true
  } finally {
    blockWindowOpening = false
  }
}

export function shouldUseDesktopQuickNoteBlockWindow(isFromButton = false): boolean {
  return resolveQuickNoteInputFormat(isFromButton) === 'block'
}
