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
| 原生顶部工具栏 | 锁定时下一元素 `margin-top: -48px` 上移填补白条，上滑时叠加 `opacity: 0` 淡出 | `body.toolbar-locked > .toolbar.toolbar--border + *` |
| protyle 底部补偿间距 | padding 收回，带 transition | `body.toolbar-autohide-active .protyle` |
| protyle 顶部补偿间距 | padding 收回，带 transition | `body.toolbar-autohide-active.siyuan-toolbar-top-mode .protyle` |
| 思源状态栏 | opacity:0 | `#status` |

### 原生顶部工具栏：下一元素上移填补白条

思源原生顶栏 `.toolbar.toolbar--border` 是 `body.fn__flex-column` 的第一个 flex 子元素（48px）。锁定时工具栏保持原生行为（flex 流中、可见），仅通过操控相邻元素消除白条。

**核心设计**：
- toolbar 加 `position: relative; z-index: 1` 浮于内容之上（内容上移后会盖住 toolbar）
- 下一兄弟 `margin-top: -48px` 上移吃掉白条（无 transition，瞬时切换）
- 上滑隐藏时额外叠加 `opacity: 0` 淡出

```css
/* ① 锁定时：toolbar 浮于上层 + 下一元素上移填补白条（id: native-toolbar-lock-style，初始化注入） */
@media (max-width: 768px) {
    body.toolbar-locked > .toolbar.toolbar--border {
        position: relative !important;
        z-index: 1 !important;
    }
    body.toolbar-locked > .toolbar.toolbar--border + * {
        margin-top: -48px;
    }
}

/* ② 上滑隐藏时 toolbar 淡出（id: toolbar-autohide-style） */
@media (max-width: 768px) {
    body.toolbar-locked.toolbar-autohide-active > .toolbar.toolbar--border {
        opacity: 0 !important;
        pointer-events: none !important;
        transition: opacity 0.16s ease;
    }
}
```

**各状态行为**：

| 状态 | `toolbar-locked` | `toolbar-autohide-active` | 原生顶栏 | 白条 |
|------|:--:|:--:|------|------|
| 正常编辑 | ❌ | ❌ | 原生 flex 可见 | 无 |
| 锁住 | ✅ | ❌ | flex 可见，浮于内容上 | 消失（margin-top 上移） |
| 锁住 + 上滑 | ✅ | ✅ | opacity:0 淡出 | 消失 |

**⚠️ 踩过的坑**（勿回退）：

| 方案 | 问题 |
|------|------|
| 全局 `position: absolute` + `padding-top` 补偿 | 侧边栏等面板受 padding 影响；absolute 脱离 flex 流，左右滑动异常 |
| `position: absolute` 仅锁定时生效 | 锁/解锁时 flex↔absolute 切换无平滑过渡，内容跳变 |
| `position: absolute` 仅 `locked + autohide-active` 组合生效 | 解锁瞬间组合规则失配，工具栏瞬间回 flex，闪 |
| `margin-top: -48px` + `transition: margin-top` | 移动端 margin 过渡每帧触发 layout 重算，卡顿 |
| `transform: translateY(-48px)` 替代 `margin-top` | transform 不改变布局空间，底部出现 48px 空白间隙 |

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
- `handleToolbarAutoHideScroll` 入口读缓存变量 `toolbarAutoHideDocLocked`，不再每帧 `querySelector`
- 清理 class 用 `querySelectorAll('.toolbar-scroll-hidden')` 直接查找，不依赖属性选择器
- 显示路径必须先设 `el.style.transition` 再移除 class（class 移除后 transition 丢失）
- 顶部模式 transition 需高特异性选择器覆盖 `top-toolbar-custom-style` 的 `!important`
- 顶部模式 transform 偏移量需 ≥120px（兜底可配置的 `top` 值）
- 隐藏时序：底部「环境先、工具栏后」；顶部「工具栏先、环境后」
- 绑定滚动容器时有 30 次 retry（200ms 间隔），防止 DOM 未就绪
- keyboardOpen 检测用 `visualViewport.height < window.innerHeight - 80`
- `ensureToolbarAutoHideStyle()` 每次调用都重写 textContent（不用 return-early 缓存旧 CSS）
- 新增 `body.toolbar-autohide-active` 相关 CSS 时，必须同时考虑顶部/底部两种模式
- 原生顶栏：锁定时下一兄弟 `margin-top: -48px` 瞬时上移吃白条（`native-toolbar-lock-style`），上滑时叠加 `opacity: 0` 淡出（`toolbar-autohide-style`）。toolbar 加 `relative+z-index:1` 防被覆盖，`>` 限定仅 body 直属。margin 不加 transition（移动端卡顿）
- `initCustomButtons` 中的延时调用用 500ms（等工具栏 DOM 初始化），不要用 300ms
- hide/show 后设 250ms 静默期（`toolbarAutoHideIgnoreUntil`），忽略布局变化引发的反馈滚动
- 隐藏/显示冷却分开：隐藏 200ms（防反馈振荡），显示 80ms（响应灵敏）
- 锁状态缓存为 `toolbarAutoHideDocLocked`，滚动处理器读变量不查 DOM
- 所有 setTimeout 存 `toolbarAutoHidePendingTimer`，unbind/cleanup 时 `clearTimeout` 防延时竞态

### 性能优化：锁状态缓存

滚动处理器原先每帧 `querySelector('[data-type="readonly"]')`，锁状态在滚动中不会变，纯浪费。改为模块变量 `toolbarAutoHideDocLocked`，仅在 `refreshToolbarAutoHide()`（切文档/锁切换时）更新。

### 延时竞态防护

隐藏/显示使用 `setTimeout` 错开时序（50-80ms）。解锁时如果 `refreshToolbarAutoHide` 在 setTimeout 触发前执行，清理会空跑，随后 setTimeout 仍会加上 class 导致工具栏再次隐藏。

**解决方案**：所有 setTimeout 保存到 `toolbarAutoHidePendingTimer`，`unbindToolbarAutoHideScroll()` 和 `cleanup()` 中 `clearTimeout` 取消未触发的延时。回调执行后设为 `null`。

### Kmind-Zen 兼容（§12）

见下方独立条目。

---

## 12. Kmind-Zen 插件兼容 — 文档树激活时视觉隐藏悬浮面板

**相关文件**: `src/toolbarManager.ts`（`refreshKmindZenCompat`、`_applyKmindZenState`）、`src/index.ts`（`eventBusRefreshHandler` 中调用）

**功能**: 当 Kmind-Zen 文档树在当前文档激活时（自定义属性 `custom-kmind-zen-doctree-doc` 为 `true`），视觉隐藏悬浮大纲/标签页/文档导航/工具栏，防止层级重叠。

### 检测方式

通过思源 API 读取块属性，不依赖 DOM 启发式：

```typescript
fetchSyncPost('/api/attr/getBlockAttrs', { id: docId }).then(resp => {
  const isKmindZen = resp?.data?.['custom-kmind-zen-doctree-doc'] === 'true'
  document.body.classList.toggle('kmind-zen-active', isKmindZen)
})
```

注意：`kmind-zen-doctree-doc` 是思源自定义块属性（存在 `data-name="custom-kmind-zen-doctree-doc"`），DOM 上没有对应 HTML 属性，不能通过 `querySelector('[data-kmind-zen-doctree-doc]')` 检测。

### CSS 联动

通过 `body.kmind-zen-active` class 驱动：

```css
body.kmind-zen-active #mobile-outline-panel,
body.kmind-zen-active #mobile-tabs-bar,
body.kmind-zen-active #mobile-doc-nav-bar { display: none !important; }
body.kmind-zen-active .protyle-breadcrumb[data-toolbar-customized],
body.kmind-zen-active .protyle-breadcrumb__bar[data-toolbar-customized],
body.kmind-zen-active.siyuan-toolbar-top-mode .protyle-breadcrumb:not([data-toolbar-customized]),
body.kmind-zen-active.siyuan-toolbar-top-mode .protyle-breadcrumb__bar:not([data-toolbar-customized]) { display: none !important; }
```

### 调用时机

- `initCustomButtons()` 初始化时
- `eventBusRefreshHandler` 每次切文档时
- 仅移动端生效（`if (!isMobileDevice()) return`）

### 规则

- 必须用思源 API 读块属性，不能用 DOM 属性选择器或 `offsetParent` 等启发式
- 样式注入在 `refreshKmindZenCompat` 自身完成，不依赖 `initCustomButtons` 的平台分支
- cleanup 中移除 `body.kmind-zen-active` class 和样式元素 `#kmind-zen-compat-style`
- API 调用是异步的（`.then()`），class 切换有几毫秒延迟，不影响体验

---

## 13. 新增按钮功能：完整操作指南

以新增一个假设的 `⑯ 新功能` 为例，列出需要修改的所有文件和位置。

### Step 1：定义数据字段（如需要新配置项）

`src/toolbarManager.ts` → `ButtonConfig` 接口（约第 80 行）：

```typescript
// 如果是 author-tool 的新子类型，只需在联合类型中追加
authorToolSubtype?: '...' | 'toggle-lock' | 'new-feature';

// 如果新功能需要专属配置字段，在这里新增（加在相关字段附近）
newFeatureOption?: string;  // 仅 new-feature 使用
```

### Step 2：添加默认按钮配置

`src/toolbarManager.ts` → `DEFAULT_DESKTOP_BUTTONS` / `DEFAULT_MOBILE_BUTTONS`（约第 240/360 行）：

```typescript
{
  id: 'new-feature-desktop',       // 唯一 ID，建议含平台后缀
  name: '新功能',
  type: 'author-tool',
  authorToolSubtype: 'new-feature',
  icon: '✨',                      // 默认图标
  iconSize: 18,
  minWidth: 32,
  marginRight: 8,
  sort: 16,                        // 排序数字，越大越靠左
  platform: 'desktop',             // 'desktop' | 'mobile' | 不设为双平台
  showNotification: true,
  newFeatureOption: 'default',     // 新专属字段
}
```

只需写 desktop 版本，mobile 版本同理（id 后缀改为 `-mobile`，platform 改为 `'mobile'`）。

### Step 3：配置面板 — 子类型下拉框

`src/ui/buttonItems/desktop.ts` 和 `mobile.ts` → `authorToolField` 区域的 `<select>`：

```html
<option value="new-feature">⑯ 新功能</option>
```

两处都要加：
- `desktop.ts`：`createDesktopButtonItem` 函数（约第 760 行）+ `populateDesktopEditForm` 函数（约第 2240 行）
- `mobile.ts`：`createMobileButtonItem` 函数（约第 860 行）

### Step 4：配置面板 — 可见性控制和专属配置 UI

**4a）** 在 `desktop.ts` 和 `mobile.ts` 的 `updateVisibility` 函数中，为新子类型添加分支：

```typescript
} else if (subtype === 'new-feature') {
    docConfigDiv.style.display = 'none'
    dbConfigDiv.style.display = 'none'
    // ... 隐藏其他子类型的配置区
    newFeatureConfigDiv.style.display = 'flex'  // 显示专属配置
}
```

**4b）** 创建专属配置容器（与其他配置区并列，在 `authorToolField` 内）：

```typescript
const newFeatureConfigDiv = document.createElement('div')
newFeatureConfigDiv.id = 'new-feature-config'
newFeatureConfigDiv.style.cssText = 'display: none; flex-direction: column; gap: 6px; ...'
// 添加表单控件（输入框、选择器、开关等）
newFeatureConfigDiv.appendChild(createDesktopField('选项名称', button.newFeatureOption || '', '默认值', (v) => {
  button.newFeatureOption = v
}, 'text'))
authorToolField.appendChild(newFeatureConfigDiv)
```

**关键**：容器初始 `display: none`，由 `updateVisibility` 控制显隐。放在 `authorToolField` 内部，与其他配置区风格一致。

### Step 5：实现执行逻辑

`src/toolbarManager.ts` → 找到 author-tool 路由区（约第 4820 行），添加：

```typescript
// ⑯新功能
if (subtype === 'new-feature') {
  await executeNewFeature(config)
  return
}
```

然后在附近实现执行函数：

```typescript
async function executeNewFeature(config: ButtonConfig): Promise<void> {
  // 读取配置
  const option = config.newFeatureOption || 'default'
  // 执行业务逻辑
  // ...
  if (config.showNotification) showMessage('新功能执行成功', 2000, 'info')
}
```

### Step 6：功能列表说明（设置页）

`src/settings/desktop.ts` 和 `mobile.ts` → 功能列表表格，追加一行：

```html
<tr>
  <td>⑯</td>
  <td>新功能</td>
  <td>功能说明文字，简要描述用途和使用方法</td>
</tr>
```

两个文件都要更新。

### Step 7（可选）：导出/导入兼容

ButtonConfig 的字段会在 JSON 导出/导入中自动保留，无需额外处理。但如果是复杂对象（非 string/number/boolean），需确认序列化兼容。

### 检查清单

| # | 文件 | 改动 |
|---|------|------|
| 1 | `toolbarManager.ts` | `ButtonConfig` 接口 + 默认按钮 ×2 |
| 2 | `desktop.ts` | 子类型 option + updateVisibility + 专属 UI |
| 3 | `mobile.ts` | 同上 |
| 4 | `toolbarManager.ts` | 路由分支 + 执行函数 |
| 5 | `settings/desktop.ts` | 功能列表行 |
| 6 | `settings/mobile.ts` | 功能列表行 |

---

## 14. toggle-lock 竞态条件与 DOM 作用域

**相关文件**: `src/toolbarManager.ts`（`executeToggleLock`、`updateNativeReadonlyBtn`、`toggleLockWriteQueue`）

**历史 bug**: 桌面端沉浸阅读模式下，快速连续点击锁/解锁按钮时，图标偶尔不切换，或延迟很久才变；切换到另一个文档后点击可能完全无反应。

### 根因分析

**问题1 — API 竞态**：原实现通过 `await getBlockAttrs` 读锁状态，再用 `await setBlockAttrs` 写入。两次点击间隔 < API 往返时间时，第二次 `getBlockAttrs` 读到旧值，两次写入相同值 → 图标不切换。

```
点击1: getBlockAttrs → false → setBlockAttrs(true)   ⏳等待内核处理
点击2: getBlockAttrs → false（旧值！）→ setBlockAttrs(true)  ❌ 写相同值
```

**问题2 — DOM 作用域泄漏**：原实现用 `document.querySelector('[data-type="readonly"]')` 全局查询原生只读按钮。思源多标签页场景下，后台标签的编辑器 DOM 依然存在，全局查询可能命中**其他标签页**的按钮 → 读到错误的锁状态 → toggle 变成 no-op。

### 修复方案

**1）DOM 同步读取代替 API 异步读取**：从当前编辑器的原生只读按钮 `data-subtype` 属性读取锁状态，同步、零延迟、永远准确：

```typescript
// ✅ 限定在当前 protyle.element 内查找
const editorEl = protyle.element
const readonlyBtn = editorEl.querySelector('.protyle-breadcrumb__bar [data-type="readonly"]')
const isLocked = readonlyBtn?.getAttribute('data-subtype') === 'lock'

// ❌ 不要全局查询（多标签页会串台）
const readonlyBtn = document.querySelector('[data-type="readonly"]')
```

**2）乐观 UI 更新**：点击瞬间立即切换图标（`updateNativeReadonlyBtn` + `updateToggleLockIcon`），不等 API 响应。写入失败时自动回滚。

**3）串行写入队列**：所有 `setBlockAttrs` 调用通过 `toggleLockWriteQueue` 排队：

```typescript
let toggleLockWriteQueue: Promise<void> = Promise.resolve()

// 在 executeToggleLock 中：
const previous = toggleLockWriteQueue
let resolve: () => void
toggleLockWriteQueue = new Promise<void>(r => { resolve = r })

await previous  // 等待之前所有写入完成
await fetchSyncPost('/api/attr/setBlockAttrs', { ... })
// ...
resolve!()  // 释放队列给下一个
```

### 辅助函数

`updateNativeReadonlyBtn(readonlyBtn, locked)` — 封装原生按钮 DOM 更新（SVG use 的 xlink:href/href + data-subtype 属性），`executeToggleLock` 和错误回滚共用。

### 规则

- toggle-lock 读状态**必须**用 DOM（`data-subtype` 属性），不能用 API `getBlockAttrs`（异步竞态）
- 所有 DOM 查询**必须**限定在 `protyle.element` 内，禁止用 `document.querySelector` 全局查（多标签页串台）
- 图标更新**必须**是乐观的（先切换再写 API），写失败再回滚
- API 写入**必须**通过 `toggleLockWriteQueue` 排队，防止并发写入竞态
- `cleanup()` 中无需清理 `toggleLockWriteQueue`（Promise 链会被 GC 回收）
- 新增异步操作如果涉及读-改-写模式且可能被快速连续触发，参照此模式：同步读 + 乐观更新 + 串行写
