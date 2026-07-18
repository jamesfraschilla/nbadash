import assert from "node:assert/strict";
import test from "node:test";
import { createStoredZipBlob } from "./storedZip.js";

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
