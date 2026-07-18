import assert from "node:assert/strict";
import test from "node:test";
import { createSerialTaskQueue } from "./serialTaskQueue.js";

test("serial task queue prevents older autosaves from finishing after newer saves", async () => {
  const queue = createSerialTaskQueue();
  const writes = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });

  const first = queue.run(async () => {
    await firstGate;
    writes.push("old");
  });
  const second = queue.run(async () => {
    writes.push("new");
  });

  await Promise.resolve();
  assert.deepEqual(writes, []);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(writes, ["old", "new"]);
});

test("serial task queue continues after an earlier save fails", async () => {
  const queue = createSerialTaskQueue();
  const writes = [];
  await assert.rejects(queue.run(() => Promise.reject(new Error("offline"))));
  await queue.run(() => { writes.push("recovered"); });
  assert.deepEqual(writes, ["recovered"]);
});
