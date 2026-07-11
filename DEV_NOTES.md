# 开发注意事项

## 块格式一键记事窗口

### 最终方案：frame:false + executeJavaScript 注入

**文件**：`src/quickNote/quickNoteBlockWindow.ts`

**架构**：
- `new BrowserWindow({ frame: false })` 创建无边框独立窗口
- `win.loadURL(window.html?json={...})` 加载思源原生编辑器
- `win.webContents.executeJavaScript()` 注入 `<style>` 标签隐藏 UI 元素
- `win.webContents.executeJavaScript()` + `Object.defineProperty(document,'title',...)` 锁定标题

**为什么不用 `insertCSS`**：
`@electron/remote` 的 `win.webContents.insertCSS()` 在远程窗口上可能不生效。
改用 `executeJavaScript` 直接往页面 `document.head` 插入 `<style>` 标签，更可靠。

**为什么不用 `frame:true`**：
`frame:true` 有 Windows 原生标题栏，标题文字会被思源页面覆盖显示 "SiYuan Edit Window"。
`Object.defineProperty` 劫持 `document.title` 在 `frame:false` 下配合使用效果更好。

**拖拽实现**：
- 注入一个 `#qn-drag-handle` div（50%宽×36px高，左上角）
- CSS `-webkit-app-region: drag` 使该区域可拖拽窗口
- 避免 `body{-webkit-app-region:drag}` 因为会阻止编辑器内容区的点击

**隐藏的 UI 元素**（记事弹窗内 window.html 的 DOM 结构）：

| # | 元素 | 作用 |
|---|------|------|
| ① | `.layout-tab-bar` | 顶部标签页切换栏 |
| ② | `.protyle-title` | 文档标题区 |
| ③ | `.protyle-background` | 编辑器背景装饰 |
| ④ | `.protyle-breadcrumb` | 面包屑导航（目录路径，受「开关工具栏」控制显隐） |
| ⑤ | `.protyle-scroll` | 编辑器滚动条 |
| ⑥ | `#status` | 底部状态栏（字数、同步等） |
| ⑦ | `.protyle-wysiwyg` | 编辑器输入区（**不隐藏**——用户输入区域） |

HIDE_CSS 常量：
- `BASE_HIDE`：①~③+⑤⑥ 始终隐藏
- `BREADCRUMB_HIDE`：④ 条件隐藏（开关工具栏关闭时）
- `BREADCRUMB_SHOW`：④ 条件显示 + `margin-top:25px`（开关工具栏打开时）

**保留的按钮**（用于窗口控制）：
- `.toolbar__window` / `#pinWindow` / `#minWindow` / `#maxWindow` / `#restoreWindow` / `#closeWindow`

**防重复窗口**：
- 每个 toggle 先遍历 `getAllWindows()` 找 `qnWinId` 匹配的窗口
- 找到 → show/hide，找不到 → 创建
- 创建前先 destroy 所有同标题旧窗口

**已移除的功能**（不稳定）：
- 后台常驻（close→hide） - `@electron/remote` 代理失效导致窗口叠加
- 预创建 - 与 toggle 竞态创建多个窗口

**快捷键隐藏后自动清理方案**：

- 窗口**不销毁**，进程常驻。隐藏后 X 秒（可配置 `desktopFeatureConfig.quickNoteBlockAutoCleanup`，默认 5 秒，0=不清理）自动执行：
  1. `createQuickNoteDraftBlock` 创建新空草稿块（旧块不删，WebSocket 已把内容同步到内核，旧块即用户笔记）
  2. `fetchSyncPost('/api/filetree/getDoc')` 拿新块 HTML
  3. `executeJavaScript` 把 `.protyle-wysiwyg` 的 `innerHTML` 替换为新块内容，同时更新 Protyle 内部 `block.id` / `block.rootID`
- 为何不 `win.loadURL` 重载：重载时 `window.html` 可能恢复标签状态导致加载整个文档而非单块
- 为何不 `win.destroy` 重建：销毁重建需起新渲染进程，打开慢（~1s）；替换内容毫秒级
- 5 秒内再摁快捷键 → 取消定时器 → `w.show()` 恢复编辑

**弹窗与主窗口焦点冲突（hash 路由 + 僵尸窗口）**：

- **症状**：一旦打开过记事弹窗，主窗口文档树点击日记文档完全无反应，只有重启思源才能恢复。

- **根因（两层）**：

  ① **hash 路由**（Electron 主进程层）：
  1. 主窗口点击日记 → `openFileById()` 本地没匹配
  2. → `ipcRenderer.invoke("siyuan-open-file", { rootID })` 发到 Electron 主进程
  3. → 主进程 `BrowserWindow.getAllWindows().find(w => w.hash.split("\u200b").includes(rootID))`
  4. 弹窗加载的 block 在数据库里 `root_id` = 日记文档 ID，所以 hash 里有日记 ID
  5. → 匹配 → `w.focus()` 切到弹窗 ❌

  ② **僵尸窗口累积**（主因）：
  - 每次打开记事弹窗创建 BrowserWindow，关闭时用 `getTitle() === '⚡ 快捷记事'` 匹配销毁
  - 但思源会覆盖窗口标题为 `日期） - 工作空间 - 思源笔记`，`getTitle()` 永远匹配不上
  - 旧窗口从未被销毁，hash 里仍带着日记 ID
  - 主进程遍历所有窗口时匹配到僵尸窗口 → 日记永远打不开

- **最终修复**（`quickNoteBlockWindow.ts`）：

  ① **hash 拦截**（`HASH_FIX_JS`）：
  - `window.setModelsHash` 不存在（`typeof=undefined`），hash 是直接写 `location.hash` 的
  - 改为 `Object.defineProperty` 拦截 `window.location.hash` 的 setter，所有写入都变空字符串
  - 50ms 轮询兜底
  ```javascript
  var desc = Object.getOwnPropertyDescriptor(window.location.__proto__, 'hash');
  Object.defineProperty(window.location, 'hash', {
    get: desc.get,
    set: function(v) { desc.set.call(this, ''); }  // 永远写空
  });
  ```

  ② **僵尸窗口清理**（`destroyAllBlockWindows()`）：
  - 创建窗口时打标记 `win.__qn_block_window = true`
  - 清理时遍历所有窗口，检查 `__qn_block_window` 标记 → 销毁
  - 插件启动时（`onLayoutReady`）调用一次，清理上次残留的僵尸窗口

- **试过的无效方案**：
  | 方案 | 结果 |
  |------|------|
  | `rootId: fakeRootId`（假 ID） | 内核 API 返回真实 `root_id` 覆盖 |
  | 覆盖 `window.setModelsHash` | 该函数不存在（`typeof=undefined`），hash 是直接写的 |
  | 200ms 轮询清空 hash | 有空窗期，且根本问题是僵尸窗口 |
  | `getTitle()` 匹配销毁旧窗口 | 思源覆盖了窗口标题，永远匹配不上 |
  | Dialog + Protyle（同窗口） | 需要独立 BrowserWindow（副屏、拖拽等） |

---

## 手机端顶部工具栏 → #status 上漂问题

**症状**：手机端选择「工具栏位置 → 顶部固定」后，底部状态栏 `#status`（含"执行数据库索引提交"等内核进度消息）漂移到屏幕顶部 y=0。

**根因**：**非插件问题，是第三方主题 CSS 冲突**。切换回思源默认主题即恢复正常。

**排查过程**：
- 尝试 CSS `display:none` → 不生效
- 尝试 JS inline style 固定定位 → 不生效
- 最终发现是主题的 CSS 规则覆盖导致

**规则**：
- 用户反馈 `#status` 位置异常时，先让用户切换默认主题排查
- 不要改动 `toolbarManager.ts` 中顶部模式的布局逻辑去迁就主题 bug
- `closed` 事件监听 - preventDefault 后仍然触发

---

## 工具栏预览模块（设置面板内所见即所得）

**文件**：`src/ui/toolbarPreview.ts`

**背景**：在电脑端和手机端的设置面板"添加新按钮"上方，增加一个模拟真实工具栏的预览视图，支持直接拖动按钮重排序。

### 设计原则

1. **预览只读 overflowLevel**——直接读取按钮的 `overflowLevel` 字段，不重新计算分层
2. **拖动只改 sort，不 saveData**——拖完只改内存数组的 sort 值，点"确定"才统一保存+reloadUI
3. **电脑端和手机端共享**——同一个 `createToolbarPreview` 函数，`isMobile` 参数控制布局样式

### 排序方向

真实工具栏的排序方向：

- `createButtonsForEditors` 用 `b.sort - a.sort` **降序**排列
- 逐个 `insertAdjacentElement('beforebegin', readonlyBtn)` 插入
- 最终视觉：**sort 越大越靠左，sort 越小越靠右**（紧挨锁定按钮）
- 预览必须使用同样的降序排序，否则与真实工具栏左右相反

关键代码（`toolbarManager.ts:1504-1507`）：
```typescript
const buttonsToAdd = configs
  .filter(button => shouldShowButton(button) && shouldShowInMainToolbar(button))
  .sort((a, b) => b.sort - a.sort) // 降序
```

### overflowLevel 的保存与读取

- 手机端真实工具栏渲染时，`calculateButtonOverflow` 根据屏幕宽度计算每个按钮的 overflowLevel
- 计算结果**直接写回按钮对象的 overflowLevel 属性**，随 `saveData` 持久化
- 设置面板打开时，直接从加载的配置中读取 `button.overflowLevel`
- **不要在预览或设置面板中重新计算 overflowLevel**——手机端算好的值就是最终结果

### 踩坑记录

#### ① `calculateButtonOverflow` 在 DOM 不可用时重置 overflowLevel

**症状**：桌面端设置面板中，手机端按钮列表全部显示"· 常见"（overflowLevel=0），但手机端设置显示"第1层"（正确）。

**根因**：`calculateButtonOverflow` 内部调 `getToolbarAvailableWidth()` 读取 `.protyle-breadcrumb` 宽度。桌面端没有这个 DOM 元素，返回 0 → `mainAvailableWidth <= 0` → 全部 overflowLevel=0。

**修复**（`toolbarManager.ts:642`）：
```typescript
// 改前：DOM 不可用时全部归零，覆盖了手机端保存的正确值
return buttons.map(btn => ({ ...btn, overflowLevel: 0 }))

// 改后：DOM 不可用时保留原有值
return buttons.map(btn => ({ ...btn, overflowLevel: btn.overflowLevel ?? 0 }))
```

#### ② 预览缩放因子依赖 clientWidth（需在 DOM 挂载后计算）

**症状**：预览创建时按钮按真实尺寸渲染，超出预览容器边框被裁剪。

**根因**：`createToolbarPreview` 构造函数内首次 `render()` 时，root 元素尚未 `appendChild` 到 DOM，`root.clientWidth` 为 0，缩放因子计算被跳过。

**修复**：在 `appendChild(previewEl)` 后立即调用 `previewEl.refresh()`，此时 root 在 DOM 中，`clientWidth` 有效。

#### ③ `isTopMode` 漏解构导致 ReferenceError

**症状**：设置面板完全无法打开（或手机端设置区段空白）。

**根因**：`createToolbarPreview` 中 `const { getButtons, isMobile, onChanged } = opts` 漏了 `isTopMode`，而 `render()` 内访问 `!isTopMode` → ReferenceError，整个 `createActionElement` 崩溃。

**修复**：解构时包含 `isTopMode`。

#### ④ let/const 暂时性死区（TDZ）

**症状**：`ReferenceError: Cannot access 'scaleFactor' before initialization`。

**根因**：`scaleFactor` 用 `let` 声明在滑杆 UI 代码之后，但滑杆创建时访问了 `scaleFactor.toString()` → TDZ。

**修复**：把所有变量声明（`overflowExpanded`、`SCALE_KEY`、`scaleFactor`）移到所有 UI 代码之前。

