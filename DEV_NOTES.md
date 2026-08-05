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

**多窗口快捷键冲突：⌥⇧N 在所有 window.html 中重复触发**：

- **症状**（v3.8.0 修复）：
  1. 打开其他插件的独立窗口（如闲笔 Sketch Note，也是 `window.html`）后
  2. 按 ⌥⇧N 唤起块格式一键记事 → **弹出两个相同弹窗**，再次按快捷键无法 toggle 隐藏

- **根因**：
  SiYuan 的 `addCommand({ globalCallback })` 注册的全局快捷键会在**所有**加载了该插件的窗口中触发 `globalCallback`。本插件 `onload()` 中无条件注册 ⌥⇧N/⌥⇧L 快捷键，不区分主窗口还是子窗口（`window.html`）。当闲笔等窗口打开时，主窗口 + 闲笔窗口同时收到回调 → 各建各的弹窗 → 两个。

- **第二次按快捷键为什么无法隐藏**：
  弹窗创建后获得焦点。再次按 ⌥⇧N 时：主窗口收到回调 → toggle 找到弹窗 → hide；弹窗自身也收到回调 → 但弹窗的 `qnWinId` 为 null → 找不到窗口 → `createOneWindow` → `destroyAllBlockWindows` **跳过自己**（`mainId` = 弹窗自己的 id）→ 新建第二个弹窗。结果：一个 hide、一个新建，视觉上"关不掉"。

- **修复（v3.8.0）**：全局快捷键注册加 `!isInWindow` 守卫：
  ```ts
  // index.ts onload()
  if (!this.isMobile && !this.isInWindow) {
    this.addCommand({ ... })  // 只在主窗口注册，子窗口不注册
  }
  ```
  这样只有主窗口处理快捷键，toggle 逻辑（找到 → show/hide，找不到 → 创建）始终正确运行，不会被多个窗口实例互相干扰。

- **为什么不用 `document.hasFocus()`**：
  `document.hasFocus()` 看似能过滤"非聚焦窗口不执行"，但它有副作用：弹窗获得焦点后，主窗口 `hasFocus() = false` → 主窗口不执行 toggle → 弹窗的 toggle-hide 路径被切断 → 弹窗关不掉。另外 `globalCallback` 设计初衷是思源在后台时也能响应快捷键，`hasFocus()` 会同时阻断后台使用场景。**从源头控制（不让子窗口注册快捷键）是正确解。**

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

## 隐藏原生按钮时菜单定位修正

**文件**：`src/toolbarManager.ts`
**相关函数**：`executeClickSequence`（L3709）、`waitForElement`（L4079）

### 问题背景

思源「更多按钮隐藏」和「文档菜单按钮隐藏」功能通过 CSS 将原生按钮彻底隐藏：
```css
.protyle-breadcrumb__bar button[data-type="more"],
.protyle-breadcrumb button[data-type="more"] {
  transform: scale(0) !important;
  width: 0 !important;
  min-width: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  overflow: hidden !important;
}
```

而插件的默认「更多」和「打开菜单」按钮是 `click-sequence` 类型（`clickSequence: ['more']` / `['doc']`），它找到原生按钮并程序化点击，让思源弹出原生菜单。

埋了三个坑：

### 坑①：`getBoundingClientRect()` 返回 `right=left`

思源的面包屑更多菜单定位代码：
```typescript
// app/src/protyle/breadcrumb/index.ts
const targetRect = target.getBoundingClientRect();
this.showMenu(protyle, {
    x: targetRect.right,   // width=0 → right === left ❌
    y: targetRect.bottom,  // height≠0（CSS 没设 height:0）→ 正常
    isLeft: true,
});
```

原生按钮 `width: 0` 导致 `rect.right = rect.left`，菜单应该出现在按钮右侧，结果出现在左侧边缘（x = left 而非 left + width）。

**修复**（`executeClickSequence` 内 L3764-3794）：
检测到目标按钮是工具栏按钮且 `width === 0`（或被 CSS 隐藏）时，**临时恢复其尺寸**再点：
```typescript
if (needsPositionFix) {
    const pluginRect = clickedButton.getBoundingClientRect()
    // 临时覆盖隐藏样式，只恢复尺寸不改变 position
    element.style.setProperty('transform', 'none', 'important')
    element.style.setProperty('width', `${pluginRect.width}px`, 'important')
    element.style.setProperty('height', `${pluginRect.height}px`, 'important')
    clickElement(element)
    // 立即恢复隐藏（移除 inline 覆盖，CSS !important 重新生效）
    restoredProps.forEach(prop => element.style.removeProperty(prop))
}
```

关键：**不设 `position: fixed`**（见坑②）。

### 坑②：底部胶囊 `transform` 污染 `position: fixed`

底部胶囊工具栏容器使用 `transform: translateX(-50%)` 居中（`toolbarManager.ts:1074`）：
```css
.protyle-breadcrumb[data-input-method]:not(.protyle-breadcrumb__bar) {
  position: fixed !important;
  left: 50% !important;
  transform: translateX(-50%) !important;
}
```

在 CSS 规范中，任何 `transform` 值的祖先元素会成为 `position: fixed` 子元素的**包含块**。如果坑①的修复用了 `position: fixed` 来定位原生按钮，它会相对于胶囊容器而非视口，坐标全部偏移，菜单跑到右下角。

**规则**：永远不要对隐藏的原生按钮设 `position: fixed`，只恢复 `transform` / `width` / `height` 即可——按钮本来就在面包屑工具栏内，位置是天然正确的。

### 坑③：`querySelector` 命中隐藏编辑器的按钮

切换文档时，旧编辑器 `classList.add('fn__none')` 但 DOM 不销毁。`waitForElement` 的 `[data-type="more"]` 查询用 `document.querySelector` 匹配文档顺序的第一个，在 `fn__none` 编辑器内的元素 `getBoundingClientRect()` 返回 `{left:0, top:0, width:0, height:0}` → 菜单跑左上角。

**修复**（L3734-3748）：找到元素后校验是否与插件按钮同属一个 `.protyle`，否则在插件按钮所在编辑器内重新查找：
```typescript
if (clickedButton) {
    const pluginEditor = clickedButton.closest('.protyle')
    if (pluginEditor && !pluginEditor.contains(element)) {
        const scopedEl = pluginEditor.querySelector(
            `#${actualSelector}, [data-id="${actualSelector}"], [data-type="${actualSelector}"]`
        )
        if (scopedEl) element = scopedEl as HTMLElement
    }
}
```

同时 `needsPositionFix` 的触发条件也追加了 `(left===0 && top===0)` 检测，兜住编辑器内也找不到的极端情况。

### 判断坐标有效性的双重保险

```typescript
const nativeRect = element.getBoundingClientRect()
const needsPositionFix = clickedButton &&
    element.matches('.protyle-breadcrumb__bar button, .protyle-breadcrumb button') &&
    (nativeRect.width === 0 ||                  // 被 CSS 隐藏
     (nativeRect.left === 0 && nativeRect.top === 0))  // 在隐藏编辑器内

// 修正前还要验证插件按钮坐标有效
if (pluginRect.width > 0 && pluginRect.left > 0) {
    // 执行修正
} else {
    // 插件按钮坐标也无效 → 直接点击，接受思源自身的定位行为
    clickElement(element)
}
```

### 调用链改动

| 位置 | 改动 | 原因 |
|------|------|------|
| `button.click` 监听器 L2274 | `null` → `button` | 把被点击的插件按钮元素传给调用链 |
| `handleButtonClick` L3106 | 新增 `clickedButton` 参数 | 透传给 `executeClickSequence` |
| `executeClickSequence` L3709 | 新增 `clickedButton?` 参数 | 位置修正和编辑器限定都需要它 |

---

## 血泪教训

### 教训 1：别在 scroll 处理器里动缓存（P3 翻车）

**文件**：`src/toolbarManager.ts`
**提交**：`86041f8`（已回退 `6b19a42`）

**犯的错**：把 scroll handler 显示分支中的 `querySelectorAll('.protyle-breadcrumb.toolbar-scroll-hidden')` 替换成了 `getToolbarElementsForAutoHide()`，以为它们等价。

**实际不等价**：

```typescript
// 原版 —— 只操作"当前已隐藏"的元素（带 toolbar-scroll-hidden 类）
document.querySelectorAll('.protyle-breadcrumb.toolbar-scroll-hidden')

// 替换版 —— 返回所有工具栏元素（不管有没有 hidden class）
getToolbarElementsForAutoHide()  // → [data-toolbar-customized]
```

在"下滑恢复"分支里，原版只对已隐藏的元素执行 `removeProperty('opacity')` + `transform` 恢复。替换后对所有元素执行，没隐藏的元素也被改了 transform → **滚动隐藏行为错乱**。

**教训**：
- 缓存函数的返回语义必须跟原始查询**完全等价**才能替换
- `.toolbar-scroll-hidden`（按状态过滤）与 `[data-toolbar-customized]`（按属性过滤）是不同的筛选逻辑
- scroll 处理器是高频路径，但**错了比慢了更严重**——没坏的别动

### 教训 2：编辑器限定查找别管太宽（误伤 barPlugins）

**文件**：`src/toolbarManager.ts`
**提交**：`d989001`（收窄白名单 `6ff3516`）

**犯的错**：在 `executeClickSequence` 里加了编辑器限定查找逻辑，但条件写太松，把 `barPlugins`、`text:思源手机端增强` 这些不在编辑器内的全局元素也拦住了。

```typescript
// 第一次（误伤）——条件太宽，barPlugins、text:xxx 也被框进来了
if (clickedButton && !actualSelector.startsWith('text:') &&
    !actualSelector.startsWith('#') && ...)

// 最终（安全）——只有白名单才走新逻辑
if (clickedButton && (actualSelector === 'more' || actualSelector === 'doc'))
```

**教训**：
- "顺手扩大作用域"是大忌，新逻辑一定要用**白名单**收窄
- 全局元素（顶栏按钮、弹窗菜单项）跟编辑器内的工具栏按钮不能混为一谈
- 任何新加的条件分支都要问："会不会影响到其他已有的按钮？"

### 教训 3：代码审查报告不能全信（sub-agent 误报）

**犯的错**：让 AI sub-agent 做了代码审查，它报了 4 个问题就直接信了，没逐条核实就动手改。

**实际误报**：
- 说 `window.__toolbarManager` 没 delete → 实际上 L7603 有 delete，L7606 重设是 cleanup 重建流程的正常逻辑
- 说迁移逻辑每次启动写盘 → 实际上 `removeData('featureConfig')` 自清理，`migrateLegacyPerm()` 幂等

**教训**：
- 自动化审查报告只能当线索，不能当结论
- 动手改代码前必须**亲自读一遍目标代码**确认问题真实存在
- 特别是性能优化——"可能有问题"不代表"真的有问题"

### 总结：动代码前的自问清单

1. **这个 bug 是我亲眼复现的吗？**（还是别人/机器报告的？）
2. **这段代码的原始意图是什么？**（注释 / git blame / 附近上下文）
3. **我的改动有没有白名单兜底？**（只影响目标，不影响其他）
4. **如果改错了，能不能快速回退？**（小提交 + 清晰 commit msg）
5. **这个"顺手优化"真的必要吗？**（没坏的别动）

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

## 启动/重载时序：isCleanedUp 标志泄漏（工具栏按钮不加载）

### 现象（v3.7.9 修复）

- 每次启动思源或重载插件后，工具栏自定义按钮不加载；**点一下文档（触发事件）才出现**
- 电脑端、手机端都出现

### 根因

模块级标志 `isCleanedUp`（`toolbarManager.ts`）在 `cleanup()` 尾部被置 `true`，**全代码没有任何地方复位**：

```ts
// cleanup() 尾部
currentButtonConfigs = []
isCleanedUp = true    // ← 置 true 后永不复位
isSettingUpToolbar = false
```

而 `cleanup()` 不仅在 `onunload` 时调用，也在**每次重初始化**的 `initPluginFunctions()`（`index.ts`）第一行调用。重初始化后 `initCustomButtons` 里的两个创建入口全部被门闩拦截：

```ts
requestAnimationFrame(() => {
  if (isCleanedUp) return    // ← 启动/重载后必跳过
  setupEditorButtons(configs)
})
safeSetTimeout(() => {
  if (isCleanedUp) return    // ← 同样跳过
  setupEditorButtons(configs)
}, 200)
```

- **电脑端**：`setupEditorButtons` 永远不会被调用 → 按钮永不创建。唯一能创建按钮的是事件总线路径（`loaded-protyle-dynamic` / `switch-protyle` → `createButtonsForEditors` **直接调用、无门闩**），只在点文档/切文档时触发 → "点文档才显示"完全吻合
- **手机端**：`initMobileToolbarAdjuster` 的无门闩路径（100ms 定时器 / MutationObserver）能部分兜底，但 `setupEditorButtons` 内部 rAF 重试同样有 `if (isCleanedUp) return`，重试也被掐死 → 手机端同样被削弱

### 思源加载时序背景（源码分析）

| 路径 | 时序 |
|------|------|
| 启动 | `loadPlugins(init=true)` 对插件**并行加载不 await** → `onload()` 在布局恢复前就开始；`onLayoutReady()` 在布局恢复（含重开上次文档页签）之后调用，前提是 `onload()` 已 resolve |
| 重载 | `onload()` 完成后**立刻**接 `onLayoutReady()`，不等布局 |

**结论**：`onload()` 要快、不依赖布局/编辑器（await 编辑器/DOM 会让 `onLayoutReady` 无限期延后）；依赖文档/布局的初始化放 `onLayoutReady()` 或订阅事件（`loaded-protyle-dynamic` / `switch-protyle` / `loaded-protyle-static` / `ws-main`）。

### 修复

- 新增 `resetCleanupState()`：`isCleanedUp = false`
- `initPluginFunctions()` 在 `cleanup()` 后立即调用（**重初始化边界复位**）
- `onunload` 路径的 `isCleanedUp = true` 保护保留（卸载后异步回调不再操作 DOM）

### 教训

1. **模块级标志被 cleanup() 置位后，凡是"清理后还会重初始化"的场景都必须考虑复位**。cleanup() 的注释明明写了"重初始化时也会被调用"，但标志复位遗漏了。
2. 排查"某功能只在用户交互后才出现"类 bug，优先怀疑：**初始化入口被门闩/状态卡住**，而不是事件本身。
3. cleanup() 与初始化共用时，要逐一遍历模块级状态变量的生命周期（isCleanedUp / currentButtonConfigs / isSettingUpToolbar / 各 observer / 各 timer）。

## 手机端悬浮标签页 Tab：面板行宽被外部 CSS 压缩

**文件**：`src/ui/mobileTabs.ts`（`injectStyles()`）

### 症状

手机端悬浮标签页 Tab 展开后（200px 面板），每个 `.mobile-tab-item` 只占约一半宽度（实测 100px / 88px），标题被压得只剩省略号，行不满宽。`#mobile-tabs-list` 本身撑满 200px，但里面的行只有 ~50%。

### 排查路径

1. **先怀疑构建产物过期**：工作区 `mobileTabs.ts` 已有 `width: 100%` 修复，但 `dist/` 与 `package.zip` 是旧构建 → 重新构建后问题依旧（说明不止是旧包问题）。
2. **用无头浏览器实测 4 种父容器 display 场景**（`display:block` / `flex-col` / `flex-row-wrap` / `grid` 两列）：
   - 父容器正常（block）：item 默认就是 200px 满宽，**无需 `width:100%`**
   - 父容器被覆盖为 grid 两列：item 被均分成 ~100px（正好一半）
   - 父容器被覆盖为 flex：item 按内容宽（~337px 溢出）
   → 结论：手机 App/主题里有规则把 `#mobile-tabs-list` 的 `display` 覆盖成了 grid 或 flex。
3. **查思源内核 CSS**（安装包 `resources/stage/build/mobile/base.*.css` + 内置主题 daylight/midnight）：`mobile-tab-item` / `mobile-tabs-list` / `mobile-tabs-bar` / `data-tab-id` / `data-custom-button` **0 条命中**。能压窄 flex 子项的只有 `.protyle-wysiwyg [data-node-id]` 这类编辑器内部作用域规则，不影响挂载在 `document.body` 下的 `#mobile-tabs-bar`。
   → 结论：不是思源内核 CSS 直接覆盖，而是手机 App 版本/第三方主题的规则（未拿到对应版本源码前无法定位具体规则）。

### 修复（!important 锁死，不依赖外部规则内容）

给面板三个层级全部 `!important` 锁死，任何外部规则（同权重下后注入 + `!important` 兜底）都覆盖不动：

```css
#mobile-tabs-bar {
  display: flex !important;
  flex-direction: column !important;
}
#mobile-tabs-bar.collapsed { width: 46px !important; }
#mobile-tabs-bar.expanded  { width: 200px !important; }
#mobile-tabs-list {
  display: flex !important;
  flex-direction: column !important;
  width: 100% !important;
}
.mobile-tab-item {
  width: 100% !important;
  max-width: 100% !important;
  flex: 0 0 auto;      /* 防被当 flex/grid 子项压缩 */
  box-sizing: border-box;
}
```

### 实测验证

无头 Edge 模拟"外部规则恶意把 `#mobile-tabs-list` 覆盖成 `display:grid !important; grid-template-columns:1fr 1fr`"：
- 锁死后最终生效 `display:flex`，item 恢复 **200px 满宽** ✅

### 教训

1. **「宽度不满」类 bug 不要只盯着自己的 CSS**——先确认父容器 display 是否被外部规则改掉。块级 flex 子项默认 `width:auto` 就是 100%，真正需要 `width:100%` 的场景反而少。
2. **排查外部覆盖的三板斧**：①重构建产物排除旧包嫌疑 ②无头浏览器枚举父容器 display 场景复现特征数值（100px=grid 均分、88px=固定宽） ③查思源内核 CSS + 内置主题是否命中选择器。
3. 悬浮面板注入到 `document.body` 的 DOM，最容易被主题/App CSS 的**泛化规则**（`div` / `[data-*]` / `*`）或**同 ID 规则**波及；关键布局属性（display/width/flex-direction）用 `!important` 锁死是防御性写法，代价是牺牲可被外部主题定制的能力——对本插件可接受。
4. 实测中发现：`truncateTitle` 截断（默认 8→12 字）只影响 JS 层面文本，**不影响 CSS 宽度**；标题带 `...` 不代表行窄，不能作为"宽度不足"的判断依据。

### 补充：display 被覆盖导致图标/文字分两行

- **症状**：数字徽章、标题、关闭按钮纵向堆叠（图标和文字不在同一行）。标题此时已按 7 字截断（说明新包已生效），问题在 item 自身布局。
- **根因**：`.mobile-tab-item` 的 `display: flex` 未加 `!important`，外部规则把 item 覆盖成 block → 行内三元素各自占一行。
- **修复**：`.mobile-tab-item { display: flex !important; align-items: center !important; }`，同时给 `.mobile-tab-title { flex: 1 1 auto !important; min-width: 0 !important }`、`.mobile-tab-close` / `.mobile-tab-number { flex: 0 0 auto !important }` 全部锁死。
- **教训**：外部 CSS 覆盖插件 DOM 时，不只覆盖容器（bar/list）的宽度/display，**也可能覆盖到子元素自身的 display/flex**。凡插件注入到 `document.body` 的悬浮面板，建议 bar → list → item → item 内子元素（徽章/标题/按钮）**四层全部 `!important` 锁死**，一次到位，别等逐个症状出现再补。
