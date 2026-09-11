/**
 * HTTP TTS 引擎 — 百度免费 + 硅基流动 API
 *
 * 从 mobilePanel.ts 提取的平台无关引擎模块。
 * 桌面端（Electron）和手机端（WebView）共用。
 * 百度/有道通过思源 forwardProxy 代理；硅基流动桌面端可直接 fetch，手机端走 forwardProxy。
 */

import { logger } from '@/utils/logger'
import { getTTSEngine, ParagraphInfo, getCurrentDocId } from './ttsEngine'
import { forwardProxy, putFile, removeFile } from '../api'
import { pluginInstance } from '../toolbarManager'
import { t } from '../i18n/runtime'
import {
  type PreparedCacheDescriptor,
  type PreparedTtsCacheEntry,
  buildPreparedTtsCacheKey,
  getPreparedTtsCacheEntry,
  putPreparedTtsWav,
  readPreparedTtsWav,
  deletePreparedTtsCacheEntry,
} from './preparedTtsCache'

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

export interface PrepareProgress {
  /** 已完成的段落数 */
  current: number
  /** 本次需要准备的段落总数 */
  total: number
  /** 刚完成准备的段落索引 */
  paragraphIndex: number
}

export interface TTSSettings {
  speed: number        // 免费模式语速（百度 0-15，默认 5）
  apiSpeed: number     // 硅基流动语速（0.25-4.0，默认 1.0）
  speaker: string      // 硅基流动音色名，如 'alex'
  edgeVoiceName?: string   // Edge TTS 音色名
  edgeRate?: number        // Edge TTS 语速（0.5-2.0）
  lastMode?: string        // 上次使用的模式：'webspeech' | 'edge' | 'free' | 'api'
  autoReadAction?: 'stop' | 'next' | 'prev'  // 朗读完成后动作，默认 'stop'
  webSpeechVoiceName?: string  // 浏览器语音引擎上次选择的语音名
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
  { v: 'alex', t: t('tts.voice.sf.alex', undefined, 'Alex · 沉稳男声') },
  { v: 'benjamin', t: t('tts.voice.sf.benjamin', undefined, 'Benjamin · 低沉男声') },
  { v: 'charles', t: t('tts.voice.sf.charles', undefined, 'Charles · 磁性男声') },
  { v: 'david', t: t('tts.voice.sf.david', undefined, 'David · 欢快男声') },
  { v: 'anna', t: t('tts.voice.sf.anna', undefined, 'Anna · 沉稳女声') },
  { v: 'bella', t: t('tts.voice.sf.bella', undefined, 'Bella · 激情女声') },
  { v: 'claire', t: t('tts.voice.sf.claire', undefined, 'Claire · 温柔女声（默认）') },
  { v: 'diana', t: t('tts.voice.sf.diana', undefined, 'Diana · 欢快女声') },
]

export const PREPARED_TTS_SYNTHESIS_SCHEMA_VERSION = 2
export const PREPARED_TTS_PARAGRAPH_SCHEMA_VERSION = 1
export const PREPARED_TTS_WAV_SCHEMA_VERSION = 1
export const PREPARED_TTS_SAMPLE_RATE = 24000
export const SF_TTS_MODEL = 'FunAudioLLM/CosyVoice2-0.5B'

const SF_MODEL = SF_TTS_MODEL
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
        const serialized = JSON.stringify(data)
        if (localStorage.getItem(TTS_SETTINGS_KEY) !== serialized) {
          localStorage.setItem(TTS_SETTINGS_KEY, serialized)
        }
      }
    } catch { /* ignore */ }
    try {
      const data = await pluginInstance.loadData(SF_API_CONFIG_KEY)
      if (data && typeof data === 'object') {
        sfConfigCache = data as SFAPIConfig
        const serialized = JSON.stringify(data)
        if (localStorage.getItem(SF_API_CONFIG_KEY) !== serialized) {
          localStorage.setItem(SF_API_CONFIG_KEY, serialized)
        }
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

function hasSupportedAudioHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false
  const isMp3 = (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0)
    || (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33)
  const isWav = bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45
  const isOgg = bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53
  return isMp3 || isWav || isOgg
}

function decodeBase64(value: string, urlSafe: boolean): ArrayBuffer | null {
  try {
    const compact = value.replace(/\s/g, '')
    const normalized = (urlSafe ? compact.replace(/-/g, '+').replace(/_/g, '/') : compact)
      .padEnd(Math.ceil(compact.length / 4) * 4, '=')
    const bin = atob(normalized)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes.buffer
  } catch {
    return null
  }
}

/**
 * 先按标注的字母表解码，失败再按另一种字母表重试。
 * 部分内核会把 url-safe 数据标注成 base64（或反之），只按标注解码会直接失败。
 */
function decodeBase64Either(value: string, preferUrlSafe: boolean): ArrayBuffer | null {
  return preferUrlSafe
    ? decodeBase64(value, true) ?? decodeBase64(value, false)
    : decodeBase64(value, false) ?? decodeBase64(value, true)
}

export function decodeProxyBody(body: string, encoding?: string): ArrayBuffer | null {
  if (!body || typeof body !== 'string') return null
  const normalizedEncoding = encoding?.trim().toLowerCase()
  if (normalizedEncoding === 'base64' || normalizedEncoding === 'base64-std' || normalizedEncoding === 'base64-url') {
    return decodeBase64Either(body, normalizedEncoding === 'base64-url')
  }

  // Some SiYuan kernel versions honor responseEncoding but omit bodyEncoding.
  // Only accept an unlabelled body after both strict base64 parsing and audio magic-byte validation.
  const compact = body.replace(/\s/g, '')
  if (compact.length >= 4 && /^[A-Za-z0-9+/_-]*={0,2}$/.test(compact)) {
    const decoded = decodeBase64Either(compact, compact.includes('-') || compact.includes('_'))
    if (decoded && hasSupportedAudioHeader(new Uint8Array(decoded))) return decoded
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

const SF_REQUEST_TIMEOUT = 30000
const SF_MAX_ATTEMPTS = 3
// MP3 keeps the proxied base64 payload small (roughly 6 KB/s of audio). Requesting an
// uncompressed format here would inflate the same paragraph ~8-10x and make mobile
// preparation more likely to time out or exhaust memory.
const SF_RESPONSE_FORMAT = 'mp3'
const SF_ACCEPT_HEADER = 'audio/mpeg'
// Keep individual requests small: large API inputs create large base64 proxy responses and
// are less reliably decoded by mobile WebViews. Splitting also prevents long paragraphs from
// becoming a single slow request during prepareAudio.
const SF_MAX_CHUNK_LENGTH = 500

class SiliconFlowRequestError extends Error {
  constructor(
    message: string,
    readonly kind: 'http' | 'transport' | 'timeout' | 'proxy' | 'response',
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message)
    this.name = 'SiliconFlowRequestError'
  }
}

function getSiliconFlowErrorDetail(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return '无错误详情'
  try {
    const value = JSON.parse(trimmed) as { message?: unknown; error?: unknown }
    if (typeof value.message === 'string') return value.message
    if (typeof value.error === 'string') return value.error
    if (value.error && typeof value.error === 'object') {
      const error = value.error as { message?: unknown }
      if (typeof error.message === 'string') return error.message
    }
  } catch {}
  return trimmed.substring(0, 200)
}

/**
 * 解码代理返回的文本（错误详情等）。与 decodeProxyBody 不同，这里不能要求音频魔数：
 * API 的 4xx 响应是 base64 编码的 JSON，必须按文本解码，否则错误信息会显示成乱码。
 */
function decodeProxyText(body: string, encoding?: string): string {
  const normalizedEncoding = encoding?.trim().toLowerCase()
  const decodeAsText = (value: string, urlSafe: boolean): string | null => {
    const decoded = decodeBase64Either(value, urlSafe)
    if (!decoded) return null
    try {
      return new TextDecoder().decode(decoded)
    } catch {
      return null
    }
  }

  if (normalizedEncoding === 'base64' || normalizedEncoding === 'base64-std' || normalizedEncoding === 'base64-url') {
    const text = decodeAsText(body, normalizedEncoding === 'base64-url')
    if (text !== null) return text
  } else {
    const compact = body.replace(/\s/g, '')
    if (compact.length >= 4 && /^[A-Za-z0-9+/_-]*={0,2}$/.test(compact)) {
      const text = decodeAsText(compact, compact.includes('-') || compact.includes('_'))
      // 仅当解码结果是可打印文本时才采用，避免把二进制音频当作文本返回
      if (text !== null && /^[\t\n\r\x20-\x7E\u4e00-\u9fa5]/.test(text)) return text
    }
  }
  return body.substring(0, 200)
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.min(5000, Math.max(0, seconds * 1000))
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? Math.min(5000, Math.max(0, timestamp - Date.now())) : undefined
}

function validateSiliconFlowAudio(audio: ArrayBuffer): ArrayBuffer {
  if (audio.byteLength < 100) throw new SiliconFlowRequestError('硅基流动 API 返回数据异常', 'response')
  if (!hasSupportedAudioHeader(new Uint8Array(audio))) {
    throw new SiliconFlowRequestError(`硅基流动 API 返回非音频数据：${getSiliconFlowErrorDetail(new TextDecoder().decode(audio))}`, 'response')
  }
  return audio
}

async function fetchSiliconFlowViaProxy(text: string, speed: number, apiKey: string, voiceName: string): Promise<ArrayBuffer> {
  const payload = {
    model: SF_MODEL,
    input: text,
    voice: `${SF_MODEL}:${voiceName}`,
    response_format: SF_RESPONSE_FORMAT,
    stream: false,
    speed: Math.max(0.25, Math.min(4.0, speed)),
  }

  logger.log(`[SiliconFlowTTS] forwardProxy请求: voice=${payload.voice}, speed=${payload.speed.toFixed(2)}`)

  const result = await forwardProxy(SF_API_URL, 'POST', payload, [
    {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': SF_ACCEPT_HEADER,
    },
  ], SF_REQUEST_TIMEOUT, 'application/json', 'base64')

  if (!result) throw new SiliconFlowRequestError('硅基流动代理请求无响应', 'proxy')
  if (result.status < 200 || result.status >= 300) {
    const detail = result.body
      ? getSiliconFlowErrorDetail(decodeProxyText(String(result.body), result.bodyEncoding))
      : '无错误详情'
    throw new SiliconFlowRequestError(`硅基流动 API HTTP ${result.status}: ${detail}`, 'http', result.status)
  }
  if (!result.body) throw new SiliconFlowRequestError('硅基流动 API 返回空数据', 'response')

  const audioData = decodeProxyBody(result.body, result.bodyEncoding)
  if (!audioData) {
    // 手机端只能走代理，失败时无法直接看到返回值；只记录长度与编码，不记录音频内容
    logger.warn(`[SiliconFlowTTS] 代理响应无法解码: status=${result.status}, bodyEncoding=${result.bodyEncoding ?? '未标注'}, bodyLength=${String(result.body).length}`)
    throw new SiliconFlowRequestError('硅基流动 API 音频解码失败', 'response')
  }
  validateSiliconFlowAudio(audioData)

  logger.log(`[SiliconFlowTTS] 代理返回音频: ${audioData.byteLength} 字节, bodyEncoding=${result.bodyEncoding ?? '未标注'}`)
  return audioData
}

async function fetchSiliconFlowDirect(text: string, speed: number, apiKey: string, voiceName: string): Promise<ArrayBuffer> {
  const payload = {
    model: SF_MODEL,
    input: text,
    voice: `${SF_MODEL}:${voiceName}`,
    response_format: SF_RESPONSE_FORMAT,
    stream: false,
    speed: Math.max(0.25, Math.min(4.0, speed)),
  }

  logger.log(`[SiliconFlowTTS] 直接fetch请求: voice=${payload.voice}, speed=${payload.speed.toFixed(2)}`)
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), SF_REQUEST_TIMEOUT)

  try {
    const resp = await fetch(SF_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': SF_ACCEPT_HEADER,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!resp.ok) {
      const errText = await resp.text()
      throw new SiliconFlowRequestError(
        `硅基流动 API HTTP ${resp.status}: ${getSiliconFlowErrorDetail(errText)}`,
        'http',
        resp.status,
        parseRetryAfter(resp.headers.get('Retry-After')),
      )
    }

    const audio = validateSiliconFlowAudio(await resp.arrayBuffer())
    logger.log(`[SiliconFlowTTS] 成功: ${audio.byteLength} 字节`)
    return audio
  } catch (error) {
    if (error instanceof SiliconFlowRequestError) throw error
    if (controller.signal.aborted) throw new SiliconFlowRequestError('硅基流动 API 请求超时', 'timeout')
    throw new SiliconFlowRequestError(`硅基流动 API 网络请求失败：${error instanceof Error ? error.message : String(error)}`, 'transport')
  } finally {
    window.clearTimeout(timeout)
  }
}

async function fetchSiliconFlowWithPolicy(
  text: string,
  speed: number,
  apiKey: string,
  voiceName: string,
  preferDirect: boolean,
  assertCurrent?: () => void,
): Promise<ArrayBuffer> {
  let lastError: unknown
  for (let attempt = 0; attempt < SF_MAX_ATTEMPTS; attempt++) {
    assertCurrent?.()
    try {
      if (!preferDirect) return await fetchSiliconFlowViaProxy(text, speed, apiKey, voiceName)
      try {
        return await fetchSiliconFlowDirect(text, speed, apiKey, voiceName)
      } catch (error) {
        if (!(error instanceof SiliconFlowRequestError) || (error.kind !== 'transport' && error.kind !== 'timeout')) throw error
        logger.warn('[SiliconFlowTTS] 直接请求失败，改用思源代理:', error.message)
        assertCurrent?.()
        return await fetchSiliconFlowViaProxy(text, speed, apiKey, voiceName)
      }
    } catch (error) {
      lastError = error
      const retryable = error instanceof SiliconFlowRequestError
        && error.kind === 'http'
        && (error.status === 429 || error.status === 503 || error.status === 504)
      if (!retryable || attempt === SF_MAX_ATTEMPTS - 1) throw error
      const delay = error.retryAfterMs ?? (500 * (2 ** attempt) + Math.floor(Math.random() * 250))
      logger.warn(`[SiliconFlowTTS] HTTP ${error.status}，${delay}ms 后重试 (${attempt + 2}/${SF_MAX_ATTEMPTS})`)
      await new Promise(resolve => window.setTimeout(resolve, delay))
      assertCurrent?.()
    }
  }
  throw lastError
}

// ═══════════════════════════════════════════════════════════════
// HttpTTSEngine — 核心 TTS 引擎
// ═══════════════════════════════════════════════════════════════

interface PreparedTiming {
  paragraphIndex: number
  startTime: number
  endTime: number
}

interface PreparedAudio {
  /** Runtime playback staging source; never the persistent cache itself. */
  url: string
  blobUrl: boolean
  tempPath: string | null
  cacheKey: string
  timings: PreparedTiming[]
  startParagraph: number
  endParagraph: number
  expectedDuration: number
  completionSpeechIncluded: boolean
}

interface PreparedParagraph {
  paragraphIndex: number
  pcmParts: Int16Array[]
  sampleCount: number
}

const PREPARED_SAMPLE_RATE = PREPARED_TTS_SAMPLE_RATE
const PREPARED_TEMP_DIR = '/temp/export/temp/siyuan-toolbar-customizer'
const PREPARED_PUBLIC_DIR = '/export/temp/siyuan-toolbar-customizer'

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
  private successCount = 0

  private audioEl: HTMLAudioElement = this.createAudioElement()
  private blobUrl: string | null = null
  private preparedAudio: PreparedAudio | null = null
  private playingPrepared = false
  private preparedHighlightCleared = false
  private preparedPlayResolver: ((started: boolean) => void) | null = null
  private operationGeneration = 0
  private mediaDiagnosticsInstalled = false

  onStateChange?: (state: HttpTTSState, index: number, total: number) => void
  onError?: (msg: string) => void
  onFinish?: (prepared: boolean) => void

  // ─── 设置 ──────────────────────────────────────────

  setSpeed(speed: number): void { this.speed = Math.max(0, Math.min(15, speed)) }
  setSpeaker(speaker: number | string): void { this.speaker = speaker }
  setMode(mode: 'free' | 'api', token?: string): void {
    this.mode = mode
    if (token) this.apiToken = token
  }
  /** 桌面端优先直接 fetch；遇到网络或超时会自动回退到思源代理。 */
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
    const generation = ++this.operationGeneration
    this.stopPlayback()
    this.clearHighlight()
    this.state = 'idle'
    this.currentIndex = -1
    this.notify()
    this.stopped = false
    this.successCount = 0
    this.endParagraphIndex = endParagraph ?? this.paragraphs.length - 1
    if (this.paragraphs.length === 0) return false

    ensureHighlightStyle()
    this.currentIndex = Math.max(0, Math.min(startParagraph, this.paragraphs.length - 1))
    this.playCurrentParagraph(generation)
    return true
  }

  /** 将指定范围和可选尾声全部解码、重采样并合成为一个可连续播放的 WAV。 */
  async prepareAudio(
    startParagraph = 0,
    endParagraph?: number,
    onProgress?: (progress: PrepareProgress) => void,
    trailingText?: string,
    descriptor?: PreparedCacheDescriptor,
  ): Promise<PreparedTtsCacheEntry | void> {
    const generation = ++this.operationGeneration
    this.stopPlayback()
    this.clearPreparedAudioInternal()
    this.stopped = false

    if (this.paragraphs.length === 0) throw new Error('没有可准备的段落')
    const start = Math.max(0, Math.min(startParagraph, this.paragraphs.length - 1))
    const end = Math.max(start, Math.min(endParagraph ?? this.paragraphs.length - 1, this.paragraphs.length - 1))
    const paragraphTotal = end - start + 1
    const hasTrailingText = Boolean(trailingText?.trim())
    const progressTotal = paragraphTotal + (hasTrailingText ? 1 : 0)
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) throw new Error('当前环境不支持音频解码')

    const context = new AudioContextClass()
    const results = new Array<PreparedParagraph>(paragraphTotal)
    let trailingResult: PreparedParagraph | null = null
    const concurrency = this.mode === 'api' && this.apiToken ? 3 : 2
    let nextTask = 0
    let completed = 0
    let workerError: unknown
    let decodeQueue: Promise<unknown> = Promise.resolve()

    const decodePart = (encoded: ArrayBuffer): Promise<Int16Array> => {
      const task = decodeQueue.then(async () => {
        this.assertOperation(generation)
        const decoded = await context.decodeAudioData(encoded.slice(0))
        this.assertOperation(generation)
        return this.audioBufferToPcm(decoded, PREPARED_SAMPLE_RATE)
      })
      decodeQueue = task.then(() => undefined, () => undefined)
      return task
    }

    const prepareParagraph = async (offset: number): Promise<void> => {
      const paragraphIndex = start + offset
      this.assertOperation(generation)
      const encodedParts = await this.fetchTTSParts(this.paragraphs[paragraphIndex].text, generation)
      const pcmParts: Int16Array[] = []
      let sampleCount = 0

      for (const encoded of encodedParts) {
        const pcm = await decodePart(encoded)
        if (pcm.length === 0) throw new Error(`第 ${paragraphIndex + 1} 段音频解码结果为空`)
        pcmParts.push(pcm)
        sampleCount += pcm.length
      }

      if (sampleCount === 0) throw new Error(`第 ${paragraphIndex + 1} 段没有有效音频`)
      results[offset] = { paragraphIndex, pcmParts, sampleCount }
      completed++
      onProgress?.({ current: completed, total: progressTotal, paragraphIndex })
    }

    const worker = async (): Promise<void> => {
      while (true) {
        this.assertOperation(generation)
        if (workerError) throw workerError
        const task = nextTask++
        if (task >= paragraphTotal) return
        try {
          await prepareParagraph(task)
        } catch (error) {
          workerError = error
          throw error
        }
      }
    }

    try {
      const workers = Array.from({ length: Math.min(concurrency, paragraphTotal) }, () => worker())
      const workerResults = await Promise.allSettled(workers)
      const failedWorker = workerResults.find((result): result is PromiseRejectedResult => result.status === 'rejected')
      if (failedWorker) throw failedWorker.reason
      this.assertOperation(generation)

      if (hasTrailingText && trailingText) {
        const encodedParts = await this.fetchTTSParts(trailingText.trim(), generation)
        const pcmParts: Int16Array[] = []
        let sampleCount = 0
        for (const encoded of encodedParts) {
          const pcm = await decodePart(encoded)
          if (pcm.length === 0) throw new Error('朗读完成提示音频解码结果为空')
          pcmParts.push(pcm)
          sampleCount += pcm.length
        }
        if (sampleCount === 0) throw new Error('朗读完成提示没有有效音频')
        trailingResult = { paragraphIndex: end + 1, pcmParts, sampleCount }
        completed++
        onProgress?.({ current: completed, total: progressTotal, paragraphIndex: end + 1 })
      }

      const pcmParts: BlobPart[] = []
      const timings: PreparedTiming[] = []
      let totalSamples = 0
      for (const result of results) {
        timings.push({
          paragraphIndex: result.paragraphIndex,
          startTime: totalSamples / PREPARED_SAMPLE_RATE,
          endTime: (totalSamples + result.sampleCount) / PREPARED_SAMPLE_RATE,
        })
        for (const pcm of result.pcmParts) pcmParts.push(pcm.buffer as ArrayBuffer)
        totalSamples += result.sampleCount
      }
      if (trailingResult) {
        for (const pcm of trailingResult.pcmParts) pcmParts.push(pcm.buffer as ArrayBuffer)
        totalSamples += trailingResult.sampleCount
      }

      const wav = new Blob([this.createWavHeader(totalSamples), ...pcmParts], { type: 'audio/wav' })
      this.validatePreparedWav(wav, totalSamples)
      // The cache owns its copy. The source below is only a short-lived playback staging file/URL.
      // A failed persistent write must not fail preparation: the prepared audio is still playable
      // in this session, it just will not be reused after the panel is reopened.
      let cacheEntry: PreparedTtsCacheEntry | null = null
      if (descriptor) {
        try {
          cacheEntry = await putPreparedTtsWav(descriptor, wav, {
            timings,
            duration: totalSamples / PREPARED_SAMPLE_RATE,
            startParagraph: start,
            endParagraph: end,
            completionSpeechIncluded: hasTrailingText,
          })
        } catch (error) {
          this.assertOperation(generation)
          logger.warn('[HttpTTS] 持久缓存写入失败，本次仅在内存中准备:', error instanceof Error ? error.message : String(error))
        }
      }
      this.assertOperation(generation)
      const source = await this.createPreparedSource(wav, generation)
      if (generation !== this.operationGeneration) {
        this.releasePreparedSource(source.url, source.blobUrl, source.tempPath)
        throw new Error('operation cancelled')
      }

      this.preparedAudio = {
        ...source,
        // 持久化失败时仍记录本次会话的 key，使同一个 key 在内存中可用
        cacheKey: cacheEntry?.key || (descriptor ? buildPreparedTtsCacheKey(descriptor) : ''),
        timings,
        startParagraph: start,
        endParagraph: end,
        expectedDuration: totalSamples / PREPARED_SAMPLE_RATE,
        completionSpeechIncluded: hasTrailingText,
      }
      const prepared = this.preparedAudio
      try {
        await this.loadPreparedMetadata(prepared, generation)
      } catch (error) {
        this.assertOperation(generation)
        if (this.preparedAudio !== prepared || !prepared.tempPath) throw error
        this.releasePreparedSource(prepared.url, prepared.blobUrl, prepared.tempPath)
        const fallback: PreparedAudio = {
          ...prepared,
          url: URL.createObjectURL(wav),
          blobUrl: true,
          tempPath: null,
        }
        this.preparedAudio = fallback
        logger.warn('[HttpTTS] 临时 WAV 无法加载，回退到 Blob URL:', error instanceof Error ? error.message : String(error))
        await this.loadPreparedMetadata(fallback, generation)
      }
      this.currentIndex = start
      this.endParagraphIndex = end
      return cacheEntry ?? undefined
    } catch (error) {
      if (generation === this.operationGeneration) this.clearPreparedAudioInternal()
      throw error
    } finally {
      await context.close().catch(() => {})
    }
  }

  /** 播放 prepared 音频；传入 key 时从持久缓存创建新的运行时 staging 源。 */
  async speakPrepared(cacheKey?: string): Promise<boolean> {
    const generation = ++this.operationGeneration
    let prepared = this.preparedAudio
    if (cacheKey && prepared?.cacheKey !== cacheKey) {
      const entry = await getPreparedTtsCacheEntry(cacheKey, false)
      if (generation !== this.operationGeneration) return false
      const wav = entry ? await readPreparedTtsWav(entry) : null
      if (generation !== this.operationGeneration) return false
      if (!entry || !wav) {
        this.onError?.('准备好的音频缓存不存在或已失效')
        return false
      }
      this.stopPlayback()
      this.clearPreparedAudioInternal()
      try {
        const source = await this.createPreparedSource(wav, generation)
        if (generation !== this.operationGeneration) {
          this.releasePreparedSource(source.url, source.blobUrl, source.tempPath)
          return false
        }
        try {
          this.validatePreparedWav(wav, Math.round(entry.duration * PREPARED_SAMPLE_RATE))
        } catch (error) {
          this.releasePreparedSource(source.url, source.blobUrl, source.tempPath)
          throw error
        }
        prepared = this.preparedAudio = {
          ...source,
          cacheKey: entry.key,
          timings: entry.timings,
          startParagraph: entry.startParagraph,
          endParagraph: entry.endParagraph,
          expectedDuration: entry.duration,
          completionSpeechIncluded: entry.completionSpeechIncluded,
        }
      } catch (error) {
        if (generation !== this.operationGeneration) return false
        this.onError?.(error instanceof Error ? error.message : String(error))
        return false
      }
    }
    if (generation !== this.operationGeneration || !prepared) return false

    try {
      await this.loadPreparedMetadata(prepared, generation)
    } catch (error) {
      if (this.operationGeneration === generation) {
        this.playingPrepared = false
        this.clearPreparedAudioInternal()
        this.state = 'idle'
        this.notify()
        this.onError?.(error instanceof Error ? error.message : String(error))
      }
      return false
    }

    const playbackGeneration = ++this.operationGeneration
    this.stopPlayback()
    this.stopped = false
    this.playingPrepared = true
    this.preparedHighlightCleared = false
    this.endParagraphIndex = prepared.endParagraph
    this.currentIndex = prepared.startParagraph
    ensureHighlightStyle()
    this.applyHighlight(this.paragraphs[this.currentIndex]?.element)
    this.state = 'loading'
    this.notify()

    this.ensureAudioElementAttached()
    this.audioEl.src = prepared.url
    this.audioEl.load()
    this.audioEl.ontimeupdate = () => this.updatePreparedPosition(playbackGeneration)
    this.audioEl.onended = () => {
      if (playbackGeneration !== this.operationGeneration || !this.playingPrepared) return
      this.playingPrepared = false
      this.cleanupAudio()
      this.clearPreparedAudioInternal()
      this.clearHighlight()
      this.state = 'idle'
      this.currentIndex = -1
      this.notify()
      this.onFinish?.(prepared.completionSpeechIncluded)
    }
    this.audioEl.onerror = () => {
      if (playbackGeneration !== this.operationGeneration) return
      this.preparedPlayResolver?.(false)
      this.preparedPlayResolver = null
      this.playingPrepared = false
      this.state = 'idle'
      this.notify()
      this.onError?.('音频播放失败')
      this.cleanupAudio()
      this.clearPreparedAudioInternal()
    }

    return new Promise<boolean>(resolve => {
      let settled = false
      this.audioEl.onplay = () => {
        if (settled || playbackGeneration !== this.operationGeneration) return
        settled = true
        this.preparedPlayResolver = null
        this.state = 'playing'
        this.notify()
        resolve(true)
      }
      this.preparedPlayResolver = (started) => {
        if (settled) return
        settled = true
        this.preparedPlayResolver = null
        resolve(started)
      }
      const playPromise = this.audioEl.play()
      if (playPromise) {
        playPromise.catch(() => {
          if (settled) return
          settled = true
          this.preparedPlayResolver = null
          if (playbackGeneration === this.operationGeneration) {
            this.playingPrepared = false
            this.state = 'idle'
            this.notify()
          }
          resolve(false)
        })
      }
    })
  }

  clearPreparedAudio(): void {
    ++this.operationGeneration
    this.stopPlayback()
    this.clearPreparedAudioInternal()
    this.clearHighlight()
    this.state = 'idle'
    this.currentIndex = -1
    this.notify()
  }

  /** Explicitly remove a persistent cache entry; staging is always cleared separately. */
  async clearPreparedCache(key: string): Promise<boolean> {
    // 内存中的会话内准备结果同样属于该 key，一并清除，避免刷新后仍被视为已准备
    if (this.preparedAudio?.cacheKey === key) this.clearPreparedAudioInternal()
    return deletePreparedTtsCacheEntry(key)
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
    ++this.operationGeneration
    this.stopped = true
    this.stopPlayback()
    this.clearPreparedAudioInternal()
    this.clearHighlight()
    this.state = 'idle'
    this.currentIndex = -1
    this.notify()
  }

  jumpToParagraph(index: number): void {
    if (this.playingPrepared && this.preparedAudio) {
      const timing = this.preparedAudio.timings.find(item => item.paragraphIndex === index)
      if (!timing) return
      this.audioEl.currentTime = timing.startTime
      this.updatePreparedPosition(this.operationGeneration, true)
      return
    }
    if (index < 0 || index >= this.paragraphs.length) return
    const generation = ++this.operationGeneration
    this.stopped = false
    this.cleanupAudio()
    this.clearHighlight()
    this.currentIndex = index
    this.playCurrentParagraph(generation)
  }

  nextParagraph(): void {
    const max = this.playingPrepared && this.preparedAudio
      ? this.preparedAudio.endParagraph
      : this.paragraphs.length - 1
    if (this.currentIndex < max) this.jumpToParagraph(this.currentIndex + 1)
  }

  prevParagraph(): void {
    const min = this.playingPrepared && this.preparedAudio
      ? this.preparedAudio.startParagraph
      : 0
    if (this.currentIndex > min) this.jumpToParagraph(this.currentIndex - 1)
  }

  // ─── 状态查询 ──────────────────────────────────────

  get isPlaying(): boolean { return this.state === 'playing' }
  get isPaused(): boolean { return this.state === 'paused' }
  get isIdle(): boolean { return this.state === 'idle' }
  get isLoading(): boolean { return this.state === 'loading' }
  get hasPreparedAudio(): boolean { return this.preparedAudio !== null }
  /** Key of the current runtime staging, if it originated from persistent cache. */
  get preparedCacheKey(): string | null { return this.preparedAudio?.cacheKey || null }
  /** Check whether a persistent prepared entry exists (without changing staging). */
  async hasPreparedAudioFor(cacheKey: string): Promise<boolean> {
    if (this.preparedAudio?.cacheKey === cacheKey) return true
    return (await getPreparedTtsCacheEntry(cacheKey, false)) !== null
  }
  get currentParagraphIndex(): number { return this.currentIndex }
  get totalParagraphs(): number { return this.paragraphs.length }

  cleanup(): void {
    ++this.operationGeneration
    this.stopped = true
    this.stopPlayback()
    this.clearPreparedAudioInternal()
    this.clearHighlight()
    this.state = 'idle'
    this.currentIndex = -1
    this.notify()
    this.paragraphs = []
    this.audioEl.remove()
  }

  /** 朗读一段文字，完成后回调（不改变段落索引和高亮） */
  async speakOnce(text: string, onDone?: () => void): Promise<void> {
    const generation = this.operationGeneration
    try {
      const audioData = await this.fetchTTSAudio(text, generation)
      if (this.stopped || generation !== this.operationGeneration) { onDone?.(); return }
      await this.playAudioData(audioData)
    } catch (error) {
      if (!this.stopped && generation === this.operationGeneration) {
        const message = error instanceof Error ? error.message : String(error)
        logger.warn('[HttpTTS] 附加语音失败:', message)
      }
    }
    onDone?.()
  }

  // ─── 内部 ────────────────────────────────────────

  private playCurrentParagraph(generation = this.operationGeneration): void {
    if (this.stopped || generation !== this.operationGeneration) return

    if (this.currentIndex > this.endParagraphIndex || this.currentIndex >= this.paragraphs.length) {
      this.clearHighlight()
      this.state = 'idle'
      this.currentIndex = -1
      this.notify()
      if (this.successCount === 0) {
        this.onError?.(t('tts.allParagraphsFailed', undefined, '所有段落朗读均失败，请检查网络连接或朗读设置'))
      } else {
        this.onFinish?.(false)
      }
      return
    }

    const para = this.paragraphs[this.currentIndex]
    this.state = 'loading'
    this.applyHighlight(para.element)
    this.notify()

    this.fetchTTSAudio(para.text, generation)
      .then(audioData => {
        if (this.stopped || generation !== this.operationGeneration) return
        return this.playAudioData(audioData)
      })
      .then(() => {
        if (this.stopped || generation !== this.operationGeneration) return
        this.successCount++
        this.currentIndex++
        this.playCurrentParagraph(generation)
      })
      .catch(err => {
        if (this.stopped || generation !== this.operationGeneration) return
        const msg = err instanceof Error ? err.message : String(err)
        const permanentApiError = err instanceof SiliconFlowRequestError
          && err.kind === 'http'
          && err.status !== undefined
          && err.status >= 400
          && err.status < 500
          && err.status !== 429
        if (permanentApiError) {
          this.state = 'idle'
          this.clearHighlight()
          this.currentIndex = -1
          this.notify()
          this.onError?.(msg)
          return
        }
        logger.warn('[HttpTTS] 段落朗读失败，跳过:', msg)
        // 跳过失败段落，继续下一段
        this.currentIndex++
        this.playCurrentParagraph(generation)
      })
  }

  private async fetchTTSParts(text: string, generation: number): Promise<ArrayBuffer[]> {
    if (this.mode === 'api' && this.apiToken) {
      const chunks = splitText(text, SF_MAX_CHUNK_LENGTH)
      const audioParts: ArrayBuffer[] = []
      for (let i = 0; i < chunks.length; i++) {
        this.assertOperation(generation)
        logger.log(`[HttpTTS] 硅基流动 ${i + 1}/${chunks.length}: "${chunks[i].substring(0, 30)}..."`)
        const audio = await fetchSiliconFlowWithPolicy(
          chunks[i],
          this.speed,
          this.apiToken,
          String(this.speaker),
          this.directFetch,
          () => this.assertOperation(generation),
        )
        this.assertOperation(generation)
        audioParts.push(audio)
      }
      return audioParts
    }

    const chunks = splitText(text, 500)
    const audioParts: ArrayBuffer[] = []
    for (let i = 0; i < chunks.length; i++) {
      this.assertOperation(generation)
      logger.log(`[HttpTTS] 免费模式 ${i + 1}/${chunks.length}: "${chunks[i].substring(0, 30)}..."`)
      const audio = await this.tryFetchChunk(chunks[i])
      this.assertOperation(generation)
      audioParts.push(audio)
    }
    return audioParts
  }

  private assertOperation(generation: number): void {
    if (generation !== this.operationGeneration) throw new Error('operation cancelled')
  }

  private createAudioElement(): HTMLAudioElement {
    const audio = document.createElement('audio')
    audio.preload = 'auto'
    audio.setAttribute('playsinline', '')
    audio.style.cssText = 'position:fixed;width:1px;height:1px;left:-10000px;bottom:0;opacity:0;pointer-events:none;'
    return audio
  }

  private ensureAudioElementAttached(): void {
    if (!this.audioEl.isConnected && document.body) document.body.appendChild(this.audioEl)
    if (this.mediaDiagnosticsInstalled) return
    this.mediaDiagnosticsInstalled = true
    for (const eventName of ['loadedmetadata', 'playing', 'pause', 'waiting', 'stalled', 'ended', 'error']) {
      this.audioEl.addEventListener(eventName, () => this.logMediaEvent(eventName))
    }
  }

  private logMediaEvent(eventName: string): void {
    const mediaError = this.audioEl.error
    logger.log('[HttpTTS] 媒体事件', {
      event: eventName,
      currentTime: this.audioEl.currentTime,
      duration: this.audioEl.duration,
      readyState: this.audioEl.readyState,
      networkState: this.audioEl.networkState,
      source: this.audioEl.currentSrc || this.audioEl.src,
      visibility: document.visibilityState,
      error: mediaError ? `${mediaError.code}: ${mediaError.message}` : undefined,
    })
  }

  private validatePreparedWav(wav: Blob, totalSamples: number): void {
    const dataBytes = totalSamples * 2
    if (wav.size !== dataBytes + 44) {
      throw new Error(`WAV 大小校验失败：预期 ${dataBytes + 44}，实际 ${wav.size}`)
    }
    const header = this.createWavHeader(totalSamples)
    const view = new DataView(header)
    if (view.getUint32(4, true) + 8 !== wav.size || view.getUint32(40, true) + 44 !== wav.size) {
      throw new Error('WAV 头部长度校验失败')
    }
  }

  private async createPreparedSource(wav: Blob, generation: number): Promise<Pick<PreparedAudio, 'url' | 'blobUrl' | 'tempPath'>> {
    const fileName = `prepared-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.wav`
    const tempPath = `${PREPARED_TEMP_DIR}/${fileName}`
    let fileWritten = false
    try {
      const written = await putFile(tempPath, false, wav)
      if (!written) throw new Error('思源文件接口未写入临时文件')
      fileWritten = true
      this.assertOperation(generation)
      logger.log(`[HttpTTS] 已写入临时 WAV：${tempPath} (${wav.size} 字节)`)
      return { url: `${PREPARED_PUBLIC_DIR}/${fileName}`, blobUrl: false, tempPath }
    } catch (error) {
      if (generation !== this.operationGeneration) {
        if (fileWritten) this.removePreparedTempFile(tempPath)
        throw error
      }
      logger.warn('[HttpTTS] 写入临时 WAV 失败，回退到 Blob URL:', error instanceof Error ? error.message : String(error))
      return { url: URL.createObjectURL(wav), blobUrl: true, tempPath: null }
    }
  }

  private loadPreparedMetadata(prepared: PreparedAudio, generation: number): Promise<void> {
    this.ensureAudioElementAttached()
    this.cleanupAudio()
    this.audioEl.preload = 'auto'
    this.audioEl.src = prepared.url

    return new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        this.audioEl.removeEventListener('loadedmetadata', onMetadata)
        this.audioEl.removeEventListener('error', onError)
        if (error) reject(error)
        else resolve()
      }
      const onMetadata = () => {
        if (generation !== this.operationGeneration) {
          finish(new Error('operation cancelled'))
          return
        }
        const actual = this.audioEl.duration
        const tolerance = Math.max(2, prepared.expectedDuration * 0.03)
        if (!Number.isFinite(actual) || actual <= 0 || Math.abs(actual - prepared.expectedDuration) > tolerance) {
          finish(new Error(`音频时长校验失败：预期 ${prepared.expectedDuration.toFixed(2)} 秒，实际 ${Number.isFinite(actual) ? actual.toFixed(2) : '未知'} 秒`))
          return
        }
        logger.log(`[HttpTTS] 连续 WAV 已加载：${actual.toFixed(2)} 秒，${prepared.timings.length} 段`)
        finish()
      }
      const onError = () => finish(new Error('准备好的音频文件无法加载'))
      const timeout = window.setTimeout(() => finish(new Error('准备好的音频文件加载超时')), 15000)
      this.audioEl.addEventListener('loadedmetadata', onMetadata)
      this.audioEl.addEventListener('error', onError)
      this.audioEl.load()
    })
  }

  private releasePreparedSource(url: string, blobUrl: boolean, tempPath: string | null): void {
    if (blobUrl) {
      try { URL.revokeObjectURL(url) } catch {}
    }
    if (tempPath) this.removePreparedTempFile(tempPath)
  }

  private removePreparedTempFile(path: string): void {
    void removeFile(path).then(removed => {
      if (!removed) logger.warn(`[HttpTTS] 删除临时 WAV 未成功：${path}`)
    }).catch(error => {
      logger.warn(`[HttpTTS] 删除临时 WAV 失败：${path}`, error instanceof Error ? error.message : String(error))
    })
  }

  private audioBufferToPcm(buffer: AudioBuffer, sampleRate: number): Int16Array {
    const outputLength = buffer.sampleRate === sampleRate
      ? buffer.length
      : Math.max(1, Math.round(buffer.duration * sampleRate))
    const output = new Int16Array(outputLength)
    const channels = buffer.numberOfChannels
    const channelData = Array.from({ length: channels }, (_, index) => buffer.getChannelData(index))

    if (buffer.sampleRate === sampleRate) {
      if (channels === 1) {
        const input = channelData[0]
        for (let i = 0; i < outputLength; i++) {
          const sample = Math.max(-1, Math.min(1, input[i]))
          output[i] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7FFF)
        }
        return output
      }

      for (let i = 0; i < outputLength; i++) {
        let sample = 0
        for (const channel of channelData) sample += channel[i]
        sample = Math.max(-1, Math.min(1, sample / channels))
        output[i] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7FFF)
      }
      return output
    }

    const ratio = buffer.sampleRate / sampleRate

    for (let i = 0; i < outputLength; i++) {
      const sourcePosition = Math.min(i * ratio, buffer.length - 1)
      const left = Math.floor(sourcePosition)
      const right = Math.min(left + 1, buffer.length - 1)
      const fraction = sourcePosition - left
      let sample = 0
      for (const channel of channelData) {
        sample += channel[left] + (channel[right] - channel[left]) * fraction
      }
      sample = Math.max(-1, Math.min(1, sample / channels))
      output[i] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7FFF)
    }
    return output
  }

  private createWavHeader(totalSamples: number): ArrayBuffer {
    const header = new ArrayBuffer(44)
    const view = new DataView(header)
    const writeAscii = (offset: number, value: string) => {
      for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
    }
    const dataBytes = totalSamples * 2
    writeAscii(0, 'RIFF')
    view.setUint32(4, 36 + dataBytes, true)
    writeAscii(8, 'WAVE')
    writeAscii(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, PREPARED_SAMPLE_RATE, true)
    view.setUint32(28, PREPARED_SAMPLE_RATE * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    writeAscii(36, 'data')
    view.setUint32(40, dataBytes, true)
    return header
  }

  private updatePreparedPosition(generation: number, force = false): void {
    if (generation !== this.operationGeneration || !this.playingPrepared || !this.preparedAudio) return
    const currentTime = this.audioEl.currentTime
    const timing = this.preparedAudio.timings.find(item => currentTime >= item.startTime && currentTime < item.endTime)
    if (!timing) {
      const lastTiming = this.preparedAudio.timings[this.preparedAudio.timings.length - 1]
      if (lastTiming && currentTime >= lastTiming.endTime && !this.preparedHighlightCleared) {
        this.preparedHighlightCleared = true
        this.clearHighlight()
      }
      return
    }
    if (this.preparedHighlightCleared) {
      this.preparedHighlightCleared = false
      this.applyHighlight(this.paragraphs[timing.paragraphIndex]?.element)
    }
    if (!force && timing.paragraphIndex === this.currentIndex) return
    this.currentIndex = timing.paragraphIndex
    this.applyHighlight(this.paragraphs[this.currentIndex]?.element)
    this.notify()
  }

  private stopPlayback(): void {
    this.preparedPlayResolver?.(false)
    this.preparedPlayResolver = null
    this.playingPrepared = false
    this.cleanupAudio()
  }

  private clearPreparedAudioInternal(): void {
    if (!this.preparedAudio) return
    const prepared = this.preparedAudio
    this.preparedAudio = null
    this.releasePreparedSource(prepared.url, prepared.blobUrl, prepared.tempPath)
  }

  private async fetchTTSAudio(text: string, generation = this.operationGeneration): Promise<ArrayBuffer> {
    // ★ API 模式：硅基流动 CosyVoice2
    if (this.mode === 'api' && this.apiToken) {
      logger.log(`[HttpTTS] API模式: 硅基流动 CosyVoice2 (directFetch=${this.directFetch})`)
      return fetchSiliconFlowWithPolicy(
        text,
        this.speed,
        this.apiToken,
        String(this.speaker),
        this.directFetch,
        () => this.assertOperation(generation),
      )
    }

    // ★ 免费模式：多 API 降级
    const chunks = splitText(text, 500)
    const audioParts: ArrayBuffer[] = []

    for (let i = 0; i < chunks.length; i++) {
      if (this.stopped) throw new Error('stopped')
      const chunk = chunks[i]
      logger.log(`[HttpTTS] 免费模式 ${i + 1}/${chunks.length}: "${chunk.substring(0, 30)}..."`)
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
    const audio0 = await this.tryProxy(baiduFanyiUrl, '百度翻译', {
      'Referer': 'https://fanyi.baidu.com/',
    })
    if (audio0) return audio0

    // ② 百度 TTS
    const baiduUrl = `${BAIDU_TTS}?lan=zh&ie=UTF-8&spd=${this.speed}&pit=5&vol=5&per=${Number(this.speaker)}&ctp=1&cuid=siyuan_tts&tex=${encodeURIComponent(chunk)}`
    const audio1 = await this.tryProxy(baiduUrl, '百度TTS', {
      'Referer': 'https://fanyi.baidu.com/',
    })
    if (audio1) return audio1

    // ③ 有道 TTS
    const youdaoUrl = `${YOUDAO_TTS}?word=${encodeURIComponent(chunk)}&le=zh&keyfrom=speaker-target`
    const audio2 = await this.tryProxy(youdaoUrl, '有道', {
      'Referer': 'https://fanyi.youdao.com/',
    })
    if (audio2) return audio2

    throw new Error('所有 TTS 服务均不可用')
  }

  /** 通过 forwardProxy 获取音频 */
  private async tryProxy(url: string, label: string, headers: Record<string, string> = {}): Promise<ArrayBuffer | null> {
    try {
      const result = await forwardProxy(url, 'GET', {}, headers ? [headers] : [], 15000, 'audio/mp3', 'base64')
      if (!result || result.status !== 200) {
        logger.warn(`[HttpTTS] ${label} HTTP ${result?.status || '无响应'}`)
        return null
      }

      const audioData = this.decodeResponseBody(result.body, result.bodyEncoding)
      if (!audioData || audioData.byteLength < 200) {
        logger.warn(`[HttpTTS] ${label} 数据太小: ${audioData?.byteLength || 0} 字节`)
        return null
      }

      const b0 = new Uint8Array(audioData)[0], b1 = new Uint8Array(audioData)[1]
      const valid = b0 === 0xFF || (b0 === 0x49 && b1 === 0x44) || (b0 === 0x52 && b1 === 0x49) || (b0 === 0x4F && b1 === 0x67)
      if (!valid) {
        logger.warn(`[HttpTTS] ${label} 非音频格式: ${b0.toString(16)} ${b1.toString(16)}`)
        return null
      }

      logger.log(`[HttpTTS] ${label} 成功: ${audioData.byteLength} 字节`)
      return audioData
    } catch (e) {
      logger.warn(`[HttpTTS] ${label} 失败:`, e instanceof Error ? e.message : String(e))
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

    this.ensureAudioElementAttached()
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
    this.audioEl.onplay = null
    this.audioEl.ontimeupdate = null
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
