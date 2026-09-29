/**
 * 一键记事保存目标解析（双端共用）。
 *
 * 读取优先级：
 * - 按钮触发（isFromButton=true）且存在临时注入配置（window.__pluginInstance）→ 读临时配置。
 *   executeQuickNote 点击按钮时注入：全局配置拷贝 + __quickNoteButtonTrigger 标记 +
 *   按钮级覆盖项（quickNoteTargetDocId → quickNoteSaveType='document' + quickNoteDocumentId）。
 * - 否则 → 读全局 pluginInstance.mobileFeatureConfig。
 *
 * 注意：保存目标键（quickNoteSaveType/quickNoteNotebookId/quickNoteDocumentId/quickNoteInsertPosition）
 * 虽挂在 mobileFeatureConfig 下，但桌面端「一键记事」设置页写的也是同一组键——
 * 双端统一通道，勿按平台拆分（desktopQuickNoteSettings.ts 可证）。
 *
 * 调用时机约定：此函数必须在「弹窗打开时」调用（executeQuickNote 的 finally 恢复
 * window.__pluginInstance 之前）；弹窗打开后应把返回值快照留存，保存时用快照，
 * 不得在保存回调里重新解析（悬浮窗/块格式窗口踩过，见 DEV_NOTES）。
 */
import { pluginInstance } from '../toolbarManager'

export interface QuickNoteTargetConfig {
  notebookId: string
  documentId: string
  saveType: 'daily' | 'document'
  insertPosition: 'top' | 'bottom'
}

export function resolveQuickNoteTargetConfig(isFromButton: boolean): QuickNoteTargetConfig {
  const tempPlugin = (window as any).__pluginInstance
  let notebookId = ''
  let documentId = ''
  let saveType: 'daily' | 'document' = 'daily'
  let insertPosition: 'top' | 'bottom' = 'bottom'

  if (isFromButton && tempPlugin?.mobileFeatureConfig) {
    const config = tempPlugin.mobileFeatureConfig
    saveType = config.quickNoteSaveType || 'daily'
    insertPosition = config.quickNoteInsertPosition || 'bottom'
    if (saveType === 'document') {
      documentId = config.quickNoteDocumentId || ''
    } else {
      notebookId = config.quickNoteNotebookId || ''
    }
  } else {
    const config = pluginInstance?.mobileFeatureConfig
    saveType = config?.quickNoteSaveType || 'daily'
    insertPosition = config?.quickNoteInsertPosition || 'bottom'
    if (saveType === 'document') {
      documentId = config?.quickNoteDocumentId || ''
    } else {
      notebookId = config?.quickNoteNotebookId || ''
    }
  }

  return {
    notebookId,
    documentId,
    saveType,
    insertPosition,
  }
}
