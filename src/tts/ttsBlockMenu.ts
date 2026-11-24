/**
 * 块菜单增强 — 在块标（gutter）菜单里加「从当前块朗读到末尾」
 *
 * 点击块标弹出的菜单走思源 eventBus 的 `click-blockicon` 事件，
 * detail = { protyle, blockElements, menu }。这里只在菜单上追加一项，
 * 不修改思源自带菜单项；真正朗读仍复用桌面端 TTS 面板的引擎与播放条。
 */

import { pluginInstance } from '../toolbarManager'
import { t } from '../i18n/runtime'
import * as Notify from '../notification'
import { logger } from '../utils/logger'
import { findParagraphAnchor } from './ttsEngine'
import { startTTSFromParagraph } from './desktopPanel'

let blockIconHandler: ((event: any) => void) | null = null

/** 插件自己的 EventBus（思源 App 上没有 eventBus，事件只会派发到各插件实例的 bus） */
function getPluginEventBus(): any {
  const p: any = pluginInstance
  return p?.eventBus ?? p?.app?.eventBus ?? null
}

export function initTTSBlockMenu(): void {
  cleanupTTSBlockMenu()
  const eventBus = getPluginEventBus()
  if (!eventBus?.on) return

  blockIconHandler = (event: any) => {
    const detail = event?.detail
    const blockElements: HTMLElement[] = (detail?.blockElements || []).filter(Boolean)
    if (blockElements.length === 0) return

    // 思源把插件菜单项默认塞进「插件」子菜单；这里直接加到顶级菜单，
    // 与本插件模板右键菜单的做法保持一致，少一层点击。
    const topMenu = (window as any).siyuan?.menus?.menu
    const menu = topMenu?.addItem ? topMenu : detail?.menu
    if (!menu?.addItem) return

    menu.addItem({
      icon: 'iconPlay',
      label: t('tts.readFromBlockToEnd', undefined, '从当前块朗读到末尾'),
      click: () => {
        void readFromBlocks(blockElements, detail?.protyle?.element as HTMLElement | undefined)
      }
    })
  }

  eventBus.on('click-blockicon', blockIconHandler)
}

export function cleanupTTSBlockMenu(): void {
  if (!blockIconHandler) return
  getPluginEventBus()?.off?.('click-blockicon', blockIconHandler)
  blockIconHandler = null
}

/** 把「点击的块」换算成段落锚点，再交给 TTS 面板的播放链路 */
async function readFromBlocks(blockElements: HTMLElement[], protyleEl?: HTMLElement): Promise<void> {
  try {
    const anchor = findParagraphAnchor(protyleEl, blockElements)
    if (anchor.index < 0) {
      Notify.showErrorCommandCannotExecute(t('tts.noReadableContent', undefined, '当前页面没有可朗读的内容'))
      return
    }
    await startTTSFromParagraph({
      startIndex: anchor.index,
      anchorNodeId: anchor.nodeId,
      protyleEl,
    })
  } catch (error) {
    logger.error('[TTS] 块菜单朗读失败:', error)
    Notify.showErrorCommandCannotExecute(t('tts.readFromBlockFailed', undefined, '朗读启动失败'))
  }
}
