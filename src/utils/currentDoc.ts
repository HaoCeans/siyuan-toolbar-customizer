/**
 * 当前活动文档 ID（双端共用）
 *
 * 一键记事「跟随当前文档」需要知道用户此刻正在看的文档。
 * 顺序：手机端 protyle → 焦点所在编辑器 → 活动页签 → 可见编辑器 → 任意标题块。
 * 找不到返回空字符串。
 */
export function getActiveDocId(): string {
  const w = window as any
  const mobileId = w.siyuan?.mobile?.editor?.protyle?.block?.rootID
  if (mobileId) return String(mobileId)

  const titleIdOf = (protyle: Element): string => {
    // 文档标题块的 data-node-id 就是文档 ID（思源 3.8.x 起标题自身带 id，旧版在内层）
    const title = protyle.querySelector<HTMLElement>(
      '.protyle-title[data-node-id], .protyle-title [data-node-id]',
    )
    return title?.getAttribute('data-node-id') || ''
  }

  // ① 焦点所在编辑器（点工具栏按钮时焦点通常还在编辑器/面包屑里）
  const focused = (document.activeElement as HTMLElement | null)?.closest?.('.protyle') as HTMLElement | null
  if (focused) {
    const id = titleIdOf(focused)
    if (id) return id
  }

  // ② 活动页签
  const active = document.querySelector<HTMLElement>('.layout__wnd--active .protyle')
  if (active) {
    const id = titleIdOf(active)
    if (id) return id
  }

  // ③ 可见编辑器（排除隐藏页签 / 隐藏分屏）
  for (const protyle of Array.from(document.querySelectorAll<HTMLElement>('.protyle'))) {
    if (protyle.classList.contains('fn__hidden') || protyle.classList.contains('fn__none')) continue
    const rect = protyle.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue
    const id = titleIdOf(protyle)
    if (id) return id
  }

  // ④ 兜底：任意标题块（单编辑器场景）
  const fallback = document.querySelector<HTMLElement>('.protyle-title[data-node-id], .protyle-title [data-node-id]')
  return fallback?.getAttribute('data-node-id') || ''
}
