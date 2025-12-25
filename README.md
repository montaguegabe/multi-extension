# Multi Sync VS Code Extension

Automatically syncs VS Code and Cursor configuration files using the `multi` CLI. This extension watches for changes to config files and triggers the appropriate sync command.

## Features

This extension automatically watches for file changes and runs sync commands:

- **VS Code Config Sync**: Watches `.vscode/launch.json`, `.vscode/settings.json`, `.vscode/tasks.json`, and `.vscode/extensions.json` — runs `multi sync vscode` on changes
- **Cursor Rules Sync**: Watches files in `.cursor/rules/` — runs `multi sync claude` on changes
- **Automatic**: No manual commands needed; syncs happen automatically on file create, change, or delete

## Requirements

This extension requires:

- **multi CLI**: Must be installed and accessible via the `multi` command
- **VS Code**: Version 1.99.0 or higher

To verify the multi CLI is available, run `multi --help` in your terminal.

## Usage

The extension activates automatically when VS Code starts. Simply edit any of the watched config files and the appropriate sync will run in the background.

Watched files:
- `.vscode/launch.json`
- `.vscode/settings.json`
- `.vscode/tasks.json`
- `.vscode/extensions.json`
- `.cursor/rules/*`

## Extension Settings

This extension does not contribute any VS Code settings at this time.

## Release Notes

### 0.0.1

Initial release of the Multi Sync extension.

- File watchers for VS Code config files
- File watchers for Cursor rules directory
- Automatic sync on file changes

---

## Development

To work on this extension:

1. Clone the repository
2. Run `npm install` to install dependencies
3. Open the project in VS Code
4. Press `F5` to launch a new Extension Development Host window
5. Test the extension in the new window

## Building and Installing

To package and install the extension locally:

```bash
npm run install-extension
```

This will package the extension and install it in Cursor.
