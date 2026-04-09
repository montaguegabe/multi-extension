import fs from "fs";
import { exec } from "child_process";
import path from "path";
import * as vscode from "vscode";

import {
  getRelativePathToWorkspace,
  getSyncCommandForRelativePath,
  shouldSkipSyncForRelativePath,
  type SyncCommand,
} from "./sync";

let vscodeWatcher: vscode.FileSystemWatcher | undefined;
let cursorRulesWatcher: vscode.FileSystemWatcher | undefined;
let devcontainerWatcher: vscode.FileSystemWatcher | undefined;
let githubWatcher: vscode.FileSystemWatcher | undefined;
let multiConfigWatcher: vscode.FileSystemWatcher | undefined;
let outputChannel: vscode.OutputChannel;
let taskProvider: vscode.Disposable | undefined;

const pendingSync = new Map<SyncCommand, NodeJS.Timeout>();
const DEBOUNCE_MS = 300;

function getWorkspaceRootForFile(filePath: string): string | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return undefined;
  }

  for (const folder of workspaceFolders) {
    const workspaceRoot = folder.uri.fsPath;
    if (
      filePath === workspaceRoot ||
      filePath.startsWith(workspaceRoot + path.sep)
    ) {
      return workspaceRoot;
    }
  }

  return undefined;
}

function isMonorepoWorkspace(workspaceRoot: string): boolean {
  const multiJsonPath = path.join(workspaceRoot, "multi.json");
  if (!fs.existsSync(multiJsonPath)) {
    return false;
  }

  try {
    const multiJson = JSON.parse(fs.readFileSync(multiJsonPath, "utf-8")) as {
      monoRepo?: boolean;
    };
    return multiJson.monoRepo === true;
  } catch (error) {
    outputChannel.appendLine(
      `Unable to read multi.json while checking monoRepo mode: ${String(error)}`
    );
    return false;
  }
}

function runMultiSync(changedFile: string) {
  const workspaceRoot = getWorkspaceRootForFile(changedFile);
  if (!workspaceRoot) {
    return;
  }

  const relativePath = getRelativePathToWorkspace(changedFile, workspaceRoot);
  if (!relativePath) {
    return;
  }

  const syncCommand = getSyncCommandForRelativePath(relativePath);
  if (!syncCommand) {
    return;
  }

  if (
    syncCommand === "multi sync github" &&
    !isMonorepoWorkspace(workspaceRoot)
  ) {
    outputChannel.appendLine(
      `Skipping non-monorepo GitHub workflow change: ${changedFile}`
    );
    return;
  }

  const existing = pendingSync.get(syncCommand);
  if (existing) {
    clearTimeout(existing);
  }

  pendingSync.set(
    syncCommand,
    setTimeout(() => {
      pendingSync.delete(syncCommand);

      if (
        shouldSkipSyncForRelativePath(relativePath, changedFile, fs.existsSync)
      ) {
        outputChannel.appendLine(`Skipping generated file: ${changedFile}`);
        return;
      }

      executeSync(syncCommand, changedFile, workspaceRoot);
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

function executeSync(
  syncCommand: SyncCommand,
  changedFile: string,
  workspaceRoot: string
) {
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

  // Watch for .vscode config file changes. Generated outputs are filtered in runMultiSync.
  vscodeWatcher = vscode.workspace.createFileSystemWatcher(
    "**/.vscode/{launch,launch.shared,settings,settings.shared,settings.local,tasks,tasks.shared,extensions}.json"
  );

  vscodeWatcher.onDidChange((uri) => runMultiSync(uri.fsPath));
  vscodeWatcher.onDidCreate((uri) => runMultiSync(uri.fsPath));
  vscodeWatcher.onDidDelete((uri) => runMultiSync(uri.fsPath));

  // Watch for .cursor/rules files. Generated repo-directories.mdc is filtered in runMultiSync.
  cursorRulesWatcher = vscode.workspace.createFileSystemWatcher(
    "**/.cursor/rules/*.mdc"
  );

  cursorRulesWatcher.onDidChange((uri) => runMultiSync(uri.fsPath));
  cursorRulesWatcher.onDidCreate((uri) => runMultiSync(uri.fsPath));
  cursorRulesWatcher.onDidDelete((uri) => runMultiSync(uri.fsPath));

  // Watch for .devcontainer directory changes. Root output is filtered in runMultiSync.
  devcontainerWatcher = vscode.workspace.createFileSystemWatcher(
    "**/.devcontainer/**"
  );

  devcontainerWatcher.onDidChange((uri) => runMultiSync(uri.fsPath));
  devcontainerWatcher.onDidCreate((uri) => runMultiSync(uri.fsPath));
  devcontainerWatcher.onDidDelete((uri) => runMultiSync(uri.fsPath));

  // Watch for .github workflow changes. Root output is filtered in runMultiSync.
  githubWatcher = vscode.workspace.createFileSystemWatcher(
    "**/.github/workflows/*.{yml,yaml}"
  );

  githubWatcher.onDidChange((uri) => runMultiSync(uri.fsPath));
  githubWatcher.onDidCreate((uri) => runMultiSync(uri.fsPath));
  githubWatcher.onDidDelete((uri) => runMultiSync(uri.fsPath));

  multiConfigWatcher = vscode.workspace.createFileSystemWatcher("multi.json");

  multiConfigWatcher.onDidChange((uri) => runMultiSync(uri.fsPath));
  multiConfigWatcher.onDidCreate((uri) => runMultiSync(uri.fsPath));
  multiConfigWatcher.onDidDelete((uri) => runMultiSync(uri.fsPath));

  context.subscriptions.push(
    outputChannel,
    vscodeWatcher,
    cursorRulesWatcher,
    devcontainerWatcher,
    githubWatcher,
    multiConfigWatcher,
    taskProvider,
    ...openInDesktopCommands
  );
}

export function deactivate() {
  vscodeWatcher?.dispose();
  cursorRulesWatcher?.dispose();
  devcontainerWatcher?.dispose();
  githubWatcher?.dispose();
  multiConfigWatcher?.dispose();
  taskProvider?.dispose();
  outputChannel?.dispose();
}
