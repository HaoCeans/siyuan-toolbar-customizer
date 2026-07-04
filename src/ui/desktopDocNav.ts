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
    } else {
      const response: any = await fetchSyncPost('/api/filetree/listDocsByPath', {
        notebook: docInfo.notebookId,
        path: docInfo.parentPath,
        sort: (window as any).siyuan?.config?.fileTree?.sort ?? 4
      })

	      if (response?.code === 0 && response?.data) {
	        const files: FiletreeDoc[] = response.data.files || []
	        const idx = files.findIndex(f => f.id === docId)

	        // API 返回的数组顺序与文件树 UI 视觉顺序相反：
	        // files[0] 在文件树底部，files[last] 在文件树顶部
	        // 因此 files[idx+1] 是视觉"上一篇"（上面），files[idx-1] 是视觉"下一篇"（下面）
	        if (idx >= 0 && idx < files.length - 1) {
	          prevDoc = { id: files[idx + 1].id, title: files[idx + 1].name || '未命名' }
	        } else {
	          prevDoc = null
	        }

	        if (idx > 0) {
	          nextDoc = { id: files[idx - 1].id, title: files[idx - 1].name || '未命名' }
	        } else {
	          nextDoc = null
	        }
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

  // 立刻清掉 prev/next 防止连点
  prevDoc = null
  nextDoc = null
  updateNavButtons()

  try {
    await siyuanOpenTab({
      app: pluginInstance?.app,
      doc: {
        id: target.id
      }
    })
    // 主动刷新：不依赖 switch-protyle 事件（可能延迟或不触发）
    setTimeout(() => fetchAdjacentDocs(), 200)
    return true
  } catch (err) {
    console.error('[DesktopDocNav] 打开文档失败:', err)
    showMessage('打开文档失败', 3000, 'error')
    // 恢复 prev/next 状态
    fetchAdjacentDocs()
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

// ===== Switch-protyle handler 工厂 =====
/** 创建带防抖的文档切换处理器，每次调用返回新闭包，需先 off 旧引用再 on */
function createSwitchProtyleHandler(): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  return () => {
    if (!state.isVisible) return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      fetchAdjacentDocs()
    }, 300)
  }
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
  // 悬浮弹窗中不显示（块格式记事窗、纯文本悬浮窗等）
  if (location.href.includes('window.html') || location.href.startsWith('data:text/html')) return

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

  // 监听文档切换事件（300ms 防抖，避免快速切标签时大量 API）
  // 先移除旧的 handler（防止 init 重入泄漏），再创建新的
  if (switchProtyleHandler) {
    context.eventBus.off('switch-protyle', switchProtyleHandler)
    context.eventBus.off('loaded-protyle-dynamic', switchProtyleHandler)
  }
  switchProtyleHandler = createSwitchProtyleHandler()
  context.eventBus.on('switch-protyle', switchProtyleHandler)
  context.eventBus.on('loaded-protyle-dynamic', switchProtyleHandler)
}

export function toggleVisibility(config: ButtonConfig): void {
  // 悬浮弹窗 / 独立窗口中不显示
  if (location.href.includes('window.html') || location.href.startsWith('data:text/html')) {
    showMessage('此功能仅支持主窗口', 1500, 'info')
    return
  }

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
    // 注册 EventBus 监听（先 off 旧再 on 新，处理 init 时 handler 为空的情况）
    if (ctx) {
      if (switchProtyleHandler) {
        ctx.eventBus.off('switch-protyle', switchProtyleHandler)
        ctx.eventBus.off('loaded-protyle-dynamic', switchProtyleHandler)
      }
      switchProtyleHandler = createSwitchProtyleHandler()
      ctx.eventBus.on('switch-protyle', switchProtyleHandler)
      ctx.eventBus.on('loaded-protyle-dynamic', switchProtyleHandler)
    }

    if (config.showNotification !== false) {
      showMessage('文档导航已显示', 1500, 'info')
    }
  } else {
    removeNavBar()
    // 隐藏时移除 EventBus 监听，避免后台无效触发
    if (ctx && switchProtyleHandler) {
      ctx.eventBus.off('switch-protyle', switchProtyleHandler)
      ctx.eventBus.off('loaded-protyle-dynamic', switchProtyleHandler)
    }

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

  prevDoc = null
  nextDoc = null
  isLoading = false
  ctx = null
  state = { isVisible: false }
}
