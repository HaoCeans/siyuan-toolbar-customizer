
### 核心功能亮点

- 🎨 **自由定制工具栏布局**，满足个性化使用需求  
- 📱 **兼容桌面与手机端**，无缝衔接多终端操作体验  
- ⚙️ **简洁易用的配置界面**，无需复杂操作即可生效  
- 🚀 **高性能低资源占用**，流畅运行不拖慢笔记速度  

### 问题反馈请QQ群

<div align="center">
  <img src="https://raw.githubusercontent.com/HaoCeans/siyuan-toolbar-customizer/main/preview2.png" alt="问题反馈群" width="300">
</div>

<hr style="border: none; height: 3px; background-color: red;">

# 📌 v1.1.2更新说明

## 🛠 修复

修复了部分Bug

## ✨ 新增
1. 增加执行快捷键按钮（几乎支持电脑端所有快捷键，不排除部分失效，等待反馈）
2. 栏内按钮均匀分布设置

---

# 📌 v1.0.6更新说明

## 🛠 修复

修复了**工具栏按钮全部删除，会重新出现**的问题  

---
# 📌 v1.0.5更新说明

## 🛠 修复

1. 修复了**插件设置中“保存 / 取消”按钮位置**异常，导致影响思源原有设置布局的问题  
2. 修复了**工具栏按钮无法正常删除**的问题  
3. 修复了**底部工具栏遮挡设置界面**的问题  

## ✨ 新增
1. 新增**插入模板内容**功能，支持自动填充**时间、日期**  
2. 手机端新增**工具栏高度设置**  
3. 手机端新增**工具栏层级（z-index）设置**

---


<hr style="border: none; height: 3px; background-color: red;">


## 功能特性

### 桌面端功能

- **自定义按钮**：为工具栏添加无限制的自定义按钮
  - 内置功能快捷方式（如：设置、搜索、外观）
  - 模板插入按钮
  - 点击序列自动化执行复杂操作
- **按钮配置**：完全控制按钮外观
  - 自定义图标（思源图标或 Emoji）
  - 可调节图标大小、宽度、边距
  - 按钮排序和定位
- **智能元素选择**：简化选择器与智能匹配
  - 支持 CSS 选择器、文本内容、name 属性和 aria-label
  - 多步点击序列实现自动化

### 移动端功能

- **工具栏位置控制**：将工具栏固定到屏幕底部
  - 输入法打开/关闭时自动调整
  - 可配置偏移量和高度阈值
  - 流畅动画效果
- **视觉定制**：
  - 背景颜色选择器
  - 可调节透明度（0-100%）
- **手势控制**：
  - 禁用左右滑动以防止误触菜单
  - 可选禁用文档树和设置菜单

### 其他功能

- **双端独立支持**：桌面端和移动端分别配置
- **全局按钮宽度控制**：为工具栏设置统一的按钮宽度
- **隐藏内置按钮**：隐藏你不使用的思源工具栏按钮
- **集成帮助系统**：
  - 平台特定的帮助文档
  - 设置中可点击跳转的帮助链接
  - 内置功能 ID 参考:[思源笔记常用功能 ID 速查表](https://github.com/HaoCeans/siyuan-toolbar-customizer/blob/v1.0.4/README_BUILTIN_IDS.md) 


<hr style="border: none; height: 3px; background-color: red;">


## 《使用指南》

### 添加自定义按钮

1. 打开插件设置
2. 进入"电脑端自定义按钮"或"手机端自定义按钮"
3. 点击"添加新按钮"
4. 配置按钮属性：
   - **名称**：按钮的显示名称
   - **类型**：选择功能类型
     - 内置功能：执行思源内置功能
     - 模板：插入预定义的文本/模板
     - 点击序列：自动化多步操作
   - **图标**：选择图标或输入 emoji
   - **大小和间距**：调整视觉外观

### 使用点击序列

点击序列允许你通过模拟按顺序点击多个元素来自动化复杂操作。

**示例**：创建一个按钮打开特定文档中的 AI 对话

1. 添加类型为"点击序列"的新按钮
2. 按顺序添加选择器：
   ```
   [aria-label="AI 对话"]
   button:contains("在文档中打开")
   ```
3. 插件将按顺序点击每个元素

详细选择器语法请参见:[模拟点击序列使用说明](https://github.com/HaoCeans/siyuan-toolbar-customizer/blob/main/README_CLICK_SEQUENCE.md) 

### 移动端工具栏配置

1. 在移动端设置中启用"工具栏置底"
2. 配置偏移量：
   - **输入法关闭偏移**：键盘关闭时距离底部的距离（如 `0px`）
   - **输入法打开偏移**：键盘打开时距离底部的距离（如 `50px`）
3. 调整透明度和背景颜色
4. 可选：禁用滑动手势以防止误触菜单

### 隐藏内置按钮

1. 进入"小功能选择"部分
2. 输入要隐藏的按钮选择器（每行一个）
   ```
   [data-type="readonly"]
   [data-type="doc"]
   ```

## 配置示例

### 示例 1：快速模板按钮

```
名称：每日笔记模板
类型：模板
模板内容：
# {{date}}

## 任务
- [ ] 

## 笔记

图标：📝
```

### 示例 2：AI 对话自动化

```
名称：快速 AI
类型：点击序列
选择器：
  [aria-label="AI"]
  .dialog-open
图标：🤖
```

## 故障排除

### 按钮未显示

- 检查插件是否在集市中启用
- 验证平台选择（桌面端/移动端/两者）
- 配置更改后刷新页面

### 点击序列不工作

- 打开浏览器控制台检查选择器错误
- 验证页面上是否存在元素
- 使用更简单的选择器或文本匹配
- 检查时机 - 某些元素可能加载缓慢

### 移动端工具栏问题

- 确保已启用"工具栏置底"
- 检查偏移值是否为有效的 CSS 单位（px、vh 等）
- 如果工具栏跳动，尝试禁用滑动手势


<hr style="border: none; height: 3px; background-color: red;">

## 🧧 打赏支持

感谢您的支持，这将鼓励作者持续开发

<div align="center">
  <img src="https://raw.githubusercontent.com/HaoCeans/siyuan-toolbar-customizer/main/payment1.png" alt="打赏二维码" width="300">
</div>

<div align="center">
  <img src="https://raw.githubusercontent.com/HaoCeans/siyuan-toolbar-customizer/main/payment2.png" alt="打赏二维码" width="300">
</div>


<hr style="border: none; height: 3px; background-color: red;">


## 安装

### 从插件集市安装

1. 打开思源笔记
2. 进入 设置 → 集市 → 插件
3. 搜索"工具栏定制器"
4. 点击安装

### 手动安装

1. 从 [GitHub Releases](https://github.com/siyuan-note/siyuan-toolbar-customizer/releases) 下载最新版本
2. 解压 zip 文件
3. 将文件夹复制到 `{工作空间}/data/plugins/`
4. 重启思源笔记
5. 在 设置 → 集市 → 已下载 中启用插件

<hr style="border: none; height: 3px; background-color: red;">

## 开发

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/siyuan-note/siyuan-toolbar-customizer.git
cd siyuan-toolbar-customizer

# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 生产构建
npm run build
```

### 项目结构

```
├── src/
│   ├── index.ts          # 主插件逻辑
│   ├── toolbarManager.ts # 工具栏配置和初始化
│   ├── App.vue           # 设置界面 Vue 组件
│   └── index.scss        # 插件样式
├── public/               # 静态资源
├── plugin.json           # 插件元数据
└── README.md            # 文档
```

## 更新日志

查看 [CHANGELOG.md](https://github.com/HaoCeans/siyuan-toolbar-customizer/blob/main/CHANGELOG.md) 了解版本历史。

## 许可证

MIT 许可证 - 详见 LICENSE 文件

## 贡献

欢迎贡献！请随时提交问题和拉取请求。

## 支持

- GitHub Issues：[报告错误或请求功能](https://github.com/siyuan-note/siyuan-toolbar-customizer/issues)
- 思源社区：[在论坛讨论](https://ld246.com)

## 致谢

- 基于 [思源笔记插件系统](https://github.com/siyuan-note/siyuan) 构建
- 图标来自 [Lucide](https://lucide.dev/)
- 模板基于 [Vite + Vue 插件模板](https://github.com/siyuan-note/siyuan-toolbar-customizer)

