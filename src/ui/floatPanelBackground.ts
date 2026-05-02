/**
 * 悬浮条背景：按思源 html[data-theme-mode] 切换亮/暗底色。
 * 若仅用内联 rgba(255,255,255,α)，会压过样式表里的暗黑规则，导致在 App 内切换暗黑时背景不变。
 */

export function applyFloatPanelBackground(
  el: HTMLElement | null,
  opacity: number | undefined,
  defaultAlpha: number
): void {
  if (!el) return
  const a = opacity ?? defaultAlpha
  const dark = document.documentElement.getAttribute('data-theme-mode') === 'dark'
  el.style.background = dark ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`
}

/** 监听思源切换亮/暗（与 loadAssets 写入的 data-theme-mode 一致） */
export function observeSiYuanThemeMode(onThemeChange: () => void): () => void {
  const observer = new MutationObserver(() => {
    onThemeChange()
  })
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme-mode']
  })
  return () => observer.disconnect()
}
