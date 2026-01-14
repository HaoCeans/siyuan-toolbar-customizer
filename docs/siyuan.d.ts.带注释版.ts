/**
 * SiYuan API 类型定义文件（带中文注释版）
 * 
 * 这是 SiYuan 插件开发的核心 API 类型定义文件
 * 所有函数和类都添加了详细的中文注释和使用说明
 * 
 * 使用方法：
 * 1. 在代码中导入需要的函数和类
 * 2. 参考注释了解每个函数的功能和参数
 * 3. 查看使用示例学习如何使用
 */

// ===== 网络请求相关函数 =====

/**
 * 适配快捷键格式
 * 将快捷键字符串转换为系统适配的格式
 * 
 * @param hotkey - 快捷键字符串，如 'Ctrl+Shift+A'
 * @returns 适配后的快捷键字符串
 * 
 * @example
 * ```typescript
 * const adapted = adaptHotkey('Ctrl+Shift+A')
 * ```
 */
export function adaptHotkey(hotkey: string): string

/**
 * 显示确认对话框
 * 
 * @param title - 对话框标题
 * @param text - 对话框内容文本
 * @param confirmCallback - 确认按钮的回调函数（可选）
 * @param cancelCallback - 取消按钮的回调函数（可选）
 * 
 * @example
 * ```typescript
 * confirm(
 *   '确认删除',
 *   '确定要删除这个文档吗？',
 *   (dialog) => {
 *     console.log('用户点击了确认')
 *     dialog.destroy()
 *   },
 *   (dialog) => {
 *     console.log('用户点击了取消')
 *     dialog.destroy()
 *   }
 * )
 * ```
 */
export function confirm(
  title: string, 
  text: string, 
  confirmCallback?: (dialog: Dialog) => void, 
  cancelCallback?: (dialog: Dialog) => void
): void;

/**
 * 发送异步 POST 请求到 SiYuan 后端
 * 
 * @param url - 请求的 URL 路径，如 '/api/notebook/lsNotebooks'
 * @param data - 请求数据对象（可选）
 * @param callback - 回调函数，接收响应数据（可选）
 * @param headers - 自定义请求头（可选）
 * 
 * @example
 * ```typescript
 * fetchPost('/api/filetree/getDoc', {
 *   notebook: 'notebook-id',
 *   path: '/path/to/doc'
 * }, (response) => {
 *   if (response.code === 0) {
 *     console.log('成功：', response.data)
 *   } else {
 *     console.error('失败：', response.msg)
 *   }
 * })
 * ```
 */
export function fetchPost(
  url: string, 
  data?: any, 
  callback?: (response: IWebSocketData) => void, 
  headers?: IObject
): void;

/**
 * 发送同步 POST 请求（返回 Promise）
 * 推荐使用此函数，可以使用 async/await 语法
 * 
 * @param url - 请求的 URL 路径
 * @param data - 请求数据对象（可选）
 * @returns Promise<IWebSocketData> - 返回响应数据的 Promise
 * 
 * @example
 * ```typescript
 * async function getNotebooks() {
 *   try {
 *     const response = await fetchSyncPost('/api/notebook/lsNotebooks', {})
 *     if (response.code === 0) {
 *       console.log('笔记本列表：', response.data)
 *     }
 *   } catch (error) {
 *     console.error('请求错误：', error)
 *   }
 * }
 * ```
 */
export function fetchSyncPost(url: string, data?: any): Promise<IWebSocketData>;

/**
 * 发送异步 GET 请求
 * 
 * @param url - 请求的 URL 路径
 * @param callback - 回调函数，接收响应数据
 * 
 * @example
 * ```typescript
 * fetchGet('/api/system/getVersion', (response) => {
 *   console.log('SiYuan 版本：', response.data)
 * })
 * ```
 */
export function fetchGet(url: string, callback: (response: IWebSocketData) => void): void;

// ===== 窗口和标签页管理 =====

/**
 * 打开新窗口
 * 
 * @param options - 窗口配置选项
 * @param options.position - 窗口位置 { x: number, y: number }（可选）
 * @param options.height - 窗口高度（可选）
 * @param options.width - 窗口宽度（可选）
 * @param options.tab - 标签页对象（可选）
 * @param options.doc - 文档配置 { id: string }，id 为块 ID（可选）
 * 
 * @example
 * ```typescript
 * openWindow({
 *   width: 1200,
 *   height: 800,
 *   doc: {
 *     id: '20231201123456-abcdef'  // 文档块 ID
 *   }
 * })
 * ```
 */
export function openWindow(options: {
  position?: {
    x: number,
    y: number,
  },
  height?: number,
  width?: number,
  tab?: Tab,
  doc?: {
    id: string; // 块 id
  },
}): void;

/**
 * 在移动端按 ID 打开文件
 * 
 * @param app - App 实例
 * @param id - 文件块 ID
 * @param action - 编辑器操作数组（可选）
 * 
 * @example
 * ```typescript
 * openMobileFileById(this.app, '20231201123456-abcdef')
 * ```
 */
export function openMobileFileById(app: App, id: string, action?: TProtyleAction[]): void;

/**
 * 打开新标签页
 * 支持打开文档、PDF、资源、搜索、卡片、自定义标签页等多种类型
 * 
 * @param options - 标签页配置选项
 * @param options.app - App 实例（必需）
 * @param options.doc - 文档配置（可选）
 *   - id: 块 ID
 *   - action: 编辑器操作数组
 *   - zoomIn: 是否缩放
 * @param options.pdf - PDF 配置（可选）
 *   - path: PDF 路径
 *   - page: PDF 页码
 *   - id: 文件注释 ID
 * @param options.asset - 资源配置 { path: string }（可选）
 * @param options.search - 搜索配置（可选）
 * @param options.card - 卡片配置（可选）
 *   - type: 'doc' | 'notebook' | 'all'
 *   - id: 文档或笔记本 ID（type 为 all 时不传）
 *   - title: 文档或笔记本名称（type 为 all 时不传）
 * @param options.custom - 自定义标签页配置（可选）
 *   - id: 插件名称+页签类型（plugin.name + tab.type）
 *   - icon: 图标
 *   - title: 标题
 *   - data: 自定义数据
 * @param options.position - 标签页位置 'right' | 'bottom'（可选）
 * @param options.keepCursor - 是否跳转到新标签页（可选）
 * @param options.removeCurrentTab - 在当前页签打开时是否移除原有页签（可选）
 * @param options.openNewTab - 是否使用新页签打开（可选）
 * @param options.afterOpen - 打开后回调函数（可选）
 * @returns Promise<Tab> - 返回标签页实例的 Promise
 * 
 * @example
 * ```typescript
 * // 打开文档标签页
 * const tab = await openTab({
 *   app: this.app,
 *   doc: {
 *     id: '20231201123456-abcdef',
 *     zoomIn: true
 *   },
 *   position: 'right',
 *   afterOpen: () => {
 *     console.log('文档已打开')
 *   }
 * })
 * 
 * // 打开搜索标签页
 * await openTab({
 *   app: this.app,
 *   search: {
 *     k: '关键词'
 *   }
 * })
 * ```
 */
export function openTab(options: {
  app: App,
  doc?: {
    id: string, // 块 id
    action?: TProtyleAction[],
    zoomIn?: boolean, // 是否缩放
  };
  pdf?: {
    path: string,
    page?: number,  // pdf 页码
    id?: string,    // File Annotation id
  };
  asset?: {
    path: string,
  };
  search?: Config.IUILayoutTabSearchConfig;
  card?: {
    type: TCardType,
    id?: string, //  cardType 为 all 时不传，否则传文档或笔记本 id
    title?: string, //  cardType 为 all 时不传，否则传文档或笔记本名称
  };
  custom?: {
    id: string, // 插件名称+页签类型：plugin.name + tab.type
    icon: string,
    title: string,
    data?: any,
  };
  position?: "right" | "bottom";
  keepCursor?: boolean; // 是否跳转到新 tab 上
  removeCurrentTab?: boolean; // 在当前页签打开时需移除原有页签
  openNewTab?: boolean // 使用新页签打开
  afterOpen?: () => void; // 打开后回调
}): Promise<Tab>

// ===== 系统信息函数 =====

/**
 * 获取当前前端运行环境类型
 * 
 * @returns 前端环境类型：
 *   - 'desktop': 桌面客户端
 *   - 'desktop-window': 桌面客户端子窗口
 *   - 'mobile': 移动端原生应用
 *   - 'browser-desktop': 浏览器桌面版
 *   - 'browser-mobile': 浏览器移动版
 * 
 * @example
 * ```typescript
 * const frontend = getFrontend()
 * if (frontend === 'mobile' || frontend === 'browser-mobile') {
 *   console.log('这是移动端环境')
 * }
 * ```
 */
export function getFrontend(): "desktop" | "desktop-window" | "mobile" | "browser-desktop" | "browser-mobile";

/**
 * 获取后端平台类型
 * 
 * @returns 后端平台类型：
 *   - 'windows': Windows 系统
 *   - 'linux': Linux 系统
 *   - 'darwin': macOS 系统
 *   - 'docker': Docker 容器
 *   - 'android': Android 系统
 *   - 'ios': iOS 系统
 *   - 'harmony': HarmonyOS 系统
 * 
 * @example
 * ```typescript
 * const backend = getBackend()
 * if (backend === 'windows') {
 *   console.log('运行在 Windows 系统')
 * }
 * ```
 */
export function getBackend(): "windows" | "linux" | "darwin" | "docker" | "android" | "ios" | "harmony";

/**
 * 锁定屏幕
 * 
 * @param app - App 实例
 * 
 * @example
 * ```typescript
 * lockScreen(this.app)
 * ```
 */
export function lockScreen(app: App): void

/**
 * 退出 SiYuan 应用
 * 谨慎使用，会直接退出应用
 * 
 * @example
 * ```typescript
 * exitSiYuan()
 * ```
 */
export function exitSiYuan(): void

/**
 * 获取所有编辑器实例
 * 
 * @returns Protyle[] - 编辑器实例数组
 * 
 * @example
 * ```typescript
 * const editors = getAllEditor()
 * console.log('当前打开的编辑器数量：', editors.length)
 * editors.forEach((editor, index) => {
 *   console.log(`编辑器 ${index + 1}：`, editor)
 * })
 * ```
 */
export function getAllEditor(): Protyle[]

/**
 * 获取所有模型实例
 * 返回包含各种模型的对象，包括编辑器、图谱、资源、大纲、反向链接、搜索等模型
 * 
 * @returns 模型对象，包含以下属性：
 *   - editor: 编辑器模型数组
 *   - graph: 图谱模型数组
 *   - asset: 资源模型数组
 *   - outline: 大纲模型数组
 *   - backlink: 反向链接模型数组
 *   - search: 搜索模型数组
 *   - inbox: 收集箱模型数组
 *   - files: 文件模型数组
 *   - bookmark: 书签模型数组
 *   - tag: 标签模型数组
 *   - custom: 自定义模型数组
 * 
 * @example
 * ```typescript
 * const models = getAllModels()
 * console.log('编辑器模型：', models.editor)
 * console.log('图谱模型：', models.graph)
 * ```
 */
export function getAllModels(): {
  editor: [],
  graph: [],
  asset: [],
  outline: [],
  backlink: [],
  search: [],
  inbox: [],
  files: [],
  bookmark: [],
  tag: [],
  custom: [],
}

/**
 * 打开设置对话框
 * 
 * @param app - App 实例
 * @returns Dialog | undefined - 返回对话框实例，如果打开失败则返回 undefined
 * 
 * @example
 * ```typescript
 * const settingDialog = openSetting(this.app)
 * if (settingDialog) {
 *   console.log('设置对话框已打开')
 * }
 * ```
 */
export function openSetting(app: App): Dialog | undefined;

/**
 * 根据 Dock 类型获取对应的模型
 * 
 * @param type - Dock 类型，可以是以下值之一：
 *   - 'file': 文件树
 *   - 'outline': 大纲
 *   - 'inbox': 收集箱
 *   - 'bookmark': 书签
 *   - 'tag': 标签
 *   - 'graph': 关系图
 *   - 'globalGraph': 全局关系图
 *   - 'backlink': 反向链接
 * @returns Model | any - 返回对应的模型实例
 * 
 * @example
 * ```typescript
 * // 获取文件树模型
 * const fileModel = getModelByDockType('file')
 * console.log('文件树模型：', fileModel)
 * ```
 */
export function getModelByDockType(type: TDock | string): Model | any;

/**
 * 显示消息提示
 * 
 * @param text - 消息内容
 * @param timeout - 显示时长（毫秒）
 *   - 0: 手动关闭
 *   - -1: 一直显示
 *   - 6000: 默认 6 秒
 * @param type - 消息类型，'info' | 'error'（默认 'info'）
 * @param id - 消息 ID（可选），用于更新已有消息
 * 
 * @example
 * ```typescript
 * // 显示信息提示
 * showMessage('操作成功！', 3000, 'info')
 * 
 * // 显示错误提示
 * showMessage('操作失败：文件不存在', 5000, 'error')
 * 
 * // 显示永久提示（需要手动关闭）
 * showMessage('正在处理中...', -1, 'info', 'processing-msg')
 * 
 * // 更新已有消息
 * showMessage('处理完成！', 3000, 'info', 'processing-msg')
 * ```
 */
export function showMessage(text: string, timeout?: number, type?: "info" | "error", id?: string): void;

// ===== Plugin 类（插件核心类） =====

/**
 * 插件基类
 * 所有 SiYuan 插件都必须继承此类
 * 
 * 主要属性：
 * - eventBus: 事件总线，用于监听和触发事件
 * - i18n: 国际化对象
 * - data: 插件数据存储
 * - displayName: 插件显示名称
 * - name: 插件名称（只读）
 * - app: App 实例，可以访问 SiYuan 的核心功能
 * - commands: 命令列表
 * - setting: 设置对象
 * - protyleSlash: Protyle 斜杠命令列表
 * - protyleOptions: Protyle 选项
 * 
 * 主要方法：
 * - onload(): 插件加载时调用（必须实现）
 * - onunload(): 插件卸载时调用（可选实现）
 * - onLayoutReady(): 布局就绪时调用（可选实现）
 * - uninstall(): 卸载插件时调用（可选实现）
 * - addTopBar(): 添加顶部栏按钮
 * - addStatusBar(): 添加状态栏元素
 * - addTab(): 添加自定义标签页
 * - addDock(): 添加 Dock 面板
 * - addCommand(): 添加快捷键命令
 * - loadData(): 加载插件数据
 * - saveData(): 保存插件数据
 * - removeData(): 删除插件数据
 * 
 * @example
 * ```typescript
 * export default class MyPlugin extends Plugin {
 *   async onload() {
 *     // 添加顶部栏按钮
 *     this.addTopBar({
 *       icon: 'iconHeart',
 *       title: '我的按钮',
 *       callback: () => {
 *         console.log('按钮被点击')
 *       }
 *     })
 *     
 *     // 监听事件
 *     this.eventBus.on('click-editorcontent', (e) => {
 *       console.log('编辑器被点击', e.detail)
 *     })
 *   }
 *   
 *   onunload() {
 *     console.log('插件已卸载')
 *   }
 * }
 * ```
 */
export abstract class Plugin {
  eventBus: EventBus;
  i18n: IObject;
  data: any;
  displayName: string;
  readonly name: string;
  app: App;
  commands: ICommand[];
  setting: Setting;
  protyleSlash: {
    filter: string[],
    html: string,
    id: string,
    callback(protyle: Protyle, nodeElement: HTMLElement): void,
  }[];
  protyleOptions: IProtyleOptions;

  constructor(options: {
    app: App,
    name: string,
    i18n: IObject,
  });

  /**
   * 插件加载时调用（必须实现）
   * 在这里进行插件的初始化工作
   * 
   * @example
   * ```typescript
   * async onload() {
   *   console.log('插件已加载')
   *   // 添加 UI 组件、监听事件等
   * }
   * ```
   */
  onload(): void;

  /**
   * 插件卸载时调用（可选实现）
   * 在这里进行资源清理工作
   * 
   * @example
   * ```typescript
   * onunload() {
   *   // 清理定时器、取消事件监听等
   *   if (this.timer) {
   *     clearInterval(this.timer)
   *   }
   * }
   * ```
   */
  onunload(): void;

  /**
   * 卸载插件时调用（可选实现）
   * 与 onunload 不同，uninstall 是在插件被完全卸载时调用
   */
  uninstall(): void;

  /**
   * 布局就绪时调用（可选实现）
   * 在布局完全加载后调用，此时可以安全地访问 DOM
   * 
   * @example
   * ```typescript
   * onLayoutReady() {
   *   console.log('布局已就绪，可以安全访问 DOM')
   *   // 操作 DOM 元素
   * }
   * ```
   */
  onLayoutReady(): void;

  /**
   * 添加顶部栏按钮
   * 注意：必须在同步函数之前执行
   * 
   * @param options - 按钮配置
   * @param options.icon - 图标，支持 SVG ID 或 SVG 标签
   * @param options.title - 按钮标题
   * @param options.callback - 点击回调函数
   * @param options.position - 位置，'right' | 'left'（默认 'right'）
   * @returns HTMLElement - 创建的按钮元素
   * 
   * @example
   * ```typescript
   * const button = this.addTopBar({
   *   icon: 'iconHeart',  // 或 '<svg>...</svg>'
   *   title: '我的按钮',
   *   position: 'right',
   *   callback: (event) => {
   *     console.log('按钮被点击', event)
   *   }
   * })
   * ```
   */
  addTopBar(options: {
    icon: string,
    title: string,
    callback: (event: MouseEvent) => void
    position?: "right" | "left"
  }): HTMLElement;

  /**
   * 添加状态栏元素
   * 注意：必须在同步函数之前执行
   * 
   * @param options - 状态栏配置
   * @param options.element - 要添加的元素
   * @param options.position - 位置，'right' | 'left'（默认 'right'）
   * @returns HTMLElement - 添加的元素
   * 
   * @example
   * ```typescript
   * const statusElement = document.createElement('div')
   * statusElement.textContent = '插件已就绪'
   * this.addStatusBar({
   *   element: statusElement,
   *   position: 'left'
   * })
   * ```
   */
  addStatusBar(options: {
    element: HTMLElement,
    position?: "right" | "left",
  }): HTMLElement;

  /**
   * 打开插件设置面板
   * 
   * @example
   * ```typescript
   * this.openSetting()
   * ```
   */
  openSetting(): void;

  /**
   * 加载插件数据
   * 
   * @param storageName - 存储名称
   * @returns Promise<any> - 返回保存的数据
   * 
   * @example
   * ```typescript
   * const data = await this.loadData('my-plugin-data')
   * if (data) {
   *   console.log('加载的数据：', data)
   * }
   * ```
   */
  loadData(storageName: string): Promise<any>;

  /**
   * 保存插件数据
   * 
   * @param storageName - 存储名称
   * @param content - 要保存的内容
   * @returns Promise<void>
   * 
   * @example
   * ```typescript
   * await this.saveData('my-plugin-data', {
   *   setting1: 'value1',
   *   setting2: 'value2'
   * })
   * ```
   */
  saveData(storageName: string, content: any): Promise<void>;

  /**
   * 删除插件数据
   * 
   * @param storageName - 存储名称
   * @returns Promise<any>
   * 
   * @example
   * ```typescript
   * await this.removeData('my-plugin-data')
   * ```
   */
  removeData(storageName: string): Promise<any>;

  /**
   * 添加 SVG 图标
   * 
   * @param svg - SVG 字符串
   * 
   * @example
   * ```typescript
   * this.addIcons(`
   *   <svg id="iconMyIcon" viewBox="0 0 24 24">
   *     <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
   *   </svg>
   * `)
   * 
   * // 之后可以使用
   * this.addTopBar({
   *   icon: 'iconMyIcon',
   *   title: '我的按钮',
   *   callback: () => {}
   * })
   * ```
   */
  addIcons(svg: string): void;

  /**
   * 获取已打开的标签页
   * 
   * @returns { [key: string]: Custom[] } - 按类型分组的标签页对象
   * 
   * @example
   * ```typescript
   * const openedTabs = this.getOpenedTab()
   * Object.keys(openedTabs).forEach(type => {
   *   console.log(`类型 ${type} 的标签页：`, openedTabs[type])
   * })
   * ```
   */
  getOpenedTab(): { [key: string]: Custom[] };

  /**
   * 添加自定义标签页
   * 注意：必须在同步函数之前执行
   * 
   * @param options - 标签页配置
   * @param options.type - 标签页类型（唯一标识）
   * @param options.init - 初始化函数
   * @param options.beforeDestroy - 销毁前回调（可选）
   * @param options.destroy - 销毁回调（可选）
   * @param options.resize - 调整大小回调（可选）
   * @param options.update - 更新回调（可选）
   * @returns () => Custom - 返回一个函数，调用可获取 Custom 实例
   * 
   * @example
   * ```typescript
   * const getTab = this.addTab({
   *   type: 'my-custom-tab',
   *   init() {
   *     this.element.innerHTML = '<div>我的自定义标签页</div>'
   *   },
   *   destroy() {
   *     console.log('标签页正在销毁')
   *   }
   * })
   * 
   * const tab = getTab()
   * ```
   */
  addTab(options: {
    type: string,
    beforeDestroy?: (this: Custom) => void,
    destroy?: (this: Custom) => void,
    resize?: (this: Custom) => void,
    update?: (this: Custom) => void,
    init: (this: Custom) => void,
  }): () => Custom;

  /**
   * 添加 Dock 面板（侧边栏）
   * 注意：必须在同步函数之前执行
   * 
   * @param options - Dock 配置
   * @param options.config - Dock 配置对象
   * @param options.data - 数据
   * @param options.type - 类型标识
   * @param options.init - 初始化函数
   * @param options.destroy - 销毁回调（可选）
   * @param options.resize - 调整大小回调（可选）
   * @param options.update - 更新回调（可选）
   * @returns { config: IPluginDockTab, model: Dock } - 返回配置和模型
   * 
   * @example
   * ```typescript
   * const { config, model } = this.addDock({
   *   config: {
   *     position: 'LeftTop',
   *     size: { width: 200, height: 300 },
   *     icon: 'iconHeart',
   *     title: '我的 Dock',
   *     hotkey: '⌥⇧⌘D'
   *   },
   *   data: {},
   *   type: 'my-dock',
   *   init(dock) {
   *     dock.element.innerHTML = '<div>我的 Dock 面板</div>'
   *   }
   * })
   * ```
   */
  addDock(options: {
    config: IPluginDockTab,
    data: any,
    type: string,
    destroy?: (this: Dock) => void,
    resize?: (this: Dock) => void,
    update?: (this: Dock) => void,
    init: (this: Dock, dock: Dock) => void,
  }): { config: IPluginDockTab, model: Dock };

  /**
   * 添加快捷键命令
   * 
   * @param options - 命令配置
   * @param options.langKey - 命令标识（用于 i18n）
   * @param options.langText - 显示文本（覆盖 i18n，可选）
   * @param options.hotkey - 快捷键（MacOS 符号格式，如 '⌥⇧⌘A'）
   * @param options.customHotkey - 自定义快捷键（可选）
   * @param options.callback - 通用回调（可选）
   * @param options.globalCallback - 全局回调，焦点不在应用内时执行（可选）
   * @param options.fileTreeCallback - 文档树回调（可选）
   * @param options.editorCallback - 编辑器回调（可选）
   * @param options.dockCallback - Dock 回调（可选）
   * 
   * 快捷键符号说明：
   * - ⌘ = Ctrl (Windows) / Cmd (Mac)
   * - ⇧ = Shift
   * - ⌥ = Alt / Option
   * - ⌫ = Backspace
   * - ⌦ = Delete
   * - ↩ = Enter
   * - ⇥ = Tab
   * 
   * @example
   * ```typescript
   * this.addCommand({
   *   langKey: 'my-command',
   *   langText: '我的命令',
   *   hotkey: '⌥⇧⌘M',
   *   editorCallback: (protyle) => {
   *     console.log('在编辑器中执行命令', protyle)
   *   },
   *   fileTreeCallback: (file) => {
   *     console.log('在文档树中执行命令', file)
   *   }
   * })
   * ```
   */
  addCommand(options: ICommand): void;

  /**
   * 添加浮动层（用于显示引用块）
   * 
   * @param options - 浮动层配置
   * @param options.refDefs - 引用定义数组
   * @param options.x - X 坐标（可选）
   * @param options.y - Y 坐标（可选）
   * @param options.targetElement - 目标元素（可选）
   * @param options.originalRefBlockIDs - 原始引用块 ID（可选）
   * @param options.isBacklink - 是否为反向链接
   * 
   * @example
   * ```typescript
   * this.addFloatLayer({
   *   refDefs: [{
   *     defID: 'block-id',
   *     defPath: '/path/to/doc',
   *     blockRefText: '引用文本'
   *   }],
   *   x: 100,
   *   y: 200,
   *   isBacklink: false
   * })
   * ```
   */
  addFloatLayer(options: {
    refDefs: IRefDefs[],
    x?: number,
    y?: number,
    targetElement?: HTMLElement,
    originalRefBlockIDs?: IObject,
    isBacklink: boolean,
  }): void;

  /**
   * 更新卡片数据
   * 
   * @param options - 卡片数据
   * @returns Promise<ICardData> | ICardData
   * 
   * @example
   * ```typescript
   * await this.updateCards({
   *   cards: [{
   *     deckID: 'deck-id',
   *     cardID: 'card-id',
   *     blockID: 'block-id',
   *     nextDues: {},
   *     lapses: 0,
   *     lastReview: Date.now(),
   *     reps: 1,
   *     state: 0
   *   }],
   *   unreviewedCount: 1,
   *   unreviewedNewCardCount: 1,
   *   unreviewedOldCardCount: 0
   * })
   * ```
   */
  updateCards(options: ICardData): Promise<ICardData> | ICardData;

  /**
   * 更新编辑器工具栏
   * 
   * @param toolbar - 工具栏项数组
   * @returns Array<string | IMenuItem> - 更新后的工具栏数组
   * 
   * @example
   * ```typescript
   * this.updateProtyleToolbar([
   *   'bold',
   *   'italic',
   *   '|',  // 分隔符
   *   {
   *     icon: 'iconHeart',
   *     title: '自定义按钮',
   *     click: () => {
   *       console.log('自定义按钮被点击')
   *     }
   *   }
   * ])
   * ```
   */
  updateProtyleToolbar(toolbar: Array<string | IMenuItem>): Array<string | IMenuItem>;
}

// ===== Setting 类（设置） =====

/**
 * 设置面板类
 * 用于创建插件的设置界面
 * 
 * @example
 * ```typescript
 * const setting = new Setting({
 *   width: '600px',
 *   height: '400px',
 *   confirmCallback: () => {
 *     console.log('用户点击了确认')
 *   }
 * })
 * 
 * setting.addItem({
 *   title: '设置项 1',
 *   description: '这是设置说明',
 *   createActionElement: () => {
 *     const input = document.createElement('input')
 *     input.type = 'checkbox'
 *     return input
 *   }
 * })
 * ```
 */
export class Setting {
  constructor(options: {
    height?: string,
    width?: string,
    destroyCallback?: () => void,
    confirmCallback?: () => void,
  });

  /**
   * 添加设置项
   * 
   * @param options - 设置项配置
   * @param options.title - 标题
   * @param options.direction - 方向，'column' | 'row'（默认 'row'）
   * @param options.description - 描述（可选）
   * @param options.actionElement - 操作元素（可选）
   * @param options.createActionElement - 创建操作元素的函数（可选）
   * 
   * @example
   * ```typescript
   * setting.addItem({
   *   title: '启用功能',
   *   description: '是否启用此功能',
   *   createActionElement: () => {
   *     const checkbox = document.createElement('input')
   *     checkbox.type = 'checkbox'
   *     return checkbox
   *   }
   * })
   * ```
   */
  addItem(options: {
    title: string,
    direction?: "column" | "row"
    description?: string,
    actionElement?: HTMLElement,
    createActionElement?(): HTMLElement,
  }): void;

  /**
   * 打开设置面板
   * 
   * @param name - 设置面板名称
   */
  open(name: string): void;
}

// ===== EventBus 类（事件总线） =====

/**
 * 事件总线类
 * 用于监听和触发 SiYuan 的各种事件
 * 
 * @example
 * ```typescript
 * // 监听事件
 * this.eventBus.on('click-editorcontent', (e) => {
 *   console.log('编辑器被点击', e.detail)
 * })
 * 
 * // 触发事件
 * this.eventBus.emit('my-custom-event', { data: 'some data' })
 * ```
 */
export class EventBus {
  /**
   * 监听事件
   * 
   * @param type - 事件类型
   * @param listener - 事件监听器函数
   * 
   * @example
   * ```typescript
   * this.eventBus.on('click-editorcontent', (e) => {
   *   console.log('编辑器被点击', e.detail.protyle)
   * })
   * ```
   */
  on<
    K extends TEventBus,
    D = IEventBusMap[K],
  >(type: K, listener: (event: CustomEvent<D>) => any): void;

  /**
   * 监听一次事件（触发后自动移除）
   * 
   * @param type - 事件类型
   * @param listener - 事件监听器函数
   * 
   * @example
   * ```typescript
   * this.eventBus.once('loaded-protyle-static', (e) => {
   *   console.log('编辑器已加载（只触发一次）', e.detail)
   * })
   * ```
   */
  once<
    K extends TEventBus,
    D = IEventBusMap[K],
  >(type: K, listener: (event: CustomEvent<D>) => any): void;

  /**
   * 取消事件监听
   * 
   * @param type - 事件类型
   * @param listener - 要移除的监听器函数
   * 
   * @example
   * ```typescript
   * const handler = (e) => console.log('事件触发', e.detail)
   * this.eventBus.on('click-editorcontent', handler)
   * this.eventBus.off('click-editorcontent', handler)
   * ```
   */
  off<
    K extends TEventBus,
    D = IEventBusMap[K],
  >(type: K, listener: (event: CustomEvent<D>) => any): void;

  /**
   * 触发事件
   * 
   * @param type - 事件类型
   * @param detail - 事件详情（可选）
   * @returns boolean - 是否成功触发
   * 
   * @example
   * ```typescript
   * this.eventBus.emit('my-custom-event', { data: 'some data' })
   * ```
   */
  emit<
    K extends TEventBus,
    D = IEventBusMap[K],
  >(type: K, detail?: D): boolean;
}

// ===== Dialog 类（对话框） =====

/**
 * 对话框类
 * 用于创建自定义对话框
 * 
 * @example
 * ```typescript
 * const dialog = new Dialog({
 *   title: '我的对话框',
 *   content: '<div>这是对话框内容</div>',
 *   width: '500px',
 *   height: '300px',
 *   destroyCallback: () => {
 *     console.log('对话框已关闭')
 *   }
 * })
 * ```
 */
export class Dialog {
  element: HTMLElement;
  editors: { [key: string]: Protyle };
  data: any;

  constructor(options: {
    positionId?: string,
    title?: string,
    transparent?: boolean,
    content: string,
    width?: string,
    height?: string,
    destroyCallback?: (options?: IObject) => void,
    disableClose?: boolean,
    hideCloseIcon?: boolean,
    disableAnimation?: boolean,
    resizeCallback?: (type: string) => void
  });

  /**
   * 销毁对话框
   * 
   * @param options - 选项（可选）
   * 
   * @example
   * ```typescript
   * dialog.destroy()
   * ```
   */
  destroy(options?: IObject): void;

  /**
   * 绑定输入框回车事件
   * 
   * @param inputElement - 输入框元素
   * @param enterEvent - 回车事件回调（可选）
   * 
   * @example
   * ```typescript
   * const input = document.createElement('input')
   * input.type = 'text'
   * dialog.bindInput(input, () => {
   *   console.log('用户按了回车，输入值：', input.value)
   *   dialog.destroy()
   * })
   * ```
   */
  bindInput(inputElement: HTMLInputElement | HTMLTextAreaElement, enterEvent?: () => void): void;
}

// ===== Menu 类（菜单） =====

/**
 * 菜单类
 * 用于创建上下文菜单
 * 
 * @example
 * ```typescript
 * const menu = new Menu('my-menu', () => {
 *   console.log('菜单已关闭')
 * })
 * 
 * menu.addItem({
 *   icon: 'iconHeart',
 *   label: '菜单项 1',
 *   click: () => {
 *     console.log('菜单项 1 被点击')
 *     menu.close()
 *   }
 * })
 * 
 * menu.open({ x: 100, y: 200 })
 * ```
 */
export class Menu {
  private menu;
  isOpen: boolean;
  element: HTMLElement;

  constructor(id?: string, closeCB?: () => void);

  /**
   * 显示子菜单
   * 
   * @param subMenuElement - 子菜单元素
   */
  showSubMenu(subMenuElement: HTMLElement): void;

  /**
   * 添加菜单项
   * 
   * @param option - 菜单项配置
   * @returns HTMLElement - 创建的菜单项元素
   * 
   * @example
   * ```typescript
   * menu.addItem({
   *   icon: 'iconHeart',
   *   label: '菜单项',
   *   click: () => {
   *     console.log('菜单项被点击')
   *     menu.close()
   *   }
   * })
   * ```
   */
  addItem(option: IMenu): HTMLElement;

  /**
   * 添加分隔线
   * 
   * @param options - 分隔线配置（可选）
   * @param options.index - 插入位置索引（可选）
   * @param options.id - 分隔线 ID（可选）
   * @param options.ignore - 是否忽略（可选）
   * @returns HTMLElement - 分隔线元素
   * 
   * @example
   * ```typescript
   * menu.addItem({ label: '项 1', click: () => {} })
   * menu.addSeparator()
   * menu.addItem({ label: '项 2', click: () => {} })
   * ```
   */
  addSeparator(options?: {
    index?: number,
    id?: string,
    ignore?: boolean
  }): HTMLElement;

  /**
   * 打开菜单
   * 
   * @param options - 菜单位置
   * 
   * @example
   * ```typescript
   * // 在鼠标位置打开
   * menu.open({
   *   x: event.clientX,
   *   y: event.clientY
   * })
   * 
   * // 在元素附近打开
   * const rect = element.getBoundingClientRect()
   * menu.open({
   *   x: rect.left,
   *   y: rect.bottom + 5
   * })
   * ```
   */
  open(options: IPosition): void;

  /**
   * 全屏显示菜单
   * 
   * @param position - 位置，'bottom' | 'all'（默认 'all'）
   * 
   * @example
   * ```typescript
   * // 全屏显示（移动端常用）
   * menu.fullscreen('all')
   * 
   * // 底部全屏
   * menu.fullscreen('bottom')
   * ```
   */
  fullscreen(position?: "bottom" | "all"): void;

  /**
   * 关闭菜单
   * 
   * @example
   * ```typescript
   * menu.close()
   * ```
   */
  close(): void;
}

