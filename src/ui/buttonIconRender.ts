/**
 * 按钮图标渲染（共享）
 *
 * 把按钮配置里的 icon 字段画成 DOM，四类分支与插件运行时按钮保持一致：
 * 1. 思源图标  iconSettings / iconCheck …  → <svg><use href="#iconXxx">
 * 2. Lucide    lucide:Calendar …            → lucideToSvg()
 * 3. 图片路径  assets/xx.png / /plugins/…   → <img>
 * 4. 其余按 Emoji / 文本处理
 */

import { lucideToSvg } from '../utils/lucideHelper'

const IMAGE_PATH_RE = /\.(?:png|jpg|jpeg|gif|svg|webp|bmp|avif)$/i
const PLUGIN_ASSET_BASE = '/plugins/siyuan-toolbar-customizer/'

const createSvgElement = (size: number) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', `${size}`)
  svg.setAttribute('height', `${size}`)
  svg.style.cssText = 'flex-shrink:0;display:block;'
  return svg
}

/** 把图标画进容器（会先清空容器） */
export function renderButtonIcon(el: HTMLElement, icon: string, size: number): void {
  el.innerHTML = ''
  if (!icon) {
    return
  }
  if (icon.startsWith('icon')) {
    const svg = createSvgElement(size)
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
    use.setAttribute('href', `#${icon}`)
    use.setAttribute('xlink:href', `#${icon}`)
    svg.appendChild(use)
    el.appendChild(svg)
    return
  }
  if (icon.startsWith('lucide:')) {
    const svgString = lucideToSvg(icon.substring(7), size)
    if (svgString) {
      el.innerHTML = svgString
      const svg = el.querySelector('svg')
      if (svg) {
        svg.style.cssText = `width:${size}px;height:${size}px;flex-shrink:0;`
      }
      return
    }
    const span = document.createElement('span')
    span.textContent = icon
    span.style.cssText = `font-size:${size}px;line-height:1;`
    el.appendChild(span)
    return
  }
  if (IMAGE_PATH_RE.test(icon)) {
    const img = document.createElement('img')
    img.src = icon.startsWith('/') ? icon : PLUGIN_ASSET_BASE + icon.replace(/^\.?\//, '')
    img.style.cssText = `width:${size}px;height:${size}px;flex-shrink:0;`
    img.draggable = false
    el.appendChild(img)
    return
  }
  const span = document.createElement('span')
  span.textContent = icon
  span.style.cssText = `font-size:${size}px;line-height:1;flex-shrink:0;`
  el.appendChild(span)
}
