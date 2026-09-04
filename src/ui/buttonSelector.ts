import { t } from '../i18n/runtime'
/**
 * 按钮选择器
 * 用于选择思源内置按钮ID
 */

import { updateIconDisplay } from '../data/icons'

export interface ButtonInfo {
  id: string
  /** Localized for the current locale when the selector invokes onSelect. */
  name: string
  /** Stable translation key for callers that can persist translated defaults safely. */
  nameKey: string
  /** Stable canonical name; unlike name, this must not change with the locale. */
  fallbackName: string
  icon: string
}

type BuiltinButtonDefinition = Omit<ButtonInfo, 'name'>

export interface ButtonSelectorOptions {
  currentValue?: string
  onSelect: (result: ButtonInfo) => void
}

// Keep module-level data locale-independent. Translation runtime may not be ready yet
// when this module is imported.
const BUILTIN_BUTTONS: BuiltinButtonDefinition[] = [
  // ===== 顶部工具栏 =====
  { id: 'toolbarMore', nameKey: 'ui.buttonSelector.item.1', fallbackName: '右上角：设置（☰ 菜单）', icon: 'iconSettings' },
  { id: 'toolbarFile', nameKey: 'ui.buttonSelector.item.2', fallbackName: '左上角：文档树', icon: 'iconFolder' },

  // ===== 菜单内 - 常用功能（无需展开子菜单）=====
  { id: 'menuRecent', nameKey: 'ui.buttonSelector.item.3', fallbackName: '最近的文档', icon: 'iconList' },
  { id: 'menuSearch', nameKey: 'ui.buttonSelector.item.4', fallbackName: '搜索', icon: 'iconSearch' },
  { id: 'menuCommand', nameKey: 'ui.buttonSelector.item.5', fallbackName: '命令面板', icon: 'iconTerminal' },
  { id: 'menuSyncNow', nameKey: 'ui.buttonSelector.item.6', fallbackName: '立即同步', icon: 'iconCloudSucc' },
  { id: 'menuNewDoc', nameKey: 'ui.buttonSelector.item.7', fallbackName: '新建文档', icon: 'iconFile' },
  { id: 'menuNewNotebook', nameKey: 'ui.buttonSelector.item.8', fallbackName: '新建笔记本', icon: 'iconFilesRoot' },
  { id: 'menuNewDaily', nameKey: 'ui.buttonSelector.item.9', fallbackName: '日记', icon: 'iconCalendar' },
  { id: 'menuCard', nameKey: 'ui.buttonSelector.item.10', fallbackName: '间隔重复', icon: 'iconRiffCard' },
  { id: 'menuLock', nameKey: 'ui.buttonSelector.item.11', fallbackName: '锁屏', icon: 'iconLock' },
  { id: 'menuHistory', nameKey: 'ui.buttonSelector.item.12', fallbackName: '数据历史', icon: 'iconHistory' },

  // ===== 菜单内 - 设置项（v3.7+ 已改名 menuConfig*）=====
  { id: 'menuConfigEditor', nameKey: 'ui.buttonSelector.item.13', fallbackName: '编辑器', icon: 'iconEdit' },
  { id: 'menuConfigFile', nameKey: 'ui.buttonSelector.item.14', fallbackName: '文档', icon: 'iconFiles' },
  { id: 'menuConfigAppearance', nameKey: 'ui.buttonSelector.item.15', fallbackName: '外观', icon: 'iconTheme' },
  { id: 'menuConfigFlashcard', nameKey: 'ui.buttonSelector.item.16', fallbackName: '闪卡', icon: 'iconRiffCard' },
  { id: 'menuConfigAi', nameKey: 'ui.buttonSelector.item.17', fallbackName: '人工智能', icon: 'iconSparkles' },
  { id: 'menuConfigSecretsVariables', nameKey: 'ui.buttonSelector.item.18', fallbackName: '密钥和变量', icon: 'iconSquareAsterisk' },
  { id: 'menuConfigAssets', nameKey: 'ui.buttonSelector.item.19', fallbackName: '资源', icon: 'iconImage' },
  { id: 'menuConfigExport', nameKey: 'ui.buttonSelector.item.20', fallbackName: '导出', icon: 'iconUpload' },
  { id: 'menuConfigSearch', nameKey: 'ui.buttonSelector.item.21', fallbackName: '搜索（设置）', icon: 'iconSearch' },
  { id: 'menuConfigSync', nameKey: 'ui.buttonSelector.item.22', fallbackName: '账号与同步', icon: 'iconCloud' },
  { id: 'menuConfigAccess', nameKey: 'ui.buttonSelector.item.23', fallbackName: '鉴权', icon: 'iconLock' },
  { id: 'menuConfigApp', nameKey: 'ui.buttonSelector.item.24', fallbackName: '应用', icon: 'iconLayoutGrid' },
  { id: 'menuConfigAbout', nameKey: 'ui.buttonSelector.item.25', fallbackName: '关于', icon: 'iconInfo' },

  // ===== 菜单内 - 其他 =====
  { id: 'menuPlugin', nameKey: 'ui.buttonSelector.item.26', fallbackName: '插件', icon: 'iconPlugin' },
  { id: 'menuHelp', nameKey: 'ui.buttonSelector.item.27', fallbackName: '用户指南', icon: 'iconHelp' },
]

function localizeButton(button: BuiltinButtonDefinition): ButtonInfo {
  return {
    ...button,
    name: t(button.nameKey, undefined, button.fallbackName),
  }
}

/**
 * 旧 ID → 新 ID 别名映射表
 * 思源 v3.7 重构了手机端菜单，部分按钮改名。旧配置自动映射，无需用户手动改。
 */
export const BUILTIN_ID_ALIASES: Record<string, string> = {
  // 旧 ID                // 新 ID（v3.7+）
  'menuAccount':          'menuConfigSync',      // 个人信息 已合并到"账号与同步"
  'menuEditor':           'menuConfigEditor',
  'menuFileTree':         'menuConfigFile',      // 注意：旧版叫"文档树"，新版"文档"
  'menuAppearance':       'menuConfigAppearance',
  'menuRiffCard':         'menuConfigFlashcard',
  'menuAI':               'menuConfigAi',
  'menuAssets':           'menuConfigAssets',
  'menuPublish':          'menuConfigExport',
  'menuSync':             'menuConfigSync',
  'menuAbout':            'menuConfigAbout',
}

/**
 * 解析 builtinId：应用别名映射，返回实际要查找的 ID。
 * 旧配置的 menuAccount 等会自动转成新的 menuConfigSync。
 */
export function resolveBuiltinId(rawId: string): string {
  if (!rawId) return rawId
  return BUILTIN_ID_ALIASES[rawId] || rawId
}

/**
 * 显示按钮选择器弹窗
 */
export function showButtonSelector(options: ButtonSelectorOptions): void {
  const { currentValue = '', onSelect } = options

  const overlay = document.createElement('div')
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    padding: 20px;
  `

  const dialog = document.createElement('div')
  dialog.style.cssText = `
    background: var(--b3-theme-background);
    border-radius: 8px;
    max-width: 400px;
    width: 100%;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  `

  // 标题栏
  const header = document.createElement('div')
  header.style.cssText = `
    padding: 16px 20px;
    border-bottom: 1px solid var(--b3-border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
  `
  header.innerHTML = `<div style="font-size: 16px; font-weight: 500;">${t('ui.buttonSelector.title', undefined, '选择按钮')}</div>`

  const closeBtn = document.createElement('button')
  closeBtn.className = 'b3-button b3-button--text'
  closeBtn.textContent = '✕'
  closeBtn.style.cssText = `padding: 4px 8px; font-size: 18px;`
  closeBtn.onclick = () => document.body.removeChild(overlay)
  header.appendChild(closeBtn)

  // 搜索框
  const searchWrapper = document.createElement('div')
  searchWrapper.style.cssText = `padding: 12px 20px; border-bottom: 1px solid var(--b3-border-color);`
  const searchInput = document.createElement('input')
  searchInput.type = 'text'
  searchInput.placeholder = t('buttonSelector.search', undefined, '搜索按钮...')
  searchInput.className = 'b3-text-field'
  searchInput.style.cssText = `width: 100%; padding: 8px 12px;`
  searchWrapper.appendChild(searchInput)

  // 内容区域
  const content = document.createElement('div')
  content.style.cssText = `
    padding: 16px;
    overflow-y: auto;
    flex: 1;
  `

  // 按钮列表容器
  const buttonList = document.createElement('div')
  buttonList.style.cssText = `display: flex; flex-direction: column; gap: 8px;`

  // 渲染按钮列表
  const renderButtons = (filter: string = '') => {
    buttonList.innerHTML = ''

    // 过滤并渲染按钮
    const localizedButtons = BUILTIN_BUTTONS.map(localizeButton)
    const normalizedFilter = filter.toLowerCase()
    const filteredButtons = localizedButtons.filter(
      b => b.name.toLowerCase().includes(normalizedFilter) ||
           b.fallbackName.toLowerCase().includes(normalizedFilter) ||
           b.id.toLowerCase().includes(normalizedFilter)
    )

    if (filteredButtons.length === 0) {
      const noResult = document.createElement('div')
      noResult.style.cssText = `
        text-align: center;
        padding: 20px;
        color: var(--b3-theme-on-surface-light);
        font-size: 13px;
      `
      noResult.textContent = t('buttonSelector.empty', undefined, '未找到匹配的按钮')
      buttonList.appendChild(noResult)
      return
    }

    // 渲染按钮项
    filteredButtons.forEach(btn => {
      const btnItem = document.createElement('div')
      const isSelected = btn.id === currentValue
      btnItem.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        border-radius: 6px;
        cursor: pointer;
        background: ${isSelected ? 'var(--b3-theme-primary-lightest)' : 'var(--b3-theme-surface)'};
        border: 1px solid ${isSelected ? 'var(--b3-theme-primary)' : 'var(--b3-border-color)'};
        transition: all 0.2s;
      `

      // 图标
      const iconSpan = document.createElement('span')
      iconSpan.style.cssText = `
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      `
      updateIconDisplay(iconSpan, btn.icon)

      // 名称
      const nameSpan = document.createElement('span')
      nameSpan.style.cssText = `
        font-size: 14px;
        color: var(--b3-theme-on-surface);
        flex: 1;
      `
      nameSpan.textContent = btn.name

      // ID
      const idSpan = document.createElement('code')
      idSpan.style.cssText = `
        font-size: 11px;
        background: var(--b3-theme-background);
        padding: 3px 8px;
        border-radius: 3px;
        color: var(--b3-theme-primary);
        flex-shrink: 0;
      `
      idSpan.textContent = btn.id

      btnItem.appendChild(iconSpan)
      btnItem.appendChild(nameSpan)
      btnItem.appendChild(idSpan)

      btnItem.onclick = () => {
        onSelect(btn)
        document.body.removeChild(overlay)
      }

      // 触摸反馈
      btnItem.ontouchstart = () => {
        btnItem.style.background = 'var(--b3-theme-primary)'
      }
      btnItem.ontouchend = () => {
        btnItem.style.background = isSelected ? 'var(--b3-theme-primary-lightest)' : 'var(--b3-theme-surface)'
      }

      buttonList.appendChild(btnItem)
    })
  }

  // 初始渲染
  renderButtons()

  // 搜索事件
  searchInput.oninput = () => {
    renderButtons(searchInput.value)
  }

  content.appendChild(buttonList)

  // 组装
  dialog.appendChild(header)
  dialog.appendChild(searchWrapper)
  dialog.appendChild(content)
  overlay.appendChild(dialog)
  document.body.appendChild(overlay)

  // 点击遮罩关闭
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay)
    }
  }

  // 聚焦搜索框
  setTimeout(() => searchInput.focus(), 100)
}
