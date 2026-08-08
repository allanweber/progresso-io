/**
 * Warms the dev server's on-demand compiler before any test runs. `next dev`
 * (Turbopack) compiles routes on first request, and the very first browser
 * navigations can race that compile and abort the connection
 * (`net::ERR_ABORTED`). Pre-fetching each route here (best-effort, with a few
 * retries) means tests only ever hit already-compiled routes. Runs once, after
 * the webServer is up.
 */
const ROUTES = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/verify-account",
  "/reset-password",
  "/contact",
  "/terms",
  "/privacy",
  "/invite/accept",
  "/coach",
  "/coach/students",
  "/coach/students/new",
  "/coach/diets",
  "/student",
  "/dashboard",
];

async function warm(base: string, path: string): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      // `redirect: manual` so an auth redirect (3xx) still counts as compiled.
      const res = await fetch(base + path, { redirect: "manual" });
      if (res.status) return;
    } catch {
      // Server not ready yet — back off and retry.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

export default async function globalSetup(): Promise<void> {
  const base = "http://localhost:3100";
  // Sequential so we don't hammer the cold compiler with a parallel burst.
  for (const path of ROUTES) {
    await warm(base, path);
  }
}
