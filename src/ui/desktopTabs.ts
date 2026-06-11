/**
 * 桌面端标签页Tab模块
 * 功能：在桌面端显示悬浮Tab栏，支持多文档快速切换和拖拽
 */

import { fetchSyncPost, showMessage, openTab as siyuanOpenTab } from "siyuan"
import { pluginInstance, getActiveProtyle } from "../toolbarManager"
import type { ButtonConfig } from "../toolbarManager"
import { applyFloatPanelBackground, observeSiYuanThemeMode } from "./floatPanelBackground"
import { makeDraggable, restorePosition, savePosition } from "./draggablePanel"

// ===== 常量 =====
const MAX_TABS = 10
const PERSIST_KEY = 'desktopTabsState'
const DEBOUNCE = 200

const TAB_COLORS = [
  '#007AFF', '#5856D6', '#34C759', '#FF9500',
  '#FF2D55', '#AF52DE', '#5AC8FA', '#30D158',
  '#FF6B35', '#64D2FF'
]

// ===== 接口 =====
export interface TabItem {
  id: string
  docId: string
  title: string
  notebookId: string
  isActive: boolean
  isPinned: boolean
  createdAt: number
}

interface DesktopTabsState {
  tabs: TabItem[]
  isVisible: boolean
  isExpanded: boolean
  activeTabId: string | null
}

export interface DesktopTabsContext {
  saveData: (key: string, value: any) => Promise<void>
  loadData: (key: string) => Promise<any>
  eventBus: any
}

// ===== 模块状态 =====
let ctx: DesktopTabsContext | null = null
let state: DesktopTabsState = {
  tabs: [],
  isVisible: false,
  isExpanded: false,
  activeTabId: null
}

let tabBar: HTMLElement | null = null
let injectedStyle: HTMLElement | null = null
let switchProtyleHandler: (() => void) | null = null
let dragCleanup: (() => void) | null = null
let themeModeUnsubscribe: (() => void) | null = null
let pinBtn: HTMLElement | null = null

// ===== 工具函数 =====
function generateId(): string {
  return 'dtab-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9)
}

function getTabColor(notebookId: string): string {
  let hash = 0
  for (let i = 0; i < notebookId.length; i++) {
    hash = ((hash << 5) - hash) + notebookId.charCodeAt(i)
    hash |= 0
  }
  return TAB_COLORS[Math.abs(hash) % TAB_COLORS.length]
}

function truncateTitle(title: string, maxLen = 20): string {
  if (!title) return '未命名'
  return title.length > maxLen ? title.substring(0, maxLen) + '...' : title
}

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

function getProtyleTitle(): string | undefined {
  const protyle = getActiveProtyle()
  if (!protyle) return undefined
  if (protyle.title?.editElement) {
    return protyle.title.editElement.textContent?.trim() || undefined
  }
  return undefined
}

// ===== Tab CRUD =====
function getActiveTab(): TabItem | null {
  return state.tabs.find(t => t.isActive) || null
}

function findTabByDocId(docId: string): TabItem | null {
  return state.tabs.find(t => t.docId === docId) || null
}

function sortTabs(): void {
  state.tabs.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1
    if (!a.isPinned && b.isPinned) return 1
    return a.createdAt - b.createdAt
  })
}

function addTab(docId: string, title: string, notebookId: string): TabItem {
  const existing = findTabByDocId(docId)
  if (existing) {
    existing.isActive = true
    existing.title = title || existing.title
    existing.notebookId = notebookId || existing.notebookId
    state.tabs.forEach(t => { if (t.id !== existing.id) t.isActive = false })
    state.activeTabId = existing.id
    return existing
  }

  // 超出上限移除最旧的非钉住、非活跃 Tab
  if (state.tabs.length >= MAX_TABS) {
    const oldest = state.tabs
      .filter(t => !t.isActive && !t.isPinned)
      .sort((a, b) => a.createdAt - b.createdAt)[0]
    if (oldest) {
      state.tabs = state.tabs.filter(t => t.id !== oldest.id)
    } else {
      showMessage('标签页已满：请先关闭未钉住的标签页', 2500, 'info')
      const active = getActiveTab()
      return active || {
        id: 'dtab-blocked',
        docId,
        title: title || '未命名',
        notebookId,
        isActive: false,
        isPinned: false,
        createdAt: Date.now()
      }
    }
  }

  const tab: TabItem = {
    id: generateId(),
    docId,
    title: title || '未命名',
    notebookId,
    isActive: true,
    isPinned: false,
    createdAt: Date.now()
  }

  state.tabs.forEach(t => { t.isActive = false })
  state.tabs.push(tab)
  state.activeTabId = tab.id
  return tab
}

function removeTab(tabId: string): TabItem[] {
  const tab = state.tabs.find(t => t.id === tabId)
  if (!tab) return state.tabs

  const wasActive = tab.isActive
  state.tabs = state.tabs.filter(t => t.id !== tabId)

  if (wasActive && state.tabs.length > 0) {
    const newest = state.tabs[state.tabs.length - 1]
    newest.isActive = true
    state.activeTabId = newest.id
    // 切换到新 Tab
    switchToTab(newest.id)
  } else if (state.tabs.length === 0) {
    state.activeTabId = null
  }

  return state.tabs
}

function togglePinTab(tabId: string): void {
  const tab = state.tabs.find(t => t.id === tabId)
  if (!tab) return
  tab.isPinned = !tab.isPinned
  sortTabs()
}

function updatePinButtonState(): void {
  if (!pinBtn) return
  const active = getActiveTab()
  pinBtn.classList.toggle('pinned', !!active?.isPinned)
  pinBtn.textContent = active?.isPinned ? '已钉住' : '钉住'
}

// ===== 文档切换 =====
async function switchToTab(tabId: string): Promise<void> {
  const tab = state.tabs.find(t => t.id === tabId)
  if (!tab) return

  // 使用思源 API 打开文档
  try {
    await siyuanOpenTab({
      app: pluginInstance?.app,
      doc: {
        id: tab.docId
      }
    })
  } catch (err) {
    console.error('[DesktopTabs] 打开文档失败:', err)
    showMessage('打开文档失败', 3000, 'error')
  }

  // 更新状态
  state.tabs.forEach(t => t.isActive = false)
  tab.isActive = true
  state.activeTabId = tabId
}

// ===== 处理文档切换事件 =====
function handleSwitchProtyle(): void {
  const docId = getCurrentDocId()
  if (!docId) return

  const notebookId = getCurrentNotebookId()
  const domTitle = getProtyleTitle()
  let dirty = false

  const existing = findTabByDocId(docId)

  if (existing) {
    const activeTab = getActiveTab()
    if (activeTab) activeTab.isActive = false
    existing.isActive = true
    existing.notebookId = notebookId
    state.activeTabId = existing.id
    if (domTitle && domTitle !== existing.title) {
      existing.title = domTitle
      dirty = true
    }
    dirty = true
  } else {
    addTab(docId, domTitle || '加载中...', notebookId)
    dirty = true
  }

  if (dirty) {
    renderTabList()
    updatePinButtonState()
    persistState()
  }
}

// ===== 持久化 =====
async function persistState(): Promise<void> {
  if (!ctx) return
  await ctx.saveData(PERSIST_KEY, {
    tabs: state.tabs.map(t => ({
      id: t.id,
      docId: t.docId,
      title: t.title,
      notebookId: t.notebookId,
      isActive: t.isActive,
      isPinned: t.isPinned,
      createdAt: t.createdAt
    })),
    isVisible: state.isVisible,
    isExpanded: state.isExpanded,
    activeTabId: state.activeTabId
  })
}

async function loadState(): Promise<void> {
  if (!ctx) return
  try {
    const saved = await ctx.loadData(PERSIST_KEY)
    if (saved) {
      state = {
        tabs: saved.tabs || [],
        isVisible: saved.isVisible ?? false,
        isExpanded: saved.isExpanded ?? false,
        activeTabId: saved.activeTabId || null
      }
    }
  } catch (err) {
    console.warn('[DesktopTabs] 加载状态失败:', err)
  }
}

// ===== DOM 构建 =====
function injectStyles(): void {
  if (injectedStyle) return
  const style = document.createElement('style')
  style.id = 'desktop-tabs-bar-style'
  style.textContent = `
    #desktop-tabs-bar {
      position: fixed;
      z-index: 5;
      display: flex;
      flex-direction: column;
      background: rgba(255,255,255,0.85);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.06);
      transition: width 0.25s cubic-bezier(0.32,0.72,0,1), padding 0.25s ease;
      max-height: 70vh;
      overflow: hidden;
      border: 0.5px solid rgba(0,0,0,0.08);
      min-width: 46px;
    }
    #desktop-tabs-bar.collapsed {
      width: 46px;
      padding: 4px 0;
    }
    #desktop-tabs-bar.expanded {
      width: 260px;
      padding: 4px 6px;
    }
    #desktop-tabs-list {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      scrollbar-width: none;
    }
    #desktop-tabs-list::-webkit-scrollbar {
      display: none;
    }
    .desktop-tab-item {
      display: flex;
      align-items: center;
      padding: 8px 6px;
      margin: 2px 0;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.15s ease;
      min-height: 36px;
      position: relative;
    }
    .desktop-tab-item:active {
      transform: scale(0.98);
    }
    .desktop-tab-item.active {
      background: rgba(0,122,255,0.08);
    }
    .desktop-tab-number {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      flex-shrink: 0;
      margin: 0 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      color: white;
      transition: all 0.2s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
    }
    .expanded .desktop-tab-number {
      width: 26px;
      height: 26px;
      margin: 0 8px 0 4px;
      border-radius: 8px;
      font-size: 13px;
    }
    .desktop-tab-title {
      flex: 1;
      font-size: 13px;
      font-weight: 500;
      color: #1c1c1e;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: none;
      padding: 0 6px;
      line-height: 1.3;
    }
    .expanded .desktop-tab-title {
      display: block;
    }
    .desktop-tab-close {
      display: none;
      width: 20px;
      height: 20px;
      border: none;
      background: rgba(0,0,0,0.05);
      color: #8e8e93;
      font-size: 14px;
      cursor: pointer;
      flex-shrink: 0;
      border-radius: 6px;
      align-items: center;
      justify-content: center;
      padding: 0;
      line-height: 1;
    }
    .expanded .desktop-tab-close {
      display: flex;
    }
    .desktop-tab-close:hover {
      background: rgba(0,0,0,0.08);
    }
    .desktop-tab-close:active {
      background: #ff3b30;
      color: white;
    }
    .desktop-tab-expand-handle {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      margin: 2px auto;
      cursor: pointer;
      color: #8e8e93;
      font-size: 14px;
      border-radius: 8px;
      transition: background 0.15s ease;
    }
    .desktop-tab-expand-handle:hover {
      background: rgba(0,0,0,0.04);
    }
    .expanded .desktop-tab-expand-handle {
      display: none;
    }
    .desktop-tab-collapse {
      display: none;
      align-items: center;
      justify-content: center;
      width: calc(100% - 12px);
      height: 26px;
      margin: 2px auto;
      border: none;
      background: transparent;
      color: #8e8e93;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      border-radius: 8px;
      transition: background 0.15s ease;
    }
    .expanded .desktop-tab-collapse {
      display: flex;
    }
    .desktop-tab-collapse:hover {
      background: rgba(0,0,0,0.04);
    }
    .desktop-tab-pin {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 24px;
      margin: 2px 4px;
      cursor: pointer;
      color: #8e8e93;
      font-size: 11px;
      font-weight: 500;
      border-radius: 6px;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .expanded .desktop-tab-pin {
      width: calc(100% - 12px);
      margin: 0 auto 2px;
    }
    .collapsed .desktop-tab-pin {
      font-size: 10px;
    }
    .desktop-tab-pin:hover {
      background: rgba(0,0,0,0.04);
    }
    .desktop-tab-pin.pinned {
      color: #007AFF;
      font-weight: 600;
    }
    html[data-theme-mode="dark"] #desktop-tabs-bar {
      background: rgba(30,30,30,0.85);
      border-color: rgba(255,255,255,0.1);
      box-shadow: 0 4px 24px rgba(0,0,0,0.3), 0 0 0 0.5px rgba(255,255,255,0.05);
    }
    html[data-theme-mode="dark"] .desktop-tab-item.active {
      background: rgba(10,132,255,0.15);
    }
    html[data-theme-mode="dark"] .desktop-tab-title {
      color: #f5f5f7;
    }
    html[data-theme-mode="dark"] .desktop-tab-close {
      background: rgba(255,255,255,0.08);
    }
    html[data-theme-mode="dark"] .desktop-tab-pin {
      color: #98989d;
    }
    html[data-theme-mode="dark"] .desktop-tab-pin.pinned {
      color: #0A84FF;
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

function renderTabList(): void {
  const listEl = tabBar?.querySelector('#desktop-tabs-list')
  if (!listEl) return

  listEl.innerHTML = ''

  state.tabs.forEach((tab, index) => {
    const item = document.createElement('div')
    item.className = 'desktop-tab-item' + (tab.isActive ? ' active' : '')
    item.dataset.tabId = tab.id

    const number = document.createElement('div')
    number.className = 'desktop-tab-number'
    number.textContent = String(index + 1)
    number.style.backgroundColor = getTabColor(tab.notebookId)
    number.style.opacity = '0.7'

    const title = document.createElement('div')
    title.className = 'desktop-tab-title'
    title.textContent = truncateTitle(tab.title)

    const closeBtn = document.createElement('button')
    closeBtn.className = 'desktop-tab-close'
    if (tab.isPinned) {
      closeBtn.style.visibility = 'hidden'
    }
    closeBtn.textContent = '×'
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      if (tab.isPinned) return
      removeTab(tab.id)
      renderTabList()
      persistState()
      if (state.tabs.length === 0) {
        removeTabBar()
        state.isVisible = false
      }
    })

    item.appendChild(number)
    item.appendChild(title)
    item.appendChild(closeBtn)

    // 点击切换 Tab
    item.addEventListener('click', () => {
      switchToTab(tab.id)
      renderTabList()
      updatePinButtonState()
    })

    // 右键钉住
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      togglePinTab(tab.id)
      renderTabList()
      updatePinButtonState()
      persistState()
    })

    listEl.appendChild(item)
  })
}

function createTabBar(): void {
  if (tabBar) return

  injectStyles()

  tabBar = document.createElement('div')
  tabBar.id = 'desktop-tabs-bar'
  tabBar.className = (state.isExpanded ? 'expanded' : 'collapsed')

  // 图钉按钮
  pinBtn = document.createElement('div')
  pinBtn.className = 'desktop-tab-pin'
  updatePinButtonState()
  pinBtn.addEventListener('click', () => {
    const tab = getActiveTab()
    if (!tab) {
      showMessage('请先打开一个文档', 1200, 'info')
      return
    }
    togglePinTab(tab.id)
    renderTabList()
    updatePinButtonState()
    persistState()
  })
  tabBar.appendChild(pinBtn)

  // Tab 列表
  const list = document.createElement('div')
  list.id = 'desktop-tabs-list'
  tabBar.appendChild(list)

  // 收缩按钮
  const collapseBtn = document.createElement('button')
  collapseBtn.className = 'desktop-tab-collapse'
  collapseBtn.textContent = '收起'
  collapseBtn.addEventListener('click', () => {
    state.isExpanded = !state.isExpanded
    tabBar.className = (state.isExpanded ? 'expanded' : 'collapsed')
    updatePinButtonState()
    persistState()
  })
  tabBar.appendChild(collapseBtn)

  // 收缩态的展开手柄
  const expandHandle = document.createElement('div')
  expandHandle.className = 'desktop-tab-expand-handle'
  expandHandle.textContent = '☰'
  expandHandle.addEventListener('click', () => {
    state.isExpanded = !state.isExpanded
    tabBar.className = (state.isExpanded ? 'expanded' : 'collapsed')
    updatePinButtonState()
    persistState()
  })
  tabBar.appendChild(expandHandle)

  renderTabList()
  document.body.appendChild(tabBar)

  // 恢复位置或使用默认位置
  const restored = restorePosition(tabBar)
  if (restored) {
    tabBar.style.right = 'auto'
    tabBar.style.top = 'auto'
    tabBar.style.transform = 'none'
  } else {
    // 默认位置：靠右居中
    tabBar.style.right = '20px'
    tabBar.style.top = '50%'
    tabBar.style.left = 'auto'
    tabBar.style.bottom = 'auto'
    tabBar.style.transform = 'translateY(-50%)'
  }

  // 启用拖拽
  dragCleanup = makeDraggable(tabBar, {
    handleSelector: undefined,
    boundary: 'window',
    onDragEnd: () => {
      persistState()
    }
  })
}

function removeTabBar(): void {
  if (dragCleanup) {
    dragCleanup()
    dragCleanup = null
  }

  if (tabBar) {
    tabBar.remove()
    tabBar = null
  }
  pinBtn = null
  removeStyles()
}

// ===== 公开 API =====
export async function init(context: DesktopTabsContext): Promise<void> {
  ctx = context

  if (!themeModeUnsubscribe) {
    themeModeUnsubscribe = observeSiYuanThemeMode(() => {
      if (tabBar) applyFloatPanelBackground(tabBar, undefined, 0.85)
    })
  }

  await loadState()

  // 如果之前可见，恢复 Tab 栏
  if (state.isVisible && state.tabs.length > 0) {
    createTabBar()
    applyFloatPanelBackground(tabBar, undefined, 0.85)
  }

  // 监听文档切换事件
  switchProtyleHandler = () => {
    handleSwitchProtyle()
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
    // 确保至少有一个 Tab
    if (state.tabs.length === 0) {
      const docId = getCurrentDocId()
      const notebookId = getCurrentNotebookId()
      const domTitle = getProtyleTitle()
      if (docId) {
        addTab(docId, domTitle || '加载中...', notebookId)
      }
    }

    createTabBar()
    applyFloatPanelBackground(tabBar, config.floatOpacity, 0.85)

    if (config.showNotification !== false) {
      showMessage('标签页已显示', 1500, 'info')
    }
  } else {
    removeTabBar()

    if (config.showNotification !== false) {
      showMessage('标签页已隐藏', 1500, 'info')
    }
  }

  persistState()
}

export function cleanup(): void {
  // 移除事件监听
  if (ctx && switchProtyleHandler) {
    ctx.eventBus.off('switch-protyle', switchProtyleHandler)
    ctx.eventBus.off('loaded-protyle-dynamic', switchProtyleHandler)
    switchProtyleHandler = null
  }

  // 移除 DOM
  removeTabBar()

  if (themeModeUnsubscribe) {
    themeModeUnsubscribe()
    themeModeUnsubscribe = null
  }

  // 重置状态
  ctx = null
  state = { tabs: [], isVisible: false, isExpanded: false, activeTabId: null }
}
