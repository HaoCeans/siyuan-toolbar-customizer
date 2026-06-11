/**
 * 手机端 TTS 引擎 — 有道 TTS + HTML5 Audio
 *
 * 原理：通过 <audio> 元素加载有道词典的 TTS HTTP 接口音频。
 * 手机端 WebView 通常拦截外部 fetch/audio.src 请求，
 * 因此增加「思源内核代理」路径：forwardProxy(base64) → 解码 → Blob → Audio。
 *
 * 长文本按标点自动分段（每段 ≤180 字），逐段合成播放。
 */

import { TTSEngine, TTSOptions, ParagraphInfo } from './ttsEngine'
import { forwardProxy } from '../api'

export type MobileTTSState = 'idle' | 'loading' | 'playing' | 'paused'

/** 按标点切分长文本 */
function splitText(text: string, maxLen = 180): string[] {
  if (!text.trim()) return []
  if (text.length <= maxLen) return [text]

  const chunks: string[] = []
  let rest = text
  const breaks = ['。', '？', '！', '；', '，', '、', ' ', '.', '?', '!', ';', ',']

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

export class MobileTTSEngine {
  private paragraphs: ParagraphInfo[] = []
  private currentIndex = -1
  private state: MobileTTSState = 'idle'
  private endParagraphIndex = -1
  private audio: HTMLAudioElement | null = null
  private blobUrl: string | null = null
  private voiceType = '2'  // 2=女声, 1=男声
  private stopped = false
  private currentChunks: string[] = []
  private currentChunkIndex = 0

  onStateChange?: (state: MobileTTSState, index: number, total: number) => void
  onError?: (msg: string) => void
  onFinish?: () => void

  extractParagraphs(): number {
    const base = new TTSEngine()
    base.extractParagraphs()
    this.paragraphs = base.getParagraphs()
    return this.paragraphs.length
  }

  getParagraphs(): ParagraphInfo[] { return this.paragraphs }

  setVoice(voiceId: string): void {
    this.voiceType = voiceId === 'zh-CN-male' ? '1' : '2'
  }

  async speak(options: TTSOptions): Promise<boolean> {
    this.stop()
    this.stopped = false

    const start = options.startParagraph ?? 0
    this.endParagraphIndex = options.endParagraph ?? this.paragraphs.length - 1
    if (this.paragraphs.length === 0) return false

    this.currentIndex = Math.max(0, Math.min(start, this.paragraphs.length - 1))
    this.playCurrentParagraph()
    return true
  }

  pause(): void {
    if (this.state !== 'playing' || !this.audio) return
    this.audio.pause()
    this.state = 'paused'
    this.notify()
  }

  resume(): void {
    if (this.state !== 'paused' || !this.audio) return
    this.audio.play()
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

  cleanup(): void { this.stop(); this.paragraphs = [] }

  // ─── 内部 ─────────────────────────────────────────

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

    // 切分长文本，逐段播放
    this.currentChunks = splitText(para.text)
    this.currentChunkIndex = 0
    this.playChunks(this.currentChunks, 0)
  }

  /** 逐段播放一个段落内的音频 chunks */
  private playChunks(chunks: string[], chunkIndex: number): void {
    if (this.stopped) return
    if (chunkIndex >= chunks.length) {
      // 所有 chunk 播完 → 下一个段落
      this.currentIndex++
      this.playCurrentParagraph()
      return
    }

    const text = chunks[chunkIndex]
    const url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&le=zh&type=${this.voiceType}`

    this.cleanupAudio()

    // 先 fetch 下载音频到内存，再用 blob URL 播放
    // 这样 <audio> 加载的是 blob: 本地地址，不是外部 URL
    this.fetchAndPlay(url)
  }

  /**
   * 三级降级获取并播放音频：
   * ① 直接 fetch（桌面端 / 部分手机浏览器可用）
   * ② 思源内核 forwardProxy 代理（绕过 WebView CSP，手机端主力路径）
   * ③ 直接设 audio.src（最后一搏，大部分 WebView 也会失败）
   */
  private async fetchAndPlay(ttsUrl: string): Promise<void> {
    if (this.stopped) return

    // ── ① 直接 fetch ──────────────────────────────────
    try {
      const resp = await fetch(ttsUrl)
      if (resp.ok) {
        const blob = await resp.blob()
        if (blob.size >= 100 && !this.stopped) {
          await this.playAudioBlob(blob)
          return
        }
        if (blob.size < 100) {
          this.onError?.('音频数据为空')
          this.stop()
          return
        }
      }
    } catch {
      // WebView 拦截了外部 fetch，继续尝试代理
      if (this.stopped) return
    }

    // ── ② 思源内核代理（forwardProxy + base64） ──────
    try {
      const blob = await this.fetchViaKernelProxy(ttsUrl)
      if (blob && !this.stopped) {
        await this.playAudioBlob(blob)
        return
      }
    } catch (proxyErr) {
      console.warn('[MobileTTS] kernel proxy failed:', proxyErr instanceof Error ? proxyErr.message : String(proxyErr))
      if (this.stopped) return
    }

    // ── ③ 直接 audio.src（最后一搏）────────────────
    this.tryDirectAudio(ttsUrl)
  }

  /** 从 Blob 创建 Audio 并播放，统一处理 onended / onerror */
  private async playAudioBlob(blob: Blob): Promise<void> {
    const blobUrl = URL.createObjectURL(blob)
    this.blobUrl = blobUrl

    const audio = new Audio(blobUrl)
    this.audio = audio

    this.state = 'playing'
    this.notify()

    audio.onended = () => {
      if (this.stopped) return
      URL.revokeObjectURL(blobUrl)
      this.blobUrl = null
      this.currentChunkIndex++
      if (this.currentChunkIndex < this.currentChunks.length) {
        this.playChunks(this.currentChunks, this.currentChunkIndex)
      } else {
        this.currentIndex++
        this.playCurrentParagraph()
      }
    }

    audio.onerror = () => {
      this.onError?.(`第 ${this.currentIndex + 1} 段播放失败`)
      this.stop()
    }

    await audio.play()
  }

  /** 通过思源内核 forwardProxy 获取音频，绕过 WebView CSP */
  private async fetchViaKernelProxy(ttsUrl: string): Promise<Blob | null> {
    console.log('[MobileTTS] trying kernel proxy for:', ttsUrl.substring(0, 80))

    const result = await forwardProxy(
      ttsUrl,
      'GET',
      {},
      [],
      15000,           // 超时 15s（TTS 合成可能较慢）
      'audio/mpeg',
      'base64'          // ★ 关键：要求内核返回 base64 编码的音频数据
    )

    if (!result || result.status !== 200 || !result.body) {
      console.warn('[MobileTTS] kernel proxy returned no data, status:', result?.status)
      return null
    }

    // 校验内核是否真正使用了 base64 编码
    // （老版本内核可能不支持 responseEncoding 参数，会以 text 返回损坏数据）
    if (result.bodyEncoding && result.bodyEncoding !== 'base64') {
      console.warn('[MobileTTS] kernel returned unexpected encoding:', result.bodyEncoding)
      return null
    }

    // base64 解码 → 二进制
    const base64 = result.body
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    if (bytes.length < 100) {
      console.warn('[MobileTTS] decoded audio too small:', bytes.length, 'bytes')
      return null
    }

    const contentType = result.contentType || 'audio/mpeg'
    console.log('[MobileTTS] kernel proxy success, audio size:', bytes.length, 'bytes, type:', contentType)
    return new Blob([bytes], { type: contentType })
  }

  /** 最后一搏：直接设 audio.src（万一 media-src 没被拦） */
  private tryDirectAudio(ttsUrl: string): void {
    if (this.stopped) return

    const audio = new Audio()
    this.audio = audio

    const timeout = setTimeout(() => {
      if (!this.stopped) {
        this.onError?.('音频加载超时，请检查网络连接或切换到「本地 TTS」选项卡')
        this.stop()
      }
    }, 8000)

    audio.oncanplaythrough = () => {
      clearTimeout(timeout)
      if (this.stopped) return
      this.state = 'playing'
      this.notify()
      audio.play().catch(() => {
        if (!this.stopped) {
          this.onError?.('音频播放被阻止')
          this.stop()
        }
      })
    }

    audio.onerror = () => {
      clearTimeout(timeout)
      if (this.stopped) return
      this.onError?.('有道 TTS 加载失败，请尝试：\n1. 切换到「本地 TTS」选项卡（需部署本地服务）\n2. 检查网络连接')
      this.stop()
    }

    audio.src = ttsUrl
    audio.load()
  }

  private cleanupAudio(): void {
    if (this.audio) {
      this.audio.oncanplaythrough = null
      this.audio.onended = null
      this.audio.onerror = null
      this.audio.pause()
      this.audio.src = ''
      this.audio = null
    }
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl)
      this.blobUrl = null
    }
  }

  private applyHighlight(el: HTMLElement): void {
    this.clearHighlight()
    el.classList.add('tts-current-paragraph')
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  private clearHighlight(): void {
    document.querySelectorAll('.tts-current-paragraph').forEach(el => {
      el.classList.remove('tts-current-paragraph')
    })
  }

  private notify(): void {
    this.onStateChange?.(this.state, this.currentIndex, this.paragraphs.length)
  }
}

let inst: MobileTTSEngine | null = null
export function getMobileTTSEngine(): MobileTTSEngine {
  if (!inst) inst = new MobileTTSEngine()
  return inst
}
export function destroyMobileTTSEngine(): void {
  if (inst) { inst.cleanup(); inst = null }
}
