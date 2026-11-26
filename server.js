const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8000;
const API_ORIGIN = "https://api.freeprojectapi.com";
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

async function readRequestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error("Request body exceeds 1 MB.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function proxyApi(request, response) {
  const url = new URL(request.url, "http://localhost");
  if (!url.pathname.startsWith("/api/FeesTracking/")) {
    response.writeHead(404).end("Not found");
    return;
  }

  try {
    const body = ["GET", "HEAD"].includes(request.method) ? undefined : await readRequestBody(request);
    const upstream = await fetch(`${API_ORIGIN}${url.pathname}${url.search}`, {
      method: request.method,
      headers: {
        Accept: request.headers.accept || "application/json",
        ...(request.headers["content-type"] ? { "Content-Type": request.headers["content-type"] } : {}),
      },
      body,
    });
    const headers = {
      "Cache-Control": "no-store",
      "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
    };
    response.writeHead(upstream.status, headers);
    if (request.method === "HEAD") response.end();
    else response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    response.writeHead(error.message.includes("1 MB") ? 413 : 502, {
      "Content-Type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify({ message: error.message || "The Fees Tracking API is unavailable." }));
  }
}

function serveStatic(request, response) {
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch (_) {
    response.writeHead(400).end("Invalid URL");
    return;
  }
  if (pathname === "/") pathname = "/index.html";
  const filename = path.resolve(ROOT, `.${pathname}`);
  if (filename !== ROOT && !filename.startsWith(`${ROOT}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  fs.stat(filename, (statError, stat) => {
    if (statError || !stat.isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filename).toLowerCase()] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") response.end();
    else fs.createReadStream(filename).pipe(response);
  });
}

http.createServer((request, response) => {
  if (request.url.startsWith("/api/")) {
    proxyApi(request, response);
    return;
  }
  serveStatic(request, response);
}).listen(PORT, () => {
  console.log(`Student Fee Tracker running at http://localhost:${PORT}`);
});
