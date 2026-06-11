/**
 * HTTP TTS 引擎 — 百度免费 + 硅基流动 API
 *
 * 从 mobilePanel.ts 提取的平台无关引擎模块。
 * 桌面端（Electron）和手机端（WebView）共用。
 * 百度/有道通过思源 forwardProxy 代理；硅基流动桌面端可直接 fetch，手机端走 forwardProxy。
 */

import { getTTSEngine, ParagraphInfo, getCurrentDocId } from './ttsEngine'
import { forwardProxy } from '../api'
import { pluginInstance } from '../toolbarManager'

// ═══════════════════════════════════════════════════════════════
// 常量
// ═══════════════════════════════════════════════════════════════

const BAIDU_TTS = 'https://tts.baidu.com/text2audio'
const YOUDAO_TTS = 'https://tts.youdao.com/fanyivoice'

const HIGHLIGHT_CLASS = 'tts-current-paragraph'
let styleEl: HTMLStyleElement | null = null

// 不朗读的块类型
const SKIP_DATA_TYPES = new Set([
  'NodeCodeBlock', 'NodeMathBlock', 'NodeHTMLBlock',
  'NodeIFrame', 'NodeWidget', 'NodeEmbedBlock',
  'NodeThematicBreak', 'NodeAudio', 'NodeVideo',
])

// ═══════════════════════════════════════════════════════════════
// 类型导出
// ═══════════════════════════════════════════════════════════════

export type HttpTTSState = 'idle' | 'loading' | 'playing' | 'paused'

export interface TTSSettings {
  speed: number        // 免费模式语速（百度 0-15，默认 5）
  apiSpeed: number     // 硅基流动语速（0.25-4.0，默认 1.0）
  speaker: string      // 硅基流动音色名，如 'alex'
  lastMode?: string    // 上次使用的模式：'webspeech' | 'free' | 'api'
  autoReadAction?: 'stop' | 'next' | 'prev'  // 朗读完成后动作，默认 'stop'
}

export interface SFAPIConfig {
  apiKey: string       // 硅基流动 API Key（sk-xxx）
}

/** 播放控制条统一接口 */
export interface TTSController {
  isPlaying: boolean; isPaused: boolean
  prevParagraph(): void; nextParagraph(): void
  pause(): void; resume(): void; stop(): void
}

// ═══════════════════════════════════════════════════════════════
// 硅基流动 CosyVoice2 音色列表
// ═══════════════════════════════════════════════════════════════

export const SF_VOICES = [
  { v: 'alex', t: 'Alex · 沉稳男声' },
  { v: 'benjamin', t: 'Benjamin · 低沉男声' },
  { v: 'charles', t: 'Charles · 磁性男声' },
  { v: 'david', t: 'David · 欢快男声' },
  { v: 'anna', t: 'Anna · 沉稳女声' },
  { v: 'bella', t: 'Bella · 激情女声' },
  { v: 'claire', t: 'Claire · 温柔女声（默认）' },
  { v: 'diana', t: 'Diana · 欢快女声' },
]

const SF_MODEL = 'FunAudioLLM/CosyVoice2-0.5B'
const SF_API_URL = 'https://api.siliconflow.cn/v1/audio/speech'

// ═══════════════════════════════════════════════════════════════
// 设置持久化 — 内存缓存 + plugin.saveData/loadData + localStorage 兜底
// ═══════════════════════════════════════════════════════════════

const SF_API_CONFIG_KEY = 'siyuan-tc-sf-api'
const TTS_SETTINGS_KEY = 'siyuan-tc-tts-settings'

const DEFAULT_TTS_SETTINGS: TTSSettings = { speed: 5, apiSpeed: 1.0, speaker: 'claire' }
const DEFAULT_SF_CONFIG: SFAPIConfig = { apiKey: '' }

// 内存缓存
let settingsCache: TTSSettings | null = null
let sfConfigCache: SFAPIConfig | null = null

/** 插件 onload 时调用，从 plugin.loadData 填充缓存 */
export async function initTTSSettings(): Promise<void> {
  if (pluginInstance) {
    try {
      const data = await pluginInstance.loadData(TTS_SETTINGS_KEY)
      if (data && typeof data === 'object') {
        if ((data as any).apiSpeed === undefined) (data as any).apiSpeed = 1.0
        settingsCache = data as TTSSettings
        localStorage.setItem(TTS_SETTINGS_KEY, JSON.stringify(data))
      }
    } catch { /* ignore */ }
    try {
      const data = await pluginInstance.loadData(SF_API_CONFIG_KEY)
      if (data && typeof data === 'object') {
        sfConfigCache = data as SFAPIConfig
        localStorage.setItem(SF_API_CONFIG_KEY, JSON.stringify(data))
      }
    } catch { /* ignore */ }
  }
}

export function getTTSSettings(): TTSSettings {
  if (settingsCache) return { ...settingsCache }
  // 兜底：从 localStorage 读取
  try {
    const raw = localStorage.getItem(TTS_SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.apiSpeed === undefined) parsed.apiSpeed = 1.0
      settingsCache = parsed
      return { ...parsed }
    }
  } catch {}
  return { ...DEFAULT_TTS_SETTINGS }
}

export function saveTTSSettings(s: Partial<TTSSettings>): void {
  const current = getTTSSettings()
  const merged = { ...current, ...s }
  settingsCache = merged
  localStorage.setItem(TTS_SETTINGS_KEY, JSON.stringify(merged))
  // 异步持久化到 plugin data（fire-and-forget）
  if (pluginInstance) {
    pluginInstance.saveData(TTS_SETTINGS_KEY, merged).catch(() => {})
  }
}

export function getSFAPIConfig(): SFAPIConfig {
  if (sfConfigCache) return { ...sfConfigCache }
  try {
    const raw = localStorage.getItem(SF_API_CONFIG_KEY)
    if (raw) {
      sfConfigCache = JSON.parse(raw)
      return { ...sfConfigCache! }
    }
  } catch {}
  return { ...DEFAULT_SF_CONFIG }
}

export function saveSFAPIConfig(cfg: Partial<SFAPIConfig>): void {
  const current = getSFAPIConfig()
  const merged = { ...current, ...cfg }
  sfConfigCache = merged
  localStorage.setItem(SF_API_CONFIG_KEY, JSON.stringify(merged))
  if (pluginInstance) {
    pluginInstance.saveData(SF_API_CONFIG_KEY, merged).catch(() => {})
  }
}

// ═══════════════════════════════════════════════════════════════
// 高亮样式
// ═══════════════════════════════════════════════════════════════

export function ensureHighlightStyle(): void {
  if (styleEl) return
  styleEl = document.createElement('style')
  styleEl.id = 'tts-http-highlight-style'
  styleEl.textContent = `.${HIGHLIGHT_CLASS}{background:linear-gradient(to bottom,rgba(255,243,185,0.55),rgba(255,230,130,0.35))!important;border-radius:6px;box-shadow:0 0 0 1px rgba(255,210,80,0.08);transition:background .3s ease}html[data-theme-mode="dark"] .${HIGHLIGHT_CLASS}{background:rgba(255,255,255,0.07)!important;border-left:3px solid rgba(255,255,255,0.18)!important;border-radius:4px;box-shadow:inset 0 0 12px rgba(255,255,255,0.03)}`
  document.head.appendChild(styleEl)
}

// ═══════════════════════════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════════════════════════

export function decodeProxyBody(body: string, encoding?: string): ArrayBuffer | null {
  if (!body || typeof body !== 'string') return null
  if (encoding === 'base64' || encoding === 'base64-url') {
    try {
      const bin = atob(body); const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return bytes.buffer
    } catch {}
  }
  if (/^[A-Za-z0-9+/=]+$/.test(body.substring(0, 200))) {
    try {
      const bin = atob(body); const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      if (bytes.length > 3 && (bytes[0] === 0xFF || (bytes[0] === 0x49 && bytes[1] === 0x44))) return bytes.buffer
    } catch {}
  }
  return null
}

function splitText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text]
  const chunks: string[] = []
  const breaks = ['。', '？', '！', '；', '，', '\n', '.', '?', '!', ';', ',']
  let rest = text
  while (rest.length > 0) {
    if (rest.length <= maxLen) { chunks.push(rest); break }
    const slice = rest.substring(0, maxLen + 1)
    let cut = -1
    for (const bp of breaks) {
      const idx = slice.lastIndexOf(bp)
      if (idx > 0) { cut = idx + 1; break }
    }
    if (cut <= 0) cut = maxLen
    chunks.push(rest.substring(0, cut))
    rest = rest.substring(cut)
  }
  return chunks
}

function concatBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  if (buffers.length === 0) return new ArrayBuffer(0)
  if (buffers.length === 1) return buffers[0]
  const total = buffers.reduce((s, b) => s + b.byteLength, 0)
  const result = new Uint8Array(total)
  let off = 0
  for (const b of buffers) { result.set(new Uint8Array(b), off); off += b.byteLength }
  return result.buffer
}

// ═══════════════════════════════════════════════════════════════
// 硅基流动 CosyVoice2 TTS — forwardProxy / 直接 fetch 双路径
// ═══════════════════════════════════════════════════════════════

async function fetchSiliconFlowViaProxy(text: string, speed: number, apiKey: string, voiceName: string): Promise<ArrayBuffer> {
  const payload = {
    model: SF_MODEL,
    input: text,
    voice: `${SF_MODEL}:${voiceName}`,
    response_format: 'mp3',
    speed: Math.max(0.25, Math.min(4.0, speed)),
  }

  console.log(`[SiliconFlowTTS] forwardProxy请求: voice=${payload.voice}, speed=${payload.speed.toFixed(2)}`)

  const result = await forwardProxy(SF_API_URL, 'POST', payload, [
    { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  ], 30000, 'application/json', 'base64')

  if (!result || result.status !== 200) {
    const errDetail = result?.body ? String(result.body).substring(0, 200) : '无响应'
    throw new Error(`硅基流动 API HTTP ${result?.status || '无响应'}: ${errDetail}`)
  }
  if (!result.body) throw new Error('硅基流动 API 返回空数据')

  const audioData = decodeProxyBody(result.body, result.bodyEncoding)
  if (!audioData || audioData.byteLength < 100) {
    throw new Error(`硅基流动 API 返回数据异常: ${audioData?.byteLength || 0} 字节`)
  }

  const b0 = new Uint8Array(audioData)[0], b1 = new Uint8Array(audioData)[1]
  if (b0 !== 0xFF && !(b0 === 0x49 && b1 === 0x44)) {
    throw new Error('硅基流动 API 返回非音频数据')
  }

  console.log(`[SiliconFlowTTS] 成功: ${audioData.byteLength} 字节`)
  return audioData
}

async function fetchSiliconFlowDirect(text: string, speed: number, apiKey: string, voiceName: string): Promise<ArrayBuffer> {
  const payload = {
    model: SF_MODEL,
    input: text,
    voice: `${SF_MODEL}:${voiceName}`,
    response_format: 'mp3',
    speed: Math.max(0.25, Math.min(4.0, speed)),
  }

  console.log(`[SiliconFlowTTS] 直接fetch请求: voice=${payload.voice}, speed=${payload.speed.toFixed(2)}`)

  const resp = await fetch(SF_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`硅基流动 API HTTP ${resp.status}: ${errText.substring(0, 200)}`)
  }

  const audio = await resp.arrayBuffer()
  if (!audio || audio.byteLength < 100) throw new Error('硅基流动 API 返回数据异常')

  const b0 = new Uint8Array(audio)[0], b1 = new Uint8Array(audio)[1]
  if (b0 !== 0xFF && !(b0 === 0x49 && b1 === 0x44)) {
    throw new Error('硅基流动 API 返回非音频数据')
  }

  console.log(`[SiliconFlowTTS] 成功: ${audio.byteLength} 字节`)
  return audio
}

// ═══════════════════════════════════════════════════════════════
// HttpTTSEngine — 核心 TTS 引擎
// ═══════════════════════════════════════════════════════════════

export class HttpTTSEngine {
  private paragraphs: ParagraphInfo[] = []
  private currentIndex = -1
  private state: HttpTTSState = 'idle'
  private stopped = false
  private endParagraphIndex = -1
  private speed = 5  // 百度语速 0-15，默认 5
  private mode: 'free' | 'api' = 'free'
  private apiToken = ''
  private speaker: number | string = 4
  private directFetch = false  // 桌面端可设为 true，直接 fetch 不走 forwardProxy

  private audioEl: HTMLAudioElement = new Audio()
  private blobUrl: string | null = null

  onStateChange?: (state: HttpTTSState, index: number, total: number) => void
  onError?: (msg: string) => void
  onFinish?: () => void

  // ─── 设置 ──────────────────────────────────────────

  setSpeed(speed: number): void { this.speed = Math.max(0, Math.min(15, speed)) }
  setSpeaker(speaker: number | string): void { this.speaker = speaker }
  setMode(mode: 'free' | 'api', token?: string): void {
    this.mode = mode
    if (token) this.apiToken = token
  }
  /** 桌面端设为 true，直接 fetch 硅基流动 API（无 CORS） */
  setDirectFetch(enabled: boolean): void { this.directFetch = enabled }

  // ─── 段落提取 ──────────────────────────────────────

  extractParagraphs(): number {
    const base = getTTSEngine()
    base.extractParagraphs()
    this.paragraphs = base.getParagraphs()
    return this.paragraphs.length
  }

  async extractParagraphsAsync(): Promise<number> {
    const sync = this.extractParagraphs()
    if (sync > 0) return sync

    const docId = getCurrentDocId()
    if (!docId) return 0
    try {
      const resp = await forwardProxy('/api/filetree/getDoc', 'POST', { id: docId, mode: 0, size: 102400 })
      if (resp?.status !== 200) return 0
      const data = typeof resp.body === 'string' ? JSON.parse(resp.body) : resp.body
      if (data?.code !== 0 || !data?.data?.content) return 0

      const div = document.createElement('div')
      div.innerHTML = data.data.content.replace(/\{:[^}]+\}/g, '')
      div.querySelectorAll('pre,[data-type="NodeCodeBlock"],[data-type="NodeMathBlock"]').forEach(e => e.remove())

      this.paragraphs = []
      for (const block of div.querySelectorAll('[data-node-id]')) {
        const el = block as HTMLElement
        const dt = el.getAttribute('data-type')
        if (dt && SKIP_DATA_TYPES.has(dt)) continue
        const text = (el.textContent || '').trim()
        if (text) this.paragraphs.push({ element: el, text })
      }
      return this.paragraphs.length
    } catch { return 0 }
  }

  getParagraphs(): ParagraphInfo[] { return this.paragraphs }

  // ─── 播放控制 ──────────────────────────────────────

  speak(startParagraph = 0, endParagraph?: number): boolean {
    this.stop()
    this.stopped = false
    this.endParagraphIndex = endParagraph ?? this.paragraphs.length - 1
    if (this.paragraphs.length === 0) return false

    ensureHighlightStyle()
    this.currentIndex = Math.max(0, Math.min(startParagraph, this.paragraphs.length - 1))
    this.playCurrentParagraph()
    return true
  }

  pause(): void {
    if (this.state !== 'playing') return
    this.audioEl.pause()
    this.state = 'paused'
    this.notify()
  }

  resume(): void {
    if (this.state !== 'paused') return
    this.audioEl.play().catch(() => {})
    this.state = 'playing'
    this.notify()
  }

  stop(): void {
    this.stopped = true
    this.cleanupAudio()
    this.clearHighlight()
    this.state = 'idle'
    this.currentIndex = -1
    this.notify()
  }

  jumpToParagraph(index: number): void {
    if (index < 0 || index >= this.paragraphs.length) return
    this.stopped = false
    this.cleanupAudio()
    this.clearHighlight()
    this.currentIndex = index
    this.playCurrentParagraph()
  }

  nextParagraph(): void {
    if (this.currentIndex < this.paragraphs.length - 1) this.jumpToParagraph(this.currentIndex + 1)
  }

  prevParagraph(): void {
    if (this.currentIndex > 0) this.jumpToParagraph(this.currentIndex - 1)
  }

  // ─── 状态查询 ──────────────────────────────────────

  get isPlaying(): boolean { return this.state === 'playing' }
  get isPaused(): boolean { return this.state === 'paused' }
  get isIdle(): boolean { return this.state === 'idle' }
  get isLoading(): boolean { return this.state === 'loading' }
  get currentParagraphIndex(): number { return this.currentIndex }
  get totalParagraphs(): number { return this.paragraphs.length }

  cleanup(): void {
    this.stop()
    this.paragraphs = []
  }

  // ─── 内部 ────────────────────────────────────────

  private playCurrentParagraph(): void {
    if (this.stopped) return

    if (this.currentIndex > this.endParagraphIndex || this.currentIndex >= this.paragraphs.length) {
      this.clearHighlight()
      this.state = 'idle'
      this.currentIndex = -1
      this.notify()
      this.onFinish?.()
      return
    }

    const para = this.paragraphs[this.currentIndex]
    this.state = 'loading'
    this.applyHighlight(para.element)
    this.notify()

    this.fetchTTSAudio(para.text)
      .then(audioData => {
        if (this.stopped) return
        return this.playAudioData(audioData)
      })
      .then(() => {
        if (this.stopped) return
        this.currentIndex++
        this.playCurrentParagraph()
      })
      .catch(err => {
        if (this.stopped) return
        const msg = err instanceof Error ? err.message : String(err)
        console.warn('[HttpTTS] 段落朗读失败，跳过:', msg)
        // 跳过失败段落，继续下一段
        this.currentIndex++
        this.playCurrentParagraph()
      })
  }

  private async fetchTTSAudio(text: string): Promise<ArrayBuffer> {
    // ★ API 模式：硅基流动 CosyVoice2
    if (this.mode === 'api' && this.apiToken) {
      console.log(`[HttpTTS] API模式: 硅基流动 CosyVoice2 (directFetch=${this.directFetch})`)
      if (this.directFetch) {
        return fetchSiliconFlowDirect(text, this.speed, this.apiToken, String(this.speaker))
      }
      return fetchSiliconFlowViaProxy(text, this.speed, this.apiToken, String(this.speaker))
    }

    // ★ 免费模式：多 API 降级
    const chunks = splitText(text, 500)
    const audioParts: ArrayBuffer[] = []

    for (let i = 0; i < chunks.length; i++) {
      if (this.stopped) throw new Error('stopped')
      const chunk = chunks[i]
      console.log(`[HttpTTS] 免费模式 ${i + 1}/${chunks.length}: "${chunk.substring(0, 30)}..."`)
      const audio = await this.tryFetchChunk(chunk)
      audioParts.push(audio)
    }

    return concatBuffers(audioParts)
  }

  /** 逐个尝试 TTS API，返回第一个成功的音频数据 */
  private async tryFetchChunk(chunk: string): Promise<ArrayBuffer> {
    // ① 百度翻译 TTS
    const safeSpeed = Math.max(1, Math.min(7, this.speed))
    const baiduFanyiUrl = `https://fanyi.baidu.com/gettts?lan=zh&text=${encodeURIComponent(chunk)}&spd=${safeSpeed}&source=web`
    const audio0 = await this.tryProxy(baiduFanyiUrl, '百度翻译', [
      { 'Referer': 'https://fanyi.baidu.com/' },
    ])
    if (audio0) return audio0

    // ② 百度 TTS
    const baiduUrl = `${BAIDU_TTS}?lan=zh&ie=UTF-8&spd=${this.speed}&pit=5&vol=5&per=${Number(this.speaker)}&ctp=1&cuid=siyuan_tts&tex=${encodeURIComponent(chunk)}`
    const audio1 = await this.tryProxy(baiduUrl, '百度TTS', [
      { 'Referer': 'https://fanyi.baidu.com/' },
    ])
    if (audio1) return audio1

    // ③ 有道 TTS
    const youdaoUrl = `${YOUDAO_TTS}?word=${encodeURIComponent(chunk)}&le=zh&keyfrom=speaker-target`
    const audio2 = await this.tryProxy(youdaoUrl, '有道', [
      { 'Referer': 'https://fanyi.youdao.com/' },
    ])
    if (audio2) return audio2

    throw new Error('所有 TTS 服务均不可用')
  }

  /** 通过 forwardProxy 获取音频 */
  private async tryProxy(url: string, label: string, headers: any[] = []): Promise<ArrayBuffer | null> {
    try {
      const result = await forwardProxy(url, 'GET', {}, headers, 15000, 'audio/mp3', 'base64')
      if (!result || result.status !== 200) {
        console.warn(`[HttpTTS] ${label} HTTP ${result?.status || '无响应'}`)
        return null
      }

      const audioData = this.decodeResponseBody(result.body, result.bodyEncoding)
      if (!audioData || audioData.byteLength < 200) {
        console.warn(`[HttpTTS] ${label} 数据太小: ${audioData?.byteLength || 0} 字节`)
        return null
      }

      const b0 = new Uint8Array(audioData)[0], b1 = new Uint8Array(audioData)[1]
      const valid = b0 === 0xFF || (b0 === 0x49 && b1 === 0x44) || (b0 === 0x52 && b1 === 0x49) || (b0 === 0x4F && b1 === 0x67)
      if (!valid) {
        console.warn(`[HttpTTS] ${label} 非音频格式: ${b0.toString(16)} ${b1.toString(16)}`)
        return null
      }

      console.log(`[HttpTTS] ${label} 成功: ${audioData.byteLength} 字节`)
      return audioData
    } catch (e) {
      console.warn(`[HttpTTS] ${label} 失败:`, e instanceof Error ? e.message : String(e))
      return null
    }
  }

  private decodeResponseBody(body: string, encoding?: string): ArrayBuffer | null {
    if (!body || typeof body !== 'string') return null
    if (encoding === 'base64' || encoding === 'base64-url') {
      try {
        const bin = atob(body)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        return bytes.buffer
      } catch {}
    }
    if (/^[A-Za-z0-9+/=]+$/.test(body.substring(0, 200))) {
      try {
        const bin = atob(body)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        if (bytes.length > 3 && (bytes[0] === 0xFF || (bytes[0] === 0x49 && bytes[1] === 0x44))) return bytes.buffer
      } catch {}
    }
    const raw = new TextEncoder().encode(body)
    if (raw.length > 100) return raw.buffer
    return null
  }

  /** <audio> + Blob URL 播放 */
  private playAudioData(audioData: ArrayBuffer): Promise<void> {
    if (this.blobUrl) { try { URL.revokeObjectURL(this.blobUrl) } catch {} }

    const blob = new Blob([audioData], { type: 'audio/mp3' })
    this.blobUrl = URL.createObjectURL(blob)

    this.audioEl.pause()
    this.audioEl.src = this.blobUrl
    this.audioEl.load()

    this.state = 'playing'
    this.notify()

    return new Promise<void>((resolve, reject) => {
      this.audioEl.onended = () => resolve()
      this.audioEl.onerror = () => reject(new Error('音频播放失败'))

      const tryPlay = (retries: number) => {
        const p = this.audioEl.play()
        if (p && p.catch) {
          p.catch(() => {
            if (retries > 0) {
              setTimeout(() => tryPlay(retries - 1), 300)
            } else {
              reject(new Error('播放被阻止'))
            }
          })
        }
      }
      tryPlay(3)
    })
  }

  private cleanupAudio(): void {
    this.audioEl.pause()
    this.audioEl.onended = null
    this.audioEl.onerror = null
    this.audioEl.removeAttribute('src')
    if (this.blobUrl) { try { URL.revokeObjectURL(this.blobUrl) } catch {}; this.blobUrl = null }
  }

  private applyHighlight(el: HTMLElement): void {
    this.clearHighlight()
    if (el.isConnected) {
      el.classList.add(HIGHLIGHT_CLASS)
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  private clearHighlight(): void {
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(el => el.classList.remove(HIGHLIGHT_CLASS))
  }

  private notify(): void {
    this.onStateChange?.(this.state, this.currentIndex, this.paragraphs.length)
  }
}

// ═══════════════════════════════════════════════════════════════
// 单例
// ═══════════════════════════════════════════════════════════════

let engineInstance: HttpTTSEngine | null = null

export function getHttpTTSEngine(): HttpTTSEngine {
  if (!engineInstance) engineInstance = new HttpTTSEngine()
  return engineInstance
}

export function destroyHttpTTSEngine(): void {
  if (engineInstance) { engineInstance.cleanup(); engineInstance = null }
}
