import { isMobileDevice, pluginInstance, setPluginInstance, showPopupSelectDialog, processTemplateVariables, getToolbarAvailableWidth, getButtonWidth, showTemplateContextMenu } from './toolbarManager';
import * as Notify from './notification';
import { createQuickNoteInputArea, insertTextIntoQuickNoteDialog, type QuickNoteInputHandle } from './quickNote/inputArea';
import { resolveQuickNoteInputFormat } from './quickNote/resolveFormat';
import { getQuickNoteFontSize } from './quickNote/fontSize';
import { saveQuickNoteContent } from './quickNote/saveContent';
import { destroyActiveQuickNoteInput, getActiveQuickNoteInput, setActiveQuickNoteInput } from './quickNote/session';
import {
  getDesktopQuickNoteCaptureSettings,
  isDesktopQuickNoteOverflowToolbarEnabled,
  minimizeSiyuanMainWindow,
  pasteClipboardIntoQuickNoteInput,
} from './quickNote/desktopCapture';
import {
  shouldUseQuickNoteFloatWindow,
  toggleQuickNoteFloatWindow,
  type QuickNoteFloatSaveResult,
} from './quickNote/quickNoteFloatWindow';
import {
  openDesktopQuickNoteBlockWindow,
  shouldUseDesktopQuickNoteBlockWindow,
  toggleDesktopQuickNoteBlockWindow,
} from './quickNote/quickNoteBlockWindow';
import { createQuoteOverlay } from './quickNote/quoteOverlay';

export type QuickNoteOpenSource = 'auto' | 'button' | 'globalHotkey';

// 存储当前的事件监听器，以便可以移除
let visibilityChangeListener: (() => void) | null = null;

// 记录最后显示弹窗的时间戳（用于简单防抖）
let lastDialogShowTime = 0;
// 弹窗关闭后的冷却时间（3秒内不重复弹）
const DIALOG_COOLDOWN_MS = 3000;
// 弹窗显示后的防抖时间（3秒内不重复触发）
const DIALOG_SHOW_DEBOUNCE_MS = 3000;

// 存储弹窗相关的定时器 ID，用于清理
let dialogFocusTimer: ReturnType<typeof setTimeout> | null = null;
let dialogBuiltinCloseTimer: ReturnType<typeof setTimeout> | null = null;

// 弹窗保护机制：防止刚显示的弹窗被立即关闭
let dialogOpenTime = 0;
// 弹窗显示后的保护期（毫秒），保护期内不会被后台事件自动关闭
const DIALOG_PROTECTION_MS = 500;

// 记录弹窗当前是否正在显示（防止重复弹出）
let isNoteDialogShowing = false;
let isQuickNoteDialogMinimized = false;
// 弹窗正在异步创建中（createQuickNoteInputArea 完成前 DOM 尚未挂载）
let isNoteDialogOpening = false;
// 记录切后台时输入框是否正有焦点（用于切回前台时决定是否恢复输入法）
let wasQuickNoteInputFocused = false;
// 自动触发时弹窗在后台创建，标记需要初始聚焦（等切回前台时执行）
let needsInitialFocus = false;
// 切后台时保存的光标位置（用于切回后恢复）
let savedCursorPos: { start: number; end: number } | null = null;
let savedBlockRange: Range | null = null;

// 高度变化检测定时器 ID（已弃用，保留用于向后兼容清理）
let heightCheckTimer: ReturnType<typeof setInterval> | null = null;

// 金句占位 overlay 清理句柄
let quoteOverlayCleanup: (() => void) | null = null;

function isQuickNoteToggleSource(source: QuickNoteOpenSource): boolean {
  return source === 'button' || source === 'globalHotkey';
}

function resolveQuickNoteTargetConfig(isFromButton: boolean): {
  notebookId: string;
  documentId: string;
  saveType: 'daily' | 'document';
  insertPosition: 'top' | 'bottom';
} {
  const tempPlugin = (window as any).__pluginInstance;
  let notebookId = '';
  let documentId = '';
  let saveType: 'daily' | 'document' = 'daily';
  let insertPosition: 'top' | 'bottom' = 'bottom';

  if (isFromButton && tempPlugin?.mobileFeatureConfig) {
    const config = tempPlugin.mobileFeatureConfig;
    saveType = config.quickNoteSaveType || 'daily';
    insertPosition = config.quickNoteInsertPosition || 'bottom';
    if (saveType === 'document') {
      documentId = config.quickNoteDocumentId || '';
    } else {
      notebookId = config.quickNoteNotebookId || '';
    }
  } else {
    const config = pluginInstance?.mobileFeatureConfig;
    saveType = config?.quickNoteSaveType || 'daily';
    insertPosition = config?.quickNoteInsertPosition || 'bottom';
    if (saveType === 'document') {
      documentId = config?.quickNoteDocumentId || '';
    } else {
      notebookId = config?.quickNoteNotebookId || '';
    }
  }

  return { notebookId, documentId, saveType, insertPosition };
}

function setupDesktopCaptureInteraction(
  dialog: HTMLElement,
  inputHandle: QuickNoteInputHandle,
  saveBtn: HTMLButtonElement,
  cancelBtn: HTMLButtonElement,
): void {
  const focusInput = () => inputHandle.focus();
  if (dialogFocusTimer) {
    clearTimeout(dialogFocusTimer);
  }
  dialogFocusTimer = setTimeout(() => {
    focusInput();
    dialogFocusTimer = null;
  }, 100);

  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelBtn.click();
    }
  });

  if (inputHandle.isPlainTextarea()) {
    const textarea = inputHandle.element.querySelector('textarea') as HTMLTextAreaElement | null;
    if (!textarea) return;
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        saveBtn.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelBtn.click();
      }
    });
  }
}

/**
 * 检测当前是否为暗黑模式
 * 优先检测系统级暗黑（WebView 在系统暗色时会对白色元素做颜色反转），
 * 再检测思源主题背景色亮度，任一为暗则返回 true。
 */
function isSiyuanDarkMode(): boolean {
  // 系统级暗黑模式：WebView 强制暗色会把 white 反转为黑色，
  // 导致遮罩（灰色）与卡片内容（白色→黑色）颜色撕裂，必须一并感知
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return true;
  }
  const style = getComputedStyle(document.documentElement);
  const bg = style.getPropertyValue('--b3-theme-background').trim();
  if (bg.startsWith('#')) {
    const r = parseInt(bg.slice(1, 3), 16);
    const g = parseInt(bg.slice(3, 5), 16);
    const b = parseInt(bg.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 < 128;
  }
  if (bg.startsWith('rgb')) {
    const match = bg.match(/(\d+)/g);
    if (match && match.length >= 3) {
      return (parseInt(match[0]) * 299 + parseInt(match[1]) * 587 + parseInt(match[2]) * 114) / 1000 < 128;
    }
  }
  return false;
}

/**
 * 检查应用是否在前台
 * 使用 Page Visibility API 检测应用是否可见
 */
function isAppInForeground(): boolean {
  return !document.hidden;  // 如果 document.hidden 为 false，说明在前台
}

/**
 * 显示小窗模式提示
 * 当检测到从后台切换到前台时显示全屏居中提示
 */
async function showSmallWindowTip() {
  // 检查是否禁用了自定义按钮（恢复原始状态），如果是则不显示一键记事弹窗
  const tempPlugin = (window as any).__pluginInstance;
  let disableCustomButtons = false;
  
  if (tempPlugin?.mobileFeatureConfig) {
    // 优先检查临时配置（按钮触发时设置的）
    disableCustomButtons = tempPlugin.mobileFeatureConfig.disableCustomButtons || false;
  } else {
    // 使用全局配置
    disableCustomButtons = pluginInstance?.mobileFeatureConfig?.disableCustomButtons || false;
  }
  
  if (disableCustomButtons) {
    return;
  }

  // 检查是否已经有弹窗存在
  const existingTip = document.querySelector('#small-window-tip-dialog');
  if (existingTip) {
    existingTip.remove();
  }

  // 优先使用临时配置（按钮触发时设置的），否则使用全局配置
  const isFromButton = !!(tempPlugin?.mobileFeatureConfig?.__quickNoteButtonTrigger);
  const { notebookId, documentId, saveType, insertPosition } = resolveQuickNoteTargetConfig(isFromButton);

  await showSiyuanEditorDialog(
    notebookId,
    documentId,
    saveType,
    insertPosition,
    isFromButton ? 'button' : 'auto',
  );
}

async function toggleMinimizeQuickNoteDialog(dialog: HTMLElement): Promise<void> {
  if (isQuickNoteDialogMinimized) {
    dialog.style.display = '';
    isQuickNoteDialogMinimized = false;
    isNoteDialogShowing = true;
    try {
      getActiveQuickNoteInput()?.focus();
    } catch {
      // ignore
    }
    return;
  }
  dialog.style.display = 'none';
  isQuickNoteDialogMinimized = true;
}

async function toggleCloseQuickNoteDialog(dialog: HTMLElement): Promise<void> {
  const isMobileDialog = dialog.id === 'quick-note-dialog';
  await teardownQuickNoteDialog(dialog, isMobileDialog);
  lastDialogShowTime = Date.now();
}

// 思源原生编辑器弹窗（路由函数）
async function showSiyuanEditorDialog(
  notebookId: string,
  documentId?: string,
  saveType: 'daily' | 'document' = 'daily',
  insertPosition: 'top' | 'bottom' = 'bottom',
  source: QuickNoteOpenSource = 'auto',
) {
  const existingDialog = getQuickNoteDialogElement();
  if (existingDialog) {
    if (isQuickNoteToggleSource(source)) {
      await toggleMinimizeQuickNoteDialog(existingDialog);
    }
    return;
  }

  if (isNoteDialogOpening) {
    return;
  }

  isNoteDialogOpening = true;
  try {
    if (isMobileDevice()) {
      const isFromButton = source === 'button';
      await showNoteInputDialogMobile(notebookId, documentId, saveType, insertPosition, isFromButton);
    } else {
      await showNoteInputDialogDesktop(notebookId, documentId, saveType, insertPosition, source);
    }
  } finally {
    isNoteDialogOpening = false;
  }
}

async function runQuickNoteSave(
  inputHandle: QuickNoteInputHandle,
  notebookId: string,
  documentId: string | undefined,
  saveType: 'daily' | 'document',
  insertPosition: 'top' | 'bottom',
  isFromButton: boolean,
): Promise<boolean> {
  const payload = await inputHandle.getContent();
  if (!payload) return false;

  if (saveType === 'document' && !documentId) {
    const tipPrefix = isFromButton ? '【按钮】' : '【自启动一键记事】';
    alert(`⚠️ 请先在${tipPrefix}设置中，配置文档ID`);
    return false;
  }
  if (saveType === 'daily' && !notebookId) {
    const tipPrefix = isFromButton ? '【按钮】' : '【自启动一键记事】';
    alert(`⚠️ 请先在${tipPrefix}设置中，配置笔记本ID`);
    return false;
  }

  try {
    let ok = false;
    if (payload.format === 'block' && inputHandle.saveToTarget) {
      ok = await inputHandle.saveToTarget();
    } else {
      ok = await saveQuickNoteContent(payload, {
        saveType,
        notebookId,
        documentId,
        insertPosition,
      });
    }
    if (!ok) {
      alert('保存失败，请重试');
    }
    return ok;
  } catch {
    alert('记事保存失败，请重试');
    return false;
  }
}

async function cancelQuickNoteDialog(inputHandle: QuickNoteInputHandle | null): Promise<void> {
  if (inputHandle?.cancelDraft) {
    await inputHandle.cancelDraft();
  }
}

function getQuickNoteDialogElement(): HTMLElement | null {
  return document.getElementById('quick-note-dialog')
    ?? document.getElementById('quick-note-dialog-desktop');
}

function cleanupQuickNoteDialogStyles(): void {
  const styleIds = ['quick-note-textarea-scrollbar-style', 'quick-note-buttons-scrollbar-style'];
  styleIds.forEach((id) => {
    document.getElementById(id)?.remove();
  });
}

async function teardownQuickNoteDialog(dialog: HTMLElement, closeMobile: boolean): Promise<void> {
  try {
    await cancelQuickNoteDialog(getActiveQuickNoteInput());
  } catch {
    // 确保弹窗 DOM 仍能被移除
  }
  try {
    destroyActiveQuickNoteInput();
  } catch {
    // 确保弹窗 DOM 仍能被移除
  }
  if (closeMobile) {
    cleanupQuickNoteDialogStyles();
  }
  if (closeMobile || dialog.id === 'quick-note-dialog-desktop') {
    cleanupQuickNoteOverflowToolbarLayers();
  }
  // 先移除整个弹窗（含金句 overlay），视觉上同时消失
  dialog.remove();
  // 弹窗移除后再清理金句 overlay 的事件监听器（DOM 已不在文档中，不影响视觉）
  if (quoteOverlayCleanup) {
    quoteOverlayCleanup()
    quoteOverlayCleanup = null
  }
  isNoteDialogShowing = false;
  isQuickNoteDialogMinimized = false;
  needsInitialFocus = false;
  wasQuickNoteInputFocused = false;
  savedCursorPos = null;
  savedBlockRange = null;
}

// === 电脑端专用弹窗 ===
async function showNoteInputDialogDesktop(
  notebookId: string,
  documentId?: string,
  saveType: 'daily' | 'document' = 'daily',
  insertPosition: 'top' | 'bottom' = 'bottom',
  source: QuickNoteOpenSource = 'auto',
) {
  const isFromButton = source === 'button';
  const inputFormat = resolveQuickNoteInputFormat(isFromButton);
  // 块格式需思源内 Protyle，不用居中捕获小窗（高度不足）；纯文本按钮仍用捕获居中 UI
  const captureMode = (source === 'button' || source === 'globalHotkey') && inputFormat !== 'block';
  const captureSettings = getDesktopQuickNoteCaptureSettings();
  const useQuickNoteOverflowSplit = !captureMode && isDesktopQuickNoteOverflowToolbarEnabled();
  const showQuickNoteToolbar = !captureMode;

  // 检查是否在防抖时间内
  const timeSinceLastShow = Date.now() - lastDialogShowTime;
  if (timeSinceLastShow < DIALOG_SHOW_DEBOUNCE_MS && source === 'auto') {
    return;
  }

  isNoteDialogShowing = true;
  lastDialogShowTime = Date.now();

  const isDark = isSiyuanDarkMode();

  const dialog = document.createElement('div');
  dialog.id = 'quick-note-dialog-desktop';
  dialog.tabIndex = -1;
  dialog.style.cssText = captureMode ? `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.48);
    z-index: 2147483647;
    pointer-events: auto;
  ` : `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: ${isDark ? 'rgba(0, 0, 0, 0.7)' : 'transparent'};
    z-index: 2147483647;
    pointer-events: ${isDark ? 'auto' : 'none'};
  `;

  const content = document.createElement('div');
  content.tabIndex = -1;
  content.style.cssText = captureMode ? `
    background: ${isDark ? '#1e1e1e' : 'white'};
    border-radius: 12px;
    padding: 10px 10px 8px;
    width: min(200px, 92vw);
    max-width: 200px;
    height: auto;
    max-height: min(200px, 42vh);
    box-shadow: ${isDark ? '0 16px 48px rgba(0, 0, 0, 0.55)' : '0 16px 48px rgba(0, 0, 0, 0.18)'};
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    pointer-events: auto;
    border: 1px solid ${isDark ? '#404040' : 'rgba(0, 0, 0, 0.08)'};
  ` : `
    background: ${isDark ? '#1e1e1e' : 'white'};
    border-radius: 12px;
    padding: 24px;
    width: 320px;
    max-width: 320px;
    height: 80vh;
    box-shadow: ${isDark ? '0 10px 40px rgba(0, 0, 0, 0.5)' : '0 10px 40px rgba(0, 0, 0, 0.3)'};
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: fixed;
    right: 40px;
    top: 57%;
    transform: translateY(-50%);
    pointer-events: auto;
    border: 1px solid ${isDark ? '#404040' : 'transparent'};
  `;

  const title = document.createElement('h2');
  title.textContent = captureMode
    ? (documentId ? '⚡ 追加' : '⚡ 记事')
    : (documentId ? '📒 文档记事' : '📒 日记记事');
  title.style.cssText = captureMode ? `
    margin: 0 0 6px 0;
    color: ${isDark ? '#e0e0e0' : '#333'};
    font-size: 13px;
    text-align: center;
    font-weight: 600;
  ` : `
    margin: 0 0 20px 0;
    color: ${isDark ? '#e0e0e0' : '#333'};
    font-size: 20px;
    text-align: center;
    font-weight: 600;
  `;

  const fontSize = getQuickNoteFontSize();

  const noteSection = document.createElement('div');
  noteSection.style.cssText = captureMode
    ? 'flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 72px; max-height: calc(52vh - 120px);'
    : inputFormat === 'block'
      ? 'flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 240px;'
      : 'flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 32px;';

  const inputHandle = await createQuickNoteInputArea({
    format: inputFormat,
    isMobile: false,
    isDark,
    compact: captureMode,
    fontSize,
    placeholder: documentId ? '请输入要追加到文档的内容...' : '请输入您的日记内容...',
    saveTarget: inputFormat === 'block'
      ? { saveType, notebookId, documentId, insertPosition }
      : undefined,
  });
  setActiveQuickNoteInput(inputHandle);
  noteSection.appendChild(inputHandle.element);

  const hint = document.createElement('div');
  hint.style.cssText = `
    font-size: 12px;
    color: ${isDark ? '#888' : '#666'};
    margin-top: 8px;
    text-align: center;
  `;
  if (inputHandle.isPlainTextarea()) {
    hint.innerHTML = captureMode
      ? ''
      : '💡 <kbd>Shift+Enter</kbd> 发送 · <kbd>Enter</kbd> 换行 · <kbd>Esc</kbd> 取消';
  } else {
    hint.innerHTML = captureMode
      ? ''
      : '';
    if (!captureMode) {
      hint.style.display = 'none';
    }
  }
  if (captureMode) {
    hint.style.display = 'none';
  }

  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'buttons-container';
  buttonContainer.style.cssText = captureMode ? `
    display: flex;
    gap: 6px;
    justify-content: center;
    margin-top: 8px;
  ` : `
    display: flex;
    gap: 12px;
    justify-content: center;
    margin-top: 20px;
  `;

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '取消';
  cancelBtn.className = 'b3-button b3-button--outline';
  cancelBtn.style.cssText = captureMode ? `
    flex: 1;
    padding: 5px 8px;
    font-size: 12px;
    border-radius: 6px;
    cursor: pointer;
  ` : `
    padding: 10px 24px;
    font-size: 14px;
    border-radius: 6px;
    cursor: pointer;
  `;
  cancelBtn.onclick = async () => {
    await teardownQuickNoteDialog(dialog, false);
  };

  const saveBtn = document.createElement('button');
  saveBtn.textContent = '发送';
  saveBtn.className = 'b3-button b3-button--primary';
  saveBtn.style.cssText = captureMode ? `
    flex: 1;
    padding: 5px 8px;
    font-size: 12px;
    border-radius: 6px;
    cursor: pointer;
    background: ${isDark ? '#2E7BBF' : '#3b82f6'};
    color: white;
    border: none;
  ` : `
    padding: 10px 24px;
    font-size: 14px;
    border-radius: 6px;
    cursor: pointer;
    background: ${isDark ? '#2E7BBF' : '#3b82f6'};
    color: white;
    border: none;
  `;
  saveBtn.onclick = async () => {
    try {
      const success = await runQuickNoteSave(
        inputHandle,
        notebookId,
        documentId,
        saveType,
        insertPosition,
        isFromButton,
      );
      if (success) {
        await Promise.resolve(inputHandle.clearAfterSave());
        inputHandle.focus();
        showSuccessMessage(saveType === 'document' ? '✅ 内容已追加到文档' : '✅ 记事已保存');
        if (captureMode && captureSettings.minimizeAfterSend) {
          minimizeSiyuanMainWindow();
        }
      }
    } catch {
      alert('记事保存失败，请重试');
    }
  };

  buttonContainer.appendChild(cancelBtn);
  buttonContainer.appendChild(saveBtn);

  content.appendChild(title);
  content.appendChild(noteSection);
  if (showQuickNoteToolbar) {
    const toolbarSection = document.createElement('div');
    toolbarSection.className = 'quick-note-desktop-toolbar-section';
    toolbarSection.style.cssText = `
      min-height: 36px;
      max-height: 28vh;
      overflow-y: auto;
      overflow-x: hidden;
      margin-top: 8px;
    `;
    copyDesktopQuickNoteToolbarButtons(toolbarSection, useQuickNoteOverflowSplit);
    content.appendChild(toolbarSection);
  }
  content.appendChild(hint);
  content.appendChild(buttonContainer);
  dialog.appendChild(content);
  document.body.appendChild(dialog);

  if (useQuickNoteOverflowSplit) {
    setTimeout(() => preOpenHiddenQuickNoteOverflowToolbar('desktop'), 100);
  }

  if (captureMode) {
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        void teardownQuickNoteDialog(dialog, false);
      }
    });
    content.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  dialogOpenTime = Date.now();
  lastDialogShowTime = Date.now();

  if (captureMode) {
    setupDesktopCaptureInteraction(dialog, inputHandle, saveBtn, cancelBtn);
    if (captureSettings.pasteClipboardOnOpen) {
      await pasteClipboardIntoQuickNoteInput(inputHandle);
      inputHandle.focus();
    }
  } else if (isFromButton && inputHandle.isPlainTextarea()) {
    const textarea = inputHandle.element.querySelector('textarea') as HTMLTextAreaElement | null;
    if (textarea) {
      if (dialogFocusTimer) {
        clearTimeout(dialogFocusTimer);
      }
      dialogFocusTimer = setTimeout(() => {
        textarea.focus();
        textarea.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault();
            saveBtn.click();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelBtn.click();
          }
        });
        dialogFocusTimer = null;
      }, 100);
    }
  }
}

// === 移动端专用弹窗 ===
async function showNoteInputDialogMobile(notebookId: string, documentId?: string, saveType: 'daily' | 'document' = 'daily', insertPosition: 'top' | 'bottom' = 'bottom', isFromButton: boolean = false) {
  // 注意：防抖检查已在 handleVisibilityChange() 中完成，这里不需要重复检查

  // 标记弹窗正在显示
  isNoteDialogShowing = true;
  lastDialogShowTime = Date.now();

  // 获取样式配置
  const styleConfig = pluginInstance?.mobileFeatureConfig?.quickNoteStyle || 'apple';
  const isAppleStyle = styleConfig === 'apple';

  // 检测暗黑模式
  const isDark = isSiyuanDarkMode();

  // 创建美化版记事输入弹窗
  const dialog = document.createElement('div');
  dialog.id = 'quick-note-dialog';
  // 防止遮罩层获取焦点
  dialog.tabIndex = -1;
  dialog.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: ${isDark ? 'rgba(0, 0, 0, 1)' : 'rgba(128, 128, 128, 1)'};
    z-index: 2147483647;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 40px;
  `;

  const content = document.createElement('div');
  // 防止内容容器获取焦点
  content.tabIndex = -1;
  content.style.cssText = isAppleStyle ? `
    background: ${isDark ? '#1e1e1e' : 'white'};
    border-radius: 14px;
    padding: 20px;
    width: 90%;
    max-width: 500px;
    height: calc(100% - 110px);
    box-shadow: ${isDark ? '0 20px 40px rgba(0, 0, 0, 0.5)' : '0 20px 40px rgba(0, 0, 0, 0.15)'};
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid ${isDark ? '#404040' : 'transparent'};
  ` : `
    background: ${isDark ? '#1e1e1e' : 'white'};
    border-radius: 12px;
    padding: 24px;
    width: 90%;
    max-width: 500px;
    height: calc(100% - 110px);
    box-shadow: ${isDark ? '0 10px 30px rgba(0, 0, 0, 0.5)' : '0 10px 30px rgba(0, 0, 0, 0.3)'};
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid ${isDark ? '#404040' : 'transparent'};
  `;

  const title = document.createElement('h2');
  title.textContent = isAppleStyle
    ? (documentId ? '文档记事' : '日记记事')
    : (documentId ? '📒 文档记事' : '📒 日记记事');
  title.style.cssText = isAppleStyle ? `
    margin: 0 0 16px 0;
    color: ${isDark ? '#e0e0e0' : '#000'};
    font-size: 17px;
    font-weight: 600;
    text-align: center;
    letter-spacing: -0.3px;
  ` : `
    margin: 0 0 16px 0;
    color: ${isDark ? '#e0e0e0' : '#333'};
    font-size: 20px;
    text-align: center;
  `;

  // 创建上下分栏容器
  const mainContainer = document.createElement('div');
  mainContainer.style.cssText = `
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  `;

  // 上半部分：记事输入区域
  const noteSection = document.createElement('div');
  noteSection.style.cssText = `
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    margin-bottom: 16px;
    min-height: 32px;  /* 至少保留一行输入空间 */
  `;

  const inputFormat = resolveQuickNoteInputFormat(isFromButton);
  const fontSize = getQuickNoteFontSize();
  const placeholder = documentId
    ? (isAppleStyle ? '追加到文档' : '请输入要追加到文档的内容...')
    : (isAppleStyle ? '写日记' : '请输入您的日记内容...');

  const inputHandle = await createQuickNoteInputArea({
    format: inputFormat,
    isMobile: true,
    isDark,
    isAppleStyle,
    fontSize,
    placeholder,
    saveTarget: inputFormat === 'block'
      ? { saveType, notebookId, documentId, insertPosition }
      : undefined,
  });
  setActiveQuickNoteInput(inputHandle);
  noteSection.appendChild(inputHandle.element);

  // 金句占位 overlay（输入法未打开 + 空输入时随机展示文档段落）
  quoteOverlayCleanup?.()
  quoteOverlayCleanup = null
  const quoteHandle = await createQuoteOverlay(noteSection, inputHandle, isDark)
  if (quoteHandle) {
    quoteOverlayCleanup = quoteHandle.cleanup
  }

  if (inputHandle.isPlainTextarea()) {
    const textareaStyleId = 'quick-note-textarea-scrollbar-style';
    if (!document.getElementById(textareaStyleId)) {
      const scrollbarStyle = document.createElement('style');
      scrollbarStyle.id = textareaStyleId;
      scrollbarStyle.textContent = `
        #quick-note-dialog textarea::-webkit-scrollbar {
          width: 8px;
        }
        #quick-note-dialog textarea::-webkit-scrollbar-track {
          background: ${isDark ? '#2a2a2a' : '#f1f1f1'};
          border-radius: 4px;
        }
        #quick-note-dialog textarea::-webkit-scrollbar-thumb {
          background: ${isDark ? '#555' : '#888'};
          border-radius: 4px;
        }
        #quick-note-dialog textarea::-webkit-scrollbar-thumb:hover {
          background: ${isDark ? '#777' : '#555'};
        }
      `;
      document.head.appendChild(scrollbarStyle);
    }
  }

  // 下半部分：工具栏按钮区域
  const toolbarSection = document.createElement('div');
  toolbarSection.style.cssText = `
    min-height: 40px;
    max-height: 50vh;  /* 按钮区域最大高度，超出可滚动 */
    overflow-y: auto;
    overflow-x: hidden;
  `;

  const toolbarTitle = document.createElement('div');
  //toolbarTitle.textContent = '🧰 工具栏按钮';
  toolbarTitle.style.cssText = `
    font-size: 12px;
    font-weight: 600;
    color: ${isDark ? '#888' : '#666'};
    margin-bottom: 8px;
    text-align: center;
  `;
  toolbarSection.appendChild(toolbarTitle);

  // 创建工具栏按钮容器
  const toolbarContainer = document.createElement('div');
  toolbarContainer.style.cssText = `
    display: block;
    margin: 0 -16px;
    padding: 0 8px;
  `;
  toolbarSection.appendChild(toolbarContainer);

  // 获取并复制底部工具栏按钮
  copyBottomToolbarButtons(toolbarContainer);

  mainContainer.appendChild(noteSection);
  mainContainer.appendChild(toolbarSection);

  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = `
    display: flex;
    gap: 12px;
    justify-content: space-between;
    margin-top: 16px;
    padding: 0 16px;
  `;

  const saveBtn = document.createElement('button');
  saveBtn.textContent = '发送';
  saveBtn.style.cssText = `
    font-size: 17px;
    letter-spacing: 0.5px;
    padding: 10px 24px;
    background: ${isDark ? '#2E7BBF' : (isAppleStyle ? '#007AFF' : '#3b82f6')};
    color: white;
    border: none;
    border-radius: 10px;
    font-weight: 500;
    cursor: pointer;
  `;
  // 防止按钮获取焦点，保持输入法不关闭
  saveBtn.tabIndex = -1;
  // 阻止 mousedown 导致的焦点转移
  saveBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
  });
  saveBtn.onclick = async () => {
    try {
      const success = await runQuickNoteSave(
        inputHandle,
        notebookId,
        documentId,
        saveType,
        insertPosition,
        isFromButton,
      );
      if (success) {
        showSuccessMessage(saveType === 'document' ? '✅ 内容已追加到文档' : '✅ 记事已保存');
        await teardownQuickNoteDialog(dialog, true);
      }
    } catch {
      alert('记事保存失败，请重试');
    }
  };

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '取消';
  cancelBtn.style.cssText = `
    font-size: 17px;
    letter-spacing: 0.5px;
    padding: 10px 24px;
    background: ${isDark ? '#333' : (isAppleStyle ? '#E5E5EA' : 'transparent')};
    color: ${isDark ? '#e0e0e0' : (isAppleStyle ? '#000' : '#5f6368')};
    border: ${isDark ? '1px solid #555' : (isAppleStyle ? 'none' : '1px solid #e0e0e0')};
    border-radius: 10px;
    font-weight: 500;
    cursor: pointer;
  `;
  // 防止按钮获取焦点，保持输入法不关闭
  cancelBtn.tabIndex = -1;
  // 阻止 mousedown 导致的焦点转移
  cancelBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
  });
  cancelBtn.onclick = async () => {
    await teardownQuickNoteDialog(dialog, true);
  };

  buttonContainer.appendChild(cancelBtn);
  buttonContainer.appendChild(saveBtn);

  content.appendChild(title);
  content.appendChild(mainContainer);
  content.appendChild(buttonContainer);
  dialog.appendChild(content);

  document.body.appendChild(dialog);

  // 延后预打开扩展工具栏（隐藏状态），让弹窗先渲染出来
  setTimeout(() => preOpenHiddenQuickNoteOverflowToolbar('mobile'), 100);

  // 电脑端特有功能：自动聚焦、Enter发送、Esc取消（仅纯文本）
  if (!isMobileDevice() && isFromButton && inputHandle.isPlainTextarea()) {
    const textarea = inputHandle.element.querySelector('textarea') as HTMLTextAreaElement | null;
    if (textarea) {
      if (dialogFocusTimer) {
        clearTimeout(dialogFocusTimer);
      }
      dialogFocusTimer = setTimeout(() => {
        textarea.focus();
        textarea.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            saveBtn.click();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelBtn.click();
          }
        });
        dialogFocusTimer = null;
      }, 100);
    }
  }

  // 记录弹窗打开时间，用于保护期机制
  dialogOpenTime = Date.now();

  // 更新最后显示弹窗时间，用于冷却期判断（按钮触发的除外）
  if (!isFromButton) {
    lastDialogShowTime = Date.now();
  }

  // 移动端：自动聚焦输入框，弹出输入法（根据开关配置）
  if (isMobileDevice()) {
    if (isFromButton) {
      // 按钮触发：检查开关后直接聚焦
      if (pluginInstance?.mobileFeatureConfig?.quickNoteAutoFocusButton !== false) {
        setTimeout(() => {
          inputHandle.focus();
        }, 300);
      }
    } else {
      // 自动触发：检查开关后标记等切回前台时聚焦
      if (pluginInstance?.mobileFeatureConfig?.quickNoteAutoFocusFirstPopup !== false) {
        needsInitialFocus = true;
      }
    }
  }
}

// 清理预打开的隐藏扩展工具栏（手机端 + 电脑端记事弹窗）
function cleanupQuickNoteOverflowToolbarLayers() {
  document.querySelectorAll('.overflow-toolbar-layer, .desktop-overflow-toolbar-layer').forEach(el => el.remove());
  document.querySelectorAll('[data-custom-button="overflow-button-mobile"], [data-custom-button="overflow-button-desktop"]').forEach((btn) => {
    const overflowBtn = btn as HTMLElement;
    overflowBtn.classList.remove('overflow-active');
    overflowBtn.style.backgroundColor = 'transparent';
  });
}

function preOpenHiddenQuickNoteOverflowToolbar(platform: 'mobile' | 'desktop'): void {
  const overflowId = platform === 'desktop' ? 'overflow-button-desktop' : 'overflow-button-mobile';
  const layerSelector = platform === 'desktop' ? '.desktop-overflow-toolbar-layer' : '.overflow-toolbar-layer';
  const overflowBtn = document.querySelector(`[data-custom-button="${overflowId}"]`) as HTMLElement | null;
  if (!overflowBtn || document.querySelectorAll(layerSelector).length > 0) {
    return;
  }
  overflowBtn.click();
  document.querySelectorAll(layerSelector).forEach(el => {
    (el as HTMLElement).style.visibility = 'hidden';
    (el as HTMLElement).style.pointerEvents = 'none';
    (el as HTMLElement).style.animation = 'none';
  });
  overflowBtn.classList.remove('overflow-active');
  overflowBtn.style.backgroundColor = 'transparent';
}

// 关闭记事弹窗的函数（兼容移动端 / 电脑端 id）
async function closeNoteDialog() {
  const noteDialog = getQuickNoteDialogElement();
  if (noteDialog) {
    const timeSinceOpen = Date.now() - dialogOpenTime;
    if (timeSinceOpen < DIALOG_PROTECTION_MS) {
      return;
    }
    const isMobileDialog = noteDialog.id === 'quick-note-dialog';
    await teardownQuickNoteDialog(noteDialog, isMobileDialog);
    lastDialogShowTime = Date.now();
  }
}

// 立即关闭记事弹窗的函数（无延迟）
async function closeNoteDialogImmediately() {
  const noteDialog = getQuickNoteDialogElement();
  if (noteDialog) {
    const isMobileDialog = noteDialog.id === 'quick-note-dialog';
    await teardownQuickNoteDialog(noteDialog, isMobileDialog);
    lastDialogShowTime = Date.now();
  }
}
/**
 * 创建按钮元素
 * 根据按钮配置创建克隆按钮
 */
function createClonedButton(buttonConfig: any, originalBtn: HTMLElement | null, isDark: boolean): HTMLElement {
  // 创建按钮副本
  const clonedBtn = document.createElement('button');
  
  // 防止按钮获取焦点，保持输入法不关闭
  clonedBtn.tabIndex = -1;

  // 获取配置的按钮样式
  const useCustomStyle = pluginInstance?.mobileFeatureConfig?.useCustomButtonStyle || false;
  const buttonHeight = useCustomStyle
    ? (pluginInstance?.mobileFeatureConfig?.quickNoteButtonHeight || 50)
    : 50;  // 默认配置
  const buttonMinWidth = useCustomStyle
    ? (pluginInstance?.mobileFeatureConfig?.quickNoteButtonMinWidth || 36)
    : 36;  // 默认配置
  const buttonMargin = useCustomStyle
    ? (pluginInstance?.mobileFeatureConfig?.quickNoteButtonMargin || 2)
    : 2;   // 默认配置
  const buttonPadding = useCustomStyle
    ? (pluginInstance?.mobileFeatureConfig?.quickNoteButtonPadding || 8)
    : 8;   // 默认配置

  // 设置按钮基本样式
  clonedBtn.style.cssText = `
    min-width: ${buttonMinWidth}px;
    height: ${buttonHeight}px;
    padding: 4px ${buttonPadding}px;
    margin: ${buttonMargin}px;
    border: 1px solid ${isDark ? '#404040' : '#e0e0e0'};
    border-radius: 6px;
    background: ${isDark ? '#2a2a2a' : 'white'};
    color: ${isDark ? '#e0e0e0' : '#333'};
    font-size: 14px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  `;
  
  clonedBtn.title = buttonConfig.name || '';
  clonedBtn.dataset.buttonId = buttonConfig.id;
  
  // 设置按钮内容（图标）
  if (buttonConfig.icon) {
    if (buttonConfig.icon.startsWith('icon')) {
      // 思源内置图标
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', `${buttonConfig.iconSize || 16}`);
      svg.setAttribute('height', `${buttonConfig.iconSize || 16}`);
      svg.style.cssText = 'flex-shrink: 0; display: block;';
      
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', `#${buttonConfig.icon}`);
      svg.appendChild(use);
      
      clonedBtn.appendChild(svg);
    } else if (buttonConfig.icon.startsWith('lucide:')) {
      // Lucide 图标 - 简化处理，显示图标名
      const iconName = buttonConfig.icon.substring(7);
      clonedBtn.textContent = iconName;
      clonedBtn.style.fontSize = `${buttonConfig.iconSize || 16}px`;
    } else if (/\.(png|jpg|jpeg|gif|svg)$/i.test(buttonConfig.icon)) {
      // 图片路径（自定义图标）
      const pluginName = 'siyuan-toolbar-customizer';
      const imagePath = buttonConfig.icon.startsWith('/plugins/') ? buttonConfig.icon : `/plugins/${pluginName}/${buttonConfig.icon}`;
      const img = document.createElement('img');
      img.src = imagePath;
      img.style.cssText = `
        width: ${buttonConfig.iconSize || 20}px;
        height: ${buttonConfig.iconSize || 20}px;
        object-fit: contain;
        flex-shrink: 0;
        display: block;
      `;
      clonedBtn.appendChild(img);
    } else {
      // Emoji 或其他文本图标
      clonedBtn.textContent = buttonConfig.icon;
      clonedBtn.style.fontSize = `${buttonConfig.iconSize || 16}px`;
    }
  } else {
    clonedBtn.textContent = buttonConfig.name || '按钮';
  }

  // 如果开启显示名称，显示文字代替图标
  if (buttonConfig.showName && buttonConfig.name) {
    const nameLength = buttonConfig.name?.length || 0;
    // 最多显示4个字，超过则截取前4个字
    const displayName = nameLength > 4 ? buttonConfig.name?.slice(0, 4) : buttonConfig.name;
    clonedBtn.innerHTML = '';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = displayName;
    // 动态计算字体大小：字数越少字体越大，字数越多字体越小
    const displayLength = displayName?.length || 0;
    let fontSize = 18; // 默认字体大小
    if (displayLength === 1) fontSize = 22;
    else if (displayLength === 2) fontSize = 20;
    else if (displayLength === 3) fontSize = 18;
    else if (displayLength >= 4) fontSize = 16;
    nameSpan.style.cssText = `
      font-size: ${fontSize}px;
      width: 100%;
      text-align: center;
    `;
    clonedBtn.appendChild(nameSpan);
  }
  
  // 添加hover效果
  clonedBtn.addEventListener('mouseenter', () => {
    clonedBtn.style.backgroundColor = isDark ? 'rgba(255, 255, 255, 0.08)' : '#f5f5f5';
    clonedBtn.style.transform = 'translateY(-1px)';
    clonedBtn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
  });

  clonedBtn.addEventListener('mouseleave', () => {
    clonedBtn.style.backgroundColor = isDark ? '#2a2a2a' : 'white';
    clonedBtn.style.transform = 'translateY(0)';
    clonedBtn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
  });
  
  // 阻止 mousedown 导致的焦点转移（保持输入法状态）
  clonedBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
  });
  
  // 移动端：不能对 touchstart 调用 preventDefault（会阻止 click）
  // 改用 touchend 作为备用触发方式
  let touchHandled = false;
  clonedBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (touchHandled) return;
    touchHandled = true;
    setTimeout(() => { touchHandled = false; }, 100);
    clonedBtn.click(); // 触发 click 事件
  });
  
  return clonedBtn;
}

/**
 * 渲染按钮列表
 * @param overflowMode all=弹窗内平铺全部按钮；split=主栏+⋯扩展层
 */
function renderButtons(
  container: HTMLElement,
  buttonConfigs: any[],
  sortMethod: string,
  isDark: boolean,
  overflowButtonId = 'overflow-button-mobile',
  overflowMode: 'all' | 'split' = 'all',
): void {
  const enabledConfigs = buttonConfigs.filter(btn => btn.enabled !== false)

  let configsToRender: any[]
  let overflowConfigs: any[] = []
  let overflowBtnConfig: any | null = null

  if (overflowMode === 'split') {
    overflowBtnConfig = enabledConfigs.find(btn => btn.id === overflowButtonId) ?? null
    configsToRender = enabledConfigs.filter(
      btn => btn.id !== overflowButtonId && (btn.overflowLevel ?? 0) === 0,
    )
    overflowConfigs = enabledConfigs.filter(
      btn => btn.id !== overflowButtonId && (btn.overflowLevel ?? 0) > 0,
    )
    if (overflowBtnConfig && overflowConfigs.length > 0) {
      configsToRender = [...configsToRender, overflowBtnConfig]
    } else if (overflowConfigs.length > 0) {
      // 无 ⋯ 按钮时，扩展层按钮仍平铺显示
      configsToRender = [...configsToRender, ...overflowConfigs]
      overflowConfigs = []
      overflowBtnConfig = null
    } else {
      overflowBtnConfig = null
    }
  } else {
    configsToRender = enabledConfigs.filter(btn => btn.id !== overflowButtonId)
  }

  const wrapper = document.createElement('div')
  wrapper.className = 'quick-note-toolbar-wrapper'
  wrapper.style.cssText = 'width: 100%;'

  const buttonsContainer = document.createElement('div')
  buttonsContainer.className = 'buttons-container'

  const useCustomStyle = pluginInstance?.mobileFeatureConfig?.useCustomButtonStyle || false
  const buttonGap = useCustomStyle
    ? (pluginInstance?.mobileFeatureConfig?.quickNoteButtonGap || 6)
    : 6

  let sortedConfigs: any[]
  const flexBase = `
      display: flex;
      flex-wrap: wrap;
      gap: ${buttonGap}px;
      align-content: flex-start;
      padding: 6px 0;
      width: 100%;
    `

  if (sortMethod === 'topToolbar') {
    buttonsContainer.style.cssText = `${flexBase} flex-direction: row-reverse; justify-content: center;`
    sortedConfigs = [...configsToRender].sort((a, b) => a.sort - b.sort)
  } else {
    buttonsContainer.style.cssText = `${flexBase} flex-direction: row; justify-content: center;`
    sortedConfigs = [...configsToRender].sort((a, b) => b.sort - a.sort)
  }

  const overflowPanel = document.createElement('div')
  overflowPanel.className = 'quick-note-overflow-panel buttons-container'
  overflowPanel.style.cssText = `
    display: none;
    flex-wrap: wrap;
    gap: ${buttonGap}px;
    justify-content: center;
    padding: 4px 0 2px;
    width: 100%;
    border-top: 1px dashed ${isDark ? '#404040' : '#e0e0e0'};
    margin-top: 4px;
  `

  const mountButton = (target: HTMLElement, buttonConfig: any, isOverflowToggle = false) => {
    const originalBtn = document.querySelector(`[data-custom-button="${buttonConfig.id}"]`) as HTMLElement
    const clonedBtn = createClonedButton(buttonConfig, originalBtn, isDark)

    if (isOverflowToggle) {
      clonedBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const opening = overflowPanel.style.display === 'none'
        overflowPanel.style.display = opening ? 'flex' : 'none'
        clonedBtn.classList.toggle('overflow-active', opening)
        clonedBtn.style.backgroundColor = opening
          ? 'color-mix(in srgb, var(--b3-theme-on-surface) 10%, transparent)'
          : (isDark ? '#2a2a2a' : 'white')
      })
    } else {
      clonedBtn.addEventListener('click', async (e) => {
        e.preventDefault()
        e.stopPropagation()
        await handleButtonClick(buttonConfig, originalBtn)
      })
    }

    target.appendChild(clonedBtn)
  }

  sortedConfigs.forEach((buttonConfig) => {
    const isOverflowToggle = overflowMode === 'split'
      && overflowBtnConfig != null
      && buttonConfig.id === overflowButtonId
    mountButton(buttonsContainer, buttonConfig, isOverflowToggle)
  })

  if (overflowMode === 'split' && overflowConfigs.length > 0) {
    const sortedOverflow = sortMethod === 'topToolbar'
      ? [...overflowConfigs].sort((a, b) => a.sort - b.sort)
      : [...overflowConfigs].sort((a, b) => b.sort - a.sort)
    sortedOverflow.forEach((buttonConfig) => mountButton(overflowPanel, buttonConfig))
  }

  if (buttonsContainer.children.length === 0 && overflowPanel.children.length === 0) {
    const noButtonsMsg = document.createElement('div')
    noButtonsMsg.textContent = '暂无可用按钮'
    noButtonsMsg.style.cssText = `
      font-size: 12px;
      color: #999;
      text-align: center;
      padding: 20px;
    `
    container.appendChild(noButtonsMsg)
    return
  }

  wrapper.appendChild(buttonsContainer)
  if (overflowMode === 'split' && overflowConfigs.length > 0) {
    wrapper.appendChild(overflowPanel)
  }
  container.appendChild(wrapper)
}

/**
 * 处理按钮点击事件
 * 统一处理各种类型按钮的点击逻辑
 */
async function handleButtonClick(
  buttonConfig: any,
  originalBtn: HTMLElement | null
): Promise<void> {
  try {
    // 扩展工具栏按钮在预打开的隐藏层中，直接搜索即可
    if (!originalBtn) {
      originalBtn = document.querySelector(`[data-custom-button="${buttonConfig.id}"]`) as HTMLElement;
    }
    // 特殊处理：template类型按钮的行为
    if (buttonConfig.type === 'template') {
      const noteDialog = document.getElementById('quick-note-dialog') || document.getElementById('quick-note-dialog-desktop');
      if (noteDialog && buttonConfig.template) {
        let templateContent = buttonConfig.template;
        const now = new Date();
        templateContent = templateContent
          .replace(/{{date}}/g, now.toISOString().split('T')[0])
          .replace(/{{time}}/g, now.toTimeString().split(' ')[0])
          .replace(/{{datetime}}/g, `${now.toISOString().split('T')[0]} ${now.toTimeString().split(' ')[0]}`)
          .replace(/{{year}}/g, now.getFullYear().toString())
          .replace(/{{month}}/g, String(now.getMonth() + 1).padStart(2, '0'))
          .replace(/{{day}}/g, String(now.getDate()).padStart(2, '0'))
          .replace(/{{hour}}/g, String(now.getHours()).padStart(2, '0'))
          .replace(/{{minute}}/g, String(now.getMinutes()).padStart(2, '0'))
          .replace(/{{second}}/g, String(now.getSeconds()).padStart(2, '0'))
          .replace(/{{week}}/g, ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][now.getDay()]);

        insertTextIntoQuickNoteDialog(templateContent);
        Notify.showInfoTemplateInserted(buttonConfig.showNotification !== false);
      }
      return;
    }
    
    // 特殊处理：author-tool + popup-select 类型按钮
    if (buttonConfig.type === 'author-tool' && buttonConfig.authorToolSubtype === 'popup-select') {
      const templates = buttonConfig.popupSelectTemplates || [];
      if (templates.length === 0) {
        return;
      }
      
      const selectedTemplate = await showPopupSelectDialog(templates);
      
      if (selectedTemplate) {
        const processedContent = processTemplateVariables(selectedTemplate.content);
        insertTextIntoQuickNoteDialog(processedContent);
      }
      
      // 不关闭弹窗，直接返回
      return;
    }
    
    // 其他类型按钮：通过原始按钮触发
    if (originalBtn) {
      originalBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      if (buttonConfig.type === 'builtin') {
        if (dialogBuiltinCloseTimer) clearTimeout(dialogBuiltinCloseTimer);
        dialogBuiltinCloseTimer = setTimeout(() => { void closeNoteDialog(); dialogBuiltinCloseTimer = null; }, 100);
      } else {
        void closeNoteDialogImmediately();
      }
    }
    
  } catch (error) {
    alert('按钮执行失败，请重试');
  }
}

/**
 * 主函数：获取并复制底部工具栏按钮
 * 根据配置选择不同的排序方法
 */
function copyBottomToolbarButtons(container: HTMLElement) {
  try {
    let buttonConfigs = (window as any).__mobileButtonConfigs || [];

    // 按配置过滤弹窗按钮（空或undefined则显示全部）
    const quickNoteButtonIds = pluginInstance?.mobileFeatureConfig?.quickNoteButtonIds;
    if (quickNoteButtonIds && quickNoteButtonIds.length > 0) {
      buttonConfigs = buttonConfigs.filter((btn: any) => quickNoteButtonIds.includes(btn.id));
    }

    if (buttonConfigs.length === 0) {
      // 如果没有按钮配置，显示提示信息
      const noButtonsMsg = document.createElement('div');
      noButtonsMsg.textContent = '暂无按钮配置';
      noButtonsMsg.style.cssText = `
        font-size: 12px;
        color: #999;
        text-align: center;
        padding: 20px;
      `;
      container.appendChild(noButtonsMsg);
      return;
    }

    // 获取排序方法配置（使用从 toolbarManager 导入的 pluginInstance）
    const sortMethod = pluginInstance?.mobileFeatureConfig?.quickNoteSortMethod || 'bottomToolbar';

    // 检测暗黑模式
    const isDark = isSiyuanDarkMode();

    // 为滚动条添加样式（避免重复注入）
    const styleId = 'quick-note-buttons-scrollbar-style';
    if (!document.getElementById(styleId)) {
      const scrollbarStyle = document.createElement('style');
      scrollbarStyle.id = styleId;
      scrollbarStyle.textContent = `
        #quick-note-dialog .buttons-container::-webkit-scrollbar,
        #quick-note-dialog-desktop .buttons-container::-webkit-scrollbar {
          width: 6px;
        }
        #quick-note-dialog .buttons-container::-webkit-scrollbar-track,
        #quick-note-dialog-desktop .buttons-container::-webkit-scrollbar-track {
          background: ${isDark ? '#2a2a2a' : '#f1f1f1'};
          border-radius: 3px;
        }
        #quick-note-dialog .buttons-container::-webkit-scrollbar-thumb,
        #quick-note-dialog-desktop .buttons-container::-webkit-scrollbar-thumb {
          background: ${isDark ? '#555' : '#888'};
          border-radius: 3px;
        }
        #quick-note-dialog .buttons-container::-webkit-scrollbar-thumb:hover,
        #quick-note-dialog-desktop .buttons-container::-webkit-scrollbar-thumb:hover {
          background: ${isDark ? '#777' : '#555'};
        }
      `;
      document.head.appendChild(scrollbarStyle);
    }

    // 根据排序方法调用渲染函数
    renderButtons(container, buttonConfigs, sortMethod, isDark, 'overflow-button-mobile');

  } catch (error) {
    const errorMsg = document.createElement('div');
    errorMsg.textContent = '按钮加载失败';
    errorMsg.style.cssText = `
      font-size: 12px;
      color: #ff6b6b;
      text-align: center;
      padding: 20px;
    `;
    container.appendChild(errorMsg);
  }
}

function copyDesktopQuickNoteToolbarButtons(container: HTMLElement, useOverflowSplit = false) {
  try {
    const buttonConfigs = pluginInstance?.desktopButtonConfigs || [];
    if (buttonConfigs.length === 0) {
      const noButtonsMsg = document.createElement('div');
      noButtonsMsg.textContent = '暂无电脑端按钮配置';
      noButtonsMsg.style.cssText = 'font-size: 12px; color: #999; text-align: center; padding: 12px;';
      container.appendChild(noButtonsMsg);
      return;
    }

    const sortMethod = pluginInstance?.mobileFeatureConfig?.quickNoteSortMethod || 'bottomToolbar';
    const isDark = isSiyuanDarkMode();
    renderButtons(
      container,
      buttonConfigs,
      sortMethod,
      isDark,
      'overflow-button-desktop',
      useOverflowSplit ? 'split' : 'all',
    );
  } catch {
    const errorMsg = document.createElement('div');
    errorMsg.textContent = '按钮加载失败';
    errorMsg.style.cssText = 'font-size: 12px; color: #ff6b6b; text-align: center; padding: 12px;';
    container.appendChild(errorMsg);
  }
}

function showSuccessMessage(message: string) {
  const isDark = isSiyuanDarkMode();
  const msg = document.createElement('div');
  msg.textContent = message;
  msg.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${isDark ? '#4a9eff' : '#4CAF50'};
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    z-index: 2147483647;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  `;
  
  document.body.appendChild(msg);
  
  setTimeout(() => {
    msg.remove();
  }, 3000);
}

/**
 * 检查一键记事弹窗是否有内容
 * @returns {boolean} 如果有内容返回true，否则返回false
 */
function hasNoteDialogContent(): boolean {
  const noteDialog = document.getElementById('quick-note-dialog') || document.getElementById('quick-note-dialog-desktop');
  if (!noteDialog) {
    return false;
  }

  const handle = getActiveQuickNoteInput();
  if (handle) {
    if (handle.isPlainTextarea()) {
      const textarea = handle.element.querySelector('textarea') as HTMLTextAreaElement | null;
      return !!(textarea?.value.trim());
    }
    const editEl = noteDialog.querySelector('.toolbar-customizer-qnote-protyle [contenteditable="true"]') as HTMLElement | null;
    return !!(editEl?.textContent?.replace(/\u200b/g, '').trim());
  }

  const textarea = noteDialog.querySelector('textarea') as HTMLTextAreaElement | null;
  return !!(textarea?.value.trim());
}

/**
 * 检查小窗模式并决定是否触发弹窗
 * 延迟检测函数，供延迟调用使用
 */
/**
 * ②只在小窗模式：处理小窗模式下的弹窗逻辑
 * 只有当前为小窗模式时才弹窗
 */
function handleSmallWindowOnlyMode() {
  const isSmallWindow = checkIsSmallWindowMode();
  if (!isSmallWindow) {
    return;
  }

  // 新增：检查键盘高度，抑制全屏大键盘的误触发
  const keyboardHeight = Math.max(0, window.screen.height - window.innerHeight);
  if (keyboardHeight > 300) {
    return;
  }

  // 检查是否有内容
  if (hasNoteDialogContent()) {
    return;
  }

  // 防抖检查：3 秒内不重复弹
  const timeSinceLastShow = Date.now() - lastDialogShowTime;
  if (timeSinceLastShow < DIALOG_COOLDOWN_MS) {
    return;
  }

  // 弹出弹窗
  showOrReuseDialog();
}

/**
 * ③小窗和全屏：处理全模式下的弹窗逻辑
 * 无论小窗还是全屏都弹窗
 */
function handleBothModesMode() {
  // 键盘开着（用户正在编辑页面）时不弹窗，防止编辑页面锁屏→开屏误触
  const keyboardHeight = Math.max(0, window.screen.height - window.innerHeight);
  if (keyboardHeight > 300) {
    return;
  }

  // 检查是否有内容
  if (hasNoteDialogContent()) {
    return;
  }

  // 防抖检查：3 秒内不重复弹
  const timeSinceLastShow = Date.now() - lastDialogShowTime;
  if (timeSinceLastShow < DIALOG_COOLDOWN_MS) {
    return;
  }

  // 弹出弹窗（无论小窗还是全屏）
  showOrReuseDialog();
}

/**
 * 处理前后台切换
 * 新方案：
 * - 切后台：弹出弹窗
 * - 切前台：检测是否是小窗，如果是则弹出弹窗
 */
function handleVisibilityChange() {
  // 只在移动端处理
  if (!isMobileDevice() || !pluginInstance) {
    return;
  }

  // 图片选择器激活期间，跳过一键记事弹窗（防止选择图片切回时误触发）
  if ((window as any).__imagePickerActive) {
    return;
  }

  // 获取弹窗配置
  const popupConfig = pluginInstance.mobileFeatureConfig?.popupConfig || 'bothModes';

  // ========== 切后台时：弹出弹窗 ==========
  if (document.hidden) {
    // 记录弹窗输入框是否正有焦点（切回前台时据此决定是否恢复输入法）
    wasQuickNoteInputFocused = isNoteDialogShowing &&
      !!getActiveQuickNoteInput()?.element?.contains(document.activeElement);

    // 遮盖输入区：切后台时在 noteSection 上盖一层同色遮罩，
    // 防止切回前台时键盘关闭→重开导致内容在布局变化期间溢出到输入框外面
    if (isNoteDialogShowing) {
      const noteDialog = document.getElementById('quick-note-dialog') || document.getElementById('quick-note-dialog-desktop');
      const noteSection = noteDialog?.querySelector('.toolbar-customizer-qnote-input')?.parentElement as HTMLElement | null;
      if (noteSection) {
        const isDark = isSiyuanDarkMode();
        const mask = document.createElement('div');
        mask.id = 'quick-note-layout-mask';
        mask.style.cssText = [
          'position: absolute',
          'inset: 0',
          `background: ${isDark ? '#1e1e1e' : 'white'}`,
          'z-index: 100',
          'pointer-events: none',
          'border-radius: 10px',
        ].join(';');
        noteSection.style.position = 'relative';
        noteSection.appendChild(mask);
      }
    }

    // 保存光标位置，用于切回前台时恢复
    if (wasQuickNoteInputFocused) {
      const inputHandle = getActiveQuickNoteInput();
      if (inputHandle?.isPlainTextarea()) {
        const textarea = inputHandle.element.querySelector('textarea');
        if (textarea) {
          savedCursorPos = { start: textarea.selectionStart ?? textarea.value.length, end: textarea.selectionEnd ?? textarea.value.length };
        }
      } else if (inputHandle) {
        // 块格式：保存 Selection Range
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          if (inputHandle.element.contains(range.commonAncestorContainer)) {
            savedBlockRange = range.cloneRange();
          }
        }
      }
    }

    // 根据配置调用不同的处理函数
    if (popupConfig === 'smallWindowOnly') {
      // ②只在小窗模式：使用小窗模式专用函数
      handleSmallWindowOnlyMode();
    } else if (popupConfig === 'bothModes') {
      // ③小窗和全屏：使用全模式函数
      handleBothModesMode();
    }
    // disabled 模式不做任何处理
    return;
  }

  // ========== 切前台时 ==========
  if (!document.hidden) {
    // 弹窗正在显示时，根据开关恢复输入框焦点
    const shouldRestoreFocus = wasQuickNoteInputFocused
      ? pluginInstance?.mobileFeatureConfig?.quickNoteAutoFocusRestore !== false
      : needsInitialFocus
        ? pluginInstance?.mobileFeatureConfig?.quickNoteAutoFocusFirstPopup !== false
        : false;
    if (isNoteDialogShowing && shouldRestoreFocus) {
      wasQuickNoteInputFocused = false;
      needsInitialFocus = false;
      const pos = savedCursorPos;
      savedCursorPos = null;
      const range = savedBlockRange;
      savedBlockRange = null;
      setTimeout(() => {
        const handle = getActiveQuickNoteInput();
        if (handle) {
          handle.focus();
          if (pos && handle.isPlainTextarea()) {
            // 恢复光标位置（纯文本格式）
            const textarea = handle.element.querySelector('textarea');
            if (textarea) {
              textarea.setSelectionRange(pos.start, pos.end);
            }
          } else if (range && !handle.isPlainTextarea()) {
            // 恢复光标位置（块格式 contenteditable）
            const sel = window.getSelection();
            if (sel) {
              sel.removeAllRanges();
              sel.addRange(range);
            }
          }
        }
        // 键盘弹起后移除输入区遮罩
        setTimeout(() => {
          const mask = document.getElementById('quick-note-layout-mask');
          if (mask) {
            mask.remove();
          }
        }, 200);
      }, 100);
    } else if (isNoteDialogShowing) {
      // 不需要恢复焦点，直接移除遮罩
      const mask = document.getElementById('quick-note-layout-mask');
      if (mask) {
        mask.remove();
      }
    }

    // 小窗模式：延迟检测是否需要弹窗
    if (popupConfig === 'smallWindowOnly') {
      setTimeout(() => {
        const isSmallWindow = checkIsSmallWindowMode();
        if (isSmallWindow) {
          handleSmallWindowOnlyMode();
        }
      }, 400);
    }
  }
}

/**
 * 检查是否为小窗模式
 * 修复版：只用高度判断，因为宽度在小窗模式下不会变化
 */
function checkIsSmallWindowMode(): boolean {
  const currentHeight = window.innerHeight;
  const screenHeight = window.screen.height;
  const heightRatio = currentHeight / screenHeight;

  // 使用 visualViewport 获取更精确的可见高度
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const visualHeight = vv.height;
    const visualHeightRatio = visualHeight / screenHeight;

    // 修复：用屏幕高度减去当前高度判断键盘
    const keyboardHeight = Math.max(0, screenHeight - currentHeight);
    const isKeyboardOpen = keyboardHeight > 200;

    if (isKeyboardOpen) {
      // 键盘弹出时：也只看高度比例
      return visualHeightRatio < 0.80;
    } else {
      // 无键盘时：只看高度比例
      return visualHeightRatio < 0.80;
    }
  } else {
    // 降级：浏览器不支持 visualViewport，使用普通高度比
    return heightRatio < 0.80;
  }
}

/**
 * 弹出或复用弹窗
 * 如果弹窗已存在，复用（不清空内容）
 * 如果弹窗不存在，弹出新弹窗
 */
function showOrReuseDialog() {
  const existingDialog = document.getElementById('quick-note-dialog');
  if (existingDialog) {
    // 弹窗已存在，复用（不清空内容）
    lastDialogShowTime = Date.now();
    return;
  }

  // 弹出新弹窗
  showSmallWindowTip();
  lastDialogShowTime = Date.now();
}

/**
 * 初始化小窗模式检测器
 * 新方案：监听切后台事件，触发弹窗
 */
export function initSmallWindowDetector(): void {
  // 清除可能存在的可见性变化监听器
  if (visibilityChangeListener) {
    document.removeEventListener('visibilitychange', visibilityChangeListener);
    visibilityChangeListener = null;
  }

  // 清除高度变化检测定时器（向后兼容）
  if (heightCheckTimer) {
    clearInterval(heightCheckTimer);
    heightCheckTimer = null;
  }

  // 获取当前配置
  const popupConfig = pluginInstance?.mobileFeatureConfig?.popupConfig || 'bothModes';

  // 如果是 disabled 模式，不做任何初始化
  if (popupConfig === 'disabled') {
    return;
  }

  // 重置弹窗显示状态
  lastDialogShowTime = 0;

  // 添加可见性变化监听器（用于检测前后台切换）- ②和③都需要
  visibilityChangeListener = handleVisibilityChange;
  document.addEventListener('visibilitychange', visibilityChangeListener);

  // 不再需要持续性定时器，改为切前台时主动检测一次
  // 配置②（smallWindowOnly）会在切前台时检测是否是小窗模式
}

/**
 * 清除小窗模式检测器
 * 移除所有事件监听器和定时器
 */
export function clearSmallWindowDetector(): void {
  // 清除定时器（防止插件卸载后仍执行）
  if (dialogFocusTimer) {
    clearTimeout(dialogFocusTimer);
    dialogFocusTimer = null;
  }
  if (dialogBuiltinCloseTimer) {
    clearTimeout(dialogBuiltinCloseTimer);
    dialogBuiltinCloseTimer = null;
  }
  if (heightCheckTimer) {
    clearInterval(heightCheckTimer);
    heightCheckTimer = null;
  }

  // 清理金句 overlay
  if (quoteOverlayCleanup) {
    quoteOverlayCleanup()
    quoteOverlayCleanup = null
  }

  // 清除可见性变化监听器
  if (visibilityChangeListener) {
    document.removeEventListener('visibilitychange', visibilityChangeListener);
    visibilityChangeListener = null;
  }

  // 清理残留的弹窗 DOM（块格式须先 cancelDraft 再 destroy）
  void (async () => {
    try {
      await cancelQuickNoteDialog(getActiveQuickNoteInput());
    } catch {
      // ignore
    }
    try {
      destroyActiveQuickNoteInput();
    } catch {
      // ignore
    }
    document.getElementById('quick-note-dialog')?.remove();
    document.getElementById('quick-note-dialog-desktop')?.remove();
    isNoteDialogShowing = false;
    isQuickNoteDialogMinimized = false;
  })();

  // 清理残留的滚动条样式元素
  const textareaScrollbarStyle = document.getElementById('quick-note-textarea-scrollbar-style');
  if (textareaScrollbarStyle) {
    textareaScrollbarStyle.remove();
  }
  const buttonsScrollbarStyle = document.getElementById('quick-note-buttons-scrollbar-style');
  if (buttonsScrollbarStyle) {
    buttonsScrollbarStyle.remove();
  }

  // 清理残留的 placeholder 样式元素
  const placeholderStyle = document.getElementById('quick-note-mobile-placeholder-style');
  if (placeholderStyle) {
    placeholderStyle.remove();
  }

  // 重置状态变量
  lastDialogShowTime = 0;
  dialogOpenTime = 0;
  isNoteDialogShowing = false;
  isQuickNoteDialogMinimized = false;
}

/**
 * 获取应用前后台状态
 * 返回应用当前是在前台还是后台
 */
export function getAppVisibilityStatus(): { isVisible: boolean, status: string } {
  const isVisible = isAppInForeground();
  return {
    isVisible,
    status: isVisible ? '前台' : '后台'
  };
}

export function getAppForegroundStatus(): boolean {
  return isAppInForeground();
}

// 备选方案：直接使用 API 创建文档
function useApiFallback(notebookId: string, siyuan: any) {
  const notebookIdToUse = notebookId || (siyuan.notebooks?.[0]?.id) || '0';
  
  siyuan.fetchPost('/api/filetree/createDocWithMd', {
    notebook: notebookIdToUse,
    path: `/temp/快速记事_${Date.now()}.sy`,
    markdown: ''
  }, (response: any) => {
    if (response.code === 0) {
      // 在新窗口中打开文档
      siyuan.openWindow({
        doc: { id: response.data.id }
      });
    } else {
      // 最后的降级方案（使用移动端弹窗）
      showNoteInputDialogMobile(notebookId);
    }
  });
}

// 导出函数供其他模块使用
export { showSmallWindowTip, showSiyuanEditorDialog, shouldUseQuickNoteFloatWindow };

// 防抖：全局快捷键可能短时间内触发多次，导致先最小化再立刻弹出
let lastToggleTimestamp = 0;
const TOGGLE_DEBOUNCE_MS = 400;

/** 电脑端：全局快捷键 / 按钮 — 纯文本悬浮窗 或 块格式 openWindow */
export async function triggerDesktopQuickNoteCapture(isFromButton = false): Promise<void> {
  if (isMobileDevice()) return;
  // 防抖：全局快捷键走防抖，按钮不限制（按钮连续点击是用户有意操作）
  if (!isFromButton) {
    const now = Date.now();
    if (now - lastToggleTimestamp < TOGGLE_DEBOUNCE_MS) return;
    lastToggleTimestamp = now;
  }
  if (pluginInstance?.desktopFeatureConfig?.disableCustomButtons) return;

  const captureSettings = getDesktopQuickNoteCaptureSettings();
  if (!captureSettings.globalCaptureEnabled && !isFromButton) return;

  if (shouldUseDesktopQuickNoteBlockWindow(isFromButton)) {
    await toggleDesktopQuickNoteBlockWindow(isFromButton);
    return;
  }

  const source = isFromButton ? 'button' : 'globalHotkey';
  if (!shouldUseQuickNoteFloatWindow(source)) {
    if (isFromButton) {
      await showSmallWindowTip();
    }
    return;
  }
  toggleQuickNoteFloatWindow(isFromButton);
}

/** 电脑端：全局快捷键唤起一键记事（思源可处于后台，进程需保持运行） */
export async function triggerDesktopQuickNoteGlobalCapture(): Promise<void> {
  await triggerDesktopQuickNoteCapture(false);
}

/** 悬浮窗保存：纯文本写入日记/文档（块格式在独立窗中不适用） */
export async function saveQuickNotePlainTextFromFloat(
  text: string,
  isFromButton: boolean,
): Promise<QuickNoteFloatSaveResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, message: '请输入内容' };
  }

  const { notebookId, documentId, saveType, insertPosition } = resolveQuickNoteTargetConfig(isFromButton);

  if (saveType === 'document' && !documentId) {
    return { ok: false, message: '请先在设置中配置文档 ID' };
  }
  if (saveType === 'daily' && !notebookId) {
    return { ok: false, message: '请先在设置中配置笔记本 ID' };
  }

  try {
    const ok = await saveQuickNoteContent(
      { format: 'plain', markdown: trimmed },
      { saveType, notebookId, documentId, insertPosition },
    );
    if (!ok) {
      return { ok: false, message: '保存失败，请重试' };
    }

    const captureSettings = getDesktopQuickNoteCaptureSettings();
    if (captureSettings.minimizeAfterSend) {
      minimizeSiyuanMainWindow();
    }

    return {
      ok: true,
      message: saveType === 'document' ? '✅ 内容已追加到文档' : '✅ 记事已保存',
      clear: true,
    };
  } catch {
    return { ok: false, message: '保存失败，请重试' };
  }
}

export function getQuickNoteFloatTitle(isFromButton: boolean): string {
  const { documentId, saveType } = resolveQuickNoteTargetConfig(isFromButton);
  if (saveType === 'document' && documentId) return '⚡ 快速追加到文档';
  return '⚡ 快速记事';
}

export function getQuickNoteFloatPlaceholder(isFromButton: boolean): string {
  const { documentId, saveType } = resolveQuickNoteTargetConfig(isFromButton);
  if (saveType === 'document' && documentId) return '请输入要追加到文档的内容…';
  return '记一笔…';
}