# Changelog

All notable changes to the Toolbar Customizer plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
