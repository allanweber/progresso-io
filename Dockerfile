# Follows the official Next.js Docker example:
# https://github.com/vercel/next.js/tree/canary/examples/with-docker
# Pinned to an exact patch for reproducible builds — bump deliberately (ideally
# to a sha256 digest once the deploy registry is known). Overridable via
# `--build-arg NODE_VERSION=…`.
ARG NODE_VERSION=22.13.1-slim

# ---- Dependencies ----
FROM node:${NODE_VERSION} AS dependencies
WORKDIR /app
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci --no-audit --no-fund

# ---- Builder ----
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Public env vars are inlined at build time, so they must be present here.
# Provide the Google Analytics id as a build arg (empty = analytics disabled).
ARG NEXT_PUBLIC_GA_ID=""
ENV NEXT_PUBLIC_GA_ID=$NEXT_PUBLIC_GA_ID
# Base URL the browser serves exercise images from (the R2 custom domain). Empty
# falls back to the free-exercise-db CDN, which only has the seed images — set
# this so custom (uploaded) images resolve too.
ARG NEXT_PUBLIC_EXERCISE_IMAGE_BASE_URL=""
ENV NEXT_PUBLIC_EXERCISE_IMAGE_BASE_URL=$NEXT_PUBLIC_EXERCISE_IMAGE_BASE_URL
RUN npm run build

# ---- Migrator ----
# One-shot image that applies the Drizzle SQL migrations and exits. Run as its
# own compose service before the app starts. Uses drizzle-orm's programmatic
# migrator (drizzle-orm + postgres are prod deps), so it needs only node_modules,
# the migration SQL in drizzle/, and the script — NOT the Next build.
#
# It deliberately does NOT copy from `builder`: doing so made this image depend
# on the `RUN npm run build` stage, so `docker compose --build` ran `next build`
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
