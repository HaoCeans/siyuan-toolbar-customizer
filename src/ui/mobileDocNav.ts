/**
 * 手机端前一篇/后一篇文档导航模块
 * 功能：在手机端底部显示悬浮导航栏，按文件树排序规则在整个笔记本范围内导航文档
 * 设计风格：与手机端标签页Tab/悬浮大纲保持一致的苹果风格
 */

import { fetchSyncPost, openMobileFileById, showMessage } from "siyuan";
import { isMobileDevice, pluginInstance } from "../toolbarManager";
import type { ButtonConfig } from "../toolbarManager";

// ===== 常量 =====
const PERSIST_KEY = 'mobileDocNavState'
const SWITCH_DEBOUNCE = 300
const REFRESH_DEBOUNCE = 500

// ===== 接口 =====
interface DocNavContext {
  saveData: (key: string, value: any) => Promise<void>
  loadData: (key: string) => Promise<any>
  eventBus: any
}

interface MobileDocNavState {
  isVisible: boolean
}

interface FiletreeDoc {
  id: string
  name: string
  icon?: string
}

// ===== 模块状态 =====
let ctx: DocNavContext | null = null
let state: MobileDocNavState = {
  isVisible: false
}

let navBar: HTMLElement | null = null
let injectedStyle: HTMLElement | null = null
let switchProtyleHandler: (() => void) | null = null

let currentDocId: string | null = null
let retryInitTimer: ReturnType<typeof setTimeout> | null = null
let currentNotebookId: string | null = null
let currentDocPath: string | null = null  // 当前文档的父目录路径

let prevDoc: { id: string; title: string } | null = null
let nextDoc: { id: string; title: string } | null = null
let isLoading = false

// ===== 输入法/键盘弹出时自动隐藏 =====
let hiddenByKeyboard = false
let keyboardBaselineHeight: number | null = null
let vvResizeHandler: (() => void) | null = null
let focusInHandler: ((e: FocusEvent) => void) | null = null
let focusOutHandler: ((e: FocusEvent) => void) | null = null

function getViewportHeight(): number {
  return window.visualViewport?.height || window.innerHeight
}

function isTextInputTarget(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName?.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  const htmlEl = el as HTMLElement
  if (htmlEl.isContentEditable) return true
  const parent = htmlEl.closest?.('[contenteditable="true"]')
  return !!parent
}

function hideForKeyboard(): void {
  if (!state.isVisible) return
  if (!navBar) return
  hiddenByKeyboard = true
  removeNavBar()
}

function restoreAfterKeyboard(): void {
  if (!hiddenByKeyboard) return
  hiddenByKeyboard = false
  if (state.isVisible) {
    createNavBar()
    refreshAdjacentDocs()
  }
}

// ===== 工具函数 =====
function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null
  return ((...args: any[]) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }) as T
}

function truncateTitle(title: string, maxLen = 14): string {
  if (!title) return '未命名'
  if (title.length <= maxLen) return title
  return title.slice(0, maxLen) + '…'
}

/**
 * 从文档 ID 获取笔记本 ID 和父目录路径
 */
async function fetchDocInfo(): Promise<{ notebookId: string; parentPath: string } | null> {
  if (!currentDocId) {
    console.warn('[文档导航] currentDocId 为空')
    return null
  }
  try {
    const response: any = await fetchSyncPost('/api/block/getBlockInfo', { id: currentDocId })
    console.log('[文档导航] getBlockInfo 响应:', JSON.stringify(response, null, 2))

    if (response?.code === 0 && response.data) {
      const box = response.data.box
      const docPath = response.data.path || ''  // 如 /20260115105829-q3llty6/20260122001134-dpzphyx.sy

      // 从文档 path 提取父目录路径
      // 去掉文件名，得到父目录
      const lastSlash = docPath.lastIndexOf('/')
      const parentPath = lastSlash > 0 ? docPath.substring(0, lastSlash) : '/'

      console.log('[文档导航] 文档 path:', docPath, '父目录:', parentPath)

      return { notebookId: box, parentPath }
    } else {
      console.warn('[文档导航] getBlockInfo 返回错误:', response?.msg || '未知错误')
    }
  } catch (err) {
    console.warn('[文档导航] 获取文档信息失败:', err)
  }
  return null
}

/**
 * 使用 /api/filetree/listDocsByPath 获取当前目录下的有序文档列表
 * 这是思源内部 API，返回按文件树排序（sort: 15）的文档列表
 */
async function fetchAdjacentDocsByFiletree(
  notebookId: string,
  parentPath: string,
  docId: string
): Promise<{ prev: { id: string; title: string } | null; next: { id: string; title: string } | null }> {
  try {
    const response: any = await fetchSyncPost('/api/filetree/listDocsByPath', {
      notebook: notebookId,
      path: parentPath,
      sort: 15  // 文件树排序规则
    })
    console.log('[文档导航] listDocsByPath 响应:', JSON.stringify(response, null, 2))

    if (response?.code === 0 && response?.data) {
      const files: FiletreeDoc[] = response.data.files || []
      console.log('[文档导航] 目录下文档列表:', files.map(f => ({ id: f.id, name: f.name })))

      const idx = files.findIndex(f => f.id === docId)
      console.log('[文档导航] 当前文档在列表中的索引:', idx)

      if (idx === -1) {
        console.warn('[文档导航] 当前文档不在目录列表中，docId:', docId)
        return { prev: null, next: null }
      }

      const prevFile = idx > 0 ? files[idx - 1] : null
      const nextFile = idx < files.length - 1 ? files[idx + 1] : null

      const result = {
        prev: prevFile ? { id: prevFile.id, title: prevFile.name || '未命名' } : null,
        next: nextFile ? { id: nextFile.id, title: nextFile.name || '未命名' } : null
      }

      console.log('[文档导航] 文件树查询结果:', result)
      return result
    } else {
      console.warn('[文档导航] listDocsByPath 返回错误:', response?.msg || '未知错误')
    }
  } catch (err) {
    console.warn('[文档导航] listDocsByPath 失败:', err)
  }
  return { prev: null, next: null }
}

// ===== UI 更新 =====
function updateNavButtons(): void {
  if (!navBar) return
  const prevBtn = navBar.querySelector('#docnav-prev') as HTMLElement
  const nextBtn = navBar.querySelector('#docnav-next') as HTMLElement

  // 为了避免切换文档时出现“先置灰再恢复”的闪烁，
  // loading 期间不更新按钮的 disabled/opacity，让 UI 保持上一帧状态，
  // 等新文档的相邻结果查询完成后再一次性刷新。
  if (isLoading) return

  if (prevBtn) {
    prevBtn.classList.toggle('disabled', !prevDoc)
    prevBtn.style.opacity = prevDoc ? '1' : '0.3'
  }
  if (nextBtn) {
    nextBtn.classList.toggle('disabled', !nextDoc)
    nextBtn.style.opacity = nextDoc ? '1' : '0.3'
  }
}

async function refreshAdjacentDocs(): Promise<void> {
  console.log('[文档导航] refreshAdjacentDocs, currentDocId:', currentDocId)

  // 尝试从 protyle 回读 currentDocId
  if (!currentDocId) {
    const protyle = (window as any).siyuan?.mobile?.editor?.protyle
    if (protyle?.block?.rootID) {
      currentDocId = protyle.block.rootID
      console.log('[文档导航] 从 protyle 回读到 currentDocId:', currentDocId)
    }
  }
  if (!currentDocId) {
    console.warn('[文档导航] 跳过: currentDocId 为空')
    return
  }

  isLoading = true
  // loading 期间不刷新按钮 UI，避免闪烁

  const docInfo = await fetchDocInfo()
  if (!docInfo?.notebookId) {
    console.warn('[文档导航] 无法获取文档信息')
    isLoading = false
    updateNavButtons()
    return
  }

  currentNotebookId = docInfo.notebookId
  currentDocPath = docInfo.parentPath

  console.log('[文档导航] 准备查询, notebookId:', currentNotebookId, 'parentPath:', currentDocPath)

  const result = await fetchAdjacentDocsByFiletree(currentNotebookId, currentDocPath, currentDocId)
  prevDoc = result.prev
  nextDoc = result.next
  console.log('[文档导航] 最终结果:', { prevDoc, nextDoc })

  isLoading = false
  updateNavButtons()
}

// ===== 导航操作 =====
async function navigateTo(direction: 'prev' | 'next'): Promise<void> {
  const target = direction === 'prev' ? prevDoc : nextDoc
  console.log('[文档导航] navigateTo:', direction, 'target:', target)
  if (!target) return

  try {
    await openMobileFileById(pluginInstance?.app, target.id)
  } catch (err) {
    console.error('[文档导航] 打开文档失败:', err)
    showMessage('打开文档失败', 3000, 'error')
  }
}

// ===== 文档切换处理 =====
const debouncedSwitchProtyle = debounce(() => {
  handleSwitchProtyle()
}, SWITCH_DEBOUNCE)

async function handleSwitchProtyle(): Promise<void> {
  const protyle = (window as any).siyuan?.mobile?.editor?.protyle
  if (!protyle) return

  const docId = protyle.block?.rootID
  if (!docId || docId === currentDocId) return

  console.log('[文档导航] 文档切换，新文档ID:', docId)
  currentDocId = docId
  currentDocPath = null

  if (state.isVisible && navBar) {
    // 进入加载态，但不立刻清空 prev/next（避免按钮瞬间变灰造成闪烁）
    isLoading = true
    setTimeout(() => {
      refreshAdjacentDocs()
    }, 800)
  }
}

// ===== 样式 =====
function injectStyles(): void {
  if (injectedStyle) return
  const style = document.createElement('style')
  style.id = 'mobile-doc-nav-bar-style'
  style.textContent = `
    #mobile-doc-nav-bar {
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      width: 100px;
      /* 与主工具栏同层级；仍低于扩展工具栏(1000+) */
      z-index: 5;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 16px;
      background: rgba(255,255,255,0.78);
      backdrop-filter: saturate(180%) blur(20px);
      -webkit-backdrop-filter: saturate(180%) blur(20px);
      border-radius: 20px;
      box-shadow: 0 2px 20px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04);
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      border: 0.5px solid rgba(0,0,0,0.08);
    }
    .docnav-btn {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: none;
      background: #007AFF;
      color: white;
      font-size: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      transition: opacity 0.2s ease, transform 0.15s ease;
      padding: 0;
      line-height: 1;
    }
    .docnav-btn:active {
      transform: scale(0.9);
    }
    .docnav-btn.disabled {
      opacity: 0.3;
      pointer-events: none;
    }
    .docnav-btn svg {
      width: 20px;
      height: 20px;
      fill: white;
    }
    /* 暗黑模式 */
    html[data-theme-mode="dark"] #mobile-doc-nav-bar {
      background: rgba(44,44,46,0.78);
      border-color: rgba(255,255,255,0.08);
      box-shadow: 0 2px 20px rgba(0,0,0,0.3), 0 0 0 0.5px rgba(255,255,255,0.06);
    }
    html[data-theme-mode="dark"] .docnav-btn {
      background: #0A84FF;
    }
  `
  document.head.appendChild(style)
  injectedStyle = style
}

function removeStyles(): void {
  if (injectedStyle) {
    injectedStyle.remove()
    injectedStyle = null
  }
}

// ===== DOM 构建 =====
function createNavBar(): void {
  if (navBar) return

  injectStyles()

  navBar = document.createElement('div')
  navBar.id = 'mobile-doc-nav-bar'

  const prevBtn = document.createElement('button')
  prevBtn.id = 'docnav-prev'
  prevBtn.className = 'docnav-btn disabled'
  prevBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>'
  prevBtn.addEventListener('click', () => navigateTo('prev'))

  const nextBtn = document.createElement('button')
  nextBtn.id = 'docnav-next'
  nextBtn.className = 'docnav-btn disabled'
  nextBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>'
  nextBtn.addEventListener('click', () => navigateTo('next'))

  navBar.appendChild(prevBtn)
  navBar.appendChild(nextBtn)

  document.body.appendChild(navBar)

  refreshAdjacentDocs()
}

function removeNavBar(): void {
  if (navBar) {
    navBar.remove()
    navBar = null
  }
  removeStyles()
}

// ===== 持久化 =====
async function persistState(): Promise<void> {
  if (!ctx) return
  await ctx.saveData(PERSIST_KEY, state)
}

const debouncedPersist = debounce(persistState, REFRESH_DEBOUNCE)

async function loadState(): Promise<void> {
  if (!ctx) return
  try {
    const saved = await ctx.loadData(PERSIST_KEY)
    if (saved) {
      state = { isVisible: saved.isVisible ?? false }
    }
  } catch (err) {
    console.warn('[文档导航] 加载状态失败:', err)
  }
}

// ===== 公开 API =====
export async function init(context: DocNavContext): Promise<void> {
  ctx = context

  await loadState()

  const protyle = (window as any).siyuan?.mobile?.editor?.protyle
  if (protyle?.block?.rootID) currentDocId = protyle.block.rootID

  if (state.isVisible) {
    createNavBar()
  }

  // 首次等待文档加载后刷新（protyle 在 init 时可能还没准备好）
  const retryInit = async (count: number) => {
    if (count > 15 || !state.isVisible) return

    const protyle = (window as any).siyuan?.mobile?.editor?.protyle
    if (protyle?.block?.rootID) {
      currentDocId = protyle.block.rootID
      console.log('[文档导航] init 重试成功获取到 currentDocId:', currentDocId)

      // 等待一段时间确保文档加载完成
      await new Promise(resolve => setTimeout(resolve, 1500))

      if (navBar) {
        refreshAdjacentDocs()
      }
      return
    }

    console.log(`[文档导航] init 重试第 ${count + 1} 次...`)
    retryInitTimer = setTimeout(() => retryInit(count + 1), 1000)
  }

  if (state.isVisible && !currentDocId) {
    retryInit(0)
  }

  switchProtyleHandler = debouncedSwitchProtyle
  context.eventBus.on('switch-protyle', switchProtyleHandler)
  context.eventBus.on('loaded-protyle-dynamic', switchProtyleHandler)

  keyboardBaselineHeight = getViewportHeight()
  vvResizeHandler = () => {
    if (!isMobileDevice()) return
    const vh = getViewportHeight()
    if (keyboardBaselineHeight == null) keyboardBaselineHeight = vh
    if (!isTextInputTarget(document.activeElement)) {
      keyboardBaselineHeight = Math.max(keyboardBaselineHeight || 0, vh)
    }
    const baseline = keyboardBaselineHeight || vh
    const delta = baseline - vh
    if (delta > 120 && isTextInputTarget(document.activeElement)) {
      hideForKeyboard()
    } else if (delta < 60) {
      restoreAfterKeyboard()
    }
  }
  window.visualViewport?.addEventListener('resize', vvResizeHandler)

  focusInHandler = (e: FocusEvent) => {
    if (!isMobileDevice()) return
    if (isTextInputTarget(e.target as Element)) {
      keyboardBaselineHeight = Math.max(keyboardBaselineHeight || 0, getViewportHeight())
      hideForKeyboard()
    }
  }
  focusOutHandler = (e: FocusEvent) => {
    if (!isMobileDevice()) return
    if (!isTextInputTarget(e.target as Element)) return
    setTimeout(() => {
      if (!isTextInputTarget(document.activeElement)) {
        keyboardBaselineHeight = Math.max(keyboardBaselineHeight || 0, getViewportHeight())
        restoreAfterKeyboard()
      }
    }, 200)
  }
  document.addEventListener('focusin', focusInHandler, true)
  document.addEventListener('focusout', focusOutHandler, true)
}

export function toggleVisibility(config: ButtonConfig): void {
  console.log('[文档导航] toggleVisibility called, isMobile:', isMobileDevice(), 'currentDocId:', currentDocId)
  if (!isMobileDevice()) {
    showMessage('此功能仅支持手机端', 2000, 'info')
    return
  }

  state.isVisible = !state.isVisible

  if (state.isVisible) {
    const protyle = (window as any).siyuan?.mobile?.editor?.protyle
    if (protyle?.block?.rootID) currentDocId = protyle.block.rootID
    currentDocPath = null
    prevDoc = null
    nextDoc = null

    createNavBar()

    // 重新注册事件监听
    if (!switchProtyleHandler) {
      switchProtyleHandler = debouncedSwitchProtyle
      ctx?.eventBus.on('switch-protyle', switchProtyleHandler)
      ctx?.eventBus.on('loaded-protyle-dynamic', switchProtyleHandler)
    }
    if (!vvResizeHandler) {
      keyboardBaselineHeight = getViewportHeight()
      vvResizeHandler = () => {
        if (!isMobileDevice()) return
        const vh = getViewportHeight()
        if (keyboardBaselineHeight == null) keyboardBaselineHeight = vh
        if (!isTextInputTarget(document.activeElement)) {
          keyboardBaselineHeight = Math.max(keyboardBaselineHeight || 0, vh)
        }
        const baseline = keyboardBaselineHeight || vh
        const delta = baseline - vh
        if (delta > 120 && isTextInputTarget(document.activeElement)) {
          hideForKeyboard()
        } else if (delta < 60) {
          restoreAfterKeyboard()
        }
      }
      window.visualViewport?.addEventListener('resize', vvResizeHandler)
    }
    if (!focusInHandler) {
      focusInHandler = (e: FocusEvent) => {
        if (!isMobileDevice()) return
        if (isTextInputTarget(e.target as Element)) {
          keyboardBaselineHeight = Math.max(keyboardBaselineHeight || 0, getViewportHeight())
          hideForKeyboard()
        }
      }
      focusOutHandler = (e: FocusEvent) => {
        if (!isMobileDevice()) return
        if (!isTextInputTarget(e.target as Element)) return
        setTimeout(() => {
          if (!isTextInputTarget(document.activeElement)) {
            keyboardBaselineHeight = Math.max(keyboardBaselineHeight || 0, getViewportHeight())
            restoreAfterKeyboard()
          }
        }, 200)
      }
      document.addEventListener('focusin', focusInHandler, true)
      document.addEventListener('focusout', focusOutHandler, true)
    }

    if (config.showNotification !== false) showMessage('文档导航已显示', 1500, 'info')
  } else {
    removeNavBar()

    // 完全清理事件监听
    if (ctx && switchProtyleHandler) {
      ctx.eventBus.off('switch-protyle', switchProtyleHandler)
      ctx.eventBus.off('loaded-protyle-dynamic', switchProtyleHandler)
      switchProtyleHandler = null
    }
    if (vvResizeHandler) {
      window.visualViewport?.removeEventListener('resize', vvResizeHandler)
      vvResizeHandler = null
    }
    if (focusInHandler) {
      document.removeEventListener('focusin', focusInHandler, true)
      focusInHandler = null
    }
    if (focusOutHandler) {
      document.removeEventListener('focusout', focusOutHandler, true)
      focusOutHandler = null
    }

    // 清空状态
    currentDocId = null
    currentNotebookId = null
    currentDocPath = null
    prevDoc = null
    nextDoc = null
    hiddenByKeyboard = false
    keyboardBaselineHeight = null

    if (config.showNotification !== false) showMessage('文档导航已隐藏', 1500, 'info')
  }

  debouncedPersist()
}

export function cleanup(): void {
  if (ctx && switchProtyleHandler) {
    ctx.eventBus.off('switch-protyle', switchProtyleHandler)
    ctx.eventBus.off('loaded-protyle-dynamic', switchProtyleHandler)
    switchProtyleHandler = null
  }
  if (vvResizeHandler) {
    window.visualViewport?.removeEventListener('resize', vvResizeHandler)
    vvResizeHandler = null
  }
  if (focusInHandler) {
    document.removeEventListener('focusin', focusInHandler, true)
    focusInHandler = null
  }
  if (focusOutHandler) {
    document.removeEventListener('focusout', focusOutHandler, true)
    focusOutHandler = null
  }
  if (retryInitTimer) {
    clearTimeout(retryInitTimer)
    retryInitTimer = null
  }

  removeNavBar()
  ctx = null
}
