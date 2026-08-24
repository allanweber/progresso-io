/**
 * No-op stand-in for the `server-only` package under Vitest.
 *
 * `server-only` resolves to an empty module under the `react-server` export
 * condition (which Next.js supplies when bundling Server Components) and to a
 * module that throws everywhere else — that throw is exactly what turns an
 * accidental client-side import into a build error. Vitest does not supply that
 * condition, so without this alias every test importing a server-only module
 * would throw at import time.
 *
 * Aliasing here keeps the production guarantee intact (Next still enforces it in
 * the real build) while letting the suite import server modules directly, which
 * is what an integration test is for.
 */
export {};
