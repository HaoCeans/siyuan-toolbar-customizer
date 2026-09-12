/**
 * 电脑端 TTS 面板 — Apple 风格
 *
 * 四种引擎模式：浏览器语音 / Edge 在线 / 百度免费 / 硅基流动 API
 * 阶段一：点击按钮后弹出选项面板（Tab 切换 + 各模式参数设置）— 底部弹出
 * 阶段二：确认后显示浮动播放控制条 — 底部固定
 */

import { t } from '../i18n/runtime'
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
import { EDGE_TTS_VOICES, getEdgeTTSEngine, destroyEdgeTTSEngine, isSupportedEdgeVoice } from './edgeTtsEngine'

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
    Notify.showErrorCommandCannotExecute(t('tts.noReadableContent', undefined, '当前页面没有可朗读的内容'))
    return
  }

  // 如果正在播放（任一引擎），先停止
  baseEngine.stop()
  getHttpTTSEngine().stop()
  getEdgeTTSEngine().stop()
  removePlaybackBar()

  createOptionsPanel(total)
}

/** 清理（cleanup / plugin unload 时调用） */
export function cleanupDesktopTTS(): void {
  removeOptionsPanel()
  removePlaybackBar()
  destroyTTSEngine()
  destroyHttpTTSEngine()
  destroyEdgeTTSEngine()
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
  header.innerHTML = `<span style="display:inline-flex;align-items:center;color:var(--b3-theme-primary)">${lucideSvg('volume-2', 20)}</span> ${t('tts.settings', undefined, '朗读设置')}`
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
    { key: 'webspeech', label: t('tts.mode.browserSpeech', undefined, '浏览器语音') },
    { key: 'edge', label: t('tts.mode.edge', undefined, 'Edge 在线') },
    { key: 'free', label: t('tts.mode.baiduFree', undefined, '百度免费') },
    { key: 'api', label: t('tts.mode.siliconFlow', undefined, '硅基流动') },
  ]
  const tabs: Record<string, HTMLElement> = {}
  for (const tabInfo of tabData) {
    const tab = document.createElement('div')
    tab.textContent = tabInfo.label
    tab.style.cssText = `
      flex: 1; padding: 7px 0; border-radius: 8px;
      text-align: center; font-size: 13px; font-weight: 500;
      letter-spacing: -0.01em; cursor: pointer;
      border: none; background: transparent;
      color: var(--b3-theme-on-background);
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      user-select: none;
    `
    tab.onclick = (e) => { e.stopPropagation(); activateMode(tabInfo.key) }
    modeBar.appendChild(tab)
    tabs[tabInfo.key] = tab
  }
  card.appendChild(modeBar)

  // ── 内容区
  const content = document.createElement('div')
  card.appendChild(content)

  // ── 朗读完成后动作选择（在所有模式底部共用）
  const autoReadRow = document.createElement('div')
  autoReadRow.style.cssText = 'margin-top: 6px; margin-bottom: 8px;'
  const autoLabel = document.createElement('div')
  autoLabel.textContent = t('tts.afterReading', undefined, '朗读完成后')
  autoLabel.style.cssText = 'font-size:13px;margin-bottom:6px;opacity:0.6;font-weight:500;letter-spacing:-0.01em;'
  autoReadRow.appendChild(autoLabel)
  const autoSel = createAppleSelect()
  autoSel.style.width = '100%'
  const autoOpts = [
    { v: 'stop', t: t('tts.stop', undefined, '停止') },
    { v: 'next', t: t('tts.autoNext', undefined, '自动继续朗读下一篇') },
    { v: 'prev', t: t('tts.autoPrevious', undefined, '自动继续朗读上一篇') },
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
    for (const tabInfo of tabData) {
      const active = tabInfo.key === mode
      if (active) {
        tabs[tabInfo.key].style.background = 'var(--b3-theme-surface)'
        tabs[tabInfo.key].style.color = 'var(--b3-theme-on-background)'
        tabs[tabInfo.key].style.opacity = '1'
        tabs[tabInfo.key].style.boxShadow = '0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)'
      } else {
        tabs[tabInfo.key].style.background = 'transparent'
        tabs[tabInfo.key].style.color = 'var(--b3-theme-on-background)'
        tabs[tabInfo.key].style.opacity = '0.55'
        tabs[tabInfo.key].style.boxShadow = 'none'
      }
    }
    content.innerHTML = ''
    if (mode === 'webspeech') renderWebSpeechContent(content, total, autoSel)
    else if (mode === 'edge') renderEdgeContent(content, total, autoSel)
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

function renderWebSpeechContent(container: HTMLElement, total: number, autoSel?: AppleSelectEl): void {
  const engine = getTTSEngine()
  if (!engine.isAvailable) {
    const warn = document.createElement('div')
    warn.style.cssText = 'font-size:13px;opacity:0.6;margin-bottom:12px'
    warn.textContent = t('tts.speechSynthesisUnsupportedSwitchMode', undefined, '当前浏览器不支持 speechSynthesis，请切换到其他模式')
    container.appendChild(warn)
  }

  const form = document.createElement('div')
  form.style.cssText = 'display:flex;flex-direction:column;gap:14px;'

  // 起始段落
  const startRow = createRow(t('tts.startParagraph', undefined, '起始段落'))
  const startSelect = createParagraphSelect(total, 0)
  startRow.appendChild(startSelect)
  form.appendChild(startRow)

  // 结束段落
  const endRow = createRow(t('tts.endParagraph', undefined, '结束段落'))
  const endSelect = createParagraphSelect(total, total - 1, true)
  endRow.appendChild(endSelect)
  form.appendChild(endRow)

  // 语速
  const rateRow = createRow(t('tts.rate', undefined, '语速'))
  const rateValue = document.createElement('span')
  rateValue.textContent = '1.0x'
  rateValue.style.cssText = 'min-width:36px;text-align:right;font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;'
  const rateSlider = createSlider('0.5', '2.0', '0.1', '1.0')
  rateSlider.oninput = () => { rateValue.textContent = parseFloat(rateSlider.value).toFixed(1) + 'x' }
  rateRow.appendChild(rateSlider); rateRow.appendChild(rateValue)
  form.appendChild(rateRow)

  // 音调
  const pitchRow = createRow(t('tts.pitch', undefined, '音调'))
  const pitchValue = document.createElement('span')
  pitchValue.textContent = '1.0'
  pitchValue.style.cssText = 'min-width:36px;text-align:right;font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;'
  const pitchSlider = createSlider('0.1', '2.0', '0.1', '1.0')
  pitchSlider.oninput = () => { pitchValue.textContent = parseFloat(pitchSlider.value).toFixed(1) }
  pitchRow.appendChild(pitchSlider); pitchRow.appendChild(pitchValue)
  form.appendChild(pitchRow)

  // 音量
  const volumeRow = createRow(t('tts.volume', undefined, '音量'))
  const volumeValue = document.createElement('span')
  volumeValue.textContent = '100%'
  volumeValue.style.cssText = 'min-width:36px;text-align:right;font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;'
  const volumeSlider = createSlider('0', '1.0', '0.1', '1.0')
  volumeSlider.oninput = () => { volumeValue.textContent = `${Math.round(parseFloat(volumeSlider.value) * 100)}%` }
  volumeRow.appendChild(volumeSlider); volumeRow.appendChild(volumeValue)
  form.appendChild(volumeRow)

  // 语音选择
  const voiceRow = createRow(t('tts.voice', undefined, '语音'))
  const voiceSelect = createAppleSelect()
  const defaultOpt = document.createElement('option')
  defaultOpt.value = ''; defaultOpt.textContent = t('tts.autoSelect', undefined, '自动选择')
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
    autoReadAction = (autoSel?.value || 'stop') as 'stop' | 'next' | 'prev'
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

// ─── Edge 在线语音模式 ──────────────────────────────────────
function renderEdgeContent(container: HTMLElement, total: number, autoSel?: AppleSelectEl): void {
  const settings = getTTSSettings()
  const form = document.createElement('div')
  form.style.cssText = 'display:flex;flex-direction:column;gap:14px;'

  const startRow = createRow(t('tts.startParagraph', undefined, '起始段落'))
  const startSelect = createParagraphSelect(total, 0)
  startRow.appendChild(startSelect)
  form.appendChild(startRow)

  const endRow = createRow(t('tts.endParagraph', undefined, '结束段落'))
  const endSelect = createParagraphSelect(total, total - 1, true)
  endRow.appendChild(endSelect)
  form.appendChild(endRow)

  const rateRow = createRow(t('tts.rate', undefined, '语速'))
  const rateValue = document.createElement('span')
  const savedRate = settings.edgeRate ?? 1.0
  rateValue.textContent = `${savedRate.toFixed(1)}x`
  rateValue.style.cssText = 'min-width:36px;text-align:right;font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;'
  const rateSlider = createSlider('0.5', '2.0', '0.1', String(savedRate))
  rateSlider.oninput = () => { rateValue.textContent = `${parseFloat(rateSlider.value).toFixed(1)}x` }
  rateRow.appendChild(rateSlider)
  rateRow.appendChild(rateValue)
  form.appendChild(rateRow)

  const voiceRow = createRow(t('tts.voice', undefined, '语音'))
  const voiceSelect = createAppleSelect()
  for (const voice of EDGE_TTS_VOICES) {
    const option = document.createElement('option')
    option.value = voice.name
    option.textContent = voice.displayName
    voiceSelect.appendChild(option)
  }
  // 旧版本可能保存了接口已不支持的语音名，此时显示默认项而不是空白
  const savedVoice = settings.edgeVoiceName || ''
  voiceSelect.value = isSupportedEdgeVoice(savedVoice) ? savedVoice : EDGE_TTS_VOICES[0].name
  voiceRow.appendChild(voiceSelect)
  form.appendChild(voiceRow)

  container.appendChild(form)

  const btns = createBtnRow()
  btns.cancel.onclick = (e) => { e.stopPropagation(); removeOptionsPanel() }
  btns.confirm.onclick = (e) => {
    e.stopPropagation()
    const rate = parseFloat(rateSlider.value)
    const voice = voiceSelect.value || EDGE_TTS_VOICES[0].name
    autoReadAction = (autoSel?.value || 'stop') as 'stop' | 'next' | 'prev'
    saveTTSSettings({ lastMode: 'edge', edgeRate: rate, edgeVoiceName: voice, autoReadAction })
    getEdgeTTSEngine().activatePlayback()
    removeOptionsPanel()
    startEdgePlayback(voice, rate, parseInt(startSelect.value), endSelect.value === 'all' ? undefined : parseInt(endSelect.value))
  }
  container.appendChild(btns.wrap)
}


function renderFreeContent(container: HTMLElement, total: number, autoSel?: AppleSelectEl): void {
  const settings = getTTSSettings()

  const hint = document.createElement('div')
  hint.style.cssText = 'font-size:11px;opacity:0.5;margin-bottom:14px;letter-spacing:-0.01em;'
  hint.textContent = t('tts.baiduFreeHint', undefined, '使用百度翻译接口，免费但可能随时失效')
  container.appendChild(hint)

  const form = document.createElement('div')
  form.style.cssText = 'display:flex;flex-direction:column;gap:14px;'

  // 语速（百度 0-15）
  const rateRow = createRow(t('tts.rate', undefined, '语速'))
  const rateValue = document.createElement('span')
  rateValue.textContent = String(settings.speed)
  rateValue.style.cssText = 'min-width:36px;text-align:right;font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;'
  const rateSlider = createSlider('0', '15', '1', String(settings.speed))
  rateSlider.oninput = () => { rateValue.textContent = rateSlider.value }
  rateRow.appendChild(rateSlider); rateRow.appendChild(rateValue)
  form.appendChild(rateRow)

  // 范围
  const rangeRow = createRow(t('tts.range', undefined, '范围'))
  const rangeSel = createParagraphSelect(total, 0, true)
  rangeRow.appendChild(rangeSel)
  form.appendChild(rangeRow)

  container.appendChild(form)

  // ── 按钮
  const btns = createBtnRow()
  btns.cancel.onclick = (e) => { e.stopPropagation(); removeOptionsPanel() }
  btns.confirm.onclick = async (e) => {
    e.stopPropagation()
    autoReadAction = (autoSel?.value || 'stop') as 'stop' | 'next' | 'prev'
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

function renderApiContent(container: HTMLElement, total: number, autoSel?: AppleSelectEl): void {
  const cfg = getSFAPIConfig()
  const settings = getTTSSettings()

  // 说明 + 链接
  const hintRow = document.createElement('div')
  hintRow.style.cssText = 'margin-bottom:14px'
  const hint = document.createElement('div')
  hint.style.cssText = 'font-size:11px;opacity:0.5;margin-bottom:8px;letter-spacing:-0.01em;'
  hint.textContent = t('tts.siliconFlowHint', undefined, '硅基流动 CosyVoice2 语音合成，中文质量高，约 ¥50/百万字符')
  hintRow.appendChild(hint)
  const link = document.createElement('a')
  link.href = 'https://cloud.siliconflow.cn/account/ak'
  link.target = '_blank'
  link.textContent = t('tts.getApiKey', undefined, '前往获取 API Key →')
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
  keyInput.placeholder = t('tts.apiKeyPlaceholder', undefined, '粘贴硅基流动 API Key（sk-xxx）')
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
  const speakerRow = createRow(t('tts.timbre', undefined, '音色'))
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
  const rateRow = createRow(t('tts.rate', undefined, '语速'))
  const rateValue = document.createElement('span')
  rateValue.textContent = (settings.apiSpeed ?? 1.0).toFixed(1) + 'x'
  rateValue.style.cssText = 'min-width:36px;text-align:right;font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;'
  const rateSlider = createSlider('0.5', '2.0', '0.1', String(settings.apiSpeed ?? 1.0))
  rateSlider.oninput = () => { rateValue.textContent = parseFloat(rateSlider.value).toFixed(1) + 'x' }
  rateRow.appendChild(rateSlider); rateRow.appendChild(rateValue)
  form.appendChild(rateRow)

  // 范围
  const rangeRow = createRow(t('tts.range', undefined, '范围'))
  const rangeSel = createParagraphSelect(total, 0, true)
  rangeRow.appendChild(rangeSel)
  form.appendChild(rangeRow)

  container.appendChild(form)

  // ── 按钮
  const btns = createBtnRow()
  btns.cancel.onclick = (e) => { e.stopPropagation(); removeOptionsPanel() }
  btns.confirm.onclick = async (e) => {
    e.stopPropagation()
    autoReadAction = (autoSel?.value || 'stop') as 'stop' | 'next' | 'prev'
    saveTTSSettings({ autoReadAction })
    const apiKey = keyInput.value.trim()
    if (!apiKey) { Notify.showErrorCommandCannotExecute(t('tts.enterApiKey', undefined, '请填写 API Key')); return }

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

function startEdgePlayback(voice: string, rate: number, startP: number, endP: number | undefined): void {
  const engine = getEdgeTTSEngine()
  engine.setVoice(voice)
  engine.setRate(rate)
  engine.extractParagraphs()
  engine.onStateChange = (state, index, total) => updatePlaybackBar(state, index, total)
  engine.onError = (msg) => {
    Notify.showErrorCommandCannotExecute(msg)
    removePlaybackBar()
  }
  engine.onFinish = async () => {
    if (autoReadAction === 'stop') {
      const statusEl = playbackBar?.querySelector('#tts-bar-status') as HTMLElement
      if (statusEl) statusEl.textContent = t('tts.readingComplete', undefined, '朗读完成')
      engine.onStateChange = () => {}
      await engine.speakOnce(t('tts.documentReadingCompleteSpeech', undefined, '本文档已经朗读完成'), () => removePlaybackBar())
      return
    }
    const success = await navigateToAdjacentDoc(autoReadAction)
    if (!success) {
      removePlaybackBar()
      showMessage(t('tts.noMoreDocuments', undefined, '已无更多文档'), 2000, 'info')
      return
    }
    await waitForDocLoaded()
    await engine.extractParagraphsAsync()
    engine.speak(0, undefined)
  }
  createPlaybackBar(engine)
  engine.speak(startP, endP)
}

function startWebSpeechPlayback(opts: TTSOptions): void {
  const engine = getTTSEngine()
  engine.onStateChange = (state, index, total) => {
    updatePlaybackBar(state, index, total)
  }
  engine.onFinish = async () => {
    if (autoReadAction === 'stop') {
      const statusEl = playbackBar?.querySelector('#tts-bar-status') as HTMLElement
      if (statusEl) statusEl.textContent = t('tts.readingComplete', undefined, '朗读完成')
      engine.onStateChange = () => {}
      engine.speakOnce(t('tts.documentReadingCompleteSpeech', undefined, '本文档已经朗读完成'), () => removePlaybackBar())
      return
    }
    const success = await navigateToAdjacentDoc(autoReadAction)
    if (!success) {
      removePlaybackBar()
      showMessage(t('tts.noMoreDocuments', undefined, '已无更多文档'), 2000, 'info')
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
      if (statusEl) statusEl.textContent = t('tts.readingComplete', undefined, '朗读完成')
      engine.onStateChange = () => {}
      await engine.speakOnce(t('tts.documentReadingCompleteSpeech', undefined, '本文档已经朗读完成'), () => removePlaybackBar())
      return
    }
    const success = await navigateToAdjacentDoc(autoReadAction)
    if (!success) {
      removePlaybackBar()
      showMessage(t('tts.noMoreDocuments', undefined, '已无更多文档'), 2000, 'info')
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
  statusEl.textContent = t('tts.reading', undefined, '朗读中')
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

  btnGroup.appendChild(createIconButton('skip-back', t('tts.previousParagraph', undefined, '上一段'), 18, () => engine.prevParagraph()))

  const playPauseBtn = createIconButton('pause', t('tts.pause', undefined, '暂停'), 20, () => {
    if (engine.isPlaying) engine.pause()
    else if (engine.isPaused) engine.resume()
  }, { isPrimary: true })
  playPauseBtn.id = 'tts-bar-playpause'
  btnGroup.appendChild(playPauseBtn)

  btnGroup.appendChild(createIconButton('skip-forward', t('tts.nextParagraph', undefined, '下一段'), 18, () => engine.nextParagraph()))

  // 分隔线
  const sep = document.createElement('div')
  sep.style.cssText = 'width: 1px; height: 24px; background: var(--b3-theme-on-surface); opacity: 0.1; margin: 0 4px;'
  btnGroup.appendChild(sep)

  btnGroup.appendChild(createIconButton('square', t('tts.stop', undefined, '停止'), 18, () => {
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
    loading: t('tts.synthesizing', undefined, '合成中'),
    playing: t('tts.reading', undefined, '朗读中'),
    paused: t('tts.paused', undefined, '已暂停'),
    idle: t('tts.stopped', undefined, '已停止'),
  }
  if (statusEl) statusEl.textContent = stateMap[state] || t('tts.reading', undefined, '朗读中')
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

function createParagraphSelect(total: number, defaultIndex: number, hasAll = false): AppleSelectEl {
  const sel = createAppleSelect()
  for (let i = 0; i < total; i++) {
    const opt = document.createElement('option')
    opt.value = String(i)
    opt.textContent = t('tts.paragraph', { index: i + 1 }, `第 ${i + 1} 段`)
    if (i === defaultIndex && !hasAll) opt.selected = true
    sel.appendChild(opt)
  }
  if (hasAll) {
    const allOpt = document.createElement('option')
    allOpt.value = 'all'
    allOpt.textContent = t('tts.toEnd', undefined, '到最后')
    allOpt.selected = true
    sel.appendChild(allOpt)
  }
  return sel
}

/**
 * 自定义下拉组件：替代原生 <select>，弹层样式与面板一致并跟随思源亮暗主题。
 * 为让既有调用点（.value 读写、appendChild(option)）无需改动，返回值伪装成
 * select 的子集：value 用属性访问器实现，appendChild 被重写为"消费"传入的
 * option 元素（取其 value/text/selected，不真正挂到 DOM）。
 */
type AppleSelectEl = HTMLDivElement & {
  value: string
  appendChild(child: HTMLOptionElement): void
}

interface AppleSelectOption {
  value: string
  text: string
}

/** 当前打开的下拉弹层（全局同时只允许一个） */
let openAppleSelectPopup: HTMLElement | null = null
let openAppleSelectOwner = -1
const appleSelectPopupCleanup: Array<() => void> = []
let appleSelectUidCounter = 0

function closeAppleSelectPopup(): void {
  openAppleSelectPopup?.remove()
  openAppleSelectPopup = null
  openAppleSelectOwner = -1
  while (appleSelectPopupCleanup.length) appleSelectPopupCleanup.pop()?.()
}

function createAppleSelect(): AppleSelectEl {
  const uid = ++appleSelectUidCounter
  const root = document.createElement('div') as unknown as AppleSelectEl

  const options: AppleSelectOption[] = []
  let current = ''

  const labelEl = document.createElement('span')
  labelEl.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
  const chevron = document.createElement('span')
  chevron.style.cssText = 'display:inline-flex;align-items:center;opacity:0.45;flex-shrink:0;'
  chevron.innerHTML = lucideSvg('chevron-down', 14)

  const renderLabel = () => {
    const found = options.find(o => o.value === current)
    labelEl.textContent = found ? found.text : ''
  }

  ;(root as HTMLElement).appendChild(labelEl)
  ;(root as HTMLElement).appendChild(chevron)

  root.addEventListener('click', (e) => {
    e.stopPropagation()
    if (openAppleSelectOwner === uid) { closeAppleSelectPopup(); return }
    closeAppleSelectPopup()
    if (options.length === 0) return

    const popup = document.createElement('div')
    popup.style.cssText = `
      position: fixed; z-index: 2100;
      min-width: 180px; max-height: 380px; overflow-y: auto;
      background: var(--b3-menu-background);
      border: 1px solid var(--b3-border-color);
      border-radius: 12px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.18), 0 0 0 0.5px rgba(0,0,0,0.06);
      padding: 6px;
      font-size: 13px; color: var(--b3-theme-on-background);
    `
    for (const opt of options) {
      const rowEl = document.createElement('div')
      const selected = opt.value === current
      rowEl.style.cssText = `
        padding: 9px 12px; border-radius: 8px; cursor: pointer;
        display: flex; align-items: center; gap: 8px;
        white-space: nowrap;
        background: ${selected ? 'color-mix(in srgb, var(--b3-theme-primary) 12%, transparent)' : 'transparent'};
        color: ${selected ? 'var(--b3-theme-primary)' : 'inherit'};
        font-weight: ${selected ? '600' : '400'};
      `
      const textSpan = document.createElement('span')
      textSpan.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;'
      textSpan.textContent = opt.text
      rowEl.appendChild(textSpan)
      if (selected) {
        const check = document.createElement('span')
        check.style.cssText = 'display:inline-flex;align-items:center;flex-shrink:0;'
        check.innerHTML = lucideSvg('check', 14)
        rowEl.appendChild(check)
      }
      rowEl.addEventListener('click', (ev) => {
        ev.stopPropagation()
        current = opt.value
        renderLabel()
        closeAppleSelectPopup()
      })
      rowEl.addEventListener('mouseenter', () => {
        if (opt.value !== current) rowEl.style.background = 'color-mix(in srgb, var(--b3-theme-on-surface) 8%, transparent)'
      })
      rowEl.addEventListener('mouseleave', () => {
        if (opt.value !== current) rowEl.style.background = 'transparent'
      })
      popup.appendChild(rowEl)
    }

    document.body.appendChild(popup)
    openAppleSelectPopup = popup
    openAppleSelectOwner = uid

    // 定位：默认向下展开；面板贴底空间不足时向上翻
    const rect = root.getBoundingClientRect()
    const width = Math.max(rect.width, 200)
    popup.style.width = `${width}px`
    const popupHeight = Math.min(popup.scrollHeight, 380)
    const spaceBelow = window.innerHeight - rect.bottom
    if (spaceBelow < popupHeight + 12 && rect.top > popupHeight + 12) {
      popup.style.top = `${Math.max(8, rect.top - popupHeight - 6)}px`
    } else {
      popup.style.top = `${Math.min(window.innerHeight - popupHeight - 8, rect.bottom + 6)}px`
    }
    popup.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, rect.left))}px`

    // 点外部关闭（capture 阶段，避免被卡片的 stopPropagation 拦截）
    const onDocClick = (ev: Event) => {
      if (popup.contains(ev.target as Node)) return
      closeAppleSelectPopup()
    }
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') closeAppleSelectPopup() }
    document.addEventListener('click', onDocClick, true)
    document.addEventListener('keydown', onKey, true)
    appleSelectPopupCleanup.push(() => {
      document.removeEventListener('click', onDocClick, true)
      document.removeEventListener('keydown', onKey, true)
    })
  })

  Object.defineProperties(root, {
    value: {
      get: () => current,
      set: (v: string) => {
        current = v
        // 值不在选项中时回退到第一项（模拟原生 select 不出现空白）
        if (v && !options.some(o => o.value === v) && options.length > 0) current = options[0].value
        renderLabel()
      },
    },
  })
  // 覆盖 appendChild：调用方 append 的 <option> 会被"消费"进选项列表
  ;(root as unknown as { appendChild: (child: HTMLOptionElement) => void }).appendChild = (child: HTMLOptionElement) => {
    options.push({ value: child.value, text: child.textContent || child.value })
    if (child.selected || options.length === 1) current = child.value
    renderLabel()
  }

  return root
}

/** Apple 风格按钮行（胶囊形取消 + 确认） */
function createBtnRow(): { wrap: HTMLElement; cancel: HTMLElement; confirm: HTMLElement } {
  const wrap = document.createElement('div')
  wrap.style.cssText = 'display: flex; gap: 10px; margin-top: 18px;'

  const cancel = document.createElement('button')
  cancel.textContent = t('tts.cancel', undefined, '取消')
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
  confirm.textContent = t('tts.startReading', undefined, '开始朗读')
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
