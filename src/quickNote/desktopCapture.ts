import { pluginInstance } from '../toolbarManager'
import type { QuickNoteInputHandle } from './inputArea'

/** 从后台唤起思源主窗口（Electron 桌面端） */
export function showSiyuanMainWindow(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ipcRenderer } = require('electron') as { ipcRenderer?: { send: (channel: string, data: unknown) => void } }
    ipcRenderer?.send('siyuan-cmd', 'show')
  } catch {
    // 浏览器端或非 Electron 环境
  }
  try {
    window.focus()
  } catch {
    // ignore
  }
}

/** 发送后最小化思源（可选） */
export function minimizeSiyuanMainWindow(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ipcRenderer } = require('electron') as { ipcRenderer?: { send: (channel: string, data: unknown) => void } }
    ipcRenderer?.send('siyuan-cmd', 'minimize')
  } catch {
    // ignore
  }
}

export function getDesktopQuickNoteCaptureSettings(): {
  globalCaptureEnabled: boolean
  minimizeAfterSend: boolean
  pasteClipboardOnOpen: boolean
  overflowToolbarEnabled: boolean
} {
  const cfg = pluginInstance?.desktopFeatureConfig as {
    quickNoteGlobalCaptureEnabled?: boolean
    quickNoteMinimizeAfterSend?: boolean
    quickNotePasteClipboardOnOpen?: boolean
    quickNoteOverflowToolbarEnabled?: boolean
  } | undefined
  return {
    globalCaptureEnabled: cfg?.quickNoteGlobalCaptureEnabled !== false,
    minimizeAfterSend: cfg?.quickNoteMinimizeAfterSend === true,
    pasteClipboardOnOpen: cfg?.quickNotePasteClipboardOnOpen === true,
    overflowToolbarEnabled: cfg?.quickNoteOverflowToolbarEnabled === true,
  }
}

/** 记事弹窗内是否显示插件扩展工具栏（与思源编辑区主界面扩展工具栏开关独立） */
export function isDesktopQuickNoteOverflowToolbarEnabled(): boolean {
  return getDesktopQuickNoteCaptureSettings().overflowToolbarEnabled
}

export async function pasteClipboardIntoQuickNoteInput(
  inputHandle: QuickNoteInputHandle,
): Promise<void> {
  try {
    const text = await navigator.clipboard.readText()
    if (text.trim()) {
      inputHandle.insertText(text)
    }
  } catch {
    // 无剪贴板权限或为空
  }
}
