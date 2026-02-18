import { isMobileDevice, pluginInstance, setPluginInstance, showPopupSelectDialog, processTemplateVariables, getToolbarAvailableWidth, getButtonWidth } from './toolbarManager';
import { appendBlock } from './api';

// 存储当前的事件监听器，以便可以移除
let visibilityChangeListener: (() => void) | null = null;

// 记录设备初始高度
let deviceInitialHeight: number | null = null;

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
  // 检查是否已经有弹窗存在
  const existingTip = document.querySelector('#small-window-tip-dialog');
  if (existingTip) {
    existingTip.remove();
  }

  // 优先使用临时配置（按钮触发时设置的），否则使用全局配置
  let notebookId = '';
  let documentId = '';
  let saveType: 'daily' | 'document' = 'daily';
  let isFromButton = false; // 标记是否来自按钮触发

  // 检查是否有临时配置
  const tempPlugin = (window as any).__pluginInstance;
  if (tempPlugin?.mobileFeatureConfig) {
    const config = tempPlugin.mobileFeatureConfig;
    saveType = config.quickNoteSaveType || 'daily';
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
    // 根据保存类型只读取对应的ID
    if (saveType === 'document') {
      documentId = config?.quickNoteDocumentId || '';
    } else {
      notebookId = config?.quickNoteNotebookId || '';
    }
  }

  // 显示思源原生编辑器弹窗，传递文档ID、保存类型和触发来源
  showSiyuanEditorDialog(notebookId, documentId, saveType, isFromButton);
}

// 思源原生编辑器弹窗
function showSiyuanEditorDialog(notebookId: string, documentId?: string, saveType: 'daily' | 'document' = 'daily', isFromButton: boolean = false) {
  // 直接使用自定义的美观输入弹窗（用户偏好方案）
  showNoteInputDialog(notebookId, documentId, saveType, isFromButton);
}

function showNoteInputDialog(notebookId: string, documentId?: string, saveType: 'daily' | 'document' = 'daily', isFromButton: boolean = false) {
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
  content.style.cssText = `
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
  title.textContent = documentId ? '📝 文档记事' : '📝 一键记事';
  title.style.cssText = `
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
  textarea.placeholder = documentId ? '请输入要追加到文档的内容...' : '请输入您的记事内容...';
  
  // 获取字体大小配置
  const fontSize = pluginInstance?.mobileFeatureConfig?.quickNoteFontSize || 16;
  
  textarea.style.cssText = `
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
    border-top: 1px solid #e0e0e0;
    padding-top: 8px;
    min-height: 40px;
    max-height: 50vh;  /* 按钮区域最大高度，超出可滚动 */
    overflow-y: auto;
    overflow-x: hidden;
  `;

  const toolbarTitle = document.createElement('div');
  toolbarTitle.textContent = '🔧 工具栏按钮';
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
    justify-content: flex-end;
    margin-top: 16px;
  `;

  const saveBtn = document.createElement('button');
  saveBtn.textContent = documentId ? '追加到文档' : '保存记事';
  saveBtn.className = 'b3-button b3-button--primary';
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
          // 文档模式：使用appendBlock API追加到指定文档
          success = await appendToSpecificDocument(documentId, content);
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
  cancelBtn.className = 'b3-button b3-button--outline';
  // 防止按钮获取焦点，保持输入法不关闭
  cancelBtn.tabIndex = -1;
  // 阻止 mousedown 导致的焦点转移
  cancelBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
  });
  cancelBtn.onclick = () => {
    dialog.remove();
  };

  buttonContainer.appendChild(cancelBtn);
  buttonContainer.appendChild(saveBtn);

  content.appendChild(title);
  content.appendChild(mainContainer);
  content.appendChild(buttonContainer);
  dialog.appendChild(content);

  document.body.appendChild(dialog);

  // 自动聚焦到输入框 - 使用 requestAnimationFrame 确保布局完成后再聚焦
  const focusTextarea = () => {
    textarea.focus();
    // 移动端额外尝试，确保输入法弹出
    if (isMobileDevice()) {
      textarea.click();
      // 再次尝试聚焦，处理某些浏览器延迟问题
      setTimeout(() => {
        if (document.activeElement !== textarea) {
          textarea.focus();
          textarea.click();
        }
      }, 300);
    }
  };
  
  // 等待 DOM 渲染完成
  if (document.readyState === 'complete') {
    requestAnimationFrame(() => {
      requestAnimationFrame(focusTextarea);
    });
  } else {
    setTimeout(focusTextarea, 150);
  }
}

// 关闭记事弹窗的函数
function closeNoteDialog() {
  const noteDialog = document.getElementById('quick-note-dialog');
  if (noteDialog) {
    // 清理滚动条样式
    const styleIds = ['quick-note-textarea-scrollbar-style', 'quick-note-buttons-scrollbar-style'];
    styleIds.forEach(id => {
      const style = document.getElementById(id);
      if (style) style.remove();
    });
    noteDialog.remove();
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
  } else {
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
  
  // 获取配置的按钮高度
  const buttonHeight = pluginInstance?.mobileFeatureConfig?.quickNoteButtonHeight || 32;
  
  // 设置按钮基本样式
  clonedBtn.style.cssText = `
    min-width: 36px;
    height: ${buttonHeight}px;
    padding: 4px 8px;
    margin: 2px;
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
    } else {
      // Emoji 或其他文本图标
      clonedBtn.textContent = buttonConfig.icon;
      clonedBtn.style.fontSize = `${buttonConfig.iconSize || 16}px`;
    }
  } else {
    clonedBtn.textContent = buttonConfig.name || '按钮';
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
      gap: 6px;
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
      gap: 6px;
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
        
        // 显示插入成功提示
        const successMsg = document.createElement('div');
        successMsg.textContent = '模板已插入';
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
        `;
        document.body.appendChild(successMsg);
        
        setTimeout(() => {
          if (successMsg.parentNode) {
            successMsg.parentNode.removeChild(successMsg);
          }
        }, 2000);
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
        setTimeout(() => {
          closeNoteDialog();
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
async function appendToSpecificDocument(documentId: string, content: string): Promise<boolean> {
  try {
    const result = await appendBlock('markdown', content + '\n', documentId);
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
 * 处理前后台切换
 * 根据配置决定是否触发弹窗
 */
function handleVisibilityChange() {
  // 只在移动端处理
  if (isMobileDevice() && pluginInstance) {
    // 当应用从后台回到前台时
    if (isAppInForeground()) {
      // 获取弹窗配置
      const popupConfig = pluginInstance.mobileFeatureConfig?.popupConfig || 'bothModes';
      
      // 如果配置为关闭弹窗，则不执行任何操作
      if (popupConfig === 'disabled') {
        return;
      }
      
      // 获取当前窗口高度
      const currentHeight = window.innerHeight;
      
      // 如果还没有记录设备初始高度，则记录当前高度作为参考
      if (deviceInitialHeight === null) {
        deviceInitialHeight = currentHeight;
      }
      
      // 检查当前是否为小窗模式（高度减少≥80px）
      const heightDifference = deviceInitialHeight - currentHeight;
      const isSmallWindowMode = heightDifference >= 80;
      
      // 根据配置决定是否触发弹窗
      if (popupConfig === 'bothModes') {
        // 小窗和全屏模式都打开弹窗
        showSmallWindowTip();
      } else if (popupConfig === 'smallWindowOnly') {
        // 只在小窗模式下打开弹窗
        if (isSmallWindowMode) {
          showSmallWindowTip();
        }
      }
    } else {
      // 应用切换到后台时，自动关闭一键记事弹窗
      closeNoteDialogImmediately();
    }
  }
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
  
  // 添加可见性变化监听器（用于检测前后台切换）
  visibilityChangeListener = handleVisibilityChange;
  document.addEventListener('visibilitychange', visibilityChangeListener);
}

/**
 * 清除小窗模式检测器
 * 移除所有事件监听器
 */
export function clearSmallWindowDetector(): void {
  // 清除可见性变化监听器
  if (visibilityChangeListener) {
    document.removeEventListener('visibilitychange', visibilityChangeListener);
    visibilityChangeListener = null;
  }
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
      // 最后的降级方案
      showNoteInputDialog(notebookId);
    }
  });
}

// 导出函数供其他模块使用
export { showSmallWindowTip, showSiyuanEditorDialog };