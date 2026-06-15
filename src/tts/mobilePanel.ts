/**
 * 手机端 TTS 面板 — Apple 风格
 *
 * 不依赖浏览器 SpeechSynthesis，不依赖 WebSocket
 * 纯 HTTP API + <audio> + Blob URL 播放，任何 WebView 都能用
 */

import { applyFloatPanelBackground, observeSiYuanThemeMode } from '../ui/floatPanelBackground'
import * as Notify from '../notification'
import { showMessage } from 'siyuan'
import { navigateToAdjacentDoc } from '../ui/mobileDocNav'
import { pluginInstance } from '../toolbarManager'
import {
  getHttpTTSEngine, destroyHttpTTSEngine,
  SF_VOICES, getTTSSettings, saveTTSSettings, getSFAPIConfig, saveSFAPIConfig,
  ensureHighlightStyle, type TTSController,
} from './httpTtsEngine'
import { createIconButton, updateButtonIcon, injectSliderStyles, lucideSvg } from './ttsIconHelper'

// ═══════════════════════════════════════════════════════════════
// 手机端 UI
// ═══════════════════════════════════════════════════════════════

let overlay: HTMLElement | null = null
let bar: HTMLElement | null = null
let visHandler: (() => void) | null = null
let panelThemeUnsub: (() => void) | null = null
let barThemeUnsub: (() => void) | null = null

/** 朗读完成后动作：'stop' | 'next' | 'prev' */
let autoReadAction: 'stop' | 'next' | 'prev' = 'stop'

// ─── 导出 ──

export async function showTTSOptionsMobile(): Promise<void> {
  console.log('[TTS] showTTSOptionsMobile 被调用')
  ensureHighlightStyle()

  const engine = getHttpTTSEngine()
  const total = await engine.extractParagraphsAsync()
  console.log(`[TTS] 提取段落: ${total} 段`)
  if (total === 0) { Notify.showErrorCommandCannotExecute('当前页面没有可朗读的内容'); return }

  if (!engine.isIdle) { engine.stop(); removeBar() }
  showTTSPanel(total)
}

export function cleanupMobileTTS(): void {
  removeOverlay(); removeBar(); removeVis()
  destroyHttpTTSEngine()
}

// ─── 面板 ──

function showTTSPanel(total: number): void {
  removeOverlay()
  injectSliderStyles()

  // 遮罩（毛玻璃）
  const ov = document.createElement('div')
  ov.id = 'tts-mobile-overlay'
  ov.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.3);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:flex-end;justify-content:center;z-index:2000;'

  // 卡片（毛玻璃面板）
  const card = document.createElement('div')
  card.style.cssText = `
    border-radius:16px 16px 0 0;
    box-shadow:0 -8px 32px rgba(0,0,0,0.12),inset 0 1px 0 rgba(255,255,255,0.15);
    backdrop-filter:blur(40px) saturate(180%);-webkit-backdrop-filter:blur(40px) saturate(180%);
    width:100%;max-width:420px;padding:22px 20px 30px;
    color:var(--b3-theme-on-background);max-height:80vh;overflow-y:auto;
  `
  applyFloatPanelBackground(card, undefined, 0.85)
  panelThemeUnsub = observeSiYuanThemeMode(() => applyFloatPanelBackground(card, undefined, 0.85))
  card.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: false })

  // 标题（SVG 图标 + 文字）
  const header = document.createElement('div')
  header.style.cssText = `
    font-size:17px;font-weight:600;margin-bottom:16px;
    letter-spacing:-0.02em;
    display:flex;align-items:center;gap:8px;
  `
  header.innerHTML = `<span style="display:inline-flex;align-items:center;color:var(--b3-theme-primary)">${lucideSvg('volume-2', 20)}</span> 朗读设置`
  card.appendChild(header)

  // ── 模式切换（Apple 分段控件）──
  const savedConfig = getSFAPIConfig()
  const hasApiToken = !!savedConfig.apiKey
  const lastMode = getTTSSettings().lastMode
  const defaultMode = lastMode || (hasApiToken ? 'api' : 'free')

  const modeBar = document.createElement('div')
  modeBar.style.cssText = `
    display:flex;
    background:color-mix(in srgb, var(--b3-theme-on-surface) 8%, transparent);
    border-radius:10px;padding:2px;gap:0;margin-bottom:16px;
  `

  const modeFree = document.createElement('div')
  modeFree.textContent = '免费（不稳定）'
  modeFree.style.cssText = `
    flex:1;padding:8px 0;border-radius:8px;text-align:center;
    font-size:13px;font-weight:500;letter-spacing:-0.01em;
    cursor:pointer;border:none;background:transparent;
    color:var(--b3-theme-on-background);
    transition:all 0.25s cubic-bezier(0.4,0,0.2,1);
    user-select:none;
  `

  const modeApi = document.createElement('div')
  modeApi.textContent = '硅基流动'
  modeApi.style.cssText = `
    flex:1;padding:8px 0;border-radius:8px;text-align:center;
    font-size:13px;font-weight:500;letter-spacing:-0.01em;
    cursor:pointer;border:none;background:transparent;
    color:var(--b3-theme-on-background);
    transition:all 0.25s cubic-bezier(0.4,0,0.2,1);
    user-select:none;
  `

  modeBar.appendChild(modeFree)
  modeBar.appendChild(modeApi)
  card.appendChild(modeBar)

  // ── 内容区 ──
  const content = document.createElement('div')
  card.appendChild(content)

  // ── 朗读完成后动作选择 ──
  const autoReadRow = document.createElement('div')
  autoReadRow.style.cssText = 'margin-top: 6px; margin-bottom: 8px;'
  const autoLabel = document.createElement('div')
  autoLabel.textContent = '朗读完成后'
  autoLabel.style.cssText = 'font-size:13px;margin-bottom:6px;opacity:0.6;font-weight:500;letter-spacing:-0.01em;'
  autoReadRow.appendChild(autoLabel)
  const autoSel = document.createElement('select')
  autoSel.style.cssText = `
    width:100%;padding:10px 14px;border-radius:10px;
    border:none;
    background:color-mix(in srgb, var(--b3-theme-on-surface) 6%, transparent);
    color:var(--b3-theme-on-background);font-size:15px;
    letter-spacing:-0.01em;outline:none;
    -webkit-appearance:none;appearance:none;
  `
  const autoOpts: Array<{ v: string; t: string }> = [
    { v: 'stop', t: '停止' },
    { v: 'next', t: '自动继续朗读下一篇' },
    { v: 'prev', t: '自动继续朗读上一篇' },
  ]
  for (const o of autoOpts) { const opt = document.createElement('option'); opt.value = o.v; opt.textContent = o.t; autoSel.appendChild(opt) }
  // 从已保存的设置恢复
  const savedAutoAction = getTTSSettings().autoReadAction || 'stop'
  autoSel.value = savedAutoAction
  autoReadAction = savedAutoAction
  autoReadRow.appendChild(autoSel)
  card.appendChild(autoReadRow)

  function activateMode(mode: string) {
    // Apple 分段控件：激活项浮起 + 阴影，非激活项半透明
    if (mode === 'free') {
      modeFree.style.background = 'var(--b3-theme-surface)'
      modeFree.style.opacity = '1'
      modeFree.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)'
      modeApi.style.background = 'transparent'
      modeApi.style.opacity = '0.55'
      modeApi.style.boxShadow = 'none'
    } else {
      modeApi.style.background = 'var(--b3-theme-surface)'
      modeApi.style.opacity = '1'
      modeApi.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)'
      modeFree.style.background = 'transparent'
      modeFree.style.opacity = '0.55'
      modeFree.style.boxShadow = 'none'
    }

    content.innerHTML = ''
    if (mode === 'free') renderFreeContent(content, total, autoSel)
    else renderApiContent(content, total, autoSel)
  }

  bindTap(modeFree, () => activateMode('free'))
  bindTap(modeApi, () => activateMode('api'))
  activateMode(defaultMode)

  ov.appendChild(card)
  ov.addEventListener('touchstart', (e) => { if (e.target === ov) removeOverlay() }, { passive: false })
  document.body.appendChild(ov)
  overlay = ov
}

/** 免费模式面板 */
function renderFreeContent(container: HTMLElement, total: number, autoSel?: HTMLSelectElement): void {
  const settings = getTTSSettings()

  const hint = document.createElement('div')
  hint.style.cssText = 'font-size:11px;opacity:0.5;margin-bottom:14px;letter-spacing:-0.01em;'
  hint.textContent = '使用百度翻译接口，免费但可能随时失效。音色需切换到「百度API」模式'
  container.appendChild(hint)

  // 语速
  const rateRow = makeRow('语速')
  const rateBox = document.createElement('div')
  rateBox.style.cssText = 'display:flex;align-items:center;gap:8px'
  const rateSlider = document.createElement('input')
  rateSlider.type = 'range'; rateSlider.min = '0'; rateSlider.max = '15'
  rateSlider.step = '1'; rateSlider.value = String(settings.speed); rateSlider.style.cssText = 'flex:1'
  const rateLabel = document.createElement('span')
  rateLabel.textContent = String(settings.speed)
  rateLabel.style.cssText = 'min-width:36px;text-align:right;font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;'
  rateSlider.oninput = () => { rateLabel.textContent = rateSlider.value }
  rateBox.appendChild(rateSlider); rateBox.appendChild(rateLabel)
  rateRow.appendChild(rateBox)
  container.appendChild(rateRow)

  // 范围
  const rangeRow = makeRow('范围')
  const rangeSel = makeSelect(buildRangeOptions(total))
  rangeRow.appendChild(rangeSel)
  container.appendChild(rangeRow)

  // 按钮
  const btns = makeBtnRow()
  bindTap(btns.cancel, () => removeOverlay())
  bindTap(btns.confirm, async () => {
    autoReadAction = autoSel?.value || 'stop'
    saveTTSSettings({ autoReadAction })
    const speed = parseInt(rateSlider.value)
    saveTTSSettings({ speed, lastMode: 'free' })

    let startP = 0, endP: number | undefined
    parseRange(rangeSel.value, total, (s, e) => { startP = s; endP = e })
    removeOverlay()

    const engine = getHttpTTSEngine()
    engine.setSpeed(speed)
    engine.setMode('free')
    await engine.extractParagraphsAsync()

    engine.onStateChange = (st, idx, tot) => updateBar(st, idx, tot)
    engine.onError = (msg) => { Notify.showErrorCommandCannotExecute(msg); removeBar() }
    engine.onFinish = async () => {
      if (autoReadAction === 'stop') {
        const s = bar?.querySelector('#tm-s') as HTMLElement
        if (s) s.textContent = '朗读完成'
        engine.onStateChange = () => {}
        await engine.speakOnce('本文档已经朗读完成', () => removeBar())
        return
      }
      const success = await navigateToAdjacentDoc(autoReadAction)
      if (!success) { removeBar(); showMessage('已无更多文档', 2000, 'info'); return }
      await waitForDocLoaded()
      await engine.extractParagraphsAsync()
      engine.speak(0, undefined)
    }
    createBar(engine)
    engine.speak(startP, endP)
    setupVis(engine)
  })
  container.appendChild(btns.wrap)
}

/** 硅基流动 API 模式面板 */
function renderApiContent(container: HTMLElement, total: number, autoSel?: HTMLSelectElement): void {
  const cfg = getSFAPIConfig()
  const settings = getTTSSettings()

  // 说明 + 链接
  const hintRow = document.createElement('div')
  hintRow.style.cssText = 'margin-bottom:14px'
  const hint = document.createElement('div')
  hint.style.cssText = 'font-size:11px;opacity:0.5;margin-bottom:8px;letter-spacing:-0.01em;'
  hint.textContent = '硅基流动 CosyVoice2 语音合成，中文质量高，约 ¥50/百万字符'
  hintRow.appendChild(hint)
  const link = document.createElement('a')
  link.href = 'https://cloud.siliconflow.cn/account/ak'
  link.target = '_blank'
  link.textContent = '前往获取 API Key →'
  link.style.cssText = `
    display:inline-block;font-size:13px;
    color:var(--b3-theme-primary);
    text-decoration:none;
    font-weight:500;letter-spacing:-0.01em;
    padding:4px 0;margin-bottom:4px;
    border-bottom:1px solid color-mix(in srgb, var(--b3-theme-primary) 30%, transparent);
  `
  hintRow.appendChild(link)
  container.appendChild(hintRow)

  // API Key 输入
  const keyRow = makeRow('API Key')
  const keyInput = document.createElement('input')
  keyInput.type = 'text'
  keyInput.value = cfg.apiKey
  keyInput.placeholder = '粘贴硅基流动 API Key（sk-xxx）'
  keyInput.style.cssText = `
    width:100%;padding:10px 14px;border-radius:10px;
    border:none;
    background:color-mix(in srgb, var(--b3-theme-on-surface) 6%, transparent);
    color:var(--b3-theme-on-background);font-size:13px;
    letter-spacing:-0.01em;outline:none;
  `
  keyRow.appendChild(keyInput)
  container.appendChild(keyRow)

  // 音色
  const speakerRow = makeRow('音色')
  const speakerSel = makeSelect(SF_VOICES)
  speakerSel.value = settings.speaker
  speakerRow.appendChild(speakerSel)
  container.appendChild(speakerRow)

  // 语速
  const rateRow = makeRow('语速')
  const rateBox = document.createElement('div')
  rateBox.style.cssText = 'display:flex;align-items:center;gap:8px'
  const rateSlider = document.createElement('input')
  rateSlider.type = 'range'; rateSlider.min = '0.5'; rateSlider.max = '2.0'
  rateSlider.step = '0.1'; rateSlider.value = String(settings.apiSpeed ?? 1.0); rateSlider.style.cssText = 'flex:1'
  const rateLabel = document.createElement('span')
  rateLabel.textContent = parseFloat(rateSlider.value).toFixed(1) + 'x'
  rateLabel.style.cssText = 'min-width:36px;text-align:right;font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;'
  rateSlider.oninput = () => { rateLabel.textContent = parseFloat(rateSlider.value).toFixed(1) + 'x' }
  rateBox.appendChild(rateSlider); rateBox.appendChild(rateLabel)
  rateRow.appendChild(rateBox)
  container.appendChild(rateRow)

  // 范围
  const rangeRow = makeRow('范围')
  const rangeSel = makeSelect(buildRangeOptions(total))
  rangeRow.appendChild(rangeSel)
  container.appendChild(rangeRow)

  // 按钮
  const btns = makeBtnRow()
  bindTap(btns.cancel, () => removeOverlay())
  bindTap(btns.confirm, async () => {
    autoReadAction = autoSel?.value || 'stop'
    saveTTSSettings({ autoReadAction })
    const apiKey = keyInput.value.trim()
    if (!apiKey) { Notify.showErrorCommandCannotExecute('请填写 API Key'); return }

    const speed = parseFloat(rateSlider.value)
    const speaker = speakerSel.value
    saveSFAPIConfig({ apiKey })
    saveTTSSettings({ apiSpeed: speed, speaker, lastMode: 'api' })

    let startP = 0, endP: number | undefined
    parseRange(rangeSel.value, total, (s, e) => { startP = s; endP = e })
    removeOverlay()

    const engine = getHttpTTSEngine()
    engine.setSpeed(speed)
    engine.setSpeaker(speaker)
    engine.setMode('api', apiKey)
    await engine.extractParagraphsAsync()

    engine.onStateChange = (st, idx, tot) => updateBar(st, idx, tot)
    engine.onError = (msg) => { Notify.showErrorCommandCannotExecute(msg); removeBar() }
    engine.onFinish = async () => {
      if (autoReadAction === 'stop') {
        const s = bar?.querySelector('#tm-s') as HTMLElement
        if (s) s.textContent = '朗读完成'
        engine.onStateChange = () => {}
        await engine.speakOnce('本文档已经朗读完成', () => removeBar())
        return
      }
      const success = await navigateToAdjacentDoc(autoReadAction)
      if (!success) { removeBar(); showMessage('已无更多文档', 2000, 'info'); return }
      await waitForDocLoaded()
      await engine.extractParagraphsAsync()
      engine.speak(0, undefined)
    }
    createBar(engine)
    engine.speak(startP, endP)
    setupVis(engine)
  })
  container.appendChild(btns.wrap)
}

// ─── 工具函数 ──

/** 等待新文档加载完成（监听 loaded-protyle-dynamic，5s 超时兜底） */
function waitForDocLoaded(): Promise<void> {
  return new Promise((resolve) => {
    const handler = () => {
      pluginInstance?.app?.eventBus?.off('loaded-protyle-dynamic', handler)
      resolve()
    }
    pluginInstance?.app?.eventBus?.on('loaded-protyle-dynamic', handler)
    setTimeout(() => {
      pluginInstance?.app?.eventBus?.off('loaded-protyle-dynamic', handler)
      resolve()
    }, 5000)
  })
}

// ─── 播放条（Apple 胶囊形）──

function createBar(engine: TTSController): void {
  removeBar()
  const b = document.createElement('div')
  b.style.cssText = `
    position:fixed;bottom:80px;left:16px;right:16px;z-index:6;
    border-radius:9999px;padding:10px 16px;
    display:flex;align-items:center;gap:4px;
    font-size:13px;user-select:none;
    box-shadow:0 8px 32px rgba(0,0,0,0.12),
               0 0 0 0.5px rgba(0,0,0,0.06),
               inset 0 1px 0 rgba(255,255,255,0.12);
    backdrop-filter:blur(40px) saturate(180%);
    -webkit-backdrop-filter:blur(40px) saturate(180%);
  `
  applyFloatPanelBackground(b, undefined, 0.82)
  barThemeUnsub = observeSiYuanThemeMode(() => applyFloatPanelBackground(b, undefined, 0.82))
  b.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: false })

  const status = el('span', '朗读中')
  status.id = 'tm-s'
  status.style.cssText = 'font-weight:600;font-size:13px;white-space:nowrap;letter-spacing:-0.02em;'
  b.appendChild(status)

  const prog = el('span', '0 / 0')
  prog.id = 'tm-p'
  prog.style.cssText = 'opacity:0.45;font-size:12px;white-space:nowrap;margin-left:6px;font-variant-numeric:tabular-nums;'
  b.appendChild(prog)

  b.appendChild(el('span', ''))!.style.flex = '1'

  // 控制按钮（SVG 图标）
  b.appendChild(createIconButton('skip-back', '上一段', 18, () => engine.prevParagraph(), { isMobile: true }))

  const pp = createIconButton('pause', '暂停', 20, () => {
    if (engine.isPlaying) engine.pause()
    else if (engine.isPaused) engine.resume()
  }, { isMobile: true, isPrimary: true })
  pp.id = 'tm-pp'
  b.appendChild(pp)

  b.appendChild(createIconButton('skip-forward', '下一段', 18, () => engine.nextParagraph(), { isMobile: true }))

  // 分隔线
  const sep = document.createElement('div')
  sep.style.cssText = 'width:1px;height:24px;background:var(--b3-theme-on-surface);opacity:0.1;margin:0 4px;'
  b.appendChild(sep)

  b.appendChild(createIconButton('square', '停止', 18, () => { engine.stop(); removeBar() }, { isMobile: true }))

  document.body.appendChild(b)
  bar = b
}

function updateBar(st: string, idx: number, tot: number): void {
  if (!bar) return
  const s = bar.querySelector('#tm-s') as HTMLElement
  const p = bar.querySelector('#tm-p') as HTMLElement
  const pp = bar.querySelector('#tm-pp') as HTMLElement
  const m: Record<string, string> = { loading: '合成中', playing: '朗读中', paused: '已暂停', idle: '停止' }
  if (s) s.textContent = m[st] || '朗读中'
  if (p && tot > 0) p.textContent = `${idx + 1} / ${tot}`
  if (pp) {
    const isPlaying = st === 'playing' || st === 'loading'
    updateButtonIcon(pp, isPlaying ? 'pause' : 'play', 18, true)
  }
}

// ─── 前后台 ──

function setupVis(engine: TTSController): void {
  removeVis()
  visHandler = () => {
    if (document.hidden) { if (engine.isPlaying) engine.pause() }
    else { if (engine.isPaused) engine.resume() }
  }
  document.addEventListener('visibilitychange', visHandler)
}
function removeVis(): void {
  if (visHandler) { document.removeEventListener('visibilitychange', visHandler); visHandler = null }
}

// ─── UI 工具 ──

function buildRangeOptions(total: number): Array<{ v: string; t: string }> {
  const opts: Array<{ v: string; t: string }> = [{ v: 'all', t: `全部 ${total} 段` }]
  if (total > 5) {
    opts.push({ v: 'first-half', t: `前半（1-${Math.floor(total / 2)}段）` })
    opts.push({ v: 'second-half', t: `后半（${Math.floor(total / 2) + 1}-${total}段）` })
  }
  return opts
}

function parseRange(value: string, total: number, cb: (start: number, end: number | undefined) => void): void {
  if (value === 'first-half') cb(0, Math.floor(total / 2) - 1)
  else if (value === 'second-half') cb(Math.floor(total / 2), undefined)
  else cb(0, undefined)
}

function bindTap(el: HTMLElement, fn: () => void): void {
  let touched = false
  el.addEventListener('touchstart', (e) => { touched = true; e.preventDefault(); fn() }, { passive: false })
  el.addEventListener('click', () => { if (touched) { touched = false; return } fn() })
}

function el(tag: string, text: string) { const e = document.createElement(tag); e.textContent = text; return e }

function makeRow(label: string): HTMLElement {
  const row = document.createElement('div')
  row.style.cssText = 'margin-bottom:14px'
  const lbl = document.createElement('div')
  lbl.textContent = label
  lbl.style.cssText = 'font-size:13px;margin-bottom:6px;opacity:0.6;font-weight:500;letter-spacing:-0.01em;'
  row.appendChild(lbl)
  return row
}

function makeSelect(items: Array<{ v: string; t: string }>): HTMLSelectElement {
  const sel = document.createElement('select')
  sel.style.cssText = `
    width:100%;padding:10px 14px;border-radius:10px;
    border:none;
    background:color-mix(in srgb, var(--b3-theme-on-surface) 6%, transparent);
    color:var(--b3-theme-on-background);font-size:15px;
    letter-spacing:-0.01em;outline:none;
    -webkit-appearance:none;appearance:none;
  `
  for (const i of items) { const o = document.createElement('option'); o.value = i.v; o.textContent = i.t; sel.appendChild(o) }
  return sel
}

/** Apple 风格按钮行（胶囊形取消 + 确认） */
function makeBtnRow(): { wrap: HTMLElement; cancel: HTMLElement; confirm: HTMLElement } {
  const wrap = document.createElement('div')
  wrap.style.cssText = 'display:flex;gap:10px;margin-top:4px'
  const cancel = makeBtn('取消', { flex: 1, secondary: true })
  const confirm = makeBtn('开始朗读', { flex: 2, primary: true })
  wrap.appendChild(cancel); wrap.appendChild(confirm)
  return { wrap, cancel, confirm }
}

function makeBtn(text: string, o: { flex?: number; primary?: boolean; secondary?: boolean }): HTMLElement {
  const b = document.createElement('div')
  b.textContent = text
  const bg = o.primary
    ? 'var(--b3-theme-primary)'
    : 'color-mix(in srgb, var(--b3-theme-on-surface) 8%, transparent)'
  const fg = o.primary ? 'var(--b3-theme-on-primary)' : 'var(--b3-theme-on-background)'
  const shadow = o.primary
    ? 'box-shadow:0 2px 8px color-mix(in srgb, var(--b3-theme-primary) 30%, transparent);'
    : ''
  b.style.cssText = `
    flex:${o.flex || 1};padding:13px 0;border-radius:9999px;text-align:center;
    border:none;background:${bg};color:${fg};
    font-size:15px;font-weight:500;letter-spacing:-0.02em;
    cursor:pointer;${shadow}
    transition:transform 0.15s cubic-bezier(0.4,0,0.2,1),opacity 0.15s;
  `
  b.addEventListener('touchstart', () => {
    b.style.transform = 'scale(0.97)'
    b.style.opacity = '0.8'
  }, { passive: true })
  b.addEventListener('touchend', () => {
    b.style.transform = 'scale(1)'
    b.style.opacity = '1'
  }, { passive: true })
  return b
}

function removeOverlay(): void {
  if (panelThemeUnsub) { panelThemeUnsub(); panelThemeUnsub = null }
  if (overlay) { overlay.remove(); overlay = null }
}
function removeBar(): void {
  removeVis()
  if (barThemeUnsub) { barThemeUnsub(); barThemeUnsub = null }
  if (bar) { bar.remove(); bar = null }
}
