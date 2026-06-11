/**
 * TTS 图标辅助模块 — Apple 风格 SVG 图标按钮
 *
 * 内联 Lucide 风格 SVG 图标（硬编码路径），不依赖运行时 require('lucide')。
 * 原因：Vite CJS 库模式下 require('lucide') 会原样保留到产物中，
 * 但 Electron 渲染进程里 lucide 不是独立模块，运行时找不到。
 * 供 desktopPanel.ts 和 mobilePanel.ts 共用。
 */

// ─── 内联 SVG 图标路径（Lucide 风格，24x24 viewBox）─────────

const SVG_PATHS: Record<string, string> = {
  'skip-back':
    '<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/>',
  'play':
    '<polygon points="6 3 20 12 6 21 6 3"/>',
  'pause':
    '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  'skip-forward':
    '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>',
  'square':
    '<rect width="18" height="18" x="3" y="3" rx="2"/>',
  'volume-2':
    '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>'
    + '<path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>'
    + '<path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
}

/** 生成内联 SVG HTML 字符串 */
export function lucideSvg(name: string, size: number, color?: string): string {
  const paths = SVG_PATHS[name]
  if (!paths) return ''
  const c = color || 'currentColor'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
}

// ─── 图标按钮创建 ──────────────────────────────────────

export interface IconButtonOptions {
  /** 手机端：使用 touchstart/touchend 反馈 */
  isMobile?: boolean
  /** 主按钮：圆形主题色背景 + 阴影（播放/暂停用） */
  isPrimary?: boolean
}

/**
 * 创建一个 Apple 风格的 SVG 图标按钮
 * - 桌面端：hover 阴影 + mousedown 缩放
 * - 手机端：touchstart 缩放 + touchend 恢复
 * - isPrimary：圆形主题色背景（播放/暂停按钮）
 */
export function createIconButton(
  iconName: string,
  title: string,
  size: number,
  onclick: () => void,
  options: IconButtonOptions = {},
): HTMLElement {
  const btn = document.createElement('div')
  btn.title = title
  btn.innerHTML = lucideSvg(iconName, size)

  const baseSize = options.isPrimary ? 42 : 36
  const iconSize = options.isPrimary ? Math.round(size * 0.9) : size

  if (options.isPrimary) {
    // 固定颜色：白色图标在深色圆上，暗黑/明亮模式一致
    btn.innerHTML = lucideSvg(iconName, iconSize, '#ffffff')
    btn.style.cssText = `
      width:${baseSize}px;height:${baseSize}px;min-width:${baseSize}px;
      border-radius:50%;
      background:#1d1d1f;
      color:#ffffff;
      display:inline-flex;align-items:center;justify-content:center;
      cursor:pointer;border:none;
      box-shadow:0 2px 8px rgba(0,0,0,0.25);
      transition:transform 0.15s cubic-bezier(0.4,0,0.2,1), box-shadow 0.15s;
    `
  } else {
    btn.innerHTML = lucideSvg(iconName, iconSize)
    btn.style.cssText = `
      width:${baseSize}px;height:${baseSize}px;min-width:${baseSize}px;
      border-radius:50%;
      display:inline-flex;align-items:center;justify-content:center;
      cursor:pointer;border:none;background:none;
      color:var(--b3-theme-on-surface);
      transition:background 0.2s,transform 0.15s cubic-bezier(0.4,0,0.2,1);
    `
  }

  // 让 SVG 继承颜色
  const svg = btn.querySelector('svg')
  if (svg) {
    svg.style.pointerEvents = 'none'
  }

  if (options.isMobile) {
    // 手机端触摸反馈
    btn.addEventListener('touchstart', () => {
      btn.style.transform = 'scale(0.88)'
      if (!options.isPrimary) btn.style.background = 'rgba(128,128,128,0.12)'
    }, { passive: true })
    btn.addEventListener('touchend', () => {
      btn.style.transform = 'scale(1)'
      if (!options.isPrimary) btn.style.background = 'none'
    }, { passive: true })
    // 手机端点击
    let touched = false
    btn.addEventListener('touchstart', (e) => {
      touched = true
      e.preventDefault()
      e.stopPropagation()
      onclick()
    }, { passive: false })
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      if (touched) { touched = false; return }
      onclick()
    })
  } else {
    // 桌面端悬停反馈
    if (!options.isPrimary) {
      btn.onmouseenter = () => { btn.style.background = 'color-mix(in srgb, var(--b3-theme-on-surface) 8%, transparent)' }
      btn.onmouseleave = () => { btn.style.background = 'none'; btn.style.transform = 'scale(1)' }
    } else {
      btn.onmouseenter = () => { btn.style.boxShadow = '0 4px 14px rgba(0,0,0,0.35)' }
      btn.onmouseleave = () => { btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)'; btn.style.transform = 'scale(1)' }
    }
    btn.onmousedown = () => { btn.style.transform = 'scale(0.9)' }
    btn.onmouseup = () => { btn.style.transform = 'scale(1)' }
    btn.onclick = (e) => { e.stopPropagation(); onclick() }
  }

  return btn
}

/**
 * 更新按钮内的 SVG 图标（用于播放/暂停切换）
 */
export function updateButtonIcon(btn: HTMLElement, iconName: string, size: number, isPrimary = false): void {
  if (!btn) return
  const color = isPrimary ? '#ffffff' : undefined
  btn.innerHTML = lucideSvg(iconName, size, color)
  const svg = btn.querySelector('svg')
  if (svg) svg.style.pointerEvents = 'none'
}

// ─── 自定义滑杆样式注入 ──────────────────────────────────

let sliderStylesInjected = false

/**
 * 一次性注入 Apple 风格的 range 滑杆样式
 * 使用 #tts-options-overlay 选择器限定范围，不影响全局
 */
export function injectSliderStyles(): void {
  if (sliderStylesInjected) return
  if (document.getElementById('tts-apple-slider-style')) {
    sliderStylesInjected = true
    return
  }

  const style = document.createElement('style')
  style.id = 'tts-apple-slider-style'
  style.textContent = `
    #tts-options-overlay input[type="range"],
    #tts-mobile-overlay input[type="range"] {
      -webkit-appearance: none;
      appearance: none;
      height: 4px;
      border-radius: 2px;
      background: color-mix(in srgb, var(--b3-theme-on-surface) 15%, transparent);
      outline: none;
      cursor: pointer;
    }
    #tts-options-overlay input[type="range"]::-webkit-slider-thumb,
    #tts-mobile-overlay input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--b3-theme-primary);
      cursor: pointer;
      box-shadow: 0 1px 3px rgba(0,0,0,0.15);
      transition: transform 0.15s;
    }
    #tts-options-overlay input[type="range"]::-webkit-slider-thumb:active,
    #tts-mobile-overlay input[type="range"]::-webkit-slider-thumb:active {
      transform: scale(1.15);
    }
    #tts-options-overlay input[type="range"]::-moz-range-thumb,
    #tts-mobile-overlay input[type="range"]::-moz-range-thumb {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--b3-theme-primary);
      cursor: pointer;
      border: none;
      box-shadow: 0 1px 3px rgba(0,0,0,0.15);
    }
  `
  document.head.appendChild(style)
  sliderStylesInjected = true
}
