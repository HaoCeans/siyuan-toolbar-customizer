import { Constants, Protyle, ProtyleMethod, fetchSyncPost } from 'siyuan'
import { updateBlock } from '../api'
import { isolateQuickNoteProtyleWs } from './protyleIsolate'
import { getLiveWysiwygTopBlocks, type QuickNoteRootState } from './popoverBlocks'
import { waitForProtyleTransactionsIdle } from './protyleUtil'

const FOREIGN_BLOCK_THRESHOLD = 12
const QNOTE_WYSIWYG_PADDING = '8px 12px 8px 16px'
const RESIZE_COMPACT_DELAY = Constants.TIMEOUT_TRANSITION + 120

/** 防止 protyle-content 可滚区域超出 wysiwyg 实际内容高度 */
export function clampQuickNoteContentScroll(editor: Protyle): void {
  const contentEl = editor.protyle.contentElement
  const wysiwyg = editor.protyle.wysiwyg.element
  const style = window.getComputedStyle(wysiwyg)
  const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0)
  const maxTop = Math.max(0, wysiwyg.offsetHeight + padY - contentEl.clientHeight)
  if (contentEl.scrollTop > maxTop) {
    contentEl.scrollTop = maxTop
  }
}

/** 收紧弹窗 Protyle 布局，避免 resize/打字机模式留下大块底部空白 */
export function compactQuickNoteProtyleLayout(editor: Protyle): void {
  const p = editor.protyle
  p.options.typewriterMode = false

  const wysiwyg = p.wysiwyg.element
  wysiwyg.style.padding = QNOTE_WYSIWYG_PADDING
  wysiwyg.style.minHeight = '100%'
  wysiwyg.style.height = 'auto'
  wysiwyg.style.maxHeight = 'none'
  wysiwyg.style.boxSizing = 'border-box'

  const rootEl = p.element
  rootEl.style.flex = '1 1 0%'
  rootEl.style.minHeight = '0'
  rootEl.style.height = '100%'
  rootEl.style.maxHeight = '100%'
  rootEl.style.position = 'relative'
  rootEl.style.overflow = 'hidden'

  const contentEl = p.contentElement
  contentEl.style.position = 'absolute'
  contentEl.style.top = '0'
  contentEl.style.right = '0'
  contentEl.style.bottom = '0'
  contentEl.style.left = '0'
  contentEl.style.width = '100%'
  contentEl.style.flex = 'none'
  contentEl.style.minHeight = '0'
  contentEl.style.height = ''
  contentEl.style.maxHeight = ''
  contentEl.style.overflowX = 'hidden'
  contentEl.style.overflowY = 'auto'

  clampQuickNoteContentScroll(editor)

  p.element.querySelectorAll(
    '.protyle-preview, .protyle-upload, .protyle-gutters, .protyle-hint, .protyle-select, .protyle-toolbar, .protyle-util',
  ).forEach((el) => {
    el.classList.add('fn__none')
  })

  const tops = getLiveWysiwygTopBlocks(wysiwyg)
  tops.forEach((el, index) => {
    if (index === 0) {
      el.setAttribute('data-eof', '1')
    } else if (index === tops.length - 1) {
      el.setAttribute('data-eof', '2')
    } else {
      el.removeAttribute('data-eof')
    }
  })

  if (p.scroll) {
    p.scroll.lastScrollTop = -1
  }
}

export function patchQuickNoteProtyleResize(editor: Protyle): void {
  const origResize = editor.resize.bind(editor)
  editor.resize = () => {
    origResize()
    window.setTimeout(() => compactQuickNoteProtyleLayout(editor), RESIZE_COMPACT_DELAY)
  }
}

function isForeignDocumentInjection(wysiwyg: HTMLElement, rootBlockId: string): boolean {
  const top = getLiveWysiwygTopBlocks(wysiwyg)
  if (top.length >= FOREIGN_BLOCK_THRESHOLD) return true
  if (top.length <= 1) return false
  return !wysiwyg.querySelector(`div[data-node-id="${rootBlockId}"]`)
}

export function sealSingleBlockProtyle(
  editor: Protyle,
  rootBlockId: string,
  docRootId?: string,
  options?: { pruneSiblings?: boolean },
): void {
  const p = editor.protyle
  p.element.classList.add('block__edit')
  p.options.render.scroll = false
  p.block.showAll = false
  p.block.scroll = false
  p.block.rootID = rootBlockId
  p.block.id = rootBlockId
  if (docRootId && docRootId !== rootBlockId) {
    ;(p.block as { docRootID?: string }).docRootID = docRootId
  }
  if (p.scroll) {
    p.scroll.element.classList.add('fn__none')
    p.scroll.element.parentElement?.classList.add('fn__none')
    p.scroll.lastScrollTop = -1
  }

  if (options?.pruneSiblings === false) return

  const wysiwyg = p.wysiwyg.element
  const target = wysiwyg.querySelector(`div[data-node-id="${rootBlockId}"]`) as HTMLElement | null
  if (!target) return
  let topBlock: HTMLElement = target
  while (topBlock.parentElement && topBlock.parentElement !== wysiwyg) {
    topBlock = topBlock.parentElement as HTMLElement
  }
  for (const child of Array.from(wysiwyg.children)) {
    if (child !== topBlock) child.remove()
  }
  topBlock.setAttribute('data-eof', '2')
}

export function installKernelProtyleGuards(
  editor: Protyle,
  state: QuickNoteRootState,
  reloadBlock: () => Promise<boolean>,
  onEmptyContent?: () => void | Promise<void>,
): () => void {
  isolateQuickNoteProtyleWs(editor)

  let recovering = false
  // 防止 recoverIfEmpty 无限循环创建草稿块（每次恢复都新建块）
  const MAX_RECOVERY_ATTEMPTS = 2
  let recoveryAttempts = 0

  const recoverIfEmpty = () => {
    if (recovering || !state.loadSettled || state.isDestroying) return
    if (recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) return
    const tops = getLiveWysiwygTopBlocks(editor.protyle.wysiwyg.element)
    if (tops.length > 0) {
      // 内容已恢复，重置计数
      recoveryAttempts = 0
      return
    }
    recoveryAttempts++
    recovering = true
    void Promise.resolve(onEmptyContent?.() ?? reloadBlock())
      .finally(() => {
        recovering = false
      })
  }

  const origReload = editor.reload.bind(editor)
  editor.reload = () => {
    const tops = getLiveWysiwygTopBlocks(editor.protyle.wysiwyg.element)
    if (tops.length === 0) {
      recoverIfEmpty()
      return
    }
    void reloadBlock()
  }

  editor.protyle.options.handleEmptyContent = () => {
    recoverIfEmpty()
  }

  const contentEl = editor.protyle.contentElement
  const onScroll = () => clampQuickNoteContentScroll(editor)
  contentEl.addEventListener('scroll', onScroll, { passive: true })

  let debounceTimer: number | null = null
  let scheduled = false
  const observer = new MutationObserver(() => {
    if (!state.loadSettled) return
    compactQuickNoteProtyleLayout(editor)

    const tops = getLiveWysiwygTopBlocks(editor.protyle.wysiwyg.element)
    if (tops.length === 0) {
      recoverIfEmpty()
      return
    }

    if (debounceTimer !== null) window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null
      if (scheduled) return
      scheduled = true
      void (async () => {
        scheduled = false
        const wysiwyg = editor.protyle.wysiwyg.element
        if (!isForeignDocumentInjection(wysiwyg, state.rootBlockId)) {
          clampQuickNoteContentScroll(editor)
          return
        }
        sealSingleBlockProtyle(editor, state.rootBlockId, state.docRootId)
        if (isForeignDocumentInjection(wysiwyg, state.rootBlockId)) {
          await reloadBlock()
        }
      })()
    }, 300)
  })
  observer.observe(editor.protyle.wysiwyg.element, { childList: true, subtree: false })

  return () => {
    contentEl.removeEventListener('scroll', onScroll)
    observer.disconnect()
    editor.reload = origReload
  }
}

export async function loadSingleBlockIntoProtyle(
  editor: Protyle,
  state: QuickNoteRootState,
): Promise<boolean> {
  const blockId = state.rootBlockId
  const wysiwygEl = editor.protyle.wysiwyg.element
  state.loadSettled = false

  sealSingleBlockProtyle(editor, blockId, state.docRootId, { pruneSiblings: false })

  let getResponse: { code: number; data?: Record<string, unknown>; msg?: string } | null = null
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetchSyncPost('/api/filetree/getDoc', {
        id: blockId,
        mode: 0,
        size: Constants.SIZE_GET_MAX,
      })
      if (response?.code === 0) {
        getResponse = response
        break
      }
      const msg = String(response?.msg ?? '')
      if (!msg.includes('tree not found') || attempt >= 3) {
        getResponse = response
        break
      }
      await new Promise((r) => window.setTimeout(r, 80 * (attempt + 1)))
    }
  } catch {
    state.loadSettled = true
    return false
  }

  if (!getResponse || getResponse.code !== 0 || !getResponse.data) {
    state.loadSettled = true
    return false
  }

  const data = getResponse.data as {
    box: string
    path: string
    parentID: string
    parent2ID: string
    rootID: string
    mode: number
    blockCount: number
    type: string
    content: string
  }

  state.docRootId = data.rootID || state.docRootId
  state.rootBlockId = blockId

  const p = editor.protyle
  p.notebookId = data.box
  p.path = data.path
  p.block.parentID = data.parentID
  p.block.parent2ID = data.parent2ID
  p.block.rootID = blockId
  p.block.id = blockId
  p.block.showAll = false
  p.block.mode = data.mode
  p.block.blockCount = data.blockCount
  p.block.scroll = false
  p.wysiwyg.element.setAttribute('data-doc-type', data.type)

  wysiwygEl.style.visibility = 'hidden'
  wysiwygEl.innerHTML = data.content
  p.contentElement.classList.remove('fn__none')
  p.preview.element.classList.add('fn__none')
  p.disabled = false

  ProtyleMethod.highlightRender(wysiwygEl)
  ProtyleMethod.mathRender(wysiwygEl)
  ProtyleMethod.avRender(wysiwygEl, p)

  sealSingleBlockProtyle(editor, blockId, state.docRootId, { pruneSiblings: false })
  isolateQuickNoteProtyleWs(editor)

  compactQuickNoteProtyleLayout(editor)

  window.setTimeout(() => {
    wysiwygEl.style.visibility = ''
    editor.resize()
    compactQuickNoteProtyleLayout(editor)
  }, 0)

  state.loadSettled = true
  return true
}

export async function persistQuickNoteToKernel(
  editor: Protyle | null,
  state: QuickNoteRootState | null,
): Promise<boolean> {
  if (!editor || !state || !state.loadSettled) return false

  await waitForProtyleTransactionsIdle(800, 40)

  const tops = getLiveWysiwygTopBlocks(editor.protyle.wysiwyg.element)
  if (tops.length === 0) return false

  let allOk = true
  for (const el of tops) {
    const blockId = el.getAttribute('data-node-id')
    if (!blockId) {
      allOk = false
      continue
    }
    try {
      const result = await updateBlock('dom', el.outerHTML, blockId)
      if (!result?.length) allOk = false
    } catch {
      allOk = false
    }
  }

  const firstId = tops[0].getAttribute('data-node-id')
  if (firstId) state.rootBlockId = firstId

  return allOk
}
