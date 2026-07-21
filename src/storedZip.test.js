import assert from "node:assert/strict";
import test from "node:test";
import { createStoredZipBlob, StoredZipBuilder, StreamingZipBuilder } from "./storedZip.js";

function readStoredEntries(bytes) {
  const decoder = new TextDecoder();
  const entries = [];
  let offset = 0;
  while (new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true) === 0x04034b50) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 30);
    const size = view.getUint32(18, true);
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    entries.push({
      name: decoder.decode(bytes.slice(nameStart, nameStart + nameLength)),
      content: decoder.decode(bytes.slice(dataStart, dataStart + size)),
    });
    offset = dataStart + size;
  }
  return entries;
}

test("stored ZIP contains every exported file in one valid archive", async () => {
  const blob = await createStoredZipBlob([
    { name: "one.png", blob: new Blob(["first"]) },
    { name: "two.png", blob: new Blob(["second"]) },
  ]);
  const entries = readStoredEntries(new Uint8Array(await blob.arrayBuffer()));
  assert.deepEqual(entries, [
    { name: "one.png", content: "first" },
    { name: "two.png", content: "second" },
  ]);
});

test("streaming ZIP writes file bytes without retaining local file parts", async () => {
  const chunks = [];
  const writer = {
    async write(value) { chunks.push(new Uint8Array(value)); },
    async close() {},
  };
  const zip = new StreamingZipBuilder(writer);
  await zip.addFile("one.png", new Blob(["first"]));
  await zip.addFile("two.png", new Blob(["second"]));
  await zip.close();
  const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.length;
  });
  assert.deepEqual(readStoredEntries(bytes), [
    { name: "one.png", content: "first" },
    { name: "two.png", content: "second" },
  ]);
  assert.equal("localParts" in zip, false);
});

test("in-memory ZIP refuses archives beyond its configured limit", async () => {
  const zip = new StoredZipBuilder(new Date(), { maxBytes: 3 });
  await assert.rejects(() => zip.addFile("large.png", new Blob(["1234"])), /too large/);
});
