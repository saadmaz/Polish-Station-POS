import { createServer } from "http";
import { createReadStream, existsSync, statSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { Readable } from "stream";

process.on("uncaughtException", (err) => {
  console.error("[fatal] Uncaught exception:", err.stack || err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[fatal] Unhandled rejection:", reason);
  process.exit(1);
});

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const CLIENT_DIR = join(__dirname, "dist", "client");

const MIME_TYPES = {
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain",
  ".xml": "application/xml",
};

async function main() {
  console.log("[startup] Polish Station POS starting...");
  console.log("[startup] Node version:", process.version);
  console.log("[startup] PORT:", process.env.PORT);
  console.log("[startup] CWD:", process.cwd());

  console.log("[startup] Loading SSR handler...");
  let handler;
  try {
    const mod = await import("./dist/server/server.js");
    handler = mod.default;
    console.log("[startup] SSR handler loaded OK");
  } catch (err) {
    console.error("[startup] FAILED to load SSR handler:", err.stack || err);
    process.exit(1);
  }

  const server = createServer(async (req, res) => {
    try {
      const urlPath = new URL(req.url, "http://localhost").pathname;
      const filePath = join(CLIENT_DIR, urlPath);

      if (existsSync(filePath) && statSync(filePath).isFile()) {
        const ext = extname(filePath);
        const contentType = MIME_TYPES[ext] || "application/octet-stream";
        res.setHeader("Content-Type", contentType);
        if (urlPath.startsWith("/assets/")) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
        createReadStream(filePath).pipe(res);
        return;
      }

      const protocol = req.socket.encrypted ? "https" : "http";
      const url = new URL(req.url, `${protocol}://${req.headers.host}`);
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;

      const request = new Request(url, {
        method: req.method,
        headers: req.headers,
        body: body && body.length ? body : undefined,
        duplex: "half",
      });

      const response = await handler.fetch(request, {}, {});
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        Readable.fromWeb(response.body).pipe(res);
      } else {
        res.end();
      }
    } catch (err) {
      console.error("[request] Error:", err.stack || err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  const portOrSocket = process.env.PORT || 3000;
  const isSocket = typeof portOrSocket === "string" && portOrSocket.startsWith("/");

  if (isSocket) {
    server.listen(portOrSocket, () => {
      console.log("[startup] Listening on socket:", portOrSocket);
    });
  } else {
    server.listen(Number(portOrSocket), "0.0.0.0", () => {
      console.log("[startup] Listening on port:", portOrSocket);
    });
  }
}

main();
