# Toolbar Customizer

A powerful toolbar customization plugin for SiYuan Notes that provides comprehensive control over your workspace toolbar on both desktop and mobile platforms.

## Features

### Desktop Features

- **Custom Buttons**: Add unlimited custom buttons to your toolbar
  - Built-in function shortcuts (e.g., settings, search, appearance)
  - Template insertion buttons
  - Click-sequence automation for complex operations
- **Button Configuration**: Full control over button appearance
  - Custom icons (SiYuan icons or Emoji)
  - Adjustable icon size, width, margins
  - Button sorting and positioning
- **Smart Element Selection**: Simplified selectors with intelligent matching
  - Supports CSS selectors, text content, name attributes, and aria-labels
  - Multi-step click sequences for automation

### Mobile Features

- **Toolbar Position Control**: Dock toolbar to bottom of screen
  - Automatic adjustment when keyboard opens/closes
  - Configurable offsets and height thresholds
  - Smooth animations
- **Visual Customization**:
  - Background color picker
  - Adjustable transparency (0-100%)
- **Gesture Control**: 
  - Disable left/right swipe to prevent accidental menu opening
  - Optional file tree and settings menu disabling

### Additional Features

- **Dual Platform Support**: Separate configurations for desktop and mobile
- **Global Button Width Control**: Set consistent button widths across toolbar
- **Hide Built-in Buttons**: Hide specific SiYuan toolbar buttons you don't use
- **Integrated Help System**: 
  - Platform-specific help documentation
  - Click-to-navigate help links in settings
  - Built-in function ID reference

## Installation

### From Plugin Marketplace

1. Open SiYuan Notes
2. Go to Settings → Marketplace → Plugins
3. Search for "Toolbar Customizer"
4. Click Install

### Manual Installation

1. Download the latest release from [GitHub Releases](https://github.com/siyuan-note/siyuan-toolbar-customizer/releases)
2. Extract the zip file
3. Copy the folder to `{workspace}/data/plugins/`
4. Restart SiYuan Notes
5. Enable the plugin in Settings → Marketplace → Downloaded

## Usage Guide

### Adding Custom Buttons

1. Open plugin settings
2. Navigate to "Desktop Custom Buttons" or "Mobile Custom Buttons"
3. Click "Add New Button"
4. Configure button properties:
   - **Name**: Display name for the button
   - **Type**: Choose functionality type
     - Built-in: Execute SiYuan built-in functions
     - Template: Insert predefined text/templates
     - Click Sequence: Automate multi-step operations
   - **Icon**: Select icon or enter emoji
   - **Size & Spacing**: Adjust visual appearance

### Using Click Sequences

Click sequences allow you to automate complex operations by simulating clicks on multiple elements in sequence.

**Example**: Create a button to open the AI chat in a specific document

1. Add new button with type "Click Sequence"
2. Add selectors in order:
   ```
   [aria-label="AI Chat"]
   button:contains("Open in Document")
   ```
3. The plugin will click each element in sequence

For detailed selector syntax, see `README_CLICK_SEQUENCE.md`

### Mobile Toolbar Configuration

1. Enable "Dock Toolbar to Bottom" in mobile settings
2. Configure offsets:
   - **Closed Input Offset**: Distance from bottom when keyboard is closed (e.g., `0px`)
   - **Open Input Offset**: Distance from bottom when keyboard is open (e.g., `50px`)
3. Adjust transparency and background color
4. Optional: Disable swipe gestures to prevent accidental menu opening

### Hiding Built-in Buttons

1. Go to "Small Features" section
2. Enter button selectors to hide (one per line)
   ```
   [data-type="readonly"]
   [data-type="doc"]
   ```

## Configuration Examples

### Example 1: Quick Template Button

```
Name: Daily Note Template
Type: Template
Template Content: 
# {{date}}

## Tasks
- [ ] 

## Notes

Icon: 📝
```

### Example 2: AI Chat Automation

```
Name: Quick AI
Type: Click Sequence
Selectors:
  [aria-label="AI"]
  .dialog-open
Icon: 🤖
```

## Troubleshooting

### Buttons Not Appearing

- Check if plugin is enabled in marketplace
- Verify platform selection (Desktop/Mobile/Both)
- Refresh page after configuration changes

### Click Sequence Not Working

- Open browser console to check selector errors
- Verify elements exist on page
- Use simpler selectors or text matching
- Check timing - some elements may load slowly

### Mobile Toolbar Issues

- Ensure "Dock Toolbar to Bottom" is enabled
- Check offset values are valid CSS units (px, vh, etc.)
- Try disabling swipe gestures if toolbar is jumpy

## Development

### Build from Source

```bash
# Clone repository
git clone https://github.com/siyuan-note/siyuan-toolbar-customizer.git
cd siyuan-toolbar-customizer

# Install dependencies
npm install

# Development mode with hot reload
npm run dev

# Build for production
npm run build
```

### Project Structure

```
├── src/
│   ├── index.ts          # Main plugin logic
│   ├── toolbarManager.ts # Toolbar configuration & initialization
│   ├── App.vue           # Vue component for settings UI
│   └── index.scss        # Plugin styles
├── public/               # Static assets
├── plugin.json           # Plugin metadata
└── README.md            # Documentation
```

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history.

## License

MIT License - see LICENSE file for details

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## Support

- GitHub Issues: [Report bugs or request features](https://github.com/siyuan-note/siyuan-toolbar-customizer/issues)
- SiYuan Community: [Discuss in forums](https://ld246.com)

## Acknowledgments

- Built with [SiYuan Plugin System](https://github.com/siyuan-note/siyuan)
- Icons from [Lucide](https://lucide.dev/)
- Template based on [Vite + Vue Plugin Template](https://github.com/siyuan-note/siyuan-toolbar-customizer)
