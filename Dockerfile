# Follows the official Next.js Docker example:
# https://github.com/vercel/next.js/tree/canary/examples/with-docker
# Pinned to an exact patch for reproducible builds — bump deliberately (ideally
# to a sha256 digest once the deploy registry is known). Overridable via
# `--build-arg NODE_VERSION=…`.
#
# **Do not go back below 22.23.x.** The bundled corepack is what installs pnpm
# here, and 22.13.1 shipped corepack 0.30.0, whose built-in npm signing keys npm
# has since rotated. That corepack consults the registry's "latest stable"
# metadata even when `packageManager` pins an exact version, fails the signature
# check, and kills the build before a single dependency is fetched:
#
#   Error: Cannot find matching keyid: {"signatures":[…],"keys":[…]}
#       at verifySignature … at fetchLatestStableVersion
#
# Nothing in this repository changed to cause that — the key rotation happened
# upstream, so a build that had been green started failing on its own. 22.23.2
# bundles corepack 0.34.6, which resolves the pin directly and never takes that
# path.
ARG NODE_VERSION=22.23.2-slim

# ---- Dependencies ----
FROM node:${NODE_VERSION} AS dependencies
WORKDIR /app
# Corepack resolves pnpm from the `packageManager` field in package.json, so the
# image installs with the exact pnpm version the repo declares — no drift
# between a developer's machine and the shipped artifact.
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
# pnpm-workspace.yaml carries the `allowBuilds` gating that decides which
# packages may run install scripts. It MUST be copied: without it pnpm makes a
# different call on build scripts here than it does locally, which is exactly
# the local/prod divergence this image is meant to avoid.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Provision the pinned pnpm as its own step. Without it a corepack that cannot
# resolve `packageManager` silently falls back to "latest stable" — this fails
# loudly on the version the repo actually declares instead.
RUN corepack install
RUN --mount=type=cache,target=/pnpm/store \
  pnpm install --frozen-lockfile

# ---- Builder ----
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
# Public env vars are inlined at build time, so they must be present here.
# Provide the Google Analytics id as a build arg (empty = analytics disabled).
ARG NEXT_PUBLIC_GA_ID=""
ENV NEXT_PUBLIC_GA_ID=$NEXT_PUBLIC_GA_ID
# Base URL the browser serves exercise images from (the R2 custom domain). Empty
# falls back to the free-exercise-db CDN, which only has the seed images — set
# this so custom (uploaded) images resolve too.
ARG NEXT_PUBLIC_EXERCISE_IMAGE_BASE_URL=""
ENV NEXT_PUBLIC_EXERCISE_IMAGE_BASE_URL=$NEXT_PUBLIC_EXERCISE_IMAGE_BASE_URL
# Sentry public DSN: inlined into the client bundle AND read by next.config to
# add the ingest host + replay worker to the CSP — so it must be set at build.
ARG NEXT_PUBLIC_SENTRY_DSN=""
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
# Turnstile site key: inlined into the client bundle (the contact form only
# renders the widget when it is non-empty) AND read by next.config to open the
# CSP for challenges.cloudflare.com. Missing here is worse than missing
# everywhere: the SECRET is set at runtime, so the server would verify tokens
# for a widget that was never rendered and refuse every real submission.
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=""
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
# Sentry source-map upload (optional): when all three are set, withSentryConfig
# uploads readable stack traces at build; unset = build still succeeds, no upload.
ARG SENTRY_ORG=""
ENV SENTRY_ORG=$SENTRY_ORG
ARG SENTRY_PROJECT=""
ENV SENTRY_PROJECT=$SENTRY_PROJECT
ARG SENTRY_AUTH_TOKEN=""
ENV SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN
RUN pnpm build

# ---- Migrator ----
# One-shot image that applies the Drizzle SQL migrations and exits. Run as its
# own compose service before the app starts. Uses drizzle-orm's programmatic
# migrator (drizzle-orm + postgres are prod deps), so it needs only node_modules,
# the migration SQL in drizzle/, and the script — NOT the Next build.
#
# It deliberately does NOT copy from `builder`: doing so made this image depend
# on the `RUN pnpm build` stage, so `docker compose --build` ran `next build`
# TWICE in parallel (once for the app, once here), doubling peak build memory and
# OOM-ing constrained hosts. Sourcing node_modules from `dependencies` and the
# data/scripts from the build context keeps this image build cheap and lets the
# app be the only `next build`. Idempotent.
FROM node:${NODE_VERSION} AS migrator
WORKDIR /app
ENV NODE_ENV=production
COPY --from=dependencies /app/node_modules ./node_modules
COPY drizzle ./drizzle
COPY scripts ./scripts
CMD ["node", "scripts/migrate.mjs"]

# ---- Runner ----
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# public/ and .next/static are not bundled into standalone, so copy them in.
COPY --from=builder --chown=node:node /app/public ./public

# Give the non-root user a writable .next for the runtime cache (e.g. ISR).
RUN mkdir .next && chown node:node .next

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000

CMD ["node", "server.js"]
