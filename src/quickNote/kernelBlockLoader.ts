import { Constants, Protyle, ProtyleMethod, fetchSyncPost } from 'siyuan'
import { updateBlock } from '../api'
import { isolateQuickNoteProtyleWs } from './protyleIsolate'
import { getLiveWysiwygTopBlocks, type QuickNoteRootState } from './popoverBlocks'
import { waitForProtyleTransactionsIdle } from './protyleUtil'

const FOREIGN_BLOCK_THRESHOLD = 12
const QNOTE_WYSIWYG_PADDING = '8px 12px 8px 16px'
const RESIZE_COMPACT_DELAY = Constants.TIMEOUT_TRANSITION + 120

/** 取消时加载整段草稿：bottom 保留根块到文末；top 保留到原第一个兄弟块之前 */
export interface DraftRangeLoadOptions {
  position: 'top' | 'bottom'
  boundaryId?: string | null
}

function findTopLevelForBlock(wysiwyg: HTMLElement, blockId: string): HTMLElement | null {
  const el = wysiwyg.querySelector(`[data-node-id="${blockId}"]`) as HTMLElement | null
  if (!el) return null
  let top: HTMLElement = el
  while (top.parentElement && top.parentElement !== wysiwyg) {
    top = top.parentElement as HTMLElement
  }
  return top
}

/**
 * 按草稿范围裁剪整篇文档。
 * 关键：rootBlockId 可能不是顶层块（例如转成列表后是 li/段落），
 * 必须先向上找到它所在的顶层块，否则会把整个列表裁掉，只剩第一项。
 * @returns 实际保留的顶层块 ID（找不到时为 null）
 */
function pruneDraftRange(
  wysiwyg: HTMLElement,
  rootBlockId: string,
  range: DraftRangeLoadOptions,
): string | null {
  const tops = getLiveWysiwygTopBlocks(wysiwyg)
  const rootTop = findTopLevelForBlock(wysiwyg, rootBlockId)
  if (!rootTop) {
    // 根块 ID 失效（例如被快捷语法转换）：宁可清空，也不要保留整篇文档，
    // 否则后续取消会把整篇文档的顶层块当草稿删掉。
    tops.forEach(el => el.remove())
    return null
  }

  const rootIndex = tops.indexOf(rootTop)
  const topId = rootTop.getAttribute('data-node-id') || rootBlockId
  let start = rootIndex
  let end = tops.length - 1
  if (range.position === 'bottom') {
    // 草稿原本追加在文末，所在顶层块之后新增的块都属于草稿
    start = rootIndex
  } else if (range.boundaryId) {
    // 草稿原本插在最前面，保留到原第一个兄弟块之前
    const boundaryIndex = tops.findIndex(el => el.getAttribute('data-node-id') === range.boundaryId)
    start = 0
    end = boundaryIndex >= 0 ? boundaryIndex - 1 : rootIndex
  } else {
    // top 且没有边界：只保留根块所在的顶层块
    end = rootIndex
  }

  tops.forEach((el, index) => {
    if (index < start || index > end) el.remove()
  })

  const kept = getLiveWysiwygTopBlocks(wysiwyg)
  kept.forEach((el, index) => {
    if (index === 0) {
      el.setAttribute('data-eof', '1')
    } else if (index === kept.length - 1) {
      el.setAttribute('data-eof', '2')
    } else {
      el.removeAttribute('data-eof')
    }
  })
  return topId
}

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

  // 注意：这里刻意**不**隐藏 .protyle-hint（标签候选 / 斜杠菜单面板）。
  // 思源 hint.fill() 靠摘掉 fn__none 自行显示面板，若这里给它加上 fn__none，
  // 下一次压缩布局（键盘收放触发的 resize、块结构变化）就会把正开着的候选按掉，
  // 表现为「打 # 候选一闪就没」。面板是 position:fixed，不占布局，不影响这里的尺寸压缩。
  p.element.querySelectorAll(
    '.protyle-preview, .protyle-upload, .protyle-gutters, .protyle-select, .protyle-toolbar, .protyle-util',
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

  ;(editor.protyle.options as typeof editor.protyle.options & { handleEmptyContent?: () => void }).handleEmptyContent = () => {
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
        // 仅当块数异常多（≥12）才认为是外部文档注入，需要干预
        // data-node-id 在编辑中可能被 Protyle 重新分配，不能用它判断是否"外来"
        const tops = getLiveWysiwygTopBlocks(wysiwyg)
        if (tops.length < FOREIGN_BLOCK_THRESHOLD) {
          clampQuickNoteContentScroll(editor)
          return
        }
        sealSingleBlockProtyle(editor, state.rootBlockId, state.docRootId, { pruneSiblings: false })
        const tops2 = getLiveWysiwygTopBlocks(wysiwyg)
        if (tops2.length >= FOREIGN_BLOCK_THRESHOLD) {
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
  range?: DraftRangeLoadOptions,
): Promise<boolean> {
  const wysiwygEl = editor.protyle.wysiwyg.element
  const wasLoaded = state.loadSettled
  state.loadSettled = false
  let blockId = state.rootBlockId
  if (wasLoaded) {
    // 用户把草稿转成列表/任务列表后，Protyle 会重新分配块 ID，state 里记录的旧 ID
    // 可能已被删除；弹窗里始终只有草稿，单顶层块时直接以它为准，避免 getDoc 取不到。
    const liveTops = getLiveWysiwygTopBlocks(wysiwygEl)
    if (liveTops.length === 1) {
      const liveId = liveTops[0].getAttribute('data-node-id')
      if (liveId && liveId !== blockId) {
        blockId = liveId
        state.rootBlockId = liveId
      }
    }
  }
  // top 插入且没拿到边界时无法判断草稿范围，退回只加载根块
  const useRange = !!range && (range.position === 'bottom' || !!range.boundaryId)
  // 范围加载必须从整篇文档拿：列表/任务列表/引用的容器（ul/li）在根块之外，
  // 只按块 ID 取会漏掉兄弟项。bottom 用 mode 4（从文末向上）避免大文档从头加载被 size 截断。
  const bottomRange = useRange && range!.position === 'bottom'
  const loadId = useRange ? (state.docRootId || blockId) : blockId
  const loadMode = bottomRange ? 4 : 0

  sealSingleBlockProtyle(editor, blockId, state.docRootId, { pruneSiblings: false })

  const requestDoc = async (id: string, mode: number): Promise<{ code: number; data?: Record<string, unknown>; msg?: string } | null> => {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await fetchSyncPost('/api/filetree/getDoc', {
          id,
          mode,
          size: Constants.SIZE_GET_MAX,
        })
        if (response?.code === 0) return response
        const msg = String(response?.msg ?? '')
        if (!msg.includes('tree not found') || attempt >= 3) return response
      } catch {
        if (attempt >= 3) return null
      }
      await new Promise((r) => window.setTimeout(r, 80 * (attempt + 1)))
    }
    return null
  }

  const getResponse = await requestDoc(loadId, loadMode)
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

  const p = editor.protyle
  p.notebookId = data.box
  p.path = data.path
  p.block.parentID = useRange ? state.docRootId : data.parentID
  p.block.parent2ID = useRange ? state.docRootId : data.parent2ID
  p.block.rootID = blockId
  p.block.id = blockId
  p.block.showAll = false
  p.block.mode = useRange ? 0 : data.mode
  p.block.blockCount = data.blockCount
  p.block.scroll = false

  wysiwygEl.style.visibility = 'hidden'
  wysiwygEl.innerHTML = data.content
  let effectiveRootId = blockId
  if (useRange) {
    const prunedRootId = pruneDraftRange(wysiwygEl, blockId, range!)
    if (prunedRootId) effectiveRootId = prunedRootId
  }
  state.rootBlockId = effectiveRootId
  p.block.rootID = effectiveRootId
  p.block.id = effectiveRootId
  const rootTop = findTopLevelForBlock(wysiwygEl, effectiveRootId)
  wysiwygEl.setAttribute('data-doc-type', rootTop?.getAttribute('data-type') || data.type)
  p.contentElement.classList.remove('fn__none')
  p.preview.element.classList.add('fn__none')
  p.disabled = false

  ProtyleMethod.highlightRender(wysiwygEl)
  ProtyleMethod.mathRender(wysiwygEl)
  ProtyleMethod.avRender(wysiwygEl, p)

  sealSingleBlockProtyle(editor, effectiveRootId, state.docRootId, { pruneSiblings: false })
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
