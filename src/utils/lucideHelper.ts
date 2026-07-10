/**
 * Lucide 图标辅助模块
 *
 * 背景：项目依赖的 lucide@0.562.0 不提供 .toSvg() 方法，
 * 图标数据是原始数组 [["path", {d:"..."}], ["circle", {cx:..}]]。
 * 此模块提供统一的 SVG 字符串生成 + 图标名枚举能力。
 */

// 使用 ESM 静态导入（Vite 构建后动态 require 不可用）
import { icons as lucideIcons } from 'lucide'

/** Lucide 默认 SVG 属性（线框风格） */
const DEFAULT_ATTRS: Record<string, string | number> = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 2,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
}

/** 工具函数：将单个图标节点数组转为 SVG 字符串 */
function iconNodeToSvg(iconNode: any[], size: number): string {
  const attrs: Record<string, string | number> = {
    ...DEFAULT_ATTRS,
    width: size,
    height: size,
  }

  let svg = '<svg'
  for (const [k, v] of Object.entries(attrs)) {
    svg += ` ${k}="${v}"`
  }
  svg += '>'

  for (const [tag, attr] of iconNode) {
    svg += `<${tag}`
    // 在每个子元素上加 fill="none" stroke="currentColor"，防思源全局 CSS 覆盖
    if (!('fill' in attr)) svg += ' fill="none"'
    if (!('stroke' in attr)) svg += ' stroke="currentColor"'
    for (const [k, v] of Object.entries(attr)) {
      svg += ` ${k}="${v}"`
    }
    svg += `/>`
  }

  svg += '</svg>'
  return svg
}

/** 缓存图标名列表 */
let cachedIconNames: string[] | null = null

/**
 * 获取所有可用的 Lucide 图标名（PascalCase）
 * 结果会被缓存
 */
export function getLucideIconNames(): string[] {
  if (cachedIconNames) return cachedIconNames

  try {
    const names = Object.keys(lucideIcons).sort()
    if (names.length > 0) cachedIconNames = names
    return names
  } catch (e) {
    return []
  }
}

/**
 * 根据 Lucide 图标名生成内联 SVG 字符串
 * 替代不存在的 IconComponent.toSvg()
 *
 * @param iconName PascalCase 图标名，如 "Search"、"Home"
 * @param size 图标尺寸（px），默认 24
 * @returns SVG 字符串，失败时返回空字符串
 */
export function lucideToSvg(iconName: string, size: number = 24): string {
  try {
    const iconNode = (lucideIcons as any)[iconName]
    if (iconNode && Array.isArray(iconNode)) {
      return iconNodeToSvg(iconNode, size)
    }
    return ''
  } catch (e) {
    return ''
  }
}
