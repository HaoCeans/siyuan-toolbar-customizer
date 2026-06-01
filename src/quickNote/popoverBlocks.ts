/**
 * 一键记事弹窗 Protyle 状态与 wysiwyg 顶层块工具
 * 与批注插件不同：允许 Enter 产生多个顶层块，保存时逐块写回内核，无需合并超级块。
 */
export interface QuickNoteRootState {
  rootBlockId: string
  docRootId: string
  loadSettled: boolean
}

export function createQuickNoteRootState(rootBlockId: string, docRootId?: string): QuickNoteRootState {
  return {
    rootBlockId,
    docRootId: docRootId || rootBlockId,
    loadSettled: false,
  }
}

export function getLiveWysiwygTopBlocks(wysiwyg: HTMLElement): HTMLElement[] {
  return Array.from(wysiwyg.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement
      && !!child.getAttribute('data-node-id')
      && !child.classList.contains('protyle-attr'),
  )
}
