/**
 * 斜杠菜单工具栏 —— 按钮 / 面板 / 条目定义（独立文件）
 *
 * 这里是唯一真相：运行时与设置预览都读本文件的定义。
 * 用户配置只保存「一级按钮顺序」，条目本身不做开关，面板分组也固定。
 *
 * 条目动作分两类：
 * - kind: 'fill'     直接用官方斜杠值调用 protyle.hint.fill（值与思源斜杠菜单逐字一致）
 * - kind: 'special'  走专用通道：模板面板、资源上传、表情面板、行级公式、块引用提示等
 */

/** 与思源 Constants.ZWSP 一致的零宽空格，斜杠命令用它做参数分隔 */
export const SLASH_ZWSP = '\u200B'

/** 斜杠值里的光标占位符，调用 hint.fill 前替换 */
export const SLASH_CARET = '{C}'

/** 条目需要的环境能力 */
export type TSlashRequirement = 'android' | 'ai' | 'widgets' | 'localKernel'

/** 走专用通道的动作 */
export type TSlashSpecial =
  | 'template'
  | 'widget'
  | 'assets'
  | 'ai'
  | 'newSubDocRef'
  | 'blockRef'
  | 'blockEmbed'
  | 'emoji'
  | 'pickImage'
  | 'pickPhoto'
  | 'pickFile'
  | 'inlineMath'

export interface ISlashEntry {
  id: string
  /** 取思源界面语言包的键；取不到时用 fallback */
  syKey?: string
  fallback: string
  icon: string
  kind: 'fill' | 'special'
  /** kind === 'fill' 时传给 hint.fill 的值；{C} 会替换为 Lute.Caret */
  value?: string
  /** (( 与 {{ 需要把 hint 切到对应模式，调用后不能还原 splitChar */
  keepHintSplit?: boolean
  /** kind === 'special' 时走哪条专用通道 */
  special?: TSlashSpecial
  requires?: TSlashRequirement[]
}

export interface ISlashPanel {
  id: string
  entryIds: string[]
}

export interface ISlashButton {
  id: string
  fallback: string
  icon: string
  /** 点开二级面板 */
  panelId?: string
  /** 直接执行单个条目 */
  entryId?: string
  /** 长按直接执行的条目（不展开面板） */
  longPressEntryId?: string
}

/** 内置样式（对齐官方 style${ZWSP}color:var(--b3-card-*-color);background-color:var(--b3-card-*-background); ） */
export const builtinStyleSlashValue = (id: 'info' | 'success' | 'warning' | 'error') =>
  `style${SLASH_ZWSP}color: var(--b3-card-${id}-color);background-color: var(--b3-card-${id}-background);`

export const SLASH_ENTRIES: ISlashEntry[] = [
  // ===== 标题 =====
  {
    id: 'h1',
    syKey: 'heading1',
    fallback: '一级标题',
    icon: 'iconH1',
    kind: 'fill',
    value: `# ${SLASH_CARET}`,
  },
  {
    id: 'h2',
    syKey: 'heading2',
    fallback: '二级标题',
    icon: 'iconH2',
    kind: 'fill',
    value: `## ${SLASH_CARET}`,
  },
  {
    id: 'h3',
    syKey: 'heading3',
    fallback: '三级标题',
    icon: 'iconH3',
    kind: 'fill',
    value: `### ${SLASH_CARET}`,
  },
  {
    id: 'h4',
    syKey: 'heading4',
    fallback: '四级标题',
    icon: 'iconH4',
    kind: 'fill',
    value: `#### ${SLASH_CARET}`,
  },
  {
    id: 'h5',
    syKey: 'heading5',
    fallback: '五级标题',
    icon: 'iconH5',
    kind: 'fill',
    value: `##### ${SLASH_CARET}`,
  },
  {
    id: 'h6',
    syKey: 'heading6',
    fallback: '六级标题',
    icon: 'iconH6',
    kind: 'fill',
    value: `###### ${SLASH_CARET}`,
  },

  // ===== 列表 =====
  {
    id: 'list',
    syKey: 'list',
    fallback: '无序列表',
    icon: 'iconList',
    kind: 'fill',
    value: `- ${SLASH_CARET}`,
  },
  {
    id: 'orderedList',
    syKey: 'ordered-list',
    fallback: '有序列表',
    icon: 'iconOrderedList',
    kind: 'fill',
    value: `1. ${SLASH_CARET}`,
  },
  {
    id: 'task',
    syKey: 'check',
    fallback: '任务列表',
    icon: 'iconCheck',
    kind: 'fill',
    value: `- [ ] ${SLASH_CARET}`,
  },
  {
    id: 'mindmap',
    syKey: 'mindmap',
    fallback: '思维导图',
    icon: 'iconMindmap',
    kind: 'fill',
    value: `- ${SLASH_CARET}\n{: custom-sy-list-mindmap="1"}`,
  },

  // ===== 引用 =====
  {
    id: 'blockRef',
    syKey: 'ref',
    fallback: '引用',
    icon: 'iconRef',
    kind: 'special',
    special: 'blockRef',
  },
  {
    id: 'blockEmbed',
    syKey: 'blockEmbed',
    fallback: '嵌入块',
    icon: 'iconSQL',
    kind: 'special',
    special: 'blockEmbed',
  },
  {
    id: 'assets',
    syKey: 'assets',
    fallback: '资源',
    icon: 'iconImage',
    kind: 'special',
    special: 'assets',
  },
  {
    id: 'widget',
    syKey: 'widget',
    fallback: '小组件',
    icon: 'iconBoth',
    kind: 'special',
    special: 'widget',
    requires: ['widgets'],
  },
  {
    id: 'newSubDocRef',
    syKey: 'newSubDocRef',
    fallback: '新建子文档引用',
    icon: 'iconFile',
    kind: 'special',
    special: 'newSubDocRef',
  },

  // ===== 插图 =====
  {
    id: 'pickImage',
    syKey: 'insertImage',
    fallback: '插入图片',
    icon: 'iconImage',
    kind: 'special',
    special: 'pickImage',
  },
  {
    id: 'pickPhoto',
    syKey: 'insertPhoto',
    fallback: '拍照',
    icon: 'iconCamera',
    kind: 'special',
    special: 'pickPhoto',
    requires: ['android'],
  },
  {
    id: 'pickFile',
    syKey: 'insertAsset',
    fallback: '插入资源',
    icon: 'iconDownload',
    kind: 'special',
    special: 'pickFile',
  },
  {
    id: 'imgUrl',
    syKey: 'insertImgURL',
    fallback: '插入图片网址',
    icon: 'iconImage',
    kind: 'fill',
    value: '![]()',
  },
  {
    id: 'videoUrl',
    syKey: 'insertVideoURL',
    fallback: '插入视频网址',
    icon: 'iconVideo',
    kind: 'fill',
    value: '<video controls="controls" src=""></video>',
  },
  {
    id: 'audioUrl',
    syKey: 'insertAudioURL',
    fallback: '插入音频网址',
    icon: 'iconRecord',
    kind: 'fill',
    value: '<audio controls="controls" src=""></audio>',
  },
  {
    id: 'iframe',
    syKey: 'insertIframeURL',
    fallback: '插入 iframe 网址',
    icon: 'iconGlobe',
    kind: 'fill',
    value: '<iframe sandbox="allow-forms allow-presentation allow-same-origin allow-scripts allow-modals allow-popups allow-storage-access-by-user-activation" src="" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe>',
    requires: ['localKernel'],
  },
  {
    id: 'emoji',
    syKey: 'emoji',
    fallback: '表情',
    icon: 'iconEmoji',
    kind: 'special',
    special: 'emoji',
  },

  // ===== 引述 =====
  {
    id: 'quote',
    syKey: 'quote',
    fallback: '引述',
    icon: 'iconQuote',
    kind: 'fill',
    value: `> ${SLASH_CARET}`,
  },
  {
    id: 'calloutNote',
    fallback: 'Note',
    icon: 'iconCallout',
    kind: 'fill',
    value: `> [!NOTE]\n> ${SLASH_CARET}`,
  },
  {
    id: 'calloutTip',
    fallback: 'Tip',
    icon: 'iconCallout',
    kind: 'fill',
    value: `> [!TIP]\n> ${SLASH_CARET}`,
  },
  {
    id: 'calloutImportant',
    fallback: 'Important',
    icon: 'iconCallout',
    kind: 'fill',
    value: `> [!IMPORTANT]\n> ${SLASH_CARET}`,
  },
  {
    id: 'calloutWarning',
    fallback: 'Warning',
    icon: 'iconCallout',
    kind: 'fill',
    value: `> [!WARNING]\n> ${SLASH_CARET}`,
  },
  {
    id: 'calloutCaution',
    fallback: 'Caution',
    icon: 'iconCallout',
    kind: 'fill',
    value: `> [!CAUTION]\n> ${SLASH_CARET}`,
  },

  // ===== 表格 =====
  {
    id: 'table',
    syKey: 'table',
    fallback: '表格',
    icon: 'iconTable',
    kind: 'fill',
    value: `| ${SLASH_CARET} |  |  |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |`,
  },
  {
    id: 'database',
    syKey: 'database',
    fallback: '数据库',
    icon: 'iconDatabase',
    kind: 'fill',
    value: '<div data-type="NodeAttributeView" data-av-type="table"></div>',
  },

  // ===== 页签 =====
  {
    id: 'tabs',
    syKey: 'tabs',
    fallback: '页签',
    icon: 'iconTabs',
    kind: 'fill',
    value: `::: tabs\n@tab\n\n${SLASH_CARET}\n\n@tab\n\n:::\n`,
  },
  {
    id: 'code',
    syKey: 'code',
    fallback: '代码块',
    icon: 'iconCode',
    kind: 'fill',
    value: '```',
  },
  {
    id: 'html',
    syKey: 'htmlBlock',
    fallback: 'HTML 块',
    icon: 'iconHTML5',
    kind: 'fill',
    value: '<div>',
  },
  {
    id: 'line',
    syKey: 'line',
    fallback: '分割线',
    icon: 'iconLine',
    kind: 'fill',
    value: '---',
  },

  // ===== 公式 =====
  {
    id: 'mathBlock',
    syKey: 'math',
    fallback: '公式块',
    icon: 'iconMath',
    kind: 'fill',
    value: '$$',
  },
  {
    id: 'inlineMath',
    syKey: 'inline-math',
    fallback: '行级公式',
    icon: 'iconMath',
    kind: 'special',
    special: 'inlineMath',
  },

  // ===== 更多 =====
  {
    id: 'aiWriting',
    syKey: 'aiWriting',
    fallback: 'AI 写作',
    icon: 'iconSparkles',
    kind: 'special',
    special: 'ai',
    requires: ['ai'],
  },
  {
    id: 'staff',
    syKey: 'staff',
    fallback: '五线谱',
    icon: 'iconCode',
    kind: 'fill',
    value: '```abc\n```',
  },
  {
    id: 'chart',
    syKey: 'chart',
    fallback: '图表',
    icon: 'iconCode',
    kind: 'fill',
    value: '```echarts\n```',
  },
  {
    id: 'flowchart',
    fallback: 'Flow Chart',
    icon: 'iconCode',
    kind: 'fill',
    value: '```flowchart\n```',
  },
  {
    id: 'graphviz',
    fallback: 'Graph',
    icon: 'iconCode',
    kind: 'fill',
    value: '```graphviz\n```',
  },
  {
    id: 'mermaid',
    fallback: 'Mermaid',
    icon: 'iconCode',
    kind: 'fill',
    value: '```mermaid\n```',
  },
  {
    id: 'plantuml',
    fallback: 'UML',
    icon: 'iconCode',
    kind: 'fill',
    value: '```plantuml\n```',
  },
  {
    id: 'styleInfo',
    syKey: 'infoStyle',
    fallback: '信息样式',
    icon: 'A',
    kind: 'fill',
    value: builtinStyleSlashValue('info'),
  },
  {
    id: 'styleSuccess',
    syKey: 'successStyle',
    fallback: '成功样式',
    icon: 'A',
    kind: 'fill',
    value: builtinStyleSlashValue('success'),
  },
  {
    id: 'styleWarning',
    syKey: 'warningStyle',
    fallback: '警告样式',
    icon: 'A',
    kind: 'fill',
    value: builtinStyleSlashValue('warning'),
  },
  {
    id: 'styleError',
    syKey: 'errorStyle',
    fallback: '错误样式',
    icon: 'A',
    kind: 'fill',
    value: builtinStyleSlashValue('error'),
  },
  {
    id: 'clearStyle',
    syKey: 'clearFontStyle',
    fallback: '清除字体样式',
    icon: 'A',
    kind: 'fill',
    value: `style${SLASH_ZWSP}`,
  },

  // ===== 一级按钮直接执行 =====
  {
    id: 'template',
    syKey: 'template',
    fallback: '模板',
    icon: 'iconMarkdown',
    kind: 'special',
    special: 'template',
  },
]

export const SLASH_PANELS: ISlashPanel[] = [
  {
    id: 'heading',
    entryIds: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  },
  {
    id: 'list',
    entryIds: ['list', 'orderedList', 'task'],
  },
  {
    id: 'asset',
    entryIds: ['pickImage', 'pickPhoto', 'pickFile', 'imgUrl', 'videoUrl', 'audioUrl', 'iframe', 'emoji'],
  },
  {
    id: 'quote',
    entryIds: ['quote', 'calloutNote', 'calloutTip', 'calloutImportant', 'calloutWarning', 'calloutCaution'],
  },
  {
    id: 'table',
    entryIds: ['table', 'database'],
  },
  {
    id: 'tabs',
    entryIds: ['tabs', 'code', 'html', 'line'],
  },
  {
    id: 'math',
    entryIds: ['mathBlock', 'inlineMath'],
  },
  {
    id: 'chart',
    entryIds: ['staff', 'chart', 'flowchart', 'graphviz', 'mermaid', 'plantuml'],
  },
  {
    id: 'style',
    entryIds: ['styleInfo', 'styleSuccess', 'styleWarning', 'styleError', 'clearStyle'],
  },
]

export const SLASH_BUTTONS: ISlashButton[] = [
  {
    id: 'blockRef',
    fallback: '块引用',
    icon: 'iconRef',
    entryId: 'blockRef',
  },
  {
    id: 'heading',
    fallback: '标题',
    icon: 'iconH1',
    panelId: 'heading',
  },
  {
    id: 'list',
    fallback: '列表',
    icon: 'iconList',
    panelId: 'list',
  },
  {
    id: 'style',
    fallback: '样式',
    icon: 'A',
    panelId: 'style',
  },
  {
    id: 'quote',
    fallback: '引述',
    icon: 'iconQuote',
    panelId: 'quote',
  },
  {
    id: 'tabs',
    fallback: '页签',
    icon: 'iconTabs',
    panelId: 'tabs',
  },
  {
    id: 'table',
    fallback: '表格',
    icon: 'iconTable',
    panelId: 'table',
  },
  {
    id: 'template',
    fallback: '模板',
    icon: 'iconMarkdown',
    entryId: 'template',
  },
  {
    id: 'asset',
    fallback: '插图',
    icon: 'iconDownload',
    panelId: 'asset',
    longPressEntryId: 'pickImage',
  },

  // ===== 以下默认不在一排显示，可在预览里拖到前面 =====
  {
    id: 'math',
    fallback: '公式',
    icon: 'iconMath',
    panelId: 'math',
  },
  {
    id: 'mindmap',
    fallback: '思维导图',
    icon: 'iconMindmap',
    entryId: 'mindmap',
  },
  {
    id: 'blockEmbed',
    fallback: '嵌入块',
    icon: 'iconSQL',
    entryId: 'blockEmbed',
  },
  {
    id: 'assets',
    fallback: '资源',
    icon: 'iconImage',
    entryId: 'assets',
  },
  {
    id: 'widget',
    fallback: '小组件',
    icon: 'iconBoth',
    entryId: 'widget',
  },
  {
    id: 'newSubDocRef',
    fallback: '新建子文档',
    icon: 'iconFile',
    entryId: 'newSubDocRef',
  },
  {
    id: 'aiWriting',
    fallback: 'AI 写作',
    icon: 'iconSparkles',
    entryId: 'aiWriting',
  },
  {
    id: 'chart',
    fallback: '图表',
    icon: 'iconGraph',
    panelId: 'chart',
  },
]

export const DEFAULT_SLASH_ORDER: string[] = SLASH_BUTTONS.map((button) => button.id)

/**
 * 工具栏一排实际显示的按钮数量。
 * 按思源键盘工具条 48px 高、图标 20px、按钮 padding 11px 7px + margin 3px 的尺寸口径，
 * 一排在手机宽度上舒适容纳 9 个；超出的按钮不显示，可在设置预览里往后排着或拖到前面。
 */
export const SLASH_BAR_VISIBLE_COUNT = 9

const buttonMap = new Map(SLASH_BUTTONS.map((button) => [button.id, button]))
const panelMap = new Map(SLASH_PANELS.map((panel) => [panel.id, panel]))
const entryMap = new Map(SLASH_ENTRIES.map((entry) => [entry.id, entry]))

export const getSlashButton = (id: string) => buttonMap.get(id)
export const getSlashPanel = (id: string) => panelMap.get(id)
export const getSlashEntry = (id: string) => entryMap.get(id)

/**
 * 规范化一级按钮顺序：过滤未知 id、去重、把定义里新增但配置里没有的按钮补在末尾。
 * 这样以后往 SLASH_BUTTONS 加按钮时，老用户不需要手动迁移。
 */
export const normalizeSlashOrder = (order: unknown): string[] => {
  const result: string[] = []
  const used = new Set<string>()
  if (Array.isArray(order)) {
    order.forEach((id) => {
      if (typeof id === 'string' && buttonMap.has(id) && !used.has(id)) {
        result.push(id)
        used.add(id)
      }
    })
  }
  DEFAULT_SLASH_ORDER.forEach((id) => {
    if (!used.has(id)) {
      result.push(id)
      used.add(id)
    }
  })
  return result
}

/** 远程内核（伺服/发布）能力受限，小组件与 iframe 都不可用 */
const isRemoteKernel = () => {
  try {
    return new URLSearchParams(window.location.search).get('remote') === '1'
  } catch {
    return false
  }
}

const meetsRequirements = (entry: ISlashEntry): boolean => {
  if (!entry.requires?.length) {
    return true
  }
  const siyuan = (window as any).siyuan
  return entry.requires.every((requirement) => {
    switch (requirement) {
      case 'android':
        return /Android/i.test(navigator.userAgent || '')
      case 'ai':
        return !((siyuan?.config?.system?.disabledFeatures as string[] | undefined)?.includes('ai'))
      case 'widgets':
      case 'localKernel':
        return !isRemoteKernel()
      default:
        return true
    }
  })
}

/** 取条目在当前环境下是否可用 */
export const isSlashEntryAvailable = (entry: ISlashEntry): boolean => meetsRequirements(entry)

/** 取面板内当前环境可用的条目 */
export const getAvailablePanelEntries = (panelId: string): ISlashEntry[] => {
  const panel = panelMap.get(panelId)
  if (!panel) {
    return []
  }
  return panel.entryIds
    .map((id) => entryMap.get(id))
    .filter((entry): entry is ISlashEntry => Boolean(entry) && meetsRequirements(entry))
}

/**
 * 取按当前环境过滤后、且按 order 排序的一级按钮定义。
 * 面板内一个条目都不可用的按钮会被跳过（例如非 Android 且无 AI 时的空面板）。
 * limit 大于 0 时只取前 N 个（工具栏一排只显示 SLASH_BAR_VISIBLE_COUNT 个）。
 */
export const getOrderedSlashButtons = (order: unknown, limit = 0): Array<{ button: ISlashButton, panel?: ISlashPanel, entry?: ISlashEntry }> => {
  const result: Array<{ button: ISlashButton, panel?: ISlashPanel, entry?: ISlashEntry }> = []
  normalizeSlashOrder(order).forEach((id) => {
    if (limit > 0 && result.length >= limit) {
      return
    }
    const button = buttonMap.get(id)
    if (!button) {
      return
    }
    if (button.panelId) {
      const panel = panelMap.get(button.panelId)
      if (!panel || getAvailablePanelEntries(panel.id).length === 0) {
        return
      }
      result.push({
        button,
        panel,
      })
      return
    }
    const entry = button.entryId ? entryMap.get(button.entryId) : undefined
    if (!entry || !meetsRequirements(entry)) {
      return
    }
    result.push({
      button,
      entry,
    })
  })
  return result
}

/** 取工具栏一排实际显示的按钮（按顺序取前 SLASH_BAR_VISIBLE_COUNT 个可用的） */
export const getBarSlashButtons = (order: unknown) => getOrderedSlashButtons(order, SLASH_BAR_VISIBLE_COUNT)

/** 取条目显示名：优先思源界面语言，取不到用兜底名 */
export const getSlashEntryName = (entry: ISlashEntry, translate: (key: string, fallback: string) => string): string => {
  if (!entry.syKey) {
    return entry.fallback
  }
  return translate(entry.syKey, entry.fallback)
}

/* --------------------------------------------------------------- 用户配置 */

/** 斜杠菜单工具栏配置：只存总开关与一级按钮顺序 */
export interface ISlashToolbarConfig {
  enabled: boolean
  order: string[]
}

export const createDefaultSlashToolbarConfig = (): ISlashToolbarConfig => ({
  enabled: true,
  order: [...DEFAULT_SLASH_ORDER],
})

/** 规范化存储值：缺失/损坏时回到出厂默认，顺序按 catalog 补齐。
    enabled 缺失视为默认开启（老存储里没有该字段时按 true 处理）。 */
export const normalizeSlashToolbarConfig = (saved: unknown): ISlashToolbarConfig => {
  let value = saved
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return createDefaultSlashToolbarConfig()
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createDefaultSlashToolbarConfig()
  }
  const record = value as Record<string, unknown>
  return {
    enabled: record.enabled !== false,
    order: normalizeSlashOrder(record.order),
  }
}
