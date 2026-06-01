import type { QuickNoteSaveTarget } from './kernelBlock'

export const QUICKNOTE_BLOCK_WINDOW_SESSION_KEY = '__quickNoteBlockWindowSession'
export const QUICKNOTE_BLOCK_WINDOW_ELECTRON_ID_KEY = '__quickNoteBlockWindowElectronId'

export interface QuickNoteBlockWindowSession {
  draftBlockId: string
  saveTarget: QuickNoteSaveTarget
  ts: number
}

export function saveQuickNoteBlockWindowSession(
  draftBlockId: string,
  saveTarget: QuickNoteSaveTarget,
): void {
  const payload: QuickNoteBlockWindowSession = {
    draftBlockId,
    saveTarget,
    ts: Date.now(),
  }
  localStorage.setItem(QUICKNOTE_BLOCK_WINDOW_SESSION_KEY, JSON.stringify(payload))
}

export function clearQuickNoteBlockWindowSession(): void {
  localStorage.removeItem(QUICKNOTE_BLOCK_WINDOW_SESSION_KEY)
}
