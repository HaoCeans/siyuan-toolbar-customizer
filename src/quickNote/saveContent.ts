import { fetchSyncPost } from 'siyuan'
import type { QuickNoteContent } from './inputArea'
import { insertQuickNoteBlockAtPosition } from './kernelBlock'

export async function appendToSpecificDocument(
  documentId: string,
  content: string,
  insertPosition: 'top' | 'bottom',
  dataType: 'markdown' | 'dom' = 'markdown',
): Promise<boolean> {
  try {
    const payload = dataType === 'markdown' ? `${content}\n` : content
    const ops = await insertQuickNoteBlockAtPosition(documentId, insertPosition, dataType, payload)
    return !!(ops && ops.length > 0)
  } catch {
    return false
  }
}

export async function saveQuickNoteContent(
  payload: QuickNoteContent,
  options: {
    saveType: 'daily' | 'document'
    notebookId: string
    documentId?: string
    insertPosition: 'top' | 'bottom'
  },
): Promise<boolean> {
  if (payload.format === 'plain') {
    const content = payload.markdown.trim()
    if (!content) return false

    if (options.saveType === 'document' && options.documentId) {
      return appendToSpecificDocument(options.documentId, content, options.insertPosition, 'markdown')
    }

    // 使用 fetchSyncPost 让内核广播更新通知，主编辑器能立即看到新内容
    const result = await fetchSyncPost('/api/block/appendDailyNoteBlock', {
      data: `${content}\n`,
      dataType: 'markdown',
      notebook: options.notebookId || undefined,
    })
    return result.code === 0
  }

  const dom = payload.dom.trim()
  if (!dom) return false

  if (options.saveType === 'document' && options.documentId) {
    return appendToSpecificDocument(options.documentId, dom, options.insertPosition, 'dom')
  }

  // 使用 fetchSyncPost 让内核广播更新通知，主编辑器能立即看到新内容
  const result = await fetchSyncPost('/api/block/appendDailyNoteBlock', {
    data: dom,
    dataType: 'dom',
    notebook: options.notebookId || undefined,
  })
  return result.code === 0
}
