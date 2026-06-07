# 开发注意事项

本文件为 Claude Code (claude.ai/code) 在此代码库中工作时提供指导。
记录项目架构、开发命令、以及踩过的坑和容易出错的地方，修改相关代码前务必阅读对应条目。

---

## 项目概述

这是一个名为"思源手机端增强"的思源笔记插件，为桌面端和移动端提供全面的工具栏自定义功能。它允许用户添加自定义按钮、将移动端工具栏固定到底部，以及实现点击序列自动化。

## 常用开发命令

```bash
# 开发模式（支持热重载，构建到 ./dev 或配置的思源工作空间）
npm run dev

# 生产构建（创建 ./dist 文件夹和 package.zip）
npm run build

# 发布版本（交互式，会提示选择版本更新方式）
npm run release

# 指定版本增量发布
npm run release:patch    # 补丁版本升级 (x.x.z -> x.x.z+1)
npm run release:minor    # 次要版本升级 (x.y.z -> x.y+1.z)
npm run release:major    # 主要版本升级 (x.y.z -> x+1.0.0)
npm run release:manual   # 手动输入版本号
```

### 开发环境设置

要在开发时实时加载到思源笔记，设置环境变量：

```bash
# Windows PowerShell
$env:VITE_SIYUAN_WORKSPACE_PATH="C:\Path\To\Your\Workspace"

# 然后运行
npm run dev
```

这将直接构建到 `{workspace}/data/plugins/siyuan-toolbar-customizer/` 而不是 `./dev/`。

## 架构设计

### 核心插件结构

插件遵循思源插件的架构：

- **`src/index.ts`**: 主插件类 (`ToolbarCustomizer`)，继承自思源的 `Plugin` 基类。处理插件生命周期 (`onload`, `onopen`, `onunload`) 和配置管理。

- **`src/toolbarManager.ts`**: 核心业务逻辑模块，包含：
  - 移动端工具栏定位逻辑，带有键盘高度检测
  - 自定义按钮创建和管理
  - 点击序列自动化引擎
  - 模板插入及变量支持
  - 快捷键执行

- **`src/main.ts`**: Vue 3 应用初始化。创建并挂载 Vue 应用 (`App.vue`) 到文档 body 中的隐藏 div，用于设置界面。

- **`src/api.ts`**: 思源 `fetchSyncPost` API 的封装。提供类型化的函数用于常见的思源操作（笔记本、块、文件等）。

- **`src/App.vue`**: 插件设置界面的 Vue 组件（使用 `src/components/SiyuanTheme/` 中的思源主题组件）。

### 关键架构模式

1. **平台检测**: 插件通过思源 API 的 `getFrontend()` 检测前端类型。返回 `'mobile'`、`'browser-mobile'`、`'desktop'`、`'browser-desktop'` 等。

2. **双配置管理**: 分别维护桌面端和移动端的按钮配置。`buttonConfigs` getter 根据当前平台动态返回相应的配置数组。

3. **移动端工具栏固定**: 使用 CSS 定位配合动态的 `--mobile-toolbar-offset` 变量，根据键盘状态调整（通过 `window.innerHeight` 变化和输入元素焦点事件检测）。

4. **自定义按钮**: 按钮被注入到工具栏中"退出聚焦"按钮之后。每个按钮可以是：
   - **内置功能**: 通过多种选择器策略触发思源菜单项（id、data-id、data-type、class、文本）
   - **模板插入**: 插入带变量替换的文本（{{date}}、{{time}}、{{datetime}} 等）
   - **点击序列**: 通过顺序点击元素自动化多步操作，支持智能元素匹配
   - **快捷键**: 模拟键盘事件

5. **智能元素匹配**: 点击序列系统使用 `waitForElement()` 支持 7 种匹配策略：
   1. `id` 属性
   2. `data-id` 属性
   3. `data-menu-id` 属性
   4. `data-type` 属性
   5. CSS class 选择器
   6. `text:xxx` 前缀用于文本内容匹配
   7. 完整 CSS 选择器语法

6. **MutationObserver**: 广泛使用 MutationObserver 来检测 DOM 变化，确保按钮/工具栏在思源动态加载内容时正确初始化。

## 构建配置

- **Vite** 配合 `@vitejs/plugin-vue` 进行 Vue SFC 编译
- **vite-plugin-static-copy**: 将 plugin.json、README.md、图标和 i18n 文件复制到 dist
- **vite-plugin-zip-pack**: 创建 package.zip 用于思源市场
- **rollup-plugin-livereload**: 开发模式下实时重载
- 外部依赖: `siyuan` 和 `process` 不会被打包

构建输出:
- `./dev/` 或 `{workspace}/data/plugins/siyuan-toolbar-customizer/` (开发模式)
- `./dist/index.js` + `./dist/index.css` (生产环境)
- `./package.zip` (发布包)

## 配置文件

- **`plugin.json`**: 插件元数据（名称、版本、minAppVersion、前端类型、i18n）
- **`package.json`**: npm 脚本和依赖
- **`vite.config.ts`**: Vite 构建配置，支持监听模式

## 图标支持

自定义按钮支持三种图标类型：
1. **思源图标**: `iconSettings`、`iconCheck` 等（SVG `<use href="#iconName">`）
2. **Lucide 图标**: `lucide:Calendar`、`lucide:Search` 等（需要 lucide 包）
3. **Emoji/文本**: 任何 Unicode emoji 或文本字符串

## 重要说明

- 插件使用思源的 `showMessage()` API 显示用户通知
- 隐藏内置按钮的 CSS 选择器在设置中应每行一个
- 移动端工具栏偏移使用 CSS 单位（px、vh、vw 等）
- 点击序列使用 `text:xxx` 语法进行基于文本的元素匹配
- 模板变量在插入时通过 `processTemplateVariables()` 处理

---

## 踩坑记录

以下记录开发中踩过的坑和容易出错的地方，修改相关代码前务必阅读对应条目。

---

### 1. `cleanup()` 与 `pluginInstance` 的生命周期

**相关文件**: `src/toolbarManager.ts`（`cleanup()`）、`src/index.ts`（`initPluginFunctions()`、`onunload()`）

**历史 bug**: 在 `cleanup()` 中加了 `pluginInstance = null`，导致插件初始化时 `pluginInstance` 被清空，后续所有依赖它的代码（平台判断、按钮配置读取）全部失效。

**原因**: `cleanup()` 不只在插件卸载时调用，还在 `initPluginFunctions()` 重初始化时调用。调用链：

```
onload() → setPluginInstance(this)         ← 设置
onLayoutReady() → initPluginFunctions()
                  → cleanup()              ← 不能在这里清除！
                  → initCustomButtons()    ← 后续代码依赖 pluginInstance
```

**规则**:
- `cleanup()` 中**不要**设置 `pluginInstance = null`
- `pluginInstance = null` 只在 `onunload()` 中通过 `setPluginInstance(null)` 清除
- `cleanup()` 中清理的其他模块级变量（`currentButtonConfigs`、`isSettingUpToolbar` 等）是安全的，因为它们是 toolbarManager 内部状态，会在后续初始化中重建

---

### 2. `dataset` 属性名与 HTML 属性名的映射

**相关文件**: `src/toolbarManager.ts`（`createButtonsForEditors()`、`createButtonElement()`）

**历史 bug**: 按钮创建时设置 `button.dataset.customButton = id`（对应 HTML 属性 `data-custom-button`），但匹配检查时读取 `dataset.customButtonId`（对应 HTML 属性 `data-custom-button-id`），导致按钮跳过重建的优化永远不生效。

**规则**:
- `dataset.customButton` → HTML `data-custom-button`（正确）
- `dataset.customButtonId` → HTML `data-custom-button-id`（不同的属性！）
- 设置和读取必须使用相同的 `dataset` 属性名
- 添加新的 `dataset` 属性时，先确认 HTML 属性名是否符合预期

---

### 3. 溢出工具栏图标渲染必须与主工具栏保持一致

**相关文件**: `src/toolbarManager.ts`（`createButtonElement()`、`showOverflowToolbar()`、`showDesktopOverflowToolbar()`）

**历史 bug**: 桌面端溢出工具栏只处理了 `icon` 前缀的思源图标，SVG 路径图标被当纯文本显示。

**规则**: 图标渲染有 4 个分支，**所有**创建按钮的地方都必须包含完整 4 分支：

1. `icon.startsWith('icon')` → 思源内置图标（SVG `<use>`）
2. `icon.startsWith('lucide:')` → Lucide 图标（`require('lucide')`）
3. `/\.(png|jpg|jpeg|gif|svg)$/i` → 图片路径（`<img>` 标签）
4. 其他 → Emoji/文本（`<span>`）

涉及位置：
- `createButtonElement()` — 主工具栏按钮
- `showOverflowToolbar()` — 手机端溢出工具栏按钮
- `showDesktopOverflowToolbar()` — 桌面端溢出工具栏按钮

**新增图标类型时**，必须同时更新这 3 处。

---

### 4. `isSettingUpToolbar` 必须用 try-finally 保护

**相关文件**: `src/toolbarManager.ts`（`initMobileToolbarAdjuster()`）

**潜在风险**: `isSettingUpToolbar` 标志用于防止 MutationObserver 递归调用，但如果 `setupToolbarForElement()` 内部抛异常，标志会永远保持 `true`，导致工具栏完全失效。

**规则**: 使用标志位时必须 try-finally：

```typescript
isSettingUpToolbar = true
try {
  setupToolbarForElement(breadcrumb)
} finally {
  isSettingUpToolbar = false
}
```

---

### 5. 模块级全局变量的清理时机

**相关文件**: `src/toolbarManager.ts`

`toolbarManager.ts` 使用大量模块级变量来跟踪状态：

| 变量 | 类型 | 清理位置 |
|------|------|----------|
| `resizeHandler` | 事件处理器 | `cleanup()` |
| `mutationObserver` | MutationObserver | `cleanup()` |
| `customButtonClickHandler` | 事件处理器 | `cleanup()` |
| `overflowCloseHandler` | 事件处理器 | `cleanup()` / toggle 关闭 |
| `toolbarObserver` | MutationObserver | `initCustomButtons()` / `cleanup()` |
| `activeTimers` | Set | `cleanup()` (clearAllTimers) |
| `activeObservers` | Set | `cleanup()` (clearAllTimers) |
| `focusEventHandlers` | Array | `cleanup()` |
| `currentButtonConfigs` | 数组 | `cleanup()` |
| `pluginInstance` | 插件实例 | **仅 `onunload()`** |

**规则**:
- 新增模块级变量时，必须在 `cleanup()` 中添加对应的清理逻辑
- **不要**在 `cleanup()` 中清除 `pluginInstance`
- 事件监听器必须同时 `removeEventListener`，不能只断开 Observer
- 定时器必须通过 `safeSetTimeout` 创建（自动加入 `activeTimers`），不要直接用 `setTimeout`

---

### 6. EventBus 事件监听器的注册与清理

**相关文件**: `src/index.ts`（`initPluginFunctions()`、`onunload()`）

**规则**:
- EventBus 监听器（`loaded-protyle-dynamic`、`switch-protyle`、`loaded-protyle-static`）在 `initPluginFunctions()` 中注册，在 `onunload()` 中移除
- 注册前必须先移除旧的监听器（防止重复注册）：
  ```typescript
  if (this.eventBusRefreshHandler) {
    this.eventBus.off('loaded-protyle-dynamic', this.eventBusRefreshHandler)
    // ...
  }
  ```
- `onunload()` 中必须移除所有已注册的 EventBus 监听器

---

### 7. 手机端关闭外部监听器需要同时处理 touchend

**相关文件**: `src/toolbarManager.ts`（`showOverflowToolbar()`）

**规则**: 手机端扩展工具栏的"点击外部关闭"监听器需要同时注册 `click` 和 `touchend`：
- `click` 事件在手机端有 ~300ms 延迟
- `touchend` 响应更快，体验更好
- 清理时必须同时 `removeEventListener` 两个事件

---

### 8. 桌面端扩展工具栏在 `createButtonsForEditors` 中会被强制关闭

**相关文件**: `src/toolbarManager.ts`（`createButtonsForEditors()`）

**行为**: 每次调用 `createButtonsForEditors()` 时，桌面端会先移除所有 `.desktop-overflow-toolbar-layer`（防止标签切换后残留）。这是预期行为，但需要注意：
- 这意味着 EventBus 触发 `switch-protyle` 时，桌面端扩展工具栏会被关闭
- 这是设计如此（标签切换后工具栏应该关闭），不是 bug
- 手机端不受影响（手机端溢出层是 `.overflow-toolbar-layer`，不是 `.desktop-overflow-toolbar-layer`）

---

### 9. 写入 `mobileToolbarConfig` 的长度类字段必须带合法 CSS 单位

**相关文件**: `src/settings/mobile.ts`（「①工具栏自身高度」滑杆）、`src/index.ts`（加载 `mobileToolbarConfig` 后）

**历史问题**: 「①工具栏自身高度」曾使用 `value.toString()` 写入 `toolbarHeight`，得到纯数字字符串（如 `"45"`）。`applyMobileToolbarStyle()` 生成的规则为：

```css
height: 45 !important;
min-height: 45 !important;
```

在 CSS 中，除 `0` 外**无单位数字对 `height` / `min-height` 无效**，浏览器会丢弃整条声明，表现为「调了设置主工具栏高度完全不变」；有时仍显示旧值，是因为 `#mobile-toolbar-custom-style` 里上一次合法的 `40px` 仍在生效。

**已做修复**:
- 滑杆保存改为 `value + 'px'`（与其它滑杆一致）
- `onload` 合并配置后：对一组长度字段若值为纯数字串（`/^\d+$/`），自动补成 `NNpx`（含 `toolbarHeight`、`closeInputOffset`、`openInputOffset`、`topToolbarOffset`、`topToolbarPaddingLeft`、扩展工具栏距离/高度等），兼容历史错误存档

**规则**:
- 凡是要拼进 `style` / `<style>` 文本里的长度，保存到配置时一律使用带单位的字符串（优先 `px`），不要只存数字
- 新增滑杆写入 `mobileConfig` 时，对照已有项使用 `value + 'px'` 或明确单位，避免再踩同类坑

---

### 10. 滑杆初始值不要用 `parseInt(x) || 默认值`（0 会被吃掉）

**相关文件**: `src/settings/mobile.ts`

**问题**: 多处曾写 `parseInt(currentValueStr) || 8`（或 `|| 40`）。当用户把「④扩展工具栏距离」等设为 **`0px`** 时，`parseInt('0px')` 为 `0`，在 JavaScript 里 **`0 || 8` 等于 `8`**，滑杆打开时显示错误，保存逻辑也会让人困惑。

**已做修复**: 增加 `parseLengthSliderInt(raw, fallback)`：`Number.isNaN(n) ? fallback : n`，**保留合法的 0**。

**规则**:
- 凡「最小值可为 0」的滑杆，初始值解析一律用 `parseLengthSliderInt` 或等价的 `Number.isNaN` 判断，禁止 `parseInt(...) || fallback`
- 计数类（重试毫秒等）若最小值为 0，同样注意不要用 `||` 吞掉 0

---

### 11. 顶部工具栏 padding-top 不能包含 topToolbarOffset

**相关文件**: `src/toolbarManager.ts`（`initMobileToolbarAdjuster()` 顶部模式分支）

**布局关系**（修改前必须理解）：

```
┌─────────────────────── 视口 0px
│ 思源原生顶栏 (H, 同步, 设置)
│ CSS .toolbar height:32px + border:0.5px（实际高度因设备而异）
├─────────────────────── 原生顶栏底边 ≈ topToolbarOffset
│ .protyle 自然起始位置     ← 内容区从这里开始
│ ┌─────────────────────┐
│ │ 自定义工具栏 (fixed) │  ← top: topToolbarOffset，与 .protyle 对齐
│ │ height: toolbarHeight│
│ └─────────────────────┘
│ padding-top = toolbarHeight  ← 仅需补偿工具栏自身高度
│ 编辑器内容...
```

**关键点**: `.protyle` 已经位于原生顶栏下方，其自然起始位置 ≈ `topToolbarOffset`。所以 `padding-top` 只需补偿自定义工具栏的高度 (`toolbarHeight`)，不需要再加 `topToolbarOffset`。

**历史 bug**: `paddingTopValue = topOffsetValue + toolbarHeightValue + 10`，把 `topToolbarOffset` 算了两遍——一次在 `.protyle` 的自然位置里，一次在 padding 里——导致工具栏与内容之间出现大片空白。

**⚠️ 此 bug 已回归过一次**（2026-06-04）：修改顶部工具栏相关代码时，有人把公式改回了 `topOffsetValue + toolbarHeightValue + 10`。症状是工具栏下方出现大片空白。

**规则**:
- `padding-top` 公式 = 仅 `toolbarHeight`（不加 topToolbarOffset，不加额外间距）
- 扩展工具栏的 `topOffset` 计算（`topToolbarOffset + toolbarHeight + overflowToolbarDistanceTop`）是正确的，因为那是相对于视口的绝对定位
- 如果要调整间距，只改 `toolbarHeight` 对应的 padding，不要把 `topToolbarOffset` 混进去
- **如果用户反馈"手机端顶部工具栏下面有空白"，第一件事检查 `paddingTopValue` 公式**

---

### 12. 一键记事块格式：`.protyle-content` 高度必须与 `.protyle` 一致

**相关文件**: `src/index.scss`（`.toolbar-customizer-qnote-input--block`）、`src/quickNote/kernelBlockLoader.ts`（`compactQuickNoteProtyleLayout`、`clampQuickNoteContentScroll`）

**历史 bug**: 块格式输入多段内容后，滚动到底部出现大块空白。DevTools 可见 `.protyle.toolbar-customizer-qnote-protyle` 比 `.protyle-content` 更高，空白出现在两者之间的 `.protyle` 内部。

**DOM 层级**（修改布局前必须理解）：

```
.toolbar-customizer-qnote-input--block   ← 外层边框 + 高度约束，不滚动
  └── .protyle.toolbar-customizer-qnote-protyle
        ├── .protyle-content            ← 滚动层，必须与 .protyle 等高
        │     └── .protyle-wysiwyg      ← 内容高度随段落增长
        └── 兄弟节点（preview / upload / toolbar / style 等，需隐藏）
```

**踩过的错误方案**（均勿回退）：

| 方案 | 问题 |
|------|------|
| `.protyle-content { flex:1; height:0 }` | 思源 Protyle 内有多兄弟节点，`flex:1` 经常撑不满父级，`.protyle-content` 实际高度 < `.protyle` |
| 外层滚动、内层 `min-height:100%` | 内层高度 unconstrained，或输入区直接消失 |
| 内核 resize 后 inline `max-height: 120%` 等 | 内层超出外层，空白反向出现在 wysiwyg 下方 |
| 只关 `typewriterMode`、不改定位 | 仍可能留底部空白，无法保证两元素等高 |

**正确做法**（CSS + JS 双保险）：

1. `.protyle`：`position: relative; height: 100%; overflow: hidden`
2. `.protyle-content`：**绝对定位四边贴满** `top/right/bottom/left: 0`，`overflow-y: auto`；**不要**再依赖 `flex:1 + height:0`
3. `.protyle-wysiwyg`：`min-height: 100%`（内容少时填满滚动区，类似 textarea）；`height: auto`（内容多时可增高）
4. 隐藏 `.protyle` 直接子节点中的 `preview / upload / toolbar / style` 等（`<style>` 标签若未隐藏也会影响布局）
5. `compactQuickNoteProtyleLayout()` 在 load / resize 后**同步 inline 样式**，覆盖内核写入的 flex / max-height
6. `clampQuickNoteContentScroll()` 防止 `scrollTop` 超出 wysiwyg 实际内容，避免滚到「假空白」
7. 关闭 `typewriterMode`（打字机模式会额外撑高布局）

**自检**（DevTools）：

```javascript
const p = document.querySelector('.toolbar-customizer-qnote-protyle');
const c = p?.querySelector('.protyle-content');
console.log(p?.offsetHeight, c?.offsetHeight); // 两者应相等
```

**规则**:
- 改块格式 Protyle 布局时，同时检查 `index.scss` 与 `kernelBlockLoader.ts`，不要只改一处
- 滚动只发生在 `.protyle-content`，外层 `--block` wrapper 保持 `overflow: hidden`
- 纯文本 `--plain` 的 textarea 样式**不在此条范围**，勿用全局 `.protyle` 选择器误伤

---

### 13. 一键记事：纯文本与块格式必须隔离，只改 `--block`

**相关文件**: `src/quickNote/inputArea.ts`、`src/quickNote/blockInput.ts`、`src/index.scss`

**原则**: 块格式是「只换输入框」，弹窗壳、按钮、关闭逻辑、发送流程应与纯文本一致。

**规则**:
- CSS 选择器必须带 `.toolbar-customizer-qnote-input--block` 或弹窗 id（`#quick-note-dialog` / `#quick-note-dialog-desktop`），**禁止**写影响全局编辑器的 `.protyle` 规则
- 块格式边框/背景由 `buildBlockWrapperStyle()` 对齐纯文本 textarea 的 `border / border-radius / background`
- 块格式 hint（Shift+Enter 等） intentionally 隐藏；纯文本保留
- 新增块格式能力时，回归测试纯文本：样式、发送、取消、模板按钮插入

---

### 14. 一键记事弹窗：电脑端与手机端使用不同 id

**相关文件**: `src/windowDetector.ts`

| 平台 | 弹窗 id |
|------|---------|
| 手机端 | `quick-note-dialog` |
| 电脑端 | `quick-note-dialog-desktop` |

**历史 bug**: `closeNoteDialog()` 等只查 `quick-note-dialog`，电脑端弹窗关不掉或 teardown 未执行。

**规则**:
- 查找弹窗统一用 `getQuickNoteDialogElement()`，或 `getElementById('quick-note-dialog') || getElementById('quick-note-dialog-desktop')`
- `teardownQuickNoteDialog(dialog, closeMobile)` 第二参数：`noteDialog.id === 'quick-note-dialog'` 时才走移动端样式清理
- SCSS / 内联样式涉及弹窗时，**两个 id 都要写**（见 `index.scss` 顶部）

---

### 15. 块格式保存：Enter 多段落用逐块 `updateBlock`，不需要超级块

**相关文件**: `src/quickNote/kernelBlockLoader.ts`（`persistQuickNoteToKernel`）、`src/quickNote/popoverBlocks.ts`、`src/quickNote/blockInput.ts`

**设计**:
- 弹窗打开前 `createQuickNoteDraftBlock()` 在目标文档插入空块
- 弹窗内 `getDoc` 加载同一块，WS 隔离（`protyleIsolate`）
- 用户 Enter 可产生多个顶层块（段落、列表等）
- 发送：`persistQuickNoteToKernel()` 对 wysiwyg **所有顶层块**逐个 `updateBlock` 写回
- 取消：`cancelDraft()` 删除 Enter 产生的**所有**块 id
- 电脑端发送成功后：`clearAfterSave()` 重建新 draft 块，**不关弹窗**（与纯文本一致）

**规则**:
- **不要**再引入「合并为超级块」或 `consolidateQuickNoteBlocks` 一类逻辑
- 取消/销毁必须用 `try/finally` 保证 `destroyActiveQuickNoteInput()` 执行，避免 Protyle 泄漏
- 块格式需「鲸鱼工具箱」激活（`resolveQuickNoteInputFormat`），未激活回落 `plain`

---

### 16. 块格式 flex 高度链：从弹窗到 Protyle 每一层都要 `min-height: 0`

**相关文件**: `src/index.scss`、`src/quickNote/blockInput.ts`（`buildBlockWrapperStyle`）

**布局链**:

```
弹窗 content（flex column）
  └── .toolbar-customizer-qnote-input--block   flex:1; min-height:0; overflow:hidden
        └── .toolbar-customizer-qnote-protyle  flex:1; min-height:0; height:100%
              └── .protyle-content（absolute 贴满）
```

**规则**:
- flex 子项若没有 `min-height: 0`（或 `min-height: 0%`），在 column 布局里会被内容撑开，导致弹窗内输入区高度失控
- 外层 `--block` 负责「可见边框 + 固定高度」；内层 Protyle 负责「填满 + 内部滚动」
- `patchQuickNoteProtyleResize` 在思源 `editor.resize()` 后延迟调用 `compactQuickNoteProtyleLayout`，否则窗口/弹窗尺寸变化后布局会回退

---

### 17. 一键记事弹窗暗黑模式检测（src/windowDetector.ts）

**相关文件**: `src/windowDetector.ts`（`isSiyuanDarkMode()`）

**问题**: `isSiyuanDarkMode()` 原来只读思源 CSS 变量 `--b3-theme-background` 的亮度。当思源明亮模式 + 系统暗黑模式时，WebView 会对 `white` 元素做颜色反转为黑色，但插件认为应该用亮色 → 遮罩显示灰色（代码设置的明亮模式值），卡片/输入框/按钮的 `white` 被反转成黑色 → 上下灰、中间黑撕裂。

**已做修复**: `isSiyuanDarkMode()` 在检查思源主题变量之前，先检测系统级暗黑模式 `window.matchMedia('(prefers-color-scheme: dark)')`，任一为暗则返回 `true`。一处改动覆盖弹窗所有 `isDark` 调用点。

**规则**:
- 新增颜色分支时，统一使用 `isSiyuanDarkMode()` 返回值，不要单独判断系统主题
- 遮罩背景为不透明色：暗黑 `rgba(0,0,0,1)` / 明亮 `rgba(128,128,128,1)`
- 原始半透明样式（如需恢复）：`rgba(0,0,0,0.7)` / `rgba(0,0,0,0.6)`

---

### 18. 一键记事弹窗内容卡片布局参数（src/windowDetector.ts）

**相关文件**: `src/windowDetector.ts`（`showNoteInputDialogMobile`）

**设计意图**: 内容卡片四角圆角，底部不真正上移，而是通过缩短卡片高度让遮罩色从圆角下方透出，形成「假间距」视觉效果，同时保持遮盖闪烁。

**布局示意**:

```
┌──────────────────────────────────────┐
│██████████ 不透明遮罩 ████████████████│
│████ 纯黑(暗) / 纯灰(亮) █████████████│  ← padding-top: 40px
│                                      │
│        ╭──────────────────────╮      │  ← border-radius 四角
│        │      📒 日日记事      │      │
│        │                      │      │
│        │  ╭────────────────╮  │      │
│        │  │   输入框区域    │  │      │
│        │  ╰────────────────╯  │      │
│        │   工具栏按钮区域      │      │
│        │  [取消]    [发送]    │      │
│        ╰──────────────────────╯      │  ← border-radius 四角
│     ░░░░░░ 遮罩色透出 ░░░░░░░░░░░│  ← 假间距
│██████████████████████████████████████│  ← 视口底部
└──────────────────────────────────────┘
```

**当前参数**（两处 `content.style.cssText`，Apple 风格 / 普通风格）:

| 属性 | Apple 风格 | 普通风格 |
|------|-----------|---------|
| 圆角 | `14px` 四角 | `12px` 四角 |
| 内边距 | `20px` | `24px` |
| 卡片高度 | `calc(100% - 110px)` | `calc(100% - 110px)` |
| dialog padding-top | `40px` | `40px` |
| 底部假间距 | ~70px（遮罩透出） | ~70px（遮罩透出） |

**调整公式**:

- 顶部间距 = `dialog.padding-top`（当前 `40px`）
- 底部假间距 ≈ `dialog.height - dialog.padding-top - content.height` = `100% - 40px - (100% - 110px)` = `70px`
- 想增大假间距 → 增大 `calc(100% - Npx)` 中的 `N`
- 想减小假间距 → 减小 `N`（最小 `80px`，即原始值，假间距约 `40px`）

**规则**:
- 圆角必须四角统一（`14px` / `12px`），不要只做上面圆角
- 卡片高度用 `calc(100% - Npx)` 控制，`N` 值 = `padding-top(40) + 底部假间距(70)` = `110`
- 改完一边（Apple / 普通）必须同步改另一边

---

### 19. 一键记事弹窗金句占位（src/quickNote/quoteOverlay.ts）

**相关文件**: `src/quickNote/quoteOverlay.ts`（overlay 创建）、`src/windowDetector.ts`（集成与清理）、`src/settings/mobile.ts`（设置 UI ⑥）、`src/index.ts`（默认配置）

**功能**: 弹窗空输入 + 输入法未打开时，从用户指定的文档中随机抽取段落显示为金色金句占位。微信读书划线分享卡片风格。

**DOM 层级**（修改前必须理解）：

```
noteSection (flex:1, position:relative 由 overlay 设置)
  └── inputHandle.element (flex:1, position:relative 由 overlay 设置)
       ├── textarea / protyle（z-index: auto）
       └── quote overlay（z-index:1, position:absolute, inset:0）
            ├── 左上引号 "（72px Georgia）
            ├── 金句正文（用户可配字号 14-32px、颜色、行数 1-10）
            ├── 右下引号 "
            ├── 分割线
            └── JIN JU 来源标识
```

**三层显示/隐藏机制**（按触发速度排列）：

| 层级 | 事件 | 作用 |
|------|------|------|
| ① | `focusin` | 用户点击输入框瞬间立刻隐藏，比 viewport 检测快 |
| ② | `visualViewport.resize` | 键盘动画结束后更新 keyboardOpen 状态 |
| ③ | `input` / `MutationObserver` | 内容变化时隐藏 |

**400ms 防抖**: overlay 隐藏后 400ms 内不会重新显示，防止键盘动画期间反复闪。

**配置字段**（均在 `mobileFeatureConfig`）：

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `quickNoteQuoteDocId` | `''` | 金句文档 ID，留空关闭 |
| `quickNoteQuoteFontSize` | `22` | 字体大小（px，14-32） |
| `quickNoteQuoteMaxLines` | `5` | 最大显示行数（1-10） |
| `quickNoteQuoteColorLight` | `'#B8860B'` | 明亮模式颜色 |
| `quickNoteQuoteColorDark` | `'#C9A84C'` | 暗黑模式颜色 |

**颜色派生**: 引号装饰线、分割线、JIN JU 标识的颜色自动从用户选择的主色通过 `hexToRgb()` + `rgba()` 派生半透明变体，不需要额外配置。

**规则**:
- overlay 挂载在 `inputHandle.element` 上（不是 noteSection），精确覆盖输入框区域
- `pointer-events: none` 保证不阻挡交互
- 缓存 5 分钟（`CACHE_TTL`），每次弹窗重新 `pickRandom` 但不重新查询
- 清理时需移除 `visualViewport` 监听器、`showTimer`、`focusin` 监听器，并恢复 `mountTarget.style.position`
- `teardownQuickNoteDialog` 中 overlay 清理放在 `dialog.remove()` 之后，保证金句和弹窗视觉上同时消失
- SQL 只查 `type='p'`（段落块），不取标题/代码块等

---

### 20. 手机端前后台切换时输入区布局遮罩（src/windowDetector.ts）

**相关文件**: `src/windowDetector.ts`（`handleVisibilityChange()`）

**问题**: 输入框有内容且输入法打开时，切后台再切前台，内容会一瞬间以全高（键盘已关闭）渲染，然后键盘弹起后缩回正确高度，造成闪跳。

**原因**: `handleVisibilityChange()` 中焦点恢复用 `setTimeout(150ms)` 触发键盘弹出，但在这 150ms 内视口已恢复全高，输入区以无键盘布局渲染了一帧。

**修复**: 切后台时在 noteSection 上盖一个同色遮罩（`#quick-note-layout-mask`），切前台焦点恢复 + 键盘弹起后（100ms + 200ms = 300ms）移除遮罩。

```
切后台 → 在 noteSection 上盖遮罩（同色，z-index:100，pointer-events:none）
切前台 → 100ms: focus() 恢复焦点
       → 300ms: 移除遮罩
```

**遮罩参数**:

| 属性 | 值 |
|------|-----|
| 背景色 | 暗色 `#1e1e1e` / 亮色 `white`（与弹窗卡片背景一致） |
| z-index | `100`（在输入框之上，金句 overlay z-index:1 之下没关系，因为金句此时已被 focusin 隐藏） |
| pointer-events | `none`（不影响焦点和输入法） |
| 延迟 | 焦点 100ms + 键盘 200ms = 300ms 总延迟 |

**规则**:
- 遮罩盖在 noteSection（输入区）上，不影响标题、工具栏按钮、发送/取消按钮
- 不需要恢复焦点时（输入法没开过），切前台直接移除遮罩，不等待
- 遮罩 `id='quick-note-layout-mask'`，全局唯一，用 `getElementById` 查找
- 弹窗被 `teardownQuickNoteDialog` 销毁时，遮罩随 dialog.remove() 一起移除，无需额外清理
- 不要用 `visibility: hidden`（会阻止输入法弹出），不要用 `opacity: 0`（部分设备干扰 IME 定位）
