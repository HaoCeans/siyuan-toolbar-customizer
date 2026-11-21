/**
 * 朗读段落「可见性」助手。
 *
 * 场景：朗读过程中切换到其他文档，再回到（或再次打开）朗读文档时，
 * 引擎里保存的 `element` 引用已经脱离 DOM，导致高亮与自动滚动全部失效。
 *
 * 处理策略：
 * 1. 先用 node-id 在当前 DOM 里找回元素（同一文档重渲染的情况）
 * 2. 找不到且当前文档不是朗读文档 → 打开朗读文档
 * 3. 轮询等待目标块出现（新文档渲染 / 动态加载都需要时间）
 * 4. 仍找不到（块在动态加载窗口之外）→ 用 /api/block/getBlockIndex 取索引，
 *    借用思源滚动条 input 的 change 事件触发 Scroll.setIndex，把目标块所在的窗口拉出来
 */

import { fetchSyncPost, getFrontend, openMobileFileById, openTab } from 'siyuan'
import { logger } from '@/utils/logger'
import { getCurrentDocId, resolveParagraphElement, type ParagraphInfo } from './ttsEngine'

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function getApp(): any {
  return (window as any).__pluginInstance?.app ?? null
}

function isMobileFrontend(): boolean {
  const frontend = getFrontend()
  return frontend === 'mobile' || frontend === 'browser-mobile'
}

/** 打开指定文档（手机端 / 电脑端走不同 API） */
async function openDoc(docId: string): Promise<void> {
  const app = getApp()
  if (!app) return
  try {
    if (isMobileFrontend()) {
      await openMobileFileById(app, docId)
    } else {
      await openTab({ app, doc: { id: docId } })
    }
  } catch (e) {
    logger.warn('[TTS] 打开朗读文档失败:', docId, e)
  }
}

/** 通过滚动条索引把目标块所在的动态加载窗口拉出来（思源 Scroll.setIndex 是私有方法，走它的 UI 入口） */
async function revealByBlockIndex(nodeId: string): Promise<void> {
  try {
    const resp = await fetchSyncPost('/api/block/getBlockIndex', { id: nodeId })
    const raw = resp?.data
    const index = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(index) || index <= 0) return
    const root = document.querySelector('.protyle:not(.fn__hidden):not(.fn__none)') as HTMLElement | null
    const input = root?.querySelector('.protyle-scroll__bar input') as HTMLInputElement | null
    if (!input) return
    input.value = String(index)
    input.dispatchEvent(new Event('change'))
    logger.log('[TTS] 通过滚动条索引定位朗读块:', nodeId, index)
  } catch (e) {
    logger.warn('[TTS] 索引定位朗读块失败:', e)
  }
}

/** 轮询等待元素出现 */
async function waitForParagraphElement(info: ParagraphInfo, attempts: number): Promise<HTMLElement | null> {
  for (let i = 0; i < attempts; i++) {
    const found = resolveParagraphElement(info)
    if (found) return found
    await sleep(250)
  }
  return null
}

/**
 * 确保朗读段落元素可见（在 DOM 中）。
 * @param info 段落信息（会被就地更新 element / nodeId）
 * @param readingRootId 朗读所属文档 id
 * @returns 可用的元素；实在找不到返回 null
 */
export async function ensureTtsParagraphVisible(
  info: ParagraphInfo | null | undefined,
  readingRootId: string,
): Promise<HTMLElement | null> {
  if (!info) return null

  // ① 当前 DOM 已能拿到（含按 node-id 找回）
  const existing = resolveParagraphElement(info)
  if (existing) return existing

  // ② 当前文档不是朗读文档 → 先打开它
  if (readingRootId && getCurrentDocId() !== readingRootId) {
    logger.log('[TTS] 切回朗读文档:', readingRootId)
    await openDoc(readingRootId)
  }

  // ③ 等待目标块渲染（新文档首次打开需要时间）
  const found = await waitForParagraphElement(info, 16)
  if (found) return found

  // ④ 块不在已加载窗口：按索引定位后再等一轮
  if (info.nodeId) {
    await revealByBlockIndex(info.nodeId)
    const located = await waitForParagraphElement(info, 12)
    if (located) return located
  }

  logger.warn('[TTS] 未能定位朗读块:', info.nodeId || info.text?.slice(0, 20))
  return null
}

/** 高亮 + 滚动到段落（元素必须在 DOM 中） */
export function highlightParagraphElement(element: HTMLElement | null): void {
  if (!element) return
  element.classList.add('tts-current-paragraph')
  try {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  } catch { /* ignore */ }
}
