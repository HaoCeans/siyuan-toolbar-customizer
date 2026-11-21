/**
 * TTS 朗读引擎 — 基于 Web Speech API
 *
 * 提供段落提取、逐段朗读、高亮、暂停/恢复/停止等核心能力。
 * 电脑端（Electron/Chrome）使用 speechSynthesis 正常工作。
 * 手机端（Android WebView）speechSynthesis 通常不可用，需要检测并提示。
 */

import { logger } from '@/utils/logger'
import { t } from '../i18n/runtime'
import { clampRepeatCount, getRepeatCountSetting, getReadDirectionSetting } from './httpTtsEngine'
import { ensureTtsParagraphVisible } from './ttsParagraphFocus'
// ─── 类型 ────────────────────────────────────────────────

export interface TTSOptions {
  rate: number            // 0.5 – 2.0, default 1.0
  pitch: number           // 0.1 – 2.0, default 1.0（音调：低沉↔尖锐）
  volume: number          // 0.0 – 1.0, default 1.0（音量）
  voiceName?: string      // 语音名称（可选，留空自动选）
  startParagraph?: number // 从第几段开始（0-based）, default 0
  endParagraph?: number   // 到第几段结束（inclusive）, default 全部
}

export interface ParagraphInfo {
  element: HTMLElement
  text: string
  /** 块 id（data-node-id）：切换文档 / 编辑器重渲染后靠它找回新元素 */
  nodeId?: string
}

type TTSState = 'idle' | 'playing' | 'paused'

// ─── 不朗读的块类型 ─────────────────────────────────────
const SKIP_DATA_TYPES = new Set([
  'NodeCodeBlock', 'NodeMathBlock', 'NodeHTMLBlock',
  'NodeIFrame', 'NodeWidget', 'NodeEmbedBlock',
  'NodeThematicBreak', 'NodeAudio', 'NodeVideo',
  'NodeBlockQueryEmbed',
])

/**
 * 容器块类型：本身不是「一段文本」，只是包着一批子块。
 * 列表（NodeList）/列表项（NodeListItem）/引述（NodeBlockquote）/超级块（NodeSuperBlock）/
 * 高亮块（NodeCallout）都必须向下展开到叶子块，否则整个列表会被当成一段朗读。
 */
const CONTAINER_DATA_TYPES = new Set([
  'NodeDocument', 'NodeList', 'NodeListItem', 'NodeBlockquote', 'NodeSuperBlock', 'NodeCallout',
])

/**
 * 按「最小文本块」提取段落：容器块逐层展开，只收集带文本的叶子块。
 *
 * 与旧实现（只取 wysiwyg 直接子块）的差别：一个列表过去整块算一段，
 * 现在列表里的每个列表项段落、嵌套列表项、引述里的每一段都各自成段，
 * 「每块朗读」与播放条进度都基于这个最小单位。
 */
export function collectLeafParagraphs(root: ParentNode): ParagraphInfo[] {
  const result: ParagraphInfo[] = []

  const visitChildren = (parent: Element): void => {
    for (const child of Array.from(parent.children)) {
      if (!(child instanceof HTMLElement)) continue
      const nodeId = child.getAttribute('data-node-id')
      const dataType = child.getAttribute('data-type') || ''

      if (!nodeId) {
        // 非块级包装层（.protyle-attr 等）：继续向下找
        visitChildren(child)
        continue
      }
      if (SKIP_DATA_TYPES.has(dataType)) continue

      if (CONTAINER_DATA_TYPES.has(dataType)) {
        const before = result.length
        visitChildren(child)
        // 兜底：容器里没有叶子块但自身有文本（未知结构），整体作为一段
        if (result.length === before) {
          const text = (child.textContent || '').trim()
          if (text) result.push({ element: child, text, nodeId: nodeId || undefined })
        }
        continue
      }

      const text = (child.textContent || '').trim()
      if (text) result.push({ element: child, text, nodeId: nodeId || undefined })
    }
  }

  if (root instanceof Element) visitChildren(root)
  return result
}

/**
 * 解析段落在当前 DOM 中的元素。
 * 切换文档 / 手机端编辑器重渲染后，旧 `element` 引用会脱离文档（isConnected=false），
 * 此时用 data-node-id 重新查询，并回填到 info.element，后续高亮与滚动就能正常工作。
 */
export function resolveParagraphElement(info: ParagraphInfo | null | undefined): HTMLElement | null {
  if (!info) return null
  const current = info.element
  // 优先已连接且可见的元素（多页签时隐藏的旧 DOM 不算可用）
  if (current?.isConnected && current.getClientRects().length > 0) {
    if (!info.nodeId) info.nodeId = current.getAttribute('data-node-id') || undefined
    return current
  }
  const nodeId = info.nodeId || current?.getAttribute?.('data-node-id') || ''
  if (!nodeId) return current?.isConnected ? current : null
  const found = document.querySelector<HTMLElement>(`[data-node-id="${nodeId}"]`)
  if (found) {
    info.element = found
    info.nodeId = nodeId
    return found
  }
  // 兜底：元素仍连接就用旧的（页签被隐藏但 DOM 还在，高亮至少能保留）
  return current?.isConnected ? current : null
}

// ─── 高亮样式 ────────────────────────────────────────────
const HIGHLIGHT_CLASS = 'tts-current-paragraph'
let injectedStyleEl: HTMLStyleElement | null = null

function injectHighlightStyle(): void {
  if (injectedStyleEl) return
  injectedStyleEl = document.createElement('style')
  injectedStyleEl.id = 'tts-highlight-style'
  injectedStyleEl.textContent = `
    .${HIGHLIGHT_CLASS} {
      background: linear-gradient(to bottom, rgba(255,243,185,0.55), rgba(255,230,130,0.35)) !important;
      border-radius: 6px;
      box-shadow: 0 0 0 1px rgba(255,210,80,0.08);
      transition: background 0.3s ease;
    }
    html[data-theme-mode="dark"] .${HIGHLIGHT_CLASS} {
      background: rgba(255,255,255,0.07) !important;
      border-left: 3px solid rgba(255,255,255,0.18) !important;
      border-radius: 4px;
      box-shadow: inset 0 0 12px rgba(255,255,255,0.03);
    }
  `
  document.head.appendChild(injectedStyleEl)
}

function removeHighlightStyle(): void {
  if (injectedStyleEl) {
    injectedStyleEl.remove()
    injectedStyleEl = null
  }
}

// ─── 引擎 ────────────────────────────────────────────────

export class TTSEngine {
  private synth: SpeechSynthesis | null = null
  private paragraphs: ParagraphInfo[] = []
  private currentIndex = -1
  private state: TTSState = 'idle'
  private options: TTSOptions = { rate: 1.0, pitch: 1.0, volume: 1.0 }
  private endParagraphIndex = -1
  /** 朗读起始边界（倒序时是下限，正序时是 0） */
  private startParagraphIndex = 0
  /** 朗读顺序：forward 从前往后 / backward 从后往前 */
  private _direction: 'forward' | 'backward' = 'forward'
  /** 朗读所属文档 id（切文档后用于切回） */
  private _readingRootId = ''

  // ★ 防止 SpeechSynthesisUtterance 被 GC 回收（经典 bug：局部变量 utterance 被回收后朗读立即停止）
  private currentUtterance: SpeechSynthesisUtterance | null = null

  // Chrome 保活定时器
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null

  // 重复朗读：当前块剩余次数（1 = 不重复，每次读完一遍减 1）
  private _repeatRemaining = 1
  // 每块朗读次数默认值（来自朗读设置，开始播放时读取）
  private _defaultRepeat = 1

  // 外部状态回调
  onStateChange?: (state: TTSState, index: number, total: number) => void
  onFinish?: () => void

  constructor() {
    if (typeof speechSynthesis !== 'undefined') {
      this.synth = speechSynthesis
    }
  }

  /** 检测 speechSynthesis 对象是否存在 */
  get isAvailable(): boolean {
    return this.synth !== null
  }

  /**
   * 深度检测：speechSynthesis 是否真正可用
   * Android WebView 中对象存在但 speak() 无声，通过检测可用语音来判断
   */
  get isFunctional(): boolean {
    if (!this.synth) return false
    // 尝试获取语音列表，如果为空则大概率不可用
    const voices = this.synth.getVoices()
    if (voices.length > 0) return true
    // 某些浏览器语音异步加载，对象存在且有 pendingQueuedUtterance 能力也算可用
    return typeof this.synth.speak === 'function'
  }

  /**
   * 获取不可用原因的描述文字
   */
  get unavailableReason(): string {
    if (!this.synth) {
      return t('tts.speechSynthesisUnavailable', undefined, '当前环境不支持 speechSynthesis API')
    }
    if (this.synth.getVoices().length === 0) {
      return t('tts.webViewVoiceUnavailable', undefined, '当前 WebView 未提供任何语音引擎，Android WebView 通常不支持语音合成')
    }
    return ''
  }

  // ─── 段落提取 ──────────────────────────────────────

  extractParagraphs(): number {
    this.paragraphs = []
    const protyle = this.getProtyleElement()

    if (protyle) {
      // ① DOM 提取（桌面端 / 手机端 protyle 可达时）
      // 注意：必须排除文档标题内的 .protyle-wysiwyg（思源 3.8.10+），否则只会读到标题
      const wysiwyg = findBodyWysiwyg(protyle)
      if (wysiwyg) {
        // 按最小文本块提取：列表/引述/超级块逐层展开到叶子块
        this.paragraphs = collectLeafParagraphs(wysiwyg)
        if (this.paragraphs.length > 0) return this.paragraphs.length
      }
    }

    // ② API 降级：通过 /api/filetree/getDoc 获取文档 HTML，解析纯文本
    //    手机端 WebView DOM 不可达时走此路径（参考 siyuan-sireader）
    const docId = getCurrentDocId()
    if (docId) {
      this._docId = docId
      // 同步 XHR 获取文档内容（extractParagraphs 需同步返回）
      try {
        const resp = syncGetDoc(docId)
        if (resp) {
          const div = document.createElement('div')
          div.innerHTML = resp
          // 移除不需要的块类型
          div.querySelectorAll('pre, [data-type="NodeCodeBlock"], [data-type="NodeMathBlock"], [data-type="NodeHTMLBlock"]').forEach(e => e.remove())
          // 与 DOM 路径一致：展开容器块，按最小文本块提取
          this.paragraphs = collectLeafParagraphs(div)
        }
      } catch { /* ignore */ }
    }

    return this.paragraphs.length
  }

  getParagraphs(): ParagraphInfo[] {
    return this.paragraphs
  }

  // ─── 播放控制 ─────────────────────────────────────

  speak(options: TTSOptions): boolean {
    if (!this.synth) {
      logger.warn('[TTS] speechSynthesis not available')
      return false
    }

    // 取消之前的朗读
    this.synth.cancel()
    this.clearHighlight()
    this.stopKeepalive()

    this.options = {
      rate: Math.max(0.5, Math.min(2.0, options.rate)),
      pitch: Math.max(0.1, Math.min(2.0, options.pitch ?? 1.0)),
      volume: Math.max(0, Math.min(1.0, options.volume ?? 1.0)),
    }
    if (options.voiceName) this.options.voiceName = options.voiceName

    const last = this.paragraphs.length - 1
    const start = Math.max(0, Math.min(options.startParagraph ?? 0, last))
    this.endParagraphIndex = Math.max(start, Math.min(options.endParagraph ?? last, last))
    this.startParagraphIndex = start
    // 每次开始播放都重新读取设置
    this._defaultRepeat = getRepeatCountSetting()
    this._repeatRemaining = this._defaultRepeat
    this._direction = getReadDirectionSetting()
    this._readingRootId = getCurrentDocId()

    if (this.paragraphs.length === 0) return false

    injectHighlightStyle()
    // 倒序从范围的末尾开始读
    this.currentIndex = this._direction === 'backward' ? this.endParagraphIndex : start
    this.state = 'playing'
    this.startKeepalive()
    this.speakParagraph(this.currentIndex)
    this.notifyStateChange()
    return true
  }

  pause(): void {
    if (this.state !== 'playing' || !this.synth) return
    this.synth.pause()
    this.state = 'paused'
    this.notifyStateChange()
  }

  resume(): void {
    if (this.state !== 'paused' || !this.synth) return
    this.synth.resume()
    this.state = 'playing'
    // 期间可能切过文档导致高亮元素失效：恢复播放时重新高亮并滚到当前块
    this.refreshCurrentHighlight()
    this.notifyStateChange()
  }

  /** 重新高亮当前块（元素可能因切文档被重建） */
  private refreshCurrentHighlight(): void {
    const para = this.paragraphs[this.currentIndex]
    if (!para) return
    const el = resolveParagraphElement(para)
    if (el) this.applyHighlight(el)
  }

  stop(): void {
    if (this.synth) {
      this.synth.cancel()
    }
    this.currentUtterance = null  // 清除引用
    this.clearHighlight()
    this.stopKeepalive()
    this._repeatRemaining = 1
    this.state = 'idle'
    this.currentIndex = -1
    this.notifyStateChange()
  }

  async jumpToParagraph(index: number): Promise<void> {
    if (index < 0 || index >= this.paragraphs.length) return
    if (!this.synth) return

    // 手动跳到别的块：重复次数回到「每块朗读次数」默认值
    this._repeatRemaining = this._defaultRepeat
    this.synth.cancel()
    this.clearHighlight()
    // 切文档 / 编辑器重渲染后旧元素已失效：先确保目标块在当前 DOM 中（必要时切回朗读文档）
    await ensureTtsParagraphVisible(this.paragraphs[index], this._readingRootId)
    this.currentIndex = index
    this.state = 'playing'
    this.startKeepalive()
    this.speakParagraph(index)
    this.notifyStateChange()
  }

  /** 步进方向：倒序朗读时「下一段」= 文档中更靠前的块 */
  private directionStep(): number {
    return this._direction === 'backward' ? -1 : 1
  }

  nextParagraph(): void {
    const next = this.currentIndex + this.directionStep()
    if (this.currentIndex >= 0 && next >= 0 && next < this.paragraphs.length) {
      void this.jumpToParagraph(next)
    }
  }

  prevParagraph(): void {
    const prev = this.currentIndex - this.directionStep()
    if (this.currentIndex >= 0 && prev >= 0 && prev < this.paragraphs.length) {
      void this.jumpToParagraph(prev)
    }
  }

  // ─── 重复朗读 ─────────────────────────────────────

  get repeatRemaining(): number { return this._repeatRemaining }

  setRepeatCount(count: number): void {
    this._repeatRemaining = clampRepeatCount(count)
    this.notifyStateChange()
  }

  /**
   * 当前块读完一遍后调用：
   * 剩余次数 > 1 → 减 1 并返回 true（调用方重读本块）；否则重置为 1 并返回 false（调用方进入下一块）。
   */
  private consumeRepeatForCurrentBlock(): boolean {
    if (this._repeatRemaining > 1) {
      this._repeatRemaining--
      return true
    }
    // 下一块回到「每块朗读次数」默认值
    this._repeatRemaining = this._defaultRepeat
    return false
  }

  // ─── 状态查询 ─────────────────────────────────────

  get isPlaying(): boolean { return this.state === 'playing' }
  get isPaused(): boolean { return this.state === 'paused' }
  get isIdle(): boolean { return this.state === 'idle' }
  get currentParagraphIndex(): number { return this.currentIndex }
  get totalParagraphs(): number { return this.paragraphs.length }
  get currentState(): TTSState { return this.state }

  // ─── 语音列表 ─────────────────────────────────────

  getVoices(lang?: string): SpeechSynthesisVoice[] {
    if (!this.synth) return []
    let voices = this.synth.getVoices()
    if (lang) {
      voices = voices.filter(v => v.lang.startsWith(lang))
    }
    return voices
  }

  // ─── 清理 ─────────────────────────────────────────

  cleanup(): void {
    this.stop()
    this.paragraphs = []
    removeHighlightStyle()
  }

  /** 朗读一段文字，完成后回调（不改变当前段落索引和高亮） */
  speakOnce(text: string, onDone?: () => void): void {
    if (!this.synth) { onDone?.(); return }
    this.synth.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    this.currentUtterance = utterance
    utterance.rate = this.options?.rate ?? 1.0
    utterance.pitch = this.options?.pitch ?? 1.0
    utterance.volume = this.options?.volume ?? 1.0
    utterance.lang = 'zh-CN'
    const allVoices = this.synth.getVoices()
    if (this.options?.voiceName) {
      const voice = allVoices.find(v => v.name === this.options.voiceName)
      if (voice) utterance.voice = voice
    } else {
      const zhVoice = allVoices.find(v => v.lang.startsWith('zh'))
      if (zhVoice) utterance.voice = zhVoice
    }
    utterance.onend = () => onDone?.()
    utterance.onerror = () => onDone?.()
    this.synth.speak(utterance)
  }

  // ─── 内部方法 ─────────────────────────────────────

  private speakParagraph(index: number): void {
    // 正序：越过结束边界即完成；倒序：越过起始边界即完成
    const outOfRange = this._direction === 'backward'
      ? index < this.startParagraphIndex || index >= this.paragraphs.length
      : index > this.endParagraphIndex || index >= this.paragraphs.length
    if (outOfRange) {
      this.clearHighlight()
      this.stopKeepalive()
      this.state = 'idle'
      this.currentIndex = -1
      this.notifyStateChange()
      this.onFinish?.()
      return
    }

    const para = this.paragraphs[index]
    this.currentIndex = index
    // 切文档后旧元素可能已脱离 DOM：按 node-id 重新解析
    this.applyHighlight(resolveParagraphElement(para))

    // ★ 将 utterance 存到实例变量，防止被 GC 回收导致朗读停止
    const utterance = new SpeechSynthesisUtterance(para.text)
    this.currentUtterance = utterance

    utterance.rate = this.options.rate
    utterance.pitch = this.options.pitch
    utterance.volume = this.options.volume
    utterance.lang = 'zh-CN'

    const allVoices = this.synth!.getVoices()
    if (this.options.voiceName) {
      const voice = allVoices.find(v => v.name === this.options.voiceName)
      if (voice) utterance.voice = voice
    } else {
      const zhVoice = allVoices.find(v => v.lang.startsWith('zh'))
      if (zhVoice) utterance.voice = zhVoice
    }

    utterance.onend = () => {
      // ★ 段落间加 100ms 延迟，让 Chrome 引擎重置，防止下一个 speak() 被吞掉
      setTimeout(() => {
        // 重复朗读：本块还有剩余次数时重读本块（状态已非播放说明被 stop/跳段打断，忽略）
        if (this.state === 'idle') return
        if (this.consumeRepeatForCurrentBlock()) {
          this.speakParagraph(index)
          return
        }
        this.speakParagraph(index + this.directionStep())
      }, 100)
    }

    utterance.onerror = (e) => {
      if (e.error === 'canceled') {
        // 用户主动调了 cancel()（stop / jumpToParagraph），不做任何事
        return
      }
      // interrupted / network / 其他错误：继续下一段
      // Chrome 15 秒 bug 会触发 'interrupted'，不能静默忽略
      if (this.state !== 'idle') {
        logger.warn('[TTS] utterance error:', e.error, '→ 继续下一段')
        // 出错跳段时回到默认次数，避免把当前块的次数带到下一个块
        this._repeatRemaining = this._defaultRepeat
        setTimeout(() => this.speakParagraph(index + this.directionStep()), 150)
      }
    }

    this.synth!.speak(utterance)
    this.notifyStateChange()
  }

  private applyHighlight(el: HTMLElement | null): void {
    if (!el) return
    this.clearHighlight()
    el.classList.add(HIGHLIGHT_CLASS)
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  private clearHighlight(): void {
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(el => {
      el.classList.remove(HIGHLIGHT_CLASS)
    })
  }

  private notifyStateChange(): void {
    this.onStateChange?.(this.state, this.currentIndex, this.paragraphs.length)
  }

  private startKeepalive(): void {
    this.stopKeepalive()
    this.keepaliveTimer = setInterval(() => {
      if (this.synth && this.state === 'playing') {
        this.synth.pause()
        this.synth.resume()
      }
    }, 5000)
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer)
      this.keepaliveTimer = null
    }
  }

  private getProtyleElement(): HTMLElement | null {
    // ① 优先从思源内部对象获取（手机端 window.siyuan.mobile.editor.protyle）
    const w = window as any
    const mobileProtyle = w.siyuan?.mobile?.editor?.protyle
    if (mobileProtyle?.element) return mobileProtyle.element as HTMLElement

    // ② DOM 查询：排除隐藏的 protyle
    const active = document.querySelector('.protyle:not(.fn__hidden):not(.fn__none)') as HTMLElement
    if (active) return active

    // ③ 兜底：找可见的 protyle
    const all = document.querySelectorAll('.protyle')
    for (const el of all) {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) return el as HTMLElement
    }
    return null
  }
}

/**
 * 取「正文」编辑器。
 * 思源 3.8.10 起文档标题也内嵌一个 .protyle-wysiwyg（位于 .protyle-title 内），
 * 且排在正文之前；直接 querySelector('.protyle-wysiwyg') 会拿到标题编辑器，
 * 表现为「只能读标题、正文读不出来」。
 */
function findBodyWysiwyg(root: ParentNode): HTMLElement | null {
  const list = root.querySelectorAll<HTMLElement>('.protyle-wysiwyg')
  for (const el of list) {
    if (el.closest('.protyle-title, .protyle-title__rich')) continue
    return el
  }
  return null
}

// ─── 文档 ID 获取 + API 内容获取（参考 siyuan-sireader）──────────

/**
 * 获取当前文档 ID
 * 策略同 siyuan-sireader：遍历多个选择器找 data-node-id
 */
export function getCurrentDocId(): string {
  // ① 手机端：直接从 protyle 实例拿
  const w = window as any
  const mobileProtyle = w.siyuan?.mobile?.editor?.protyle
  logger.log('[TTS-DEBUG] getCurrentDocId: siyuan.mobile.editor.protyle 存在?', !!mobileProtyle)
  if (mobileProtyle?.block?.rootID) {
    logger.log('[TTS-DEBUG] getCurrentDocId: 从 mobile protyle 拿到 rootID =', mobileProtyle.block.rootID)
    return mobileProtyle.block.rootID
  }
  logger.log('[TTS-DEBUG] getCurrentDocId: mobile protyle.block.rootID 不存在, block=', mobileProtyle?.block)

  // ② DOM 查询（参考 siyuan-sireader SP() 函数）
  const selectors = [
    '.layout__wnd--active .protyle-title',
    '.layout__wnd--active [data-node-id]',
    '.protyle:not(.fn__none) .protyle-title',
    '.protyle-title [data-node-id]',
  ]
  for (const sel of selectors) {
    const el = document.querySelector(sel)
    const id = (el as HTMLElement)?.dataset?.nodeId
    logger.log(`[TTS-DEBUG] getCurrentDocId: 选择器 "${sel}" → el=${!!el}, nodeId=${id || '(空)'}`)
    if (id) return id
  }

  // ③ 兜底：从 protyle-wysiwyg 找第一个块
  const firstBlock = document.querySelector('.protyle-wysiwyg [data-node-id]')
  const fallbackId = firstBlock ? (firstBlock as HTMLElement).dataset.nodeId || '' : ''
  logger.log('[TTS-DEBUG] getCurrentDocId: 兜底 protyle-wysiwyg [data-node-id] →', fallbackId || '(空)')
  return fallbackId
}

/**
 * 同步获取文档 HTML 内容（通过 /api/filetree/getDoc）
 */
export function syncGetDoc(docId: string): string | null {
  // 用 XMLHttpRequest 同步请求（extractParagraphs 需同步返回）
  const xhr = new XMLHttpRequest()
  xhr.open('POST', '/api/filetree/getDoc', false) // false = 同步
  xhr.setRequestHeader('Content-Type', 'application/json')
  xhr.send(JSON.stringify({ id: docId, mode: 0, size: 102400 }))
  if (xhr.status !== 200) return null
  try {
    const resp = JSON.parse(xhr.responseText)
    if (resp.code === 0 && resp.data?.content) {
      return resp.data.content.replace(/\{:[^}]+\}/g, '')
    }
  } catch { /* ignore */ }
  return null
}

// ─── 单例 ──────────────────────────────────────────────
let engineInstance: TTSEngine | null = null

export function getTTSEngine(): TTSEngine {
  if (!engineInstance) {
    engineInstance = new TTSEngine()
  }
  return engineInstance
}

/**
 * 获取当前文档标题
 * 手机端优先从 siyuan 内部对象获取，桌面端从 DOM 获取，降级走 API
 */
export function getCurrentDocTitle(): string {
  // ① 手机端：siyuan.mobile.editor.protyle.title
  const w = window as any
  const mobileProtyle = w.siyuan?.mobile?.editor?.protyle
  if (mobileProtyle) {
    const mobileTitle = mobileProtyle.title
    if (typeof mobileTitle === 'string' && mobileTitle.trim()) {
      return mobileTitle.replace(/\u200b/g, '').trim()
    }
    // 有些版本 title 在 element 上
    const titleEl = mobileProtyle.element?.querySelector('.protyle-title')
    if (titleEl) {
      const text = (titleEl.textContent || '').replace(/\u200b/g, '').trim()
      if (text) return text
    }
  }

  // ② 桌面端 / 通用：DOM 查询 .protyle-title
  const titleSelectors = [
    '.layout__wnd--active .protyle-title .protyle-wysiwyg',
    '.protyle:not(.fn__none) .protyle-title .protyle-wysiwyg',
    '.protyle-title [data-node-id]',
  ]
  for (const sel of titleSelectors) {
    const el = document.querySelector(sel)
    const text = el ? (el.textContent || '').replace(/\u200b/g, '').trim() : ''
    if (text) return text
  }

  // ③ 降级：API 获取（同步 XHR）
  const docId = getCurrentDocId()
  if (docId) {
    try {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/query/block', false)
      xhr.setRequestHeader('Content-Type', 'application/json')
      xhr.send(JSON.stringify({ id: docId }))
      if (xhr.status === 200) {
        const resp = JSON.parse(xhr.responseText)
        // 遍历返回的块，找标题块（type='d'）
        const blocks = resp?.data?.blocks || []
        for (const block of blocks) {
          if (block.type === 'd') {
            const content = (block.content || '').replace(/\u200b/g, '').trim()
            if (content) return content
          }
        }
        // 兜底：用第一个块的 content
        for (const block of blocks) {
          const content = (block.content || '').replace(/\u200b/g, '').trim()
          if (content) return content
        }
      }
    } catch { /* ignore */ }
  }

  return ''
}

export function destroyTTSEngine(): void {
  if (engineInstance) {
    engineInstance.cleanup()
    engineInstance = null
  }
}

// ─── 异步语音检测 ────────────────────────────────────────

/**
 * 异步等待语音列表加载（最多 timeout 毫秒）。
 * Chrome 首次调用 getVoices() 可能返回空数组，需等 voiceschanged 事件。
 */
export async function waitForVoices(timeout = 1000): Promise<boolean> {
  if (typeof speechSynthesis === 'undefined') return false
  if (speechSynthesis.getVoices().length > 0) return true
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(false), timeout)
    speechSynthesis.addEventListener('voiceschanged', () => {
      clearTimeout(timer)
      resolve(speechSynthesis.getVoices().length > 0)
    }, { once: true })
  })
}
