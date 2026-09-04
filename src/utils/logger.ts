let enabled = false

function write(method: 'log' | 'warn' | 'error', args: unknown[]): void {
  if (!enabled) return
  console[method]('[ToolbarCustomizer]', ...args)
}

export function setLoggingEnabled(value: boolean): void {
  enabled = value === true
}

export function isLoggingEnabled(): boolean {
  return enabled
}

export const logger = {
  log: (...args: unknown[]) => write('log', args),
  warn: (...args: unknown[]) => write('warn', args),
  error: (...args: unknown[]) => write('error', args),
}
