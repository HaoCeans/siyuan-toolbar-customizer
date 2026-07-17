/**
 * 一键记事 - 输入格式选择字段（电脑端按钮配置 / 手机端全局配置共用）
 */

import type { ButtonConfig } from '../toolbarManager'
import {
  DEFAULT_QUICK_NOTE_INPUT_FORMAT,
  QUICK_NOTE_FORMAT_OPTIONS,
  type QuickNoteInputFormat,
} from '../quickNote/types'
import { createBlockFormatSettingsPlaceholder } from '../quickNote/blockInput'

export interface QuickNoteFormatFieldContext {
  isAuthorToolActivated: () => boolean
}

export interface QuickNoteFormatFieldOptions {
  getFormat: () => QuickNoteInputFormat | undefined
  setFormat: (format: QuickNoteInputFormat) => void
  isAuthorToolActivated: () => boolean
  radioNameSuffix?: string
  onChange?: () => void | Promise<void>
  /** 未激活时点击块格式：电脑端跳版本 Tab，手机端滚动到激活区 */
  onActivationRequired?: () => void
}

function navigateToDesktopActivationTab(): void {
  requestAnimationFrame(() => {
    const activationTab = document.querySelector('button[data-tab="activation"]') as HTMLElement
    activationTab?.click()
  })
}

function navigateToMobileActivationSection(): void {
  setTimeout(() => {
    document.getElementById('whale-toolbox-activation-mobile')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, 100)
}

/**
 * 创建「格式选择」区域（通用）
 */
export function createQuickNoteFormatFieldFromOptions(options: QuickNoteFormatFieldOptions): HTMLElement {
  const {
    getFormat,
    setFormat,
    isAuthorToolActivated,
    radioNameSuffix = '',
    onChange,
    onActivationRequired = navigateToDesktopActivationTab,
  } = options

  const section = document.createElement('div')
  section.style.cssText = 'display: flex; flex-direction: column; gap: 8px;'

  const label = document.createElement('label')
  label.textContent = '③弹窗输入框格式选择'
  label.style.cssText = 'font-size: 14px; font-weight: 600; color: var(--b3-theme-on-background); margin-top: 4px;'
  section.appendChild(label)

  const radioContainer = document.createElement('div')
  radioContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px; margin-top: 2px;'

  const radioName = `quickNoteInputFormat${radioNameSuffix}`
  let currentFormat: QuickNoteInputFormat = getFormat() || DEFAULT_QUICK_NOTE_INPUT_FORMAT

  if (currentFormat === 'block' && !isAuthorToolActivated()) {
    currentFormat = 'plain'
    setFormat('plain')
  }

  const blockPlaceholderHost = document.createElement('div')
  blockPlaceholderHost.style.display = 'none'

  const refreshBlockPlaceholder = () => {
    blockPlaceholderHost.replaceChildren()
    const format = getFormat() || DEFAULT_QUICK_NOTE_INPUT_FORMAT
    if (format === 'block') {
      blockPlaceholderHost.style.display = 'block'
      blockPlaceholderHost.appendChild(createBlockFormatSettingsPlaceholder())
    } else {
      blockPlaceholderHost.style.display = 'none'
    }
  }

  QUICK_NOTE_FORMAT_OPTIONS.forEach((option) => {
    const optionDiv = document.createElement('div')
    optionDiv.style.cssText =
      'display: flex; align-items: center; gap: 10px; padding: 8px; border: 1px solid var(--b3-border-color); border-radius: 6px; cursor: pointer;'

    const radio = document.createElement('input')
    radio.type = 'radio'
    radio.name = radioName
    radio.value = option.value
    radio.checked = currentFormat === option.value
    radio.style.cssText = 'transform: scale(1.2);'

    const labelDiv = document.createElement('div')
    labelDiv.style.cssText = 'flex: 1;'

    const titleEl = document.createElement('div')
    titleEl.textContent = option.label
    titleEl.style.cssText = 'font-size: 13px; font-weight: 500; color: var(--b3-theme-on-background);'

    const descEl = document.createElement('div')
    descEl.textContent = option.description
    descEl.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light); margin-top: 2px;'

    const applySelectedStyle = (selected: boolean) => {
      optionDiv.style.borderColor = selected ? 'var(--b3-theme-primary)' : 'var(--b3-border-color)'
      optionDiv.style.backgroundColor = selected ? 'rgba(59, 130, 246, 0.1)' : 'transparent'
    }

    applySelectedStyle(radio.checked)

    optionDiv.onclick = async () => {
      if (option.requiresActivation && !isAuthorToolActivated()) {
        onActivationRequired()
        return
      }

      radioContainer.querySelectorAll('input[type="radio"]').forEach((r) => {
        ;(r as HTMLInputElement).checked = false
      })
      radioContainer.querySelectorAll(':scope > div').forEach((div) => {
        const el = div as HTMLElement
        el.style.borderColor = 'var(--b3-border-color)'
        el.style.backgroundColor = 'transparent'
      })

      radio.checked = true
      setFormat(option.value)
      optionDiv.style.borderColor = 'var(--b3-theme-primary)'
      optionDiv.style.backgroundColor = 'rgba(59, 130, 246, 0.1)'
      refreshBlockPlaceholder()
      await onChange?.()
    }

    if (option.requiresActivation && !isAuthorToolActivated()) {
      optionDiv.style.opacity = '0.85'
      const lock = document.createElement('span')
      lock.textContent = ' 🔒'
      lock.style.cssText = 'font-size: 12px;'
      titleEl.appendChild(lock)
    }

    labelDiv.appendChild(titleEl)
    labelDiv.appendChild(descEl)
    optionDiv.appendChild(radio)
    optionDiv.appendChild(labelDiv)
    radioContainer.appendChild(optionDiv)
  })

  section.appendChild(radioContainer)
  section.appendChild(blockPlaceholderHost)
  refreshBlockPlaceholder()

  return section
}

/** 电脑端：按钮配置内的一键记事格式选择 */
export function createQuickNoteFormatField(
  button: ButtonConfig,
  context: QuickNoteFormatFieldContext,
  radioNameSuffix = ''
): HTMLElement {
  return createQuickNoteFormatFieldFromOptions({
    getFormat: () => button.quickNoteInputFormat,
    setFormat: (format) => {
      button.quickNoteInputFormat = format
    },
    isAuthorToolActivated: context.isAuthorToolActivated,
    radioNameSuffix,
    onActivationRequired: navigateToDesktopActivationTab,
  })
}

type QuickNoteGlobalFormatContext = {
  mobileFeatureConfig: { quickNoteInputFormat?: QuickNoteInputFormat }
  isAuthorToolActivated: () => boolean
  saveData: (key: string, value: unknown) => Promise<void>
}

/** 手机端：4️⃣ 一键记事弹窗全局格式选择 */
export function createMobileQuickNoteFormatField(context: QuickNoteGlobalFormatContext): HTMLElement {
  return createQuickNoteFormatFieldFromOptions({
    getFormat: () => context.mobileFeatureConfig.quickNoteInputFormat,
    setFormat: (format) => {
      context.mobileFeatureConfig.quickNoteInputFormat = format
    },
    isAuthorToolActivated: context.isAuthorToolActivated,
    radioNameSuffix: '-mobile-global',
    onChange: () => context.saveData('mobileFeatureConfig', context.mobileFeatureConfig),
    onActivationRequired: navigateToMobileActivationSection,
  })
}

/** 电脑端：底部一键记事区格式选择（存储于 mobileFeatureConfig，与手机端共用） */
export function createDesktopGlobalQuickNoteFormatField(context: QuickNoteGlobalFormatContext): HTMLElement {
  return createQuickNoteFormatFieldFromOptions({
    getFormat: () => context.mobileFeatureConfig.quickNoteInputFormat,
    setFormat: (format) => {
      context.mobileFeatureConfig.quickNoteInputFormat = format
    },
    isAuthorToolActivated: context.isAuthorToolActivated,
    radioNameSuffix: '-desktop-global',
    onChange: () => context.saveData('mobileFeatureConfig', context.mobileFeatureConfig),
    onActivationRequired: navigateToDesktopActivationTab,
  })
}

type DesktopQuickNoteFormatContext = {
  desktopFeatureConfig: { quickNoteInputFormat?: QuickNoteInputFormat }
  isAuthorToolActivated: () => boolean
  saveData: (key: string, value: unknown) => Promise<void>
}

/** 电脑端：一键记事格式选择（独立存储于 desktopFeatureConfig） */
export function createDesktopQuickNoteFormatField(context: DesktopQuickNoteFormatContext): HTMLElement {
  return createQuickNoteFormatFieldFromOptions({
    getFormat: () => context.desktopFeatureConfig.quickNoteInputFormat,
    setFormat: (format) => {
      context.desktopFeatureConfig.quickNoteInputFormat = format
    },
    isAuthorToolActivated: context.isAuthorToolActivated,
    radioNameSuffix: '-desktop-independent',
    onChange: () => context.saveData('desktopFeatureConfig', context.desktopFeatureConfig),
    onActivationRequired: navigateToDesktopActivationTab,
  })
}
