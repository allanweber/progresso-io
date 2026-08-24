import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // See tests/stubs/server-only.ts for why this alias is required.
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
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
    // Files run in parallel, but capped: ~30 integration files each spin up an
    // in-memory PGlite (WASM) database, and letting vitest size the pool to the
    // machine used to exhaust WASM memory and crash a worker at `new PGlite()`.
    // A small fixed pool keeps that under control while still using the cores.
    maxWorkers: 4,
  },
});
