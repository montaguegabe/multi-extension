export type SyncType = "vscode" | "rules" | "github";

export function getSyncCommand(type: SyncType): string {
  return `multi sync ${type}`;
}
