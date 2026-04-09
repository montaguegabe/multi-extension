import * as assert from "assert";

import {
  getSyncCommandForRelativePath,
  getRelativePathToWorkspace,
  shouldSkipSyncForRelativePath,
} from "../sync";

suite("Sync Command Test Suite", () => {
  test("maps cursor rules changes to multi sync rules", () => {
    assert.strictEqual(
      getSyncCommandForRelativePath("repo/.cursor/rules/project.mdc"),
      "multi sync rules"
    );
  });

  test("maps settings shared and local files to settings sync", () => {
    assert.strictEqual(
      getSyncCommandForRelativePath("repo/.vscode/settings.shared.json"),
      "multi sync vscode settings"
    );
    assert.strictEqual(
      getSyncCommandForRelativePath(".vscode/settings.local.json"),
      "multi sync vscode settings"
    );
  });

  test("maps shared launch and task files to their specific sync commands", () => {
    assert.strictEqual(
      getSyncCommandForRelativePath(".vscode/launch.shared.json"),
      "multi sync vscode launch"
    );
    assert.strictEqual(
      getSyncCommandForRelativePath(".vscode/tasks.shared.json"),
      "multi sync vscode tasks"
    );
  });

  test("maps devcontainer, github workflows, and multi.json", () => {
    assert.strictEqual(
      getSyncCommandForRelativePath("repo/.devcontainer/devcontainer.json"),
      "multi sync vscode devcontainer"
    );
    assert.strictEqual(
      getSyncCommandForRelativePath("repo/.github/workflows/ci.yml"),
      "multi sync github"
    );
    assert.strictEqual(getSyncCommandForRelativePath("multi.json"), "multi sync");
  });

  test("computes workspace-relative paths", () => {
    assert.strictEqual(
      getRelativePathToWorkspace(
        "/workspace/repo/.cursor/rules/project.mdc",
        "/workspace"
      ),
      "repo/.cursor/rules/project.mdc"
    );
    assert.strictEqual(
      getRelativePathToWorkspace("/other/repo/.cursor/rules/project.mdc", "/workspace"),
      undefined
    );
  });

  test("skips generated root outputs but not root source files", () => {
    assert.strictEqual(
      shouldSkipSyncForRelativePath(".vscode/settings.json", "/workspace/.vscode/settings.json"),
      true
    );
    assert.strictEqual(
      shouldSkipSyncForRelativePath(
        ".vscode/settings.shared.json",
        "/workspace/.vscode/settings.shared.json"
      ),
      false
    );
    assert.strictEqual(
      shouldSkipSyncForRelativePath(
        ".cursor/rules/repo-directories.mdc",
        "/workspace/.cursor/rules/repo-directories.mdc"
      ),
      true
    );
    assert.strictEqual(
      shouldSkipSyncForRelativePath(
        ".cursor/rules/project.mdc",
        "/workspace/.cursor/rules/project.mdc"
      ),
      false
    );
  });

  test("skips repo settings.json when companion settings files exist", () => {
    const existingPaths = new Set([
      "/workspace/repo/.vscode/settings.shared.json",
    ]);

    assert.strictEqual(
      shouldSkipSyncForRelativePath(
        "repo/.vscode/settings.json",
        "/workspace/repo/.vscode/settings.json",
        (filePath) => existingPaths.has(filePath)
      ),
      true
    );
    assert.strictEqual(
      shouldSkipSyncForRelativePath(
        "repo/.vscode/settings.json",
        "/workspace/repo/.vscode/settings.json",
        () => false
      ),
      false
    );
  });
});
