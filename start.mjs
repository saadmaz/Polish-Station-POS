import { createServer } from "http";
import { createReadStream, existsSync, statSync, unlinkSync } from "fs";
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
const SERVER_ENTRY = new URL("./dist/server/server.js", import.meta.url).href;

// Security headers applied to every response.
// CSP allows Firebase SDKs (Firestore, Auth, Storage) and blocks framing/plugins.
function applySecurityHeaders(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      // unsafe-inline needed for Vite hydration runtime in production builds
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      // Firebase SDK endpoints: Firestore, Auth, Storage, WebSocket realtime
      "connect-src 'self'" +
        " https://*.googleapis.com" +
        " https://*.firebaseio.com" +
        " wss://*.firebaseio.com" +
        " https://*.firebase.google.com" +
        " https://*.appspot.com",
      "img-src 'self' data: blob: https://storage.googleapis.com https://*.appspot.com",
      "font-src 'self'",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );
  // HSTS — only set when request comes over HTTPS (direct TLS or via cPanel proxy)
  const isSecure = req.headers["x-forwarded-proto"] === "https" || req.socket.encrypted;
  if (isSecure) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

const MIME_TYPES = {
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".map": "application/json",
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
  console.log("[startup] __dirname:", __dirname);
  console.log("[startup] CLIENT_DIR:", CLIENT_DIR, "- exists:", existsSync(CLIENT_DIR));
  console.log("[startup] SERVER_ENTRY:", SERVER_ENTRY);

  let handler;
  try {
    const mod = await import(SERVER_ENTRY);
    handler = mod.default;
    if (!handler || typeof handler.fetch !== "function") {
      console.error(
        "[startup] SSR handler missing .fetch method. Got:",
        typeof handler,
        handler ? Object.keys(handler) : "(null)",
      );
      process.exit(1);
    }
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
        applySecurityHeaders(req, res);
        res.setHeader("Content-Type", contentType);
        if (urlPath.startsWith("/assets/")) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
        createReadStream(filePath).pipe(res);
        return;
      }

      const protocol = req.socket.encrypted ? "https" : "http";
      const host = req.headers.host || "localhost";
      const url = new URL(req.url, `${protocol}://${host}`);

      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const bodyBuffer = chunks.length ? Buffer.concat(chunks) : null;

      const hasBody =
        bodyBuffer &&
        bodyBuffer.length > 0 &&
        req.method !== "GET" &&
        req.method !== "HEAD";

      const request = new Request(url.href, {
        method: req.method,
        headers: req.headers,
        ...(hasBody ? { body: bodyBuffer } : {}),
      });

      const response = await handler.fetch(request, {}, {});
      res.statusCode = response.status;
      applySecurityHeaders(req, res);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const readable = Readable.fromWeb(response.body);
        readable.on("error", (streamErr) => {
          console.error("[stream] Response body error:", streamErr.message);
          if (!res.writableEnded) res.destroy(streamErr);
        });
        readable.pipe(res);
      } else {
        res.end();
      }
    } catch (err) {
      console.error("[request] Error:", err.stack || err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    }
  });

  server.on("error", (err) => {
    console.error("[server] Listen error:", err.stack || err);
    process.exit(1);
  });

  const portOrSocket = process.env.PORT || "3000";
  const isSocket =
    typeof portOrSocket === "string" && portOrSocket.startsWith("/");

  if (isSocket) {
    try {
      if (existsSync(portOrSocket)) {
        unlinkSync(portOrSocket);
        console.log("[startup] Removed stale socket:", portOrSocket);
      }
    } catch (e) {
      console.warn("[startup] Could not remove stale socket:", e.message);
    }
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
