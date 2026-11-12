/**
 * 前一篇/后一篇相邻文档解析（桌面端、手机端共用）
 *
 * 普通文档：只按当前父目录的文件树顺序找上一篇/下一篇，和原逻辑一致。
 * 日记文档：如果当前文档是所在目录的第一条/最后一条，向上跨到相邻父分支，
 * 取该分支的最后一个/第一个叶子文档，实现“11-01 的上一篇是 10-31”这种跨月续页。
 */

import { fetchSyncPost } from 'siyuan'
import { logger } from '@/utils/logger'
import { getBlockAttrs } from '../api'
import { t } from '../i18n/runtime'

export interface DocNavTarget {
  id: string
  title: string
}

export interface DocNavAdjacent {
  prev: DocNavTarget | null
  next: DocNavTarget | null
}

interface FiletreeDoc {
  id: string
  name?: string
  path: string
  subFileCount?: number
}

/** 防止异常目录结构导致无限向上/向下遍历 */
const MAX_TREE_DEPTH = 64
/** 严格日期标题：2026-11-01、2026-11-01）、（2026年11月1日）等 */
const DATE_TITLE_RE = /^[\s（(【[]*(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})日?[）)】\]]*$/
const DAILY_ATTR_RE = /^custom-dailynote-\d{8}$/

function untitled(): string {
  return t('navigation.common.untitled', undefined, '未命名')
}

function toTarget(doc: FiletreeDoc): DocNavTarget {
  return {
    id: doc.id,
    title: doc.name || untitled(),
  }
}

/** 标题是否严格等于一个日期（用于识别日记；不读属性） */
function isDateTitle(title?: string): boolean {
  if (!title) return false
  const match = title.trim().match(DATE_TITLE_RE)
  if (!match) return false
  const month = Number(match[2])
  const day = Number(match[3])
  return month >= 1 && month <= 12 && day >= 1 && day <= 31
}

/** 当前文档是否是日记：优先标题日期，标题不是日期时再查一次文档属性 */
async function isDailyNote(doc: FiletreeDoc): Promise<boolean> {
  if (isDateTitle(doc.name)) return true
  try {
    const attrs = await getBlockAttrs(doc.id)
    if (!attrs) return false
    return Object.keys(attrs).some((key) => DAILY_ATTR_RE.test(key))
  } catch (err) {
    logger.warn('[DocNavAdjacency] 读取文档属性失败:', err)
    return false
  }
}

/** /api/filetree/listDocsByPath：不传 sort，返回顺序即文件树视觉顺序 */
async function listDocs(notebookId: string, path: string): Promise<FiletreeDoc[] | null> {
  try {
    const response: any = await fetchSyncPost('/api/filetree/listDocsByPath', {
      notebook: notebookId,
      path,
    })
    if (response?.code === 0 && response?.data) {
      return (response.data.files || []) as FiletreeDoc[]
    }
  } catch (err) {
    logger.warn('[DocNavAdjacency] 获取目录文档失败:', err)
  }
  return null
}

/** 取父目录：/A/B -> /A；/A -> /；/ -> / */
function parentDir(path: string): string {
  const normalized = path.replace(/\/+$/, '')
  if (!normalized || normalized === '/') return '/'
  const index = normalized.lastIndexOf('/')
  return index <= 0 ? '/' : normalized.slice(0, index)
}

/** 目录最后一段：/A/B -> B；/ -> '' */
function lastSegment(path: string): string {
  const normalized = path.replace(/\/+$/, '')
  if (!normalized || normalized === '/') return ''
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}

/** 进入某个分支，取最靠前/最靠后的叶子文档（有子文档就继续往下） */
async function edgeLeaf(
  notebookId: string,
  start: FiletreeDoc,
  edge: 'first' | 'last',
): Promise<FiletreeDoc> {
  let current = start
  const seen = new Set<string>()

  for (let depth = 0; depth < MAX_TREE_DEPTH; depth++) {
    if (!current.path || (current.subFileCount ?? 0) <= 0 || seen.has(current.id)) return current
    seen.add(current.id)

    const children = await listDocs(notebookId, current.path.replace(/\.sy$/, ''))
    if (!children || children.length === 0) return current
    current = edge === 'first' ? children[0] : children[children.length - 1]
  }
  return current
}

/**
 * 当前文档是所在目录第一条/最后一条时，向相邻父分支续页。
 * 返回目标分支的第一个/最后一个叶子文档。
 */
async function findCrossParentTarget(
  notebookId: string,
  parentPath: string,
  direction: 'prev' | 'next',
): Promise<FiletreeDoc | null> {
  let currentParentPath = parentPath
  const seen = new Set<string>()

  for (let depth = 0; depth < MAX_TREE_DEPTH; depth++) {
    if (currentParentPath === '/' || !currentParentPath) return null
    if (seen.has(currentParentPath)) return null
    seen.add(currentParentPath)

    const parentDocId = lastSegment(currentParentPath)
    if (!parentDocId) return null

    const grandParentPath = parentDir(currentParentPath)
    const parentSiblings = await listDocs(notebookId, grandParentPath)
    if (!parentSiblings) return null

    const parentIndex = parentSiblings.findIndex((doc) => doc.id === parentDocId)
    if (parentIndex === -1) return null

    const siblingIndex = parentIndex + (direction === 'prev' ? -1 : 1)
    const sibling = parentSiblings[siblingIndex]
    if (sibling) {
      return edgeLeaf(notebookId, sibling, direction === 'prev' ? 'last' : 'first')
    }

    // 父文档也没有兄弟：继续向上找它的父级
    currentParentPath = grandParentPath
  }
  return null
}

/**
 * 获取上一篇/下一篇文档。
 *
 * - 同目录有相邻文档：直接返回（与原行为一致）
 * - 同目录没有，且当前文档是日记：跨父级续到相邻分支的最后一个/第一个叶子文档
 * - 普通文档在目录边界：保持原来的置灰行为
 */
export async function fetchAdjacentDocs(
  notebookId: string,
  parentPath: string,
  docId: string,
): Promise<DocNavAdjacent> {
  const files = await listDocs(notebookId, parentPath)
  if (!files) {
    return {
      prev: null,
      next: null,
    }
  }

  const index = files.findIndex((file) => file.id === docId)
  if (index === -1) {
    return {
      prev: null,
      next: null,
    }
  }

  const prevSibling = index > 0 ? files[index - 1] : null
  const nextSibling = index < files.length - 1 ? files[index + 1] : null

  let prev = prevSibling ? toTarget(prevSibling) : null
  let next = nextSibling ? toTarget(nextSibling) : null

  // 只有到了目录边界才需要判断是不是日记，普通翻页不额外请求
  if (!prev || !next) {
    const daily = await isDailyNote(files[index])
    if (daily) {
      if (!prev) {
        const target = await findCrossParentTarget(notebookId, parentPath, 'prev')
        prev = target && target.id !== docId ? toTarget(target) : null
      }
      if (!next) {
        const target = await findCrossParentTarget(notebookId, parentPath, 'next')
        next = target && target.id !== docId ? toTarget(target) : null
      }
    }
  }

  return {
    prev,
    next,
  }
}
