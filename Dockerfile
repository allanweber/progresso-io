# Follows the official Next.js Docker example:
# https://github.com/vercel/next.js/tree/canary/examples/with-docker
# Pin to an exact patch (e.g. 22.13.1-slim) for fully reproducible builds.
ARG NODE_VERSION=22-slim

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
RUN npm run build

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
