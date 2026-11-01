import test from "node:test";
import assert from "node:assert/strict";
import { withDeadline } from "./requestDeadline.js";
test("account initialization cannot wait forever", async () => {
  await assert.rejects(withDeadline(new Promise(() => {}), 5, "Timed out"), /Timed out/);
  assert.equal(await withDeadline(Promise.resolve("valid"), 100), "valid");
  await assert.rejects(withDeadline(Promise.reject(Error("revoked")), 100), /revoked/);
});
