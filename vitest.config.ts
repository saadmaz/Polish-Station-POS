import { defineConfig } from "vitest/config";

// Deliberately standalone from vite.config.ts: these are pure-TS unit/
// integration tests for src/lib business logic, not the app itself, so they
// don't need the TanStack Start / React / Tailwind plugins that config
// wires up for the real build.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
