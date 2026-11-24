/**
 * 手机端原生搜索增强 — 样式
 *
 * 全部规则都挂载在 body.tc-native-search 下（只有原生搜索打开时才添加），
 * 只影响思源原生搜索面板，不触碰列表渲染与搜索逻辑。
 */

export const STYLE_ID = 'tc-search-tweak-style'
export const BODY_CLASS = 'tc-native-search'

export const SEARCH_TWEAK_CSS = `
/* ── 结果列表：更大行高、两行摘要、更明显的命中高亮 ── */
body.${BODY_CLASS} #modelMain #searchList .b3-list-item {
  min-height: 52px;
  padding: 10px 12px;
  box-sizing: border-box;
}
body.${BODY_CLASS} #modelMain #searchList .b3-list-item__first {
  align-items: flex-start;
}
body.${BODY_CLASS} #modelMain #searchList .b3-list-item__text {
  font-size: 14px;
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}
body.${BODY_CLASS} #modelMain #searchList .b3-list-item--two .b3-list-item__meta {
  font-size: 11px;
  line-height: 16px;
  opacity: .55;
  margin-top: 2px;
}
body.${BODY_CLASS} #modelMain #searchList mark {
  background: color-mix(in srgb, var(--b3-theme-primary) 30%, transparent);
  color: inherit;
  font-weight: 600;
  border-radius: 2px;
  padding: 0 1px;
}

/* ── 搜索输入框：加一层浅底，输入区域更明确 ── */
body.${BODY_CLASS} #model .toolbar__search .search__input {
  background: color-mix(in srgb, var(--b3-theme-on-surface) 6%, transparent);
  border-radius: 10px;
  padding: 0 10px;
  box-sizing: border-box;
}

/* ── 计数行 ── */
body.${BODY_CLASS} #modelMain [data-type="result"] {
  font-size: 12px;
  opacity: .65;
}

/* ── 底部工具栏：图标 + 文字标签，放不下时可横向滑动 ── */
body.${BODY_CLASS} #modelMain .tc-search-bottom {
  justify-content: center;
  justify-content: safe center;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0 6px;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
body.${BODY_CLASS} #modelMain .tc-search-bottom::-webkit-scrollbar {
  display: none;
}
/* 原生的两个弹性占位不再需要 */
body.${BODY_CLASS} #modelMain .tc-search-bottom > .fn__flex-1 {
  display: none;
}
body.${BODY_CLASS} #modelMain .tc-search-btn {
  flex: none;
  /* 容器只做布局：不接管任何点击，图标本身的点击行为完全保持原生 */
  pointer-events: none;
  min-width: 38px;
  padding: 0 3px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  box-sizing: border-box;
}
body.${BODY_CLASS} #modelMain .tc-search-btn > svg {
  pointer-events: auto;
}
body.${BODY_CLASS} #modelMain .tc-search-btn-label {
  font-size: 11px;
  line-height: 1.15;
  opacity: .72;
  white-space: nowrap;
  pointer-events: none;
  transform: translateY(-1px);
}
/* 分组分隔线：替换 │ 范围 · 展开 │ 更多 */
body.${BODY_CLASS} #modelMain .tc-search-btn[data-group-start="1"] {
  border-left: .5px solid var(--b3-border-color);
  margin-left: 4px;
  padding-left: 6px;
}
/* 禁用态（include / currentPath 会被原生置 disabled） */
body.${BODY_CLASS} #modelMain .tc-search-btn:has(> svg[disabled]) .tc-search-btn-label {
  opacity: .28;
}
`
