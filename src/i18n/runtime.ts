export type I18nMessages = Record<string, string>
export type I18nParams = Record<string, string | number>

let messages: I18nMessages = {}
let locale = 'en'

function normalizeLocale(value?: string): string {
  if (value?.toLowerCase().startsWith('zh')) return 'zh-CN'
  return 'en'
}

function detectLocale(): string {
  const siyuanLang = (window as any)?.siyuan?.config?.lang
  const documentLang = typeof document !== 'undefined' ? document.documentElement.lang : ''
  const browserLang = typeof navigator !== 'undefined' ? navigator.language : ''
  return normalizeLocale(siyuanLang || documentLang || browserLang)
}

export function initializeI18n(nextMessages: I18nMessages | undefined, nextLocale?: string): void {
  messages = nextMessages ?? {}
  locale = normalizeLocale(nextLocale || detectLocale())
}

export function clearI18n(): void {
  messages = {}
  locale = 'en'
}

export function getLocale(): string {
  return locale
}

export function t(key: string, params?: I18nParams, fallback?: string): string {
  const template = messages[key] ?? fallback ?? key
  if (!params) return template

  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = params[name]
    return value === undefined ? placeholder : String(value)
  })
}
