## 目标
在电脑端和手机端的"添加新按钮"区块**上方**，各新增一个**所见即所得的工具栏预览视图**。预览完全模拟真实工具栏的横向布局与扩展工具栏分层（按钮的 `overflowLevel` 是几就画到第几层）。可在预览条上**直接拖动按钮重排序**，拖动只改预览和内存数组（不立即保存、不立即生效到真实工具栏），点设置弹窗的"确定"按钮才统一保存 + reloadUI。

## 核心机制（已确认的现有行为，复用即可）

| 维度 | 电脑端 | 手机端 |
|---|---|---|
| 布局方向 | 横向单行（右对齐，sort 小靠左） | 横向单行（居中，sort 小靠左） |
| 分层依据 | `calculateDesktopOverflow`（按 `buttonsPerLayer` 固定数量切分） | `calculateButtonOverflow`（按真实屏幕宽度） |
| `overflowLevel` | 配置里已存在（每层 `buttonsPerLayer[1..N]` 个） | `recalculateOverflow` 已算好并存到每个按钮的 `overflowLevel` 字段 |
| 主条/扩展条 | `overflowLevel===0` 画主条；`1..layers` 各画一条扩展条，层间错开堆叠 | 同左 |

**预览只读不计算**：直接读每个按钮的 `overflowLevel`，是几就画到第几层。拖动只改 `sort`，`overflowLevel` 保持原值不变（点确认后由现有 confirmCallback 触发重算）。

## 实现步骤

### 1. 新增预览渲染模块 `src/ui/toolbarPreview.ts`（新文件，两端共用）

导出一个工厂函数：
```ts
export function createToolbarPreview(opts: {
  getButtons: () => ButtonConfig[]   // 取当前配置数组（电脑端 desktopButtonConfigs / 手机端 mobileButtonConfigs）
  isMobile: boolean                  // 决定布局样式（居中 vs 右对齐、扩展条堆叠方向）
  onChanged: () => void              // 拖动排序后的回调（重渲染预览 + 触发列表 renderList）
}): HTMLElement
```

内部逻辑：
1. **计算分层**：从 `getButtons()` 取出启用的按钮，按 `sort` 升序排序。读扩展按钮配置判断扩展工具栏是否启用 + 层数。
2. **渲染主条**（`overflowLevel === 0` 的按钮 + 扩展按钮 ⋯ 本身）：
   - 一个横向 flex 容器，电脑端 `justify-content: flex-end`、手机端 `justify-content: center`。
   - 每个按钮用轻量 DOM：`<div>` 容器内放图标（复用下文的图标渲染逻辑）+ 可选名称。
   - 整个按钮设为 `draggable=true`（扩展按钮 ⋯ 不可拖）。
3. **渲染扩展条**（每个 `overflowLevel === i` 的层各画一条，`i = 1..layers`）：
   - 横向 flex 单行，相对主条向下错开堆叠（`margin-top` 模拟层间距）。
   - 手机端扩展条按真实方向：从主条往上叠（视觉上靠上）；电脑端往下叠。用 `flex-direction: column-reverse` 或调整顺序即可统一处理。
4. **扩展按钮 ⋯ 的开关交互**：预览里的 ⋯ 按钮可点击，点击后**展开/收起**下方的扩展条区域（纯预览交互，不调用任何保存逻辑）。默认按你要求"扩展工具栏打开就显示扩展条，不开就不显示"——即 ⋯ 激活态时显示所有扩展条，未激活时隐藏。
5. **拖动排序**：HTML5 drag（电脑端）+ 复用现有手机端触摸长按拖拽模式（从 `src/ui/buttonItems/mobile.ts:148-349` 提炼）。拖完后：
   - 重排 `sort`（`btn.sort = idx + 1` 惯例，复用现有 splice 重排逻辑）。
   - **不调 saveData，不调 refreshButtons/initCustomButtons**（符合"只改预览，点确认才生效"）。
   - 调 `opts.onChanged()` 重渲染预览 + 下方卡片列表（让两边视图保持同步）。

图标渲染（复刻 `createButtonElement` 的 4 分支逻辑，不直接 import 那个大函数）：
- `icon*` 开头 → `<svg><use href="#icon名"></svg>`
- `lucide:` 开头 → `require('lucide')[name].toSvg()`
- 图片路径 → `<img>`
- Emoji/文本 → `<span>`
- `showName` 开启 → 显示名称替代图标（复刻 4 字截断 + 字号规则）

### 2. 导出需要的标识符（`src/toolbarManager.ts`，最小改动）

给预览模块用，新增 export（不改原值）：
```ts
export const OVERFLOW_BUTTON_ID_MOBILE = 'overflow-button-mobile'   // 原 line 451 加 export
export const OVERFLOW_BUTTON_ID_DESKTOP = 'overflow-button-desktop' // 原 line 452 加 export
export function isOverflowButton(id: string): boolean {...}         // 原 line 454 加 export
```
> `calculateButtonOverflow` / `calculateDesktopOverflow` / `getButtonWidth` 已经是 export，无需改。但预览**不重新计算分层**，所以实际只需要 `OVERFLOW_BUTTON_ID_*` 和 `isOverflowButton`。

### 3. 电脑端集成（`src/settings/desktop.ts`）

在 `createActionElement`（line 1213）里，`listContainer`（line 1219）**之前**插入预览：
```ts
const previewEl = createToolbarPreview({
  getButtons: () => context.desktopButtonConfigs,
  isMobile: false,
  onChanged: renderList
})
wrapper.appendChild(previewEl)       // 预览在上
wrapper.appendChild(listContainer)   // 现有卡片列表在下
```
`renderList` 末尾追加一行刷新预览（让卡片列表里的删除/启用禁用等改动同步反映到预览）：在 `renderList` 函数体内调一次 `previewEl.refresh()`（预览模块提供一个 refresh 方法）。

### 4. 手机端集成（`src/settings/mobile.ts`）

同理，在 `createActionElement`（line 867）里，`addBtn` **之前**插入预览：
```ts
const previewEl = createToolbarPreview({
  getButtons: () => context.buttonConfigs,   // = mobileButtonConfigs（同一引用）
  isMobile: true,
  onChanged: renderList
})
container.appendChild(previewEl)
container.appendChild(addBtn)
container.appendChild(listContainer)
```

### 5. 现有 confirmCallback 无需改动

用户拖动预览后，内存数组（`desktopButtonConfigs` / `mobileButtonConfigs`）的 `sort` 已改，点"确定"时现有 `confirmCallback`（`index.ts:960-1062`）会 diff 检测到变化 → saveData → reloadUI → 真实工具栏重新渲染（此时 `calculateDesktopOverflow` / `calculateButtonOverflow` 会被调用重算分层）。手机端 confirmCallback 触发重算前，预览拖动期间 `overflowLevel` 保持原值是预期行为。

## 视觉示意

```
电脑端预览（模拟真实面包屑工具栏，横向）
┌─────────────────────────────────────────────┐
│  🔍  📖  🔒  ⚙️  📅  ➕  🗂️  🎹     ⋯   │  ← 主条（overflowLevel=0）+ ⋯
├─────────────────────────────────────────────┤
│  （点⋯后展开）                              │
│  🎤  📷  🔖  📌                        ←第1层 │
│  🐳  ➿  ✂️                            ←第2层 │
└─────────────────────────────────────────────┘
  按住任意按钮拖动即可重排 ↑

         [ + 添加新按钮 ]
   （下方：现有的按钮详细编辑卡片列表）
```

## 不做的事
- ❌ 不在预览里重新计算 overflowLevel（只读现有值）
- ❌ 拖动不调 saveData、不调 refreshButtons/initCustomButtons
- ❌ 不改动现有 confirmCallback、不动现有按钮卡片列表
- ❌ 不引入第三方拖拽库（复用项目现有原生拖拽模式）

## 涉及文件
- `src/ui/toolbarPreview.ts`（新建，约 250-350 行）
- `src/toolbarManager.ts`（3 处加 export，约 3 行改动）
- `src/settings/desktop.ts`（插入预览，约 8 行）
- `src/settings/mobile.ts`（插入预览，约 8 行）