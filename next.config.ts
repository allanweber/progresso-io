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
  `script-src 'self' 'unsafe-inline'${devEval}${gaScript}`,
  "style-src 'self' 'unsafe-inline'", // Tailwind inline styles
  `connect-src 'self'${gaConnect}${sentryConnect}`,
  sentryWorker, // Session Replay compression worker (blob:), empty unless configured
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
