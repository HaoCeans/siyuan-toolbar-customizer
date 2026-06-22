/**
 * 一键记事 - 思源块格式输入（内核块 + getDoc + persistToKernel）
 * 弹窗打开前在目标文档插入空块；Enter 可产生多个顶层块，保存时逐块 updateBlock 写回。
 */

import { Protyle } from 'siyuan'
import type { QuickNoteInputAreaOptions, QuickNoteInputHandle } from './inputArea'
import { destroyQuickNoteProtyle } from './protyleIsolate'
import { createQuickNoteDraftBlock, deleteQuickNoteDraftBlock } from './kernelBlock'
import {
  installKernelProtyleGuards,
  loadSingleBlockIntoProtyle,
  patchQuickNoteProtyleResize,
  persistQuickNoteToKernel,
} from './kernelBlockLoader'
import {
  createQuickNoteRootState,
  getLiveWysiwygTopBlocks,
  type QuickNoteRootState,
} from './popoverBlocks'
import { waitForProtyleTransactionsIdle } from './protyleUtil'

function buildBlockWrapperStyle(isDark: boolean, isMobile: boolean, isAppleStyle?: boolean): string {
  const layout = `
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    max-height: 100%;
    overflow: hidden;
  `
  if (isMobile && isAppleStyle) {
    return `${layout}
      border: none;
      border-radius: 10px;
      background: ${isDark ? '#2a2a2a' : '#f2f2f7'};
    `
  }
  if (isMobile) {
    return `${layout}
      border: 2px solid ${isDark ? '#404040' : '#e0e0e0'};
      border-radius: 8px;
      background: ${isDark ? '#2a2a2a' : 'white'};
    `
  }
  return `${layout}
    border: 2px solid ${isDark ? '#404040' : '#e0e0e0'};
    border-radius: 8px;
    background: ${isDark ? '#2a2a2a' : 'white'};
  `
}

export const isBlockInputImplemented = true

/** 手机端思源 App WebView 中 contenteditable 无法通过 focus() 弹出键盘，需要用隐藏 input 唤起 */
function focusBlockEditable(wysiwygEl: HTMLElement, isMobile: boolean, callback?: () => void): void {
  const editEl = wysiwygEl.querySelector('[contenteditable="true"]') as HTMLElement | null
  if (!editEl) { callback?.(); return }
  if (isMobile) {
    // 检查 activeElement 是否在 protyle 编辑器内（可能在不同 block 上）
    if (wysiwygEl.contains(document.activeElement) && (document.activeElement as HTMLElement)?.isContentEditable) {
      callback?.()
      return
    }
    const fakeInput = document.createElement('input')
    fakeInput.dataset.tcFakeInput = 'true'
    fakeInput.style.cssText = 'position:fixed;left:-9999px;opacity:0;height:0;width:0;pointer-events:none'
    document.body.appendChild(fakeInput)
    fakeInput.focus()
    setTimeout(() => {
      if (!document.body.contains(editEl)) { fakeInput.remove(); return }
      editEl.focus()
      fakeInput.remove()
      callback?.()
    }, 50)
  } else {
    editEl.focus()
    callback?.()
  }
}

export function isBlockInputFormat(format: string | undefined): boolean {
  return format === 'block'
}

function hasWysiwygText(editor: Protyle): boolean {
  const wysiwyg = editor.protyle.wysiwyg.element
  // 文本内容（排除零宽空格）
  const text = (wysiwyg.textContent ?? '').replace(/\u200b/g, '').trim()
  if (text) return true
  // 图片元素（纯图片块也有内容）
  if (wysiwyg.querySelector('img, [data-type="img"]')) return true
  return false
}

async function resetDraftBlock(
  editor: Protyle,
  state: QuickNoteRootState,
  options: QuickNoteInputAreaOptions,
): Promise<boolean> {
  if (!options.saveTarget) return false
  // 记住旧块 ID，创建新块后删除旧块，避免留下空白块
  const oldBlockId = state.rootBlockId
  const newId = await createQuickNoteDraftBlock(options.saveTarget)
  if (!newId) return false
  if (oldBlockId && oldBlockId !== newId) {
    await deleteQuickNoteDraftBlock(oldBlockId)
  }
  state.rootBlockId = newId
  state.docRootId = newId
  const ok = await loadSingleBlockIntoProtyle(editor, state)
  if (ok) {
    focusBlockEditable(editor.protyle.wysiwyg.element, options.isMobile)
  }
  return ok
}

export async function createBlockInputHandle(
  app: unknown,
  options: QuickNoteInputAreaOptions,
): Promise<QuickNoteInputHandle> {
  const wrapper = document.createElement('div')
  wrapper.className = 'toolbar-customizer-qnote-input toolbar-customizer-qnote-input--block'
  wrapper.style.cssText = buildBlockWrapperStyle(options.isDark, options.isMobile, options.isAppleStyle)
  wrapper.style.setProperty('--qnote-protyle-font-size', `${options.fontSize}px`)

  const loadingEl = document.createElement('div')
  loadingEl.textContent = '正在准备块编辑器…'
  loadingEl.style.cssText = 'flex: 1; display: flex; align-items: center; justify-content: center; font-size: 13px; color: var(--b3-theme-on-surface-light);'
  wrapper.appendChild(loadingEl)

  if (!options.saveTarget) {
    loadingEl.textContent = '块格式：缺少保存目标配置'
    return buildFallbackHandle(wrapper, loadingEl)
  }

  const draftId = await createQuickNoteDraftBlock(options.saveTarget)
  if (!draftId) {
    loadingEl.textContent = '创建编辑块失败，请检查笔记本/文档配置'
    return buildFallbackHandle(wrapper, loadingEl)
  }

  // 持久化 draftId，用于插件重启时清理残留草稿块
  try { localStorage.setItem('__quickNoteDialogDraftBlockId', draftId) } catch { /* ignore */ }

  const state = createQuickNoteRootState(draftId)
  let savedToKernel = false

  const mountEl = document.createElement('div')
  mountEl.className = 'protyle toolbar-customizer-qnote-protyle'
  mountEl.id = `toolbar-customizer-qnote-protyle-${Date.now().toString(36)}`
  mountEl.style.cssText = 'position: relative; flex: 1 1 0%; min-height: 0; height: 100%; max-height: 100%; display: flex; flex-direction: column; overflow: hidden;'
  mountEl.style.display = 'none'

  const editor = new Protyle(app, mountEl, {
    blockId: '',
    action: [],
    render: {
      background: false,
      gutter: true,
      breadcrumb: false,
      breadcrumbDocName: false,
      title: false,
      scroll: false,
    },
    typewriterMode: false,
  })

  mountEl.querySelector('.fn__loading')?.classList.add('fn__none')

  patchQuickNoteProtyleResize(editor)

  const reloadBlock = () => loadSingleBlockIntoProtyle(editor, state)
  let removeGuards = installKernelProtyleGuards(
    editor,
    state,
    reloadBlock,
    () => resetDraftBlock(editor, state, options),
  )

  const loaded = await loadSingleBlockIntoProtyle(editor, state)
  loadingEl.remove()
  if (loaded) {
    mountEl.style.display = 'flex'
    wrapper.appendChild(mountEl)
    // 暴露 docRootId 供图片上传模块指定资源存入正确笔记本
    wrapper.dataset.qnoteDocRootId = state.docRootId
  } else {
    loadingEl.textContent = '加载编辑块失败'
    wrapper.appendChild(loadingEl)
    await deleteQuickNoteDraftBlock(draftId)
    return buildFallbackHandle(wrapper, loadingEl)
  }

  return {
    element: wrapper,
    format: 'block',
    isPlainTextarea: () => false,
    getContent: async () => {
      if (!hasWysiwygText(editor)) return null
      return { format: 'block', dom: '' }
    },
    saveToTarget: async () => {
      const ok = await persistQuickNoteToKernel(editor, state)
      if (ok) savedToKernel = true
      return ok
    },
    cancelDraft: async () => {
      if (savedToKernel) return
      // 标记正在销毁，阻止 recoverIfEmpty 创建新草稿块
      state.isDestroying = true
      await waitForProtyleTransactionsIdle(800, 40)
      // 额外等待，确保正在执行中的 resetDraftBlock 完成并更新 state.rootBlockId
      await new Promise<void>(r => setTimeout(r, 150))
      const tops = getLiveWysiwygTopBlocks(editor.protyle.wysiwyg.element)
      const ids = new Set<string>()
      for (const el of tops) {
        const id = el.getAttribute('data-node-id')
        if (id) ids.add(id)
      }
      if (state.rootBlockId) ids.add(state.rootBlockId)
      for (const id of ids) {
        await deleteQuickNoteDraftBlock(id)
      }
      try { localStorage.removeItem('__quickNoteDialogDraftBlockId') } catch { /* ignore */ }
    },
    clearAfterSave: async () => {
      // 保存后清空编辑器准备下一次输入：
      // 创建新的空草稿块并加载，但保留旧块（已保存内容）不删除。
      // 不能调用 resetDraftBlock（它会删除旧块导致已保存内容丢失）。
      if (!options.saveTarget) return
      const newId = await createQuickNoteDraftBlock(options.saveTarget)
      if (!newId) return
      state.rootBlockId = newId
      state.docRootId = newId
      const ok = await loadSingleBlockIntoProtyle(editor, state)
      if (ok) {
        savedToKernel = false
        focusBlockEditable(editor.protyle.wysiwyg.element, options.isMobile)
      }
    },
    insertText: (text: string) => {
      const wysiwyg = editor.protyle.wysiwyg.element
      if (!wysiwyg.querySelector('[contenteditable="true"]')) return
      // focusBlockEditable 在手机端会用隐藏 input 唤起键盘再延迟 50ms 聚焦 editEl，
      // 必须等聚焦完成后再 execCommand，否则 fakeInput 有焦点时插入文本会失败
      focusBlockEditable(wysiwyg, options.isMobile, () => {
        try {
          document.execCommand('insertText', false, text)
        } catch {
          // execCommand 不可用时，用 Selection API 降级
          const sel = window.getSelection()
          if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0)
            range.deleteContents()
            range.insertNode(document.createTextNode(text))
            range.collapse(false)
          }
        }
      })
    },
    focus: () => {
      focusBlockEditable(editor.protyle.wysiwyg.element, options.isMobile)
    },
    destroy: () => {
      removeGuards()
      destroyQuickNoteProtyle(editor)
      wrapper.remove()
      // 清理可能残留的 fake input
      document.querySelectorAll('[data-tc-fake-input]').forEach(el => el.remove())
    },
  }
}

function buildFallbackHandle(wrapper: HTMLElement, loadingEl: HTMLElement): QuickNoteInputHandle {
  return {
    element: wrapper,
    format: 'block',
    isPlainTextarea: () => false,
    getContent: async () => null,
    clearAfterSave: () => {},
    insertText: () => {},
    focus: () => {},
    destroy: () => wrapper.remove(),
  }
}

export function createBlockFormatSettingsPlaceholder(): HTMLElement {
  const container = document.createElement('div')
  container.dataset.quickNoteBlockSettings = 'true'
  container.style.cssText =
    'padding: 10px 12px; background: rgba(139, 92, 246, 0.08); border: 1px dashed rgba(139, 92, 246, 0.45); border-radius: 6px; font-size: 12px; color: var(--b3-theme-on-surface-light); line-height: 1.5;'
  container.innerHTML =
    '🧩 <strong style="color: #8b5cf6;">思源块格式</strong>：弹窗内直接编辑内核块，Enter 可多段落/列表，发送时逐块写入文档。'
  return container
}
