import type { Protyle } from 'siyuan'

/** 等待思源前端事务队列清空，保存前确保 SpinBlockDOM 已完成 */
export async function waitForProtyleTransactionsIdle(
  timeoutMs = 500,
  settleMs = 40,
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const pending =
      (window as Window & { siyuan?: { transactions?: unknown[] } }).siyuan
        ?.transactions?.length ?? 0
    if (pending === 0) {
      await new Promise((r) => window.setTimeout(r, settleMs))
      const again =
        (window as Window & { siyuan?: { transactions?: unknown[] } }).siyuan
          ?.transactions?.length ?? 0
      if (again === 0) return
    }
    await new Promise((r) => window.setTimeout(r, 40))
  }
}

/** appendInsert 前剥离本地临时块 ID，由内核分配新 ID */
export function stripBlockIdsFromHtml(html: string): string {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = html
  wrapper.querySelectorAll('[data-node-id]').forEach((el) => {
    el.removeAttribute('data-node-id')
  })
  wrapper.querySelectorAll('[data-eof]').forEach((el) => {
    el.removeAttribute('data-eof')
  })
  return wrapper.innerHTML
}

function getTopBlocks(wysiwyg: HTMLElement): HTMLElement[] {
  return Array.from(wysiwyg.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && !!el.getAttribute('data-type'),
  )
}

/** 提取 wysiwyg 顶层块 DOM，Spin 规范化并剥离 ID 后供 appendInsert 使用 */
export async function extractBlockDomForAppend(editor: Protyle): Promise<string> {
  await waitForProtyleTransactionsIdle(500, 40)

  const wysiwyg = editor.protyle.wysiwyg.element
  const lute = editor.protyle.lute
  const tops = getTopBlocks(wysiwyg)
  if (tops.length === 0) return ''

  const text = (wysiwyg.textContent ?? '').replace(/\u200b/g, '').trim()
  if (!text) return ''

  return tops
    .map((el) => {
      const spun = lute.SpinBlockDOM(el.outerHTML)
      return stripBlockIdsFromHtml(spun)
    })
    .join('')
}
