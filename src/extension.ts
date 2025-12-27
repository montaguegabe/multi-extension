import { exec } from "child_process";
import path from "path";
import * as vscode from "vscode";

let vscodeWatcher: vscode.FileSystemWatcher | undefined;
let cursorRulesWatcher: vscode.FileSystemWatcher | undefined;
let outputChannel: vscode.OutputChannel;

const pendingSync = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_MS = 300;

function isAtWorkspaceRoot(filePath: string): boolean {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return false;
  }

  for (const folder of workspaceFolders) {
    const rootVscode = path.join(folder.uri.fsPath, ".vscode");
    const rootCursor = path.join(folder.uri.fsPath, ".cursor");
    if (
      filePath.startsWith(rootVscode + path.sep) ||
      filePath.startsWith(rootCursor + path.sep)
    ) {
      return true;
    }
  }
  return false;
}

function runMultiSync(type: "vscode" | "claude", changedFile: string) {
  // Debounce: cancel any pending sync for this type and schedule a new one
  const existing = pendingSync.get(type);
  if (existing) {
    clearTimeout(existing);
  }

  pendingSync.set(
    type,
    setTimeout(() => {
      pendingSync.delete(type);

      // Skip files at the workspace root to avoid infinite loops
      if (isAtWorkspaceRoot(changedFile)) {
        outputChannel.appendLine(`Skipping root config file: ${changedFile}`);
        return;
      }

      executeSync(type, changedFile);
    }, DEBOUNCE_MS)
  );
}

function executeSync(type: "vscode" | "claude", changedFile: string) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return;
  }

  const command = `multi sync ${type}`;

  outputChannel.appendLine(`File changed: ${changedFile}`);
  outputChannel.appendLine(`Running: ${command}`);

  exec(command, { cwd: workspaceRoot }, (error, stdout, stderr) => {
    if (error) {
      outputChannel.appendLine(`Error: ${error.message}`);
      vscode.window.showErrorMessage(
        `multi sync ${type} failed: ${error.message}`
      );
      return;
    }

    if (stderr) {
      outputChannel.appendLine(`stderr: ${stderr}`);
    }

    if (stdout) {
      outputChannel.appendLine(`stdout: ${stdout}`);
    }

    outputChannel.appendLine("");
  });
}

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("Multi Workspace");
  outputChannel.appendLine("Multi Workspace extension activated");

  // Watch for .vscode config file changes (root folder is filtered out in runMultiSync)
  vscodeWatcher = vscode.workspace.createFileSystemWatcher(
    "**/.vscode/{launch,settings,tasks,extensions}.json"
  );

  vscodeWatcher.onDidChange((uri) => runMultiSync("vscode", uri.fsPath));
  vscodeWatcher.onDidCreate((uri) => runMultiSync("vscode", uri.fsPath));
  vscodeWatcher.onDidDelete((uri) => runMultiSync("vscode", uri.fsPath));

  // Watch for .cursor/rules directory changes (root folder is filtered out in runMultiSync)
  cursorRulesWatcher = vscode.workspace.createFileSystemWatcher(
    "**/.cursor/rules/**"
  );

  cursorRulesWatcher.onDidChange((uri) => runMultiSync("claude", uri.fsPath));
  cursorRulesWatcher.onDidCreate((uri) => runMultiSync("claude", uri.fsPath));
  cursorRulesWatcher.onDidDelete((uri) => runMultiSync("claude", uri.fsPath));

  context.subscriptions.push(outputChannel, vscodeWatcher, cursorRulesWatcher);
}

export function deactivate() {
  vscodeWatcher?.dispose();
  cursorRulesWatcher?.dispose();
  outputChannel?.dispose();
}
