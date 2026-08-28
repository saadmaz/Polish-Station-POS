import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

// `vite build` performs a client sub-build and an SSR sub-build, each of
// which reloads this config module independently — a `Date.now()` called
// directly in `define` would produce a different value for each, so client
// and server would never agree on a build id. scripts/write-build-id.mjs
// (run once, before `vite build`, see package.json) writes a single
// timestamp both sub-builds read back here. Falls back to a fresh timestamp
// so `vite dev` (which never runs that script) doesn't crash — the fallback
// being unstable across dev-server restarts doesn't matter, this feature
// only exists to detect a stale *production* deploy.
function readBuildId(): string {
  try {
    return readFileSync(fileURLToPath(new URL(".build-id", import.meta.url)), "utf8").trim();
  } catch {
    return String(Date.now());
  }
}

export default defineConfig({
  // Stamped into both the client and server bundles at build time so a
  // running tab can tell it's talking to a newer deploy than the JS it
  // loaded with (see src/routes/healthz.ts + src/routes/index.tsx). A POS
  // till commonly sits on the login screen for hours without a real page
  // load, so the server can ship a fix while the open tab keeps running
  // pre-fix code indefinitely — this is what lets it notice and recover.
  define: {
    __BUILD_ID__: JSON.stringify(readBuildId()),
  },
  build: {
    rolldownOptions: {
      output: {
        // The host serves HTTP/1.1 only (no h2 multiplexing), so request COUNT
        // dominates load time: ~22 chunks at ~1s TTFB each over 6 connections
        // was a 4-8s first paint. Collapse to two long-cacheable chunks —
        // all of node_modules in "vendor", all app code in "app" — so a cold
        // load is ~3 requests and a warm load is served from disk cache.
        // (Earlier grouping into icons/firebase/react existed for the same
        // reason but still left ~15 per-route chunks.)
        advancedChunks: {
          groups: [
            { name: "vendor", test: /node_modules/ },
            { name: "app", test: /src[\\/]/ },
          ],
        },
      },
    },
  },
  plugins: [
    tanstackStart({
      server: { entry: "server" },
    }),
    react(),
    tailwindcss(),
    tsConfigPaths(),
  ],
});
