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

---

### 21. `forwardProxy` 的 headers 格式必须是 `{ "Header-Name": "value" }`

**相关文件**: `src/tts/mobilePanel.ts`（`fetchSiliconFlowTTS`、`tryFetchChunk`）、`src/api.ts`（`forwardProxy`）

**历史 bug**: 硅基流动 TTS 通过 `forwardProxy` 代理时报 401 `Invalid token`。原因是 headers 传了 `{ name: 'Authorization', value: 'Bearer sk-xxx' }`，内核把 `name` 和 `value` 当成了 HTTP 头名，真正的 `Authorization` 头从未被设置。

**内核解析逻辑**（`kernel/api/network.go`）：

```go
// headers 是 []any，每个元素是 map[string]any
// 遍历 map 的 key-value，直接 SetHeader(key, value)
for _, pair := range headers {
    if m, ok := pair.(map[string]any); ok {
        for k, v := range m {
            request.SetHeader(k, fmt.Sprintf("%v", v))
        }
    }
}
```

**正确格式**（key 就是 HTTP 头名，value 就是头的值）：

```typescript
// ✅ 正确
[{ 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }]

// ❌ 错误（内核会设置 name: "Authorization" 和 value: "Bearer sk-xxx" 两个无意义头）
[{ name: 'Authorization', value: `Bearer ${apiKey}` }]
```

**规则**:
- `forwardProxy` 的 `headers` 参数是 `{ [headerName: string]: string }[]`，不是 `{ name: string, value: string }[]`
- 多个头可以合并在一个对象里：`[{ 'Authorization': '...', 'Content-Type': '...' }]`
- 内核**不会**过滤 `Authorization` 头，任何合法 HTTP 头名都会被原样转发
- 手机端 WebView CORS 拦截外部 `fetch`，所有外部 API 请求必须走 `forwardProxy` 代理
- `responseEncoding: 'base64'` 参数让内核返回 base64 编码的二进制响应，避免音频/图片数据损坏

---

### 22. 手机端 TTS 双模式语速分离存储

**相关文件**: `src/tts/mobilePanel.ts`（`TTSSettings`、`renderFreeContent`、`renderApiContent`、`fetchSiliconFlowTTS`）

**历史 bug**: 硅基流动模式的语速滑杆（0.5-2.0）用 `parseInt()` 读取，吞掉小数精度（1.5 → 1）；且与百度免费模式（0-15）共用同一个 `speed` 字段存储，切换模式时互相覆盖；`fetchSiliconFlowTTS` 还用百度公式 `0.25 + (speed/15)*3.75` 把硅基流动原生语速转成了错误值（1.0x → 0.5x）。

**修复后的存储结构**:

```typescript
interface TTSSettings {
  speed: number        // 免费模式语速（百度 0-15，默认 5）
  apiSpeed: number     // 硅基流动语速（0.25-4.0，默认 1.0）
  speaker: string      // 硅基流动音色名，如 'alex'
}
```

**规则**:
- 免费模式用 `speed`（0-15 整数），API 模式用 `apiSpeed`（0.25-4.0 浮点数），**禁止**共用字段
- API 模式滑杆读取必须用 `parseFloat()`，禁止 `parseInt()`
- `fetchSiliconFlowTTS` 的 speed 参数已经是硅基流动原生范围（0.25-4.0），只需 `Math.max(0.25, Math.min(4.0, speed))` clamp，**禁止**用百度公式转换
- 新增 TTS 引擎或参数时，对照硅基流动 API 文档确认参数范围，不要假设与百度一致

---

### 23. 锁定时工具栏滚动隐藏（toolbarAutoHide）

**相关文件**: `src/toolbarManager.ts`（`refreshToolbarAutoHide`、`handleToolbarAutoHideScroll` 及辅助函数）、`src/index.ts`（`eventBusRefreshHandler` 中调用）、`src/ui/buttonItems/desktop.ts`、`src/ui/buttonItems/mobile.ts`

**功能**: toggle-lock 按钮打开「锁定时工具栏滚动隐藏」后，移动端文档锁定时，上滑隐藏工具栏、下滑显示，实现全屏沉浸阅读。

#### 设计原则

- **纯视觉隐藏，不动 DOM 结构**：不删元素、不改变加载流程，只用 CSS class + transform
- **仅移动端生效**：`refreshToolbarAutoHide()` 首行 `if (!isMobileDevice()) return`
- **默认关闭**：`ButtonConfig.toolbarAutoHide` 默认 `undefined`/`false`

#### 架构

```
refreshToolbarAutoHide()           ← 总入口，由以下时机调用：
  ├─ initCustomButtons()           ← 初始化后 500ms 延时
  ├─ executeToggleLock()           ← 点击锁定/解锁按钮后
  ├─ eventBusRefreshHandler()      ← 切换文档时
  └─ cleanup()                     ← 卸载时清理

handleToolbarAutoHideScroll()      ← 滚动事件处理器
  ├─ 入口检查：toolbarAutoHideConfigured + 实时锁状态校验
  ├─ delta > 15px → 隐藏：body class 先加(50ms后工具栏滑走)
  ├─ delta < -15px → 显示：工具栏先滑回(80ms后 body class 移除)
  └─ 键盘弹出时暂停（isKeyboardOpenForToolbar）
```

#### 隐藏/显示的四层联动

所有联动通过 `body.toolbar-autohide-active` class 驱动：

| 对象 | 方式 | 选择器 |
|------|------|--------|
| 按钮工具栏 | `.toolbar-scroll-hidden` class：opacity:0 + transform | `.protyle-breadcrumb` / `__bar` |
| 原生顶部工具栏 | 锁定时 toolbar `relative+z-index:1` 浮于上层，下一兄弟 `margin-top: -48px` 瞬时上移吃白条；上滑叠加 `opacity: 0` 淡出。`>` 限定仅 body 直属 | `body.toolbar-locked > .toolbar.toolbar--border + *` |
| protyle 间距（底部） | padding-bottom 收回，带 transition | `body.toolbar-autohide-active.siyuan-toolbar-customizer-enabled .protyle` |
| protyle 间距（顶部） | padding-top → 0，带 transition | `body.toolbar-autohide-active.siyuan-toolbar-top-mode .protyle` |
| 思源状态栏 | opacity:0 | `#status` |

#### 顶部/底部模式差异

| | 底部模式 | 顶部模式 |
|---|---|---|
| 选择器 | `[data-toolbar-customized]` | `body.siyuan-toolbar-top-mode .protyle-breadcrumb:not([data-toolbar-customized])` |
| transform | `translateY(calc(100% + 8px))` | `translateY(calc(-100% - 120px))`（需 120px 兜底 top 偏移） |
| 隐藏时序 | t=0 环境 → t=50 工具栏 | t=0 工具栏先 → t=80 环境 |
| 显示时序 | t=0 工具栏 → t=80 环境 | t=0 环境 → t=50 工具栏 |
| transition | 0.16s ease（通用） | 0.2s ease-out（覆盖 top-toolbar-custom-style 的 !important） |

#### transform 动画关键

工具栏自身 CSS 有 `transform: translateZ(0)`。**必须保留 `translateZ(0)` 前缀**否则 transition 无法插值。显示路径必须在 classList.remove 前设 `el.style.transition`（class 移除后 transition 丢失）。

#### 解锁/关闭功能时的恢复

**必须无条件清理** class + transform + body class，不能用 `if (toolbarHiddenByScroll)` 包住。清理路径用 `querySelectorAll('.toolbar-scroll-hidden')` 直接按 class 查找。

#### 滚动处理器内的实时锁校验

`handleToolbarAutoHideScroll` 入口必须实时读取 DOM 锁状态，非 lock 则立即恢复工具栏。

#### ensureToolbarAutoHideStyle 必须每次重写

不能 return-early（旧 CSS 缓存会导致新规则不生效）。

#### 规则

- 隐藏必须是 CSS class + transform，不写 inline `opacity`/`display`
- transform 必须保留 `translateZ(0)` 前缀
- 顶部/底部模式用 `isTop` 区分 transform 方向、时序、transition
- 顶部模式 transition 需高特异性选择器覆盖 `top-toolbar-custom-style`
- 顶部模式 transform 偏移量 ≥120px（兜底可配置 top 值）
- 恢复工具栏必须无条件清理 class + transform + body class
- 显示路径必须先设 `el.style.transition` 再移除 class
- `handleToolbarAutoHideScroll` 入口读缓存变量 `toolbarAutoHideDocLocked`，不再每帧 querySelector
- 清理 class 用 `querySelectorAll('.toolbar-scroll-hidden')` 直接查找
- 绑定滚动容器有 30 次 retry（200ms 间隔）
- `ensureToolbarAutoHideStyle()` 每次调用都重写 textContent
- `initCustomButtons` 中延时用 500ms，不要用 300ms
- 所有 setTimeout 延时存 `toolbarAutoHidePendingTimer`，unbind/cleanup 时 clearTimeout 防竞态
- 原生顶栏：锁定时 toolbar `relative+z-index:1` + 下一兄弟 `margin-top: -48px` 瞬时上移吃白条，上滑叠加 `opacity: 0` 淡出。不碰 toolbar 的 position 流，`>` 限定仅 body 直属。margin 不加 transition（移动端卡顿）
- hide/show 后设静默期 250ms，忽略布局反馈滚动
- 冷却分开：隐藏 200ms / 显示 80ms
- 锁状态缓存为 `toolbarAutoHideDocLocked`

---

### 24. Kmind-Zen 插件兼容 — 文档树激活时视觉隐藏悬浮面板

**相关文件**: `src/toolbarManager.ts`（`refreshKmindZenCompat`、`_applyKmindZenState`）、`src/index.ts`

**检测方式**: 通过思源 API `fetchSyncPost('/api/attr/getBlockAttrs', { id: docId })` 读 `custom-kmind-zen-doctree-doc` 属性。注意这是思源自定义块属性，DOM 上没有对应 HTML 属性。

**CSS 联动**: `body.kmind-zen-active` class 驱动，隐藏 `#mobile-outline-panel`、`#mobile-tabs-bar`、`#mobile-doc-nav-bar` 及所有工具栏。

**调用时机**: `initCustomButtons()` 初始化 + `eventBusRefreshHandler` 每次切文档。仅移动端生效。

**规则**:
- 必须用思源 API，不能用 DOM 选择器或 `offsetParent` 等启发式
- 样式注入在 `refreshKmindZenCompat` 自身完成
- cleanup 中移除 class 和 `#kmind-zen-compat-style`

---

### 25. 新增按钮功能：操作清单

以新增 `⑯ 新功能` 为例，需改 6 个文件：

| # | 文件 | 改动 |
|---|------|------|
| 1 | `toolbarManager.ts` L80 | `ButtonConfig.authorToolSubtype` 联合类型追加 `'new-feature'`；如需专属字段，在接口新增 |
| 2 | `toolbarManager.ts` L240/360 | `DEFAULT_DESKTOP_BUTTONS` / `DEFAULT_MOBILE_BUTTONS` 各加一个按钮对象（type: 'author-tool', authorToolSubtype: 'new-feature'） |
| 3 | `desktop.ts` L760 / `mobile.ts` L860 | 子类型 `<select>` 加 `<option value="new-feature">⑯ 新功能</option>`（桌面 2 处 + 手机 1 处） |
| 4 | `desktop.ts` / `mobile.ts` | `updateVisibility` 加分支；创建专属配置 div（初始 `display:none`），追加到 `authorToolField`/`authorToolContainer` |
| 5 | `toolbarManager.ts` L4820 | 路由分支 `if (subtype === 'new-feature')` → 调用执行函数 |
| 6 | `settings/desktop.ts` / `mobile.ts` | 功能列表表格追加一行（序号+名称+说明） |

---

### 26. 思源 v3.8 移动端 breadcrumb 的滚动上移机制（`--mobile-bar-translate-y`）

**相关文件**: `src/toolbarManager.ts`（各模式注入 CSS、`applyToolbarAutoHideState`）

**背景**: 思源 `#editor > .protyle-breadcrumb` 自带 `transform: translate3d(0, var(--mobile-bar-translate-y, 0), 0)`，滚动沉浸时思源 JS 把变量设为负值（最多 -48px），面包屑随滚动上移。**插件所有模式的工具栏都复用这个 breadcrumb 元素**。

**历史 bug**: 恢复工具栏时清空 inline transform 后，思源规则重新生效，工具栏随滚动上移最多 48px（表现为"工具栏往上跑 + 底部空白条"）。

**规则**:
- 各模式 CSS 必须用 `!important` 覆盖 transform：底部固定/顶部/侧边用 `translateZ(0) !important`，底部胶囊用 `translateX(-50%) translateY(0) !important`（居中）
- `applyToolbarAutoHideState` 隐藏/恢复时都要写 inline transform（优先级最高），侧边胶囊用 `translateZ(0)`（不要用 `translateX(-50%)`，会破坏侧边定位）

---

### 27. 思源导航栏隐藏时 toolbarMore 不可点：必须绕过按钮直接开面板

**相关文件**: `src/toolbarManager.ts`（`clickElement()`、`openMobileMoreMenu()`、clickSequence 的 `isVisible` 检查）

**背景**: `.mobile-chrome--hidden` 时思源导航栏 `pointer-events: none; visibility: hidden` 且带 `inert` 属性，`toolbarMore` 无法点击（程序化 click 也不可靠）。

**历史 bug**: 先解除 inert 再 `click()` 的方案在真机上失败；且 clickSequence 路径在点击前有 `isVisible()` 检查，隐藏元素直接抛"元素不可见"。

**规则**:
- `clickElement()` 中 `element.id === 'toolbarMore'` 时**不要点击按钮**，直接调 `openMobileMoreMenu()`：`#menu` 的 `style.zIndex = ++window.siyuan.zIndex` + `style.transform = 'translateX(0px)'`（复刻思源 `popMenu()` 核心，顺带 blur 收起键盘、清侧栏 transform）
- clickSequence 步骤的 `isVisible` 检查必须跳过 toolbarMore（`element.id !== 'toolbarMore'` 才抛错）
- 键盘打开时 `mobile-chrome--hidden` 不会移除（思源 `mobileBarsState` 的 `topbarVisible` 只看 `readingBarsOffset`，与 editing 无关）——判断导航栏隐藏统一用 `isNativeMobileBarsHidden()`（含 `mobile-keyboard--open` 例外）

---

### 28. 初始化时序：`initMobileToolbarAdjuster` 先于 `initCustomButtons`

**相关文件**: `src/toolbarManager.ts`（`updateToolbarCSS`、`showOverflowToolbar`）

**背景**: 初始化链路是 `initMobileToolbarAdjuster`（注入工具栏 CSS）→ `initCustomButtons`（更新 `currentButtonConfigs`）。**CSS 注入时按钮配置尚未就绪**。

**历史 bug**: 在注入 CSS 时读取 overflow 按钮的 `layers` 计算导航栏位置，首次加载读到旧/空值，按 1 层定位，多层级时导航栏被顶层扩展栏遮挡。

**规则**: 依赖"打开时才能确定的值"（如扩展栏层数）不要注入时算死——用 CSS 变量占位（`var(--tc-nav-bottom, 146px)`），在 `showOverflowToolbar` 打开时用当时的真实值（`layers`/`toolbarHeight`/`bottomOffset`）动态 `setProperty`。

---

### 29. 底部胶囊模式：默认隐藏思源导航栏，扩展栏打开时显示在扩展栏上方

**相关文件**: `src/toolbarManager.ts`（胶囊 CSS 分支、`bindOverflowPanelSync`、`syncOverflowOpenClass`）

**规则**:
- 用 `body.siyuan-toolbar-floating` class 标记底部胶囊模式（区别于底部固定，避免影响底部固定的"导航栏对齐工具栏上沿"规则）
- 默认隐藏：`body.siyuan-toolbar-floating .mobile-bottom-bar { visibility/opacity: 0; pointer-events: none }`
- 扩展栏打开时显示：`body.siyuan-toolbar-floating.tc-overflow-open .mobile-bottom-bar`，bottom = `--tc-nav-bottom`（= 胶囊底距 + 胶囊高 + 间距 + (层数-1)×(层高+层距) + 层高 + 间距，与 `showOverflowToolbar` 层堆叠公式一致），并 `transform: translate3d(0,0,0)` 抵消思源滚动位移
- `tc-overflow-open` 用 MutationObserver（`bindOverflowPanelSync`）监听 body 子级变化检测 `.overflow-toolbar-layer` 存在性（扩展栏挂载在 body 直接子级）；显示时移除导航栏 `inert`/`aria-hidden` 保证可点击
- 扩展栏是插件面板，思源 `panelObserver` 不感知它——需要自己同步

---

### 30. 侧边胶囊模式要点

**相关文件**: `src/toolbarManager.ts`（`isSideFloatingMode`、侧边 CSS 分支、`showOverflowToolbar` 侧边分支、`bindSidePanelsSync`）、`src/settings/mobile.ts`

**规则**:
- 模式互斥：`enableSideFloatingToolbar` 与 `enableTopToolbar`/`enableBottomToolbar`/`enableFloatingToolbar` 四选一（radio 互斥赋值）
- 配置字段独立：`sideFloatingRadius`/`sideFloatingHeight`/`sideFloatingStyle` 等**不要复用** `floatingToolbar*`（用户明确要求两套独立，避免模式间串扰）
- 收起态 = 单个竖排省略号按钮（`lucide:EllipsisVertical`），CSS 竖胶囊：`width: 32px; height: 配置高度; flex-direction: column`，且要清零按钮自带 `margin-right`（否则 ⋮ 不居中）
- 微缩胶囊尺寸按 `border-box` 控制（宽 30px、高 32px）；胶囊内自定义按钮必须同时清掉 `padding` 并设 `width:100%`、`min-width:0`，否则按钮默认 `padding: 0 8px` 会把实际宽度撑到 39px，看起来胶囊过宽
- 展开面板：`showOverflowToolbar` 的 `isSideMode` 分支——单层显示全部按钮（不按 overflowLevel 过滤）、`position: fixed` 对齐胶囊（同侧同底）、竖排纯图标、`max-height` + `overflow-y: auto` 滚动、横向分割线（竖排面板不能用竖线分割线）
- 侧边展开面板固定 `width: 58px` 并设 `box-sizing: border-box`；侧边模式下必须忽略按钮的 `showName`（否则 4 个字会把 `width:auto` 面板撑到 139px 左右，所有图标按钮跟着变宽）
- 侧栏/更多面板打开（100vw 全屏覆盖）和键盘弹出时隐藏胶囊：`applySideCapsuleVisibility()`（MutationObserver 监听 `#sidebar/#sidebarRight/#menu/#model` 的 style + body class）
- 胶囊元素加 `data-prevent-swipe` 属性，否则横向滑动会触发思源侧栏滑出手势
- **胶囊必须主动解除思源的交互禁用**：思源移动栏隐藏时会给 `#editor > .protyle-breadcrumb` 加 `inert` 和 CSS `pointer-events:none`，表现为「胶囊还在但点不动」。显示胶囊时调用 `ensureSideCapsuleInteractive()` 清除 `inert`/`aria-hidden` 并写 inline `pointer-events:auto`，同时监听 `inert`/`aria-hidden` 属性变化（思源每次滚动渲染会重新加）
- **隐藏原生按钮时必须保留按钮容器**：自定义按钮插在 `.protyle-breadcrumb__plugin` 内（3.8.10 起该容器同时带 `protyle-breadcrumb__actions` 类）。侧边胶囊的「只保留 ⋮」规则只能隐藏容器里的非 `[data-custom-button]` 子元素，不能把容器本身 `display:none`，否则胶囊空白且点不动
- **侧边模式的主胶囊只保留触发器**：`shouldShowInMainToolbar()` 在侧边模式只放行扩展按钮，其余按钮全部进面板；`shouldShowButton()` 必须让触发器无视 `enabled=false`，否则主胶囊没有任何内容，只剩灰色空壳且无法展开
- **展开面板打开时主胶囊触发器保留**：它同时是"再点一次关闭面板"的入口；不要为了消除重复观感去隐藏它（重复的 ⋮ 实际来自外部按钮镜像，见下一条）
- 侧边展开面板必须过滤 `isOverflowButton()`：面板里再出现触发器只会点一下把面板关掉
- `findExternalToolbarButtons()` 收集第三方按钮时必须递归进入 `.protyle-breadcrumb__plugin` / `__actions` 容器，不能把容器本身当外部按钮镜像：容器里装着本插件全部自定义按钮（含 ⋮ 触发器），整体复制会在面板底部多出一个 ⋮ 和分隔线

---

### 31. 思源移动端导航栏接管：panelOpen 占位方案（根治 inert/滚动隐藏对抗）

**相关文件**: `src/toolbarManager.ts`（`forceMenuPanelOpen`、`bindMenuPanelForce`、`isNavTakeoverMode`）

**背景**: 底部胶囊 / 底部固定⑦ 模式下，导航栏由扩展工具栏接管（默认隐藏、扩展栏打开时显示在扩展栏上方）。思源滚动渲染会持续给 `#mobileBottomBar` 设置 `inert` 属性和隐藏样式，任何"JS 解除 inert"的方案都会与思源每帧对抗，导致真机卡死。

**正解（读思源源码得出）**: 思源 `isPanelOpen()` 检查 `#sidebar/#sidebarRight/#menu/#model` 任一元素的 **inline `style.transform` 非空**；非空 → `panelOpen=true` → `isMobileBarsScrollPaused` → `readingBarsOffset` 不增长 → `bottomBarVisible` 恒 true → **思源根本不设置 inert、不隐藏导航栏**。

**规则**:
- 接管模式下给 `#menu` 设置 inline `transform: translateX(100vw)`（与思源 CSS 默认值相同，视觉零变化）——只设置一次，零对抗
- 用 MutationObserver 监听 `#menu` 的 style，仅当思源 `closePanel` 清空 transform 时恢复占位（低频）
- 卸载/接管关闭时：若占位 transform 还在则清空，交还思源
- **副作用**: `panelOpen=true` 同时使顶栏不隐藏（`topbarVisible` 恒 true，标题常驻）；插件「随思源导航栏自动隐藏」在接管模式下失效（工具栏常驻）——均为接管模式的合理行为
- 不要用 attributes observer 监听 `#mobileBottomBar` 的 inert 做"解除对抗"——每帧 DOM 写操作 + 全文档查询会卡死页面

---

### 32. 扩展栏外部关闭监听的 touchend 与合成 click 时序（鼠标正常、触摸点不到）

**相关文件**: `src/toolbarManager.ts`（`showOverflowToolbar` 的 `closeOnOutside`）

**背景**: 扩展栏打开时 document 挂 `click` + `touchend` 两个外部关闭监听。触摸路径中 **`touchend` 先于浏览器合成 click 触发**——触摸导航栏按钮（扩展栏外）时立即关闭扩展栏、隐藏导航栏，合成 click 异常，按钮点不到；鼠标路径是 click 阶段（按钮 click 先执行、功能已触发），所以"鼠标能点、手点不行"。

**规则**:
- `closeOnOutside` 必须区分事件类型：**`touchend` 阶段排除思源导航栏区域**（`target.closest('.mobile-bottom-bar')` 时不关闭），保证合成 click 正常到达按钮
- `click` 阶段照常关闭（此时按钮功能已执行）
- 排查"鼠标正常、触摸异常"的交互问题时，优先检查 touchend/click 双监听的时序差异

---

### 33. 思源 v3.8.2+ 全局快捷键不再覆盖 window.html 独立窗口（remote 转发方案）

**相关文件**: `src/index.ts`（⌥⇧L 注册 + isInWindow 钩子）、`src/toolbarManager.ts`（`triggerDesktopLifelogGlobalCaptureSmart`）

**背景**: 思源 v3.8.2（commit `519b0e82e` 插件生命周期重构）起，window.html 独立窗口（一键记事块格式弹窗、文档独立窗口）内插件 `globalCallback` 快捷键全部失效：
- 主进程 `main.js`：全局快捷键从 `getAllWindows().forEach(send)` 广播改为 `getGlobalShortcutWorkspace` **定向发给 workspace 主窗口**——window 窗口不在 workspaces 列表，永远收不到
- 渲染端 `boot/onGetConfig.ts` 接收 handler 加 `if (!isWindow())` guard——window 窗口收到也丢弃
- 且 `globalShortcut` 在 OS 层拦截按键，**窗口内本地 keydown 监听也收不到**（Electron 行为，别走 keydown 方案）

**规则**:
- ⌥⇧L 仍注册 `globalCallback`（主窗口注册 → OS 层保持"全局捕获"语义），回调改走 `triggerDesktopLifelogGlobalCaptureSmart()`
- Smart 转发：`@electron/remote` 的 `getFocusedWindow()` → URL 含 `window.html` → `executeJavaScript` 调用窗口内钩子 `window.__tcLifelogTrigger`（窗口内直接执行 LifeLog 流程：配置同源共享、弹窗渲染在聚焦窗口）；焦点在主窗口/外部 → 走原路径
- 窗口内钩子在 onload（`isInWindow`）挂载、onunload 删除；钩子内必须调用**本窗口模块内函数**（同 bundle），不要引用未 import 的名字
- **教训**: vite/esbuild 转译不做类型检查——import 列表删了某个函数，调用处编译不报错，运行时才 `ReferenceError: xxx is not defined`。钩子/回调引用的函数改 import 时务必核对
- 调试跨窗口调用：`executeJavaScript` 注入 IIFE 包 try-catch，把 `'hook-ok' / 'hook-error: <stack>' / 'hook-missing'` 作为返回值取回调用窗口，比 Electron 原始报错（看不到窗口内细节）好用

### 34. 打开文档类功能：分平台选 API + 创建后等索引就绪

**相关文件**: `src/toolbarManager.ts`（`executeDiary`、`waitForBlockIndexReady`）

**背景**: 手机端"④日记顶部或底部"填笔记本 ID 后打不开今日日记（但滚动照常执行——滚的是当前文档）。排查结论（读 v3.8.2 思源源码）：
- `openMobileFileById`（siyuan SDK 导出自 `mobile/editor.ts`）是**移动端专用**：开头访问 `window.siyuan.mobile.tabs`，桌面端 `window.siyuan.mobile` 不存在 → 同步 TypeError，且常被异步链吞掉（无日志）
- 移动端 `mobile.tabs.open` 内部 `resolveRoot` 先调 `/api/block/getBlockInfo`：**创建类 API（createDailyNote 等）返回后文档仍在异步索引队列 → code 3 → tabs.open 静默返回 invalid 并 restore**——零日志、零提示
- 判定平台不要靠 UA 字符串猜（`/mobile|android/i.test(navigator.userAgent)` 会误判），用 `pluginInstance.isMobile`（getFrontend 判定）或 `config.fronted?.includes('mobile')`

**规则**:
- 打开文档：桌面端用 `siyuanOpenTab`，移动端用 `openMobileFileById`，平台判定走插件环境而非 UA
- 创建类 API（createDailyNote / 新建文档）拿到 id 后**先轮询 `waitForBlockIndexReady(id)`**（getBlockInfo code===0，300ms×16≈5s）再打开，消除索引竞态
- 思源移动端 `tabs.open` 失败是静默的（`void + then` 吞掉、只 restore）——排查"无日志但功能失效"时优先怀疑这类静默 API

### 35. 电脑端块格式一键记事弹窗与思源 3.8.10+ 编辑器兼容

**相关文件**: `src/quickNote/quickNoteBlockWindow.ts`、`src/ui/desktopQuickNoteSettings.ts`、`src/quickNote/kernelBlock.ts`

**背景**: 电脑端块格式一键记事使用独立 `BrowserWindow` 加载 `window.html`，弹窗中的 Protyle 默认包含文档标题编辑器；仅用 CSS 隐藏 `.protyle-title` 不会销毁标题编辑器，也不会停止其内容监听。思源 3.8.10 起支持富文本文档标题，标题区域内嵌了一个 `.protyle-wysiwyg`，并且位于正文编辑器之前。

**历史问题一：标题被清空**:
- 旧代码用 `document.querySelector('.protyle-wysiwyg')` 取得编辑器；3.8.9 中它通常是正文，3.8.10 起可能先命中隐藏的标题编辑器
- 隐藏窗口自动清理时把新空草稿 HTML 直接写入该元素，会触发思源标题编辑器的变更监听和 `setDocTitle` 事务，导致日记或目标文档标题被清空
- 直接给编辑器 `innerHTML`、手动改 `block.id/rootID` 会绕过思源的编辑器生命周期和保存队列，也会产生草稿残留

**历史问题二：今日日记无法从主窗口打开**:
- 思源 Electron 主进程处理 `siyuan-open-file` 时，会遍历其他窗口的 URL hash；hash 中包含目标文档 ID 时，主进程把打开请求发送到该窗口并聚焦它
- 弹窗加载日记中的草稿块后，Protyle 的 `rootID` 会解析为今日日记文档 ID；如果弹窗 hash 残留该 ID，主窗口点击今日日记会被误认为文档已经在其他窗口打开
- 弹窗隐藏或成为残留窗口后，主窗口点击看起来像无反应；使用页签右侧、页签下侧或新窗口打开会绕过该跨窗口匹配，因此仍然可以打开

**规则**:
- 正文编辑器优先从当前 Editor 实例取得 `protyle.wysiwyg.element`；DOM 兜底时必须排除 `.protyle-title` 和 `.protyle-title__rich`，禁止在块格式独立窗口中直接使用全局 `document.querySelector('.protyle-wysiwyg')`
- 隐藏超时后的清理应销毁旧 `BrowserWindow`，由 `closed` 流程按空/非空状态删除或保留草稿；下次打开通过正常的建草稿和 `_buildBlockUrl` 流程创建新窗口，不在旧页面中注入 HTML，不伪造 `block.id` 或 `rootID`
- `quickNoteBlockWindow.ts` 中的正文空状态轮询和自动聚焦必须共用同一个正文编辑器解析函数，避免修复保存路径后空块判断或焦点路径再次命中标题
- 独立窗口必须清除 URL hash，避免主进程把文档打开请求路由到弹窗：保留 `hashchange` 即时清空、`history.pushState/replaceState` 包装、轮询兜底、`did-navigate-in-page` 主进程事件清空，以及隐藏前主动清空；窗口创建时设置 `backgroundThrottling: false`
- 不要尝试用 `Object.defineProperty` 重定义 `window.location.hash`；Location 的 `hash` 是不可配置的自有属性，会抛 `TypeError`，应采用写入后清空的事件方案
- 弹窗必须带稳定的 `win.__qn_block_window` 标记，创建新窗口和关闭时通过标记清理残留窗口，不能依赖 `getTitle()` 判断窗口类型，因为思源会覆盖独立窗口标题
- 插件启动/重载时先接管仍存活的记事弹窗（恢复 `qnWinId` 与 URL 中的草稿块 ID），不能一律当残留销毁：0 秒常驻的隐藏弹窗会随插件重载保留，直接销毁会让下次快捷键打开变成新空草稿
- 插件卸载时只销毁空草稿窗口，非空窗口（无论显示还是隐藏）要保留给下一次重载接管；禁止无条件 `deleteQuickNoteDraftBlock`，草稿内容已实时写入内核，删块等于丢笔记
- 空状态轮询在 `__qnBodyWysiwyg()` 取不到正文时必须跳过本轮，不能把编辑器重渲染期间的空结果写成“空”，否则非空草稿会被自动清理误删
- 不能只依赖 `__qn_block_window`：插件重载后 `@electron/remote` 的窗口代理会重建，自定义属性丢失，残留窗口会被当成普通窗口跳过。清理逻辑必须同时按 URL 识别：新建窗口带 `qn=1`；旧窗口按 `window.html` 的 `json` 中 `pin=true`、标题含 `⚡`、`children.action` 含 `cb-get-focus` 判断
- 修改窗口识别规则后，至少验证：插件重载后旧记事窗口仍能被“立即清理残留记事窗口”销毁；主窗口点击此前打不开的文档恢复正常；正常文档独立窗口不会被误删
- 自动清理时间允许 `0` 时，配置解析必须用 `Number.isNaN` 区分无效值和合法的 0，禁止使用 `parseInt(value) || fallback`
- 修改独立窗口生命周期、URL、Protyle 初始化或 hash 处理后，至少验证：输入并隐藏弹窗后主窗口仍能打开今日日记；弹窗自动清理后不再清空文档标题；设置为 0 后弹窗可恢复原草稿；关闭和插件重启后没有残留窗口或空草稿

### 36. 手机端「滚动文档顶部/底部」与「日记顶部/底部」：必须针对当前编辑器

**相关文件**: `src/toolbarManager.ts`（`resolveScrollTarget`、`scrollProtyleToBoundary`、`executeScrollDoc`、`executeDiary`）

**背景**: 手机端可能同时存在主编辑器 `window.siyuan.mobile.editor`、弹出编辑器 `popEditor` 和次级编辑器（反链、引用、数据库行）；桌面端多页签也存在多个 `.protyle`。旧实现用 `document.querySelector('.protyle:not(.fn__hidden):not(.fn__none)')` 取第一个，可能命中非当前编辑器，表现为「按钮点了但当前文档没动」。另外旧实现直接写 `scrollTop`，文档未完整加载时只能滚到已加载位置，长文档会停在半路；旧版手机端选择「日记顶部」时则完全不滚动。

**规则**:
- 当前编辑器按「手机端主编辑器 → 焦点所在 `.protyle` → `getActiveProtyle()`（桌面活动页签）→ 可见 `.protyle`」解析，禁止再用全局第一个 `.protyle`
- 滚动到边界优先点击思源原生 `.protyle-scroll__up` / `.protyle-scroll__down`，由内核 `goHome` / `goEnd` 处理 mode 0/4 动态加载；只有编辑器没有滚动控件时才回退写 `contentElement.scrollTop`
- 不要遍历所有 `.protyle` 批量写 `scrollTop`，会误伤其他页签、弹窗或次级编辑器
- 手机端「日记顶部」必须与电脑端一致真正滚动；打开日记后先等编辑器挂载再滚动，找不到目标时短轮询重试，不要固定一次延时后就放弃
- 点击工具栏按钮后焦点通常在按钮上，此时回退到 `window.siyuan.mobile.editor` 是预期行为
- 修改后至少验证：多页签、弹出引用、反链面板等场景点击滚动只影响当前文档；长文档能滚到真正末尾（含动态加载）；手机端「日记顶部」能回到顶部

### 37. 记事弹窗窗口标记在插件重载后丢失，旧文档被隐藏窗口占用

**相关文件**: `src/quickNote/quickNoteBlockWindow.ts`（`isQuickNoteBlockWindow`、`destroyAllBlockWindows`、`_buildBlockUrl`）、`src/utils/windowRouteDiagnostics.ts`

**现象**: 主窗口普通点击某天日记（例如 2026-11-04）无反应，右键「在页签右侧打开」「在页签下侧打开」「使用新窗口打开」都正常。开启插件调试日志后可以看到：

```text
[路由诊断] 打开文档 20261104085136-5mkrm8f 被其他窗口接管: true
[路由诊断] 窗口 11 记事弹窗= false 可见= false 命中目标= true hashIds= ['20261104085136-5mkrm8f'] url= ...window.html?...json=...⚡ 快捷记事...#20261104085136-5mkrm8f
```

**根因**:
- 记事弹窗的 `win.__qn_block_window` 是挂在 `@electron/remote` 窗口代理上的自定义属性；插件重载后代理对象重建，属性丢失，但对应的 BrowserWindow 仍然存活
- 残留窗口的 hash 里仍带着草稿所在日记的文档 ID；思源主进程按窗口 hash 路由 `siyuan-open-file`，主窗口点击该文档时请求被转给隐藏窗口，主窗口不再打开
- 启动清理、命令面板、设置页按钮都按内存标记匹配，因此全部跳过这些窗口，表现为"清理没生效"

**修复**:
- 新建窗口地址增加 `qn=1`
- `isQuickNoteBlockWindow()` 三重识别：内存标记 / `qn=1` / 旧窗口 URL 特征（`window.html` 的 `json` 中 `pin=true`、标题含 `⚡`、`children.action` 含 `cb-get-focus`）
- 关闭流程、设置页「立即清理残留记事窗口」统一使用该函数
- 插件启动/重载时不销毁仍存活的记事窗口，改为接管（见第 35 节规则）

**规则**:
- 窗口识别不能只依赖内存属性，必须能在插件重载后重新识别；优先使用 URL 等窗口自身携带的信息
- 新增识别特征时保留旧窗口兜底：老版本创建的窗口没有新参数，只能靠 URL 特征匹配
- 修改后至少验证：插件重载后旧记事窗口仍能被「立即清理残留记事窗口」销毁；此前打不开的文档恢复；普通文档独立窗口不会被误删
- 排障入口：设置 - 桌面端 - 📝 插件调试日志，再在主窗口开发者工具过滤 `路由诊断`；日志会列出每个窗口的 `记事弹窗`、`可见`、`命中目标`、`hashIds`、`url`

### 38. 文档全屏切换：必须按当前活动页签取编辑器实例

**相关文件**: `src/toolbarManager.ts`（`case 'doc-fullscreen'`、`resolveActiveProtyleInstance`、`findBodyWysiwygInProtyle`）

**现象**: 当前文档点「④文档全屏切换」正常；用页签切到另一篇文档后再点，新文档没有反应，旧文档反而进入/退出全屏。

**根因**: 旧实现用 `document.querySelector('.protyle-wysiwyg.protyle-wysiwyg--select') || document.querySelector('.protyle-wysiwyg:not(.fn__none):not(.fn__hidden)')` 取编辑器。页签切换后旧页签的 DOM 仍留在文档中，`querySelector` 会命中旧页签（或 3.8.10 标题内嵌的 `.protyle-wysiwyg`），再把 Alt+Y 派发给它；思源按键处理器按事件目标所属 `.protyle` 解析文档，于是全屏作用在旧文档上。

**规则**:
- 文档全屏优先取当前活动编辑器实例，调用 `protyle.getInstance().setFullscreen(!isFullscreen())`，与思源 Alt+Y 走同一套逻辑，不依赖焦点和键盘事件
- 实例解析复用滚动的优先级：手机端主/弹出编辑器 → 桌面活动页签（`getActiveProtyle()`）；只接受 `isConnected` 且 `getClientRects().length > 0` 的实例，禁止取全局第一个 `.protyle` 或 `.protyle-wysiwyg`
- 旧版本没有 `getInstance` 时才回退键盘事件；回退也必须把事件派发到当前编辑器正文，正文查找要排除 `.protyle-title` / `.protyle-title__rich` 内的编辑器
- 修改后至少验证：单页签切换、多分屏、弹窗/次级编辑器存在时，连续切换页签后点击全屏都只作用于当前文档

### 39. 电脑端设置四个顶部标签：必须锁定插件自己的对话框

**相关文件**: `src/ui/tabs.ts`（`findTabSwitcherContent`、`injectTabSwitcher`）、`src/index.ts`（`openSetting`）

**现象**: 从集市打开插件设置后，电脑配置 / 手机配置 / 数据迁移 / 激活与权益四组内容全部堆在一起，点击顶部标签没有反应。Win10 用户反馈较多。

**根因**:
- `injectTabSwitcher` 原来用 `document.querySelector('.b3-dialog__content')` 取第一个对话框内容。从思源设置页的集市打开插件设置时，思源自己的设置弹窗仍在 DOM 里，而且思源设置页也包含 `.config-item`，原来的“有没有 config-item”判断会通过，于是四个标签被注入到思源设置页，`switchTab` 遍历的也是思源设置项，插件对话框里的分组永远不会被隐藏。
- 思源 3.8.10 的桌面端 `Dialog` DOM 没有结构性改动，插件 `Setting` 改用 `MobileDialog` 只影响手机端（桌面仍是普通 `Dialog`）；但 3.8.10 新增了独立设置窗口，`b3-dialog` 同时存在的场景更多，放大了这个选择器问题。

**规则**:
- 注入前先锁定包含 `.toolbar-customizer-content` 的 `.b3-dialog__content`，优先使用 `setting.dialog.element` 精确查询，禁止直接取全局第一个 `.b3-dialog__content`
- 判断“设置项是否就绪”要看 `.toolbar-customizer-content`，不能只看 `.config-item` 数量，否则会误判思源设置页
- 预加载隐藏样式 `#toolbar-customizer-preload-hide` 可能残留多个，清理时用 `querySelectorAll` 全部移除，不要只用 `getElementById` 删一个
- 修改后至少验证：从集市打开插件设置（思源设置页仍在背后）时四个标签只出现在插件对话框内；点击四个标签只切换插件内容；关闭后重新打开不残留标签或隐藏样式
