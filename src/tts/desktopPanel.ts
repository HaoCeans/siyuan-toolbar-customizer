/**
 * 电脑端 TTS 面板 — Apple 风格
 *
 * 三种引擎模式：浏览器语音 / 百度免费 / 硅基流动 API
 * 阶段一：点击按钮后弹出选项面板（Tab 切换 + 各模式参数设置）— 底部弹出
 * 阶段二：确认后显示浮动播放控制条 — 底部固定
 */

import { getTTSEngine, destroyTTSEngine, TTSOptions } from './ttsEngine'
import {
  getHttpTTSEngine, destroyHttpTTSEngine, HttpTTSEngine,
  SF_VOICES, getTTSSettings, saveTTSSettings, getSFAPIConfig, saveSFAPIConfig,
  type TTSController,
} from './httpTtsEngine'
import { applyFloatPanelBackground, observeSiYuanThemeMode } from '../ui/floatPanelBackground'
import { createIconButton, updateButtonIcon, injectSliderStyles, removeSliderStyles, lucideSvg } from './ttsIconHelper'
import * as Notify from '../notification'
import { pluginInstance } from '../toolbarManager'
import { navigateToAdjacentDoc } from '../ui/desktopDocNav'
import { showMessage } from 'siyuan'

// ─── 状态 ────────────────────────────────────────────────
let optionsOverlay: HTMLElement | null = null
let playbackBar: HTMLElement | null = null
let optionsThemeUnsub: (() => void) | null = null
let barThemeUnsub: (() => void) | null = null

/** 朗读完成后动作：'stop' | 'next' | 'prev' */
let autoReadAction: 'stop' | 'next' | 'prev' = 'stop'

// ─── 导出 ────────────────────────────────────────────────

/** 点击 TTS 按钮后调用：弹出选项面板 */
export function showTTSOptionsDesktop(): void {
  const baseEngine = getTTSEngine()

  const total = baseEngine.extractParagraphs()
  if (total === 0) {
    Notify.showErrorCommandCannotExecute('当前页面没有可朗读的内容')
    return
  }

  // 如果正在播放（任一引擎），先停止
  baseEngine.stop()
  getHttpTTSEngine().stop()
  removePlaybackBar()

  createOptionsPanel(total)
}

/** 清理（cleanup / plugin unload 时调用） */
export function cleanupDesktopTTS(): void {
  removeOptionsPanel()
  removePlaybackBar()
  destroyTTSEngine()
  destroyHttpTTSEngine()
  removeSliderStyles()
}

// ─── 阶段一：选项面板 ────────────────────────────────────

function createOptionsPanel(total: number): void {
  removeOptionsPanel()
  injectSliderStyles()

  // ── 遮罩层（毛玻璃遮罩）
  const overlay = document.createElement('div')
  overlay.id = 'tts-options-overlay'
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.3);
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    display: flex; align-items: flex-end; justify-content: center;
    z-index: 2000;
  `

  // ── 卡片（毛玻璃面板）
  const card = document.createElement('div')
  card.style.cssText = `
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -8px 32px rgba(0,0,0,0.12),
                inset 0 1px 0 rgba(255,255,255,0.15);
    backdrop-filter: blur(40px) saturate(180%);
    -webkit-backdrop-filter: blur(40px) saturate(180%);
    width: 100%; max-width: 480px;
    padding: 24px 24px 32px;
    color: var(--b3-theme-on-background);
  `
  applyFloatPanelBackground(card, undefined, 0.85)
  optionsThemeUnsub = observeSiYuanThemeMode(() => applyFloatPanelBackground(card, undefined, 0.85))

  // ── 标题（SVG 图标 + 文字）
  const header = document.createElement('div')
  header.style.cssText = `
    font-size: 17px; font-weight: 600; margin-bottom: 16px;
    letter-spacing: -0.02em;
    display: flex; align-items: center; gap: 8px;
  `
  header.innerHTML = `<span style="display:inline-flex;align-items:center;color:var(--b3-theme-primary)">${lucideSvg('volume-2', 20)}</span> 朗读设置`
  card.appendChild(header)

  // ── 模式 Tab 栏（Apple 分段控件）
  const savedConfig = getSFAPIConfig()
  const hasApiToken = !!savedConfig.apiKey
  const lastMode = getTTSSettings().lastMode
  const defaultMode = lastMode || (hasApiToken ? 'api' : 'webspeech')

  const modeBar = document.createElement('div')
  modeBar.style.cssText = `
    display: flex;
    background: color-mix(in srgb, var(--b3-theme-on-surface) 8%, transparent);
    border-radius: 10px;
    padding: 2px;
    gap: 0;
    margin-bottom: 18px;
  `

  const tabData = [
    { key: 'webspeech', label: '浏览器语音' },
    { key: 'free', label: '百度免费' },
    { key: 'api', label: '硅基流动' },
  ]
  const tabs: Record<string, HTMLElement> = {}
  for (const t of tabData) {
    const tab = document.createElement('div')
    tab.textContent = t.label
    tab.style.cssText = `
      flex: 1; padding: 7px 0; border-radius: 8px;
      text-align: center; font-size: 13px; font-weight: 500;
      letter-spacing: -0.01em; cursor: pointer;
      border: none; background: transparent;
      color: var(--b3-theme-on-background);
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      user-select: none;
    `
    tab.onclick = (e) => { e.stopPropagation(); activateMode(t.key) }
    modeBar.appendChild(tab)
    tabs[t.key] = tab
  }
  card.appendChild(modeBar)

  // ── 内容区
  const content = document.createElement('div')
  card.appendChild(content)

  // ── 朗读完成后动作选择（在所有模式底部共用）
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
    color:var(--b3-theme-on-background);font-size:13px;
    letter-spacing:-0.01em;outline:none;
  `
  const autoOpts = [
    { v: 'stop', t: '停止' },
    { v: 'next', t: '自动继续朗读下一篇' },
    { v: 'prev', t: '自动继续朗读上一篇' },
  ]
  for (const o of autoOpts) {
    const opt = document.createElement('option')
    opt.value = o.v; opt.textContent = o.t
    autoSel.appendChild(opt)
  }
  // 从已保存的设置恢复
  const savedAutoAction = getTTSSettings().autoReadAction || 'stop'
  autoSel.value = savedAutoAction
  autoReadAction = savedAutoAction
  autoReadRow.appendChild(autoSel)
  card.appendChild(autoReadRow)

  function activateMode(mode: string) {
    for (const t of tabData) {
      const active = t.key === mode
      if (active) {
        tabs[t.key].style.background = 'var(--b3-theme-surface)'
        tabs[t.key].style.color = 'var(--b3-theme-on-background)'
        tabs[t.key].style.opacity = '1'
        tabs[t.key].style.boxShadow = '0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)'
      } else {
        tabs[t.key].style.background = 'transparent'
        tabs[t.key].style.color = 'var(--b3-theme-on-background)'
        tabs[t.key].style.opacity = '0.55'
        tabs[t.key].style.boxShadow = 'none'
      }
    }
    content.innerHTML = ''
    if (mode === 'webspeech') renderWebSpeechContent(content, total, autoSel)
    else if (mode === 'free') renderFreeContent(content, total, autoSel)
    else renderApiContent(content, total, autoSel)
  }

  // 卡片内所有点击阻止冒泡
  card.onclick = (e) => e.stopPropagation()

  overlay.appendChild(card)
  overlay.onclick = (e) => { if (e.target === overlay) removeOptionsPanel() }
  document.body.appendChild(overlay)
  optionsOverlay = overlay

  // 激活默认模式
  activateMode(defaultMode)
}

// ─── Web Speech 模式面板（原有功能）─────────────────────────

function renderWebSpeechContent(container: HTMLElement, total: number, autoSel?: HTMLSelectElement): void {
  const engine = getTTSEngine()
  if (!engine.isAvailable) {
    const warn = document.createElement('div')
    warn.style.cssText = 'font-size:13px;opacity:0.6;margin-bottom:12px'
    warn.textContent = '当前浏览器不支持 speechSynthesis，请切换到其他模式'
    container.appendChild(warn)
  }

  const form = document.createElement('div')
  form.style.cssText = 'display:flex;flex-direction:column;gap:14px;'

  // 起始段落
  const startRow = createRow('起始段落')
  const startSelect = createParagraphSelect(total, 0)
  startRow.appendChild(startSelect)
  form.appendChild(startRow)

  // 结束段落
  const endRow = createRow('结束段落')
  const endSelect = createParagraphSelect(total, total - 1, true)
  endRow.appendChild(endSelect)
  form.appendChild(endRow)

  // 语速
  const rateRow = createRow('语速')
  const rateValue = document.createElement('span')
  rateValue.textContent = '1.0x'
  rateValue.style.cssText = 'min-width:36px;text-align:right;font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;'
  const rateSlider = createSlider('0.5', '2.0', '0.1', '1.0')
  rateSlider.oninput = () => { rateValue.textContent = parseFloat(rateSlider.value).toFixed(1) + 'x' }
  rateRow.appendChild(rateSlider); rateRow.appendChild(rateValue)
  form.appendChild(rateRow)

  // 音调
  const pitchRow = createRow('音调')
  const pitchValue = document.createElement('span')
  pitchValue.textContent = '1.0'
  pitchValue.style.cssText = 'min-width:36px;text-align:right;font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;'
  const pitchSlider = createSlider('0.1', '2.0', '0.1', '1.0')
  pitchSlider.oninput = () => { pitchValue.textContent = parseFloat(pitchSlider.value).toFixed(1) }
  pitchRow.appendChild(pitchSlider); pitchRow.appendChild(pitchValue)
  form.appendChild(pitchRow)

  // 音量
  const volumeRow = createRow('音量')
  const volumeValue = document.createElement('span')
  volumeValue.textContent = '100%'
  volumeValue.style.cssText = 'min-width:36px;text-align:right;font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;'
  const volumeSlider = createSlider('0', '1.0', '0.1', '1.0')
  volumeSlider.oninput = () => { volumeValue.textContent = `${Math.round(parseFloat(volumeSlider.value) * 100)}%` }
  volumeRow.appendChild(volumeSlider); volumeRow.appendChild(volumeValue)
  form.appendChild(volumeRow)

  // 语音选择
  const voiceRow = createRow('语音')
  const voiceSelect = createAppleSelect()
  const defaultOpt = document.createElement('option')
  defaultOpt.value = ''; defaultOpt.textContent = '自动选择'
  voiceSelect.appendChild(defaultOpt)
  const voices = engine.getVoices('zh')
  for (const v of voices) {
    const opt = document.createElement('option')
    opt.value = v.name; opt.textContent = `${v.name} (${v.lang})`
    voiceSelect.appendChild(opt)
  }
  // 恢复上次选择的语音
  const savedVoice = getTTSSettings().webSpeechVoiceName
  if (savedVoice) voiceSelect.value = savedVoice
  voiceRow.appendChild(voiceSelect)
  form.appendChild(voiceRow)

  container.appendChild(form)

  // ── 按钮
  const btns = createBtnRow()
  btns.cancel.onclick = (e) => { e.stopPropagation(); removeOptionsPanel() }
  btns.confirm.onclick = (e) => {
    e.stopPropagation()
    autoReadAction = autoSel?.value || 'stop'
    saveTTSSettings({ autoReadAction })
    const opts: TTSOptions = {
      rate: parseFloat(rateSlider.value),
      pitch: parseFloat(pitchSlider.value),
      volume: parseFloat(volumeSlider.value),
      startParagraph: parseInt(startSelect.value),
      endParagraph: endSelect.value === 'all' ? undefined : parseInt(endSelect.value),
      voiceName: voiceSelect.value || undefined,
    }
    saveTTSSettings({ lastMode: 'webspeech', webSpeechVoiceName: voiceSelect.value || undefined })
    removeOptionsPanel()
    startWebSpeechPlayback(opts)
  }
  container.appendChild(btns.wrap)
}

// ─── 百度免费模式面板 ──────────────────────────────────────

function renderFreeContent(container: HTMLElement, total: number, autoSel?: HTMLSelectElement): void {
  const settings = getTTSSettings()

  const hint = document.createElement('div')
  hint.style.cssText = 'font-size:11px;opacity:0.5;margin-bottom:14px;letter-spacing:-0.01em;'
  hint.textContent = '使用百度翻译接口，免费但可能随时失效'
  container.appendChild(hint)

  const form = document.createElement('div')
  form.style.cssText = 'display:flex;flex-direction:column;gap:14px;'

  // 语速（百度 0-15）
  const rateRow = createRow('语速')
  const rateValue = document.createElement('span')
  rateValue.textContent = String(settings.speed)
  rateValue.style.cssText = 'min-width:36px;text-align:right;font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;'
  const rateSlider = createSlider('0', '15', '1', String(settings.speed))
  rateSlider.oninput = () => { rateValue.textContent = rateSlider.value }
  rateRow.appendChild(rateSlider); rateRow.appendChild(rateValue)
  form.appendChild(rateRow)

  // 范围
  const rangeRow = createRow('范围')
  const rangeSel = createParagraphSelect(total, 0, true)
  rangeRow.appendChild(rangeSel)
  form.appendChild(rangeRow)

  container.appendChild(form)

  // ── 按钮
  const btns = createBtnRow()
  btns.cancel.onclick = (e) => { e.stopPropagation(); removeOptionsPanel() }
  btns.confirm.onclick = async (e) => {
    e.stopPropagation()
    autoReadAction = autoSel?.value || 'stop'
    saveTTSSettings({ autoReadAction })
    const speed = parseInt(rateSlider.value)
    const startP = parseInt(rangeSel.value === 'all' ? '0' : rangeSel.value)
    const endP = rangeSel.value === 'all' ? undefined : parseInt(rangeSel.value)
    saveTTSSettings({ speed, lastMode: 'free' })

    removeOptionsPanel()

    const engine = getHttpTTSEngine()
    engine.setDirectFetch(false)  // 百度走 forwardProxy
    engine.setSpeed(speed)
    engine.setSpeaker(4)
    engine.setMode('free')
    await engine.extractParagraphsAsync()

    startHttpPlayback(engine, startP, endP)
  }
  container.appendChild(btns.wrap)
}

// ─── 硅基流动 API 模式面板 ──────────────────────────────────

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
    font-weight:500;
    letter-spacing:-0.01em;
    padding:4px 0;
    border-bottom:1px solid color-mix(in srgb, var(--b3-theme-primary) 30%, transparent);
  `
  hintRow.appendChild(link)
  container.appendChild(hintRow)

  const form = document.createElement('div')
  form.style.cssText = 'display:flex;flex-direction:column;gap:14px;'

  // API Key
  const keyRow = createRow('API Key')
  const keyInput = document.createElement('input')
  keyInput.type = 'text'; keyInput.value = cfg.apiKey
  keyInput.placeholder = '粘贴硅基流动 API Key（sk-xxx）'
  keyInput.style.cssText = `
    width:100%;padding:10px 14px;border-radius:10px;
    border:none;
    background:color-mix(in srgb, var(--b3-theme-on-surface) 6%, transparent);
    color:var(--b3-theme-on-background);font-size:13px;
    letter-spacing:-0.01em;
    outline:none;
    transition:box-shadow 0.2s;
  `
  keyInput.onfocus = () => { keyInput.style.boxShadow = '0 0 0 2px color-mix(in srgb, var(--b3-theme-primary) 40%, transparent)' }
  keyInput.onblur = () => { keyInput.style.boxShadow = 'none' }
  keyRow.appendChild(keyInput)
  form.appendChild(keyRow)

  // 音色
  const speakerRow = createRow('音色')
  const speakerSelect = createAppleSelect()
  for (const v of SF_VOICES) {
    const opt = document.createElement('option')
    opt.value = v.v; opt.textContent = v.t
    speakerSelect.appendChild(opt)
  }
  speakerSelect.value = settings.speaker
  speakerRow.appendChild(speakerSelect)
  form.appendChild(speakerRow)

  // 语速（硅基流动 0.5-2.0）
  const rateRow = createRow('语速')
  const rateValue = document.createElement('span')
  rateValue.textContent = (settings.apiSpeed ?? 1.0).toFixed(1) + 'x'
  rateValue.style.cssText = 'min-width:36px;text-align:right;font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;'
  const rateSlider = createSlider('0.5', '2.0', '0.1', String(settings.apiSpeed ?? 1.0))
  rateSlider.oninput = () => { rateValue.textContent = parseFloat(rateSlider.value).toFixed(1) + 'x' }
  rateRow.appendChild(rateSlider); rateRow.appendChild(rateValue)
  form.appendChild(rateRow)

  // 范围
  const rangeRow = createRow('范围')
  const rangeSel = createParagraphSelect(total, 0, true)
  rangeRow.appendChild(rangeSel)
  form.appendChild(rangeRow)

  container.appendChild(form)

  // ── 按钮
  const btns = createBtnRow()
  btns.cancel.onclick = (e) => { e.stopPropagation(); removeOptionsPanel() }
  btns.confirm.onclick = async (e) => {
    e.stopPropagation()
    autoReadAction = autoSel?.value || 'stop'
    saveTTSSettings({ autoReadAction })
    const apiKey = keyInput.value.trim()
    if (!apiKey) { Notify.showErrorCommandCannotExecute('请填写 API Key'); return }

    const speed = parseFloat(rateSlider.value)
    const speaker = speakerSelect.value
    saveSFAPIConfig({ apiKey })
    saveTTSSettings({ apiSpeed: speed, speaker, lastMode: 'api' })

    const startP = parseInt(rangeSel.value === 'all' ? '0' : rangeSel.value)
    const endP = rangeSel.value === 'all' ? undefined : parseInt(rangeSel.value)
    removeOptionsPanel()

    const engine = getHttpTTSEngine()
    engine.setDirectFetch(true)  // 桌面端直接 fetch，不走 forwardProxy
    engine.setSpeed(speed)
    engine.setSpeaker(speaker)
    engine.setMode('api', apiKey)
    await engine.extractParagraphsAsync()

    startHttpPlayback(engine, startP, endP)
  }
  container.appendChild(btns.wrap)
}

// ─── 阶段二：播放启动 ──────────────────────────────────

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

function startWebSpeechPlayback(opts: TTSOptions): void {
  const engine = getTTSEngine()
  engine.onStateChange = (state, index, total) => {
    updatePlaybackBar(state, index, total)
  }
  engine.onFinish = async () => {
    if (autoReadAction === 'stop') {
      const statusEl = playbackBar?.querySelector('#tts-bar-status') as HTMLElement
      if (statusEl) statusEl.textContent = '朗读完成'
      engine.onStateChange = () => {}
      engine.speakOnce('本文档已经朗读完成', () => removePlaybackBar())
      return
    }
    const success = await navigateToAdjacentDoc(autoReadAction)
    if (!success) {
      removePlaybackBar()
      showMessage('已无更多文档', 2000, 'info')
      return
    }
    await waitForDocLoaded()
    engine.extractParagraphs()
    engine.speak({ ...opts, startParagraph: 0, endParagraph: undefined })
  }
  createPlaybackBar(engine)
  engine.speak(opts)
}

function startHttpPlayback(engine: HttpTTSEngine, startP: number, endP: number | undefined): void {
  engine.onStateChange = (state, index, total) => {
    updatePlaybackBar(state, index, total)
  }
  engine.onError = (msg) => {
    Notify.showErrorCommandCannotExecute(msg)
    removePlaybackBar()
  }
  engine.onFinish = async () => {
    if (autoReadAction === 'stop') {
      const statusEl = playbackBar?.querySelector('#tts-bar-status') as HTMLElement
      if (statusEl) statusEl.textContent = '朗读完成'
      engine.onStateChange = () => {}
      await engine.speakOnce('本文档已经朗读完成', () => removePlaybackBar())
      return
    }
    const success = await navigateToAdjacentDoc(autoReadAction)
    if (!success) {
      removePlaybackBar()
      showMessage('已无更多文档', 2000, 'info')
      return
    }
    await waitForDocLoaded()
    await engine.extractParagraphsAsync()
    engine.speak(0, undefined)
  }
  createPlaybackBar(engine)
  engine.speak(startP, endP)
}

// ─── 播放控制条（Apple 胶囊形）───────────────────────────

function createPlaybackBar(engine: TTSController): void {
  removePlaybackBar()

  const bar = document.createElement('div')
  bar.id = 'tts-playback-bar'
  bar.style.cssText = `
    position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
    z-index: 200; min-width: 440px; max-width: 520px;
    border-radius: 9999px;
    backdrop-filter: blur(40px) saturate(180%);
    -webkit-backdrop-filter: blur(40px) saturate(180%);
    box-shadow: 0 8px 32px rgba(0,0,0,0.12),
                0 0 0 0.5px rgba(0,0,0,0.06),
                inset 0 1px 0 rgba(255,255,255,0.12);
    padding: 8px 12px 8px 20px;
    display: flex; align-items: center; gap: 4px;
    font-size: 13px; color: var(--b3-theme-on-surface);
    user-select: none;
  `
  applyFloatPanelBackground(bar, undefined, 0.78)
  barThemeUnsub = observeSiYuanThemeMode(() => applyFloatPanelBackground(bar, undefined, 0.78))

  bar.onclick = (e) => e.stopPropagation()

  // 状态文字
  const statusEl = document.createElement('span')
  statusEl.id = 'tts-bar-status'
  statusEl.textContent = '朗读中'
  statusEl.style.cssText = 'font-weight: 600; white-space: nowrap; font-size: 13px; letter-spacing: -0.02em;'
  bar.appendChild(statusEl)

  // 进度
  const progressEl = document.createElement('span')
  progressEl.id = 'tts-bar-progress'
  progressEl.textContent = '0/0'
  progressEl.style.cssText = 'opacity: 0.45; font-size: 12px; white-space: nowrap; margin-left: 6px; font-variant-numeric: tabular-nums;'
  bar.appendChild(progressEl)

  const spacer = document.createElement('span')
  spacer.style.cssText = 'flex: 1;'
  bar.appendChild(spacer)

  // 控制按钮组（SVG 图标）
  const btnGroup = document.createElement('div')
  btnGroup.style.cssText = 'display: flex; align-items: center; gap: 2px;'

  btnGroup.appendChild(createIconButton('skip-back', '上一段', 18, () => engine.prevParagraph()))

  const playPauseBtn = createIconButton('pause', '暂停', 20, () => {
    if (engine.isPlaying) engine.pause()
    else if (engine.isPaused) engine.resume()
  }, { isPrimary: true })
  playPauseBtn.id = 'tts-bar-playpause'
  btnGroup.appendChild(playPauseBtn)

  btnGroup.appendChild(createIconButton('skip-forward', '下一段', 18, () => engine.nextParagraph()))

  // 分隔线
  const sep = document.createElement('div')
  sep.style.cssText = 'width: 1px; height: 24px; background: var(--b3-theme-on-surface); opacity: 0.1; margin: 0 4px;'
  btnGroup.appendChild(sep)

  btnGroup.appendChild(createIconButton('square', '停止', 18, () => {
    engine.stop()
    removePlaybackBar()
  }))

  bar.appendChild(btnGroup)

  document.body.appendChild(bar)
  playbackBar = bar
}

function updatePlaybackBar(state: string, index: number, total: number): void {
  if (!playbackBar) return

  const statusEl = playbackBar.querySelector('#tts-bar-status') as HTMLElement
  const progressEl = playbackBar.querySelector('#tts-bar-progress') as HTMLElement
  const playPauseBtn = playbackBar.querySelector('#tts-bar-playpause') as HTMLElement

  const stateMap: Record<string, string> = {
    loading: '合成中',
    playing: '朗读中',
    paused: '已暂停',
    idle: '已停止',
  }
  if (statusEl) statusEl.textContent = stateMap[state] || '朗读中'
  if (progressEl && total > 0) progressEl.textContent = `${index + 1} / ${total}`
  if (playPauseBtn) {
    const isPlaying = state === 'playing' || state === 'loading'
    updateButtonIcon(playPauseBtn, isPlaying ? 'pause' : 'play', 18, true)
  }
}

// ─── 工具函数 ─────────────────────────────────────────────

function createRow(label: string): HTMLElement {
  const row = document.createElement('div')
  row.style.cssText = 'display: flex; align-items: center; gap: 12px;'

  const lbl = document.createElement('label')
  lbl.textContent = label
  lbl.style.cssText = `
    font-size: 13px; min-width: 60px; opacity: 0.6;
    font-weight: 500; letter-spacing: -0.01em;
  `
  row.appendChild(lbl)
  return row
}

function createSlider(min: string, max: string, step: string, value: string): HTMLInputElement {
  const slider = document.createElement('input')
  slider.type = 'range'
  slider.min = min; slider.max = max; slider.step = step; slider.value = value
  slider.style.cssText = 'flex: 1; margin: 0 8px;'
  return slider
}

function createParagraphSelect(total: number, defaultIndex: number, hasAll = false): HTMLSelectElement {
  const sel = createAppleSelect()
  for (let i = 0; i < total; i++) {
    const opt = document.createElement('option')
    opt.value = String(i)
    opt.textContent = `第 ${i + 1} 段`
    if (i === defaultIndex && !hasAll) opt.selected = true
    sel.appendChild(opt)
  }
  if (hasAll) {
    const allOpt = document.createElement('option')
    allOpt.value = 'all'
    allOpt.textContent = '到最后'
    allOpt.selected = true
    sel.appendChild(allOpt)
  }
  return sel
}

/** Apple 风格 Select（无边框、圆角、半透明背景） */
function createAppleSelect(): HTMLSelectElement {
  const sel = document.createElement('select')
  sel.style.cssText = `
    flex: 1; padding: 8px 12px; border-radius: 10px;
    border: none;
    background: color-mix(in srgb, var(--b3-theme-on-surface) 6%, transparent);
    color: var(--b3-theme-on-background);
    font-size: 13px;
    letter-spacing: -0.01em;
    outline: none;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
  `
  return sel
}

/** Apple 风格按钮行（胶囊形取消 + 确认） */
function createBtnRow(): { wrap: HTMLElement; cancel: HTMLElement; confirm: HTMLElement } {
  const wrap = document.createElement('div')
  wrap.style.cssText = 'display: flex; gap: 10px; margin-top: 18px;'

  const cancel = document.createElement('button')
  cancel.textContent = '取消'
  cancel.style.cssText = `
    flex: 1; padding: 12px 0; border-radius: 9999px;
    border: none;
    background: color-mix(in srgb, var(--b3-theme-on-surface) 8%, transparent);
    color: var(--b3-theme-on-background);
    font-size: 14px; font-weight: 500; cursor: pointer;
    letter-spacing: -0.02em;
    transition: transform 0.15s cubic-bezier(0.4,0,0.2,1), opacity 0.15s;
  `

  const confirm = document.createElement('button')
  confirm.textContent = '开始朗读'
  confirm.style.cssText = `
    flex: 2; padding: 12px 0; border-radius: 9999px;
    border: none;
    background: var(--b3-theme-primary); color: var(--b3-theme-on-primary);
    font-size: 14px; font-weight: 500; cursor: pointer;
    letter-spacing: -0.02em;
    box-shadow: 0 2px 8px color-mix(in srgb, var(--b3-theme-primary) 30%, transparent);
    transition: transform 0.15s cubic-bezier(0.4,0,0.2,1), opacity 0.15s;
  `

  // 桌面端 hover/active 反馈
  cancel.onmouseenter = () => { cancel.style.opacity = '0.8' }
  cancel.onmouseleave = () => { cancel.style.opacity = '1'; cancel.style.transform = 'scale(1)' }
  cancel.onmousedown = () => { cancel.style.transform = 'scale(0.97)' }
  cancel.onmouseup = () => { cancel.style.transform = 'scale(1)' }

  confirm.onmouseenter = () => { confirm.style.opacity = '0.9' }
  confirm.onmouseleave = () => { confirm.style.opacity = '1'; confirm.style.transform = 'scale(1)' }
  confirm.onmousedown = () => { confirm.style.transform = 'scale(0.97)' }
  confirm.onmouseup = () => { confirm.style.transform = 'scale(1)' }

  wrap.appendChild(cancel); wrap.appendChild(confirm)
  return { wrap, cancel, confirm }
}

function removeOptionsPanel(): void {
  if (optionsThemeUnsub) { optionsThemeUnsub(); optionsThemeUnsub = null }
  if (optionsOverlay) { optionsOverlay.remove(); optionsOverlay = null }
}

function removePlaybackBar(): void {
  if (barThemeUnsub) { barThemeUnsub(); barThemeUnsub = null }
  if (playbackBar) { playbackBar.remove(); playbackBar = null }
}
