/**
 * 手机端设置页章节导航
 *
 * 在设置对话框滚动容器顶部插入一条粘性胶囊导航：
 * - 点击胶囊 → 平滑滚动到对应章节
 * - 滚动设置页 → 自动高亮当前章节，并把当前胶囊滚进可视区
 * - 底部细进度条显示整页滚动位置
 *
 * 导航本身是 `.b3-dialog__content` 的直接子元素，才能在整个设置页范围内保持 sticky；
 * 若挂在某个 `.config-item` 里，粘性范围会被该设置项的高度限制。
 */

import { t } from '@/i18n/runtime'

interface IMobileSettingsNavSection {
  id: string
  labelKey: string
  fallback: string
}

const NAV_CLASS = 'tc-mobile-nav'
const NAV_STYLE_ID = 'toolbar-customizer-mobile-nav-style'
const ACCENT = '#8e24aa'

const SECTIONS: IMobileSettingsNavSection[] = [
  {
    id: 'mobile-settings-nav-slash',
    labelKey: 'settings.mobile.nav.slash',
    fallback: '菜单',
  },
  {
    id: 'mobile-settings-nav-buttons',
    labelKey: 'settings.mobile.nav.buttons',
    fallback: '按钮',
  },
  {
    id: 'mobile-settings-nav-global-buttons',
    labelKey: 'settings.mobile.nav.globalButtons',
    fallback: '全局',
  },
  {
    id: 'mobile-settings-nav-toolbar',
    labelKey: 'settings.mobile.nav.toolbar',
    fallback: '工具栏',
  },
  {
    id: 'mobile-settings-nav-position',
    labelKey: 'settings.mobile.nav.position',
    fallback: '位置',
  },
  {
    id: 'quick-note-settings-section',
    labelKey: 'settings.mobile.nav.quickNote',
    fallback: '记事',
  },
  {
    id: 'mobile-settings-nav-features',
    labelKey: 'settings.mobile.nav.features',
    fallback: '小功能',
  },
  {
    id: 'mobile-settings-nav-activation',
    labelKey: 'settings.mobile.nav.activation',
    fallback: '激活',
  },
]

let injectTimer: ReturnType<typeof setTimeout> | null = null
const scrollCleanupByContent = new WeakMap<HTMLElement, () => void>()

function ensureStyle(): void {
  if (document.getElementById(NAV_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = NAV_STYLE_ID
  style.textContent = `
    .${NAV_CLASS} {
      position: sticky;
      top: 0;
      z-index: 40;
      flex: none;
      box-sizing: border-box;
      width: 100%;
      margin: 0;
      padding: 8px 16px 0;
      background: var(--b3-theme-surface);
      border-bottom: 1px solid color-mix(in srgb, var(--b3-border-color) 72%, transparent);
    }
    .${NAV_CLASS}__scroller {
      display: flex;
      align-items: center;
      gap: 7px;
      overflow-x: auto;
      padding: 2px 2px 8px;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
      -webkit-mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 24px), transparent 100%);
      mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 24px), transparent 100%);
    }
    .${NAV_CLASS}__scroller::-webkit-scrollbar {
      display: none;
    }
    .${NAV_CLASS}__chip {
      flex: 0 0 auto;
      border: 0;
      border-radius: 999px;
      padding: 8px 13px;
      background: var(--b3-theme-background);
      color: var(--b3-theme-on-surface);
      font-family: inherit;
      font-size: 12.5px;
      font-weight: 600;
      line-height: 1;
      white-space: nowrap;
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--b3-border-color) 90%, transparent);
      transition: background-color .16s ease, color .16s ease, box-shadow .16s ease;
    }
    .${NAV_CLASS}__chip.is-active {
      background: ${ACCENT};
      color: #fff;
      box-shadow: 0 2px 7px color-mix(in srgb, ${ACCENT} 32%, transparent);
    }
    .${NAV_CLASS}__chip:active {
      opacity: .82;
    }
    .${NAV_CLASS}__progress {
      height: 2px;
      margin: 0 -16px;
      overflow: hidden;
      background: color-mix(in srgb, var(--b3-border-color) 55%, transparent);
    }
    .${NAV_CLASS}__progress > span {
      display: block;
      width: 100%;
      height: 100%;
      background: ${ACCENT};
      transform: scaleX(0);
      transform-origin: 0 50%;
      transition: transform .08s linear;
    }
    @media (prefers-reduced-motion: reduce) {
      .${NAV_CLASS}__chip,
      .${NAV_CLASS}__progress > span {
        transition: none;
      }
      .${NAV_CLASS}__scroller {
        scroll-behavior: auto;
      }
    }
  `
  document.head.appendChild(style)
}

interface ISettingsDialogParts {
  content: HTMLElement
  body: HTMLElement
}

function findSettingsContent(): ISettingsDialogParts | null {
  const dialogs = [...document.querySelectorAll('.b3-dialog')] as HTMLElement[]
  // 多次打开设置时取最后一个匹配的对话框（DOM 后出现的才是当前这次）
  const dialog = dialogs
    .filter((item) => item.getAttribute('data-plugin-dialog') === 'toolbar-customizer'
      || item.querySelector('#mobile-settings-nav-buttons'))
    .pop()
  const content = dialog?.querySelector('.b3-dialog__content') as HTMLElement | null
  const body = dialog?.querySelector('.b3-dialog__body') as HTMLElement | null
  if (!content || !body) return null
  // 等设置项真正渲染出来再注入，避免把导航插到空容器里
  if (!content.querySelector('#mobile-settings-nav-buttons') || !content.querySelector('#mobile-settings-nav-activation')) {
    return null
  }
  return {
    content,
    body,
  }
}

function buildNav(content: HTMLElement): HTMLElement | null {
  const anchors = SECTIONS
    .map((section) => ({
      ...section,
      el: content.querySelector(`#${section.id}`) as HTMLElement | null,
    }))
    .filter((section): section is IMobileSettingsNavSection & { el: HTMLElement } => section.el !== null)
  if (anchors.length < 2) return null

  const nav = document.createElement('div')
  nav.className = NAV_CLASS
  nav.setAttribute('role', 'navigation')
  nav.setAttribute('aria-label', t('settings.mobile.nav.aria', undefined, '设置章节导航'))

  const scroller = document.createElement('div')
  scroller.className = `${NAV_CLASS}__scroller`

  const progress = document.createElement('div')
  progress.className = `${NAV_CLASS}__progress`
  const progressBar = document.createElement('span')
  progress.appendChild(progressBar)

  const chips = new Map<string, HTMLButtonElement>()
  let currentId = ''
  let ticking = false

  const prefersReducedMotion = (): boolean =>
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

  const centerChip = (chip: HTMLButtonElement): void => {
    const chipRect = chip.getBoundingClientRect()
    const scrollerRect = scroller.getBoundingClientRect()
    if (chipRect.left >= scrollerRect.left && chipRect.right <= scrollerRect.right) return
    const left = scroller.scrollLeft + chipRect.left - scrollerRect.left - (scroller.clientWidth - chipRect.width) / 2
    scroller.scrollTo({
      left: Math.max(0, left),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }

  const setActive = (id: string): void => {
    if (id === currentId) return
    currentId = id
    chips.forEach((chip, chipId) => {
      const active = chipId === id
      chip.classList.toggle('is-active', active)
      if (active) chip.setAttribute('aria-current', 'true')
      else chip.removeAttribute('aria-current')
    })
    const chip = chips.get(id)
    if (chip) centerChip(chip)
  }

  const update = (): void => {
    ticking = false
    const maxScroll = content.scrollHeight - content.clientHeight
    const ratio = maxScroll > 0 ? Math.min(1, Math.max(0, content.scrollTop / maxScroll)) : 0
    progressBar.style.transform = `scaleX(${ratio})`

    // 导航在滚动区外，以滚动区顶部为基准：最后一个“顶部已越过滚动区顶部”的章节就是当前章节
    const contentTop = content.getBoundingClientRect().top
    let active = anchors[0]
    for (const anchor of anchors) {
      if (anchor.el.getBoundingClientRect().top <= contentTop + 16) active = anchor
    }
    // 滚到最底部时强制高亮最后一章，避免最后一组内容太短、标题始终到不了导航条下方
    if (maxScroll > 4 && content.scrollTop >= maxScroll - 4) {
      active = anchors[anchors.length - 1]
    }
    setActive(active.id)
  }

  const requestUpdate = (): void => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(update)
  }

  const scrollToSection = (id: string): void => {
    const anchor = anchors.find((item) => item.id === id)
    if (!anchor) return
    setActive(id)
    const contentRect = content.getBoundingClientRect()
    const top = anchor.el.getBoundingClientRect().top - contentRect.top + content.scrollTop - 10
    content.scrollTo({
      top: Math.max(0, top),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }

  SECTIONS.forEach((section) => {
    const anchor = anchors.find((item) => item.id === section.id)
    if (!anchor) return
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = `${NAV_CLASS}__chip`
    chip.textContent = t(section.labelKey, undefined, section.fallback)
    chip.addEventListener('click', () => scrollToSection(section.id))
    chips.set(section.id, chip)
    scroller.appendChild(chip)
  })

  nav.appendChild(scroller)
  nav.appendChild(progress)
  // 同一个对话框容器重复注入时，先移除旧监听，避免监听器叠加
  scrollCleanupByContent.get(content)?.()
  content.addEventListener('scroll', requestUpdate, { passive: true })
  scrollCleanupByContent.set(content, () => content.removeEventListener('scroll', requestUpdate))
  requestAnimationFrame(update)
  // 对话框打开动画结束后再校准一次
  setTimeout(update, 300)
  return nav
}

/**
 * 在手机端设置对话框顶部注入章节导航。
 * 设置项由 createMobileSettingLayout 同步创建，但对话框要等 setting.open() 后才进 DOM，
 * 所以这里用短轮询等待容器和章节锚点。
 */
export function injectMobileSettingsNav(): void {
  if (injectTimer) {
    clearTimeout(injectTimer)
    injectTimer = null
  }
  document.querySelectorAll(`.${NAV_CLASS}`).forEach((el) => el.remove())

  let attempts = 0
  const tryInject = (): void => {
    injectTimer = null
    const parts = findSettingsContent()
    if (!parts) {
      if (++attempts < 50) injectTimer = setTimeout(tryInject, 100)
      return
    }
    if (parts.body.querySelector(`.${NAV_CLASS}`)) return
    const nav = buildNav(parts.content)
    if (!nav) {
      if (++attempts < 50) injectTimer = setTimeout(tryInject, 100)
      return
    }
    ensureStyle()
    // 放到滚动内容外面：导航常驻顶部，设置内容在它下方独立滚动，避免顶部露出设置内容
    parts.body.insertBefore(nav, parts.body.firstChild)
  }
  injectTimer = setTimeout(tryInject, 80)
}

/** 清理待注入的轮询（对话框提前关闭时调用，避免无意义的重试） */
export function cleanupMobileSettingsNav(): void {
  if (injectTimer) {
    clearTimeout(injectTimer)
    injectTimer = null
  }
}
