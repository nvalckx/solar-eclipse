import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

export default async function globalSetup() {
  const root = fileURLToPath(new URL("../../dist/", import.meta.url));
  const prefix = "/eclipse-26/";
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (!pathname.startsWith(prefix)) {
      response.writeHead(302, { Location: prefix });
      response.end();
      return;
    }
    const relative =
      decodeURIComponent(pathname.slice(prefix.length)) || "index.html";
    const candidate = normalize(join(root, relative));
    const file =
      candidate.startsWith(normalize(root)) &&
      existsSync(candidate) &&
      statSync(candidate).isFile()
        ? candidate
        : join(root, "index.html");
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(file)] ?? "application/octet-stream",
    });
    createReadStream(file).pipe(response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(4173, "127.0.0.1", resolve);
  });
  return async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  };
}
