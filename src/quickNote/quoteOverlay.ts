/**
 * 一键记事弹窗 - 金句占位 overlay
 *
 * 输入法未打开 + 输入框为空时，在输入区显示一条从指定文档随机抽取的金句，
 * 作为纯装饰性占位内容。风格参考微信读书划线分享卡片。
 *
 * - 每次弹窗打开时重新随机
 * - 输入法弹出或用户开始输入后立刻隐藏
 * - pointer-events: none，不阻挡任何交互
 */

import { sql } from '../api'
import { pluginInstance } from '../toolbarManager'
import type { QuickNoteInputHandle } from './inputArea'

// ===== 缓存 =====

interface QuoteCache {
  docId: string
  contents: string[]
  timestamp: number
}

let cache: QuoteCache | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 分钟

async function fetchQuoteContents(docId: string): Promise<string[]> {
  if (!docId) return []

  const now = Date.now()
  if (cache && cache.docId === docId && now - cache.timestamp < CACHE_TTL && cache.contents.length > 0) {
    return cache.contents
  }

  try {
    const rows = await sql(
      `SELECT content FROM blocks WHERE root_id = '${docId}' AND type = 'p'`,
    )
    if (!Array.isArray(rows) || rows.length === 0) return []

    const contents = rows
      .map((r: any) => (r.content || '').trim())
      .filter(Boolean)
    if (contents.length === 0) return []

    cache = { docId, contents, timestamp: now }
    return contents
  } catch {
    return []
  }
}

function pickRandom(contents: string[]): string | null {
  if (contents.length === 0) return null
  return contents[Math.floor(Math.random() * contents.length)]
}

// ===== 输入内容检测 =====

function hasInputContent(handle: QuickNoteInputHandle): boolean {
  if (handle.isPlainTextarea()) {
    const textarea = handle.element.querySelector('textarea') as HTMLTextAreaElement | null
    return !!(textarea?.value.trim())
  }
  // 块格式：检查 wysiwyg 中是否有实质文字或图片元素
  const wysiwyg = handle.element.querySelector('.protyle-wysiwyg') as HTMLElement | null
  if (!wysiwyg) return false
  const text = (wysiwyg.textContent ?? '').replace(/\u200b/g, '').trim()
  if (text) return true
  // 图片元素也算有内容（防止金句 overlay 遮挡图片）
  if (wysiwyg.querySelector('img, [data-type="img"]')) return true
  return false
}

// ===== 导出 =====

export interface QuoteOverlayHandle {
  cleanup: () => void
}

/**
 * 在 noteSection 内创建金句占位层（微信读书划线分享卡片风格）。
 *
 * @param noteSection  输入区容器（需包含 inputHandle.element）
 * @param inputHandle  当前输入 Handle
 * @param isDark       是否暗黑模式
 * @returns 清理函数句柄，或 null（未配置 / 无可用金句时不创建）
 */
export async function createQuoteOverlay(
  noteSection: HTMLElement,
  inputHandle: QuickNoteInputHandle,
  isDark: boolean,
): Promise<QuoteOverlayHandle | null> {
  const docId = pluginInstance?.mobileFeatureConfig?.quickNoteQuoteDocId
  if (!docId) return null

  const contents = await fetchQuoteContents(docId)
  const quote = pickRandom(contents)
  if (!quote) return null

  const fontSize = pluginInstance?.mobileFeatureConfig?.quickNoteQuoteFontSize || 22
  const maxLines = pluginInstance?.mobileFeatureConfig?.quickNoteQuoteMaxLines || 5

  // 挂载目标：inputHandle.element（输入区 wrapper），overlay 精确覆盖输入框
  const mountTarget = inputHandle.element
  mountTarget.style.position = 'relative'

  // --- 用户自定义颜色（默认金色） ---
  const baseColor = isDark
    ? (pluginInstance?.mobileFeatureConfig?.quickNoteQuoteColorDark || '#C9A84C')
    : (pluginInstance?.mobileFeatureConfig?.quickNoteQuoteColorLight || '#B8860B')

  // hex → {r,g,b} 辅助函数，用于派生半透明色
  const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
    const h = hex.replace('#', '')
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16),
    }
  }
  const { r, g, b } = hexToRgb(baseColor)
  const textColor = baseColor
  const quoteMarkColor = `rgba(${r},${g},${b},0.2)`
  const lineColor = `rgba(${r},${g},${b},0.25)`
  const sourceColor = `rgba(${r},${g},${b},0.3)`

  // --- overlay 容器 ---
  const overlay = document.createElement('div')
  overlay.className = 'quick-note-quote-overlay'
  overlay.style.cssText = [
    'position: absolute',
    'inset: 0',
    'display: flex',
    'flex-direction: column',
    'align-items: center',
    'justify-content: center',
    'padding: 24px 20px',
    'pointer-events: none',
    'z-index: 1',
    'overflow: hidden',
  ].join(';')

  // 内层卡片（微信读书风格：居中的竖版内容区）
  const card = document.createElement('div')
  card.style.cssText = [
    'display: flex',
    'flex-direction: column',
    'align-items: center',
    'justify-content: center',
    'flex: 1',
    'width: 100%',
    'max-width: 320px',
    'padding: 20px 0',
  ].join(';')

  // 左上装饰引号（大号、半透明、定位在卡片左上区域）
  const openQuote = document.createElement('div')
  openQuote.style.cssText = [
    'font-size: 72px',
    'line-height: 1',
    `color: ${quoteMarkColor}`,
    'font-weight: 700',
    "font-family: 'Georgia', 'Times New Roman', serif",
    'align-self: flex-start',
    'margin-bottom: -12px',
    'margin-left: -4px',
    'user-select: none',
  ].join(';')
  openQuote.textContent = '“'
  card.appendChild(openQuote)

  // 金句正文
  const quoteEl = document.createElement('div')
  quoteEl.style.cssText = [
    'text-align: center',
    `color: ${textColor}`,
    `font-size: ${fontSize}px`,
    'line-height: 2',
    'letter-spacing: 1px',
    "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Hiragino Sans GB', sans-serif",
    'word-break: break-word',
    'max-height: 60%',
    'overflow: hidden',
    'display: -webkit-box',
    `-webkit-line-clamp: ${maxLines}`,
    '-webkit-box-orient: vertical',
  ].join(';')
  quoteEl.textContent = quote
  card.appendChild(quoteEl)

  // 右下装饰引号
  const closeQuote = document.createElement('div')
  closeQuote.style.cssText = [
    'font-size: 72px',
    'line-height: 1',
    `color: ${quoteMarkColor}`,
    'font-weight: 700',
    "font-family: 'Georgia', 'Times New Roman', serif",
    'align-self: flex-end',
    'margin-top: -8px',
    'margin-right: -4px',
    'user-select: none',
  ].join(';')
  closeQuote.textContent = '”'
  card.appendChild(closeQuote)

  // 底部分割线 + 来源
  const footer = document.createElement('div')
  footer.style.cssText = [
    'display: flex',
    'flex-direction: column',
    'align-items: center',
    'gap: 6px',
    'margin-top: 16px',
    'width: 100%',
  ].join(';')

  const divider = document.createElement('div')
  divider.style.cssText = [
    'width: 24px',
    'height: 1.5px',
    'border-radius: 1px',
    `background: ${lineColor}`,
  ].join(';')
  footer.appendChild(divider)

  const source = document.createElement('div')
  source.style.cssText = [
    `color: ${sourceColor}`,
    'font-size: 11px',
    'letter-spacing: 2px',
    "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    'user-select: none',
  ].join(';')
  source.textContent = 'JIN JU'
  footer.appendChild(source)

  card.appendChild(footer)
  overlay.appendChild(card)
  mountTarget.appendChild(overlay)

  // --- 状态追踪 ---
  let keyboardOpen = false
  let lastHideTime = 0
  let showTimer: ReturnType<typeof setTimeout> | null = null
  const DEBOUNCE_MS = 400
  const cleanupFns: (() => void)[] = []

  const hideOverlay = () => {
    overlay.style.display = 'none'
    lastHideTime = Date.now()
    if (showTimer) { clearTimeout(showTimer); showTimer = null }
  }

  const showOverlay = () => {
    // 防抖：刚隐藏后不立即重新显示，避免键盘动画期间反复闪
    const elapsed = Date.now() - lastHideTime
    if (lastHideTime > 0 && elapsed < DEBOUNCE_MS) {
      if (showTimer) clearTimeout(showTimer)
      showTimer = setTimeout(() => {
        showTimer = null
        if (!keyboardOpen && !hasInputContent(inputHandle) && !inputHandle.element.contains(document.activeElement)) {
          overlay.style.display = 'flex'
        }
      }, DEBOUNCE_MS - elapsed)
      return
    }
    overlay.style.display = 'flex'
  }

  const updateVisibility = () => {
    const shouldHide = keyboardOpen || hasInputContent(inputHandle) || inputHandle.element.contains(document.activeElement)
    if (shouldHide) {
      hideOverlay()
    } else {
      showOverlay()
    }
  }

  // ① focusin：用户点击输入框的瞬间立刻隐藏（比 viewport 检测快很多）
  const onFocusIn = () => hideOverlay()
  inputHandle.element.addEventListener('focusin', onFocusIn)
  cleanupFns.push(() => inputHandle.element.removeEventListener('focusin', onFocusIn))

  // ② visualViewport resize：键盘动画结束后更新状态
  const onViewportResize = () => {
    if (!window.visualViewport) return
    const screenHeight = window.screen.height
    keyboardOpen = (screenHeight - window.visualViewport.height) > 200
    updateVisibility()
  }
  window.visualViewport?.addEventListener('resize', onViewportResize)
  cleanupFns.push(() => window.visualViewport?.removeEventListener('resize', onViewportResize))

  // ③ 输入内容变化检测
  const onInputChange = () => updateVisibility()

  if (inputHandle.isPlainTextarea()) {
    const textarea = inputHandle.element.querySelector('textarea')
    if (textarea) {
      textarea.addEventListener('input', onInputChange)
      cleanupFns.push(() => textarea.removeEventListener('input', onInputChange))
    }
  } else {
    const observer = new MutationObserver(onInputChange)
    const wysiwyg = inputHandle.element.querySelector('.protyle-wysiwyg')
    if (wysiwyg) {
      observer.observe(wysiwyg, { childList: true, subtree: true, characterData: true })
    }
    cleanupFns.push(() => observer.disconnect())
  }

  // overlay 自身清理
  cleanupFns.push(() => overlay.remove())
  cleanupFns.push(() => { if (showTimer) clearTimeout(showTimer) })

  return {
    cleanup: () => {
      cleanupFns.forEach(fn => fn())
      mountTarget.style.position = ''
    },
  }
}
