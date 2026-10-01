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
import { getActiveProtyle } from '../toolbarManager'
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
 */
export const executeSlashEntry = async (entry: ISlashEntry, savedRange?: Range | null): Promise<boolean> => {
  try {
    if (entry.kind === 'fill' && entry.value) {
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
