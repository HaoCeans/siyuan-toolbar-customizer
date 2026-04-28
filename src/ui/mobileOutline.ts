/**
 * 手机端悬浮大纲模块
 * 功能：在手机端左侧显示悬浮大纲面板，支持标题快速跳转
 * 设计风格：与手机端标签页Tab保持一致的苹果风格
 */

import { fetchSyncPost, openMobileFileById, showMessage } from "siyuan";
import { isMobileDevice, pluginInstance } from "../toolbarManager";
import type { ButtonConfig } from "../toolbarManager";

// ===== 常量 =====
const PERSIST_KEY = 'mobileOutlineState'
const SWITCH_DEBOUNCE = 300
const REFRESH_DEBOUNCE = 500

// ===== 接口 =====
interface OutlineContext {
  saveData: (key: string, value: any) => Promise<void>
  loadData: (key: string) => Promise<any>
  eventBus: any
}

interface MobileOutlineState {
  isVisible: boolean
  isExpanded: boolean
  currentDocId: string | null
}

interface OutlineItem {
  id: string
  name: string
  depth: number
  subType: string  // h1-h6
  children: OutlineItem[]
}

// ===== 模块状态 =====
let ctx: OutlineContext | null = null
let state: MobileOutlineState = {
  isVisible: false,
  isExpanded: false,
  currentDocId: null
}

let outlinePanel: HTMLElement | null = null
let injectedStyle: HTMLElement | null = null
let switchProtyleHandler: (() => void) | null = null
let currentFocusId: string | null = null
let titleRefreshTimer: ReturnType<typeof setInterval> | null = null
let renderSeq = 0  // 渲染序号，避免切文档时异步返回乱序

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
  if (!outlinePanel) return
  hiddenByKeyboard = true
  stopTitleRefresh()
  removePanel()
}

function restoreAfterKeyboard(): void {
  if (!hiddenByKeyboard) return
  hiddenByKeyboard = false
  if (state.isVisible) {
    createPanel()
    startTitleRefresh()
    renderOutlinePanel()
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

// ===== 大纲数据获取 =====
async function fetchOutline(docId: string): Promise<OutlineItem[] | null> {
  try {
    const response: any = await fetchSyncPost('/api/outline/getDocOutline', {
      id: docId,
      preview: false
    })
    if (response?.code === 0 && response?.data) {
      return parseOutlineData(response.data)
    }
  } catch (err) {
    console.warn('[悬浮大纲] 获取大纲失败:', err)
  }
  return null
}

// 从 item 中提取标题名称，优先 name，fallback 到 content 并去掉 # 前缀
function extractName(item: any): string {
  if (item.name) return item.name
  if (item.content) {
    // content 可能是 "# 标题" 格式，去掉 markdown 标题前缀
    return item.content.replace(/^#{1,6}\s*/, '').trim()
  }
  return ''
}

// 将思源 API 返回的 IBlockTree[] 转换为简化的 OutlineItem[]
// 同时扫描 children 和 blocks，确保所有级别的标题都被捕获
function parseOutlineData(data: any[]): OutlineItem[] {
  if (!data) return []
  const result: OutlineItem[] = []
  data.forEach(item => {
    // 添加当前标题项
    result.push({
      id: item.id || '',
      name: extractName(item),
      depth: item.depth || 0,
      subType: item.subType || 'h1',
      children: parseOutlineData(item.children || [])
    })
    // 扫描 blocks 数组中是否有标题（思源 API 可能将子标题放在 blocks 而非 children）
    if (item.blocks && Array.isArray(item.blocks)) {
      item.blocks.forEach((block: any) => {
        if (block.type === 'NodeHeading' && block.subType) {
          result.push({
            id: block.id || '',
            name: extractName(block),
            depth: block.depth || 0,
            subType: block.subType,
            children: parseOutlineData(block.children || [])
          })
        }
      })
    }
  })
  return result
}

// ===== 当前位置跟踪 =====
function trackCurrentHeading(): void {
  const protyle = (window as any).siyuan?.mobile?.editor?.protyle
  if (!protyle) return

  const wysiwyg = protyle.wysiwyg?.element
  if (!wysiwyg) return

  // 获取当前可见区域中心相对于滚动容器的位置
  const scrollEl = document.querySelector('.protyle-scroll') as HTMLElement
  if (!scrollEl) return

  const viewCenter = scrollEl.scrollTop + scrollEl.clientHeight / 3
  const containerTop = scrollEl.getBoundingClientRect().top

  let closestHeading: { id: string; top: number } | null = null
  let minDist = Infinity

  wysiwyg.querySelectorAll('[data-type="NodeHeading"]').forEach((el: HTMLElement) => {
    // 用 getBoundingClientRect 计算元素相对于滚动容器的滚动位置
    const top = el.getBoundingClientRect().top - containerTop + scrollEl.scrollTop
    const dist = Math.abs(top - viewCenter)
    if (dist < minDist) {
      minDist = dist
      closestHeading = { id: el.getAttribute('data-node-id') || '', top }
    }
  })

  const newFocusId = closestHeading?.id || null
  if (newFocusId !== currentFocusId) {
    currentFocusId = newFocusId
    updateFocusHighlight()
  }
}

function updateFocusHighlight(): void {
  if (!outlinePanel) return

  // 移除旧高亮
  outlinePanel.querySelectorAll('.outline-item--focus').forEach(el => {
    el.classList.remove('outline-item--focus')
  })

  if (!currentFocusId) return

  // 添加新高亮
  const target = outlinePanel.querySelector(`.outline-item[data-node-id="${currentFocusId}"]`)
  if (target) {
    target.classList.add('outline-item--focus')
    // 确保父级展开
    let parent = target.parentElement
    while (parent && parent !== outlinePanel) {
      if (parent.tagName === 'UL' && parent.classList.contains('outline-children')) {
        parent.classList.remove('fn__none')
        const prevLi = parent.previousElementSibling
        if (prevLi) {
          const arrow = prevLi.querySelector('.outline-arrow')
          if (arrow) arrow.classList.add('outline-arrow--open')
        }
      }
      parent = parent.parentElement
    }
    // 滚动到可见区域
    const listEl = outlinePanel.querySelector('#outline-list') as HTMLElement
    if (listEl) {
      const targetRect = target.getBoundingClientRect()
      const listRect = listEl.getBoundingClientRect()
      if (targetRect.top < listRect.top || targetRect.bottom > listRect.bottom) {
        listEl.scrollTop += targetRect.top - listRect.top - listRect.height / 3
      }
    }
  }
}

// ===== 大纲渲染 =====
function renderOutline(items: OutlineItem[]): string {
  if (!items || items.length === 0) {
    return `<div style="text-align: center; padding: 24px 16px; color: var(--b3-theme-on-surface, #8e8e93); font-size: 14px;">暂无大纲内容</div>`
  }

  let html = ''
  items.forEach(item => {
    const level = parseInt(item.subType.replace('h', '')) || 1
    const indent = (item.depth) * 16
    const hasChildren = item.children && item.children.length > 0
    const isFocus = item.id === currentFocusId

    html += `<div class="outline-item${isFocus ? ' outline-item--focus' : ''}" data-node-id="${item.id}" style="padding-left: ${6 + indent}px">
      ${hasChildren ? `<span class="outline-arrow outline-arrow--open" data-toggle="true"><svg width="12" height="12" viewBox="0 0 12 12"><path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></span>` : '<span class="outline-arrow-placeholder"></span>'}
      <span class="outline-icon outline-icon-h${level}">H${level}</span>
      <span class="outline-text">${item.name}</span>
    </div>`

    if (hasChildren) {
      html += `<div class="outline-children">${renderOutline(item.children)}</div>`
    }
  })
  return html
}

function renderOutlinePanel(): void {
  const listEl = outlinePanel?.querySelector('#outline-list')
  if (!listEl) return

  if (!state.currentDocId) {
    listEl.innerHTML = '<div style="text-align: center; padding: 24px 16px; color: var(--b3-theme-on-surface, #8e8e93); font-size: 14px;">请先打开文档</div>'
    return
  }

  // 切换文档时不要先把列表清空成 loading 圈，否则会出现“闪一下”。
  // 这里改为保留旧内容，仅降低透明度并临时禁用交互，待新数据到达后再一次性替换。
  const seq = ++renderSeq
  listEl.style.opacity = '0.6'
  ;(listEl as HTMLElement).style.pointerEvents = 'none'

  fetchOutline(state.currentDocId).then(items => {
    if (!listEl || !outlinePanel) return
    if (seq !== renderSeq) return  // 已有更新的渲染请求，丢弃旧结果
    listEl.innerHTML = renderOutline(items || [])
    bindOutlineEvents(listEl)
    listEl.style.opacity = ''
    ;(listEl as HTMLElement).style.pointerEvents = ''
  })
}

function bindOutlineEvents(container: HTMLElement): void {
  // 标题点击跳转
  container.querySelectorAll('.outline-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const target = (e.currentTarget as HTMLElement)
      // 如果点击的是箭头区域，不跳转
      if ((e.target as HTMLElement).closest('[data-toggle]')) return

      const nodeId = target.getAttribute('data-node-id')
      if (!nodeId) return

      // 高亮
      container.querySelectorAll('.outline-item--focus').forEach(el => el.classList.remove('outline-item--focus'))
      target.classList.add('outline-item--focus')
      currentFocusId = nodeId

      // 跳转到对应标题
      jumpToHeading(nodeId)

      // 收起面板
      if (state.isExpanded) {
        toggleExpand()
      }
    })
  })

  // 展开/折叠子标题
  container.querySelectorAll('[data-toggle]').forEach(arrow => {
    arrow.addEventListener('click', (e) => {
      e.stopPropagation()
      const item = (e.currentTarget as HTMLElement).closest('.outline-item') as HTMLElement
      if (!item) return

      const arrowEl = item.querySelector('.outline-arrow') as HTMLElement
      const children = item.nextElementSibling

      if (children && children.classList.contains('outline-children')) {
        const isOpen = children.classList.contains('fn__none')
        children.classList.toggle('fn__none', !isOpen)
        arrowEl.classList.toggle('outline-arrow--open', isOpen)
      }
    })
  })
}

// ===== 标题跳转 =====
function jumpToHeading(nodeId: string): void {
  // 尝试在当前文档 DOM 中滚动到对应标题
  const headingEl = document.querySelector(`[data-node-id="${nodeId}"][data-type="NodeHeading"]`) as HTMLElement
  if (headingEl) {
    headingEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }

  // 如果 DOM 中找不到（可能在折叠的块内），使用 openMobileFileById 重新加载
  if (pluginInstance?.app && state.currentDocId) {
    openMobileFileById(pluginInstance.app, nodeId)
  }
}

// ===== 文档切换处理 =====
const debouncedSwitchProtyle = debounce(() => {
  handleSwitchProtyle()
}, SWITCH_DEBOUNCE)

function handleSwitchProtyle(): void {
  const protyle = (window as any).siyuan?.mobile?.editor?.protyle
  if (!protyle) return

  const docId = protyle.block?.rootID
  if (!docId || docId === state.currentDocId) return

  state.currentDocId = docId
  currentFocusId = null

  if (state.isVisible && outlinePanel) {
    renderOutlinePanel()
  }
}

// ===== 样式 =====
function injectStyles(): void {
  if (injectedStyle) return
  const style = document.createElement('style')
  style.id = 'mobile-outline-panel-style'
  style.textContent = `
    @keyframes outline-spin {
      to { transform: rotate(360deg); }
    }
    #mobile-outline-panel {
      position: fixed;
      left: 2px;
      top: 50%;
      transform: translateY(-50%);
      /* 与主工具栏同层级；仍低于扩展工具栏(1000+) */
      z-index: 5;
      display: flex;
      flex-direction: column;
      background: rgba(255,255,255,0.72);
      backdrop-filter: saturate(180%) blur(20px);
      -webkit-backdrop-filter: saturate(180%) blur(20px);
      border-radius: 20px;
      box-shadow: 0 2px 20px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04);
      transition: width 0.3s cubic-bezier(0.32,0.72,0,1), padding 0.3s cubic-bezier(0.32,0.72,0,1), border-radius 0.3s ease;
      max-height: 70vh;
      overflow: hidden;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      border: 0.5px solid rgba(0,0,0,0.08);
    }
    #mobile-outline-panel.collapsed {
      width: 46px;
      padding: 6px 0;
    }
    /* 收缩态 */
    .collapsed #outline-list {
      overflow-y: auto;
      scrollbar-width: none;
    }
    .collapsed #outline-list::-webkit-scrollbar {
      display: none;
    }
    .collapsed .outline-item {
      padding: 4px 0 !important;
      margin: 2px auto;
      justify-content: center;
      min-height: 30px;
    }
    .collapsed .outline-arrow,
    .collapsed .outline-arrow-placeholder,
    .collapsed .outline-text {
      display: none;
    }
    .collapsed .outline-icon {
      width: 28px;
      height: 28px;
      margin: 0;
      border-radius: 8px;
      font-size: 11px;
    }
    .collapsed .outline-item--focus .outline-icon {
      box-shadow: 0 0 0 2px rgba(255,255,255,0.9), 0 0 0 3.5px rgba(0,122,255,0.5);
    }
    #mobile-outline-panel.expanded {
      width: 200px;
      padding: 6px;
    }
    #outline-list {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      scrollbar-width: none;
      padding: 2px 0;
    }
    #outline-list::-webkit-scrollbar {
      display: none;
    }
    /* 标题项 */
    .outline-item {
      display: flex;
      align-items: center;
      padding: 6px 8px 6px 20px;
      margin: 1px 0;
      border-radius: 10px;
      cursor: pointer;
      transition: background 0.18s ease, transform 0.15s ease;
      min-height: 34px;
      position: relative;
    }
    .outline-item:active {
      transform: scale(0.97);
    }
    .outline-item--focus {
      background: rgba(0,122,255,0.1);
    }
    .outline-item--focus .outline-text {
      color: #007AFF;
      font-weight: 600;
    }
    /* 箭头 */
    .outline-arrow {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      margin-right: 2px;
      color: #8e8e93;
      transition: transform 0.2s cubic-bezier(0.32,0.72,0,1);
      cursor: pointer;
    }
    .outline-arrow--open {
      transform: rotate(90deg);
    }
    .outline-arrow-placeholder {
      display: inline-block;
      width: 20px;
      flex-shrink: 0;
      margin-right: 2px;
    }
    /* 标题级别标签 */
    .outline-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border-radius: 6px;
      flex-shrink: 0;
      margin-right: 6px;
      font-size: 10px;
      font-weight: 700;
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif;
      letter-spacing: -0.3px;
    }
    .outline-icon-h1 { background: #007AFF; }
    .outline-icon-h2 { background: #5856D6; }
    .outline-icon-h3 { background: #34C759; }
    .outline-icon-h4 { background: #FF9500; }
    .outline-icon-h5 { background: #FF2D55; }
    .outline-icon-h6 { background: #AF52DE; }
    /* 标题文字 */
    .outline-text {
      flex: 1;
      font-size: 13px;
      font-weight: 500;
      color: #1c1c1e;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.3;
      letter-spacing: -0.2px;
      transition: color 0.15s ease;
    }
    /* 子标题容器 */
    .outline-children {
      overflow: hidden;
      transition: max-height 0.2s ease;
    }
    .outline-children.fn__none {
      display: none;
    }
    /* 展开/收起按钮 */
    .outline-collapse-btn {
      display: none;
      align-items: center;
      justify-content: center;
      width: calc(100% - 16px);
      height: 30px;
      margin: 4px auto 2px;
      border: none;
      background: rgba(0,0,0,0.04);
      color: #8e8e93;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      border-radius: 10px;
      transition: background 0.15s ease;
      letter-spacing: -0.1px;
    }
    .expanded .outline-collapse-btn {
      display: flex;
    }
    .outline-collapse-btn:active {
      background: rgba(0,0,0,0.08);
    }
    /* 收缩态展开手柄 */
    .outline-expand-handle {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      margin: 2px auto 0;
      cursor: pointer;
      color: #8e8e93;
      font-size: 14px;
      border-radius: 10px;
      transition: background 0.15s ease;
    }
    .outline-expand-handle:active {
      background: rgba(0,0,0,0.06);
    }
    html[data-theme-mode="dark"] .outline-expand-handle {
      color: #0A84FF;
    }
    .expanded .outline-expand-handle {
      display: none;
    }
    /* 暗黑模式适配 */
    html[data-theme-mode="dark"] #mobile-outline-panel,
    #mobile-outline-panel.dark {
      background: rgba(44,44,46,0.72);
      border-color: rgba(255,255,255,0.08);
      box-shadow: 0 2px 20px rgba(0,0,0,0.3), 0 0 0 0.5px rgba(255,255,255,0.06);
    }
    html[data-theme-mode="dark"] .outline-item--focus {
      background: rgba(10,132,255,0.18);
    }
    html[data-theme-mode="dark"] .outline-text {
      color: #f5f5f7;
    }
    html[data-theme-mode="dark"] .outline-arrow {
      color: #98989d;
    }
    html[data-theme-mode="dark"] .outline-collapse-btn {
      background: rgba(255,255,255,0.06);
      color: #98989d;
    }
    html[data-theme-mode="dark"] .outline-collapse-btn:active {
      background: rgba(255,255,255,0.1);
    }
    html[data-theme-mode="dark"] .outline-expand-handle:active {
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

// ===== DOM 构建 =====
function createPanel(): void {
  if (outlinePanel) return

  injectStyles()

  outlinePanel = document.createElement('div')
  outlinePanel.id = 'mobile-outline-panel'
  outlinePanel.className = state.isExpanded ? 'expanded' : 'collapsed'

  // 大纲列表
  const list = document.createElement('div')
  list.id = 'outline-list'
  outlinePanel.appendChild(list)

  // 收起按钮
  const collapseBtn = document.createElement('button')
  collapseBtn.className = 'outline-collapse-btn'
  collapseBtn.textContent = '收起'
  collapseBtn.addEventListener('click', () => toggleExpand())
  outlinePanel.appendChild(collapseBtn)

  // 收缩态展开手柄
  const expandHandle = document.createElement('div')
  expandHandle.className = 'outline-expand-handle'
  expandHandle.innerHTML = '<svg width="20" height="20" viewBox="0 0 20 20"><rect x="3" y="2" width="14" height="2.5" rx="1.25" fill="currentColor"/><rect x="3" y="8.75" width="10" height="2.5" rx="1.25" fill="currentColor"/><rect x="3" y="15.5" width="12" height="2.5" rx="1.25" fill="currentColor"/></svg>'
  expandHandle.addEventListener('click', () => toggleExpand())
  outlinePanel.appendChild(expandHandle)

  renderOutlinePanel()
  document.body.appendChild(outlinePanel)
}

function removePanel(): void {
  if (outlinePanel) {
    outlinePanel.remove()
    outlinePanel = null
  }
  removeStyles()
}

function toggleExpand(): void {
  if (!outlinePanel) return
  state.isExpanded = !state.isExpanded
  outlinePanel.className = state.isExpanded ? 'expanded' : 'collapsed'
  debouncedPersist()
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
      state = {
        isVisible: saved.isVisible ?? false,
        isExpanded: saved.isExpanded ?? false,
        currentDocId: saved.currentDocId || null
      }
    }
  } catch (err) {
    console.warn('[悬浮大纲] 加载状态失败:', err)
  }
}

// ===== 标题刷新（滚动跟踪） =====
function startTitleRefresh(): void {
  if (titleRefreshTimer) return
  titleRefreshTimer = setInterval(() => {
    if (state.isVisible && state.currentDocId && !document.hidden) {
      trackCurrentHeading()
    }
  }, 800)
}

function stopTitleRefresh(): void {
  if (titleRefreshTimer) {
    clearInterval(titleRefreshTimer)
    titleRefreshTimer = null
  }
}

// ===== 公开 API =====
export async function init(context: OutlineContext): Promise<void> {
  ctx = context

  await loadState()

  // 初始化时获取当前文档ID
  const protyle = (window as any).siyuan?.mobile?.editor?.protyle
  if (protyle?.block?.rootID) {
    state.currentDocId = protyle.block.rootID
  }

  // 如果之前可见，恢复面板
  if (state.isVisible) {
    createPanel()
    startTitleRefresh()
  }

  // 监听文档切换
  switchProtyleHandler = debouncedSwitchProtyle
  context.eventBus.on('switch-protyle', switchProtyleHandler)
  context.eventBus.on('loaded-protyle-dynamic', switchProtyleHandler)

  // 输入法/键盘弹出时自动隐藏（仅手机端）
  keyboardBaselineHeight = getViewportHeight()
  vvResizeHandler = () => {
    if (!isMobileDevice()) return
    const vh = getViewportHeight()
    if (keyboardBaselineHeight == null) keyboardBaselineHeight = vh

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

  // 前后台切换
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopTitleRefresh()
    } else if (state.isVisible) {
      startTitleRefresh()
      // 回到前台时刷新大纲
      renderOutlinePanel()
    }
  })
}

export function toggleVisibility(config: ButtonConfig): void {
  if (!isMobileDevice()) {
    showMessage('此功能仅支持手机端', 2000, 'info')
    return
  }

  state.isVisible = !state.isVisible

  if (state.isVisible) {
    // 确保有当前文档
    const protyle = (window as any).siyuan?.mobile?.editor?.protyle
    if (protyle?.block?.rootID) {
      state.currentDocId = protyle.block.rootID
    }

    createPanel()
    startTitleRefresh()

    if (config.showNotification !== false) {
      showMessage('大纲已显示', 1500, 'info')
    }
  } else {
    removePanel()
    stopTitleRefresh()
    currentFocusId = null

    if (config.showNotification !== false) {
      showMessage('大纲已隐藏', 1500, 'info')
    }
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

  stopTitleRefresh()
  removePanel()

  ctx = null
}
