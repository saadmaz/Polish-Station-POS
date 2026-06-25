import { createServer } from "http";
import { Readable } from "stream";

const { default: handler } = await import("./dist/server/server.js");

const port = process.env.PORT || 3000;
const host = process.env.HOST || "0.0.0.0";

const server = createServer(async (req, res) => {
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
});

server.listen(port, host, () => {
  console.log(`Polish Station POS running at http://${host}:${port}`);
});
