/**
 * 桌面端块格式一键记事 — Dialog + Protyle（同进程，秒开）
 * 有内容时才创建 Protyle，避免 blockId:'' 导致内部状态异常
 */
import { Dialog, Protyle, ProtyleMethod, showMessage, fetchSyncPost } from 'siyuan'
import type { QuickNoteSaveTarget } from './kernelBlock'
import { createQuickNoteDraftBlock, deleteQuickNoteDraftBlock } from './kernelBlock'
import { type QuickNoteRootState, createQuickNoteRootState } from './popoverBlocks'

// ===== 模块级单例 =====
let dialog: Dialog | null = null
let protyle: Protyle | null = null
let blockState: QuickNoteRootState | null = null
let currentBlockId: string | null = null
const TAG = '[QN-BlockDialog]'

function log(msg: string, ...args: any[]): void {
  console.log(`${TAG} ${msg}`, ...args)
}

function time(msg: string): { end: () => void } {
  const t0 = performance.now()
  return { end: () => log(`${msg} ⏱ ${(performance.now() - t0).toFixed(0)}ms`) }
}

export function initBlockDialog(): void {}

/** 只创建 Dialog 容器（Protyle 有内容时才创建） */
function ensureDialog(): boolean {
  if (dialog) return true

  dialog = new Dialog({
    title: '⚡ 快捷记事（块格式）',
    content: '<div class="quicknote-editor" style="height: 400px;"></div>',
    width: window.innerWidth < 768 ? '100%' : '600px',
    height: window.innerWidth < 768 ? '100%' : '500px',
    destroyCallback: () => { /* X 关闭时只隐藏 */ },
  })

  dialog.element.classList.add('fn__none')
  log('✅ Dialog 容器创建完成')
  return true
}

/** 有内容时创建 Protyle（不在 blockId:'' 时创建，避免内部状态异常） */
function createProtyle(app: any, blockId: string, html: string): void {
  const mountEl = dialog!.element.querySelector('.quicknote-editor') as HTMLElement
  mountEl.innerHTML = ''
  mountEl.style.cssText =
    'flex: 1; min-height: 0; height: 100%; display: flex; flex-direction: column; overflow: hidden;'

  protyle = new Protyle(app, mountEl, {
    blockId,     // ★ 用真实 blockId 创建，不触发空 getDoc
    action: [],
    render: { background: false, gutter: true, breadcrumb: false, title: false, scroll: false },
  })

  // ★ 用 getBlockDOM 的 HTML 覆盖 Protyle 自动拉取的内容（更轻量）
  if (html) {
    protyle.protyle.wysiwyg.element.innerHTML = html
    ProtyleMethod.highlightRender(protyle.protyle.wysiwyg.element)
    ProtyleMethod.mathRender(protyle.protyle.wysiwyg.element)
    ProtyleMethod.avRender(protyle.protyle.wysiwyg.element, protyle.protyle)
  }
}

/** 打开（首次：创建 draft + Protyle；后续：直接显示） */
async function open(app: any, target: QuickNoteSaveTarget): Promise<boolean> {
  if (!dialog) return false

  if (!protyle) {
    log('🆕 首次打开，创建 draft 块 + Protyle...')
    const t = time('draft + Protyle 创建')

    const blockId = await createQuickNoteDraftBlock(target)
    if (!blockId) {
      showMessage('创建编辑块失败，请检查日记/文档配置', 3000, 'error')
      return false
    }
    log(`   draft blockId: ${blockId}`)

    // getBlockDOM 拿内容
    const resp: any = await fetchSyncPost('/api/block/getBlockDOM', { id: blockId })
    const html = resp?.data?.[blockId] || (typeof resp?.data === 'string' ? resp.data : '')
    if (!html && resp?.code !== 0) {
      await deleteQuickNoteDraftBlock(blockId).catch(() => {})
      showMessage('加载编辑块失败', 3000, 'error')
      return false
    }

    createProtyle(app, blockId, html)
    currentBlockId = blockId
    blockState = createQuickNoteRootState(blockId)
    t.end()
  } else {
    log('♻️ 复用已有 Protyle，跳过重建')
  }

  dialog.element.classList.remove('fn__none')
  log('📂 显示 Dialog')

  setTimeout(() => {
    const editEl = protyle?.protyle.wysiwyg.element.querySelector('[contenteditable="true"]') as HTMLElement | null
    editEl?.focus()
  }, 100)

  return true
}

function close(): void {
  dialog?.element.classList.add('fn__none')
  log('🔒 隐藏 Dialog')
}

export async function toggleBlockDialog(app: any, target: QuickNoteSaveTarget): Promise<boolean> {
  const visibleBefore = dialog ? !dialog.element.classList.contains('fn__none') : false
  log(`🔔 toggle | 当前: ${visibleBefore ? '可见' : '隐藏'} | hasProtyle: ${!!protyle}`)

  ensureDialog()
  if (!dialog) { log('❌ dialog null'); return false }

  if (!dialog.element.classList.contains('fn__none')) { close(); return true }
  return open(app, target)
}

export function destroyBlockDialog(): void {
  if (dialog) { try { dialog.destroy() } catch {}; dialog = null }
  protyle = null
  blockState = null
  currentBlockId = null
}

export function isBlockDialogVisible(): boolean {
  return dialog ? !dialog.element.classList.contains('fn__none') : false
}
