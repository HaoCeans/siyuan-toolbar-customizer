/**
 * 手机端设置：插件自建的全屏设置面板
 *
 * 不再借用思源原生 Setting 窗口。弹层自己创建 overlay / 头部 / 滚动区 / 底部操作栏，
 * 但**沿用思源对话框的类名契约**，这样已有的设置项构建器、章节导航和滚动还原逻辑都不必改动：
 *
 * - `.b3-dialog` + `data-plugin-dialog="toolbar-customizer"`：章节导航据此识别本面板
 * - `.b3-dialog__body`：章节导航的注入宿主（插在滚动区之前）
 * - `.b3-dialog__content`：滚动容器，导航的 scroll-spy 与 mobile.ts 的滚动还原都查它
 * - 设置行按思源 `Setting.addItem()` 的真实结构渲染（`.fn__flex.b3-label.config__item`），
 *   类名是 `config__item`（双下划线）；mobile.ts 里历史遗留的 `.config-item` 选择器在思源中
 *   并不存在，属于改造前就失效的代码，这里不为它做兼容
 *
 * 底栏「取消 / 保存」由本模块渲染；「取消」只关闭面板（与改造前一致，不回滚即时保存的设置）。
 */

import { showMessage } from 'siyuan'
import { t } from '@/i18n/runtime'
import { logger } from '@/utils/logger'
import { cleanupMobileSettingsNav } from './mobileSettingsNav'

const OVERLAY_ID = 'tc-mobile-settings-overlay'
const STYLE_ID = 'tc-mobile-settings-style'

/**
 * 层级：高于思源自身对话框，低于插件自己的选择器/确认框（2000）与收款码（9999），
 * 这样从设置里打开图标选择器时，选择器仍显示在设置面板之上。
 */
const OVERLAY_Z_INDEX = 1500

/** 设置项的最小接口（与思源 Setting.addItem 的可渲染字段保持一致） */
export interface MobileSettingItem {
  title?: string
  description?: string
  createActionElement?: () => HTMLElement
}

/** 设置项收集器：替代思源 Setting 实例，只暴露 addItem */
export interface MobileSettingSink {
  addItem: (item: MobileSettingItem) => void
}

export type SettingsDialogVariant = 'mobile' | 'desktop'

export interface OpenMobileSettingsOptions {
  title: string
  /** 同步构建全部设置项（现有 createMobileSettingLayout 直接传入即可） */
  build: (sink: MobileSettingSink) => void
  /** 点击「保存」时执行，完成后自动关闭 */
  onConfirm: () => Promise<void> | void
  onClose?: () => void
  /** 弹窗外壳形态：mobile=全屏（默认），desktop=居中浮窗 */
  variant?: SettingsDialogVariant
  /** 桌面浮窗宽度（px，默认 800） */
  width?: number
  /** 桌面浮窗最大高度（默认 90vh） */
  maxHeight?: string
}

interface DialogState {
  overlay: HTMLElement
  restoreScroll: () => void
  onClose?: () => void
  onKeyDown: (event: KeyboardEvent) => void
  onOverlayClick: (event: MouseEvent) => void
  onOverlayPointerDown: (event: Event) => void
}

let state: DialogState | null = null
let saving = false

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #${OVERLAY_ID} {
      animation: tc-ms-fade-in 0.16s ease-out;
    }
    @keyframes tc-ms-fade-in {
      from { opacity: 0; }
    }
    #${OVERLAY_ID} .tc-ms-header {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: none;
      padding: calc(8px + env(safe-area-inset-top)) 12px 8px 16px;
      border-bottom: 1px solid var(--b3-border-color);
      background: var(--b3-theme-surface);
    }
    #${OVERLAY_ID} .tc-ms-header__title {
      flex: 1 1 auto;
      min-width: 0;
      font-size: 16px;
      font-weight: 600;
      line-height: 1.4;
      color: var(--b3-theme-on-background);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #${OVERLAY_ID} .tc-ms-close {
      flex: none;
      padding: 6px 10px;
      font-size: 16px;
      line-height: 1;
      color: var(--b3-theme-on-surface);
    }
    #${OVERLAY_ID} .tc-ms-footer {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: none;
      padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
      border-top: 1px solid var(--b3-border-color);
      background: var(--b3-theme-surface);
    }
    #${OVERLAY_ID} .tc-ms-footer__space {
      flex: 1 1 auto;
    }
    #${OVERLAY_ID} .tc-ms-content {
      /* 内边距与滚动交给思源的 .b3-dialog__content（padding: 16px 24px），
         保持与原生设置窗完全一致，避免设置项里的 -16px 出血布局错位 */
      flex: 1 1 auto;
      min-height: 0;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
    }
  `
  document.head.appendChild(style)
}

function removeStyle(): void {
  document.getElementById(STYLE_ID)?.remove()
}

/** 锁住页面滚动并补偿滚动条宽度，避免打开瞬间整页横跳 */
function lockPageScroll(): () => void {
  const html = document.documentElement
  const body = document.body
  const previous = {
    htmlOverflow: html.style.overflow,
    bodyOverflow: body.style.overflow,
    bodyPaddingRight: body.style.paddingRight,
  }
  const scrollbarWidth = window.innerWidth - html.clientWidth
  html.style.overflow = 'hidden'
  body.style.overflow = 'hidden'
  if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`

  return () => {
    html.style.overflow = previous.htmlOverflow
    body.style.overflow = previous.bodyOverflow
    body.style.paddingRight = previous.bodyPaddingRight
  }
}

/**
 * 把一个 addItem 配置渲染成思源设置行。
 *
 * 结构必须与思源 `Setting.addItem()` 完全一致，否则外观会变：
 * - 纵向（有控件且不是 textarea）：`.fn__flex .b3-label .config__item`
 *   > `.fn__flex-1`（标题 + `.b3-label__text` 说明）+ `.fn__space` + 控件（补 `fn__flex-center fn__size200`）
 * - 横向（无控件或 textarea）：`label|div.b3-label` > `.fn__block`（标题 + 说明 + `.fn__hr`）+ 控件
 *
 * 注意类名是 `config__item`（双下划线）。插件里历史遗留的 `.config-item` 选择器在思源中
 * 并不存在，这里不要"顺便修正"，否则会改变现有手机端设置的外观。
 */
function createSettingRow(item: MobileSettingItem): HTMLElement {
  const actionElement = item.createActionElement?.()
  // 与思源一致：无控件或 textarea 走横向，其余走纵向
  const direction = (!actionElement || actionElement.tagName === 'TEXTAREA') ? 'row' : 'column'
  // 控件本身是 b3-switch 时，整行用 label 包住，点标题也能切换
  const tagName = actionElement?.classList.contains('b3-switch') ? 'label' : 'div'
  const row = document.createElement(tagName)
  row.classList.add('tc-ms-row')

  const appendHead = (target: HTMLElement) => {
    if (item.title) target.insertAdjacentHTML('beforeend', item.title)
    if (item.description) {
      const desc = document.createElement('div')
      desc.className = 'b3-label__text'
      desc.innerHTML = item.description
      target.appendChild(desc)
    }
  }

  if (direction === 'row') {
    row.classList.add('b3-label')
    const block = document.createElement('div')
    block.className = 'fn__block'
    appendHead(block)
    const hr = document.createElement('div')
    hr.className = 'fn__hr'
    block.appendChild(hr)
    if (actionElement) {
      actionElement.classList.add('fn__block')
      block.appendChild(actionElement)
    }
    row.appendChild(block)
    return row
  }

  row.classList.add('fn__flex', 'b3-label', 'config__item')
  const head = document.createElement('div')
  head.className = 'fn__flex-1'
  appendHead(head)

  const space = document.createElement('span')
  space.className = actionElement ? 'fn__space' : 'fn__space fn__none'

  row.appendChild(head)
  row.appendChild(space)
  if (actionElement) {
    actionElement.classList.remove('fn__block')
    actionElement.classList.add('fn__flex-center', 'fn__size200')
    // 思源的 .fn__size200 会把控件钉在 200px，窄控件会与标题并排（不是上下分）。
    // 未显式设置宽度的控件一律铺满整行；分组标题那种自带负边距宽度的保持原样。
    if (!['INPUT', 'TEXTAREA'].includes(actionElement.tagName) && !actionElement.style.width) {
      actionElement.style.width = '100%'
    }
    row.appendChild(actionElement)
  }
  return row
}

/**
 * 设置项收集器。
 *
 * 关键点：`createActionElement()` 必须等布局函数整体执行完再调用。
 * 思源原生 `Setting` 就是先把 addItem 收进数组、`open()` 时才逐个创建元素；
 * 若在布局过程中立即执行，会踩到布局函数里"后面才 const 声明"的变量（TDZ），
 * 抛错后该点之后的全部设置项都会丢失。
 */
function createSettingSink(): {
  sink: MobileSettingSink
  render: (container: HTMLElement) => number
} {
  const items: MobileSettingItem[] = []
  return {
    sink: {
      addItem: (item) => {
        items.push(item)
      },
    },
    render: (container) => {
      let rendered = 0
      items.forEach((item) => {
        try {
          container.appendChild(createSettingRow(item))
          rendered++
        } catch (error) {
          // 单项失败不影响其它设置项
          logger.error('[MobileSettingsDialog] 设置项渲染失败:', item.title, error)
        }
      })
      return rendered
    },
  }
}

/** 面板之上是否还有插件自己的浮层（图标选择器 / 确认框 / 收款码等） */
function hasOverlayAbove(overlay: HTMLElement): boolean {
  const siblings = Array.from(document.body.children)
  const index = siblings.indexOf(overlay)
  if (index < 0) return false
  return siblings.slice(index + 1).some((el) => {
    const htmlEl = el as HTMLElement
    if (htmlEl.id === OVERLAY_ID) return false
    const style = window.getComputedStyle(htmlEl)
    if (style.position !== 'fixed') return false
    return Number.parseInt(style.zIndex || '0', 10) > 1000
  })
}

export function isMobileSettingsDialogOpen(): boolean {
  return state !== null
}

export function openSettingsDialog(options: OpenMobileSettingsOptions): void {
  const isDesktopVariant = options.variant === 'desktop'
  const panelWidth = options.width ?? 800
  const panelMaxHeight = options.maxHeight ?? '90vh'

  // 单例：重复打开（连续点设置入口）先关旧面板，避免叠层
  closeMobileSettingsDialog()

  injectStyle()
  // 手机端全屏面板需要锁页面滚动；桌面浮窗保持原生对话框行为，不锁
  const restoreScroll = isDesktopVariant ? () => {} : lockPageScroll()

  const overlay = document.createElement('div')
  overlay.id = OVERLAY_ID
  overlay.className = 'b3-dialog b3-dialog--open'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  // 章节导航与手机端布局 CSS 都按该属性识别本插件面板
  overlay.setAttribute('data-plugin-dialog', 'toolbar-customizer')
  overlay.style.cssText = isDesktopVariant
    ? `
    position: fixed;
    inset: 0;
    z-index: ${OVERLAY_Z_INDEX};
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: var(--b3-mask-background, rgba(0, 0, 0, 0.32));
  `
    : `
    position: fixed;
    inset: 0;
    z-index: ${OVERLAY_Z_INDEX};
    display: flex;
    flex-direction: column;
    background: var(--b3-theme-background);
  `

  const container = document.createElement('div')
  container.className = 'b3-dialog__container'
  container.style.cssText = isDesktopVariant
    ? `
    display: flex;
    flex-direction: column;
    width: ${panelWidth}px;
    max-width: 92vw;
    height: auto;
    max-height: ${panelMaxHeight};
    margin: 0;
    padding: 0;
    border-radius: var(--b3-border-radius-b, 8px);
    box-shadow: var(--b3-dialog-shadow, 0 12px 48px rgba(0, 0, 0, 0.24));
    overflow: hidden;
    background: var(--b3-theme-surface);
  `
    : `
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 100%;
    height: 100%;
    max-height: 100%;
    margin: 0;
    padding: 0;
    border-radius: 0;
    box-shadow: none;
    overflow: hidden;
    /* 与思源原生对话框容器同色，章节导航的胶囊栏也使用 surface，视觉保持一致 */
    background: var(--b3-theme-surface);
  `

  // ===== 头部：标题 + 关闭 =====
  const header = document.createElement('div')
  header.className = 'tc-ms-header'

  const titleEl = document.createElement('div')
  titleEl.className = 'tc-ms-header__title'
  titleEl.textContent = options.title

  const closeBtn = document.createElement('button')
  closeBtn.type = 'button'
  closeBtn.className = 'b3-button b3-button--text tc-ms-close'
  closeBtn.setAttribute('aria-label', t('ui.mobileSettingsDialog.close', undefined, '关闭'))
  closeBtn.textContent = '✕'
  closeBtn.addEventListener('click', () => closeMobileSettingsDialog())

  header.appendChild(titleEl)
  header.appendChild(closeBtn)

  // ===== 主体：导航注入宿主 + 滚动区 + 底栏 =====
  const body = document.createElement('div')
  body.className = 'b3-dialog__body'
  body.style.cssText = `
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    padding: 0;
    overflow: hidden;
  `

  const content = document.createElement('div')
  content.className = 'b3-dialog__content tc-ms-content'
  const footer = document.createElement('div')
  footer.className = 'tc-ms-footer'

  const cancelBtn = document.createElement('button')
  cancelBtn.type = 'button'
  cancelBtn.className = 'b3-button b3-button--cancel'
  cancelBtn.textContent = t('dialog.cancel', undefined, '取消')
  cancelBtn.addEventListener('click', () => closeMobileSettingsDialog())

  const footerSpace = document.createElement('div')
  footerSpace.className = 'tc-ms-footer__space'

  const saveBtn = document.createElement('button')
  saveBtn.type = 'button'
  saveBtn.className = 'b3-button b3-button--text'
  saveBtn.textContent = t('ui.mobileSettingsDialog.save', undefined, '保存')

  footer.appendChild(cancelBtn)
  footer.appendChild(footerSpace)
  footer.appendChild(saveBtn)

  body.appendChild(content)
  body.appendChild(footer)
  container.appendChild(header)
  container.appendChild(body)
  overlay.appendChild(container)

  // ===== 构建设置项（先收集，挂到文档后再渲染） =====
  const { sink, render } = createSettingSink()
  try {
    options.build(sink)
  } catch (error) {
    logger.error('[MobileSettingsDialog] 构建设置项失败:', error)
    showMessage(t('ui.mobileSettingsDialog.buildFailed', undefined, '设置面板加载失败'), 3000, 'error')
  }

  // ===== 保存 =====
  saveBtn.addEventListener('click', async () => {
    if (saving) return
    saving = true
    saveBtn.disabled = true
    cancelBtn.disabled = true
    closeBtn.disabled = true
    try {
      await options.onConfirm()
      closeMobileSettingsDialog()
    } catch (error) {
      logger.error('[MobileSettingsDialog] 保存失败:', error)
      showMessage(t('ui.mobileSettingsDialog.saveFailed', undefined, '保存失败，请重试'), 3000, 'error')
      saving = false
      saveBtn.disabled = false
      cancelBtn.disabled = false
      closeBtn.disabled = false
    }
  })

  // ===== 关闭：Esc / 点遮罩 =====
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || saving) return
    // 上层还有选择器/确认框时，交给它们先关
    if (hasOverlayAbove(overlay)) return
    closeMobileSettingsDialog()
  }

  // 只有「按下」也发生在遮罩上才视为点击遮罩关闭，
  // 防止从弹窗内部开始拖拽（滑杆等）到外部时被误判为点击遮罩
  let pointerDownOnOverlay = false
  const onOverlayPointerDown = (event: Event) => {
    pointerDownOnOverlay = event.target === overlay
  }
  const onOverlayClick = (event: MouseEvent) => {
    const startedOnOverlay = pointerDownOnOverlay
    pointerDownOnOverlay = false
    if (event.target !== overlay) return
    if (!startedOnOverlay) return
    // 点击弹窗外面 = 关闭（草稿模式下等同取消，改动不生效）
    closeMobileSettingsDialog()
  }

  state = {
    overlay,
    restoreScroll,
    onClose: options.onClose,
    onKeyDown,
    onOverlayClick,
    onOverlayPointerDown,
  }

  // 内容渲染完成前不显示，避免出现「先一个小弹窗、再变成正常弹窗」的中间态
  overlay.style.visibility = 'hidden'
  document.body.appendChild(overlay)
  document.addEventListener('keydown', onKeyDown)
  overlay.addEventListener('click', onOverlayClick)
  overlay.addEventListener('mousedown', onOverlayPointerDown, true)
  overlay.addEventListener('touchstart', onOverlayPointerDown, { capture: true, passive: true })

  // 面板挂进文档后再创建控件：与思源原生行为一致，也让依赖滚动容器的设置项能取到容器
  let rendered = 0
  try {
    rendered = render(content)
  } finally {
    // 无论渲染是否出错都要显示出来，避免面板一直不可见
    overlay.style.visibility = ''
  }
  logger.log('[MobileSettingsDialog] 面板已打开，设置项:', rendered)
}

/** 手机端全屏面板（旧的入口名，内部走通用 openSettingsDialog） */
export function openMobileSettingsDialog(options: OpenMobileSettingsOptions): void {
  openSettingsDialog({ ...options, variant: 'mobile' })
}

/** 关闭面板（保存成功、点取消、点 ✕、按 Esc 都走这里） */
export function closeMobileSettingsDialog(): void {
  const current = state
  if (!current) return
  state = null
  saving = false

  try {
    cleanupMobileSettingsNav()
  } catch (error) {
    logger.warn('[MobileSettingsDialog] 清理章节导航失败:', error)
  }

  document.removeEventListener('keydown', current.onKeyDown)
  current.overlay.removeEventListener('click', current.onOverlayClick)
  current.overlay.removeEventListener('mousedown', current.onOverlayPointerDown, true)
  current.overlay.removeEventListener('touchstart', current.onOverlayPointerDown, true)
  current.overlay.remove()
  current.restoreScroll()

  try {
    current.onClose?.()
  } catch (error) {
    logger.warn('[MobileSettingsDialog] onClose 回调失败:', error)
  }
}

/** 插件卸载时调用：关闭面板并移除注入的样式 */
export function cleanupMobileSettingsDialog(): void {
  closeMobileSettingsDialog()
  removeStyle()
}
