/**
 * 手机端前一篇/后一篇文档导航模块
 * 功能：在手机端底部显示悬浮导航栏，按文件树排序规则在整个笔记本范围内导航文档
 * 设计风格：与手机端标签页Tab/悬浮大纲保持一致的苹果风格
 */

import { fetchSyncPost, openMobileFileById, showMessage } from "siyuan";
import { isMobileDevice, pluginInstance } from "../toolbarManager";
import type { ButtonConfig } from "../toolbarManager";
import { applyFloatPanelBackground, observeSiYuanThemeMode } from "./floatPanelBackground";

// ===== 常量 =====
const PERSIST_KEY = 'mobileDocNavState'
const SWITCH_DEBOUNCE = 300
const REFRESH_DEBOUNCE = 500

// ===== 接口 =====
interface DocNavContext {
  saveData: (key: string, value: any) => Promise<void>
  loadData: (key: string) => Promise<any>
  eventBus: any
  floatOpacity?: number
  autoHideOnScroll?: boolean
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

let lastDocNavFloatOpacity: number | undefined
let themeModeUnsubscribe: (() => void) | null = null

// ===== 输入法/键盘弹出时自动隐藏 =====
let hiddenByKeyboard = false
let keyboardBaselineHeight: number | null = null
let vvResizeHandler: (() => void) | null = null
let focusInHandler: ((e: FocusEvent) => void) | null = null
let focusOutHandler: ((e: FocusEvent) => void) | null = null

let boundScrollEl: HTMLElement | null = null
let scrollBindRetryTimer: ReturnType<typeof setInterval> | null = null
let scrollBindRetryCount = 0

// ===== 滚动隐藏/显示（向上滚动消失，下滑出现）=====
let hiddenByScroll = false
let autoHideOnScrollEnabled = false
let currentFloatOpacityForAutoHide: number | undefined = undefined
let lastScrollTopForAutoHide: number | null = null
let lastAutoHideToggleAt = 0

const SCROLL_HIDE_THRESHOLD_PX = 15
const SCROLL_TOGGLE_COOLDOWN_MS = 200
const SCROLL_FADE_MS = 160

function fadeOutNavBar(): void {
  if (!navBar) return
  const el = navBar
  el.style.transition = `opacity ${SCROLL_FADE_MS}ms ease`
  el.style.opacity = '0'
  window.setTimeout(() => {
    if (navBar === el) navBar.style.display = 'none'
  }, SCROLL_FADE_MS)
}

function showNavBarWithFadeIn(): void {
  if (!navBar) return
  const el = navBar
  el.style.display = ''
  el.style.transition = `opacity ${SCROLL_FADE_MS}ms ease`
  el.style.opacity = '0'
  requestAnimationFrame(() => {
    if (navBar === el) el.style.opacity = '1'
  })
}

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

function getMobileContentScrollElement(): HTMLElement | null {
  // 手机端真正滚动发生在 protyle.contentElement 内部
  const protyle = (window as any).siyuan?.mobile?.editor?.protyle
  return protyle?.contentElement || document.querySelector('.protyle-content')
}

function bindScrollListener(): void {
  const el = getMobileContentScrollElement()
  if (!el) return

  if (boundScrollEl && boundScrollEl !== el) {
    boundScrollEl.removeEventListener('scroll', handleScrollAutoHide as any)
    boundScrollEl = null
  }

  if (boundScrollEl === el) return
  boundScrollEl = el
  boundScrollEl.addEventListener('scroll', handleScrollAutoHide as any, { passive: true })
}

function startScrollBindRetry(): void {
  if (boundScrollEl) return
  if (scrollBindRetryTimer) return

  scrollBindRetryCount = 0
  scrollBindRetryTimer = setInterval(() => {
    scrollBindRetryCount++
    bindScrollListener()
    if (boundScrollEl || scrollBindRetryCount >= 30) {
      if (scrollBindRetryTimer) clearInterval(scrollBindRetryTimer)
      scrollBindRetryTimer = null
    }
  }, 200)
}

function ensureScrollListenerBound(): void {
  bindScrollListener()
  if (!boundScrollEl) startScrollBindRetry()
}

function detachInteractionListeners(): void {
  if (boundScrollEl) {
    boundScrollEl.removeEventListener('scroll', handleScrollAutoHide as any)
    boundScrollEl = null
  }
  if (scrollBindRetryTimer) {
    clearInterval(scrollBindRetryTimer)
    scrollBindRetryTimer = null
  }
  if (retryInitTimer) {
    clearTimeout(retryInitTimer)
    retryInitTimer = null
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
  if (state.isVisible && !hiddenByScroll) {
    createNavBar()
    refreshAdjacentDocs()
  }
}

function handleScrollAutoHide(): void {
  if (!state.isVisible) return
  if (!autoHideOnScrollEnabled) return
  if (hiddenByKeyboard) return

  const scrollEl = boundScrollEl || getMobileContentScrollElement()
  if (!scrollEl) return

  const now = Date.now()
  const st = scrollEl.scrollTop

  if (lastScrollTopForAutoHide == null) {
    lastScrollTopForAutoHide = st
    return
  }

  const delta = st - lastScrollTopForAutoHide
  lastScrollTopForAutoHide = st

  if (now - lastAutoHideToggleAt < SCROLL_TOGGLE_COOLDOWN_MS) return

  // scrollTop 增加：内容向上滚（你说的“向上滚动”）=> hide
  // scrollTop 减少：内容向下滚（你说的“下滑”）=> show
  if (!hiddenByScroll && delta > SCROLL_HIDE_THRESHOLD_PX) {
    hiddenByScroll = true
    lastAutoHideToggleAt = now
    fadeOutNavBar()
  } else if (hiddenByScroll && delta < -SCROLL_HIDE_THRESHOLD_PX) {
    hiddenByScroll = false
    lastAutoHideToggleAt = now

    if (!navBar) {
      createNavBar()
    } else {
      applyOpacity(navBar, currentFloatOpacityForAutoHide)
      updateNavButtons()
    }
    showNavBarWithFadeIn()

    // prev/next 在普通滚动过程中不应变化；只有在重建 navBar 时才刷新。
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

    if (response?.code === 0 && response.data) {
      const box = response.data.box
      const docPath = response.data.path || ''  // 如 /20260115105829-q3llty6/20260122001134-dpzphyx.sy

      // 从文档 path 提取父目录路径
      // 去掉文件名，得到父目录
      const lastSlash = docPath.lastIndexOf('/')
      const parentPath = lastSlash > 0 ? docPath.substring(0, lastSlash) : '/'

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

    if (response?.code === 0 && response?.data) {
      const files: FiletreeDoc[] = response.data.files || []

      const idx = files.findIndex(f => f.id === docId)

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
  // 尝试从 protyle 回读 currentDocId
  if (!currentDocId) {
    const protyle = (window as any).siyuan?.mobile?.editor?.protyle
    if (protyle?.block?.rootID) {
      currentDocId = protyle.block.rootID
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

  const result = await fetchAdjacentDocsByFiletree(currentNotebookId, currentDocPath, currentDocId)
  prevDoc = result.prev
  nextDoc = result.next

  isLoading = false
  updateNavButtons()
}

// ===== 导航操作 =====
async function navigateTo(direction: 'prev' | 'next'): Promise<void> {
  const target = direction === 'prev' ? prevDoc : nextDoc
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

  currentDocId = docId
  currentDocPath = null

  if (state.isVisible && navBar) {
    // 进入加载态，但不立刻清空 prev/next（避免按钮瞬间变灰造成闪烁）
    isLoading = true
    setTimeout(() => {
      refreshAdjacentDocs()
    }, 800)
  }

  // 确保绑定到当前文档的真实滚动容器
  ensureScrollListenerBound()

  // 切文档后重置滚动方向基准
  const scrollEl = getMobileContentScrollElement()
  lastScrollTopForAutoHide = scrollEl?.scrollTop ?? null
  lastAutoHideToggleAt = 0
}

// ===== 样式 =====
function applyOpacity(el: HTMLElement | null, opacity: number | undefined): void {
  lastDocNavFloatOpacity = opacity
  applyFloatPanelBackground(el, opacity, 0.78)
}

function refreshDocNavFloatBackground(): void {
  if (!navBar || !state.isVisible) return
  applyFloatPanelBackground(navBar, lastDocNavFloatOpacity, 0.78)
}

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
      background: rgba(0,122,255,0.45);
      border: 1px solid rgba(255,255,255,0.35);
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
      background: rgba(0,0,0,0.78);
      border-color: rgba(255,255,255,0.08);
      box-shadow: 0 2px 20px rgba(0,0,0,0.3), 0 0 0 0.5px rgba(255,255,255,0.06);
    }
    html[data-theme-mode="dark"] .docnav-btn {
      background: rgba(10,132,255,0.5);
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

  if (!themeModeUnsubscribe) {
    themeModeUnsubscribe = observeSiYuanThemeMode(() => {
      refreshDocNavFloatBackground()
    })
  }

  await loadState()

  autoHideOnScrollEnabled = !!context.autoHideOnScroll
  currentFloatOpacityForAutoHide = context.floatOpacity
  hiddenByScroll = false
  lastScrollTopForAutoHide = null
  lastAutoHideToggleAt = 0

  const protyle = (window as any).siyuan?.mobile?.editor?.protyle
  if (protyle?.block?.rootID) currentDocId = protyle.block.rootID

  if (state.isVisible) {
    createNavBar()
    applyOpacity(navBar, context.floatOpacity)
  }

  // 首次等待文档加载后刷新（protyle 在 init 时可能还没准备好）
  const retryInit = async (count: number) => {
    if (count > 15 || !state.isVisible) return

    const protyle = (window as any).siyuan?.mobile?.editor?.protyle
    if (protyle?.block?.rootID) {
      currentDocId = protyle.block.rootID

      // 等待一段时间确保文档加载完成
      await new Promise(resolve => setTimeout(resolve, 1500))

      if (navBar) {
        refreshAdjacentDocs()
      }
      return
    }

    retryInitTimer = setTimeout(() => retryInit(count + 1), 1000)
  }

  // 兜底：插件重载后 protyle 可能已就绪但事件已错过，主动同步一次
  if (state.isVisible && !currentDocId) {
    retryInit(0)
  }

  // 仅在可见状态下才注册交互监听，避免启动后无谓开销
  if (state.isVisible) {
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

    // 向上滚动消失、下滑出现（仅当按钮开关开启时才启用）
    ensureScrollListenerBound()
  }
}

export function toggleVisibility(config: ButtonConfig): void {
  if (!isMobileDevice()) {
    showMessage('此功能仅支持手机端', 2000, 'info')
    return
  }

  state.isVisible = !state.isVisible

  if (state.isVisible) {
    // 更新滚动隐藏开关配置与用于恢复的透明度
    autoHideOnScrollEnabled = !!config.autoHideOnScroll
    currentFloatOpacityForAutoHide = config.floatOpacity
    hiddenByScroll = false
    lastScrollTopForAutoHide = null
    lastAutoHideToggleAt = 0

    const protyle = (window as any).siyuan?.mobile?.editor?.protyle
    if (protyle?.block?.rootID) currentDocId = protyle.block.rootID
    currentDocPath = null
    prevDoc = null
    nextDoc = null

    createNavBar()
    applyOpacity(navBar, config.floatOpacity)
    ensureScrollListenerBound()

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
    detachInteractionListeners()

    // 清空状态
    currentDocId = null
    currentNotebookId = null
    currentDocPath = null
    prevDoc = null
    nextDoc = null
    hiddenByKeyboard = false
    keyboardBaselineHeight = null

    // 关闭滚动隐藏
    autoHideOnScrollEnabled = false
    hiddenByScroll = false
    lastScrollTopForAutoHide = null
    currentFloatOpacityForAutoHide = undefined
    lastAutoHideToggleAt = 0

    if (config.showNotification !== false) showMessage('文档导航已隐藏', 1500, 'info')
  }

  debouncedPersist()
}

/** 思源同步覆盖存储后调用，从磁盘重新加载状态并刷新 UI */
export async function reloadState(): Promise<void> {
  if (!ctx) return
  await loadState()
  if (state.isVisible) {
    createNavBar()
    ensureScrollListenerBound()
  } else if (navBar) {
    removeNavBar()
  }
}

export function cleanup(): void {
  if (ctx && switchProtyleHandler) {
    ctx.eventBus.off('switch-protyle', switchProtyleHandler)
    ctx.eventBus.off('loaded-protyle-dynamic', switchProtyleHandler)
    switchProtyleHandler = null
  }
  detachInteractionListeners()

  if (retryInitTimer) {
    clearTimeout(retryInitTimer)
    retryInitTimer = null
  }

  removeNavBar()

  if (themeModeUnsubscribe) {
    themeModeUnsubscribe()
    themeModeUnsubscribe = null
  }

  // 重置所有模块状态
  state = { isVisible: false }
  currentDocId = null
  currentNotebookId = null
  currentDocPath = null
  prevDoc = null
  nextDoc = null
  isLoading = false
  lastDocNavFloatOpacity = undefined
  hiddenByKeyboard = false
  keyboardBaselineHeight = null
  hiddenByScroll = false
  autoHideOnScrollEnabled = false
  currentFloatOpacityForAutoHide = undefined
  lastScrollTopForAutoHide = null
  lastAutoHideToggleAt = 0
  scrollBindRetryCount = 0

  ctx = null
}
