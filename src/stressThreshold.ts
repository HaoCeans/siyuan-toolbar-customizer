/**
 * StressThreshold 功能模块
 * 用于在编辑器工具栏添加按钮，显示数据库任务计划安排
 */

import {
  IProtyle,
  fetchSyncPost,
  openTab,
  showMessage,
  getFrontend
} from "siyuan";

// 导出 openTab 供其他模块使用
export { openTab };

// 配置接口定义
export interface StressThresholdConfig {
  // 数据库相关配置
  blockId: string;
  databaseId: string;
  viewName: string;
  viewId: string;
  
  // 主键列配置
  primaryKeyColumn: string;
  
  // 时间段配置
  startTimeStr: string;
  extraMinutes: number;
  
  // 时间段显示配置
  timeRangeFormat: 'simple' | 'withWeekday' | 'daysAndTime';
  timeRangeColumnName: string;
  
  // 显示配置
  showColumns: string[];
  maxRows: number;
  columnMapping: Record<string, string>;
  allFieldsAlignment: 'left' | 'center' | 'right';
  displayMode: 'table' | 'cards';
  
  // 弹窗位置配置
  popupPosition: {
    position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    offsetX: string;
    offsetY: string;
    customTop: string;
    customLeft: string;
    rememberPosition: boolean;
    draggable: boolean;
  };
  
  // 卡片模式配置
  cardsConfig: {
    showFields: string[];
    fieldLabels: Record<string, string>;
    cardStyle: Record<string, string>;
    fieldStyle: Record<string, string>;
    labelStyle: Record<string, string>;
    valueStyle: Record<string, string>;
    primaryKeyStyle: Record<string, string>;
    timeRangeStyle: Record<string, string>;
    containerStyle: Record<string, string>;
  };
  
  // 弹窗配置
  popupConfig: {
    maxHeightSmall: string;
    maxHeightLarge: string;
    compactPadding: string;
    normalPadding: string;
    minWidth: string;
    maxWidth: string;
    scrollThreshold: number;
  };
  
  // 移动端跳转配置
  mobileTargetBlockId: string;
}
// 默认配置
export const DEFAULT_CONFIG: StressThresholdConfig = {
  blockId: '20251215234003-j3i7wjc',
  databaseId: '20251215234003-4kzcfp3',
  viewName: '今日DO表格',
  viewId: '',
  primaryKeyColumn: 'DO',
  startTimeStr: 'now',
  extraMinutes: 20,
  timeRangeFormat: 'simple',
  timeRangeColumnName: '时间段',
  showColumns: ['DO', '预计分钟', '时间段'],
  maxRows: 5,
  columnMapping: {},
  allFieldsAlignment: 'left',
  displayMode: 'cards',

  popupPosition: {
    position: 'top-right',
    offsetX: '20px',
    offsetY: '20px',
    customTop: '',
    customLeft: '',
    rememberPosition: false,
    draggable: true,
  },

  cardsConfig: {
    showFields: ['DO', '预计分钟', '对自己作用', '时间段'],
    fieldLabels: {
      DO: '任务',
      '预计分钟': '时长',
      '对自己作用': '作用',
      时间段: '时间',
    },
    cardStyle: {
      backgroundColor: '#FAFAFA',
      border: '1.5px solid #D1D1D6',
      borderRadius: '12px',
      padding: '14px 16px',
      marginBottom: '12px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
      position: 'relative',
      transition: 'box-shadow 0.3s ease',
      cursor: 'default',
    },
    fieldStyle: {
      marginBottom: '6px',
      lineHeight: '1.5',
      display: 'flex',
      alignItems: 'center',
    },
    labelStyle: {
      color: '#6E6E73',
      fontSize: '14px',
      marginRight: '12px',
      width: '50px',
      flexShrink: 0,
      fontWeight: '600',
      userSelect: 'none',
    },
    valueStyle: {
      color: '#1C1C1E',
      fontSize: '14px',
      fontWeight: '400',
      flexGrow: 1,
      wordBreak: 'break-word',
    },
    primaryKeyStyle: {
      color: '#5A2D82',
      fontWeight: '700',
      textDecoration: 'underline',
      cursor: 'pointer',
    },
    timeRangeStyle: {
      display: 'inline-block',
      background: 'linear-gradient(135deg, #FF7E00, #FFB84D)',
      color: '#fff',
      padding: '6px 16px',
      fontSize: '15px',
      fontWeight: '700',
      borderRadius: '10px',
      boxShadow: '0 4px 10px rgba(255, 126, 0, 0.3)',
      letterSpacing: '0.6px',
      textAlign: 'center',
      width: '100%',
      boxSizing: 'border-box',
      margin: '6px auto 0',
      border: 'none',
      userSelect: 'none',
    },
    containerStyle: {
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    },
  },

  popupConfig: {
    maxHeightSmall: 'auto',
    maxHeightLarge: '70vh',
    compactPadding: '22px',
    normalPadding: '28px',
    minWidth: '340px',
    maxWidth: '420px',
    scrollThreshold: 5,
  },

  mobileTargetBlockId: '20251109153938-zrdgcag',
};

/**
 * 初始化 StressThreshold 功能
 */
export function initStressThreshold(
  plugin: any,
  config: StressThresholdConfig,
  onConfigChange: (newConfig: StressThresholdConfig) => Promise<void>
) {
  // 监听编辑器加载事件
  plugin.eventBus.on('loaded-protyle-static', (event: CustomEvent) => {
    const protyle = event.detail?.protyle as IProtyle;
    if (!protyle) return;
    
    // 防止重复注入
    if (protyle.element?.querySelector('[data-type="StressThreshold"]')) {
      return;
    }
    
    // 找到工具栏按钮区
    const anchor = protyle.element?.querySelector('.protyle-breadcrumb [data-type="exit-focus"]');
    if (!anchor) return;
    
    // 插入按钮
    anchor.insertAdjacentHTML(
      'afterend',
      `<button data-type="StressThreshold"
        class="block__icon fn__flex-center"
        style="font-size:18px; user-select:none;">✅</button>`
    );
    
    const btn = protyle.element?.querySelector('[data-type="StressThreshold"]') as HTMLElement;
    if (!btn) return;
    
    // 设置按钮点击事件
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      
      // 防抖处理
      if ((btn as any).dataset.loading === 'true') return;
      (btn as any).dataset.loading = 'true';
      
      // 添加加载动画
      const originalText = btn.textContent;
      btn.textContent = '⌛';
      
      try {
        await loadAndShowData(plugin, config);
      } catch (error) {
        console.error('按钮点击处理失败:', error);
        showMessage(`加载数据失败: ${error.message}`, 3000, 'error');
      } finally {
        setTimeout(() => {
          btn.textContent = originalText;
          (btn as any).dataset.loading = 'false';
        }, 500);
      }
    });
    
    // 双击按钮执行其他操作（移动端跳转）
    btn.addEventListener('dblclick', async (e) => {
      e.stopPropagation();

      if (config.mobileTargetBlockId) {
        const frontend = getFrontend();
        if (frontend === 'mobile' || frontend === 'browser-mobile') {
          try {
            console.log('[数据库悬浮弹窗-双击按钮] 移动端 - openTab 函数:', openTab);
            console.log('[数据库悬浮弹窗-双击按钮] 移动端 - openTab.toString():', openTab.toString().substring(0, 200));
            console.log('[数据库悬浮弹窗-双击按钮] 移动端 - 目标ID:', config.mobileTargetBlockId);
            console.log('[数据库悬浮弹窗-双击按钮] 移动端 - plugin.app:', plugin.app);
            await openTab({
              app: plugin.app,
              doc: {
                id: config.mobileTargetBlockId
              }
            });
            console.log('[数据库悬浮弹窗-双击按钮] 移动端 - openTab 调用完成');
          } catch (error) {
            console.warn('移动端跳转失败:', error);
          }
        }
      }
    });
  });
}

/**
 * 判断是否为移动端
 */
function isMobileDevice(): boolean {
  const frontend = getFrontend();
  return frontend === 'mobile' || frontend === 'browser-mobile';
}

/**
 * 获取弹窗位置样式
 */
function getPopupPositionStyle(config: StressThresholdConfig) {
  const isMobile = isMobileDevice();
  const positionConfig = config.popupPosition || {};
  
  // 移动端固定居中
  if (isMobile) {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)'
    };
  }
  
  // 电脑端：如果有自定义坐标，使用自定义坐标
  if (positionConfig.customTop && positionConfig.customLeft) {
    return {
      top: positionConfig.customTop,
      left: positionConfig.customLeft,
      transform: 'none',
      margin: '0'
    };
  }
  
  // 电脑端：根据配置的位置设置样式
  const position = positionConfig.position || 'center';
  const offsetX = positionConfig.offsetX || '120px';
  const offsetY = positionConfig.offsetY || '120px';
  
  switch (position) {
    case 'center':
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      };
    case 'top-left':
      return {
        top: offsetY,
        left: offsetX,
        transform: 'none',
        margin: '0'
      };
    case 'top-right':
      return {
        top: offsetY,
        right: offsetX,
        left: 'auto',
        transform: 'none',
        margin: '0'
      };
    case 'bottom-left':
      return {
        bottom: offsetY,
        left: offsetX,
        top: 'auto',
        transform: 'none',
        margin: '0'
      };
    case 'bottom-right':
      return {
        bottom: offsetY,
        right: offsetX,
        top: 'auto',
        left: 'auto',
        transform: 'none',
        margin: '0'
      };
    default:
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      };
  }
}

/**
 * 解析时间字符串为分钟数
 */
function parseTimeToMinutes(timeStr: string): number {
  if (timeStr === 'now' || !timeStr) {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }
  
  let time = timeStr.trim();
  time = time.replace(/[ap]\.?m\.?/gi, '').trim();
  
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return hours * 60 + minutes;
    }
  }
  
  console.warn(`无效的时间格式: ${timeStr}，使用当前时间`);
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * 将分钟数转换为 HH:MM 格式
 */
function minutesToHHMM(minutes: number): string {
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * 获取星期几（中文）
 */
function getWeekday(date: Date): string {
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return weekdays[date.getDay()];
}

/**
 * 根据配置格式化时间段
 */
function formatTimeRangeByConfig(
  startMinutes: number,
  endMinutes: number,
  startDate: Date,
  formatType: string
): string {
  const startDateCopy = new Date(startDate);
  startDateCopy.setHours(0, 0, 0, 0);
  const startTime = new Date(startDateCopy.getTime() + startMinutes * 60000);
  const endTime = new Date(startDateCopy.getTime() + endMinutes * 60000);
  
  const startHour = startTime.getHours().toString().padStart(2, '0');
  const startMinute = startTime.getMinutes().toString().padStart(2, '0');
  const startTimeStr = `${startHour}:${startMinute}`;
  
  const endHour = endTime.getHours().toString().padStart(2, '0');
  const endMinute = endTime.getMinutes().toString().padStart(2, '0');
  const endTimeStr = `${endHour}:${endMinute}`;
  
  const startDay = Math.floor(startTime.getTime() / 86400000);
  const endDay = Math.floor(endTime.getTime() / 86400000);
  const daysDiff = endDay - startDay;
  
  switch (formatType) {
    case 'simple':
      return `⏳${startTimeStr} - ${endTimeStr}`;
    case 'withWeekday':
      if (daysDiff === 0) {
        return `⏳${startTimeStr} - ${endTimeStr}`;
      } else {
        const endWeekday = getWeekday(endTime);
        return `⏳${startTimeStr} - ${endTimeStr}（${endWeekday}）`;
      }
    case 'daysAndTime':
      if (daysDiff === 0) {
        return `⏳${startTimeStr} - ${endTimeStr}`;
      } else {
        return `⏳${daysDiff}天 ${startTimeStr} - ${endTimeStr}`;
      }
    default:
      if (daysDiff === 0) {
        return `⏳${startTimeStr} - ${endTimeStr}`;
      } else {
        const endWeekday = getWeekday(endTime);
        return `⏳${startTimeStr} - ${endTimeStr}（${endWeekday}）`;
      }
  }
}

/**
 * 解析单元格值
 */
function parseCellValue(cell: any): { content: string; blockId: string } {
  if (!cell || !cell.value) {
    return { content: '', blockId: '' };
  }
  
  const value = cell.value;
  const type = value.type;
  
  switch (type) {
    case 'text':
      return {
        content: value.text?.content || '',
        blockId: ''
      };
    case 'block':
      return {
        content: value.block?.content || '',
        blockId: value.block?.id || ''
      };
    case 'select':
    case 'mSelect':
      if (value.mSelect && Array.isArray(value.mSelect) && value.mSelect.length > 0) {
        return {
          content: value.mSelect[0].content || '',
          blockId: ''
        };
      }
      return { content: '', blockId: '' };
    case 'number':
      return {
        content: value.number?.content?.toString() || '',
        blockId: ''
      };
    case 'date':
      if (value.date?.content) {
        const date = new Date(value.date.content);
        return {
          content: date.toLocaleDateString(),
          blockId: ''
        };
      }
      return { content: '', blockId: '' };
    case 'checkbox':
      return {
        content: value.checkbox?.checked ? '✓' : '✗',
        blockId: ''
      };
    default:
      return { content: '', blockId: '' };
  }
}

/**
 * 从 blockId 获取 avId
 */
async function getAvIdFromBlockId(blockId: string): Promise<string | null> {
  try {
    const response = await fetchSyncPost('/api/query/sql', {
      stmt: `SELECT content FROM blocks WHERE id='${blockId}'`
    });
    
    if (response.code === 0 && response.data && response.data.length > 0) {
      const content = response.data[0].content;
      const match = content.match(/data-av-id="([^"]+)"/);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  } catch (error) {
    console.error('获取 avId 失败:', error);
    return null;
  }
}

/**
 * 获取属性视图信息
 */
async function getAttributeViewInfo(avId: string): Promise<any> {
  try {
    const response = await fetchSyncPost('/api/av/getAttributeView', {
      avID: avId
    });
    if (response.code === 0 && response.data) {
      return response.data.av || null;
    }
    return null;
  } catch (error) {
    console.error('获取属性视图信息失败:', error);
    return null;
  }
}

/**
 * 根据视图名称查找视图ID
 */
async function findViewIdByName(avId: string, viewName: string): Promise<string | null> {
  try {
    const attributeView = await getAttributeViewInfo(avId);
    if (!attributeView || !attributeView.views) {
      return null;
    }
    
    const matchingView = attributeView.views.find((view: any) => view.name === viewName);
    if (matchingView) {
      return matchingView.id;
    }
    
    const fuzzyMatch = attributeView.views.find((view: any) => 
      view.name.includes(viewName) || viewName.includes(view.name)
    );
    if (fuzzyMatch) {
      console.log(`使用模糊匹配的视图: ${fuzzyMatch.name}`);
      return fuzzyMatch.id;
    }
    
    if (attributeView.views.length > 0) {
      console.log(`未找到视图"${viewName}"，使用第一个视图: ${attributeView.views[0].name}`);
      return attributeView.views[0].id;
    }
    
    return null;
  } catch (error) {
    console.error('查找视图ID失败:', error);
    return null;
  }
}

/**
 * 获取属性视图的键（列）信息
 */
async function getAttributeViewKeys(avId: string): Promise<any[]> {
  try {
    const response = await fetchSyncPost('/api/av/getAttributeViewKeys', {
      avID: avId
    });
    if (response.code === 0 && response.data) {
      return response.data || [];
    }
    return [];
  } catch (error) {
    console.error('获取键信息失败:', error);
    return [];
  }
}

/**
 * 获取数据库数据
 */
async function getDatabaseData(avId: string, viewId: string, query: string = ''): Promise<any> {
  try {
    const response = await fetchSyncPost('/api/av/renderAttributeView', {
      avID: avId,
      viewID: viewId || '',
      page: 1,
      pageSize: 9999,
      query: query || ''
    });
    
    if (response.code === 0 && response.data) {
      return response.data;
    }
    
    return { rows: [] };
  } catch (error) {
    console.error('获取数据库数据失败:', error);
    throw error;
  }
}

/**
 * 处理数据并计算时间段
 */
async function processData(data: any, keys: any[], config: StressThresholdConfig) {
  const keyMap: Record<string, { name: string; type: string }> = {};
  keys.forEach(key => {
    keyMap[key.id] = {
      name: key.name,
      type: key.type
    };
  });
  
  let rows: any[] = [];
  
  if (data.rows && Array.isArray(data.rows)) {
    rows = data.rows;
  } else if (data.view?.rows && Array.isArray(data.view.rows)) {
    rows = data.view.rows;
  } else if (data.view?.table?.rows && Array.isArray(data.view.table.rows)) {
    rows = data.view.table.rows;
  }
  
  if (rows.length === 0) {
    return { rows: [] };
  }
  
  const processedRows: any[] = [];
  
  rows.forEach((row, rowIndex) => {
    const rowData: any = {
      id: row.id,
      blockId: '',
      values: {}
    };
    
    if (row.cells && Array.isArray(row.cells)) {
      row.cells.forEach((cell: any) => {
        if (!cell || !cell.value) return;
        
        const keyID = cell.value.keyID;
        if (!keyID) return;
        
        const columnInfo = keyMap[keyID];
        if (!columnInfo) return;
        
        const originalColumnName = columnInfo.name;
        const displayColumnName = config.columnMapping[originalColumnName] || originalColumnName;
        const parsedValue = parseCellValue(cell);
        
        rowData.values[displayColumnName] = parsedValue.content;
        
        if (displayColumnName === config.primaryKeyColumn && parsedValue.blockId) {
          rowData.blockId = parsedValue.blockId;
        }
      });
    }
    
    processedRows.push(rowData);
  });
  
  // 计算时间段
  const today = new Date();
  let currentTime = parseTimeToMinutes(config.startTimeStr);
  
  const resultRows = processedRows.slice(0, config.maxRows).map((rowData, index) => {
    const newRow = { ...rowData.values };
    
    if (index > 0) {
      currentTime += config.extraMinutes;
    }
    
    const durationKeys = ['预计分钟', '分钟', '时长', '所需时间', '时间'];
    let duration = 0;
    
    for (const key of durationKeys) {
      if (newRow[key] !== undefined) {
        const durationStr = String(newRow[key]);
        const match = durationStr.match(/\d+/);
        duration = match ? parseInt(match[0], 10) : 0;
        break;
      }
    }
    
    const startTime = currentTime;
    const endTime = startTime + duration;
    
    newRow[config.timeRangeColumnName] = formatTimeRangeByConfig(
      startTime,
      endTime,
      today,
      config.timeRangeFormat
    );
    
    currentTime = endTime;
    
    return {
      id: rowData.id,
      blockId: rowData.blockId,
      values: newRow
    };
  });
  
  return { rows: resultRows };
}

/**
 * 显示卡片模式弹窗
 */
function showCardsPopup(processedData: any, config: StressThresholdConfig, plugin: any) {
  console.log('[数据库悬浮弹窗] showCardsPopup 被调用');
  console.log('[数据库悬浮弹窗] mobileTargetBlockId:', config.mobileTargetBlockId);
  console.log('[数据库悬浮弹窗] isMobileDevice():', isMobileDevice());

  const isMobile = isMobileDevice();
  const rowCount = processedData.rows.length;
  const needsScroll = rowCount > config.popupConfig.scrollThreshold;
  const maxHeight = needsScroll ? config.popupConfig.maxHeightLarge : config.popupConfig.maxHeightSmall;
  const padding = needsScroll ? config.popupConfig.normalPadding : config.popupConfig.compactPadding;
  const positionStyle = getPopupPositionStyle(config);
  
  const popup = document.createElement('div');
  popup.style.cssText = `
    position: fixed;
    top: ${positionStyle.top || '50%'};
    left: ${positionStyle.left || '50%'};
    right: ${positionStyle.right || 'auto'};
    bottom: ${positionStyle.bottom || 'auto'};
    transform: ${positionStyle.transform || 'translate(-50%, -50%)'};
    margin: ${positionStyle.margin || '0'};
    background: white;
    z-index: 999999;
    border-radius: ${isMobile ? '10px' : '12px'};
    padding: ${padding};
    max-height: ${maxHeight};
    overflow-y: ${needsScroll ? 'auto' : 'visible'};
    width: ${isMobile ? '90vw' : 'auto'};
    min-width: ${config.popupConfig.minWidth};
    max-width: ${config.popupConfig.maxWidth};
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    border: 1px solid #e0e0e0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    -webkit-overflow-scrolling: touch;
    will-change: transform;
    cursor: default;
  `;
  
  popup.ondblclick = () => popup.remove();
  
  const title = document.createElement('div');
  title.textContent = '任务计划安排';
  title.style.cssText = `
    font-size: 16px;
    font-weight: 600;
    color: #1D1D1F;
    margin-bottom: ${rowCount > 0 ? '16px' : '0'};
    text-align: center;
    padding-bottom: 12px;
    border-bottom: 1px solid #F0F0F0;
    user-select: none;
  `;
  popup.appendChild(title);
  
  if (processedData.rows.length === 0) {
    const emptyMessage = document.createElement('div');
    emptyMessage.textContent = '没有数据';
    emptyMessage.style.cssText = `
      padding: 30px;
      text-align: center;
      color: #8E8E93;
      font-size: 14px;
      user-select: none;
    `;
    popup.appendChild(emptyMessage);
  } else {
    const fragment = document.createDocumentFragment();
    const cardsContainer = document.createElement('div');
    Object.assign(cardsContainer.style, config.cardsConfig.containerStyle);
    
    processedData.rows.forEach((rowData: any) => {
      const row = rowData.values;
      const blockId = rowData.blockId;
      
      const card = document.createElement('div');
      Object.assign(card.style, config.cardsConfig.cardStyle);
      
      config.cardsConfig.showFields.forEach((fieldName) => {
        if (row[fieldName] !== undefined) {
          const fieldContainer = document.createElement('div');
          
          if (fieldName === config.timeRangeColumnName) {
            Object.assign(fieldContainer.style, {
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              marginTop: '4px',
              marginBottom: '0',
              width: '100%'
            });
            
            const value = document.createElement('div');
            value.textContent = row[fieldName];
            Object.assign(value.style, config.cardsConfig.timeRangeStyle);
            value.style.display = 'block';
            value.style.textAlign = 'center';
            
            fieldContainer.appendChild(value);
            card.appendChild(fieldContainer);
          } else {
            Object.assign(fieldContainer.style, config.cardsConfig.fieldStyle);
            
            const label = document.createElement('span');
            const labelText = config.cardsConfig.fieldLabels && config.cardsConfig.fieldLabels[fieldName] 
              ? config.cardsConfig.fieldLabels[fieldName] 
              : fieldName;
            label.textContent = labelText;
            Object.assign(label.style, config.cardsConfig.labelStyle);
            fieldContainer.appendChild(label);
            
            const value = document.createElement('span');
            const valueText = row[fieldName];
            
            if (fieldName === config.primaryKeyColumn) {
              const maxLength = isMobile ? 35 : 45;
              const displayText = valueText.length > maxLength ?
                valueText.substring(0, maxLength) + '...' : valueText;
              value.textContent = displayText;
              value.title = valueText;

              console.log('[数据库悬浮弹窗] 创建主键列可点击元素，文本:', displayText);

              value.addEventListener('click', async (e) => {
                e.stopPropagation();

                if (isMobileDevice()) {
                  // 移动端：跳转到固定页面
                  if (config.mobileTargetBlockId) {
                    try {
                      // 先显示一个明确的消息，确认新代码在运行
                      showMessage('[新代码] 数据库弹窗准备跳转到: ' + config.mobileTargetBlockId, 3000, 'info');
                      console.log('[数据库悬浮弹窗] 移动端 - openTab 函数:', openTab);
                      console.log('[数据库悬浮弹窗] 移动端 - openTab.toString():', openTab.toString().substring(0, 200));
                      console.log('[数据库悬浮弹窗] 移动端 - 目标ID:', config.mobileTargetBlockId);
                      await openTab({
                        doc: {
                          id: config.mobileTargetBlockId
                        }
                      });
                      console.log('[数据库悬浮弹窗] 移动端 - openTab 调用完成');
                    } catch (error) {
                      console.warn('移动端跳转失败:', error);
                    }
                  } else {
                    // 如果没有配置 mobileTargetBlockId，尝试跳转到数据库块
                    if (blockId) {
                      try {
                        await openTab({
                          doc: {
                            id: blockId
                          }
                        });
                      } catch (error) {
                        console.warn('移动端跳转到数据库块失败:', error);
                      }
                    } else {
                      showMessage('请配置 mobileTargetBlockId', 2000, 'warning');
                    }
                  }
                } else {
                  // 桌面端：跳转到数据库块
                  if (blockId) {
                    try {
                      await openTab({
                        doc: {
                          id: blockId
                        }
                      });
                    } catch (error) {
                      console.warn('跳转失败:', error);
                    }
                  }
                }
                
                setTimeout(() => {
                  popup.remove();
                }, 300);
              });
            } else {
              value.textContent = valueText;
            }
            
            Object.assign(value.style, config.cardsConfig.valueStyle);
            
            if (fieldName === config.primaryKeyColumn && config.cardsConfig.primaryKeyStyle) {
              Object.assign(value.style, config.cardsConfig.primaryKeyStyle);
            }
            
            const alignment = config.allFieldsAlignment || 'center';
            if (alignment === 'center') {
              value.style.textAlign = 'center';
              value.style.margin = '0 auto';
              value.style.display = 'block';
              value.style.width = '100%';
            } else if (alignment === 'right') {
              value.style.textAlign = 'right';
              value.style.marginLeft = 'auto';
            }
            
            fieldContainer.appendChild(value);
            card.appendChild(fieldContainer);
          }
        }
      });
      
      cardsContainer.appendChild(card);
    });
    
    fragment.appendChild(cardsContainer);
    popup.appendChild(fragment);
  }
  
  const note = document.createElement('div');
  if (isMobileDevice()) {
    note.textContent = '双击任意位置关闭 | 点击主键列跳转（需配置 mobileTargetBlockId）';
  } else {
    note.textContent = '双击任意位置关闭 | 点击紫色任务可跳转到对应块';
  }
  note.style.cssText = `
    margin-top: ${rowCount > 0 ? '14px' : '20px'};
    font-size: 11px;
    color: #8E8E93;
    text-align: center;
    font-style: italic;
    opacity: 0.8;
    user-select: none;
  `;
  popup.appendChild(note);
  
  document.body.appendChild(popup);
}

/**
 * 主函数：加载并显示数据
 */
async function loadAndShowData(plugin: any, config: StressThresholdConfig) {
  try {
    let avId = config.databaseId;
    
    if (!avId && config.blockId) {
      avId = await getAvIdFromBlockId(config.blockId);
      if (!avId) {
        throw new Error(`无法从blockId ${config.blockId} 获取数据库ID`);
      }
    }
    
    if (!avId) {
      throw new Error('请配置 databaseId 或 blockId');
    }
    
    let viewId = config.viewId;
    
    if (!viewId && config.viewName) {
      viewId = await findViewIdByName(avId, config.viewName);
      if (!viewId) {
        console.warn(`未找到视图"${config.viewName}"，将使用默认视图`);
      }
    }
    
    const keys = await getAttributeViewKeys(avId);
    const data = await getDatabaseData(avId, viewId, '');
    const processedData = await processData(data, keys, config);
    
    if (processedData.rows.length === 0) {
      showMessage('数据库中没有数据或数据格式无法识别', 3000, 'error');
      return;
    }
    
    if (config.displayMode === 'cards') {
      showCardsPopup(processedData, config, plugin);
    } else {
      // 表格模式可以在这里实现
      showCardsPopup(processedData, config, plugin);
    }
    
  } catch (error: any) {
    console.error('加载数据失败:', error);
    showMessage(`加载数据失败: ${error.message}`, 3000, 'error');
  }
}

