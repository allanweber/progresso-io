import type { NextConfig } from "next";

// Google Analytics (via @next/third-parties) loads gtag.js from these hosts and
// beacons back to google-analytics.com — only allowed in the CSP when a GA id is
// configured, so the default policy stays as tight as possible.
const gaConfigured = !!process.env.NEXT_PUBLIC_GA_ID;
const gaScript = gaConfigured ? " https://www.googletagmanager.com" : "";
const gaConnect = gaConfigured
  ? " https://www.google-analytics.com https://region1.google-analytics.com"
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
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: https:", // exercise/check-in images (R2/CDN) + data URIs
  `script-src 'self' 'unsafe-inline'${gaScript}`,
  "style-src 'self' 'unsafe-inline'", // Tailwind inline styles
  `connect-src 'self'${gaConnect}`,
  "form-action 'self'",
].join("; ");

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

export default nextConfig;
