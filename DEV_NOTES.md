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
- `closed` 事件监听 - preventDefault 后仍然触发
