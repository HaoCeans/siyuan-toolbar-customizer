# SiYuan API 函数功能注释和使用说明

本文档详细说明了 SiYuan 插件开发中所有可用的 API 函数，包括功能说明、参数说明和使用示例。

---

## 📡 网络请求相关函数

### `fetchPost(url, data?, callback?, headers?)`
**功能：** 发送异步 POST 请求到 SiYuan 后端

**参数：**
- `url: string` - 请求的 URL 路径
- `data?: any` - 请求数据（可选）
- `callback?: (response: IWebSocketData) => void` - 回调函数（可选）
- `headers?: IObject` - 自定义请求头（可选）

**使用示例：**
```typescript
import { fetchPost } from 'siyuan'

// 获取文档树结构
fetchPost('/api/filetree/getDoc', {
  notebook: 'notebook-id',
  path: '/path/to/doc'
}, (response) => {
  if (response.code === 0) {
    console.log('文档数据：', response.data)
  } else {
    console.error('请求失败：', response.msg)
  }
})
```

---

### `fetchSyncPost(url, data?)`
**功能：** 发送同步 POST 请求（返回 Promise）

**参数：**
- `url: string` - 请求的 URL 路径
- `data?: any` - 请求数据（可选）

**返回值：** `Promise<IWebSocketData>`

**使用示例：**
```typescript
import { fetchSyncPost } from 'siyuan'

// 使用 async/await 方式
async function getNotebooks() {
  try {
    const response = await fetchSyncPost('/api/notebook/lsNotebooks', {})
    if (response.code === 0) {
      console.log('笔记本列表：', response.data)
    }
  } catch (error) {
    console.error('请求错误：', error)
  }
}
```

---

### `fetchGet(url, callback)`
**功能：** 发送异步 GET 请求

**参数：**
- `url: string` - 请求的 URL 路径
- `callback: (response: IWebSocketData) => void` - 回调函数

**使用示例：**
```typescript
import { fetchGet } from 'siyuan'

fetchGet('/api/system/getVersion', (response) => {
  console.log('SiYuan 版本：', response.data)
})
```

---

## 🪟 窗口和标签页管理

### `openWindow(options)`
**功能：** 打开新窗口

**参数：**
```typescript
{
  position?: { x: number, y: number },  // 窗口位置
  height?: number,                       // 窗口高度
  width?: number,                        // 窗口宽度
  tab?: Tab,                             // 标签页对象
  doc?: { id: string }                   // 文档块 ID
}
```

**使用示例：**
```typescript
import { openWindow } from 'siyuan'

// 在新窗口中打开文档
openWindow({
  width: 1200,
  height: 800,
  doc: {
    id: '20231201123456-abcdef'  // 文档块 ID
  }
})
```

---

### `openTab(options)`
**功能：** 打开新标签页（支持文档、PDF、资源、搜索、卡片等）

**参数：**
```typescript
{
  app: App,                              // App 实例
  doc?: {                                // 打开文档
    id: string,                          // 块 ID
    action?: TProtyleAction[],           // 编辑器操作
    zoomIn?: boolean                     // 是否缩放
  },
  pdf?: {                                // 打开 PDF
    path: string,                        // PDF 路径
    page?: number,                       // 页码
    id?: string                          // 文件注释 ID
  },
  asset?: {                              // 打开资源
    path: string
  },
  search?: Config.IUILayoutTabSearchConfig,  // 打开搜索
  card?: {                               // 打开卡片
    type: 'doc' | 'notebook' | 'all',
    id?: string,
    title?: string
  },
  custom?: {                             // 自定义标签页
    id: string,                          // 插件名称+页签类型
    icon: string,
    title: string,
    data?: any
  },
  position?: 'right' | 'bottom',        // 标签页位置
  keepCursor?: boolean,                  // 是否跳转到新标签页
  removeCurrentTab?: boolean,            // 是否移除当前标签页
  openNewTab?: boolean,                  // 是否使用新标签页打开
  afterOpen?: () => void                // 打开后回调
}
```

**返回值：** `Promise<Tab>`

**使用示例：**
```typescript
import { openTab } from 'siyuan'

// 打开文档标签页
const tab = await openTab({
  app: this.app,
  doc: {
    id: '20231201123456-abcdef',
    zoomIn: true
  },
  position: 'right',
  afterOpen: () => {
    console.log('文档已打开')
  }
})

// 打开搜索标签页
await openTab({
  app: this.app,
  search: {
    k: '关键词'
  }
})
```

---

### `openMobileFileById(app, id, action?)`
**功能：** 在移动端按 ID 打开文件

**参数：**
- `app: App` - App 实例
- `id: string` - 文件块 ID
- `action?: TProtyleAction[]` - 编辑器操作（可选）

**使用示例：**
```typescript
import { openMobileFileById } from 'siyuan'

// 在移动端打开文档
openMobileFileById(this.app, '20231201123456-abcdef')
```

---

## 🔧 系统信息函数

### `getFrontend()`
**功能：** 获取当前前端运行环境类型

**返回值：** `'desktop' | 'desktop-window' | 'mobile' | 'browser-desktop' | 'browser-mobile'`

**使用示例：**
```typescript
import { getFrontend } from 'siyuan'

const frontend = getFrontend()
console.log('当前环境：', frontend)

if (frontend === 'mobile' || frontend === 'browser-mobile') {
  console.log('这是移动端环境')
}
```

---

### `getBackend()`
**功能：** 获取后端平台类型

**返回值：** `'windows' | 'linux' | 'darwin' | 'docker' | 'android' | 'ios' | 'harmony'`

**使用示例：**
```typescript
import { getBackend } from 'siyuan'

const backend = getBackend()
console.log('后端平台：', backend)

if (backend === 'windows') {
  console.log('运行在 Windows 系统')
}
```

---

### `getAllEditor()`
**功能：** 获取所有编辑器实例

**返回值：** `Protyle[]` - 编辑器实例数组

**使用示例：**
```typescript
import { getAllEditor } from 'siyuan'

const editors = getAllEditor()
console.log('当前打开的编辑器数量：', editors.length)

editors.forEach((editor, index) => {
  console.log(`编辑器 ${index + 1}：`, editor)
})
```

---

### `getAllModels()`
**功能：** 获取所有模型实例

**返回值：** 包含各种模型的对象

**使用示例：**
```typescript
import { getAllModels } from 'siyuan'

const models = getAllModels()
console.log('编辑器模型：', models.editor)
console.log('图谱模型：', models.graph)
console.log('资源模型：', models.asset)
```

---

### `getModelByDockType(type)`
**功能：** 根据 Dock 类型获取对应的模型

**参数：**
- `type: TDock | string` - Dock 类型（'file' | 'outline' | 'inbox' | 'bookmark' | 'tag' | 'graph' | 'globalGraph' | 'backlink'）

**返回值：** `Model | any`

**使用示例：**
```typescript
import { getModelByDockType } from 'siyuan'

// 获取文件树模型
const fileModel = getModelByDockType('file')
console.log('文件树模型：', fileModel)
```

---

## 💬 对话框和消息

### `confirm(title, text, confirmCallback?, cancelCallback?)`
**功能：** 显示确认对话框

**参数：**
- `title: string` - 对话框标题
- `text: string` - 对话框内容
- `confirmCallback?: (dialog: Dialog) => void` - 确认回调（可选）
- `cancelCallback?: (dialog: Dialog) => void` - 取消回调（可选）

**使用示例：**
```typescript
import { confirm } from 'siyuan'

confirm(
  '确认删除',
  '确定要删除这个文档吗？此操作不可恢复。',
  (dialog) => {
    console.log('用户点击了确认')
    // 执行删除操作
    dialog.destroy()
  },
  (dialog) => {
    console.log('用户点击了取消')
    dialog.destroy()
  }
)
```

---

### `showMessage(text, timeout?, type?, id?)`
**功能：** 显示消息提示

**参数：**
- `text: string` - 消息内容
- `timeout?: number` - 显示时长（毫秒）
  - `0`: 手动关闭
  - `-1`: 一直显示
  - `6000`: 默认 6 秒
- `type?: 'info' | 'error'` - 消息类型（默认 'info'）
- `id?: string` - 消息 ID（可选，用于更新已有消息）

**使用示例：**
```typescript
import { showMessage } from 'siyuan'

// 显示信息提示
showMessage('操作成功！', 3000, 'info')

// 显示错误提示
showMessage('操作失败：文件不存在', 5000, 'error')

// 显示永久提示（需要手动关闭）
showMessage('正在处理中...', -1, 'info', 'processing-msg')

// 更新已有消息
showMessage('处理完成！', 3000, 'info', 'processing-msg')
```

---

## 🔐 系统控制函数

### `lockScreen(app)`
**功能：** 锁定屏幕

**参数：**
- `app: App` - App 实例

**使用示例：**
```typescript
import { lockScreen } from 'siyuan'

// 锁定屏幕
lockScreen(this.app)
```

---

### `exitSiYuan()`
**功能：** 退出 SiYuan 应用

**使用示例：**
```typescript
import { exitSiYuan } from 'siyuan'

// 退出应用（谨慎使用）
exitSiYuan()
```

---

### `openSetting(app)`
**功能：** 打开设置对话框

**参数：**
- `app: App` - App 实例

**返回值：** `Dialog | undefined`

**使用示例：**
```typescript
import { openSetting } from 'siyuan'

// 打开设置
const settingDialog = openSetting(this.app)
if (settingDialog) {
  console.log('设置对话框已打开')
}
```

---

## 🛠️ 工具函数

### `adaptHotkey(hotkey)`
**功能：** 适配快捷键格式（将快捷键转换为系统适配的格式）

**参数：**
- `hotkey: string` - 快捷键字符串

**返回值：** `string` - 适配后的快捷键字符串

**使用示例：**
```typescript
import { adaptHotkey } from 'siyuan'

// 适配快捷键格式
const adapted = adaptHotkey('Ctrl+Shift+A')
console.log('适配后的快捷键：', adapted)
```

---

## 🎨 Plugin 类（插件核心类）

### 生命周期方法

#### `onload()`
**功能：** 插件加载时调用（必须实现）

**使用示例：**
```typescript
export default class MyPlugin extends Plugin {
  async onload() {
    console.log('插件已加载')
    
    // 添加顶部栏按钮
    this.addTopBar({
      icon: 'iconHeart',
      title: '我的按钮',
      callback: () => {
        console.log('按钮被点击')
      }
    })
    
    // 监听事件
    this.eventBus.on('click-editorcontent', (e) => {
      console.log('编辑器被点击', e.detail)
    })
  }
}
```

---

#### `onunload()`
**功能：** 插件卸载时调用（可选实现）

**使用示例：**
```typescript
export default class MyPlugin extends Plugin {
  onunload() {
    console.log('插件正在卸载')
    
    // 清理资源
    if (this.timer) {
      clearInterval(this.timer)
    }
    
    // 取消事件监听
    this.eventBus.off('click-editorcontent', this.handleClick)
  }
}
```

---

#### `onLayoutReady()`
**功能：** 布局就绪时调用（可选实现）

**使用示例：**
```typescript
export default class MyPlugin extends Plugin {
  onLayoutReady() {
    console.log('布局已就绪，可以安全访问 DOM')
    // 在这里可以安全地操作 DOM 元素
  }
}
```

---

#### `uninstall()`
**功能：** 卸载插件时调用（可选实现）

**使用示例：**
```typescript
export default class MyPlugin extends Plugin {
  uninstall() {
    console.log('插件正在被卸载')
    // 清理插件数据、配置等
  }
}
```

---

### UI 组件添加方法

#### `addTopBar(options)`
**功能：** 添加顶部栏按钮

**参数：**
```typescript
{
  icon: string,                          // 图标（支持 SVG ID 或 SVG 标签）
  title: string,                         // 按钮标题
  callback: (event: MouseEvent) => void, // 点击回调
  position?: 'right' | 'left'            // 位置（默认 'right'）
}
```

**返回值：** `HTMLElement` - 创建的按钮元素

**注意：** 必须在同步函数之前执行

**使用示例：**
```typescript
// 在 onload() 中调用
const button = this.addTopBar({
  icon: '<svg>...</svg>',  // 或 'iconHeart'（SVG ID）
  title: '我的功能',
  position: 'right',
  callback: (event) => {
    console.log('顶部栏按钮被点击', event)
    showMessage('按钮被点击了！')
  }
})
```

---

#### `addStatusBar(options)`
**功能：** 添加状态栏元素

**参数：**
```typescript
{
  element: HTMLElement,                 // 要添加的元素
  position?: 'right' | 'left'            // 位置（默认 'right'）
}
```

**返回值：** `HTMLElement` - 添加的元素

**注意：** 必须在同步函数之前执行

**使用示例：**
```typescript
// 创建状态栏元素
const statusElement = document.createElement('div')
statusElement.textContent = '插件已就绪'
statusElement.style.padding = '0 8px'

// 添加到状态栏
this.addStatusBar({
  element: statusElement,
  position: 'left'
})
```

---

#### `addTab(options)`
**功能：** 添加自定义标签页

**参数：**
```typescript
{
  type: string,                         // 标签页类型（唯一标识）
  init: (this: Custom) => void,         // 初始化函数
  beforeDestroy?: (this: Custom) => void,  // 销毁前回调
  destroy?: (this: Custom) => void,     // 销毁回调
  resize?: (this: Custom) => void,      // 调整大小回调
  update?: (this: Custom) => void       // 更新回调
}
```

**返回值：** `() => Custom` - 返回一个函数，调用可获取 Custom 实例

**注意：** 必须在同步函数之前执行

**使用示例：**
```typescript
const getTab = this.addTab({
  type: 'my-custom-tab',
  init() {
    // this 指向 Custom 实例
    this.element.innerHTML = '<div>我的自定义标签页</div>'
  },
  destroy() {
    console.log('标签页正在销毁')
  }
})

// 获取标签页实例
const tab = getTab()
```

---

#### `addDock(options)`
**功能：** 添加 Dock 面板（侧边栏）

**参数：**
```typescript
{
  config: IPluginDockTab,              // Dock 配置
  data: any,                           // 数据
  type: string,                        // 类型标识
  init: (this: Dock, dock: Dock) => void,  // 初始化函数
  destroy?: (this: Dock) => void,      // 销毁回调
  resize?: (this: Dock) => void,       // 调整大小回调
  update?: (this: Dock) => void        // 更新回调
}
```

**返回值：** `{ config: IPluginDockTab, model: Dock }`

**注意：** 必须在同步函数之前执行

**使用示例：**
```typescript
const { config, model } = this.addDock({
  config: {
    position: 'LeftTop',
    size: { width: 200, height: 300 },
    icon: 'iconHeart',
    title: '我的 Dock',
    hotkey: '⌥⇧⌘D'
  },
  data: {},
  type: 'my-dock',
  init(dock) {
    dock.element.innerHTML = '<div>我的 Dock 面板</div>'
  }
})
```

---

### 命令和菜单

#### `addCommand(options)`
**功能：** 添加快捷键命令

**参数：** `ICommand` 对象
```typescript
{
  langKey: string,                     // 命令标识（用于 i18n）
  langText?: string,                   // 显示文本（覆盖 i18n）
  hotkey: string,                      // 快捷键（MacOS 符号格式，如 '⌥⇧⌘A'）
  customHotkey?: string,               // 自定义快捷键
  callback?: () => void,               // 通用回调
  globalCallback?: () => void,         // 全局回调（焦点不在应用内）
  fileTreeCallback?: (file: Files) => void,  // 文档树回调
  editorCallback?: (protyle: IProtyle) => void,  // 编辑器回调
  dockCallback?: (element: HTMLElement) => void   // Dock 回调
}
```

**快捷键符号说明：**
- `⌘` = Ctrl (Windows) / Cmd (Mac)
- `⇧` = Shift
- `⌥` = Alt / Option
- `⌫` = Backspace
- `⌦` = Delete
- `↩` = Enter
- `⇥` = Tab

**使用示例：**
```typescript
this.addCommand({
  langKey: 'my-command',
  langText: '我的命令',
  hotkey: '⌥⇧⌘M',
  editorCallback: (protyle) => {
    console.log('在编辑器中执行命令', protyle)
    showMessage('命令已执行')
  },
  fileTreeCallback: (file) => {
    console.log('在文档树中执行命令', file)
  }
})
```

---

#### `updateProtyleToolbar(toolbar)`
**功能：** 更新编辑器工具栏

**参数：**
- `toolbar: Array<string | IMenuItem>` - 工具栏项数组

**返回值：** `Array<string | IMenuItem>` - 更新后的工具栏数组

**使用示例：**
```typescript
// 自定义工具栏
const customToolbar = [
  'bold',
  'italic',
  '|',  // 分隔符
  {
    icon: 'iconHeart',
    title: '自定义按钮',
    click: () => {
      console.log('自定义按钮被点击')
    }
  }
]

this.updateProtyleToolbar(customToolbar)
```

---

### 数据存储

#### `loadData(storageName)`
**功能：** 加载插件数据

**参数：**
- `storageName: string` - 存储名称

**返回值：** `Promise<any>`

**使用示例：**
```typescript
async loadMyData() {
  try {
    const data = await this.loadData('my-plugin-data')
    if (data) {
      console.log('加载的数据：', data)
    } else {
      console.log('没有保存的数据')
    }
  } catch (error) {
    console.error('加载数据失败：', error)
  }
}
```

---

#### `saveData(storageName, content)`
**功能：** 保存插件数据

**参数：**
- `storageName: string` - 存储名称
- `content: any` - 要保存的内容

**返回值：** `Promise<void>`

**使用示例：**
```typescript
async saveMyData() {
  const data = {
    setting1: 'value1',
    setting2: 'value2',
    timestamp: Date.now()
  }
  
  try {
    await this.saveData('my-plugin-data', data)
    showMessage('数据已保存', 2000, 'info')
  } catch (error) {
    console.error('保存数据失败：', error)
    showMessage('保存失败', 3000, 'error')
  }
}
```

---

#### `removeData(storageName)`
**功能：** 删除插件数据

**参数：**
- `storageName: string` - 存储名称

**返回值：** `Promise<any>`

**使用示例：**
```typescript
async clearMyData() {
  try {
    await this.removeData('my-plugin-data')
    showMessage('数据已清除', 2000, 'info')
  } catch (error) {
    console.error('删除数据失败：', error)
  }
}
```

---

### 其他功能

#### `addIcons(svg)`
**功能：** 添加 SVG 图标

**参数：**
- `svg: string` - SVG 字符串

**使用示例：**
```typescript
const svgIcon = `
<svg id="iconMyIcon" viewBox="0 0 24 24">
  <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
</svg>
`

this.addIcons(svgIcon)

// 之后可以在其他地方使用
this.addTopBar({
  icon: 'iconMyIcon',  // 使用添加的图标 ID
  title: '我的按钮',
  callback: () => {}
})
```

---

#### `getOpenedTab()`
**功能：** 获取已打开的标签页

**返回值：** `{ [key: string]: Custom[] }` - 按类型分组的标签页对象

**使用示例：**
```typescript
const openedTabs = this.getOpenedTab()
console.log('已打开的标签页：', openedTabs)

// 遍历所有标签页
Object.keys(openedTabs).forEach(type => {
  console.log(`类型 ${type} 的标签页：`, openedTabs[type])
})
```

---

#### `addFloatLayer(options)`
**功能：** 添加浮动层（用于显示引用块）

**参数：**
```typescript
{
  refDefs: IRefDefs[],                  // 引用定义数组
  x?: number,                          // X 坐标
  y?: number,                          // Y 坐标
  targetElement?: HTMLElement,         // 目标元素
  originalRefBlockIDs?: IObject,       // 原始引用块 ID
  isBacklink: boolean                  // 是否为反向链接
}
```

**使用示例：**
```typescript
this.addFloatLayer({
  refDefs: [
    {
      defID: 'block-id',
      defPath: '/path/to/doc',
      blockRefText: '引用文本'
    }
  ],
  x: 100,
  y: 200,
  isBacklink: false
})
```

---

#### `updateCards(options)`
**功能：** 更新卡片数据

**参数：**
- `options: ICardData` - 卡片数据

**返回值：** `Promise<ICardData> | ICardData`

**使用示例：**
```typescript
const cardData = {
  cards: [
    {
      deckID: 'deck-id',
      cardID: 'card-id',
      blockID: 'block-id',
      nextDues: {},
      lapses: 0,
      lastReview: Date.now(),
      reps: 1,
      state: 0
    }
  ],
  unreviewedCount: 1,
  unreviewedNewCardCount: 1,
  unreviewedOldCardCount: 0
}

await this.updateCards(cardData)
```

---

#### `openSetting()`
**功能：** 打开插件设置面板

**使用示例：**
```typescript
this.openSetting()

// 或者自定义设置
openSetting() {
  const setting = new Setting({
    width: '600px',
    height: '400px',
    confirmCallback: () => {
      // 保存设置
      this.saveData('settings', this.settings)
    }
  })
  
  setting.addItem({
    title: '设置项 1',
    description: '这是设置说明',
    actionElement: createInput()
  })
}
```

---

## 🎭 Dialog 类（对话框）

### `constructor(options)`
**功能：** 创建对话框

**参数：**
```typescript
{
  positionId?: string,                 // 位置 ID
  title?: string,                       // 标题
  transparent?: boolean,                // 是否透明
  content: string,                      // 内容（HTML）
  width?: string,                       // 宽度
  height?: string,                      // 高度
  destroyCallback?: (options?: IObject) => void,  // 销毁回调
  disableClose?: boolean,               // 是否禁用关闭
  hideCloseIcon?: boolean,              // 是否隐藏关闭图标
  disableAnimation?: boolean,           // 是否禁用动画
  resizeCallback?: (type: string) => void  // 调整大小回调
}
```

**使用示例：**
```typescript
import { Dialog } from 'siyuan'

const dialog = new Dialog({
  title: '我的对话框',
  content: '<div>这是对话框内容</div>',
  width: '500px',
  height: '300px',
  destroyCallback: () => {
    console.log('对话框已关闭')
  }
})

// 访问对话框元素
dialog.element.style.border = '1px solid #ccc'

// 访问编辑器（如果对话框中有编辑器）
if (dialog.editors) {
  Object.keys(dialog.editors).forEach(key => {
    console.log('编辑器：', dialog.editors[key])
  })
}
```

---

### `destroy(options?)`
**功能：** 销毁对话框

**参数：**
- `options?: IObject` - 选项（可选）

**使用示例：**
```typescript
dialog.destroy()
// 或
dialog.destroy({ remove: true })
```

---

### `bindInput(inputElement, enterEvent?)`
**功能：** 绑定输入框回车事件

**参数：**
- `inputElement: HTMLInputElement | HTMLTextAreaElement` - 输入框元素
- `enterEvent?: () => void` - 回车事件回调（可选）

**使用示例：**
```typescript
const input = document.createElement('input')
input.type = 'text'
input.placeholder = '请输入内容'

dialog.bindInput(input, () => {
  console.log('用户按了回车，输入值：', input.value)
  // 处理输入
  dialog.destroy()
})

dialog.element.appendChild(input)
```

---

## ⚙️ Setting 类（设置）

### `constructor(options)`
**功能：** 创建设置面板

**参数：**
```typescript
{
  height?: string,                      // 高度
  width?: string,                       // 宽度
  destroyCallback?: () => void,         // 销毁回调
  confirmCallback?: () => void          // 确认回调
}
```

**使用示例：**
```typescript
import { Setting } from 'siyuan'

const setting = new Setting({
  width: '600px',
  height: '400px',
  confirmCallback: () => {
    console.log('用户点击了确认')
    // 保存设置
  },
  destroyCallback: () => {
    console.log('设置面板已关闭')
  }
})
```

---

### `addItem(options)`
**功能：** 添加设置项

**参数：**
```typescript
{
  title: string,                        // 标题
  direction?: 'column' | 'row',        // 方向（默认 'row'）
  description?: string,                 // 描述
  actionElement?: HTMLElement,         // 操作元素
  createActionElement?: () => HTMLElement  // 创建操作元素的函数
}
```

**使用示例：**
```typescript
// 方式 1：直接提供元素
const checkbox = document.createElement('input')
checkbox.type = 'checkbox'
checkbox.checked = true

setting.addItem({
  title: '启用功能',
  description: '是否启用此功能',
  actionElement: checkbox
})

// 方式 2：使用创建函数
setting.addItem({
  title: '选择选项',
  description: '请选择一个选项',
  createActionElement: () => {
    const select = document.createElement('select')
    select.innerHTML = `
      <option value="1">选项 1</option>
      <option value="2">选项 2</option>
    `
    return select
  }
})
```

---

### `open(name)`
**功能：** 打开设置面板

**参数：**
- `name: string` - 设置面板名称

**使用示例：**
```typescript
setting.open('my-settings')
```

---

## 📡 EventBus 类（事件总线）

### `on(type, listener)`
**功能：** 监听事件

**参数：**
- `type: K` - 事件类型（TEventBus 的键）
- `listener: (event: CustomEvent<D>) => any` - 事件监听器

**使用示例：**
```typescript
// 监听编辑器点击事件
this.eventBus.on('click-editorcontent', (e) => {
  console.log('编辑器被点击', e.detail.protyle)
})

// 监听粘贴事件
this.eventBus.on('paste', (e) => {
  console.log('粘贴内容：', e.detail.textPlain)
  // 可以修改粘贴内容
})
```

---

### `once(type, listener)`
**功能：** 监听一次事件（触发后自动移除）

**参数：**
- `type: K` - 事件类型
- `listener: (event: CustomEvent<D>) => any` - 事件监听器

**使用示例：**
```typescript
// 只监听一次编辑器加载完成事件
this.eventBus.once('loaded-protyle-static', (e) => {
  console.log('编辑器已加载（只触发一次）', e.detail.protyle)
})
```

---

### `off(type, listener)`
**功能：** 取消事件监听

**参数：**
- `type: K` - 事件类型
- `listener: (event: CustomEvent<D>) => any` - 要移除的监听器

**使用示例：**
```typescript
const handler = (e) => {
  console.log('事件触发', e.detail)
}

// 添加监听
this.eventBus.on('click-editorcontent', handler)

// 移除监听
this.eventBus.off('click-editorcontent', handler)
```

---

### `emit(type, detail?)`
**功能：** 触发事件

**参数：**
- `type: K` - 事件类型
- `detail?: D` - 事件详情（可选）

**返回值：** `boolean` - 是否成功触发

**使用示例：**
```typescript
// 触发自定义事件（如果已定义）
this.eventBus.emit('my-custom-event', {
  data: 'some data'
})
```

---

## 🍔 Menu 类（菜单）

### `constructor(id?, closeCB?)`
**功能：** 创建菜单

**参数：**
- `id?: string` - 菜单 ID（可选）
- `closeCB?: () => void` - 关闭回调（可选）

**使用示例：**
```typescript
import { Menu } from 'siyuan'

const menu = new Menu('my-menu', () => {
  console.log('菜单已关闭')
})
```

---

### `addItem(option)`
**功能：** 添加菜单项

**参数：**
- `option: IMenu` - 菜单项配置

**返回值：** `HTMLElement` - 创建的菜单项元素

**使用示例：**
```typescript
menu.addItem({
  icon: 'iconHeart',
  label: '菜单项 1',
  click: () => {
    console.log('菜单项 1 被点击')
    menu.close()
  }
})

menu.addItem({
  icon: 'iconSettings',
  label: '菜单项 2',
  type: 'submenu',
  submenu: [
    {
      icon: 'iconEdit',
      label: '子菜单项 1',
      click: () => {
        console.log('子菜单项 1 被点击')
      }
    }
  ]
})
```

---

### `addSeparator(options?)`
**功能：** 添加分隔线

**参数：**
```typescript
{
  index?: number,                      // 插入位置索引
  id?: string,                         // 分隔线 ID
  ignore?: boolean                     // 是否忽略
}
```

**返回值：** `HTMLElement` - 分隔线元素

**使用示例：**
```typescript
menu.addItem({ label: '项 1', click: () => {} })
menu.addSeparator()  // 添加分隔线
menu.addItem({ label: '项 2', click: () => {} })
```

---

### `open(options)`
**功能：** 打开菜单

**参数：**
- `options: IPosition` - 菜单位置

**使用示例：**
```typescript
import { Menu, IPosition } from 'siyuan'

// 在鼠标位置打开
menu.open({
  x: event.clientX,
  y: event.clientY
})

// 在元素附近打开
const element = document.querySelector('.target')
const rect = element.getBoundingClientRect()
menu.open({
  x: rect.left,
  y: rect.bottom + 5
})
```

---

### `fullscreen(position?)`
**功能：** 全屏显示菜单

**参数：**
- `position?: 'bottom' | 'all'` - 位置（默认 'all'）

**使用示例：**
```typescript
// 全屏显示菜单（移动端常用）
menu.fullscreen('all')

// 底部全屏
menu.fullscreen('bottom')
```

---

### `close()`
**功能：** 关闭菜单

**使用示例：**
```typescript
menu.close()
```

---

### `showSubMenu(subMenuElement)`
**功能：** 显示子菜单

**参数：**
- `subMenuElement: HTMLElement` - 子菜单元素

**使用示例：**
```typescript
const submenuElement = document.createElement('div')
// ... 构建子菜单内容
menu.showSubMenu(submenuElement)
```

---

## 📋 常用事件类型

### 编辑器相关事件

- `click-editorcontent` - 点击编辑器内容
- `click-blockicon` - 点击块图标
- `click-editortitleicon` - 点击编辑器标题图标
- `loaded-protyle-static` - 编辑器静态加载完成
- `loaded-protyle-dynamic` - 编辑器动态加载完成
- `switch-protyle` - 切换编辑器
- `destroy-protyle` - 销毁编辑器

### 菜单相关事件

- `open-menu-content` - 打开内容菜单
- `open-menu-blockref` - 打开块引用菜单
- `open-menu-image` - 打开图片菜单
- `open-menu-link` - 打开链接菜单
- `open-menu-tag` - 打开标签菜单
- `open-menu-doctree` - 打开文档树菜单

### 其他事件

- `paste` - 粘贴事件
- `ws-main` - WebSocket 主消息
- `sync-start` - 同步开始
- `sync-end` - 同步结束
- `sync-fail` - 同步失败
- `lock-screen` - 锁定屏幕
- `mobile-keyboard-show` - 移动端键盘显示
- `mobile-keyboard-hide` - 移动端键盘隐藏

---

## 💡 完整示例

### 示例 1：创建一个简单的插件

```typescript
import { Plugin, showMessage, fetchSyncPost } from 'siyuan'

export default class MyPlugin extends Plugin {
  async onload() {
    // 添加顶部栏按钮
    this.addTopBar({
      icon: 'iconHeart',
      title: '我的插件',
      callback: async () => {
        // 获取笔记本列表
        const response = await fetchSyncPost('/api/notebook/lsNotebooks', {})
        if (response.code === 0) {
          showMessage(`找到 ${response.data.length} 个笔记本`, 3000, 'info')
        }
      }
    })
    
    // 监听编辑器点击
    this.eventBus.on('click-editorcontent', (e) => {
      console.log('编辑器被点击', e.detail.protyle)
    })
  }
  
  onunload() {
    console.log('插件已卸载')
  }
}
```

### 示例 2：使用数据存储

```typescript
export default class MyPlugin extends Plugin {
  async onload() {
    // 加载保存的数据
    const savedData = await this.loadData('my-settings')
    if (savedData) {
      console.log('加载的设置：', savedData)
    }
    
    // 添加设置按钮
    this.addTopBar({
      icon: 'iconSettings',
      title: '设置',
      callback: () => {
        this.openSetting()
      }
    })
  }
  
  openSetting() {
    const setting = new Setting({
      width: '500px',
      height: '300px',
      confirmCallback: async () => {
        // 保存设置
        await this.saveData('my-settings', {
          option1: true,
          option2: 'value'
        })
        showMessage('设置已保存', 2000, 'info')
      }
    })
    
    setting.addItem({
      title: '选项 1',
      description: '这是选项 1 的说明',
      createActionElement: () => {
        const checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        return checkbox
      }
    })
  }
}
```

### 示例 3：添加快捷键命令

```typescript
export default class MyPlugin extends Plugin {
  async onload() {
    // 添加快捷键命令
    this.addCommand({
      langKey: 'my-command',
      langText: '执行我的命令',
      hotkey: '⌥⇧⌘M',
      editorCallback: (protyle) => {
        showMessage('在编辑器中执行了命令', 2000, 'info')
        // 可以在这里操作编辑器
      },
      fileTreeCallback: (file) => {
        showMessage('在文档树中执行了命令', 2000, 'info')
        // 可以在这里操作文件树
      }
    })
  }
}
```

---

## 📚 更多资源

- [SiYuan 官方文档](https://b3log.org/siyuan/)
- [SiYuan 插件开发指南](https://github.com/siyuan-note/plugin-sample)
- [SiYuan API 参考](https://github.com/siyuan-note/siyuan)

---

**注意：** 本文档基于 SiYuan 1.1.0 版本，不同版本的 API 可能有所差异，请以实际使用的版本为准。

