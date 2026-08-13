import { readdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
const assetsDir = new URL("../dist/assets/", import.meta.url);
const assets = await readdir(assetsDir);
const html = await readFile(
  new URL("../dist/index.html", import.meta.url),
  "utf8",
);
const initialAssetNames = new Set(
  [...html.matchAll(/assets\/([^"']+\.(?:js|css|woff2))/g)].map(
    (match) => match[1],
  ),
);
let codeBytes = 0;
let initialBytes = 0;
const lazyChunks = new Map();

for (const name of assets) {
  const bytes = await readFile(new URL(name, assetsDir));
  const gzipBytes = gzipSync(bytes, { level: 9 }).byteLength;
  if (initialAssetNames.has(name) && /\.(js|css)$/.test(name))
    codeBytes += gzipBytes;
  if (initialAssetNames.has(name) && /\.(js|css|woff2)$/.test(name))
    initialBytes += gzipBytes;
  if (!initialAssetNames.has(name) && /\.(js|css)$/.test(name))
    lazyChunks.set(name, gzipBytes);
}

// The font is referenced from CSS rather than directly from index.html.
for (const name of assets.filter((asset) => asset.endsWith(".woff2"))) {
  const bytes = await readFile(new URL(name, assetsDir));
  initialBytes += gzipSync(bytes, { level: 9 }).byteLength;
}

const codeLimit = 180 * 1024;
const initialLimit = 250 * 1024;
console.log(
  `Initial bundle: JS/CSS ${Math.round(codeBytes / 1024)} KiB gzip; with font ${Math.round(initialBytes / 1024)} KiB gzip.`,
);
if (codeBytes > codeLimit || initialBytes > initialLimit) {
  throw new Error(
    `Bundle exceeds budget (${Math.round(codeLimit / 1024)} KiB code / ${Math.round(initialLimit / 1024)} KiB with font).`,
  );
}

const mapBytes = [...lazyChunks]
  .filter(([name]) => /leaflet/.test(name))
  .reduce((sum, [, bytes]) => sum + bytes, 0);
const catalogBytes = [...lazyChunks]
  .filter(([name]) => /generated-place-catalog/.test(name))
  .reduce((sum, [, bytes]) => sum + bytes, 0);
const pathChunks = [...lazyChunks].filter(([name]) =>
  /^\d{4}-\d{2}-\d{2}-/.test(name),
);
const largestPathBytes = Math.max(0, ...pathChunks.map(([, bytes]) => bytes));
if (
  mapBytes > 60 * 1024 ||
  catalogBytes > 35 * 1024 ||
  largestPathBytes > 100 * 1024
) {
  throw new Error(
    `Lazy chunk exceeds budget (map ${Math.round(mapBytes / 1024)} KiB / catalog ${Math.round(catalogBytes / 1024)} KiB / path ${Math.round(largestPathBytes / 1024)} KiB).`,
  );
}
console.log(
  `Lazy budgets: detailed map ${Math.round(mapBytes / 1024)} KiB; place catalog ${Math.round(catalogBytes / 1024)} KiB; largest of ${pathChunks.length} event paths ${Math.round(largestPathBytes / 1024)} KiB gzip.`,
);
