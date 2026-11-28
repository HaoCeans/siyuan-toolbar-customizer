/**
 * 块菜单增强 — 在块菜单里加「从当前块朗读到末尾」
 *
 * 两个入口（双端都有）：
 * - 块标菜单：eventBus `click-blockicon`，detail = { protyle, blockElements, menu }。
 *   桌面端菜单项加顶级菜单；手机端块标菜单同样走 window.siyuan.menus.menu，也可加顶级。
 * - 长按文字操作条：eventBus `open-menu-content`，detail = { protyle, range, element, menu }。
 *   手机端思源由 toolbar.showContent 自己渲染插件菜单（操作条上的「插件」按钮），
 *   菜单项必须加进 detail.menu（pluginSubMenu），不能加顶级菜单。
 *
 * 点击时按平台路由：手机端走手机面板引擎（Edge/免费/硅基流动 + 手机播放条），
 * 桌面端走桌面面板（含浏览器语音）。桌面播放条 min-width 440px，手机上会超出屏幕，
 * 因此路由只认平台，不认入口。
 */

import { pluginInstance } from '../toolbarManager'
import { t } from '../i18n/runtime'
import * as Notify from '../notification'
import { logger } from '../utils/logger'
import { findParagraphAnchor } from './ttsEngine'
import { startTTSFromParagraph } from './desktopPanel'
import { startTTSFromParagraphMobile } from './mobilePanel'

let blockIconHandler: ((event: any) => void) | null = null
let contentMenuHandler: ((event: any) => void) | null = null
/** 插件自己的 EventBus（思源 App 上没有 eventBus，事件只会派发到各插件实例的 bus） */
function getPluginEventBus(): any {
  const p: any = pluginInstance
  return p?.eventBus ?? p?.app?.eventBus ?? null
}

function isMobileFrontend(): boolean {
  return (pluginInstance as any)?.isMobile === true
}

export function initTTSBlockMenu(): void {
  cleanupTTSBlockMenu()
  const eventBus = getPluginEventBus()
  if (!eventBus?.on) return

  // 块标菜单（桌面 + 手机端块图标菜单）
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

  // 长按文字的操作条（手机端主入口；思源在操作条「插件」按钮里渲染 detail.menu 的项）
  contentMenuHandler = (event: any) => {
    const detail = event?.detail
    const menu = detail?.menu
    if (!menu?.addItem) return
    const blockEl = (detail?.element || detail?.range?.startContainer) as HTMLElement | Node | undefined
    const blockElements = normalizeBlockElements(blockEl)
    if (blockElements.length === 0) return

    menu.addItem({
      icon: 'iconPlay',
      label: t('tts.readFromBlockToEnd', undefined, '从当前块朗读到末尾'),
      click: () => {
        void readFromBlocks(blockElements, detail?.protyle?.element as HTMLElement | undefined)
      }
    })
  }
  eventBus.on('open-menu-content', contentMenuHandler)

}

export function cleanupTTSBlockMenu(): void {
  if (blockIconHandler) {
    getPluginEventBus()?.off?.('click-blockicon', blockIconHandler)
    blockIconHandler = null
  }
  if (contentMenuHandler) {
    getPluginEventBus()?.off?.('open-menu-content', contentMenuHandler)
    contentMenuHandler = null
  }

}

/** 把事件里的块引用归一成 HTMLElement 数组（支持元素 / 文本节点） */
function normalizeBlockElements(blockEl: HTMLElement | Node | undefined): HTMLElement[] {
  if (!blockEl) return []
  const el = blockEl instanceof HTMLElement
    ? blockEl
    : ((blockEl as Node).parentElement as HTMLElement | null)
  const block = el?.closest?.('[data-node-id]') as HTMLElement | null
  return block ? [block] : []
}

/** 把「点击的块」换算成段落锚点，再按平台路由到对应的 TTS 播放链路 */
async function readFromBlocks(blockElements: HTMLElement[], protyleEl?: HTMLElement): Promise<void> {
  try {
    const anchor = findParagraphAnchor(protyleEl, blockElements)
    if (anchor.index < 0) {
      Notify.showErrorCommandCannotExecute(t('tts.noReadableContent', undefined, '当前页面没有可朗读的内容'))
      return
    }
    if (isMobileFrontend()) {
      // 手机端：桌面播放条 min-width 440px 会超出屏幕，必须走手机面板链路
      await startTTSFromParagraphMobile(anchor.index, undefined, anchor.nodeId)
    } else {
      await startTTSFromParagraph({
        startIndex: anchor.index,
        anchorNodeId: anchor.nodeId,
        protyleEl,
      })
    }
  } catch (error) {
    logger.error('[TTS] 块菜单朗读失败:', error)
    Notify.showErrorCommandCannotExecute(t('tts.readFromBlockFailed', undefined, '朗读启动失败'))
  }
}
