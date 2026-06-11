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

import { TTSEngine, ParagraphInfo, getCurrentDocId } from './ttsEngine'
import { fetchSyncPost } from 'siyuan'

// ─── 检测 Node.js 环境 ──────────────────────────────────
// 使用 Function 构造器绕过 Vite 静态分析，确保 require 不被打包器吃掉
// vite.config.ts 已将 tls/crypto/net 标记为 external

let nodeTls: any = null
let nodeCrypto: any = null
let isElectron = false
try {
  // @ts-ignore — 绕过 Vite 静态分析
  const _req = typeof __non_webpack_require__ !== 'undefined'
    ? __non_webpack_require__
    : typeof require !== 'undefined' ? require : null
  if (_req) {
    nodeTls = _req('tls')
    nodeCrypto = _req('crypto')
    isElectron = !!nodeTls && !!nodeCrypto
  }
} catch { /* 非 Electron 环境 */ }

// ─── Node.js 自定义 WebSocket（绕过浏览器 Origin 限制）──────────────
// 参考 sireader 的 oke 类：手动实现 WebSocket 帧协议 + tls 握手

class NodeWS {
  private socket: any
  private buf: Buffer = Buffer.alloc(0)
  private handshakeDone = false

  onopen: (() => void) | null = null
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null = null
  onerror: ((err: Error) => void) | null = null
  onclose: (() => void) | null = null

  constructor(url: string, opts?: { headers?: Record<string, string> }) {
    const u = new URL(url)
    const host = u.hostname
    const path = u.pathname + u.search
    const port = parseInt(u.port) || 443
    const key = nodeCrypto.randomBytes(16).toString('base64')

    // 构建 HTTP Upgrade 请求（带自定义 Origin 头）
    let req = `GET ${path} HTTP/1.1\r\nHost: ${host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n`
    if (opts?.headers) {
      for (const [k, v] of Object.entries(opts.headers)) req += `${k}: ${v}\r\n`
    }
    req += '\r\n'

    this.socket = nodeTls.connect({ host, port, rejectUnauthorized: false }, () => {
      this.socket.write(req)
    })

    this.socket.on('data', (chunk: Buffer) => {
      this.buf = Buffer.concat([this.buf, chunk])
      if (!this.handshakeDone) {
        const idx = this.buf.indexOf('\r\n\r\n')
        if (idx < 0) return
        this.handshakeDone = true
        this.buf = this.buf.subarray(idx + 4)
        this.onopen?.()
        if (this.buf.length > 0) this._processFrames()
      } else {
        this._processFrames()
      }
    })
    this.socket.on('error', (err: Error) => {
      console.error('[NodeWS] TLS 连接错误:', err.message)
      this.onerror?.(err)
    })
    this.socket.on('close', () => this.onclose?.())
  }

  send(data: string): void {
    this._writeFrame(0x01, Buffer.from(data, 'utf-8'))
  }

  close(): void {
    try { this._writeFrame(0x08, Buffer.alloc(0)) } catch {}
    try { this.socket.destroy() } catch {}
  }

  private _writeFrame(opcode: number, payload: Buffer): void {
    if (this.socket.destroyed || !this.socket.writable) return
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
    }
  }
}

/**
 * 生成 Sec-MS-GEC DRM 令牌（edge-tts 7.x 新增）
 * 算法：SHA256(TrustedClientToken + unix_timestamp_ticks) → 大写十六进制
 */
function generateSecMsGec(): string {
  const token = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
  // Unix 时间戳转为 Windows ticks（100 纳秒单位）
  const ticks = Math.floor(Date.now() / 1000) * 10000000 + 11644473600 * 10000000
  const strToHash = `${ticks.toString()}${token}`
  // SHA256（浏览器用 SubtleCrypto，Node 用 crypto 模块）
  // 简单实现：用 crypto.createHash（Electron 可用）或 fallback
  try {
    const hash = nodeCrypto.createHash('sha256').update(strToHash, 'ascii').digest('hex').toUpperCase()
    return hash
  } catch {
    // 非 Electron 环境的 fallback（SubtleCrypto 是异步的，这里用简单替代）
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
  if (isElectron) {
    return new NodeWS(url, {
      headers: {
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    })
  }
  const ws = new WebSocket(url)
  ws.binaryType = 'arraybuffer'
  return ws
}

// ─── Edge TTS 中文语音列表 ──────────────────────────────────

export const EDGE_TTS_VOICES = [
  { name: 'zh-CN-XiaoxiaoNeural', displayName: '晓晓（女·温柔）' },
  { name: 'zh-CN-YunxiNeural', displayName: '云希（男·阳光）' },
  { name: 'zh-CN-XiaoyiNeural', displayName: '晓伊（女·活泼）' },
  { name: 'zh-CN-YunjianNeural', displayName: '云健（男·沉稳）' },
  { name: 'zh-CN-XiaochenNeural', displayName: '晓辰（女·知性）' },
  { name: 'zh-CN-XiaohanNeural', displayName: '晓涵（女·甜美）' },
  { name: 'zh-CN-XiaomoNeural', displayName: '晓墨（女·文艺）' },
  { name: 'zh-CN-XiaoshuangNeural', displayName: '晓双（女·童声）' },
  { name: 'zh-CN-YunfengNeural', displayName: '云枫（男·磁性）' },
  { name: 'zh-CN-YunhaoNeural', displayName: '云皓（男·新闻）' },
  { name: 'zh-CN-YunzeNeural', displayName: '云泽（男·纪录片）' },
]

// ─── 常量 ──────────────────────────────────────────────────

const EDGE_TTS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'

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

/**
 * 从 Edge TTS 二进制 WebSocket 消息中提取 MP3 音频数据
 * 格式：[2字节 header长度(大端)][文本 header][MP3 音频数据]
 */
function extractAudioFromBinary(data: ArrayBuffer): ArrayBuffer | null {
  const bytes = new Uint8Array(data)
  if (bytes.length < 4) return null

  const headerLength = (bytes[0] << 8) | bytes[1]
  if (headerLength === 0 || bytes.length <= 2 + headerLength) return null

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

  // 音频播放（<audio> + Blob URL，任何浏览器/WebView 都支持）
  private audioEl: HTMLAudioElement | null = null
  private blobUrl: string | null = null

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

  setVoice(voiceName: string): void { this.voice = voiceName }
  setRate(rate: number): void { this.rate = Math.max(0.5, Math.min(2.0, rate)) }

  // ─── 播放控制 ──────────────────────────────────────

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
    if (this.state !== 'playing' || !this.audioEl) return
    this.audioEl.pause()
    this.state = 'paused'
    this.notify()
  }

  resume(): void {
    if (this.state !== 'paused' || !this.audioEl) return
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

  // ─── 内部：段落播放流程 ──────────────────────────────

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

    // 合成 → 播放 → 下一段
    this.synthesize(para.text)
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
        console.warn('[EdgeTTS] error:', msg)
        this.onError?.(`朗读失败：${msg}`)
        this.stop()
      })
  }

  // ─── 内部：WebSocket 合成 ──────────────────────────────

  private synthesize(text: string): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reqId = generateUUID()

      let settled = false
      const chunks: ArrayBuffer[] = []

      const cleanup = () => {
        try { ws.close() } catch {}
      }

      // 30 秒超时
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          cleanup()
          reject(new Error('合成超时（30s）'))
        }
      }, 30000)

      const ws = createEdgeWS()

      ws.onopen = () => {
        // ① 发送配置（指定 MP3 输出格式）
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
        ws.send(`Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${config}`)

        // ② 发送 SSML
        const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>` +
          `<voice name='${this.voice}'>` +
          `<prosody rate='${rateToPercent(this.rate)}'>` +
          escapeXml(text) +
          `</prosody></voice></speak>`

        ws.send(`X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`)
      }

      ws.onmessage = (event: MessageEvent) => {
        if (typeof event.data === 'string') {
          // 文本消息：检查是否合成完成
          if (event.data.includes('Path:turn.end')) {
            if (!settled) {
              settled = true
              clearTimeout(timer)
              cleanup()
              resolve(concatArrayBuffers(chunks))
            }
          }
        } else {
          // 二进制消息：提取 MP3 音频数据
          const audio = extractAudioFromBinary(event.data)
          if (audio) chunks.push(audio)
        }
      }

      ws.onerror = () => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          reject(new Error('WebSocket 连接失败'))
        }
      }

      ws.onclose = () => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          // 关闭时已有音频数据但没有收到 turn.end → 仍然返回
          if (chunks.length > 0) {
            resolve(concatArrayBuffers(chunks))
          } else {
            reject(new Error('连接关闭，未收到音频'))
          }
        }
      }
    })
  }

  // ─── 内部：<audio> + Blob URL 播放（任何浏览器/WebView 都支持）───

  private async playAudioData(audioData: ArrayBuffer): Promise<void> {
    // 释放旧的
    if (this.blobUrl) { try { URL.revokeObjectURL(this.blobUrl) } catch {} }
    if (this.audioEl) { this.audioEl.pause(); this.audioEl.removeAttribute('src') }

    const blob = new Blob([audioData], { type: 'audio/mpeg' })
    this.blobUrl = URL.createObjectURL(blob)

    const audio = new Audio(this.blobUrl)
    this.audioEl = audio

    this.state = 'playing'
    this.notify()

    return new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve()
      audio.onerror = () => reject(new Error('音频播放失败'))
      const p = audio.play()
      if (p && p.catch) p.catch(() => reject(new Error('播放被阻止')))
    })
  }

  // ─── 内部：高亮 / 清理 ──────────────────────────────

  private cleanupAudio(): void {
    if (this.audioEl) {
      this.audioEl.pause()
      this.audioEl.onended = null
      this.audioEl.onerror = null
      this.audioEl.removeAttribute('src')
      this.audioEl = null
    }
    if (this.blobUrl) {
      try { URL.revokeObjectURL(this.blobUrl) } catch {}
      this.blobUrl = null
    }
  }

  private releaseAudio(): void {
    this.cleanupAudio()
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
        console.log(`[GoogleTTS] 请求段 ${i + 1}/${segments.length}, URL=${url.substring(0, 100)}...`)
        const result = await forwardProxy(url, 'GET', {}, [], 15000, 'audio/mpeg', '')
        console.log(`[GoogleTTS] 响应: status=${result?.status}, hasBody=${!!result?.body}, bodyLen=${result?.body ? String(result.body).length : 0}, encoding=${result?.bodyEncoding}`)

        if (!result || result.status !== 200) {
          console.warn(`[GoogleTTS] 状态异常: ${result?.status}`)
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
              console.warn('[GoogleTTS] base64 解码失败')
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
          console.warn(`[GoogleTTS] 音频数据太小: ${bytes?.length ?? 0} 字节`)
          continue
        }

        // 验证是否为有效音频（MP3 以 0xFF 0xFB 或 0x49 0x44 开头）
        const isMP3 = bytes[0] === 0xFF || (bytes[0] === 0x49 && bytes[1] === 0x44)
        console.log(`[GoogleTTS] 数据大小=${bytes.length}, 首字节=${bytes[0].toString(16)} ${bytes[1].toString(16)}, isMP3=${isMP3}`)

        audioParts.push(bytes.buffer)
        gotAudio = true
      } catch (err) {
        console.warn('[GoogleTTS] 段请求失败:', err instanceof Error ? err.message : String(err))
      }
    }
  }

  if (audioParts.length === 0) {
    console.error('[GoogleTTS] 所有段均失败，返回 null')
    return null
  }
  console.log(`[GoogleTTS] 成功获取 ${audioParts.length} 段音频`)
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
      .catch(err => { if (!this.stopped) { this.onError?.(err.message || 'Google TTS 失败'); this.stop() } })
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
