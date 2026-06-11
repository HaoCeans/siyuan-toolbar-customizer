/**
 * 可拖动面板系统
 * 支持桌面端拖拽，手机端保持原样
 */

interface DragState {
  isDragging: boolean
  startX: number
  startY: number
  initialLeft: number
  initialTop: number
}

interface DraggableConfig {
  /** 拖拽手柄选择器（如整个面板或特定区域），留空则整个面板可拖拽 */
  handleSelector?: string
  /** 边界限制：'window' 限制在视口内 */
  boundary?: 'window'
  /** 限制为垂直方向拖拽（可选） */
  constrainToVertical?: boolean
  /** 开始拖动回调 */
  onDragStart?: () => void
  /** 结束拖动回调 */
  onDragEnd?: () => void
  /** 位置变化回调 */
  onPositionChange?: (x: number, y: number) => void
}

// 位置持久化前缀
const POSITION_STORAGE_PREFIX = 'draggable-panel-pos-'

// 统一获取触摸/鼠标坐标
function getClientPos(e: TouchEvent | MouseEvent): { x: number; y: number } {
  if ('touches' in e) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  return { x: e.clientX, y: e.clientY }
}

/**
 * 保存面板位置到 localStorage
 */
export function savePosition(panelId: string, x: number, y: number): void {
  try {
    const key = POSITION_STORAGE_PREFIX + panelId
    localStorage.setItem(key, JSON.stringify({ x, y, version: 1, savedAt: Date.now() }))
  } catch (err) {
    console.warn('[DraggablePanel] 保存位置失败:', err)
  }
}

/**
 * 从 localStorage 加载面板位置
 */
export function loadPosition(panelId: string): { x: number; y: number } | null {
  try {
    const key = POSITION_STORAGE_PREFIX + panelId
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const data = JSON.parse(raw)
    // 30天过期
    if (Date.now() - (data.savedAt || 0) > 30 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(key)
      return null
    }
    return { x: data.x, y: data.y }
  } catch {
    return null
  }
}

/**
 * 清除保存的位置
 */
export function clearPosition(panelId: string): void {
  try {
    const key = POSITION_STORAGE_PREFIX + panelId
    localStorage.removeItem(key)
  } catch {}
}

/**
 * 使面板可拖拽（仅桌面端）
 */
export function makeDraggable(
  panel: HTMLElement,
  config: DraggableConfig = {}
): () => void {
  // 仅桌面端启用拖拽
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  if (isMobile) {
    return () => {} // 手机端返回空清理函数
  }

  const state: DragState = {
    isDragging: false,
    startX: 0,
    startY: 0,
    initialLeft: 0,
    initialTop: 0
  }

  const cleanup = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onEnd)
    if (handle) {
      handle.removeEventListener('mousedown', onStart)
    }
  }

  // 拖拽手柄（留空则整个面板可拖拽）
  const handle = config.handleSelector
    ? panel.querySelector(config.handleSelector) as HTMLElement | null
    : panel

  if (!handle) {
    console.warn('[DraggablePanel] 未找到拖拽手柄:', config.handleSelector)
    return () => {}
  }

  handle.style.cursor = 'move'

  // 开始拖拽
  const onStart = (e: MouseEvent) => {
    e.preventDefault()

    state.isDragging = true
    const pos = getClientPos(e)
    state.startX = pos.x
    state.startY = pos.y

    const rect = panel.getBoundingClientRect()
    state.initialLeft = rect.left
    state.initialTop = rect.top

    // 拖拽时禁用过渡效果，避免延迟
    panel.style.transition = 'none'
    // 提升层级
    panel.style.zIndex = '10000'

    config.onDragStart?.()
  }

  // 拖拽中
  const onMove = (e: MouseEvent) => {
    if (!state.isDragging) return
    e.preventDefault()

    const pos = getClientPos(e)
    const dx = pos.x - state.startX
    const dy = pos.y - state.startY

    let newX = state.initialLeft + dx
    let newY = state.initialTop + dy

    // 边界检测
    if (config.boundary === 'window') {
      const maxX = window.innerWidth - panel.offsetWidth
      const maxY = window.innerHeight - panel.offsetHeight

      newX = Math.max(0, Math.min(newX, maxX))
      newY = Math.max(0, Math.min(newY, maxY))
    }

    // 限制垂直方向
    if (config.constrainToVertical) {
      newX = state.initialLeft
    }

    // 应用新位置（清除 right/bottom/transform，改用 left/top）
    panel.style.left = newX + 'px'
    panel.style.top = newY + 'px'
    panel.style.right = 'auto'
    panel.style.bottom = 'auto'
    panel.style.transform = 'none'

    config.onPositionChange?.(newX, newY)
  }

  // 结束拖拽
  const onEnd = () => {
    if (!state.isDragging) return
    state.isDragging = false

    // 恢复过渡效果
    panel.style.transition = ''
    // 恢复层级
    panel.style.zIndex = ''

    config.onDragEnd?.()

    // 保存位置
    const rect = panel.getBoundingClientRect()
    savePosition(panel.id, rect.left, rect.top)
  }

  // 绑定事件
  handle.addEventListener('mousedown', onStart)
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onEnd)

  // 返回清理函数
  return cleanup
}

/**
 * 恢复保存的面板位置
 */
export function restorePosition(panel: HTMLElement): boolean {
  const saved = loadPosition(panel.id)
  if (!saved) return false
  // version 1+: 新版拖拽保存的位置（含 transform 归零后的 left/top）
  // 无 version 或 version !== 1 是旧版残留，忽略
  if ((saved as any).version !== 1) {
    clearPosition(panel.id)
    return false
  }

  // 检查位置是否在当前视口内
  const isInViewport =
    saved.x >= 0 && saved.x < window.innerWidth &&
    saved.y >= 0 && saved.y < window.innerHeight

  if (!isInViewport) {
    // 位置超出当前视口，清除并返回false
    clearPosition(panel.id)
    return false
  }

  // 应用保存的位置
  panel.style.left = saved.x + 'px'
  panel.style.top = saved.y + 'px'
  panel.style.right = 'auto'
  panel.style.bottom = 'auto'
  panel.style.transform = 'none'
  return true
}
