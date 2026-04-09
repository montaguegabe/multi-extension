# Multi VS Code Extension

`multi` is the best way to work with VS Code/Cursor on multiple Git repos at once. It is an alternative to [multi-root workspaces](https://code.visualstudio.com/docs/editing/workspaces/multi-root-workspaces) that offers more flexibility and control. With `multi`, you can gain control over how tasks, debug runnables, and various IDE and linter settings are combined from multiple project repos ("sub-repos") located in the same folder.

NOTE: You must have installed `multi` with `pipx install multi-workspace` or `uv tool install multi-workspace` in order for this extension to work.

## Features

- Runs the matching `multi sync ...` command when watched source files change.
- Regenerates root `.vscode` outputs from repo config files and workspace-level shared files.
- Generates both `CLAUDE.md` and `AGENTS.md` when Cursor rules change.
- Syncs root `.github/workflows` files from repo workflows in monorepo mode.

## Requirements

This extension requires:

- **multi CLI**: Must be installed and accessible via the [multi](https://github.com/montaguegabe/multi) command (`pipx install multi-workspace` or `uv tool install multi-workspace`)
- **VS Code**: Version 1.99.0 or higher

To verify the multi CLI is available, run `multi --version` in your terminal.

## Usage

The extension activates automatically when VS Code starts. Simply edit any of the watched config files and the appropriate sync will run in the background.

Watched files:

- `.vscode/launch.json`
- `.vscode/launch.shared.json`
- `.vscode/settings.json`
- `.vscode/settings.shared.json`
- `.vscode/settings.local.json`
- `.vscode/tasks.json`
- `.vscode/tasks.shared.json`
- `.vscode/extensions.json`
- `.cursor/rules/*.mdc`
- `.github/workflows/*.{yml,yaml}`
- `multi.json`

The extension ignores generated outputs like root `.vscode/settings.json`, root `.devcontainer/`, root `.github/workflows/`, and root `.cursor/rules/repo-directories.mdc` so it does not loop on its own writes.
