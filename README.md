# ✨ 核心功能亮点

- ➕ **自定义按钮**：在工具栏添加快捷按钮，支持4种功能类型
- 📝 **模板插入**：一键插入时间、日期等预设文本
- ⌨️ **快捷键模拟**：执行常用快捷键，如打开日记、全局搜索
- 🖱️ **点击自动化**：模拟多步点击操作，实现复杂功能
- 📱 **手机端置底**：工具栏固定在底部，方便单手操作
- ⚖️ **双端独立配置**：电脑端和手机端分别设置

---

# 🔗 常用链接

| 链接 | 说明 |
|------|------|
| [V2.0.0《工具栏定制器》简化重构：小白易用](https://ld246.com/article/1768938149464) | 重构思路 / 新手向说明 |
| [《工具栏定制器插件》手机端自动化！简化操作](https://ld246.com/article/1768670747491) | 开发心得+教学视频+更新说明图 |
| [README_BUILTIN_IDS.md](https://github.com/HaoCeans/siyuan-toolbar-customizer/blob/main/README_BUILTIN_IDS.md) | 思源常用功能ID 速查表 |
| [README_CLICK_SEQUENCE.md](https://github.com/HaoCeans/siyuan-toolbar-customizer/blob/main/README_BUILTIN_IDS.md) | 模拟点击序列使用说明 |

---

<details>
  <summary style="font-size: 24px; font-weight: 600; padding: 6px 0; cursor: pointer;">
    🧩 功能特性
  </summary>

### 电脑端
| 功能 | 说明 |
|------|------|
| **自定义按钮** | 在顶部工具栏添加快捷按钮 |
| **4种功能类型** | 思源内置、模板插入、快捷键、点击序列 |
| **图标自定义** | 支持思源图标、Lucide 图标、Emoji |
| **按钮样式** | 可调图标大小、宽度、边距 |

### 手机端
| 功能 | 说明 |
|------|------|
| **工具栏置底** | 固定在屏幕底部，方便单手操作 |
| **输入法适配** | 键盘弹出时自动上移 |
| **外观定制** | 背景颜色、透明度可调 |
| **独立配置** | 与电脑端分别设置 |

### 通用
| 功能 | 说明 |
|------|------|
| **隐藏内置按钮** | 隐藏不常用的思源原生按钮 |
| **按钮拖拽排序** | 长按拖动调整顺序 |
| **按钮开关** | 可临时禁用某个按钮 |
| **双端独立配置** | 电脑端和手机端互不影响 |

</details>

---

<details>
  <summary style="font-size: 24px; font-weight: 600; padding: 6px 0; cursor: pointer;">
    📖 使用指南
  </summary>

### 一、添加自定义按钮

**路径**：设置 → 插件 → 工具栏定制器

| 设置项 | 说明 |
|--------|------|
| **电脑端配置** | 电脑端工具栏按钮 |
| **手机端配置** | 手机端工具栏按钮 |

点击「添加新按钮」，可选择 4 种功能类型：

#### ① 思源内置功能【简单】
点击「选择」按钮，从列表中选择思源内置功能（如设置、搜索、文件树等）

#### ② 手写模板插入【简单】
插入预设文本，支持变量：

| 变量 | 输出示例 |
|------|----------|
| `{{date}}` | 2026-01-21 |
| `{{time}}` | 14:30:45 |
| `{{datetime}}` | 2026-01-21 14:30:45 |
| `{{year}}` / `{{month}}` / `{{day}}` | 2026 / 01 / 21 |
| `{{hour}}` / `{{minute}}` / `{{second}}` | 14 / 30 / 45 |
| `{{week}}` | 星期二 |

**示例**：插入 `{{year}}年{{month}}月{{day}}日 {{hour}}:{{minute}}` → `2026年01月21日 14:30`

#### ③ 电脑端快捷键【简单】
模拟键盘快捷键，如 `Alt+5`（打开日记）、`Ctrl+P`（全局搜索）

#### ④ 自动化模拟点击【难】
按顺序自动点击多个元素，实现复杂操作

**常用预设**（点击「选择」按钮快速填入）：
- **电脑端**：
  - 打开插件设置：`barPlugins → text:工具栏定制器`
  - 打开伺服浏览器：`barWorkspace → config → → text:关于 → text:打开浏览器`
- **手机端**：
  - 打开插件设置：`toolbarMore → menuPlugin → text:工具栏定制器`
  - 打开伺服浏览器：`toolbarMore → menuAbout`

**选择器语法**：
- 简单 ID：`barSettings`
- CSS 选择器：`#barSettings`
- 文本匹配：`text:复制块引用`

### 二、移动端工具栏设置

将工具栏固定到屏幕底部，方便单手操作。

| 设置项 | 说明 |
|--------|------|
| **工具栏置底** | 开启后工具栏固定在底部 |
| **工具栏背景颜色** | 设置背景色（仅置底时可用） |
| **工具栏透明度** | 调整透明度 0–100%（仅置底时可用） |
| **输入法偏移** | 键盘打开时工具栏上移距离（如 `300px`） |
| **隐藏思源内置按钮** | 隐藏只读模式按钮、隐藏文档按钮|

### 三、常见问题

**Q: 按钮没有显示？**
A: 刷新页面或重启思源笔记

**Q: 点击序列不工作？**
A: 检查选择器是否正确，尝试使用 `text:xxx` 文本匹配

**Q: 手机端工具栏遮挡输入框？**
A: 调整「输入法偏移」数值

</details>

---

<details>
  <summary style="font-size: 24px; font-weight: 600; padding: 6px 0; cursor: pointer;">
    📌 更新说明
  </summary>

### v2.0.0（重构、简化操作）

#### ✨ 新增

**增强兼容性**
| 平台                              | 是否支持    |
| ----------------------------------- | ------------- |
| 鸿蒙系统                          | ✅ 正常支持 |
| Android                           | ✅ 支持     |
| iOS                               | ✅ 支持     |
| 桌面端（Windows / macOS / Linux） | ✅ 支持     |
| WebView / 内嵌环境                | ✅ 稳定     |

**简化操作**
- 预设 **23 个**手机端思源内置按钮，供用户快速选择
- 支持电脑端配置手机端按钮

**新增功能**
- 电脑端打开手机伺服浏览器预览
- 100 种按钮图标选择
- 按钮开关功能（可临时禁用按钮）
- 手写模板变量增强：小时、分钟、秒
- 首次安装欢迎提示
- 自动化模拟点击预设：打开插件设置、打开伺服浏览器

#### 🛠 修复
- 鸿蒙系统适配问题

<details>
  <summary style="font-size: 18px; font-weight: 600; padding: 6px 0; cursor: pointer;">
    查看历史版本
  </summary>

### v1.1.2
- 增加执行快捷键按钮
- 栏内按钮均匀分布设置

### v1.0.6
- 修复工具栏按钮全部删除后会重新出现的问题

### v1.0.5
- 修复插件设置中"保存 / 取消"按钮位置异常
- 修复工具栏按钮无法正常删除
- 修复底部工具栏遮挡设置界面
- 新增插入模板内容功能，支持自动填充时间、日期
- 手机端新增工具栏高度设置
- 手机端新增工具栏层级（z-index）设置

</details>

</details>

---

# ❓问题反馈Q群

感谢您的支持与反馈，这将鼓励作者持续开发

<div align="center">
  <img src="https://raw.githubusercontent.com/HaoCeans/siyuan-toolbar-customizer/main/preview2.png" alt="预览图" width="300">
</div>

# 🧧 打赏支持

感谢您的支持与反馈，这将鼓励作者持续开发

<div align="center">
  <img src="https://raw.githubusercontent.com/HaoCeans/siyuan-toolbar-customizer/main/payment2.png" alt="打赏二维码" width="300">
</div>

<div align="center">
  <img src="https://raw.githubusercontent.com/HaoCeans/siyuan-toolbar-customizer/main/payment1.png" alt="打赏二维码" width="300">
</div>

---

<details>
  <summary style="font-size: 24px; font-weight: 600; padding: 6px 0; cursor: pointer;">
    📦 插件说明总览
  </summary>

| 模块 | 子项 | 内容 |
|------|------|------|
| 安装 | 从插件集市安装 | 1. 打开思源笔记<br>2. 设置 → 集市 → 插件<br>3. 搜索 **工具栏定制器**<br>4. 点击安装 |
| 安装 | 手动安装 | 1. 从 [GitHub Releases](https://github.com/siyuan-note/siyuan-toolbar-customizer/releases) 下载最新版本<br>2. 解压 zip 文件<br>3. 复制到 `{工作空间}/data/plugins/`<br>4. 重启思源笔记<br>5. 设置 → 集市 → 已下载 中启用插件 |
| 开发 | 从源码构建 | `git clone https://github.com/siyuan-note/siyuan-toolbar-customizer.git`<br>`cd siyuan-toolbar-customizer`<br>`npm install`<br>`npm run dev`<br>`npm run build` |
| 开发 | 项目结构 | `src/index.ts` 主逻辑<br>`src/toolbarManager.ts` 工具栏管理<br>`src/App.vue` 设置界面<br>`src/index.scss` 样式<br>`public/` 静态资源<br>`plugin.json` 插件元数据 |
| 文档 | 更新日志 | 查看版本历史：<br>[CHANGELOG.md](https://github.com/HaoCeans/siyuan-toolbar-customizer/blob/main/CHANGELOG.md) |
| 协议 | 许可证 | MIT License（详见 LICENSE 文件） |
| 社区 | 贡献 | 欢迎提交 Issue 与 Pull Request |
| 支持 | 问题反馈 | GitHub Issues：<br>👉 https://github.com/siyuan-note/siyuan-toolbar-customizer/issues |
| 支持 | 社区讨论 | 思源社区：<br>👉 https://ld246.com |
| 致谢 | 基础 | 基于 [思源笔记插件系统](https://github.com/siyuan-note/siyuan) |
| 致谢 | 图标 | 来自 [Lucide](https://lucide.dev/) |
| 致谢 | 模板 | 基于 [Vite + Vue 插件模板](https://github.com/siyuan-note/siyuan-toolbar-customizer) |

</details>
