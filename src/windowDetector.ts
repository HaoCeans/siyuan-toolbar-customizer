import { isMobileDevice, pluginInstance, setPluginInstance, showPopupSelectDialog, processTemplateVariables, getToolbarAvailableWidth, getButtonWidth } from './toolbarManager';
import * as Notify from './notification';
import { appendBlock, prependBlock } from './api';

// 存储当前的事件监听器，以便可以移除
let visibilityChangeListener: (() => void) | null = null;
let freezeListener: (() => void) | null = null;
let focusListener: (() => void) | null = null;
let resizeListener: (() => void) | null = null;

// 记录设备初始高度
let deviceInitialHeight: number | null = null;

// 记录设备最大高度（用于检测小窗模式）
let deviceMaxHeight: number | null = null;

// 标记页面是否被冻结过（锁屏或系统冻结）
let wasPageFrozen = false;
// 记录从冻结恢复的时间戳
let lastFreezeRecoveryTime = 0;
// 冻结恢复后的防抖时间（2秒内不触发弹窗）
const FREEZE_RECOVERY_DEBOUNCE_MS = 2000;

// 记录弹窗当前是否正在显示（防止重复弹出）
let isNoteDialogShowing = false;
// 记录最后显示弹窗的时间戳（用于防抖）
let lastDialogShowTime = 0;
// 弹窗显示后的防抖时间（3秒内不重复触发）
const DIALOG_SHOW_DEBOUNCE_MS = 3000;
// 弹窗关闭后的冷却时间（关闭后3秒内不触发新弹窗）
const DIALOG_COOLDOWN_MS = 3000;
// 记录前后台切换次数和时间（用于检测频繁切换）
let visibilityChangeCount = 0;
let firstVisibilityChangeTime = 0;
// 频繁切换的判定：1秒内切换3次以上
const RAPID_SWITCH_THRESHOLD = 3;
const RAPID_SWITCH_TIME_WINDOW = 1000;

// 记录最后一次进入后台的时间（用于检测长期挂后台）
let lastBackgroundTime = 0;
// 长期挂后台的阈值（超过15秒视为长期挂后台）
const LONG_BACKGROUND_THRESHOLD_MS = 15000;

// 记录挂后台时是否有输入框聚焦（恢复前台时检查此状态）
let hadInputFocusedOnBackground = false;

// 记录上次窗口尺寸（用于检测窗口模式变化）
let lastWindowWidth = 0;
let lastWindowHeight = 0;
// 记录页面是否已完成初始加载
let isPageInitialized = false;
// 页面加载后的首次检测延迟（毫秒）
const INITIAL_CHECK_DELAY_MS = 500;

// 存储所有定时器ID，用于清理
let initialCheckTimer: ReturnType<typeof setTimeout> | null = null;
let visibilityChangeTimer: ReturnType<typeof setTimeout> | null = null;
let pageFocusTimer: ReturnType<typeof setTimeout> | null = null;

// 存储弹窗相关的定时器ID，用于清理
let dialogFocusTimer: ReturnType<typeof setTimeout> | null = null;
let dialogBuiltinCloseTimer: ReturnType<typeof setTimeout> | null = null;

// 弹窗保护机制：防止刚显示的弹窗被立即关闭
let dialogOpenTime = 0;
// 弹窗显示后的保护期（毫秒），保护期内不会被后台事件自动关闭
const DIALOG_PROTECTION_MS = 500;

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
  let notebookId = '';
  let documentId = '';
  let saveType: 'daily' | 'document' = 'daily';
  let insertPosition: 'top' | 'bottom' = 'bottom';  // 默认插入到底部
  let isFromButton = false; // 标记是否来自按钮触发

  // 检查是否有临时配置
  if (tempPlugin?.mobileFeatureConfig) {
    const config = tempPlugin.mobileFeatureConfig;
    saveType = config.quickNoteSaveType || 'daily';
    insertPosition = config.quickNoteInsertPosition || 'bottom';
    if (saveType === 'document') {
      documentId = config.quickNoteDocumentId || '';
    } else {
      notebookId = config.quickNoteNotebookId || '';
    }
    isFromButton = true; // 有临时配置，说明是按钮触发
  } else {
    // 使用全局配置
    const config = pluginInstance?.mobileFeatureConfig;
    saveType = config?.quickNoteSaveType || 'daily';
    insertPosition = config?.quickNoteInsertPosition || 'bottom';
    // 根据保存类型只读取对应的ID
    if (saveType === 'document') {
      documentId = config?.quickNoteDocumentId || '';
    } else {
      notebookId = config?.quickNoteNotebookId || '';
    }
  }

  // 显示思源原生编辑器弹窗，传递文档ID、保存类型、插入位置和触发来源
  showSiyuanEditorDialog(notebookId, documentId, saveType, insertPosition, isFromButton);
}

// 思源原生编辑器弹窗（路由函数）
function showSiyuanEditorDialog(notebookId: string, documentId?: string, saveType: 'daily' | 'document' = 'daily', insertPosition: 'top' | 'bottom' = 'bottom', isFromButton: boolean = false) {
  // 根据平台调用不同的弹窗函数
  if (isMobileDevice()) {
    // 移动端专用的弹窗
    showNoteInputDialogMobile(notebookId, documentId, saveType, insertPosition, isFromButton);
  } else {
    // 电脑端专用的弹窗
    showNoteInputDialogDesktop(notebookId, documentId, saveType, insertPosition, isFromButton);
  }
}

// === 电脑端专用弹窗 ===
function showNoteInputDialogDesktop(notebookId: string, documentId?: string, saveType: 'daily' | 'document' = 'daily', insertPosition: 'top' | 'bottom' = 'bottom', isFromButton: boolean = false) {
  // 检查是否已有弹窗存在，防止重复创建
  const existingDialog = document.getElementById('quick-note-dialog-desktop');
  if (existingDialog) {
    // 如果弹窗已存在，直接返回，不创建新弹窗
    return;
  }

  // 检查是否在防抖时间内
  const timeSinceLastShow = Date.now() - lastDialogShowTime;
  if (timeSinceLastShow < DIALOG_SHOW_DEBOUNCE_MS && !isFromButton) {
    // 自启动模式下，如果在防抖时间内，不显示新弹窗
    return;
  }

  // 标记弹窗正在显示
  isNoteDialogShowing = true;
  lastDialogShowTime = Date.now();

  // 创建电脑端专用弹窗
  const dialog = document.createElement('div');
  dialog.id = 'quick-note-dialog-desktop';
  dialog.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: transparent;
    z-index: 100000;
    pointer-events: none;
  `;

  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 24px;
    width: 320px;
    max-width: 320px;
    height: 80vh;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: fixed;
    right: 40px;
    top: 57%;
    transform: translateY(-50%);
    pointer-events: auto;
  `;

  const title = document.createElement('h2');
  title.textContent = documentId ? '📒 文档记事' : '📒 日记记事';
  title.style.cssText = `
    margin: 0 0 20px 0;
    color: #333;
    font-size: 20px;
    text-align: center;
    font-weight: 600;
  `;

  const textarea = document.createElement('textarea');
  textarea.placeholder = documentId ? '请输入要追加到文档的内容...' : '请输入您的日记内容...';
  const fontSize = pluginInstance?.mobileFeatureConfig?.quickNoteFontSize || 16;
  textarea.style.cssText = `
    flex: 1;
    min-height: 300px;
    max-height: calc(80vh - 160px);
    padding: 16px;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    font-size: ${fontSize}px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    resize: none;
    overflow-y: auto;
    overflow-x: hidden;
    word-wrap: break-word;
    line-height: 1.6;
  `;
  textarea.addEventListener('focus', () => {
    textarea.style.borderColor = '#3b82f6';
  });
  textarea.addEventListener('blur', () => {
    textarea.style.borderColor = '#e0e0e0';
  });

  const hint = document.createElement('div');
  hint.style.cssText = `
    font-size: 12px;
    color: #666;
    margin-top: 8px;
    text-align: center;
  `;
  hint.innerHTML = '💡 <kbd>Shift+Enter</kbd> 发送 · <kbd>Enter</kbd> 换行 · <kbd>Esc</kbd> 取消';

  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'buttons-container';
  buttonContainer.style.cssText = `
    display: flex;
    gap: 12px;
    justify-content: center;
    margin-top: 20px;
  `;

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '取消';
  cancelBtn.className = 'b3-button b3-button--outline';
  cancelBtn.style.cssText = `
    padding: 10px 24px;
    font-size: 14px;
    border-radius: 6px;
    cursor: pointer;
  `;
  cancelBtn.onclick = () => {
    dialog.remove();
    isNoteDialogShowing = false;
  };

  const saveBtn = document.createElement('button');
  saveBtn.textContent = '发送';
  saveBtn.className = 'b3-button b3-button--primary';
  saveBtn.style.cssText = `
    padding: 10px 24px;
    font-size: 14px;
    border-radius: 6px;
    cursor: pointer;
    background: #3b82f6;
    color: white;
    border: none;
  `;
  saveBtn.onclick = async () => {
    const content = textarea.value.trim();
    if (content) {
      // 校验ID是否已配置
      if (saveType === 'document' && !documentId) {
        alert('⚠️ 请先在【按钮】设置中，配置文档ID');
        return;
      }
      if (saveType === 'daily' && !notebookId) {
        alert('⚠️ 请先在【按钮】设置中，配置笔记本ID');
        return;
      }

      try {
        let success = false;
        if (saveType === 'document' && documentId) {
          success = await appendToSpecificDocument(documentId, content, insertPosition);
        } else {
          const response = await fetch('/api/block/appendDailyNoteBlock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              data: content + '\n',
              dataType: 'markdown',
              notebook: notebookId || undefined
            })
          });
          const result = await response.json();
          success = result.code === 0;
        }

        if (success) {
          textarea.value = '';
          textarea.focus();
          showSuccessMessage(saveType === 'document' ? '✅ 内容已追加到文档' : '✅ 记事已保存');
        } else {
          alert('保存失败，请重试');
        }
      } catch (error) {
        alert('记事保存失败，请重试');
      }
    }
  };

  buttonContainer.appendChild(cancelBtn);
  buttonContainer.appendChild(saveBtn);

  content.appendChild(title);
  content.appendChild(textarea);
  content.appendChild(hint);
  content.appendChild(buttonContainer);
  dialog.appendChild(content);
  document.body.appendChild(dialog);

  // 记录弹窗打开时间
  dialogOpenTime = Date.now();
  lastDialogShowTime = Date.now();

  // 自动聚焦到 textarea
  // 清除之前的定时器（如果存在）
  if (dialogFocusTimer) {
    clearTimeout(dialogFocusTimer);
  }
  dialogFocusTimer = setTimeout(() => {
    textarea.focus();

    // 绑定键盘事件
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.shiftKey) {
        // Shift+Enter 键发送
        e.preventDefault();
        saveBtn.click();
      } else if (e.key === 'Escape') {
        // Esc 键取消
        e.preventDefault();
        cancelBtn.click();
      }
    });
    dialogFocusTimer = null; // 执行完成后清空引用
  }, 100);
}

// === 移动端专用弹窗 ===
function showNoteInputDialogMobile(notebookId: string, documentId?: string, saveType: 'daily' | 'document' = 'daily', insertPosition: 'top' | 'bottom' = 'bottom', isFromButton: boolean = false) {
  // 检查是否已有弹窗存在，防止重复创建
  const existingDialog = document.getElementById('quick-note-dialog');
  if (existingDialog) {
    // 如果弹窗已存在，直接返回，不创建新弹窗
    return;
  }

  // 检查是否在防抖时间内
  const timeSinceLastShow = Date.now() - lastDialogShowTime;
  if (timeSinceLastShow < DIALOG_SHOW_DEBOUNCE_MS && !isFromButton) {
    // 自启动模式下，如果在防抖时间内，不显示新弹窗
    return;
  }

  // 标记弹窗正在显示
  isNoteDialogShowing = true;
  lastDialogShowTime = Date.now();

  // 获取样式配置
  const styleConfig = pluginInstance?.mobileFeatureConfig?.quickNoteStyle || 'apple';
  const isAppleStyle = styleConfig === 'apple';
  
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
    background: rgba(0, 0, 0, 0.6);
    z-index: 100000;
    display: flex;
    justify-content: center;
    align-items: center;
  `;

  const content = document.createElement('div');
  // 防止内容容器获取焦点
  content.tabIndex = -1;
  content.style.cssText = isAppleStyle ? `
    background: white;
    border-radius: 14px;
    padding: 20px;
    width: 90%;
    max-width: 500px;
    height: 80vh;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  ` : `
    background: white;
    border-radius: 12px;
    padding: 24px;
    width: 90%;
    max-width: 500px;
    height: 80vh;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  `;

  const title = document.createElement('h2');
  title.textContent = isAppleStyle 
    ? (documentId ? '文档记事' : '日记记事')
    : (documentId ? '📒 文档记事' : '📒 日记记事');
  title.style.cssText = isAppleStyle ? `
    margin: 0 0 16px 0;
    color: #000;
    font-size: 17px;
    font-weight: 600;
    text-align: center;
    letter-spacing: -0.3px;
  ` : `
    margin: 0 0 16px 0;
    color: #333;
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
    max-height: 70vh;  /* 限制整体最大高度，按钮多时压缩输入框 */
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

  const textarea = document.createElement('textarea');
  textarea.placeholder = documentId ? (isAppleStyle ? '追加到文档' : '请输入要追加到文档的内容...') : (isAppleStyle ? '写日记' : '请输入您的日记内容...');
  
  // 获取字体大小配置
  const fontSize = pluginInstance?.mobileFeatureConfig?.quickNoteFontSize || (isAppleStyle ? 17 : 16);
  
  textarea.style.cssText = isAppleStyle ? `
    flex: 1;
    padding: 12px 16px;
    border: none;
    background: #f2f2f7;
    border-radius: 10px;
    font-size: ${fontSize}px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    resize: none;
    overflow-y: auto;
    overflow-x: hidden;
    word-wrap: break-word;
    line-height: 1.4;
    letter-spacing: -0.2px;
    -webkit-overflow-scrolling: touch;
    -ms-overflow-style: scrollbar;
    scrollbar-width: thin;
    scrollbar-color: #888 #f1f1f1;
  ` : `
    flex: 1;
    padding: 16px;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    font-size: ${fontSize}px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    resize: none;
    overflow-y: auto;
    overflow-x: hidden;
    word-wrap: break-word;
    line-height: 1.5;
    -webkit-overflow-scrolling: touch;
    -ms-overflow-style: scrollbar;
    scrollbar-width: thin;
    scrollbar-color: #888 #f1f1f1;
  `;
  
  // 为Webkit浏览器添加滚动条样式（避免重复注入）
  const textareaStyleId = 'quick-note-textarea-scrollbar-style';
  if (!document.getElementById(textareaStyleId)) {
    const scrollbarStyle = document.createElement('style');
    scrollbarStyle.id = textareaStyleId;
    scrollbarStyle.textContent = `
      #quick-note-dialog textarea::-webkit-scrollbar {
        width: 8px;
      }
      #quick-note-dialog textarea::-webkit-scrollbar-track {
        background: #f1f1f1;
        border-radius: 4px;
      }
      #quick-note-dialog textarea::-webkit-scrollbar-thumb {
        background: #888;
        border-radius: 4px;
      }
      #quick-note-dialog textarea::-webkit-scrollbar-thumb:hover {
        background: #555;
      }
    `;
    document.head.appendChild(scrollbarStyle);
  }

  noteSection.appendChild(textarea);

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
    color: #666;
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
    background: ${isAppleStyle ? '#007AFF' : 'var(--b3-theme-primary)'};
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
    const content = textarea.value.trim();
    if (content) {
      // 校验ID是否已配置（根据保存类型和触发来源给出精确提示）
      if (saveType === 'document' && !documentId) {
        const tipPrefix = isFromButton ? '【按钮】' : '【自启动一键记事】';
        alert(`⚠️ 请先在${tipPrefix}设置中，配置文档ID`);
        return;
      }
      if (saveType === 'daily' && !notebookId) {
        const tipPrefix = isFromButton ? '【按钮】' : '【自启动一键记事】';
        alert(`⚠️ 请先在${tipPrefix}设置中，配置笔记本ID`);
        return;
      }

      try {
        let success = false;

        // 根据保存类型选择对应的API
        if (saveType === 'document' && documentId) {
          // 文档模式：使用 prependBlock 或 appendBlock API 插入到指定文档
          success = await appendToSpecificDocument(documentId, content, insertPosition);
        } else {
          // 日记模式：使用日记API
          const response = await fetch('/api/block/appendDailyNoteBlock', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              data: content + '\n',
              dataType: 'markdown',
              notebook: notebookId || undefined
            })
          });

          const result = await response.json();
          success = result.code === 0;
        }

        if (success) {
          showSuccessMessage(saveType === 'document' ? '✅ 内容已追加到文档' : '✅ 记事已保存');
          // 清理滚动条样式
          const styleIds = ['quick-note-textarea-scrollbar-style', 'quick-note-buttons-scrollbar-style'];
          styleIds.forEach(id => {
            const style = document.getElementById(id);
            if (style) style.remove();
          });
          dialog.remove();
          // 标记弹窗已关闭
          isNoteDialogShowing = false;
        } else {
          alert('保存失败，请重试');
        }
      } catch (error) {
        alert('记事保存失败，请重试');
      }
    }
  };

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '取消';
  cancelBtn.style.cssText = `
    font-size: 17px;
    letter-spacing: 0.5px;
    padding: 10px 24px;
    background: ${isAppleStyle ? '#E5E5EA' : 'transparent'};
    color: ${isAppleStyle ? '#000' : 'var(--b3-theme-on-surface)'};
    border: ${isAppleStyle ? 'none' : '1px solid var(--b3-border-color)'};
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
  cancelBtn.onclick = () => {
    dialog.remove();
    // 标记弹窗已关闭
    isNoteDialogShowing = false;
  };

  buttonContainer.appendChild(cancelBtn);
  buttonContainer.appendChild(saveBtn);

  content.appendChild(title);
  content.appendChild(mainContainer);
  content.appendChild(buttonContainer);
  dialog.appendChild(content);

  document.body.appendChild(dialog);

  // 电脑端特有功能：自动聚焦、Enter发送、Esc取消
  if (!isMobileDevice() && isFromButton) {
    // 使用 setTimeout 确保 DOM 已渲染
    // 清除之前的定时器（如果存在）
    if (dialogFocusTimer) {
      clearTimeout(dialogFocusTimer);
    }
    dialogFocusTimer = setTimeout(() => {
      // 自动聚焦到 textarea
      textarea.focus();

      // 监听键盘事件
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          // Enter 键（未按 Shift）发送
          e.preventDefault();
          saveBtn.click();
        } else if (e.key === 'Escape') {
          // Esc 键取消
          e.preventDefault();
          cancelBtn.click();
        }
      });
      dialogFocusTimer = null; // 执行完成后清空引用
    }, 100);
  }

  // 记录弹窗打开时间，用于保护期机制
  dialogOpenTime = Date.now();

  // 更新最后显示弹窗时间，用于冷却期判断（按钮触发的除外）
  if (!isFromButton) {
    lastDialogShowTime = Date.now();
  }

  // 不自动聚焦，完全由用户手动点击编辑框来控制输入法
}

// 关闭记事弹窗的函数
function closeNoteDialog() {
  const noteDialog = document.getElementById('quick-note-dialog');
  if (noteDialog) {
    // 检查是否在保护期内
    const timeSinceOpen = Date.now() - dialogOpenTime;
    if (timeSinceOpen < DIALOG_PROTECTION_MS) {
      // 保护期内不关闭，防止刚显示就被误关闭
      console.log('[弹窗保护] 在保护期内，拒绝关闭弹窗');
      return;
    }

    // 清理滚动条样式
    const styleIds = ['quick-note-textarea-scrollbar-style', 'quick-note-buttons-scrollbar-style'];
    styleIds.forEach(id => {
      const style = document.getElementById(id);
      if (style) style.remove();
    });
    noteDialog.remove();
    // 标记弹窗已关闭
    isNoteDialogShowing = false;
    // 设置冷却期（手动关闭后也需要冷却）
    lastDialogShowTime = Date.now();
  }
}

// 立即关闭记事弹窗的函数（无延迟）
function closeNoteDialogImmediately() {
  const noteDialog = document.getElementById('quick-note-dialog');
  if (noteDialog) {
    // 清理滚动条样式
    const scrollbarStyles = document.querySelectorAll('style');
    scrollbarStyles.forEach(style => {
      if (style.textContent && style.textContent.includes('quick-note-dialog')) {
        style.remove();
      }
    });
    noteDialog.remove();
    // 标记弹窗已关闭
    isNoteDialogShowing = false;
    // 设置冷却期（立即关闭后也需要冷却）
    lastDialogShowTime = Date.now();
  }
}
/**
 * 创建按钮元素
 * 根据按钮配置创建克隆按钮
 */
function createClonedButton(buttonConfig: any, originalBtn: HTMLElement | null): HTMLElement {
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
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    background: white;
    color: #333;
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
    clonedBtn.style.backgroundColor = '#f5f5f5';
    clonedBtn.style.transform = 'translateY(-1px)';
    clonedBtn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
  });
  
  clonedBtn.addEventListener('mouseleave', () => {
    clonedBtn.style.backgroundColor = 'white';
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
 * 根据排序方法渲染按钮
 */
function renderButtons(
  container: HTMLElement,
  buttonConfigs: any[],
  sortMethod: string
): void {
  // 创建按钮容器
  const buttonsContainer = document.createElement('div');
  buttonsContainer.className = 'buttons-container';

  // 获取配置的按钮间距
  const useCustomStyle = pluginInstance?.mobileFeatureConfig?.useCustomButtonStyle || false;
  const buttonGap = useCustomStyle
    ? (pluginInstance?.mobileFeatureConfig?.quickNoteButtonGap || 6)
    : 6;  // 默认配置

  // 先过滤掉扩展工具栏按钮和未启用的按钮
  const filteredConfigs = buttonConfigs.filter(btn => btn.id !== 'overflow-button-mobile' && btn.enabled !== false);

  // 根据排序方法设置样式和排序
  let sortedConfigs: any[];

  if (sortMethod === 'topToolbar') {
    // 顶部工具栏排序：每行从右往左，sort小的在右，sort大的在左，居中
    // 使用 row-reverse + 升序 + center
    buttonsContainer.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: ${buttonGap}px;
      flex-direction: row-reverse;
      justify-content: center;
      align-content: flex-start;
      padding: 6px 0;
      width: 100%;
    `;
    // 升序排列：sort小的在前，配合row-reverse会显示在右边
    sortedConfigs = [...filteredConfigs].sort((a, b) => a.sort - b.sort);
  } else {
    // 底部工具栏排序：最新按钮在左上，居中显示
    // 效果：按行填充，从左到右，不满行居中

    // 降序排列：sort大的在前（新按钮优先）
    sortedConfigs = [...filteredConfigs].sort((a, b) => b.sort - a.sort);

    buttonsContainer.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: ${buttonGap}px;
      flex-direction: row;
      justify-content: center;
      align-content: flex-start;
      padding: 6px 0;
      width: 100%;
    `;
  }
  
  // 渲染按钮（使用排序后的配置）
  sortedConfigs.forEach((buttonConfig) => {
    // 查找对应的DOM按钮元素
    const originalBtn = document.querySelector(`[data-custom-button="${buttonConfig.id}"]`) as HTMLElement;
    
    // 创建按钮副本
    const clonedBtn = createClonedButton(buttonConfig, originalBtn);
    
    // 添加点击事件
    clonedBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await handleButtonClick(buttonConfig, originalBtn);
    });
    
    buttonsContainer.appendChild(clonedBtn);
  });
  
  // 如果没有创建任何按钮，显示提示
  if (buttonsContainer.children.length === 0) {
    const noButtonsMsg = document.createElement('div');
    noButtonsMsg.textContent = '暂无可用按钮';
    noButtonsMsg.style.cssText = `
      font-size: 12px;
      color: #999;
      text-align: center;
      padding: 20px;
    `;
    container.appendChild(noButtonsMsg);
    return;
  }

  container.appendChild(buttonsContainer);
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
    // 特殊处理：template类型按钮的行为
    if (buttonConfig.type === 'template') {
      // 获取弹窗中的textarea输入框
      const noteDialog = document.getElementById('quick-note-dialog');
      const textarea = noteDialog?.querySelector('textarea');
      
      if (textarea && buttonConfig.template) {
        // 处理模板变量
        let templateContent = buttonConfig.template;
        const now = new Date();
        
        // 替换模板变量
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
        
        // 插入到输入框光标位置
        const input = textarea as HTMLTextAreaElement;
        const startPos = input.selectionStart || input.value.length;
        const endPos = input.selectionEnd || input.value.length;
        
        input.value = input.value.substring(0, startPos) + templateContent + input.value.substring(endPos);
        
        // 设置新的光标位置
        const newCursorPos = startPos + templateContent.length;
        input.setSelectionRange(newCursorPos, newCursorPos);
        
        // 聚焦到输入框
        input.focus();
        
        // 根据按钮配置决定是否显示插入成功提示
        Notify.showInfoTemplateInserted(buttonConfig.showNotification !== false);
      }
      
      // template类型按钮不关闭弹窗，直接返回
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
        const noteDialog = document.getElementById('quick-note-dialog');
        const textarea = noteDialog?.querySelector('textarea');
        
        if (textarea) {
          const processedContent = processTemplateVariables(selectedTemplate.content);
          const input = textarea as HTMLTextAreaElement;
          const startPos = input.selectionStart || input.value.length;
          const endPos = input.selectionEnd || input.value.length;
          
          input.value = input.value.substring(0, startPos) + processedContent + input.value.substring(endPos);
          
          const newCursorPos = startPos + processedContent.length;
          input.setSelectionRange(newCursorPos, newCursorPos);
          input.focus();
        }
      }
      
      // 不关闭弹窗，直接返回
      return;
    }
    
    // 其他类型按钮：使用工具栏管理器执行按钮功能
    const toolbarManager = (window as any).__toolbarManager;
    if (toolbarManager && typeof toolbarManager.executeButton === 'function') {
      // 特殊处理builtin类型：需要短暂延迟后再关闭弹窗
      if (buttonConfig.type === 'builtin') {
        // 执行按钮功能
        await toolbarManager.executeButton(buttonConfig);
        // builtin按钮需要短暂延迟确保功能执行完成
        // 清除之前的定时器（如果存在）
        if (dialogBuiltinCloseTimer) {
          clearTimeout(dialogBuiltinCloseTimer);
        }
        dialogBuiltinCloseTimer = setTimeout(() => {
          closeNoteDialog();
          dialogBuiltinCloseTimer = null; // 执行完成后清空引用
        }, 100); // 100ms延迟
      } else if (buttonConfig.type === 'click-sequence') {
        // 执行按钮功能并等待完成
        await toolbarManager.executeButton(buttonConfig);
        // click-sequence执行完成后立即关闭弹窗
        closeNoteDialogImmediately();
      } else {
        // 其他类型按钮正常执行
        await toolbarManager.executeButton(buttonConfig);
        // 立即关闭窗口
        closeNoteDialogImmediately();
      }
    } else {
      // 如果工具栏管理器不可用，尝试触发原始按钮
      if (originalBtn) {
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        originalBtn.dispatchEvent(clickEvent);
      }
      // 立即关闭窗口
      closeNoteDialogImmediately();
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
    // 获取所有按钮配置
    const buttonConfigs = (window as any).__mobileButtonConfigs || [];
    
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

    // 为滚动条添加样式（避免重复注入）
    const styleId = 'quick-note-buttons-scrollbar-style';
    if (!document.getElementById(styleId)) {
      const scrollbarStyle = document.createElement('style');
      scrollbarStyle.id = styleId;
      scrollbarStyle.textContent = `
        #quick-note-dialog .buttons-container::-webkit-scrollbar {
          width: 6px;
        }
        #quick-note-dialog .buttons-container::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 3px;
        }
        #quick-note-dialog .buttons-container::-webkit-scrollbar-thumb {
          background: #888;
          border-radius: 3px;
        }
        #quick-note-dialog .buttons-container::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
      `;
      document.head.appendChild(scrollbarStyle);
    }

    // 根据排序方法调用渲染函数
    renderButtons(container, buttonConfigs, sortMethod);

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

// 新增：根据文档ID追加内容的函数
async function appendToSpecificDocument(documentId: string, content: string, insertPosition: 'top' | 'bottom' = 'bottom'): Promise<boolean> {
  try {
    let result;
    if (insertPosition === 'top') {
      // 插入到文档顶部
      result = await prependBlock('markdown', content + '\n', documentId);
    } else {
      // 追加到文档底部
      result = await appendBlock('markdown', content + '\n', documentId);
    }
    return result && result.length > 0;
  } catch (error) {
    return false;
  }
}

function showSuccessMessage(message: string) {
  const msg = document.createElement('div');
  msg.textContent = message;
  msg.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #4CAF50;
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    z-index: 100001;
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
  const noteDialog = document.getElementById('quick-note-dialog');
  if (!noteDialog) {
    return false;
  }
  const textarea = noteDialog.querySelector('textarea') as HTMLTextAreaElement;
  if (!textarea) {
    return false;
  }
  return textarea.value.trim().length > 0;
}

/**
 * 检查小窗模式并决定是否触发弹窗
 * 延迟检测函数，供延迟调用使用
 */
function checkSmallWindowAndShowDialog() {
  // 只在移动端处理
  if (!isMobileDevice() || !pluginInstance) {
    return;
  }

  // 再次检查是否在冷却期内（延迟期间可能又被触发）
  const timeSinceLastShow = Date.now() - lastDialogShowTime;
  if (timeSinceLastShow < DIALOG_COOLDOWN_MS) {
    return;
  }

  // 修复：检查挂后台时是否有输入框聚焦
  // 使用挂后台时记录的状态，而不是恢复后的焦点状态
  // 因为恢复后键盘可能已收起，焦点已丢失
  if (hadInputFocusedOnBackground) {
    console.log('[一键记事] 检测到挂后台时输入框聚焦，跳过弹窗');
    // 重置标记，避免影响下次检测
    hadInputFocusedOnBackground = false;
    return;
  }

  // 重置标记（已完成检测）
  hadInputFocusedOnBackground = false;

  // 获取弹窗配置
  const popupConfig = pluginInstance.mobileFeatureConfig?.popupConfig || 'bothModes';
  if (popupConfig === 'disabled') {
    return;
  }

  // 获取当前窗口尺寸
  const currentWidth = window.innerWidth;
  const currentHeight = window.innerHeight;
  const screenWidth = window.screen.width;
  const screenHeight = window.screen.height;

  // 方法：占用比例判断 + visualViewport 优化
  const widthRatio = currentWidth / screenWidth;
  const layoutHeightRatio = currentHeight / screenHeight;

  let isSmallWindowMode = false;

  // 使用 visualViewport 排除键盘干扰
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const visualHeight = vv.height;
    const visualHeightRatio = visualHeight / screenHeight;

    // 修复：确保键盘高度不为负数（避免挂后台恢复时 currentHeight 与 visualViewport 不一致）
    const keyboardHeight = Math.max(0, currentHeight - visualHeight);

    // 键盘高度超过200px，认为是键盘打开
    const isKeyboardOpen = keyboardHeight > 200;

    if (isKeyboardOpen) {
      // 键盘弹出时：主要看宽度占比（高度被键盘压缩了）
      // 宽度占比小于85%认为是小窗/分屏
      isSmallWindowMode = widthRatio < 0.85;
    } else {
      // 无键盘时：使用 visualHeight 进行高度判断（更可靠，不受布局视口影响）
      // 同时判断宽度和高度，任一明显小于全屏即判定为小窗
      isSmallWindowMode = widthRatio < 0.85 || visualHeightRatio < 0.85;
    }
  } else {
    // 降级：浏览器不支持 visualViewport，只用布局视口
    // 同时判断宽度和高度，任一明显小于全屏即判定为小窗
    isSmallWindowMode = widthRatio < 0.85 || layoutHeightRatio < 0.85;
  }

  // 根据配置决定是否触发弹窗
  if (popupConfig === 'bothModes') {
    showSmallWindowTip();
  } else if (popupConfig === 'smallWindowOnly' && isSmallWindowMode) {
    showSmallWindowTip();
  }
}

/**
 * 处理前后台切换
 * 根据配置决定是否触发弹窗
 */
function handleVisibilityChange() {
  // 只在移动端处理
  if (!isMobileDevice() || !pluginInstance) {
    return;
  }

  // 记录前后台切换（用于检测频繁切换）
  const now = Date.now();
  if (firstVisibilityChangeTime === 0) {
    firstVisibilityChangeTime = now;
    visibilityChangeCount = 1;
  } else {
    // 检查是否在时间窗口内
    if (now - firstVisibilityChangeTime <= RAPID_SWITCH_TIME_WINDOW) {
      visibilityChangeCount++;
      // 检测到频繁切换：直接关闭弹窗并进入冷却期
      if (visibilityChangeCount >= RAPID_SWITCH_THRESHOLD) {
        const existingDialog = document.getElementById('quick-note-dialog');
        if (existingDialog) {
          closeNoteDialog();
        }
        // 设置冷却期
        lastDialogShowTime = now;
        // 重置计数器
        visibilityChangeCount = 0;
        firstVisibilityChangeTime = 0;
        return;
      }
    } else {
      // 超出时间窗口，重置计数器
      firstVisibilityChangeTime = now;
      visibilityChangeCount = 1;
    }
  }

  // 当应用切到后台时：自动关闭一键记事弹窗（除非有内容或处于保护期）
  if (document.hidden) {
    // 记录进入后台的时间
    lastBackgroundTime = Date.now();

    // 记录挂后台时是否有输入框聚焦
    const activeElement = document.activeElement;
    if (activeElement) {
      const tagName = activeElement.tagName.toLowerCase();
      const isInputFocused = tagName === 'textarea' ||
                            tagName === 'input' ||
                            activeElement.getAttribute('contenteditable') === 'true';
      const isProtyleFocused = activeElement.closest('.protyle') !== null;
      hadInputFocusedOnBackground = isInputFocused || isProtyleFocused;
      console.log('[一键记事] 挂后台时检测到输入状态:', hadInputFocusedOnBackground);
    } else {
      hadInputFocusedOnBackground = false;
    }

    const existingDialog = document.getElementById('quick-note-dialog');
    if (existingDialog) {
      // 检查是否在保护期内，closeNoteDialog 会自动处理
      // 只保护空的弹窗，有内容的弹窗无论如何都保留
      const textarea = existingDialog.querySelector('textarea') as HTMLTextAreaElement;
      // 只有当输入框没有内容时才尝试关闭弹窗（closeNoteDialog会检查保护期）
      if (textarea && !textarea.value.trim()) {
        closeNoteDialog();
      }
      // 如果有内容，保留弹窗，让用户回到前台时继续编辑
    }
    return;
  }

  // 当应用从后台回到前台时
  if (isAppInForeground()) {
    // 检查是否长期挂后台（超过15秒），如果是则清空冷却期
    if (lastBackgroundTime > 0) {
      const timeInBackground = Date.now() - lastBackgroundTime;
      if (timeInBackground > LONG_BACKGROUND_THRESHOLD_MS) {
        // 长期挂后台，清空冷却期计时器，允许弹窗正常触发
        lastDialogShowTime = 0;
        lastFreezeRecoveryTime = 0;
        lastBackgroundTime = 0; // 重置后台时间
      }
    }

    // 检查页面是否被冻结过（锁屏或系统冻结）
    if (wasPageFrozen) {
      wasPageFrozen = false;
      lastFreezeRecoveryTime = Date.now();
      return;
    }

    // 检查是否在冻结恢复后的防抖时间内
    const timeSinceRecovery = Date.now() - lastFreezeRecoveryTime;
    if (timeSinceRecovery < FREEZE_RECOVERY_DEBOUNCE_MS) {
      return;
    }

    // 检查是否在弹窗关闭后的冷却期内（频繁切换或手动关闭后3秒内不触发）
    const timeSinceLastShow = Date.now() - lastDialogShowTime;
    if (timeSinceLastShow < DIALOG_COOLDOWN_MS) {
      return;
    }

    // 延迟检测小窗模式（等待键盘状态和视口尺寸稳定）
    // 修复：避免输入法挂后台恢复时因视口尺寸未稳定导致误判
    // 清除之前的定时器（避免重复）
    if (visibilityChangeTimer) {
      clearTimeout(visibilityChangeTimer);
    }
    visibilityChangeTimer = setTimeout(() => {
      checkSmallWindowAndShowDialog();
      visibilityChangeTimer = null; // 执行完成后清空引用
    }, 300);
  }
  // 应用切到后台：不做任何操作，完全由系统控制输入法
}

/**
 * 处理页面获得焦点事件
 * 用于检测长期挂后台后突然以小窗模式启动的场景
 */
function handlePageFocus() {
  // 只在移动端处理
  if (!isMobileDevice() || !pluginInstance) {
    return;
  }

  // 检查是否长期挂后台（超过15秒），如果是则清空冷却期
  if (lastBackgroundTime > 0) {
    const timeInBackground = Date.now() - lastBackgroundTime;
    if (timeInBackground > LONG_BACKGROUND_THRESHOLD_MS) {
      // 长期挂后台，清空冷却期计时器，允许弹窗正常触发
      lastDialogShowTime = 0;
      lastFreezeRecoveryTime = 0;
      lastBackgroundTime = 0; // 重置后台时间
    }
  }

  // 检查是否在冷却期内
  const timeSinceLastShow = Date.now() - lastDialogShowTime;
  if (timeSinceLastShow < DIALOG_COOLDOWN_MS) {
    return;
  }

  // 获取弹窗配置
  const popupConfig = pluginInstance.mobileFeatureConfig?.popupConfig || 'bothModes';
  if (popupConfig === 'disabled') {
    return;
  }

  // 延迟执行，确保窗口尺寸已稳定
  // 使用与 visibilitychange 相同的延迟和检测逻辑，确保行为一致
  // 清除之前的定时器（避免重复）
  if (pageFocusTimer) {
    clearTimeout(pageFocusTimer);
  }
  pageFocusTimer = setTimeout(() => {
    checkSmallWindowAndShowDialog();
    pageFocusTimer = null; // 执行完成后清空引用
  }, 300);
}

/**
 * 处理窗口尺寸变化事件
 * 用于检测窗口模式变化（如从小窗变为全屏）
 */
function handleWindowResize() {
  // 只在移动端处理
  if (!isMobileDevice() || !pluginInstance) {
    return;
  }

  // 页面初始化完成前不处理resize事件
  if (!isPageInitialized) {
    return;
  }

  // 检查是否在冷却期内
  const timeSinceLastShow = Date.now() - lastDialogShowTime;
  if (timeSinceLastShow < DIALOG_COOLDOWN_MS) {
    return;
  }

  const currentWidth = window.innerWidth;
  const currentHeight = window.innerHeight;

  // 如果尺寸没有变化，不处理
  if (currentWidth === lastWindowWidth && currentHeight === lastWindowHeight) {
    return;
  }

  // 更新记录
  lastWindowWidth = currentWidth;
  lastWindowHeight = currentHeight;
}

/**
 * 执行页面初始检测
 * 在页面加载完成后执行一次检测
 */
function performInitialCheck() {
  // 只在移动端处理
  if (!isMobileDevice() || !pluginInstance) {
    return;
  }

  // 获取弹窗配置
  const popupConfig = pluginInstance.mobileFeatureConfig?.popupConfig || 'bothModes';
  if (popupConfig === 'disabled') {
    return;
  }

  // 获取当前窗口尺寸
  const currentWidth = window.innerWidth;
  const currentHeight = window.innerHeight;
  const screenWidth = window.screen.width;
  const screenHeight = window.screen.height;

  // 记录初始尺寸
  lastWindowWidth = currentWidth;
  lastWindowHeight = currentHeight;

  // 判断小窗模式（与主逻辑保持一致，阈值85%）
  const widthRatio = currentWidth / screenWidth;
  const heightRatio = currentHeight / screenHeight;
  const isSmallWindowMode = widthRatio < 0.85 || heightRatio < 0.85;

  // 根据配置决定是否触发弹窗
  if (popupConfig === 'bothModes') {
    showSmallWindowTip();
  } else if (popupConfig === 'smallWindowOnly' && isSmallWindowMode) {
    showSmallWindowTip();
  }

  // 标记页面已初始化
  isPageInitialized = true;
}

/**
 * 初始化小窗模式检测器
 * 仅用于检测前后台切换和小窗模式提示
 */
export function initSmallWindowDetector(): void {
  // 清除可能存在的可见性变化监听器
  if (visibilityChangeListener) {
    document.removeEventListener('visibilitychange', visibilityChangeListener);
    visibilityChangeListener = null;
  }

  // 重置冻结标记和时间戳
  wasPageFrozen = false;
  lastFreezeRecoveryTime = 0;

  // 重置弹窗显示状态
  isNoteDialogShowing = false;
  lastDialogShowTime = 0;

  // 重置后台时间
  lastBackgroundTime = 0;

  // 重置输入状态标记
  hadInputFocusedOnBackground = false;

  // 重置页面初始化状态
  isPageInitialized = false;
  lastWindowWidth = 0;
  lastWindowHeight = 0;

  // 清除可能存在的冻结事件监听器
  if (freezeListener) {
    document.removeEventListener('freeze', freezeListener);
    freezeListener = null;
  }

  // 清除可能存在的焦点事件监听器
  if (focusListener) {
    window.removeEventListener('focus', focusListener);
    focusListener = null;
  }

  // 清除可能存在的resize事件监听器
  if (resizeListener) {
    window.removeEventListener('resize', resizeListener);
    resizeListener = null;
  }

  // 添加页面冻结事件监听（锁屏或系统冻结时触发）
  freezeListener = () => {
    wasPageFrozen = true;
  };
  document.addEventListener('freeze', freezeListener);

  // 添加可见性变化监听器（用于检测前后台切换）
  visibilityChangeListener = handleVisibilityChange;
  document.addEventListener('visibilitychange', visibilityChangeListener);

  // 添加焦点事件监听器（用于检测长期挂后台后突然启动的场景）
  focusListener = handlePageFocus;
  window.addEventListener('focus', focusListener);

  // 添加resize事件监听器（用于检测窗口尺寸变化）
  resizeListener = handleWindowResize;
  window.addEventListener('resize', resizeListener);

  // 页面加载完成后执行一次检测（延迟执行确保配置已加载）
  // 保存定时器ID以便清理
  initialCheckTimer = setTimeout(() => {
    performInitialCheck();
    initialCheckTimer = null; // 执行完成后清空引用
  }, INITIAL_CHECK_DELAY_MS);
}

/**
 * 清除小窗模式检测器
 * 移除所有事件监听器和定时器
 */
export function clearSmallWindowDetector(): void {
  // 清除所有定时器（防止插件卸载后仍执行）
  if (initialCheckTimer) {
    clearTimeout(initialCheckTimer);
    initialCheckTimer = null;
  }
  if (visibilityChangeTimer) {
    clearTimeout(visibilityChangeTimer);
    visibilityChangeTimer = null;
  }
  if (pageFocusTimer) {
    clearTimeout(pageFocusTimer);
    pageFocusTimer = null;
  }
  if (dialogFocusTimer) {
    clearTimeout(dialogFocusTimer);
    dialogFocusTimer = null;
  }
  if (dialogBuiltinCloseTimer) {
    clearTimeout(dialogBuiltinCloseTimer);
    dialogBuiltinCloseTimer = null;
  }

  // 清除可见性变化监听器
  if (visibilityChangeListener) {
    document.removeEventListener('visibilitychange', visibilityChangeListener);
    visibilityChangeListener = null;
  }

  // 清除冻结事件监听器
  if (freezeListener) {
    document.removeEventListener('freeze', freezeListener);
    freezeListener = null;
  }

  // 清除焦点事件监听器
  if (focusListener) {
    window.removeEventListener('focus', focusListener);
    focusListener = null;
  }

  // 清除resize事件监听器
  if (resizeListener) {
    window.removeEventListener('resize', resizeListener);
    resizeListener = null;
  }

  // 清理残留的弹窗DOM元素
  const mobileDialog = document.getElementById('quick-note-dialog');
  if (mobileDialog) {
    mobileDialog.remove();
  }
  const desktopDialog = document.getElementById('quick-note-dialog-desktop');
  if (desktopDialog) {
    desktopDialog.remove();
  }

  // 清理残留的滚动条样式元素
  const textareaScrollbarStyle = document.getElementById('quick-note-textarea-scrollbar-style');
  if (textareaScrollbarStyle) {
    textareaScrollbarStyle.remove();
  }
  const buttonsScrollbarStyle = document.getElementById('quick-note-buttons-scrollbar-style');
  if (buttonsScrollbarStyle) {
    buttonsScrollbarStyle.remove();
  }

  // 重置状态变量
  wasPageFrozen = false;
  lastFreezeRecoveryTime = 0;
  deviceInitialHeight = null;
  deviceMaxHeight = null;
  isNoteDialogShowing = false;
  lastDialogShowTime = 0;
  visibilityChangeCount = 0;
  firstVisibilityChangeTime = 0;
  lastBackgroundTime = 0;
  hadInputFocusedOnBackground = false;
  isPageInitialized = false;
  lastWindowWidth = 0;
  lastWindowHeight = 0;
  dialogOpenTime = 0; // 重置弹窗打开时间
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
export { showSmallWindowTip, showSiyuanEditorDialog };