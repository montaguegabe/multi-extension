import { exec } from "child_process";
import * as vscode from "vscode";

let vscodeWatcher: vscode.FileSystemWatcher | undefined;
let cursorRulesWatcher: vscode.FileSystemWatcher | undefined;

function runMultiSync(type: "vscode" | "claude") {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return;
  }

  const command = `multi sync ${type}`;

  exec(command, { cwd: workspaceRoot }, (error, stdout, stderr) => {
    if (error) {
      vscode.window.showErrorMessage(`multi sync ${type} failed: ${error.message}`);
      return;
    }

    if (stderr) {
      console.log(`multi sync ${type} stderr: ${stderr}`);
    }

    if (stdout) {
      console.log(`multi sync ${type}: ${stdout}`);
    }
  });
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "multi-sync" is now active!');

  // Watch for .vscode config file changes (launch.json, settings.json, tasks.json, extensions.json)
  vscodeWatcher = vscode.workspace.createFileSystemWatcher(
    "**/.vscode/{launch,settings,tasks,extensions}.json"
  );

  vscodeWatcher.onDidChange(() => runMultiSync("vscode"));
  vscodeWatcher.onDidCreate(() => runMultiSync("vscode"));
  vscodeWatcher.onDidDelete(() => runMultiSync("vscode"));

  // Watch for .cursor/rules directory changes
  cursorRulesWatcher = vscode.workspace.createFileSystemWatcher(
    "**/.cursor/rules/**"
  );

  cursorRulesWatcher.onDidChange(() => runMultiSync("claude"));
  cursorRulesWatcher.onDidCreate(() => runMultiSync("claude"));
  cursorRulesWatcher.onDidDelete(() => runMultiSync("claude"));

  context.subscriptions.push(vscodeWatcher, cursorRulesWatcher);
}

export function deactivate() {
  if (vscodeWatcher) {
    vscodeWatcher.dispose();
  }
  if (cursorRulesWatcher) {
    cursorRulesWatcher.dispose();
  }
}
