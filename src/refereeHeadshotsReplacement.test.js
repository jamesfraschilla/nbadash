import test from "node:test";
import assert from "node:assert/strict";

import { activateRefereeHeadshotReplacement } from "./refereeHeadshots.js";

test("referee headshot replacement activates the new files before removing the old files", async () => {
  const calls = [];
  const replacement = { fullPath: "new-full", previewPath: "new-preview" };
  const previous = { fullPath: "old-full", previewPath: "old-preview" };
  const result = await activateRefereeHeadshotReplacement({
    uploadedRecord: replacement,
    previousUploadedRecord: previous,
    activate: async () => { calls.push("activate-new"); },
    remove: async (record) => { calls.push(`remove-${record.fullPath}`); },
  });
  assert.deepEqual(calls, ["activate-new", "remove-old-full"]);
  assert.equal(result.cleanupError, null);
});

test("referee headshot replacement removes the new files and preserves the old files when activation fails", async () => {
  const removed = [];
  const replacement = { fullPath: "new-full", previewPath: "new-preview" };
  const previous = { fullPath: "old-full", previewPath: "old-preview" };
  await assert.rejects(() => activateRefereeHeadshotReplacement({
    uploadedRecord: replacement,
    previousUploadedRecord: previous,
    activate: async () => { throw new Error("Shared save failed"); },
    remove: async (record) => { removed.push(record.fullPath); },
  }), /Shared save failed/);
  assert.deepEqual(removed, ["new-full"]);
});

test("referee headshot replacement keeps the new image active when old-file cleanup fails", async () => {
  const replacement = { fullPath: "new-full", previewPath: "new-preview" };
  const previous = { fullPath: "old-full", previewPath: "old-preview" };
  const result = await activateRefereeHeadshotReplacement({
    uploadedRecord: replacement,
    previousUploadedRecord: previous,
    activate: async () => {},
    remove: async () => { throw new Error("Cleanup failed"); },
  });
  assert.equal(result.uploadedRecord, replacement);
  assert.match(result.cleanupError.message, /Cleanup failed/);
});
