// Writes a single build-id timestamp to disk before `vite build` runs.
// vite.config.ts reads it back for BOTH the client and SSR sub-builds it
// performs within that one `vite build` invocation — each sub-build reloads
// the config module independently, so a plain `Date.now()` inside `define`
// produces a different value for each and the client/server would never
// agree on a build id. Reading a file written once, up front, keeps them in
// sync.
import { writeFileSync } from "node:fs";

writeFileSync(new URL("../.build-id", import.meta.url), String(Date.now()));
