/**
 * 桌面端悬浮大纲模块
 * 功能：在桌面端显示悬浮大纲面板，支持标题快速跳转和拖拽
 */

import { fetchSyncPost, showMessage, openTab as siyuanOpenTab } from "siyuan"
import { pluginInstance, getActiveProtyle } from "../toolbarManager"
import type { ButtonConfig } from "../toolbarManager"
import { applyFloatPanelBackground, observeSiYuanThemeMode } from "./floatPanelBackground"
import { makeDraggable, restorePosition } from "./draggablePanel"

// ===== 常量 =====
const PERSIST_KEY = 'desktopOutlineState'

// ===== 接口 =====
interface OutlineContext {
  saveData: (key: string, value: any) => Promise<void>
  loadData: (key: string) => Promise<any>
  eventBus: any
}

interface DesktopOutlineState {
  isVisible: boolean
  isExpanded: boolean
  currentDocId: string | null
}

interface OutlineItem {
  id: string
  name: string
  depth: number
  subType: string
  children: OutlineItem[]
}

// ===== 模块状态 =====
let ctx: OutlineContext | null = null
let state: DesktopOutlineState = {
  isVisible: false,
  isExpanded: false,
  currentDocId: null
}

let outlinePanel: HTMLElement | null = null
let injectedStyle: HTMLElement | null = null
let switchProtyleHandler: (() => void) | null = null
let dragCleanup: (() => void) | null = null
let themeModeUnsubscribe: (() => void) | null = null

// ===== 获取当前活动的 protyle 元素和文档信息 =====
function getCurrentDocId(): string | undefined {
  const protyle = getActiveProtyle()
  if (protyle?.block?.rootID) return protyle.block.rootID
  return undefined
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
    console.warn('[DesktopOutline] 获取大纲失败:', err)
  }
  return null
}

function extractName(item: any): string {
  if (item.name) return item.name
  if (item.content) {
    return item.content.replace(/^#{1,6}\s*/, '').trim()
  }
  return '未命名'
}

function parseOutlineData(data: any[]): OutlineItem[] {
  if (!data) return []
  const result: OutlineItem[] = []
  data.forEach(item => {
    result.push({
      id: item.id || '',
      name: extractName(item),
      depth: item.depth || 0,
      subType: item.subType || 'h1',
      children: parseOutlineData(item.children || [])
    })
    // 扫描 blocks 数组中是否有标题
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

// ===== 滚动到标题 =====
async function scrollToHeading(blockId: string): Promise<void> {
  try {
    // 先确保文档已打开
    await siyuanOpenTab({
      app: pluginInstance?.app,
      doc: { id: blockId }
    })

    // 等待 DOM 更新后滚动到目标元素
    setTimeout(() => {
      const targetEl = document.querySelector(`[data-node-id="${blockId}"]`) as HTMLElement | null
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // 可选：高亮显示
        targetEl.classList.add('protyle-wysiwyg--hl')
        setTimeout(() => targetEl.classList.remove('protyle-wysiwyg--hl'), 2000)
      }
    }, 100)
  } catch (err) {
    console.error('[DesktopOutline] 滚动到标题失败:', err)
  }
}

// ===== DOM 构建 =====
function injectStyles(): void {
  if (injectedStyle) return
  const style = document.createElement('style')
  style.id = 'desktop-outline-style'
  style.textContent = `
    #desktop-outline-panel {
      position: fixed;
      z-index: 5;
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
    #desktop-outline-panel.collapsed {
      width: 46px;
      padding: 4px 0;
    }
    #desktop-outline-panel.expanded {
      width: 220px;
      padding: 8px;
    }
    #desktop-outline-list {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      scrollbar-width: none;
    }
    #desktop-outline-list::-webkit-scrollbar {
      display: none;
    }
    .desktop-outline-item {
      display: flex;
      align-items: center;
      padding: 5px 8px;
      margin: 2px 0;
      min-height: 34px;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.15s ease;
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #1c1c1e;
      box-sizing: border-box;
    }
    .collapsed .desktop-outline-item {
      justify-content: center;
      padding: 5px 0;
      min-height: 34px;
    }
    .desktop-outline-item:hover {
      background: rgba(0,0,0,0.04);
    }
    .desktop-outline-item.active {
      background: rgba(0,122,255,0.1);
      font-weight: 500;
    }
    .desktop-outline-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
      color: #fff;
      flex-shrink: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
    }
    .desktop-outline-text {
      margin-left: 6px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .collapsed .desktop-outline-text {
      display: none;
    }
    .desktop-outline-icon-h1 { background: rgba(0,122,255,0.55); }
    .desktop-outline-icon-h2 { background: rgba(88,86,214,0.55); }
    .desktop-outline-icon-h3 { background: rgba(52,199,89,0.55); }
    .desktop-outline-icon-h4 { background: rgba(255,149,0,0.55); }
    .desktop-outline-icon-h5 { background: rgba(255,45,85,0.55); }
    .desktop-outline-icon-h6 { background: rgba(175,82,222,0.55); }
    .desktop-outline-h1 { padding-left: 0; }
    .desktop-outline-h2 { padding-left: 0; }
    .desktop-outline-h3 { padding-left: 0; }
    .desktop-outline-h4 { padding-left: 0; }
    .desktop-outline-h5 { padding-left: 0; }
    .desktop-outline-h6 { padding-left: 0; }
    .desktop-outline-expand-handle {
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
    .desktop-outline-expand-handle:hover {
      background: rgba(0,0,0,0.04);
    }
    .expanded .desktop-outline-expand-handle {
      display: none;
    }
    .desktop-outline-collapse {
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
    .expanded .desktop-outline-collapse {
      display: flex;
    }
    .desktop-outline-collapse:hover {
      background: rgba(0,0,0,0.04);
    }
    html[data-theme-mode="dark"] #desktop-outline-panel {
      background: rgba(30,30,30,0.85);
      border-color: rgba(255,255,255,0.1);
      box-shadow: 0 4px 24px rgba(0,0,0,0.3), 0 0 0 0.5px rgba(255,255,255,0.05);
    }
    html[data-theme-mode="dark"] .desktop-outline-item {
      color: #f5f5f7;
    }
    html[data-theme-mode="dark"] .desktop-outline-item.active {
      background: rgba(10,132,255,0.15);
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

async function renderOutlinePanel(): Promise<void> {
  const docId = getCurrentDocId()
  if (!docId) {
    const listEl = outlinePanel?.querySelector('#desktop-outline-list')
    if (listEl) listEl.innerHTML = '<div style="padding:12px;text-align:center;color:#8e8e93;font-size:12px;">未打开文档</div>'
    return
  }

  const outline = await fetchOutline(docId)
  const listEl = outlinePanel?.querySelector('#desktop-outline-list')
  if (!listEl) return

  if (!outline || outline.length === 0) {
    listEl.innerHTML = '<div style="padding:12px;text-align:center;color:#8e8e93;font-size:12px;">无大纲内容</div>'
    return
  }

  listEl.innerHTML = ''

  // 递归渲染树形大纲，带 H1/H2 图标
  function renderItems(items: OutlineItem[], listContainer: HTMLElement) {
    items.forEach(item => {
      const div = document.createElement('div')
      div.className = 'desktop-outline-item'
      div.addEventListener('click', () => scrollToHeading(item.id))

      const level = parseInt(item.subType.replace('h', '')) || 1
      const icon = document.createElement('span')
      icon.className = `desktop-outline-icon desktop-outline-icon-${item.subType}`
      icon.textContent = `H${level}`
      div.appendChild(icon)

      const text = document.createElement('span')
      text.className = 'desktop-outline-text'
      text.textContent = item.name
      div.appendChild(text)

      listContainer.appendChild(div)

      if (item.children && item.children.length > 0) {
        renderItems(item.children, listContainer)
      }
    })
  }

  renderItems(outline, listEl)
}

function createPanel(): void {
  if (outlinePanel) return

  injectStyles()

  outlinePanel = document.createElement('div')
  outlinePanel.id = 'desktop-outline-panel'
  outlinePanel.className = (state.isExpanded ? 'expanded' : 'collapsed')

  // 大纲列表
  const list = document.createElement('div')
  list.id = 'desktop-outline-list'
  outlinePanel.appendChild(list)

  // 收缩按钮
  const collapseBtn = document.createElement('button')
  collapseBtn.className = 'desktop-outline-collapse'
  collapseBtn.textContent = '收起'
  collapseBtn.addEventListener('click', () => {
    state.isExpanded = !state.isExpanded
    outlinePanel.className = (state.isExpanded ? 'expanded' : 'collapsed')
    persistState()
  })
  outlinePanel.appendChild(collapseBtn)

  // 收缩态的展开手柄
  const expandHandle = document.createElement('div')
  expandHandle.className = 'desktop-outline-expand-handle'
  expandHandle.textContent = '☰'
  expandHandle.addEventListener('click', () => {
    state.isExpanded = !state.isExpanded
    outlinePanel.className = (state.isExpanded ? 'expanded' : 'collapsed')
    persistState()
  })
  outlinePanel.appendChild(expandHandle)

  renderOutlinePanel()
  document.body.appendChild(outlinePanel)

  // 恢复位置或使用默认位置
  const restored = restorePosition(outlinePanel)
  if (restored) {
    outlinePanel.style.left = 'auto'
    outlinePanel.style.top = 'auto'
    outlinePanel.style.transform = 'none'
  } else {
    // 默认位置：靠左居中
    outlinePanel.style.left = '20px'
    outlinePanel.style.top = '50%'
    outlinePanel.style.right = 'auto'
    outlinePanel.style.bottom = 'auto'
    outlinePanel.style.transform = 'translateY(-50%)'
  }

  // 启用拖拽
  dragCleanup = makeDraggable(outlinePanel, {
    handleSelector: undefined,
    boundary: 'window'
  })
}

function removePanel(): void {
  if (dragCleanup) {
    dragCleanup()
    dragCleanup = null
  }

  if (outlinePanel) {
    outlinePanel.remove()
    outlinePanel = null
  }
  removeStyles()
}

function toggleExpand(): void {
  if (!outlinePanel) return
  state.isExpanded = !state.isExpanded
  outlinePanel.className = (state.isExpanded ? 'expanded' : 'collapsed')
  persistState()
}

// ===== 持久化 =====
async function persistState(): Promise<void> {
  if (!ctx) return
  await ctx.saveData(PERSIST_KEY, {
    isVisible: state.isVisible,
    isExpanded: state.isExpanded,
    currentDocId: state.currentDocId
  })
}

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
    console.warn('[DesktopOutline] 加载状态失败:', err)
  }
}

// ===== 公开 API =====
export async function init(context: OutlineContext): Promise<void> {
  ctx = context

  if (!themeModeUnsubscribe) {
    themeModeUnsubscribe = observeSiYuanThemeMode(() => {
      if (outlinePanel) applyFloatPanelBackground(outlinePanel, undefined, 0.85)
    })
  }

  await loadState()

  if (state.isVisible) {
    createPanel()
    applyFloatPanelBackground(outlinePanel, undefined, 0.85)
  }

  // 监听文档切换事件
  switchProtyleHandler = () => {
    if (state.isVisible && outlinePanel) {
      renderOutlinePanel()
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
    createPanel()
    applyFloatPanelBackground(outlinePanel, config.floatOpacity, 0.85)

    if (config.showNotification !== false) {
      showMessage('大纲已显示', 1500, 'info')
    }
  } else {
    removePanel()

    if (config.showNotification !== false) {
      showMessage('大纲已隐藏', 1500, 'info')
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

  removePanel()

  if (themeModeUnsubscribe) {
    themeModeUnsubscribe()
    themeModeUnsubscribe = null
  }

  ctx = null
  state = { isVisible: false, isExpanded: false, currentDocId: null }
}
