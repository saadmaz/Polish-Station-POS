import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

export default defineConfig({
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
