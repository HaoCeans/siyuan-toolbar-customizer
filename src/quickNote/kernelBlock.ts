import { logger } from '@/utils/logger'
import { fetchSyncPost } from 'siyuan'
import { appendBlock, deleteBlock, prependBlock, sql } from '../api'

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

async function resolveDailyNoteDocumentId(notebookId: string): Promise<string | null> {
  if (!notebookId) return null
  // 先查今天的日记是否已存在。思源 v3.8.10 起，日记路径上若存在同名祖先文档，
  // createDailyNote 会返回 "ambiguous document ancestor"，即使今天的日记已经建好了。
  // getDailyNoteInfo 对已存在的日记会直接返回 ID，不会触发这个歧义。
  try {
    const info: any = await fetchSyncPost('/api/filetree/getDailyNoteInfo', { notebook: notebookId })
    if (info?.code === 0 && info?.data?.id) {
      return info.data.id
    }
  } catch {
    // 旧版本思源没有该接口时继续走 createDailyNote
  }
  try {
    const response: any = await fetchSyncPost('/api/filetree/createDailyNote', { notebook: notebookId })
    if (response?.code === 0 && response?.data?.id) {
      return response.data.id
    }
    if (response?.code !== 0) {
      logger.warn('[QuickNote] createDailyNote 失败:', response?.msg)
    }
  } catch (err) {
    logger.warn('[QuickNote] createDailyNote 异常:', err)
  }
  return null
}

/** 在文档顶层按配置位置插入空块，并返回事务操作（可从中取到新块 ID） */
export async function insertQuickNoteBlockAtPosition(
  parentId: string,
  position: 'top' | 'bottom',
  dataType: 'markdown' | 'dom',
  data: string,
): Promise<IResdoOperations[] | null> {
  const payload = dataType === 'markdown'
    ? (data ? (data.endsWith('\n') ? data : `${data}\n`) : '\n')
    : data
  // 思源 v3.8.10：/api/block/insertBlock 的事务响应不会回填新块 ID（operation.ID 为空），
  // 而 prependBlock / appendBlock 走 doPrependInsert / doAppendInsert，会回填插入块 ID。
  // 之前用 insertBlock 会拿不到 ID，回退 insertDraftBlockLegacy 又插一次，第一次插入的空块
  // 就变成了取消后删不掉的孤儿块。这里直接用 prepend/append，既定位在文档首尾，也能拿到 ID。
  if (position === 'top') {
    return prependBlock(dataType, payload, parentId)
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
    logger.error('[QuickNote] createQuickNoteDraftBlock failed:', err)
    return null
  }
}

export async function deleteQuickNoteDraftBlock(blockId: string | null | undefined): Promise<void> {
  if (!blockId) return
  // 直接尝试 API 删除，不先查 blockExistsInKernel：
  // 刚创建的块可能还未被 SQL 索引，导致 blockExistsInKernel 返回 false 而跳过删除，
  // 进而在 recoverIfEmpty 循环中不断创建新块却不删旧块，造成空块累积。
  // 但插入后的 markdown 快捷转换（- [ ] 等）是异步事务，删除前需先 flush，
  // 否则删除请求到达内核时块尚未落库，deleteBlock 报"块不存在"而失败 → 残留孤儿块。
  try {
    await fetch('/api/sqlite/flushTransaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
  } catch {
    // flush 失败不阻塞删除（兜底重试）
  }
  const ok = await deleteBlockSilent(blockId)
  if (ok) return
  // 删除失败可能是事务仍在上传：flush 后再重试一次，仍失败则走 deleteBlock（可能弹错，接受）
  try {
    await fetch('/api/sqlite/flushTransaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
  } catch {
    // ignore
  }
  const ok2 = await deleteBlockSilent(blockId)
  if (ok2) return
  try {
    await deleteBlock(blockId)
  } catch {
    // ignore
  }
}
