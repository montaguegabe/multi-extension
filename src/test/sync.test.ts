import * as assert from "assert";

import { getSyncCommand } from "../sync";

suite("Sync Command Test Suite", () => {
  test("maps cursor rules changes to multi sync rules", () => {
    assert.strictEqual(getSyncCommand("rules"), "multi sync rules");
  });
});
