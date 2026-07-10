// Post-build step: inline every npm dependency into the SSR server bundle.
//
// The app deploys over FTP to shared hosting, where uploading node_modules
// (~50k files) takes longer than the hosting allows in practice — every prior
// deploy attempt timed out on it. With dependencies inlined, the deploy
// payload is just dist/ + start.mjs and the server needs no node_modules.
//
// esbuild (already present as Vite's own dependency) is used rather than
// Vite's ssr.noExternal because Rollup's CommonJS interop breaks
// firebase-admin's ESM wrappers (`.default` of its CJS core resolves to
// undefined → "Cannot read properties of undefined (reading 'SDK_VERSION')"
// at import time). esbuild's node-mode interop handles it — bundling
// firebase-admin this way is the standard approach for AWS Lambda deploys.
import { build } from "esbuild";
import { mkdirSync, renameSync, rmSync } from "fs";

await build({
  entryPoints: ["dist/server/server.js"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "dist/server-bundled.mjs",
  // Some bundled CJS packages (protobufjs, google-gax) probe optional
  // dependencies via dynamic require() or build paths from __dirname.
  // format:"esm" provides neither, so define both up front. Dynamic-require
  // probes of truly absent packages still throw inside the packages' own
  // try/catch fallbacks, which is the behavior they expect.
  banner: {
    js: [
      'import { createRequire as __bundlerCreateRequire } from "node:module";',
      'import { fileURLToPath as __bundlerFileURLToPath } from "node:url";',
      'import { dirname as __bundlerDirname } from "node:path";',
      "const require = __bundlerCreateRequire(import.meta.url);",
      "const __filename = __bundlerFileURLToPath(import.meta.url);",
      "const __dirname = __bundlerDirname(__filename);",
    ].join("\n"),
  },
  logLevel: "info",
});

// Replace the chunked Rollup output with the single self-contained file,
// keeping the dist/server/server.js path that start.mjs already imports.
rmSync("dist/server", { recursive: true, force: true });
mkdirSync("dist/server");
renameSync("dist/server-bundled.mjs", "dist/server/server.js");
console.log("Server bundle written to dist/server/server.js");
