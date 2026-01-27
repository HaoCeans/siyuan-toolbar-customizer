/**
 * 通知管理模块
 * 统一管理所有通知消息，方便查看和修改
 */

import { showMessage } from "siyuan"

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
    showMessage(`执行: ${buttonName}`, NOTIFICATION_DURATION.NORMAL, 'info')
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
    showMessage(`扩展工具栏已弹出（${layers}层）`, NOTIFICATION_DURATION.SHORT, 'info')
  }
}

/**
 * 显示扩展工具栏已关闭通知
 * @param enabled 是否启用通知
 */
export function showOverflowToolbarClosed(enabled: boolean = true): void {
  if (enabled) {
    showMessage('扩展工具栏已关闭', NOTIFICATION_DURATION.SHORT, 'info')
  }
}

// ===== 错误通知 =====

/**
 * 显示按钮未配置功能ID错误
 * @param buttonName 按钮名称
 */
export function showErrorButtonNotConfigured(buttonName: string): void {
  showMessage(`按钮"${buttonName}"未配置功能ID`, NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示未找到功能错误
 * @param builtinId 功能ID
 */
export function showErrorBuiltinNotFound(builtinId: string): void {
  showMessage(`未找到功能: ${builtinId}`, NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示按钮未配置模板内容错误
 * @param buttonName 按钮名称
 */
export function showErrorTemplateNotConfigured(buttonName: string): void {
  showMessage(`按钮"${buttonName}"未配置模板内容`, NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示编辑器未聚焦提示
 */
export function showInfoEditorNotFocused(): void {
  showMessage('请先聚焦到编辑器', NOTIFICATION_DURATION.ERROR, 'info')
}

/**
 * 显示插入模板失败错误
 */
export function showErrorInsertTemplateFailed(): void {
  showMessage('插入模板失败，请确保编辑器处于可编辑状态', NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示按钮未配置点击序列错误
 * @param buttonName 按钮名称
 */
export function showErrorClickSequenceNotConfigured(buttonName: string): void {
  showMessage(`按钮"${buttonName}"未配置点击序列`, NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示点击序列步骤失败错误
 * @param step 步骤号（从1开始）
 * @param selector 选择器
 */
export function showErrorClickSequenceStepFailed(step: number, selector: string): void {
  showMessage(`点击序列失败: 步骤 ${step} - ${selector}`, NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示按钮未配置快捷键错误
 * @param buttonName 按钮名称
 */
export function showErrorShortcutNotConfigured(buttonName: string): void {
  showMessage(`按钮"${buttonName}"未配置快捷键`, NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示快捷键可能无效警告
 * @param shortcutKey 快捷键
 */
export function showWarningShortcutMaybeInvalid(shortcutKey: string): void {
  showMessage(`快捷键可能无效: ${shortcutKey}`, NOTIFICATION_DURATION.LONG, 'warning')
}

/**
 * 显示无法解析快捷键错误
 * @param shortcutKey 快捷键
 */
export function showErrorShortcutCannotParse(shortcutKey: string): void {
  showMessage(`无法解析快捷键: ${shortcutKey}`, NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示执行快捷键失败错误
 * @param shortcutKey 快捷键
 * @param error 错误信息
 */
export function showErrorShortcutFailed(shortcutKey: string, error: unknown): void {
  showMessage(`执行快捷键失败: ${shortcutKey} - ${error}`, NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示无法执行命令错误
 * @param command 命令名
 */
export function showErrorCommandCannotExecute(command: string): void {
  showMessage(`无法执行命令: ${command}`, NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示脚本执行失败错误
 * @param error 错误信息
 */
export function showErrorScriptFailed(error: unknown): void {
  showMessage(`执行脚本失败: ${error}`, NOTIFICATION_DURATION.ERROR, 'error')
}

// ===== 日记相关通知 =====

/**
 * 显示已打开日记并跳转到底部通知
 */
export function showInfoDiaryOpenedAndScrolled(): void {
  showMessage('已打开日记并跳转到底部', NOTIFICATION_DURATION.NORMAL, 'info')
}

/**
 * 显示日记已打开通知
 */
export function showInfoDiaryOpened(): void {
  showMessage('日记已打开', NOTIFICATION_DURATION.NORMAL, 'info')
}

/**
 * 显示打开日记失败错误
 * @param error 错误信息
 */
export function showErrorDiaryFailed(error: unknown): void {
  showMessage(`❌ 打开日记失败: ${error}`, NOTIFICATION_DURATION.ERROR, 'error')
}

// ===== 复制相关通知 =====

/**
 * 显示复制成功通知
 */
export function showInfoCopySuccess(): void {
  showMessage(`复制成功`, NOTIFICATION_DURATION.NORMAL, 'info')
}

/**
 * 显示已复制内容通知
 * @param content 被复制的内容
 */
export function showInfoCopied(content: string): void {
  showMessage(`已复制: ${content}`, NOTIFICATION_DURATION.NORMAL, 'info')
}

/**
 * 显示复制失败错误
 */
export function showErrorCopyFailed(): void {
  showMessage(`复制失败`, NOTIFICATION_DURATION.ERROR, 'error')
}

// ===== 数据库查询通知 =====

/**
 * 显示无法获取数据库ID错误
 */
export function showErrorCannotGetDatabaseId(): void {
  showMessage('❌ 无法获取数据库ID，请检查配置', NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示获取数据库信息失败错误
 */
export function showErrorDatabaseInfoFailed(): void {
  showMessage('❌ 获取数据库信息失败', NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示获取数据失败错误
 */
export function showErrorDataFetchFailed(): void {
  showMessage('❌ 获取数据失败', NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示查询失败错误
 * @param error 错误信息
 */
export function showErrorQueryFailed(error: unknown): void {
  showMessage(`❌ 查询失败: ${error instanceof Error ? error.message : error}`, NOTIFICATION_DURATION.ERROR, 'error')
}

/**
 * 显示没有数据提示
 */
export function showInfoNoData(): void {
  showMessage('没有数据', NOTIFICATION_DURATION.ERROR, 'info')
}

// ===== 设置界面通知 =====

/**
 * 显示已开启所有按钮提示通知
 */
export function showInfoNotificationEnabled(): void {
  showMessage('已开启所有按钮提示', NOTIFICATION_DURATION.NORMAL, 'info')
}

/**
 * 显示已关闭所有按钮提示通知
 */
export function showInfoNotificationDisabled(): void {
  showMessage('已关闭所有按钮提示', NOTIFICATION_DURATION.NORMAL, 'info')
}

/**
 * 显示通知开关状态通知
 * @param enabled 是否启用
 */
export function showNotificationToggleStatus(enabled: boolean): void {
  showMessage(enabled ? '已开启所有按钮提示' : '已关闭所有按钮提示', NOTIFICATION_DURATION.NORMAL, 'info')
}

// ===== 设置界面相关通知 =====

/**
 * 显示配置已修改提示（需要保存生效）
 * @param configName 配置名称
 */
export function showInfoConfigModified(configName: string): void {
  showMessage(`${configName}已修改，请点击保存生效`, NOTIFICATION_DURATION.NORMAL, 'info')
}

/**
 * 显示图标大小已修改提示
 */
export function showInfoIconSizeModified(): void {
  showMessage('图标大小已修改，请点击保存生效', NOTIFICATION_DURATION.NORMAL, 'info')
}

/**
 * 显示按钮宽度已修改提示
 */
export function showInfoButtonWidthModified(): void {
  showMessage('按钮宽度已修改，请点击保存生效', NOTIFICATION_DURATION.NORMAL, 'info')
}

/**
 * 显示右边距已修改提示
 */
export function showInfoMarginRightModified(): void {
  showMessage('右边距已修改，请点击保存生效', NOTIFICATION_DURATION.NORMAL, 'info')
}

// ===== 作者工具通知 =====

/**
 * 显示作者工具已激活通知
 */
export function showInfoAuthorToolActivated(): void {
  showMessage('作者自用工具已激活！请重新打开设置页面', NOTIFICATION_DURATION.ERROR, 'success')
}

/**
 * 显示激活码错误通知
 */
export function showErrorActivationCodeInvalid(): void {
  showMessage('激活码错误，请重试', NOTIFICATION_DURATION.ERROR, 'error')
}

// ===== 桌面端设置通知 =====

/**
 * 显示图标大小已应用通知
 */
export function showInfoIconSizeApplied(): void {
  showMessage('图标大小已应用到所有按钮', NOTIFICATION_DURATION.NORMAL, 'info')
}

/**
 * 显示按钮宽度已应用通知
 */
export function showInfoButtonWidthApplied(): void {
  showMessage('按钮宽度已应用到所有按钮', NOTIFICATION_DURATION.NORMAL, 'info')
}

/**
 * 显示右边距已应用通知
 */
export function showInfoMarginRightApplied(): void {
  showMessage('右边距已应用到所有按钮', NOTIFICATION_DURATION.NORMAL, 'info')
}
