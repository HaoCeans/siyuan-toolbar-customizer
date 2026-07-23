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

### 电脑端底部胶囊的隐藏：JS MutationObserver + inline style

**问题**：一键记事弹窗中，电脑端底部胶囊（悬浮工具栏）需要隐藏。但通过注入 `<style>` 标签设置 `display:none` 无效。

**根因**：
- `executeJavaScript` 注入 `<style>` 的时机是 `did-finish-load`（页面资源加载完毕）
- 但插件自身的 `applyDesktopFloatingToolbar()` 在 SPA 初始化完成后才执行，向 `<head>` 注入 `#desktop-floating-toolbar-style`，它在 `did-finish-load` 之后
- 即使 CSS 选择器特异性更高，如果两方都用了 `!important`，**后注入的样式表覆盖先注入的**——插件的样式总是最后的

**解决方案**（`hideFloatingJS`）：
- 不使用 CSS，而是注入一个 **MutationObserver** 监听 `document.body` 的子节点变化
- 当 `.protyle-breadcrumb` 出现时，直接调用 `el.style.setProperty('display', 'none', 'important')` 设置行内样式
- **行内样式的优先级高于任何样式表**（包括 `!important`），彻底避免 CSS 级联问题
- observer 找到元素后立即 `disconnect()`，并设置 5 秒超时兜底，防止一直监听

```typescript
hideFloatingJS: `(function(){
  var el=document.querySelector('.protyle-breadcrumb');
  if(el){el.style.setProperty('display','none','important');return;}
  var obs=new MutationObserver(function(){
    var el2=document.querySelector('.protyle-breadcrumb');
    if(!el2)return;
    el2.style.setProperty('display','none','important');
    obs.disconnect();
  });
  obs.observe(document.body,{childList:true,subtree:true});
  setTimeout(function(){try{obs.disconnect()}catch(e){}},5000);
})()`,
```

**注入时机**：在 `did-finish-load` 阶段 `_injectScripts` 中执行，与 `hideJS`、`titleJS` 等同级。

**为什么不直接用 CSS 特异性解决**：
之前尝试过 `html body .protyle-breadcrumb[data-input-method]:not(.protyle-breadcrumb__bar)`（特异性 (0,4,2) 对 (0,4,0)），但插件 CSS 在 SPA 初始化后才注入，晚于 `did-finish-load`，CSS 顺序覆盖规则使插件样式胜出。CSS 方式在双向 `!important` 的场景下不可靠，**JS inline style 是唯一保证**。

**关联的配置项**：`desktopFeatureConfig.quickNoteHideFloatingToolbar`（默认 true）

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

---

## 手机端/桌面端底部胶囊滚动隐藏

**文件**：`src/toolbarManager.ts`

**相关函数**：`handleToolbarAutoHideScroll`（手机端）、`handleDesktopToolbarAutoHideScroll`（桌面端）、`refreshToolbarAutoHide`、`refreshDesktopFloatingScrollOnSwitch`、`refreshMobileCapsuleScrollBinding`

### 核心原则

**桌面端和手机端使用完全独立的状态变量**，不得共享：

| 桌面端 | 手机端 | 用途 |
|--------|--------|------|
| `desktopHiddenByScroll` | `toolbarHiddenByScroll` | 当前是否因滚动而隐藏 |
| `desktopLastScrollTop` | `toolbarLastScrollTop` | 上一次滚动位置基准 |
| `desktopAutoHideIgnoreUntil` | `toolbarAutoHideIgnoreUntil` | hide/show 后的静默期截止时间 |
| `desktopAutoHideLastHide/Show` | `toolbarAutoHideLastHide/Show` | 上次隐藏/显示的时间戳 |
| `desktopAutoHidePendingTimer` | `toolbarAutoHidePendingTimer` | 延迟执行隐藏/显示的定时器 |
| `desktopAutoHideForceActive` | `toolbarAutoHideForceActive` | 滚动隐藏开关 |
| `desktopAutoHideCapsuleMode` | `toolbarAutoHideCapsuleMode` | 胶囊布局模式 |

桌面端的 handler `handleDesktopToolbarAutoHideScroll(scrollEl)` 直接接受 HTMLElement 参数（由闭包传入 `desktopFloatingScrollBoundEl`），手机端的 `handleToolbarAutoHideScroll` 接受浏览器传入的 Event 对象，经由 `instanceof HTMLElement` 过滤后落到 `toolbarAutoHideBoundEl`。

### 已知陷阱

#### ① 滚动容器：手机端用 `protyle.contentElement`

所有手机面板（大纲 `mobileOutline.ts`、标签栏 `mobileTabs.ts`、文档导航 `mobileDocNav.ts`）均使用 `protyle.contentElement`（`.protyle-content`）作为滚动容器。

**不要改为 `.protyle-wysiwyg`**。虽然直觉上 `.protyle-wysiwyg` 更像"可滚动区域"，但思源在移动端的滚动容器就是 `.protyle-content`。三个面板都验证过。

#### ② 键盘检测：不要用 viewport 高度阈值

```typescript
// ❌ 错误的做法——80px 阈值在某些设备上（地址栏+底部导航 >80px）永久误判
function isKeyboardOpenForToolbar(): boolean {
  return window.visualViewport.height < window.innerHeight - 80
}

// ✅ 正确的做法——事件驱动（参考 mobileOutline.ts 的 hiddenByKeyboard）
// focusin → hideForKeyboard(), focusout → restoreAfterKeyboard()
// 或直接跳过——胶囊 CSS 已用 data-input-method="open" → display:none 处理键盘遮挡
```

胶囊滚动隐藏模式下（`toolbarAutoHideForceActive === true`）应跳过键盘检测，因为胶囊 CSS 已通过 `data-input-method="open" → display:none` 处理了键盘遮挡场景。

#### ③ 初始化时序竞态：`toolbarHiddenByScroll` 不能先于元素就绪设置

```typescript
// 隐藏分支中必须先检查有没有元素可隐藏
const hideTargets = getToolbarElementsForAutoHide()
if (hideTargets.length === 0) return  // ← 必须！否则标志位设上后永远无法再次触发隐藏
toolbarHiddenByScroll = true
```

**原因**：`initMobileToolbarAdjuster` 中滚动隐藏的启动（`startToolbarScrollBindRetry`）在 `setupToolbarForElement`（设置 `data-toolbar-customized` 属性）之前。用户可能在退避重试成功前滚动，导致 `toolbarHiddenByScroll = true` 但没元素可隐藏，**后续所有滚动都不再进入隐藏分支**，永久卡死。

#### ④ CSS `opacity: 0 !important` 可能被覆盖

`applyToolbarBackgroundColor` 注入的 `.protyle-breadcrumb { opacity: 0.9 !important; }` 虽然特异性低于 `.protyle-breadcrumb.toolbar-scroll-hidden { opacity: 0 !important; }`，但在某些构建/运行时环境下仍然会覆盖。

**最终修复方案**：不用 CSS class，直接在 JS 中用 inline `!important`：

```typescript
// 隐藏
el.style.setProperty('opacity', '0', 'important')

// 显示
el.style.removeProperty('opacity')
```

`inline !important` 的优先级高于任何样式表的 `!important`，彻底避免 CSS 级联问题。`toolbar-scroll-hidden` class 保留用于样式标记（调试时可确认 class 已加上）。

#### ⑤ 切文档时需重绑 scroll 监听

切换文档时，protyle 可能被重建（新的 `.protyle-content`），旧的 scroll 监听器挂在已脱离 DOM 的元素上。

- **桌面端**：`refreshDesktopFloatingScrollOnSwitch()` 在 `switch-protyle` / `loaded-protyle-dynamic` 事件中重绑
- **手机端**：`refreshMobileCapsuleScrollBinding()` 在 `refreshToolbarAutoHide()` 中调用，检查 `getMobileScrollElementForToolbar()` 返回的元素是否与 `toolbarAutoHideBoundEl` 一致，不一致则解绑旧 + 绑定新

```typescript
function refreshMobileCapsuleScrollBinding(): void {
  if (toolbarHiddenByScroll) { /* 恢复可见 */ }
  toolbarLastScrollTop = null
  toolbarAutoHideIgnoreUntil = 0

  const activeEl = getMobileScrollElementForToolbar()
  if (activeEl && activeEl !== toolbarAutoHideBoundEl) {
    // 容器变了 → 解绑旧的，绑定新的
    toolbarAutoHideBoundEl.removeEventListener('scroll', ...)
    toolbarAutoHideBoundEl = null
    bindToolbarAutoHideScroll()
  } else if (activeEl && activeEl === toolbarAutoHideBoundEl) {
    // 同一容器 → 只重置基准
    toolbarLastScrollTop = activeEl.scrollTop
  }
}
```

#### ⑥ 桌面端 tab 轮询不要污染手机端变量

`startDesktopScrollForFloating` 中有一个 1 秒间隔的 `desktopFloatingTabPollTimer`，用于检测活动标签页切换。**不要在这个定时器里写 `toolbarAutoHideBoundEl` 或 `toolbarLastScrollTop`**——它们是手机端变量。桌面端应使用自己的 `desktopFloatingScrollBoundEl` 和 `desktopLastScrollTop`。

### 调试方法

在 `handleToolbarAutoHideScroll` 中已埋入 `[TB-AutoHide]` 前缀的日志，在控制台过滤即可看到完整链路：

| 日志 | 含义 |
|------|------|
| `scrollEvent` | 收到 scroll 事件，显示 forceActive/boundEl/hiddenByScroll |
| `delta: N` | 本次 delta、scrollTop、距上次 hide/show 的时间 |
| `HIDE, targets: N` | 进入隐藏分支，找到 N 个元素 |
| `no targets to hide` | 元素还没就绪（`setupToolbarForElement` 未完成） |
| `applied (bottom), opacity: N` | 已应用隐藏，N 应为 0（否则 CSS 覆盖问题） |
| `SHOW` | 执行显示 |
