/**
 * 通知管理模块
 * 统一管理所有通知消息，方便查看和修改
 */

import { showMessage } from "siyuan"
import { t } from "./i18n/runtime"

// ===== 通知配置常量 =====

/** 通知显示时长（毫秒） */
export const NOTIFICATION_DURATION = {
  /** 短提示（1秒） */
  SHORT: 1000,
  /** 普通提示（1.5秒） */
  NORMAL: 1500,
  /** 长提示（2秒） */
  LONG: 2000,
  /** 错误提示（3秒） */
  ERROR: 3000
} as const

/** 通知类型 */
export type NotificationType = 'info' | 'warning' | 'error'

// ===== 按钮执行通知 =====

/**
 * 显示按钮执行通知
 * @param buttonName 按钮名称
 * @param enabled 是否启用通知
 */
export function showButtonExecNotification(buttonName: string, enabled: boolean): void {
  if (enabled) {
    showMessage(t('notification.buttonExecuted', { buttonName }), NOTIFICATION_DURATION.NORMAL, 'info')
  }
}

// ===== 扩展工具栏通知 =====

/**
 * 显示扩展工具栏已打开通知
 * @param layers 层数
 * @param enabled 是否启用通知
 */
export function showOverflowToolbarOpened(layers: number, enabled: boolean = true): void {
  if (enabled) {
    showMessage(t('notification.overflowToolbarOpened', { layers }), NOTIFICATION_DURATION.SHORT, 'info')
  }
}

/**
 * 显示扩展工具栏已关闭通知
 * @param enabled 是否启用通知
 */
export function showOverflowToolbarClosed(enabled: boolean = true): void {
  if (enabled) {
    showMessage(t('notification.overflowToolbarClosed'), NOTIFICATION_DURATION.SHORT, 'info')
  }
}

// ===== 错误通知 =====

/**
 * 显示按钮未配置功能ID错误
 * @param buttonName 按钮名称
 */
export function showErrorButtonNotConfigured(buttonName: string): void {
  showMessage(t('notification.buttonNotConfigured', { buttonName }), NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示未找到功能错误
 * @param builtinId 功能ID
 */
export function showErrorBuiltinNotFound(builtinId: string): void {
  showMessage(t('notification.builtinNotFound', { builtinId }), NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示按钮未配置模板内容错误
 * @param buttonName 按钮名称
 */
export function showErrorTemplateNotConfigured(buttonName: string): void {
  showMessage(t('notification.templateNotConfigured', { buttonName }), NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示编辑器未聚焦提示
 */
export function showInfoEditorNotFocused(): void {
  showMessage(t('notification.editorNotFocused'), NOTIFICATION_DURATION.ERROR, 'info')
}

/**
 * 显示插入模板失败错误
 */
export function showErrorInsertTemplateFailed(): void {
  showMessage(t('notification.insertTemplateFailed'), NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示按钮未配置点击序列错误
 * @param buttonName 按钮名称
 */
export function showErrorClickSequenceNotConfigured(buttonName: string): void {
  showMessage(t('notification.clickSequenceNotConfigured', { buttonName }), NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示点击序列步骤失败错误
 * @param step 步骤号（从1开始）
 * @param selector 选择器
 */
export function showErrorClickSequenceStepFailed(step: number, selector: string): void {
  showMessage(t('notification.clickSequenceStepFailed', { step, selector }), NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示按钮未配置快捷键错误
 * @param buttonName 按钮名称
 */
export function showErrorShortcutNotConfigured(buttonName: string): void {
  showMessage(t('notification.shortcutNotConfigured', { buttonName }), NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示快捷键可能无效警告
 * @param shortcutKey 快捷键
 */
export function showWarningShortcutMaybeInvalid(shortcutKey: string): void {
  showMessage(t('notification.shortcutMaybeInvalid', { shortcutKey }), NOTIFICATION_DURATION.LONG, 'info')
}

/**
 * 显示无法解析快捷键错误
 * @param shortcutKey 快捷键
 */
export function showErrorShortcutCannotParse(shortcutKey: string): void {
  showMessage(t('notification.shortcutCannotParse', { shortcutKey }), NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示执行快捷键失败错误
 * @param shortcutKey 快捷键
 * @param error 错误信息
 */
export function showErrorShortcutFailed(shortcutKey: string, error: unknown): void {
  showMessage(t('notification.shortcutFailed', { shortcutKey, error: String(error) }), NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示无法执行命令错误
 * @param command 命令名
 */
export function showErrorCommandCannotExecute(command: string): void {
  showMessage(t('notification.commandCannotExecute', { command }), NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示脚本执行失败错误
 * @param error 错误信息
 */
export function showErrorScriptFailed(error: unknown): void {
  showMessage(t('notification.scriptFailed', { error: String(error) }), NOTIFICATION_DURATION.ERROR, 'error')
}

// ===== 日记相关通知 =====

/**
 * 显示已打开日记并跳转到底部通知
 */
export function showInfoDiaryOpenedAndScrolled(): void {
  showMessage(t('notification.diaryOpenedAndScrolled'), NOTIFICATION_DURATION.NORMAL, 'info')
}

/**
 * 显示日记已打开通知
 */
export function showInfoDiaryOpened(): void {
  showMessage(t('notification.diaryOpened'), NOTIFICATION_DURATION.NORMAL, 'info')
}

/**
 * 显示打开日记失败错误
 * @param error 错误信息
 */
export function showErrorDiaryFailed(error: unknown): void {
  showMessage(t('notification.diaryFailed', { error: String(error) }), NOTIFICATION_DURATION.ERROR, 'error')
}

// ===== 复制相关通知 =====

/**
 * 显示复制成功通知
 */
export function showInfoCopySuccess(): void {
  showMessage(t('notification.copySuccess'), NOTIFICATION_DURATION.NORMAL, 'info')
}

/**
 * 显示模板已插入通知（移动端一键记事弹窗内）
 * @param enabled 是否启用通知
 */
export function showInfoTemplateInserted(enabled: boolean = true): void {
  if (!enabled) return
  
  const successMsg = document.createElement('div')
  successMsg.textContent = t('notification.templateInserted')
  successMsg.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #4CAF50;
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    z-index: 100001;
    font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `
  document.body.appendChild(successMsg)
  
  setTimeout(() => {
    if (successMsg.parentNode) {
      successMsg.parentNode.removeChild(successMsg)
    }
  }, 2000)
}

/**
 * 显示成功通知
 */
export function showSuccess(message: string): void {
  showMessage(message, NOTIFICATION_DURATION.NORMAL, 'info')
}

/**
 * 显示已复制内容通知
 * @param content 被复制的内容
 */
export function showInfoCopied(content: string): void {
  showMessage(t('notification.copied', { content }), NOTIFICATION_DURATION.NORMAL, 'info')
}

/**
 * 显示复制失败错误
 */
export function showErrorCopyFailed(): void {
  showMessage(t('notification.copyFailed'), NOTIFICATION_DURATION.ERROR, 'error')
}

// ===== 数据库悬浮弹窗通知 =====

/**
 * 显示无法获取数据库ID错误
 */
export function showErrorCannotGetDatabaseId(): void {
  showMessage(t('notification.cannotGetDatabaseId'), NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示获取数据库信息失败错误
 */
export function showErrorDatabaseInfoFailed(): void {
  showMessage(t('notification.databaseInfoFailed'), NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示获取数据失败错误
 */
export function showErrorDataFetchFailed(): void {
  showMessage(t('notification.dataFetchFailed'), NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示查询失败错误
 * @param error 错误信息
 */
export function showErrorQueryFailed(error: unknown): void {
  showMessage(t('notification.queryFailed', { error: String(error instanceof Error ? error.message : error) }), NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示没有数据提示
 */
export function showInfoNoData(): void {
  showMessage(t('notification.noData'), NOTIFICATION_DURATION.ERROR, 'info')
}

// ===== 设置界面通知 =====

/**
 * 显示已开启所有按钮提示通知
 */
export function showInfoNotificationEnabled(): void {
  showMessage(t('notification.allButtonTipsEnabled'), NOTIFICATION_DURATION.NORMAL, 'info')
}

/**
 * 显示已关闭所有按钮提示通知
 */
export function showInfoNotificationDisabled(): void {
  showMessage(t('notification.allButtonTipsDisabled'), NOTIFICATION_DURATION.NORMAL, 'info')
}

/**
 * 显示通知开关状态通知
 * @param enabled 是否启用
 */
export function showNotificationToggleStatus(enabled: boolean): void {
  showMessage(enabled ? t('notification.allButtonTipsEnabled') : t('notification.allButtonTipsDisabled'), NOTIFICATION_DURATION.NORMAL, 'info')
}

// ===== 设置界面相关通知 =====

/**
 * 显示配置已修改提示（需要保存生效）
 * @param configName 配置名称
 */
export function showInfoConfigModified(configName: string): void {
  showMessage(t('notification.configModified', { configName }), NOTIFICATION_DURATION.NORMAL, 'info')
}

/**
 * 显示图标大小已修改提示
 */
export function showInfoIconSizeModified(): void {
  showMessage(t('notification.iconSizeModified'), NOTIFICATION_DURATION.NORMAL, 'info')
}

/**
 * 显示按钮宽度已修改提示
 */
export function showInfoButtonWidthModified(): void {
  showMessage(t('notification.buttonWidthModified'), NOTIFICATION_DURATION.NORMAL, 'info')
}

/**
 * 显示右边距已修改提示
 */
export function showInfoMarginRightModified(): void {
  showMessage(t('notification.marginRightModified'), NOTIFICATION_DURATION.NORMAL, 'info')
}

export function showInfoExternalButtonsReserveWidthModified(): void {
  showMessage(t('notification.externalButtonsReserveWidthModified'), NOTIFICATION_DURATION.NORMAL, 'info')
}

// ===== 作者工具通知 =====

/**
 * 显示作者工具已激活通知（旧版兼容，建议改用 showLicenseActivated）
 */
export function showInfoAuthorToolActivated(): void {
  showMessage(t('notification.authorToolActivated'), NOTIFICATION_DURATION.ERROR, 'info')
}

/**
 * 显示激活码错误通知（按失败原因给出更具体的提示）
 * @param reason 失败原因（来自 ValidationResult.reason）
 */
export function showErrorActivationCodeInvalid(reason?: string): void {
  let msg = t('notification.activationCodeInvalid')
  switch (reason) {
    case 'format':
      msg = t('notification.activationCodeInvalidFormat')
      break
    case 'plan':
      msg = t('notification.activationCodeInvalidPlan')
      break
    case 'date':
      msg = t('notification.activationCodeInvalidDate')
      break
    case 'signature':
      msg = t('notification.activationCodeInvalidSignature')
      break
    case 'account':
      msg = t('notification.activationCodeInvalidAccount')
      break
    case 'expired':
      msg = t('notification.activationCodeExpired')
      break
    case 'trial_used':
      msg = t('notification.activationCodeTrialUsed')
      break
  }
  showMessage(msg, NOTIFICATION_DURATION.ERROR, 'error')
}

// ===== 授权状态通知（试用/月卡/永久/过期）=====

/**
 * 显示试用期已开始通知
 * @param daysLeft 剩余试用天数（不含宽限期）
 */
export function showTrialStarted(daysLeft: number): void {
  showMessage(t('notification.trialStarted', { daysLeft }), NOTIFICATION_DURATION.LONG, 'info')
}

/**
 * 显示试用期已结束通知（点击付费按钮时触发）
 */
export function showTrialExpired(): void {
  showMessage(t('notification.trialExpired'), NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示激活已过期通知（点击付费按钮时触发，月卡过期）
 */
export function showLicenseExpired(): void {
  showMessage(t('notification.licenseExpired'), NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示激活即将过期提醒（剩余 ≤ 3 天时，每天最多提示一次）
 * @param daysLeft 剩余天数（含宽限期）
 */
export function showLicenseExpiringSoon(daysLeft: number): void {
  showMessage(t('notification.licenseExpiringSoon', { daysLeft }), NOTIFICATION_DURATION.LONG, 'info')
}

/**
 * 显示需要激活通知（点击付费按钮但未激活/未试用时触发）
 */
export function showActivationRequired(): void {
  showMessage(t('notification.activationRequired'), NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示激活成功通知（含套餐信息）
 * @param planText 套餐文案（"免费试用" / "月卡" / "永久"）
 * @param daysLeftText 剩余天数文案（"3 天" / "30 天" / "永久"）
 */
export function showLicenseActivated(planText: string, daysLeftText: string | number): void {
  const daysStr = typeof daysLeftText === 'number'
    ? t('notification.days', { days: daysLeftText })
    : daysLeftText
  showMessage(t('notification.licenseActivated', { planText, daysLeft: daysStr }), NOTIFICATION_DURATION.ERROR, 'info')
}

// ===== 桌面端设置通知 =====

/**
 * 显示全局配置启用状态通知
 * @param enabled 是否启用全局配置
 */
export function showGlobalConfigEnabledStatus(enabled: boolean): void {
  showMessage(enabled ? t('notification.globalConfigEnabled') : t('notification.globalConfigDisabled'), NOTIFICATION_DURATION.NORMAL, 'info')
}

/**
 * 显示图标大小已应用通知
 */
export function showInfoIconSizeApplied(): void {
  showMessage(t('notification.iconSizeApplied'), NOTIFICATION_DURATION.NORMAL, 'info')
}

/**
 * 显示按钮宽度已应用通知
 */
export function showInfoButtonWidthApplied(): void {
  showMessage(t('notification.buttonWidthApplied'), NOTIFICATION_DURATION.NORMAL, 'info')
}

/**
 * 显示右边距已应用通知
 */
export function showInfoMarginRightApplied(): void {
  showMessage(t('notification.marginRightApplied'), NOTIFICATION_DURATION.NORMAL, 'info')
}
