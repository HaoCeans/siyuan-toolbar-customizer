/**
 * 手机端标签页Tab模块
 * 功能：在手机端右侧显示竖向悬浮Tab栏，支持多文档快速切换
 */

import { fetchSyncPost, openMobileFileById, showMessage } from "siyuan";
import { isMobileDevice, pluginInstance } from "../toolbarManager";
import type { ButtonConfig } from "../toolbarManager";
import { applyFloatPanelBackground, observeSiYuanThemeMode } from "./floatPanelBackground";

// ===== 常量 =====
const MAX_TABS = 10
const PERSIST_KEY = 'mobileTabsState'
const SCROLL_SAVE_THROTTLE = 300
const SWITCH_DEBOUNCE = 200
const PERSIST_DEBOUNCE = 500

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
  scrollPosition: number
  isActive: boolean
  isPinned: boolean
  createdAt: number
}

interface MobileTabsState {
  tabs: TabItem[]
  isVisible: boolean
  isExpanded: boolean
  activeTabId: string | null
}

export interface MobileTabsContext {
  saveData: (key: string, value: any) => Promise<void>
  loadData: (key: string) => Promise<any>
  eventBus: any
  floatOpacity?: number
  /** 与对应鲸鱼按钮「滚动隐藏/显示」一致；init 恢复可见时必须带上，否则重载后检测不生效 */
  autoHideOnScroll?: boolean
  /** 最大可见标签数 (1~10)，超出后可滚动，默认 10 */
  maxVisibleTabs?: number
}

// ===== 模块状态 =====
let ctx: MobileTabsContext | null = null
let state: MobileTabsState = {
  tabs: [],
  isVisible: false,
  isExpanded: false,
  activeTabId: null
}

let tabBar: HTMLElement | null = null
let injectedStyle: HTMLElement | null = null
let switchProtyleHandler: (() => void) | null = null
let scrollSaveTimer: ReturnType<typeof setTimeout> | null = null
let contextMenuOverlay: HTMLElement | null = null
let longPressTimer: ReturnType<typeof setTimeout> | null = null
let titleRefreshTimer: ReturnType<typeof setInterval> | null = null
let pinBtnEl: HTMLElement | null = null

/** 最近一次应用到标签栏的透明度（用于思源内切换亮/暗后重算背景） */
let lastTabsFloatOpacity: number | undefined
let themeModeUnsubscribe: (() => void) | null = null

let boundScrollEl: HTMLElement | null = null
let scrollBindRetryTimer: ReturnType<typeof setInterval> | null = null
let scrollBindRetryCount = 0

// ===== 输入法/键盘弹出时自动隐藏 =====
let hiddenByKeyboard = false
let keyboardBaselineHeight: number | null = null
let vvResizeHandler: (() => void) | null = null
let focusInHandler: ((e: FocusEvent) => void) | null = null
let focusOutHandler: ((e: FocusEvent) => void) | null = null

// ===== 标题 DOM 变化监听（即时响应重命名）=====
let titleObserver: MutationObserver | null = null
let titleObserverTimer: ReturnType<typeof setTimeout> | null = null
let visibilityChangeHandler: (() => void) | null = null

// ===== 滚动隐藏/显示（向上滚动消失，下滑出现）=====
let hiddenByScroll = false
let autoHideOnScrollEnabled = false
let currentFloatOpacityForAutoHide: number | undefined = undefined
let lastScrollTopForAutoHide: number | null = null
let lastAutoHideToggleAt = 0

// ===== 最大可见标签数 =====
let currentMaxVisibleTabs: number = MAX_TABS

const SCROLL_HIDE_THRESHOLD_PX = 15
const SCROLL_TOGGLE_COOLDOWN_MS = 200
const SCROLL_FADE_MS = 160

function fadeOutAndRemoveTabBar(): void {
  if (!tabBar) {
    removeTabBar()
    return
  }
  const el = tabBar
  el.style.transition = `opacity ${SCROLL_FADE_MS}ms ease`
  el.style.opacity = '0'
  window.setTimeout(() => {
    // 避免期间被重新创建/替换
    if (tabBar === el) {
      removeTabBar()
    }
  }, SCROLL_FADE_MS)
}

function ensureTabBarVisibleWithFadeIn(): void {
  if (!tabBar) return
  const el = tabBar
  el.style.transition = `opacity ${SCROLL_FADE_MS}ms ease`
  el.style.opacity = '0'
  requestAnimationFrame(() => {
    if (tabBar === el) el.style.opacity = '1'
  })
}

function getMobileContentScrollElement(): HTMLElement | null {
  // 手机端真正滚动发生在 protyle.contentElement 内部
  const protyle = (window as any).siyuan?.mobile?.editor?.protyle
  return protyle?.contentElement || document.querySelector('.protyle-content')
}

/** 当前手机编辑器打开的文档根 ID（与 Tab 的 docId 对齐） */
function getMobileEditorRootDocId(): string | undefined {
  const protyle = (window as any).siyuan?.mobile?.editor?.protyle
  return protyle?.block?.rootID
}

/** 用思源 API 打开该 Tab 对应文档，并恢复滚动、绑定滚动监听 */
async function navigateEditorToTab(tab: TabItem): Promise<void> {
  // 先验证文档是否仍存在（同步删除后 docId 可能失效）
  try {
    const info: any = await fetchSyncPost('/api/block/getBlockInfo', { id: tab.docId })
    if (info?.code === 3 || !info?.data) {
      showMessage(`文档已被删除，已移除该标签页`, 2500, 'info')
      removeTab(tab.id)
      renderTabList()
      debouncedPersist()
      if (state.tabs.length === 0) {
        removeTabBar()
        state.isVisible = false
      }
      return
    }
  } catch { /* 验证失败不阻塞，尝试打开 */ }

  try {
    openMobileFileById(pluginInstance?.app, tab.docId)
  } catch (err) {
    console.error('[手机端标签页Tab] 打开文档失败:', err)
    showMessage('打开文档失败', 3000, 'error')
  }
  if (tab.scrollPosition > 0) {
    // 轮询等待文档内容加载完成后再恢复滚动位置（大文档加载可能超过 300ms）
    const targetPos = tab.scrollPosition
    let attempts = 0
    const tryRestore = () => {
      const scrollEl = getMobileContentScrollElement()
      if (scrollEl && scrollEl.scrollHeight > targetPos) {
        scrollEl.scrollTop = targetPos
      } else if (attempts < 10) {
        attempts++
        setTimeout(tryRestore, 200)
      }
    }
    setTimeout(tryRestore, 300)
  }
  ensureScrollListenerBound()
}

function bindScrollListener(): void {
  const el = getMobileContentScrollElement()
  if (!el) return

  if (boundScrollEl && boundScrollEl !== el) {
    boundScrollEl.removeEventListener('scroll', handleScroll as any)
    boundScrollEl = null
  }

  if (boundScrollEl === el) return
  boundScrollEl = el
  boundScrollEl.addEventListener('scroll', handleScroll as any, { passive: true })
}

function unbindScrollListener(): void {
  if (boundScrollEl) {
    boundScrollEl.removeEventListener('scroll', handleScroll as any)
    boundScrollEl = null
  }
  if (scrollBindRetryTimer) {
    clearInterval(scrollBindRetryTimer)
    scrollBindRetryTimer = null
  }
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

/** protyle 晚于插件 init 出现时，补绑滚动容器 */
function ensureScrollListenerBound(): void {
  bindScrollListener()
  if (!boundScrollEl) startScrollBindRetry()
  bindTitleObserver()
}

/** 标题变化时同步到活动标签页 */
function onTitleChange(text: string): void {
  const protyle = (window as any).siyuan?.mobile?.editor?.protyle
  const docId = protyle?.block?.rootID
  if (!text || !docId) return
  const activeTab = getActiveTab()
  if (activeTab && activeTab.docId === docId && activeTab.title !== text) {
    activeTab.title = text
    titleCache[docId] = text
    renderTabList()
    debouncedPersist()
  }
}

/** 监听标题变化，即时同步到活动标签页（兼容 titleShowTop 模式） */
function bindTitleObserver(): void {
  if (titleObserver) return
  const protyle = (window as any).siyuan?.mobile?.editor?.protyle

  // 桌面端 / titleShowTop:false：监听 editElement 的 DOM 变化
  const editEl = protyle?.title?.editElement as HTMLElement | undefined
  if (editEl) {
    titleObserver = new MutationObserver(() => {
      const text = editEl.textContent?.trim()
      if (text) onTitleChange(text)
    })
    titleObserver.observe(editEl, { childList: true, characterData: true, subtree: true })
    return
  }

  // 手机端 titleShowTop:true：监听 #toolbarName（<input>）的 input 事件
  // input.value 变化不触发 MutationObserver，必须用事件监听
  const toolbarName = document.getElementById("toolbarName") as HTMLInputElement | null
  if (toolbarName) {
    const handler = () => {
      const text = toolbarName.value?.trim()
      if (text) onTitleChange(text)
    }
    toolbarName.addEventListener("input", handler)
    // 用一个伪 observer 记录引用，cleanup 时统一移除
    titleObserver = {
      disconnect() { toolbarName.removeEventListener("input", handler) },
    } as unknown as MutationObserver
    return
  }

  // 二级 fallback：监听 #drag 元素的 DOM 变化
  const drag = document.getElementById("drag")
  if (drag) {
    titleObserver = new MutationObserver(() => {
      const text = (drag.getAttribute("title") || drag.textContent)?.trim()
      if (text) onTitleChange(text)
    })
    titleObserver.observe(drag, { childList: true, characterData: true, subtree: true, attributes: true })
    return
  }

  // 都没找到，延迟重试
  if (!titleObserverTimer) {
    titleObserverTimer = setTimeout(() => {
      titleObserverTimer = null
      bindTitleObserver()
    }, 500)
  }
}

function unbindTitleObserver(): void {
  if (titleObserver) {
    titleObserver.disconnect()
    titleObserver = null
  }
  if (titleObserverTimer) {
    clearTimeout(titleObserverTimer)
    titleObserverTimer = null
  }
}

/** 获取当前 protyle 的文档标题（兼容 titleShowTop 模式） */
function getProtyleTitle(): string | undefined {
  const protyle = (window as any).siyuan?.mobile?.editor?.protyle
  if (!protyle) return undefined
  // 桌面端 / titleShowTop:false：从 editElement 读取
  if (protyle.title?.editElement) {
    return protyle.title.editElement.textContent?.trim() || undefined
  }
  // 手机端 titleShowTop:true：标题在 #toolbarName（<input>）的 value 中
  const toolbarName = document.getElementById("toolbarName") as HTMLInputElement | null
  if (toolbarName?.value?.trim()) {
    return toolbarName.value.trim()
  }
  // 二级 fallback：#drag 元素的 title 属性
  const drag = document.getElementById("drag")
  const dragTitle = drag?.getAttribute("title")?.trim()
  if (dragTitle) return dragTitle
  return undefined
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

function hideForKeyboard(): void {
  if (!state.isVisible) return
  if (!tabBar) return
  hiddenByKeyboard = true
  stopTitleRefresh()
  removeTabBar()
}

function restoreAfterKeyboard(): void {
  if (!hiddenByKeyboard) return
  hiddenByKeyboard = false
  if (state.isVisible && state.tabs.length > 0 && !hiddenByScroll) {
    createTabBar()
    startTitleRefresh()
  }
}

// ===== 标题获取 =====
// 缓存 docId → title 的映射，避免重复 API 调用
const titleCache: Record<string, string> = {}

async function getDocTitle(docId: string): Promise<string> {
  if (!docId) return '未命名'

  // 优先使用缓存
  if (titleCache[docId]) return titleCache[docId]

  // 策略1：从当前编辑器的 protyle 读取（仅限当前文档）
  const protyle = (window as any).siyuan?.mobile?.editor?.protyle
  if (protyle?.block?.rootID === docId) {
    const title = getProtyleTitle()
    if (title) {
      titleCache[docId] = title
      return title
    }
  }

  // 策略2：轻量 API 获取（只返回块元数据，不加载文档内容）
  try {
    const response: any = await fetchSyncPost('/api/block/getBlockInfo', { id: docId })
    if (response?.code === 0 && response?.data?.rootTitle) {
      const title = response.data.rootTitle.trim()
      if (title) {
        titleCache[docId] = title
        return title
      }
    }
  } catch {}

  return '未命名'
}

// 更新当前文档 Tab 的标题（从 DOM 或 API），同时清除缓存让非活动标签下次也能获取最新标题
async function refreshActiveTabTitle(): Promise<void> {
  const protyle = (window as any).siyuan?.mobile?.editor?.protyle
  if (!protyle) return

  const docId = protyle.block?.rootID
  if (!docId) return

  const activeTab = getActiveTab()
  if (!activeTab || activeTab.docId !== docId) return

  // 优先从 DOM 读取（最实时，包含用户正在编辑的标题）
  const domTitle = getProtyleTitle()
  if (domTitle && domTitle !== activeTab.title) {
    activeTab.title = domTitle
    titleCache[docId] = domTitle
    renderTabList()
    debouncedPersist()
    return
  }
  if (domTitle) {
    titleCache[docId] = domTitle
    return
  }

  // DOM 读取失败时 fallback 到 API
  delete titleCache[docId]
  try {
    const response: any = await fetchSyncPost('/api/block/getBlockInfo', { id: docId })
    if (response?.code === 0 && response?.data?.rootTitle) {
      const apiTitle = response.data.rootTitle.trim()
      if (apiTitle && apiTitle !== activeTab.title) {
        activeTab.title = apiTitle
        titleCache[docId] = apiTitle
        renderTabList()
        debouncedPersist()
      }
    }
  } catch {}
}

// ===== 工具函数 =====
function generateId(): string {
  return 'mtab-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9)
}

function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  const debounced = ((...args: any[]) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { timer = null; fn(...args) }, delay)
  }) as T & { cancel: () => void }
  debounced.cancel = () => { if (timer) { clearTimeout(timer); timer = null } }
  return debounced
}

function getTabColor(notebookId: string): string {
  let hash = 0
  for (let i = 0; i < notebookId.length; i++) {
    hash = ((hash << 5) - hash) + notebookId.charCodeAt(i)
    hash |= 0
  }
  return TAB_COLORS[Math.abs(hash) % TAB_COLORS.length]
}

function truncateTitle(title: string, maxLen: number = 12): string {
  if (!title) return '未命名'
  return title.length > maxLen ? title.substring(0, maxLen) + '...' : title
}

// ===== Tab CRUD =====
function getActiveTab(): TabItem | null {
  return state.tabs.find(t => t.isActive) || null
}

function findTabByDocId(docId: string): TabItem | null {
  return state.tabs.find(t => t.docId === docId) || null
}

// 钉住的排前面，其余按创建时间排序
function sortTabs(): void {
  state.tabs.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1
    if (!a.isPinned && b.isPinned) return 1
    return a.createdAt - b.createdAt
  })
}

function togglePinTab(tabId: string): void {
  const tab = state.tabs.find(t => t.id === tabId)
  if (!tab) return
  tab.isPinned = !tab.isPinned
  sortTabs()
  renderTabList()
  debouncedPersist()
}

function addTab(docId: string, title: string, notebookId: string, scrollPosition: number = 0): TabItem {
  const existing = findTabByDocId(docId)
  if (existing) {
    existing.isActive = true
    existing.scrollPosition = scrollPosition
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
      // 全部都是活跃/钉住的 Tab，无法自动挤掉任何一个
      showMessage('标签页已满：请先关闭未钉住的标签页，或取消钉住后再打开新文档', 2500, 'info')
      const active = getActiveTab()
      return active || {
        id: 'mtab-blocked',
        docId,
        title: title || '未命名',
        notebookId,
        scrollPosition,
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
    scrollPosition,
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
  // 清理已关闭标签页的标题缓存
  delete titleCache[tab.docId]
  state.tabs = state.tabs.filter(t => t.id !== tabId)

  if (wasActive && state.tabs.length > 0) {
    // 切换到最近的 Tab，并立即打开对应文档（否则仅剩 1 个 Tab 时 isActive 已为 true，点击不会再触发 switchToTab）
    const newest = state.tabs[state.tabs.length - 1]
    newest.isActive = true
    state.activeTabId = newest.id
    navigateEditorToTab(newest)
    debouncedPersist()
  } else if (state.tabs.length === 0) {
    state.activeTabId = null
  }

  return state.tabs
}

function closeOtherTabs(keepTabId: string): TabItem[] {
  state.tabs = state.tabs.filter(t => t.id === keepTabId)
  state.tabs.forEach(t => { t.isActive = t.id === keepTabId })
  state.activeTabId = keepTabId
  const kept = state.tabs[0]
  if (kept) {
    navigateEditorToTab(kept)
    debouncedPersist()
  }
  return state.tabs
}

function closeAllTabs(): TabItem[] {
  state.tabs = []
  state.activeTabId = null
  return state.tabs
}

function updatePinButtonUI(): void {
  if (!pinBtnEl) return
  const active = getActiveTab()
  const pinned = !!active?.isPinned
  pinBtnEl.classList.toggle('pinned', pinned)
  pinBtnEl.textContent = pinned ? '已钉住' : '钉住'
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
      scrollPosition: t.scrollPosition,
      isActive: t.isActive,
      isPinned: t.isPinned,
      createdAt: t.createdAt
    })),
    isVisible: state.isVisible,
    isExpanded: state.isExpanded,
    activeTabId: state.activeTabId
  })
}

const debouncedPersist = debounce(persistState, PERSIST_DEBOUNCE)

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
    console.warn('[手机端标签页Tab] 加载状态失败:', err)
  }
}

// ===== 文档切换 =====
async function switchToTab(tabId: string): Promise<void> {
  const tab = state.tabs.find(t => t.id === tabId)
  if (!tab) return
  // 仅当「已是活动 Tab 且编辑器正在显示该文档」时跳过；否则须重新打开（例如删到只剩 1 个 Tab 后状态与编辑器不一致）
  const editorDocId = getMobileEditorRootDocId()
  if (tab.isActive && editorDocId === tab.docId) return

  // 保存当前 Tab 的滚动位置（若状态与编辑器不一致，勿把当前视图的滚动误记到目标 Tab 上）
  const currentTab = getActiveTab()
  if (currentTab) {
    const scrollEl = getMobileContentScrollElement()
    if (scrollEl) {
      if (currentTab.id !== tab.id) {
        currentTab.scrollPosition = scrollEl.scrollTop
      } else if (editorDocId && editorDocId !== tab.docId) {
        const tabMatchEditor = state.tabs.find(t => t.docId === editorDocId)
        if (tabMatchEditor) tabMatchEditor.scrollPosition = scrollEl.scrollTop
      }
    }
    currentTab.isActive = false
  }

  // 激活目标 Tab
  tab.isActive = true
  state.activeTabId = tabId

  // 如果标题是"加载中..."或"未命名"，异步获取真实标题
  if (tab.title === '加载中...' || tab.title === '未命名') {
    getDocTitle(tab.docId).then(title => {
      if (title !== '未命名') {
        tab.title = title
        renderTabList()
      }
    })
  }

  navigateEditorToTab(tab)

  renderTabList()
  updatePinButtonUI()
  debouncedPersist()
}

// ===== 事件处理 =====
const debouncedSwitchProtyle = debounce(() => {
  handleSwitchProtyle()
}, SWITCH_DEBOUNCE)

function handleSwitchProtyle(): void {
  const protyle = (window as any).siyuan?.mobile?.editor?.protyle
  if (!protyle) return

  const docId = protyle.block?.rootID
  if (!docId) return

  const activeTab = getActiveTab()
  if (activeTab && activeTab.docId === docId) return

  const notebookId = protyle.notebookId || ''
  let dirty = false

  const existing = findTabByDocId(docId)
  const domTitle = getProtyleTitle()

  if (existing) {
    if (activeTab) activeTab.isActive = false
    existing.isActive = true
    existing.notebookId = notebookId
    state.activeTabId = existing.id
    if (domTitle && domTitle !== existing.title) {
      existing.title = domTitle
      titleCache[docId] = domTitle
      dirty = true
    }
    dirty = true // 活动标签变了，需要持久化
  } else {
    addTab(docId, domTitle || '加载中...', notebookId, 0)
    dirty = true
    if (!domTitle) {
      getDocTitle(docId).then(title => {
        if (title !== '未命名' && title !== '加载中...') {
          const tab = findTabByDocId(docId)
          if (tab) {
            tab.title = title
            renderTabList()
            debouncedPersist()
          }
        }
      })
    }
  }

  renderTabList()
  updatePinButtonUI()
  if (dirty) debouncedPersist()

  // 切文档后，重置滚动方向基准，避免把上一个文档的 scrollTop 差值带入判断
  const scrollEl = getMobileContentScrollElement()
  lastScrollTopForAutoHide = scrollEl?.scrollTop ?? null
  lastAutoHideToggleAt = 0

  if (state.isVisible) {
    ensureScrollListenerBound()
  }
}

function handleScroll(): void {
  // ===== 滚动隐藏/显示（向上滚动消失，下滑出现）=====
  if (autoHideOnScrollEnabled && state.isVisible && !hiddenByKeyboard) {
    const scrollEl = getMobileContentScrollElement()
    if (scrollEl) {
      const now = Date.now()
      const st = scrollEl.scrollTop

      if (lastScrollTopForAutoHide == null) {
        lastScrollTopForAutoHide = st
      } else {
        const delta = st - lastScrollTopForAutoHide
        lastScrollTopForAutoHide = st

        if (now - lastAutoHideToggleAt > SCROLL_TOGGLE_COOLDOWN_MS) {
          // scrollTop 增加：内容向上滚（你说的“向上滚动”）=> hide
          // scrollTop 减少：内容向下滚（你说的“下滑”）=> show
          if (!hiddenByScroll && delta > SCROLL_HIDE_THRESHOLD_PX) {
            hiddenByScroll = true
            lastAutoHideToggleAt = now
            fadeOutAndRemoveTabBar()
            stopTitleRefresh()
          } else if (hiddenByScroll && delta < -SCROLL_HIDE_THRESHOLD_PX) {
            hiddenByScroll = false
            lastAutoHideToggleAt = now
            if (state.tabs.length > 0) {
              createTabBar()
              applyOpacity(tabBar, currentFloatOpacityForAutoHide)
              ensureTabBarVisibleWithFadeIn()
              startTitleRefresh()
            }
          }
        }
      }
    }
  }

  // 立即捕获当前 tab 和滚动位置，避免 setTimeout 期间 protyle 切换导致写错 tab
  const activeTab = getActiveTab()
  if (activeTab) {
    const scrollEl = getMobileContentScrollElement()
    if (scrollEl) {
      activeTab.scrollPosition = scrollEl.scrollTop
    }
  }
  // 仅对持久化做节流
  if (scrollSaveTimer) clearTimeout(scrollSaveTimer)
  scrollSaveTimer = setTimeout(() => { debouncedPersist() }, SCROLL_SAVE_THROTTLE)
}

// ===== DOM 构建 =====
function applyOpacity(el: HTMLElement | null, opacity: number | undefined): void {
  lastTabsFloatOpacity = opacity
  applyFloatPanelBackground(el, opacity, 0.72)
}

function refreshTabsBarFloatBackground(): void {
  if (!tabBar || !state.isVisible) return
  applyFloatPanelBackground(tabBar, lastTabsFloatOpacity, 0.72)
}

function injectStyles(): void {
  if (injectedStyle) return
  const style = document.createElement('style')
  style.id = 'mobile-tabs-bar-style'
  style.textContent = `
    #mobile-tabs-bar {
      position: fixed;
      right: 6px;
      top: 50%;
      transform: translateY(-50%);
      /* 与主工具栏同层级；仍低于扩展工具栏(1000+) */
      z-index: 5;
      display: flex;
      flex-direction: column;
      background: rgba(255,255,255,0.72);
      border-radius: 20px;
      box-shadow: 0 2px 20px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04);
      transition: width 0.3s cubic-bezier(0.32,0.72,0,1), padding 0.3s cubic-bezier(0.32,0.72,0,1), top 0.3s ease, transform 0.3s ease, border-radius 0.3s ease, max-height 0.3s ease;
      /* 10 个标签页时尽量不滚动：适当提高高度上限 */
      max-height: 85vh;
      overflow: hidden;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      border: 0.5px solid rgba(0,0,0,0.08);
    }
    #mobile-tabs-bar.collapsed {
      width: 46px;
      padding: 6px 0;
    }
    #mobile-tabs-bar.expanded {
      width: 200px;
      padding: 6px;
    }
    #mobile-tabs-list {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      scrollbar-width: none;
    }
    #mobile-tabs-list::-webkit-scrollbar {
      display: none;
    }
    .mobile-tab-item {
      display: flex;
      align-items: center;
      padding: 7px 8px;
      margin: 2px 0;
      border-radius: 12px;
      cursor: pointer;
      transition: background 0.18s ease, transform 0.15s ease;
      min-height: 38px;
      position: relative;
    }
    /* iOS 风格：钉住标签用“右侧短竖条 + 轻微底色”，不改数字徽章 */
    .mobile-tab-item.pinned {
      background: rgba(0,122,255,0.03);
    }
    .mobile-tab-item.pinned::before {
      content: '';
      position: absolute;
      right: 4px;
      top: 20px;
      bottom: 20px;
      width: 4px;
      border-radius: 2px;
      background: rgba(0,122,255,0.9);
      opacity: 0.9;
    }
    .mobile-tab-item:active {
      transform: scale(0.96);
    }
    .mobile-tab-item.active {
      background: rgba(0,122,255,0.05);
    }
    .mobile-tab-number {
      width: 26px;
      height: 26px;
      border-radius: 8px;
      flex-shrink: 0;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
      color: white;
      letter-spacing: -0.3px;
      transition: all 0.25s cubic-bezier(0.32,0.72,0,1);
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif;
    }
    .expanded .mobile-tab-number {
      width: 28px;
      height: 28px;
      margin: 0 8px 0 0;
      border-radius: 8px;
      font-size: 14px;
    }
    .mobile-tab-title {
      flex: 1;
      font-size: 14px;
      font-weight: 500;
      color: #1c1c1e;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: none;
      padding: 0 6px;
      letter-spacing: -0.2px;
      line-height: 1.3;
    }
    .expanded .mobile-tab-title {
      display: block;
    }
    .mobile-tab-close {
      display: none;
      width: 22px;
      height: 22px;
      border: none;
      background: rgba(0,0,0,0.06);
      color: #8e8e93;
      font-size: 15px;
      cursor: pointer;
      flex-shrink: 0;
      border-radius: 7px;
      align-items: center;
      justify-content: center;
      padding: 0;
      line-height: 1;
      font-weight: 300;
      transition: background 0.15s ease;
    }
    .expanded .mobile-tab-close {
      display: flex;
    }
    .mobile-tab-close:active {
      background: #ff3b30;
      color: white;
    }
    /* 收缩按钮 */
    .mobile-tab-collapse {
      display: none;
      align-items: center;
      justify-content: center;
      width: calc(100% - 12px);
      height: 30px;
      margin: 4px auto 2px;
      border: none;
      background: transparent;
      color: #8e8e93;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      border-radius: 10px;
      transition: background 0.15s ease;
      letter-spacing: -0.1px;
    }
    .expanded .mobile-tab-collapse {
      display: flex;
    }
    .mobile-tab-collapse:active {
      background: rgba(0,0,0,0.04);
    }
    /* 图钉按钮 */
    .mobile-tab-pin {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 28px;
      margin: 2px 6px;
      cursor: pointer;
      color: #8e8e93;
      font-size: 12px;
      font-weight: 500;
      border-radius: 8px;
      transition: background 0.15s ease, color 0.15s ease;
      letter-spacing: -0.1px;
    }
    .expanded .mobile-tab-pin {
      width: calc(100% - 12px);
      margin: 0 auto 2px;
    }
    .collapsed .mobile-tab-pin {
      font-size: 10px;
      margin: 0 6px 2px;
    }
    .mobile-tab-pin:active {
      background: rgba(0,0,0,0.03);
    }
    .mobile-tab-pin.pinned {
      color: #007AFF;
      font-weight: 600;
    }
    html[data-theme-mode="dark"] .mobile-tab-pin {
      color: #98989d;
    }
    html[data-theme-mode="dark"] .mobile-tab-pin.pinned {
      color: #0A84FF;
    }
    html[data-theme-mode="dark"] .mobile-tab-pin:active {
      background: rgba(255,255,255,0.08);
    }
    /* 收缩态：点击展开的手柄区域 */
    .mobile-tab-expand-handle {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      margin: 0 auto;
      cursor: pointer;
      color: #8e8e93;
      font-size: 16px;
      border-radius: 10px;
      transition: background 0.15s ease;
    }
    .mobile-tab-expand-handle:active {
      background: rgba(0,0,0,0.03);
    }
    .expanded .mobile-tab-expand-handle {
      display: none;
    }
    /* 右键菜单 - Apple 风格 */
    #mobile-tabs-context-menu {
      position: fixed;
      /* 菜单需高于 tabs-bar(5)，但仍低于扩展工具栏(1000+) */
      z-index: 6;
      background: rgba(255,255,255,0.85);
      backdrop-filter: saturate(180%) blur(20px);
      -webkit-backdrop-filter: saturate(180%) blur(20px);
      border-radius: 14px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.06);
      padding: 6px;
      min-width: 170px;
      overflow: hidden;
    }
    .mobile-tabs-menu-item {
      display: flex;
      align-items: center;
      padding: 10px 14px;
      font-size: 15px;
      font-weight: 400;
      color: #1c1c1e;
      cursor: pointer;
      white-space: nowrap;
      border-radius: 10px;
      transition: background 0.12s ease;
      letter-spacing: -0.2px;
    }
    .mobile-tabs-menu-item:active {
      background: rgba(0,0,0,0.06);
    }
    .mobile-tabs-menu-item.danger {
      color: #ff3b30;
      font-weight: 500;
    }
    /* 暗黑模式适配 */
    html[data-theme-mode="dark"] #mobile-tabs-bar,
    #mobile-tabs-bar.dark {
      background: rgba(0,0,0,0.72);
      border-color: rgba(255,255,255,0.08);
      box-shadow: 0 2px 20px rgba(0,0,0,0.3), 0 0 0 0.5px rgba(255,255,255,0.06);
    }
    html[data-theme-mode="dark"] .mobile-tab-item.active {
      background: rgba(10,132,255,0.18);
    }
    html[data-theme-mode="dark"] .mobile-tab-item.pinned {
      background: rgba(10,132,255,0.10);
    }
    html[data-theme-mode="dark"] .mobile-tab-item.pinned::before {
      background: rgba(10,132,255,0.95);
    }
    html[data-theme-mode="dark"] .mobile-tab-title {
      color: #f5f5f7;
    }
    html[data-theme-mode="dark"] .mobile-tab-close {
      background: rgba(255,255,255,0.08);
      color: #8e8e93;
    }
    html[data-theme-mode="dark"] .mobile-tab-close:active {
      background: #ff453a;
      color: white;
    }
    html[data-theme-mode="dark"] .mobile-tab-collapse {
      background: rgba(255,255,255,0.06);
      color: #98989d;
    }
    html[data-theme-mode="dark"] .mobile-tab-collapse:active {
      background: rgba(255,255,255,0.1);
    }
    html[data-theme-mode="dark"] .mobile-tab-expand-handle {
      color: #98989d;
    }
    html[data-theme-mode="dark"] .mobile-tab-expand-handle:active {
      background: rgba(255,255,255,0.08);
    }
    html[data-theme-mode="dark"] #mobile-tabs-context-menu {
      background: rgba(0,0,0,0.85);
      border-color: rgba(255,255,255,0.08);
      box-shadow: 0 8px 40px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.08);
    }
    html[data-theme-mode="dark"] .mobile-tabs-menu-item {
      color: #f5f5f7;
    }
    html[data-theme-mode="dark"] .mobile-tabs-menu-item:active {
      background: rgba(255,255,255,0.08);
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
  const listEl = tabBar?.querySelector('#mobile-tabs-list')
  if (!listEl) return

  listEl.innerHTML = ''

  state.tabs.forEach((tab, index) => {
    const item = document.createElement('div')
    item.className = 'mobile-tab-item' + (tab.isActive ? ' active' : '') + (tab.isPinned ? ' pinned' : '')
    item.dataset.tabId = tab.id

    const number = document.createElement('div')
    number.className = 'mobile-tab-number'
    number.textContent = String(index + 1)
    // 背景仍跟随笔记本颜色；钉住仅通过“更精致的描边”提示
    number.style.backgroundColor = getTabColor(tab.notebookId)
    number.style.opacity = '0.65'

    const shadows: string[] = []
    if (tab.isActive) {
      shadows.push('0 0 0 2px rgba(255,255,255,0.9)')
      shadows.push('0 0 0 3.5px rgba(0,122,255,0.5)')
    }
    if (shadows.length > 0) {
      number.style.boxShadow = shadows.join(', ')
    }

    const title = document.createElement('div')
    title.className = 'mobile-tab-title'
    title.textContent = truncateTitle(tab.title)

    const closeBtn = document.createElement('button')
    closeBtn.className = 'mobile-tab-close'
    if (tab.isPinned) {
      closeBtn.style.visibility = 'hidden'
    }
    closeBtn.textContent = '×'
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      if (tab.isPinned) return
      removeTab(tab.id)
      renderTabList()
      debouncedPersist()
      if (state.tabs.length === 0) {
        removeTabBar()
        state.isVisible = false
      }
    })

    // 长按事件
    const handleTouchStart = () => {
      longPressTimer = setTimeout(() => {
        longPressTimer = null
        showContextMenu(tab.id, item)
      }, 500)
    }
    const handleTouchEnd = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer)
        longPressTimer = null
      }
    }
    const handleTouchMove = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer)
        longPressTimer = null
      }
    }

    item.addEventListener('touchstart', handleTouchStart, { passive: true })
    item.addEventListener('touchend', handleTouchEnd, { passive: true })
    item.addEventListener('touchmove', handleTouchMove, { passive: true })

    // 点击切换 Tab
    item.addEventListener('click', () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer)
        longPressTimer = null
      }
      switchToTab(tab.id)
    })

    item.appendChild(number)
    item.appendChild(title)
    item.appendChild(closeBtn)
    listEl.appendChild(item)
  })
}
/** 渲染后动态测量 tab 项高度，设置列表最大可见高度 */
function applyMaxVisibleTabs(): void {
  const list = tabBar?.querySelector('#mobile-tabs-list') as HTMLElement | null
  if (!list || currentMaxVisibleTabs >= MAX_TABS) return

  const firstItem = list.querySelector('.mobile-tab-item') as HTMLElement | null
  if (firstItem) {
    const style = window.getComputedStyle(firstItem)
    const itemH = firstItem.offsetHeight
      + parseFloat(style.marginTop)
      + parseFloat(style.marginBottom)
    list.style.maxHeight = Math.ceil(currentMaxVisibleTabs * itemH) + 'px'
  }
  list.style.overflowY = 'auto'
}

function createTabBar(): void {
  if (tabBar) return

  injectStyles()

  tabBar = document.createElement('div')
  tabBar.id = 'mobile-tabs-bar'
  tabBar.className = (state.isExpanded ? 'expanded' : 'collapsed')

  // 图钉按钮（放在顶部）：钉住“当前标签页”，不是钉住整个悬浮窗
  const pinBtn = document.createElement('div')
  pinBtn.className = 'mobile-tab-pin'
  pinBtnEl = pinBtn
  updatePinButtonUI()
  pinBtn.addEventListener('click', () => {
    const active = getActiveTab()
    if (!active) {
      showMessage('请先打开一个文档', 1200, 'info')
      return
    }
    togglePinTab(active.id)
    updatePinButtonUI()
    debouncedPersist()
    showMessage(active.isPinned ? '已钉住该标签页（将置顶且不会被挤掉）' : '已取消钉住该标签页', 1200, 'info')
  })
  tabBar.appendChild(pinBtn)

  // Tab 列表
  const list = document.createElement('div')
  list.id = 'mobile-tabs-list'
  tabBar.appendChild(list)

  // 收缩按钮
  const collapseBtn = document.createElement('button')
  collapseBtn.className = 'mobile-tab-collapse'
  collapseBtn.textContent = '收起'
  collapseBtn.addEventListener('click', () => {
    toggleExpand()
  })
  tabBar.appendChild(collapseBtn)

  // 收缩态的展开手柄
  const expandHandle = document.createElement('div')
  expandHandle.className = 'mobile-tab-expand-handle'
  expandHandle.textContent = '☰'
  expandHandle.addEventListener('click', () => {
    toggleExpand()
  })
  tabBar.appendChild(expandHandle)

  renderTabList()
  updatePinButtonUI()
  document.body.appendChild(tabBar)

  // 渲染并挂载到 DOM 后，动态测量实际 tab 高度再设 max-height
  applyMaxVisibleTabs()
}

function removeTabBar(): void {
  if (tabBar) {
    tabBar.remove()
    tabBar = null
  }
  pinBtnEl = null
  dismissContextMenu()
  removeStyles()
}

function toggleExpand(): void {
  if (!tabBar) return
  state.isExpanded = !state.isExpanded
  tabBar.className = (state.isExpanded ? 'expanded' : 'collapsed')
  debouncedPersist()
}

// ===== 右键菜单 =====
function showContextMenu(tabId: string, anchorElement: HTMLElement): void {
  dismissContextMenu()

  const overlay = document.createElement('div')
  overlay.id = 'mobile-tabs-context-menu'

  const rect = anchorElement.getBoundingClientRect()

  const items = [
    { label: '关闭此标签', action: () => { removeTab(tabId); renderTabList(); debouncedPersist(); if (state.tabs.length === 0) { removeTabBar(); state.isVisible = false } } },
    { label: '关闭其他标签', action: () => { closeOtherTabs(tabId); renderTabList(); debouncedPersist() } },
    { label: '关闭所有标签', action: () => { closeAllTabs(); renderTabList(); debouncedPersist(); removeTabBar(); state.isVisible = false }, danger: true }
  ]

  items.forEach(item => {
    const menuItem = document.createElement('div')
    menuItem.className = 'mobile-tabs-menu-item' + (item.danger ? ' danger' : '')
    menuItem.textContent = item.label
    menuItem.addEventListener('click', (e) => {
      e.stopPropagation()
      item.action()
      dismissContextMenu()
    })
    overlay.appendChild(menuItem)
  })

  // 定位菜单
  const menuWidth = 140
  const menuHeight = items.length * 40 + 8
  let left = rect.left - menuWidth - 8
  let top = rect.top

  if (left < 8) left = rect.right + 8
  if (top + menuHeight > window.innerHeight - 8) {
    top = window.innerHeight - menuHeight - 8
  }

  overlay.style.left = left + 'px'
  overlay.style.top = top + 'px'

  document.body.appendChild(overlay)
  contextMenuOverlay = overlay

  // 点击其他区域关闭
  setTimeout(() => {
    document.addEventListener('touchstart', dismissContextMenu, { once: true })
    document.addEventListener('click', dismissContextMenu, { once: true })
  }, 50)
}

function dismissContextMenu(): void {
  if (contextMenuOverlay) {
    contextMenuOverlay.remove()
    contextMenuOverlay = null
  }
}

function stopTitleRefresh(): void {
  if (titleRefreshTimer) {
    clearInterval(titleRefreshTimer)
    titleRefreshTimer = null
  }
}

function startTitleRefresh(): void {
  if (titleRefreshTimer) return
  titleRefreshTimer = setInterval(() => {
    if (state.isVisible && state.tabs.length > 0 && !document.hidden) {
      refreshActiveTabTitle()
    }
  }, 30000)
}

// ===== 公开 API =====
export async function init(context: MobileTabsContext): Promise<void> {
  ctx = context

  if (!themeModeUnsubscribe) {
    themeModeUnsubscribe = observeSiYuanThemeMode(() => {
      refreshTabsBarFloatBackground()
    })
  }

  await loadState()

  autoHideOnScrollEnabled = !!context.autoHideOnScroll
  currentFloatOpacityForAutoHide = context.floatOpacity
  currentMaxVisibleTabs = Math.max(1, Math.min(MAX_TABS, context.maxVisibleTabs ?? MAX_TABS))
  hiddenByScroll = false
  lastScrollTopForAutoHide = null
  lastAutoHideToggleAt = 0

  // 如果之前可见，恢复 Tab 栏
  if (state.isVisible && state.tabs.length > 0) {
    createTabBar()
    applyOpacity(tabBar, context.floatOpacity)
    ensureScrollListenerBound()
    startTitleRefresh()
  }

  // 监听文档切换事件
  switchProtyleHandler = debouncedSwitchProtyle
  context.eventBus.on('switch-protyle', switchProtyleHandler)
  context.eventBus.on('loaded-protyle-dynamic', switchProtyleHandler)

  // 仅在面板可见时才需要 scroll 监听（隐藏时不保存滚动位置/不做滚动隐藏）

  // 交互监听仅在 Tab 栏可见时注册，避免隐藏状态下无谓开销
  if (state.isVisible) {
    keyboardBaselineHeight = getViewportHeight()
    vvResizeHandler = () => {
      if (!isMobileDevice()) return
      const vh = getViewportHeight()
      if (keyboardBaselineHeight == null) keyboardBaselineHeight = vh

      // 非输入态：更新基线（旋转/分屏等）
      if (!isTextInputTarget(document.activeElement)) {
        keyboardBaselineHeight = Math.max(keyboardBaselineHeight, vh)
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
      const target = e.target as Element | null
      if (isTextInputTarget(target)) {
        keyboardBaselineHeight = Math.max(keyboardBaselineHeight || 0, getViewportHeight())
        hideForKeyboard()
      }
    }
    focusOutHandler = (e: FocusEvent) => {
      if (!isMobileDevice()) return
      const target = e.target as Element | null
      if (!isTextInputTarget(target)) return
      setTimeout(() => {
        if (!isTextInputTarget(document.activeElement)) {
          keyboardBaselineHeight = Math.max(keyboardBaselineHeight || 0, getViewportHeight())
          restoreAfterKeyboard()
        }
      }, 200)
    }
    document.addEventListener('focusin', focusInHandler, true)
    document.addEventListener('focusout', focusOutHandler, true)

    visibilityChangeHandler = () => {
      if (document.hidden) {
        stopTitleRefresh()
      } else if (state.isVisible) {
        startTitleRefresh()
      }
    }
    document.addEventListener('visibilitychange', visibilityChangeHandler)
  }

  // 兜底：插件重载后 protyle 可能已就绪但 switch-protyle 事件已错过，
  // 主动同步一次当前编辑器文档到标签页
  if (state.isVisible) {
    setTimeout(() => { handleSwitchProtyle() }, 100)
  }
}

export function toggleVisibility(config: ButtonConfig): void {
  if (!isMobileDevice()) {
    showMessage('此功能仅支持手机端', 2000, 'info')
    return
  }

  state.isVisible = !state.isVisible

  if (state.isVisible) {
    // 更新滚动隐藏开关配置
    autoHideOnScrollEnabled = !!config.autoHideOnScroll
    currentFloatOpacityForAutoHide = config.floatOpacity
    currentMaxVisibleTabs = Math.max(1, Math.min(MAX_TABS, config.maxVisibleTabs ?? MAX_TABS))
    hiddenByScroll = false
    lastScrollTopForAutoHide = null

    // 确保至少有一个 Tab
    if (state.tabs.length === 0) {
      const protyle = (window as any).siyuan?.mobile?.editor?.protyle
      if (protyle) {
        const docId = protyle.block?.rootID
        const notebookId = protyle.notebookId || ''
        if (docId) {
          const domTitle = getProtyleTitle()
          addTab(docId, domTitle || '加载中...', notebookId, 0)
          if (!domTitle) {
            getDocTitle(docId).then(title => {
              const tab = findTabByDocId(docId)
              if (tab && title !== '未命名') {
                tab.title = title
                renderTabList()
                debouncedPersist()
              }
            })
          }
        }
      }
    }

    createTabBar()
    applyOpacity(tabBar, config.floatOpacity)
    startTitleRefresh()
    ensureScrollListenerBound()

    if (!vvResizeHandler) {
      keyboardBaselineHeight = getViewportHeight()
      vvResizeHandler = () => {
        if (!isMobileDevice()) return
        const vh = getViewportHeight()
        if (keyboardBaselineHeight == null) keyboardBaselineHeight = vh

        // 非输入态：更新基线（旋转/分屏等）
        if (!isTextInputTarget(document.activeElement)) {
          keyboardBaselineHeight = Math.max(keyboardBaselineHeight, vh)
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
        const target = e.target as Element | null
        if (isTextInputTarget(target)) {
          keyboardBaselineHeight = Math.max(keyboardBaselineHeight || 0, getViewportHeight())
          hideForKeyboard()
        }
      }
      focusOutHandler = (e: FocusEvent) => {
        if (!isMobileDevice()) return
        const target = e.target as Element | null
        if (!isTextInputTarget(target)) return
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

    if (!visibilityChangeHandler) {
      visibilityChangeHandler = () => {
        if (document.hidden) {
          stopTitleRefresh()
        } else if (state.isVisible) {
          startTitleRefresh()
        }
      }
      document.addEventListener('visibilitychange', visibilityChangeHandler)
    }

    if (config.showNotification !== false) {
      showMessage('标签页已显示', 1500, 'info')
    }
  } else {
    // 隐藏前保存滚动位置
    const activeTab = getActiveTab()
    if (activeTab) {
      const scrollEl = getMobileContentScrollElement()
      if (scrollEl) {
        activeTab.scrollPosition = scrollEl.scrollTop
      }
    }

    removeTabBar()
    stopTitleRefresh()
    unbindScrollListener()
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
    if (visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', visibilityChangeHandler)
      visibilityChangeHandler = null
    }

    if (config.showNotification !== false) {
      showMessage('标签页已隐藏', 1500, 'info')
    }

    // 关闭滚动隐藏状态
    autoHideOnScrollEnabled = false
    hiddenByScroll = false
    lastScrollTopForAutoHide = null
    currentFloatOpacityForAutoHide = undefined
  }

  debouncedPersist()
}

/** 思源同步覆盖存储后调用，从磁盘重新加载状态并刷新 UI */
/** 运行时更新最大可见标签数（设置面板实时生效） */
export function updateMaxVisibleTabs(count: number): void {
  currentMaxVisibleTabs = Math.max(1, Math.min(MAX_TABS, count ?? MAX_TABS))
  applyMaxVisibleTabs()
}

export async function reloadState(): Promise<void> {
  if (!ctx) return
  await loadState()
  if (state.isVisible && state.tabs.length > 0) {
    createTabBar()
    applyOpacity(tabBar, lastTabsFloatOpacity)
    renderTabList()
    ensureScrollListenerBound()
    startTitleRefresh()
  } else if (!state.isVisible && tabBar) {
    removeTabBar()
    stopTitleRefresh()
  }
}

export function cleanup(): void {
  // 移除事件监听
  if (ctx && switchProtyleHandler) {
    ctx.eventBus.off('switch-protyle', switchProtyleHandler)
    ctx.eventBus.off('loaded-protyle-dynamic', switchProtyleHandler)
    switchProtyleHandler = null
  }

  unbindScrollListener()
  unbindTitleObserver()
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
  if (visibilityChangeHandler) {
    document.removeEventListener('visibilitychange', visibilityChangeHandler)
    visibilityChangeHandler = null
  }

  if (scrollSaveTimer) {
    clearTimeout(scrollSaveTimer)
    scrollSaveTimer = null
  }

  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }

  stopTitleRefresh()

  // 取消 debounce 待执行定时器
  debouncedPersist.cancel()
  debouncedSwitchProtyle.cancel()

  // 移除 DOM
  removeTabBar()

  if (themeModeUnsubscribe) {
    themeModeUnsubscribe()
    themeModeUnsubscribe = null
  }

  // 重置所有模块状态，确保下次 init 从干净状态开始
  ctx = null
  state = { tabs: [], isVisible: false, isExpanded: false, activeTabId: null }
  Object.keys(titleCache).forEach(k => delete titleCache[k])
  hiddenByKeyboard = false
  keyboardBaselineHeight = null
  hiddenByScroll = false
  autoHideOnScrollEnabled = false
  currentFloatOpacityForAutoHide = undefined
  lastTabsFloatOpacity = undefined
  lastScrollTopForAutoHide = null
  lastAutoHideToggleAt = 0
  currentMaxVisibleTabs = MAX_TABS
  scrollBindRetryCount = 0
}
