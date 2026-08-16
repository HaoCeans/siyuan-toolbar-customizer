/**
 * 一键记事 - 思源块格式输入（内核块 + getDoc + persistToKernel）
 * 弹窗打开前在目标文档插入空块；Enter 可产生多个顶层块，保存时逐块 updateBlock 写回。
 */

import { Protyle, getFrontend } from 'siyuan'
import type { QuickNoteInputAreaOptions, QuickNoteInputHandle } from './inputArea'
import { destroyQuickNoteProtyle } from './protyleIsolate'
import { createQuickNoteDraftBlock, deleteQuickNoteDraftBlock, blockExistsInKernel } from './kernelBlock'
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
import { insertMultiLineText } from '../utils/protyleEnter'

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

/**
 * 在块格式编辑器内插入纯文本（思源 v3.8 适配）。
 *
 * 背景：`document.execCommand('insertText')` 在编辑器内没有有效 selection 时会**静默返回 false**
 * （不抛异常，try/catch 捕获不到）。弹窗刚打开、尚未手动点击编辑器建立光标时，`editEl.focus()`
 * 只建立 DOM 焦点不建立光标，execCommand 无插入点而失败——表现为"点击模板按钮没反应"。
 *
 * 修复（借鉴思源官方 getEditorRange + focusByRange 的兜底模式）：
 * ① 优先恢复思源 focusout 时克隆保存到 protyle.toolbar.range 的选区（若仍在编辑区内）；
 * ② 否则手动构建 range 兜底到编辑区末尾（空草稿块即开头），removeAllRanges + addRange 建立光标。
 *
 * 注意：`container` 必须是**整个编辑器容器（wysiwyg）**，不能是第一个块的 contenteditable。
 * Protyle 每个块都有独立的 [contenteditable="true"]，若只校验第一块，光标在第二块及以后会被
 * 误判为"无有效选区"，模板被插到第一个块末尾（v3.8.0 回归，见 DEV_NOTES）。
 *
 * 多行文本（{{newline}} 等）：**不能把 `\n` 直接交给 execCommand('insertText')**——contenteditable
 * 会把换行当普通字符插入文本节点、渲染成空格，不会产生新块。逐行插入 + 行间派发合成 Enter
 * 的逻辑在 utils/protyleEnter.ts 的 insertMultiLineText（思源官方 enter() 换行链路，
 * 列表感知、事务落库、focusByWbr 设光标），连续换行时空行先塞 ZWSP 避免"退出列表"语义。
 *
 * execCommand 成功后由浏览器原生 beforeinput/input 触发思源 input() 完成渲染与落库，无需干预；
 * 仅当 execCommand 返回 false（浏览器禁用等极端情况）时手动插入文本节点并派发合成 input 事件
 * 通知思源——注意只有此时才派发，避免重复 input() 产生重复事务。
 */
export async function insertTextIntoBlockEditor(container: HTMLElement, text: string, savedRange?: Range | null): Promise<void> {
  let sel = window.getSelection()
  let range: Range | null = null

  // 现有选区在编辑容器内则直接使用
  const containsRange = (r: Range): boolean =>
    container.contains(r.startContainer) && container.contains(r.endContainer)

  if (sel && sel.rangeCount > 0) {
    const r = sel.getRangeAt(0)
    if (containsRange(r)) {
      range = r
    }
  }

  if (!range) {
    // ① 恢复失焦前思源克隆保存的选区（wysiwyg focusout 写入 protyle.toolbar.range）
    if (savedRange && containsRange(savedRange)) {
      range = savedRange
    } else {
      // ② 兜底：光标放到第一个块末尾（空草稿块即开头）
      const firstEditEl = container.querySelector('[contenteditable="true"]') as HTMLElement | null
      if (firstEditEl) {
        range = document.createRange()
        range.selectNodeContents(firstEditEl)
        range.collapse(false)
      }
    }
    if (range) {
      sel = window.getSelection()
      if (sel) {
        sel.removeAllRanges()
        sel.addRange(range)
      }
    }
  }

  if (!range) return  // 容器内没有任何 contenteditable，放弃插入

  // 多行（含 {{newline}}）逐行插入 + 合成 Enter 走思源官方换行链路
  const ok = await insertMultiLineText(container, text)
  if (ok) return

  // 极端兜底：execCommand 不可用，手动插入第一行文本并通知思源。
  // 若插入点在编辑区边界（块外），先落到最后一个顶层块末尾，避免产生裸文本节点。
  const firstLine = text.split('\n')[0]
  const curSel = window.getSelection()
  let r: Range | null = curSel && curSel.rangeCount > 0 ? curSel.getRangeAt(0) : range
  if (r) {
    const containerEl = r.startContainer.nodeType === Node.TEXT_NODE ? r.startContainer.parentElement : r.startContainer
    if (!(containerEl instanceof HTMLElement) || !containerEl.closest('[data-node-id]')) {
      const blocks = Array.from(container.querySelectorAll(':scope > [data-node-id]'))
      const last = blocks[blocks.length - 1] as HTMLElement | undefined
      if (last) {
        r = document.createRange()
        r.selectNodeContents(last)
        r.collapse(false)
      }
    }
    if (r && container.contains(r.startContainer)) {
      const s = window.getSelection()
      if (s) {
        s.removeAllRanges()
        s.addRange(r)
      }
      r.deleteContents()
      r.insertNode(document.createTextNode(firstLine))
      r.collapse(false)
      container.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: firstLine }))
    }
  }
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
      // 预检查：长时间挂后台后 draft block 可能已被内核清理
      if (!(await blockExistsInKernel(state.rootBlockId))) {
        const newId = await createQuickNoteDraftBlock(options.saveTarget!)
        if (newId) {
          // 用新块 ID 替换 Protyle DOM 中的旧 ID
          const tops = getLiveWysiwygTopBlocks(editor.protyle.wysiwyg.element)
          for (const el of tops) {
            el.setAttribute('data-node-id', newId)
          }
          state.rootBlockId = newId
          state.docRootId = newId
        }
      }
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
      if (!wysiwyg) return
      // focusBlockEditable 在手机端会用隐藏 input 唤起键盘再延迟 50ms 聚焦编辑区，
      // 必须等聚焦完成后再插入，否则 fakeInput 有焦点时插入文本会失败
      focusBlockEditable(wysiwyg, options.isMobile, () => {
        // 思源 v3.8：execCommand 无有效选区时静默失败（弹窗刚打开无光标时点击模板按钮没反应），
        // insertTextIntoBlockEditor 会先恢复/构建选区（见函数注释），再执行插入
        void insertTextIntoBlockEditor(wysiwyg, text, editor.protyle.toolbar?.range)
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
  // 400MB 独立窗口提示仅桌面端成立（电脑端块格式弹窗是独立 Electron 窗口）；
  // 手机端块格式是弹窗内嵌编辑器，不另开窗口，无此占用。
  const frontend = getFrontend()
  const isMobile = frontend === 'mobile' || frontend === 'browser-mobile'
  container.innerHTML =
    '🧩 <strong style="color: #8b5cf6;">思源块格式</strong>：弹窗内直接编辑内核块，Enter 可多段落/列表，发送时逐块写入文档。' +
    (isMobile
      ? '<br><span style="color: #999;">手机端块格式为弹窗内嵌编辑器，不另开独立窗口，无 400MB 级别的大额运存占用。与电脑端完全独立，请放心使用！</span>'
      : '<br>⚠️ <span style="color: #e67e22;">注意：块格式为了能够丝滑地打开和使用，会加载完整 Protyle 编辑器到独立窗口，预计额外占用约 400MB 运存。关窗后释放。</span>' +
        '<br><span style="color: #999;">仅在打开窗口时产生运存占用，关闭窗口即销毁，不持续占用。</span>')
  return container
}
