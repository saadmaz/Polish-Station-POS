import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

export default defineConfig({
  plugins: [
    tanstackStart({
      server: { entry: "server" },
    }),
    react(),
    tailwindcss(),
    tsConfigPaths(),
  ],
  ssr: {
    noExternal: true,
    // React ships CJS; keep it external so Node loads it natively (avoids "module is not defined")
    external: ["react", "react-dom", "react/jsx-runtime", "react-dom/server"],
  },
});
