/**
 * 一键记事弹窗 — 图片插入模块
 * 
 * 统一入口：文件选择器上传、粘贴图片、在纯文本/块模式光标处插入。
 * 弹窗内点击图片按钮和 Ctrl+V 粘贴都走同一套逻辑。
 * 
 * 光标定位策略：用"物理锚点标记"——
 * 点击按钮/粘贴时在光标位置插入不可见标记，
 * 选完/上传完成后在标记位置**前面**逐个插入图片，最后移除标记。
 */

import { getActiveQuickNoteInput } from './session'
import type { QuickNoteInputHandle } from './inputArea'

// ==================== 上传 ====================

/**
 * 上传单张图片到思源资源库
 * @param file - 图片文件
 * @param docId - 可选，文档 ID 用于指定笔记本 assets 目录
 * @returns 资源路径，如 "assets/abc123-def456.jpg"
 */
export async function uploadImageFile(file: File, docId?: string): Promise<string> {
  const formData = new FormData()
  formData.append('file[]', file)
  // 传入 id 指定资源存入对应笔记本 data/{boxID}/assets/
  if (docId) {
    formData.append('id', docId)
  }

  // 原生 fetch，避免 fetchSyncPost 触发 processMessage UI 刷新
  const httpResponse = await fetch('/api/asset/upload', {
    method: 'POST',
    body: formData,
  })
  const response = await httpResponse.json()

  if (response.code !== 0) {
    throw new Error(response.msg || '上传失败')
  }

  const succMap = response.data?.succMap
  if (!succMap || Object.keys(succMap).length === 0) {
    throw new Error('上传失败：无返回路径')
  }

  const path = Object.values(succMap)[0] as string
  if (!path) {
    throw new Error('上传失败：路径为空')
  }

  return path
}

// ==================== 图片 DOM 构建 ====================

/**
 * Protyle 标准图片 DOM 结构。
 * Lute 通过 data-type="img" 识别为内置 textmark 图片标记，
 * BlockDOM2Tree 凭此正确解析。
 */
const PROTYLE_IMAGE_HTML = (url: string) =>
  `<span contenteditable="false" data-type="img" class="img">` +
    `<span>\u200b</span>` +
    `<span>` +
      `<span class="protyle-action protyle-icons">` +
        `<span class="protyle-icon protyle-icon--img">` +
          `<svg><use xlink:href="#iconImage"/></svg>` +
        `</span>` +
      `</span>` +
    `</span>` +
    `<img src="${url}" data-src="${url}"/>` +
  `</span>`

// ==================== 光标预存（mousedown/touchstart 阶段捕获） ====================

/** mousedown/touchstart 时保存的块模式光标快照，供 plantBlockAnchor 优先使用 */
let preSavedBlockRange: Range | null = null
let preSavedEditEl: HTMLElement | null = null

/**
 * 从 selection 找到其所在的 contenteditable 元素。
 * 因为 Protyle 每个块都有独立的 [contenteditable="true"]，
 * 不能用 querySelector（永远返回第一个），必须从选区向上查。
 */
function findEditElFromSelection(handleElement: HTMLElement): HTMLElement | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const container = sel.getRangeAt(0).commonAncestorContainer
  let node: Node | null = container
  while (node && node !== handleElement) {
    if (node instanceof HTMLElement && node.contentEditable === 'true') {
      return node
    }
    node = node.parentNode
  }
  return null
}

/** 从一个 DOM 节点向上查找它所在的 contenteditable */
function findEditElFromNode(handleElement: HTMLElement, node: Node): HTMLElement | null {
  let cur: Node | null = node
  while (cur && cur !== handleElement) {
    if (cur instanceof HTMLElement && cur.contentEditable === 'true') {
      return cur
    }
    cur = cur.parentNode
  }
  return null
}

/**
 * 在按钮 mousedown/touchstart 阶段调用，提前保存光标。
 * 此时编辑器尚未失焦，Selection 最可靠。
 */
export function preSaveBlockCursor(): void {
  const handle = getActiveQuickNoteInput()
  if (!handle || handle.isPlainTextarea()) return
  const editEl = findEditElFromSelection(handle.element)
  if (!editEl) return
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  if (!editEl.contains(range.commonAncestorContainer)) return
  preSavedBlockRange = range.cloneRange()
  preSavedEditEl = editEl
}

// ==================== 锚点标记 ====================

const TEXTAREA_ANCHOR = '\u200B__QN_IMG__\u200B'
const BLOCK_ANCHOR_ATTR = 'data-qnote-img-anchor'

/**
 * 在纯文本 textarea 当前光标位置插入不可见锚点字符串。
 * 若 textarea 已失焦且 selectionStart 疑似归零，退回到末尾插入。
 */
function plantTextareaAnchor(textarea: HTMLTextAreaElement): void {
  let start = textarea.selectionStart ?? textarea.value.length
  let end = textarea.selectionEnd ?? textarea.value.length

  // 移动端 WebView 失焦后 selectionStart 可能归零，检测并修正
  if (start === 0 && end === 0 && textarea.value.length > 0 && document.activeElement !== textarea) {
    start = textarea.value.length
    end = textarea.value.length
  }

  textarea.value =
    textarea.value.substring(0, start) +
    TEXTAREA_ANCHOR +
    textarea.value.substring(end)
}

/**
 * 在块模式编辑器光标位置插入不可见锚点 DOM 元素。
 * 返回锚点元素；失败返回 null。
 */
function plantBlockAnchor(handleElement: HTMLElement): HTMLElement | null {
  const sel = window.getSelection()
  let range: Range | null = null
  let editEl: HTMLElement | null = null

  // 优先使用 mousedown/touchstart 阶段预存的光标（此时尚未失焦，最可靠）
  if (preSavedBlockRange && preSavedEditEl) {
    range = preSavedBlockRange
    editEl = preSavedEditEl
    preSavedBlockRange = null
    preSavedEditEl = null
  }

  // 其次尝试当前 Selection（从选区向上找到正确的 contenteditable）
  if (!range) {
    editEl = findEditElFromSelection(handleElement)
    if (editEl && sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0)
      if (editEl.contains(r.commonAncestorContainer)) {
        range = r
      }
    }
  }

  if (!range || !editEl) {
    // 无有效选区 → 放到第一个块的开头（弹窗刚打开、无内容时默认插入到顶部）
    editEl = handleElement.querySelector<HTMLElement>('[contenteditable="true"]')
    if (!editEl) return null
    editEl.focus()
    const newSel = window.getSelection()
    if (!newSel) return null
    const newRange = document.createRange()
    newRange.selectNodeContents(editEl)
    newRange.collapse(true)  // true = 开头（顶部）
    newSel.removeAllRanges()
    newSel.addRange(newRange)
    range = newRange
  }

  const anchor = document.createElement('span')
  anchor.setAttribute(BLOCK_ANCHOR_ATTR, '1')
  anchor.style.cssText = 'display:inline;font-size:0;line-height:0'

  range.insertNode(anchor)

  return anchor
}

// ==================== 插入（基于锚点） ====================

/**
 * 在纯文本 textarea 的锚点**前面**插入单张图片 markdown。
 * 锚点保留在原位，供后续图片继续插入。
 */
function insertImageAtTextareaAnchor(textarea: HTMLTextAreaElement, assetPath: string): boolean {
  const idx = textarea.value.indexOf(TEXTAREA_ANCHOR)
  if (idx === -1) return false

  const md = `![](${assetPath})\n`
  textarea.value =
    textarea.value.substring(0, idx) +
    md +
    textarea.value.substring(idx)
  return true
}

/**
 * 在块模式编辑器的锚点位置一次性插入多张 Protyle 标准图片 DOM。
 * 所有图片作为连续 HTML 通过单次 execCommand 插入，解决：
 * 1. Protyle 内部光标在移动端失焦归零 → 先移除锚点再设 Selection
 * 2. 多张图片时锚点被第一张移除 → 全部拼接一次插入
 */
function insertImagesAtBlockAnchor(handleElement: HTMLElement, assetPaths: string[]): boolean {
  if (assetPaths.length === 0) return false

  const anchor = handleElement.querySelector<HTMLElement>(`[${BLOCK_ANCHOR_ATTR}]`)
  if (!anchor) return false

  // 从锚点向上找它所在的 contenteditable（不能用 querySelector，会找错块）
  const editEl = findEditElFromNode(handleElement, anchor)
  if (!editEl) return false

  // ① 在锚点位置创建光标 range
  const cursorRange = document.createRange()
  cursorRange.setStartBefore(anchor)
  cursorRange.collapse(true)

  // ② 移除锚点（光标位置只存在于 range 对象中）
  anchor.remove()

  // ③ 把光标 range 写入 DOM Selection
  editEl.focus()
  const sel = window.getSelection()
  if (!sel) return false
  sel.removeAllRanges()
  sel.addRange(cursorRange)

  // ④ 所有图片 HTML 拼接，一次 execCommand 全部插入
  const allHtml = assetPaths.map(p => PROTYLE_IMAGE_HTML(p)).join('')
  document.execCommand('insertHTML', false, allHtml)

  // ⑤ execCommand 后 Protyle 会自动聚焦编辑器导致键盘弹出，主动 blur 阻止
  editEl.blur()

  return true
}

// ==================== 最终化（清除锚点 + 光标定位） ====================

function finalizeTextareaInsertion(textarea: HTMLTextAreaElement): void {
  const idx = textarea.value.indexOf(TEXTAREA_ANCHOR)
  if (idx !== -1) {
    textarea.value =
      textarea.value.substring(0, idx) +
      textarea.value.substring(idx + TEXTAREA_ANCHOR.length)
    textarea.setSelectionRange(idx, idx)
  }
}

// ==================== 清除残留锚点 ====================

function clearTextareaAnchor(textarea: HTMLTextAreaElement): void {
  const idx = textarea.value.indexOf(TEXTAREA_ANCHOR)
  if (idx !== -1) {
    textarea.value =
      textarea.value.substring(0, idx) +
      textarea.value.substring(idx + TEXTAREA_ANCHOR.length)
  }
}

function clearBlockAnchor(handleElement: HTMLElement): void {
  const anchor = handleElement.querySelector<HTMLElement>(`[${BLOCK_ANCHOR_ATTR}]`)
  if (anchor) {
    anchor.remove()
  }
}

// ==================== 获取文档 ID（用于上传指定笔记本） ====================

/**
 * 从输入 handle 获取文档 ID，用于上传图片到正确的笔记本 assets 目录。
 * 块模式返回 docRootId，纯文本模式返回 notebookId（若有）。
 */
function getUploadDocId(handle: QuickNoteInputHandle): string | undefined {
  // 块模式：docRootId 存在 element.dataset.qnoteDocRootId
  if (!handle.isPlainTextarea()) {
    const docRootId = handle.element.dataset.qnoteDocRootId
    if (docRootId) return docRootId
  }
  // 纯文本模式：notebookId 存在 element.dataset.qnoteNotebookId
  return handle.element.dataset.qnoteNotebookId || undefined
}

// ==================== 文件选择器 ====================

/**
 * 打开文件选择器，上传选中图片并插入弹窗编辑器光标处。
 * 支持多选（multiple），不关闭弹窗。
 * @returns 是否成功插入至少一张图片
 */
export async function pickAndInsertImages(): Promise<boolean> {
  const handle = getActiveQuickNoteInput()
  if (!handle) return false

  const isPlain = handle.isPlainTextarea()
  const textarea = isPlain ? handle.element.querySelector('textarea') : null
  const docId = getUploadDocId(handle)

  // ⚠️ 打开文件选择器前插入物理锚点（失焦不会丢失锚点）
  if (isPlain) {
    if (!textarea) return false
    plantTextareaAnchor(textarea)
  } else {
    if (!plantBlockAnchor(handle.element)) return false
  }

  return new Promise<boolean>((resolve) => {
    // 标记激活，防止切后台时 handleVisibilityChange 误触发弹窗
    ;(window as any).__imagePickerActive = true

    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = 'image/*'
    fileInput.multiple = true
    fileInput.style.display = 'none'
    document.body.appendChild(fileInput)

    let settled = false

    const cleanup = () => {
      // 延迟清除标记：handleVisibilityChange 在文件选择器关闭后可能
      // 立即尝试恢复焦点 → 导致 blur() 后键盘被重新拉起。
      // 保持标记 true 的时长 > visibilitychange 触发窗口，使其直接 return。
      setTimeout(() => { ;(window as any).__imagePickerActive = false }, 500)
      try { document.body.removeChild(fileInput) } catch { /* ignore */ }
    }

    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      if (!ok) {
        if (isPlain && textarea) clearTextareaAnchor(textarea)
        else clearBlockAnchor(handle.element)
      }
      cleanup()
      resolve(ok)
    }

    fileInput.onchange = async () => {
      const files = fileInput.files
      if (!files || files.length === 0) {
        finish(false)
        return
      }

      try {
        if (isPlain && textarea) {
          // 纯文本模式：逐张插入 markdown（字符串操作，不涉及 Protyle 光标）
          let insertedCount = 0
          for (let i = 0; i < files.length; i++) {
            const path = await uploadImageFile(files[i], docId)
            if (insertImageAtTextareaAnchor(textarea, path)) insertedCount++
          }
          if (insertedCount > 0) {
            finalizeTextareaInsertion(textarea)
          } else {
            clearTextareaAnchor(textarea)
          }
          finish(insertedCount > 0)
        } else {
          // 块模式：先全部上传，再一次性拼接 execCommand 插入
          const paths: string[] = []
          for (let i = 0; i < files.length; i++) {
            paths.push(await uploadImageFile(files[i], docId))
          }
          const ok = insertImagesAtBlockAnchor(handle.element, paths)
          finish(ok)
        }
      } catch (err: any) {
        console.warn('[图片插入] 上传失败:', err)
        if (isPlain && textarea) clearTextareaAnchor(textarea)
        else clearBlockAnchor(handle.element)
        finish(false)
      }
    }

    // 取消选择（部分浏览器支持 cancel 事件）
    fileInput.addEventListener('cancel', () => finish(false), { once: true })

    // 兼容方案：窗口重新获得焦点时检测是否已取消
    const onWindowFocus = () => {
      window.removeEventListener('focus', onWindowFocus)
      setTimeout(() => {
        if (!settled && (!fileInput.files || fileInput.files.length === 0)) {
          finish(false)
        }
      }, 300)
    }
    window.addEventListener('focus', onWindowFocus)

    // 安全兜底：30 秒后自动清理
    setTimeout(() => {
      window.removeEventListener('focus', onWindowFocus)
      finish(false)
    }, 30000)

    fileInput.click()
  })
}

// ==================== 粘贴处理 ====================

/**
 * 处理粘贴事件中的图片。
 * 捕获阶段注册，stopImmediatePropagation 阻断 Protyle 原生 paste 监听器。
 * @returns true 表示已处理图片粘贴
 */
export async function handleImagePaste(e: ClipboardEvent): Promise<boolean> {
  const clipboardData = e.clipboardData
  if (!clipboardData) return false

  const files = clipboardData.files
  if (!files || files.length === 0) return false

  // 筛选图片文件
  const imageFiles: File[] = []
  for (let i = 0; i < files.length; i++) {
    if (files[i].type.startsWith('image/')) {
      imageFiles.push(files[i])
    }
  }

  if (imageFiles.length === 0) return false

  // 有图片 → 阻止默认粘贴 + 阻断 Protyle 原生监听器
  e.preventDefault()
  e.stopImmediatePropagation()

  const handle = getActiveQuickNoteInput()
  if (!handle) return false

  const isPlain = handle.isPlainTextarea()
  const textarea = isPlain ? handle.element.querySelector('textarea') : null
  const docId = getUploadDocId(handle)

  try {
    // 粘贴时插入锚点（此时选区仍有效）
    if (isPlain && textarea) {
      plantTextareaAnchor(textarea)
    } else {
      plantBlockAnchor(handle.element)
    }

    if (isPlain && textarea) {
      // 纯文本模式：逐张插入 markdown
      let insertedCount = 0
      for (const file of imageFiles) {
        const path = await uploadImageFile(file, docId)
        if (insertImageAtTextareaAnchor(textarea, path)) insertedCount++
      }
      if (insertedCount > 0) {
        finalizeTextareaInsertion(textarea)
      } else {
        clearTextareaAnchor(textarea)
      }
      return insertedCount > 0
    } else {
      // 块模式：全部上传后一次性拼接 execCommand 插入
      const paths: string[] = []
      for (const file of imageFiles) {
        paths.push(await uploadImageFile(file, docId))
      }
      const ok = insertImagesAtBlockAnchor(handle.element, paths)
      return ok
    }
  } catch (err: any) {
    console.warn('[图片粘贴] 失败:', err)
    if (isPlain && textarea) clearTextareaAnchor(textarea)
    else clearBlockAnchor(handle.element)
    return false
  }
}

/**
 * 在弹窗输入区域安装粘贴处理器。
 * 捕获阶段注册（addEventListener 第三个参数 true），早于 Protyle 执行。
 * 纯文本模式绑定到 textarea，块模式绑定到 handle.element（wrapper），
 * 确保光标在任意块中粘贴都能被拦截（而非仅第一个 contenteditable）。
 * @returns 清理函数（弹窗关闭时调用）
 */
export function installImagePasteHandler(handle: QuickNoteInputHandle): () => void {
  let targetEl: HTMLElement | null = null

  if (handle.isPlainTextarea()) {
    targetEl = handle.element.querySelector('textarea')
  } else {
    // 块模式：绑定到 wrapper 容器（捕获阶段拦截所有块的粘贴事件并阻断 Protyle）
    targetEl = handle.element
  }

  if (!targetEl) return () => {}

  const pasteHandler = (e: Event) => { void handleImagePaste(e as ClipboardEvent) }
  // 捕获阶段：早于 Protyle（在子节点 contenteditable 上）执行
  targetEl.addEventListener('paste', pasteHandler, true)

  return () => {
    targetEl?.removeEventListener('paste', pasteHandler, true)
  }
}
