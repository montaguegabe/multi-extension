import path from "path";

export type SyncCommand =
  | "multi sync"
  | "multi sync agents"
  | "multi sync github"
  | "multi sync vscode settings"
  | "multi sync vscode launch"
  | "multi sync vscode tasks"
  | "multi sync vscode extensions"
  | "multi sync vscode devcontainer";

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

export function getRelativePathToWorkspace(
  filePath: string,
  workspaceRoot: string
): string | undefined {
  const relativePath = path.relative(workspaceRoot, filePath);
  if (
    relativePath === "" ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    return undefined;
  }

  return toPosixPath(relativePath);
}

export function getSyncCommandForRelativePath(
  relativePath: string
): SyncCommand | undefined {
  if (relativePath === "multi.json") {
    return "multi sync";
  }

  if (
    relativePath === ".vscode/settings.shared.json" ||
    relativePath === ".vscode/settings.local.json" ||
    relativePath.endsWith("/.vscode/settings.json") ||
    relativePath.endsWith("/.vscode/settings.shared.json") ||
    relativePath.endsWith("/.vscode/settings.local.json")
  ) {
    return "multi sync vscode settings";
  }

  if (
    relativePath === ".vscode/launch.shared.json" ||
    relativePath.endsWith("/.vscode/launch.json") ||
    relativePath.endsWith("/.vscode/launch.shared.json")
  ) {
    return "multi sync vscode launch";
  }

  if (
    relativePath === ".vscode/tasks.shared.json" ||
    relativePath.endsWith("/.vscode/tasks.json") ||
    relativePath.endsWith("/.vscode/tasks.shared.json")
  ) {
    return "multi sync vscode tasks";
  }

  if (
    relativePath === ".vscode/extensions.json" ||
    relativePath.endsWith("/.vscode/extensions.json")
  ) {
    return "multi sync vscode extensions";
  }

  if (
    relativePath.startsWith(".devcontainer/") ||
    relativePath.includes("/.devcontainer/")
  ) {
    return "multi sync vscode devcontainer";
  }

  if (
    (relativePath.startsWith("AGENTS.parts/") ||
      relativePath.includes("/AGENTS.parts/")) &&
    relativePath.endsWith(".md")
  ) {
    return "multi sync agents";
  }

  if (
    (relativePath.startsWith(".github/workflows/") ||
      relativePath.includes("/.github/workflows/")) &&
    (relativePath.endsWith(".yml") || relativePath.endsWith(".yaml"))
  ) {
    return "multi sync github";
  }

  return undefined;
}

export function shouldSkipSyncForRelativePath(
  relativePath: string,
  absolutePath: string,
  pathExists: (filePath: string) => boolean = () => false
): boolean {
  if (
    relativePath === ".vscode/settings.json" ||
    relativePath === ".vscode/launch.json" ||
    relativePath === ".vscode/tasks.json" ||
    relativePath === ".vscode/extensions.json"
  ) {
    return true;
  }

  if (
    relativePath.startsWith(".devcontainer/") ||
    relativePath.startsWith(".github/workflows/")
  ) {
    return true;
  }

  if (relativePath.endsWith("/.vscode/settings.json")) {
    const vscodeDir = path.dirname(absolutePath);
    if (
      pathExists(path.join(vscodeDir, "settings.shared.json")) ||
      pathExists(path.join(vscodeDir, "settings.local.json"))
    ) {
      return true;
    }
  }

  return false;
}
