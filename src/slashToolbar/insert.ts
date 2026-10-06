/**
 * 斜杠菜单工具栏 —— 写入通道（独立文件）
 *
 * 所有改块结构的操作都走思源官方前端通道 protyle.hint.fill(value, protyle, false)，
 * 与移动端键盘工具条「斜杠菜单」点击是同一个函数（app/src/mobile/util/keyboardToolbar.ts），
 * 也就是同一套本地 DOM 修改 + WebSocket 事务，不经过 /api/block/updateBlock 一类的 HTTP 块 API，
 * 避免结构性变更让内核拿到非法块树。
 *
 * 唯一的例外是资源上传：先用 /api/asset/upload 拿到资源路径，再交给 hint.fill 插入 Markdown。
 */

import type {
  ISlashEntry,
  TSlashSpecial,
} from './catalog'
import {
  fetchSyncPost,
  showMessage,
} from 'siyuan'
import { t } from '../i18n/runtime'
import {
  getActiveProtyle,
} from '../toolbarManager'
import { logger } from '../utils/logger'
import { dispatchSyntheticEnter, isCurrentBlockEmpty } from '../utils/protyleEnter'
import {

  SLASH_CARET,
  SLASH_ZWSP,

} from './catalog'

/** 资源上传目录（相对 data/） */
const ASSETS_DIR_PATH = '/assets/'

const IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp|svg|bmp|avif|heic)$/i

/** 移动端原生层显示软键盘（Android/HarmonyOS 注入的 JSAndroid） */
const showKeyboard = () => {
  const jsAndroid = (window as any).JSAndroid
  if (jsAndroid?.showKeyboard) {
    try {
      jsAndroid.showKeyboard()
    } catch {
      // 原生桥不可用时忽略
    }
  }
}

/** Lute.Caret：lute 会把它渲染成 <wbr>，思源再用 focusByWbr 定位光标 */
export const luteCaret = (): string => {
  const caret = (window as any).Lute?.Caret
  return typeof caret === 'string' ? caret : SLASH_ZWSP
}

const resolveSlashValue = (value: string) => value.split(SLASH_CARET).join(luteCaret())

/** 光标所在的编辑区域（用于判断选区是否落在编辑器内） */
const getWysiwygElement = (protyle: any): HTMLElement | null => {
  const element = protyle?.wysiwyg?.element
  return element instanceof HTMLElement ? element : null
}

/**
 * 让 protyle.toolbar.range 指向一个可用的编辑器内选区。
 * 依次尝试：按钮按下前保存的选区 → 当前选区 → 思源自己维护的选区。
 */
export const ensureRange = (protyle: any, savedRange?: Range | null): boolean => {
  if (!protyle?.toolbar) {
    return false
  }
  const wysiwyg = getWysiwygElement(protyle)
  if (!wysiwyg) {
    return false
  }
  const isInside = (range: Range | null | undefined): range is Range => {
    if (!range?.startContainer?.isConnected || !range?.endContainer?.isConnected) {
      return false
    }
    return wysiwyg.contains(range.startContainer) && wysiwyg.contains(range.endContainer)
  }
  let current: Range | null = null
  try {
    const selection = window.getSelection()
    current = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
  } catch {
    current = null
  }
  const candidates: Array<Range | null | undefined> = [savedRange, current, protyle.toolbar.range]
  const usable = candidates.find(isInside)
  if (!usable) {
    return false
  }
  protyle.toolbar.range = usable
  return true
}

/**
 * 官方斜杠通道。
 *
 * keepHintSplit 为 true 时（只有 (( 与 {{ 用）不还原 hint.splitChar / lastIndex：
 * 这两个值调用的 fill 分支会把 hint 切到 (( / {{ 模式并打开对应的搜索面板，
 * 之后用户继续输入时正是靠 splitChar 才能继续过滤、点选时才能走 BLOCK_HINT_KEYS 分支。
 * 一还原就变成「面板打开了，但一输入就跳回斜杠菜单、点选也插不进引用」。
 */
export const fillSlash = (value: string, keepHintSplit = false, savedRange?: Range | null): boolean => {
  const protyle = getActiveProtyle()
  const hint = protyle?.hint
  if (!hint || typeof hint.fill !== 'function') {
    return false
  }
  if (!ensureRange(protyle, savedRange)) {
    return false
  }
  // 与官方 fill 内部的前置校验对齐：光标必须落在编辑器的某个块内，否则官方会静默返回
  const startContainer = protyle.toolbar.range?.startContainer
  if (!startContainer?.isConnected) {
    return false
  }
  const host = startContainer.nodeType === Node.ELEMENT_NODE
    ? startContainer as HTMLElement
    : startContainer.parentElement
  if (!host?.closest?.('.protyle-wysiwyg [data-node-id]')) {
    return false
  }

  const oldSplitChar = hint.splitChar
  const oldLastIndex = hint.lastIndex
  const oldSource = hint.source
  hint.splitChar = '/'
  hint.lastIndex = -1
  hint.source = ''
  let ok = true
  try {
    hint.fill(value, protyle, false)
  } catch (error) {
    ok = false
    logger.error('[slashToolbar] hint.fill 失败:', error)
  }
  if (!keepHintSplit) {
    hint.splitChar = oldSplitChar
    hint.lastIndex = oldLastIndex
    hint.source = oldSource
  }
  if (ok) {
    showKeyboard()
  }
  return ok
}

/** 块内可编辑元素（段落/标题等块的第一个 contenteditable 子元素） */
const getEditableOfBlock = (block: Element | null): HTMLElement | null => {
  if (!(block instanceof HTMLElement)) {
    return null
  }
  const editable = block.querySelector('[contenteditable="true"]')
  return editable instanceof HTMLElement ? editable : null
}

/** 由节点取所在块（限定在编辑器内，避开属性面板等工具条里的 data-node-id） */
const getBlockOfNode = (node: Node | null, wysiwyg: HTMLElement): HTMLElement | null => {
  const host = node?.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node?.parentElement
  const block = host?.closest?.('[data-node-id]')
  return block instanceof HTMLElement && wysiwyg.contains(block) ? block : null
}

/** 光标在可编辑区内的字符偏移（原地转换后还原光标用） */
const getCaretOffset = (editable: HTMLElement, range: Range | null): number | null => {
  if (!range?.startContainer?.isConnected || !editable.contains(range.startContainer)) {
    return null
  }
  try {
    const before = range.cloneRange()
    before.selectNodeContents(editable)
    before.setEnd(range.startContainer, range.startOffset)
    return before.toString().length
  } catch {
    return null
  }
}

/** 把光标放到可编辑区内第 offset 个字符处 */
const setCaretOffset = (editable: HTMLElement, offset: number): void => {
  const selection = window.getSelection()
  if (!selection) {
    return
  }
  const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT)
  let remaining = offset
  let node = walker.nextNode()
  while (node) {
    const length = node.textContent?.length ?? 0
    if (remaining <= length) {
      const range = document.createRange()
      range.setStart(node, remaining)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      return
    }
    remaining -= length
    node = walker.nextNode()
  }
}

/** 删除可编辑区开头的 length 个字符（兜底清掉没被官方管线消费的标记） */
const removeLeadingText = (editable: HTMLElement, length: number): void => {
  const node = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT).nextNode()
  const selection = window.getSelection()
  if (!node || !selection || (node.textContent?.length ?? 0) < length) {
    return
  }
  const range = document.createRange()
  range.setStart(node, 0)
  range.setEnd(node, length)
  selection.removeAllRanges()
  selection.addRange(range)
  try {
    document.execCommand('delete')
  } catch {
    // 兜底失败就保持原样，不阻断
  }
}

/** 官方管线是异步的（input 事件里 scheduleInput 排到下一个宏任务），等待上限按帧计 */
const IN_PLACE_SETTLE_FRAMES = 10

/**
 * 标记插入后等官方管线处理完，然后：
 * - 标记已被消费（转换完成，或官方按列表项语义把标记删掉了）→ 把光标还原到打标记前的位置；
 * - 到上限标记还留在块首（编辑器刚好被禁用等异常）→ 删掉标记，不给正文留下字面 "# "。
 */
const settleInPlaceMark = (wysiwyg: HTMLElement, mark: string, blockText: string, caretOffset: number | null): void => {
  let frames = 0
  const tick = () => {
    frames++
    const selection = window.getSelection()
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
    const editable = getEditableOfBlock(getBlockOfNode(range?.startContainer ?? null, wysiwyg))
    if (editable) {
      const text = editable.textContent ?? ''
      if (!text.startsWith(mark)) {
        // 打标记会把光标带到块首，而按钮的预期是「把这段文字变成目标块」后光标留在原处
        if (caretOffset !== null && text === blockText) {
          setCaretOffset(editable, caretOffset)
        }
        return
      }
      if (frames >= IN_PLACE_SETTLE_FRAMES) {
        removeLeadingText(editable, mark.length)
        return
      }
    }
    if (frames < IN_PLACE_SETTLE_FRAMES) {
      requestAnimationFrame(tick)
    }
  }
  requestAnimationFrame(tick)
}

/** 文档处于锁定/只读状态（编辑器被禁用）时不能走 execCommand */
const isReadonlyDoc = (protyle: any): boolean => {
  if (protyle?.disabled === true) {
    return true
  }
  const wysiwyg = protyle?.wysiwyg?.element as HTMLElement | undefined
  return wysiwyg?.getAttribute('custom-sy-readonly') === 'true'
}

/**
 * 原地改格式：把 Markdown 标记打进当前块首，交给**思源官方输入管线**
 * （execCommand / 合成 input 事件 → wysiwyg 的 input 监听 → Lute.SpinBlockDOM → 事务落库）
 * 把当前块原地转成目标块，而不是像 hint.fill 那样在下方新建块。
 *
 * 用 siyuan 仓库 app/stage/protyle/js/lute/lute.min.js 实跑 SpinBlockDOM 得到的边界：
 * - 普通段落 + `# `~`###### ` → **同 data-node-id** 的一级~六级标题，正文与行内元素（加粗等）保留；
 * - 普通段落 + `- ` / `1. ` / `- [ ] ` / `> ` → 列表 / 有序列表 / 任务列表 / 引述，正文保留；
 * - 已是标题的块再打标题标记**不会**转换（标记会变成标题里的字面 "# " 文本）——
 *   所以标题块走「伪装成段落再打标记」的通道（convertHeadingViaFakeParagraph）；
 *   代码块标记（```）会直接让 Lute 抛异常；公式块（$$）与分割线（---）会丢掉正文；
 *   callout / tabs / 思维导图 是多行标记，单次插入不会转换 —— 这些条目一律不填 inPlace；
 * - 列表项内首个段落打列表标记，官方管线会把标记删掉、内容不动（等价官方斜杠菜单的拒绝语义）。
 *
 * 接管范围：非空普通段落、以及标题块（同级标题提示后不动作，不同级原地改级别，
 * 标题 → 列表/引述原地转换）。其余一律返回 false 交给官方 hint.fill；
 * 空段落也交给官方：hint.fill 对空段落本来就是原地转换（同样保留块 ID、结果一致），
 * 且能保住官方在列表项内对空段落的特殊语义。
 *
 * 是否启用由设置预览里对应按钮（`inPlace.group`）的开关决定，**默认关闭**：
 * 关闭时完全走官方 hint.fill（行为不变）。开关由调用方（runtime）按配置传进来。
 *
 * @param savedRange 按钮按下前保存的选区（点击抢焦点后取不到光标时用）
 * @returns true 表示已接管；false 表示调用方应回退官方 hint.fill
 */
/**
 * 把标记插到可编辑元素开头，让光标落在标记之后。
 * 通道一：execCommand（产生原生 input 事件，思源官方输入管线直接接住）；
 * 通道二（兜底）：手动插文本节点 + 派发合成 input 事件——思源的输入监听不校验
 * isTrusted（换行按钮的合成 Enter 同理），收到后走同一条 input → SpinBlockDOM → 事务落库
 * 链路，beforeinput 先行是给思源记撤销基线用的。
 * 返回是否真的插上了（execCommand 返回 true 不算数，要核对 DOM）。
 */
const insertMarkAtBlockStart = (editable: HTMLElement, mark: string): boolean => {
  const selection = window.getSelection()
  if (!selection) {
    return false
  }
  // 光标移到块首再插标记：块首的标记才会被 Lute 当作块级标记解析
  const markRange = document.createRange()
  markRange.setStart(editable, 0)
  markRange.collapse(true)
  selection.removeAllRanges()
  selection.addRange(markRange)

  let inserted = false
  // 多行标记（提示块 `> [!NOTE]\n> `）不走 execCommand：换行可能被它变成 <br> 或直接吞掉，
  // 而核对失败后没法干净回滚（会留下半截标记）；直接用文本节点插入，Lute 看到的就是真换行
  if (!mark.includes('\n')) {
    try {
      inserted = document.execCommand('insertText', false, mark)
    } catch {
      inserted = false
    }
    // 返回 true 不代表真插进来了，核对 DOM；Android WebView 有返回 true 却没动 DOM 的情况
    if (inserted && !(editable.textContent ?? '').startsWith(mark)) {
      logger.warn('[slashToolbar] execCommand 声称成功但块首没有标记，改走合成 input 通道')
      inserted = false
    }
  }
  if (!inserted) {
    try {
      const insertRange = document.createRange()
      insertRange.setStart(editable, 0)
      insertRange.collapse(true)
      editable.dispatchEvent(new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: mark,
        bubbles: true,
        composed: true,
        cancelable: false,
      }))
      const textNode = document.createTextNode(mark)
      insertRange.insertNode(textNode)
      const caretRange = document.createRange()
      caretRange.setStartAfter(textNode)
      caretRange.collapse(true)
      selection.removeAllRanges()
      selection.addRange(caretRange)
      editable.dispatchEvent(new InputEvent('input', {
        inputType: 'insertText',
        data: mark,
        bubbles: true,
        composed: true,
        cancelable: false,
      }))
      inserted = true
      logger.warn(`[slashToolbar] 已通过合成 input 通道插入标记 "${mark.trim()}"`)
    } catch (error) {
      logger.warn('[slashToolbar] 合成 input 插入失败:', error)
    }
  }
  return inserted
}

/**
 * 标题块的原地转换（改级别 / 转列表 / 转引述）。
 * 标题内打标记不会被 Lute 解析（实测：`# ` 会变成标题里的字面文本），所以先把块
 * 「伪装」成普通段落（改 data-type、摘掉 subtype/fold/hN class），再打标记走官方
 * 输入管线——Lute 按「段落 + 块级标记」重旋，生成目标块且**保留块 ID**（与官方
 * 空段落转换同一条事务形态：单条 update）。
 * 失败时还原被改的属性，交回官方 hint.fill。
 */
const convertHeadingViaFakeParagraph = (
  block: HTMLElement,
  editable: HTMLElement,
  mark: string,
  blockText: string,
  caretOffset: number | null,
): boolean => {
  const savedAttrs: Array<[string, string | null]> = []
  ;['data-type', 'data-subtype', 'fold'].forEach((attr) => {
    savedAttrs.push([attr, block.getAttribute(attr)])
  })
  const savedClass = block.getAttribute('class')
  block.setAttribute('data-type', 'NodeParagraph')
  block.removeAttribute('data-subtype')
  block.removeAttribute('fold')
  if (savedClass) {
    block.setAttribute('class', savedClass.replace(/\bh\d\b/g, '').trim())
  }
  const inserted = insertMarkAtBlockStart(editable, mark)
  if (!inserted) {
    // 还原伪装，交回官方通道
    savedAttrs.forEach(([attr, value]) => {
      if (value === null) {
        block.removeAttribute(attr)
      } else {
        block.setAttribute(attr, value)
      }
    })
    if (savedClass !== null) {
      block.setAttribute('class', savedClass)
    }
    return false
  }
  showKeyboard()
  const wysiwyg = getWysiwygElement(getActiveProtyle())
  if (wysiwyg) {
    settleInPlaceMark(wysiwyg, mark, blockText, caretOffset)
  }
  return true
}

/** 官方提示块预设（对齐 app/src/protyle/wysiwyg/callout.ts 的 CALLOUT_PRESETS） */
const CALLOUT_PRESETS: Record<string, { title: string, icon: string }> = {
  NOTE: {
    title: 'Note',
    icon: '✏️',
  },
  TIP: {
    title: 'Tip',
    icon: '💡',
  },
  IMPORTANT: {
    title: 'Important',
    icon: '❗',
  },
  WARNING: {
    title: 'Warning',
    icon: '⚠️',
  },
  CAUTION: {
    title: 'Caution',
    icon: '🚨',
  },
}

/** 从提示块标记 `> [!TIP]\n> ` 里取类型名 */
const getCalloutTypeOfMark = (mark: string): string | undefined =>
  (mark.match(/\[!([A-Z]+)\]/) ?? [])[1]

/**
 * 提示块换型（Note → Tip、Tip → Warning…）：照抄官方 `updateCalloutType` 的 DOM 改动，
 * 再用内核 API 落库。
 *
 * 为什么不用官方的另外两条路（都是实测/读源码确认过的）：
 * 1. 「改 DOM 后让官方输入管线落库」走不通——Lute 对提示块 HTML 的重旋**完全幂等**
 *    （不会按 subtype 归一化标题/图标），官方「重旋结果 ≠ 现有 DOM 才发事务」的判断
 *    因此不成立，改动会被静默丢弃，下次重渲染就还原；
 * 2. 模拟块标菜单（`gutter.renderMenu` → 「转换为」子菜单）能走官方 `updateCalloutType`
 *    且可撤销，但要在手机上弹菜单 + 展开二级子菜单，且依赖私有方法与菜单结构，太脆。
 *
 * 所以这里主动改 DOM（subtype / 标题 / 图标）+ `/api/block/updateBlock`（dataType: 'dom'，
 * 只改属性与文本，块树结构不变，不会让内核拿到非法块树）。
 * 代价：这次换型**不进本地撤销栈**（撤销按钮/Ctrl+Z 不会回退它，再点回原类型即可）。
 */
const switchCalloutType = async (callout: HTMLElement, mark: string): Promise<boolean> => {
  const id = callout.getAttribute('data-node-id')
  const type = getCalloutTypeOfMark(mark)
  const preset = type ? CALLOUT_PRESETS[type] : undefined
  if (!id || !type || !preset) {
    return false
  }
  const oldSubtype = callout.getAttribute('data-subtype') ?? ''
  if (oldSubtype.toUpperCase() === type) {
    showMessage(t('slashToolbar.inPlace.sameCallout', undefined, '当前已是该类型提示块，无需转换'), 2000, 'info')
    return true
  }
  const titleElement = callout.querySelector<HTMLElement>('.callout-title')
  const iconElement = callout.querySelector<HTMLElement>('.callout-icon')
  const oldTitle = titleElement?.textContent ?? null
  const oldIcon = iconElement?.textContent ?? null
  // 官方规则：标题等于旧类型名（= 没自定义过标题）才跟着换成新类型名，自定义标题保留
  const titleIsTypeName = (oldTitle ?? '').trim().toLowerCase() === oldSubtype.toLowerCase()
  callout.setAttribute('data-subtype', type)
  if (titleElement && titleIsTypeName) {
    titleElement.textContent = preset.title
  }
  if (iconElement) {
    iconElement.textContent = preset.icon
  }
  try {
    const response = await fetchSyncPost('/api/block/updateBlock', {
      id,
      dataType: 'dom',
      data: callout.outerHTML,
    })
    if (response?.code !== 0) {
      throw new Error(response?.msg || 'updateBlock failed')
    }
    return true
  } catch (error) {
    // 落库失败就回滚 DOM，不留「看起来换了、其实没保存」的状态
    callout.setAttribute('data-subtype', oldSubtype)
    if (titleElement && oldTitle !== null) {
      titleElement.textContent = oldTitle
    }
    if (iconElement && oldIcon !== null) {
      iconElement.textContent = oldIcon
    }
    logger.warn('[slashToolbar] 提示块换型失败，已回滚:', error)
    return false
  }
}

export const tryInPlaceMark = async (entry: ISlashEntry, savedRange?: Range | null): Promise<boolean> => {
  const inPlace = entry.inPlace
  if (!inPlace) {
    return false
  }
  const mark = inPlace.mark
  const group = inPlace.group
  const trace = (reason: string) => logger.warn('[slashToolbar] 原地转换跳过:', reason)
  const protyle = getActiveProtyle()
  const wysiwyg = getWysiwygElement(protyle)
  if (!protyle || !wysiwyg) {
    trace('取不到活动编辑器')
    return false
  }
  if (isReadonlyDoc(protyle)) {
    trace('文档处于只读/锁定状态')
    return false
  }
  if (!ensureRange(protyle, savedRange)) {
    trace('选区不在编辑器内（ensureRange 失败）')
    return false
  }
  const range: Range | null = protyle.toolbar?.range ?? null
  const block = getBlockOfNode(range?.startContainer ?? null, wysiwyg)
  if (!block) {
    trace('光标不在任何块内')
    return false
  }
  const blockType = block.getAttribute('data-type')
  // 提示块标记（`> [!TIP]\n> `）与普通引述标记（`> `）在这里分道：
  // 前者在提示块内 = 换型，后者在引述内 = 官方会把标记当「退出引述」（见下）
  const isCalloutMark = mark.startsWith('> [!')

  // ① 已在提示块内 + 点提示块条目 = 换型（Note → Tip …）
  if (isCalloutMark) {
    const callout = block.closest('[data-type="NodeCallout"]')
    if (callout instanceof HTMLElement) {
      return await switchCalloutType(callout, mark)
    }
  }

  /*
   * ② 引述标记的专属拦截：块已经在引述内时不做原地转换。
   * 原因是官方输入管线对块首的 "> " 有专属分支——input.ts 的 blockquoteContext 分支会
   * deleteContents() 删掉标记，再 turnsOneInto(CancelBlockquote)（退出引述）或
   * wrapBlockInBlockquote()（再套一层），然后直接 return，永远走不到转块的 spin：
   * 表现就是点了没反应、原有引述还会被退掉或多叠一层。
   * （提示块标记不会命中该分支：它要求标记匹配 `^ {0,3}[>》] ?$`，`> [!TIP]...` 不匹配。）
   */
  if (!isCalloutMark && group === 'quote' && block.closest('[data-type="NodeBlockquote"]')) {
    showMessage(t('slashToolbar.inPlace.inQuote', undefined, '当前块已在引述内，无需转换'), 2000, 'info')
    return true
  }

  const editable = getEditableOfBlock(block)
  if (!editable || !editable.isContentEditable) {
    trace('块内取不到可编辑元素（isContentEditable=false）')
    return false
  }
  const blockText = editable.textContent ?? ''
  if (blockType === 'NodeHeading') {
    // 标题块：同级再点 = 提示后不动作；不同级 = 原地改级别；转列表/引述 = 原地转换
    if (group === 'heading') {
      const targetLevel = (mark.match(/#/g) ?? []).length
      const currentLevel = Number((block.getAttribute('data-subtype') ?? '').replace('h', '')) || 0
      if (targetLevel > 0 && targetLevel === currentLevel) {
        showMessage(t('slashToolbar.inPlace.sameLevel', undefined, '当前已是同级标题，无需转换'), 2000, 'info')
        return true
      }
    }
    if (blockText.replace(/[\s\u200B]/g, '') === '') {
      trace('空标题不支持原地转换，交给官方 hint.fill')
      return false
    }
    const caretOffset = getCaretOffset(editable, range)
    const ok = convertHeadingViaFakeParagraph(block, editable, mark, blockText, caretOffset)
    if (!ok) {
      trace('标题原地转换失败（标记插入未生效）')
    }
    return ok
  }
  if (blockType !== 'NodeParagraph') {
    trace(`当前块类型是 ${blockType ?? '未知'}，不支持原地转换`)
    return false
  }
  if (blockText.replace(/[\s\u200B]/g, '') === '') {
    trace('当前是空段落，交给官方 hint.fill（它对空段落本来就是原地转换）')
    return false
  }
  const selection = window.getSelection()
  if (!selection) {
    trace('window.getSelection() 不可用')
    return false
  }
  const caretOffset = getCaretOffset(editable, range)
  const originRange = selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null
  const inserted = insertMarkAtBlockStart(editable, mark)
  if (!inserted) {
    // 两条通道都失败：还原选区，交回官方通道
    trace('标记插入失败（execCommand 与合成通道均未生效）')
    if (originRange) {
      selection.removeAllRanges()
      selection.addRange(originRange)
    }
    return false
  }
  showKeyboard()
  settleInPlaceMark(wysiwyg, mark, blockText, caretOffset)
  return true
}

/** 行级公式：优先点官方键盘工具条上的按钮（同一条代码路径），取不到再直接调 setInlineMark */
const executeInlineMath = (savedRange?: Range | null): boolean => {
  const protyle = getActiveProtyle()
  if (!protyle?.toolbar || !ensureRange(protyle, savedRange)) {
    return false
  }
  const button = protyle.toolbar.element?.querySelector('[data-type="inline-math"]') as HTMLElement | undefined
  if (button) {
    button.dispatchEvent(new CustomEvent('click'))
    showKeyboard()
    return true
  }
  if (typeof protyle.toolbar.setInlineMark === 'function') {
    protyle.toolbar.setInlineMark(protyle, 'inline-math', 'range', { type: 'inline-math' })
    showKeyboard()
    return true
  }
  return false
}

/** 唤起文件选择器 */
const pickFiles = (kind: 'image' | 'photo' | 'file'): Promise<File[]> => {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (kind === 'photo') {
      input.setAttribute('capture', 'user')
    } else {
      input.multiple = true
    }
    // application/x-siyuan-image-picker 会让安卓原生层走系统照片选择器
    input.accept = kind === 'file' ? '*/*' : 'image/*,application/x-siyuan-image-picker'
    input.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;'
    let done = false
    input.addEventListener('change', () => {
      done = true
      const files = Array.prototype.slice.call(input.files || []) as File[]
      resolve(files)
      setTimeout(() => input.remove(), 1000)
    })
    document.body.appendChild(input)
    input.click()
    setTimeout(() => {
      if (!done) {
        input.remove()
      }
    }, 120000)
  })
}

/** 多个资源合并为单个段落（软换行），保证 lute 只生成一个块 */
const toAssetMarkdown = (succMap: Record<string, string>) =>
  Object.keys(succMap || {}).reduce<string[]>((lines, name) => {
    const path = succMap[name]
    if (!path) {
      return lines
    }
    lines.push(IMAGE_EXT_RE.test(path) ? `![${name}](${path})` : `[${name}](${path})`)
    return lines
  }, []).join('\n')

const uploadAssets = async (files: File[]): Promise<Record<string, string>> => {
  const formData = new FormData()
  formData.append('assetsDirPath', ASSETS_DIR_PATH)
  files.forEach((file) => formData.append('file[]', file, file.name))
  const response = await fetch('/api/asset/upload', {
    method: 'POST',
    body: formData,
  })
  const json = await response.json()
  if (json.code !== 0) {
    throw new Error(json.msg || 'upload failed')
  }
  const data = json.data || {}
  if (data.errFiles?.length) {
    throw new Error(String(data.errFiles.join('、')))
  }
  return data.succMap || {}
}

const executePickAssets = async (kind: 'image' | 'photo' | 'file', savedRange?: Range | null): Promise<boolean> => {
  const files = await pickFiles(kind)
  if (!files.length) {
    return false
  }
  const succMap = await uploadAssets(files)
  const markdown = toAssetMarkdown(succMap)
  if (!markdown) {
    return false
  }
  return fillSlash(markdown, false, savedRange)
}

/** 专用通道：ZWSP 系列的官方斜杠值 */
const SPECIAL_SLASH_VALUES: Partial<Record<TSlashSpecial, string>> = {
  template: SLASH_ZWSP,
  widget: SLASH_ZWSP + 1,
  assets: SLASH_ZWSP + 2,
  ai: SLASH_ZWSP + 5,
  newSubDocRef: SLASH_ZWSP + 6,
  emoji: 'emoji',
}

/**
 * 换行：等价 {{newline}} 的单次效果。
 * 恢复按钮按下前的光标后，派发合成 Enter（keyCode 13）走思源官方换行链路
 * （keydown.ts → enter()：列表感知 + 事务落库 + focusByWbr 设光标）。
 * 空列表项先补 ZWSP——思源对"空列表项 Enter"的语义是退出列表而非新建下一项，
 * 与 insertMultiLineText（{{newline}} 多行模板）保持同一套处理。
 */
const executeNewline = (savedRange?: Range | null): boolean => {
  const protyle = getActiveProtyle()
  if (!protyle) return false
  if (!ensureRange(protyle, savedRange)) return false
  const wysiwyg = protyle.wysiwyg?.element as HTMLElement | undefined
  if (!wysiwyg) return false
  if (isCurrentBlockEmpty(wysiwyg)) {
    try { document.execCommand('insertText', false, '\u200b') } catch { /* ignore */ }
  }
  dispatchSyntheticEnter(wysiwyg)
  return true
}

/**
 * 执行一个条目。
 * @param entry 条目定义
 * @param savedRange 按钮按下前保存的选区（避免点击抢焦点后丢光标）
 * @param allowInPlace 该条目所属按钮的「原地改格式」开关是否打开（默认关闭 = 官方新建块）
 */
export const executeSlashEntry = async (
  entry: ISlashEntry,
  savedRange?: Range | null,
  allowInPlace = false,
): Promise<boolean> => {
  try {
    if (entry.kind === 'fill' && entry.value) {
      // 开关打开的标题/列表/引述：光标在非空段落上时原地改格式，其余情况回退官方新建块
      if (allowInPlace && await tryInPlaceMark(entry, savedRange)) {
        return true
      }
      return fillSlash(resolveSlashValue(entry.value), entry.keepHintSplit === true, savedRange)
    }
    if (entry.kind !== 'special' || !entry.special) {
      return false
    }
    switch (entry.special) {
      case 'blockRef':
        return fillSlash('((', true, savedRange)
      case 'blockEmbed':
        return fillSlash('{{', true, savedRange)
      case 'newline':
        return executeNewline(savedRange)
      case 'inlineMath':
        return executeInlineMath(savedRange)
      case 'pickImage':
        return await executePickAssets('image', savedRange)
      case 'pickPhoto':
        return await executePickAssets('photo', savedRange)
      case 'pickFile':
        return await executePickAssets('file', savedRange)
      default: {
        const value = SPECIAL_SLASH_VALUES[entry.special]
        return value ? fillSlash(value, false, savedRange) : false
      }
    }
  } catch (error) {
    logger.error('[slashToolbar] 插入失败:', error)
    return false
  }
}
