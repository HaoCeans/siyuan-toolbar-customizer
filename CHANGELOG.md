# Changelog

All notable changes to the Toolbar Customizer plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.7.2] - 2026-07-18

### Fixed

- **手机端"思源内置功能"按钮失效**：思源 v3.7 重构手机端设置菜单，按钮 ID 全部改名（`menuAccount` → `menuConfigSync` 等）。新增旧 ID → 新 ID 别名映射表，老用户配置无需任何改动自动兼容。
- **手机端激活码无法激活**：手机端激活逻辑未传入思源账号导致账号绑定校验失败；激活后未保存 `authorAccount`，重启后激活态丢失。现与电脑端激活逻辑完全对齐。

### Added

- 内置按钮选择器列表更新为思源 v3.7 最新 ID（27 项），新增"密钥和变量"、"鉴权"、"应用"、"用户指南"等。
- `menu*` 系列按钮的手机端兜底逻辑：找不到时自动先打开 `#toolbarMore` 菜单再点击。
- `isMobileUIContext()`：综合 UA / URL pathname / DOM 特征判断手机端，修复 PC 浏览器预览 `/mobile/` 路径时判断失效。

## [1.0.0] - 2026-01-15

### Added

#### Desktop Features
- Custom button system with unlimited buttons
  - Built-in function shortcuts (settings, search, appearance, etc.)
  - Template insertion buttons for quick text/code snippets
  - Click-sequence automation for complex multi-step operations
- Button configuration options
  - Custom icons (SiYuan icons and Emoji support)
  - Adjustable icon size, width, and margins
  - Sorting and positioning controls
- Smart element selection system
  - CSS selector support
  - Text content matching (`:contains()`)
  - Name attribute and aria-label matching
  - Multi-step click sequences
- Global button width control
- Hide built-in buttons feature
- Integrated help system with clickable navigation links

#### Mobile Features
- Toolbar position control
  - Dock toolbar to bottom of screen
  - Automatic keyboard adjustment (open/close detection)
  - Configurable offset values for keyboard states
  - Height threshold configuration for reliable detection
  - Smooth transition animations
- Visual customization
  - Background color picker
  - Transparency slider (0-100%)
- Gesture control
  - Disable left/right swipe to prevent accidental menu opening
  - Optional file tree access disabling
  - Optional settings menu access disabling

#### General Features
- Dual platform support (desktop and mobile with separate configurations)
- Backward compatibility getter/setter for legacy button arrays
- Platform-specific help documentation
  - Desktop help with built-in function ID reference
  - Mobile help with configuration examples
  - Click-sequence usage guide
- Comprehensive settings UI with Vue3
- Real-time configuration persistence

### Technical Details
- Built with Vite + Vue3 + TypeScript
- Uses SiYuan Plugin API 2.10.14+
- Modular architecture with separate toolbar manager
- SCSS styling with theme variable integration
- MutationObserver for dynamic element detection
- Touch event handling for mobile gestures

### Known Issues
- Click sequences may fail if target elements load slowly
- Mobile toolbar adjustment requires page refresh after first enable
- Some third-party themes may override toolbar styles

---

## Future Considerations

### Planned for v1.1.0
- Button import/export functionality
- Preset button templates
- Button group organization
- Advanced click sequence editor with visual preview
- More built-in function shortcuts

### Under Consideration
- Toolbar themes
- Button animation effects
- Conditional button visibility (based on document type, etc.)
- Keyboard shortcuts for custom buttons
- Multi-language support for button names

---

**Note**: This is the initial release. Please report any issues on [GitHub Issues](https://github.com/siyuan-note/siyuan-toolbar-customizer/issues).
