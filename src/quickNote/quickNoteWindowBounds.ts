export interface QuickNoteWindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export function clampQuickNoteWindowBounds(
  bounds: QuickNoteWindowBounds,
  minWidth: number,
  minHeight: number,
): QuickNoteWindowBounds {
  const screenW = window.screen.availWidth || window.screen.width
  const screenH = window.screen.availHeight || window.screen.height
  const width = Math.max(minWidth, Math.min(bounds.width, screenW))
  const height = Math.max(minHeight, Math.min(bounds.height, screenH))
  let x = bounds.x
  let y = bounds.y
  if (x + width > screenW) x = Math.max(0, screenW - width)
  if (y + height > screenH) y = Math.max(0, screenH - height)
  if (x < 0) x = 0
  if (y < 0) y = 0
  return { x, y, width, height }
}

export function loadQuickNoteWindowBounds(
  storageKey: string,
  defaults: QuickNoteWindowBounds,
  minWidth: number,
  minHeight: number,
): QuickNoteWindowBounds {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return clampQuickNoteWindowBounds(defaults, minWidth, minHeight)
    const parsed = JSON.parse(raw) as Partial<QuickNoteWindowBounds>
    if (
      typeof parsed.x !== 'number' || typeof parsed.y !== 'number'
      || typeof parsed.width !== 'number' || typeof parsed.height !== 'number'
    ) {
      return clampQuickNoteWindowBounds(defaults, minWidth, minHeight)
    }
    return clampQuickNoteWindowBounds(
      { x: parsed.x, y: parsed.y, width: parsed.width, height: parsed.height },
      minWidth,
      minHeight,
    )
  } catch {
    return clampQuickNoteWindowBounds(defaults, minWidth, minHeight)
  }
}

export function saveQuickNoteWindowBounds(storageKey: string, bounds: QuickNoteWindowBounds): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(bounds))
  } catch {
    // ignore
  }
}

export function readElectronWindowBounds(win: any): QuickNoteWindowBounds | null {
  if (!win || win.isDestroyed?.()) return null
  try {
    const b = win.getBounds?.()
    if (!b) return null
    return { x: b.x, y: b.y, width: b.width, height: b.height }
  } catch {
    return null
  }
}

export function attachQuickNoteWindowBoundsPersistence(
  win: any,
  storageKey: string,
  minWidth: number,
  minHeight: number,
): void {
  if (!win || win.__quickNoteBoundsPersisted) return
  win.__quickNoteBoundsPersisted = true

  const persist = () => {
    const b = readElectronWindowBounds(win)
    if (b) {
      saveQuickNoteWindowBounds(storageKey, clampQuickNoteWindowBounds(b, minWidth, minHeight))
    }
  }

  try {
    win.on?.('move', persist)
    win.on?.('resize', persist)
    win.on?.('close', persist)
    win.on?.('closed', persist)
  } catch {
    // ignore
  }
}
