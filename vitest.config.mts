import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    globals: true,
    // Component tests default to jsdom; the Better Auth integration test opts
    // into the node environment via a `// @vitest-environment node` directive.
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    // Keep the pglite integration test isolated from jsdom component tests.
    isolate: true,
    // Integration files build a PGlite (WASM) database in `beforeAll`, now also
    // loading the pg_trgm/unaccent extensions the food-catalog migration needs.
    // That startup can exceed the default 10s hook timeout, so give it room.
    hookTimeout: 30_000,
    // Run test files one at a time. Several integration files each spin up an
    // in-memory PGlite (WASM) database; running them concurrently occasionally
    // exhausts WASM memory and crashes a worker at `new PGlite()`. Serializing
    // files removes that contention deterministically — the suite is small, so
    // the wall-clock cost is negligible.
    fileParallelism: false,
  },
});
