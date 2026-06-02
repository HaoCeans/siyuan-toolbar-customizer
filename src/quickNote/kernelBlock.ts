import { fetchSyncPost } from 'siyuan'
import { appendBlock, deleteBlock, getChildBlocks, insertBlock, prependBlock, sql } from '../api'

export interface QuickNoteSaveTarget {
  saveType: 'daily' | 'document'
  notebookId: string
  documentId?: string
  insertPosition: 'top' | 'bottom'
}

/** 内核 blocks 表是否仍有该 ID（取消删 draft 前先查，避免「找不到块」弹错） */
export async function blockExistsInKernel(blockId: string): Promise<boolean> {
  if (!blockId) return false
  try {
    const rows = await sql(`SELECT id FROM blocks WHERE id = '${blockId}'`)
    return Array.isArray(rows) && rows.length > 0
  } catch {
    return false
  }
}

/** 静默 deleteBlock：不用 fetchSyncPost，避免块已不存在时触发思源全局错误弹窗 */
async function deleteBlockSilent(blockId: string): Promise<boolean> {
  try {
    const resp = await fetch('/api/block/deleteBlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: blockId }),
    })
    const result = await resp.json()
    return result?.code === 0
  } catch {
    return false
  }
}

function extractBlockIdFromTransactions(data: unknown): string | null {
  if (!Array.isArray(data)) return null
  for (const tx of data) {
    const ops = (tx as { doOperations?: Array<{ id?: string }> })?.doOperations
    if (!Array.isArray(ops)) continue
    for (const op of ops) {
      if (op?.id) return op.id
    }
  }
  return null
}

function extractBlockIdFromOps(ops: unknown): string | null {
  return extractBlockIdFromTransactions(ops)
}

async function getOrderedChildBlockIds(parentId: string): Promise<string[]> {
  try {
    const children = await getChildBlocks(parentId)
    if (Array.isArray(children) && children.length > 0) {
      return children.map(item => item.id).filter(Boolean)
    }
  } catch {
    // fallback to sql
  }

  try {
    const rows = await sql(
      `SELECT id FROM blocks WHERE parent_id = '${parentId}' AND type != 'd' ORDER BY sort ASC`,
    )
    return (rows ?? []).map((row: { id: string }) => row.id).filter(Boolean)
  } catch {
    return []
  }
}

async function resolveDailyNoteDocumentId(notebookId: string): Promise<string | null> {
  if (!notebookId) return null
  try {
    const response: any = await fetchSyncPost('/api/filetree/createDailyNote', { notebook: notebookId })
    if (response?.code === 0 && response?.data?.id) {
      return response.data.id
    }
  } catch {
    // ignore
  }
  return null
}

/** 在文档顶层按配置位置插入块（显式 previousID/nextID，避免删光块后 append 落到顶部） */
export async function insertQuickNoteBlockAtPosition(
  parentId: string,
  position: 'top' | 'bottom',
  dataType: 'markdown' | 'dom',
  data: string,
): Promise<IResdoOperations[] | null> {
  const payload = dataType === 'markdown'
    ? (data ? (data.endsWith('\n') ? data : `${data}\n`) : '\n')
    : data
  const childIds = await getOrderedChildBlockIds(parentId)

  if (position === 'top') {
    if (childIds.length > 0) {
      return insertBlock(dataType, payload, childIds[0], undefined, parentId)
    }
    return prependBlock(dataType, payload, parentId)
  }

  if (childIds.length > 0) {
    return insertBlock(dataType, payload, undefined, childIds[childIds.length - 1], parentId)
  }
  return appendBlock(dataType, payload, parentId)
}

async function insertDraftBlockLegacy(target: QuickNoteSaveTarget): Promise<string | null> {
  if (target.saveType === 'document' && target.documentId) {
    const ops = target.insertPosition === 'top'
      ? await prependBlock('markdown', '\n', target.documentId)
      : await appendBlock('markdown', '\n', target.documentId)
    return extractBlockIdFromOps(ops)
  }

  const endpoint = target.insertPosition === 'top'
    ? '/api/block/prependDailyNoteBlock'
    : '/api/block/appendDailyNoteBlock'
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: '',
      dataType: 'markdown',
      notebook: target.notebookId || undefined,
    }),
  })
  const result = await response.json()
  if (result.code !== 0) return null
  return extractBlockIdFromTransactions(result.data)
}

/** 在目标位置插入空块，供弹窗 Protyle 加载编辑（与批注插件 insertBlock 同理） */
export async function createQuickNoteDraftBlock(target: QuickNoteSaveTarget): Promise<string | null> {
  try {
    if (target.saveType === 'document' && target.documentId) {
      const ops = await insertQuickNoteBlockAtPosition(
        target.documentId,
        target.insertPosition,
        'markdown',
        '',
      )
      const blockId = extractBlockIdFromOps(ops)
      if (blockId) return blockId
      return insertDraftBlockLegacy(target)
    }

    if (target.notebookId) {
      const dailyDocId = await resolveDailyNoteDocumentId(target.notebookId)
      if (dailyDocId) {
        const ops = await insertQuickNoteBlockAtPosition(
          dailyDocId,
          target.insertPosition,
          'markdown',
          '',
        )
        const blockId = extractBlockIdFromOps(ops)
        if (blockId) return blockId
      }
    }

    return insertDraftBlockLegacy(target)
  } catch (err) {
    console.error('[QuickNote] createQuickNoteDraftBlock failed:', err)
    return null
  }
}

export async function deleteQuickNoteDraftBlock(blockId: string | null | undefined): Promise<void> {
  if (!blockId) return
  // 直接尝试 API 删除，不先查 blockExistsInKernel：
  // 刚创建的块可能还未被 SQL 索引，导致 blockExistsInKernel 返回 false 而跳过删除，
  // 进而在 recoverIfEmpty 循环中不断创建新块却不删旧块，造成空块累积。
  const ok = await deleteBlockSilent(blockId)
  if (ok) return
  try {
    await deleteBlock(blockId)
  } catch {
    // ignore
  }
}
