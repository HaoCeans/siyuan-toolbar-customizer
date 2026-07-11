/**
 * 桌面端块格式一键记事 — 纯 BrowserWindow 方式
 */
import { fetchSyncPost, showMessage } from 'siyuan'
import { createQuickNoteDraftBlock, deleteQuickNoteDraftBlock, type QuickNoteSaveTarget } from './kernelBlock'
import { pluginInstance } from '../toolbarManager'

const WIN_W = 600, WIN_H = 500, BOUNDS_KEY = '__qn_block_window_bounds'
const QUICKNOTE_TITLE = '⚡ 快捷记事'
const BASE_HIDE = '.layout-tab-bar,.protyle-title,.protyle-background,.protyle-scroll,#status{display:none!important}'
const BREADCRUMB_HIDE = '.protyle-breadcrumb{display:none!important}'
const BREADCRUMB_SHOW = '.protyle-breadcrumb{margin-top:25px!important}'
const DRAG_CSS = '#qn-drag-handle{position:fixed;top:0;left:0;width:50%;height:36px;z-index:9999;-webkit-app-region:drag;cursor:grab}'
const BLOCK_EMPTY_KEY = '__qn_block_empty'  // localStorage key：Protyle 是否为空
let qnWinId: number | null = null
let _currentDraftBlockId: string | null = null
function _syncDraftBlockId(): void {
  try { (window as any).__qn_block_id = _currentDraftBlockId } catch {}
}
let _hideTimer: ReturnType<typeof setTimeout> | null = null  // 隐藏后 5 秒自动清理
let _saveBoundsTimer: ReturnType<typeof setTimeout> | null = null

function getBW(): any { try { return (window as any).require?.('@electron/remote')?.BrowserWindow ?? null } catch { return null } }
function getMainId(): number | null { try { return (window as any).require?.('@electron/remote')?.getCurrentWindow?.()?.id ?? null } catch { return null } }
function focusMainWindow(): void { try { const m = getBW()?.fromId(getMainId()); if (m && !m.isDestroyed?.() && !m.isMinimized?.()) m.focus() } catch { /* ignore */ } }

/** 销毁所有记事弹窗（通过窗口标记 __qn_block_window 匹配） */
function destroyAllBlockWindows(): void {
  try {
    const BW = getBW(), mainId = getMainId()
    if (!BW) return
    for (const w of (BW.getAllWindows?.() || [])) {
      try {
        if (!w || w.isDestroyed?.() || w.id === mainId) continue
        if ((w as any).__qn_block_window) w.destroy?.()
      } catch { /* skip */ }
    }
  } catch { /* ignore */ }
}

/** 启动时清理残留的僵尸弹窗 */
export function cleanupOrphanBlockWindows(): void {
  destroyAllBlockWindows()
}
function loadBounds(): any { try { const r = localStorage.getItem(BOUNDS_KEY); return r ? JSON.parse(r) : null } catch { return null } }
function saveBounds(win: any): void { try { if (!win || win.isDestroyed?.()) return; const b = win.getBounds?.(); if (b) localStorage.setItem(BOUNDS_KEY, JSON.stringify(b)) } catch {} }

function saveBoundsThrottled(win: any): void {
  if (_saveBoundsTimer) return
  _saveBoundsTimer = setTimeout(() => { _saveBoundsTimer = null; saveBounds(win) }, 300)
}
function getBounds() {
  const s = loadBounds(); if (s) return s
  try { const sc = (window as any).require?.('@electron/remote')?.screen?.getPrimaryDisplay?.(); if (sc) { const { width: sw, height: sh } = sc.workAreaSize; return { x: Math.round((sw - WIN_W) / 2), y: Math.round((sh - WIN_H) / 2), width: WIN_W, height: WIN_H } } } catch {}
  return { x: 100, y: 100, width: WIN_W, height: WIN_H }
}

function _clearDraftTracking(): void {
  _currentDraftBlockId = null
  _syncDraftBlockId()
}

function _buildBlockUrl(blockId: string): string {
  const version = new URL(window.location.href).searchParams.get('v') || ''
  const vPart = version ? 'v=' + encodeURIComponent(version) + '&' : ''
  const json = encodeURIComponent(JSON.stringify([{
    title: QUICKNOTE_TITLE, pin: true, active: true,
    instance: 'Tab', action: 'Tab',
    children: { blockId, rootId: blockId, mode: 'wysiwyg', instance: 'Editor', action: ['cb-get-focus'] },
  }]))
  return window.location.protocol + '//' + window.location.host + '/stage/build/app/window.html?' + vPart + 'json=' + json
}

// 清空 window.location.hash，防止 Electron 主进程通过 hash 中的 rootID
// 把其他窗口的文档焦点路由到这个弹窗
//
// 注意：SiYuan 内部路由使用 history.pushState/replaceState 修改 URL hash，
// 只拦截 location.hash setter 是不够的，必须同时拦截 History API。
const HASH_FIX_JS = `(function(){
	  if (window.__qn_hashFixed) return;
	  window.__qn_hashFixed = true;

	  // 1. 拦截 location.hash 的 setter
	  try {
	    var proto = window.location.__proto__ || window.location.constructor.prototype;
	    var desc = Object.getOwnPropertyDescriptor(proto, 'hash');
	    if (desc && desc.set) {
	      var _origSet = desc.set;
	      Object.defineProperty(window.location, 'hash', {
	        get: desc.get || function() { return ''; },
	        set: function(v) {
	          // 只调原始 setter 完成副作用，但永远写空字符串
	          _origSet.call(this, '');
	        },
	        configurable: true
	      });
	      console.log('[QN-HASH] hash setter 拦截成功');
	    } else {
	      console.log('[QN-HASH] 无法获取hash descriptor, 降级到轮询');
	    }
	  } catch(e) {
	    console.log('[QN-HASH] hash setter 拦截失败:', e, ', 降级到轮询');
	  }

	  // 2. 拦截 history.pushState / replaceState
	  //    SiYuan 通过此 API 修改 URL hash，绕过 location.hash setter
	  try {
	    var _origPushState = history.pushState.bind(history);
	    var _origReplaceState = history.replaceState.bind(history);
	    history.pushState = function() {
	      _origPushState.apply(this, arguments);
	      if (window.location.hash) window.location.hash = '';
	    };
	    history.replaceState = function() {
	      _origReplaceState.apply(this, arguments);
	      if (window.location.hash) window.location.hash = '';
	    };
	    console.log('[QN-HASH] history API 拦截成功');
	  } catch(e) {
	    console.log('[QN-HASH] history API 拦截失败:', e);
	  }

	  // 3. 兜底：50ms 轮询（捕获通过 location.href 等其他途径设置的 hash）
	  window.__qn_hashTimer = setInterval(function() {
	    if (window.location.hash) window.location.hash = '';
	  }, 50);
	})()`

function _getInjectionScripts(): { hideJS: string; titleJS: string; closeHookJS: string; pollJS: string } {
  const toolbarOn = (pluginInstance?.desktopFeatureConfig as any)?.quickNoteToolbarVisible !== false
  const hideCSS = BASE_HIDE + (toolbarOn ? BREADCRUMB_SHOW : BREADCRUMB_HIDE) + DRAG_CSS
  return {
    hideJS: `(function(){
      var s=document.createElement('style');s.textContent=${JSON.stringify(hideCSS)};document.head.appendChild(s);
      var d=document.createElement('div');d.id='qn-drag-handle';d.title='拖动窗口';document.body.appendChild(d);
    })()`,
    titleJS: `(function(){var t=${JSON.stringify(QUICKNOTE_TITLE)};document.title=t;Object.defineProperty(document,'title',{get:function(){return t},set:function(){return t}})})()`,
    closeHookJS: `(function(){
      function forceClose(){
        try{
          // 先手动关 WebSocket，因为 destroy() 跳过 beforeunload
          try{
            if(window.__qnPollTimer){clearInterval(window.__qnPollTimer);window.__qnPollTimer=null}
            if(window.__qn_hashTimer){clearInterval(window.__qn_hashTimer);window.__qn_hashTimer=null}
            var ws=window.siyuan&&window.siyuan.ws;
            if(ws&&ws.ws&&ws.ws.readyState===1){
              try{ws.send('closews',{})}catch(e){}
              try{ws.ws.close(1000,'qn-close')}catch(e){}
            }
          }catch(e){}
          var remote=require('@electron/remote');
          var win=remote.getCurrentWindow();
          // 用 destroy() 而非 close()：同步强制销毁，跳过 SiYuan 的 beforeunload 回调，
          // 不给它通过 history.pushState 设置 location.hash 的机会。
          // close() 会触发 beforeunload → SiYuan 清理代码写 hash → hash 被 Electron
          // 主进程记住 → siyuan-open-file 路由匹配到已销毁的僵尸窗口 → 日记打不开
          win.destroy();
        }catch(e){try{window.close()}catch(e2){}}
      }
      function hookCloseBtn(){
        var btn=document.getElementById('closeWindow');
        if(!btn)return false;
        btn.onclick=function(e){e.stopPropagation();e.preventDefault();forceClose();return false};
        return true;
      }
      if(!hookCloseBtn()){var t=setInterval(function(){if(hookCloseBtn())clearInterval(t)},300);setTimeout(function(){clearInterval(t)},5000)}
      window.addEventListener('beforeunload',function(){
        if(window.__qnPollTimer){clearInterval(window.__qnPollTimer);window.__qnPollTimer=null}
        try{
          var ws=window.siyuan&&window.siyuan.ws;
          if(ws&&ws.ws&&ws.ws.readyState===1){
            try{ws.send('closews',{})}catch(e){}
            try{ws.ws.close(1000,'qn-close')}catch(e){}
          }
        }catch(e){}
      });
    })()`,
    // 仅在"是否为空"状态变化时才写入 localStorage，避免每 500ms 无条件 setItem。
    // 用 localStorage 当前值作为真源（而非 window 变量缓存）：弹窗隐藏 5 秒重建时
    // 父窗口会 removeItem 清空，若用变量缓存会与 localStorage 脱节，可能误删非空块。
    pollJS: `window.__qnPollTimer=setInterval(function(){var w=document.querySelector('.protyle-wysiwyg');var v=(!w||(w.textContent||'').replace(/\\u200b/g,'').trim().length===0)?'1':'0';try{if(localStorage.getItem('${BLOCK_EMPTY_KEY}')!==v)localStorage.setItem('${BLOCK_EMPTY_KEY}',v)}catch(ex){}},500)`,
  }
}

function _injectScripts(win: any, scripts: { hideJS: string; titleJS: string; closeHookJS: string; pollJS: string }, show: boolean): void {
  win.webContents.executeJavaScript(scripts.hideJS).catch(()=>{})
  win.webContents.executeJavaScript(scripts.titleJS).catch(()=>{})
  win.webContents.executeJavaScript(scripts.closeHookJS).catch(()=>{})
  win.webContents.executeJavaScript(scripts.pollJS).catch(()=>{})
  try { win.setTitle(QUICKNOTE_TITLE) } catch {}
  if (show) { win.show(); win.focus() }
}

export function resolveSaveTarget(isFromButton: boolean): QuickNoteSaveTarget {
  const g: any = pluginInstance?.mobileFeatureConfig ?? {}
  const t: any = (window as any).__pluginInstance?.mobileFeatureConfig
  const cfg = (isFromButton && t) ? t : g
  return { saveType: cfg?.quickNoteSaveType || 'daily', notebookId: cfg?.quickNoteNotebookId || '', documentId: cfg?.quickNoteDocumentId || '', insertPosition: cfg?.quickNoteInsertPosition || 'bottom' }
}

function createOneWindow(blockId: string): boolean {
  // 销毁所有旧记事弹窗（匹配URL中的 ⚡ 标记）
  destroyAllBlockWindows()
  _clearDraftTracking()

  const BW = getBW()
  if (!BW) { showMessage('无法创建窗口', 3000, 'error'); return false }
  try {
    const bounds = getBounds()
    const win = new BW({
      show: false, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
      minWidth: 300, minHeight: 200, alwaysOnTop: true,
      frame: false,
      title: QUICKNOTE_TITLE, webPreferences: { contextIsolation: false, nodeIntegration: true },
    })
    qnWinId = win.id
    ;(win as any).__qn_block_window = true
    _currentDraftBlockId = blockId
    _syncDraftBlockId()
    try { localStorage.removeItem(BLOCK_EMPTY_KEY) } catch {}

    win.on('close', () => {
      if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null }
      if (_saveBoundsTimer) { clearTimeout(_saveBoundsTimer); _saveBoundsTimer = null }
      // 注意：不再主动清除 hash 轮询定时器，让它在渲染进程销毁时自然终止。
      // 若在此处 clearInterval，SiYuan 的 beforeunload 清理代码可能在 close 之后
      // 通过 history.pushState 设置 hash，而此时轮询已停、无法清空 hash。
      saveBounds(win)
    })
    win.on('resize', () => saveBoundsThrottled(win))
    win.on('move', () => saveBoundsThrottled(win))
    win.on('closed', () => {
      // 先保存位置（win.destroy() 只触发 closed，不触发 close，必须在此保存）
      if (_saveBoundsTimer) { clearTimeout(_saveBoundsTimer); _saveBoundsTimer = null }
      saveBounds(win)
      const closingBlockId = _currentDraftBlockId
      _currentDraftBlockId = null
      _syncDraftBlockId()
      if (qnWinId === win.id) qnWinId = null
      let isEmpty = true
      try { isEmpty = localStorage.getItem(BLOCK_EMPTY_KEY) !== '0'; localStorage.removeItem(BLOCK_EMPTY_KEY) } catch {}
      if (isEmpty && closingBlockId) { deleteQuickNoteDraftBlock(closingBlockId).catch(() => {}) }
    })

    const scripts = _getInjectionScripts()
    win.webContents.on('dom-ready', () => {
      win.webContents.executeJavaScript(scripts.hideJS).catch(()=>{})
      // 尽早注入 hash 修复，赶在 SiYuan 内部路由设置 hash 之前
      win.webContents.executeJavaScript(HASH_FIX_JS).then(() => {
        console.log('[QN-HASH] dom-ready: HASH_FIX_JS 注入成功')
      }).catch((e: any) => {
        console.error('[QN-HASH] dom-ready: HASH_FIX_JS 注入失败', e)
      })
    })
    win.webContents.once('did-finish-load', () => {
      _injectScripts(win, scripts, true)
    })
    win.loadURL(_buildBlockUrl(blockId))
    return true
  } catch (e) { showMessage('创建窗口失败', 3000, 'error'); return false }
}

export async function toggleDesktopQuickNoteBlockWindow(isFromButton = false): Promise<boolean> {
  const BW = getBW(); if (!BW) return false
  const mainId = getMainId()
  let found = false
  for (const w of (BW.getAllWindows?.() || [])) {
    try { if (!w || w.isDestroyed?.() || w.id === mainId) continue; if (w.id !== qnWinId) continue; found = true;
	      if (typeof w.isVisible === 'function' && w.isVisible()) {
	        // 弹窗在后台（被其他窗口挡住）→ 拉到前台，不隐藏
	        if (typeof w.isFocused === 'function' && !w.isFocused()) {
	          w.focus()
	          return true
	        }
	        // 弹窗在前台 → 隐藏（不强制聚焦主窗口，避免打断用户在其他软件的操作）
        w.hide()
        if (_hideTimer) clearTimeout(_hideTimer)
        const delay = ((pluginInstance?.desktopFeatureConfig as any)?.quickNoteBlockAutoCleanup ?? 5) * 1000
        _hideTimer = setTimeout(async () => {
          _hideTimer = null
          const target = resolveSaveTarget(false)
          const newId = await createQuickNoteDraftBlock(target)
          if (!newId) return
          _currentDraftBlockId = newId
          _syncDraftBlockId()
          try { localStorage.removeItem(BLOCK_EMPTY_KEY) } catch {}
          // 拿新块 HTML 直接注入 Protyle，不重载页面
          try {
            const resp = await fetchSyncPost('/api/filetree/getDoc', { id: newId, mode: 0, size: 102400 })
            if (resp?.code === 0 && resp?.data?.content) {
              const html = JSON.stringify(resp.data.content)
              w.webContents.executeJavaScript(`
                (function(){
                  var w=document.querySelector('.protyle-wysiwyg');
                  if(!w)return;
                  w.innerHTML=${html};
                  try{
                    var tabs=window.siyuan&&window.siyuan.layout&&window.siyuan.layout.center&&window.siyuan.layout.center.tabs;
                    if(tabs)for(var i=0;i<tabs.length;i++){
                      var p=tabs[i].model&&tabs[i].model.editor&&tabs[i].model.editor.protyle;
                      if(p){p.block.id='${newId}';p.block.rootID='__qn_${newId}';break}
                    }
                  }catch(e){}
                })()
              `).catch(()=>{})
            }
          } catch {}
        }, delay)
        return true
      }
      // 还没到 5 秒又摁了快捷键：取消清理，恢复编辑
      if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null }
      w.show(); w.focus(); return true
    } catch {}
  }
  // 找不到窗口：清理跟踪，创建新窗口
  if (!found) {
    qnWinId = null
    _clearDraftTracking()
  }
  const target = resolveSaveTarget(isFromButton)
  if (target.saveType === 'document' && !target.documentId) { showMessage('请先配置文档 ID', 3000, 'error'); return false }
  if (target.saveType === 'daily' && !target.notebookId) { showMessage('请先配置笔记本 ID', 3000, 'error'); return false }
  const blockId = await createQuickNoteDraftBlock(target)
  if (!blockId) { showMessage('创建编辑块失败', 3000, 'error'); return false }
  return createOneWindow(blockId)
}

export function destroyDesktopQuickNoteBlockWindow(): void {
  // 先捕获草稿块 ID，再销毁窗口（防止 closed 事件异步执行时 _currentDraftBlockId 已被清空）
  const draftToDelete = _currentDraftBlockId
  _currentDraftBlockId = null
  _syncDraftBlockId()
  try { const BW = getBW(), mainId = getMainId(); if (BW) { for (const w of (BW.getAllWindows?.() || [])) { try { if (!w || w.isDestroyed?.() || w.id === mainId) continue; if ((w.getTitle?.() || '') === QUICKNOTE_TITLE) w.destroy?.() } catch {} } } } catch {}
  qnWinId = null
  // 作为兜底：如果窗口 closed 事件中未删块，这里直接删（插件卸载时内容不重要）
  if (draftToDelete) {
    deleteQuickNoteDraftBlock(draftToDelete).catch(() => {})
  }
  if (_saveBoundsTimer) { clearTimeout(_saveBoundsTimer); _saveBoundsTimer = null }
  if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null }
  focusMainWindow()
}

export function shouldUseDesktopQuickNoteBlockWindow(isFromButton = false): boolean {
  try { return (pluginInstance?.desktopFeatureConfig as any)?.quickNoteInputFormat === 'block' } catch { return false }
}
