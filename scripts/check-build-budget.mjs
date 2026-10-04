import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const assetsDir = path.resolve("dist/assets");
const files = fs.readdirSync(assetsDir).map((name) => {
  const bytes = fs.readFileSync(path.join(assetsDir, name));
  return { name, bytes: bytes.length, gzip: zlib.gzipSync(bytes).length };
});
const js = files.filter((file) => file.name.endsWith(".js"));
const violations = [
  ...js.filter((file) => file.gzip > 200 * 1024).map((file) => `${file.name} is ${Math.ceil(file.gzip / 1024)} KiB gzip (limit 200 KiB)`),
  ...files.filter((file) => file.bytes > 2.2 * 1024 * 1024).map((file) => `${file.name} is ${Math.ceil(file.bytes / 1024)} KiB (limit 2253 KiB)`),
];
if (violations.length) throw new Error(`Build performance budget exceeded:\n${violations.join("\n")}`);
console.log(`Build budget passed for ${files.length} assets; largest JS is ${Math.ceil(Math.max(...js.map((file) => file.gzip)) / 1024)} KiB gzip.`);
