/**
 * Edge TTS 引擎 — 微软 Edge 在线语音合成
 *
 * 原理：通过 WebSocket 连接微软 Bing 语音合成服务，
 * 发送 SSML 文本，接收 MP3 二进制音频，用 AudioContext 解码播放。
 *
 * 双模式连接：
 * - 桌面端（Electron）：用 Node.js tls 手动实现 WebSocket 握手，
 *   发送自定义 Origin 头（chrome-extension://...）通过微软验证
 * - 手机端（WebView）：标准浏览器 WebSocket
 *
 * 协议参考：sireader 插件的 EdgeTTSCore 类
 */

import { logger } from '@/utils/logger'
import { TTSEngine, ParagraphInfo, getCurrentDocId } from './ttsEngine'
import { fetchSyncPost } from 'siyuan'
import { t } from '../i18n/runtime'

// ─── 检测 Node.js 环境 ──────────────────────────────────
// 使用 Function 构造器绕过 Vite 静态分析，确保 require 不被打包器吃掉
// vite.config.ts 已将 tls/crypto/net 标记为 external

let nodeTls: any = null
let nodeCrypto: any = null
let isElectron = false
try {
  // @ts-ignore — Electron 预加载环境可能直接暴露 window.require
  const _req = typeof window !== 'undefined' && (window as any).require
    ? (window as any).require
    : typeof __non_webpack_require__ !== 'undefined'
      ? __non_webpack_require__
      : typeof require !== 'undefined' ? require : null
  if (_req) {
    nodeTls = _req('tls')
    nodeCrypto = _req('crypto')
    isElectron = !!nodeTls && !!nodeCrypto
  }
} catch { /* 非 Electron 环境 */ }

function edgeLog(stage: string, details: Record<string, unknown> = {}): void {
  logger.log('[EdgeTTS]', { stage, ...details })
}

function edgeWarn(stage: string, details: Record<string, unknown> = {}): void {
  logger.warn('[EdgeTTS]', { stage, ...details })
}

// 覆盖拉丁字母（含重音）、希腊字母、西里尔字母、假名、CJK 及扩展区、谚文。
// 只用于判断「这段文本有没有可朗读内容」，因此不需要覆盖全部 Unicode。
const SPEAKABLE_CHAR = /[0-9A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/

/** 纯标点、纯符号或空白段落没有可朗读内容 */
function hasSpeakableContent(text: string): boolean {
  return SPEAKABLE_CHAR.test(text)
}

// ─── Node.js 自定义 WebSocket（绕过浏览器 Origin 限制）──────────────
// 参考 sireader 的 oke 类：手动实现 WebSocket 帧协议 + tls 握手

class NodeWS {
  private socket: any = null
  private buf: Buffer = Buffer.alloc(0)
  private handshakeDone = false
  private started = false
  private terminalEmitted = false
  private readonly host: string
  private readonly port: number
  private readonly request: string

  onopen: (() => void) | null = null
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null = null
  onerror: ((err: Error) => void) | null = null
  onclose: (() => void) | null = null

  constructor(url: string, opts?: { headers?: Record<string, string> }) {
    const u = new URL(url)
    this.host = u.hostname
    this.port = parseInt(u.port) || 443
    const path = u.pathname + u.search
    const key = nodeCrypto.randomBytes(16).toString('base64')

    this.request = `GET ${path} HTTP/1.1\r\nHost: ${this.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n`
      + Object.entries(opts?.headers || {}).map(([name, value]) => `${name}: ${value}\r\n`).join('')
      + '\r\n'
  }

  connect(): void {
    if (this.started) return
    this.started = true
    this.socket = nodeTls.connect({ host: this.host, port: this.port, servername: this.host }, () => {
      this.socket.write(this.request)
    })

    this.socket.on('data', (chunk: Buffer) => {
      this.buf = Buffer.concat([this.buf, chunk])
      if (!this.handshakeDone) {
        const idx = this.buf.indexOf('\r\n\r\n')
        if (idx < 0) return
        const headerText = this.buf.subarray(0, idx).toString('ascii')
        const statusLine = headerText.split('\r\n', 1)[0]
        const statusMatch = /^HTTP\/1\.[01]\s+(\d{3})\b/.exec(statusLine)
        const statusCode = statusMatch?.[1] ?? 'unknown'
        if (statusCode !== '101') {
          const err = new Error(`WebSocket 握手失败: HTTP ${statusCode}`)
          ;(err as Error & { statusCode?: string }).statusCode = statusCode
          this.emitError(err)
          this.socket.destroy()
          return
        }
        this.handshakeDone = true
        this.buf = this.buf.subarray(idx + 4)
        edgeLog('handshake', { transport: 'node-tls', statusCode })
        this.onopen?.()
        if (this.buf.length > 0) this._processFrames()
      } else {
        this._processFrames()
      }
    })
    this.socket.on('error', (err: Error) => this.emitError(err))
    this.socket.on('close', () => {
      if (this.terminalEmitted) return
      this.terminalEmitted = true
      this.onclose?.()
    })
  }

  private emitError(error: Error): void {
    if (this.terminalEmitted) return
    this.terminalEmitted = true
    this.onerror?.(error)
  }

  send(data: string): void {
    this._writeFrame(0x01, Buffer.from(data, 'utf-8'))
  }

  close(): void {
    if (!this.socket) return
    try { this._writeFrame(0x08, Buffer.alloc(0)) } catch {}
    try { this.socket.destroy() } catch {}
  }

  private _writeFrame(opcode: number, payload: Buffer): void {
    if (!this.socket || this.socket.destroyed || !this.socket.writable) return
    const len = payload.length
    let hdrLen = 2, lenByte: number
    if (len < 126) { lenByte = len }
    else if (len < 65536) { hdrLen += 2; lenByte = 126 }
    else { hdrLen += 8; lenByte = 127 }
    hdrLen += 4 // mask key
    const frame = Buffer.alloc(hdrLen + len)
    frame[0] = 0x80 | opcode
    frame[1] = 0x80 | lenByte
    let off = 2
    if (lenByte === 126) { frame.writeUInt16BE(len, off); off += 2 }
    else if (lenByte === 127) { frame.writeUInt32BE(0, off); frame.writeUInt32BE(len, off + 4); off += 8 }
    const mask = nodeCrypto.randomBytes(4)
    mask.copy(frame, off); off += 4
    for (let i = 0; i < len; i++) frame[off + i] = payload[i] ^ mask[i % 4]
    this.socket.write(frame)
  }

  private _processFrames(): void {
    while (this.buf.length >= 2) {
      const opcode = this.buf[0] & 0x0F
      const masked = (this.buf[1] & 0x80) === 0x80
      let pLen = this.buf[1] & 0x7F, hdrLen = 2
      if (pLen === 126) { if (this.buf.length < 4) return; pLen = this.buf.readUInt16BE(2); hdrLen = 4 }
      else if (pLen === 127) { if (this.buf.length < 10) return; pLen = this.buf.readUInt32BE(6); hdrLen = 10 }
      if (masked) hdrLen += 4
      if (this.buf.length < hdrLen + pLen) return
      let payload = this.buf.subarray(hdrLen, hdrLen + pLen)
      if (masked) {
        const m = this.buf.subarray(hdrLen - 4, hdrLen)
        const d = Buffer.alloc(payload.length)
        for (let i = 0; i < payload.length; i++) d[i] = payload[i] ^ m[i % 4]
        payload = d
      }
      this.buf = this.buf.subarray(hdrLen + pLen)
      if (opcode === 0x01) this.onmessage?.({ data: payload.toString('utf-8') })
      else if (opcode === 0x02) this.onmessage?.({ data: payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) as ArrayBuffer })
      else if (opcode === 0x08) { this.onclose?.(); break }
      else if (opcode === 0x09) this._writeFrame(0x0A, payload)
    }
  }
}

/**
 * 生成 Sec-MS-GEC DRM 令牌（edge-tts 7.x 新增）
 * 算法：SHA256(五分钟时间窗的 Windows ticks + TrustedClientToken)
 */
function generateSecMsGec(): string {
  const token = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
  let seconds = BigInt(Math.floor(Date.now() / 1000) + 11644473600)
  seconds -= seconds % 300n
  const ticks = seconds * 10000000n
  const strToHash = `${ticks}${token}`
  try {
    return nodeCrypto.createHash('sha256').update(strToHash, 'ascii').digest('hex').toUpperCase()
  } catch {
    return ''
  }
}

const SEC_MS_GEC_VERSION = '1-143.0.3650.75'

/**
 * 构建完整的 Edge TTS WebSocket URL（含 Sec-MS-GEC 令牌）
 */
function buildEdgeWSUrl(): string {
  const baseUrl = `${EDGE_TTS_URL}?TrustedClientToken=${TRUSTED_TOKEN}`
  const connId = generateUUID()
  let url = `${baseUrl}&ConnectionId=${connId}`
  const secMsGec = generateSecMsGec()
  if (secMsGec) {
    url += `&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`
  }
  return url
}

/**
 * 创建 Edge TTS WebSocket 连接
 * 桌面端用 NodeWS（自定义 Origin 头 + Cookie），手机端用标准 WebSocket
 */
function createEdgeWS(): any {
  const url = buildEdgeWSUrl()
  const transport = isElectron ? 'node-tls' : 'browser-websocket'
  edgeLog('environment', {
    transport,
    hasSecMsGec: url.includes('Sec-MS-GEC='),
  })
  if (isElectron) {
    const muid = nodeCrypto.randomBytes(16).toString('hex').toUpperCase()
    return new NodeWS(url, {
      headers: {
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': `muid=${muid};`,
      }
    })
  }
  const ws = new WebSocket(url)
  ws.binaryType = 'arraybuffer'
  return ws
}

// ─── Edge TTS 中文语音列表 ──────────────────────────────────
// 必须与接口 voices/list 返回的名字完全一致。传入未收录的语音名时，
// 服务端会正常完成 HTTP 101 握手、收到 SSML 后直接关闭连接而不返回任何音频，
// 表现为「连接关闭，未收到音频」，很难定位。

export const EDGE_TTS_VOICES = [
  { name: 'zh-CN-XiaoxiaoNeural', displayName: t('tts.voice.edge.xiaoxiao', undefined, '晓晓（女·温柔）') },
  { name: 'zh-CN-YunxiNeural', displayName: t('tts.voice.edge.yunxi', undefined, '云希（男·阳光）') },
  { name: 'zh-CN-XiaoyiNeural', displayName: t('tts.voice.edge.xiaoyi', undefined, '晓伊（女·活泼）') },
  { name: 'zh-CN-YunjianNeural', displayName: t('tts.voice.edge.yunjian', undefined, '云健（男·沉稳）') },
  { name: 'zh-CN-YunxiaNeural', displayName: t('tts.voice.edge.yunxia', undefined, '云夏（男·少年）') },
  { name: 'zh-CN-YunyangNeural', displayName: t('tts.voice.edge.yunyang', undefined, '云扬（男·专业）') },
  { name: 'zh-CN-liaoning-XiaobeiNeural', displayName: t('tts.voice.edge.xiaobei', undefined, '晓北（女·东北）') },
  { name: 'zh-CN-shaanxi-XiaoniNeural', displayName: t('tts.voice.edge.xiaoni', undefined, '晓妮（女·陕西）') },
]

const EDGE_VOICE_NAMES = new Set(EDGE_TTS_VOICES.map(voice => voice.name))

/** 是否为本接口支持的语音名 */
export function isSupportedEdgeVoice(name: string): boolean {
  return EDGE_VOICE_NAMES.has(name)
}

// ─── 常量 ──────────────────────────────────────────────────

const EDGE_TTS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'

// 连续多少段失败后判定为系统性故障并中止，避免整篇被静默跳过
const MAX_CONSECUTIVE_FAILURES = 3

const HIGHLIGHT_CLASS = 'tts-current-paragraph'
let styleEl: HTMLStyleElement | null = null

// 不朗读的块类型（与 ttsEngine.ts 保持一致）
const SKIP_DATA_TYPES = new Set([
  'NodeCodeBlock', 'NodeMathBlock', 'NodeHTMLBlock',
  'NodeIFrame', 'NodeWidget', 'NodeEmbedBlock',
  'NodeThematicBreak', 'NodeAudio', 'NodeVideo',
  'NodeBlockQueryEmbed',
])

// ─── 工具函数 ──────────────────────────────────────────────

function generateUUID(): string {
  return 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16)
  )
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function rateToPercent(rate: number): string {
  if (rate === 1) return '+0%'
  return rate > 1
    ? `+${Math.round((rate - 1) * 100)}%`
    : `-${Math.round((1 - rate) * 100)}%`
}

function edgeTimestamp(date: Date = new Date()): string {
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${weekdays[date.getUTCDay()]} ${months[date.getUTCMonth()]} ${pad(date.getUTCDate())} ${date.getUTCFullYear()} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} GMT+0000 (Coordinated Universal Time)`
}

/**
 * 从 Edge TTS 二进制 WebSocket 消息中提取 MP3 音频数据
 * 格式：[2字节 header长度(大端)][文本 header][MP3 音频数据]
 */
function extractAudioFromBinary(data: ArrayBuffer): ArrayBuffer | null {
  const bytes = new Uint8Array(data)
  if (bytes.length < 4) return null

  const headerLength = (bytes[0] << 8) | bytes[1]
  if (headerLength === 0 || bytes.length <= 2 + headerLength) return null

  const header = new TextDecoder().decode(bytes.subarray(2, 2 + headerLength))
  if (!/(?:^|\r?\n)Path:audio(?:\r?\n|$)/i.test(header)) return null

  const audioStart = 2 + headerLength
  const audioData = bytes.subarray(audioStart)

  // 太小不可能是有效音频
  if (audioData.length < 10) return null

  return audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength)
}

function concatArrayBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  if (buffers.length === 0) return new ArrayBuffer(0)
  if (buffers.length === 1) return buffers[0]
  const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(new Uint8Array(buf), offset)
    offset += buf.byteLength
  }
  return result.buffer
}

function ensureHighlightStyle(): void {
  if (styleEl) return
  styleEl = document.createElement('style')
  styleEl.id = 'tts-edge-highlight-style'
  styleEl.textContent = `.${HIGHLIGHT_CLASS}{background:linear-gradient(to bottom,rgba(255,243,185,0.55),rgba(255,230,130,0.35))!important;border-radius:6px;box-shadow:0 0 0 1px rgba(255,210,80,0.08);transition:background .3s ease}html[data-theme-mode="dark"] .${HIGHLIGHT_CLASS}{background:rgba(255,255,255,0.07)!important;border-left:3px solid rgba(255,255,255,0.18)!important;border-radius:4px;box-shadow:inset 0 0 12px rgba(255,255,255,0.03)}`
  document.head.appendChild(styleEl)
}

// ─── 引擎类型 ──────────────────────────────────────────────

export type EdgeTTSState = 'idle' | 'loading' | 'playing' | 'paused'

// ─── EdgeTTSEngine ─────────────────────────────────────────

export class EdgeTTSEngine {
  private paragraphs: ParagraphInfo[] = []
  private currentIndex = -1
  private state: EdgeTTSState = 'idle'
  private endParagraphIndex = -1
  private stopped = false
  private voice = 'zh-CN-XiaoxiaoNeural'
  private rate = 1.0
  private operationGeneration = 0
  // 预取会让两个合成连接短暂并存，因此用集合管理，停止时全部关闭
  private activeSockets = new Set<any>()
  private prefetch: { index: number; generation: number; promise: Promise<ArrayBuffer> } | null = null
  private consecutiveFailures = 0

  // 音频播放（持久化 <audio> + Blob URL，任何浏览器/WebView 都支持）
  private audioEl: HTMLAudioElement = this.createAudioElement()
  private blobUrl: string | null = null
  private playbackActivated = false

  // 回调
  onStateChange?: (state: EdgeTTSState, index: number, total: number) => void
  onError?: (msg: string) => void
  onFinish?: () => void

  // ─── 段落提取（复用现有逻辑）─────────────────────────

  extractParagraphs(): number {
    const base = new TTSEngine()
    base.extractParagraphs()
    this.paragraphs = base.getParagraphs()
    return this.paragraphs.length
  }

  async extractParagraphsAsync(): Promise<number> {
    // ① 先尝试 DOM 提取（桌面端 / 手机端 protyle 可达时）
    const base = new TTSEngine()
    let count = base.extractParagraphs()
    if (count > 0) {
      this.paragraphs = base.getParagraphs()
      return count
    }

    // ② API 降级：通过 /api/filetree/getDoc 获取文档内容
    const docId = getCurrentDocId()
    if (!docId) return 0

    try {
      const resp = await fetchSyncPost('/api/filetree/getDoc', { id: docId, mode: 0, size: 102400 })
      if (resp?.code !== 0 || !resp.data?.content) return 0

      const html = (resp.data.content as string).replace(/\{:[^}]+\}/g, '')
      const div = document.createElement('div')
      div.innerHTML = html
      div.querySelectorAll('pre, [data-type="NodeCodeBlock"], [data-type="NodeMathBlock"], [data-type="NodeHTMLBlock"]').forEach(e => e.remove())

      this.paragraphs = []
      const allBlocks = div.querySelectorAll('[data-node-id]')
      for (const block of allBlocks) {
        const el = block as HTMLElement
        const dataType = el.getAttribute('data-type')
        if (dataType && SKIP_DATA_TYPES.has(dataType)) continue
        const text = (el.textContent || '').trim()
        if (!text) continue
        this.paragraphs.push({ element: el, text })
      }
      return this.paragraphs.length
    } catch {
      return 0
    }
  }

  getParagraphs(): ParagraphInfo[] { return this.paragraphs }

  // ─── 设置 ──────────────────────────────────────────

  setVoice(voiceName: string): void {
    // 旧版本保存过的语音名可能已不在支持列表中，直接回退可避免服务端静默断连
    if (isSupportedEdgeVoice(voiceName)) {
      this.voice = voiceName
      return
    }
    edgeWarn('voice-unsupported', { voice: voiceName, fallback: EDGE_TTS_VOICES[0].name })
    this.voice = EDGE_TTS_VOICES[0].name
  }
  setRate(rate: number): void { this.rate = Math.max(0.5, Math.min(2.0, rate)) }

  // ─── 播放控制 ──────────────────────────────────────

  speak(startParagraph: number = 0, endParagraph?: number): boolean {
    this.stop()
    this.stopped = false
    const generation = ++this.operationGeneration
    this.consecutiveFailures = 0
    this.endParagraphIndex = endParagraph ?? this.paragraphs.length - 1
    if (this.paragraphs.length === 0) return false

    ensureHighlightStyle()
    this.currentIndex = Math.max(0, Math.min(startParagraph, this.paragraphs.length - 1))
    this.playCurrentParagraph(generation)
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
    this.operationGeneration++
    this.abortActiveSockets()
    this.prefetch = null
    this.cleanupAudio()
    this.clearHighlight()
    this.state = 'idle'
    this.currentIndex = -1
    this.notify()
  }

  async jumpToParagraph(index: number): Promise<void> {
    if (index < 0 || index >= this.paragraphs.length) return
    this.stopped = false
    this.operationGeneration++
    const generation = this.operationGeneration
    this.abortActiveSockets()
    this.prefetch = null
    this.cleanupAudio()
    this.clearHighlight()
    this.currentIndex = index
    this.playCurrentParagraph(generation)
  }

  async nextParagraph(): Promise<void> {
    if (this.currentIndex < this.paragraphs.length - 1) await this.jumpToParagraph(this.currentIndex + 1)
  }

  async prevParagraph(): Promise<void> {
    if (this.currentIndex > 0) await this.jumpToParagraph(this.currentIndex - 1)
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
    this.releaseAudio()
  }

  /** 朗读一段文字，完成后回调 */
  async speakOnce(text: string, onDone?: () => void): Promise<void> {
    const generation = this.operationGeneration
    try {
      const audio = await this.synthesize(text, generation)
      if (this.stopped || generation !== this.operationGeneration) { onDone?.(); return }
      await this.playAudioData(audio, generation)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      edgeWarn('speak-once', { message, textLength: text.length })
    }
    onDone?.()
  }

  /** 在桌面用户点击事件中同步激活持久化播放通道。 */
  activatePlayback(): void {
    if (this.playbackActivated) return
    if (!this.audioEl.isConnected && document.body) document.body.appendChild(this.audioEl)
    const silent = new Blob([new Uint8Array([0x49, 0x44, 0x33])], { type: 'audio/mpeg' })
    const url = URL.createObjectURL(silent)
    this.audioEl.src = url
    this.audioEl.play().then(() => {
      this.audioEl.pause()
      this.audioEl.currentTime = 0
      this.playbackActivated = true
    }).catch(() => {})
    setTimeout(() => { try { URL.revokeObjectURL(url) } catch {} }, 1000)
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
  }

  private playCurrentParagraph(generation: number = this.operationGeneration): void {
    if (this.stopped || generation !== this.operationGeneration) return

    // 跳过没有可朗读内容的段落。Edge 对纯标点/符号文本会正常返回 turn.end
    // 但不返回任何音频，若按失败处理会中断整篇朗读。
    while (
      this.currentIndex <= this.endParagraphIndex
      && this.currentIndex < this.paragraphs.length
      && !hasSpeakableContent(this.paragraphs[this.currentIndex].text)
    ) {
      edgeLog('skip-unspeakable', { paragraphIndex: this.currentIndex })
      this.currentIndex++
    }

    if (this.currentIndex > this.endParagraphIndex || this.currentIndex >= this.paragraphs.length) {
      this.clearHighlight()
      this.state = 'idle'
      this.currentIndex = -1
      this.notify()
      this.onFinish?.()
      return
    }

    const para = this.paragraphs[this.currentIndex]
    const index = this.currentIndex
    this.state = 'loading'
    this.applyHighlight(para.element)
    this.notify()

    // 优先使用上一段播放期间预取好的音频，避免在段落之间重新等待一次合成
    const prefetched = this.takePrefetch(index, generation)
    edgeLog('prefetch', { paragraphIndex: index, reused: prefetched !== null })
    const audioPromise = prefetched ?? this.synthesize(para.text, generation)

    audioPromise
      .then(audioData => {
        if (this.stopped || generation !== this.operationGeneration) return
        // 在当前段落开始播放前就启动下一段合成，把合成耗时与播放重叠
        this.prefetchNext(index, generation)
        return this.playAudioData(audioData, generation)
      })
      .then(() => {
        if (this.stopped || generation !== this.operationGeneration) return
        this.consecutiveFailures = 0
        this.currentIndex++
        this.playCurrentParagraph(generation)
      })
      .catch(err => {
        if (this.stopped || generation !== this.operationGeneration) return
        const msg = err instanceof Error ? err.message : String(err)
        // 与浏览器朗读引擎一致：单段失败只记录并继续下一段，不中断整篇朗读，
        // 否则永远走不到「本文档已经朗读完成」的尾声提示。
        const skippable = (err as Error & { skippable?: boolean }).skippable === true
        edgeWarn('paragraph-skipped', {
          paragraphIndex: index,
          textLength: para.text.length,
          voice: this.voice,
          rate: this.rate,
          skippable,
          message: msg,
        })
        if (!skippable && ++this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          this.onError?.(`Edge 在线朗读失败：${msg}`)
          this.stop()
          return
        }
        this.currentIndex++
        this.playCurrentParagraph(generation)
      })
  }

  /** 取用与当前段落匹配的预取结果；不匹配（跳段、重新开始）则丢弃 */
  private takePrefetch(index: number, generation: number): Promise<ArrayBuffer> | null {
    const prefetch = this.prefetch
    if (!prefetch || prefetch.index !== index || prefetch.generation !== generation) return null
    this.prefetch = null
    return prefetch.promise
  }

  /** 提前合成下一段，使其在播放当前段时完成，从而消除块与块之间的静音间隔 */
  private prefetchNext(currentIndex: number, generation: number): void {
    const nextIndex = currentIndex + 1
    if (nextIndex > this.endParagraphIndex || nextIndex >= this.paragraphs.length) return
    if (generation !== this.operationGeneration || this.stopped) return
    if (this.prefetch?.index === nextIndex && this.prefetch.generation === generation) return

    const text = this.paragraphs[nextIndex].text
    if (!hasSpeakableContent(text)) return

    const promise = this.synthesize(text, generation)
    // 预取失败不影响当前播放：等到该段真正播放时会重新合成
    promise.catch(() => {})
    this.prefetch = { index: nextIndex, generation, promise }
  }

  private abortActiveSockets(): void {
    for (const socket of this.activeSockets) {
      try { socket.close() } catch {}
    }
    this.activeSockets.clear()
  }

  // ─── 内部：WebSocket 合成 ──────────────────────────────

  private synthesize(text: string, generation: number = this.operationGeneration): Promise<ArrayBuffer> {
    return this.synthesizeAttempt(text, generation).catch(async (error: unknown) => {
      const retryable = error instanceof Error && (error as Error & { retryable?: boolean }).retryable === true
      if (!retryable || generation !== this.operationGeneration || this.stopped) throw error
      edgeLog('retry', { textLength: text.length, voice: this.voice, rate: this.rate })
      await new Promise(resolve => setTimeout(resolve, 350))
      if (generation !== this.operationGeneration || this.stopped) throw new Error('operation cancelled')
      return this.synthesizeAttempt(text, generation)
    })
  }

  private synthesizeAttempt(text: string, generation: number): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reqId = generateUUID()
      const startedAt = Date.now()

      let settled = false
      let binaryFrameCount = 0
      let audioByteCount = 0
      let ws: any = null
      let timer: ReturnType<typeof setTimeout> | null = null
      const chunks: ArrayBuffer[] = []

      const cleanup = () => {
        try { ws?.close() } catch {}
        this.activeSockets.delete(ws)
      }

      const fail = (stage: string, error: unknown, retryable = false, skippable = false) => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        cleanup()
        const message = error instanceof Error ? error.message : String(error)
        const result = error instanceof Error ? error : new Error(message)
        ;(result as Error & { retryable?: boolean; skippable?: boolean }).retryable = retryable
        ;(result as Error & { retryable?: boolean; skippable?: boolean }).skippable = skippable
        edgeWarn(stage, {
          message,
          textLength: text.length,
          voice: this.voice,
          rate: this.rate,
          binaryFrameCount,
          audioByteCount,
          elapsedMs: Date.now() - startedAt,
        })
        reject(result)
      }

      timer = setTimeout(() => {
        fail('timeout', new Error('合成超时（30 秒）'), audioByteCount === 0)
      }, 30000)

      try {
        ws = createEdgeWS()
      } catch (error) {
        fail('create-websocket', error, true)
        return
      }

      this.activeSockets.add(ws)

      edgeLog('synthesize-start', {
        textLength: text.length,
        voice: this.voice,
        rate: this.rate,
      })

      ws.onopen = () => {
        const timestamp = edgeTimestamp()
        const config = JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'true' },
                outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
              },
            },
          },
        })
        ws.send(`X-Timestamp:${timestamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${config}\r\n`)

        const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
          `<voice name='${this.voice}'>` +
          `<prosody pitch='+0Hz' rate='${rateToPercent(this.rate)}' volume='+0%'>` +
          escapeXml(text) +
          `</prosody></voice></speak>`

        edgeLog('send', {
          textLength: text.length,
          ssmlByteLength: new TextEncoder().encode(ssml).byteLength,
          voice: this.voice,
          rate: this.rate,
        })
        ws.send(`X-RequestId:${reqId}\r\nX-Timestamp:${timestamp}Z\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`)
      }

      ws.onmessage = (event: MessageEvent) => {
        if (typeof event.data === 'string') {
          if (event.data.includes('Path:turn.end')) {
            if (settled) return
            if (audioByteCount === 0) {
              // 服务端正常结束了这一轮但没有音频，属于内容层面的结果而非传输故障，
              // 重试一次后仍为空则跳过该段，不计入系统性失败判定。
              fail('no-audio', new Error('合成结束但未收到音频'), true, true)
              return
            }
            settled = true
            if (timer) clearTimeout(timer)
            cleanup()
            edgeLog('synthesize-complete', {
              binaryFrameCount,
              audioByteCount,
              elapsedMs: Date.now() - startedAt,
            })
            resolve(concatArrayBuffers(chunks))
          }
        } else {
          binaryFrameCount++
          const audio = extractAudioFromBinary(event.data)
          if (audio) {
            chunks.push(audio)
            audioByteCount += audio.byteLength
          }
        }
      }

      ws.onerror = (event: Error | Event) => {
        const message = event instanceof Error
          ? event.message
          : 'WebSocket 连接失败（浏览器未提供详细原因）'
        fail('websocket', new Error(message), audioByteCount === 0)
      }

      ws.onclose = () => {
        if (settled) return
        if (audioByteCount > 0) {
          settled = true
          if (timer) clearTimeout(timer)
          edgeWarn('closed-before-turn-end', {
            binaryFrameCount,
            audioByteCount,
            elapsedMs: Date.now() - startedAt,
          })
          resolve(concatArrayBuffers(chunks))
        } else {
          fail('closed', new Error(`连接关闭，未收到音频（语音：${this.voice}）`), true)
        }
      }

      if (ws instanceof NodeWS) ws.connect()
    })
  }

  // ─── 内部：<audio> + Blob URL 播放（任何浏览器/WebView 都支持）───

  private async playAudioData(audioData: ArrayBuffer, generation: number = this.operationGeneration): Promise<void> {
    if (audioData.byteLength === 0) throw new Error('音频数据为空')
    if (generation !== this.operationGeneration) throw new Error('operation cancelled')

    this.ensureAudioElementAttached()
    if (this.blobUrl) { try { URL.revokeObjectURL(this.blobUrl) } catch {} }
    this.audioEl.pause()
    this.audioEl.removeAttribute('src')

    const blob = new Blob([audioData], { type: 'audio/mpeg' })
    this.blobUrl = URL.createObjectURL(blob)
    this.audioEl.src = this.blobUrl
    this.audioEl.load()

    this.state = 'playing'
    this.notify()

    return new Promise<void>((resolve, reject) => {
      const audio = this.audioEl
      let settled = false
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        audio.onended = null
        audio.onerror = null
        if (error) reject(error)
        else resolve()
      }
      audio.onended = () => finish()
      audio.onerror = () => {
        const mediaError = audio.error
        edgeWarn('playback', { audioByteCount: audioData.byteLength, mediaErrorCode: mediaError?.code ?? 0, mediaErrorMessage: mediaError?.message || 'unknown' })
        finish(new Error(`音频播放失败（媒体错误 ${mediaError?.code ?? 'unknown'}）`))
      }
      const p = audio.play()
      if (p && p.catch) p.catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        edgeWarn('playback-start', { audioByteCount: audioData.byteLength, message })
        finish(new Error(`播放被阻止：${message}`))
      })
    })
  }

  // ─── 内部：高亮 / 清理 ──────────────────────────────

  private cleanupAudio(): void {
    this.audioEl.pause()
    this.audioEl.onended = null
    this.audioEl.onerror = null
    this.audioEl.removeAttribute('src')
    if (this.blobUrl) {
      try { URL.revokeObjectURL(this.blobUrl) } catch {}
      this.blobUrl = null
    }
  }

  private releaseAudio(): void {
    this.cleanupAudio()
    try { this.audioEl.remove() } catch {}
  }

  private applyHighlight(el: HTMLElement): void {
    this.clearHighlight()
    if (el.isConnected) {
      el.classList.add(HIGHLIGHT_CLASS)
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  private clearHighlight(): void {
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(el => {
      el.classList.remove(HIGHLIGHT_CLASS)
    })
  }

  private notify(): void {
    this.onStateChange?.(this.state, this.currentIndex, this.paragraphs.length)
  }
}

// ─── 单例 ──────────────────────────────────────────────────

let instance: EdgeTTSEngine | null = null

export function getEdgeTTSEngine(): EdgeTTSEngine {
  if (!instance) instance = new EdgeTTSEngine()
  return instance
}

export function destroyEdgeTTSEngine(): void {
  if (instance) { instance.cleanup(); instance = null }
}

// ═══════════════════════════════════════════════════════════════
// Google Translate TTS — 备用引擎（通过思源 forwardProxy 代理）
// ═══════════════════════════════════════════════════════════════

const GOOGLE_TTS_BASE = 'https://translate.google.com/translate_tts'

/**
 * 通过 forwardProxy 代理获取 Google Translate TTS 音频
 * Google TTS 对每段文本有长度限制（~200字符），超长需分段
 * 尝试两种 URL 格式（client=tw-ob 和 client=gtt）
 */
async function fetchGoogleTTS(text: string, lang: string = 'zh-CN'): Promise<ArrayBuffer | null> {
  // 分段（Google 限制约 200 字符）
  const segments = splitTextForGoogle(text, 200)
  const audioParts: ArrayBuffer[] = []

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (!seg.trim()) continue

    // 尝试两种 URL 格式
    const urls = [
      `${GOOGLE_TTS_BASE}?ie=UTF-8&tl=${lang}&client=gtt&q=${encodeURIComponent(seg)}`,
      `${GOOGLE_TTS_BASE}?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(seg)}`,
    ]

    let gotAudio = false
    for (const url of urls) {
      if (gotAudio) break
      try {
        logger.log(`[GoogleTTS] 请求段 ${i + 1}/${segments.length}, URL=${url.substring(0, 100)}...`)
        const result = await forwardProxy(url, 'GET', {}, [], 15000, 'audio/mpeg', '')
        logger.log(`[GoogleTTS] 响应: status=${result?.status}, hasBody=${!!result?.body}, bodyLen=${result?.body ? String(result.body).length : 0}, encoding=${result?.bodyEncoding}`)

        if (!result || result.status !== 200) {
          logger.warn(`[GoogleTTS] 状态异常: ${result?.status}`)
          continue
        }

        // forwardProxy 可能返回 base64 字符串或文本
        let bytes: Uint8Array | null = null
        const body = result.body

        if (typeof body === 'string' && body.length > 0) {
          if (result.bodyEncoding === 'base64' || /^[A-Za-z0-9+/=]+$/.test(body.substring(0, 100))) {
            // base64 编码的音频
            try {
              const bin = atob(body)
              bytes = new Uint8Array(bin.length)
              for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j)
            } catch {
              logger.warn('[GoogleTTS] base64 解码失败')
            }
          }
          if (!bytes || bytes.length < 100) {
            // 可能是原始二进制被当文本返回了（非 base64）
            // 尝试直接当作 MP3 的 raw bytes
            const encoder = new TextEncoder()
            const raw = encoder.encode(body)
            if (raw.length > 100) bytes = raw
          }
        }

        if (!bytes || bytes.length < 100) {
          logger.warn(`[GoogleTTS] 音频数据太小: ${bytes?.length ?? 0} 字节`)
          continue
        }

        // 验证是否为有效音频（MP3 以 0xFF 0xFB 或 0x49 0x44 开头）
        const isMP3 = bytes[0] === 0xFF || (bytes[0] === 0x49 && bytes[1] === 0x44)
        logger.log(`[GoogleTTS] 数据大小=${bytes.length}, 首字节=${bytes[0].toString(16)} ${bytes[1].toString(16)}, isMP3=${isMP3}`)

        const audioPart = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer
        audioParts.push(audioPart)
        gotAudio = true
      } catch (err) {
        logger.warn('[GoogleTTS] 段请求失败:', err instanceof Error ? err.message : String(err))
      }
    }
  }

  if (audioParts.length === 0) {
    logger.error('[GoogleTTS] 所有段均失败，返回 null')
    return null
  }
  logger.log(`[GoogleTTS] 成功获取 ${audioParts.length} 段音频`)
  return concatArrayBuffers(audioParts)
}

function splitTextForGoogle(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text]
  const chunks: string[] = []
  let rest = text
  const breaks = ['。', '？', '！', '；', '，', '、', '.', '?', '!', ';', ',']
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

// 从 api.ts 导入 forwardProxy 的类型（运行时通过模块访问）
import { forwardProxy } from '../api'

export type GoogleTTSState = 'idle' | 'loading' | 'playing' | 'paused'

/**
 * Google Translate TTS 引擎
 * 使用 forwardProxy 绕过 CORS，AudioContext 播放
 */
export class GoogleTTSEngine {
  private paragraphs: ParagraphInfo[] = []
  private currentIndex = -1
  private state: GoogleTTSState = 'idle'
  private endParagraphIndex = -1
  private stopped = false
  private audioCtx: AudioContext | null = null
  private currentSource: AudioBufferSourceNode | null = null

  onStateChange?: (state: GoogleTTSState, index: number, total: number) => void
  onError?: (msg: string) => void
  onFinish?: () => void

  // 段落提取（复用 EdgeTTSEngine 的逻辑）
  extractParagraphs(): number {
    const base = new EdgeTTSEngine()
    base.extractParagraphs()
    this.paragraphs = base.getParagraphs()
    return this.paragraphs.length
  }

  async extractParagraphsAsync(): Promise<number> {
    const engine = getEdgeTTSEngine()
    const count = await engine.extractParagraphsAsync()
    this.paragraphs = engine.getParagraphs()
    return count
  }

  getParagraphs(): ParagraphInfo[] { return this.paragraphs }

  speak(startParagraph: number = 0, endParagraph?: number): boolean {
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
    if (this.state !== 'playing' || !this.audioCtx) return
    this.audioCtx.suspend()
    this.state = 'paused'
    this.notify()
  }

  resume(): void {
    if (this.state !== 'paused' || !this.audioCtx) return
    this.audioCtx.resume()
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

  async jumpToParagraph(index: number): Promise<void> {
    if (index < 0 || index >= this.paragraphs.length) return
    this.stopped = false
    this.cleanupAudio()
    this.clearHighlight()
    this.currentIndex = index
    this.playCurrentParagraph()
  }

  async nextParagraph(): Promise<void> {
    if (this.currentIndex < this.paragraphs.length - 1) await this.jumpToParagraph(this.currentIndex + 1)
  }

  async prevParagraph(): Promise<void> {
    if (this.currentIndex > 0) await this.jumpToParagraph(this.currentIndex - 1)
  }

  get isPlaying(): boolean { return this.state === 'playing' }
  get isPaused(): boolean { return this.state === 'paused' }
  get isIdle(): boolean { return this.state === 'idle' }
  get isLoading(): boolean { return this.state === 'loading' }
  get currentParagraphIndex(): number { return this.currentIndex }
  get totalParagraphs(): number { return this.paragraphs.length }

  cleanup(): void {
    this.stop()
    this.paragraphs = []
    if (this.audioCtx) { this.audioCtx.close().catch(() => {}); this.audioCtx = null }
  }

  /** 朗读一段文字，完成后回调 */
  async speakOnce(text: string, onDone?: () => void): Promise<void> {
    try {
      const audio = await fetchGoogleTTS(text)
      if (!audio || this.stopped) { onDone?.(); return }
      await this.playAudioData(audio)
    } catch { /* ignore */ }
    onDone?.()
  }

  // ─── 内部 ──────────────────────────────────────────

  private playCurrentParagraph(): void {
    if (this.stopped) return
    if (this.currentIndex > this.endParagraphIndex || this.currentIndex >= this.paragraphs.length) {
      this.clearHighlight(); this.state = 'idle'; this.currentIndex = -1; this.notify(); this.onFinish?.(); return
    }
    const para = this.paragraphs[this.currentIndex]
    this.state = 'loading'
    this.applyHighlight(para.element)
    this.notify()

    fetchGoogleTTS(para.text)
      .then(audio => {
        if (this.stopped || !audio) throw new Error(audio ? 'stopped' : '音频获取失败')
        return this.playAudioData(audio)
      })
      .then(() => { if (!this.stopped) { this.currentIndex++; this.playCurrentParagraph() } })
      .catch(err => {
        if (!this.stopped) {
          logger.warn('[GoogleTTS] error:', err)
          this.onError?.(t('tts.googleFailedRetry', undefined, 'Google TTS 失败，请重试或检查网络连接'))
          this.stop()
        }
      })
  }

  private async playAudioData(audioData: ArrayBuffer): Promise<void> {
    if (!this.audioCtx) this.audioCtx = new AudioContext()
    if (this.audioCtx.state === 'suspended') await this.audioCtx.resume()
    const audioBuffer = await this.audioCtx.decodeAudioData(audioData.slice(0))
    const source = this.audioCtx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(this.audioCtx.destination)
    this.currentSource = source
    this.state = 'playing'
    this.notify()
    return new Promise<void>(resolve => {
      source.onended = () => { this.currentSource = null; resolve() }
      source.start(0)
    })
  }

  private cleanupAudio(): void {
    if (this.currentSource) { try { this.currentSource.stop() } catch {}; this.currentSource = null }
  }

  private applyHighlight(el: HTMLElement): void {
    this.clearHighlight()
    if (el.isConnected) { el.classList.add(HIGHLIGHT_CLASS); el.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
  }

  private clearHighlight(): void {
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(el => el.classList.remove(HIGHLIGHT_CLASS))
  }

  private notify(): void {
    this.onStateChange?.(this.state, this.currentIndex, this.paragraphs.length)
  }
}

let googleInstance: GoogleTTSEngine | null = null
export function getGoogleTTSEngine(): GoogleTTSEngine {
  if (!googleInstance) googleInstance = new GoogleTTSEngine()
  return googleInstance
}
export function destroyGoogleTTSEngine(): void {
  if (googleInstance) { googleInstance.cleanup(); googleInstance = null }
}
