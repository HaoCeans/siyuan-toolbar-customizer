# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此代码库中工作时提供指导。

## 项目概述

这是一个名为"工具栏定制器"的思源笔记插件，为桌面端和移动端提供全面的工具栏自定义功能。它允许用户添加自定义按钮、将移动端工具栏固定到底部，以及实现点击序列自动化。

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
