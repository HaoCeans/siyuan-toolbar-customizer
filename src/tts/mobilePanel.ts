/**
 * 手机端 TTS 面板 — Apple 风格
 *
 * 不依赖浏览器 SpeechSynthesis，不依赖 WebSocket
 * 纯 HTTP API + <audio> + Blob URL 播放，任何 WebView 都能用
 */

import { logger } from '@/utils/logger'
import { t } from '../i18n/runtime'
import { applyFloatPanelBackground, observeSiYuanThemeMode } from '../ui/floatPanelBackground'
import * as Notify from '../notification'
import { showMessage } from 'siyuan'
import { navigateToAdjacentDoc } from '../ui/mobileDocNav'
import { getCurrentDocId } from './ttsEngine'
import { buildPreparedTtsCacheKey, hashPreparedTtsContent, type PreparedCacheDescriptor, type PreparedTtsCacheEntry } from './preparedTtsCache'
import { pluginInstance } from '../toolbarManager'
import {
  getHttpTTSEngine, destroyHttpTTSEngine,
  SF_VOICES, getTTSSettings, saveTTSSettings, getSFAPIConfig, saveSFAPIConfig,
  ensureHighlightStyle, type TTSController,
  PREPARED_TTS_SYNTHESIS_SCHEMA_VERSION, PREPARED_TTS_PARAGRAPH_SCHEMA_VERSION,
  PREPARED_TTS_WAV_SCHEMA_VERSION, SF_TTS_MODEL,
} from './httpTtsEngine'
import { createIconButton, updateButtonIcon, injectSliderStyles, removeSliderStyles, lucideSvg } from './ttsIconHelper'

// ═══════════════════════════════════════════════════════════════
// 手机端 UI
// ═══════════════════════════════════════════════════════════════

let overlay: HTMLElement | null = null
let bar: HTMLElement | null = null
let panelThemeUnsub: (() => void) | null = null
let barThemeUnsub: (() => void) | null = null
let docChangeUnsub: (() => void) | null = null

type HttpTTSEngine = ReturnType<typeof getHttpTTSEngine>
type PrepareProgress = { current: number; total: number; paragraphIndex: number }
type PreparedHttpTTSEngine = HttpTTSEngine & {
  prepareAudio(
    start: number,
    end: number | undefined,
    onProgress: (progress: PrepareProgress) => void,
    trailingText?: string,
    descriptor?: PreparedCacheDescriptor,
  ): Promise<PreparedTtsCacheEntry | void>
  speakPrepared(cacheKey?: string): Promise<boolean>
  clearPreparedAudio(): void
  clearPreparedCache(cacheKey: string): Promise<boolean>
  hasPreparedAudioFor(cacheKey: string): Promise<boolean>
}

let mobilePanelGeneration = 0
let playbackContinuationGeneration = 0

const SILICON_FLOW_MODEL = SF_TTS_MODEL

function buildPanelDescriptor(engine: HttpTTSEngine, start: number, end: number | undefined, mode: 'free' | 'api', speed: number, speaker: string | number, action: 'stop' | 'next' | 'prev', trailingText?: string): PreparedCacheDescriptor {
  const paragraphs = engine.getParagraphs()
  const lastParagraph = Math.max(0, paragraphs.length - 1)
  const resolvedStart = Math.max(0, Math.min(start, lastParagraph))
  const resolvedEnd = Math.max(resolvedStart, Math.min(end ?? lastParagraph, lastParagraph))
  const selectedText = paragraphs
    .slice(resolvedStart, resolvedEnd + 1)
    .map(p => p.text)
  return {
    docId: getCurrentDocId(),
    contentHash: hashPreparedTtsContent(JSON.stringify(selectedText)),
    mode,
    provider: mode === 'api' ? 'siliconflow' : 'baidu-youdao-fallback',
    model: mode === 'api' ? SILICON_FLOW_MODEL : 'free-http-pipeline-v1',
    synthesisSchemaVersion: PREPARED_TTS_SYNTHESIS_SCHEMA_VERSION,
    paragraphSchemaVersion: PREPARED_TTS_PARAGRAPH_SCHEMA_VERSION,
    wavSchemaVersion: PREPARED_TTS_WAV_SCHEMA_VERSION,
    speed,
    speaker,
    start: resolvedStart,
    end: resolvedEnd,
    autoReadAction: action,
    trailingText,
  }
}

function engineHasPrepared(engine: PreparedHttpTTSEngine, key: string): Promise<boolean> {
  return engine.hasPreparedAudioFor(key)
}

/** 朗读完成后动作：'stop' | 'next' | 'prev' */
let autoReadAction: 'stop' | 'next' | 'prev' = 'stop'

// ─── 导出 ──

export async function showTTSOptionsMobile(): Promise<void> {
  logger.log('[TTS] showTTSOptionsMobile 被调用')
  ensureHighlightStyle()

  const engine = getHttpTTSEngine()
  const total = await engine.extractParagraphsAsync()
  logger.log(`[TTS] 提取段落: ${total} 段`)
  if (total === 0) { Notify.showErrorCommandCannotExecute(t('tts.noReadableContent', undefined, '当前页面没有可朗读的内容')); return }

  if (!engine.isIdle) { engine.stop(); removeBar() }
  showTTSPanel(total)
}

export function cleanupMobileTTS(): void {
  removeOverlay(); removeBar()
  destroyHttpTTSEngine()
  removeSliderStyles()
}

// ─── 面板 ──

function showTTSPanel(total: number): void {
  mobilePanelGeneration++
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
  header.innerHTML = `<span style="display:inline-flex;align-items:center;color:var(--b3-theme-primary)">${lucideSvg('volume-2', 20)}</span> ${t('tts.settings', undefined, '朗读设置')}`
  card.appendChild(header)

  // ── 模式切换（Apple 分段控件）──
  const savedConfig = getSFAPIConfig()
  const hasApiToken = !!savedConfig.apiKey
  const lastMode = getTTSSettings().lastMode
  const defaultMode = lastMode === 'api'
    ? 'api'
    : lastMode === 'free'
      ? 'free'
      : (hasApiToken ? 'api' : 'free')

  const modeBar = document.createElement('div')
  modeBar.dataset.ttsModeBar = 'true'
  modeBar.style.cssText = `
    display:flex;
    background:color-mix(in srgb, var(--b3-theme-on-surface) 8%, transparent);
    border-radius:10px;padding:2px;gap:0;margin-bottom:16px;
  `

  const modeFree = document.createElement('div')
  modeFree.textContent = t('tts.mode.freeUnstable', undefined, '免费（不稳定）')
  modeFree.style.cssText = `
    flex:1;padding:8px 0;border-radius:8px;text-align:center;
    font-size:13px;font-weight:500;letter-spacing:-0.01em;
    cursor:pointer;border:none;background:transparent;
    color:var(--b3-theme-on-background);
    transition:all 0.25s cubic-bezier(0.4,0,0.2,1);
    user-select:none;
  `

  const modeApi = document.createElement('div')
  modeApi.textContent = t('tts.mode.siliconFlow', undefined, '硅基流动')
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
  autoLabel.textContent = t('tts.afterReading', undefined, '朗读完成后')
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
    { v: 'stop', t: t('tts.stop', undefined, '停止') },
    { v: 'next', t: t('tts.autoNext', undefined, '自动继续朗读下一篇') },
    { v: 'prev', t: t('tts.autoPrevious', undefined, '自动继续朗读上一篇') },
  ]
  for (const o of autoOpts) { const opt = document.createElement('option'); opt.value = o.v; opt.textContent = o.t; autoSel.appendChild(opt) }
  // 从已保存的设置恢复
  const savedAutoAction = getTTSSettings().autoReadAction || 'stop'
  autoSel.value = savedAutoAction
  autoReadAction = savedAutoAction
  autoReadRow.appendChild(autoSel)
  card.appendChild(autoReadRow)

  function activateMode(mode: string) {
    if (modeBar.dataset.locked === 'true') return
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
  ov.addEventListener('touchend', (e) => {
    if (e.target === ov && ov.dataset.locked !== 'true') {
      e.preventDefault()
      removeOverlay()
    }
  }, { passive: false })
  document.body.appendChild(ov)
  overlay = ov
}

/** 免费模式面板 */
function renderFreeContent(container: HTMLElement, total: number, autoSel?: HTMLSelectElement): void {
  const settings = getTTSSettings()

  const hint = document.createElement('div')
  hint.style.cssText = 'font-size:11px;opacity:0.5;margin-bottom:14px;letter-spacing:-0.01em;'
  hint.textContent = t('tts.baiduFreeMobileHint', undefined, '使用百度翻译接口，免费但可能随时失效。音色需切换到「百度API」模式')
  container.appendChild(hint)

  // 语速
  const rateRow = makeRow(t('tts.rate', undefined, '语速'))
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
  const rangeRow = makeRow(t('tts.range', undefined, '范围'))
  const rangeSel = makeSelect(buildRangeOptions(total))
  rangeRow.appendChild(rangeSel)
  container.appendChild(rangeRow)

  // 按钮
  const btns = makeBtnRow()
  bindTap(btns.cancel, () => removeOverlay())
  bindTap(btns.confirm, async () => {
    autoReadAction = (autoSel?.value || 'stop') as 'stop' | 'next' | 'prev'
    saveTTSSettings({ autoReadAction })
    const speed = parseInt(rateSlider.value)
    saveTTSSettings({ speed, lastMode: 'free' })

    let startP = 0, endP: number | undefined
    parseRange(rangeSel.value, total, (s, e) => { startP = s; endP = e })
    removeOverlay()

    const engine = getHttpTTSEngine()
    engine.setSpeed(speed)
    engine.setSpeaker(4)
    engine.setMode('free')
    await engine.extractParagraphsAsync()

    const action = autoReadAction
    const descriptor = buildPanelDescriptor(engine, startP, endP, 'free', speed, 4, action, action === 'stop' ? t('tts.documentReadingCompleteSpeech', undefined, '本文档已经朗读完成') : undefined)
    const cacheKey = buildPreparedTtsCacheKey(descriptor)
    const continuationGeneration = ++playbackContinuationGeneration
    if (await engineHasPrepared(engine as PreparedHttpTTSEngine, cacheKey)) {
      if (continuationGeneration !== playbackContinuationGeneration) return
      installPlaybackCallbacks(engine, continuationGeneration)
      createBar(engine)
      if (await (engine as PreparedHttpTTSEngine).speakPrepared(cacheKey)) {
        return
      }
      if (continuationGeneration !== playbackContinuationGeneration) return
      removeBar()
    }
    if (continuationGeneration !== playbackContinuationGeneration) return
    installPlaybackCallbacks(engine, continuationGeneration)
    createBar(engine)
    engine.speak(descriptor.start, descriptor.end)
  })
  appendPrepareButton(container, total, autoSel, rangeSel, () => {
    const speed = parseInt(rateSlider.value)
    saveTTSSettings({ speed, lastMode: 'free' })
    const engine = getHttpTTSEngine()
    engine.setSpeed(speed)
    engine.setSpeaker(4)
    engine.setMode('free')
    return engine as PreparedHttpTTSEngine
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
  keyInput.placeholder = t('tts.apiKeyPlaceholder', undefined, '粘贴硅基流动 API Key（sk-xxx）')
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
  const speakerRow = makeRow(t('tts.timbre', undefined, '音色'))
  const speakerSel = makeSelect(SF_VOICES)
  speakerSel.value = settings.speaker
  speakerRow.appendChild(speakerSel)
  container.appendChild(speakerRow)

  // 语速
  const rateRow = makeRow(t('tts.rate', undefined, '语速'))
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
  const rangeRow = makeRow(t('tts.range', undefined, '范围'))
  const rangeSel = makeSelect(buildRangeOptions(total))
  rangeRow.appendChild(rangeSel)
  container.appendChild(rangeRow)

  // 按钮
  const btns = makeBtnRow()
  bindTap(btns.cancel, () => removeOverlay())
  bindTap(btns.confirm, async () => {
    autoReadAction = (autoSel?.value || 'stop') as 'stop' | 'next' | 'prev'
    saveTTSSettings({ autoReadAction })
    const apiKey = keyInput.value.trim()
    if (!apiKey) { Notify.showErrorCommandCannotExecute(t('tts.enterApiKey', undefined, '请填写 API Key')); return }

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
    engine.setDirectFetch(false)
    await engine.extractParagraphsAsync()

    const action = autoReadAction
    const descriptor = buildPanelDescriptor(engine, startP, endP, 'api', speed, speaker, action, action === 'stop' ? t('tts.documentReadingCompleteSpeech', undefined, '本文档已经朗读完成') : undefined)
    const cacheKey = buildPreparedTtsCacheKey(descriptor)
    const continuationGeneration = ++playbackContinuationGeneration
    if (await engineHasPrepared(engine as PreparedHttpTTSEngine, cacheKey)) {
      if (continuationGeneration !== playbackContinuationGeneration) return
      installPlaybackCallbacks(engine, continuationGeneration)
      createBar(engine)
      if (await (engine as PreparedHttpTTSEngine).speakPrepared(cacheKey)) {
        return
      }
      if (continuationGeneration !== playbackContinuationGeneration) return
      removeBar()
    }
    if (continuationGeneration !== playbackContinuationGeneration) return
    installPlaybackCallbacks(engine, continuationGeneration)
    createBar(engine)
    engine.speak(descriptor.start, descriptor.end)
  })
  appendPrepareButton(container, total, autoSel, rangeSel, () => {
    const apiKey = keyInput.value.trim()
    if (!apiKey) {
      Notify.showErrorCommandCannotExecute(t('tts.enterApiKey', undefined, '请填写 API Key'))
      return null
    }
    const speed = parseFloat(rateSlider.value)
    const speaker = speakerSel.value
    saveSFAPIConfig({ apiKey })
    saveTTSSettings({ apiSpeed: speed, speaker, lastMode: 'api' })
    const engine = getHttpTTSEngine()
    engine.setSpeed(speed)
    engine.setSpeaker(speaker)
    engine.setMode('api', apiKey)
    engine.setDirectFetch(false)
    return engine as PreparedHttpTTSEngine
  })
  container.appendChild(btns.wrap)
}

function installPlaybackCallbacks(engine: HttpTTSEngine, continuationGeneration = ++playbackContinuationGeneration): void {
  engine.onStateChange = (st, idx, tot) => updateBar(st, idx, tot)
  engine.onError = (msg) => { Notify.showErrorCommandCannotExecute(msg); removeBar() }
  engine.onFinish = async (prepared) => {
    if (autoReadAction === 'stop') {
      const status = bar?.querySelector('#tm-s') as HTMLElement
      if (status) status.textContent = t('tts.readingComplete', undefined, '朗读完成')
      engine.onStateChange = () => {}
      if (prepared) {
        removeBar()
        return
      }
      await engine.speakOnce(t('tts.documentReadingCompleteSpeech', undefined, '本文档已经朗读完成'), () => removeBar())
      return
    }
    const success = await navigateToAdjacentDoc(autoReadAction)
    if (continuationGeneration !== playbackContinuationGeneration) return
    if (!success) { removeBar(); showMessage(t('tts.noMoreDocuments', undefined, '已无更多文档'), 2000, 'info'); return }
    await waitForDocLoaded()
    if (continuationGeneration !== playbackContinuationGeneration) return
    await engine.extractParagraphsAsync()
    if (continuationGeneration !== playbackContinuationGeneration) return
    engine.speak(0, undefined)
  }
}

function appendPrepareButton(
  container: HTMLElement,
  total: number,
  autoSel: HTMLSelectElement | undefined,
  rangeSel: HTMLSelectElement,
  configureEngine: () => PreparedHttpTTSEngine | null,
): void {
  const prepareRow = document.createElement('div')
  prepareRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-top:10px'
  const refresh = makeBtn(t('tts.refresh', undefined, '刷新'), { flex: 1, secondary: true })
  refresh.style.display = 'none'
  const prepareButton = makeBtn(t('tts.prepareAndRead', undefined, '手机息屏或后台朗读准备'), { flex: 2, secondary: true })
  prepareButton.style.minWidth = '0'
  prepareButton.style.boxSizing = 'border-box'
  prepareButton.style.whiteSpace = 'normal'

  const setPreparedButtonStyle = (prepared: boolean) => {
    prepareButton.style.background = prepared ? 'var(--b3-theme-success)' : 'var(--b3-theme-primary-lightest, color-mix(in srgb, var(--b3-theme-primary) 12%, transparent))'
    prepareButton.style.color = prepared ? 'var(--b3-theme-on-primary, #fff)' : 'var(--b3-theme-primary)'
    prepareButton.style.border = prepared ? '1px solid var(--b3-theme-success)' : '1px solid var(--b3-theme-primary-light, color-mix(in srgb, var(--b3-theme-primary) 35%, transparent))'
  }
  setPreparedButtonStyle(false)
  prepareRow.appendChild(refresh)
  prepareRow.appendChild(prepareButton)

  let preparing = false
  let preparedEngine: PreparedHttpTTSEngine | null = null
  let preparedKey = ''
  let restoreGeneration = 0
  const taskGeneration = ++mobilePanelGeneration
  const card = container.parentElement
  const modeBar = card?.querySelector('[data-tts-mode-bar="true"]') as HTMLElement | null
  const controls = Array.from(card?.querySelectorAll('input, select, a') || []) as HTMLElement[]
  const setLocked = (locked: boolean) => {
    preparing = locked
    if (modeBar) { modeBar.dataset.locked = locked ? 'true' : 'false'; modeBar.style.pointerEvents = locked ? 'none' : ''; modeBar.style.opacity = locked ? '0.55' : '' }
    if (overlay) overlay.dataset.locked = locked ? 'true' : 'false'
    for (const control of controls) { if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) control.disabled = locked; else control.style.pointerEvents = locked ? 'none' : '' }
    prepareButton.style.opacity = locked ? '0.65' : '1'
  }
  const currentDescriptor = (engine: PreparedHttpTTSEngine) => {
    let start = 0, end: number | undefined
    parseRange(rangeSel.value, total, (s, e) => { start = s; end = e })
    const action = (autoSel?.value || 'stop') as 'stop' | 'next' | 'prev'
    const settings = getTTSSettings()
    const mode = settings.lastMode === 'api' ? 'api' : 'free'
    const speed = mode === 'api' ? (settings.apiSpeed ?? 1) : settings.speed
    const speaker = mode === 'api' ? settings.speaker : 4
    return buildPanelDescriptor(engine, start, end, mode, speed, speaker, action, action === 'stop' ? t('tts.documentReadingCompleteSpeech', undefined, '本文档已经朗读完成') : undefined)
  }
  const showIdle = () => {
    preparedEngine = null
    preparedKey = ''
    prepareButton.textContent = t('tts.prepareAndRead', undefined, '手机息屏或后台朗读准备')
    setPreparedButtonStyle(false)
    refresh.style.display = 'none'
  }
  const showReady = (engine: PreparedHttpTTSEngine, key: string) => {
    preparedEngine = engine
    preparedKey = key
    prepareButton.textContent = t('tts.cachedClickToRead', undefined, '已缓存，请点击开始朗读')
    setPreparedButtonStyle(true)
    refresh.style.display = 'block'
  }
  const prepareCurrent = async (force: boolean) => {
    if (preparing) return
    const engine = configureEngine()
    if (!engine) return
    autoReadAction = (autoSel?.value || 'stop') as 'stop' | 'next' | 'prev'
    saveTTSSettings({ autoReadAction })
    let startP = 0, endP: number | undefined
    parseRange(rangeSel.value, total, (s, e) => { startP = s; endP = e })
    const completionSpeech = autoReadAction === 'stop' ? t('tts.documentReadingCompleteSpeech', undefined, '本文档已经朗读完成') : undefined
    setLocked(true)
    prepareButton.textContent = t('tts.preparingAudio', { current: 0, total: (endP ?? total - 1) - startP + 1 + (completionSpeech ? 1 : 0) }, '正在准备音频')
    try {
      await engine.extractParagraphsAsync()
      const descriptor = currentDescriptor(engine)
      const key = buildPreparedTtsCacheKey(descriptor)
      startP = descriptor.start
      endP = descriptor.end
      if (force) {
        engine.clearPreparedAudio()
        await engine.clearPreparedCache(key)
      }
      const cached = await engineHasPrepared(engine, key)
      const shouldPrepare = force || !cached
      if (shouldPrepare) {
        await engine.prepareAudio(startP, endP, ({ current, total: progressTotal }) => {
          if (taskGeneration === mobilePanelGeneration) prepareButton.textContent = t('tts.preparingAudio', { current, total: progressTotal }, `正在准备 ${current} / ${progressTotal}`)
        }, completionSpeech, descriptor)
      }
      if (taskGeneration !== mobilePanelGeneration || !overlay) return
      if (!(await engineHasPrepared(engine, key))) throw new Error('准备完成后未生成可播放音频')
      showReady(engine, key)
      if (shouldPrepare) Notify.showSuccess(t('tts.preparedBackgroundReady', undefined, '准备完成，可以息屏或挂后台朗读'))
    } catch (error) {
      if (taskGeneration !== mobilePanelGeneration) return
      showIdle()
      const message = error instanceof Error ? error.message : String(error)
      const key = force ? 'tts.reprepareFailed' : 'tts.prepareFailed'
      const fallback = force ? `重新准备失败：${message}` : `准备失败：${message}`
      Notify.showErrorCommandCannotExecute(t(key, { error: message }, fallback))
    } finally {
      if (taskGeneration === mobilePanelGeneration) setLocked(false)
    }
  }
  bindTap(refresh, () => { void prepareCurrent(true) })
  container.appendChild(prepareRow)

  const restore = async () => {
    const generation = ++restoreGeneration
    const engine = configureEngine()
    if (!engine) return
    await engine.extractParagraphsAsync()
    if (generation !== restoreGeneration || taskGeneration !== mobilePanelGeneration || !overlay) return
    const descriptor = currentDescriptor(engine)
    const key = buildPreparedTtsCacheKey(descriptor)
    const hasPrepared = await engineHasPrepared(engine, key)
    logger.log('[TTS] 准备状态判定:', {
      docId: descriptor.docId,
      range: `${descriptor.start}-${descriptor.end}`,
      mode: descriptor.mode,
      hit: hasPrepared,
    })
    if (hasPrepared && generation === restoreGeneration && taskGeneration === mobilePanelGeneration && overlay) showReady(engine, key)
    else if (generation === restoreGeneration && taskGeneration === mobilePanelGeneration) showIdle()
  }
  for (const control of controls) {
    if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) {
      control.addEventListener('change', () => { showIdle(); void restore() })
      if (control instanceof HTMLInputElement) control.addEventListener('input', () => { showIdle(); void restore() })
    }
  }
  void restore()

  // 切换文档后必须重新判定准备状态：缓存键包含文档 ID 与全文哈希，
  // 旧文档的「已缓存」不应延续到新文档。手机端 switch-protyle 可能延迟或不触发，
  // 因此两个事件都监听；点击准备按钮时还会再核对一次（见下方 bindTap）。
  // 切换免费/API 模式会重新渲染本组件，这里先退订，避免监听器累积。
  if (docChangeUnsub) { docChangeUnsub(); docChangeUnsub = null }
  const handleDocChanged = () => { void restore() }
  const panelEventBus = pluginInstance?.app?.eventBus
  panelEventBus?.on('switch-protyle', handleDocChanged)
  panelEventBus?.on('loaded-protyle-dynamic', handleDocChanged)
  docChangeUnsub = () => {
    panelEventBus?.off('switch-protyle', handleDocChanged)
    panelEventBus?.off('loaded-protyle-dynamic', handleDocChanged)
  }

  bindTap(prepareButton, async () => {
    if (preparing) return
    if (preparedEngine && preparedKey) {
      // 关键：preparedKey 可能是切换文档前算出来的，直接用会播放上一篇的音频。
      // 因此播放前按当前文档/范围/参数重新计算一次键，不一致则重新判定与准备。
      await preparedEngine.extractParagraphsAsync()
      const currentKey = buildPreparedTtsCacheKey(currentDescriptor(preparedEngine))
      if (currentKey !== preparedKey) {
        logger.log('[TTS] 准备状态已失效（文档或参数已变化），重新准备')
        showIdle()
        await prepareCurrent(false)
        return
      }
      if (await engineHasPrepared(preparedEngine, preparedKey)) {
        const continuationGeneration = ++playbackContinuationGeneration
        installPlaybackCallbacks(preparedEngine, continuationGeneration)
        createBar(preparedEngine)
        if (await preparedEngine.speakPrepared(preparedKey)) removeOverlay()
        else if (continuationGeneration === playbackContinuationGeneration) removeBar()
        return
      }
    }
    await prepareCurrent(false)
  })
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

  const status = el('span', t('tts.reading', undefined, '朗读中'))
  status.id = 'tm-s'
  status.style.cssText = 'font-weight:600;font-size:13px;white-space:nowrap;letter-spacing:-0.02em;'
  b.appendChild(status)

  const prog = el('span', '0 / 0')
  prog.id = 'tm-p'
  prog.style.cssText = 'opacity:0.45;font-size:12px;white-space:nowrap;margin-left:6px;font-variant-numeric:tabular-nums;'
  b.appendChild(prog)

  b.appendChild(el('span', ''))!.style.flex = '1'

  // 控制按钮（SVG 图标）
  b.appendChild(createIconButton('skip-back', t('tts.previousParagraph', undefined, '上一段'), 18, () => engine.prevParagraph(), { isMobile: true }))

  const pp = createIconButton('pause', t('tts.pause', undefined, '暂停'), 20, () => {
    if (engine.isPlaying) engine.pause()
    else if (engine.isPaused) engine.resume()
  }, { isMobile: true, isPrimary: true })
  pp.id = 'tm-pp'
  b.appendChild(pp)

  b.appendChild(createIconButton('skip-forward', t('tts.nextParagraph', undefined, '下一段'), 18, () => engine.nextParagraph(), { isMobile: true }))

  // 分隔线
  const sep = document.createElement('div')
  sep.style.cssText = 'width:1px;height:24px;background:var(--b3-theme-on-surface);opacity:0.1;margin:0 4px;'
    b.appendChild(sep)

  b.appendChild(createIconButton('square', t('tts.stop', undefined, '停止'), 18, () => { playbackContinuationGeneration++; engine.stop(); removeBar() }, { isMobile: true }))


  document.body.appendChild(b)
  bar = b
}

function updateBar(st: string, idx: number, tot: number): void {
  if (!bar) return
  const s = bar.querySelector('#tm-s') as HTMLElement
  const p = bar.querySelector('#tm-p') as HTMLElement
  const pp = bar.querySelector('#tm-pp') as HTMLElement
  const m: Record<string, string> = { loading: t('tts.synthesizing', undefined, '合成中'), playing: t('tts.reading', undefined, '朗读中'), paused: t('tts.paused', undefined, '已暂停'), idle: t('tts.stop', undefined, '停止') }
  if (s) s.textContent = m[st] || t('tts.reading', undefined, '朗读中')
  if (p && tot > 0) p.textContent = `${idx + 1} / ${tot}`
  if (pp) {
    const isPlaying = st === 'playing' || st === 'loading'
    updateButtonIcon(pp, isPlaying ? 'pause' : 'play', 18, true)
  }
}

// ─── UI 工具 ──

function buildRangeOptions(total: number): Array<{ v: string; t: string }> {
  const opts: Array<{ v: string; t: string }> = [{ v: 'all', t: t('tts.allParagraphs', { total }, `全部 ${total} 段`) }]
  if (total > 5) {
    opts.push({ v: 'first-half', t: t('tts.firstHalfRange', { end: Math.floor(total / 2) }, `前半（1-${Math.floor(total / 2)}段）`) })
    opts.push({ v: 'second-half', t: t('tts.secondHalfRange', { start: Math.floor(total / 2) + 1, total }, `后半（${Math.floor(total / 2) + 1}-${total}段）`) })
  }
  return opts
}

function parseRange(value: string, total: number, cb: (start: number, end: number | undefined) => void): void {
  if (value === 'first-half') cb(0, Math.floor(total / 2) - 1)
  else if (value === 'second-half') cb(Math.floor(total / 2), undefined)
  else cb(0, undefined)
}

function bindTap(el: HTMLElement, fn: () => void): void {
  let touchActive = false
  let suppressClickUntil = 0

  el.addEventListener('touchstart', (e) => {
    touchActive = true
    e.preventDefault()
  }, { passive: false })
  el.addEventListener('touchend', (e) => {
    if (!touchActive) return
    touchActive = false
    suppressClickUntil = Date.now() + 700
    e.preventDefault()
    fn()
  }, { passive: false })
  el.addEventListener('touchcancel', () => {
    touchActive = false
  })
  el.addEventListener('click', (e) => {
    if (Date.now() < suppressClickUntil) {
      e.preventDefault()
      return
    }
    fn()
  })
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
  const cancel = makeBtn(t('tts.cancel', undefined, '取消'), { flex: 1, secondary: true })
  const confirm = makeBtn(t('tts.startReading', undefined, '开始朗读'), { flex: 2, primary: true })
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
  mobilePanelGeneration++
  const activeElement = document.activeElement
  if (
    activeElement instanceof HTMLElement
    && (activeElement.matches('input, textarea') || activeElement.isContentEditable)
  ) {
    activeElement.blur()
  }

  if (panelThemeUnsub) { panelThemeUnsub(); panelThemeUnsub = null }
  if (docChangeUnsub) { docChangeUnsub(); docChangeUnsub = null }
  if (overlay) { overlay.remove(); overlay = null }
}
function removeBar(): void {
  if (barThemeUnsub) { barThemeUnsub(); barThemeUnsub = null }
  if (bar) { bar.remove(); bar = null }
}
