import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Google Analytics (via @next/third-parties) loads gtag.js from these hosts and
// beacons back to google-analytics.com — only allowed in the CSP when a GA id is
// configured, so the default policy stays as tight as possible.
const gaConfigured = !!process.env.NEXT_PUBLIC_GA_ID;
const gaScript = gaConfigured ? " https://www.googletagmanager.com" : "";
const gaConnect = gaConfigured
  ? " https://www.google-analytics.com https://region1.google-analytics.com"
  : "";

// Sentry's browser SDK beacons to the EU (Frankfurt) ingest host, and Session
// Replay compresses recordings in a blob-URL web worker — both only allowed in
// the CSP when a DSN is configured, so the default policy stays tight. Inlined
// at BUILD time, so NEXT_PUBLIC_SENTRY_DSN must be set when the image is built.
const sentryConfigured = !!process.env.NEXT_PUBLIC_SENTRY_DSN;
const sentryConnect = sentryConfigured ? " https://*.ingest.de.sentry.io" : "";
const sentryWorker = sentryConfigured ? "worker-src 'self' blob:" : "";

// Cloudflare Turnstile (the contact form's bot check) loads its script from
// challenges.cloudflare.com and renders the widget in an iframe served from the
// same host — so it needs both `script-src` and `frame-src`. Gated on the site
// key like GA and Sentry above, so an install without Turnstile keeps the
// tighter default policy. Inlined at BUILD time.
const turnstileConfigured = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const turnstileHost = " https://challenges.cloudflare.com";
// Used in script-src (api.js), frame-src (the challenge iframe) and connect-src
// — some Turnstile flows XHR back to the same host, and a blocked request there
// surfaces as a widget that never resolves.
const turnstileScript = turnstileConfigured ? turnstileHost : "";
// There is no `frame-src` otherwise: `default-src 'self'` covers frames, which
// would block the widget outright.
const turnstileFrame = turnstileConfigured
  ? `frame-src 'self'${turnstileHost}`
  : "";

/**
 * Content-Security-Policy.
 *
 * `script-src`/`style-src` keep `'unsafe-inline'`: Next's App Router streams
 * inline bootstrap/hydration scripts (and Tailwind emits inline styles), so a
 * nonce-less strict policy would break the app. The high-value protections here
 * are `frame-ancestors 'none'` (clickjacking), `object-src 'none'`, `base-uri
 * 'self'` and `form-action 'self'`. Tighten `img-src` to the exact R2 domain and
 * move scripts to a nonce if/when a middleware nonce pipeline is added.
 *
 * `'unsafe-eval'` is added in **development only**: React dev mode + Turbopack
 * HMR rely on `eval()`, so omitting it breaks `next dev` (and e2e) under this
 * policy. Production React never evals, so the deployed policy stays strict.
 */
const devEval = process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: https:", // exercise/check-in images (R2/CDN) + data URIs
  `script-src 'self' 'unsafe-inline'${devEval}${gaScript}${turnstileScript}`,
  "style-src 'self' 'unsafe-inline'", // Tailwind inline styles
  `connect-src 'self'${gaConnect}${sentryConnect}${turnstileScript}`,
  sentryWorker, // Session Replay compression worker (blob:), empty unless configured
  turnstileFrame, // Turnstile's challenge iframe, empty unless configured
  "form-action 'self'",
]
  .filter(Boolean)
  .join("; ");

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  // Produce a minimal standalone server bundle for self-hosting.
  // https://nextjs.org/docs/app/guides/self-hosting
  output: "standalone",
  // Don't advertise the framework/version.
  poweredByHeader: false,
  // pdfkit (invoice PDFs) reads its bundled .afm font metrics from disk at
  // runtime; keeping it external stops the bundler from breaking those requires
  // and ensures the whole package is traced into the standalone output.
  serverExternalPackages: ["pdfkit"],
  // Next's tracer copies only @swc/helpers/cjs into the standalone output, but
  // the generated server requires the ESM helpers (e.g.
  // `@swc/helpers/esm/_interop_require_default.js`) through that package's
  // `./esm/*` export — so the standalone server dies with MODULE_NOT_FOUND on
  // boot without this. Globbed on the version directory so a @swc/helpers bump
  // does not silently reintroduce the failure.
  outputFileTracingIncludes: {
    "/*": ["./node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/esm/**/*"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Token-bearing landing pages (invite/fill links carry the credential in
      // the URL): never leak the full URL via the Referer header to any
      // third-party resource on the page.
      {
        source: "/invite/accept",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      {
        source: "/admin-invite/accept",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      {
        source: "/anamnesis/fill",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Source-map upload for readable stack traces. Only runs when a build supplies
  // all three (org/project/auth token) — a self-host build without them still
  // succeeds and simply skips the upload.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Stay quiet locally; speak up in CI.
  silent: !process.env.CI,
  // Upload a wider set of client bundles so minified frames resolve.
  widenClientFileUpload: true,
});
