import type { QuickNoteInputHandle } from './inputArea'

let activeQuickNoteInput: QuickNoteInputHandle | null = null

export function setActiveQuickNoteInput(handle: QuickNoteInputHandle | null): void {
  activeQuickNoteInput = handle
}

export function getActiveQuickNoteInput(): QuickNoteInputHandle | null {
  return activeQuickNoteInput
}

export function destroyActiveQuickNoteInput(): void {
  activeQuickNoteInput?.destroy()
  activeQuickNoteInput = null
}
