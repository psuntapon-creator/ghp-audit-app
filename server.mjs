import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8" };

const server = http.createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const relative = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(root) || !fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": types[path.extname(resolved)] || "application/octet-stream", "Cache-Control": "no-cache" });
  fs.createReadStream(resolved).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`KCG GHP Audit Report is running at http://127.0.0.1:${port}`);
});
