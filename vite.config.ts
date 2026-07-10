import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        // Without grouping, rolldown emits one micro-chunk per shared module
        // (every lucide icon becomes its own ~1KB file) — the dashboard was
        // fetching 50+ JS files and browsers choked on the request stampede
        // over this host's connection. Group stable vendor code into a few
        // long-cacheable chunks instead.
        advancedChunks: {
          groups: [
            { name: "icons", test: /node_modules[\\/]lucide-react/ },
            { name: "firebase", test: /node_modules[\\/]@?firebase/ },
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
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
