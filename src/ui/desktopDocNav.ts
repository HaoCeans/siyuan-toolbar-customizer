/**
 * 桌面端前一篇/后一篇文档导航模块
 * 功能：在桌面端显示悬浮导航栏，支持文档快速切换和拖拽
 */

import { fetchSyncPost, showMessage, openTab as siyuanOpenTab } from "siyuan"
import { pluginInstance, getActiveProtyle } from "../toolbarManager"
import type { ButtonConfig } from "../toolbarManager"
import { applyFloatPanelBackground, observeSiYuanThemeMode } from "./floatPanelBackground"
import { makeDraggable, restorePosition } from "./draggablePanel"

// ===== 常量 =====
const PERSIST_KEY = 'desktopDocNavState'

// ===== 接口 =====
interface DocNavContext {
  saveData: (key: string, value: any) => Promise<void>
  loadData: (key: string) => Promise<any>
  eventBus: any
}

interface DesktopDocNavState {
  isVisible: boolean
}

interface FiletreeDoc {
  id: string
  name: string
}

// ===== 模块状态 =====
let ctx: DocNavContext | null = null
let state: DesktopDocNavState = {
  isVisible: false
}

let navBar: HTMLElement | null = null
let injectedStyle: HTMLElement | null = null
let switchProtyleHandler: (() => void) | null = null
let dragCleanup: (() => void) | null = null
let themeModeUnsubscribe: (() => void) | null = null

let currentDocId: string | null = null
let currentNotebookId: string | null = null
let prevDoc: { id: string; title: string } | null = null
let nextDoc: { id: string; title: string } | null = null
let isLoading = false

// ===== 获取当前活动的 protyle 元素和文档信息 =====
function getCurrentDocId(): string | undefined {
  const protyle = getActiveProtyle()
  if (protyle?.block?.rootID) return protyle.block.rootID
  return undefined
}

function getCurrentNotebookId(): string {
  const protyle = getActiveProtyle()
  return protyle?.notebookId || ''
}

// ===== 获取相邻文档 =====
async function fetchDocInfo(docId: string): Promise<{ notebookId: string; parentPath: string } | null> {
  try {
    const response: any = await fetchSyncPost('/api/block/getBlockInfo', { id: docId })
    if (response?.code === 0 && response.data) {
      const box = response.data.box
      const docPath = response.data.path || ''
      const lastSlash = docPath.lastIndexOf('/')
      const parentPath = lastSlash > 0 ? docPath.substring(0, lastSlash) : '/'
      return { notebookId: box, parentPath }
    }
  } catch (err) {
    console.warn('[DesktopDocNav] 获取文档信息失败:', err)
  }
  return null
}

async function fetchAdjacentDocs(): Promise<void> {
  if (isLoading) return

  const docId = getCurrentDocId()
  if (!docId) {
    prevDoc = null
    nextDoc = null
    updateNavButtons()
    return
  }

  isLoading = true

  try {
    const docInfo = await fetchDocInfo(docId)
    if (!docInfo?.notebookId) {
      prevDoc = null
      nextDoc = null
      return
    }

    const response: any = await fetchSyncPost('/api/filetree/listDocsByPath', {
      notebook: docInfo.notebookId,
      path: docInfo.parentPath,
      sort: 15
    })

    if (response?.code === 0 && response?.data) {
      const files: FiletreeDoc[] = response.data.files || []
      const idx = files.findIndex(f => f.id === docId)

      if (idx > 0) {
        prevDoc = { id: files[idx - 1].id, title: files[idx - 1].name || '未命名' }
      } else {
        prevDoc = null
      }

      if (idx >= 0 && idx < files.length - 1) {
        nextDoc = { id: files[idx + 1].id, title: files[idx + 1].name || '未命名' }
      } else {
        nextDoc = null
      }
    }
  } catch (err) {
    console.warn('[DesktopDocNav] 获取相邻文档失败:', err)
    prevDoc = null
    nextDoc = null
  } finally {
    isLoading = false
    updateNavButtons()
  }
}

// ===== 导航到文档 =====
async function navigateTo(direction: 'prev' | 'next'): Promise<boolean> {
  const target = direction === 'prev' ? prevDoc : nextDoc
  if (!target) return false

  try {
    await siyuanOpenTab({
      app: pluginInstance?.app,
      doc: {
        id: target.id
      }
    })
    return true
  } catch (err) {
    console.error('[DesktopDocNav] 打开文档失败:', err)
    showMessage('打开文档失败', 3000, 'error')
    return false
  }
}

// ===== 对外导出：供 TTS 朗读完成自动切文档 =====
/**
 * 导航到上一篇/下一篇文档。
 * 先刷新相邻文档列表再导航，返回是否成功切换。
 */
export async function navigateToAdjacentDoc(direction: 'prev' | 'next'): Promise<boolean> {
  await fetchAdjacentDocs()
  return navigateTo(direction)
}

// ===== DOM 构建 =====
function injectStyles(): void {
  if (injectedStyle) return
  const style = document.createElement('style')
  style.id = 'desktop-doc-nav-style'
  style.textContent = `
    #desktop-doc-nav-bar {
      position: fixed;
      z-index: 5;
      display: flex;
      gap: 8px;
      background: rgba(255,255,255,0.85);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.06);
      padding: 6px;
      border: 0.5px solid rgba(0,0,0,0.08);
    }
    .desktop-doc-nav-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      border: none;
      background: transparent;
      color: #1c1c1e;
      font-size: 13px;
      font-weight: 500;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.15s ease;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 240px;
    }
    .desktop-doc-nav-btn:hover:not(:disabled) {
      background: rgba(0,0,0,0.04);
    }
    .desktop-doc-nav-btn:active:not(:disabled) {
      background: rgba(0,0,0,0.08);
    }
    .desktop-doc-nav-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .desktop-doc-nav-icon {
      font-size: 16px;
      flex-shrink: 0;
    }
    html[data-theme-mode="dark"] #desktop-doc-nav-bar {
      background: rgba(30,30,30,0.85);
      border-color: rgba(255,255,255,0.1);
      box-shadow: 0 4px 24px rgba(0,0,0,0.3), 0 0 0 0.5px rgba(255,255,255,0.05);
    }
    html[data-theme-mode="dark"] .desktop-doc-nav-btn {
      color: #f5f5f7;
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

function updateNavButtons(): void {
  const prevBtn = navBar?.querySelector('.desktop-doc-nav-prev') as HTMLButtonElement | null
  const nextBtn = navBar?.querySelector('.desktop-doc-nav-next') as HTMLButtonElement | null

  if (prevBtn) {
    prevBtn.disabled = !prevDoc
    prevBtn.innerHTML = `<span class="desktop-doc-nav-icon">←</span><span>${prevDoc?.title ? truncateTitle(prevDoc.title, 20) : '上一篇'}</span>`
  }

  if (nextBtn) {
    nextBtn.disabled = !nextDoc
    nextBtn.innerHTML = `<span>${nextDoc?.title ? truncateTitle(nextDoc.title, 20) : '下一篇'}</span><span class="desktop-doc-nav-icon">→</span>`
  }
}

function truncateTitle(title: string, maxLen = 20): string {
  if (!title) return '未命名'
  return title.length > maxLen ? title.substring(0, maxLen) + '...' : title
}

function createNavBar(): void {
  if (navBar) return

  injectStyles()

  navBar = document.createElement('div')
  navBar.id = 'desktop-doc-nav-bar'

  const prevBtn = document.createElement('button')
  prevBtn.className = 'desktop-doc-nav-btn desktop-doc-nav-prev'
  prevBtn.disabled = true
  prevBtn.innerHTML = '<span class="desktop-doc-nav-icon">←</span><span>上一篇</span>'
  prevBtn.addEventListener('click', () => navigateTo('prev'))

  const nextBtn = document.createElement('button')
  nextBtn.className = 'desktop-doc-nav-btn desktop-doc-nav-next'
  nextBtn.disabled = true
  nextBtn.innerHTML = '<span>下一篇</span><span class="desktop-doc-nav-icon">→</span>'
  nextBtn.addEventListener('click', () => navigateTo('next'))

  navBar.appendChild(prevBtn)
  navBar.appendChild(nextBtn)

  document.body.appendChild(navBar)

  fetchAdjacentDocs()

  // 恢复位置或使用默认位置
  const restored = restorePosition(navBar)
  if (restored) {
    navBar.style.left = 'auto'
    navBar.style.bottom = 'auto'
  } else {
    // 默认位置：底部居中
    navBar.style.left = '50%'
    navBar.style.bottom = '20px'
    navBar.style.right = 'auto'
    navBar.style.transform = 'translateX(-50%)'
  }

  // 启用拖拽
  dragCleanup = makeDraggable(navBar, {
    handleSelector: undefined,
    boundary: 'window'
  })
}

function removeNavBar(): void {
  if (dragCleanup) {
    dragCleanup()
    dragCleanup = null
  }

  if (navBar) {
    navBar.remove()
    navBar = null
  }
  removeStyles()
}

// ===== 持久化 =====
async function persistState(): Promise<void> {
  if (!ctx) return
  await ctx.saveData(PERSIST_KEY, {
    isVisible: state.isVisible
  })
}

async function loadState(): Promise<void> {
  if (!ctx) return
  try {
    const saved = await ctx.loadData(PERSIST_KEY)
    if (saved) {
      state = {
        isVisible: saved.isVisible ?? false
      }
    }
  } catch (err) {
    console.warn('[DesktopDocNav] 加载状态失败:', err)
  }
}

// ===== 公开 API =====
export async function init(context: DocNavContext): Promise<void> {
  ctx = context

  if (!themeModeUnsubscribe) {
    themeModeUnsubscribe = observeSiYuanThemeMode(() => {
      if (navBar) applyFloatPanelBackground(navBar, undefined, 0.85)
    })
  }

  await loadState()

  if (state.isVisible) {
    createNavBar()
    applyFloatPanelBackground(navBar, undefined, 0.85)
  }

  // 监听文档切换事件
  switchProtyleHandler = () => {
    if (state.isVisible) {
      fetchAdjacentDocs()
    }
  }
  context.eventBus.on('switch-protyle', switchProtyleHandler)
  context.eventBus.on('loaded-protyle-dynamic', switchProtyleHandler)
}

export function toggleVisibility(config: ButtonConfig): void {
  // 只在桌面端运行
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  if (isMobile) {
    showMessage('此功能仅支持桌面端', 1500, 'error')
    return
  }

  state.isVisible = !state.isVisible

  if (state.isVisible) {
    createNavBar()
    applyFloatPanelBackground(navBar, config.floatOpacity, 0.85)

    if (config.showNotification !== false) {
      showMessage('文档导航已显示', 1500, 'info')
    }
  } else {
    removeNavBar()

    if (config.showNotification !== false) {
      showMessage('文档导航已隐藏', 1500, 'info')
    }
  }

  persistState()
}

export function cleanup(): void {
  if (ctx && switchProtyleHandler) {
    ctx.eventBus.off('switch-protyle', switchProtyleHandler)
    ctx.eventBus.off('loaded-protyle-dynamic', switchProtyleHandler)
    switchProtyleHandler = null
  }

  removeNavBar()

  if (themeModeUnsubscribe) {
    themeModeUnsubscribe()
    themeModeUnsubscribe = null
  }

  ctx = null
  state = { isVisible: false }
}
