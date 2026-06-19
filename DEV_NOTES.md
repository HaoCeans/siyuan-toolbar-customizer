# 开发注意事项

本文档记录开发中踩过的坑和容易出错的地方，修改相关代码前务必阅读对应条目。
(你先阅读下DEV_NOTES.md再修复，同时，修复时要检查是否引入新bug)

---

## 1. `cleanup()` 与 `pluginInstance` 的生命周期

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

## 2. `dataset` 属性名与 HTML 属性名的映射

**相关文件**: `src/toolbarManager.ts`（`createButtonsForEditors()`、`createButtonElement()`）

**历史 bug**: 按钮创建时设置 `button.dataset.customButton = id`（对应 HTML 属性 `data-custom-button`），但匹配检查时读取 `dataset.customButtonId`（对应 HTML 属性 `data-custom-button-id`），导致按钮跳过重建的优化永远不生效。

**规则**:
- `dataset.customButton` → HTML `data-custom-button`（正确）
- `dataset.customButtonId` → HTML `data-custom-button-id`（不同的属性！）
- 设置和读取必须使用相同的 `dataset` 属性名
- 添加新的 `dataset` 属性时，先确认 HTML 属性名是否符合预期

---

## 3. 溢出工具栏图标渲染必须与主工具栏保持一致

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

## 4. `isSettingUpToolbar` 必须用 try-finally 保护

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

## 5. 模块级全局变量的清理时机

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

## 6. EventBus 事件监听器的注册与清理

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

## 7. 手机端关闭外部监听器需要同时处理 touchend

**相关文件**: `src/toolbarManager.ts`（`showOverflowToolbar()`）

**规则**: 手机端扩展工具栏的"点击外部关闭"监听器需要同时注册 `click` 和 `touchend`：
- `click` 事件在手机端有 ~300ms 延迟
- `touchend` 响应更快，体验更好
- 清理时必须同时 `removeEventListener` 两个事件

---

## 8. 桌面端扩展工具栏在 `createButtonsForEditors` 中会被强制关闭

**相关文件**: `src/toolbarManager.ts`（`createButtonsForEditors()`）

**行为**: 每次调用 `createButtonsForEditors()` 时，桌面端会先移除所有 `.desktop-overflow-toolbar-layer`（防止标签切换后残留）。这是预期行为，但需要注意：
- 这意味着 EventBus 触发 `switch-protyle` 时，桌面端扩展工具栏会被关闭
- 这是设计如此（标签切换后工具栏应该关闭），不是 bug
- 手机端不受影响（手机端溢出层是 `.overflow-toolbar-layer`，不是 `.desktop-overflow-toolbar-layer`）

---

## 9. 写入 `mobileToolbarConfig` 的长度类字段必须带合法 CSS 单位

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

## 10. 滑杆初始值不要用 `parseInt(x) || 默认值`（0 会被吃掉）

**相关文件**: `src/settings/mobile.ts`

**问题**: 多处曾写 `parseInt(currentValueStr) || 8`（或 `|| 40`）。当用户把「④扩展工具栏距离」等设为 **`0px`** 时，`parseInt('0px')` 为 `0`，在 JavaScript 里 **`0 || 8` 等于 `8`**，滑杆打开时显示错误，保存逻辑也会让人困惑。

**已做修复**: 增加 `parseLengthSliderInt(raw, fallback)`：`Number.isNaN(n) ? fallback : n`，**保留合法的 0**。

**规则**:
- 凡「最小值可为 0」的滑杆，初始值解析一律用 `parseLengthSliderInt` 或等价的 `Number.isNaN` 判断，禁止 `parseInt(...) || fallback`
- 计数类（重试毫秒等）若最小值为 0，同样注意不要用 `||` 吞掉 0

---

## 11. 锁定时工具栏滚动隐藏（toolbarAutoHide）

**相关文件**: `src/toolbarManager.ts`（`refreshToolbarAutoHide`、`handleToolbarAutoHideScroll` 及辅助函数）、`src/index.ts`（`eventBusRefreshHandler` 中调用）、`src/ui/buttonItems/desktop.ts`、`src/ui/buttonItems/mobile.ts`

**功能**: toggle-lock 按钮打开「锁定时工具栏滚动隐藏」后，移动端文档锁定时，上滑隐藏工具栏、下滑显示，实现全屏沉浸阅读。

### 设计原则

- **纯视觉隐藏，不动 DOM 结构**：不删元素、不改变加载流程，只用 CSS class + transform
- **仅移动端生效**：`refreshToolbarAutoHide()` 首行 `if (!isMobileDevice()) return`
- **默认关闭**：`ButtonConfig.toolbarAutoHide` 默认 `undefined`/`false`

### 架构

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

### 隐藏/显示的三层联动

所有联动通过 `body.toolbar-autohide-active` class 驱动，一条规则控制全貌：

| 对象 | 方式 | 选择器 |
|------|------|--------|
| 按钮工具栏（底部/顶部） | `.toolbar-scroll-hidden` class：opacity:0 + transform 滑走 | `.protyle-breadcrumb` / `__bar` |
| 原生顶部工具栏 | `display:none`（消除 48px 布局占位白条） | `.toolbar.toolbar--border` |
| protyle 底部补偿间距 | padding 收回 | `body.toolbar-autohide-active .protyle` |
| 思源状态栏 | opacity:0 | `#status` |

### 顶部/底部模式差异

```typescript
const isTop = document.body.classList.contains('siyuan-toolbar-top-mode')
// 底部模式：translateZ(0) translateY(calc(100% + 8px))  向下藏
// 顶部模式：translateZ(0) translateY(calc(-100% - 8px)) 向上藏
```

### transform 动画关键

工具栏自身 CSS 有 `transform: translateZ(0)`（硬件加速）。如果覆盖成 `translateY(...)`，两个不同 transform 函数之间 CSS transition 无法插值 → 直接跳变无动画。

**正确做法**：所有 transform 保留 `translateZ(0)` 前缀：
```
隐藏：translateZ(0) translateY(calc(±100% ± 8px))
显示：translateZ(0) translateY(0)  ← 不能清空为 ''
```

### 解锁/关闭功能时的恢复

**必须无条件清理**，不能用 `if (toolbarHiddenByScroll)` 包住。变量状态可能与实际 DOM 不一致（反复锁定/解锁后），导致 toolbar-scroll-hidden class 残留。

```typescript
// ✅ 正确：无条件清理
toolbarHiddenByScroll = false
document.querySelectorAll('.toolbar-scroll-hidden').forEach(el => {
  el.classList.remove('toolbar-scroll-hidden')
  el.style.transform = 'translateZ(0) translateY(0)'
})
document.body.classList.remove('toolbar-autohide-active')

// ❌ 错误：有条件清理（变量可能失步）
if (toolbarHiddenByScroll) { ... }
```

**清理路径**用 `document.querySelectorAll('.toolbar-scroll-hidden')` 直接按 class 查找，不依赖 `getToolbarElementsForAutoHide()`（该函数按 `data-toolbar-customized` 属性查找，DOM 重建后可能返回空）。

### 滚动处理器内的实时锁校验

`handleToolbarAutoHideScroll` 入口处必须实时读取 DOM 中的锁状态：

```typescript
const readonlyBtn = document.querySelector('[data-type="readonly"]')
if (!readonlyBtn || readonlyBtn.getAttribute('data-subtype') !== 'lock') {
  // 文档已解锁，立即恢复工具栏
  if (toolbarHiddenByScroll) { /* 清理 class + transform + body class */ }
  return
}
```

防止反复锁定/解锁后，延迟回调或残留事件在文档解锁后仍操作工具栏。

### 隐藏动画时序（底部 vs 顶部）

底部模式：
```
隐藏（上滑）:
  t=0ms    body class 加入 → protyle 间距收回 + 状态栏淡出
  t=50ms   工具栏 class 加入 → 工具栏向下滑走

显示（下滑）:
  t=0ms    工具栏 class 移除 → 工具栏向上滑入
  t=80ms   body class 移除 → protyle 间距恢复 + 状态栏淡入
```

顶部模式（**时序相反**，因为原生顶栏在上方、我们的工具栏在下方）：
```
隐藏（上滑）:
  t=0ms    我们先向上滑走（原生顶栏还在，当背景）
  t=80ms   body class 加入 → 原生顶栏隐藏 + protyle 间距收回

显示（下滑）:
  t=0ms    body class 移除 → 原生顶栏先出现
  t=50ms   我们再向下滑入
```

**原则**：始终让用户视觉上感觉工具栏是平滑过渡的。底部模式「先藏环境再藏自己」，顶部模式「先藏自己再藏上方」——避免工具栏突然跳到新位置再动画。

### 顶部工具栏 transition 特异性

顶部工具栏 CSS（`top-toolbar-custom-style`）有 `transition: top 0.3s ease !important`，特异性 (0,2,1) 高于通用 `.toolbar-scroll-hidden` 的 (0,2,0)。需要追加高特异性规则覆盖为 `ease-out 0.2s`：

```css
body.siyuan-toolbar-top-mode .protyle-breadcrumb.toolbar-scroll-hidden {  /* (0,3,0) */
  transition: opacity 0.2s ease-out, transform 0.2s ease-out !important;
}
```

### 显示路径的 transition 要内联设置

class 移除后 transition 跟着消失，显示时 transform 会直接跳回原位。**所有显示/解锁路径必须在 classList.remove 前设置 `el.style.transition`**：

```typescript
htmlEl.style.transition = 'opacity 0.2s ease-out, transform 0.2s ease-out'
htmlEl.classList.remove('toolbar-scroll-hidden')
htmlEl.style.transform = 'translateZ(0) translateY(0)'
```

### 顶部工具栏 transform 偏移量

顶部工具栏是 `position: fixed; top: 50px`（可配置），`translateY(-100%)` 只移动自身高度，大部分还留在屏幕里。必须加上足够大的偏移：

```
底部: translateZ(0) translateY(calc(100% + 8px))    ← 向下推出
顶部: translateZ(0) translateY(calc(-100% - 120px))  ← 向上推出（120px 兜底 top 偏移）
```

### 模块级变量清单

| 变量 | 说明 |
|------|------|
| `toolbarAutoHideConfigured` | 是否有按钮启用此功能 |
| `toolbarAutoHideScrollHandler` | 滚动事件处理器引用 |
| `toolbarAutoHideBoundEl` | 已绑定滚动的元素 |
| `toolbarHiddenByScroll` | 当前是否已滚动隐藏 |
| `toolbarLastScrollTop` | 上次滚动位置 |
| `toolbarScrollBindRetryTimer` | 滚动容器绑定重试定时器 |
| `toolbarAutoHideLastToggle` | 上次切换时间戳（防抖） |

所有变量在 `cleanup()` 中重置。

### 规则

- 隐藏必须是 **CSS class + transform**，不写 inline `opacity`/`display`（防止覆盖初始化流程）
- transform 必须保留 `translateZ(0)` 前缀（否则无动画）
- 顶部/底部模式必须用 `isTop` 变量区分 transform 方向和时序
- 恢复工具栏必须**无条件清理** class + transform + body class
- `handleToolbarAutoHideScroll` 入口必须实时校验锁状态
- 清理 class 用 `querySelectorAll('.toolbar-scroll-hidden')` 直接查找，不依赖属性选择器
- 显示路径必须先设 `el.style.transition` 再移除 class（class 移除后 transition 丢失）
- 顶部模式 transition 需高特异性选择器覆盖 `top-toolbar-custom-style` 的 `!important`
- 顶部模式 transform 偏移量需 ≥120px（兜底可配置的 `top` 值）
- 隐藏时序：底部「环境先、工具栏后」；顶部「工具栏先、环境后」
- 绑定滚动容器时有 30 次 retry（200ms 间隔），防止 DOM 未就绪
- keyboardOpen 检测用 `visualViewport.height < window.innerHeight - 80`
- `ensureToolbarAutoHideStyle()` 每次调用都重写 textContent（不用 return-early 缓存旧 CSS）
- 新增 `body.toolbar-autohide-active` 相关 CSS 时，必须同时考虑顶部/底部两种模式
- `initCustomButtons` 中的延时调用用 500ms（等工具栏 DOM 初始化），不要用 300ms
