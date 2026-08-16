/**
 * 思源编辑器"插入换行"的官方链路工具（{{newline}} 多行模板用）。
 *
 * 背景：`execCommand('insertText', false, 'a\nb')` 在 contenteditable 里只会把 \n 当普通字符
 * 插入文本节点、渲染成空格，不会产生新块（{{newline}} 失效根因）。
 * 正确做法：按 \n 拆行逐行插入，行间**派发合成 Enter keydown** 到 wysiwyg.element，
 * 让思源自己的 enter() 处理换行（列表感知 + 事务落库 + focusByWbr 设光标）。
 * 链路：keydown.ts:1374 → enter.ts:434。模式与思源官方 Android 合成 Backspace 补丁（d3e6ece43）一致。
 *
 * 已被实测验证（v3.8.3）：直接派发到 wysiwyg.element 即可被思源 handler 接住（defaultPrevented=true）。
 * 注意：keyCode 必须显式 13（合成事件默认 0，思源 KEYCODELIST 修饰键判断会走错分支）。
 * 前提：派发前 selection 必须已落在目标编辑器内（keydown 监听读的是当前 selection）。
 */

/** 派发合成 Enter keydown 到 wysiwyg，触发思源官方 enter() 换行链路 */
export function dispatchSyntheticEnter(wysiwyg: HTMLElement): void {
  const keydownEvent = new KeyboardEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true,
  })
  wysiwyg.dispatchEvent(keydownEvent)
}

/**
 * 判断光标当前所在块是否为空（连续换行时空项处理）。
 * 思源对"空列表项按 Enter"的语义是退出列表（listOutdent）而不是新建下一项，
 * 需要先塞一个 ZWSP 让块非空，Enter 才会走正常拆分。
 */
export function isCurrentBlockEmpty(container: HTMLElement): boolean {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return false
  const r = sel.getRangeAt(0)
  const node = r.startContainer.nodeType === Node.TEXT_NODE ? r.startContainer.parentElement : r.startContainer
  if (!(node instanceof HTMLElement) || !container.contains(node)) return false
  const block = node.closest('[data-node-id]')
  if (!block) return false
  return (block.textContent ?? '').replace(/\u200b/g, '').trim() === ''
}

/**
 * 多行文本逐行插入（含 {{newline}} 换行），行间派发合成 Enter 走思源官方换行链路。
 * @param container 整个编辑器容器（wysiwyg）
 * @param text 要插入的文本（可能含 \n）
 * @returns 是否全部 execCommand 成功（false 说明 execCommand 不可用，调用方应走手动兜底）
 */
export async function insertMultiLineText(container: HTMLElement, text: string): Promise<boolean> {
  const lines = text.split('\n')
  const execInsert = (t: string): boolean => {
    try { return document.execCommand('insertText', false, t) } catch { return false }
  }

  let ok = execInsert(lines[0])
  if (ok && lines.length > 1) {
    for (let i = 1; i < lines.length && ok; i++) {
      // 空行（连续 \n）：当前块为空时先塞 ZWSP，避免空项 Enter 走"退出列表"语义
      if (isCurrentBlockEmpty(container)) {
        execInsert('\u200b')
      }
      dispatchSyntheticEnter(container)
      // 等一帧，确保思源 focusByWbr 已把光标放进新块（防 updateTransaction 异步扰动）
      await new Promise<void>(r => setTimeout(r, 0))
      if (lines[i] !== '') {
        ok = execInsert(lines[i])
      }
    }
  }
  return ok
}
