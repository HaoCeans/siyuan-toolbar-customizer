/**
 * 斜杠菜单工具栏样式（独立文件）
 *
 * 与思源自带键盘工具条（.keyboard）逐项对齐：颜色、透明度、边框、圆角、间距全部走 --b3-* 变量，
 * 不叠加毛玻璃以外的额外滤镜，夜间模式与第三方主题自动跟随。
 */

export const SLASH_TOOLBAR_STYLE_ID = 'sy-mb-style'

export const SLASH_TOOLBAR_CSS = `
:root {
  /* 内容区高度（与官方 .keyboard 一致：48px） */
  --sy-mb-bar-h: 48px;
  /* 系统手势区 / 导航栏安全边距 */
  --sy-mb-safe: env(safe-area-inset-bottom, 0px);
  /* 被原生底栏占据的高度，由脚本实测写入 */
  --sy-mb-stack: 0px;
  --sy-mb-offset: 0px;
  /* 层级：高于 protyle 工具条，低于思源菜单/对话框 */
  --sy-mb-z: 205;

  /* 官方分割线/描边色；第三方主题未定义时回退到 --b3-border-color */
  --sy-mb-line: var(--b3-theme-surface-lighter, var(--b3-border-color, rgba(127, 127, 127, .22)));
}

/* --------------------------------------------------------------- 工具条容器 */
#syMobileToolbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: var(--sy-mb-offset, 0px);
  z-index: var(--sy-mb-z);

  box-sizing: border-box;
  height: calc(var(--sy-mb-bar-h) + var(--sy-mb-safe));
  padding: 0 max(4px, env(safe-area-inset-left, 0px)) var(--sy-mb-safe)
               max(4px, env(safe-area-inset-right, 0px));

  display: flex;
  align-items: stretch;
  justify-content: space-between;
  flex-wrap: nowrap;

  background: var(--b3-theme-background);
  border-top: 1px solid var(--sy-mb-line);

  font-family: var(--b3-font-family, inherit);
  color: var(--b3-theme-on-surface, var(--b3-theme-on-background, #333));

  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;

  /* 工具条本身不做过渡：键盘弹出/收起时直接出现或消失。
     二级抽屉面板（#syMobileToolbarSheet）的动画在下面单独保留。 */
}

/* 收起态：整条移出屏幕，避免遮挡 */
#syMobileToolbar.sy-mb-hidden {
  transform: translateY(calc(100% + var(--sy-mb-offset, 0px) + 6px));
  opacity: 0;
  pointer-events: none;
}

/* 未启用时（非移动端 / 未开启开关）不渲染 */
body:not(.sy-mb-enabled) #syMobileToolbar,
body:not(.sy-mb-enabled) #syMobileToolbarSheet {
  display: none !important;
}

/* ------------------------------------------------------------------- 按钮 */
.sy-mb-btn {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  height: var(--sy-mb-bar-h);
  margin: 0;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  -webkit-appearance: none;
  appearance: none;
  font: inherit;
  color: var(--b3-theme-on-surface, var(--b3-theme-on-background, #333));
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 按下 / 选中态：与官方 .protyle-toolbar__item--current svg 一致 */
.sy-mb-btn.sy-mb-press .sy-mb-icon,
.sy-mb-btn.sy-mb-press .sy-mb-text {
  background-color: var(--b3-list-hover, rgba(127, 127, 127, .14));
}

/* 忙碌 / 不可用：官方 [disabled] 的透明度 */
.sy-mb-btn.sy-mb-busy {
  opacity: .38;
}

/* 图标：思源自带 symbol（<use xlink:href="#iconXxx">）
   尺寸 / 内边距 / 外边距 / 圆角照抄官方 .keyboard__action svg */
.sy-mb-icon {
  box-sizing: content-box;
  width: 20px;
  height: 20px;
  padding: 11px 7px;
  margin: 3px;
  border-radius: var(--b3-border-radius, 4px);
  display: block;
  fill: currentColor;
  stroke: none;
}

/* 回退用的线性图标（思源 symbol 尚未注入 / 不存在时） */
.sy-mb-icon--line {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* 窄屏收一点横向内边距，避免图标被挤扁 */
@media (max-width: 400px) {
  .sy-mb-icon { padding: 11px 5px; }
}
@media (max-width: 360px) {
  .sy-mb-icon { padding: 11px 3px; }
}

/* 文字型按钮：与官方 .keyboard__action span 一致 */
.sy-mb-text {
  padding: 6px;
  border-radius: var(--b3-border-radius, 4px);
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: .01em;
  line-height: 1;
  white-space: nowrap;
}

/* 分组分隔线：对齐官方 .keyboard__split */
.sy-mb-sep {
  flex: 0 0 auto;
  align-self: center;
  width: 1px;
  height: 28px;
  margin: 0;
  background-color: var(--sy-mb-line);
}

/* ----------------------------------------------------------- 底部选择面板 */
#syMobileToolbarSheet {
  position: fixed;
  inset: 0;
  z-index: 240;
}

.sy-mb-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, .32);
  opacity: 0;
  transition: opacity .2s linear;
}

#syMobileToolbarSheet.sy-mb-open .sy-mb-mask {
  opacity: 1;
}

.sy-mb-panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: 62vh;
  display: flex;
  flex-direction: column;
  border-radius: 14px 14px 0 0;
  border-top: 1px solid var(--sy-mb-line);
  background: var(--b3-theme-surface, var(--b3-theme-background, #fff));
  color: var(--b3-theme-on-background, var(--b3-theme-on-surface, #333));
  transform: translateY(101%);
  transition: transform .26s cubic-bezier(.32, .72, 0, 1);
  padding-bottom: var(--sy-mb-safe);
}

#syMobileToolbarSheet.sy-mb-open .sy-mb-panel {
  transform: translateY(0);
  will-change: transform;
}

/* 小横条的触摸热区：比横条本身大，方便手指按住下滑关闭面板 */
.sy-mb-grip-zone {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 9px 0 7px;
  margin: -2px 0 0;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  cursor: grab;
}

.sy-mb-grip {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--sy-mb-line);
}

.sy-mb-list {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 2px 8px 10px;
}

/* 对齐官方 .keyboard__slash-item */
.sy-mb-item {
  display: flex;
  align-items: center;
  min-height: 50px;
  margin: 4px 0;
  padding: 0 8px;
  border: 0;
  border-radius: var(--b3-border-radius, 4px);
  background-color: var(--b3-theme-background, #fff);
  box-shadow: inset 0 0 0 1px var(--b3-border-color, rgba(127, 127, 127, .2));
  color: var(--b3-theme-on-background, var(--b3-theme-on-surface, #333));
  font-size: 14.5px;
  -webkit-user-select: none;
  user-select: none;
}

.sy-mb-item:active {
  background-color: var(--b3-list-hover, rgba(127, 127, 127, .14));
}

/* 面板行图标：对齐官方 .keyboard__slash-icon（20x20 / margin 6px） */
.sy-mb-item-icon {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: content-box;
  width: 20px;
  height: 20px;
  margin: 6px;
  overflow: hidden;
  color: var(--b3-theme-on-surface, var(--b3-theme-on-background, #333));
}

.sy-mb-item-icon .sy-mb-icon {
  width: 20px;
  height: 20px;
  padding: 0;
  margin: 0;
}

.sy-mb-item-text {
  flex: 1 1 auto;
  min-width: 0;
}

.sy-mb-empty {
  padding: 18px 12px 24px;
  text-align: center;
  font-size: 13px;
  color: var(--b3-theme-on-surface, var(--b3-theme-on-background, #333));
}

/* 为正文留出底部空间（默认关闭，需要时给 body 加 sy-mb-pad） */
body.sy-mb-pad .protyle-wysiwyg {
  padding-bottom: calc(var(--sy-mb-bar-h) + var(--sy-mb-safe) + var(--sy-mb-stack) + 24px) !important;
}
`

let injected = false

/** 注入样式（幂等） */
export function injectSlashToolbarStyle(): void {
  if (injected && document.getElementById(SLASH_TOOLBAR_STYLE_ID)) {
    return
  }
  const existing = document.getElementById(SLASH_TOOLBAR_STYLE_ID)
  if (existing) {
    injected = true
    return
  }
  const style = document.createElement('style')
  style.id = SLASH_TOOLBAR_STYLE_ID
  style.textContent = SLASH_TOOLBAR_CSS
  document.head.appendChild(style)
  injected = true
}

/** 移除样式 */
export function removeSlashToolbarStyle(): void {
  document.getElementById(SLASH_TOOLBAR_STYLE_ID)?.remove()
  injected = false
}
