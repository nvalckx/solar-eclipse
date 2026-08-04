import { readdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
const assetsDir = new URL("../dist/assets/", import.meta.url);
const assets = await readdir(assetsDir);
let codeBytes = 0;
let initialBytes = 0;

for (const name of assets) {
  const bytes = await readFile(new URL(name, assetsDir));
  const gzipBytes = gzipSync(bytes, { level: 9 }).byteLength;
  if (/\.(js|css)$/.test(name)) codeBytes += gzipBytes;
  if (/\.(js|css|woff2)$/.test(name)) initialBytes += gzipBytes;
}

const codeLimit = 180 * 1024;
const initialLimit = 250 * 1024;
console.log(
  `Bundle budget: JS/CSS ${Math.round(codeBytes / 1024)} KiB gzip; with font ${Math.round(initialBytes / 1024)} KiB gzip.`,
);
if (codeBytes > codeLimit || initialBytes > initialLimit) {
  throw new Error(
    `Bundle exceeds budget (${Math.round(codeLimit / 1024)} KiB code / ${Math.round(initialLimit / 1024)} KiB with font).`,
  );
}
