/**
 * 桌面端块格式一键记事 — 纯 BrowserWindow 方式
 */
import { showMessage } from 'siyuan'
import { t } from '../i18n/runtime'
import { createQuickNoteDraftBlock, deleteQuickNoteDraftBlock } from './kernelBlock'
import { resolveQuickNoteTargetConfig, type QuickNoteTargetConfig } from './targetConfig'
import { pluginInstance } from '../toolbarManager'
import { isLoggingEnabled, logger } from '../utils/logger'

const WIN_W = 300, WIN_H = 300, BOUNDS_KEY = '__qn_block_window_bounds'
function getQuickNoteTitle(): string {
  return t('quickNote.block.windowTitle', undefined, '⚡ 快捷记事')
}
const BASE_HIDE = '.layout-tab-bar,.protyle-title,.protyle-background,.protyle-scroll,#status{display:none!important}'
const BREADCRUMB_HIDE = '.protyle-breadcrumb{display:none!important}'
const BREADCRUMB_SHOW = '.protyle-breadcrumb{margin-top:25px!important}'
// 第三方「层级导航」插件（og-hierachy-navigate）的面包屑渲染在思源原生 .protyle-breadcrumb 之外，
// 原生选择器覆盖不到：弹窗隐藏后再打开时该插件会重新渲染面包屑（弹窗中无存在意义，一律隐藏）
const THIRD_PARTY_BREADCRUMB_HIDE = '[class*="og-hierachy-navigate"]{display:none!important}'
const DRAG_CSS = '#qn-drag-handle{position:fixed;top:0;left:0;width:50%;height:36px;z-index:9999;-webkit-app-region:drag;cursor:grab}'
const FLOATING_RESET = 'html body .protyle-breadcrumb[data-input-method]:not(.protyle-breadcrumb__bar){display:none!important}'
const BLOCK_EMPTY_KEY = '__qn_block_empty'  // localStorage key：Protyle 是否为空
// 思源 3.8.10 起文档标题也是 .protyle-wysiwyg（嵌套在 .protyle-title 内）且排在正文之前，
// 注入脚本一律用它取正文编辑器，不能再用 document.querySelector('.protyle-wysiwyg')
const FIND_BODY_WYSIWYG_JS = `
      function __qnBodyWysiwyg(){
        try{
          var layout=window.siyuan&&window.siyuan.layout&&window.siyuan.layout.centerLayout;
          var found=null;
          (function walk(node){
            if(!node||found)return;
            var children=node.children||[];
            for(var i=0;i<children.length;i++){
              var item=children[i];
              if(!item||found)continue;
              var model=item.model;
              var protyle=model&&model.editor&&model.editor.protyle;
              if(protyle&&protyle.wysiwyg&&protyle.wysiwyg.element){found=protyle.wysiwyg.element;return}
              if(item.children)walk(item);
            }
          })(layout);
          if(found)return found;
        }catch(e){}
        var all=document.querySelectorAll('.protyle-wysiwyg');
        for(var i=0;i<all.length;i++){
          if(!all[i].closest('.protyle-title,.protyle-title__rich'))return all[i];
        }
        return null;
      }`
let qnWinId: number | null = null
let _currentDraftBlockId: string | null = null
function _syncDraftBlockId(): void {
  try { (window as any).__qn_block_id = _currentDraftBlockId } catch {}
}
let _hideTimer: ReturnType<typeof setTimeout> | null = null  // 隐藏后到时间销毁窗口
let _creating = false  // 正在创建草稿/窗口：快捷键短时间连按时避免并发创建两个窗口
let _lastOpenAt = 0  // 最近一次显示/创建时间：同一按键被多个入口重复触发时，忽略紧接着的隐藏
let _saveBoundsTimer: ReturnType<typeof setTimeout> | null = null
let _lastBounds: { x: number; y: number; width: number; height: number } | null = null  // 最后已知的窗口位置缓存（在 closed 事件中兜底使用）

function getBW(): any { try { return (window as any).require?.('@electron/remote')?.BrowserWindow ?? null } catch { return null } }
function getMainId(): number | null { try { return (window as any).require?.('@electron/remote')?.getCurrentWindow?.()?.id ?? null } catch { return null } }
function focusMainWindow(): void { try { const m = getBW()?.fromId(getMainId()); if (m && !m.isDestroyed?.() && !m.isMinimized?.()) m.focus() } catch { /* ignore */ } }

/**
 * 判断窗口是否为一键记事块格式弹窗。
 * 不能只依赖 __qn_block_window：插件重载后 @electron/remote 的窗口代理会重建，
 * 自定义属性丢失（日志里表现为"记事弹窗=false"），但窗口仍然存在并可能继续占用文档。
 * URL 里的 qn=1（新窗口）和 json 中的 ⚡ 标题 + pin（旧窗口）在重载后仍可读取。
 */
function isQuickNoteBlockWindow(win: any): boolean {
  if ((win as any).__qn_block_window === true) return true
  try {
    const rawUrl = win?.webContents?.getURL?.() || ''
    if (!rawUrl) return false
    const url = new URL(rawUrl)
    if (!url.pathname.endsWith('/window.html')) return false
    if (url.searchParams.get('qn') === '1') return true
    const rawJSON = url.searchParams.get('json')
    if (!rawJSON) return false
    const tabs = JSON.parse(rawJSON)
    if (!Array.isArray(tabs)) return false
    return tabs.some((tab: any) =>
      tab?.pin === true
      && Array.isArray(tab?.children?.action) && tab.children.action.includes('cb-get-focus')
      && typeof tab?.title === 'string' && tab.title.includes('⚡'))
  } catch {
    return false
  }
}

/** 从窗口 URL 的 json 参数恢复草稿块 ID（插件重载后模块变量会丢失，URL 不会） */
function getWindowDraftBlockId(win: any): string | null {
  try {
    const rawUrl = win?.webContents?.getURL?.() || ''
    const url = new URL(rawUrl)
    if (!url.pathname.endsWith('/window.html')) return null
    const rawJSON = url.searchParams.get('json')
    if (!rawJSON) return null
    const tabs = JSON.parse(rawJSON)
    if (!Array.isArray(tabs)) return null
    for (const tab of tabs) {
      const blockId = tab?.children?.blockId || tab?.children?.rootId
      if (typeof blockId === 'string' && blockId) return blockId
    }
  } catch { /* ignore */ }
  return null
}

/** 当前仍在运行的记事弹窗：优先模块内记录的 id，插件重载后按 URL 重新识别 */
function findBlockWindow(): any | null {
  const BW = getBW()
  if (!BW) return null
  try {
    const windows = (BW.getAllWindows?.() || []).filter((w: any) => w && !w.isDestroyed?.())
    if (qnWinId != null) {
      const tracked = windows.find((w: any) => w.id === qnWinId)
      if (tracked) return tracked
    }
    return windows.find((w: any) => isQuickNoteBlockWindow(w)) || null
  } catch {
    return null
  }
}

/** 接管已存在的记事弹窗：恢复 qnWinId 与草稿块 ID，避免插件重载后被当成残留销毁 */
function adoptBlockWindow(win: any): void {
  qnWinId = win?.id ?? null
  if (!_currentDraftBlockId) {
    const blockId = getWindowDraftBlockId(win)
    if (blockId) {
      _currentDraftBlockId = blockId
      _syncDraftBlockId()
      if (isLoggingEnabled()) logger.log('[QN-CLEANUP] 接管记事弹窗:', win?.id, blockId)
    }
  }
}

/** 隐藏后自动清理的等待秒数，0 表示不清理 */
function getAutoCleanupSeconds(): number {
  const raw = (pluginInstance?.desktopFeatureConfig as any)?.quickNoteBlockAutoCleanup ?? 5
  const seconds = Number(raw)
  if (!Number.isFinite(seconds)) return 5
  return Math.max(0, seconds)
}

/** 销毁所有记事弹窗（窗口标记 + URL 双重匹配，兼容插件重载后的残留窗口） */
function destroyAllBlockWindows(excludeId?: number): void {
  try {
    const BW = getBW()
    const mainId = getMainId()
    if (!BW) return
    for (const w of (BW.getAllWindows?.() || [])) {
      try {
        if (!w || w.isDestroyed?.() || w.id === mainId) continue
        // 排除自身：close 流程中调用时不能把自己提前 destroy（会跳过 close 内后续清理）
        if (excludeId !== undefined && w.id === excludeId) continue
        if (isQuickNoteBlockWindow(w)) w.destroy?.()
      } catch { /* skip */ }
    }
  } catch { /* ignore */ }
}

/**
 * 启动/插件重载时接管仍在运行的记事弹窗。
 * 不能用 destroyAllBlockWindows 一刀切：0 秒常驻的隐藏弹窗会随插件重载保留下来，
 * 直接销毁会让下次快捷键打开变成新空草稿（表现为「设置了 0 秒还是被清空」）。
 * 同类重复窗口只保留第一个。
 */
export function adoptExistingBlockWindows(): void {
  // 只由主窗口接管：弹窗自己也加载插件，若在弹窗内执行会把自身之外的同类型窗口当重复项销毁
  if (pluginInstance?.isInWindow) return
  const BW = getBW()
  if (!BW) return
  try {
    const windows = (BW.getAllWindows?.() || []).filter((w: any) =>
      w && !w.isDestroyed?.() && isQuickNoteBlockWindow(w))
    if (windows.length === 0) return
    adoptBlockWindow(windows[0])
    for (const w of windows.slice(1)) {
      try {
        w.destroy?.()
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

/**
 * 手动清理一键记事（块格式）弹窗残留：销毁所有识别出的残留窗口并复位草稿状态。
 * 用途：思源主进程会用"窗口 hash 是否含目标文档 ID"决定点击文档时把焦点给哪个窗口；
 * 残留弹窗会让主窗口点日记/文档无反应（占用）。执行后残留窗口销毁，文档立即可正常打开。
 * （彻底方案见 DEV_NOTES：草稿块独立于日记；当前提供手动兜底）
 */
export function cleanupBlockWindowResidue(): void {
  destroyAllBlockWindows()
  _clearDraftTracking()
  // 不能在这里清空 BLOCK_EMPTY_KEY：closed 处理器要靠它区分空/非空草稿，
  // 提前清空会把非空草稿误判为空并删除。
}
function loadBounds(): any { try { const r = localStorage.getItem(BOUNDS_KEY); return r ? JSON.parse(r) : null } catch { return null } }
function saveBounds(win: any): void {
  try {
    let b: any = null
    if (win && !win.isDestroyed?.()) {
      b = win.getBounds?.()
    }
    // 窗口已销毁时用缓存的最后位置（因为 close 事件走 destroy() 会跳过 close 事件，
    // 而 closed 事件中 isDestroyed() 可能已为 true，此时 getBounds() 不可用）
    if (!b) b = _lastBounds
    if (b) { _lastBounds = b; localStorage.setItem(BOUNDS_KEY, JSON.stringify(b)) }
  } catch { if (_lastBounds) { try { localStorage.setItem(BOUNDS_KEY, JSON.stringify(_lastBounds)) } catch {} } }
}

function saveBoundsThrottled(win: any): void {
  if (_saveBoundsTimer) return
  _saveBoundsTimer = setTimeout(() => { _saveBoundsTimer = null; saveBounds(win) }, 300)
}
function getBounds() {
  const s = loadBounds(); if (s) return s
  try { const sc = (window as any).require?.('@electron/remote')?.screen?.getPrimaryDisplay?.(); if (sc) { const { width: sw, height: sh } = sc.workAreaSize; return { x: Math.round(sw - WIN_W - 40), y: Math.round((sh - WIN_H) / 2), width: WIN_W, height: WIN_H } } } catch {}
  return { x: Math.round(window.screen.availWidth - WIN_W - 40), y: Math.round((window.screen.availHeight - WIN_H) / 2), width: WIN_W, height: WIN_H }
}

function _clearDraftTracking(): void {
  _currentDraftBlockId = null
  _syncDraftBlockId()
}

function _buildBlockUrl(blockId: string): string {
  const version = new URL(window.location.href).searchParams.get('v') || ''
  const vPart = version ? 'v=' + encodeURIComponent(version) + '&' : ''
  const json = encodeURIComponent(JSON.stringify([{
    title: getQuickNoteTitle(), pin: true, active: true,
    instance: 'Tab', action: 'Tab',
    children: { blockId, rootId: blockId, mode: 'wysiwyg', instance: 'Editor', action: ['cb-get-focus'] },
  }]))
  return window.location.protocol + '//' + window.location.host + '/stage/build/app/window.html?' + vPart + 'qn=1&json=' + json
}

// 清空 window.location.hash，防止 Electron 主进程通过 hash 中的 rootID
// 把其他窗口的文档焦点路由到这个弹窗
//
// 主进程按窗口 hash 匹配文档 ID（app/electron/main.js 的 siyuan-open-file），
// 窗口 hash 由 SiYuan 的 setModelsHash 写入（app/src/window/setHeader.ts）。
// Location.hash 是不可配置的自有属性，Object.defineProperty 会抛 TypeError（已实测），
// 因此无法拦截 setter，只能"写入后立刻清空"：hashchange 即时清除 + 轮询兜底。
// 窗口隐藏时轮询靠 webPreferences.backgroundThrottling=false 避免被节流。
function _getHashFixJS(): string {
  return `(function(){
	      var logEnabled=${isLoggingEnabled() ? 'true' : 'false'};
	      if (window.__qn_hashFixed) return;

	  window.__qn_hashFixed = true;

	  // 1. hash 变化后立刻清空（同文档导航事件，不受隐藏窗口定时器节流影响）
	  window.addEventListener('hashchange', function() {
	    if (window.location.hash) window.location.hash = '';
	  });

	  // 2. 拦截 history.pushState / replaceState：走 History API 的导航不触发 hashchange
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
	    if(logEnabled) console.log('[QN-HASH] history API 拦截成功');
	  } catch(e) {
	    if(logEnabled) console.log('[QN-HASH] history API 拦截失败:', e);
	  }

	  // 3. 兜底：200ms 轮询（捕获通过 location.href 等其他途径设置的 hash）
	  window.__qn_hashTimer = setInterval(function() {
	    if (window.location.hash) window.location.hash = '';
	  }, 200);
	})()`
}

function _getInjectionScripts(): { hideJS: string; titleJS: string; closeHookJS: string; pollJS: string; hideFloatingJS: string; hideBreadcrumbJS: string; focusJS: string } {
  const quickNoteTitle = getQuickNoteTitle()
  const dragWindowTitle = t('quickNote.block.dragWindow', undefined, '拖动窗口')
  const toolbarOn = (pluginInstance?.desktopFeatureConfig as any)?.quickNoteToolbarVisible !== false
  const hideFloating = (pluginInstance?.desktopFeatureConfig as any)?.quickNoteHideFloatingToolbar !== false
  let hideCSS = BASE_HIDE + (toolbarOn ? BREADCRUMB_SHOW : BREADCRUMB_HIDE) + DRAG_CSS + THIRD_PARTY_BREADCRUMB_HIDE
  if (hideFloating) hideCSS += FLOATING_RESET
  return {
    hideJS: `(function(){
      var s=document.createElement('style');s.textContent=${JSON.stringify(hideCSS)};document.head.appendChild(s);
      var d=document.createElement('div');d.id='qn-drag-handle';d.title=${JSON.stringify(dragWindowTitle)};document.body.appendChild(d);
    })()`,
    titleJS: `(function(){var t=${JSON.stringify(quickNoteTitle)};document.title=t;Object.defineProperty(document,'title',{get:function(){return t},set:function(){return t}})})()`,
    closeHookJS: `(function(){${FIND_BODY_WYSIWYG_JS}
      function forceClose(){
        try{
          // 关闭前同步刷新空/非空标记：500ms 轮询可能还没跑到，父窗口 closed 处理器
          // 若读到旧的“空”状态会把刚输入的非空草稿误删
          try{
            var body=__qnBodyWysiwyg();
            if(body){
              var empty=(body.textContent||'').replace(/\\u200b/g,'').trim().length===0;
              localStorage.setItem('${BLOCK_EMPTY_KEY}',empty?'1':'0');
            }
          }catch(e){}
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
        try{
          var body=__qnBodyWysiwyg();
          if(body){
            var empty=(body.textContent||'').replace(/\\u200b/g,'').trim().length===0;
            localStorage.setItem('${BLOCK_EMPTY_KEY}',empty?'1':'0');
          }
        }catch(e){}
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
    // 用 localStorage 当前值作为真源（而非 window 变量缓存）：隐藏超时销毁窗口时
    // 父窗口会 removeItem 清空，若用变量缓存会与 localStorage 脱节，可能误删非空块。
    pollJS: `(function(){${FIND_BODY_WYSIWYG_JS}
      window.__qnPollTimer=setInterval(function(){
        var w=__qnBodyWysiwyg();
        // 编辑器重渲染期间可能短暂取不到正文，此时不能判为空：否则会把非空草稿标记成空并被清理删除
        if(!w)return;
        var v=(w.textContent||'').replace(/\\u200b/g,'').trim().length===0?'1':'0';
        try{if(localStorage.getItem('${BLOCK_EMPTY_KEY}')!==v)localStorage.setItem('${BLOCK_EMPTY_KEY}',v)}catch(ex){}
      },500)
    })()`,
    hideFloatingJS: `(function(){
      var el=document.querySelector('.protyle-breadcrumb');
      if(el){el.style.setProperty('display','none','important');return;}
      var obs=new MutationObserver(function(){
        var el2=document.querySelector('.protyle-breadcrumb');
        if(!el2)return;
        el2.style.setProperty('display','none','important');
        obs.disconnect();
      });
      obs.observe(document.body,{childList:true,subtree:true});
      setTimeout(function(){try{obs.disconnect()}catch(e){}},5000);
    })()`,
    // 第三方「层级导航」插件的面包屑渲染时机不定（弹窗 show 恢复、注入新草稿块后都可能重新渲染），
    // 用持续 MutationObserver + 100ms 防抖兜底 CSS：observer 只建一个（__qnHideBreadcrumbObserver 复用），
    // 窗口销毁时随渲染进程自然终止，无需显式清理。
    hideBreadcrumbJS: `(function(){
      function hide(){
        var els=document.querySelectorAll('[class*="og-hierachy-navigate"]');
        for(var i=0;i<els.length;i++){els[i].style.setProperty('display','none','important')}
      }
      hide();
      if(window.__qnHideBreadcrumbObserver)return;
      var t=null;
      window.__qnHideBreadcrumbObserver=new MutationObserver(function(){
        if(t)return;
        t=setTimeout(function(){t=null;hide()},100);
      });
      window.__qnHideBreadcrumbObserver.observe(document.body,{childList:true,subtree:true});
    })()`,
    // 首次打开聚焦编辑器：窗口以 show:false 创建，SiYuan 在窗口隐藏期间就完成初始化（cb-get-focus），
    // 且文档内容经 WebSocket 异步到达后 wysiwyg 会整体重渲染，此前的焦点随节点替换丢失
    // → 表现为「光标闪一下就没，要手动点」。必须在窗口 show 之后再轮询聚焦。
    // ★ 选择器：contenteditable="true" 在 .protyle-wysiwyg 根元素自身（思源源码 wysiwyg/index.ts:504，
    //   桌面端恒为 true；子块没有独立 contenteditable）——后代选择器永远匹配不到，必须先查根。
    // ★ 绝不覆盖已有选区（removeAllRanges/addRange 禁用）：思源 insertHTML → getEditorRange 读的是
    //   实时选区（selection.ts:215），若被钉到「根元素末尾」（不在任何 [data-node-id] 块内），
    //   hasClosestBlock 找不到块 → 模板/粘贴等插入直接 return →「插入不显示」（v3.8.12 踩坑）。
    //   只在 focus() 后浏览器没有产生任何光标（rangeCount===0）时才补一个。
    // 用户 mousedown / keydown（捕获）或约 10s 超时退出；Promise 返回状态供主窗口日志诊断。
    focusJS: `(function(){
      ${FIND_BODY_WYSIWYG_JS}
      return new Promise(function(resolve){
        if(window.__qnFocusTimer){clearInterval(window.__qnFocusTimer);window.__qnFocusTimer=null}
        var tries=0
        function findEl(){
          var w=__qnBodyWysiwyg()
          if(!w)return null
          return (w.getAttribute('contenteditable')==='true')?w:w.querySelector('[contenteditable="true"]')
        }
        function stop(msg){
          if(window.__qnFocusTimer){clearInterval(window.__qnFocusTimer);window.__qnFocusTimer=null}
          document.removeEventListener('mousedown',stopOnce,true)
          document.removeEventListener('keydown',stopKey,true)
          resolve(msg)
        }
        var stopOnce=function(){stop('cancelled-by-mousedown')}
        var stopKey=function(){stop('cancelled-by-keydown')}
        document.addEventListener('mousedown',stopOnce,true)
        document.addEventListener('keydown',stopKey,true)
        window.__qnFocusTimer=setInterval(function(){
          tries++
          if(tries>100){stop('timeout');return}
          var el=findEl()
          if(!el)return
          var ae=document.activeElement
          if(ae&&(ae===el||el.contains(ae)))return
          el.focus()
          var sel=window.getSelection()
          if(sel && sel.rangeCount===0){
            var range=document.createRange()
            range.selectNodeContents(el)
            range.collapse(false)
            sel.addRange(range)
          }
        },100)
      })
    })()`,
  }
}

function _injectScripts(win: any, scripts: { hideJS: string; titleJS: string; closeHookJS: string; pollJS: string; hideFloatingJS: string; hideBreadcrumbJS: string; focusJS: string }, show: boolean): void {
  win.webContents.executeJavaScript(scripts.hideJS).catch(()=>{})
  win.webContents.executeJavaScript(scripts.titleJS).catch(()=>{})
  win.webContents.executeJavaScript(scripts.closeHookJS).catch(()=>{})
  win.webContents.executeJavaScript(scripts.pollJS).catch(()=>{})
  // 注入隐藏胶囊的脚本
  win.webContents.executeJavaScript(scripts.hideFloatingJS).catch((e: any) => logger.error('[QN-FLOAT] inject failed', e))
  // 注入隐藏第三方「层级导航」插件面包屑的脚本
  win.webContents.executeJavaScript(scripts.hideBreadcrumbJS).catch((e: any) => logger.error('[QN-BREADCRUMB] inject failed', e))
  try { win.setTitle(getQuickNoteTitle()) } catch {}
  if (show) {
    win.show(); win.focus()
    // show 之后再聚焦编辑器：创建时窗口隐藏，编辑器初始化焦点 + 异步内容重渲染都会把光标顶掉
    win.webContents.executeJavaScript(scripts.focusJS).then((s: unknown) => logger.log('[QN-FOCUS]', s)).catch(() => {})
  }
}

export function resolveSaveTarget(isFromButton: boolean): QuickNoteTargetConfig {
  // 与 windowDetector/悬浮窗共用同一套解析（临时配置 + 按钮级覆盖），勿再本地复制一份
  return resolveQuickNoteTargetConfig(isFromButton)
}

/** 清空弹窗 URL hash：主进程按 hash 中的文档 ID 路由跨窗口打开请求 */
function _clearWindowHash(win: any): void {
  try {
    const result = win?.webContents?.executeJavaScript("if(window.location.hash){window.location.hash=''}")
    result?.catch?.(() => {})
  } catch {}
}

function createOneWindow(blockId: string): boolean {
  // 销毁所有旧记事弹窗（匹配URL中的 ⚡ 标记）
  destroyAllBlockWindows()
  _clearDraftTracking()

  const BW = getBW()
  if (!BW) { showMessage(t('quickNote.block.unableCreateWindow', undefined, '无法创建窗口'), 3000, 'error'); return false }
  try {
    const bounds = getBounds()
    const win = new BW({
      show: false, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
      minWidth: 300, minHeight: 200, alwaysOnTop: true,
      frame: false,
      // backgroundThrottling=false：窗口隐藏时仍保持 hash 轮询等定时器正常运行，
      // 否则 hash 可能在隐藏期间长期残留，导致主窗口点日记被路由到这个隐藏窗口
      title: getQuickNoteTitle(),
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true,
        backgroundThrottling: false,
      },
    })
    qnWinId = win.id
    ;(win as any).__qn_block_window = true
    _currentDraftBlockId = blockId
    _syncDraftBlockId()
    try { localStorage.removeItem(BLOCK_EMPTY_KEY) } catch {}

    win.on('close', () => {
      // × 关闭弹窗时自动清理其它残留弹窗（防僵尸窗口 hash 占用导致主窗口点文档无反应）
      destroyAllBlockWindows(win.id)
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
      if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null }
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
      // 尽早注入隐藏第三方层级导航面包屑的脚本（dom-ready 时该插件可能尚未初始化，靠 observer 兜底）
      win.webContents.executeJavaScript(scripts.hideBreadcrumbJS).catch(()=>{})
      // 尽早注入 hash 修复，赶在 SiYuan 内部路由设置 hash 之前
      win.webContents.executeJavaScript(_getHashFixJS()).then(() => {
        logger.log('[QN-HASH] dom-ready: HASH_FIX_JS 注入成功')
      }).catch((e: any) => {
        logger.error('[QN-HASH] dom-ready: HASH_FIX_JS 注入失败', e)
      })
    })
    win.webContents.once('did-finish-load', () => {
      _injectScripts(win, scripts, true)
    })
    // 主进程侧兜底：hash 一变化就清空。隐藏窗口的渲染进程定时器会被节流，
    // 而 executeJavaScript 仍会执行，避免主窗口点击文档时被路由到这里
    win.webContents.on('did-navigate-in-page', (_event: any, url: string, isMainFrame: boolean) => {
      if (!isMainFrame) return
      if (isLoggingEnabled()) {
        logger.log('[QN-HASH] 窗口 hash 变化，准备清空:', url)
      }
      _clearWindowHash(win)
    })
    win.loadURL(_buildBlockUrl(blockId))
    return true
  } catch (e) { logger.error('[QN-BlockWindow] 创建窗口失败:', e); showMessage(t('quickNote.block.createWindowFailed', undefined, '创建窗口失败'), 3000, 'error'); return false }
}

export async function toggleDesktopQuickNoteBlockWindow(isFromButton = false): Promise<boolean> {
  if (!getBW()) return false
  // 建窗口前有异步建草稿块，短时间连按快捷键会并发创建两个窗口（第二个销毁第一个）
  if (_creating) return false
  // show 恢复后需要补执行 hideBreadcrumbJS（第三方层级导航面包屑可能重新渲染）
  const scripts = _getInjectionScripts()
  const existing = findBlockWindow()
  if (existing) {
    // 插件重载后 qnWinId/草稿块 ID 会丢失，先接管再由下面的 show/hide 流程处理
    adoptBlockWindow(existing)
    try {
      if (typeof existing.isVisible === 'function' && existing.isVisible()) {
        // 弹窗在后台（被其他窗口挡住）→ 拉到前台，不隐藏
        if (typeof existing.isFocused === 'function' && !existing.isFocused()) {
          existing.focus()
          _lastOpenAt = Date.now()
          return true
        }
        // 同一按键可能同时命中全局快捷键和按钮快捷键：刚显示后紧接着的隐藏要忽略，
        // 否则窗口会一闪而过，看起来像「打开就没了」
        if (Date.now() - _lastOpenAt < 300) return true
        // 弹窗在前台 → 隐藏（不强制聚焦主窗口，避免打断用户在其他软件的操作）
        existing.hide()
        // 隐藏前确保 hash 不含文档 ID，避免主进程把主窗口的点击路由到隐藏窗口
        _clearWindowHash(existing)
        if (_hideTimer) {
          clearTimeout(_hideTimer)
          _hideTimer = null
        }
        const seconds = getAutoCleanupSeconds()
        if (isLoggingEnabled()) {
          logger.log('[QN-CLEANUP] 隐藏弹窗，自动清理秒数:', seconds)
        }
        // 0 表示不自动清理：隐藏窗口保持常驻，恢复显示后继续编辑原草稿
        if (!(seconds > 0)) return true
        _hideTimer = setTimeout(() => {
          _hideTimer = null
          // 定时期间设置可能已改为 0：以触发时的配置为准，避免旧定时器继续清理
          if (!(getAutoCleanupSeconds() > 0)) return
          if (isLoggingEnabled()) logger.log('[QN-CLEANUP] 自动清理隐藏弹窗:', existing.id)
          // 不直接改思源编辑器 DOM：销毁隐藏窗口后，草稿由 closed 处理器按空/非空删除或保留，
          // 下次打开走正常建草稿 + 建窗口流程
          try {
            if (!existing.isDestroyed?.()) existing.destroy?.()
          } catch {}
        }, seconds * 1000)
        return true
      }
      // 还没到清理时间又摁了快捷键：取消清理，恢复编辑
      if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null }
      existing.show(); existing.focus()
      _lastOpenAt = Date.now()
      // show 恢复时第三方「层级导航」插件可能重新渲染面包屑，补一次隐藏（observer 复用，不会重复创建）
      existing.webContents.executeJavaScript(scripts.hideBreadcrumbJS).catch(()=>{})
      // 恢复显示后同样聚焦编辑器（隐藏期间焦点可能已丢失）
      existing.webContents.executeJavaScript(scripts.focusJS).then((s: unknown) => logger.log('[QN-FOCUS]', s)).catch(()=>{})
      return true
    } catch { /* 窗口在操作间隙被销毁，落到下面重新创建 */ }
  }
  // 找不到窗口：清理跟踪，创建新窗口
  qnWinId = null
  _clearDraftTracking()
  _creating = true
  try {
    const target = resolveSaveTarget(isFromButton)
    if (target.saveType === 'document' && !target.documentId) { showMessage(t('quickNote.configureDocument', undefined, '请先配置文档 ID'), 3000, 'error'); return false }
    if (target.saveType === 'daily' && !target.notebookId) { showMessage(t('quickNote.configureNotebookSpaced', undefined, '请先配置笔记本 ID'), 3000, 'error'); return false }
    const blockId = await createQuickNoteDraftBlock(target)
    if (!blockId) { showMessage(t('quickNote.block.createFailed', undefined, '创建编辑块失败'), 3000, 'error'); return false }
    const created = createOneWindow(blockId)
    if (created) _lastOpenAt = Date.now()
    return created
  } finally {
    _creating = false
  }
}

export function destroyDesktopQuickNoteBlockWindow(): void {
  // 插件卸载同时发生在「更新/重载」和「禁用」两种场景：
  // 有内容的窗口保留，重载后由 adoptExistingBlockWindows() 接管，否则 0 秒常驻设置失效；
  // 空草稿窗口照常销毁并删除空块（空块由 closed 处理器删除）。
  // 保留的窗口即使处于显示状态也不影响使用；用户手动关闭时仍走正常 closed 流程。
  let keepDraftWindow = false
  try { keepDraftWindow = localStorage.getItem(BLOCK_EMPTY_KEY) === '0' } catch { /* ignore */ }
  try {
    const BW = getBW()
    const mainId = getMainId()
    if (BW) {
      for (const w of (BW.getAllWindows?.() || [])) {
        try {
          if (!w || w.isDestroyed?.() || w.id === mainId) continue
          if (!isQuickNoteBlockWindow(w)) continue
          if (keepDraftWindow) continue
          w.destroy?.()
        } catch { /* skip */ }
      }
    }
  } catch { /* ignore */ }
  qnWinId = null
  // 不能无条件删除草稿块：内容已实时写入内核，删块等于丢笔记。
  // 空草稿由窗口 closed 处理器按 BLOCK_EMPTY_KEY 删除。
  if (_saveBoundsTimer) { clearTimeout(_saveBoundsTimer); _saveBoundsTimer = null }
  if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null }
  focusMainWindow()
}

export function shouldUseDesktopQuickNoteBlockWindow(isFromButton = false): boolean {
  try { return (pluginInstance?.desktopFeatureConfig as any)?.quickNoteInputFormat === 'block' } catch { return false }
}
