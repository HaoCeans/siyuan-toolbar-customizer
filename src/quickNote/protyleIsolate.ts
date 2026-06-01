import type { Protyle } from 'siyuan'

type PopoverWsModel = {
  ws?: WebSocket
  send?: (...args: unknown[]) => void
  _qnoteWsIsolated?: boolean
  _qnoteOrigSend?: (...args: unknown[]) => void
}

function noopWsSend(): void {}

function finalizeWsClose(wsModel: PopoverWsModel): void {
  const socket = wsModel.ws
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  try {
    wsModel._qnoteOrigSend?.('closews', {})
    socket.close(1000, 'close websocket quick-note-popover')
  } catch {
    // ignore
  }
}

/** 隔离弹窗内 Protyle 的 WebSocket，防止整篇文档灌入 */
export function isolateQuickNoteProtyleWs(editor: Protyle): void {
  const wsModel = editor.protyle.ws as PopoverWsModel | undefined
  if (!wsModel || wsModel._qnoteWsIsolated) return
  wsModel._qnoteWsIsolated = true

  const origSend = wsModel.send?.bind(wsModel)
  if (origSend) wsModel._qnoteOrigSend = origSend
  wsModel.send = noopWsSend

  const socket = wsModel.ws
  if (!socket) return

  try {
    socket.onmessage = () => {}
    socket.onclose = () => {}
  } catch {
    // ignore
  }

  if (socket.readyState === WebSocket.OPEN) {
    finalizeWsClose(wsModel)
    return
  }
  if (socket.readyState === WebSocket.CONNECTING) {
    socket.addEventListener('open', () => {
      finalizeWsClose(wsModel)
      wsModel.send = noopWsSend
    }, { once: true })
  }
}

export function destroyQuickNoteProtyle(editor: Protyle | null): void {
  if (!editor) return
  try {
    isolateQuickNoteProtyleWs(editor)
  } catch {
    // ignore
  }
  try {
    editor.destroy()
  } catch {
    // ignore
  }
}
