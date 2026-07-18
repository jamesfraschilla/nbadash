const CRC_TABLE = Array.from({ length: 256 }, (_, tableIndex) => {
  let value = tableIndex;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function getCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    dosTime: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    dosDate: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function createZipHeader(byteLength) {
  const buffer = new ArrayBuffer(byteLength);
  return { bytes: new Uint8Array(buffer), view: new DataView(buffer) };
}

export class StoredZipBuilder {
  constructor(date = new Date()) {
    this.encoder = new TextEncoder();
    this.dateTime = getDosDateTime(date);
    this.localParts = [];
    this.centralParts = [];
    this.localOffset = 0;
    this.centralSize = 0;
    this.fileCount = 0;
  }

  async addFile(name, blob) {
    const fileBytes = new Uint8Array(await blob.arrayBuffer());
    const nameBytes = this.encoder.encode(String(name || "file"));
    const crc32 = getCrc32(fileBytes);
    const { dosDate, dosTime } = this.dateTime;

    const localHeader = createZipHeader(30);
    localHeader.view.setUint32(0, 0x04034b50, true);
    localHeader.view.setUint16(4, 20, true);
    localHeader.view.setUint16(6, 0x0800, true);
    localHeader.view.setUint16(8, 0, true);
    localHeader.view.setUint16(10, dosTime, true);
    localHeader.view.setUint16(12, dosDate, true);
    localHeader.view.setUint32(14, crc32, true);
    localHeader.view.setUint32(18, fileBytes.byteLength, true);
    localHeader.view.setUint32(22, fileBytes.byteLength, true);
    localHeader.view.setUint16(26, nameBytes.byteLength, true);
    localHeader.view.setUint16(28, 0, true);
    this.localParts.push(localHeader.bytes, nameBytes, fileBytes);

    const centralHeader = createZipHeader(46);
    centralHeader.view.setUint32(0, 0x02014b50, true);
    centralHeader.view.setUint16(4, 20, true);
    centralHeader.view.setUint16(6, 20, true);
    centralHeader.view.setUint16(8, 0x0800, true);
    centralHeader.view.setUint16(10, 0, true);
    centralHeader.view.setUint16(12, dosTime, true);
    centralHeader.view.setUint16(14, dosDate, true);
    centralHeader.view.setUint32(16, crc32, true);
    centralHeader.view.setUint32(20, fileBytes.byteLength, true);
    centralHeader.view.setUint32(24, fileBytes.byteLength, true);
    centralHeader.view.setUint16(28, nameBytes.byteLength, true);
    centralHeader.view.setUint16(30, 0, true);
    centralHeader.view.setUint16(32, 0, true);
    centralHeader.view.setUint16(34, 0, true);
    centralHeader.view.setUint16(36, 0, true);
    centralHeader.view.setUint32(38, 0, true);
    centralHeader.view.setUint32(42, this.localOffset, true);
    this.centralParts.push(centralHeader.bytes, nameBytes);

    this.localOffset += localHeader.bytes.byteLength + nameBytes.byteLength + fileBytes.byteLength;
    this.centralSize += centralHeader.bytes.byteLength + nameBytes.byteLength;
    this.fileCount += 1;
  }

  toBlob() {
    const endHeader = createZipHeader(22);
    endHeader.view.setUint32(0, 0x06054b50, true);
    endHeader.view.setUint16(4, 0, true);
    endHeader.view.setUint16(6, 0, true);
    endHeader.view.setUint16(8, this.fileCount, true);
    endHeader.view.setUint16(10, this.fileCount, true);
    endHeader.view.setUint32(12, this.centralSize, true);
    endHeader.view.setUint32(16, this.localOffset, true);
    endHeader.view.setUint16(20, 0, true);
    return new Blob([...this.localParts, ...this.centralParts, endHeader.bytes], { type: "application/zip" });
  }
}

export async function createStoredZipBlob(files) {
  const builder = new StoredZipBuilder();
  for (const file of Array.isArray(files) ? files : []) {
    await builder.addFile(file.name, file.blob);
  }
  return builder.toBlob();
}
