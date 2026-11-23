// Read-only local server for the Phase 7-2c integration check (127.0.0.1 only).
// /repo/* is served from the project (read-only); everything else from this folder.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const repo = path.resolve(process.argv[2]);
const here = path.dirname(fileURLToPath(import.meta.url));
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json" };
http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const [root, rel] = p.startsWith("/repo/") ? [repo, p.slice(6)] : [here, p.slice(1) || "harness.html"];
  const file = path.resolve(root, rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "Content-Type": (types[path.extname(file)] || "text/plain") + "; charset=utf-8", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
}).listen(4344, "127.0.0.1", () => console.log("http://127.0.0.1:4343/"));
