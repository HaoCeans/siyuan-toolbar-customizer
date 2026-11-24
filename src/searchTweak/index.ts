/**
 * 手机端原生搜索增强 — 装饰与生命周期
 *
 * 不改思源搜索的任何逻辑，只在原生搜索打开时：
 * 1. 给底部工具栏的 8 个纯图标按钮补上文字标签
 * 2. 注入一组样式（结果行更大、摘要两行、命中高亮更明显）
 *
 * 打开检测：`#model` 的 transform 为 translateX(0px) 且内容含 #toolbarSearch。
 * 关闭时（closeModel 会清空 transform）自动移除 body class，样式随之失效。
 */

import { logger } from '@/utils/logger'
import { BODY_CLASS, SEARCH_TWEAK_CSS, STYLE_ID } from './style'

/** 底部工具栏图标 → 中文标签（与原生 data-type 对应） */
const LABELS: Record<string, string> = {
  'toggle-replace': '替换',
  include: '子文档',
  path: '路径',
  currentPath: '本文档',
  expand: '展开',
  contract: '收起',
  more: '更多',
  goAsset: '资源',
}

/** 这些按钮前加一条分隔线，视觉上分组 */
const GROUP_START = new Set(['include', 'expand', 'more'])

let enabled = false
let observer: MutationObserver | null = null
let rafId = 0

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = SEARCH_TWEAK_CSS
  document.head.appendChild(style)
}

function removeStyle(): void {
  document.getElementById(STYLE_ID)?.remove()
}

/** 关闭增强时把被包裹的图标还原回原生结构，避免标签残留在当前打开的面板里 */
function unwrapDecorations(): void {
  document.querySelectorAll('.tc-search-btn').forEach(wrap => {
    const icon = wrap.querySelector(':scope > svg[data-type]')
    if (icon && wrap.parentNode) wrap.parentNode.insertBefore(icon, wrap)
    wrap.remove()
  })
  document.querySelectorAll('.tc-search-bottom').forEach(el => {
    el.classList.remove('tc-search-bottom')
    delete (el as HTMLElement).dataset.tcEnhanced
  })
}

function isNativeSearchOpen(): boolean {
  const model = document.getElementById('model')
  if (!model || !model.style.transform.includes('translateX(0')) return false
  const main = document.getElementById('modelMain')
  return !!main && !!main.querySelector('#toolbarSearch')
}

/**
 * 给底部工具栏补文字标签。
 * 原生点击是「从 target 逐级向上找 data-type」的委托方式，
 * 因此把 svg 包一层容器时，容器上的点击要转发给 svg，否则点标签文字无效。
 */
function decorateBottomBar(main: HTMLElement): void {
  const bottom = main.querySelector('.toolbar--bottom') as HTMLElement | null
  if (!bottom || bottom.dataset.tcEnhanced === '1') return
  // 只处理搜索主面板的底部栏（含「替换」按钮），资源/无效引用面板不动
  if (!bottom.querySelector('[data-type="toggle-replace"]')) return

  bottom.dataset.tcEnhanced = '1'
  bottom.classList.add('tc-search-bottom')

  // 静态快照后再包裹，避免边遍历边改 DOM
  const icons = Array.from(bottom.children).filter(
    (child): child is SVGSVGElement => child instanceof SVGSVGElement && !!child.getAttribute('data-type'),
  )
  for (const icon of icons) {
    const type = icon.getAttribute('data-type') || ''
    const label = LABELS[type]
    if (!label) continue

    const wrap = document.createElement('div')
    wrap.className = 'tc-search-btn'
    if (GROUP_START.has(type)) wrap.dataset.groupStart = '1'

    icon.parentNode?.insertBefore(wrap, icon)
    wrap.appendChild(icon)

    const text = document.createElement('span')
    text.className = 'tc-search-btn-label'
    text.textContent = label
    wrap.appendChild(text)

  }
}

function apply(): void {
  const open = isNativeSearchOpen()
  document.body.classList.toggle(BODY_CLASS, open)
  if (!open) return
  const main = document.getElementById('modelMain')
  if (!main) return
  // 面板每次打开都会重建内容：没有我们的按钮容器就重新装饰
  if (!main.querySelector('.tc-search-btn')) decorateBottomBar(main)
}

function schedule(): void {
  if (rafId) return
  rafId = requestAnimationFrame(() => {
    rafId = 0
    try {
      apply()
    } catch (e) {
      logger.warn('[search-tweak] 应用失败:', e)
    }
  })
}

function attachObserver(): void {
  const model = document.getElementById('model')
  if (!model) {
    // 移动端壳尚未就绪：稍后重试一次（正常情况下 #model 始终存在）
    setTimeout(() => {
      if (enabled && !observer) attachObserver()
    }, 1000)
    return
  }
  observer = new MutationObserver(() => schedule())
  observer.observe(model, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style'],
  })
  schedule()
}

/**
 * 由 applyFeatures() 调用：开关注册/注销。
 * 仅手机端使用；关闭时移除样式、body class 与监听，原生搜索完全复原。
 */
export function syncSearchTweak(on: boolean): void {
  const next = on === true
  if (next === enabled) return
  enabled = next

  if (next) {
    injectStyle()
    attachObserver()
    logger.log('[search-tweak] 已启用原生搜索增强')
  } else {
    observer?.disconnect()
    observer = null
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    document.body.classList.remove(BODY_CLASS)
    unwrapDecorations()
    removeStyle()
    logger.log('[search-tweak] 已关闭原生搜索增强')
  }
}

/** 插件卸载时调用 */
export function cleanupSearchTweak(): void {
  syncSearchTweak(false)
}
