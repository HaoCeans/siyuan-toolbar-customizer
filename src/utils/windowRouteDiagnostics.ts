/**
 * 跨窗口打开文档的路由诊断。
 *
 * 思源主进程处理 siyuan-open-file 时，会遍历所有窗口的 URL hash，
 * 命中目标文档 ID 时把打开请求转给该窗口（app/electron/main.js）。
 * 这里只观察、不改变行为：记录每次打开请求是否被接管，以及各窗口的 hash。
 */

import {
  isLoggingEnabled,
  logger,
} from './logger'

const SIYUAN_GET_CHANNEL = 'siyuan-get'
const SIYUAN_OPEN_FILE_CMD = 'siyuan-open-file'

function readWindowHashIds(win: any): { url: string, ids: string[] } | null {
  try {
    const url = win?.webContents?.getURL?.() || ''
    if (!url) return null
    const ids = decodeURIComponent(new URL(url).hash.substring(1))
      .split('\u200B')
      .filter(Boolean)
    return {
      url,
      ids,
    }
  } catch {
    return null
  }
}

function logWindowCandidates(rootID: string): void {
  let windows: any[] = []
  try {
    windows = require('@electron/remote').BrowserWindow.getAllWindows()
  } catch (error) {
    logger.warn('[路由诊断] 读取窗口列表失败', error)
    return
  }
  for (const win of windows) {
    const info = readWindowHashIds(win)
    if (!info) continue
    logger.log(
      '[路由诊断] 窗口',
      win.id,
      '记事弹窗=',
      (win as any).__qn_block_window === true,
      '可见=',
      win.isVisible?.(),
      '命中目标=',
      info.ids.includes(rootID),
      'hashIds=',
      info.ids,
      'url=',
      info.url,
    )
  }
}

export function installWindowRouteDiagnostics(): void {
  if (typeof window === 'undefined') return
  const globalWindow = window as any
  if (globalWindow.__tcRouteDiagInstalled) return

  let ipc: any
  try {
    ipc = require('electron').ipcRenderer
  } catch {
    // 浏览器环境没有 Electron，直接跳过
    return
  }
  if (!ipc?.invoke) return

  globalWindow.__tcRouteDiagInstalled = true
  const originalInvoke = ipc.invoke.bind(ipc)
  try {
    ipc.invoke = async (channel: string, ...args: any[]) => {
      const result = await originalInvoke(channel, ...args)
      try {
        if (isLoggingEnabled() && channel === SIYUAN_GET_CHANNEL && args[0]?.cmd === SIYUAN_OPEN_FILE_CMD) {
          const rawOptions = args[0].options
          const options = typeof rawOptions === 'string' ? JSON.parse(rawOptions) : rawOptions
          const rootID = options?.rootID || ''
          logger.log('[路由诊断] 打开文档', rootID, '被其他窗口接管:', result === true)
          if (rootID) logWindowCandidates(rootID)
        }
      } catch (error) {
        logger.warn('[路由诊断] 记录打开请求失败', error)
      }
      return result
    }
  } catch (error) {
    globalWindow.__tcRouteDiagInstalled = false
    logger.warn('[路由诊断] 无法包装 ipcRenderer.invoke', error)
    return
  }
  logger.log('[路由诊断] 已安装，开启插件调试日志后记录跨窗口路由')
}
