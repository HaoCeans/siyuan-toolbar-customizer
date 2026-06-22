import { Constants, Protyle, ProtyleMethod } from 'siyuan'
import { pluginInstance } from '../toolbarManager'
import { createBlockInputHandle } from './blockInput'
import type { QuickNoteInputFormat } from './types'

export type QuickNoteContent =
  | { format: 'plain'; markdown: string }
  | { format: 'block'; dom: string }

export interface QuickNoteInputHandle {
  element: HTMLElement
  format: QuickNoteInputFormat
  getContent: () => Promise<QuickNoteContent | null>
  clearAfterSave: () => void | Promise<void>
  insertText: (text: string) => void
  focus: () => void
  destroy: () => void
  isPlainTextarea: () => boolean
  /** 块格式：persistToKernel 写回已插入的内核块 */
  saveToTarget?: () => Promise<boolean>
  /** 块格式：取消时删除未保存的草稿块 */
  cancelDraft?: () => Promise<void>
}

export interface QuickNoteSaveTarget {
  saveType: 'daily' | 'document'
  notebookId: string
  documentId?: string
  insertPosition: 'top' | 'bottom'
}

export interface QuickNoteInputAreaOptions {
  format: QuickNoteInputFormat
  isMobile: boolean
  isDark: boolean
  isAppleStyle?: boolean
  /** 电脑端 capture 等小尺寸弹窗 */
  compact?: boolean
  fontSize: number
  placeholder?: string
  /** 块格式：保存目标（用于预先 insertBlock + persistToKernel） */
  saveTarget?: QuickNoteSaveTarget
}

function buildPlainTextareaStyle(options: QuickNoteInputAreaOptions): string {
  const { isMobile, isDark, isAppleStyle, fontSize } = options
  if (isMobile && isAppleStyle) {
    return `
      flex: 1;
      padding: 12px 16px;
      border: none;
      background: ${isDark ? '#2a2a2a' : '#f2f2f7'};
      border-radius: 10px;
      color: ${isDark ? '#e0e0e0' : '#000'};
      font-size: ${fontSize}px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      resize: none;
      overflow-y: auto;
      overflow-x: hidden;
      word-wrap: break-word;
      line-height: 1.4;
      letter-spacing: -0.2px;
      -webkit-overflow-scrolling: touch;
    `
  }
  if (isMobile) {
    return `
      flex: 1;
      padding: 16px;
      border: 2px solid ${isDark ? '#404040' : '#e0e0e0'};
      border-radius: 8px;
      background: ${isDark ? '#2a2a2a' : 'white'};
      color: ${isDark ? '#e0e0e0' : '#333'};
      font-size: ${fontSize}px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      resize: none;
      overflow-y: auto;
      overflow-x: hidden;
      word-wrap: break-word;
      line-height: 1.5;
      -webkit-overflow-scrolling: touch;
    `
  }
  if (options.compact) {
    return `
      flex: 1;
      min-height: 48px;
      max-height: 88px;
      padding: 6px 8px;
      border: 1px solid ${isDark ? '#404040' : '#e0e0e0'};
      border-radius: 6px;
      background: ${isDark ? '#2a2a2a' : 'white'};
      color: ${isDark ? '#e0e0e0' : '#333'};
      font-size: ${fontSize}px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      resize: none;
      overflow-y: auto;
      overflow-x: hidden;
      word-wrap: break-word;
      line-height: 1.4;
    `
  }
  return `
    flex: 1;
    min-height: 300px;
    max-height: calc(80vh - 160px);
    padding: 16px;
    border: 2px solid ${isDark ? '#404040' : '#e0e0e0'};
    border-radius: 8px;
    background: ${isDark ? '#2a2a2a' : 'white'};
    color: ${isDark ? '#e0e0e0' : '#333'};
    font-size: ${fontSize}px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    resize: none;
    overflow-y: auto;
    overflow-x: hidden;
    word-wrap: break-word;
    line-height: 1.6;
  `
}

function createPlainInputHandle(options: QuickNoteInputAreaOptions): QuickNoteInputHandle {
  const wrapper = document.createElement('div')
  wrapper.className = 'toolbar-customizer-qnote-input toolbar-customizer-qnote-input--plain'
  wrapper.style.cssText = 'flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 32px;'

  const textarea = document.createElement('textarea')
  if (options.placeholder) textarea.placeholder = options.placeholder
  textarea.style.cssText = buildPlainTextareaStyle(options)

  if (!options.isMobile) {
    textarea.addEventListener('focus', () => {
      textarea.style.borderColor = options.isDark ? '#2E7BBF' : '#3b82f6'
    })
    textarea.addEventListener('blur', () => {
      textarea.style.borderColor = options.isDark ? '#404040' : '#e0e0e0'
    })
  }

  wrapper.appendChild(textarea)

  // 暴露 notebookId 供图片上传模块指定资源存入正确笔记本
  if (options.saveTarget?.notebookId) {
    wrapper.dataset.qnoteNotebookId = options.saveTarget.notebookId
  }

  return {
    element: wrapper,
    format: 'plain',
    isPlainTextarea: () => true,
    getContent: async () => {
      const markdown = textarea.value.trim()
      if (!markdown) return null
      return { format: 'plain', markdown }
    },
    clearAfterSave: () => {
      textarea.value = ''
    },
    insertText: (text: string) => {
      const startPos = textarea.selectionStart ?? textarea.value.length
      const endPos = textarea.selectionEnd ?? textarea.value.length
      textarea.value = textarea.value.substring(0, startPos) + text + textarea.value.substring(endPos)
      const newCursorPos = startPos + text.length
      textarea.setSelectionRange(newCursorPos, newCursorPos)
      textarea.focus()
    },
    focus: () => textarea.focus(),
    destroy: () => {
      wrapper.remove()
    },
  }
}

export async function createQuickNoteInputArea(
  options: QuickNoteInputAreaOptions,
): Promise<QuickNoteInputHandle> {
  if (options.format === 'block') {
    const app = pluginInstance?.app
    if (!app) {
      console.warn('[QuickNote] 无法获取 app，块格式回落纯文本')
      return createPlainInputHandle(options)
    }
    return createBlockInputHandle(app, options)
  }
  return createPlainInputHandle(options)
}

import { getActiveQuickNoteInput } from './session'

/** 供弹窗内模板按钮插入文本 */
export function insertTextIntoQuickNoteDialog(text: string): boolean {
  const handle = getActiveQuickNoteInput()
  if (handle) {
    handle.insertText(text)
    return true
  }

  const dialog = document.getElementById('quick-note-dialog') || document.getElementById('quick-note-dialog-desktop')
  if (!dialog) return false

  const textarea = dialog.querySelector('textarea')
  if (textarea instanceof HTMLTextAreaElement) {
    const startPos = textarea.selectionStart ?? textarea.value.length
    const endPos = textarea.selectionEnd ?? textarea.value.length
    textarea.value = textarea.value.substring(0, startPos) + text + textarea.value.substring(endPos)
    const newCursorPos = startPos + text.length
    textarea.setSelectionRange(newCursorPos, newCursorPos)
    textarea.focus()
    return true
  }

  const editEl = dialog.querySelector('.toolbar-customizer-qnote-protyle [contenteditable="true"]') as HTMLElement | null
  if (editEl) {
    editEl.focus()
    try {
      document.execCommand('insertText', false, text)
      return true
    } catch {
      return false
    }
  }
  return false
}

export { ProtyleMethod }
