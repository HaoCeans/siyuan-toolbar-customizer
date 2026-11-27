/**
 * 朗读范围记忆 — 同一文档记住上次选的「起始块 / 结束块」
 *
 * 存块 id（data-node-id）而不是纯下标：文档增删块后，仍能定位到原来的块；
 * 块被删除时回退到上次保存的下标并夹取到有效范围。
 */

import type { ParagraphInfo } from './ttsEngine'

const STORAGE_KEY = 'siyuan-tc-tts-range-memory'
const MAX_DOCS = 200

interface SavedRange {
  /** 上次的起始/结束段落下标（0-based，兜底用） */
  s: number
  e: number
  /** 上次的起始/结束块 id（优先用） */
  sn?: string
  en?: string
  /** 保存时间，用于裁剪旧记录 */
  t: number
}

export interface RestoredTtsRange {
  start: number
  end: number
}

function readStore(): Record<string, SavedRange> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, SavedRange> : {}
  } catch {
    return {}
  }
}

/** 记住某文档上次选择的朗读范围 */
export function rememberTtsRange(
  docId: string,
  paragraphs: ParagraphInfo[],
  start: number,
  end: number,
): void {
  if (!docId || paragraphs.length === 0) return
  const last = paragraphs.length - 1
  const s = Math.max(0, Math.min(Math.round(start), last))
  const e = Math.max(s, Math.min(Math.round(end), last))
  const store = readStore()
  store[docId] = {
    s,
    e,
    sn: paragraphs[s]?.nodeId,
    en: paragraphs[e]?.nodeId,
    t: Date.now(),
  }
  // 只保留最近 MAX_DOCS 个文档，避免 localStorage 无限增长
  const ids = Object.keys(store)
  if (ids.length > MAX_DOCS) {
    ids.sort((a, b) => (store[a]?.t || 0) - (store[b]?.t || 0))
    for (const id of ids.slice(0, ids.length - MAX_DOCS)) delete store[id]
  }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)) } catch { /* ignore */ }
}

/** 读取某文档上次选择的朗读范围（没有记录或文档为空时返回 null） */
export function restoreTtsRange(docId: string, paragraphs: ParagraphInfo[]): RestoredTtsRange | null {
  if (!docId || paragraphs.length === 0) return null
  const saved = readStore()[docId]
  if (!saved || typeof saved.s !== 'number' || typeof saved.e !== 'number') return null

  const last = paragraphs.length - 1
  const indexOfNode = (nodeId?: string): number =>
    nodeId ? paragraphs.findIndex(p => p.nodeId === nodeId) : -1

  let start = indexOfNode(saved.sn)
  if (start < 0) start = saved.s
  let end = indexOfNode(saved.en)
  if (end < 0) end = saved.e

  start = Math.max(0, Math.min(start, last))
  end = Math.max(start, Math.min(end, last))
  return { start, end }
}
