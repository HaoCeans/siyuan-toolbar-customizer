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

**弹窗与主窗口焦点冲突（hash 路由机制）**：

- **症状**：记事弹窗打开时，主窗口文档树点击今日日记，焦点被切到弹窗而非在主窗口打开日记。

- **根因（Electron 主进程层）**：
  1. 主窗口点击日记 → `openFileById()` 本地没匹配
  2. → `ipcRenderer.invoke("siyuan-open-file", { rootID })` 发到 Electron 主进程
  3. → 主进程 `BrowserWindow.getAllWindows().find(w => w.hash.split("\u200b").includes(rootID))`
  4. → 弹窗的 hash 包含日记 rootID → 匹配 → `w.focus()` ❌

  - hash 来源：`app/src/window/setHeader.ts:22`
    ```typescript
    hash += tab.model.editor.protyle.block.rootID + Constants.ZWSP;
    ```
    弹窗加载的 block 在数据库里 `root_id` = 日记文档 ID，所以 hash 里有日记 ID。

- **修复（`quickNoteBlockWindow.ts` 的 `HASH_FIX_JS`）**：
  ```javascript
  // ① 覆盖 setModelsHash，思源写 hash 的唯一入口
  window.setModelsHash = function() { window.location.hash = ''; };
  // ② 200ms 轮询兜底，防止其他代码直接写 hash
  setInterval(function() {
    if (window.location.hash) window.location.hash = '';
  }, 200);
  ```

- **试过的无效方案**：
  | 方案 | 结果 |
  |------|------|
  | `rootId: fakeRootId`（假 ID） | 内核 API 返回真实 `root_id` 覆盖 |
  | 草稿文档隔离（`__quicknote_draft__`） | 内核仍返回日记 rootID |
  | Dialog + Protyle（同窗口） | 被拒，需要独立 BrowserWindow |
  | `siyuan.layout.center.tabs` 中移除 tab | 不管用，路由在 Electron 主进程层 |

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
