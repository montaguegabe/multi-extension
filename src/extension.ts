import { exec } from "child_process";
import path from "path";
import * as vscode from "vscode";

import { getSyncCommand, SyncType } from "./sync";

let vscodeWatcher: vscode.FileSystemWatcher | undefined;
let cursorRulesWatcher: vscode.FileSystemWatcher | undefined;
let devcontainerWatcher: vscode.FileSystemWatcher | undefined;
let githubWatcher: vscode.FileSystemWatcher | undefined;
let outputChannel: vscode.OutputChannel;
let taskProvider: vscode.Disposable | undefined;

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
    const rootDevcontainer = path.join(folder.uri.fsPath, ".devcontainer");
    const rootGithub = path.join(folder.uri.fsPath, ".github");
    if (
      filePath.startsWith(rootVscode + path.sep) ||
      filePath.startsWith(rootCursor + path.sep) ||
      filePath.startsWith(rootDevcontainer + path.sep) ||
      filePath.startsWith(rootGithub + path.sep)
    ) {
      return true;
    }
  }
  return false;
}

function runMultiSync(type: SyncType, changedFile: string) {
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

type OpenInDesktopResult = {
  success: boolean;
  message: string;
};

async function openActiveFileInMultiDesktop(): Promise<OpenInDesktopResult> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return { success: false, message: "No active editor." };
  }

  if (editor.document.uri.scheme !== "file") {
    return { success: false, message: "Active editor is not a file." };
  }

  const filePath = editor.document.uri.fsPath;
  const deepLink = `multi://open?path=${encodeURIComponent(filePath)}`;
  const opened = await vscode.env.openExternal(vscode.Uri.parse(deepLink));
  if (!opened) {
    return { success: false, message: "Unable to open Multi Desktop deep link." };
  }

  return { success: true, message: `Opened in Multi Desktop: ${filePath}` };
}

class MultiTaskProvider implements vscode.TaskProvider {
  static MultiType = "multi";

  private createSyncTask(): vscode.Task {
    const syncTask = new vscode.Task(
      { type: MultiTaskProvider.MultiType, task: "sync" },
      vscode.TaskScope.Workspace,
      "Sync",
      "multi",
      new vscode.ShellExecution("multi sync"),
      []
    );
    syncTask.group = vscode.TaskGroup.Build;
    return syncTask;
  }

  private createOpenCurrentFileTask(): vscode.Task {
    const openCurrentFileTask = new vscode.Task(
      { type: MultiTaskProvider.MultiType, task: "open-current-file" },
      vscode.TaskScope.Workspace,
      "Open in Multi Desktop",
      "multi",
      new vscode.CustomExecution(async () => {
        return new OpenCurrentFileTaskTerminal();
      }),
      []
    );
    return openCurrentFileTask;
  }

  provideTasks(): vscode.Task[] {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      return [];
    }

    return [this.createSyncTask(), this.createOpenCurrentFileTask()];
  }

  resolveTask(task: vscode.Task): vscode.Task | undefined {
    const definition = task.definition as { task?: string };
    if (definition.task === "sync") {
      return this.createSyncTask();
    }
    if (definition.task === "open-current-file") {
      return this.createOpenCurrentFileTask();
    }
    return undefined;
  }
}

class OpenCurrentFileTaskTerminal implements vscode.Pseudoterminal {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  private readonly closeEmitter = new vscode.EventEmitter<number>();

  readonly onDidWrite = this.writeEmitter.event;
  readonly onDidClose = this.closeEmitter.event;

  open(): void {
    void this.run();
  }

  close(): void {}

  private async run(): Promise<void> {
    const result = await openActiveFileInMultiDesktop();
    this.writeEmitter.fire(`${result.message}\r\n`);
    this.closeEmitter.fire(result.success ? 0 : 1);
  }
}

function executeSync(type: SyncType, changedFile: string) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return;
  }

  const syncCommand = getSyncCommand(type);

  outputChannel.appendLine(`File changed: ${changedFile}`);
  outputChannel.appendLine(`Running: ${syncCommand}`);

  exec(syncCommand, { cwd: workspaceRoot }, (error, stdout, stderr) => {
    if (error) {
      outputChannel.appendLine(`Error: ${error.message}`);
      vscode.window.showErrorMessage(
        `${syncCommand} failed: ${error.message}`
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

  const runOpenInDesktopCommand = async () => {
    const result = await openActiveFileInMultiDesktop();
    if (!result.success) {
      vscode.window.showErrorMessage(result.message);
      return;
    }

    outputChannel.appendLine(result.message);
  };

  const openInDesktopCommands = [
    vscode.commands.registerCommand(
      "multi-sync.openInDesktop",
      runOpenInDesktopCommand
    ),
    // Backward-compatible alias for existing keybindings.
    vscode.commands.registerCommand("multi.openInDesktop", runOpenInDesktopCommand),
  ];

  // Register task provider
  taskProvider = vscode.tasks.registerTaskProvider(
    MultiTaskProvider.MultiType,
    new MultiTaskProvider()
  );

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

  cursorRulesWatcher.onDidChange((uri) => runMultiSync("rules", uri.fsPath));
  cursorRulesWatcher.onDidCreate((uri) => runMultiSync("rules", uri.fsPath));
  cursorRulesWatcher.onDidDelete((uri) => runMultiSync("rules", uri.fsPath));

  // Watch for .devcontainer directory changes (root folder is filtered out in runMultiSync)
  devcontainerWatcher = vscode.workspace.createFileSystemWatcher(
    "**/.devcontainer/**"
  );

  devcontainerWatcher.onDidChange((uri) => runMultiSync("vscode", uri.fsPath));
  devcontainerWatcher.onDidCreate((uri) => runMultiSync("vscode", uri.fsPath));
  devcontainerWatcher.onDidDelete((uri) => runMultiSync("vscode", uri.fsPath));

  // Watch for .github workflow changes (root folder is filtered out in runMultiSync)
  githubWatcher = vscode.workspace.createFileSystemWatcher(
    "**/.github/workflows/*.{yml,yaml}"
  );

  githubWatcher.onDidChange((uri) => runMultiSync("github", uri.fsPath));
  githubWatcher.onDidCreate((uri) => runMultiSync("github", uri.fsPath));
  githubWatcher.onDidDelete((uri) => runMultiSync("github", uri.fsPath));

  context.subscriptions.push(
    outputChannel,
    vscodeWatcher,
    cursorRulesWatcher,
    devcontainerWatcher,
    githubWatcher,
    taskProvider,
    ...openInDesktopCommands
  );
}

export function deactivate() {
  vscodeWatcher?.dispose();
  cursorRulesWatcher?.dispose();
  devcontainerWatcher?.dispose();
  githubWatcher?.dispose();
  taskProvider?.dispose();
  outputChannel?.dispose();
}
